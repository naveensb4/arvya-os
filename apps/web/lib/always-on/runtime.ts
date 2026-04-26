import { createHash } from "node:crypto";
import { generateDailyFounderBrief } from "@/lib/brain/store";
import { syncGmailConnector, type GmailClient } from "@/lib/connectors/gmail";
import { syncGoogleDriveConnector, type GoogleDriveClient } from "@/lib/connectors/google-drive";
import { syncOutlookConnector, type OutlookClient } from "@/lib/connectors/outlook";
import { getRepository, type ConnectorConfig, type ConnectorType } from "@/lib/db/repository";
import { processSourceItemIntoBrain } from "@/lib/workflows/source-ingestion";

export type ConnectorSyncSummary = {
  connectorConfigId: string;
  connectorType: ConnectorType;
  status: "completed" | "failed" | "skipped";
  itemsFound: number;
  itemsIngested: number;
  itemsSkipped: number;
  itemsFailed: number;
  error?: string;
};

const DEFAULT_SYNC_INTERVAL_MINUTES = 10;

export const CONNECTOR_TYPES: ConnectorType[] = [
  "google_drive",
  "gmail",
  "outlook",
  "recall",
  "mock",
];

function nowIso() {
  return new Date().toISOString();
}

function contentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function minutesSince(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return Number.POSITIVE_INFINITY;
  return (Date.now() - timestamp) / 60000;
}

function shouldRunConnector(config: ConnectorConfig) {
  if (!config.syncEnabled || config.status === "paused") return false;
  if (["google_drive", "gmail", "outlook"].includes(config.connectorType) && config.status !== "connected") return false;
  const interval = config.syncIntervalMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES;
  return minutesSince(config.lastSyncAt) >= interval;
}

