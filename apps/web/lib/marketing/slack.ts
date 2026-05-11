import crypto from "node:crypto";
import { getRepository } from "@/lib/db/repository";
import { renderAndAttachVisuals, scheduleMarketingPost, updateMarketingPost } from "./store";
import { ANGLE_LABELS, generateAngleDrafts, type AngleDraft, type DraftAngle } from "./draft-angles";
import { summarizeVisualForSlack, type VisualConcept } from "./visual-renderer";
import type { MarketingChannelPost } from "@arvya/core";

type SlackEventPayload = {
  type?: string;
  challenge?: string;
  event?: {
    type?: string;
    text?: string;
    user?: string;
    channel?: string;
    ts?: string;
    bot_id?: string;
    subtype?: string;
    files?: Array<{ id?: string; name?: string; mimetype?: string; url_private?: string }>;
  };
};

type SlackBlock = Record<string, unknown>;

export function verifySlackRequest(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
}) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!signingSecret) return true;
  if (!input.timestamp || !input.signature) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(input.timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 60 * 5) return false;

  const base = `v0:${input.timestamp}:${input.rawBody}`;
  const digest = `v0=${crypto.createHmac("sha256", signingSecret).update(base).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(input.signature));
}

function defaultScheduleTime() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(16, 0, 0, 0);
  return date.toISOString();
}

function visualFromMetadata(post: MarketingChannelPost): VisualConcept | null {
  const visual = (post.metadata as { visual?: VisualConcept } | null | undefined)?.visual;
  if (!visual || typeof visual !== "object") return null;
  return visual;
}

function optionBlocks(posts: Array<MarketingChannelPost & { angle?: DraftAngle | string }>): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Arvya Marketing* drafted LinkedIn options from your signal. Each one is a distinct angle. Approve to post now, schedule, render the visual first, or archive.",
      },
    },
    { type: "divider" },
  ];

  for (const [index, post] of posts.slice(0, 4).entries()) {
    const angleKey = (post.angle as DraftAngle) ?? "founder_pov";
    const angleLabel = ANGLE_LABELS[angleKey] ?? "Option";
    const visual = visualFromMetadata(post);
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${angleLabel}*  ·  _Option ${index + 1}_\n${post.bodyText.slice(0, 2600)}`,
      },
    });
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: summarizeVisualForSlack(visual) },
      ],
    });
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text:
            "Reply in thread with edits, then click *Approve + render visual first* to preview the image before publishing, *Approve + post now* to publish immediately, or *Approve + schedule* for tomorrow 16:00 UTC.",
        },
      ],
    });
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve + render visual first" },
          action_id: "marketing_render_visual",
          value: post.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Approve + post now" },
          style: "primary",
          action_id: "marketing_approve_post_now",
          value: post.id,
          confirm: {
            title: { type: "plain_text", text: "Post to LinkedIn now?" },
            text: { type: "mrkdwn", text: "This will render the visual (if any) and publish via Buffer to the Arvya LinkedIn company channel." },
            confirm: { type: "plain_text", text: "Post it" },
            deny: { type: "plain_text", text: "Cancel" },
          },
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Approve + schedule" },
          action_id: "marketing_approve_schedule",
          value: post.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Archive" },
          action_id: "marketing_archive",
          value: post.id,
        },
      ],
    });
    blocks.push({ type: "divider" });
  }

  return blocks;
}

async function persistAngleDrafts(input: {
  brainId: string;
  contentItemId: string;
  drafts: AngleDraft[];
}) {
  const repo = getRepository();
  const created: Array<MarketingChannelPost & { angle: DraftAngle }> = [];
  for (const draft of input.drafts) {
    const [post] = await repo.createMarketingChannelPosts([
      {
        brainId: input.brainId,
        contentItemId: input.contentItemId,
        contentInsightId: null,
        channel: "linkedin_company" as const,
        status: "draft" as const,
        bodyText: draft.bodyText,
        campaignTag: draft.angle,
        pillar: "deal_workflow",
        formatType: "product_pov" as const,
        hookType: "workflow" as const,
        targetIcp: "ib" as const,
        funnelStage: "problem_aware" as const,
        sensitivityLevel: "low",
        requiresReview: true,
        metadata: {
          angle: draft.angle,
          hook: draft.hook,
          rationale: draft.rationale,
          generator: "draft-angles",
          visual: draft.visual ?? { kind: "none", rationale: "no visual generated" },
        },
      },
    ]);
    created.push(Object.assign(post, { angle: draft.angle }));
  }
  return created;
}

