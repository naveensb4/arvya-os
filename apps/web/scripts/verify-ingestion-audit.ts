import assert from "node:assert/strict";
import { resetAiClientForTests } from "../lib/ai";
import { createBrain } from "../lib/brain/store";
import { ingestSourceIntoBrain } from "../lib/workflows/source-ingestion";
import { syncConnectorConfig } from "../lib/always-on/runtime";
import type { GoogleDriveClient, GoogleDriveFile } from "../lib/connectors/google-drive";
import type { OutlookClient, OutlookMessage } from "../lib/connectors/outlook";
import { extractMeetingUrl } from "../lib/notetaker/calendar-providers";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import { parseTranscriptFilename } from "../lib/workflows/batch-ingestion";
import {
  buildSourceTraceMetadata,
  mergeSourceTraceMetadata,
} from "../lib/workflows/source-normalization";

function makeDriveFile(index: number): GoogleDriveFile {
  return {
    id: `drive-investor-${index}`,
    name: `2026-04-${String(10 + index).padStart(2, "0")}__Investor__DormRoomFund-Annie__Touchpoint-${index}.txt`,
    mimeType: "text/plain",
    webViewLink: `https://drive.google.com/file/d/drive-investor-${index}/view`,
    modifiedTime: `2026-04-${String(10 + index).padStart(2, "0")}T18:00:00.000Z`,
  };
}

const flatDriveContent = (index: number) =>
  [
    `Naveen reviewed touchpoint ${index} with Annie at Dorm Room Fund.`,
    "Send the deck Friday and confirm the demo link before the partner meeting.",
    "Circle back after Annie's partner sync next week.",
  ].join("\n");

async function expectsRejection<T>(promise: Promise<T>, expectedFragment: RegExp, label: string) {
  try {
    await promise;
    throw new Error(`${label}: expected rejection`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, expectedFragment, `${label}: unexpected error "${message}"`);
  }
}

async function runDriveSafetyCases() {
  const repository = getRepository();
  const brain = await createBrain({
    name: "Drive Safety Brain",
    kind: "company",
    thesis: "Audit Google Drive guardrails for transcript ingestion.",
  });

  const broadConfig = await repository.createConnectorConfig({
    brainId: brain.id,
    connectorType: "google_drive",
    status: "connected",
    syncEnabled: true,
    syncIntervalMinutes: 60,
    config: { folderIds: ["root"] },
    credentials: { access_token: "mock", refresh_token: "mock" },
  });
  await expectsRejection(
    syncConnectorConfig(broadConfig, {
      googleDriveClient: { listFiles: async () => [], downloadText: async () => "" },
    }),
    /top-level\/shared root/,
    "Drive root folder rejection",
  );

  const cappedConfig = await repository.createConnectorConfig({
    brainId: brain.id,
    connectorType: "google_drive",
    status: "connected",
    syncEnabled: true,
    syncIntervalMinutes: 60,
    config: { folderIds: ["arvya-brain-folder"], maxItems: 5 },
    credentials: { access_token: "mock", refresh_token: "mock" },
  });
  const totalFiles = 8;
  const files = Array.from({ length: totalFiles }, (_, i) => makeDriveFile(i + 1));
  const driveClient: GoogleDriveClient = {
    async listFiles(folderId) {
      assert.equal(folderId, "arvya-brain-folder");
      return files;
    },
    async downloadText(fileId) {
      const index = Number(fileId.split("-").pop());
      return flatDriveContent(index);
    },
  };
  const synced = await syncConnectorConfig(cappedConfig, { googleDriveClient: driveClient });
  assert.equal(synced.itemsFound, totalFiles);
  assert.equal(synced.itemsIngested, 5, "drive cap should limit ingestion to 5");
  assert.equal(synced.itemsSkipped, totalFiles - 5);

  const driveSyncRuns = await repository.listConnectorSyncRuns({
    brainId: brain.id,
    connectorConfigId: cappedConfig.id,
  });
  const lastRun = driveSyncRuns[driveSyncRuns.length - 1];
  const skippedFiles = ((lastRun.metadata as Record<string, unknown>).skippedItems
    ?? (lastRun.metadata as Record<string, unknown>).skippedFiles) as Array<{ reason: string; fileName: string }> | undefined;
  assert.ok(skippedFiles?.some((entry) => entry.reason === "safety_cap_5"), "expected safety cap entry in skippedFiles");
}

