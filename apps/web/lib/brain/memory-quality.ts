import type { ExtractedMemoryObject, ExtractedRelationship, MemoryObject, Relationship } from "@arvya/core";
import type { BrainRepository, CreateMemoryObjectData, CreateRelationshipData, UpdateMemoryObjectData, UpdateRelationshipData } from "@/lib/db/repository";

const ENTITY_TYPES = new Set(["person", "company"]);
const COMPANY_SUFFIXES = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|technologies|technology|labs|systems)\b\.?$/i;
const PERSON_PREFIXES = /^(mr|mrs|ms|dr|prof)\.?\s+/i;
const MAX_DESCRIPTION_LENGTH = 1200;
const MAX_EVIDENCE_ITEMS = 8;

type EvidenceItem = {
  sourceItemId?: string;
  quote?: string;
  confidence?: number;
  capturedAt: string;
};

export function canonicalMemoryName(name: string, objectType?: string): string {
  const stripped = name
    .trim()
    .replace(PERSON_PREFIXES, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const withoutCompanySuffix =
    objectType === "company" ? stripped.replace(COMPANY_SUFFIXES, "").trim() : stripped;

  return withoutCompanySuffix.toLowerCase();
}

export function canonicalMemoryKey(input: { objectType: string; name: string }) {
  return `${input.objectType}:${canonicalMemoryName(input.name, input.objectType)}`;
}

function shouldDedupeMemory(memory: { objectType: string; name: string }) {
  return ENTITY_TYPES.has(memory.objectType) && canonicalMemoryName(memory.name, memory.objectType).length > 1;
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))];
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? uniqueStrings(value) : [];
}

function toEvidenceArray(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is EvidenceItem => typeof item === "object" && item !== null);
}

function mergeDescriptions(existing: string, incoming: string) {
  const existingTrimmed = existing.trim();
  const incomingTrimmed = incoming.trim();
  if (!incomingTrimmed || existingTrimmed.toLowerCase().includes(incomingTrimmed.toLowerCase())) {
    return existingTrimmed;
  }
  if (!existingTrimmed) return incomingTrimmed;
  return `${existingTrimmed}\n\n${incomingTrimmed}`.slice(0, MAX_DESCRIPTION_LENGTH);
}

function bestConfidence(existing?: number, incoming?: number) {
  if (existing === undefined) return incoming;
  if (incoming === undefined) return existing;
  return Math.max(existing, incoming);
}

function bestSourceQuote(existing: MemoryObject | Relationship, incoming: { sourceQuote?: string; confidence?: number }) {
  if (!incoming.sourceQuote) return existing.sourceQuote;
  if (!existing.sourceQuote) return incoming.sourceQuote;
  return (incoming.confidence ?? 0) >= (existing.confidence ?? 0) ? incoming.sourceQuote : existing.sourceQuote;
}

function mergeMemoryProperties(input: {
  existingProperties?: Record<string, unknown>;
  incomingProperties?: Record<string, unknown>;
  canonicalKey: string;
  canonicalName: string;
  sourceItemId?: string;
  existingName: string;
  incomingName: string;
  sourceQuote?: string;
  confidence?: number;
  baseMentionCount: number;
}) {
  const now = new Date().toISOString();
  const sourceItemIds = uniqueStrings([
    ...toStringArray(input.existingProperties?.sourceItemIds),
    input.sourceItemId,
  ]);
  const aliases = uniqueStrings([
    ...toStringArray(input.existingProperties?.aliases),
    input.existingName,
    input.incomingName,
  ]);
  const evidence = [
    {
      sourceItemId: input.sourceItemId,
      quote: input.sourceQuote,
      confidence: input.confidence,
      capturedAt: now,
    },
    ...toEvidenceArray(input.existingProperties?.evidence),
  ]
    .filter((item) => item.quote || item.sourceItemId)
    .slice(0, MAX_EVIDENCE_ITEMS);

  return {
    ...(input.existingProperties ?? {}),
    ...(input.incomingProperties ?? {}),
    canonicalKey: input.canonicalKey,
    canonicalName: input.canonicalName,
    aliases,
    sourceItemIds,
    evidence,
    mentionCount: Number(input.existingProperties?.mentionCount ?? input.baseMentionCount) + 1,
    lastMergedAt: now,
  };
}

