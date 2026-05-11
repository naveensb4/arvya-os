import { z } from "zod";
import { getAiClient } from "@/lib/ai";
import { getRepository } from "@/lib/db/repository";
import { retrieveRelevantContext } from "@/lib/retrieval";
import { marketingDryRunEnabled } from "@/lib/marketing/access";
import { isMultimodalEnabled, type VisualConcept, type VisualKind } from "@/lib/marketing/visual-renderer";

export type DraftAngle =
  | "founder_pov"
  | "customer_observation"
  | "industry_critique"
  | "product_specific";

export const ANGLE_LABELS: Record<DraftAngle, string> = {
  founder_pov: "Founder POV",
  customer_observation: "Customer story",
  industry_critique: "Industry critique",
  product_specific: "Product specifics",
};

const ANGLE_BRIEFS: Record<DraftAngle, string> = {
  founder_pov:
    "First-person from a founder building Arvya. Opinionated belief about how deal teams should work. No 'we are excited to share'. Lead with a sharp claim, ground it in one observation from inside the company brain, end with the implication for IB / advisory firms.",
  customer_observation:
    "Third-person observation about a recurring pattern we see when working with deal teams (bankers, MDs, associates, ECM/M&A). Use concrete workflow detail (Outlook threads, weekly buyer updates, MD pre-meeting briefs, NDA follow-ups). No customer names, no firm names. End with what it implies for how teams are operating today.",
  industry_critique:
    "Pointed take on what most CRM / deal software gets wrong for advisory / IB / PE work. Contrarian against the default 'pipeline view + dashboards' stack. Concrete, no jargon. Reference how that approach falls down on real banker workflow. End with what we think replaces it.",
  product_specific:
    "Concrete product moment from Arvya: an Outlook-native deal memory that lives where bankers already work. Describe one specific surface (auto-extracted buyer status from email, MD pre-meeting brief, weekly deal update from threads). Plain, demo-able, no hype words.",
};

const visualSchema = z.object({
  kind: z.enum(["none", "diagram", "carousel", "screenshot_mock", "video_script"]),
  imagePrompt: z.string().max(800).optional(),
  carouselSlides: z
    .array(
      z.object({
        caption: z.string().max(160),
        imagePrompt: z.string().max(600),
      }),
    )
    .min(4)
    .max(6)
    .optional(),
  videoScript: z
    .object({
      durationSec: z.number().int().min(10).max(90),
      beats: z.array(z.string().max(220)).min(3).max(8),
    })
    .optional(),
  rationale: z.string().min(8).max(400),
});

const draftSchema = z.object({
  drafts: z
    .array(
      z.object({
        angle: z.enum(["founder_pov", "customer_observation", "industry_critique", "product_specific"]),
        bodyText: z.string().min(120).max(2400),
        hook: z.string().min(8).max(200),
        rationale: z.string().min(20).max(400),
        visual: visualSchema,
      }),
    )
    .min(3)
    .max(4),
});

export type AngleDraft = z.infer<typeof draftSchema>["drafts"][number];
export type { VisualConcept, VisualKind };

const SYSTEM_PROMPT_BASE = `You are the Arvya Marketing OS LinkedIn drafter for an early-stage company building an Outlook-native deal memory for investment banking and advisory deal teams.

Voice rules (hard):
- Founder-led, finance-native, concrete. No generic AI hype.
- Never use: revolutionize, unlock, seamless, game-changing, 10x, transform, paradigm, leverage (as a verb), supercharge, empower, in this era of, the future of.
- Never start with a one-line cliche ("In today's fast-paced world", "AI is everywhere", "We are excited to share").
- Reference real banker workflow surfaces: Outlook threads, MD pre-meeting briefs, weekly buyer updates, NDA follow-ups, CRM hygiene, deal memory, Microsoft Graph, institutional memory, follow-up email drafting.
- Specifics over abstractions. If you can name a workflow, name it.
- Never invent customer names, firm names, ticker symbols, dollar figures, or quotes that were not provided.
- Length: 130 - 1700 characters. Use blank lines between short paragraphs. LinkedIn-native rhythm.

For each draft, produce a clearly distinct angle. Do not write four versions of the same post. The angle dictates the structure and POV.`;

