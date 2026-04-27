import assert from "node:assert/strict";
import type { BrainSnapshot, MemoryObject, OpenLoop, SourceItem } from "@arvya/core";
import { buildDashboardModel } from "../lib/brain/dashboard";
import { createBrain, getBrainSnapshot } from "../lib/brain/store";
import { resetRepositoryForTests } from "../lib/db/repository";
import type { ConnectorConfig, ConnectorSyncRun } from "../lib/db/repository";

const now = new Date("2026-04-26T12:00:00.000Z").getTime();

function source(input: Partial<SourceItem> & Pick<SourceItem, "id" | "type" | "createdAt">): SourceItem {
  return {
    brainId: "brain",
    title: input.id,
    content: input.id,
    ...input,
  };
}

function loop(input: Partial<OpenLoop> & Pick<OpenLoop, "id" | "priority" | "status" | "createdAt">): OpenLoop {
  return {
    brainId: "brain",
    title: input.id,
    description: input.id,
    loopType: "follow_up",
    requiresHumanApproval: false,
    ...input,
  };
}

function memory(input: Partial<MemoryObject> & Pick<MemoryObject, "id" | "objectType" | "createdAt">): MemoryObject {
  return {
    brainId: "brain",
    name: input.id,
    description: input.id,
    ...input,
  };
}

function connector(input: Partial<ConnectorConfig> & Pick<ConnectorConfig, "id" | "status" | "syncEnabled">): ConnectorConfig {
  return {
    brainId: "brain",
    connectorType: "mock",
    config: {},
    createdAt: "2026-04-25T12:00:00.000Z",
    ...input,
  };
}

function syncRun(input: Partial<ConnectorSyncRun> & Pick<ConnectorSyncRun, "id" | "status">): ConnectorSyncRun {
  return {
    brainId: "brain",
    connectorType: "mock",
    startedAt: "2026-04-25T12:00:00.000Z",
    itemsFound: 0,
    itemsIngested: 0,
    itemsSkipped: 0,
    metadata: {},
    ...input,
  };
}

async function main() {
  const snapshot: BrainSnapshot = {
    brains: [],
    selectedBrain: {
      id: "brain",
      name: "Arvya Company Brain",
      kind: "company",
      thesis: "Verify dashboard metrics.",
      createdAt: "2026-04-25T12:00:00.000Z",
    },
    sourceItems: [
      source({
        id: "daily-brief",
        type: "strategy_output",
        metadata: { domain_type: "daily_brief" },
        createdAt: "2026-04-26T11:00:00.000Z",
      }),
      source({
        id: "weekly-memo",
        type: "strategy_output",
        metadata: { domain_type: "weekly_learning_memo" },
        createdAt: "2026-04-26T10:00:00.000Z",
      }),
      source({
        id: "customer-call",
        type: "transcript",
        createdAt: "2026-04-26T09:00:00.000Z",
      }),
    ],
    memoryObjects: [
      memory({
        id: "risk-dropped-ball",
        objectType: "risk",
        createdAt: "2026-04-26T08:00:00.000Z",
      }),
      memory({
        id: "question-pricing",
        objectType: "question",
        createdAt: "2026-04-26T07:00:00.000Z",
      }),
      memory({
        id: "product-signal",
        objectType: "product_insight",
        createdAt: "2026-04-26T06:00:00.000Z",
      }),
    ],
    relationships: [],
    openLoops: [
      loop({
        id: "overdue-review-loop",
        status: "needs_review",
        priority: "medium",
        dueDate: "2026-04-25T09:00:00.000Z",
        createdAt: "2026-04-25T09:00:00.000Z",
      }),
      loop({
        id: "future-critical-loop",
        status: "open",
        priority: "critical",
        owner: "PB",
        dueDate: "2026-04-27T09:00:00.000Z",
        suggestedAction: "Send the founder update.",
        createdAt: "2026-04-26T09:00:00.000Z",
      }),
      loop({
        id: "naveen-loop",
        status: "open",
        priority: "high",
        owner: "Naveen",
        createdAt: "2026-04-26T08:00:00.000Z",
      }),
    ],
    workflows: [],
    agentRuns: [],
  };

  const dashboard = buildDashboardModel({
    snapshot,
    syncRuns: [syncRun({ id: "failed-sync", status: "failed" })],
    connectorConfigs: [
      connector({ id: "healthy", status: "active", syncEnabled: true }),
      connector({ id: "broken", status: "error", syncEnabled: true }),
    ],
    currentTime: now,
  });

  assert.equal(dashboard.latestDailyBrief?.id, "daily-brief");
  assert.deepEqual(dashboard.operationalSources.map((item) => item.id), ["customer-call"]);
  assert.equal(dashboard.latestOperationalSource?.id, "customer-call");
  assert.equal(dashboard.newOperationalSources24h, 1);
  assert.deepEqual(dashboard.overdueLoops.map((item) => item.id), ["overdue-review-loop"]);
  assert.deepEqual(dashboard.reviewBacklog.map((item) => item.id), ["overdue-review-loop"]);
  assert.deepEqual(dashboard.dueSoonLoops.map((item) => item.id), ["future-critical-loop"]);
  assert.deepEqual(dashboard.actionQueue.map((item) => item.id), ["overdue-review-loop", "future-critical-loop", "naveen-loop"]);
  assert.deepEqual(dashboard.naveenActions.map((item) => item.id), ["naveen-loop"]);
  assert.deepEqual(dashboard.pbActions.map((item) => item.id), ["future-critical-loop"]);
  assert.deepEqual(dashboard.suggestedActions.map((item) => item.id), ["future-critical-loop"]);
  assert.deepEqual(dashboard.risks.map((item) => item.id), ["risk-dropped-ball"]);
  assert.deepEqual(dashboard.questions.map((item) => item.id), ["question-pricing"]);
  assert.deepEqual(dashboard.productInsights.map((item) => item.id), ["product-signal"]);
  assert.match(dashboard.commandSummary, /1 overdue action loop/);
  assert.equal(dashboard.failedSyncs, 1);
  assert.equal(dashboard.connectorHealth, "1 failing");
  assert.equal(dashboard.brainHealth, "Warning");

  delete process.env.DATABASE_URL;
  resetRepositoryForTests();
  await createBrain({
    name: "Dashboard Brain",
    kind: "company",
    thesis: "Verify bad URLs do not silently show another Brain.",
  });
  await assert.rejects(getBrainSnapshot("missing-brain"), /Brain not found: missing-brain/);

  console.log("Dashboard verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
