// Outcome Detector adapter — orchestrates the closed-loop matcher around
// each newly ingested source.
//
// Flow:
//   1. Fetch active open_loops for the brain.
//   2. Pre-filter: keep only loops whose owner/participants overlap with
//      the new source's participants OR whose original quote shares
//      meaningful terms with the source's title. Cuts the LLM batch from
//      "all 130 active loops" to "the 5-15 plausibly related ones."
//   3. Skip loops that were created AFTER the source occurred (a source
//      from May 5 cannot resolve a loop created May 8 — that's causality).
//   4. Call detectOutcomes() with the filtered batch.
//   5. For each decision:
//      - confidence >= 0.85 + closed   → auto-close, write outcome memory,
//                                        set closed_at + status=closed
//      - confidence 0.5-0.85 + closed  → flag uncertain, write log entry,
//                                        the nudger will surface this for
//                                        human confirmation in week 3.
//      - advanced                       → append properties.lastEvidenceAt,
//                                        append properties.evidence
//      - contradicts                    → status=needs_review (drift) +
//                                        write log
//      - no_match                       → write log only (audit trail)
//   6. Always write a loop_outcome_log row per decision.

import type { AiClient, MemoryObject, OpenLoop, SourceItem } from "@arvya/core";
import {
  detectOutcomes,
  type CandidateLoop,
  type OutcomeDecision,
  type SourceContext,
} from "@arvya/agents/outcome-detector-agent";
import { getDb } from "@/lib/db/client";
import { loopOutcomeLog } from "@/lib/db/schema";
import type { BrainRepository } from "@/lib/db/repository";

const HIGH_CONFIDENCE_AUTO_CLOSE = 0.85;
const MIN_CONFIDENCE_FOR_LOG = 0;
const MAX_CANDIDATE_LOOPS = 15; // safety cap on prompt size
const CONTENT_TOKENS_FOR_OVERLAP = 6; // top-N rare title words used for matching

const ACTIVE_STATUSES = new Set<OpenLoop["status"]>([
  "open",
  "in_progress",
  "needs_review",
  "waiting",
]);

function isActiveLoop(loop: OpenLoop): boolean {
  return ACTIVE_STATUSES.has(loop.status);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9@. ]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokensFromTitle(title: string): Set<string> {
  // Rough "important words" — drop very short stop words.
  const STOP = new Set([
    "the","and","for","with","this","that","from","into","over",
    "your","you","but","not","are","was","will","have","has","had",
    "any","all","can","could","would","should","next","new","yes","no",
    "to","of","in","on","at","is","it","be","by","or","an","a",
    "re","fwd","subject","about",
  ]);
  return new Set(
    normalize(title)
      .split(" ")
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

function readParticipantNames(input: { source: SourceItem; loop?: OpenLoop }): Set<string> {
  const out = new Set<string>();
  const metadata = (input.source.metadata ?? {}) as Record<string, unknown>;
  const participants = metadata.participants;
  if (Array.isArray(participants)) {
    for (const p of participants) {
      if (!p || typeof p !== "object") continue;
      const obj = p as Record<string, unknown>;
      if (typeof obj.email === "string") out.add(obj.email.toLowerCase());
      if (typeof obj.name === "string") out.add(normalize(obj.name));
    }
  }
  // Also fall back to From/To strings if metadata.participants isn't there.
  for (const key of ["from", "to"] as const) {
    const raw = metadata[key];
    if (typeof raw === "string") {
      for (const piece of raw.split(/[,<>]/)) {
        const cleaned = normalize(piece);
        if (cleaned) out.add(cleaned);
      }
    }
  }
  return out;
}

function loopHasOverlap(input: {
  loop: OpenLoop;
  sourceParticipants: Set<string>;
  sourceTitleTokens: Set<string>;
  sourceContent: string;
}): boolean {
  const owner = input.loop.owner ? normalize(input.loop.owner) : "";
  if (owner && input.sourceParticipants.has(owner)) return true;

  // Token overlap on titles is a cheap heuristic for content relevance.
  const loopTokens = tokensFromTitle(input.loop.title);
  for (const t of loopTokens) {
    if (input.sourceTitleTokens.has(t)) return true;
    if (t.length >= 5 && input.sourceContent.toLowerCase().includes(t)) return true;
  }

  // For loops with no owner and no token match, fall back to checking the
  // loop's own source quote for any participant — this handles "send Sumit
  // the deck" loops where the title doesn't include Sumit's email.
  if (input.loop.sourceQuote) {
    const lowered = input.loop.sourceQuote.toLowerCase();
    for (const participant of input.sourceParticipants) {
      if (participant.length >= 4 && lowered.includes(participant)) return true;
    }
  }

  return false;
}

function buildCandidateLoop(loop: OpenLoop): CandidateLoop {
  const properties = (loop.properties ?? {}) as Record<string, unknown>;
  const participantsRaw = properties.participants;
  const participants = Array.isArray(participantsRaw)
    ? participantsRaw.filter((p): p is string => typeof p === "string")
    : [];
  const createdAt = new Date(loop.createdAt).getTime();
  const daysOpen = Math.max(0, Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000)));
  return {
    id: loop.id,
    title: loop.title,
    description: loop.description,
    loopType: loop.loopType,
    owner: loop.owner ?? null,
    dueDate: loop.dueDate ?? null,
    daysOpen,
    sourceQuote: loop.sourceQuote ?? null,
    participants,
  };
}