const SYSTEM_PROMPT_MULTIMODAL_ADDENDUM = `

Visual guidance:
Each draft also includes a "visual" field describing whether (and what kind of) image, carousel, or short video script should ship with the post.
- kind="none" → text-only post.
- kind="diagram" → one simple labeled flow/box diagram. Provide a tight imagePrompt (one paragraph, max 600 chars) describing the diagram contents (e.g., "Fragmented deal activity (Outlook, calls, CRM, decks) → Deal Brain → next-step action"). No watermarks, no logos.
- kind="screenshot_mock" → one flat UI mock (Outlook thread, deal-memory pane, MD brief). Provide imagePrompt with concrete content, generic placeholder names.
- kind="carousel" → 4-6 slides. Provide carouselSlides as an array; each slide has a caption (max 160 chars) and imagePrompt (max 600 chars). The carousel should make ONE crisp argument (e.g., "5 places deal context gets lost"). Each slide must stand on its own visually.
- kind="video_script" → no image. Provide videoScript with durationSec (15-60) and beats (3-8 short beats). No fabrication of customer quotes.

Default visual heuristics (the model may override if a better fit exists; explain choice in rationale):
- founder_pov → "none" or simple "diagram".
- customer_observation → "screenshot_mock".
- industry_critique → "carousel".
- product_specific → "diagram" or "screenshot_mock".

rationale on the visual field: one short sentence explaining why this visual fits this angle.
If you choose kind="none", still emit the field with kind="none" and a rationale.`;

function systemPromptText(multimodal: boolean): string {
  return multimodal ? `${SYSTEM_PROMPT_BASE}${SYSTEM_PROMPT_MULTIMODAL_ADDENDUM}` : SYSTEM_PROMPT_BASE;
}

function buildPrompt(input: {
  userSignal: string;
  brainContextText: string;
  marketContextText: string;
  channelHistoryText: string;
}) {
  return `User signal in the marketing channel:
"""
${input.userSignal}
"""

Relevant context retrieved from the Company Brain (use it; do not fabricate beyond it):
"""
${input.brainContextText || "[No brain context retrieved; rely on voice rules and the signal.]"}
"""

Comparable-firm / market context (only use what is real; do not fabricate):
"""
${input.marketContextText || "[No external market context available this run.]"}
"""

Recent #arvya-marketing channel context (recent human signals you can echo themes from):
"""
${input.channelHistoryText || "[No recent channel history.]"}
"""

Produce 4 LinkedIn drafts, one for EACH of these angles, in this order:
1. founder_pov  — ${ANGLE_BRIEFS.founder_pov}
2. customer_observation — ${ANGLE_BRIEFS.customer_observation}
3. industry_critique — ${ANGLE_BRIEFS.industry_critique}
4. product_specific — ${ANGLE_BRIEFS.product_specific}

Each draft must:
- Lead with a strong hook (first line) that would stop scroll in a banker's feed.
- Be 130-1700 chars.
- Be meaningfully different in structure and POV from the other three.
- Include at least one concrete workflow detail (Outlook, MD brief, weekly update, NDA follow-up, deal memory, etc.).
- End with a single clear takeaway, not a CTA.

In "rationale", briefly say why this angle works for this signal (2-3 sentences).`;
}

async function pullBrainContext(brainId: string, query: string) {
  const repo = getRepository();
  const ai = getAiClient();
  try {
    const hits = await retrieveRelevantContext({
      brainId,
      question: query,
      repository: repo,
      ai,
      limit: 8,
    });
    if (!hits.length) return "";
    const blocks = hits.slice(0, 8).map((hit, index) => {
      if (hit.memoryObject) {
        return `[${index + 1}] memory:${hit.memoryObject.objectType} — ${hit.memoryObject.name}\n${hit.memoryObject.description ?? ""}`.trim();
      }
      if (hit.openLoop) {
        return `[${index + 1}] open_loop:${hit.openLoop.priority} — ${hit.openLoop.title}\n${hit.openLoop.description ?? ""}`.trim();
      }
      if (hit.sourceItem) {
        const body = (hit.sourceItem.content ?? "").slice(0, 600);
        return `[${index + 1}] source:${hit.sourceItem.type} — ${hit.sourceItem.title}\n${body}`.trim();
      }
      return "";
    });
    return blocks.filter(Boolean).join("\n\n---\n\n").slice(0, 6000);
  } catch (error) {
    console.warn("[draft-angles] brain retrieval failed:", error instanceof Error ? error.message : error);
    return "";
  }
}

