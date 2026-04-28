import { createHash } from "node:crypto";
import type { SourceItem, SourceType } from "@arvya/core";

export const SOURCE_NORMALIZATION_VERSION = "source-normalization-v1";

type SourceFingerprintInput = {
  title?: string;
  type?: SourceType;
  content: string;
  externalUri?: string;
  metadata?: Record<string, unknown>;
};

export type SourceFingerprint = {
  normalizationVersion?: string;
  contentHash: string;
  externalId?: string;
  externalUri?: string;
  originalFilename?: string;
  connectorType?: string;
  connectorConfigId?: string;
  sourceSystem?: string;
};

export type SourceTraceMetadataInput = {
  sourceKind: SourceType | "transcript" | "email" | "note" | "document";
  sourceSystem: string;
  connectorType?: string;
  connectorConfigId?: string;
  externalId?: string;
  externalUri?: string;
  originalTitle?: string;
  occurredAt?: string;
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeUri(value?: string) {
  const uri = value?.trim();
  if (!uri) return undefined;
  try {
    const parsed = new URL(uri);
    parsed.hash = parsed.hash || "";
    return parsed.toString();
  } catch {
    return uri;
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeSourceContent(content: string) {
  return content
    .normalize("NFKC")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function hashNormalizedSourceContent(content: string) {
  return sha256(`${SOURCE_NORMALIZATION_VERSION}\n${normalizeSourceContent(content)}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeSourceTraceMetadata(
  trace: Record<string, unknown>,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!override) return { ...trace };

  const mergedTrace = isPlainObject(trace.source_trace) ? { ...trace.source_trace as Record<string, unknown> } : {};
  const overrideTrace = isPlainObject(override.source_trace) ? override.source_trace as Record<string, unknown> : undefined;
  if (overrideTrace) {
    for (const [key, value] of Object.entries(overrideTrace)) {
      if (value !== undefined && value !== null && value !== "") mergedTrace[key] = value;
    }
  }

  const out: Record<string, unknown> = { ...trace, ...override };
  out.source_trace = mergedTrace;

  for (const key of [
    "source_kind",
    "source_system",
    "connector_type",
    "connector_config_id",
    "external_id",
    "external_uri",
    "occurred_at",
    "normalization_version",
  ]) {
    if (out[key] === undefined || out[key] === null || out[key] === "") {
      const fallback = trace[key] ?? mergedTrace[key];
      if (fallback !== undefined) out[key] = fallback;
    }
  }

  return out;
}

export function buildSourceTraceMetadata(input: SourceTraceMetadataInput) {
  const externalUri = normalizeUri(input.externalUri);
  const sourceTrace = {
    source_kind: input.sourceKind,
    source_system: input.sourceSystem,
    connector_type: input.connectorType,
    connector_config_id: input.connectorConfigId,
    external_id: input.externalId,
    external_uri: externalUri,
    original_title: input.originalTitle,
    occurred_at: input.occurredAt,
    normalization_version: SOURCE_NORMALIZATION_VERSION,
  };

  return {
    source_kind: input.sourceKind,
    source_system: input.sourceSystem,
    connector_type: input.connectorType,
    connector_config_id: input.connectorConfigId,
    external_id: input.externalId,
    external_uri: externalUri,
    occurred_at: input.occurredAt,
    normalization_version: SOURCE_NORMALIZATION_VERSION,
    source_trace: Object.fromEntries(
      Object.entries(sourceTrace).filter(([, value]) => value !== undefined),
    ),
  };
}

export function sourceFingerprint(input: SourceFingerprintInput): SourceFingerprint {
  const metadata = input.metadata ?? {};
  const sourceTrace = metadata.source_trace && typeof metadata.source_trace === "object"
    ? metadata.source_trace as Record<string, unknown>
    : {};
  const externalId =
    stringValue(metadata.external_id) ??
    stringValue(sourceTrace.external_id) ??
    stringValue(metadata.gmail_message_id) ??
    stringValue(metadata.outlook_message_id) ??
    stringValue(metadata.drive_file_id) ??
    stringValue(metadata.recall_transcript_id) ??
    stringValue(metadata.recall_bot_id);
  const externalUri =
    normalizeUri(input.externalUri) ??
    normalizeUri(stringValue(metadata.external_uri)) ??
    normalizeUri(stringValue(sourceTrace.external_uri));

  return {
    normalizationVersion: SOURCE_NORMALIZATION_VERSION,
    contentHash: hashNormalizedSourceContent(input.content),
    externalId,
    externalUri,
    originalFilename:
      stringValue(metadata.originalFilename) ??
      stringValue(metadata.filename),
    connectorType:
      stringValue(metadata.connector_type) ??
      stringValue(sourceTrace.connector_type),
    connectorConfigId:
      stringValue(metadata.connector_config_id) ??
      stringValue(sourceTrace.connector_config_id),
    sourceSystem:
      stringValue(metadata.source_system) ??
      stringValue(sourceTrace.source_system),
  };
}

export function buildDedupeKeys(fingerprint: SourceFingerprint) {
  const keys = new Set<string>([
    `content:${fingerprint.contentHash}`,
  ]);
  if (fingerprint.externalUri) keys.add(`uri:${fingerprint.externalUri}`);
  if (fingerprint.originalFilename) keys.add(`filename:${fingerprint.originalFilename.toLowerCase()}`);
  if (fingerprint.externalId) keys.add(`external:${fingerprint.externalId}`);
  if (fingerprint.sourceSystem && fingerprint.externalId) {
    keys.add(`source:${fingerprint.sourceSystem}:${fingerprint.externalId}`);
  }
  if (fingerprint.connectorType && fingerprint.externalId) {
    keys.add(`connector:${fingerprint.connectorType}:${fingerprint.externalId}`);
  }
  if (fingerprint.connectorConfigId && fingerprint.externalId) {
    keys.add(`connector_config:${fingerprint.connectorConfigId}:${fingerprint.externalId}`);
  }
  return [...keys];
}

function sourceDedupeKeys(source: SourceItem) {
  const metadata = source.metadata ?? {};
  const keys = Array.isArray(metadata.dedupe_keys)
    ? metadata.dedupe_keys.map((key) => String(key))
    : [];
  const fallback = sourceFingerprint({
    title: source.title,
    type: source.type,
    content: source.content,
    externalUri: source.externalUri,
    metadata,
  });
  return new Set([...keys, ...buildDedupeKeys(fallback)]);
}

export function sourceMatchesFingerprint(
  source: SourceItem,
  fingerprint: SourceFingerprint,
  options: { connectorScoped?: boolean } = {},
) {
  const keys = sourceDedupeKeys(source);
  const targetKeys = buildDedupeKeys(fingerprint);
  const metadata = source.metadata ?? {};
  const sourceConnector =
    stringValue(metadata.connector_type) ??
    stringValue((metadata.source_trace as Record<string, unknown> | undefined)?.connector_type);

  if (options.connectorScoped && fingerprint.connectorType) {
    return sourceConnector === fingerprint.connectorType && targetKeys.some((key) => keys.has(key));
  }

  return targetKeys.some((key) => keys.has(key));
}
