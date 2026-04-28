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

const personPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}|[A-Z]{2,3})\b/g;
const companySuffixPattern =
  "(?:Capital|Partners|Ventures|Bank|Advisors|AI|Labs|Group|Corp|Inc|LLC|Technologies|Systems|Software|Health|Foods|Co|Company|Studios)";
const companyPattern = new RegExp(
  `\\b([A-Z][A-Za-z0-9&.-]*(?:\\s+[A-Z][A-Za-z0-9&.-]*)*\\s+${companySuffixPattern})\\b`,
  "g",
);
const personCompanyPattern = new RegExp(
  `\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,2}|[A-Z]{2,3})\\s+(?:at|from|of)\\s+([A-Z][A-Za-z0-9&.-]*(?:\\s+[A-Z][A-Za-z0-9&.-]*)*\\s+${companySuffixPattern})\\b`,
  "g",
);

const stopNames = new Set([
  "Arvya Deal",
  "Company Brain",
  "Deal Brain",
  "Deal OS",
  "Recall AI",
  "Google Drive",
  "Claude ChatGPT",
  "Open Loop",
  "SOC",
]);

const explicitActionPattern =
  /(follow up|circle back|send (?:the |an |a )?|share (?:the |an |a )?|schedule (?:another |a )?call|introduce|ask [A-Z][A-Za-z]* to follow up|next week|updated deck|demo link|send the notes|can you|please)/i;
const requestPattern =
  /\b(?:asked for|asks for|requested|requests|wants|wanted|needs|needed|waiting for|expects|looking for)\b/i;
const ownershipPattern =
  /\b(?:[A-Z][A-Za-z]*|we|they|client|buyer|seller|management|banker|sponsor)\s+(?:own|owns|owned|to own|will own|is owning)\b/i;
const dueDatePattern =
  /\b(?:by|before|due|deadline|next)\s+(?:monday|tuesday|wednesday|thursday|friday|week|month|quarter|eod|tomorrow|today|\d{1,2}\/\d{1,2})\b/i;
const dealArtifactPattern =
  /\b(?:diligence|tracker|cim|nda|ioi|loi|qofe|data room|management meeting|buyer follow-up|buyer follow up|process letter|ic memo|investment committee|model update)\b/i;
const commitmentPattern =
  /\b(?:committed to|promised to|agreed to|will|we will|i will|i'll|we'll|is going to|are going to)\b/i;
const decisionPattern =
  /\b(?:decided|decision|approved|greenlit|chose|aligned on|agreed that|go with|prioritize|deprioritize)\b/i;
const riskPattern =
  /\b(?:risk|blocker|concern|danger|worried|worry|objection|red flag|threat|could block|will block|churn|security review)\b/i;
const productInsightPattern =
  /\b(?:customer|user|workflow|pain|product|feature|mvp|ux|onboarding|pilot|demo|spreadsheet|CRM|asked for|wants|needs)\b/i;
const feedbackPattern =
  /\b(?:investor|banker|advisor|customer|prospect|user|buyer|founder).*(?:said|feedback|asked|wants|wanted|pushed back|loved|hated|warned|flagged|suggested|recommended|concern)/i;
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
  if (/diligence|qofe|data room|ic memo|investment committee/.test(normalized)) return "diligence";
  if (/cim|buyer|loi|ioi|nda|process letter|management meeting|deal/.test(normalized)) return "deal";
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

function titleFromSentence(prefix: string, sentence: string) {
  const cleaned = truncate(sentence.replace(/^(?:[-*]\s*)?(?:action item|next step|open loop)\s*[:\-]\s*/i, ""), 96);
  return cleaned.length <= 12 ? `${prefix}: ${cleaned}` : `${prefix}: ${cleaned}`;
}

function extractOwner(sentence: string): string | undefined {
  const explicit = sentence.match(/\b(?:owner|owned by|assigned to):?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2}|[A-Z]{2,3})\b/i);
  if (explicit?.[1]) return explicit[1];

  const actor = sentence.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}|[A-Z]{2,3})\s+(?:committed to|promised to|agreed to|will|is going to)\b/);
  if (actor?.[1] && !stopNames.has(actor[1])) return actor[1];

  return undefined;
}

function extractDueDate(sentence: string): string | undefined {
  const match = sentence.match(/\b(?:by|before|due|deadline|next)\s+((?:monday|tuesday|wednesday|thursday|friday|week|month|quarter|eod|tomorrow|today|\d{1,2}\/\d{1,2})(?:\s+\d{1,2})?)\b/i);
  return match?.[1];
}

