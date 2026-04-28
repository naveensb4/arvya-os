import { getRepository, type ConnectorConfig, type ConnectorType } from "@/lib/db/repository";
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

export type EmailConnectorSyncResult = {
  itemsFound: number;
  itemsIngested: number;
  itemsSkipped: number;
  itemsFailed: number;
  sourceItemIds: string[];
  skippedItems: Array<{ externalId: string; title: string; reason: string }>;
  failedItems: Array<{ externalId: string; title: string; error: string }>;
  /**
   * ISO timestamp of the latest provider-side message we observed.
   * The runtime persists this back into ConnectorConfig.config.watermark
   * so the next sync can request only newer items.
   */
  nextWatermark?: string;
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

const DEFAULT_ARYVA_EMAIL_KEYWORDS = ["arvya", "aryva"];
const DEFAULT_ARYVA_EMAIL_DOMAINS = ["arvya.ai", "aryva.ai"];

export type EmailRelevanceDecision = {
  matches: boolean;
  reason: string;
  matchedTerms: string[];
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

function configStringList(config: ConnectorConfig, keys: string[], fallback: string[]) {
  const configured = listConfigStrings(config, keys);
  return configured.length > 0 ? configured : fallback;
}

function includesEmailDomain(haystack: string, domain: string) {
  const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@${escaped}\\b`, "i").test(haystack);
}

export function emailMatchesAryvaScope(input: {
  config: ConnectorConfig;
  title: string;
  content: string;
  from?: string;
  to?: string;
}): EmailRelevanceDecision {
  if (input.config.config.requireAryvaRelated === false) {
    return { matches: true, reason: "scope_check_disabled", matchedTerms: [] };
  }

  const keywords = configStringList(input.config, ["aryvaKeywords", "arvyaKeywords", "relevanceKeywords"], DEFAULT_ARYVA_EMAIL_KEYWORDS);
  const domains = configStringList(input.config, ["aryvaDomains", "arvyaDomains", "relevanceDomains"], DEFAULT_ARYVA_EMAIL_DOMAINS);
  const haystack = [input.title, input.from, input.to, input.content].filter(Boolean).join("\n").toLowerCase();
  const matchedTerms = [
    ...keywords.filter((keyword) => keyword && haystack.includes(keyword.toLowerCase())),
    ...domains.filter((domain) => domain && includesEmailDomain(haystack, domain.toLowerCase())),
  ];

  if (matchedTerms.length === 0) {
    return { matches: false, reason: "not_aryva_related", matchedTerms: [] };
  }
  return { matches: true, reason: "matched_aryva_scope", matchedTerms: [...new Set(matchedTerms)] };
}

export function hashEmailContent(content: string) {
  return hashNormalizedSourceContent(content);
}

export function emailConnectorItemLimit(config: ConnectorConfig) {
  const configured = Number(config.config.maxItems ?? config.config.max_items ?? config.config.itemLimit);
  if (!Number.isFinite(configured)) return 50;
  return Math.max(1, Math.min(50, Math.floor(configured)));
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
  title: string;
  content: string;
  externalUri?: string;
  metadata: Record<string, unknown>;
}) {
  const sources = await getRepository().listSourceItems(input.brainId);
  const fingerprint = sourceFingerprint({
    title: input.title,
    content: input.content,
    externalUri: input.externalUri,
    metadata: input.metadata,
  });
  return sources.find((source) => sourceMatchesFingerprint(source, fingerprint, { connectorScoped: true }));
}

export async function createEmailSource(input: EmailSourceInput) {
  const repository = getRepository();
  const normalizedContent = normalizeSourceContent(input.content);
  const hash = hashEmailContent(normalizedContent);
  const occurredAt = typeof input.metadata.occurred_at === "string" ? input.metadata.occurred_at : undefined;
  const traceMetadata = buildSourceTraceMetadata({
    sourceKind: "email",
    sourceSystem: input.connectorType,
    connectorType: input.connectorType,
    connectorConfigId: input.config.id,
    externalId: input.externalId,
    externalUri: input.externalUri,
    originalTitle: input.title,
    occurredAt,
  });
  const metadata = {
    domain_type: "email",
    ...mergeSourceTraceMetadata(traceMetadata, input.metadata as Record<string, unknown>),
    content_hash: hash,
    source_content_hash: hash,
  };
  const fingerprint = sourceFingerprint({
    title: input.title,
    content: normalizedContent,
    externalUri: input.externalUri,
    metadata,
  });
  const duplicate = await hasDuplicateEmailSource({
    brainId: input.config.brainId,
    connectorType: input.connectorType,
    externalId: input.externalId,
    title: input.title,
    content: normalizedContent,
    externalUri: input.externalUri,
    metadata,
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
