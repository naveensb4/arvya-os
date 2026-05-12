import {
  marketingDraftResultSchema,
  marketingRedactionResultSchema,
  marketingSafetyCheckResultSchema,
  marketingWeeklyAnalysisResultSchema,
  type AiClient,
  type MarketingChannel,
  type MarketingChannelPost,
  type MarketingContentInsight,
  type MarketingContentItem,
  type MarketingDraftResult,
  type MarketingEvent,
  type MarketingPostMetric,
  type MarketingRedactionResult,
  type MarketingSafetyCheckResult,
  type MarketingWeeklyAnalysisResult,
} from "@arvya/core";
import {
  buildMarketingDraftPrompt,
  buildMarketingRedactionPrompt,
  buildMarketingSafetyPrompt,
  buildMarketingWeeklyPrompt,
  marketingDraftSystemPrompt,
  marketingRedactionSystemPrompt,
  marketingSafetySystemPrompt,
  marketingWeeklySystemPrompt,
} from "@arvya/prompts/marketing";

const DEFAULT_CHANNELS: MarketingChannel[] = ["linkedin_company", "x"];

export async function redactMarketingContent(input: {
  item: MarketingContentItem;
  ai?: AiClient;
}): Promise<MarketingRedactionResult> {
  if (input.ai?.available) {
    const result = await input.ai.completeStructured({
      system: marketingRedactionSystemPrompt,
      prompt: buildMarketingRedactionPrompt({ item: input.item }),
      schema: marketingRedactionResultSchema,
      schemaName: "marketing_redaction_result",
      schemaDescription: "Redacted marketing-safe summaries and insights.",
      maxTokens: 3000,
    });
    return result.data;
  }

  const summary = input.item.rawText.trim().slice(0, 1200);
  return {
    cleanedSummary: summary,
    contentSafeSummary: summary.replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, "a stakeholder"),
    sourceConfidentiality: input.item.sourceConfidentiality,
    requiresRedaction: true,
    approvedForContent: input.item.sourceConfidentiality === "public",
    insights: [
      {
        rawInsight: summary.slice(0, 600),
        contentSafeInsight: `Content-safe angle: ${summary.slice(0, 500)}`,
        sensitivityLevel: input.item.sourceConfidentiality === "public" ? "low" : "medium",
        suggestedPillar: "deal_workflow",
        suggestedChannels: DEFAULT_CHANNELS,
      },
    ],
    redactionNotes: ["Deterministic fallback used because no live AI client is configured."],
  };
}