function isFallbackOpenLoop(sentence: string) {
  if (explicitActionPattern.test(sentence)) return true;
  if (requestPattern.test(sentence)) return true;
  if (ownershipPattern.test(sentence) && dealArtifactPattern.test(sentence)) return true;
  if (dueDatePattern.test(sentence) && dealArtifactPattern.test(sentence)) return true;
  if (/action item|next step|todo|to-do|commitment/i.test(sentence)) return true;
  return false;
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

    if (decisionPattern.test(sentence)) {
      memories.push({
        objectType: "decision",
        name: titleFromSentence("Decision", sentence),
        description: truncate(sentence, 800),
        sourceQuote: truncate(sentence, 800),
        confidence: 0.82,
        properties: { extractedBy: "deterministic_fallback", signal: "decision" },
      });
      continue;
    }

    if (commitmentPattern.test(sentence) && (isFallbackOpenLoop(sentence) || /committed|promised|agreed/i.test(sentence))) {
      memories.push({
        objectType: "commitment",
        name: titleFromSentence("Commitment", sentence),
        description: truncate(sentence, 800),
        sourceQuote: truncate(sentence, 800),
        confidence: 0.8,
        properties: {
          extractedBy: "deterministic_fallback",
          signal: "commitment",
          owner: extractOwner(sentence),
          dueDate: extractDueDate(sentence),
        },
      });
      continue;
    }

    if (riskPattern.test(sentence)) {
      memories.push({
        objectType: "risk",
        name: titleFromSentence("Risk", sentence),
        description: truncate(sentence, 800),
        sourceQuote: truncate(sentence, 800),
        confidence: 0.76,
        properties: { extractedBy: "deterministic_fallback", signal: "risk" },
      });
      continue;
    }

    if (productInsightPattern.test(sentence)) {
      memories.push({
        objectType: "product_insight",
        name: titleFromSentence("Product insight", sentence),
        description: truncate(sentence, 800),
        sourceQuote: truncate(sentence, 800),
        confidence: 0.74,
        properties: { extractedBy: "deterministic_fallback", signal: "product_insight" },
      });
      continue;
    }

    if (feedbackPattern.test(sentence) || /(investor|banker|advisor|founder|market|strategy|positioning)/.test(normalized)) {
      memories.push({
        objectType: "insight",
        name: feedbackPattern.test(sentence)
          ? titleFromSentence("Feedback", sentence)
          : titleFromSentence("Strategic insight", sentence),
        description: truncate(sentence, 800),
        sourceQuote: truncate(sentence, 800),
        confidence: feedbackPattern.test(sentence) ? 0.78 : 0.68,
        properties: {
          extractedBy: "deterministic_fallback",
          signal: feedbackPattern.test(sentence) ? "stakeholder_feedback" : "strategic_insight",
        },
      });
      continue;
    }

    if (isFallbackOpenLoop(sentence)) continue;

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

function fallbackRelationships(source: SourceItem): ExtractedRelationship[] {
  const relationships: ExtractedRelationship[] = [];
  const seen = new Set<string>();

  for (const match of source.content.matchAll(personCompanyPattern)) {
    const fromName = match[1]?.trim();
    const toName = match[2]?.trim();
    if (!fromName || !toName || stopNames.has(fromName) || stopNames.has(toName)) continue;

    const key = `${fromName}->${toName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({
      fromName,
      toName,
      relationshipType: "associated_with",
      sourceQuote: truncate(match[0], 800),
      confidence: 0.76,
      properties: { extractedBy: "deterministic_fallback" },
    });
  }

  return relationships.slice(0, 16);
}

function fallbackOpenLoops(source: SourceItem): ExtractedOpenLoop[] {
  return splitSentences(source.content)
    .filter(isFallbackOpenLoop)
    .map((sentence) => ({
      title: sentence.length > 80 ? `${sentence.slice(0, 77)}...` : sentence,
      description: truncate(sentence, 1000),
      loopType: classifyLoop(sentence),
      owner: extractOwner(sentence),
      status: "needs_review",
      priority: /critical|urgent|asap|friday|tomorrow|this week/i.test(sentence)
        ? "high"
        : "medium",
      dueDate: extractDueDate(sentence),
      suggestedAction: truncate(sentence, 1000),
      requiresHumanApproval: /send|share|email|introduce|follow up|asked for|requested|waiting for|expects/i.test(sentence),
      sourceQuote: truncate(sentence, 800),
      confidence: commitmentPattern.test(sentence) ? 0.84 : 0.78,
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
  const relationships = await runLogged(state, "extract_relationships", async () =>
    fallbackRelationships(state.source),
  );
  return { memoryObjects, relationships };
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
