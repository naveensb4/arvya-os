import { getRepository } from "@/lib/db/repository";
import { answerBrainQuestion } from "@/lib/brain/store";
import type { BrainAnswer } from "@arvya/core";

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

function formatSlackAnswer(answer: BrainAnswer, brainName: string): string {
  const parts: string[] = [];
  parts.push(`*${answer.answer}*`);

  if (answer.citations.length > 0) {
    parts.push("");
    for (const citation of answer.citations.slice(0, 3)) {
      parts.push(`- ${citation.sourceTitle}: ${citation.evidence.slice(0, 200)}`);
    }
  }

  if (answer.followUp) {
    parts.push("");
    parts.push(answer.followUp);
  }

  parts.push("");
  parts.push(`_${brainName}_`);

  return parts.join("\n");
}

async function postThreadReply(botToken: string, channel: string, threadTs: string, text: string) {
  const resp = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, thread_ts: threadTs, text }),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(`Slack reply failed: ${data.error}`);
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
    await postThreadReply(botToken, event.channel, threadTs, "I couldn't find your brain. Please check the Slack connector setup.");
    return;
  }

  const memories = await repository.listMemoryObjects(brainId, { limit: 10 });
  if (memories.length < 10) {
    await postThreadReply(
      botToken,
      event.channel,
      threadTs,
      `I'm still learning — try again in a few minutes. _${brain.name}_`,
    );
    return;
  }

  const question = cleanMentionText(event.text);
  if (!question) return;

  try {
    const answer = await answerBrainQuestion(brainId, question);
    const formatted = formatSlackAnswer(answer, brain.name);
    await postThreadReply(botToken, event.channel, threadTs, formatted);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[slack-bot] Q&A error:", message);
    await postThreadReply(
      botToken,
      event.channel,
      threadTs,
      `Something went wrong, try again. _${brain.name}_`,
    );
  }
}
