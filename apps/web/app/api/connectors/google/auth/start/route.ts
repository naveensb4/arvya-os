import { NextResponse } from "next/server";
import { ensureDefaultConnectorConfigs } from "@/lib/always-on/runtime";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { encodeOAuthState } from "@/lib/connectors/email-common";
import { GMAIL_SCOPE } from "@/lib/connectors/gmail";
import { GOOGLE_DRIVE_SCOPE } from "@/lib/connectors/google-drive";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

const UNIFIED_SCOPES = [
  GMAIL_SCOPE,
  GOOGLE_DRIVE_SCOPE,
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

function requireEnv() {
  const clientId = (process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID)?.trim();
  const redirectUri = process.env.GOOGLE_UNIFIED_REDIRECT_URI?.trim()
    ?? process.env.GMAIL_REDIRECT_URI?.trim()?.replace("/gmail/", "/google/");
  if (!clientId || !redirectUri) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_UNIFIED_REDIRECT_URI.");
  }
  return { clientId, redirectUri };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const brainId = url.searchParams.get("brainId")?.trim();
  const returnUrl = url.searchParams.get("return")?.trim();
  if (!brainId) return NextResponse.json({ error: "brainId is required" }, { status: 400 });

  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  await ensureDefaultConnectorConfigs(selectedBrainId);

  const statePayload: Record<string, string> = { brainId: selectedBrainId, connectorConfigId: "unified" };
  if (returnUrl) statePayload.returnUrl = returnUrl;

  const { clientId, redirectUri } = requireEnv();
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", UNIFIED_SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", Buffer.from(JSON.stringify(statePayload), "utf8").toString("base64url"));

  return NextResponse.redirect(authUrl);
}
