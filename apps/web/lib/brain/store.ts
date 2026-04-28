import { answerFromContext, buildDailyBrief, buildDriftReview, draftFollowUps } from "@arvya/agents";
import type {
  BrainKind,
  BrainSnapshot,
  CreatePriorityInput,
  DriftReview,
  MemoryObjectStatus,
  MemoryObjectType,
  OpenLoop,
  OpenLoopPriority,
  OpenLoopStatus,
  Priority,
  PriorityStatus,
  SourceType,
} from "@arvya/core";
import { getAiClient } from "@/lib/ai";
import { companyDriftReportContent, createCompanyDriftReview } from "@/lib/brain/company-drift";
import { getRepository, type BrainRepository } from "@/lib/db/repository";
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
      repository.listSourceItems(selectedBrain.id, { limit: 100 }),
      repository.listMemoryObjects(selectedBrain.id, { limit: 100 }),
      repository.listRelationships(selectedBrain.id, { limit: 100 }),
      repository.listOpenLoops(selectedBrain.id, { limit: 100 }),
      repository.listWorkflows(selectedBrain.id, 50),
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

    const sourceItemIds = [
      ...new Set(
        retrieved.flatMap((item) => {
          const sourceItemId = item.sourceItem?.id ?? item.memoryObject?.sourceItemId ?? item.openLoop?.sourceItemId;
          return sourceItemId ? [sourceItemId] : [];
        }),
      ),
    ];
    const sourceItems = (
      await Promise.all(sourceItemIds.map((sourceItemId) => repository.getSourceItem(sourceItemId)))
    ).filter((source) => source !== null);

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
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [memoryObjects, sourceItems, openLoops, activePriorities, recentRuns] = await Promise.all([
      repository.listMemoryObjects(brainId),
      repository.listSourceItems(brainId),
      repository.listOpenLoops(brainId),
      repository.listPriorities(brainId, { status: "active" }),
      repository.listAgentRuns(brainId, 100),
    ]);
    const recentAgentRunsLast24h = recentRuns.filter((agentRun) => agentRun.startedAt >= oneDayAgo).length;

    const brief = await buildDailyBrief({
      brain,
      memoryObjects,
      openLoops,
      sourceItems,
      activePriorities,
      recentAgentRunsLast24h,
      now,
      ai,
    });

    await repository.updateAgentRun(run.id, {
      status: "succeeded",
      outputSummary: brief.headline,
      rawOutput: {
        headline: brief.headline,
        openLoopCount: brief.openLoops.length,
        loopsToReviewCount: brief.loopsToReview.length,
        structured: brief.structured ?? null,
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

export async function listBrainPriorities(
  brainId: string,
  opts?: { status?: PriorityStatus | PriorityStatus[]; limit?: number },
): Promise<Priority[]> {
  return getRepository().listPriorities(brainId, opts);
}

export async function createBrainPriority(
  brainId: string,
  input: CreatePriorityInput,
): Promise<Priority> {
  const repository = getRepository();
  const brain = await repository.getBrain(brainId);
  if (!brain) throw new BrainNotFoundError(brainId);
  return repository.createPriority({
    brainId,
    statement: input.statement,
    setBy: input.setBy,
    horizon: input.horizon,
    status: input.status,
    setAt: input.setAt,
    sourceRefs: input.sourceRefs,
  });
}

export async function updateBrainPriorityStatus(
  brainId: string,
  priorityId: string,
  status: PriorityStatus,
): Promise<Priority> {
  const repository = getRepository();
  const updated = await repository.updatePriorityStatus(priorityId, { status });
  if (!updated || updated.brainId !== brainId) {
    throw new Error(`Priority not found: ${priorityId}`);
  }
  return updated;
}

export type DriftReviewResult = {
  review: DriftReview;
  agentRunId: string;
};

export async function generateDriftReview(brainId: string): Promise<DriftReviewResult> {
  const repository = getRepository();
  const ai = getAiClient();
  const brain = await repository.getBrain(brainId);
  if (!brain) throw new BrainNotFoundError(brainId);

  const run = await repository.createAgentRun({
    brainId,
    name: "drift_review",
    stepName: "drift_review",
    modelProvider: ai.preferredProvider,
    inputSummary: `Drift review for ${brain.name}`,
  });

  try {
    const now = new Date();
    const [activePriorities, memoryObjects, openLoops, sourceItems] = await Promise.all([
      repository.listPriorities(brainId, { status: "active" }),
      repository.listMemoryObjects(brainId),
      repository.listOpenLoops(brainId),
      repository.listSourceItems(brainId),
    ]);

    const review = await buildDriftReview({
      brain,
      activePriorities,
      memoryObjects,
      openLoops,
      sourceItems,
      now,
      ai,
    });

    const summary = `${review.overall_alignment} • ${review.signals.length} signal${review.signals.length === 1 ? "" : "s"}`;

    await repository.updateAgentRun(run.id, {
      status: "succeeded",
      outputSummary: summary,
      rawOutput: { review },
      modelProvider: ai.preferredProvider,
    });

    return { review, agentRunId: run.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown drift review error";
    await repository.updateAgentRun(run.id, {
      status: "failed",
      outputSummary: message,
      error: message,
      rawOutput: { error: message },
    });
    throw error;
  }
}

export async function getLatestDriftReview(brainId: string): Promise<DriftReviewResult | null> {
  const repository = getRepository();
  const runs = await repository.listAgentRuns(brainId, 50);
  const latest = runs.find(
    (run) => run.name === "drift_review" && run.status === "succeeded" && run.rawOutput,
  );
  if (!latest) return null;
  const raw = (latest.rawOutput ?? {}) as { review?: DriftReview };
  if (!raw.review) return null;
  return { review: raw.review, agentRunId: latest.id };
}

export async function generateCompanyDriftReview(brainId: string) {
  const repository = getRepository();
  const brain = await repository.getBrain(brainId);
  if (!brain) throw new Error(`Brain not found: ${brainId}`);

  const run = await repository.createAgentRun({
    brainId,
    name: "company_drift_review",
    stepName: "company_drift_review",
    modelProvider: "local",
    inputSummary: `Company drift review for ${brain.name}`,
  });

  try {
    const [memoryObjects, openLoops, sourceItems, existingAlerts] = await Promise.all([
      repository.listMemoryObjects(brainId),
      repository.listOpenLoops(brainId),
      repository.listSourceItems(brainId),
      repository.listBrainAlerts({ brainId, limit: 500 }),
    ]);
    const review = createCompanyDriftReview({ memoryObjects, openLoops, sourceItems });

    const existingAlertKeys = new Set(
      existingAlerts
        .filter((alert) => alert.status !== "dismissed")
        .map((alert) => `${alert.alertType}:${alert.title}`),
    );
    let alertsCreated = 0;
    for (const finding of review.findings) {
      const key = `${finding.alertType}:${finding.title}`;
      if (existingAlertKeys.has(key)) continue;
      await repository.createBrainAlert({
        brainId,
        alertType: finding.alertType,
        title: finding.title,
        description: `${finding.description}\n\nNext action: ${finding.suggestedAction}`,
        severity: finding.severity,
        sourceId: finding.sourceItemIds?.[0] ?? null,
        openLoopId: finding.openLoopIds?.[0] ?? null,
      });
      existingAlertKeys.add(key);
      alertsCreated += 1;
    }

    const source = await repository.createSourceItem({
      brainId,
      title: `Company Drift Review - ${new Date(review.generatedAt).toISOString()}`,
      type: "strategy_output",
      content: companyDriftReportContent({ brainName: brain.name, review }),
      metadata: {
        domain_type: "company_drift_review",
        report_date: review.generatedAt.slice(0, 10),
        generated_at: review.generatedAt,
        findings_count: review.findings.length,
        alerts_created: alertsCreated,
        structured_review: review,
      },
    });

    await repository.updateAgentRun(run.id, {
      status: "succeeded",
      outputSummary: review.summary,
      rawOutput: {
        sourceItemId: source.id,
        findingsCount: review.findings.length,
        alertsCreated,
        metrics: review.metrics,
      },
    });

    return { review, source, alertsCreated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown company drift review error";
    await repository.updateAgentRun(run.id, {
      status: "failed",
      outputSummary: message,
      error: message,
      rawOutput: { error: message },
    });
    throw error;
  }
}

const terminalOpenLoopStatuses = new Set<OpenLoopStatus>(["done", "dismissed", "closed"]);

function isTerminalOpenLoopWithOutcome(loop: OpenLoop) {
  return terminalOpenLoopStatuses.has(loop.status) && Boolean(loop.outcome?.trim());
}

async function promoteOpenLoopOutcomeToMemory(
  repository: BrainRepository,
  loop: OpenLoop,
  evidenceSourceItemIds: string[] = [],
) {
  if (!isTerminalOpenLoopWithOutcome(loop)) return;

  const existingOutcomeMemory = (await repository.listMemoryObjects(loop.brainId)).find(
    (memory) =>
      memory.properties?.memory_source === "open_loop_outcome" &&
      memory.properties?.openLoopId === loop.id,
  );
  if (existingOutcomeMemory) return;

  await repository.createMemoryObjects([
    {
      brainId: loop.brainId,
      sourceItemId: loop.sourceItemId,
      objectType: "outcome",
      name: `Outcome: ${loop.title}`.slice(0, 160),
      description: [
        `Outcome recorded for open loop "${loop.title}": ${loop.outcome?.trim()}`,
        loop.sourceQuote ? `Original evidence: ${loop.sourceQuote}` : undefined,
      ].filter(Boolean).join("\n"),
      sourceQuote: loop.outcome?.trim(),
      confidence: loop.confidence ?? 0.85,
      status: loop.status === "done" ? "done" : "closed",
      properties: {
        memory_source: "open_loop_outcome",
        openLoopId: loop.id,
        openLoopTitle: loop.title,
        openLoopType: loop.loopType,
        openLoopStatus: loop.status,
        originalSourceQuote: loop.sourceQuote,
        closedAt: loop.closedAt,
        evidenceSourceItemIds: evidenceSourceItemIds.length > 0 ? evidenceSourceItemIds : undefined,
      },
    },
  ]);
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
  const updated = await repository.updateOpenLoop(openLoopId, {
    status,
    outcome: outcome || undefined,
  });
  if (updated) {
    await promoteOpenLoopOutcomeToMemory(repository, updated);
  }
  return updated;
}

export type CloseOpenLoopInput = {
  result: string;
  evidence_source_ids?: string[];
};

export type CloseOpenLoopResult = {
  loop: OpenLoop;
  outcomeMemoryId?: string;
};

export async function closeOpenLoop(
  brainId: string,
  openLoopId: string,
  outcome: CloseOpenLoopInput,
): Promise<CloseOpenLoopResult> {
  const result = (outcome?.result ?? "").trim();
  if (!result) {
    throw new Error("closeOpenLoop requires a non-empty result string");
  }

  const repository = getRepository();
  const openLoops = await repository.listOpenLoops(brainId);
  const loop = openLoops.find((item) => item.id === openLoopId);
  if (!loop) {
    throw new Error(`Open loop not found: ${openLoopId}`);
  }

  const closedAt = new Date().toISOString();
  const updated = await repository.updateOpenLoop(openLoopId, {
    status: "closed",
    outcome: result,
    closedAt,
  });
  if (!updated) {
    throw new Error(`Failed to close open loop: ${openLoopId}`);
  }

  const evidenceIds = (outcome.evidence_source_ids ?? []).filter(
    (id): id is string => Boolean(id && typeof id === "string"),
  );

  await promoteOpenLoopOutcomeToMemory(repository, updated, evidenceIds);

  const memoryObjects = await repository.listMemoryObjects(brainId);
  const outcomeMemory = memoryObjects.find(
    (memory) =>
      memory.properties?.memory_source === "open_loop_outcome" &&
      memory.properties?.openLoopId === openLoopId,
  );

  const run = await repository.createAgentRun({
    brainId,
    sourceItemId: updated.sourceItemId,
    name: "close_open_loop",
    stepName: "close_open_loop",
    modelProvider: "local",
    inputSummary: `Close open loop ${openLoopId}: ${updated.title}`,
    rawInput: { openLoopId, outcome: result, evidenceSourceItemIds: evidenceIds },
  });
  await repository.updateAgentRun(run.id, {
    status: "succeeded",
    outputSummary: `Outcome captured: ${result}`,
    rawOutput: {
      openLoopId,
      outcomeMemoryId: outcomeMemory?.id,
      outcomeStatus: "closed",
      evidenceSourceItemIds: evidenceIds,
    },
  });

  return {
    loop: updated,
    outcomeMemoryId: outcomeMemory?.id,
  };
}

export async function updateMemoryObjectReview(
  brainId: string,
  memoryObjectId: string,
  update: {
    objectType?: MemoryObjectType;
    name?: string;
    description?: string;
    sourceQuote?: string | null;
    confidence?: number | null;
    status?: MemoryObjectStatus | null;
  },
) {
  const repository = getRepository();
  const memoryObjects = await repository.listMemoryObjects(brainId);
  const memory = memoryObjects.find((item) => item.id === memoryObjectId);
  if (!memory) {
    throw new Error(`Memory object not found: ${memoryObjectId}`);
  }

  return repository.updateMemoryObject(memoryObjectId, {
    ...update,
    properties: {
      ...(memory.properties ?? {}),
      manuallyEdited: true,
      lastEditedAt: new Date().toISOString(),
    },
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
  const updated = await repository.updateOpenLoop(openLoopId, update);
  if (updated) {
    await promoteOpenLoopOutcomeToMemory(repository, updated);
  }
  return updated;
}

export async function bulkUpdateOpenLoops(
  brainId: string,
  openLoopIds: string[],
  update: {
    owner?: string | null;
    status?: OpenLoopStatus;
    priority?: OpenLoopPriority;
    outcome?: string | null;
    approvedAt?: string | null;
    closedAt?: string | null;
  },
) {
  const repository = getRepository();
  const openLoops = await repository.listOpenLoops(brainId);
  const validIds = new Set(openLoops.map((loop) => loop.id));
  const updatedLoops = await Promise.all(
    openLoopIds
      .filter((id) => validIds.has(id))
      .map((id) => repository.updateOpenLoop(id, update)),
  );

  await Promise.all(
    updatedLoops
      .filter((loop): loop is OpenLoop => Boolean(loop))
      .map((loop) => promoteOpenLoopOutcomeToMemory(repository, loop)),
  );

  return updatedLoops;
}
