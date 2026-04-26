import { createHash } from "node:crypto";
import { runSourceIngestionWorkflow } from "@arvya/agents/ingestion-agent";
import type { IngestSourceInput, ModelProvider } from "@arvya/core";
import { getAiClient } from "@/lib/ai";
import { getRepository } from "@/lib/db/repository";
import { buildEmbeddingText } from "@/lib/retrieval";

const LIVE_EXTRACTION_MAX_CHARS = 20_000;

function chunkText(content: string, maxLength = 1200): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < content.length; index += maxLength) {
    chunks.push(content.slice(index, index + maxLength));
  }
  return chunks.length ? chunks : [content];
}

function hashSourceContent(input: { title: string; content: string }) {
  return createHash("sha256")
    .update(input.title)
    .update("\0")
    .update(input.content)
    .digest("hex");
}

function stringMetadata(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function sourceFingerprint(input: IngestSourceIntoBrainInput) {
  const metadata = input.metadata ?? {};
  return {
    externalUri: input.externalUri,
    externalId: stringMetadata(metadata.external_id),
    contentHash: stringMetadata(metadata.content_hash) ?? stringMetadata(metadata.fileHash) ?? hashSourceContent(input),
    originalFilename: stringMetadata(metadata.originalFilename),
  };
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
  const connectorType = sourceItem.metadata?.connector_type;
  const shouldUseDeterministicExtraction =
    sourceItem.content.length > LIVE_EXTRACTION_MAX_CHARS ||
    connectorType === "gmail" ||
    connectorType === "outlook";
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

    const memoryObjects = await repository.createMemoryObjects(
      result.memoryObjects.map((memory) => ({
        brainId: brain.id,
        sourceItemId: sourceItem.id,
        objectType: memory.objectType,
        name: memory.name,
        description: memory.description,
        properties: memory.properties ?? {},
        sourceQuote: memory.sourceQuote,
        confidence: memory.confidence,
        status: memory.status,
      })),
    );

    const objectByName = new Map(memoryObjects.map((memory) => [memory.name.toLowerCase(), memory]));
    const relationships = await repository.createRelationships(
      result.relationships.flatMap((relationship) => {
        const from = objectByName.get(relationship.fromName.toLowerCase());
        const to = objectByName.get(relationship.toName.toLowerCase());
        if (!from || !to) return [];
        return [{
          brainId: brain.id,
          fromObjectId: from.id,
          toObjectId: to.id,
          relationshipType: relationship.relationshipType,
          sourceItemId: sourceItem.id,
          sourceQuote: relationship.sourceQuote,
          confidence: relationship.confidence,
          properties: relationship.properties ?? {},
        }];
      }),
    );

    const openLoops = await repository.createOpenLoops(
      result.openLoops.map((loop) => ({
        brainId: brain.id,
        sourceItemId: sourceItem.id,
        title: loop.title,
        description: loop.description,
        loopType: loop.loopType,
        owner: loop.owner,
        status: loop.status,
        priority: loop.priority,
        dueDate: loop.dueDate,
        suggestedAction: loop.suggestedAction,
        suggestedFollowUpEmail: loop.suggestedFollowUpEmail,
        requiresHumanApproval: loop.requiresHumanApproval,
        sourceQuote: loop.sourceQuote,
        confidence: loop.confidence,
        properties: loop.properties ?? {},
      })),
    );

    const chunks = chunkText(sourceItem.content);
    const embeddings = await ai.embed(chunks);
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
  const fingerprint = sourceFingerprint(input);
  const existingSources = await repository.listSourceItems(input.brainId);
  const duplicateSource = existingSources.find((source) => {
    const metadata = source.metadata ?? {};
    return (
      (fingerprint.externalUri && source.externalUri === fingerprint.externalUri) ||
      (fingerprint.externalId && metadata.external_id === fingerprint.externalId) ||
      (fingerprint.originalFilename && metadata.originalFilename === fingerprint.originalFilename) ||
      metadata.content_hash === fingerprint.contentHash ||
      metadata.fileHash === fingerprint.contentHash
    );
  });

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
    content: input.content,
    externalUri: input.externalUri,
    storagePath: input.storagePath,
    metadata: {
      ...(input.metadata ?? {}),
      content_hash: fingerprint.contentHash,
    },
  });

  return processSourceItemIntoBrain({
    brainId: input.brainId,
    sourceItemId: sourceItem.id,
  });
}