export async function draftMarketingPosts(input: {
  insights: MarketingContentInsight[];
  channels?: MarketingChannel[];
  exemplars?: MarketingChannelPost[];
  variantsPerInsight?: number;
  ai?: AiClient;
}): Promise<MarketingDraftResult> {
  const channels = (input.channels?.length ? input.channels : DEFAULT_CHANNELS).filter((channel) =>
    channel === "linkedin_company" || channel === "x",
  );
  const approvedInsights = input.insights.filter((insight) => insight.approvedForContent);

  if (input.ai?.available && approvedInsights.length > 0) {
    try {
      const result = await input.ai.completeStructured({
        system: marketingDraftSystemPrompt,
        prompt: buildMarketingDraftPrompt({
          insights: approvedInsights,
          channels,
          exemplars: input.exemplars ?? [],
          variantsPerInsight: input.variantsPerInsight,
        }),
        schema: marketingDraftResultSchema,
        schemaName: "marketing_draft_result",
        schemaDescription: "Marketing channel post drafts.",
        maxTokens: 5000,
      });
      const insightIds = new Set(approvedInsights.map((insight) => insight.id));
      return {
        drafts: result.data.drafts.filter((draft) => insightIds.has(draft.contentInsightId) && (channels as MarketingChannel[]).includes(draft.channel)),
      };
    } catch (error) {
      console.warn(
        "[marketing-agent] draft generation fell back to deterministic templates:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const variants = Math.max(1, Math.min(5, input.variantsPerInsight ?? 1));
  const linkedinTemplates = [
    (text: string) => `${text}\n\nThe best deal teams do not need another dashboard. They need their deal memory to turn into action.`,
    (text: string) => `A pattern we keep seeing in deal work:\n\n${text}\n\nThe work is not broken because bankers are disorganized. It is broken because the context lives across Outlook, calls, docs, and memory.`,
    (text: string) => `${text}\n\nThis is why Arvya is building an Outlook-native Deal Brain: institutional memory that stays close to where deal teams already work.`,
    (text: string) => `Most deal software starts with a dashboard.\n\nBut the real workflow starts in the inbox.\n\n${text}\n\nThat is the gap Arvya is focused on.`,
    (text: string) => `If a team has to reconstruct buyer status, NDA follow-ups, and meeting context before every update, the system is not compounding.\n\n${text}`,
  ];

  return {
    drafts: approvedInsights.flatMap((insight) =>
      channels.flatMap((channel) => Array.from({ length: channel === "linkedin_company" ? variants : 1 }, (_, index) => ({
        contentInsightId: insight.id,
        channel,
        bodyText:
          channel === "x"
            ? `${insight.contentSafeInsight.slice(0, 240)}`
            : linkedinTemplates[index % linkedinTemplates.length](insight.contentSafeInsight),
        pillar: insight.suggestedPillar ?? "deal_workflow",
        formatType: "product_pov" as const,
        hookType: "workflow" as const,
        targetIcp: "ib" as const,
        funnelStage: "problem_aware" as const,
        campaignTag: insight.suggestedPillar ?? "deal_workflow",
        rationale: "Deterministic fallback draft from an approved content-safe insight.",
      }))),
    ),
  };
}

export async function checkMarketingPostSafety(input: {
  post: MarketingChannelPost;
  insight?: MarketingContentInsight | null;
  ai?: AiClient;
}): Promise<MarketingSafetyCheckResult> {
  if (input.post.status !== "approved") {
    return { passed: false, reason: "Post must be approved before scheduling.", flags: ["not_approved"] };
  }
  if (!input.insight?.approvedForContent) {
    return { passed: false, reason: "Linked content insight is not approved for content.", flags: ["insight_not_approved"] };
  }

  if (input.ai?.available) {
    const result = await input.ai.completeStructured({
      system: marketingSafetySystemPrompt,
      prompt: buildMarketingSafetyPrompt({ post: input.post, insight: input.insight }),
      schema: marketingSafetyCheckResultSchema,
      schemaName: "marketing_safety_check_result",
      schemaDescription: "Pre-schedule safety check.",
      maxTokens: 1200,
    });
    return result.data;
  }

  const blockedTerms = ["confidential", "do not share", "private email", "NDA"];
  const flags = blockedTerms.filter((term) => input.post.bodyText.toLowerCase().includes(term));
  return {
    passed: flags.length === 0,
    reason: flags.length === 0 ? "No deterministic safety flags found." : `Potential sensitive terms found: ${flags.join(", ")}`,
    flags,
  };
}

export async function analyzeMarketingWeek(input: {
  weekStart: string;
  weekEnd: string;
  posts: MarketingChannelPost[];
  metrics: MarketingPostMetric[];
  events: MarketingEvent[];
  ai?: AiClient;
}): Promise<MarketingWeeklyAnalysisResult> {
  if (input.ai?.available) {
    const result = await input.ai.completeStructured({
      system: marketingWeeklySystemPrompt,
      prompt: buildMarketingWeeklyPrompt(input),
      schema: marketingWeeklyAnalysisResultSchema,
      schemaName: "marketing_weekly_analysis_result",
      schemaDescription: "Weekly marketing learning report.",
      maxTokens: 4000,
    });
    return result.data;
  }

  const qualitativeOnly = input.posts.length < 30;
  const summary = qualitativeOnly
    ? `Qualitative read: ${input.posts.length} published posts and ${input.events.length} tracked events.`
    : `Performance read across ${input.posts.length} posts and ${input.events.length} tracked events.`;
  return {
    summary,
    markdown: `# Marketing Weekly Report\n\n${summary}\n\n## Next Experiments\n\n- Test one concrete deal-workflow pain post.\n- Test one founder-led lesson post.\n- Test one product POV tied to Outlook-native deal memory.`,
    recommendedExperiments: [
      { title: "Deal workflow pain post", rationale: "Ground the narrative in a repeated banker workflow." },
      { title: "Founder lesson post", rationale: "Use a specific learning without exposing source details." },
      { title: "Outlook-native product POV", rationale: "Reinforce Arvya's core positioning." },
    ],
  };
}
