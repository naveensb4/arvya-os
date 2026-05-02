import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { exchangeSlackCode, listSlackChannels, postSlackMessage } from "@/lib/connectors/slack";
import { getRepository } from "@/lib/db/repository";

async function sendWelcomeMessage(botToken: string, brainName: string) {
  try {
    const channels = await listSlackChannels(botToken);
    const general = channels.find((c) => c.name === "general");
    if (!general) return;
    await postSlackMessage(
      botToken,
      general.id,
      `*${brainName}* is now connected to this workspace.\n\nMention me in any channel to ask a question. I'll answer from everything the brain has learned — emails, calls, docs, and messages.\n\nExample: @Arvya what did we promise the client?`,
    );
  } catch (err) {
    console.error("[slack-welcome] Failed to send welcome message:", err);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const oauthError = url.searchParams.get("error")?.trim();

  if (oauthError) return NextResponse.json({ error: oauthError }, { status: 400 });
  if (!code) return NextResponse.json({ error: "Slack OAuth callback requires code" }, { status: 400 });

  const brainId = url.searchParams.get("state")?.trim() || url.searchParams.get("brainId")?.trim();
  if (!brainId) return NextResponse.json({ error: "brainId is required (pass via state or brainId param)" }, { status: 400 });

  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const host = request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const redirectUri = new URL("/api/connectors/slack/auth/callback", `${proto}://${host}`).toString();

  const slackConfig = await exchangeSlackCode(code, redirectUri);

  const configs = await getRepository().listConnectorConfigs(selectedBrainId);
  const existing = configs.find((c) => c.connectorType === "slack");

  if (existing) {
    await getRepository().updateConnectorConfig(existing.id, {
      credentials: slackConfig,
      status: "connected",
    });
  } else {
    await getRepository().createConnectorConfig({
      brainId: selectedBrainId,
      connectorType: "slack",
      status: "connected",
      config: { teamId: slackConfig.teamId, teamName: slackConfig.teamName },
      credentials: slackConfig,
    });
  }

  sendWelcomeMessage(slackConfig.botToken, selectedBrain.name).catch(() => {});

  revalidatePath(`/brains/${selectedBrainId}`);
  revalidatePath(`/brains/${selectedBrainId}/connections`);
  return NextResponse.redirect(new URL(`/brains/${selectedBrainId}/connections`, request.url));
}
