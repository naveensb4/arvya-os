import {
  dailyBriefAnswerSchema,
  type AiClient,
  type Brain,
  type DailyBrief,
  type MemoryObject,
  type OpenLoop,
  type SourceItem,
} from "@arvya/core";
import {
  buildDailyBriefPrompt,
  dailyBriefSystemPrompt,
} from "@arvya/prompts/daily-brief";

export async function buildDailyBrief(input: {
  brain: Brain;
  memoryObjects: MemoryObject[];
  openLoops: OpenLoop[];
  sourceItems: SourceItem[];
  ai?: AiClient;
}): Promise<DailyBrief> {
  const decisions = input.memoryObjects
    .filter((memory) => memory.objectType === "decision")
    .slice(0, 3);
  const insights = input.memoryObjects
    .filter((memory) => memory.objectType === "insight" || memory.objectType === "product_insight")
    .slice(0, 4);
  const actionableOpenLoops = input.openLoops
    .filter((loop) => loop.status === "open" || loop.status === "in_progress" || loop.status === "waiting")
    .slice(0, 10);
  const loopsToReview = input.openLoops
    .filter((loop) => loop.status === "needs_review")
    .slice(0, 10);

  if (input.ai?.available) {
    const result = await input.ai.completeStructured({
      system: dailyBriefSystemPrompt,
      prompt: buildDailyBriefPrompt({
        brainName: input.brain.name,
        brainKind: input.brain.kind,
        brainThesis: input.brain.thesis,
        memoryObjects: input.memoryObjects.slice(0, 50).map((memory) => ({
          id: memory.id,
          objectType: memory.objectType,
          name: memory.name,
          description: memory.description,
          confidence: memory.confidence ?? 0.7,
          status: memory.status,
          sourceTitle:
            input.sourceItems.find((source) => source.id === memory.sourceItemId)?.title ??
            "Unknown source",
          createdAt: memory.createdAt,
        })),
        openLoops: actionableOpenLoops.map((loop) => ({
          id: loop.id,
          title: loop.title,
          description: loop.description,
          status: loop.status,
          priority: loop.priority,
          owner: loop.owner,
          dueDate: loop.dueDate,
          sourceTitle:
            input.sourceItems.find((source) => source.id === loop.sourceItemId)?.title ??
            "Unknown source",
          createdAt: loop.createdAt,
        })),
      }),
      schema: dailyBriefAnswerSchema,
      schemaName: "daily_brief",
      schemaDescription: "A concise source-grounded daily brief for a Brain.",
      maxTokens: 2200,
    });

    return {
      brainId: input.brain.id,
      generatedAt: new Date().toISOString(),
      headline: result.data.headline,
      summary: result.data.summary,
      priorities: result.data.priorities.map((priority) => ({
        title: priority.title,
        detail: priority.detail,
        sourceItemIds: priority.memoryIds
          ?.map((id) => {
            const memory = input.memoryObjects.find((item) => item.id === id);
            const loop = input.openLoops.find((item) => item.id === id);
            return memory?.sourceItemId ?? loop?.sourceItemId;
          })
          .filter((id): id is string => Boolean(id)),
      })),
      decisions,
      insights,
      actions: actionableOpenLoops,
      openLoops: actionableOpenLoops,
      loopsToReview,
    };
  }

  return {
    brainId: input.brain.id,
    generatedAt: new Date().toISOString(),
    headline:
      actionableOpenLoops.length > 0
        ? `${actionableOpenLoops.length} approved open loop${actionableOpenLoops.length === 1 ? "" : "s"} need attention`
        : loopsToReview.length > 0
          ? `${loopsToReview.length} new loop${loopsToReview.length === 1 ? "" : "s"} need review`
        : "Brain memory is current",
    summary: `${input.brain.name} has ${input.memoryObjects.length} memory objects, ${actionableOpenLoops.length} approved open loops, and ${loopsToReview.length} new loops to review. Add sources or configure an AI key for richer synthesis.`,
    priorities: actionableOpenLoops.slice(0, 5).map((loop) => ({
      title: loop.title,
      detail: loop.description,
      sourceItemIds: loop.sourceItemId ? [loop.sourceItemId] : [],
    })),
    decisions,
    insights,
    actions: actionableOpenLoops,
    openLoops: actionableOpenLoops,
    loopsToReview,
  };
}
