// Entity Resolver — adapter that takes an extracted person/company memory
// object and decides "is this the same as an existing canonical entity, or
// a brand new one?"
//
// Three tiers, cheapest first (see plan: docs/plans/closed-loop-core.md):
//
//   Tier 1 — deterministic fast path (no LLM, no embedding):
//     - exact email match on canonical_entities.properties->>'email'
//     - exact verified-alias match on canonical_entities.aliases
//     - for companies: exact domain match on properties->>'domain'
//
//   Tier 2 — vector retrieval (~$0.000002 per call):
//     - embed("name · email · role · company") with text-embedding-3-small
//     - cosine search canonical_entities WHERE entity_type matches
//     - top-1 cosine ≥ 0.92  → auto MERGE (skip Tier 3)
//     - top-1 cosine < 0.7   → auto CREATE NEW (skip Tier 3)
//     - otherwise            → fall through to Tier 3
//
//   Tier 3 — Haiku reconciliation (~$0.0001 per call):
//     - call resolveEntity() agent with new extraction + top-3 candidates
//     - returns {action, matchCandidateId, confidence, reason}
//
// MERGE writes:
//   - UPDATE canonical_entities (append alias, append evidence,
//     last_seen_at, mention_count++, re-embed if name/email changed)
//   - INSERT entity_mentions (canonical_entity_id, memory_object_id,
//     source_item_id, mention_text, context_snippet, mentioned_at)
//
// CREATE writes:
//   - INSERT canonical_entities with embedding
//   - then the entity_mentions insert as above

import { and, eq, sql } from "drizzle-orm";
import { resolveEntity, type EntityCandidate, type EntityResolution, type EntityToResolve } from "@arvya/agents/entity-resolver-agent";
import type { AiClient, ExtractedMemoryObject, MemoryObject } from "@arvya/core";
import { getDb } from "@/lib/db/client";
import { canonicalEntities, entityMentions } from "@/lib/db/schema";

const AUTO_MERGE_COSINE = 0.92;
const SKIP_LLM_COSINE = 0.7;
const TOP_K_CANDIDATES = 5;

export type ResolverDecision = {
  canonicalEntityId: string;
  action: "merge_exact" | "merge_vector" | "merge_llm" | "merge_with_review" | "create_new";
  confidence: number;
  reason: string;
};

// We accept both `ExtractedMemoryObject` (LLM-side shape, before save)
// and `MemoryObject` (DB-side shape, after save). Both expose objectType,
// name, properties, and sourceQuote — that's all the resolver needs.
type ResolvableShape = {
  objectType: string;
  name: string;
  sourceQuote?: string | null;
  properties?: Record<string, unknown>;
};

function isResolvableEntity(memory: ResolvableShape): boolean {
  return memory.objectType === "person" || memory.objectType === "company";
}

function readEntityFields(memory: ResolvableShape): EntityToResolve {
  const props = (memory.properties ?? {}) as Record<string, unknown>;
  const email = typeof props.email === "string" ? props.email.toLowerCase() : undefined;
  const role = typeof props.role === "string" ? props.role : undefined;
  const company = typeof props.company === "string" ? props.company : undefined;
  const domain = typeof props.domain === "string" ? props.domain.toLowerCase() : undefined;
  return {
    type: memory.objectType as "person" | "company",
    name: memory.name,
    email,
    role,
    company,
    domain,
    sourceQuote: memory.sourceQuote ?? undefined,
  };
}

function buildEmbeddingText(entity: EntityToResolve): string {
  return [entity.name, entity.email, entity.role, entity.company]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" · ");
}