function humanConnectorName(type: ConnectorType) {
  return type
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

async function hasDuplicateSource(input: {
  brainId: string;
  connectorType: ConnectorType;
  externalId: string;
  hash: string;
}) {
  const repository = getRepository();
  const sources = await repository.listSourceItems(input.brainId);
  return sources.find((source) => {
    const metadata = source.metadata ?? {};
    return (
      metadata.connector_type === input.connectorType &&
      (metadata.external_id === input.externalId || metadata.content_hash === input.hash)
    );
  });
}

async function createConnectorSource(input: {
  config: ConnectorConfig;
  title: string;
  content: string;
  externalId: string;
  externalUri?: string;
  domainType: string;
  sourceType?: "transcript" | "email" | "note" | "document";
}) {
  const repository = getRepository();
  const hash = contentHash(input.content);
  const duplicate = await hasDuplicateSource({
    brainId: input.config.brainId,
    connectorType: input.config.connectorType,
    externalId: input.externalId,
    hash,
  });
  if (duplicate) {
    return { duplicate: true, sourceItem: duplicate, ingested: null };
  }

  const sourceItem = await repository.createSourceItem({
    brainId: input.config.brainId,
    title: input.title,
    type: input.sourceType ?? "note",
    content: input.content,
    externalUri: input.externalUri,
    metadata: {
      connector_type: input.config.connectorType,
      connector_config_id: input.config.id,
      external_id: input.externalId,
      content_hash: hash,
      domain_type: input.domainType,
      always_on_ingested_at: nowIso(),
    },
  });
  const ingested = await processSourceItemIntoBrain({
    brainId: input.config.brainId,
    sourceItemId: sourceItem.id,
  });

  await repository.createBrainAlert({
    brainId: input.config.brainId,
    alertType: "important_new_source_processed",
    title: `${humanConnectorName(input.config.connectorType)} source processed`,
    description: input.title,
    severity: "info",
    sourceId: sourceItem.id,
  });

  for (const loop of ingested.openLoops) {
    if (loop.priority === "high" || loop.priority === "critical") {
      await repository.createBrainAlert({
        brainId: input.config.brainId,
        alertType: "high_priority_open_loop_created",
        title: loop.title,
        description: loop.description,
        severity: loop.priority === "critical" ? "critical" : "warning",
        sourceId: sourceItem.id,
        openLoopId: loop.id,
      });
    }
  }

  return { duplicate: false, sourceItem, ingested };
}

function verifierContent(config: ConnectorConfig) {
  const connector = humanConnectorName(config.connectorType);
  return [
    `${connector} always-on verifier for Arvya OS.`,
    "Naveen should review this connector setup with PB and confirm the exact folders, labels, or categories before broad ingestion.",
    "Do not auto-send email. Keep the dashboard as the approval cockpit.",
    "Follow up on the connector OAuth and duplicate-protection requirements before production use.",
  ].join("\n");
}

export async function ensureDefaultConnectorConfigs(brainId: string) {
  const repository = getRepository();
  const existing = await repository.listConnectorConfigs(brainId);
  const created: ConnectorConfig[] = [];

  for (const connectorType of CONNECTOR_TYPES) {
    if (existing.some((config) => config.connectorType === connectorType)) continue;
    created.push(
      await repository.createConnectorConfig({
        brainId,
        connectorType,
        status: "active",
        syncEnabled: connectorType === "mock",
        syncIntervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
        config: {
          mode: connectorType === "mock" ? "mock_source" : "mock_verifier",
          note: "OAuth is not connected yet. Scheduled runtime wiring is ready.",
        },
      }),
    );
  }

  return [...existing, ...created];
}

export async function upsertConnectorConfig(input: {
  brainId: string;
  connectorType: ConnectorType;
  syncEnabled: boolean;
  syncIntervalMinutes: number;
  config?: Record<string, unknown>;
}) {
  const repository = getRepository();
  const configs = await ensureDefaultConnectorConfigs(input.brainId);
  const existing = configs.find((config) => config.connectorType === input.connectorType);
  if (!existing) {
    return repository.createConnectorConfig({
      brainId: input.brainId,
      connectorType: input.connectorType,
      syncEnabled: input.syncEnabled,
      syncIntervalMinutes: input.syncIntervalMinutes,
      config: input.config ?? {},
    });
  }

  return repository.updateConnectorConfig(existing.id, {
    syncEnabled: input.syncEnabled,
    syncIntervalMinutes: input.syncIntervalMinutes,
    status: existing.status === "connected" ? "connected" : "active",
    config: input.config ? { ...existing.config, ...input.config } : existing.config,
    lastError: null,
  });
}

export async function syncConnectorConfig(
  config: ConnectorConfig,
  options: {
    googleDriveClient?: GoogleDriveClient;
    gmailClient?: GmailClient;
    outlookClient?: OutlookClient;
  } = {},
): Promise<ConnectorSyncSummary> {
  const repository = getRepository();
  const startedAt = nowIso();
  const run = await repository.createConnectorSyncRun({
    brainId: config.brainId,
    connectorConfigId: config.id,
    connectorType: config.connectorType,
    status: "started",
    metadata: { startedAt, mode: config.config.mode ?? "mock_verifier" },
  });

  try {
    if (config.connectorType === "google_drive" || config.connectorType === "gmail" || config.connectorType === "outlook") {
      const synced = config.connectorType === "google_drive"
        ? await syncGoogleDriveConnector(config, options.googleDriveClient)
        : config.connectorType === "gmail"
          ? await syncGmailConnector(config, options.gmailClient)
          : await syncOutlookConnector(config, options.outlookClient);
      await repository.updateConnectorSyncRun(run.id, {
        status: "completed",
        completedAt: nowIso(),
        itemsFound: synced.itemsFound,
        itemsIngested: synced.itemsIngested,
        itemsSkipped: synced.itemsSkipped,
        metadata: {
          sourceItemIds: synced.sourceItemIds,
          itemsFailed: synced.itemsFailed,
          skippedItems: "skippedItems" in synced ? synced.skippedItems : synced.skippedFiles,
          failedItems: "failedItems" in synced ? synced.failedItems : synced.failedFiles,
        },
      });
      await repository.updateConnectorConfig(config.id, {
        lastSyncAt: nowIso(),
        lastSuccessAt: synced.itemsFailed === 0 ? nowIso() : config.lastSuccessAt ?? null,
        lastError: synced.itemsFailed === 0 ? null : `${synced.itemsFailed} ${humanConnectorName(config.connectorType)} item(s) failed to sync.`,
        status: "connected",
      });
      return {
        connectorConfigId: config.id,
        connectorType: config.connectorType,
        status: "completed",
        itemsFound: synced.itemsFound,
        itemsIngested: synced.itemsIngested,
        itemsSkipped: synced.itemsSkipped,
        itemsFailed: synced.itemsFailed,
      };
    }

    const externalId = `${config.connectorType}:verifier:v1`;
    const created = await createConnectorSource({
      config,
      title: `${humanConnectorName(config.connectorType)} always-on verifier`,
      content: verifierContent(config),
      externalId,
      domainType: `${config.connectorType}_verifier`,
      sourceType: "note",
    });
    const itemsFound = 1;
    const itemsSkipped = created.duplicate ? 1 : 0;
    const itemsIngested = created.duplicate ? 0 : 1;
    const itemsFailed = 0;

    await repository.updateConnectorSyncRun(run.id, {
      status: "completed",
      completedAt: nowIso(),
      itemsFound,
      itemsIngested,
      itemsSkipped,
      metadata: {
        sourceItemId: created.sourceItem.id,
        duplicate: created.duplicate,
        itemsFailed,
      },
    });
    await repository.updateConnectorConfig(config.id, {
      lastSyncAt: nowIso(),
      lastSuccessAt: nowIso(),
      lastError: null,
    });
    return {
      connectorConfigId: config.id,
      connectorType: config.connectorType,
      status: "completed",
      itemsFound,
      itemsIngested,
      itemsSkipped,
      itemsFailed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connector sync error";
    await repository.updateConnectorSyncRun(run.id, {
      status: "failed",
      completedAt: nowIso(),
      error: message,
    });
    await repository.updateConnectorConfig(config.id, {
      lastSyncAt: nowIso(),
      lastError: message,
      status: "error",
    });
    await repository.createBrainAlert({
      brainId: config.brainId,
      alertType: "failed_connector_sync",
      title: `${humanConnectorName(config.connectorType)} sync failed`,
      description: message,
      severity: "error",
    });
    return {
      connectorConfigId: config.id,
      connectorType: config.connectorType,
      status: "failed",
      itemsFound: 0,
      itemsIngested: 0,
      itemsSkipped: 0,
      itemsFailed: 0,
      error: message,
    };
  }
}

export async function runScheduledConnectorSync() {
  const repository = getRepository();
  const configs = await repository.listConnectorConfigs();
  const eligible = configs.filter(shouldRunConnector);
  const summaries: ConnectorSyncSummary[] = [];

  for (const config of eligible) {
    summaries.push(await syncConnectorConfig(config));
  }

  return summaries;
}

export async function syncConnectorNow(input: { brainId: string; connectorConfigId: string }) {
  const repository = getRepository();
  const configs = await repository.listConnectorConfigs(input.brainId);
  const config = configs.find((item) => item.id === input.connectorConfigId);
  if (!config) throw new Error(`Connector config not found: ${input.connectorConfigId}`);
  return syncConnectorConfig(config);
}

export async function runSourceIngested(input: { brainId: string; sourceItemId: string }) {
  return processSourceItemIntoBrain(input);
}

export async function runOpenLoopMonitor() {
  const repository = getRepository();
  const brains = await repository.listBrains();
  let alertsCreated = 0;

  for (const brain of brains) {
    const loops = await repository.listOpenLoops(brain.id);
    const existingAlerts = await repository.listBrainAlerts({ brainId: brain.id, limit: 200 });
    const alertedLoopIds = new Set(
      existingAlerts
        .filter((alert) => alert.alertType === "overdue_open_loop")
        .map((alert) => alert.openLoopId)
        .filter(Boolean),
    );

    for (const loop of loops) {
      if (
        !loop.dueDate ||
        loop.status === "needs_review" ||
        loop.status === "done" ||
        loop.status === "dismissed" ||
        loop.status === "closed"
      ) continue;
      if (new Date(loop.dueDate).getTime() > Date.now()) continue;
      if (alertedLoopIds.has(loop.id)) continue;
      await repository.createBrainAlert({
        brainId: brain.id,
        alertType: "overdue_open_loop",
        title: `Overdue: ${loop.title}`,
        description: loop.suggestedAction ?? loop.description,
        severity: loop.priority === "critical" ? "critical" : "warning",
        openLoopId: loop.id,
        sourceId: loop.sourceItemId ?? null,
      });
      alertsCreated += 1;
    }
  }

  return { alertsCreated };
}

export async function runDailyFounderBrief() {
  const repository = getRepository();
  const brains = await repository.listBrains();
  const stored: string[] = [];

  for (const brain of brains.filter((item) => item.kind === "company")) {
    const today = new Date().toISOString().slice(0, 10);
    const existing = (await repository.listSourceItems(brain.id)).find(
      (source) => source.metadata?.domain_type === "daily_brief" && source.metadata?.brief_date === today,
    );
    if (existing) {
      stored.push(existing.id);
      continue;
    }

    const brief = await generateDailyFounderBrief(brain.id);
    const source = await repository.createSourceItem({
      brainId: brain.id,
      title: `Daily Founder Brief - ${today}`,
      type: "strategy_output",
      content: `${brief.headline}\n\n${brief.summary}\n\nPriorities:\n${brief.priorities
        .map((priority) => `- ${priority.title}: ${priority.detail}`)
        .join("\n")}\n\nNew loops to review:\n${brief.loopsToReview
        .map((loop) => `- ${loop.title}: ${loop.description}`)
        .join("\n") || "- None"}`,
      metadata: {
        domain_type: "daily_brief",
        brief_date: today,
        generated_at: brief.generatedAt,
      },
    });
    stored.push(source.id);
  }

  return { stored };
}

export async function runWeeklyLearningMemo() {
  const repository = getRepository();
  const brains = await repository.listBrains();
  const stored: string[] = [];

  for (const brain of brains.filter((item) => item.kind === "company")) {
    const weekKey = new Date().toISOString().slice(0, 10);
    const existing = (await repository.listSourceItems(brain.id)).find(
      (source) => source.metadata?.domain_type === "weekly_learning_memo" && source.metadata?.week_key === weekKey,
    );
    if (existing) {
      stored.push(existing.id);
      continue;
    }

    const [memoryObjects, openLoops, sourceItems] = await Promise.all([
      repository.listMemoryObjects(brain.id),
      repository.listOpenLoops(brain.id),
      repository.listSourceItems(brain.id),
    ]);
    const insights = memoryObjects.filter((memory) =>
      ["insight", "product_insight", "risk", "question", "marketing_idea"].includes(memory.objectType),
    );
    const content = [
      `Weekly Learning Memo - ${brain.name}`,
      "",
      `New sources reviewed: ${sourceItems.length}`,
      `Open loops still active: ${openLoops.filter((loop) => loop.status === "open" || loop.status === "in_progress" || loop.status === "waiting").length}`,
      "",
      "Repeated product insights:",
      ...(insights.slice(0, 8).map((memory) => `- ${memory.name}: ${memory.description}`) || ["- No insights yet."]),
      "",
      "Outreach and objection signals:",
      ...openLoops.slice(0, 8).map((loop) => `- ${loop.title}: ${loop.description}`),
      "",
      "What to build next:",
      "- Tighten always-on connector setup, duplicate protection, and approval workflows before external automation.",
    ].join("\n");
    const source = await repository.createSourceItem({
      brainId: brain.id,
      title: `Weekly Learning Memo - ${weekKey}`,
      type: "strategy_output",
      content,
      metadata: {
        domain_type: "weekly_learning_memo",
        week_key: weekKey,
        generated_at: nowIso(),
      },
    });
    stored.push(source.id);
  }

  return { stored };
}

export async function handleRecallTranscriptWebhook(payload: Record<string, unknown>) {
  const repository = getRepository();
  const brainIdFromPayload = typeof payload.brainId === "string" ? payload.brainId : undefined;
  const brainId = brainIdFromPayload ?? (await repository.listBrains())[0]?.id;
  if (!brainId) throw new Error("No Brain exists for Recall webhook ingestion.");

  const transcriptId =
    String(payload.transcriptId ?? payload.transcript_id ?? payload.meetingId ?? payload.meeting_id ?? "").trim();
  const transcript = String(payload.transcript ?? payload.content ?? payload.text ?? "").trim();
  if (!transcriptId) throw new Error("Recall webhook payload requires transcriptId or meetingId.");
  if (!transcript) throw new Error("Recall webhook payload requires transcript content.");

  const config =
    (await ensureDefaultConnectorConfigs(brainId)).find((item) => item.connectorType === "recall") ??
    (await repository.createConnectorConfig({ brainId, connectorType: "recall", status: "active" }));

  return createConnectorSource({
    config,
    title: String(payload.title ?? payload.meetingTitle ?? `Recall transcript ${transcriptId}`),
    content: transcript,
    externalId: `recall:${transcriptId}`,
    externalUri: typeof payload.url === "string" ? payload.url : undefined,
    domainType: "recall_transcript",
    sourceType: "transcript",
  });
}
