import {
  analyzeMarketingWeek,
  checkMarketingPostSafety,
  draftMarketingPosts,
  redactMarketingContent,
} from "@arvya/agents";
import type {
  MarketingChannel,
  MarketingChannelPost,
  MarketingContentItem,
  MarketingPostStatus,
} from "@arvya/core";
import { getAiClient } from "@/lib/ai/provider";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { getRepository } from "@/lib/db/repository";
import { getSchedulerClient } from "./schedulers/buffer";
import { renderVisualForPost, type RenderedVisual, type VisualConcept } from "./visual-renderer";

function providerModel() {
  return process.env.DEFAULT_MODEL ?? process.env.ANTHROPIC_MODEL ?? process.env.OPENAI_MODEL ?? "local";
}

async function logUsage(input: {
  brainId: string;
  jobType: string;
  modelProvider: "anthropic" | "openai" | "local";
  inputTokens?: number;
  outputTokens?: number;
}) {
  await getRepository().createMarketingLlmUsage({
    brainId: input.brainId,
    jobType: input.jobType,
    modelProvider: input.modelProvider,
    model: providerModel(),
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    estimatedCostUsd: 0,
  });
}

function defaultScheduledAt() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(16, 0, 0, 0);
  return date.toISOString();
}

function withUtm(post: MarketingChannelPost) {
  const source = post.channel === "x" ? "x" : "linkedin";
  return {
    utmSource: post.utmSource ?? source,
    utmMedium: post.utmMedium ?? "social",
    utmCampaign: post.utmCampaign ?? post.campaignTag ?? post.pillar ?? "marketing_os",
    utmContent: post.utmContent ?? post.id,
  };
}

export async function getMarketingDashboard(brainId?: string) {
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const repo = getRepository();
  const [items, insights, posts, metrics, events, reports, usage] = await Promise.all([
    repo.listMarketingContentItems(selectedBrain.id, { limit: 25 }),
    repo.listMarketingContentInsights(selectedBrain.id, { limit: 50 }),
    repo.listMarketingChannelPosts(selectedBrain.id, { limit: 100 }),
    repo.listMarketingPostMetrics(selectedBrain.id, { limit: 200 }),
    repo.listMarketingEvents(selectedBrain.id, { limit: 100 }),
    repo.listMarketingWeeklyReports(selectedBrain.id, { limit: 12 }),
    repo.listMarketingLlmUsage(selectedBrain.id, { limit: 200 }),
  ]);
  return { brain: selectedBrain, items, insights, posts, metrics, events, reports, usage };
}

