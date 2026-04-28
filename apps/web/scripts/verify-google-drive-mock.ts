import assert from "node:assert/strict";
import { resetAiClientForTests } from "../lib/ai";
import { createBrain, getBrainSnapshot } from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import { syncConnectorConfig } from "../lib/always-on/runtime";
import type { GoogleDriveClient, GoogleDriveFile } from "../lib/connectors/google-drive";
import { hashNormalizedSourceContent, normalizeSourceContent } from "../lib/workflows/source-normalization";

const files: GoogleDriveFile[] = [
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
};

const mockDriveClient: GoogleDriveClient = {
  async listFiles(folderId: string) {
    assert.equal(folderId, "mock-drive-folder-transcripts");
    return files;
  },
  async downloadText(fileId: string) {
    const content = contentById[fileId];
    if (!content) throw new Error(`Missing mock content for ${fileId}`);
    return content;
  },
};

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

    const first = await syncConnectorConfig(config, { googleDriveClient: mockDriveClient });
    assert.equal(first.status, "completed");
    assert.equal(first.itemsFound, 2);
    assert.equal(first.itemsIngested, 2);
    assert.equal(first.itemsSkipped, 0);
    assert.equal(first.itemsFailed, 0);

    const snapshot = await getBrainSnapshot(brain.id);
    const driveSources = snapshot.sourceItems.filter((source) => source.metadata?.connector_type === "google_drive");
    assert.equal(driveSources.length, 2, "expected two Google Drive source_items");
    assert.ok(driveSources.every((source) => source.type === "transcript"));
    assert.ok(driveSources.every((source) => source.metadata?.source_kind === "transcript"));
    assert.ok(driveSources.every((source) => source.metadata?.normalization_version === "source-normalization-v1"));
    assert.ok(driveSources.every((source) => source.content === normalizeSourceContent(source.content)));
    assert.ok(driveSources.every((source) => source.metadata?.content_hash === hashNormalizedSourceContent(source.content)));
    assert.ok(driveSources.every((source) => Array.isArray(source.metadata?.dedupe_keys)));
    assert.ok(driveSources.some((source) => source.metadata?.domain_type === "investor_call"));
    assert.ok(snapshot.openLoops.some((loop) => /deck|demo link|circle back/i.test(`${loop.title} ${loop.description}`)));
    assert.ok(snapshot.agentRuns.some((run) => run.name === "source_ingestion"));

    const refreshedConfig = (await repository.listConnectorConfigs(brain.id)).find((item) => item.id === config.id);
    assert.ok(refreshedConfig);
    const second = await syncConnectorConfig(refreshedConfig, { googleDriveClient: mockDriveClient });
    assert.equal(second.status, "completed");
    assert.equal(second.itemsFound, 2);
    assert.equal(second.itemsIngested, 0);
    assert.equal(second.itemsSkipped, 2);
    assert.equal(second.itemsFailed, 0);
    assert.equal((await repository.listSourceItems(brain.id)).filter((source) => source.metadata?.connector_type === "google_drive").length, 2);

    const syncRuns = await repository.listConnectorSyncRuns({ brainId: brain.id, connectorConfigId: config.id });
    assert.equal(syncRuns.length, 2);
    assert.ok(syncRuns.every((run) => run.status === "completed"));
    assert.ok(syncRuns.some((run) => run.itemsFound === 2 && run.itemsIngested === 2));
    assert.ok(syncRuns.some((run) => run.itemsFound === 2 && run.itemsSkipped === 2));
    assert.ok(syncRuns.every((run) => run.metadata.itemsFailed === 0));

    const agentRuns = await repository.listAgentRuns(brain.id);
    assert.ok(agentRuns.length >= 2, "expected source ingestion agent_runs");

    console.log("Google Drive mock verification passed.");
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