async function runOutlookCategoryGuard() {
  const repository = getRepository();
  const brain = await createBrain({
    name: "Outlook Category Guard Brain",
    kind: "company",
    thesis: "Audit Outlook category-based sync guardrails.",
  });

  const dummyClient: OutlookClient = {
    async listMessages() {
      return [] as OutlookMessage[];
    },
    async listMessagesByCategory() {
      return [] as OutlookMessage[];
    },
  };

  for (const broad of ["", " ", "*", "any", "all"]) {
    const config = await repository.createConnectorConfig({
      brainId: brain.id,
      connectorType: "outlook",
      status: "connected",
      syncEnabled: true,
      syncIntervalMinutes: 30,
      config: { outlookCategoryNames: [broad] },
      credentials: { access_token: "mock-outlook" },
    });
    await expectsRejection(
      syncConnectorConfig(config, { outlookClient: dummyClient }),
      /too broad|requires a configured/,
      `Outlook category "${broad || "(empty)"}" rejection`,
    );
  }
}

async function runAlwaysOnSourceSystemDefault() {
  const repository = getRepository();
  const brain = await createBrain({
    name: "Always-On Source System Brain",
    kind: "company",
    thesis: "Audit always-on connector source_system tracing.",
  });

  for (const connectorType of ["recall", "mock"] as const) {
    const config = await repository.createConnectorConfig({
      brainId: brain.id,
      connectorType,
      status: "connected",
      syncEnabled: true,
      syncIntervalMinutes: 60,
      config: {},
    });
    const summary = await syncConnectorConfig(config);
    assert.equal(summary.status, "completed");
    const created = (await repository.listSourceItems(brain.id))
      .filter((source) => source.metadata?.connector_type === connectorType);
    assert.ok(created.length >= 1, `expected ${connectorType} verifier source`);
    assert.equal(
      created[0].metadata?.source_system,
      connectorType,
      `${connectorType} verifier should default source_system to "${connectorType}"`,
    );
    const trace = created[0].metadata?.source_trace as Record<string, unknown> | undefined;
    assert.equal(trace?.source_system, connectorType, "source_trace should mirror connector type");
  }
}

function runFilenameParserCases() {
  const trailing = parseTranscriptFilename(
    "2026-04-25__Investor__DormRoomFund-Annie__Intro-Call__v2-final.txt",
  );
  assert.equal(trailing.occurredAt, "2026-04-25");
  assert.equal(trailing.sourceTypeLabel, "Investor");
  assert.equal(trailing.companyPersonText, "DormRoomFund-Annie");
  assert.equal(trailing.topic, "Intro Call v2 final");
  assert.equal(trailing.domainType, "investor_call");

  const customer = parseTranscriptFilename(
    "2026-04-26__Customer__Acme-Maya__Workflow-Discovery__pilot__notes.md",
  );
  assert.equal(customer.occurredAt, "2026-04-26");
  assert.equal(customer.sourceTypeLabel, "Customer");
  assert.equal(customer.topic, "Workflow Discovery pilot notes");
  assert.equal(customer.domainType, "customer_call");

  const malformed = parseTranscriptFilename("random-notes-without-pattern.md");
  assert.equal(malformed.occurredAt, undefined, "non-pattern files must not parse");
  assert.equal(malformed.topic, undefined);

  const partial = parseTranscriptFilename("2026-04-26__Customer__Acme-Maya.md");
  assert.equal(partial.occurredAt, undefined, "files missing the topic segment must not parse");
}

function runMeetingUrlExtraction() {
  const zoom = extractMeetingUrl({
    title: "Investor sync with Annie",
    description: "Join Zoom Meeting:\nhttps://us02web.zoom.us/j/12345?pwd=abc",
  });
  assert.equal(zoom, "https://us02web.zoom.us/j/12345?pwd=abc");

  const meet = extractMeetingUrl({
    description: "Reminder: https://meet.google.com/aaa-bbb-ccc next Tuesday.",
  });
  assert.equal(meet, "https://meet.google.com/aaa-bbb-ccc");

  const teams = extractMeetingUrl({
    description: "Outlook invite link: https://teams.microsoft.com/l/meetup-join/19%3aabc",
  });
  assert.equal(teams, "https://teams.microsoft.com/l/meetup-join/19%3aabc");

  const dropbox = extractMeetingUrl({
    description: "Notes ready in https://dropbox.com/s/foo/notes.pdf and https://example.com/random",
  });
  assert.equal(dropbox, undefined, "must not infer a meeting URL from arbitrary hosts");

  const explicit = extractMeetingUrl({
    description: "see notes",
    meetingUrl: "https://internal.zoom.example.com/j/999",
  });
  assert.equal(
    explicit,
    "https://internal.zoom.example.com/j/999",
    "explicit calendar meetingUrl is trusted (provider already confirmed it)",
  );
}

