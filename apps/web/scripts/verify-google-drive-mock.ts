import assert from "node:assert/strict";
import { resetAiClientForTests } from "../lib/ai";
import { createBrain, getBrainSnapshot } from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import { syncConnectorConfig } from "../lib/always-on/runtime";
import type { GoogleDriveClient, GoogleDriveFile } from "../lib/connectors/google-drive";
import { hashNormalizedSourceContent, normalizeSourceContent } from "../lib/workflows/source-normalization";

let pass = 0;
let fail = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    pass += 1;
    console.log(`✅ ${label}`);
  } catch (error) {
    fail += 1;
    console.log(`❌ ${label}`);
    console.log(`   ${(error as Error).message}`);
  }
}

const initialFiles: GoogleDriveFile[] = [
  {
    id: "drive-file-investor-intro",
    name: "2026-04-25__Investor__DormRoomFund-Annie__Intro-Call.txt",
    mimeType: "text/plain",
    webViewLink: "https://drive.google.com/file/d/drive-file-investor-intro/view",
    modifiedTime: "2026-04-25T18:00:00.000Z",
  },
  {
    id: "drive-file-customer-discovery",
    name: "2026-04-26__Customer__Acme-Maya__Workflow-Discovery.md",
    mimeType: "text/markdown",
    webViewLink: "https://drive.google.com/file/d/drive-file-customer-discovery/view",
    modifiedTime: "2026-04-26T18:00:00.000Z",
  },
];

const newArrival: GoogleDriveFile = {
  id: "drive-file-design-partner",
  name: "2026-04-27__Customer__Acme-Maya__Pricing-Followup.md",
  mimeType: "text/markdown",
  webViewLink: "https://drive.google.com/file/d/drive-file-design-partner/view",
  modifiedTime: "2026-04-27T18:00:00.000Z",
};

const contentById: Record<string, string> = {
  "drive-file-investor-intro": [
    "Naveen met Annie from Dorm Room Fund for an intro call about Arvya OS.",
    "Annie said the company brain positioning is compelling for founder operating workflows.",
    "Send the updated investor deck by Friday and follow up with the demo link next week.",
    "Circle back after Annie shares notes with her partner.",
  ].join("\n"),
  "drive-file-customer-discovery": [
    "# Workflow Discovery",
    "",
    "Maya at Acme Labs described that customer research, investor calls, and advisor notes are scattered across email and documents.",
    "The team decided Arvya should keep source-backed memory visible next to open loops.",
    "Share the pilot workspace notes with Maya tomorrow.",
    "Schedule another call next week to review the batch upload workflow.",
  ].join("\n"),
  "drive-file-design-partner": [
    "Maya shared the Acme pricing model and asked about contract terms.",
    "Send Maya the Arvya pricing one-pager and follow up with the contract draft.",
  ].join("\n"),
};

