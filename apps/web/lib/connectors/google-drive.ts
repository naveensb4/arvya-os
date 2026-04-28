import { parseTranscriptFilename } from "@/lib/workflows/batch-ingestion";
import { getRepository, type ConnectorConfig } from "@/lib/db/repository";
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
import { connectorCredentialStore } from "./credential-store";

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const SUPPORTED_EXTENSIONS = new Set([".txt", ".md"]);

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export type GoogleDriveCredentials = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  scope?: string;
  token_type?: string;
};

export type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
};

export type GoogleDriveClient = {
  listFiles(folderId: string): Promise<GoogleDriveFile[]>;
  downloadText(fileId: string): Promise<string>;
};

type GoogleDriveSyncResult = {
  itemsFound: number;
  itemsIngested: number;
  itemsSkipped: number;
  itemsFailed: number;
  sourceItemIds: string[];
  skippedFiles: Array<{ fileId: string; fileName: string; reason: string }>;
  failedFiles: Array<{ fileId: string; fileName: string; error: string }>;
};

function env(name: string) {
  return process.env[name]?.trim() || undefined;
}

function requireGoogleOAuthEnv() {
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  const redirectUri = env("GOOGLE_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google Drive OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.");
  }
  return { clientId, clientSecret, redirectUri };
}

function extensionFor(fileName: string) {
  return fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
}

function cleanTitle(fileName: string, parsed: ReturnType<typeof parseTranscriptFilename>) {
  if (parsed.topic && parsed.companyPersonText) {
    return `${parsed.topic} with ${parsed.companyPersonText}`;
  }
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fileName;
}

function folderIdsFromConfig(config: ConnectorConfig) {
  const raw = config.config.folderIds ?? config.config.folder_ids;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

const DEFAULT_DRIVE_ITEM_LIMIT = 50;
const DRIVE_HARD_CAP = 200;

function googleDriveItemLimit(config: ConnectorConfig) {
  const configured = Number(config.config.maxItems ?? config.config.max_items ?? config.config.itemLimit);
  if (!Number.isFinite(configured)) return DEFAULT_DRIVE_ITEM_LIMIT;
  return Math.max(1, Math.min(DRIVE_HARD_CAP, Math.floor(configured)));
}

function isBroadDriveFolderId(folderId: string) {
  const normalized = folderId.trim().toLowerCase();
  return normalized === "" || normalized === "root" || normalized === "my-drive" || normalized === "shared-with-me";
}

function isExpired(credentials: GoogleDriveCredentials) {
  if (!credentials.expires_at) return false;
  return Date.now() >= new Date(credentials.expires_at).getTime() - 60_000;
}

function tokenResponseToCredentials(response: GoogleTokenResponse, existing?: GoogleDriveCredentials): GoogleDriveCredentials {
  const expiresAt = response.expires_in
    ? new Date(Date.now() + response.expires_in * 1000).toISOString()
    : existing?.expires_at;
  return {
    ...(existing ?? {}),
    access_token: response.access_token,
    refresh_token: response.refresh_token ?? existing?.refresh_token,
    expires_at: expiresAt,
    scope: response.scope ?? existing?.scope,
    token_type: response.token_type ?? existing?.token_type,
  };
}

async function postToken(body: URLSearchParams) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json() as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!response.ok) {
    throw new Error(json.error_description ?? json.error ?? "Google OAuth token request failed.");
  }
  return json;
}

export function buildGoogleDriveAuthUrl(input: { brainId: string; connectorConfigId: string }) {
  const { clientId, redirectUri } = requireGoogleOAuthEnv();
  const state = Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_DRIVE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url;
}

export function parseGoogleDriveOAuthState(value: string) {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
    brainId?: string;
    connectorConfigId?: string;
  };
  if (!parsed.brainId || !parsed.connectorConfigId) {
    throw new Error("Invalid Google Drive OAuth state.");
  }
  return { brainId: parsed.brainId, connectorConfigId: parsed.connectorConfigId };
}

