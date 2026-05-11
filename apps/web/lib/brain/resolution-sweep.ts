/**
 * Resolution Sweep — runs after all sources are ingested during onboarding.
 *
 * For each open loop that hasn't been resolved:
 *   1. Re-run Calendar Gate against current calendar data
 *   2. Re-run Outcome Detector against FULL source corpus using embedding
 *      similarity (D2: embed-first loop→sources)
 *   3. If resolved → auto-close with evidence
 *   4. If still open → genuinely no evidence exists
 *
 * Per D5: per-loop checkpoint via resolution_sweep_run_at so crashes
 * can resume from last success.
 *
 * Critical gap #1: embedding rate limit retry with exponential backoff.
 */

import type { AiClient, ExtractedOpenLoop, OpenLoop, SourceItem } from "@arvya/core";
import { detectOutcomes, type CandidateLoop, type SourceContext } from "@arvya/agents/outcome-detector-agent";
import { getDb } from "@/lib/db/client";
import { loopOutcomeLog, sourceEmbeddings, openLoops as openLoopsTable } from "@/lib/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import type { BrainRepository } from "@/lib/db/repository";
import { calendarGate, type ValidationContext } from "./validation-pipeline";

const HIGH_CONFIDENCE = 0.85;
const EMBEDDING_TOP_K = 10;
const MAX_RETRIES = 3;

export type SweepProgress = {
  total: number;
  processed: number;
  resolved: number;
  failed: number;
};

export type SweepResult = {
  loopsChecked: number;
  loopsResolved: number;
  loopsFailed: number;
  errors: string[];
};

