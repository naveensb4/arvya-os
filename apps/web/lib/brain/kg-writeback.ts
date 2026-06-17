/**
 * Knowledge Graph Write-back — on any loop resolution, update
 * memory_objects.properties JSONB with outcome evidence so the
 * ask/answer layer can query outcomes.
 *
 * Uses existing properties JSONB field on memory_objects (no migration).
 * Sets properties.outcome = { status, evidence_source_id, resolved_at }.
 */

import type { OpenLoop, MemoryObject } from "@arvya/core";
import type { BrainRepository } from "@/lib/db/repository";

export type OutcomeWriteback = {
  status: string;
  evidence_source_id: string | null;
  resolved_at: string;
  resolved_by: string;
  loop_title: string;
  loop_type: string;
};

export async function writeOutcomeToKG(input: {
  repository: BrainRepository;
  brainId: string;
  loop: OpenLoop;
  evidenceSourceId?: string | null;
  resolvedBy: string;
}): Promise<void> {
  const { repository, brainId, loop, evidenceSourceId, resolvedBy } = input;

  const memoryObjects = await repository.listMemoryObjects(brainId);
  const outcomeMemory = memoryObjects.find(
    (m) =>
      (m.properties as Record<string, unknown>)?.memory_source === "open_loop_outcome" &&
      (m.properties as Record<string, unknown>)?.open_loop_id === loop.id,
  );

  const outcome: OutcomeWriteback = {
    status: loop.status,
    evidence_source_id: evidenceSourceId ?? null,
    resolved_at: loop.closedAt ?? new Date().toISOString(),
    resolved_by: resolvedBy,
    loop_title: loop.title,
    loop_type: loop.loopType,
  };

  if (outcomeMemory) {
    await repository.updateMemoryObject(outcomeMemory.id, {
      properties: {
        ...(outcomeMemory.properties ?? {}),
        outcome,
      },
    });
  } else if (loop.sourceItemId) {
    await repository.createMemoryObjects([{
      brainId,
      sourceItemId: loop.sourceItemId,
      objectType: "outcome",
      name: `Outcome: ${loop.title}`.slice(0, 120),
      description: `Loop "${loop.title}" resolved (${resolvedBy}): ${loop.outcome ?? loop.status}`.slice(0, 800),
      confidence: 0.85,
      properties: {
        memory_source: "open_loop_outcome",
        open_loop_id: loop.id,
        detected_by: resolvedBy,
        outcome,
      },
    }]);
  }
}
