import { connectorCredentialStore } from "@/lib/connectors/credential-store";
import { getRepository, type ConnectorConfig } from "@/lib/db/repository";
import {
  createEmailSource,
  decodeOAuthState,
  emailConnectorItemLimit,
  emailMatchesAryvaScope,
  encodeOAuthState,
  listConfigStrings,
  newEmailSyncResult,
  stripHtml,
  type EmailConnectorSyncResult,
} from "./email-common";

export const OUTLOOK_SCOPE = "offline_access Mail.Read";

const MICROSOFT_AUTH_BASE = "https://login.microsoftonline.com";
const MICROSOFT_GRAPH = "https://graph.microsoft.com/v1.0";

type MicrosoftTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type OutlookCredentials = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  scope?: string;
  token_type?: string;
};

export type OutlookMessage = {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  categories?: string[];
  receivedDateTime?: string;
  sentDateTime?: string;
  webLink?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
};

type OutlookFolder = {
  id: string;
  displayName: string;
};

export type OutlookListMessagesOptions = {
  /**
   * ISO timestamp. When provided, list only messages with
   * receivedDateTime > since. The Microsoft Graph $filter operator is
   * `receivedDateTime ge <iso>` for live calls; mocks should honor it
   * by filtering their fixed message list.
   */
  since?: string;
};

export type OutlookClient = {
  listMailFolders?(): Promise<OutlookFolder[]>;
  listMessages(folderId: string, options?: OutlookListMessagesOptions): Promise<OutlookMessage[]>;
  listMessagesByCategory?(categoryName: string, options?: OutlookListMessagesOptions): Promise<OutlookMessage[]>;
};

function env(name: string) {
  return process.env[name]?.trim() || undefined;
}

function microsoftTenant() {
  return env("MICROSOFT_TENANT_ID") ?? "common";
}

function requireOutlookOAuthEnv() {
  const clientId = env("MICROSOFT_CLIENT_ID");
  const clientSecret = env("MICROSOFT_CLIENT_SECRET");
  const redirectUri = env("MICROSOFT_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Outlook OAuth is not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_REDIRECT_URI.");
  }
  return { clientId, clientSecret, redirectUri };
}

function authUrl() {
  return `${MICROSOFT_AUTH_BASE}/${microsoftTenant()}/oauth2/v2.0/authorize`;
}

function tokenUrl() {
  return `${MICROSOFT_AUTH_BASE}/${microsoftTenant()}/oauth2/v2.0/token`;
}

function isExpired(credentials: OutlookCredentials) {
  if (!credentials.expires_at) return false;
  return Date.now() >= new Date(credentials.expires_at).getTime() - 60_000;
}

function tokenResponseToCredentials(response: MicrosoftTokenResponse, existing?: OutlookCredentials): OutlookCredentials {
  return {
    ...(existing ?? {}),
    access_token: response.access_token,
    refresh_token: response.refresh_token ?? existing?.refresh_token,
    expires_at: response.expires_in ? new Date(Date.now() + response.expires_in * 1000).toISOString() : existing?.expires_at,
    scope: response.scope ?? existing?.scope,
    token_type: response.token_type ?? existing?.token_type,
  };
}

async function postToken(body: URLSearchParams) {
  const response = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json() as MicrosoftTokenResponse & { error?: string; error_description?: string };
  if (!response.ok) throw new Error(json.error_description ?? json.error ?? "Microsoft OAuth token request failed.");
  return json;
}

export function buildOutlookAuthUrl(input: { brainId: string; connectorConfigId: string }) {
  const { clientId, redirectUri } = requireOutlookOAuthEnv();
  const url = new URL(authUrl());
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OUTLOOK_SCOPE);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("state", encodeOAuthState(input));
  return url;
}

export const parseOutlookOAuthState = decodeOAuthState;

export async function exchangeOutlookCode(code: string, existing?: OutlookCredentials) {
  const { clientId, clientSecret, redirectUri } = requireOutlookOAuthEnv();
  const response = await postToken(new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: OUTLOOK_SCOPE,
  }));
  return tokenResponseToCredentials(response, existing);
}

