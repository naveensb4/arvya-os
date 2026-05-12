import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import {
  exchangeSlackCode,
  listSlackChannels,
  openSlackDm,
  postSlackMessage,
} from "@/lib/connectors/slack";
import { getRepository } from "@/lib/db/repository";

function welcomeText(brainName: string): string {
  // Capability list - what the bot can actually do today. Keep this in
  // sync with handleSlackMention so we don't promise things we can't do.
  return [
    `:tada: *${brainName}* is now connected to this Slack workspace.`,
    "",
    "*What I can do for you, right here in Slack:*",
    "• Answer questions from your real sources — emails, calls, transcripts, docs, Slack messages. Every answer cites the source it came from.",
    "• Find people and companies — _who is Sumit Roy_, _what does Marlowe care about_, _which investors did we talk to last month_.",
    "• Track open promises — _what did we promise customers this week_, _what's overdue_.",
    "• Surface drift — _where did we say we'd be vs where we are_.",
    "• Catch you up — _catch me up on the BlackRock thread_, _what happened in Friday's standup_.",
    "• *Prep you for meetings* — every morning at 7am I'll DM you a confidence-scored, source-cited brief for each meeting on your calendar. You can also say `prep me for <meeting>` anytime.",
    "",
    "*How to use me:*",
    "• *DM me directly* — just type a question in this chat",
    "• *Mention me in any channel* — `@Arvya-Brain what did we decide about pricing?`",
    "• *Prep on demand* — `@Arvya-Brain prep me for Sequoia` or use `/meeting-prep <title>`",
    "",
    "*Things I'm learning from right now:*",
    "Connected channels' history, your Gmail (if connected), Google Drive transcripts (if connected), your meeting notes from Arvya Notetaker, and any docs you've ingested manually.",
    "",
    "_Confidence-scored. Source-cited. If I don't know, I'll tell you and ask for the source instead of making something up._",
  ].join("\n");
}

async function sendWelcomeMessage(
  botToken: string,
  brainName: string,
  installerUserId: string | undefined,
) {
  const text = welcomeText(brainName);
  // 1. Try DM the installer first - cleanest experience, no spam.
  if (installerUserId) {
    try {
      const dmChannelId = await openSlackDm(botToken, installerUserId);
      if (dmChannelId) {
        await postSlackMessage(botToken, dmChannelId, text);
        return;
      }
    } catch (err) {
      console.error("[slack-welcome] DM failed, trying #general:", err);
    }
  }
  // 2. Fall back to #general if DM fails or no installer id.
  try {
    const channels = await listSlackChannels(botToken);
    const general = channels.find((c) => c.name === "general");
    if (general) {
      await postSlackMessage(botToken, general.id, text);
    }
  } catch (err) {
    console.error("[slack-welcome] Failed to send welcome message:", err);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const oauthError = url.searchParams.get("error")?.trim();

  const rawState = url.searchParams.get("state")?.trim();
  let brainId: string | undefined;
  let stateReturnUrl: string | undefined;
  if (rawState) {
    try {
      const parsed = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8")) as {
        brainId?: string;
        returnUrl?: string;
      };
      brainId = parsed.brainId;
      stateReturnUrl = parsed.returnUrl;
    } catch {
      brainId = rawState;
    }
  }
  brainId = brainId || url.searchParams.get("brainId")?.trim();
  const fallbackUrl = brainId ? `/brains/${brainId}/connections` : "/onboarding";

  if (oauthError) {
    return NextResponse.redirect(new URL(`${fallbackUrl}?error=slack_denied`, url.origin));
  }
  if (!code) {
    return NextResponse.redirect(new URL(`${fallbackUrl}?error=slack_missing_code`, url.origin));
  }
  if (!brainId) {
    return NextResponse.redirect(new URL(`/onboarding?error=slack_no_brain`, url.origin));
  }

  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const host = request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const redirectUri = new URL("/api/connectors/slack/auth/callback", `${proto}://${host}`).toString();

  const slackConfig = await exchangeSlackCode(code, redirectUri);

  const configs = await getRepository().listConnectorConfigs(selectedBrainId);
  const existing = configs.find((c) => c.connectorType === "slack");

  const sevenDaysAgoTs = String(Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000));
  if (existing) {
    await getRepository().updateConnectorConfig(existing.id, {
      credentials: slackConfig,
      status: "connected",
      syncEnabled: true,
      syncIntervalMinutes: 10,
      config: { ...existing.config, teamId: slackConfig.teamId, teamName: slackConfig.teamName, watermark: existing.config.watermark ?? sevenDaysAgoTs },
    });
  } else {
    await getRepository().createConnectorConfig({
      brainId: selectedBrainId,
      connectorType: "slack",
      status: "connected",
      config: { teamId: slackConfig.teamId, teamName: slackConfig.teamName, watermark: sevenDaysAgoTs },
      credentials: slackConfig,
      syncEnabled: true,
      syncIntervalMinutes: 10,
    });
  }

  sendWelcomeMessage(
    slackConfig.botToken,
    selectedBrain.name,
    slackConfig.installerUserId,
  ).catch(() => {});

  revalidatePath(`/brains/${selectedBrainId}`);
  revalidatePath(`/brains/${selectedBrainId}/connections`);
  const returnUrl = stateReturnUrl || `/brains/${selectedBrainId}/connections`;
  return NextResponse.redirect(new URL(returnUrl, url.origin));
}