async function createAngleDraftOptions(input: {
  rawText: string;
  userId?: string;
  channelId?: string;
  capturedBy: string;
}) {
  const brainId = await marketingSlackBrainId();
  const repo = getRepository();
  const contentItem = await repo.createMarketingContentItem({
    brainId,
    sourcePlatform: "slack",
    sourceType: "slack_thread",
    sourceOwner: input.userId,
    sourceConfidentiality: "internal",
    rawText: input.rawText,
    contentSafeSummary: input.rawText.slice(0, 2000),
    cleanedSummary: input.rawText.slice(0, 2000),
    requiresRedaction: false,
    approvedForContent: true,
    metadata: {
      slackChannel: input.channelId,
      slackUser: input.userId,
      capturedBy: input.capturedBy,
      workflow: "slack_to_linkedin_angles",
    },
  });

  const bundle = await generateAngleDrafts({ brainId, userSignal: input.rawText });
  const posts = await persistAngleDrafts({
    brainId,
    contentItemId: contentItem.id,
    drafts: bundle.drafts,
  });
  return { item: contentItem, posts, bundle };
}

export async function marketingSlackBrainId() {
  const brainId = process.env.MARKETING_OS_DEFAULT_BRAIN_ID?.trim();
  if (brainId) return brainId;
  const [brain] = await getRepository().listBrains();
  if (!brain) throw new Error("No Brain found for Slack Marketing OS ingestion.");
  return brain.id;
}

function allowedChannel(channel?: string) {
  const allowed = process.env.MARKETING_OS_SLACK_CHANNEL_ID?.trim();
  return !allowed || channel === allowed;
}

function extractGrowthText(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^(?:growth|marketing)\s*:\s*([\s\S]+)$/i);
  if (match?.[1]?.trim()) return match[1].trim();

  const marketingIntent = /\b(linkedin|post|content|marketing|competitor|research|best practices|thought piece|brand|launch|announce|idea|ideas|growth|image|images|video|videos|creative|visual|draft|drafts)\b/i;
  if (marketingIntent.test(trimmed)) return trimmed;
  return undefined;
}

export async function postSlackMessage(input: { channel: string; text: string; blocks?: SlackBlock[]; threadTs?: string }) {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) return { posted: false, reason: "missing_slack_bot_token" };
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel: input.channel,
      text: input.text,
      blocks: input.blocks,
      thread_ts: input.threadTs,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });
  const json = await response.json() as { ok?: boolean; error?: string; ts?: string };
  if (!json.ok) return { posted: false, reason: json.error ?? "slack_post_failed" };
  return { posted: true, ts: json.ts };
}

export async function handleSlackMarketingEvent(payload: SlackEventPayload) {
  if (payload.type === "url_verification" && payload.challenge) {
    return { type: "challenge" as const, challenge: payload.challenge };
  }
  if (payload.type !== "event_callback" || payload.event?.type !== "message") {
    return { type: "ignored" as const, reason: "not_message_event" };
  }
  const event = payload.event;
  if (event.bot_id || event.subtype) return { type: "ignored" as const, reason: "bot_or_subtype" };
  if (!allowedChannel(event.channel)) return { type: "ignored" as const, reason: "channel_not_allowed" };

  const text = event.text ?? "";
  const growthText = extractGrowthText(text);
  if (!growthText) return { type: "ignored" as const, reason: "missing_growth_prefix" };

  const result = await createAngleDraftOptions({
    rawText: growthText,
    userId: event.user,
    channelId: event.channel,
    capturedBy: "slack_event",
  });
  const posted = event.channel
    ? await postSlackMessage({
        channel: event.channel,
        text: `Arvya Marketing drafted ${result.posts.length} LinkedIn options.`,
        blocks: optionBlocks(result.posts),
      })
    : { posted: false, reason: "missing_channel" };

  return {
    type: "drafted" as const,
    contentItemId: result.item.id,
    insightCount: result.posts.length,
    postIds: result.posts.map((post) => post.id),
    angles: result.posts.map((p) => p.angle),
    slackPosted: posted,
    contextStats: {
      brainContextChars: result.bundle.brainContextChars,
      marketContextChars: result.bundle.marketContextChars,
      channelContextChars: result.bundle.channelContextChars,
    },
  };
}