async function refreshOutlookCredentials(config: ConnectorConfig, credentials: OutlookCredentials) {
  if (!credentials.refresh_token) throw new Error("Outlook refresh token is missing. Reconnect Outlook.");
  const { clientId, clientSecret } = requireOutlookOAuthEnv();
  const response = await postToken(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: credentials.refresh_token,
    grant_type: "refresh_token",
    scope: OUTLOOK_SCOPE,
  }));
  const refreshed = tokenResponseToCredentials(response, credentials);
  await connectorCredentialStore.write(config.id, refreshed);
  return refreshed;
}

class OutlookGraphClient implements OutlookClient {
  constructor(private readonly getAccessToken: () => Promise<string>) {}

  async listMailFolders() {
    const url = new URL(`${MICROSOFT_GRAPH}/me/mailFolders`);
    url.searchParams.set("$top", "100");
    url.searchParams.set("$select", "id,displayName");
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${await this.getAccessToken()}` },
    });
    const json = await response.json() as { value?: OutlookFolder[]; error?: { message?: string } };
    if (!response.ok) throw new Error(json.error?.message ?? "Outlook mail folder listing failed.");
    return json.value ?? [];
  }

  async listMessages(folderId: string, options?: OutlookListMessagesOptions) {
    const url = new URL(`${MICROSOFT_GRAPH}/me/mailFolders/${encodeURIComponent(folderId)}/messages`);
    url.searchParams.set("$top", "50");
    url.searchParams.set("$select", "id,subject,from,toRecipients,categories,receivedDateTime,sentDateTime,webLink,bodyPreview,body");
    url.searchParams.set("$orderby", "receivedDateTime desc");
    if (options?.since) {
      const sinceMs = Date.parse(options.since);
      if (Number.isFinite(sinceMs)) {
        url.searchParams.set("$filter", `receivedDateTime gt ${new Date(sinceMs).toISOString()}`);
      }
    }
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${await this.getAccessToken()}` },
    });
    const json = await response.json() as { value?: OutlookMessage[]; error?: { message?: string } };
    if (!response.ok) throw new Error(json.error?.message ?? "Outlook message listing failed.");
    return json.value ?? [];
  }

  async listMessagesByCategory(categoryName: string, options?: OutlookListMessagesOptions) {
    const url = new URL(`${MICROSOFT_GRAPH}/me/messages`);
    url.searchParams.set("$top", "50");
    url.searchParams.set("$select", "id,subject,from,toRecipients,categories,receivedDateTime,sentDateTime,webLink,bodyPreview,body");
    const filters = [`categories/any(c:c eq '${categoryName.replaceAll("'", "''")}')`];
    if (options?.since) {
      const sinceMs = Date.parse(options.since);
      if (Number.isFinite(sinceMs)) {
        filters.push(`receivedDateTime gt ${new Date(sinceMs).toISOString()}`);
      }
    }
    url.searchParams.set("$filter", filters.join(" and "));
    url.searchParams.set("$orderby", "receivedDateTime desc");
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${await this.getAccessToken()}` },
    });
    const json = await response.json() as { value?: OutlookMessage[]; error?: { message?: string } };
    if (!response.ok) throw new Error(json.error?.message ?? "Outlook category message listing failed.");
    return json.value ?? [];
  }
}

async function getOutlookClient(config: ConnectorConfig): Promise<OutlookClient> {
  let credentials = (await connectorCredentialStore.read(config)) as OutlookCredentials | null;
  if (!credentials?.access_token) throw new Error("Outlook is not connected. Connect OAuth before syncing.");
  if (isExpired(credentials)) credentials = await refreshOutlookCredentials(config, credentials);
  return new OutlookGraphClient(async () => {
    if (!credentials?.access_token) throw new Error("Outlook access token is missing.");
    if (isExpired(credentials)) credentials = await refreshOutlookCredentials(config, credentials);
    if (!credentials.access_token) throw new Error("Outlook access token is missing.");
    return credentials.access_token;
  });
}

function emailAddress(value?: { emailAddress?: { name?: string; address?: string } }) {
  if (!value?.emailAddress) return "";
  const { name, address } = value.emailAddress;
  return name && address ? `${name} <${address}>` : address ?? name ?? "";
}

function outlookWatermark(config: ConnectorConfig) {
  const raw = config.config.watermark;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function outlookMessageTimestamp(message: OutlookMessage): string | undefined {
  const candidate = message.receivedDateTime ?? message.sentDateTime;
  if (!candidate) return undefined;
  const ms = Date.parse(candidate);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

function formatOutlookMessage(message: OutlookMessage) {
  const title = message.subject?.trim() || "(No subject)";
  const from = emailAddress(message.from);
  const to = (message.toRecipients ?? []).map(emailAddress).filter(Boolean).join(", ");
  const date = message.receivedDateTime ?? message.sentDateTime ?? "";
  const rawBody = message.body?.content ?? message.bodyPreview ?? "";
  const body = message.body?.contentType?.toLowerCase() === "html" ? stripHtml(rawBody) : rawBody;
  return {
    title,
    from,
    to,
    date,
    content: [`Subject: ${title}`, `From: ${from}`, `To: ${to}`, `Date: ${date}`, "", body].join("\n").trim(),
  };
}

function maxItemTestMode(config: ConnectorConfig) {
  return config.config.maxItemTestMode === true;
}

function isBroadOutlookFolder(folder: string) {
  return folder.trim().toLowerCase() === "inbox";
}

function isBroadOutlookCategory(category: string) {
  const normalized = category.trim().toLowerCase();
  return normalized === "" || normalized === "*" || normalized === "any" || normalized === "all";
}

async function resolveOutlookFolders(configuredFolders: string[], client: OutlookClient) {
  if (!client.listMailFolders) {
    return configuredFolders.map((folder) => ({ id: folder, displayName: folder }));
  }

  const folders = await client.listMailFolders();
  return configuredFolders.map((configuredFolder) => {
    const match = folders.find((folder) =>
      folder.id.toLowerCase() === configuredFolder.toLowerCase() ||
      folder.displayName.toLowerCase() === configuredFolder.toLowerCase()
    );
    if (!match) {
      throw new Error(
        `Outlook folder "${configuredFolder}" was not found. Create an Outlook folder named "Arvya Brain", move 5-10 important emails there, save that folder name or ID, then sync again.`,
      );
    }
    return match;
  });
}

export async function syncOutlookConnector(config: ConnectorConfig, client?: OutlookClient): Promise<EmailConnectorSyncResult> {
  const configuredFolders = listConfigStrings(config, ["outlookFolderIds", "folderIds", "folder_ids"]);
  const categoryNames = listConfigStrings(config, ["outlookCategoryNames", "categoryNames", "categories"]);
  if (configuredFolders.length === 0 && categoryNames.length === 0) {
    throw new Error('Outlook sync requires a configured folder or category. Create "Arvya Brain", move or categorize 5-10 important emails, then save that folder/category name.');
  }
  if (!maxItemTestMode(config) && configuredFolders.some(isBroadOutlookFolder)) {
    throw new Error('Outlook inbox sync is disabled for live runs. Use the "Arvya Brain" folder/category, or explicitly enable max-item test mode for a capped inbox test.');
  }
  const broadCategory = categoryNames.find(isBroadOutlookCategory);
  if (broadCategory !== undefined) {
    throw new Error(`Outlook category "${broadCategory || "(empty)"}" is too broad. Use a specific Outlook category like "Arvya Brain" or "Investors" so we only sync the threads you flagged.`);
  }

  const outlook = client ?? await getOutlookClient(config);
  const folders = await resolveOutlookFolders(configuredFolders, outlook);
  const result = newEmailSyncResult();
  const itemLimit = emailConnectorItemLimit(config);
  const since = outlookWatermark(config);
  let nextWatermark: string | undefined = since;
  const trackWatermark = (message: OutlookMessage) => {
    const iso = outlookMessageTimestamp(message);
    if (iso && (!nextWatermark || iso > nextWatermark)) nextWatermark = iso;
  };

  for (const folder of folders) {
    const messages = await outlook.listMessages(folder.id, since ? { since } : undefined);
    result.itemsFound += messages.length;
    const messagesToSync = messages.slice(0, itemLimit);
    if (messages.length > messagesToSync.length) {
      result.itemsSkipped += messages.length - messagesToSync.length;
      result.skippedItems.push({
        externalId: `outlook:${folder.id}:safety-cap`,
        title: folder.displayName,
        reason: `safety_cap_${itemLimit}`,
      });
    }
    for (const message of messagesToSync) {
      const externalId = `outlook:${message.id}`;
      trackWatermark(message);
      try {
        const formatted = formatOutlookMessage(message);
        const relevance = emailMatchesAryvaScope({
          config,
          title: formatted.title,
          content: formatted.content,
          from: formatted.from,
          to: formatted.to,
        });
        if (!relevance.matches) {
          result.itemsSkipped += 1;
          result.skippedItems.push({ externalId, title: formatted.title, reason: relevance.reason });
          continue;
        }
        const created = await createEmailSource({
          config,
          connectorType: "outlook",
          externalId,
          title: formatted.title,
          content: formatted.content,
          externalUri: message.webLink,
          metadata: {
            outlook_message_id: message.id,
            outlook_folder_id: folder.id,
            outlook_folder_name: folder.displayName,
            outlook_categories: message.categories ?? [],
            from: formatted.from,
            to: formatted.to,
            occurred_at: formatted.date,
            outlook_received_at: message.receivedDateTime,
            outlook_sent_at: message.sentDateTime,
            outlook_synced_at: new Date().toISOString(),
            aryva_relevance: {
              reason: relevance.reason,
              matched_terms: relevance.matchedTerms,
            },
          },
        });
        if (created.duplicate) {
          result.itemsSkipped += 1;
          result.skippedItems.push({ externalId, title: formatted.title, reason: "duplicate" });
          continue;
        }
        result.itemsIngested += 1;
        result.sourceItemIds.push(created.sourceItem.id);
      } catch (error) {
        result.itemsFailed += 1;
        result.failedItems.push({
          externalId,
          title: message.subject ?? message.id,
          error: error instanceof Error ? error.message : "Unknown Outlook sync error",
        });
      }
    }
  }

  for (const categoryName of categoryNames) {
    if (!outlook.listMessagesByCategory) {
      throw new Error("Outlook category sync is not available for this client. Use an Outlook folder named \"Arvya Brain\" or reconnect with the live Microsoft Graph connector.");
    }
    const messages = await outlook.listMessagesByCategory(categoryName, since ? { since } : undefined);
    result.itemsFound += messages.length;
    const messagesToSync = messages.slice(0, itemLimit);
    if (messages.length > messagesToSync.length) {
      result.itemsSkipped += messages.length - messagesToSync.length;
      result.skippedItems.push({
        externalId: `outlook:${categoryName}:safety-cap`,
        title: categoryName,
        reason: `safety_cap_${itemLimit}`,
      });
    }
    for (const message of messagesToSync) {
      const externalId = `outlook:${message.id}`;
      trackWatermark(message);
      try {
        const formatted = formatOutlookMessage(message);
        const relevance = emailMatchesAryvaScope({
          config,
          title: formatted.title,
          content: formatted.content,
          from: formatted.from,
          to: formatted.to,
        });
        if (!relevance.matches) {
          result.itemsSkipped += 1;
          result.skippedItems.push({ externalId, title: formatted.title, reason: relevance.reason });
          continue;
        }
        const created = await createEmailSource({
          config,
          connectorType: "outlook",
          externalId,
          title: formatted.title,
          content: formatted.content,
          externalUri: message.webLink,
          metadata: {
            outlook_message_id: message.id,
            outlook_category_name: categoryName,
            outlook_categories: message.categories ?? [],
            from: formatted.from,
            to: formatted.to,
            occurred_at: formatted.date,
            outlook_received_at: message.receivedDateTime,
            outlook_sent_at: message.sentDateTime,
            outlook_synced_at: new Date().toISOString(),
            aryva_relevance: {
              reason: relevance.reason,
              matched_terms: relevance.matchedTerms,
            },
          },
        });
        if (created.duplicate) {
          result.itemsSkipped += 1;
          result.skippedItems.push({ externalId, title: formatted.title, reason: "duplicate" });
          continue;
        }
        result.itemsIngested += 1;
        result.sourceItemIds.push(created.sourceItem.id);
      } catch (error) {
        result.itemsFailed += 1;
        result.failedItems.push({
          externalId,
          title: message.subject ?? message.id,
          error: error instanceof Error ? error.message : "Unknown Outlook sync error",
        });
      }
    }
  }

  if (nextWatermark) result.nextWatermark = nextWatermark;
  return result;
}

export async function markOutlookConnected(configId: string, credentials: OutlookCredentials) {
  return getRepository().updateConnectorConfig(configId, {
    credentials,
    status: "connected",
    lastError: null,
  });
}
