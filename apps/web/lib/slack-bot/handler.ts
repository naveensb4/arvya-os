import { getRepository } from "@/lib/db/repository";
import { answerBrainQuestion } from "@/lib/brain/store";
import { runMeetingPrep, getLatestMeetingPrep } from "@/lib/agents/meeting-prep";
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

function levenshteinDistance(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[la][lb];
}

function findBestMeetingMatch(
  query: string,
  meetings: Array<{ id: string; title: string }>,
): { id: string; title: string } | null {
  const q = query.toLowerCase();
  let best: { id: string; title: string } | null = null;
  let bestScore = Infinity;

  for (const meeting of meetings) {
    const t = meeting.title.toLowerCase();
    if (t.includes(q) || q.includes(t)) return meeting;

    const distance = levenshteinDistance(q, t);
    const normalized = distance / Math.max(q.length, t.length);
    if (normalized < 0.4 && normalized < bestScore) {
      bestScore = normalized;
      best = meeting;
    }
  }

  return best;
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

  // Prep intent — must be checked BEFORE the general Q&A branch
  const prepMatch = question.match(/\bprep(?:\s+me)?\s+(?:for\s+)?(.+)$/i);
  if (prepMatch) {
    const meetingQuery = prepMatch[1].trim();
    try {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const meetings = await repository.listNotetakerMeetings({
        brainId,
        from: todayStart.toISOString(),
        to: todayEnd.toISOString(),
      });

      if (meetings.length === 0) {
        await postThreadReply(botToken, event.channel, threadTs, `No meetings found for today. _${brain.name}_`);
        return;
      }

      const bestMatch = findBestMeetingMatch(meetingQuery, meetings);
      if (!bestMatch) {
        const titles = meetings.map((m) => `• ${m.title}`).join("\n");
        await postThreadReply(
          botToken,
          event.channel,
          threadTs,
          `I couldn't match "${meetingQuery}" to any meeting today. Today's meetings:\n${titles}\n\n_${brain.name}_`,
        );
        return;
      }

      await postThreadReply(
        botToken,
        event.channel,
        threadTs,
        `Preparing brief for *${bestMatch.title}*... _${brain.name}_`,
      );

      const result = await runMeetingPrep(brainId, bestMatch.id, { skipIdempotency: true });
      if (result.status === "succeeded_low_confidence") {
        await postThreadReply(
          botToken,
          event.channel,
          threadTs,
          `Brain isn't confident enough about this prep (${result.brief.overall_confidence.toFixed(2)}). Connect Gmail to grow context. _${brain.name}_`,
        );
      }
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Prep failed";
      console.error("[slack-bot] Prep error:", message);
      await postThreadReply(
        botToken,
        event.channel,
        threadTs,
        `Meeting prep failed: ${message}. _${brain.name}_`,
      );
      return;
    }
  }

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