export async function exchangeGoogleDriveCode(code: string, existing?: GoogleDriveCredentials) {
  const { clientId, clientSecret, redirectUri } = requireGoogleOAuthEnv();
  const response = await postToken(new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  }));
  return tokenResponseToCredentials(response, existing);
}

async function refreshGoogleDriveCredentials(config: ConnectorConfig, credentials: GoogleDriveCredentials) {
  if (!credentials.refresh_token) {
    throw new Error("Google Drive refresh token is missing. Reconnect Google Drive.");
  }
  const { clientId, clientSecret } = requireGoogleOAuthEnv();
  const response = await postToken(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: credentials.refresh_token,
    grant_type: "refresh_token",
  }));
  const refreshed = tokenResponseToCredentials(response, credentials);
  await connectorCredentialStore.write(config.id, refreshed);
  return refreshed;
}

class GoogleDriveRestClient implements GoogleDriveClient {
  constructor(private readonly getAccessToken: () => Promise<string>) {}

  async listFiles(folderId: string) {
    const url = new URL(`${GOOGLE_DRIVE_API}/files`);
    url.searchParams.set("q", `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`);
    url.searchParams.set("fields", "files(id,name,mimeType,webViewLink,modifiedTime)");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${await this.getAccessToken()}` },
    });
    const json = await response.json() as { files?: GoogleDriveFile[]; error?: { message?: string } };
    if (!response.ok) throw new Error(json.error?.message ?? "Google Drive file listing failed.");
    return json.files ?? [];
  }

  async downloadText(fileId: string) {
    const url = new URL(`${GOOGLE_DRIVE_API}/files/${fileId}`);
    url.searchParams.set("alt", "media");
    url.searchParams.set("supportsAllDrives", "true");
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${await this.getAccessToken()}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Google Drive file download failed.");
    }
    return response.text();
  }
}

async function getGoogleDriveClient(config: ConnectorConfig): Promise<GoogleDriveClient> {
  let credentials = (await connectorCredentialStore.read(config)) as GoogleDriveCredentials | null;
  if (!credentials?.access_token) {
    throw new Error("Google Drive is not connected. Connect OAuth before syncing.");
  }
  if (isExpired(credentials)) {
    credentials = await refreshGoogleDriveCredentials(config, credentials);
  }
  return new GoogleDriveRestClient(async () => {
    if (!credentials?.access_token) throw new Error("Google Drive access token is missing.");
    if (isExpired(credentials)) {
      credentials = await refreshGoogleDriveCredentials(config, credentials);
    }
    const token = credentials.access_token;
    if (!token) throw new Error("Google Drive access token is missing.");
    return token;
  });
}

async function hasDuplicateSource(input: {
  brainId: string;
  driveFileId: string;
  fingerprint: ReturnType<typeof sourceFingerprint>;
}) {
  const sources = await getRepository().listSourceItems(input.brainId);
  return sources.find((source) => {
    const metadata = source.metadata ?? {};
    return (
      sourceMatchesFingerprint(source, input.fingerprint) ||
      (
        metadata.connector_type === "google_drive" &&
        (metadata.drive_file_id === input.driveFileId ||
          metadata.external_id === `google_drive:${input.driveFileId}`)
      )
    );
  });
}

export async function syncGoogleDriveConnector(config: ConnectorConfig, client?: GoogleDriveClient): Promise<GoogleDriveSyncResult> {
  const repository = getRepository();
  const folderIds = folderIdsFromConfig(config);
  if (folderIds.length === 0) {
    throw new Error('Google Drive sync requires at least one configured folder ID. Create an "Arvya Brain" folder in Drive, drop 5-10 transcripts into it, then save that folder ID.');
  }
  const broadFolders = folderIds.filter(isBroadDriveFolderId);
  if (broadFolders.length > 0) {
    throw new Error(`Google Drive sync refused: folder "${broadFolders[0]}" is a top-level/shared root. Point sync at a specific transcript folder so we never ingest unrelated files.`);
  }

  const drive = client ?? await getGoogleDriveClient(config);
  const itemLimit = googleDriveItemLimit(config);
  const result: GoogleDriveSyncResult = {
    itemsFound: 0,
    itemsIngested: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
    sourceItemIds: [],
    skippedFiles: [],
    failedFiles: [],
  };

  for (const folderId of folderIds) {
    const files = await drive.listFiles(folderId);
    result.itemsFound += files.length;
    const filesToSync = files.slice(0, itemLimit);
    if (files.length > filesToSync.length) {
      const skippedByCap = files.length - filesToSync.length;
      result.itemsSkipped += skippedByCap;
      result.skippedFiles.push({
        fileId: `google_drive:${folderId}:safety-cap`,
        fileName: folderId,
        reason: `safety_cap_${itemLimit}`,
      });
    }

    for (const file of filesToSync) {
      const extension = extensionFor(file.name);
      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        result.itemsSkipped += 1;
        result.skippedFiles.push({ fileId: file.id, fileName: file.name, reason: "unsupported_file_type" });
        continue;
      }

      try {
        const content = normalizeSourceContent(await drive.downloadText(file.id));
        const hash = hashNormalizedSourceContent(content);
        const parsed = parseTranscriptFilename(file.name);
        const traceMetadata = buildSourceTraceMetadata({
          sourceKind: "transcript",
          sourceSystem: "google_drive",
          connectorType: "google_drive",
          connectorConfigId: config.id,
          externalId: `google_drive:${file.id}`,
          externalUri: file.webViewLink,
          originalTitle: file.name,
          occurredAt: parsed.occurredAt,
        });
        const fingerprint = sourceFingerprint({
          title: cleanTitle(file.name, parsed),
          content,
          externalUri: file.webViewLink,
          metadata: {
            ...traceMetadata,
            content_hash: hash,
            source_content_hash: hash,
          },
        });
        const duplicate = await hasDuplicateSource({
          brainId: config.brainId,
          driveFileId: file.id,
          fingerprint,
        });
        if (duplicate) {
          await processSourceItemIntoBrain({
            brainId: config.brainId,
            sourceItemId: duplicate.id,
          });
          result.itemsSkipped += 1;
          result.skippedFiles.push({ fileId: file.id, fileName: file.name, reason: "duplicate" });
          continue;
        }

        const sourceItem = await repository.createSourceItem({
          brainId: config.brainId,
          type: "transcript",
          title: cleanTitle(file.name, parsed),
          content,
          externalUri: file.webViewLink,
          metadata: mergeSourceTraceMetadata(traceMetadata, {
            domain_type: parsed.domainType ?? "transcript",
            source_type_label: parsed.sourceTypeLabel,
            company_person_text: parsed.companyPersonText,
            topic: parsed.topic,
            drive_file_id: file.id,
            drive_folder_id: folderId,
            filename: file.name,
            mime_type: file.mimeType,
            content_hash: hash,
            source_content_hash: hash,
            dedupe_keys: buildDedupeKeys(fingerprint),
            parsed_metadata: parsed,
            google_drive_modified_time: file.modifiedTime,
            google_drive_synced_at: new Date().toISOString(),
          }),
        });

        const ingested = await processSourceItemIntoBrain({
          brainId: config.brainId,
          sourceItemId: sourceItem.id,
        });

        await repository.createBrainAlert({
          brainId: config.brainId,
          alertType: "important_new_source_processed",
          title: "Google Drive transcript processed",
          description: sourceItem.title,
          severity: "info",
          sourceId: sourceItem.id,
        });

        for (const loop of ingested.openLoops) {
          if (loop.priority === "high" || loop.priority === "critical") {
            await repository.createBrainAlert({
              brainId: config.brainId,
              alertType: "high_priority_open_loop_created",
              title: loop.title,
              description: loop.description,
              severity: loop.priority === "critical" ? "critical" : "warning",
              sourceId: sourceItem.id,
              openLoopId: loop.id,
            });
          }
        }

        result.itemsIngested += 1;
        result.sourceItemIds.push(sourceItem.id);
      } catch (error) {
        result.itemsFailed += 1;
        result.failedFiles.push({
          fileId: file.id,
          fileName: file.name,
          error: error instanceof Error ? error.message : "Unknown Google Drive file sync error",
        });
      }
    }
  }

  return result;
}
