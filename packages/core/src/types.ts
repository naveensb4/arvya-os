import type { ZodType } from "zod";

export type BrainKind = "company" | "sell_side" | "buy_side";

export type SourceType =
  | "transcript"
  | "email"
  | "note"
  | "document"
  | "github"
  | "strategy_output"
  | "web"
  | "manual";

export type MemoryObjectType =
  | "person"
  | "company"
  | "fact"
  | "event"
  | "decision"
  | "insight"
  | "risk"
  | "question"
  | "commitment"
  | "task"
  | "product_insight"
  | "marketing_idea"
  | "custom";

export type MemoryObjectStatus = "open" | "in_progress" | "waiting" | "done" | "closed" | "snoozed";

export type OpenLoopType =
  | "follow_up"
  | "intro"
  | "product"
  | "investor"
  | "sales"
  | "marketing"
  | "engineering"
  | "deal"
  | "diligence"
  | "crm"
  | "scheduling"
  | "other";

export type OpenLoopStatus =
  | "needs_review"
  | "open"
  | "in_progress"
  | "waiting"
  | "done"
  | "dismissed"
  | "closed";

export type OpenLoopPriority = "low" | "medium" | "high" | "critical";

export type WorkflowStatus = "started" | "running" | "waiting_for_human" | "completed" | "failed";

export type AgentRunStatus = "queued" | "running" | "succeeded" | "failed";

export type ModelProvider = "anthropic" | "openai" | "local";

export type Brain = {
  id: string;
  name: string;
  kind: BrainKind;
  thesis: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type SourceItem = {
  id: string;
  brainId: string;
  title: string;
  type: SourceType;
  content: string;
  externalUri?: string;
  storagePath?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type MemoryObject = {
  id: string;
  brainId: string;
  sourceItemId?: string;
  objectType: MemoryObjectType;
  name: string;
  description: string;
  properties?: Record<string, unknown>;
  sourceQuote?: string;
  confidence?: number;
  status?: MemoryObjectStatus;
  createdAt: string;
  updatedAt?: string;
};

export type SuggestedFollowUpEmail = {
  to?: string;
  subject?: string;
  body: string;
};

export type OpenLoop = {
  id: string;
  brainId: string;
  sourceItemId?: string;
  title: string;
  description: string;
  loopType: OpenLoopType;
  owner?: string;
  status: OpenLoopStatus;
  priority: OpenLoopPriority;
  dueDate?: string;
  suggestedAction?: string;
  suggestedFollowUpEmail?: SuggestedFollowUpEmail | null;
  requiresHumanApproval: boolean;
  approvedAt?: string;
  outcome?: string;
  sourceQuote?: string;
  confidence?: number;
  properties?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string;
};

export type Relationship = {
  id: string;
  brainId: string;
  fromObjectId: string;
  toObjectId: string;
  relationshipType: string;
  sourceItemId?: string;
  sourceQuote?: string;
  confidence?: number;
  properties?: Record<string, unknown>;
  createdAt: string;
};

export type Workflow = {
  id: string;
  brainId: string;
  sourceItemId?: string;
  workflowType: string;
  status: WorkflowStatus;
  state?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
};

export type SourceEmbedding = {
  id: string;
  sourceItemId: string;
  brainId: string;
  chunkIndex: number;
  content: string;
  embedding?: number[] | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type AgentRun = {
  id: string;
  brainId: string;
  sourceItemId?: string;
  workflowId?: string;
  name: string;
  status: AgentRunStatus;
  modelProvider: ModelProvider;
  stepName?: string;
  inputSummary: string;
  outputSummary: string;
  rawInput?: Record<string, unknown>;
  rawOutput?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  completedAt?: string;
};

export type SourceCitation = {
  sourceItemId: string;
  sourceTitle: string;
  evidence: string;
  memoryObjectId?: string;
  openLoopId?: string;
  confidence?: number;
};

export type BrainAnswer = {
  question: string;
  answer: string;
  citations: SourceCitation[];
  uncertain?: boolean;
  followUp?: string;
};

export type BrainSnapshot = {
  brains: Brain[];
  selectedBrain: Brain;
  sourceItems: SourceItem[];
  memoryObjects: MemoryObject[];
  relationships: Relationship[];
  openLoops: OpenLoop[];
  workflows: Workflow[];
  agentRuns: AgentRun[];
};

export type DailyBrief = {
  brainId: string;
  generatedAt: string;
  headline: string;
  summary: string;
  priorities: Array<{ title: string; detail: string; sourceItemIds?: string[] }>;
  decisions: MemoryObject[];
  insights: MemoryObject[];
  actions: OpenLoop[];
  openLoops: OpenLoop[];
  loopsToReview: OpenLoop[];
};

export type FollowUpDraft = {
  openLoopId: string;
  title: string;
  draft: string;
  channel: "email" | "slack" | "internal" | "manual";
  owner?: string;
  rationale: string;
};

export type AiCompleteInput = {
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
};

export type AiCompletion = {
  text: string;
  provider: ModelProvider;
  inputTokens?: number;
  outputTokens?: number;
};

export type AiStructuredInput<T> = {
  system: string;
  prompt: string;
  schema: ZodType<T>;
  schemaName: string;
  schemaDescription?: string;
  temperature?: number;
  maxTokens?: number;
};

export type AiStructuredCompletion<T> = {
  data: T;
  provider: ModelProvider;
  raw?: string;
};

export interface AiClient {
  available: boolean;
  preferredProvider: ModelProvider;
  embeddingModel: string | null;
  complete(input: AiCompleteInput): Promise<AiCompletion>;
  completeStructured<T>(input: AiStructuredInput<T>): Promise<AiStructuredCompletion<T>>;
  embed(texts: string[]): Promise<number[][] | null>;
}

export type Source = SourceItem;
export type MemoryKind = MemoryObjectType;
export type MemoryStatus = MemoryObjectStatus;
export type MemoryItem = MemoryObject;
