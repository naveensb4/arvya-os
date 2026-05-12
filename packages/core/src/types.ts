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
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type User = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type Workspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
};

export type WorkspaceMemberRole = "owner" | "admin" | "member" | "viewer";

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceMemberRole;
  joinedAt: string;
};

export type WorkspaceInvite = {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceMemberRole;
  token: string;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
};

export type MeetingType =
  | "investor_call"
  | "customer_call"
  | "advisor_call"
  | "internal_sync"
  | "partner_call"
  | "product_review"
  | "other";

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

export type MarketingSourcePlatform =
  | "google_drive"
  | "manual"
  | "slack"
  | "gmail"
  | "outlook"
  | "voice"
  | "blog";

export type MarketingSourceType =
  | "google_drive_transcript"
  | "manual_note"
  | "voice_note"
  | "slack_thread"
  | "gmail_email"
  | "outlook_email"
  | "blog"
  | "demo_form"
  | "investor_question"
  | "customer_objection"
  | "product_update";

export type MarketingConfidentiality =
  | "public"
  | "internal"
  | "customer_sensitive"
  | "investor_sensitive"
  | "confidential";

export type MarketingSensitivityLevel = "low" | "medium" | "high" | "blocked";

export type MarketingChannel =
  | "linkedin_company"
  | "x"
  | "linkedin_founder"
  | "linkedin_pb";

export type MarketingPostStatus =
  | "draft"
  | "needs_revision"
  | "approved"
  | "scheduled"
  | "published"
  | "archived"
  | "failed_schedule";

export type MarketingFormatType =
  | "teardown"
  | "founder_story"
  | "list"
  | "contrarian"
  | "product_pov"
  | "case_study"
  | "memo"
  | "other";

export type MarketingHookType =
  | "pain"
  | "insight"
  | "mistake"
  | "lesson"
  | "workflow"
  | "future_of_work"
  | "other";

export type MarketingTargetIcp = "ib" | "pe" | "hf" | "investor" | "founder" | "operator" | "other";

export type MarketingFunnelStage = "awareness" | "problem_aware" | "solution_aware" | "conversion";

export type MarketingEventType = "demo" | "dm" | "reply" | "qualified_lead" | "website_visit" | "manual_attribution";

export type MarketingContentItem = {
  id: string;
  brainId: string;
  sourceItemId?: string | null;
  sourcePlatform: MarketingSourcePlatform;
  sourceType: MarketingSourceType;
  sourceUrl?: string | null;
  sourceExternalId?: string | null;
  sourceOwner?: string | null;
  sourceDate?: string | null;
  sourceConfidentiality: MarketingConfidentiality;
  rawText: string;
  cleanedSummary?: string | null;
  contentSafeSummary?: string | null;
  requiresRedaction: boolean;
  approvedForContent: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type MarketingContentInsight = {
  id: string;
  brainId: string;
  contentItemId: string;
  rawInsight: string;
  contentSafeInsight: string;
  sensitivityLevel: MarketingSensitivityLevel;
  suggestedPillar?: string | null;
  suggestedChannels: MarketingChannel[];
  approvedForContent: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type MarketingChannelPost = {
  id: string;
  brainId: string;
  contentItemId?: string | null;
  contentInsightId?: string | null;
  channel: MarketingChannel;
  status: MarketingPostStatus;
  bodyText: string;
  mediaType?: string | null;
  mediaReference?: string | null;
  plannedPostDate?: string | null;
  postingWindow?: string | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  liveUrl?: string | null;
  schedulerProvider?: string | null;
  schedulerPostId?: string | null;
  campaignTag?: string | null;
  pillar?: string | null;
  formatType?: MarketingFormatType | null;
  hookType?: MarketingHookType | null;
  targetIcp?: MarketingTargetIcp | null;
  funnelStage?: MarketingFunnelStage | null;
  experimentTag?: string | null;
  requiresReview: boolean;
  sensitivityLevel: MarketingSensitivityLevel;
  approvedBy?: string | null;
  approvedAt?: string | null;
  revisionReason?: string | null;
  safetyCheckStatus?: "not_run" | "passed" | "failed";
  safetyCheckReason?: string | null;
  isExemplar: boolean;
  performanceTag?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type MarketingPostMetric = {
  id: string;
  brainId: string;
  channelPostId: string;
  metricDate: string;
  impressions: number;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
  saves: number;
  follows: number;
  rawMetrics: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type MarketingExperiment = {
  id: string;
  brainId: string;
  tag: string;
  title: string;
  hypothesis: string;
  status: "planned" | "running" | "completed" | "paused";
  startedAt?: string | null;
  endedAt?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type MarketingEvent = {
  id: string;
  brainId: string;
  channelPostId?: string | null;
  eventType: MarketingEventType;
  eventSource: string;
  eventAt: string;
  description: string;
  contactName?: string | null;
  companyName?: string | null;
  value?: number | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  attributionConfidence: "direct" | "assisted" | "manual" | "unknown";
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type MarketingWeeklyReport = {
  id: string;
  brainId: string;
  weekStart: string;
  weekEnd: string;
  publishedCount: number;
  qualitativeOnly: boolean;
  summary: string;
  markdown: string;
  recommendedExperiments: Array<{ title: string; rationale: string; tag?: string }>;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type MarketingLlmUsage = {
  id: string;
  brainId: string;
  jobType: string;
  modelProvider: ModelProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type MarketingRedactionResult = {
  cleanedSummary: string;
  contentSafeSummary: string;
  sourceConfidentiality: MarketingConfidentiality;
  requiresRedaction: boolean;
  approvedForContent: boolean;
  insights: Array<{
    rawInsight: string;
    contentSafeInsight: string;
    sensitivityLevel: MarketingSensitivityLevel;
    suggestedPillar?: string;
    suggestedChannels: MarketingChannel[];
  }>;
  redactionNotes: string[];
};

export type MarketingDraftResult = {
  drafts: Array<{
    contentInsightId: string;
    channel: MarketingChannel;
    bodyText: string;
    pillar?: string;
    formatType?: MarketingFormatType;
    hookType?: MarketingHookType;
    targetIcp?: MarketingTargetIcp;
    funnelStage?: MarketingFunnelStage;
    campaignTag?: string;
    rationale: string;
  }>;
};

export type MarketingSafetyCheckResult = {
  passed: boolean;
  reason: string;
  flags: string[];
};

export type MarketingWeeklyAnalysisResult = {
  summary: string;
  markdown: string;
  recommendedExperiments: Array<{ title: string; rationale: string; tag?: string }>;
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

export type BrainDocType = "meeting_prep" | "transcript" | "summary" | "action_items";
export type BrainDocFeedback = "useful" | "not_useful";

export type BrainDoc = {
  id: string;
  brainId: string;
  docType: BrainDocType;
  title: string;
  content: Record<string, unknown>;
  contentText?: string;
  feedback?: BrainDocFeedback | null;
  feedbackAt?: string;
  agentRunId?: string;
  externalEventId?: string;
  meetingId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type Source = SourceItem;
export type MemoryKind = MemoryObjectType;
export type MemoryStatus = MemoryObjectStatus;
export type MemoryItem = MemoryObject;
