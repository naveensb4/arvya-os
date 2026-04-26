import assert from "node:assert/strict";
import { resetAiClientForTests } from "../lib/ai";
import { createBrain } from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import {
  ensureDefaultConnectorConfigs,
  runScheduledConnectorSync,
  syncConnectorNow,
} from "../lib/always-on/runtime";

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  resetRepositoryForTests();
  resetAiClientForTests();

  try {
    const repository = getRepository();
    assert.equal(repository.mode, "in_memory");

    const brain = await createBrain({
      name: "Scheduler Mock Verification Brain",
      kind: "company",
      thesis: "Verify scheduled connector polling without external OAuth.",
    });

    const configs = await ensureDefaultConnectorConfigs(brain.id);
    const mockConfig = configs.find((config) => config.connectorType === "mock");
    assert.ok(mockConfig, "expected mock connector config");
    assert.equal(mockConfig.syncEnabled, true);

    const summaries = await runScheduledConnectorSync();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].connectorType, "mock");
    assert.equal(summaries[0].itemsIngested, 1);

    const firstRuns = await repository.listConnectorSyncRuns({ brainId: brain.id });
    assert.equal(firstRuns.length, 1);
    assert.equal(firstRuns[0].status, "completed");
    assert.equal(firstRuns[0].itemsIngested, 1);

    await syncConnectorNow({ brainId: brain.id, connectorConfigId: mockConfig.id });
    const secondRuns = await repository.listConnectorSyncRuns({ brainId: brain.id });
    assert.equal(secondRuns.length, 2);
    assert.equal(secondRuns[0].itemsSkipped, 1, "expected duplicate verifier source to be skipped");

    console.log("Scheduler mock verification passed.");
  } finally {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    resetRepositoryForTests();
    resetAiClientForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