export async function handleSlackGrowthCommand(input: {
  text: string;
  userId?: string;
  channelId?: string;
  responseUrl?: string;
}) {
  if (!allowedChannel(input.channelId)) {
    return { ok: false, message: "Arvya Marketing is only listening in the configured marketing channel." };
  }

  const text = input.text.replace(/^save\s+/i, "").trim();
  if (!text) {
    return { ok: false, message: "Send us the signal after `/growth save`: customer objection, competitor move, thought-piece angle, transcript excerpt, or rough idea." };
  }

  const result = await createAngleDraftOptions({
    rawText: text,
    userId: input.userId,
    channelId: input.channelId,
    capturedBy: "slack_command",
  });

  return {
    ok: true,
    message: `Arvya Marketing drafted ${result.posts.length} LinkedIn options with distinct angles. Pick the one that feels most Arvya.`,
    contentItemId: result.item.id,
    postIds: result.posts.map((post) => post.id),
    angles: result.posts.map((p) => p.angle),
    blocks: optionBlocks(result.posts),
  };
}

async function notifyChannel(channelId: string | undefined, text: string, threadTs?: string) {
  if (!channelId) return;
  await postSlackMessage({ channel: channelId, text, threadTs });
}

async function postImagesToThread(input: { channelId: string; threadTs?: string; imageUrls: string[]; alt: string }) {
  if (!input.imageUrls.length) return;
  const blocks: SlackBlock[] = input.imageUrls.map((url, idx) => ({
    type: "image",
    image_url: url,
    alt_text: input.imageUrls.length > 1 ? `${input.alt} (${idx + 1}/${input.imageUrls.length})` : input.alt,
  }));
  await postSlackMessage({
    channel: input.channelId,
    text: input.imageUrls.length > 1 ? `${input.alt} — ${input.imageUrls.length} slides rendered.` : input.alt,
    threadTs: input.threadTs,
    blocks,
  });
}

