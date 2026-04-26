import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  exchangeGoogleDriveCode,
  parseGoogleDriveOAuthState,
  type GoogleDriveCredentials,
} from "@/lib/connectors/google-drive";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { connectorCredentialStore } from "@/lib/connectors/credential-store";
import { getRepository } from "@/lib/db/repository";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const oauthError = url.searchParams.get("error")?.trim();

  if (oauthError) {
    return NextResponse.json({ error: oauthError }, { status: 400 });
  }
  if (!code || !state) {
    return NextResponse.json({ error: "Google Drive OAuth callback requires code and state" }, { status: 400 });
  }

  const { brainId, connectorConfigId } = parseGoogleDriveOAuthState(state);
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const repository = getRepository();
  const config = (await repository.listConnectorConfigs(selectedBrainId)).find((item) => item.id === connectorConfigId);
  if (!config || config.connectorType !== "google_drive") {
    return NextResponse.json({ error: "Google Drive connector config was not found" }, { status: 404 });
  }

  const existingCredentials = (config.credentials ?? undefined) as GoogleDriveCredentials | undefined;
  const credentials = await exchangeGoogleDriveCode(code, existingCredentials);
  await connectorCredentialStore.write(config.id, credentials);
  await repository.updateConnectorConfig(config.id, {
    status: "connected",
    lastError: null,
  });

  revalidatePath(`/brains/${selectedBrainId}`);
  revalidatePath(`/brains/${selectedBrainId}/connections`);
  return NextResponse.redirect(new URL(`/brains/${selectedBrainId}/connections`, request.url));
}
