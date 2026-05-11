import { runSourceIngestionWorkflow } from "@arvya/agents/ingestion-agent";
import type { ExtractedMemoryObject, ExtractedOpenLoop, IngestSourceInput, ModelProvider, SourceItem } from "@arvya/core";
import { getAiClient } from "@/lib/ai";
import { mergeMemoryObjectsForIngestion, mergeRelationshipsForIngestion } from "@/lib/brain/memory-quality";
import { runOutcomeDetectionForSource } from "@/lib/brain/outcome-detector";
import { buildOpenLoopValidationPipeline, type ValidationResult, type GateResult } from "@/lib/brain/validation-pipeline";
import { getRepository } from "@/lib/db/repository";
import { buildEmbeddingText } from "@/lib/retrieval";
import type { EmailParticipant } from "@/lib/connectors/email-cleaning";
import {
  buildDedupeKeys,
  buildSourceTraceMetadata,
  hashNormalizedSourceContent,
  mergeSourceTraceMetadata,
  normalizeSourceContent,
  sourceFingerprint,
  sourceMatchesFingerprint,
} from "./source-normalization";

const LIVE_EXTRACTION_MAX_CHARS = 20_000;

function chunkText(content: string, maxLength = 1200): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < content.length; index += maxLength) {
    chunks.push(content.slice(index, index + maxLength));
  }
  return chunks.length ? chunks : [content];
}

function readParticipantsFromMetadata(metadata: Record<string, unknown> | undefined): EmailParticipant[] {
  if (!metadata) return [];
  const raw = metadata.participants;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): EmailParticipant[] => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    const email = typeof e.email === "string" ? e.email : undefined;
    const name = typeof e.name === "string" ? e.name : undefined;
    const rawValue = typeof e.raw === "string" ? e.raw : `${name ?? ""}${email ? ` <${email}>` : ""}`.trim();
    if (!email && !name) return [];
    return [{ email, name, raw: rawValue }];
  });
}

function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Match a person name against the list of email participants. We prefer
// exact name match; if no exact match, fall back to first-name match
// (handles "Naveen" vs "Naveen Siva"). Returns the matching participant
// or undefined.
function findParticipantForPerson(
  personName: string,
  participants: EmailParticipant[],
): EmailParticipant | undefined {
  const tokens = nameTokens(personName);
  if (tokens.length === 0) return undefined;
  // Exact full-name match.
  for (const participant of participants) {
    if (!participant.name) continue;
    const participantTokens = nameTokens(participant.name);
    if (participantTokens.length === 0) continue;
    if (participantTokens.join(" ") === tokens.join(" ")) return participant;
  }
  // First-token match (handles short names extracted by the LLM).
  const firstToken = tokens[0];
  for (const participant of participants) {
    if (!participant.name) continue;
    const participantTokens = nameTokens(participant.name);
    if (participantTokens[0] === firstToken) return participant;
  }
  return undefined;
}

// Fill in properties.email / properties.name on extracted person memories
// when a matching participant is in the source's metadata. The LLM may not
// always grab the email from "From: Naveen <naveen@arvya.ai>" if the
// header is far from the body; this gives us a deterministic fallback.
function enrichPersonsWithParticipants(
  memoryObjects: ExtractedMemoryObject[],
  participants: EmailParticipant[],
): ExtractedMemoryObject[] {
  if (participants.length === 0) return memoryObjects;
  return memoryObjects.map((memory) => {
    if (memory.objectType !== "person") return memory;
    const properties = (memory.properties ?? {}) as Record<string, unknown>;
    if (typeof properties.email === "string" && properties.email) return memory;
    const match = findParticipantForPerson(memory.name, participants);
    if (!match?.email) return memory;
    return {
      ...memory,
      properties: {
        ...properties,
        email: match.email,
        ...(match.name && !properties.name ? { name: match.name } : {}),
      },
    };
  });
}

