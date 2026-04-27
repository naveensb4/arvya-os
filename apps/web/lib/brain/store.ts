import { answerFromContext, buildDailyBrief, draftFollowUps } from "@arvya/agents";
import type { BrainKind, BrainSnapshot, OpenLoopPriority, OpenLoopStatus, SourceType } from "@arvya/core";
import { getAiClient } from "@/lib/ai";
import { getRepository } from "@/lib/db/repository";
import { retrieveRelevantContext } from "@/lib/retrieval";
import { ingestSourceIntoBrain } from "@/lib/workflows/source-ingestion";

export class BrainNotFoundError extends Error {
  constructor(brainId: string) {
    super(`Brain not found: ${brainId}`);
    this.name = "BrainNotFoundError";
  }
}

export function isBrainNotFoundError(error: unknown): error is BrainNotFoundError {
  return error instanceof BrainNotFoundError;
}

export async function selectedBrainOrDefault(brainId?: string) {
  const repository = getRepository();
  const brains = await repository.listBrains();
  const selectedBrain = brainId ? await repository.getBrain(brainId) : brains[0];

  if (!selectedBrain) {
    if (brainId) throw new BrainNotFoundError(brainId);
    throw new Error("No Brain exists yet.");
  }

  return { repository, brains, selectedBrain };
}

export async function getBrainSnapshot(brainId?: string): Promise<BrainSnapshot> {
  const { repository, brains, selectedBrain } = await selectedBrainOrDefault(brainId);
  const [sourceItems, memoryObjects, relationships, openLoops, workflows, agentRuns] =
    await Promise.all([
      repository.listSourceItems(selectedBrain.id),
      repository.listMemoryObjects(selectedBrain.id),
      repository.listRelationships(selectedBrain.id),
      repository.listOpenLoops(selectedBrain.id),
      repository.listWorkflows(selectedBrain.id),
      repository.listAgentRuns(selectedBrain.id),
    ]);

  return {
    brains,
    selectedBrain,
    sourceItems,
    memoryObjects,
    relationships,
    openLoops: openLoops.filter((loop) => !["closed", "done", "dismissed"].includes(loop.status)),
    workflows,
    agentRuns,
  };
}

export async function createBrain(input: {
  name: string;
  kind: BrainKind;
  thesis: string;
}) {
  return getRepository().createBrain(input);
}

export async function addSourceAndIngest(input: {
  brainId: string;
  title: string;
  type: SourceType;
  content: string;
  externalUri?: string;
}) {
  const result = await ingestSourceIntoBrain({
    ...input,
    externalUri: input.externalUri,
  });
  return result.sourceItem;
}

export async function answerBrainQuestion(brainId: string, question: string) {
  const repository = getRepository();
  const ai = getAiClient();
  const brain = await repository.getBrain(brainId);
  if (!brain) throw new Error(`Brain not found: ${brainId}`);

  const run = await repository.createAgentRun({
    brainId,
    name: "ask_brain",
    stepName: "ask_brain",
    modelProvider: ai.preferredProvider,
    inputSummary: question,
    rawInput: { question },
  });

  try {
    const retrieved = await retrieveRelevantContext({
      brainId,
      question,
      repository,
      ai,
      limit: 16,
    });

    const sourceItemsById = new Map(
      (await repository.listSourceItems(brainId)).map((source) => [source.id, source]),
    );
    const sourceItems = [
      ...new Map(
        retrieved
          .flatMap((item) => {
            if (item.sourceItem) return [item.sourceItem];
            const sourceItemId = item.memoryObject?.sourceItemId ?? item.openLoop?.sourceItemId;
            const source = sourceItemId ? sourceItemsById.get(sourceItemId) : undefined;
            return source ? [source] : [];
          })
          .map((source) => [source.id, source]),
      ).values(),
    ];

    const answer = await answerFromContext({
      brain,
      question,
      memoryObjects: retrieved.flatMap((item) => (item.memoryObject ? [item.memoryObject] : [])),
      openLoops: retrieved.flatMap((item) => (item.openLoop ? [item.openLoop] : [])),
      sourceItems,
      ai,
    });

    await repository.updateAgentRun(run.id, {
      status: "succeeded",
      outputSummary: answer.answer,
      rawOutput: {
        uncertain: answer.uncertain,
        citations: answer.citations,
        retrievedCount: retrieved.length,
      },
      modelProvider: ai.preferredProvider,
    });

    return answer;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ask error";
    await repository.updateAgentRun(run.id, {
      status: "failed",
      outputSummary: message,
      error: message,
      rawOutput: { error: message },
    });
    throw error;
  }
}