function buildMergedMemoryUpdate(
  existing: MemoryObject,
  incoming: ExtractedMemoryObject,
  sourceItemId: string,
): UpdateMemoryObjectData {
  const canonicalName = canonicalMemoryName(existing.name, existing.objectType);
  return {
    description: mergeDescriptions(existing.description, incoming.description),
    confidence: bestConfidence(existing.confidence, incoming.confidence),
    sourceQuote: bestSourceQuote(existing, incoming) ?? null,
    status: incoming.status ?? existing.status ?? null,
    properties: mergeMemoryProperties({
      existingProperties: existing.properties,
      incomingProperties: incoming.properties,
      canonicalKey: canonicalMemoryKey(existing),
      canonicalName,
      sourceItemId,
      existingName: existing.name,
      incomingName: incoming.name,
      sourceQuote: incoming.sourceQuote,
      confidence: incoming.confidence,
      baseMentionCount: 1,
    }),
  };
}

function buildCanonicalMemory(input: {
  brainId: string;
  sourceItemId: string;
  memory: ExtractedMemoryObject;
}): CreateMemoryObjectData {
  const key = canonicalMemoryKey(input.memory);
  const canonicalName = canonicalMemoryName(input.memory.name, input.memory.objectType);
  return {
    brainId: input.brainId,
    sourceItemId: input.sourceItemId,
    objectType: input.memory.objectType,
    name: input.memory.name,
    description: input.memory.description,
    properties: shouldDedupeMemory(input.memory)
      ? mergeMemoryProperties({
          incomingProperties: input.memory.properties,
          canonicalKey: key,
          canonicalName,
          sourceItemId: input.sourceItemId,
          existingName: input.memory.name,
          incomingName: input.memory.name,
          sourceQuote: input.memory.sourceQuote,
          confidence: input.memory.confidence,
          baseMentionCount: 0,
        })
      : input.memory.properties ?? {},
    sourceQuote: input.memory.sourceQuote,
    confidence: input.memory.confidence,
    status: input.memory.status,
  };
}

export async function mergeMemoryObjectsForIngestion(input: {
  repository: BrainRepository;
  brainId: string;
  sourceItemId: string;
  memoryObjects: ExtractedMemoryObject[];
}) {
  const existingMemories = await input.repository.listMemoryObjects(input.brainId);
  const canonicalIndex = new Map<string, MemoryObject>();
  for (const memory of existingMemories) {
    if (shouldDedupeMemory(memory)) {
      canonicalIndex.set(canonicalMemoryKey(memory), memory);
    }
  }

  const saved: MemoryObject[] = [];
  for (const memory of input.memoryObjects) {
    if (!shouldDedupeMemory(memory)) {
      const [created] = await input.repository.createMemoryObjects([
        buildCanonicalMemory({ brainId: input.brainId, sourceItemId: input.sourceItemId, memory }),
      ]);
      saved.push(created);
      continue;
    }

    const key = canonicalMemoryKey(memory);
    const existing = canonicalIndex.get(key);
    if (!existing) {
      const [created] = await input.repository.createMemoryObjects([
        buildCanonicalMemory({ brainId: input.brainId, sourceItemId: input.sourceItemId, memory }),
      ]);
      canonicalIndex.set(key, created);
      saved.push(created);
      continue;
    }

    const updated = await input.repository.updateMemoryObject(
      existing.id,
      buildMergedMemoryUpdate(existing, memory, input.sourceItemId),
    );
    const merged = updated ?? existing;
    canonicalIndex.set(key, merged);
    saved.push(merged);
  }

  return saved;
}

function relationshipKey(relationship: { fromObjectId: string; toObjectId: string; relationshipType: string }) {
  return `${relationship.fromObjectId}:${relationship.toObjectId}:${relationship.relationshipType.trim().toLowerCase()}`;
}