async function embedWithRetry(
  ai: AiClient,
  text: string[],
  retries = MAX_RETRIES,
): Promise<number[][] | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await ai.embed(text);
    } catch (error) {
      const isRateLimit =
        error instanceof Error &&
        (error.message.includes("429") || error.message.includes("rate"));
      if (!isRateLimit || attempt === retries - 1) {
        console.error(`[resolution-sweep] embed failed after ${attempt + 1} attempts:`, error);
        return null;
      }
      const backoffMs = Math.min(1000 * 2 ** attempt, 30_000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  return null;
}

async function findSimilarSources(
  brainId: string,
  loopEmbedding: number[],
  limit: number,
): Promise<string[]> {
  const db = getDb();
  const result = await db
    .select({ sourceItemId: sourceEmbeddings.sourceItemId })
    .from(sourceEmbeddings)
    .where(eq(sourceEmbeddings.brainId, brainId))
    .orderBy(sql`${sourceEmbeddings.embedding} <=> ${JSON.stringify(loopEmbedding)}::vector`)
    .limit(limit);
  return [...new Set(result.map((r) => r.sourceItemId))];
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

export async function runResolutionSweep(input: {
  brainId: string;
  ai: AiClient;
  repository: BrainRepository;
  onProgress?: (progress: SweepProgress) => void;
}): Promise<SweepResult> {
  const { brainId, ai, repository } = input;

  const allLoops = await repository.listOpenLoops(brainId);
  const activeStatuses = new Set(["open", "in_progress", "needs_review", "waiting"]);
  const activeLoops = allLoops.filter((l) => activeStatuses.has(l.status));

  const alreadySwept = activeLoops.filter((l) => {
    const props = (l.properties ?? {}) as Record<string, unknown>;
    return typeof props.resolution_sweep_run_at === "string";
  });
  const toSweep = activeLoops.filter((l) => {
    const props = (l.properties ?? {}) as Record<string, unknown>;
    return typeof props.resolution_sweep_run_at !== "string";
  });

  const result: SweepResult = {
    loopsChecked: 0,
    loopsResolved: 0,
    loopsFailed: 0,
    errors: [],
  };

  const progress: SweepProgress = {
    total: toSweep.length,
    processed: 0,
    resolved: 0,
    failed: 0,
  };

  for (const loop of toSweep) {
    try {
      let resolved = false;

      // Step 1: Re-run calendar gate
      const calResult = await calendarGate.run(
        { title: loop.title, description: loop.description, loopType: loop.loopType, owner: loop.owner ?? undefined, sourceQuote: loop.sourceQuote ?? undefined, status: loop.status, priority: loop.priority, confidence: 0.8, requiresHumanApproval: false } as ExtractedOpenLoop,
        { brainId, source: { id: loop.sourceItemId ?? "", createdAt: loop.createdAt } as SourceItem, repository },
      );
      if (!calResult.pass) {
        await repository.updateOpenLoop(loop.id, {
          status: "closed",
          outcome: `Auto-resolved by sweep: ${calResult.reason}`,
          closedAt: new Date().toISOString(),
          properties: {
            ...(loop.properties ?? {}),
            closedBy: "resolution_sweep",
            closedByGate: "calendar",
            resolution_sweep_run_at: new Date().toISOString(),
          },
        });
        resolved = true;
        result.loopsResolved++;
        progress.resolved++;
      }

      // Step 2: Embedding-based outcome detection
      if (!resolved && ai.available) {
        const loopText = `${loop.title} ${loop.description ?? ""} ${loop.sourceQuote ?? ""}`;
        const embeddings = await embedWithRetry(ai, [loopText]);

        if (embeddings?.[0]) {
          const similarSourceIds = await findSimilarSources(brainId, embeddings[0], EMBEDDING_TOP_K);

          if (similarSourceIds.length > 0) {
            const sources = await repository.getSourceItemsByIds(similarSourceIds);
            const sourcesSorted = sources
              .filter((s) => s.id !== loop.sourceItemId)
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

            for (const source of sourcesSorted.slice(0, 5)) {
              const sourceContext: SourceContext = {
                sourceItemId: source.id,
                title: source.title,
                type: source.type,
                occurredAt: ((source.metadata as Record<string, unknown>)?.occurred_at as string) ?? source.createdAt,
                participants: [],
                content: source.content.slice(0, 8000),
              };

              try {
                const detection = await detectOutcomes({
                  ai,
                  source: sourceContext,
                  loops: [buildCandidateLoop(loop)],
                });

                for (const decision of detection.decisions) {
                  if (decision.decision === "closed" && decision.confidence >= HIGH_CONFIDENCE) {
                    const outcomeText = decision.evidenceQuote
                      ? `Resolved by sweep. Evidence: "${decision.evidenceQuote}"`
                      : `Resolved by sweep. ${decision.reason}`;

                    await repository.updateOpenLoop(loop.id, {
                      status: "closed",
                      outcome: outcomeText,
                      closedAt: new Date().toISOString(),
                      properties: {
                        ...(loop.properties ?? {}),
                        closedBy: "resolution_sweep",
                        closedFromSourceId: source.id,
                        closedConfidence: decision.confidence,
                        resolution_sweep_run_at: new Date().toISOString(),
                      },
                    });

                    await repository.createMemoryObjects([{
                      brainId,
                      sourceItemId: source.id,
                      objectType: "outcome",
                      name: `Outcome: ${loop.title}`.slice(0, 120),
                      description: outcomeText.slice(0, 800),
                      sourceQuote: decision.evidenceQuote ?? undefined,
                      confidence: decision.confidence,
                      properties: {
                        memory_source: "open_loop_outcome",
                        open_loop_id: loop.id,
                        detected_by: "resolution_sweep",
                      },
                    }]);

                    const db = getDb();
                    await db.insert(loopOutcomeLog).values({
                      brainId,
                      loopId: loop.id,
                      sourceItemId: source.id,
                      decision: "closed",
                      confidence: decision.confidence.toFixed(2),
                      evidenceQuote: decision.evidenceQuote,
                      properties: {
                        reason: decision.reason,
                        applied: true,
                        modelDecision: "closed",
                        detectedBy: "resolution_sweep",
                      },
                    });

                    resolved = true;
                    result.loopsResolved++;
                    progress.resolved++;
                    break;
                  }
                }
              } catch (error) {
                console.error(`[resolution-sweep] outcome detection failed for loop ${loop.id} / source ${source.id}:`, error);
              }

              if (resolved) break;
            }
          }
        }
      }

      // Checkpoint: mark this loop as swept even if not resolved
      if (!resolved) {
        await repository.updateOpenLoop(loop.id, {
          properties: {
            ...(loop.properties ?? {}),
            resolution_sweep_run_at: new Date().toISOString(),
          },
        });
      }

      result.loopsChecked++;
      progress.processed++;
    } catch (error) {
      result.loopsFailed++;
      progress.failed++;
      const msg = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`Loop ${loop.id}: ${msg}`);
      console.error(`[resolution-sweep] loop ${loop.id} failed:`, error);

      // Still checkpoint on failure so we don't retry forever
      try {
        await repository.updateOpenLoop(loop.id, {
          properties: {
            ...(loop.properties ?? {}),
            resolution_sweep_run_at: new Date().toISOString(),
            resolution_sweep_error: msg,
          },
        });
      } catch { /* checkpoint write failed — will retry on next run */ }
    }

    input.onProgress?.(progress);
  }

  return result;
}
