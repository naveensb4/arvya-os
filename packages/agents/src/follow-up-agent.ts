import {
  followUpDraftAnswerSchema,
  type AiClient,
  type Brain,
  type FollowUpDraft,
  type OpenLoop,
  type SourceItem,
} from "@arvya/core";
import { buildFollowUpPrompt, followUpSystemPrompt } from "@arvya/prompts/follow-up";

export function extractOpenLoops(openLoops: OpenLoop[]) {
  return openLoops.filter((loop) => loop.status === "open" || loop.status === "in_progress" || loop.status === "waiting");
}

export async function draftFollowUps(input: {
  brain: Brain;
  openLoops: OpenLoop[];
  sourceItems: SourceItem[];
  ai?: AiClient;
}): Promise<FollowUpDraft[]> {
  const openLoops = extractOpenLoops(input.openLoops);

  if (input.ai?.available && openLoops.length > 0) {
    const result = await input.ai.completeStructured({
      system: followUpSystemPrompt,
      prompt: buildFollowUpPrompt({
        brainName: input.brain.name,
        brainKind: input.brain.kind,
        brainThesis: input.brain.thesis,
        openLoops: openLoops.map((loop) => ({
          id: loop.id,
          title: loop.title,
          description: loop.description,
          sourceQuote: loop.sourceQuote,
          owner: loop.owner,
          dueDate: loop.dueDate,
          sourceTitle:
            input.sourceItems.find((source) => source.id === loop.sourceItemId)?.title ??
            "Unknown source",
          createdAt: loop.createdAt,
        })),
      }),
      schema: followUpDraftAnswerSchema,
      schemaName: "follow_up_drafts",
      schemaDescription: "Drafted follow-ups for open loops.",
      maxTokens: 3000,
    });

    const openLoopIds = new Set(openLoops.map((loop) => loop.id));
    return result.data.drafts.filter((draft) => openLoopIds.has(draft.openLoopId));
  }

  return openLoops.slice(0, 8).map((loop) => ({
    openLoopId: loop.id,
    title: loop.title,
    channel: "manual",
    owner: loop.owner,
    draft: loop.suggestedFollowUpEmail?.body ?? `Review and resolve: ${loop.description}\n\nSource evidence: "${loop.sourceQuote ?? "No quote captured."}"`,
    rationale:
      "This deterministic draft preserves the source evidence and asks a human to resolve the open loop.",
  }));
}