async function tier1Email(brainId: string, entity: EntityToResolve): Promise<string | null> {
  if (!entity.email) return null;
  const db = getDb();
  const rows = await db
    .select({ id: canonicalEntities.id })
    .from(canonicalEntities)
    .where(
      and(
        eq(canonicalEntities.brainId, brainId),
        eq(canonicalEntities.entityType, entity.type),
        sql`lower(${canonicalEntities.properties}->>'email') = ${entity.email}`,
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

async function tier1Domain(brainId: string, entity: EntityToResolve): Promise<string | null> {
  if (entity.type !== "company" || !entity.domain) return null;
  const db = getDb();
  const rows = await db
    .select({ id: canonicalEntities.id })
    .from(canonicalEntities)
    .where(
      and(
        eq(canonicalEntities.brainId, brainId),
        eq(canonicalEntities.entityType, "company"),
        sql`lower(${canonicalEntities.properties}->>'domain') = ${entity.domain}`,
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

// Exact alias match (case-insensitive). Postgres's `ANY` against an array
// column is case-sensitive, so we lowercase both sides before comparing.
async function tier1Alias(brainId: string, entity: EntityToResolve): Promise<string | null> {
  const lower = entity.name.trim().toLowerCase();
  if (!lower) return null;
  const db = getDb();
  const rows = await db
    .select({ id: canonicalEntities.id })
    .from(canonicalEntities)
    .where(
      and(
        eq(canonicalEntities.brainId, brainId),
        eq(canonicalEntities.entityType, entity.type),
        sql`EXISTS (
          SELECT 1 FROM unnest(${canonicalEntities.aliases}) AS alias
          WHERE lower(alias) = ${lower}
        )`,
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

async function tier2VectorSearch(
  brainId: string,
  entity: EntityToResolve,
  embedding: number[],
): Promise<Array<EntityCandidate & { rawId: string }>> {
  const db = getDb();
  const literal = `[${embedding.join(",")}]`;
  const rows = await db.execute(sql`
    SELECT
      id,
      canonical_name,
      aliases,
      properties,
      1 - (embedding <=> ${literal}::vector) AS cosine
    FROM canonical_entities
    WHERE brain_id = ${brainId}
      AND entity_type = ${entity.type}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${TOP_K_CANDIDATES}
  `);
  return (rows as Array<Record<string, unknown>>).map((row) => {
    const properties = (row.properties ?? {}) as Record<string, unknown>;
    const aliasesRaw = row.aliases;
    const aliases = Array.isArray(aliasesRaw)
      ? aliasesRaw.filter((a): a is string => typeof a === "string")
      : [];
    return {
      id: String(row.id),
      rawId: String(row.id),
      canonicalName: String(row.canonical_name),
      aliases,
      email: typeof properties.email === "string" ? properties.email : undefined,
      role: typeof properties.role === "string" ? properties.role : undefined,
      company: typeof properties.company === "string" ? properties.company : undefined,
      cosineSimilarity:
        typeof row.cosine === "number" || typeof row.cosine === "string"
          ? Number(row.cosine)
          : undefined,
      evidenceQuotes: extractEvidenceQuotes(properties),
    };
  });
}

function extractEvidenceQuotes(properties: Record<string, unknown>): string[] {
  const evidence = properties.evidence;
  if (!Array.isArray(evidence)) return [];
  return evidence
    .map((item): string | null => {
      if (typeof item !== "object" || item === null) return null;
      const quote = (item as Record<string, unknown>).quote;
      return typeof quote === "string" && quote.length > 0 ? quote : null;
    })
    .filter((q): q is string => q !== null)
    .slice(0, 3);
}

type CanonicalUpsertInput = {
  brainId: string;
  workspaceId: string;
  entity: EntityToResolve;
  // null when the embedding provider was unavailable. The canonical row
  // will be saved with a null embedding column; vector dedup won't work
  // for THIS entity until something re-embeds it later.
  embedding: number[] | null;
  sourceItemId: string | null;
  newAlias?: string;
};

async function mergeIntoCanonical(args: CanonicalUpsertInput & { canonicalId: string }) {
  const db = getDb();
  const evidenceItem = args.entity.sourceQuote
    ? {
        quote: args.entity.sourceQuote,
        sourceItemId: args.sourceItemId,
        capturedAt: new Date().toISOString(),
      }
    : null;
  const now = new Date();
  // Postgres can't infer the type of a bare null parameter inside
  // jsonb_build_object, so cast each maybe-null property to ::text.
  // (The driver passes null values without a type hint, which trips
  // pg_analyze_and_rewrite_varparams: "could not determine data type
  // of parameter $N". Explicit cast resolves it.)
  await db.execute(sql`
    UPDATE canonical_entities
    SET
      aliases = (
        SELECT array_agg(DISTINCT alias)
        FROM unnest(coalesce(aliases, ARRAY[]::text[]) || ARRAY[${args.newAlias ?? args.entity.name}::text]) AS alias
        WHERE alias IS NOT NULL AND alias <> ''
      ),
      properties =
        coalesce(properties, '{}'::jsonb)
        || jsonb_build_object(
            'email', coalesce(properties->>'email', ${args.entity.email ?? null}::text),
            'role', coalesce(properties->>'role', ${args.entity.role ?? null}::text),
            'company', coalesce(properties->>'company', ${args.entity.company ?? null}::text),
            'domain', coalesce(properties->>'domain', ${args.entity.domain ?? null}::text),
            'last_seen_at', ${now.toISOString()}::text,
            'mention_count', coalesce((properties->>'mention_count')::int, 0) + 1
          )
        || ${evidenceItem ? sql`jsonb_build_object('evidence',
              coalesce(properties->'evidence', '[]'::jsonb)
              || jsonb_build_array(${JSON.stringify(evidenceItem)}::jsonb))` : sql`'{}'::jsonb`},
      embedding = ${args.embedding ? sql`COALESCE(embedding, ${`[${args.embedding.join(",")}]`}::vector)` : sql`embedding`},
      updated_at = ${now.toISOString()}::timestamptz
    WHERE id = ${args.canonicalId}
  `);
}

async function createCanonical(args: CanonicalUpsertInput): Promise<string> {
  const db = getDb();
  const now = new Date();
  const evidence = args.entity.sourceQuote
    ? [
        {
          quote: args.entity.sourceQuote,
          sourceItemId: args.sourceItemId,
          capturedAt: now.toISOString(),
        },
      ]
    : [];
  const properties: Record<string, unknown> = {
    last_seen_at: now.toISOString(),
    mention_count: 1,
    evidence,
  };
  if (args.entity.email) properties.email = args.entity.email;
  if (args.entity.role) properties.role = args.entity.role;
  if (args.entity.company) properties.company = args.entity.company;
  if (args.entity.domain) properties.domain = args.entity.domain;

  const [row] = await db
    .insert(canonicalEntities)
    .values({
      brainId: args.brainId,
      workspaceId: args.workspaceId,
      entityType: args.entity.type,
      canonicalName: args.entity.name,
      aliases: [args.newAlias ?? args.entity.name],
      properties,
      confidence: "0.85",
      // Embedding is nullable in the schema; pass null when the provider
      // was unavailable so we still capture the canonical row.
      embedding: args.embedding ?? null,
    })
    .returning({ id: canonicalEntities.id });
  return row.id;
}

async function recordMention(input: {
  brainId: string;
  workspaceId: string;
  canonicalEntityId: string;
  memoryObjectId: string;
  sourceItemId: string | null;
  mentionText: string;
  contextSnippet: string | null;
  mentionedAt: Date;
}) {
  const db = getDb();
  await db.insert(entityMentions).values({
    brainId: input.brainId,
    workspaceId: input.workspaceId,
    canonicalEntityId: input.canonicalEntityId,
    memoryObjectId: input.memoryObjectId,
    sourceItemId: input.sourceItemId,
    mentionText: input.mentionText,
    contextSnippet: input.contextSnippet,
    mentionedAt: input.mentionedAt,
  });
}

// Main entry point used by mergeMemoryObjectsForIngestion. Resolves the
// extraction to a canonical_entity_id (creating one if needed). Returns
// the canonical id so the caller can set memory_objects.canonical_entity_id
// on insert/update.
export async function resolveEntityForIngestion(input: {
  ai: AiClient;
  brainId: string;
  workspaceId: string;
  sourceItemId: string | null;
  memory: ExtractedMemoryObject | MemoryObject;
}): Promise<ResolverDecision | null> {
  if (!isResolvableEntity(input.memory)) return null;

  const entity = readEntityFields(input.memory);

  // Tier 1a: email exact match
  let exactId = await tier1Email(input.brainId, entity);
  if (exactId) {
    return {
      canonicalEntityId: exactId,
      action: "merge_exact",
      confidence: 0.99,
      reason: "Exact email match on existing canonical entity.",
    };
  }

  // Tier 1b: domain exact match (companies only)
  exactId = await tier1Domain(input.brainId, entity);
  if (exactId) {
    return {
      canonicalEntityId: exactId,
      action: "merge_exact",
      confidence: 0.97,
      reason: "Exact domain match on existing company canonical.",
    };
  }

  // Tier 1c: alias exact match
  exactId = await tier1Alias(input.brainId, entity);
  if (exactId) {
    return {
      canonicalEntityId: exactId,
      action: "merge_exact",
      confidence: 0.95,
      reason: "Exact alias match on existing canonical entity.",
    };
  }

  // Tier 2: embed and vector search.
  const embeddingText = buildEmbeddingText(entity);
  if (!embeddingText) {
    // Nothing to embed (no name)? Bail to create_new with low confidence.
    return null;
  }

  // Embedding provider can fail in two interesting ways: it returns null
  // (embeddingModel not configured) or it throws (OpenAI quota exhausted,
  // network timeout, etc). In both cases we degrade to "Tier 1 only" —
  // exact email/domain/alias dedup — and skip vector + LLM tiers. This
  // keeps ingestion alive when embeddings are temporarily unavailable.
  let queryEmbedding: number[] | undefined;
  try {
    const embeddings = await input.ai.embed([embeddingText]);
    queryEmbedding = embeddings?.[0];
  } catch (error) {
    console.warn(
      `[entity-resolver] embed() failed (${error instanceof Error ? error.message : "unknown"}), degrading to Tier-1-only resolution.`,
    );
    return null;
  }
  if (!queryEmbedding) {
    return null;
  }

  const candidates = await tier2VectorSearch(input.brainId, entity, queryEmbedding);

  if (candidates.length === 0) {
    return null; // caller will create new
  }

  const top = candidates[0];
  const topCosine = top.cosineSimilarity ?? 0;

  if (topCosine >= AUTO_MERGE_COSINE) {
    return {
      canonicalEntityId: top.rawId,
      action: "merge_vector",
      confidence: Math.min(0.99, topCosine),
      reason: `High vector similarity (cos=${topCosine.toFixed(3)}) — auto-merge skipped LLM.`,
    };
  }

  if (topCosine < SKIP_LLM_COSINE) {
    return null; // caller will create new
  }

  // Tier 3: Haiku reconciliation.
  let resolution: EntityResolution;
  try {
    resolution = await resolveEntity({
      ai: input.ai,
      entity,
      candidates: candidates.slice(0, 3),
    });
  } catch (error) {
    // If the LLM call fails, fall back to the cosine signal — high enough
    // is merge_with_review, otherwise create_new. Do not silently merge.
    console.error("Entity resolver LLM call failed:", error);
    if (topCosine >= 0.85) {
      return {
        canonicalEntityId: top.rawId,
        action: "merge_with_review",
        confidence: 0.6,
        reason: "LLM reconciliation failed; merging based on cosine alone, flagged for review.",
      };
    }
    return null;
  }

  if (resolution.action === "create_new" || !resolution.matchCandidateId) {
    return null;
  }

  return {
    canonicalEntityId: resolution.matchCandidateId,
    action: resolution.action === "merge" ? "merge_llm" : "merge_with_review",
    confidence: resolution.confidence,
    reason: resolution.reason,
  };
}

// Apply the resolver decision: merge into the canonical OR create a new
// one, then record the entity_mention row that ties this specific memory
// object to the canonical. Returns the canonical_entity_id.
export async function applyResolverDecision(input: {
  ai: AiClient;
  brainId: string;
  workspaceId: string;
  sourceItemId: string | null;
  memory: MemoryObject;
  decision: ResolverDecision | null;
}): Promise<string | null> {
  if (!isResolvableEntity(input.memory)) return null;

  const entity = readEntityFields(input.memory);
  const embeddingText = buildEmbeddingText(entity);
  if (!embeddingText) return null;

  // Best-effort embedding. If the embeddings provider is unavailable
  // (OpenAI quota, transient outage), we still write the canonical row
  // but with a null embedding — vector dedup won't work for this entity
  // until something re-embeds it, but the deterministic dedup paths still
  // function. Better to capture the entity than to fail the ingest.
  let embedding: number[] | null = null;
  try {
    const embeddings = await input.ai.embed([embeddingText]);
    embedding = embeddings?.[0] ?? null;
  } catch (error) {
    console.warn(
      `[entity-resolver] applyResolverDecision: embed() failed (${error instanceof Error ? error.message : "unknown"}), saving canonical without embedding.`,
    );
    embedding = null;
  }

  let canonicalId: string;
  if (input.decision) {
    canonicalId = input.decision.canonicalEntityId;
    await mergeIntoCanonical({
      brainId: input.brainId,
      workspaceId: input.workspaceId,
      entity,
      embedding,
      sourceItemId: input.sourceItemId,
      newAlias: input.memory.name,
      canonicalId,
    });
  } else {
    canonicalId = await createCanonical({
      brainId: input.brainId,
      workspaceId: input.workspaceId,
      entity,
      embedding,
      sourceItemId: input.sourceItemId,
    });
  }

  await recordMention({
    brainId: input.brainId,
    workspaceId: input.workspaceId,
    canonicalEntityId: canonicalId,
    memoryObjectId: input.memory.id,
    sourceItemId: input.sourceItemId,
    mentionText: input.memory.name,
    contextSnippet: input.memory.sourceQuote ?? null,
    mentionedAt: new Date(),
  });

  return canonicalId;
}
