import { generateDailyFounderBrief } from "@/lib/brain/store";
import { syncGmailConnector, type GmailClient } from "@/lib/connectors/gmail";
import { syncGoogleDriveConnector, type GoogleDriveClient } from "@/lib/connectors/google-drive";
import { syncOutlookConnector, type OutlookClient } from "@/lib/connectors/outlook";
import { listSlackChannels, syncChannelHistory, type SlackConfig } from "@/lib/connectors/slack";
import type { MemoryObject, OpenLoop, SourceItem } from "@arvya/core";
import { getRepository, type BrainAlertSeverity, type ConnectorConfig, type ConnectorType } from "@/lib/db/repository";
import { processSourceItemIntoBrain } from "@/lib/workflows/source-ingestion";
import {
  buildDedupeKeys,
  buildSourceTraceMetadata,
  hashNormalizedSourceContent,
  mergeSourceTraceMetadata,
  normalizeSourceContent,
  sourceFingerprint,
  sourceMatchesFingerprint,
} from "@/lib/workflows/source-normalization";

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
const terminalOpenLoopStatuses = new Set(["done", "dismissed", "closed"]);
const activeOpenLoopStatuses = new Set(["open", "in_progress", "waiting"]);
const alignmentStopWords = new Set([
  "about",
  "after",
  "again",
  "before",
  "build",
  "company",
  "could",
  "from",
  "have",
  "into",
  "more",
  "next",
  "naveen",
  "should",
  "that",
  "their",
  "there",
  "this",
  "with",
  "work",
  "would",
]);

export const CONNECTOR_TYPES: ConnectorType[] = [
  "slack",
  "google_drive",
  "gmail",
  "outlook",
  "onedrive",
  "recall",
  "mock",
];

function nowIso() {
  return new Date().toISOString();
}

function todayKey() {
  return nowIso().slice(0, 10);
}

function textTokens(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 3 && !alignmentStopWords.has(token)),
    ),
  );
}

function relatedEnough(target: string, candidate: string) {
  const targetTokens = textTokens(target);
  if (targetTokens.length === 0) return false;
  const candidateTokens = new Set(textTokens(candidate));
  const matches = targetTokens.filter((token) => candidateTokens.has(token)).length;
  return matches >= 2 || matches / Math.min(targetTokens.length, 6) >= 0.34;
}

function openLoopText(loop: OpenLoop) {
  return [
    loop.title,
    loop.description,
    loop.suggestedAction,
    loop.owner,
    loop.sourceQuote,
    loop.outcome,
  ].filter(Boolean).join(" ");
}

function memoryText(memory: MemoryObject) {
  return [memory.name, memory.description, memory.sourceQuote].filter(Boolean).join(" ");
}

function isActiveLoop(loop: OpenLoop) {
  return activeOpenLoopStatuses.has(loop.status);
}

function isClosedLoop(loop: OpenLoop) {
  return terminalOpenLoopStatuses.has(loop.status);
}

