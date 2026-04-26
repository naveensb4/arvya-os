import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  ingestionResultSchema,
  sourceClassificationSchema,
  type AiClient,
  type Brain,
  type ExtractedMemoryObject,
  type ExtractedOpenLoop,
  type ExtractedRelationship,
  type ExtractedSuggestedAction,
  type IngestionResult,
  type ModelProvider,
  type OpenLoopStatus,
  type SourceClassification,
  type SourceItem,
} from "@arvya/core";
import {
  buildSourceIngestionPrompt,
  sourceIngestionSystemPrompt,
} from "@arvya/prompts/source-ingestion";

type StepLogger = <T>(input: {
  stepName: string;
  modelProvider: ModelProvider;
  inputSummary: string;
  rawInput?: Record<string, unknown>;
  call: () => Promise<T>;
}) => Promise<T>;

const personPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;
const companyPattern =
  /\b([A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*)*\s+(?:Capital|Partners|Ventures|Bank|Advisors|AI|Labs|Group|Corp|Inc|LLC))\b/g;

const stopNames = new Set([
  "Arvya Deal",
  "Company Brain",
  "Deal Brain",
  "Deal OS",
  "Recall AI",
  "Google Drive",
  "Claude ChatGPT",
]);

const followUpPattern =
  /(follow up|circle back|send (?:the |an |a )?|share (?:the |an |a )?|schedule (?:another |a )?call|introduce us|ask [A-Z][A-Za-z]* to follow up|next week|updated deck|demo link|send the notes)/i;
const HIGH_CONFIDENCE_OPEN_LOOP_THRESHOLD = 0.9;

function splitSentences(content: string) {
  return content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 12);
}

function uniqueMatches(content: string, pattern: RegExp) {
  const values = new Set<string>();
  for (const match of content.matchAll(pattern)) {
    const value = match[1]?.trim();
    if (value && !stopNames.has(value)) values.add(value);
  }
  return [...values].slice(0, 8);
}

function classifyLoop(sentence: string): ExtractedOpenLoop["loopType"] {
  const normalized = sentence.toLowerCase();
  if (/intro|introduce/.test(normalized)) return "intro";
  if (/pilot|customer|demo|sales|prospect/.test(normalized)) return "sales";
  if (/investor|deck|banker|capital|fund/.test(normalized)) return "investor";
  if (/schedule|call|meeting/.test(normalized)) return "scheduling";
  if (/product|feature|workflow|build/.test(normalized)) return "product";
  if (/engineering|bug|technical/.test(normalized)) return "engineering";
  if (/marketing|linkedin|blog|content/.test(normalized)) return "marketing";
  return "follow_up";
}

function fallbackClassification(source: SourceItem): SourceClassification {
  return {
    summary: `${source.title} is a ${source.type} source with manually parsed operating context.`,
    sourceCategory: source.type,
    confidence: 0.7,
  };
}

