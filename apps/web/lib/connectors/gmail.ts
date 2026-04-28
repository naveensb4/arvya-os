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

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type GmailCredentials = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  scope?: string;
  token_type?: string;
};

type GmailMessageListItem = {
  id: string;
  threadId?: string;
};

type GmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayload;
};

type GmailPayload = {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string };
  parts?: GmailPayload[];
};

type GmailLabel = {
  id: string;
  name: string;
};

export type GmailClient = {
  listLabels?(): Promise<GmailLabel[]>;
  listMessages(labelId: string): Promise<GmailMessageListItem[]>;
  getMessage(messageId: string): Promise<GmailMessage>;
};

function env(name: string) {
  return process.env[name]?.trim() || undefined;
}

function requireGmailOAuthEnv() {
  const clientId = env("GMAIL_CLIENT_ID") ?? env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GMAIL_CLIENT_SECRET") ?? env("GOOGLE_CLIENT_SECRET");
  const redirectUri = env("GMAIL_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Gmail OAuth is not configured. Set GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET/GMAIL_REDIRECT_URI or reuse GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET with GMAIL_REDIRECT_URI.");
  }
  return { clientId, clientSecret, redirectUri };
}

function isExpired(credentials: GmailCredentials) {
  if (!credentials.expires_at) return false;
  return Date.now() >= new Date(credentials.expires_at).getTime() - 60_000;
}

function tokenResponseToCredentials(response: GoogleTokenResponse, existing?: GmailCredentials): GmailCredentials {
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
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json() as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!response.ok) throw new Error(json.error_description ?? json.error ?? "Gmail OAuth token request failed.");
  return json;
}

export function buildGmailAuthUrl(input: { brainId: string; connectorConfigId: string }) {
  const { clientId, redirectUri } = requireGmailOAuthEnv();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", encodeOAuthState(input));
  return url;
}

export const parseGmailOAuthState = decodeOAuthState;

export async function exchangeGmailCode(code: string, existing?: GmailCredentials) {
  const { clientId, clientSecret, redirectUri } = requireGmailOAuthEnv();
  const response = await postToken(new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  }));
  return tokenResponseToCredentials(response, existing);
}

async function refreshGmailCredentials(config: ConnectorConfig, credentials: GmailCredentials) {
  if (!credentials.refresh_token) throw new Error("Gmail refresh token is missing. Reconnect Gmail.");
  const { clientId, clientSecret } = requireGmailOAuthEnv();
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

class GmailRestClient implements GmailClient {
  constructor(private readonly getAccessToken: () => Promise<string>) {}

  async listLabels() {
    const response = await fetch(`${GMAIL_API}/labels`, {
      headers: { authorization: `Bearer ${await this.getAccessToken()}` },
    });
    const json = await response.json() as { labels?: GmailLabel[]; error?: { message?: string } };
    if (!response.ok) throw new Error(json.error?.message ?? "Gmail label listing failed.");
    return json.labels ?? [];
  }

  async listMessages(labelId: string) {
    const url = new URL(`${GMAIL_API}/messages`);
    url.searchParams.set("labelIds", labelId);
    url.searchParams.set("maxResults", "50");
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${await this.getAccessToken()}` },
    });
    const json = await response.json() as { messages?: GmailMessageListItem[]; error?: { message?: string } };
    if (!response.ok) throw new Error(json.error?.message ?? "Gmail message listing failed.");
    return json.messages ?? [];
  }

  async getMessage(messageId: string) {
    const url = new URL(`${GMAIL_API}/messages/${messageId}`);
    url.searchParams.set("format", "full");
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${await this.getAccessToken()}` },
    });
    const json = await response.json() as GmailMessage & { error?: { message?: string } };
    if (!response.ok) throw new Error(json.error?.message ?? "Gmail message fetch failed.");
    return json;
  }
}

async function getGmailClient(config: ConnectorConfig): Promise<GmailClient> {
  let credentials = (await connectorCredentialStore.read(config)) as GmailCredentials | null;
  if (!credentials?.access_token) throw new Error("Gmail is not connected. Connect OAuth before syncing.");
  if (isExpired(credentials)) credentials = await refreshGmailCredentials(config, credentials);
  return new GmailRestClient(async () => {
    if (!credentials?.access_token) throw new Error("Gmail access token is missing.");
    if (isExpired(credentials)) credentials = await refreshGmailCredentials(config, credentials);
    if (!credentials.access_token) throw new Error("Gmail access token is missing.");
    return credentials.access_token;
  });
}

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value;
}

