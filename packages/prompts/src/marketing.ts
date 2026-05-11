type MarketingChannel = "linkedin_company" | "x" | "linkedin_founder" | "linkedin_pb";
type MarketingContentItem = {
  sourcePlatform: string;
  sourceType: string;
  sourceConfidentiality: string;
  sourceOwner?: string | null;
  rawText: string;
};
type MarketingContentInsight = {
  id: string;
  suggestedPillar?: string | null;
  contentSafeInsight: string;
  approvedForContent?: boolean;
};
type MarketingChannelPost = {
  id: string;
  channel: string;
  status: string;
  pillar?: string | null;
  formatType?: string | null;
  hookType?: string | null;
  targetIcp?: string | null;
  bodyText: string;
  sensitivityLevel?: string;
  approvedForContent?: boolean;
  publishedAt?: string | null;
};
type MarketingPostMetric = Record<string, unknown>;
type MarketingEvent = Record<string, unknown>;

export const marketingRedactionSystemPrompt = `You are the Arvya Marketing OS redaction agent.

Your job is to turn sensitive internal signal into content-safe insights.
Rules:
- Anonymize names, firms, employers, investors, customers, and deal details by default.
- Never preserve direct private email, Slack, or call quotes unless explicitly marked public.
- Convert specifics into generalized, finance-native workflow insights.
- Block anything that would reveal confidential customer, investor, deal, employer, or product roadmap details.
- Prefer useful but safe insight over vivid but risky copy.`;

export function buildMarketingRedactionPrompt(input: { item: MarketingContentItem }) {
  return `Source platform: ${input.item.sourcePlatform}
Source type: ${input.item.sourceType}
Declared confidentiality: ${input.item.sourceConfidentiality}
Source owner: ${input.item.sourceOwner ?? "unknown"}

Raw signal:
${input.item.rawText}

Return cleaned summaries and 1-8 content-safe insights.`;
}

export const marketingDraftSystemPrompt = `You are the Arvya Marketing OS drafting agent.

Write clear, direct, founder-led, finance-native posts.
Avoid generic AI hype, including: revolutionize, unlock, seamless, game-changing, 10x, transform.
Use concrete workflows: buyer tracking, NDA follow-ups, MD briefings, meeting prep, CRM hygiene, follow-up emails, weekly deal updates, institutional memory, Outlook, Microsoft Graph.

Only draft from content-safe insights. Never reintroduce private names, private quotes, firm names, or confidential source detail.`;

export function buildMarketingDraftPrompt(input: {
  insights: MarketingContentInsight[];
  channels: MarketingChannel[];
  exemplars: MarketingChannelPost[];
  variantsPerInsight?: number;
}) {
  const exemplars = input.exemplars.length
    ? input.exemplars.map((post, index) => `Example ${index + 1} (${post.channel}, ${post.pillar ?? "untagged"}):\n${post.bodyText}`).join("\n\n")
    : "No exemplars are available yet. Use the voice rules strictly and stay practical.";

  const insights = input.insights
    .map((insight) => `Insight ${insight.id}\nPillar: ${insight.suggestedPillar ?? "unknown"}\n${insight.contentSafeInsight}`)
    .join("\n\n");

  const variants = input.variantsPerInsight ?? 1;

  return `Target channels: ${input.channels.join(", ")}
Draft variants per insight: ${variants}

Voice exemplars:
${exemplars}

Approved content-safe insights:
${insights}

Create ${variants} meaningfully different options for each approved insight on the requested channels.
For Arvya LinkedIn company posts, each option should have a distinct angle, hook, structure, and level of product specificity.
Create drafts only for requested channels.`;
}

export const marketingSafetySystemPrompt = `You are the final pre-schedule safety checker for Arvya Marketing OS.

Fail a post if it contains:
- unapproved customer, investor, firm, or person names
- direct private email, call, or Slack quotes
- unsupported product claims
- confidential source details
- employer-sensitive or private work-context references
- legal, compliance, or reputational red flags

Return a clear pass/fail decision and concrete flags.`;

export function buildMarketingSafetyPrompt(input: { post: MarketingChannelPost; insight?: MarketingContentInsight | null }) {
  return `Post status: ${input.post.status}
Insight approved: ${input.insight?.approvedForContent ?? false}
Sensitivity: ${input.post.sensitivityLevel}

Insight:
${input.insight?.contentSafeInsight ?? "No linked insight."}

Post:
${input.post.bodyText}`;
}

export const marketingWeeklySystemPrompt = `You are the Arvya Marketing OS weekly analyst.

Focus on learning, not vanity metrics.
If there are fewer than 30 published posts in the window, do qualitative analysis only. Do not claim pillar or format winners.
Name specific posts tied to demos, DMs, replies, or qualified engagement when available.
Recommend 3-5 concrete experiments for next week.`;

export function buildMarketingWeeklyPrompt(input: {
  weekStart: string;
  weekEnd: string;
  posts: MarketingChannelPost[];
  metrics: MarketingPostMetric[];
  events: MarketingEvent[];
}) {
  return `Window: ${input.weekStart} to ${input.weekEnd}
Published posts in window: ${input.posts.length}

Posts:
${JSON.stringify(input.posts.map((post) => ({
  id: post.id,
  channel: post.channel,
  pillar: post.pillar,
  formatType: post.formatType,
  hookType: post.hookType,
  targetIcp: post.targetIcp,
  bodyText: post.bodyText.slice(0, 1000),
  publishedAt: post.publishedAt,
})), null, 2)}

Metrics:
${JSON.stringify(input.metrics, null, 2)}

Events:
${JSON.stringify(input.events, null, 2)}`;
}