class StatefulDriveClient implements GoogleDriveClient {
  store: GoogleDriveFile[];
  lastListSince: string | undefined;
  constructor(initial: GoogleDriveFile[]) {
    this.store = [...initial];
    this.lastListSince = undefined;
  }
  async listFiles(folderId: string, options?: { since?: string }) {
    assert.equal(folderId, "mock-drive-folder-transcripts");
    this.lastListSince = options?.since;
    if (!options?.since) return this.store;
    const sinceMs = Date.parse(options.since);
    return this.store.filter((file) => {
      const ts = Date.parse(file.modifiedTime ?? "");
      return Number.isFinite(ts) ? ts > sinceMs : true;
    });
  }
  async downloadText(fileId: string) {
    const content = contentById[fileId];
    if (!content) throw new Error(`Missing mock content for ${fileId}`);
    return content;
  }
}

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  resetRepositoryForTests();
  resetAiClientForTests();

  try {
    const repository = getRepository();
    assert.equal(repository.mode, "in_memory");

    const brain = await createBrain({
      name: "Google Drive Mock Verification Brain",
      kind: "company",
      thesis: "Verify Drive folder transcript sync into source-backed memory and open loops.",
    });

    const config = await repository.createConnectorConfig({
      brainId: brain.id,
      connectorType: "google_drive",
      status: "connected",
      syncEnabled: true,
      syncIntervalMinutes: 10,
      config: { folderIds: ["mock-drive-folder-transcripts"] },
      credentials: { access_token: "mock-token", refresh_token: "mock-refresh-token" },
    });

    const drive = new StatefulDriveClient(initialFiles);

    const first = await syncConnectorConfig(config, { googleDriveClient: drive });
    check("first sync ingests both transcripts", () => {
      assert.equal(first.status, "completed");
      assert.equal(first.itemsFound, 2);
      assert.equal(first.itemsIngested, 2);
      assert.equal(first.itemsSkipped, 0);
      assert.equal(first.itemsFailed, 0);
    });
    check("first sync sent no since-watermark", () => assert.equal(drive.lastListSince, undefined));

    const snapshot = await getBrainSnapshot(brain.id);
    const driveSources = snapshot.sourceItems.filter((source) => source.metadata?.connector_type === "google_drive");
    check("source items normalized + hashed + dedupe-keyed", () => {
      assert.equal(driveSources.length, 2);
      assert.ok(driveSources.every((source) => source.type === "transcript"));
      assert.ok(driveSources.every((source) => source.metadata?.source_kind === "transcript"));
      assert.ok(driveSources.every((source) => source.metadata?.normalization_version === "source-normalization-v1"));
      assert.ok(driveSources.every((source) => source.content === normalizeSourceContent(source.content)));
      assert.ok(driveSources.every((source) => source.metadata?.content_hash === hashNormalizedSourceContent(source.content)));
      assert.ok(driveSources.every((source) => Array.isArray(source.metadata?.dedupe_keys)));
    });
    check("ingestion populates open loops + agent runs", () => {
      assert.ok(snapshot.openLoops.some((loop) => /deck|demo link|circle back/i.test(`${loop.title} ${loop.description}`)));
      assert.ok(snapshot.agentRuns.some((run) => run.name === "source_ingestion"));
    });

    const refreshed1 = await getConfig(config.id);
    check("first sync persists watermark to latest modifiedTime", () => {
      assert.equal(String(refreshed1.config.watermark ?? ""), "2026-04-26T18:00:00.000Z");
    });

    const second = await syncConnectorConfig(refreshed1, { googleDriveClient: drive });
    check("second sync passes since= last watermark", () => assert.equal(drive.lastListSince, "2026-04-26T18:00:00.000Z"));
    check("second sync finds no newer files (idempotent)", () => {
      assert.equal(second.itemsFound, 0);
      assert.equal(second.itemsIngested, 0);
      assert.equal(second.itemsFailed, 0);
    });

    drive.store.push(newArrival);
    const refreshed2 = await getConfig(config.id);
    const third = await syncConnectorConfig(refreshed2, { googleDriveClient: drive });
    check("third sync ingests the newly arrived file", () => {
      assert.equal(third.itemsFound, 1);
      assert.equal(third.itemsIngested, 1);
    });

    const refreshed3 = await getConfig(config.id);
    check("third sync watermark advances to new modifiedTime", () => {
      assert.equal(String(refreshed3.config.watermark ?? ""), "2026-04-27T18:00:00.000Z");
    });

    const total = (await repository.listSourceItems(brain.id)).filter((source) => source.metadata?.connector_type === "google_drive").length;
    check("idempotency: provider_id dedupe keeps source_items at 3", () => assert.equal(total, 3));

    const syncRuns = await repository.listConnectorSyncRuns({ brainId: brain.id, connectorConfigId: config.id });
    check("connector_sync_runs cover all three syncs and all completed", () => {
      assert.equal(syncRuns.length, 3);
      assert.ok(syncRuns.every((run) => run.status === "completed"));
      assert.ok(syncRuns.every((run) => run.metadata.itemsFailed === 0));
    });

    if (fail > 0) {
      console.log(`\nGoogle Drive mock verification: ${pass} passed, ${fail} failed`);
      process.exit(1);
    }
    console.log(`\nGoogle Drive mock verification passed: ${pass}/${pass} checks`);
  } finally {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    resetRepositoryForTests();
    resetAiClientForTests();
  }
}

async function getConfig(id: string) {
  const repository = getRepository();
  const configs = await repository.listConnectorConfigs();
  const found = configs.find((item) => item.id === id);
  if (!found) throw new Error(`Connector config not found: ${id}`);
  return found;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