function truncate(value: string, maxLength: number) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 3)}...` : trimmed;
}

function fallbackMemory(source: SourceItem): ExtractedMemoryObject[] {
  const sentences = splitSentences(source.content);
  const memories: ExtractedMemoryObject[] = [];

  for (const person of uniqueMatches(source.content, personPattern)) {
    memories.push({
      objectType: "person",
      name: person,
      description: `${person} appears in ${source.title}.`,
      sourceQuote: person,
      confidence: 0.61,
    });
  }

  for (const company of uniqueMatches(source.content, companyPattern)) {
    memories.push({
      objectType: "company",
      name: company,
      description: `${company} is referenced in ${source.title}.`,
      sourceQuote: company,
      confidence: 0.65,
    });
  }

  for (const sentence of sentences) {
    const normalized = sentence.toLowerCase();
    if (followUpPattern.test(sentence)) continue;

    if (/(decided|decision|approved|committed|we will)/.test(normalized)) {
      memories.push({
        objectType: "decision",
        name: "Decision captured",
        description: truncate(sentence, 800),
        sourceQuote: truncate(sentence, 800),
        confidence: 0.78,
      });
      continue;
    }

    if (/(risk|blocker|concern|danger)/.test(normalized)) {
      memories.push({
        objectType: "risk",
        name: "Risk captured",
        description: truncate(sentence, 800),
        sourceQuote: truncate(sentence, 800),
        confidence: 0.7,
      });
      continue;
    }

    if (/(customer|user|workflow|pain|product|feature|mvp|ux)/.test(normalized)) {
      memories.push({
        objectType: "product_insight",
        name: "Product insight",
        description: truncate(sentence, 800),
        sourceQuote: truncate(sentence, 800),
        confidence: 0.7,
      });
      continue;
    }

    if (/(investor|banker|advisor|founder|market|strategy|positioning)/.test(normalized)) {
      memories.push({
        objectType: "insight",
        name: "Strategic insight",
        description: truncate(sentence, 800),
        sourceQuote: truncate(sentence, 800),
        confidence: 0.68,
      });
      continue;
    }

    if (memories.filter((memory) => memory.objectType === "fact").length < 6) {
      memories.push({
        objectType: "fact",
        name: "Fact",
        description: truncate(sentence, 800),
        sourceQuote: truncate(sentence, 800),
        confidence: 0.6,
      });
    }
  }

  return memories.slice(0, 32);
}

function fallbackOpenLoops(source: SourceItem): ExtractedOpenLoop[] {
  return splitSentences(source.content)
    .filter((sentence) => followUpPattern.test(sentence))
    .map((sentence) => ({
      title: sentence.length > 80 ? `${sentence.slice(0, 77)}...` : sentence,
      description: truncate(sentence, 1000),
      loopType: classifyLoop(sentence),
      status: "needs_review",
      priority: /critical|urgent|asap|friday|tomorrow|this week/i.test(sentence)
        ? "high"
        : "medium",
      suggestedAction: truncate(sentence, 1000),
      requiresHumanApproval: /send|share|email|introduce|follow up/i.test(sentence),
      sourceQuote: truncate(sentence, 800),
      confidence: 0.78,
      properties: { extractedBy: "deterministic_fallback" },
    }));
}

function summarize(source: SourceItem, result: Partial<IngestionResult>) {
  const memoryCount = result.memoryObjects?.length ?? 0;
  const loopCount = result.openLoops?.length ?? 0;
  const relationshipCount = result.relationships?.length ?? 0;
  return `Ingested ${source.title}: ${memoryCount} memory object${memoryCount === 1 ? "" : "s"}, ${loopCount} open loop${loopCount === 1 ? "" : "s"}, ${relationshipCount} relationship${relationshipCount === 1 ? "" : "s"}.`;
}

const IngestionState = Annotation.Root({
  brain: Annotation<Brain>(),
  source: Annotation<SourceItem>(),
  ai: Annotation<AiClient | undefined>(),
  logStep: Annotation<StepLogger | undefined>(),
  provider: Annotation<ModelProvider>({
    reducer: (_current, update) => update,
    default: () => "local",
  }),
  classification: Annotation<SourceClassification | undefined>({
    reducer: (_current, update) => update,
  }),
  memoryObjects: Annotation<ExtractedMemoryObject[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  openLoops: Annotation<ExtractedOpenLoop[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  relationships: Annotation<ExtractedRelationship[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  suggestedActions: Annotation<ExtractedSuggestedAction[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  summary: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
});

async function runLogged<T>(
  state: typeof IngestionState.State,
  stepName: string,
  call: () => Promise<T>,
): Promise<T> {
  if (!state.logStep) return call();
  return state.logStep({
    stepName,
    modelProvider: state.ai?.preferredProvider ?? "local",
    inputSummary: `${state.source.type}: ${state.source.title}`,
    rawInput: { sourceItemId: state.source.id, brainId: state.brain.id },
    call,
  });
}

async function classifySourceNode(state: typeof IngestionState.State) {
  if (state.ai?.available) {
    const result = await runLogged(state, "classify_source", () =>
      state.ai!.completeStructured({
        system: sourceIngestionSystemPrompt,
        prompt: buildSourceIngestionPrompt({
          brainName: state.brain.name,
          brainKind: state.brain.kind,
          brainThesis: state.brain.thesis,
          source: state.source,
          task: "classify_source",
        }),
        schema: sourceClassificationSchema,
        schemaName: "source_classification",
        schemaDescription: "Source classification and confidence.",
        maxTokens: 1000,
      }),
    );
    return { classification: result.data, provider: result.provider };
  }
  const classification = await runLogged(state, "classify_source", async () =>
    fallbackClassification(state.source),
  );
  return { classification, provider: "local" };
}

async function extractMemoryNode(state: typeof IngestionState.State) {
  if (state.ai?.available) {
    const result = await runLogged(state, "extract_memory", () =>
      state.ai!.completeStructured({
        system: sourceIngestionSystemPrompt,
        prompt: buildSourceIngestionPrompt({
          brainName: state.brain.name,
          brainKind: state.brain.kind,
          brainThesis: state.brain.thesis,
          source: state.source,
          task: "extract_memory",
        }),
        schema: ingestionResultSchema.pick({ summary: true, memoryObjects: true, relationships: true }),
        schemaName: "memory_extraction",
        schemaDescription: "Source-backed memory objects and relationships.",
        maxTokens: 3500,
      }),
    );
    return {
      memoryObjects: result.data.memoryObjects,
      relationships: result.data.relationships,
      summary: result.data.summary,
      provider: result.provider,
    };
  }
  const memoryObjects = await runLogged(state, "extract_memory", async () =>
    fallbackMemory(state.source),
  );
  return { memoryObjects };
}

async function detectOpenLoopsNode(state: typeof IngestionState.State) {
  if (state.ai?.available) {
    const result = await runLogged(state, "detect_open_loops", () =>
      state.ai!.completeStructured({
        system: sourceIngestionSystemPrompt,
        prompt: buildSourceIngestionPrompt({
          brainName: state.brain.name,
          brainKind: state.brain.kind,
          brainThesis: state.brain.thesis,
          source: state.source,
          task: "detect_open_loops",
        }),
        schema: ingestionResultSchema.pick({ openLoops: true }),
        schemaName: "open_loop_detection",
        schemaDescription: "Unresolved follow-ups, commitments, questions, and tasks.",
        maxTokens: 2500,
      }),
    );
    return { openLoops: result.data.openLoops, provider: result.provider };
  }
  const openLoops = await runLogged(state, "detect_open_loops", async () =>
    fallbackOpenLoops(state.source),
  );
  return { openLoops };
}

async function generateSuggestedActionsNode(state: typeof IngestionState.State) {
  if (state.ai?.available && state.openLoops.length > 0) {
    const result = await runLogged(state, "generate_suggested_actions", () =>
      state.ai!.completeStructured({
        system: sourceIngestionSystemPrompt,
        prompt: buildSourceIngestionPrompt({
          brainName: state.brain.name,
          brainKind: state.brain.kind,
          brainThesis: state.brain.thesis,
          source: state.source,
          task: "generate_suggested_actions",
          openLoops: state.openLoops,
        }),
        schema: ingestionResultSchema.pick({ suggestedActions: true }),
        schemaName: "suggested_actions",
        schemaDescription: "Suggested actions and draft follow-up emails for open loops.",
        maxTokens: 2500,
      }),
    );
    return { suggestedActions: result.data.suggestedActions, provider: result.provider };
  }

  const suggestedActions = await runLogged(state, "generate_suggested_actions", async () =>
    state.openLoops.map((loop) => ({
      openLoopTitle: loop.title,
      suggestedAction: loop.suggestedAction ?? loop.description,
      suggestedFollowUpEmail: loop.requiresHumanApproval
        ? {
            subject: loop.title,
            body: `Following up on this item:\n\n${loop.description}`,
          }
        : null,
      requiresHumanApproval: loop.requiresHumanApproval,
    })),
  );
  return { suggestedActions };
}

async function saveResultsNode(state: typeof IngestionState.State) {
  const loops = state.openLoops.map((loop) => {
    const action = state.suggestedActions.find(
      (suggested) => suggested.openLoopTitle === loop.title,
    );
    const isHighConfidence = (loop.confidence ?? 0) >= HIGH_CONFIDENCE_OPEN_LOOP_THRESHOLD;
    const status: OpenLoopStatus = isHighConfidence && loop.status !== "dismissed" ? "open" : "needs_review";
    return {
      ...loop,
      status,
      suggestedAction: action?.suggestedAction ?? loop.suggestedAction,
      suggestedFollowUpEmail:
        action?.suggestedFollowUpEmail ?? loop.suggestedFollowUpEmail ?? null,
      requiresHumanApproval:
        action?.requiresHumanApproval ?? loop.requiresHumanApproval ?? false,
    };
  });

  const partial = {
    memoryObjects: state.memoryObjects,
    openLoops: loops,
    relationships: state.relationships,
  };
  return {
    openLoops: loops,
    summary: state.summary || summarize(state.source, partial),
  };
}

const ingestionGraph = new StateGraph(IngestionState)
  .addNode("classify_source", classifySourceNode)
  .addNode("extract_memory", extractMemoryNode)
  .addNode("detect_open_loops", detectOpenLoopsNode)
  .addNode("generate_suggested_actions", generateSuggestedActionsNode)
  .addNode("save_results", saveResultsNode)
  .addEdge(START, "classify_source")
  .addEdge("classify_source", "extract_memory")
  .addEdge("extract_memory", "detect_open_loops")
  .addEdge("detect_open_loops", "generate_suggested_actions")
  .addEdge("generate_suggested_actions", "save_results")
  .addEdge("save_results", END)
  .compile();

export async function runSourceIngestionWorkflow(input: {
  brain: Brain;
  source: SourceItem;
  ai?: AiClient;
  logStep?: StepLogger;
}) {
  const result = await ingestionGraph.invoke(input);
  return ingestionResultSchema.parse({
    summary: result.summary,
    classification: result.classification,
    memoryObjects: result.memoryObjects,
    openLoops: result.openLoops,
    relationships: result.relationships,
    suggestedActions: result.suggestedActions,
  });
}
