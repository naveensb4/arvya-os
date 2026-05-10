import { getRepository } from "@/lib/db/repository";
import { SlackMessenger } from "./slack-messenger";
import { runAgent } from "./agent";

type SlackMentionEvent = {
  type: string;
  event_id?: string;
  event: {
    type: string;
    text: string;
    user: string;
    channel: string;
    ts: string;
    thread_ts?: string;
    team?: string;
  };
  team_id?: string;
};

const processedEvents = new Set<string>();

function cleanMentionText(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

async function fetchThreadMessages(
  botToken: string,
  channel: string,
  threadTs: string,
  currentTs: string,
): Promise<string[]> {
  try {
    const resp = await fetch(
      `https://slack.com/api/conversations.replies?channel=${encodeURIComponent(channel)}&ts=${encodeURIComponent(threadTs)}&limit=20`,
      { headers: { Authorization: `Bearer ${botToken}` } },
    );
    const data = (await resp.json()) as { ok: boolean; messages?: Array<{ text: string; ts: string; user?: string; bot_id?: string }> };
    if (!data.ok || !data.messages) return [];
    return data.messages
      .filter((m) => m.ts !== currentTs)
      .slice(-10)
      .map((m) => cleanMentionText(m.text));
  } catch {
    return [];
  }
}

export async function handleSlackMention(payload: SlackMentionEvent): Promise<void> {
  const eventId = payload.event_id;
  if (eventId) {
    if (processedEvents.has(eventId)) return;
    processedEvents.add(eventId);
    if (processedEvents.size > 1000) {
      const entries = [...processedEvents];
      for (let i = 0; i < 500; i++) processedEvents.delete(entries[i]);
    }
  }

  const { event } = payload;
  const teamId = payload.team_id ?? event.team;
  if (!teamId) return;

  const repository = getRepository();
  const configs = await repository.listConnectorConfigs();
  const slackConfig = configs.find(
    (c) => c.connectorType === "slack" && c.status === "connected" && (c.config as any).teamId === teamId,
  );

  if (!slackConfig?.credentials) {
    return;
  }

  const botToken = (slackConfig.credentials as any).botToken as string;
  const brainId = slackConfig.brainId;
  const threadTs = event.thread_ts ?? event.ts;

  const brain = await repository.getBrain(brainId);
  if (!brain) {
    const messenger = new SlackMessenger(botToken, event.channel, threadTs);
    await messenger.postThinking();
    await messenger.updateFinal("I couldn't find your brain. Please check the Slack connector setup.");
    return;
  }

  const question = cleanMentionText(event.text ?? "");
  if (!question) return;

  const messenger = new SlackMessenger(botToken, event.channel, threadTs);
  await messenger.postThinking();

  const threadMessages = event.thread_ts
    ? await fetchThreadMessages(botToken, event.channel, event.thread_ts, event.ts)
    : undefined;

  await runAgent({
    brainId,
    brainName: brain.name,
    question,
    messenger,
    threadMessages: threadMessages && threadMessages.length > 0 ? threadMessages : undefined,
  });
}
