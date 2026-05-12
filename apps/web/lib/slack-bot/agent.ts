import Anthropic from "@anthropic-ai/sdk";
import type { TextBlock, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { getRepository } from "@/lib/db/repository";
import { answerBrainQuestion } from "@/lib/brain/store";
import { SlackMessenger } from "./slack-messenger";
import { toolDefinitions, toolStatusMessage, executeTool } from "./tools";
import type { ModelProvider } from "@arvya/core";

const MAX_ITERATIONS = 10;
const TIMEOUT_MS = 60_000;

function buildSystemPrompt(): string {
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const endOfToday = `${todayISO}T23:59:59Z`;
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });

  return `You are Arvya Brain, a second brain for deal teams. You answer questions using the tools available to you.

Today is ${dateStr}. The current time is ${timeStr} PT.
Today's ISO date: ${todayISO}
End of today: ${endOfToday}
One week from today: ${nextWeek}

Calendar date handling:
- "today" / "what's on my calendar" → from: "${todayISO}T00:00:00Z", to: "${endOfToday}"
- "this week" / "coming up" / "what meetings do I have" → from: "${todayISO}T00:00:00Z", to: "${nextWeek}T23:59:59Z"
- "tomorrow" → from: the next day's ISO date at T00:00:00Z, to: that day at T23:59:59Z
- "yesterday" → from: the previous day, to: end of that day
- If the user asks about a specific person or meeting without a date, check the next 7 days
- Always use full ISO 8601 format (e.g. ${todayISO}T00:00:00Z) when calling get_calendar_events

Rules:
- Always cite your sources. When referencing memory, include the source title.
- When referencing calendar events, include the time and attendees.
- If a tool returns empty results, say so honestly — never make up information.
- If a tool errors (e.g., calendar not connected), tell the user what happened and suggest they connect it in the Arvya dashboard.
- Keep answers concise. Use Slack formatting (*bold*, _italic_, bullet lists).
- Format calendar responses as a clean list with time, title, and attendees.
- When both calendar and memory have relevant info, combine them into one cohesive answer.`;
}

type AgentInput = {
  brainId: string;
  brainName: string;
  question: string;
  messenger: SlackMessenger;
  threadMessages?: string[];
};

export async function runAgent(input: AgentInput): Promise<void> {
  const { brainId, brainName, question, messenger } = input;
  const repository = getRepository();

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[agent] No ANTHROPIC_API_KEY, falling back to answerBrainQuestion");
    await fallback(brainId, brainName, question, messenger);
    return;
  }

  const anthropic = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5-20250514";

  const agentRun = await repository.createAgentRun({
    brainId,
    name: "slack-agent",
    modelProvider: "anthropic" as ModelProvider,
    stepName: "agent-loop",
    inputSummary: question.slice(0, 200),
    rawInput: { question, threadMessages: input.threadMessages },
  });

  const messages: Anthropic.MessageParam[] = [];

  if (input.threadMessages && input.threadMessages.length > 0) {
    const context = input.threadMessages
      .slice(-10)
      .map((msg, i) => `[${i + 1}] ${msg}`)
      .join("\n");
    messages.push({
      role: "user",
      content: `Previous messages in this thread:\n${context}\n\nCurrent question: ${question}`,
    });
  } else {
    messages.push({ role: "user", content: question });
  }

  const deadline = Date.now() + TIMEOUT_MS;

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      if (Date.now() > deadline) {
        await messenger.updateFinal(
          `Sorry, I ran out of time processing your request. Try asking a simpler question.\n\n_${brainName}_`,
        );
        await repository.updateAgentRun(agentRun.id, {
          status: "failed",
          error: "timeout",
          completedAt: new Date().toISOString(),
        });
        return;
      }

      const response = await anthropic.messages.create({
        model,
        system: buildSystemPrompt(),
        tools: toolDefinitions as Anthropic.Tool[],
        messages,
        max_tokens: 2048,
      });

      if (response.stop_reason === "end_turn") {
        const textBlock = response.content.find((b): b is TextBlock => b.type === "text");
        const finalText = textBlock?.text ?? "I wasn't able to come up with an answer.";
        await messenger.updateFinal(`${finalText}\n\n_${brainName}_`);
        await repository.updateAgentRun(agentRun.id, {
          status: "succeeded",
          outputSummary: finalText.slice(0, 500),
          completedAt: new Date().toISOString(),
        });
        return;
      }

      const toolUseBlocks = response.content.filter(
        (b): b is ToolUseBlock => b.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
        const textBlock = response.content.find((b): b is TextBlock => b.type === "text");
        const text = textBlock?.text ?? "I wasn't able to come up with an answer.";
        await messenger.updateFinal(`${text}\n\n_${brainName}_`);
        await repository.updateAgentRun(agentRun.id, {
          status: "succeeded",
          outputSummary: text.slice(0, 500),
          completedAt: new Date().toISOString(),
        });
        return;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        messenger.updateStatus(toolStatusMessage(block.name));
        const { result, summary } = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          brainId,
        );
        messenger.updateStatus(summary);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    }

    await messenger.updateFinal(
      `I used all my thinking steps but couldn't finalize an answer. Try rephrasing your question.\n\n_${brainName}_`,
    );
    await repository.updateAgentRun(agentRun.id, {
      status: "failed",
      error: "max_iterations",
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent error";
    console.error("[agent] Agent loop error:", message);
    await repository.updateAgentRun(agentRun.id, {
      status: "failed",
      error: message.slice(0, 500),
      completedAt: new Date().toISOString(),
    });
    await fallback(brainId, brainName, question, messenger);
  }
}

async function fallback(
  brainId: string,
  brainName: string,
  question: string,
  messenger: SlackMessenger,
): Promise<void> {
  try {
    const answer = await answerBrainQuestion(brainId, question);
    const parts: string[] = [];
    parts.push(answer.answer);
    if (answer.citations.length > 0) {
      parts.push("");
      for (const c of answer.citations.slice(0, 3)) {
        parts.push(`- ${c.sourceTitle}: ${c.evidence.slice(0, 200)}`);
      }
    }
    if (answer.followUp) {
      parts.push("");
      parts.push(answer.followUp);
    }
    parts.push("");
    parts.push(`_${brainName}_`);
    await messenger.updateFinal(parts.join("\n"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[agent] Fallback error:", msg);
    await messenger.updateFinal(
      `Something went wrong, try again. _${brainName}_`,
    );
  }
}
