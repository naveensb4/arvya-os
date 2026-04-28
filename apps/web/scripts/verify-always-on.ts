import assert from "node:assert/strict";
import { resetAiClientForTests } from "../lib/ai";
import { createBrain, getBrainSnapshot } from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import {
  ensureDefaultConnectorConfigs,
  runClosedLoopAlignmentMonitor,
  runDailyFounderBrief,
  runOpenLoopMonitor,
  runScheduledConnectorSync,
  runSourceIngested,
  runWeeklyLearningMemo,
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
      name: "Always-On Verification Brain",
      kind: "company",
      thesis: "Verify always-on capture, memory, open loops, alerts, and briefs.",
    });

    const configs = await ensureDefaultConnectorConfigs(brain.id);
    const mockConfig = configs.find((config) => config.connectorType === "mock");
    assert.ok(mockConfig, "expected mock connector config");
    assert.equal(mockConfig.syncEnabled, true, "expected mock connector to be scheduled");

    const syncSummaries = await runScheduledConnectorSync();
    assert.ok(syncSummaries.some((summary) => summary.connectorConfigId === mockConfig.id));

    const snapshot = await getBrainSnapshot(brain.id);
    const mockSource = snapshot.sourceItems.find((source) => source.metadata?.connector_type === "mock");
    assert.ok(mockSource);
    assert.ok(snapshot.agentRuns.some((run) => run.name === "source_ingestion"));
    assert.ok(snapshot.openLoops.length > 0, "expected open loop from mock verifier source");

    const loopCountBeforeRetry = snapshot.openLoops.length;
    await runSourceIngested({ brainId: brain.id, sourceItemId: mockSource.id });
    const afterRetry = await getBrainSnapshot(brain.id);
    assert.equal(afterRetry.openLoops.length, loopCountBeforeRetry, "expected source ingestion retry to be idempotent");

    const syncRuns = await repository.listConnectorSyncRuns({ brainId: brain.id });
    assert.ok(syncRuns.some((run) => run.connectorConfigId === mockConfig.id && run.status === "completed"));

    await repository.createOpenLoops([
      {
        brainId: brain.id,
        title: "Overdue founder follow-up",
        description: "Naveen should follow up with PB about always-on launch readiness.",
        loopType: "follow_up",
        status: "open",
        priority: "high",
        dueDate: "2026-01-01T12:00:00.000Z",
        suggestedAction: "Review the overdue loop in the dashboard.",
      },
    ]);
    const monitorResult = await runOpenLoopMonitor();
    assert.ok(monitorResult.alertsCreated >= 1, "expected overdue loop alert");

    const alerts = await repository.listBrainAlerts({ brainId: brain.id });
    assert.ok(alerts.some((alert) => alert.alertType === "overdue_open_loop"));

    await repository.createMemoryObjects([
      {
        brainId: brain.id,
        objectType: "commitment",
        name: "Customer callback commitment",
        description: "Naveen committed to call the customer back with launch timing.",
        status: "open",
      },
    ]);
    const alignment = await runClosedLoopAlignmentMonitor();
    assert.ok(alignment.findingsDetected >= 1, "expected closed-loop alignment finding");
    assert.ok(alignment.reportsStored >= 1, "expected closed-loop alignment report");
    const alignmentAlerts = await repository.listBrainAlerts({ brainId: brain.id });
    assert.ok(
      alignmentAlerts.some((alert) => alert.alertType === "commitment_without_active_loop"),
      "expected commitment alignment alert",
    );

    const daily = await runDailyFounderBrief();
    assert.ok(daily.stored.length >= 1, "expected daily brief source to be stored");
    const weekly = await runWeeklyLearningMemo();
    assert.ok(weekly.stored.length >= 1, "expected weekly learning memo source to be stored");

    const sources = await repository.listSourceItems(brain.id);
    assert.ok(sources.some((source) => source.metadata?.domain_type === "daily_brief"));
    assert.ok(sources.some((source) => source.metadata?.domain_type === "weekly_learning_memo"));
    assert.ok(sources.some((source) => source.metadata?.domain_type === "closed_loop_alignment_report"));

    console.log("Always-on verification passed.");
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