async function pullMarketContext(query: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return "";
  const enableSearch = process.env.MARKETING_OS_WEB_RESEARCH !== "false";
  if (!enableSearch) return "";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.MARKETING_OS_RESEARCH_MODEL?.trim() || "gpt-4.1-mini",
        input: `Find 3-5 recent, concrete observations or talking points from comparable firms posting about deal-team workflow, investment banking productivity tools, Outlook for bankers, or CRM-for-advisory. Topic seed: ${query}. Return a tight bulleted summary, no marketing fluff, only what would be useful to someone drafting a LinkedIn post for an Outlook-native deal-memory startup serving IB / M&A / advisory teams. Cite each bullet's source domain in parentheses.`,
        tools: [{ type: "web_search_preview" }],
        max_output_tokens: 600,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`[draft-angles] web research returned ${response.status}: ${body.slice(0, 200)}`);
      return "";
    }
    const json = (await response.json()) as {
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      output_text?: string;
    };
    if (typeof json.output_text === "string" && json.output_text.trim()) {
      return json.output_text.trim().slice(0, 4000);
    }
    const textChunks = (json.output ?? [])
      .flatMap((item) => item.content ?? [])
      .filter((c) => c.type === "output_text" || c.type === "text")
      .map((c) => c.text ?? "")
      .filter(Boolean);
    return textChunks.join("\n").slice(0, 4000);
  } catch (error) {
    console.warn("[draft-angles] web research failed:", error instanceof Error ? error.message : error);
    return "";
  }
}

async function pullChannelHistory(brainId: string): Promise<string> {
  const channel = process.env.MARKETING_OS_SLACK_CHANNEL_ID?.trim();
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!channel || !token) return "";
  try {
    const url = new URL("https://slack.com/api/conversations.history");
    url.searchParams.set("channel", channel);
    url.searchParams.set("limit", "20");
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await response.json()) as { ok?: boolean; messages?: Array<{ text?: string; user?: string; bot_id?: string }> };
    if (!json.ok || !json.messages) return "";
    const lines = json.messages
      .filter((m) => !m.bot_id && (m.text ?? "").trim().length > 0)
      .slice(0, 10)
      .map((m) => `- ${m.text!.slice(0, 240)}`);
    return lines.join("\n").slice(0, 1500);
  } catch (error) {
    console.warn("[draft-angles] channel history failed:", error instanceof Error ? error.message : error);
    return "";
  }
}

export type AngleDraftBundle = {
  drafts: AngleDraft[];
  brainContextChars: number;
  marketContextChars: number;
  channelContextChars: number;
};

