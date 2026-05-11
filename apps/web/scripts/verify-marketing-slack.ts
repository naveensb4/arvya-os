import crypto from "node:crypto";
import { resetRepositoryForTests } from "@/lib/db/repository";
import {
  handleSlackGrowthCommand,
  handleSlackMarketingEvent,
  handleSlackMarketingInteraction,
  verifySlackRequest,
} from "@/lib/marketing/slack";

function signature(rawBody: string, timestamp: string, secret: string) {
  return `v0=${crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
}

async function main() {
  delete process.env.DATABASE_URL;
  process.env.MARKETING_OS_DRY_RUN = "true";
  process.env.MARKETING_OS_DEFAULT_BRAIN_ID = "arvya-company-brain";
  process.env.MARKETING_OS_SLACK_CHANNEL_ID = "C-growth";
  process.env.SLACK_SIGNING_SECRET = "test-secret";
  resetRepositoryForTests();

  const rawBody = JSON.stringify({ event: { text: "growth: test" } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  if (!verifySlackRequest({ rawBody, timestamp, signature: signature(rawBody, timestamp, "test-secret") })) {
    throw new Error("Slack signature verification failed.");
  }

  const eventResult = await handleSlackMarketingEvent({
    type: "event_callback",
    event: {
      type: "message",
      channel: "C-growth",
      user: "U-naveen",
      ts: "1778450000.000100",
      text: "growth: Banker pain: weekly updates require reconstructing buyer status from Outlook threads.",
    },
  });
  if (eventResult.type !== "drafted" || eventResult.insightCount < 1 || eventResult.postIds.length < 3) {
    throw new Error(`Expected Slack event ingestion, got ${JSON.stringify(eventResult)}`);
  }

  const commandResult = await handleSlackGrowthCommand({
    text: "save MDs need pre-meeting context without asking associates to rebuild the whole timeline.",
    userId: "U-pb",
    channelId: "C-growth",
  });
  if (!commandResult.ok || !commandResult.blocks || (commandResult.postIds?.length ?? 0) < 3) {
    throw new Error(commandResult.message);
  }

  const interactionResult = await handleSlackMarketingInteraction({
    type: "block_actions",
    user: { id: "U-naveen" },
    actions: [{ action_id: "marketing_archive", value: commandResult.postIds?.[0] }],
  });
  if (!interactionResult.ok) throw new Error(interactionResult.message);

  console.log("Marketing Slack verification passed", {
    eventContentItemId: eventResult.contentItemId,
    commandContentItemId: commandResult.contentItemId,
    commandOptions: commandResult.postIds?.length,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