export async function writeRejectedOutcomes(
  repository: ReturnType<typeof getRepository>,
  brainId: string,
  sourceItemId: string,
  rejected: ValidationResult<ExtractedOpenLoop>[],
): Promise<number> {
  let written = 0;
  for (const r of rejected) {
    const failedGate = r.results.find((g) => !g.pass);
    if (!failedGate?.evidence) continue;

    try {
      await repository.createMemoryObjects([{
        brainId,
        sourceItemId,
        objectType: "outcome",
        name: `Outcome: ${r.item.title}`.slice(0, 120),
        description: `Pre-resolved (${failedGate.gate} gate): ${failedGate.evidence.quote}`.slice(0, 800),
        sourceQuote: r.item.sourceQuote,
        confidence: failedGate.evidence.confidence,
        properties: {
          memory_source: "open_loop_outcome",
          detected_by: failedGate.gate,
          pre_resolved: true,
          evidence_type: failedGate.evidence.type,
          evidence_source_id: failedGate.evidence.sourceId,
        },
      }]);
      written++;
      console.log(`[KG OUTCOME WRITTEN] ${r.item.title} — ${failedGate.gate} gate evidence: ${failedGate.evidence.quote}`);
    } catch (error) {
      console.error(`[writeRejectedOutcome] failed for "${r.item.title}":`, error);
    }
  }
  return written;
}

export type IngestSourceIntoBrainInput = IngestSourceInput & {
  storagePath?: string;
  metadata?: Record<string, unknown>;
};

