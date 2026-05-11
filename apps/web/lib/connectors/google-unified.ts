/**
 * Unified Google OAuth — single "Connect Google" button that requests
 * BOTH Gmail + Calendar scopes. After consent:
 *   1. Sync calendar events FIRST (fast, <30s for 90 days)
 *   2. Sync SENT mail as evidence-only source items
 *   3. THEN proceed with normal email ingestion
 *
 * The token is stored once in connector_configs and shared by both
 * Gmail and Calendar connectors (D3: single canonical token).
 */

import { GMAIL_SCOPE } from "./gmail";
import { GOOGLE_CALENDAR_SCOPE } from "@/lib/notetaker/calendar-providers";
import { encodeOAuthState } from "./email-common";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_UNIFIED_SCOPES = [
  GMAIL_SCOPE,
  GOOGLE_CALENDAR_SCOPE,
].join(" ");

function env(name: string) {
  return process.env[name]?.trim() || undefined;
}

function requireGoogleOAuthEnv() {
  const clientId = env("GOOGLE_CLIENT_ID") ?? env("GMAIL_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET") ?? env("GMAIL_CLIENT_SECRET");
  const redirectUri = env("GOOGLE_UNIFIED_REDIRECT_URI") ?? env("GMAIL_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google unified OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_UNIFIED_REDIRECT_URI.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleUnifiedAuthUrl(input: {
  brainId: string;
  connectorConfigId: string;
}) {
  const { clientId, redirectUri } = requireGoogleOAuthEnv();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_UNIFIED_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", encodeOAuthState(input));
  return url;
}

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type GoogleCredentials = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  scope?: string;
  token_type?: string;
};

export async function exchangeGoogleUnifiedCode(
  code: string,
  existing?: GoogleCredentials,
): Promise<GoogleCredentials> {
  const { clientId, clientSecret, redirectUri } = requireGoogleOAuthEnv();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = (await response.json()) as GoogleTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok) {
    throw new Error(
      json.error_description ?? json.error ?? "Google unified OAuth token request failed.",
    );
  }
  return {
    ...(existing ?? {}),
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? existing?.refresh_token,
    expires_at: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : existing?.expires_at,
    scope: json.scope ?? existing?.scope,
    token_type: json.token_type ?? existing?.token_type,
  };
}

export function hasCalendarScope(credentials: GoogleCredentials): boolean {
  return credentials.scope?.includes("calendar") ?? false;
}

export function hasGmailScope(credentials: GoogleCredentials): boolean {
  return credentials.scope?.includes("gmail") ?? false;
}
