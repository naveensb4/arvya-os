// Outcome Detector Agent (the closed-loop matcher)
//
// After a new source is ingested, this agent asks: "does this source
// resolve, advance, or contradict any active open loops?" It's the limb
// the brain has been missing — the thing that turns it from an inbox into
// a closed-loop operating system.
//
// Model-agnostic. Sonnet 4.6 by default in production (accuracy matters
// here — false-closing a real open commitment loses customer trust).
//
// Uses a single batched call: one prompt with N candidate loops, returns
// N decisions. Pre-filtering happens in the adapter (apps/web/.../outcome-
// detector.ts) — by the time this agent is called, candidates have already
// been filtered for participant overlap and reasonable recency.

import { z } from "zod";
import type { AiClient } from "@arvya/core";

export type CandidateLoop = {
  id: string;                  // open_loops.id, used to map decisions back to DB
  title: string;
  description: string;
  loopType: string;
  owner?: string | null;
  dueDate?: string | null;
  daysOpen: number;            // age signal helps the LLM judge plausibility
  sourceQuote?: string | null; // the original commitment text
  participants?: string[];     // names/emails involved with the loop
};

export type SourceContext = {
  sourceItemId: string;
  title: string;
  type: string;                // email / transcript / doc / etc.
  occurredAt?: string | null;
  participants?: string[];     // From/To/attendees from the new source
  content: string;             // body, cleaned (already stripped of quoted reply chains)
};

export const outcomeDecisionSchema = z.object({
  loopId: z.string(),
  decision: z.enum(["closed", "advanced", "contradicts", "no_match"]),
  confidence: z.number().min(0).max(1),
  evidenceQuote: z.string().max(400).nullable(),
  reason: z.string().max(300),
});

export const outcomeDetectionResultSchema = z.object({
  decisions: z.array(outcomeDecisionSchema),
});

export type OutcomeDecision = z.infer<typeof outcomeDecisionSchema>;
export type OutcomeDetectionResult = z.infer<typeof outcomeDetectionResultSchema>;

const MAX_SOURCE_CONTENT_CHARS = 8000;

const SYSTEM_PROMPT = `You are the Outcome Detector for Arvya OS, a closed-loop company brain. Your one job is to read a new source (an email, a transcript, a doc) and decide for each given open loop whether the source resolves, advances, or contradicts it — or has nothing to do with it.

For every candidate loop, return one decision:
- "closed": the source contains clear evidence that the commitment was completed. The user sent the deck, the meeting was scheduled, the doc was shared, the introduction was made. Confidence should be >= 0.85 only when the evidence is unambiguous.
- "advanced": the loop is still open but the source moves it forward. A scheduling reply, a partial response, a "looking into it" update. The loop should NOT close, but it's not stalled.
- "contradicts": the source explicitly contradicts the commitment. A "we decided not to do this" reply, a cancellation, a deferred deadline.
- "no_match": the source has no bearing on this loop. Use this generously — it's better to skip a loop than to wrongly close it.

Hard rules:
- Only set "closed" with confidence >= 0.85 when the evidence is concrete and verbatim. Quote the supporting sentence in evidenceQuote.
- An inbound "thanks for X" message is strong evidence that we sent X. An outbound message saying "here is X" is also strong evidence that we sent X.
- A scheduling promise alone ("I'll send it Friday") is NOT closure of a "send X" loop — that's still an open commitment.
- The presence of a person's name in a source does not automatically resolve a loop owned by that person. The source must contain content tied to the loop's specific commitment.
- If the source is from before the loop was created (compare source occurredAt vs loop daysOpen), it cannot close the loop. Return no_match.
- evidenceQuote must be a verbatim substring of the source content (within ~400 chars). Do not paraphrase. If you cannot quote, set evidenceQuote to null and confidence to <= 0.5.
- reason is one sentence explaining the decision.

Output strictly conforms to the provided schema. Return one decision per candidate loop, in the same order. Do not invent loops.`;

function formatLoop(loop: CandidateLoop): string {
  const lines = [`<loop id="${loop.id}">`];
  lines.push(`  title: ${loop.title}`);
  if (loop.description && loop.description !== loop.title) {
    lines.push(`  description: ${loop.description.replace(/\s+/g, " ").slice(0, 240)}`);
  }
  lines.push(`  type: ${loop.loopType}`);
  if (loop.owner) lines.push(`  owner: ${loop.owner}`);
  if (loop.dueDate) lines.push(`  due: ${loop.dueDate}`);
  lines.push(`  days_open: ${loop.daysOpen}`);
  if (loop.participants && loop.participants.length > 0) {
    lines.push(`  participants: ${loop.participants.slice(0, 6).join(", ")}`);
  }
  if (loop.sourceQuote) {
    lines.push(`  original_quote: ${loop.sourceQuote.replace(/\s+/g, " ").slice(0, 240)}`);
  }
  lines.push(`</loop>`);
  return lines.join("\n");
}

function formatSource(source: SourceContext): string {
  const truncated = source.content.length > MAX_SOURCE_CONTENT_CHARS
    ? `${source.content.slice(0, MAX_SOURCE_CONTENT_CHARS)}... [truncated]`
    : source.content;
  const lines = [
    `<new_source id="${source.sourceItemId}">`,
    `  title: ${source.title}`,
    `  type: ${source.type}`,
    source.occurredAt ? `  occurred_at: ${source.occurredAt}` : null,
    source.participants && source.participants.length > 0
      ? `  participants: ${source.participants.slice(0, 12).join(", ")}`
      : null,
    `  content: |`,
    truncated.split("\n").map((line) => `    ${line}`).join("\n"),
    `</new_source>`,
  ].filter(Boolean);
  return lines.join("\n");
}

function buildPrompt(input: { source: SourceContext; loops: CandidateLoop[] }): string {
  const loopsBlock = input.loops.map(formatLoop).join("\n");
  return `${formatSource(input.source)}\n\n<candidate_loops>\n${loopsBlock}\n</candidate_loops>\n\nFor each candidate loop, decide: closed, advanced, contradicts, or no_match. Return decisions in the same order, one per loop.`;
}

export async function detectOutcomes(input: {
  ai: AiClient;
  source: SourceContext;
  loops: CandidateLoop[];
}): Promise<OutcomeDetectionResult> {
  if (input.loops.length === 0) return { decisions: [] };

  if (!input.ai.available) {
    return {
      decisions: input.loops.map((loop) => ({
        loopId: loop.id,
        decision: "no_match" as const,
        confidence: 0,
        evidenceQuote: null,
        reason: "No AI available; outcome detection skipped.",
      })),
    };
  }

  const result = await input.ai.completeStructured({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input),
    schema: outcomeDetectionResultSchema,
    schemaName: "outcome_detection",
    schemaDescription: "Per-loop decision: closed | advanced | contradicts | no_match.",
    maxTokens: 2500,
    temperature: 0,
  });

  // Defensive: drop any decision whose loopId we didn't actually pass in.
  const validIds = new Set(input.loops.map((l) => l.id));
  const decisions = result.data.decisions.filter((d) => validIds.has(d.loopId));

  // If the model returned fewer decisions than expected, fill in no_match
  // for the missing loops so the caller always knows what happened.
  const seen = new Set(decisions.map((d) => d.loopId));
  for (const loop of input.loops) {
    if (!seen.has(loop.id)) {
      decisions.push({
        loopId: loop.id,
        decision: "no_match",
        confidence: 0,
        evidenceQuote: null,
        reason: "Loop omitted by model output; defaulted to no_match.",
      });
    }
  }

  return { decisions };
}
