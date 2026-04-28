import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resetAiClientForTests } from "../lib/ai";
import { createBrain, getBrainSnapshot } from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import {
  ingestTranscriptBatch,
  parseTranscriptFilename,
} from "../lib/workflows/batch-ingestion";

const fixtureNames = [
  "2026-04-25__Investor__DormRoomFund-Annie__Intro-Call.txt",
  "2026-04-26__Customer__Acme-Maya__Workflow-Discovery.md",
];

async function readFixture(fileName: string) {
  const fixturePath = path.resolve("apps/web/scripts/fixtures/batch-ingestion", fileName);
  return {
    fileName,
    content: await readFile(fixturePath, "utf8"),
    contentType: fileName.endsWith(".md") ? "text/markdown" : "text/plain",
  };
}

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  delete process.env.DATABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  resetRepositoryForTests();
  resetAiClientForTests();

  const repository = getRepository();
  assert.equal(repository.mode, "in_memory");

  try {
    const parsed = parseTranscriptFilename(fixtureNames[0]);
    assert.equal(parsed.occurredAt, "2026-04-25");
    assert.equal(parsed.domainType, "investor_call");
    assert.equal(parsed.companyPersonText, "DormRoomFund-Annie");
    assert.equal(parsed.topic, "Intro Call");

    const brain = await createBrain({
      name: "Batch Ingestion Verification Brain",
      kind: "company",
      thesis: "Verify batch transcript upload into the company brain.",
    });

    const files = await Promise.all(fixtureNames.map(readFixture));
    const results = await ingestTranscriptBatch({
      brainId: brain.id,
      files,
      sourceType: "transcript",
    });

    assert.equal(results.length, 2);
    assert.ok(results.every((result) => result.status === "completed"), "expected all fixtures to ingest");
    assert.ok(results.every((result) => result.sourceItem?.type === "transcript"));
    assert.ok(results.every((result) => result.sourceItem?.metadata?.source_kind === "transcript"));
    assert.ok(results.every((result) => result.memoryObjects.length > 0), "expected memory objects");
    assert.ok(results.every((result) => result.openLoops.length > 0), "expected open loops");
    assert.ok(results.every((result) => result.agentRuns.length >= 5), "expected source ingestion agent runs");

    const investorResult = results.find((result) => result.fileName === fixtureNames[0]);
    assert.equal(investorResult?.sourceItem?.metadata?.occurred_at, "2026-04-25");
    assert.equal(investorResult?.sourceItem?.metadata?.domain_type, "investor_call");
    assert.equal(investorResult?.sourceItem?.metadata?.topic, "Intro Call");
    assert.equal(investorResult?.sourceItem?.metadata?.source_system, "batch_upload");
    assert.equal((investorResult?.sourceItem?.metadata?.source_trace as Record<string, unknown> | undefined)?.original_title, fixtureNames[0]);
    assert.ok(Array.isArray(investorResult?.sourceItem?.metadata?.dedupe_keys));
    assert.equal(investorResult?.sourceItem?.content, investorResult?.sourceItem?.content.trim());
    assert.ok(
      investorResult?.openLoops.some((loop) => /deck|demo link|circle back/i.test(loop.title)),
      "expected obvious investor follow-ups",
    );

    const snapshot = await getBrainSnapshot(brain.id);
    assert.equal(snapshot.sourceItems.length, 2);
    assert.ok(snapshot.memoryObjects.length >= 2, "expected persisted memory objects");
    assert.ok(snapshot.openLoops.length >= 2, "expected persisted open loops");
    assert.ok(snapshot.agentRuns.some((run) => run.name === "source_ingestion"));

    const duplicateResults = await ingestTranscriptBatch({
      brainId: brain.id,
      files: [files[0]],
      sourceType: "transcript",
    });
    assert.equal(duplicateResults.length, 1);
    assert.equal(duplicateResults[0].status, "failed");
    assert.equal(duplicateResults[0].duplicate, true);
    assert.match(duplicateResults[0].error ?? "", /Duplicate source already ingested/);
    assert.equal((await repository.listSourceItems(brain.id)).length, 2);

    const renamedDuplicateResults = await ingestTranscriptBatch({
      brainId: brain.id,
      files: [{ ...files[0], fileName: "2026-04-25__Investor__DormRoomFund-Annie__Renamed-Intro-Call.txt" }],
      sourceType: "transcript",
    });
    assert.equal(renamedDuplicateResults[0].duplicate, true);
    assert.equal((await repository.listSourceItems(brain.id)).length, 2);

    console.log("Batch ingestion verification passed.");
  } finally {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalSupabaseUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    if (originalServiceRoleKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    resetRepositoryForTests();
    resetAiClientForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