function readSourceOccurredAt(source: SourceItem): Date {
  const metadata = (source.metadata ?? {}) as Record<string, unknown>;
  const occurredAt = metadata.occurred_at;
  if (typeof occurredAt === "string") {
    const ms = Date.parse(occurredAt);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  return new Date(source.createdAt);
}

function loopPredatesSource(loop: OpenLoop, sourceTime: Date): boolean {
  const loopCreated = new Date(loop.createdAt).getTime();
  return loopCreated > sourceTime.getTime() + 60_000; // small tolerance
}

async function logDecision(input: {
  brainId: string;
  loopId: string;
  sourceItemId: string | null;
  decision: OutcomeDecision;
  agentRunId: string | null;
  applied: boolean;
}) {
  const db = getDb();
  await db.insert(loopOutcomeLog).values({
    brainId: input.brainId,
    loopId: input.loopId,
    sourceItemId: input.sourceItemId,
    decision: input.decision.decision === "no_match"
      ? "no_match"
      : input.decision.decision === "advanced"
        ? "advanced"
        : input.decision.decision === "contradicts"
          ? "contradicts"
          : input.decision.confidence >= HIGH_CONFIDENCE_AUTO_CLOSE
            ? "closed"
            : "uncertain",
    confidence: input.decision.confidence.toFixed(2),
    evidenceQuote: input.decision.evidenceQuote,
    agentRunId: input.agentRunId,
    properties: {
      reason: input.decision.reason,
      applied: input.applied,
      modelDecision: input.decision.decision,
    },
  });
}

export async function runOutcomeDetectionForSource(input: {
  ai: AiClient;
  repository: BrainRepository;
  brainId: string;
  source: SourceItem;
  newMemoryObjects: MemoryObject[];
  agentRunId?: string | null;
}): Promise<{
  decisionsLogged: number;
  loopsClosed: number;
  loopsUncertain: number;
  loopsAdvanced: number;
}> {
  if (!input.ai.available) {
    return { decisionsLogged: 0, loopsClosed: 0, loopsUncertain: 0, loopsAdvanced: 0 };
  }

  const allLoops = await input.repository.listOpenLoops(input.brainId);
  const activeLoops = allLoops.filter(isActiveLoop);
  if (activeLoops.length === 0) {
    return { decisionsLogged: 0, loopsClosed: 0, loopsUncertain: 0, loopsAdvanced: 0 };
  }

  const sourceTime = readSourceOccurredAt(input.source);
  const sourceParticipants = readParticipantNames({ source: input.source });
  const sourceTitleTokens = tokensFromTitle(input.source.title);
  const sourceContentLower = input.source.content.toLowerCase();

  // Skip loops created after the source occurred, plus pre-filter for
  // overlap. Loop without overlap and without an owner shared with the
  // source rarely match — skip the LLM call for them.
  const candidates = activeLoops
    // A loop can't resolve itself: skip loops that were created by THIS
    // source. (Common case: email X both creates "Send deck" and is
    // analyzed for closures — we don't want to ask "did X close X?")
    .filter((loop) => loop.sourceItemId !== input.source.id)
    .filter((loop) => !loopPredatesSource(loop, sourceTime))
    .filter((loop) =>
      loopHasOverlap({
        loop,
        sourceParticipants,
        sourceTitleTokens,
        sourceContent: sourceContentLower,
      }),
    )
    .slice(0, MAX_CANDIDATE_LOOPS);

  if (candidates.length === 0) {
    return { decisionsLogged: 0, loopsClosed: 0, loopsUncertain: 0, loopsAdvanced: 0 };
  }

  const sourceContext: SourceContext = {
    sourceItemId: input.source.id,
    title: input.source.title,
    type: input.source.type,
    occurredAt: sourceTime.toISOString(),
    participants: [...sourceParticipants].slice(0, 12),
    content: input.source.content,
  };

  const result = await detectOutcomes({
    ai: input.ai,
    source: sourceContext,
    loops: candidates.map(buildCandidateLoop),
  });

  let decisionsLogged = 0;
  let loopsClosed = 0;
  let loopsUncertain = 0;
  let loopsAdvanced = 0;

  for (const decision of result.decisions) {
    const loop = candidates.find((l) => l.id === decision.loopId);
    if (!loop) continue;

    let applied = false;

    if (decision.decision === "closed") {
      if (decision.confidence >= HIGH_CONFIDENCE_AUTO_CLOSE) {
        // Auto-close. Write outcome memory, mark status=closed.
        const outcomeText = decision.evidenceQuote
          ? `Closed automatically by outcome detector. Evidence: "${decision.evidenceQuote}"`
          : `Closed automatically by outcome detector. ${decision.reason}`;
        await input.repository.updateOpenLoop(loop.id, {
          status: "closed",
          outcome: outcomeText,
          closedAt: new Date().toISOString(),
          properties: {
            ...(loop.properties ?? {}),
            closedBy: "outcome_detector",
            closedFromSourceId: input.source.id,
            closedConfidence: decision.confidence,
          },
        });
        await input.repository.createMemoryObjects([
          {
            brainId: input.brainId,
            sourceItemId: input.source.id,
            objectType: "outcome",
            name: `Outcome: ${loop.title}`.slice(0, 120),
            description: outcomeText.slice(0, 800),
            sourceQuote: decision.evidenceQuote ?? undefined,
            confidence: decision.confidence,
            properties: {
              memory_source: "open_loop_outcome",
              open_loop_id: loop.id,
              detected_by: "outcome_detector",
            },
          },
        ]);
        loopsClosed += 1;
        applied = true;
      } else if (decision.confidence >= 0.5) {
        // Uncertain match — flag for human confirmation. The nudger picks
        // these up next week and posts a "is this loop closed?" prompt.
        await input.repository.updateOpenLoop(loop.id, {
          properties: {
            ...(loop.properties ?? {}),
            outcomeUncertainConfidence: decision.confidence,
            outcomeUncertainEvidenceQuote: decision.evidenceQuote ?? null,
            outcomeUncertainSourceId: input.source.id,
            outcomeUncertainAt: new Date().toISOString(),
          },
        });
        loopsUncertain += 1;
        applied = true;
      }
    } else if (decision.decision === "advanced") {
      const evidence = (loop.properties?.evidence as unknown[]) ?? [];
      await input.repository.updateOpenLoop(loop.id, {
        properties: {
          ...(loop.properties ?? {}),
          lastEvidenceAt: new Date().toISOString(),
          lastEvidenceSourceId: input.source.id,
          evidence: [
            ...evidence,
            {
              sourceItemId: input.source.id,
              quote: decision.evidenceQuote,
              confidence: decision.confidence,
              capturedAt: new Date().toISOString(),
            },
          ].slice(-10),
        },
      });
      loopsAdvanced += 1;
      applied = true;
    } else if (decision.decision === "contradicts") {
      await input.repository.updateOpenLoop(loop.id, {
        status: "needs_review",
        properties: {
          ...(loop.properties ?? {}),
          contradictionFromSourceId: input.source.id,
          contradictionConfidence: decision.confidence,
          contradictionEvidenceQuote: decision.evidenceQuote ?? null,
          contradictionAt: new Date().toISOString(),
        },
      });
      applied = true;
    }

    if (decision.confidence >= MIN_CONFIDENCE_FOR_LOG || applied) {
      await logDecision({
        brainId: input.brainId,
        loopId: loop.id,
        sourceItemId: input.source.id,
        decision,
        agentRunId: input.agentRunId ?? null,
        applied,
      });
      decisionsLogged += 1;
    }
  }

  return { decisionsLogged, loopsClosed, loopsUncertain, loopsAdvanced };
}
