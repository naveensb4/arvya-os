import type { AiClient, SourceItem } from "@arvya/core";

export type ToneAnalysis = {
  description: string;
  based_on_n_messages: number;
  confidence: number;
};

export async function analyzeTone(input: {
  attendeeEmail: string;
  attendeeName: string;
  sourceItems: SourceItem[];
  ai: AiClient;
}): Promise<ToneAnalysis> {
  const matchingItems = input.sourceItems.filter((item) => {
    const content = `${item.title} ${item.content}`.toLowerCase();
    const email = input.attendeeEmail.toLowerCase();
    const name = input.attendeeName.toLowerCase();
    return content.includes(email) || content.includes(name);
  });

  if (matchingItems.length === 0) {
    return {
      description: "",
      based_on_n_messages: 0,
      confidence: 0,
    };
  }

  const corpus = matchingItems
    .slice(0, 10)
    .map((item) => item.content.slice(0, 500))
    .join("\n---\n");

  if (!input.ai.available) {
    return {
      description: "Tone analysis unavailable (no AI provider configured)",
      based_on_n_messages: matchingItems.length,
      confidence: 0.1,
    };
  }

  try {
    const result = await input.ai.complete({
      system: "You analyze communication tone. Respond with a single concise sentence describing the person's communication style based on the provided messages. Focus on: formality level, response length preference, directness, and any notable patterns.",
      prompt: `Analyze the communication tone of ${input.attendeeName} (${input.attendeeEmail}) based on these ${matchingItems.length} message excerpts:\n\n${corpus}\n\nRespond with ONE sentence describing their tone and style.`,
      maxTokens: 100,
      temperature: 0.3,
    });

    return {
      description: result.text.trim(),
      based_on_n_messages: matchingItems.length,
      confidence: Math.min(0.9, 0.4 + matchingItems.length * 0.1),
    };
  } catch (error) {
    console.warn("[tone-analyze] Error:", error instanceof Error ? error.message : error);
    return {
      description: "",
      based_on_n_messages: matchingItems.length,
      confidence: 0,
    };
  }
}