function mergeRelationshipProperties(input: {
  existingProperties?: Record<string, unknown>;
  incomingProperties?: Record<string, unknown>;
  sourceItemId: string;
  sourceQuote?: string;
  confidence?: number;
  baseMentionCount: number;
}) {
  const sourceItemIds = uniqueStrings([...toStringArray(input.existingProperties?.sourceItemIds), input.sourceItemId]);
  const evidence = [
    {
      sourceItemId: input.sourceItemId,
      quote: input.sourceQuote,
      confidence: input.confidence,
      capturedAt: new Date().toISOString(),
    },
    ...toEvidenceArray(input.existingProperties?.evidence),
  ]
    .filter((item) => item.quote || item.sourceItemId)
    .slice(0, MAX_EVIDENCE_ITEMS);

  return {
    ...(input.existingProperties ?? {}),
    ...(input.incomingProperties ?? {}),
    sourceItemIds,
    evidence,
    mentionCount: Number(input.existingProperties?.mentionCount ?? input.baseMentionCount) + 1,
  };
}

function buildRelationshipNameIndexes(memoryObjects: MemoryObject[]) {
  const exact = new Map<string, MemoryObject>();
  const normalized = new Map<string, MemoryObject>();
  for (const memory of memoryObjects) {
    exact.set(memory.name.toLowerCase(), memory);
    normalized.set(canonicalMemoryName(memory.name, memory.objectType), memory);
  }
  return { exact, normalized };
}

function resolveRelationshipEndpoint(name: string, indexes: ReturnType<typeof buildRelationshipNameIndexes>) {
  return indexes.exact.get(name.toLowerCase()) ?? indexes.normalized.get(canonicalMemoryName(name));
}

function buildRelationshipUpdate(existing: Relationship, incoming: CreateRelationshipData): UpdateRelationshipData {
  return {
    sourceItemId: existing.sourceItemId ?? incoming.sourceItemId ?? null,
    sourceQuote: bestSourceQuote(existing, incoming) ?? null,
    confidence: bestConfidence(existing.confidence, incoming.confidence) ?? null,
    properties: mergeRelationshipProperties({
      existingProperties: existing.properties,
      incomingProperties: incoming.properties,
      sourceItemId: incoming.sourceItemId ?? "",
      sourceQuote: incoming.sourceQuote,
      confidence: incoming.confidence,
      baseMentionCount: 1,
    }),
  };
}

export async function mergeRelationshipsForIngestion(input: {
  repository: BrainRepository;
  brainId: string;
  sourceItemId: string;
  memoryObjects: MemoryObject[];
  relationships: ExtractedRelationship[];
}) {
  const [allMemories, existingRelationships] = await Promise.all([
    input.repository.listMemoryObjects(input.brainId),
    input.repository.listRelationships(input.brainId),
  ]);
  const memoryById = new Map([...allMemories, ...input.memoryObjects].map((memory) => [memory.id, memory]));
  const indexes = buildRelationshipNameIndexes([...memoryById.values()]);
  const relationshipIndex = new Map(existingRelationships.map((relationship) => [relationshipKey(relationship), relationship]));

  const saved: Relationship[] = [];
  for (const relationship of input.relationships) {
    const from = resolveRelationshipEndpoint(relationship.fromName, indexes);
    const to = resolveRelationshipEndpoint(relationship.toName, indexes);
    if (!from || !to || from.id === to.id) continue;

    const data: CreateRelationshipData = {
      brainId: input.brainId,
      fromObjectId: from.id,
      toObjectId: to.id,
      relationshipType: relationship.relationshipType,
      sourceItemId: input.sourceItemId,
      sourceQuote: relationship.sourceQuote,
      confidence: relationship.confidence,
      properties: mergeRelationshipProperties({
        incomingProperties: relationship.properties,
        sourceItemId: input.sourceItemId,
        sourceQuote: relationship.sourceQuote,
        confidence: relationship.confidence,
        baseMentionCount: 0,
      }),
    };
    const key = relationshipKey(data);
    const existing = relationshipIndex.get(key);
    if (!existing) {
      const [created] = await input.repository.createRelationships([data]);
      relationshipIndex.set(key, created);
      saved.push(created);
      continue;
    }

    const updated = await input.repository.updateRelationship(existing.id, buildRelationshipUpdate(existing, data));
    const merged = updated ?? existing;
    relationshipIndex.set(key, merged);
    saved.push(merged);
  }

  return saved;
}
