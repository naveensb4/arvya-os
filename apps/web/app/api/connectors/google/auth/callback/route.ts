import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { decodeOAuthState } from "@/lib/connectors/email-common";
import { getRepository } from "@/lib/db/repository";
import { runNotetakerCalendarSync } from "@/lib/notetaker/runtime";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function requireEnv() {
  const clientId = (process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID)?.trim();
  const clientSecret = (process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET)?.trim();
  const redirectUri = process.env.GOOGLE_UNIFIED_REDIRECT_URI?.trim()
    ?? process.env.GMAIL_REDIRECT_URI?.trim()?.replace("/gmail/", "/google/");
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth not configured.");
  }
  return { clientId, clientSecret, redirectUri };
}

type TokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const oauthError = url.searchParams.get("error")?.trim();

  if (oauthError) {
    const origin = url.origin;
    return NextResponse.redirect(new URL("/onboarding?error=oauth_denied", origin));
  }

  if (!code || !state) {
    return NextResponse.json({ error: "Google OAuth callback requires code and state" }, { status: 400 });
  }

  const stateData = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
    brainId?: string;
    returnUrl?: string;
  };
  const brainId = stateData.brainId;
  if (!brainId) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }
  const stateReturnUrl = stateData.returnUrl;
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const repository = getRepository();

  const { clientId, clientSecret, redirectUri } = requireEnv();
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
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
  const token = (await tokenRes.json()) as TokenResponse;

  if (!tokenRes.ok || token.error) {
    const origin = url.origin;
    return NextResponse.redirect(new URL(`/onboarding?error=token_exchange`, origin));
  }

  const credentials = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : undefined,
    scope: token.scope,
    token_type: token.token_type,
  };

  const configs = await repository.listConnectorConfigs(selectedBrainId);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const gmailOnboardingConfig = {
    labelIds: ["INBOX"],
    mode: "onboarding",
    watermark: sevenDaysAgo,
  };

  const gmailConfig = configs.find((c) => c.connectorType === "gmail");
  if (gmailConfig) {
    await repository.updateConnectorConfig(gmailConfig.id, {
      credentials,
      status: "connected",
      syncEnabled: true,
      syncIntervalMinutes: 10,
      config: { ...gmailConfig.config, ...gmailOnboardingConfig },
    });
  } else {
    await repository.createConnectorConfig({
      brainId: selectedBrainId,
      connectorType: "gmail",
      status: "connected",
      config: gmailOnboardingConfig,
      credentials,
      syncEnabled: true,
      syncIntervalMinutes: 10,
    });
  }

  const driveOnboardingConfig = {
    mode: "recent_files",
    watermark: sevenDaysAgo,
  };

  const driveConfig = configs.find((c) => c.connectorType === "google_drive");
  if (driveConfig) {
    await repository.updateConnectorConfig(driveConfig.id, {
      credentials,
      status: "connected",
      syncEnabled: true,
      syncIntervalMinutes: 10,
      config: { ...driveConfig.config, ...driveOnboardingConfig },
    });
  } else {
    await repository.createConnectorConfig({
      brainId: selectedBrainId,
      connectorType: "google_drive",
      status: "connected",
      config: driveOnboardingConfig,
      credentials,
      syncEnabled: true,
      syncIntervalMinutes: 10,
    });
  }

  const existingCalendars = await repository.listNotetakerCalendars({ brainId: selectedBrainId });
  const existingGoogleCalendar = existingCalendars.find(
    (c) => c.provider === "google_calendar",
  );
  if (!existingGoogleCalendar) {
    await repository.createNotetakerCalendar({
      brainId: selectedBrainId,
      provider: "google_calendar",
      status: "connected",
      autoJoinEnabled: true,
      autoJoinMode: "all_calls",
      config: { credentials },
    });
  } else {
    // Refresh credentials if the user reconnected so the stored access token
    // matches the just-completed grant.
    await repository.updateNotetakerCalendar(existingGoogleCalendar.id, {
      status: "connected",
      config: { ...existingGoogleCalendar.config, credentials },
      lastError: null,
    });
  }

  // Trigger an immediate sync so the dashboard shows real meetings without
  // waiting for the 10-minute inngest cron tick. Errors are swallowed - the
  // sync also runs lazily on dashboard load and via the cron.
  await runNotetakerCalendarSync({ brainId: selectedBrainId }).catch(() => {});

  revalidatePath(`/brains/${selectedBrainId}`);
  revalidatePath(`/brains/${selectedBrainId}/connections`);

  const returnUrl = stateReturnUrl || `/brains/${selectedBrainId}/connections`;
  return NextResponse.redirect(new URL(returnUrl, url.origin));
}
