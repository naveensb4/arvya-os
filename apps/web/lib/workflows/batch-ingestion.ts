import { createHash } from "node:crypto";
import type { AgentRun, MemoryObject, OpenLoop, SourceItem, SourceType } from "@arvya/core";
import { getRepository } from "@/lib/db/repository";
import { uploadSourceFileToStorage } from "@/lib/storage/source-files";
import { ingestSourceIntoBrain } from "./source-ingestion";

export type BatchIngestionStatus = "pending" | "processing" | "completed" | "failed";

export type BatchTranscriptFile = {
  fileName: string;
  content: string;
  contentType?: string;
  bytes?: ArrayBuffer | Uint8Array;
};

export type ParsedTranscriptFilename = {
  occurredAt?: string;
  sourceTypeLabel?: string;
  domainType?: string;
  companyPersonText?: string;
  topic?: string;
};

export type BatchIngestionResult = {
  fileName: string;
  status: BatchIngestionStatus;
  fileHash?: string;
  duplicate?: boolean;
  duplicateSourceItem?: SourceItem;
  sourceItem?: SourceItem;
  memoryObjects: MemoryObject[];
  openLoops: OpenLoop[];
  agentRuns: AgentRun[];
  storagePath?: string;
  metadata?: Record<string, unknown>;
  error?: string;
};

const SUPPORTED_EXTENSIONS = new Set([".txt", ".md"]);

function extensionFor(fileName: string) {
  const match = fileName.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function humanizeSegment(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferDomainType(sourceTypeLabel?: string) {
  const normalized = sourceTypeLabel?.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!normalized) return undefined;
  if (/investor|vc|fund/.test(normalized)) return "investor_call";
  if (/customer|prospect|buyer/.test(normalized)) return "customer_call";
  if (/advisor|mentor/.test(normalized)) return "advisor_call";
  if (/partner/.test(normalized)) return "partner_call";
  if (/sales/.test(normalized)) return "sales_call";
  if (/team|internal|standup/.test(normalized)) return "internal_call";
  return normalized.endsWith("_call") ? normalized : `${normalized}_call`;
}

export function parseTranscriptFilename(fileName: string): ParsedTranscriptFilename {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const match = baseName.match(
    /^(\d{4}-\d{2}-\d{2})__([^_]+)__([^_]+)__([^_]+(?:_[^_]+)*)$/,
  );

  if (!match) return {};

  const sourceTypeLabel = humanizeSegment(match[2]);
  return {
    occurredAt: match[1],
    sourceTypeLabel,
    domainType: inferDomainType(sourceTypeLabel),
    companyPersonText: match[3].trim(),
    topic: humanizeSegment(match[4]),
  };
}

export function hashTranscriptContent(input: { fileName: string; content: string }) {
  return createHash("sha256")
    .update(input.fileName)
    .update("\0")
    .update(input.content)
    .digest("hex");
}

function buildTitle(fileName: string, parsed: ParsedTranscriptFilename) {
  if (parsed.topic && parsed.companyPersonText) {
    return `${parsed.topic} with ${parsed.companyPersonText}`;
  }
  return humanizeSegment(fileName) || fileName;
}

function hasDuplicateFingerprint(source: SourceItem, fileName: string, fileHash: string) {
  const metadata = source.metadata ?? {};
  return metadata.fileHash === fileHash || metadata.originalFilename === fileName;
}

export async function ingestTranscriptBatch(input: {
  brainId: string;
  files: BatchTranscriptFile[];
  sourceType?: SourceType;
}) {
  const repository = getRepository();
  const brain = await repository.getBrain(input.brainId);
  if (!brain) throw new Error(`Brain not found: ${input.brainId}`);

  const results: BatchIngestionResult[] = [];

  for (const file of input.files) {
    const extension = extensionFor(file.fileName);
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      results.push({
        fileName: file.fileName,
        status: "failed",
        memoryObjects: [],
        openLoops: [],
        agentRuns: [],
        error: "Only .txt and .md transcript files are supported for batch ingestion.",
      });
      continue;
    }

    const fileHash = hashTranscriptContent({ fileName: file.fileName, content: file.content });
    try {
      const existingSources = await repository.listSourceItems(input.brainId);
      const duplicateSourceItem = existingSources.find((source) =>
        hasDuplicateFingerprint(source, file.fileName, fileHash),
      );

      if (duplicateSourceItem) {
        results.push({
          fileName: file.fileName,
          status: "failed",
          fileHash,
          duplicate: true,
          duplicateSourceItem,
          memoryObjects: [],
          openLoops: [],
          agentRuns: [],
          error: `Duplicate source already ingested: ${duplicateSourceItem.title}`,
        });
        continue;
      }

      const parsed = parseTranscriptFilename(file.fileName);
      const metadata = {
        source_kind: "transcript",
        originalFilename: file.fileName,
        fileHash,
        fileExtension: extension,
        occurred_at: parsed.occurredAt,
        source_type_label: parsed.sourceTypeLabel,
        domain_type: parsed.domainType,
        company_person_text: parsed.companyPersonText,
        topic: parsed.topic,
        batch_ingested_at: new Date().toISOString(),
      };

      const storagePath = file.bytes
        ? await uploadSourceFileToStorage({
            brainId: input.brainId,
            fileName: file.fileName,
            fileHash,
            contentType: file.contentType,
            body: file.bytes,
          })
        : undefined;

      const ingested = await ingestSourceIntoBrain({
        brainId: input.brainId,
        title: buildTitle(file.fileName, parsed),
        type: input.sourceType ?? "transcript",
        content: file.content,
        externalUri: undefined,
        storagePath,
        metadata,
      });

      const agentRuns = (await repository.listAgentRuns(input.brainId)).filter(
        (run) => run.sourceItemId === ingested.sourceItem.id,
      );

      results.push({
        fileName: file.fileName,
        status: "completed",
        fileHash,
        sourceItem: ingested.sourceItem,
        memoryObjects: ingested.memoryObjects,
        openLoops: ingested.openLoops,
        agentRuns,
        storagePath,
        metadata,
      });
    } catch (error) {
      results.push({
        fileName: file.fileName,
        status: "failed",
        fileHash,
        memoryObjects: [],
        openLoops: [],
        agentRuns: [],
        error: error instanceof Error ? error.message : "Unknown batch ingestion error",
      });
    }
  }

  return results;
}
