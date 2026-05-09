// Auto-create the private #arvya-brain channel for a brain on first nudge.
//
// Idempotent: returns the cached channel_id from brain.metadata if already
// created, falls back to conversations.list if a channel with the same
// name exists (e.g. a previous install), otherwise calls
// conversations.create. Then invites any configured user IDs from the
// slack connector config.
//
// Caches the result in brains.metadata.slack_arvya_brain_channel_id so we
// don't hit the API on every nudge.

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { brains as brainsTable } from "@/lib/db/schema";
import { getRepository } from "@/lib/db/repository";
import {
  createSlackChannel,
  findSlackChannelByName,
  inviteSlackUsersToChannel,
} from "@/lib/connectors/slack";

const ARVYA_BRAIN_CHANNEL_NAME = "arvya-brain";
const METADATA_KEY = "slack_arvya_brain_channel_id";

type SlackConnectorConfig = {
  botToken: string;
  installerUserId?: string;
  // Optional: extra Slack user IDs to invite. If not configured, we just
  // invite installerUserId.
  nudgeRecipients?: string[];
};

function readSlackConfig(config: Record<string, unknown> | null | undefined): SlackConnectorConfig | null {
  if (!config) return null;
  const botToken = config.botToken;
  if (typeof botToken !== "string" || !botToken) return null;
  const installerUserId = typeof config.installerUserId === "string" ? config.installerUserId : undefined;
  const recipientsRaw = config.nudgeRecipients;
  const nudgeRecipients = Array.isArray(recipientsRaw)
    ? recipientsRaw.filter((id): id is string => typeof id === "string")
    : undefined;
  return { botToken, installerUserId, nudgeRecipients };
}

async function readCachedChannelId(brainId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ metadata: brainsTable.metadata })
    .from(brainsTable)
    .where(eq(brainsTable.id, brainId))
    .limit(1);
  if (!row) return null;
  const value = (row.metadata as Record<string, unknown> | null)?.[METADATA_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function writeCachedChannelId(brainId: string, channelId: string): Promise<void> {
  const db = getDb();
  // Merge into existing metadata jsonb; do not clobber other keys.
  const [row] = await db
    .select({ metadata: brainsTable.metadata })
    .from(brainsTable)
    .where(eq(brainsTable.id, brainId))
    .limit(1);
  const next = {
    ...((row?.metadata as Record<string, unknown> | null) ?? {}),
    [METADATA_KEY]: channelId,
  };
  await db.update(brainsTable).set({ metadata: next, updatedAt: new Date() }).where(eq(brainsTable.id, brainId));
}

async function getSlackConfigForBrain(brainId: string): Promise<SlackConnectorConfig | null> {
  const repository = getRepository();
  const configs = await repository.listConnectorConfigs(brainId);
  const slack = configs.find((c) => c.connectorType === "slack" && c.status === "connected");
  if (!slack) return null;
  return readSlackConfig(slack.config as Record<string, unknown>);
}

export async function ensureArvyaBrainChannel(brainId: string): Promise<{
  channelId: string;
  botToken: string;
  recipients: string[];
} | null> {
  const slack = await getSlackConfigForBrain(brainId);
  if (!slack) return null;

  // Cached?
  const cached = await readCachedChannelId(brainId);
  if (cached) {
    return {
      channelId: cached,
      botToken: slack.botToken,
      recipients: slack.nudgeRecipients ?? (slack.installerUserId ? [slack.installerUserId] : []),
    };
  }

  // Try to create. Most workspaces will hit this path on first run.
  const created = await createSlackChannel({
    botToken: slack.botToken,
    name: ARVYA_BRAIN_CHANNEL_NAME,
    isPrivate: true,
  });

  let channelId: string | null = null;
  if ("id" in created) {
    channelId = created.id;
  } else if (created.error === "name_taken") {
    // Pre-existing channel (e.g. left over from a prior install). Look it up.
    const found = await findSlackChannelByName({
      botToken: slack.botToken,
      name: ARVYA_BRAIN_CHANNEL_NAME,
    });
    if (found) channelId = found.id;
  } else {
    // Hard error. Surface to caller — they might fall back to DM.
    console.error(`[channel-bootstrap] create failed: ${created.error}`);
    return null;
  }

  if (!channelId) return null;

  const recipients = slack.nudgeRecipients ?? (slack.installerUserId ? [slack.installerUserId] : []);
  if (recipients.length > 0) {
    try {
      await inviteSlackUsersToChannel({
        botToken: slack.botToken,
        channelId,
        userIds: recipients,
      });
    } catch (error) {
      console.error("[channel-bootstrap] invite failed (continuing):", error);
    }
  }

  await writeCachedChannelId(brainId, channelId);

  return { channelId, botToken: slack.botToken, recipients };
}