function defaultVisualForAngle(angle: DraftAngle): VisualConcept {
  switch (angle) {
    case "founder_pov":
      return {
        kind: "diagram",
        imagePrompt:
          "Simple flow diagram: 'Fragmented deal activity' (small boxes for Outlook threads, calls, CRM, decks) → 'Deal Brain' (single rounded box) → 'Next-step action' (single short caption). Clean labels, calm muted palette.",
        rationale: "Founder POVs land better with one crisp before/after visual.",
      };
    case "customer_observation":
      return {
        kind: "screenshot_mock",
        imagePrompt:
          "Flat UI mock of an Outlook-style email thread on the left and a Deal Memory pane on the right summarizing buyer status, follow-ups and last-update from MD; generic placeholder names like 'Buyer A / Sponsor B'.",
        rationale: "Customer-pattern posts need a concrete workflow surface to feel real.",
      };
    case "industry_critique":
      return {
        kind: "carousel",
        carouselSlides: [
          { caption: "5 places deal context gets lost", imagePrompt: "Title slide: large bold headline '5 places deal context gets lost'. Subtle finance-software palette. No clutter." },
          { caption: "1. Outlook threads no one re-reads", imagePrompt: "Slide showing an icon of a stacked email thread with the word 'unread' lightly faded." },
          { caption: "2. The MD pre-meeting brief that never got written down", imagePrompt: "Slide with a calendar block and a thin note icon with a question mark." },
          { caption: "3. The weekly buyer update buried in chat", imagePrompt: "Slide showing a chat-bubble cluster with one fading out of view." },
          { caption: "4. CRM fields half-filled, never trusted", imagePrompt: "Slide with a simplified CRM table where half the cells are blank." },
          { caption: "5. The associate who left last quarter", imagePrompt: "Slide with an empty silhouette and a small box labeled 'context'." },
        ],
        rationale: "Industry critiques scroll well as carousels — one argument, one slide each.",
      };
    case "product_specific":
      return {
        kind: "diagram",
        imagePrompt:
          "Tight diagram: 'Outlook inbox' (folder icon) → 'Auto-extracted buyer status' (small rounded box) → 'Weekly deal update' (small rounded box) → 'MD pre-meeting brief' (small rounded box). Arrows show data flow. Minimal, calm palette.",
        rationale: "Product specifics need a labeled visual to make the surface tangible.",
      };
  }
}

function buildDryRunDrafts(userSignal: string, multimodal: boolean): AngleDraft[] {
  const trimmed = userSignal.trim().slice(0, 220);
  return (Object.keys(ANGLE_LABELS) as DraftAngle[]).slice(0, 4).map((angle) => ({
    angle,
    bodyText: `[dry-run ${ANGLE_LABELS[angle]}] ${trimmed}\n\nDeterministic placeholder — set MARKETING_OS_DRY_RUN=false and ANTHROPIC_API_KEY or OPENAI_API_KEY to generate real drafts.`,
    hook: `[dry-run hook] ${ANGLE_LABELS[angle]}`,
    rationale: `Dry-run placeholder for the ${ANGLE_LABELS[angle]} angle.`,
    visual: multimodal
      ? defaultVisualForAngle(angle)
      : { kind: "none" as const, rationale: "multimodal disabled" },
  }));
}

export async function generateAngleDrafts(input: {
  brainId: string;
  userSignal: string;
}): Promise<AngleDraftBundle> {
  const multimodal = isMultimodalEnabled();
  if (marketingDryRunEnabled()) {
    return {
      drafts: buildDryRunDrafts(input.userSignal, multimodal),
      brainContextChars: 0,
      marketContextChars: 0,
      channelContextChars: 0,
    };
  }

  const ai = getAiClient();
  if (!ai.available) {
    throw new Error("AI provider not configured (ANTHROPIC_API_KEY or OPENAI_API_KEY required).");
  }

  const [brainContextText, marketContextText, channelHistoryText] = await Promise.all([
    pullBrainContext(input.brainId, input.userSignal),
    pullMarketContext(input.userSignal),
    pullChannelHistory(input.brainId),
  ]);

  const completion = await ai.completeStructured({
    system: systemPromptText(multimodal),
    prompt: buildPrompt({
      userSignal: input.userSignal,
      brainContextText,
      marketContextText,
      channelHistoryText,
    }),
    schema: draftSchema,
    schemaName: "marketing_angle_drafts",
    schemaDescription: "3-4 angle-labeled LinkedIn drafts (with visual concepts) for the Arvya marketing channel.",
    maxTokens: 5000,
  });

  let drafts = completion.data.drafts;
  if (!multimodal) {
    drafts = drafts.map((d) => ({ ...d, visual: { kind: "none" as const, rationale: "multimodal disabled" } }));
  }

  return {
    drafts,
    brainContextChars: brainContextText.length,
    marketContextChars: marketContextText.length,
    channelContextChars: channelHistoryText.length,
  };
}
