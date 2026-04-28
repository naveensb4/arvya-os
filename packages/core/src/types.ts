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
  | "outcome"
  | "investor_feedback"
  | "customer_feedback"
  | "advisor_feedback"
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
  | "task"
  | "investor_ask"
  | "customer_ask"
  | "strategic_question"
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

export type PrioritySetBy = "naveen" | "pb" | "system";
export type PriorityHorizon = "today" | "week" | "sprint" | "quarter";
export type PriorityStatus = "active" | "achieved" | "abandoned";

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

export type Priority = {
  id: string;
  brainId: string;
  statement: string;
  setAt: string;
  setBy: PrioritySetBy;
  horizon: PriorityHorizon;
  status: PriorityStatus;
  sourceRefs?: string[];
  createdAt: string;
  updatedAt?: string;
};

export type SourceCitation = {
  sourceItemId: string;
  sourceTitle: string;
  evidence: string;
  memoryObjectId?: string;
  openLoopId?: string;
  confidence?: number;
};

export type StructuredCitation = {
  kind: "source" | "memory" | "open_loop";
  id: string;
  snippet: string;
  sourceItemId?: string;
  sourceTitle?: string;
};

export type AnswerConfidence = "high" | "medium" | "low";

export type BrainAnswer = {
  question: string;
  answer: string;
  citations: SourceCitation[];
  structuredCitations?: StructuredCitation[];
  confidenceLevel?: AnswerConfidence;
  uncertaintyNotes?: string[];
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
  structured?: StructuredDailyBrief;
};

export type StructuredDailyBriefPriority = {
  priority_id?: string;
  statement: string;
  why_today: string;
};

export type StructuredDailyBriefOverdueFollowUp = {
  open_loop_id: string;
  title: string;
  owner: string;
  days_overdue: number;
};

export type StructuredDailyBriefDueSoon = {
  open_loop_id: string;
  title: string;
  due_in_days: number;
};

export type StructuredDailyBriefRelationship = {
  entity: string;
  kind: "customer" | "investor" | "advisor" | "prospect";
  signal: string;
  source_refs: string[];
};

export type StructuredDailyBriefInsight = {
  insight: string;
  source_refs: string[];
  suggested_action?: string;
};

export type StructuredDailyBriefMarketingIdea = {
  idea: string;
  source_refs: string[];
};

export type StructuredDailyBriefRisk = {
  description: string;
  source_refs: string[];
  severity: "high" | "medium" | "low";
};

export type StructuredDailyBriefAction = {
  action: string;
  source_refs?: string[];
};

export type StructuredDailyBriefQuestion = {
  question: string;
  why_now: string;
};

export type StructuredDailyBrief = {
  date: string;
  top_priorities_today: StructuredDailyBriefPriority[];
  overdue_follow_ups: StructuredDailyBriefOverdueFollowUp[];
  due_soon: StructuredDailyBriefDueSoon[];
  high_intent_relationships: StructuredDailyBriefRelationship[];
  product_insights_to_act_on: StructuredDailyBriefInsight[];
  marketing_opportunities: StructuredDailyBriefMarketingIdea[];
  risks_and_dropped_balls: StructuredDailyBriefRisk[];
  suggested_actions_naveen: StructuredDailyBriefAction[];
  suggested_actions_pb: StructuredDailyBriefAction[];
  questions_to_resolve: StructuredDailyBriefQuestion[];
  generated_at: string;
};

export type DriftSignalType =
  | "commitment_dropped"
  | "insight_unaddressed"
  | "objection_recurring"
  | "priority_drifting"
  | "owner_missing"
  | "narrative_stale";

export type DriftSignal = {
  type: DriftSignalType;
  severity: "high" | "medium" | "low";
  summary: string;
  detail: string;
  source_refs: string[];
  memory_refs: string[];
  priority_refs?: string[];
  recommended_action: string;
  recommended_owner?: "naveen" | "pb" | "system";
};

export type DriftReview = {
  generated_at: string;
  overall_alignment: "aligned" | "minor_drift" | "major_drift";
  signals: DriftSignal[];
  summary_for_founders: string;
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