export async function generateDailyFounderBrief(brainId: string) {
  const repository = getRepository();
  const ai = getAiClient();
  const brain = await repository.getBrain(brainId);
  if (!brain) throw new Error(`Brain not found: ${brainId}`);

  const run = await repository.createAgentRun({
    brainId,
    name: "daily_brief",
    stepName: "daily_brief",
    modelProvider: ai.preferredProvider,
    inputSummary: `Daily brief for ${brain.name}`,
  });

  try {
    const [memoryObjects, sourceItems, openLoops] = await Promise.all([
      repository.listMemoryObjects(brainId),
      repository.listSourceItems(brainId),
      repository.listOpenLoops(brainId),
    ]);

    const brief = await buildDailyBrief({
      brain,
      memoryObjects,
      openLoops,
      sourceItems,
      ai,
    });

    await repository.updateAgentRun(run.id, {
      status: "succeeded",
      outputSummary: brief.headline,
      rawOutput: {
        headline: brief.headline,
        openLoopCount: brief.openLoops.length,
        loopsToReviewCount: brief.loopsToReview.length,
      },
      modelProvider: ai.preferredProvider,
    });

    return brief;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown daily brief error";
    await repository.updateAgentRun(run.id, {
      status: "failed",
      outputSummary: message,
      error: message,
      rawOutput: { error: message },
    });
    throw error;
  }
}

export async function generateFollowUpDrafts(brainId: string) {
  const repository = getRepository();
  const ai = getAiClient();
  const brain = await repository.getBrain(brainId);
  if (!brain) throw new Error(`Brain not found: ${brainId}`);

  const run = await repository.createAgentRun({
    brainId,
    name: "follow_up_draft",
    stepName: "follow_up_draft",
    modelProvider: ai.preferredProvider,
    inputSummary: `Follow-up drafts for ${brain.name}`,
  });

  try {
    const [openLoops, sourceItems] = await Promise.all([
      repository.listOpenLoops(brainId),
      repository.listSourceItems(brainId),
    ]);
    const drafts = await draftFollowUps({ brain, openLoops, sourceItems, ai });
    await repository.updateAgentRun(run.id, {
      status: "succeeded",
      outputSummary: `Generated ${drafts.length} follow-up draft${drafts.length === 1 ? "" : "s"}.`,
      rawOutput: { drafts },
      modelProvider: ai.preferredProvider,
    });
    return drafts;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown follow-up draft error";
    await repository.updateAgentRun(run.id, {
      status: "failed",
      outputSummary: message,
      error: message,
      rawOutput: { error: message },
    });
    throw error;
  }
}

export async function updateOpenLoopStatus(
  brainId: string,
  openLoopId: string,
  status: OpenLoopStatus,
  outcome?: string,
) {
  const repository = getRepository();
  const openLoops = await repository.listOpenLoops(brainId);
  const loop = openLoops.find((item) => item.id === openLoopId);
  if (!loop) {
    throw new Error(`Open loop not found: ${openLoopId}`);
  }
  return repository.updateOpenLoop(openLoopId, {
    status,
    outcome: outcome || undefined,
  });
}

export async function getOpenLoopReviewSnapshot(brainId?: string) {
  const { repository, brains, selectedBrain } = await selectedBrainOrDefault(brainId);
  const [sourceItems, openLoops] = await Promise.all([
    repository.listSourceItems(selectedBrain.id),
    repository.listOpenLoops(selectedBrain.id),
  ]);

  return { brains, selectedBrain, sourceItems, openLoops };
}

export async function updateOpenLoopReview(
  brainId: string,
  openLoopId: string,
  update: {
    title?: string;
    description?: string;
    owner?: string | null;
    status?: OpenLoopStatus;
    priority?: OpenLoopPriority;
    dueDate?: string | null;
    outcome?: string | null;
    approvedAt?: string | null;
    closedAt?: string | null;
  },
) {
  const repository = getRepository();
  const openLoops = await repository.listOpenLoops(brainId);
  const loop = openLoops.find((item) => item.id === openLoopId);
  if (!loop) {
    throw new Error(`Open loop not found: ${openLoopId}`);
  }
  return repository.updateOpenLoop(openLoopId, update);
}

export async function bulkUpdateOpenLoops(
  brainId: string,
  openLoopIds: string[],
  update: {
    owner?: string | null;
    status?: OpenLoopStatus;
    priority?: OpenLoopPriority;
    approvedAt?: string | null;
    closedAt?: string | null;
  },
) {
  const repository = getRepository();
  const openLoops = await repository.listOpenLoops(brainId);
  const validIds = new Set(openLoops.map((loop) => loop.id));
  return Promise.all(
    openLoopIds
      .filter((id) => validIds.has(id))
      .map((id) => repository.updateOpenLoop(id, update)),
  );
}