function runTraceMergePreservation() {
  const trace = buildSourceTraceMetadata({
    sourceKind: "transcript",
    sourceSystem: "recall",
    connectorType: "recall",
    connectorConfigId: "cfg-recall",
    externalId: "recall:transcript-42",
    externalUri: "https://us02web.zoom.us/j/12345",
    originalTitle: "DormRoomFund-Annie sync",
    occurredAt: "2026-04-25T18:00:00.000Z",
  });

  const partial = mergeSourceTraceMetadata(trace, {
    domain_type: "investor_call",
    source_trace: { recall_bot_id: "bot_42" },
  });

  const partialTrace = partial.source_trace as Record<string, unknown>;
  assert.equal(partialTrace.recall_bot_id, "bot_42", "caller-supplied trace fields are preserved");
  assert.equal(partialTrace.connector_type, "recall", "partial source_trace must not drop pre-set fields");
  assert.equal(partialTrace.external_id, "recall:transcript-42");
  assert.equal(partialTrace.original_title, "DormRoomFund-Annie sync");
  assert.equal(partial.source_system, "recall");
  assert.equal(partial.connector_type, "recall");
  assert.equal(partial.external_id, "recall:transcript-42");
  assert.equal(partial.domain_type, "investor_call");

  const overridden = mergeSourceTraceMetadata(trace, {
    source_kind: "email",
    source_system: "outlook",
    source_trace: { connector_type: "outlook" },
  });
  assert.equal(overridden.source_system, "outlook", "intentional overrides still apply");
  assert.equal((overridden.source_trace as Record<string, unknown>).connector_type, "outlook");
  assert.equal(
    (overridden.source_trace as Record<string, unknown>).external_id,
    "recall:transcript-42",
    "non-overridden trace fields stay intact",
  );

  const noOverride = mergeSourceTraceMetadata(trace, undefined);
  assert.deepEqual(noOverride.source_trace, trace.source_trace, "missing override is a no-op");
}

async function runManualIngestionRegression() {
  const brain = await createBrain({
    name: "Audit Manual Ingestion Brain",
    kind: "company",
    thesis: "Audit manual ingestion still creates traceable sources after the merge fix.",
  });
  const ingested = await ingestSourceIntoBrain({
    brainId: brain.id,
    title: "Naveen + PB sync notes",
    type: "note",
    content: "PB pushed for tighter dedupe. Naveen agreed to add Drive caps and a category guard for Outlook.",
    externalUri: undefined,
    metadata: {
      source_trace: { caller_note: "manual_paste" },
      domain_type: "internal_sync",
    },
  });
  const sourceItem = ingested.sourceItem;
  const trace = sourceItem.metadata?.source_trace as Record<string, unknown> | undefined;
  assert.equal(trace?.source_system, "manual_ingest");
  assert.equal(trace?.caller_note, "manual_paste", "manual caller trace fields are merged in");
  assert.equal(sourceItem.metadata?.source_system, "manual_ingest");
  assert.equal(sourceItem.metadata?.domain_type, "internal_sync");
}

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenaiApiKey = process.env.OPENAI_API_KEY;
  delete process.env.DATABASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  resetRepositoryForTests();
  resetAiClientForTests();

  try {
    runFilenameParserCases();
    runMeetingUrlExtraction();
    runTraceMergePreservation();
    await runDriveSafetyCases();
    await runOutlookCategoryGuard();
    await runAlwaysOnSourceSystemDefault();
    await runManualIngestionRegression();
    console.log("Ingestion audit verification passed.");
  } finally {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalAnthropicApiKey) process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    if (originalOpenaiApiKey) process.env.OPENAI_API_KEY = originalOpenaiApiKey;
    resetRepositoryForTests();
    resetAiClientForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
