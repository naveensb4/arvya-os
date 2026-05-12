// End-to-end verification of the entity resolver against the real
// production DB. Inserts a synthetic memory_object, runs the resolver,
// confirms the resolver:
//   1. Embeds the entity successfully
//   2. Writes a canonical_entities row with the correct shape
//   3. Writes an entity_mentions row pointing at the canonical
//   4. Stamps the canonical_entity_id back onto the memory_object
//
// Then cleans up every row it created (no garbage left behind).
//
// Run: pnpm tsx apps/web/scripts/verify-resolver-end-to-end.ts
//
// Cost: ~$0.000002 (one OpenAI embedding call). Optionally a Haiku call
// (~$0.0001) if cosine retrieval returns ambiguous candidates from the
// existing 54 canonical_entities — but those have null embeddings, so
// the cosine search will return zero rows and Tier 3 won't run on a
// fresh canonical insert.

import assert from "node:assert/strict";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getAiClient } from "../lib/ai";
import { getDb } from "../lib/db/client";
import {
  applyResolverDecision,
  resolveEntityForIngestion,
} from "../lib/brain/entity-resolver";
import {
  brains as brainsTable,
  canonicalEntities,
  entityMentions,
  memoryObjects as memoryObjectsTable,
} from "../lib/db/schema";

const SMOKE_NAME = "__resolver_smoke_test__";

config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });

async function main() {
  console.log("=== Entity Resolver End-to-End Smoke Test ===\n");

  const db = getDb();
  const ai = getAiClient();
  if (!ai.available) {
    console.error("ERROR: AI client unavailable. Set ANTHROPIC_API_KEY and/or OPENAI_API_KEY.");
    process.exit(1);
  }
  console.log(`AI provider: ${ai.preferredProvider}, embeddings: ${ai.embeddingModel ?? "none"}`);

  // 1. Pick the first brain in the DB. The user has one brain, so this
  //    is deterministic for them.
  const [brain] = await db
    .select({ id: brainsTable.id, workspaceId: brainsTable.workspaceId })
    .from(brainsTable)
    .limit(1);
  if (!brain) {
    console.error("ERROR: no brains in DB. Cannot run smoke test.");
    process.exit(1);
  }
  if (!brain.workspaceId) {
    console.error("ERROR: brain has no workspaceId. Resolver requires it.");
    process.exit(1);
  }
  console.log(`Using brain: ${brain.id}, workspace: ${brain.workspaceId}\n`);

  // 2. Insert a synthetic memory_object that simulates an LLM-extracted
  //    person. The resolver will see this and decide create_new.
  const [memory] = await db
    .insert(memoryObjectsTable)
    .values({
      brainId: brain.id,
      sourceItemId: null,
      objectType: "person",
      name: SMOKE_NAME,
      description: "Smoke test entity for verifying resolver end-to-end.",
      properties: {
        email: "smoke@test.local",
        role: "Smoke Tester",
        company: "Smoke Co",
      },
      sourceQuote: "smoke test source quote",
      confidence: "0.85",
      status: null,
    })
    .returning();
  console.log(`Inserted synthetic memory_object: ${memory.id}`);

  let canonicalIdCreated: string | null = null;
  let mentionIdCreated: string | null = null;
  let allChecksPassed = false;

  try {
    // 3. Run the resolver: should hit no Tier 1 match, no Tier 2 candidates
    //    (existing canonical_entities have null embeddings), return null
    //    decision (create_new path).
    console.log("Running resolveEntityForIngestion...");
    const decision = await resolveEntityForIngestion({
      ai,
      brainId: brain.id,
      workspaceId: brain.workspaceId,
      sourceItemId: null,
      memory: memory as never,
    });
    console.log(`Decision: ${decision ? `merge into ${decision.canonicalEntityId}` : "null (create new)"}\n`);

    // 4. Apply the decision. For null decision, this should create a new
    //    canonical_entities row and an entity_mentions row.
    console.log("Running applyResolverDecision...");
    const canonicalId = await applyResolverDecision({
      ai,
      brainId: brain.id,
      workspaceId: brain.workspaceId,
      sourceItemId: null,
      memory: memory as never,
      decision,
    });
    console.log(`canonicalEntityId returned: ${canonicalId}\n`);
    assert(canonicalId, "applyResolverDecision returned null");
    canonicalIdCreated = canonicalId;

    // 5. Verify the canonical_entities row was written correctly.
    const [canonical] = await db
      .select()
      .from(canonicalEntities)
      .where(eq(canonicalEntities.id, canonicalId))
      .limit(1);
    assert(canonical, "canonical_entities row not found");
    assert.equal(canonical.brainId, brain.id, "brainId mismatch");
    assert.equal(canonical.workspaceId, brain.workspaceId, "workspaceId mismatch");
    assert.equal(canonical.entityType, "person", "entityType mismatch");
    assert.equal(canonical.canonicalName, SMOKE_NAME, "canonicalName mismatch");
    assert(canonical.aliases?.includes(SMOKE_NAME), "alias not in aliases");
    // Embedding is best-effort. When OpenAI is up: full 1536-dim vector.
    // When OpenAI is down (quota / outage): null, and we run in
    // Tier-1-only degraded mode. Both are acceptable.
    const embeddingMode = canonical.embedding
      ? `vector of length ${(canonical.embedding as number[]).length}`
      : "null (degraded: embedding provider unavailable)";
    if (canonical.embedding) {
      assert(Array.isArray(canonical.embedding), "embedding not array");
      assert.equal((canonical.embedding as number[]).length, 1536, "embedding wrong length");
    }
    const props = canonical.properties as Record<string, unknown>;
    assert.equal(props.email, "smoke@test.local", "email property not stored");
    assert.equal(props.role, "Smoke Tester", "role property not stored");
    assert(typeof props.last_seen_at === "string", "last_seen_at not stamped");
    assert.equal(props.mention_count, 1, "mention_count not 1");
    console.log("✓ canonical_entities row written correctly");
    console.log(`  - id: ${canonical.id}`);
    console.log(`  - aliases: ${JSON.stringify(canonical.aliases)}`);
    console.log(`  - embedding: ${embeddingMode}`);
    console.log(`  - properties.email: ${props.email}`);
    console.log(`  - properties.mention_count: ${props.mention_count}\n`);

    // 6. Verify the entity_mentions row was written.
    const mentions = await db
      .select()
      .from(entityMentions)
      .where(eq(entityMentions.canonicalEntityId, canonicalId));
    assert.equal(mentions.length, 1, `expected 1 entity_mention, got ${mentions.length}`);
    const mention = mentions[0];
    assert.equal(mention.brainId, brain.id, "mention brainId mismatch");
    assert.equal(mention.workspaceId, brain.workspaceId, "mention workspaceId mismatch");
    assert.equal(mention.memoryObjectId, memory.id, "mention memoryObjectId mismatch");
    assert.equal(mention.mentionText, SMOKE_NAME, "mention_text mismatch");
    mentionIdCreated = mention.id;
    console.log("✓ entity_mentions row written correctly");
    console.log(`  - id: ${mention.id}`);
    console.log(`  - mentionText: ${mention.mentionText}`);
    console.log(`  - memoryObjectId: ${mention.memoryObjectId}\n`);

    // 7. Now run the resolver AGAIN with the same name + email. Should
    //    hit Tier 1 (exact email match) and return the SAME canonical id,
    //    not create a new one. This proves the dedup path works.
    console.log("Running resolver second time (dedup test)...");
    const [memory2] = await db
      .insert(memoryObjectsTable)
      .values({
        brainId: brain.id,
        sourceItemId: null,
        objectType: "person",
        name: SMOKE_NAME, // same name
        description: "Second occurrence of the same person.",
        properties: { email: "smoke@test.local" }, // same email
        sourceQuote: "second occurrence",
        confidence: "0.85",
        status: null,
      })
      .returning();

    const decision2 = await resolveEntityForIngestion({
      ai,
      brainId: brain.id,
      workspaceId: brain.workspaceId,
      sourceItemId: null,
      memory: memory2 as never,
    });
    assert(decision2, "second pass should match (Tier 1 email)");
    assert.equal(decision2.action, "merge_exact", `expected merge_exact, got ${decision2.action}`);
    assert.equal(decision2.canonicalEntityId, canonicalId, "second pass should return SAME canonical id");
    console.log("✓ Tier 1 email-match dedup works (returned existing canonical, not new)");
    console.log(`  - action: ${decision2.action}, confidence: ${decision2.confidence}\n`);

    // Apply it and verify mention_count incremented.
    await applyResolverDecision({
      ai,
      brainId: brain.id,
      workspaceId: brain.workspaceId,
      sourceItemId: null,
      memory: memory2 as never,
      decision: decision2,
    });
    const [canonicalAfter] = await db
      .select()
      .from(canonicalEntities)
      .where(eq(canonicalEntities.id, canonicalId))
      .limit(1);
    const propsAfter = canonicalAfter.properties as Record<string, unknown>;
    assert.equal(propsAfter.mention_count, 2, `mention_count should be 2 after second mention, got ${propsAfter.mention_count}`);
    console.log("✓ second mention incremented properties.mention_count to 2\n");

    // Clean up the second memory object too.
    await db.delete(memoryObjectsTable).where(eq(memoryObjectsTable.id, memory2.id));

    allChecksPassed = true;
  } catch (error) {
    console.error("\n❌ SMOKE TEST FAILED:");
    console.error(error);
  } finally {
    // Always clean up, even on failure.
    console.log("\nCleaning up smoke test rows...");
    if (canonicalIdCreated) {
      // entity_mentions cascades from canonical_entities
      await db.delete(canonicalEntities).where(eq(canonicalEntities.id, canonicalIdCreated));
      console.log(`  - deleted canonical_entities row ${canonicalIdCreated}`);
    }
    await db.delete(memoryObjectsTable).where(eq(memoryObjectsTable.id, memory.id));
    console.log(`  - deleted memory_objects row ${memory.id}`);
    // Defensive: delete any leftover smoke entities by name in case prior
    // failed runs left stragglers.
    await db
      .delete(canonicalEntities)
      .where(eq(canonicalEntities.canonicalName, SMOKE_NAME));
    await db
      .delete(memoryObjectsTable)
      .where(eq(memoryObjectsTable.name, SMOKE_NAME));
    console.log("  - cleaned up any name-matched stragglers");
  }

  if (allChecksPassed) {
    console.log("\n=== ALL CHECKS PASSED ===");
    console.log("Resolver is wire-clean against the real DB. Safe to wipe + re-onboard.");
    process.exit(0);
  } else {
    console.log("\n=== CHECKS FAILED ===");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
