import {
  askAnswerSchema,
  type AiClient,
  type Brain,
  type BrainAnswer,
  type MemoryObject,
  type OpenLoop,
  type SourceCitation,
  type SourceItem,
} from "@arvya/core";
import { askBrainSystemPrompt, buildAskBrainPrompt } from "@arvya/prompts/ask-brain";

function sourceFor(
  sourceItems: SourceItem[],
  sourceItemId?: string,
): SourceItem | undefined {
  return sourceItems.find((source) => source.id === sourceItemId);
}

function citationFromMemory(memory: MemoryObject, sourceItems: SourceItem[]) {
  const source = sourceFor(sourceItems, memory.sourceItemId);
  return {
    sourceItemId: memory.sourceItemId ?? source?.id ?? "unknown",
    sourceTitle: source?.title ?? "Unknown source",
    evidence: memory.sourceQuote ?? memory.description,
    memoryObjectId: memory.id,
    confidence: memory.confidence,
  };
}

function citationFromLoop(loop: OpenLoop, sourceItems: SourceItem[]) {
  const source = sourceFor(sourceItems, loop.sourceItemId);
  return {
    sourceItemId: loop.sourceItemId ?? source?.id ?? "unknown",
    sourceTitle: source?.title ?? "Unknown source",
    evidence: loop.sourceQuote ?? loop.description,
    openLoopId: loop.id,
    confidence: loop.confidence,
  };
}

function citationFromSource(source: SourceItem, evidence?: string) {
  return {
    sourceItemId: source.id,
    sourceTitle: source.title,
    evidence: evidence?.trim() || source.content.slice(0, 400),
  };
}

function tokenize(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length > 3),
    ),
  ];
}

function sourceExcerpt(source: SourceItem, question: string, maxLength = 2400) {
  const content = source.content.replace(/\s+/g, " ").trim();
  if (content.length <= maxLength) return content;

  const terms = tokenize(`${question} ${source.title}`);
  const normalized = content.toLowerCase();
  const matchIndex = terms
    .map((term) => normalized.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (matchIndex === undefined) return content.slice(0, maxLength);

  const start = Math.max(0, matchIndex - Math.floor(maxLength / 2));
  const end = Math.min(content.length, start + maxLength);
  const excerpt = content.slice(start, end);
  return `${start > 0 ? "... " : ""}${excerpt}${end < content.length ? " ..." : ""}`;
}

function citationKey(citation: SourceCitation) {
  return `${citation.sourceItemId}:${citation.evidence.replace(/\s+/g, " ").trim().toLowerCase()}`;
}

function isOutcomeQuestion(question: string) {
  return /\b(closed|done|resolved|outcome|happened|completed|finished|after)\b/i.test(question);
}

export async function answerFromContext(input: {
  question: string;
  memoryObjects: MemoryObject[];
  openLoops: OpenLoop[];
  sourceItems: SourceItem[];
  brain?: Brain;
  ai?: AiClient;
}): Promise<BrainAnswer> {
  const hasEvidence =
    input.memoryObjects.length > 0 ||
    input.openLoops.length > 0 ||
    input.sourceItems.length > 0;

  if (!hasEvidence) {
    return {
      question: input.question,
      answer:
        "I do not have enough source-backed evidence to answer that yet.",
      citations: [],
      uncertain: true,
      followUp:
        "Add or ingest a source that covers this question, then ask again.",
    };
  }

  if (input.ai?.available && input.brain) {
    const result = await input.ai.completeStructured({
      system: askBrainSystemPrompt,
      prompt: buildAskBrainPrompt({
        brainName: input.brain.name,
        brainKind: input.brain.kind,
        brainThesis: input.brain.thesis,
        question: input.question,
        memoryObjects: input.memoryObjects.map((memory) => ({
          id: memory.id,
          objectType: memory.objectType,
          name: memory.name,
          description: memory.description,
          sourceQuote: memory.sourceQuote,
          confidence: memory.confidence ?? 0.7,
          sourceTitle: sourceFor(input.sourceItems, memory.sourceItemId)?.title ?? "Unknown source",
          createdAt: memory.createdAt,
        })),
        openLoops: input.openLoops.map((loop) => ({
          id: loop.id,
          title: loop.title,
          description: loop.description,
          status: loop.status,
          priority: loop.priority,
          sourceQuote: loop.sourceQuote,
          outcome: loop.outcome,
          confidence: loop.confidence ?? 0.7,
          sourceTitle: sourceFor(input.sourceItems, loop.sourceItemId)?.title ?? "Unknown source",
          createdAt: loop.createdAt,
        })),
        sourceItems: input.sourceItems.map((source) => ({
          id: source.id,
          title: source.title,
          type: source.type,
          content: sourceExcerpt(source, input.question),
          createdAt: source.createdAt,
        })),
      }),
      schema: askAnswerSchema,
      schemaName: "ask_brain_answer",
      schemaDescription:
        "A source-backed answer with citations to provided evidence.",
      maxTokens: 2500,
    });

    const memoryById = new Map(input.memoryObjects.map((memory) => [memory.id, memory]));
    const loopById = new Map(input.openLoops.map((loop) => [loop.id, loop]));
    const sourceById = new Map(input.sourceItems.map((source) => [source.id, source]));
    const citations = result.data.citations
      .map((citation) => {
        const citationId = citation.memoryId ?? "";
        const memory = memoryById.get(citationId);
        if (memory) return citationFromMemory(memory, input.sourceItems);
        const loop = loopById.get(citationId);
        if (loop) return citationFromLoop(loop, input.sourceItems);
        const source = citation.sourceItemId ? sourceById.get(citation.sourceItemId) : undefined;
        if (source) return citationFromSource(source, citation.evidence);
        return null;
      })
      .filter((citation): citation is NonNullable<typeof citation> => Boolean(citation))
      .filter((citation, index, all) => all.findIndex((item) => citationKey(item) === citationKey(citation)) === index);

    return {
      question: input.question,
      answer: result.data.answer,
      citations,
      uncertain: result.data.uncertain,
      followUp: result.data.followUp,
    };
  }

  const outcomeMemories = input.memoryObjects.filter(
    (memory) => memory.properties?.memory_source === "open_loop_outcome",
  );
  const preferOutcomeMemory = isOutcomeQuestion(input.question) && outcomeMemories.length > 0;
  const answerMemories = preferOutcomeMemory ? outcomeMemories : input.memoryObjects;
  const citations = preferOutcomeMemory
    ? answerMemories.slice(0, 4).map((memory) => citationFromMemory(memory, input.sourceItems))
    : [
        ...input.openLoops.slice(0, 4).map((loop) => citationFromLoop(loop, input.sourceItems)),
        ...answerMemories.slice(0, 4).map((memory) => citationFromMemory(memory, input.sourceItems)),
      ].slice(0, 4);

  return {
    question: input.question,
    answer:
      preferOutcomeMemory
        ? answerMemories.map((memory) => memory.description).join(" ")
      : input.openLoops.length > 0
        ? input.openLoops.map((loop) => loop.description).join(" ")
        : answerMemories.map((memory) => memory.description).join(" "),
    citations,
    uncertain: false,
    followUp:
      input.openLoops.length > 0
        ? "Review the cited open loops and close or assign the next action."
        : undefined,
  };
}

export const answerFromMemory = answerFromContext;