export async function processSourceItemIntoBrain(input: { brainId: string; sourceItemId: string }) {
  const repository = getRepository();
  const brain = await repository.getBrain(input.brainId);

  if (!brain) {
    throw new Error(`Brain not found: ${input.brainId}`);
  }

  const sourceItem = await repository.getSourceItem(input.sourceItemId);
  if (!sourceItem) {
    throw new Error(`Source item not found: ${input.sourceItemId}`);
  }
  const ai = getAiClient();
  // Emails (gmail/outlook) used to be force-routed through the deterministic
  // regex extractor for token-cost reasons, but the regex pulled greetings
  // ("Hi Sudi"), timezone abbreviations ("PM"), and email reply markers as
  // "people", and turned every sentence with a trigger phrase into an open
  // loop. Now we always go through the LLM when one is configured; the size
  // guard below still kicks in for unusually large source bodies.
  const shouldUseDeterministicExtraction =
    sourceItem.content.length > LIVE_EXTRACTION_MAX_CHARS;
  const extractionAi = shouldUseDeterministicExtraction ? undefined : ai;

  const existingCompletedWorkflow = (await repository.listWorkflows(brain.id)).find(
    (workflow) =>
      workflow.sourceItemId === sourceItem.id &&
      workflow.workflowType === "source_ingestion" &&
      workflow.status === "completed",
  );
  if (existingCompletedWorkflow) {
    const [memoryObjects, openLoops, relationships] = await Promise.all([
      repository.listMemoryObjects(brain.id),
      repository.listOpenLoops(brain.id),
      repository.listRelationships(brain.id),
    ]);
    return {
      sourceItem,
      memoryObjects: memoryObjects.filter((memory) => memory.sourceItemId === sourceItem.id),
      openLoops: openLoops.filter((loop) => loop.sourceItemId === sourceItem.id),
      relationships: relationships.filter((relationship) => relationship.sourceItemId === sourceItem.id),
      summary: "Source item was already ingested.",
    };
  }

  const existingRunningWorkflow = (await repository.listWorkflows(brain.id)).find(
    (workflow) =>
      workflow.sourceItemId === sourceItem.id &&
      workflow.workflowType === "source_ingestion" &&
      workflow.status === "running" &&
      Date.now() - new Date(workflow.createdAt).getTime() < 10 * 60 * 1000,
  );
  if (existingRunningWorkflow) {
    throw new Error(`Source ingestion is already running for source item ${sourceItem.id}`);
  }

  const workflow = await repository.createWorkflow({
    brainId: brain.id,
    sourceItemId: sourceItem.id,
    workflowType: "source_ingestion",
    status: "running",
    state: { node: "classify_source", sourceItemId: sourceItem.id },
  });

  const logStep = async <T>({
    stepName,
    modelProvider,
    inputSummary,
    rawInput,
    call,
  }: {
    stepName: string;
    modelProvider: ModelProvider;
    inputSummary: string;
    rawInput?: Record<string, unknown>;
    call: () => Promise<T>;
  }) => {
    const run = await repository.createAgentRun({
      brainId: brain.id,
      sourceItemId: sourceItem.id,
      workflowId: workflow.id,
      name: "source_ingestion",
      stepName,
      modelProvider,
      inputSummary,
      rawInput,
    });
    try {
      const result = await call();
      await repository.updateAgentRun(run.id, {
        status: "succeeded",
        outputSummary: `${stepName} completed`,
        rawOutput: { ok: true },
        modelProvider,
      });
      await repository.updateWorkflow(workflow.id, {
        status: "running",
        state: { node: stepName, sourceItemId: sourceItem.id },
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown agent error";
      await repository.updateAgentRun(run.id, {
        status: "failed",
        outputSummary: message,
        error: message,
        rawOutput: { error: message },
        modelProvider,
      });
      throw error;
    }
  };

  try {
    const result = await runSourceIngestionWorkflow({
      brain,
      source: sourceItem,
      ai: extractionAi,
      logStep,
    });

    const workflowRun = await repository.createAgentRun({
      brainId: brain.id,
      sourceItemId: sourceItem.id,
      workflowId: workflow.id,
      name: "source_ingestion",
      stepName: "save_results",
      modelProvider: result.classification ? extractionAi?.preferredProvider ?? "local" : "local",
      inputSummary: `${sourceItem.type}: ${sourceItem.title}`,
      rawInput: { sourceItemId: sourceItem.id },
    });

    const participants = readParticipantsFromMetadata(sourceItem.metadata as Record<string, unknown> | undefined);
    const enrichedMemoryObjects = enrichPersonsWithParticipants(result.memoryObjects, participants);

    const memoryObjects = await mergeMemoryObjectsForIngestion({
      repository,
      brainId: brain.id,
      sourceItemId: sourceItem.id,
      memoryObjects: enrichedMemoryObjects,
      // Entity resolver runs only when both AI and a workspace are present.
      // Brains without a workspace fall back to the legacy canonical-key
      // dedup path (no canonical_entities writes).
      ai: ai.available ? ai : undefined,
      workspaceId: brain.workspaceId ?? undefined,
    });

    const relationships = await mergeRelationshipsForIngestion({
      repository,
      brainId: brain.id,
      sourceItemId: sourceItem.id,
      memoryObjects,
      relationships: result.relationships,
    });

    const VALID_LOOP_TYPES = new Set([
      "follow_up", "intro", "product", "investor", "sales", "marketing",
      "engineering", "deal", "diligence", "crm", "scheduling", "task",
      "investor_ask", "customer_ask", "strategic_question", "other",
    ]);

    const pipeline = buildOpenLoopValidationPipeline();
    let sentSources: SourceItem[] | undefined;
    try {
      const allSources = await repository.listSourceItems(brain.id);
      sentSources = allSources.filter((s) => {
        const meta = (s.metadata ?? {}) as Record<string, unknown>;
        return meta.evidence_only === true;
      });
    } catch (error) {
      console.error("[source-ingestion] failed to cache SENT sources:", error);
    }
    const validationContext = { brainId: brain.id, source: sourceItem, repository, sentSources };
    const { passed: validatedLoops, rejected: rejectedLoops } =
      await pipeline.validateBatch(result.openLoops, validationContext);

    if (rejectedLoops.length > 0) {
      console.log(
        `[validation-pipeline] rejected ${rejectedLoops.length} loops for source ${sourceItem.id}:`,
        rejectedLoops.map((r) => `${r.item.title} (${r.rejectedBy}: ${r.results.find((g) => !g.pass)?.reason})`),
      );
      try {
        const outcomesWritten = await writeRejectedOutcomes(repository, brain.id, sourceItem.id, rejectedLoops);
        if (outcomesWritten > 0) {
          console.log(`[source-ingestion] wrote ${outcomesWritten} KG outcomes from gate-rejected loops`);
        }
      } catch (error) {
        console.error("[source-ingestion] writeRejectedOutcomes failed:", error);
      }
    }

    const openLoops = await repository.createOpenLoops(
      validatedLoops.map(({ item: loop }) => ({
        brainId: brain.id,
        sourceItemId: sourceItem.id,
        title: loop.title,
        description: loop.description,
        loopType: VALID_LOOP_TYPES.has(loop.loopType) ? loop.loopType : "other",
        owner: loop.owner,
        status: loop.status,
        priority: loop.priority,
        dueDate: loop.dueDate,
        suggestedAction: loop.suggestedAction,
        suggestedFollowUpEmail: loop.suggestedFollowUpEmail,
        requiresHumanApproval: loop.requiresHumanApproval,
        sourceQuote: loop.sourceQuote,
        confidence: loop.confidence,
        properties: {
          ...(loop.properties ?? {}),
          validationGates: validatedLoops
            .find((v) => v.item === loop)
            ?.results.map((r) => ({ gate: r.gate, reason: r.reason })),
        },
      })),
    );

    // Closed-loop matcher: does this new source resolve any pre-existing
    // open loops? Runs after openLoops are saved (so loops created BY this
    // source can be filtered out), before embedding chunks (so the user
    // sees the closures fast). Failures are non-fatal — if the matcher
    // breaks, ingestion still succeeds and we just don't auto-close.
    let outcomeDetectionSummary: { decisionsLogged: number; loopsClosed: number; loopsUncertain: number; loopsAdvanced: number } = {
      decisionsLogged: 0,
      loopsClosed: 0,
      loopsUncertain: 0,
      loopsAdvanced: 0,
    };
    try {
      if (ai.available) {
        outcomeDetectionSummary = await runOutcomeDetectionForSource({
          ai,
          repository,
          brainId: brain.id,
          source: sourceItem,
          newMemoryObjects: memoryObjects,
          agentRunId: workflowRun.id,
        });
      }
    } catch (error) {
      console.error("[outcome-detector] failed:", error);
    }

    const chunks = chunkText(sourceItem.content);
    let embeddings: number[][] | null = null;
    try {
      embeddings = await ai.embed(chunks);
    } catch (error) {
      console.warn(`[source-ingestion] embed() failed for ${sourceItem.id}, saving chunks without vectors:`, error instanceof Error ? error.message : error);
    }
    await repository.createSourceEmbeddings(
      chunks.map((content, index) => ({
        brainId: brain.id,
        sourceItemId: sourceItem.id,
        chunkIndex: index,
        content,
        embedding: embeddings?.[index] ?? null,
        metadata: { embeddingText: buildEmbeddingText({ title: sourceItem.title, content }) },
      })),
    );

    await repository.updateAgentRun(workflowRun.id, {
      status: "succeeded",
      outputSummary: result.summary,
      rawOutput: {
        sourceItemId: sourceItem.id,
        memoryObjectIds: memoryObjects.map((memory) => memory.id),
        openLoopIds: openLoops.map((loop) => loop.id),
        relationshipIds: relationships.map((relationship) => relationship.id),
        sourceEmbeddingChunks: chunks.length,
        outcomeDetection: outcomeDetectionSummary,
      },
      modelProvider: result.classification ? extractionAi?.preferredProvider ?? "local" : "local",
    });

    await repository.updateWorkflow(workflow.id, {
      status: "completed",
      state: {
        sourceItemId: sourceItem.id,
        memoryObjectIds: memoryObjects.map((memory) => memory.id),
        openLoopIds: openLoops.map((loop) => loop.id),
        relationshipIds: relationships.map((relationship) => relationship.id),
      },
    });

    return { sourceItem, memoryObjects, openLoops, relationships, summary: result.summary };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ingestion error";
    await repository.updateWorkflow(workflow.id, {
      status: "failed",
      error: message,
      state: { sourceItemId: sourceItem.id, error: message },
    });
    throw error;
  }
}

export async function ingestSourceIntoBrain(input: IngestSourceIntoBrainInput) {
  const repository = getRepository();
  const normalizedContent = normalizeSourceContent(input.content);
  const traceMetadata = buildSourceTraceMetadata({
    sourceKind: input.type,
    sourceSystem: String(input.metadata?.source_system ?? "manual_ingest"),
    connectorType: typeof input.metadata?.connector_type === "string" ? input.metadata.connector_type : undefined,
    connectorConfigId: typeof input.metadata?.connector_config_id === "string" ? input.metadata.connector_config_id : undefined,
    externalId: typeof input.metadata?.external_id === "string" ? input.metadata.external_id : undefined,
    externalUri: input.externalUri,
    originalTitle: input.title,
    occurredAt: typeof input.metadata?.occurred_at === "string" ? input.metadata.occurred_at : undefined,
  });
  const metadata = mergeSourceTraceMetadata(traceMetadata, input.metadata as Record<string, unknown> | undefined);
  const fingerprint = sourceFingerprint({ ...input, content: normalizedContent, metadata });
  const existingSources = await repository.listSourceItems(input.brainId);
  const duplicateSource = existingSources.find((source) => sourceMatchesFingerprint(source, fingerprint));

  if (duplicateSource) {
    return processSourceItemIntoBrain({
      brainId: input.brainId,
      sourceItemId: duplicateSource.id,
    });
  }

  const sourceItem = await repository.createSourceItem({
    brainId: input.brainId,
    title: input.title,
    type: input.type,
    content: normalizedContent,
    externalUri: input.externalUri,
    storagePath: input.storagePath,
    metadata: {
      ...metadata,
      source_content_hash: hashNormalizedSourceContent(normalizedContent),
      content_hash: fingerprint.contentHash,
      dedupe_keys: buildDedupeKeys(fingerprint),
    },
  });

  return processSourceItemIntoBrain({
    brainId: input.brainId,
    sourceItemId: sourceItem.id,
  });
}
