import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { exchangeOutlookCode, markOutlookConnected, parseOutlookOAuthState } from "@/lib/connectors/outlook";
import { getRepository } from "@/lib/db/repository";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const oauthError = url.searchParams.get("error")?.trim();

  if (oauthError) return NextResponse.json({ error: oauthError }, { status: 400 });
  if (!code || !state) return NextResponse.json({ error: "Outlook OAuth callback requires code and state" }, { status: 400 });

  const { brainId, connectorConfigId } = parseOutlookOAuthState(state);
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const config = (await getRepository().listConnectorConfigs(selectedBrainId)).find((item) => item.id === connectorConfigId);
  if (!config || config.connectorType !== "outlook") {
    return NextResponse.json({ error: "Outlook connector config was not found" }, { status: 404 });
  }

  const credentials = await exchangeOutlookCode(code, config.credentials ?? undefined);
  await markOutlookConnected(config.id, credentials);

  revalidatePath(`/brains/${selectedBrainId}`);
  revalidatePath(`/brains/${selectedBrainId}/connections`);
  return NextResponse.redirect(new URL(`/brains/${selectedBrainId}/connections`, request.url));
}