function bodyText(payload?: GmailPayload): string {
  if (!payload) return "";
  if (payload.body?.data && payload.mimeType?.includes("text/plain")) return decodeBase64Url(payload.body.data);
  if (payload.body?.data && payload.mimeType?.includes("text/html")) return stripHtml(decodeBase64Url(payload.body.data));
  return (payload.parts ?? []).map(bodyText).filter(Boolean).join("\n\n");
}

function formatGmailMessage(message: GmailMessage) {
  const subject = header(message, "Subject") ?? "(No subject)";
  const from = header(message, "From") ?? "";
  const to = header(message, "To") ?? "";
  const date = header(message, "Date") ?? "";
  const body = bodyText(message.payload) || message.snippet || "";
  return {
    title: subject,
    content: [`Subject: ${subject}`, `From: ${from}`, `To: ${to}`, `Date: ${date}`, "", body].join("\n").trim(),
    from,
    to,
    date,
  };
}

function maxItemTestMode(config: ConnectorConfig) {
  return config.config.maxItemTestMode === true;
}

function isBroadGmailLabel(label: string) {
  return label.trim().toUpperCase() === "INBOX";
}

async function resolveGmailLabels(configuredLabels: string[], client: GmailClient) {
  if (!client.listLabels) {
    return configuredLabels.map((label) => ({ id: label, name: label }));
  }

  const labels = await client.listLabels();
  return configuredLabels.map((configuredLabel) => {
    const match = labels.find((label) =>
      label.id.toLowerCase() === configuredLabel.toLowerCase() ||
      label.name.toLowerCase() === configuredLabel.toLowerCase()
    );
    if (!match) {
      throw new Error(
        `Gmail label "${configuredLabel}" was not found. Create a Gmail label named "Arvya Brain", apply it to 5-10 important threads, save that label name or ID, then sync again.`,
      );
    }
    return match;
  });
}

export async function syncGmailConnector(config: ConnectorConfig, client?: GmailClient): Promise<EmailConnectorSyncResult> {
  const configuredLabels = listConfigStrings(config, ["labelIds", "label_ids"]);
  if (configuredLabels.length === 0) {
    throw new Error('Gmail sync requires a configured label. Create "Arvya Brain", apply it to 5-10 important threads, then save that label name or ID.');
  }
  if (!maxItemTestMode(config) && configuredLabels.some(isBroadGmailLabel)) {
    throw new Error('Gmail INBOX sync is disabled for live runs. Use the "Arvya Brain" label, or explicitly enable max-item test mode for a capped inbox test.');
  }

  const gmail = client ?? await getGmailClient(config);
  const labels = await resolveGmailLabels(configuredLabels, gmail);
  const result = newEmailSyncResult();
  const itemLimit = emailConnectorItemLimit(config);

  for (const label of labels) {
    const messages = await gmail.listMessages(label.id);
    result.itemsFound += messages.length;
    const messagesToSync = messages.slice(0, itemLimit);
    if (messages.length > messagesToSync.length) {
      result.itemsSkipped += messages.length - messagesToSync.length;
      result.skippedItems.push({
        externalId: `gmail:${label.id}:safety-cap`,
        title: label.name,
        reason: `safety_cap_${itemLimit}`,
      });
    }
    for (const item of messagesToSync) {
      try {
        const message = await gmail.getMessage(item.id);
        const formatted = formatGmailMessage(message);
        const externalId = `gmail:${message.id}`;
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
          connectorType: "gmail",
          externalId,
          title: formatted.title,
          content: formatted.content,
          externalUri: `https://mail.google.com/mail/u/0/#all/${message.id}`,
          metadata: {
            gmail_message_id: message.id,
            gmail_thread_id: message.threadId,
            gmail_label_id: label.id,
            gmail_label_name: label.name,
            gmail_label_ids: message.labelIds ?? [],
            from: formatted.from,
            to: formatted.to,
            occurred_at: formatted.date,
            gmail_internal_date: message.internalDate,
            gmail_synced_at: new Date().toISOString(),
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
          externalId: `gmail:${item.id}`,
          title: item.id,
          error: error instanceof Error ? error.message : "Unknown Gmail sync error",
        });
      }
    }
  }

  return result;
}

export async function markGmailConnected(configId: string, credentials: GmailCredentials) {
  return getRepository().updateConnectorConfig(configId, {
    credentials,
    status: "connected",
    lastError: null,
  });
}