export async function handleSlackMarketingInteraction(payload: {
  type?: string;
  user?: { id?: string };
  channel?: { id?: string };
  message?: { ts?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
}) {
  const action = payload.actions?.[0];
  const postId = action?.value;
  if (!postId) return { ok: false, message: "Missing Marketing OS post id." };

  if (action.action_id === "marketing_archive") {
    await updateMarketingPost(postId, {
      status: "archived",
      approvedBy: payload.user?.id,
    });
    await notifyChannel(payload.channel?.id, `Archived option \`${postId.slice(0, 8)}\`.`, payload.message?.ts);
    return { ok: true, message: "Archived." };
  }

  if (action.action_id === "marketing_render_visual") {
    const channelId = payload.channel?.id;
    const threadTs = payload.message?.ts;
    if (channelId) {
      void postSlackMessage({
        channel: channelId,
        text: `Rendering visual for option \`${postId.slice(0, 8)}\`... (this can take 10-30s, longer for carousels).`,
        threadTs,
      });
    }
    const rendered = await renderAndAttachVisuals(postId);
    if (rendered.imageUrls.length && channelId) {
      await postImagesToThread({
        channelId,
        threadTs,
        imageUrls: rendered.imageUrls,
        alt: `Rendered ${rendered.kind} for option ${postId.slice(0, 8)}`,
      });
    }
    if (rendered.kind === "video_script" && rendered.videoScript && channelId) {
      const beats = rendered.videoScript.beats.map((b, i) => `${i + 1}. ${b}`).join("\n");
      await postSlackMessage({
        channel: channelId,
        text: `Video script (${rendered.videoScript.durationSec}s):\n${beats}`,
        threadTs,
      });
    }
    if (rendered.status === "failed" && channelId) {
      await postSlackMessage({
        channel: channelId,
        text: `Could not render visual: ${rendered.reason ?? "unknown error"}. You can still click *Approve + post now* to publish the text-only version.`,
        threadTs,
      });
    } else if (rendered.status === "skipped" && rendered.kind !== "video_script" && channelId) {
      await postSlackMessage({
        channel: channelId,
        text: `Visual skipped (${rendered.reason ?? "no_visual"}). Click *Approve + post now* when ready.`,
        threadTs,
      });
    } else if (channelId && rendered.status === "rendered") {
      await postSlackMessage({
        channel: channelId,
        text: `Preview rendered. Click *Approve + post now* on the option above to publish with this visual attached.`,
        threadTs,
      });
    }
    return { ok: rendered.status !== "failed", message: rendered.status === "rendered" ? "Visual rendered to thread." : `Visual ${rendered.status}: ${rendered.reason ?? "n/a"}` };
  }

  if (action.action_id === "marketing_approve_schedule") {
    await updateMarketingPost(postId, {
      status: "approved",
      approvedBy: payload.user?.id,
    });
    const rendered = await renderAndAttachVisuals(postId);
    if (payload.channel?.id && rendered.imageUrls.length) {
      await postImagesToThread({
        channelId: payload.channel.id,
        threadTs: payload.message?.ts,
        imageUrls: rendered.imageUrls,
        alt: `Visual attached to scheduled post ${postId.slice(0, 8)}`,
      });
    }
    const result = await scheduleMarketingPost(postId, {
      approvedBy: payload.user?.id,
      scheduledAt: defaultScheduleTime(),
    });
    const liveUrl = result.post?.liveUrl;
    const text = result.scheduled
      ? `Approved + scheduled for ${defaultScheduleTime()} on Arvya LinkedIn via Buffer.${liveUrl ? ` ${liveUrl}` : ""}${rendered.imageUrls.length ? ` Visual attached (${rendered.imageUrls.length} image${rendered.imageUrls.length > 1 ? "s" : ""}).` : ""}`
      : `Could not schedule: ${result.safety.reason}`;
    await notifyChannel(payload.channel?.id, text, payload.message?.ts);
    return { ok: Boolean(result.scheduled), message: text };
  }

  if (action.action_id === "marketing_approve_post_now") {
    await updateMarketingPost(postId, {
      status: "approved",
      approvedBy: payload.user?.id,
    });
    if (payload.channel?.id) {
      void postSlackMessage({
        channel: payload.channel.id,
        text: `Rendering visual + publishing option \`${postId.slice(0, 8)}\` to LinkedIn via Buffer...`,
        threadTs: payload.message?.ts,
      });
    }
    const rendered = await renderAndAttachVisuals(postId);
    if (payload.channel?.id && rendered.imageUrls.length) {
      await postImagesToThread({
        channelId: payload.channel.id,
        threadTs: payload.message?.ts,
        imageUrls: rendered.imageUrls,
        alt: `Visual being published with option ${postId.slice(0, 8)}`,
      });
    } else if (rendered.status === "failed" && payload.channel?.id) {
      await postSlackMessage({
        channel: payload.channel.id,
        text: `Visual rendering failed (${rendered.reason ?? "unknown"}). Continuing with text-only post.`,
        threadTs: payload.message?.ts,
      });
    }
    const result = await scheduleMarketingPost(postId, {
      approvedBy: payload.user?.id,
      mode: "now",
    });
    const bufferId = result.post?.schedulerPostId ?? result.scheduler?.schedulerPostId;
    const liveUrl = result.post?.liveUrl ?? result.scheduler?.liveUrl;
    const visualNote = rendered.imageUrls.length
      ? ` Visual attached (${rendered.imageUrls.length} image${rendered.imageUrls.length > 1 ? "s" : ""}).`
      : "";
    const text = result.scheduled
      ? `Published to Arvya LinkedIn via Buffer (shareNow).${bufferId ? ` Buffer post \`${bufferId}\`.` : ""}${liveUrl ? ` ${liveUrl}` : ""}${visualNote}`
      : `Could not post now: ${result.safety.reason}`;
    await notifyChannel(payload.channel?.id, text, payload.message?.ts);
    return { ok: Boolean(result.scheduled), message: text };
  }

  return { ok: false, message: "Unknown Marketing OS action." };
}