function latestSourceByDomain(sources: SourceItem[], domainType: string) {
  return sources
    .filter((source) => source.metadata?.domain_type === domainType)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

function extractPriorityTexts(latestDailyBrief?: SourceItem) {
  if (!latestDailyBrief) return [];
  const structuredBrief = latestDailyBrief.metadata?.structured_brief as
    | { priorities?: Array<{ title?: unknown; detail?: unknown }> }
    | undefined;
  const structuredPriorities = structuredBrief?.priorities
    ?.map((priority) => [priority.title, priority.detail].filter((value): value is string => typeof value === "string").join(": "))
    .filter((priority) => priority.trim().length > 0);
  if (structuredPriorities?.length) return structuredPriorities;

  const prioritiesBlock = latestDailyBrief.content.split(/\n\nNew loops to review:/)[0]?.split(/\n\nPriorities:\n/)[1];
  return prioritiesBlock
    ? prioritiesBlock
        .split("\n")
        .map((line) => line.replace(/^-\s*/, "").trim())
        .filter(Boolean)
    : [];
}

function hasRelatedActiveLoop(text: string, loops: OpenLoop[], loopTypes?: Set<OpenLoop["loopType"]>) {
  return loops.some((loop) =>
    isActiveLoop(loop) &&
    (!loopTypes || loopTypes.has(loop.loopType)) &&
    relatedEnough(text, openLoopText(loop)),
  );
}

type AlignmentFinding = {
  alertType: string;
  title: string;
  description: string;
  severity: BrainAlertSeverity;
};

function createAlignmentFindings(input: {
  memoryObjects: MemoryObject[];
  openLoops: OpenLoop[];
  sourceItems: SourceItem[];
}) {
  const findings: AlignmentFinding[] = [];
  const latestDailyBrief = latestSourceByDomain(input.sourceItems, "daily_brief");
  const priorityTexts = extractPriorityTexts(latestDailyBrief);
  const activeLoops = input.openLoops.filter(isActiveLoop);

  for (const priorityText of priorityTexts.slice(0, 6)) {
    if (hasRelatedActiveLoop(priorityText, activeLoops)) continue;
    findings.push({
      alertType: "strategic_priority_drift",
      title: `Priority has no active loop: ${priorityText.split(":")[0].slice(0, 96)}`,
      description: `The latest daily brief names this priority, but no active open loop appears related: ${priorityText}`,
      severity: "warning",
    });
  }

  const trackedCommitmentTypes = new Set<OpenLoop["loopType"]>(["follow_up", "product", "sales", "investor", "engineering", "deal", "diligence", "crm", "other"]);
  const openCommitments = input.memoryObjects.filter(
    (memory) => memory.objectType === "commitment" && memory.status !== "done" && memory.status !== "closed",
  );
  for (const commitment of openCommitments.slice(0, 8)) {
    const text = memoryText(commitment);
    if (hasRelatedActiveLoop(text, input.openLoops, trackedCommitmentTypes)) continue;
    findings.push({
      alertType: "commitment_without_active_loop",
      title: `Commitment lacks an active loop: ${commitment.name.slice(0, 96)}`,
      description: commitment.description,
      severity: "warning",
    });
  }

  const productLoopTypes = new Set<OpenLoop["loopType"]>(["product", "engineering", "marketing"]);
  const productInsights = input.memoryObjects.filter((memory) =>
    ["product_insight", "insight"].includes(memory.objectType) &&
    memory.properties?.memory_source !== "open_loop_outcome" &&
    memory.status !== "done" &&
    memory.status !== "closed",
  );
  for (const insight of productInsights.slice(0, 8)) {
    const text = memoryText(insight);
    if (hasRelatedActiveLoop(text, input.openLoops, productLoopTypes)) continue;
    findings.push({
      alertType: "insight_without_product_loop",
      title: `Insight has no product loop: ${insight.name.slice(0, 96)}`,
      description: insight.description,
      severity: "info",
    });
  }

  const recentlyClosedWithoutOutcome = input.openLoops.filter((loop) => isClosedLoop(loop) && !loop.outcome?.trim());
  for (const loop of recentlyClosedWithoutOutcome.slice(0, 5)) {
    findings.push({
      alertType: "closed_loop_missing_outcome",
      title: `Closed loop is missing an outcome: ${loop.title.slice(0, 96)}`,
      description: "Terminal loops need an outcome so the company Brain can learn from what happened.",
      severity: "warning",
    });
  }

  return findings.slice(0, 20);
}

function alignmentReportContent(input: {
  brainName: string;
  findings: AlignmentFinding[];
  openLoops: OpenLoop[];
  memoryObjects: MemoryObject[];
}) {
  const activeCount = input.openLoops.filter(isActiveLoop).length;
  const closedWithOutcomeCount = input.openLoops.filter((loop) => isClosedLoop(loop) && Boolean(loop.outcome?.trim())).length;
  const outcomeLearningCount = input.memoryObjects.filter((memory) => memory.properties?.memory_source === "open_loop_outcome").length;

  return [
    `Closed-Loop Alignment Report - ${input.brainName}`,
    "",
    `Active loops: ${activeCount}`,
    `Closed loops with outcomes: ${closedWithOutcomeCount}`,
    `Outcome memories: ${outcomeLearningCount}`,
    `Alignment findings: ${input.findings.length}`,
    "",
    "Findings:",
    ...(input.findings.length
      ? input.findings.map((finding) => `- [${finding.severity}] ${finding.title}: ${finding.description}`)
      : ["- No alignment gaps detected."]),
  ].join("\n");
}

function contentHash(content: string) {
  return hashNormalizedSourceContent(content);
}

function minutesSince(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return Number.POSITIVE_INFINITY;
  return (Date.now() - timestamp) / 60000;
}

function shouldRunConnector(config: ConnectorConfig) {
  if (!config.syncEnabled || config.status === "paused") return false;
  if (["google_drive", "gmail", "outlook", "slack"].includes(config.connectorType) && config.status !== "connected") return false;
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
  title: string;
  content: string;
  externalUri?: string;
  metadata: Record<string, unknown>;
}) {
  const repository = getRepository();
  const sources = await repository.listSourceItems(input.brainId);
  const fingerprint = sourceFingerprint({
    title: input.title,
    content: input.content,
    externalUri: input.externalUri,
    metadata: input.metadata,
  });
  return sources.find((source) => sourceMatchesFingerprint(source, fingerprint, { connectorScoped: true }));
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
  const normalizedContent = normalizeSourceContent(input.content);
  const hash = contentHash(normalizedContent);
  const traceMetadata = buildSourceTraceMetadata({
    sourceKind: input.sourceType ?? "note",
    sourceSystem: input.config.connectorType,
    connectorType: input.config.connectorType,
    connectorConfigId: input.config.id,
    externalId: input.externalId,
    externalUri: input.externalUri,
    originalTitle: input.title,
  });
  const metadata = mergeSourceTraceMetadata(traceMetadata, {
    content_hash: hash,
    source_content_hash: hash,
    domain_type: input.domainType,
    always_on_ingested_at: nowIso(),
  });
  const fingerprint = sourceFingerprint({
    title: input.title,
    content: normalizedContent,
    externalUri: input.externalUri,
    metadata,
  });
  const duplicate = await hasDuplicateSource({
    brainId: input.config.brainId,
    connectorType: input.config.connectorType,
    externalId: input.externalId,
    title: input.title,
    content: normalizedContent,
    externalUri: input.externalUri,
    metadata,
  });
  if (duplicate) {
    return { duplicate: true, sourceItem: duplicate, ingested: null };
  }

  const sourceItem = await repository.createSourceItem({
    brainId: input.config.brainId,
    title: input.title,
    type: input.sourceType ?? "note",
    content: normalizedContent,
    externalUri: input.externalUri,
    metadata: {
      ...metadata,
      dedupe_keys: buildDedupeKeys(fingerprint),
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

type SlackSyncResult = {
  itemsFound: number;
  itemsIngested: number;
  itemsSkipped: number;
  itemsFailed: number;
  sourceItemIds: string[];
  nextWatermark?: string;
};

async function syncSlackConnector(config: ConnectorConfig): Promise<SlackSyncResult> {
  const credentials = config.credentials as SlackConfig | null;
  if (!credentials?.botToken) throw new Error("Slack is not connected. No bot token found.");
  const channels = await listSlackChannels(credentials.botToken);
  const since = typeof config.config.watermark === "string" ? config.config.watermark : undefined;
  const result: SlackSyncResult = { itemsFound: 0, itemsIngested: 0, itemsSkipped: 0, itemsFailed: 0, sourceItemIds: [] };
  let nextWatermark = since;

  for (const channel of channels) {
    try {
      const messages = await syncChannelHistory(credentials.botToken, channel.id, since);
      result.itemsFound += messages.length;
      if (messages.length === 0) continue;

      const grouped = new Map<string, typeof messages>();
      for (const msg of messages) {
        const day = new Date(Number(msg.ts) * 1000).toISOString().slice(0, 10);
        const key = `${channel.id}:${day}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(msg);
        if (!nextWatermark || msg.ts > nextWatermark) nextWatermark = msg.ts;
      }

      for (const [key, dayMessages] of grouped) {
        const [, day] = key.split(":");
        const title = `#${channel.name} — ${day}`;
        const content = dayMessages.map((m) => `${m.user}: ${m.text}`).join("\n");
        const externalId = `slack:${config.config.teamId ?? "team"}:${channel.id}:${day}`;
        const created = await createConnectorSource({
          config,
          title,
          content,
          externalId,
          domainType: "slack_message",
          sourceType: "note",
        });
        if (created.duplicate) {
          result.itemsSkipped += dayMessages.length;
        } else {
          result.itemsIngested += dayMessages.length;
          result.sourceItemIds.push(created.sourceItem.id);
        }
      }
    } catch (err) {
      result.itemsFailed += 1;
      console.error(`[slack-sync] Failed to sync channel #${channel.name}:`, err);
    }
  }

  if (nextWatermark) result.nextWatermark = nextWatermark;
  return result;
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
    if (config.connectorType === "google_drive" || config.connectorType === "gmail" || config.connectorType === "outlook" || config.connectorType === "slack") {
      const synced = config.connectorType === "google_drive"
        ? await syncGoogleDriveConnector(config, options.googleDriveClient)
        : config.connectorType === "gmail"
          ? await syncGmailConnector(config, options.gmailClient)
          : config.connectorType === "slack"
            ? await syncSlackConnector(config)
            : await syncOutlookConnector(config, options.outlookClient);
      const syncedAny = synced as Record<string, unknown>;
      await repository.updateConnectorSyncRun(run.id, {
        status: "completed",
        completedAt: nowIso(),
        itemsFound: synced.itemsFound,
        itemsIngested: synced.itemsIngested,
        itemsSkipped: synced.itemsSkipped,
        metadata: {
          sourceItemIds: synced.sourceItemIds,
          itemsFailed: synced.itemsFailed,
          skippedItems: syncedAny.skippedItems ?? syncedAny.skippedFiles ?? [],
          failedItems: syncedAny.failedItems ?? syncedAny.failedFiles ?? [],
        },
      });
      const nextWatermark = "nextWatermark" in synced ? synced.nextWatermark : undefined;
      const mergedConfig = {
        ...config.config,
        ...(nextWatermark ? { watermark: nextWatermark } : {}),
        ...(config.config.mode === "onboarding" ? { mode: "live", maxItemTestMode: true } : {}),
      };
      await repository.updateConnectorConfig(config.id, {
        lastSyncAt: nowIso(),
        lastSuccessAt: synced.itemsFailed === 0 ? nowIso() : config.lastSuccessAt ?? null,
        lastError: synced.itemsFailed === 0 ? null : `${synced.itemsFailed} ${humanConnectorName(config.connectorType)} item(s) failed to sync.`,
        status: "connected",
        config: mergedConfig,
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

/**
 * @deprecated 2026-05-09. Replaced by the smart nudger in
 * apps/web/lib/slack-bot/nudge.ts. The old monitor only fired
 * `overdue_open_loop` brain_alerts AFTER a loop slipped, never notified
 * anyone, and never closed loops. The new path posts pre-deadline /
 * stale / outcome-uncertain prompts to the auto-created #arvya-brain
 * Slack channel with interactive buttons. Kept for now because eval
 * scripts (verify-always-on.ts) still reference it.
 */
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

export async function runClosedLoopAlignmentMonitor() {
  const repository = getRepository();
  const brains = await repository.listBrains();
  const reportDate = todayKey();
  let alertsCreated = 0;
  let reportsStored = 0;
  let findingsDetected = 0;

  for (const brain of brains.filter((item) => item.kind === "company")) {
    const [memoryObjects, openLoops, sourceItems, existingAlerts] = await Promise.all([
      repository.listMemoryObjects(brain.id),
      repository.listOpenLoops(brain.id),
      repository.listSourceItems(brain.id),
      repository.listBrainAlerts({ brainId: brain.id, limit: 500 }),
    ]);
    const findings = createAlignmentFindings({ memoryObjects, openLoops, sourceItems });
    findingsDetected += findings.length;

    const existingAlertKeys = new Set(
      existingAlerts
        .filter((alert) => alert.status !== "dismissed")
        .map((alert) => `${alert.alertType}:${alert.title}`),
    );
    for (const finding of findings) {
      const key = `${finding.alertType}:${finding.title}`;
      if (existingAlertKeys.has(key)) continue;
      await repository.createBrainAlert({
        brainId: brain.id,
        alertType: finding.alertType,
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
      });
      existingAlertKeys.add(key);
      alertsCreated += 1;
    }

    const existingReport = sourceItems.find(
      (source) =>
        source.metadata?.domain_type === "closed_loop_alignment_report" &&
        source.metadata?.report_date === reportDate,
    );
    if (existingReport) continue;
    await repository.createSourceItem({
      brainId: brain.id,
      title: `Closed-Loop Alignment Report - ${reportDate}`,
      type: "strategy_output",
      content: alignmentReportContent({
        brainName: brain.name,
        findings,
        openLoops,
        memoryObjects,
      }),
      metadata: {
        domain_type: "closed_loop_alignment_report",
        report_date: reportDate,
        generated_at: nowIso(),
        findings_count: findings.length,
        findings,
      },
    });
    reportsStored += 1;
  }

  return { alertsCreated, reportsStored, findingsDetected };
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
        structured_brief: brief,
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
  const brainId = brainIdFromPayload;
  if (!brainId) throw new Error("Recall webhook payload requires brainId so transcript ingestion is traceable to the correct Brain.");

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

export async function runMeetingPrepBatch() {
  const repository = getRepository();
  const brains = await repository.listBrains();
  const now = new Date();

  let totalPrepped = 0;
  for (const brain of brains) {
    const config = (brain.metadata ?? {}) as Record<string, unknown>;
    if (config.meeting_prep_enabled !== true) continue;

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const meetings = await repository.listNotetakerMeetings({
      brainId: brain.id,
      from: todayStart.toISOString(),
      to: todayEnd.toISOString(),
    });

    if (meetings.length === 0) continue;

    const { wasMeetingPreppedForBrain, runMeetingPrep, IdempotencyHitError } = await import("@/lib/agents/meeting-prep");

    for (const meeting of meetings) {
      try {
        const alreadyPrepped = await wasMeetingPreppedForBrain(brain.id, meeting.id);
        if (alreadyPrepped) continue;

        await runMeetingPrep(brain.id, meeting.id, { skipIdempotency: true });
        totalPrepped++;
      } catch (error) {
        if (error instanceof IdempotencyHitError) continue;
        console.error(`[meeting-prep-batch] Failed for meeting ${meeting.id}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  return { totalPrepped };
}

export async function runMeetingPrep30Min() {
  const repository = getRepository();
  const brains = await repository.listBrains();
  const now = Date.now();
  const windowStart = new Date(now + 25 * 60 * 1000);
  const windowEnd = new Date(now + 35 * 60 * 1000);

  let totalPrepped = 0;
  for (const brain of brains) {
    const config = (brain.metadata ?? {}) as Record<string, unknown>;
    if (config.meeting_prep_enabled !== true) continue;

    const meetings = await repository.listNotetakerMeetings({
      brainId: brain.id,
      from: windowStart.toISOString(),
      to: windowEnd.toISOString(),
    });

    const { runMeetingPrep, IdempotencyHitError } = await import("@/lib/agents/meeting-prep");

    for (const meeting of meetings) {
      const meetingStart = new Date(meeting.startTime).getTime();
      const cutoff = meetingStart - 40 * 60 * 1000;

      const existingDocs = await repository.listBrainDocs(brain.id, {
        meetingId: meeting.id,
        docType: "meeting_prep",
        limit: 1,
      });
      const recentDoc = existingDocs.find(
        (d) => new Date(d.createdAt).getTime() > cutoff,
      );
      if (recentDoc) continue;

      try {
        await runMeetingPrep(brain.id, meeting.id, { skipIdempotency: true });
        totalPrepped++;
      } catch (error) {
        if (error instanceof IdempotencyHitError) continue;
        console.error(`[meeting-prep-30min] Failed for meeting ${meeting.id}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  return { totalPrepped };
}

export async function runMeetingPrepDeltaWatch() {
  const repository = getRepository();
  const brains = await repository.listBrains();
  const now = new Date();
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);

  let totalRegenerated = 0;
  for (const brain of brains) {
    const config = (brain.metadata ?? {}) as Record<string, unknown>;
    if (config.meeting_prep_enabled !== true) continue;

    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const meetings = await repository.listNotetakerMeetings({
      brainId: brain.id,
      from: now.toISOString(),
      to: todayEnd.toISOString(),
    });

    const runs = await repository.listAgentRuns(brain.id, 200);
    const { runMeetingPrep, getRegenCount } = await import("@/lib/agents/meeting-prep");

    for (const meeting of meetings) {
      const prepDocs = await repository.listBrainDocs(brain.id, {
        meetingId: meeting.id,
        docType: "meeting_prep",
        limit: 1,
      });
      if (prepDocs.length === 0) continue;

      const regenCount = getRegenCount(brain.id, meeting.id, runs);
      if (regenCount >= 3) continue;

      const recentSources = await repository.listSourceItems(brain.id, { limit: 50 });
      const newSourcesSinceLastPrep = recentSources.filter(
        (s) => new Date(s.createdAt) > fifteenMinAgo,
      );

      const participants = meeting.participants as Array<Record<string, unknown>> | undefined;
      const attendeeEmails = (participants ?? [])
        .map((p) => (p.email as string)?.toLowerCase())
        .filter(Boolean);
      const attendeeNames = (participants ?? [])
        .map((p) => ((p.name as string) ?? "").toLowerCase())
        .filter(Boolean);

      const hasMaterialDelta = newSourcesSinceLastPrep.some((source) => {
        const content = `${source.title} ${source.content}`.toLowerCase();
        return (
          attendeeEmails.some((email) => content.includes(email)) ||
          attendeeNames.some((name) => content.includes(name))
        );
      });

      if (!hasMaterialDelta) continue;

      const slackTs = (prepDocs[0].content as Record<string, unknown>)?.slack_message_ts as string | undefined;

      try {
        await runMeetingPrep(brain.id, meeting.id, {
          skipIdempotency: true,
          regenCount: regenCount + 1,
          existingSlackTs: slackTs,
        });
        totalRegenerated++;
      } catch (error) {
        console.error(`[meeting-prep-delta] Failed for meeting ${meeting.id}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  return { totalRegenerated };
}
