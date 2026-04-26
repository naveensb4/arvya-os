import { createHash } from "node:crypto";
import { getRepository, type ConnectorConfig, type ConnectorType } from "@/lib/db/repository";
import { processSourceItemIntoBrain } from "@/lib/workflows/source-ingestion";

export type EmailConnectorSyncResult = {
  itemsFound: number;
  itemsIngested: number;
  itemsSkipped: number;
  itemsFailed: number;
  sourceItemIds: string[];
  skippedItems: Array<{ externalId: string; title: string; reason: string }>;
  failedItems: Array<{ externalId: string; title: string; error: string }>;
};

export type EmailSourceInput = {
  config: ConnectorConfig;
  connectorType: Extract<ConnectorType, "gmail" | "outlook">;
  externalId: string;
  title: string;
  content: string;
  externalUri?: string;
  metadata: Record<string, unknown>;
};

export function newEmailSyncResult(): EmailConnectorSyncResult {
  return {
    itemsFound: 0,
    itemsIngested: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
    sourceItemIds: [],
    skippedItems: [],
    failedItems: [],
  };
}

export function hashEmailContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

export function listConfigStrings(config: ConnectorConfig, keys: string[]) {
  for (const key of keys) {
    const raw = config.config[key];
    if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
    if (typeof raw === "string") {
      return raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

export function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

async function hasDuplicateEmailSource(input: {
  brainId: string;
  connectorType: "gmail" | "outlook";
  externalId: string;
  hash: string;
}) {
  const sources = await getRepository().listSourceItems(input.brainId);
  return sources.find((source) => {
    const metadata = source.metadata ?? {};
    return (
      metadata.connector_type === input.connectorType &&
      (metadata.external_id === input.externalId || metadata.content_hash === input.hash)
    );
  });
}

export async function createEmailSource(input: EmailSourceInput) {
  const repository = getRepository();
  const hash = hashEmailContent(input.content);
  const duplicate = await hasDuplicateEmailSource({
    brainId: input.config.brainId,
    connectorType: input.connectorType,
    externalId: input.externalId,
    hash,
  });
  if (duplicate) {
    await processSourceItemIntoBrain({
      brainId: input.config.brainId,
      sourceItemId: duplicate.id,
    });
    return { duplicate: true, sourceItem: duplicate, ingested: null };
  }

  const sourceItem = await repository.createSourceItem({
    brainId: input.config.brainId,
    type: "email",
    title: input.title,
    content: input.content,
    externalUri: input.externalUri,
    metadata: {
      source_kind: "email",
      domain_type: "email",
      connector_type: input.connectorType,
      connector_config_id: input.config.id,
      external_id: input.externalId,
      content_hash: hash,
      ...input.metadata,
    },
  });

  const ingested = await processSourceItemIntoBrain({
    brainId: input.config.brainId,
    sourceItemId: sourceItem.id,
  });

  await repository.createBrainAlert({
    brainId: input.config.brainId,
    alertType: "important_new_source_processed",
    title: `${input.connectorType === "gmail" ? "Gmail" : "Outlook"} email processed`,
    description: sourceItem.title,
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

export function encodeOAuthState(input: { brainId: string; connectorConfigId: string }) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

export function decodeOAuthState(value: string) {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
    brainId?: string;
    connectorConfigId?: string;
  };
  if (!parsed.brainId || !parsed.connectorConfigId) throw new Error("Invalid OAuth state.");
  return { brainId: parsed.brainId, connectorConfigId: parsed.connectorConfigId };
}