export async function submitMarketingInput(input: {
  brainId: string;
  sourceItemId?: string;
  sourcePlatform: MarketingContentItem["sourcePlatform"];
  sourceType: MarketingContentItem["sourceType"];
  rawText: string;
  sourceUrl?: string;
  sourceExternalId?: string;
  sourceOwner?: string;
  sourceDate?: string;
  metadata?: Record<string, unknown>;
}) {
  const repo = getRepository();
  const item = await repo.createMarketingContentItem({
    brainId: input.brainId,
    sourceItemId: input.sourceItemId,
    sourcePlatform: input.sourcePlatform,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    sourceExternalId: input.sourceExternalId,
    sourceOwner: input.sourceOwner,
    sourceDate: input.sourceDate,
    sourceConfidentiality: "internal",
    rawText: input.rawText,
    metadata: input.metadata,
  });

  const ai = getAiClient();
  const run = await repo.createAgentRun({
    brainId: input.brainId,
    name: "marketing_redaction",
    modelProvider: ai.preferredProvider,
    stepName: "redact_content_item",
    inputSummary: `Redact marketing content item ${item.id}`,
    rawInput: { contentItemId: item.id },
  });

  try {
    const result = await redactMarketingContent({ item, ai });
    const updatedItem = await repo.updateMarketingContentItem(item.id, {
      cleanedSummary: result.cleanedSummary,
      contentSafeSummary: result.contentSafeSummary,
      sourceConfidentiality: result.sourceConfidentiality,
      requiresRedaction: result.requiresRedaction,
      approvedForContent: result.approvedForContent,
      metadata: { ...(item.metadata ?? {}), redactionNotes: result.redactionNotes },
    });
    const insights = await repo.createMarketingContentInsights(result.insights.map((insight) => ({
      brainId: input.brainId,
      contentItemId: item.id,
      rawInsight: insight.rawInsight,
      contentSafeInsight: insight.contentSafeInsight,
      sensitivityLevel: insight.sensitivityLevel,
      suggestedPillar: insight.suggestedPillar,
      suggestedChannels: insight.suggestedChannels,
      approvedForContent: insight.sensitivityLevel !== "blocked",
    })));
    await repo.updateAgentRun(run.id, {
      status: "succeeded",
      outputSummary: `Created ${insights.length} content-safe insights.`,
      rawOutput: result as unknown as Record<string, unknown>,
    });
    await logUsage({ brainId: input.brainId, jobType: "marketing_redaction", modelProvider: ai.preferredProvider });
    return { item: updatedItem ?? item, insights };
  } catch (error) {
    await repo.updateAgentRun(run.id, {
      status: "failed",
      outputSummary: "Marketing redaction failed.",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function syncMarketingDriveTranscripts(brainId: string) {
  const repo = getRepository();
  const [sources, existingItems] = await Promise.all([
    repo.listSourceItems(brainId, { limit: 500 }),
    repo.listMarketingContentItems(brainId, { limit: 500 }),
  ]);
  const existingSourceItemIds = new Set(existingItems.map((item) => item.sourceItemId).filter(Boolean));
  const driveTranscripts = sources.filter((source) => {
    const metadata = source.metadata ?? {};
    return (
      source.type === "transcript" &&
      metadata.connector_type === "google_drive" &&
      !existingSourceItemIds.has(source.id)
    );
  });

  const created = [];
  for (const source of driveTranscripts) {
    const metadata = source.metadata ?? {};
    const result = await submitMarketingInput({
      brainId,
      sourceItemId: source.id,
      sourcePlatform: "google_drive",
      sourceType: "google_drive_transcript",
      sourceUrl: source.externalUri,
      sourceExternalId: typeof metadata.external_id === "string" ? metadata.external_id : source.id,
      sourceOwner: typeof metadata.company_person_text === "string" ? metadata.company_person_text : undefined,
      sourceDate: typeof metadata.occurred_at === "string" ? metadata.occurred_at : undefined,
      rawText: source.content,
      metadata: {
        sourceItemId: source.id,
        title: source.title,
        driveFileId: metadata.drive_file_id,
      },
    });
    created.push(result.item);
  }

  return { scanned: sources.length, created: created.length, items: created };
}

export async function syncMarketingSlackSignals() {
  return { itemsFound: 0, itemsIngested: 0, itemsSkipped: 0, scaffolded: true };
}

export async function syncMarketingEmailSignals() {
  return { itemsFound: 0, itemsIngested: 0, itemsSkipped: 0, scaffolded: true };
}

export async function generateMarketingDrafts(
  brainId: string,
  channels: MarketingChannel[] = ["linkedin_company"],
  options: { variantsPerInsight?: number; insightIds?: string[] } = {},
) {
  const repo = getRepository();
  const ai = getAiClient();
  const insights = await repo.listMarketingContentInsights(brainId, { approvedOnly: true, limit: 25 });
  const existingPosts = await repo.listMarketingChannelPosts(brainId, { limit: 500 });
  const draftedInsightIds = new Set(existingPosts.map((post) => post.contentInsightId).filter(Boolean));
  const requestedInsightIds = options.insightIds ? new Set(options.insightIds) : null;
  const pendingInsights = insights.filter((insight) =>
    requestedInsightIds ? requestedInsightIds.has(insight.id) : !draftedInsightIds.has(insight.id),
  );
  const exemplars = await repo.listMarketingChannelPosts(brainId, { exemplarOnly: true, limit: 10 });

  const run = await repo.createAgentRun({
    brainId,
    name: "marketing_drafting",
    modelProvider: ai.preferredProvider,
    stepName: "draft_channel_posts",
    inputSummary: `Draft from ${pendingInsights.length} approved marketing insights.`,
    rawInput: { insightIds: pendingInsights.map((insight) => insight.id), channels },
  });

  try {
    const result = await draftMarketingPosts({
      insights: pendingInsights,
      channels,
      exemplars,
      variantsPerInsight: options.variantsPerInsight,
      ai,
    });
    const insightById = new Map(pendingInsights.map((insight) => [insight.id, insight]));
    const posts = await repo.createMarketingChannelPosts(result.drafts.map((draft) => {
      const insight = insightById.get(draft.contentInsightId);
      return {
        brainId,
        contentItemId: insight?.contentItemId ?? null,
        contentInsightId: draft.contentInsightId,
        channel: draft.channel,
        status: "draft" as const,
        bodyText: draft.bodyText,
        campaignTag: draft.campaignTag,
        pillar: draft.pillar,
        formatType: draft.formatType,
        hookType: draft.hookType,
        targetIcp: draft.targetIcp,
        funnelStage: draft.funnelStage,
        sensitivityLevel: insight?.sensitivityLevel ?? "medium",
        requiresReview: true,
        metadata: { rationale: draft.rationale },
      };
    }));
    await repo.updateAgentRun(run.id, {
      status: "succeeded",
      outputSummary: `Created ${posts.length} marketing drafts.`,
      rawOutput: result as unknown as Record<string, unknown>,
    });
    await logUsage({ brainId, jobType: "marketing_drafting", modelProvider: ai.preferredProvider });
    return posts;
  } catch (error) {
    await repo.updateAgentRun(run.id, {
      status: "failed",
      outputSummary: "Marketing drafting failed.",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function updateMarketingPost(postId: string, update: {
  bodyText?: string;
  status?: MarketingPostStatus;
  revisionReason?: string | null;
  approvedBy?: string;
}) {
  const repo = getRepository();
  const approvedAt = update.status === "approved" ? new Date().toISOString() : undefined;
  return repo.updateMarketingChannelPost(postId, {
    bodyText: update.bodyText,
    status: update.status,
    revisionReason: update.revisionReason,
    approvedBy: update.approvedBy,
    approvedAt,
  });
}

function extractVisualConcept(post: MarketingChannelPost): VisualConcept | null {
  const visual = (post.metadata as { visual?: VisualConcept } | null | undefined)?.visual;
  if (!visual || typeof visual !== "object") return null;
  return visual;
}

function extractRenderedVisual(post: MarketingChannelPost): RenderedVisual | null {
  const rendered = (post.metadata as { renderedVisual?: RenderedVisual } | null | undefined)?.renderedVisual;
  if (!rendered || typeof rendered !== "object") return null;
  return rendered;
}

export async function renderAndAttachVisuals(postId: string): Promise<RenderedVisual> {
  const repo = getRepository();
  const post = await repo.getMarketingChannelPost(postId);
  if (!post) throw new Error("Marketing post not found for rendering.");
  const existing = extractRenderedVisual(post);
  if (existing && existing.status === "rendered" && existing.imageUrls.length) {
    return existing;
  }
  const visual = extractVisualConcept(post);
  const rendered = await renderVisualForPost({ postId, visual });
  const updated = await repo.updateMarketingChannelPost(postId, {
    metadata: { ...(post.metadata ?? {}), renderedVisual: rendered },
  });
  if (rendered.kind === "video_script" && rendered.videoScript) {
    rendered.videoScript = rendered.videoScript;
  }
  void updated;
  return rendered;
}

export async function scheduleMarketingPost(postId: string, input: { scheduledAt?: string; approvedBy?: string; mode?: "schedule" | "now" } = {}) {
  const repo = getRepository();
  const ai = getAiClient();
  const post = await repo.getMarketingChannelPost(postId);
  if (!post) throw new Error("Marketing post not found.");
  const insight = post.contentInsightId ? await repo.getMarketingContentInsight(post.contentInsightId) : null;
  const approvedPost = post.status === "approved"
    ? post
    : await repo.updateMarketingChannelPost(post.id, {
        status: "approved",
        approvedBy: input.approvedBy ?? "naveen",
        approvedAt: new Date().toISOString(),
      });
  if (!approvedPost) throw new Error("Could not approve marketing post.");

  const metadata = (approvedPost.metadata ?? {}) as Record<string, unknown>;
  const isAngleDrafted = metadata.generator === "draft-angles";
  const safety = isAngleDrafted && !insight
    ? { passed: true as const, reason: "Trusted angle-drafted post (no linked insight).", flags: [] as string[] }
    : await checkMarketingPostSafety({ post: approvedPost, insight, ai });
  if (!safety.passed) {
    await repo.updateMarketingChannelPost(post.id, {
      status: "needs_revision",
      safetyCheckStatus: "failed",
      safetyCheckReason: safety.reason,
      revisionReason: safety.reason,
    });
    return { post: await repo.getMarketingChannelPost(post.id), scheduled: false, safety };
  }

  const renderedVisual = extractRenderedVisual(approvedPost);
  const utm = withUtm(approvedPost);
  const postNow = input.mode === "now";
  const scheduledAt = input.scheduledAt ?? approvedPost.scheduledAt ?? approvedPost.plannedPostDate ?? defaultScheduledAt();
  const scheduler = getSchedulerClient();
  const scheduled = await scheduler.schedulePost({
    post: { ...approvedPost, ...utm },
    scheduledAt,
    mode: postNow ? "now" : "schedule",
    media: renderedVisual && renderedVisual.imageUrls.length
      ? { imageUrls: renderedVisual.imageUrls, kind: renderedVisual.kind }
      : undefined,
  });
  const updated = await repo.updateMarketingChannelPost(post.id, {
    status: postNow ? "published" : "scheduled",
    scheduledAt: scheduled.scheduledAt,
    schedulerProvider: scheduled.provider,
    schedulerPostId: scheduled.schedulerPostId,
    liveUrl: scheduled.liveUrl,
    safetyCheckStatus: "passed",
    safetyCheckReason: safety.reason,
    ...utm,
    metadata: { ...(approvedPost.metadata ?? {}), schedulerRaw: scheduled.raw, sharedNow: scheduled.shared ?? postNow },
  });
  return { post: updated, scheduled: true, scheduler: scheduled, safety };
}

export async function syncMarketingSchedulerStatus(brainId: string) {
  const repo = getRepository();
  const scheduled = await repo.listMarketingChannelPosts(brainId, { status: "scheduled", limit: 200 });
  const now = Date.now();
  const updated = [];
  for (const post of scheduled) {
    if (!post.scheduledAt) continue;
    const scheduledAt = Date.parse(post.scheduledAt);
    if (Number.isFinite(scheduledAt) && scheduledAt <= now) {
      const published = await repo.updateMarketingChannelPost(post.id, {
        status: "published",
        publishedAt: new Date().toISOString(),
      });
      if (published) updated.push(published);
    }
  }
  return { checked: scheduled.length, published: updated.length, posts: updated };
}

export async function recordMarketingMetric(brainId: string, input: {
  channelPostId: string;
  metricDate?: string;
  impressions?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  saves?: number;
  follows?: number;
}) {
  return getRepository().createMarketingPostMetric({
    brainId,
    channelPostId: input.channelPostId,
    metricDate: input.metricDate ?? new Date().toISOString(),
    impressions: input.impressions,
    reactions: input.reactions,
    comments: input.comments,
    shares: input.shares,
    clicks: input.clicks,
    saves: input.saves,
    follows: input.follows,
  });
}

export async function refreshMarketingMetrics(brainId: string) {
  const repo = getRepository();
  const posts = await repo.listMarketingChannelPosts(brainId, { status: ["scheduled", "published"], limit: 200 });
  const scheduler = getSchedulerClient();
  if (!scheduler.refreshMetrics) {
    return { checked: posts.length, refreshed: 0, reason: "scheduler_metrics_not_supported" };
  }
  const refreshed = await scheduler.refreshMetrics(posts);
  for (const metric of refreshed) {
    await repo.createMarketingPostMetric({
      brainId,
      channelPostId: metric.postId,
      metricDate: new Date().toISOString(),
      impressions: metric.impressions,
      reactions: metric.reactions,
      comments: metric.comments,
      shares: metric.shares,
      clicks: metric.clicks,
      saves: metric.saves,
      follows: metric.follows,
      rawMetrics: metric.rawMetrics,
    });
  }
  return { checked: posts.length, refreshed: refreshed.length };
}

export async function recordMarketingEvent(brainId: string, input: {
  channelPostId?: string | null;
  eventType: "demo" | "dm" | "reply" | "qualified_lead" | "website_visit" | "manual_attribution";
  eventSource: string;
  eventAt?: string;
  description: string;
  contactName?: string | null;
  companyName?: string | null;
  value?: number | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  attributionConfidence?: "direct" | "assisted" | "manual" | "unknown";
  metadata?: Record<string, unknown>;
}) {
  return getRepository().createMarketingEvent({ ...input, brainId });
}

export async function generateMarketingWeeklyReport(brainId: string, window?: { weekStart?: string; weekEnd?: string }) {
  const repo = getRepository();
  const ai = getAiClient();
  const weekEnd = window?.weekEnd ?? new Date().toISOString();
  const startDate = new Date(weekEnd);
  startDate.setUTCDate(startDate.getUTCDate() - 7);
  const weekStart = window?.weekStart ?? startDate.toISOString();
  const [posts, metrics, events] = await Promise.all([
    repo.listMarketingChannelPosts(brainId, { status: "published", limit: 200 }),
    repo.listMarketingPostMetrics(brainId, { limit: 500 }),
    repo.listMarketingEvents(brainId, { limit: 200 }),
  ]);
  const result = await analyzeMarketingWeek({ weekStart, weekEnd, posts, metrics, events, ai });
  await logUsage({ brainId, jobType: "marketing_weekly_analysis", modelProvider: ai.preferredProvider });
  return repo.createMarketingWeeklyReport({
    brainId,
    weekStart,
    weekEnd,
    publishedCount: posts.length,
    qualitativeOnly: posts.length < 30,
    summary: result.summary,
    markdown: result.markdown,
    recommendedExperiments: result.recommendedExperiments,
  });
}
