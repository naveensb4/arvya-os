import type {
  AgentRun,
  AgentRunStatus,
  Brain,
  BrainKind,
  MemoryObject,
  MemoryObjectStatus,
  MemoryObjectType,
  MarketingChannel,
  MarketingChannelPost,
  MarketingConfidentiality,
  MarketingContentInsight,
  MarketingContentItem,
  MarketingEvent,
  MarketingEventType,
  MarketingExperiment,
  MarketingFormatType,
  MarketingFunnelStage,
  MarketingHookType,
  MarketingLlmUsage,
  MarketingPostMetric,
  MarketingPostStatus,
  MarketingSensitivityLevel,
  MarketingSourcePlatform,
  MarketingSourceType,
  MarketingTargetIcp,
  MarketingWeeklyReport,
  ModelProvider,
  OpenLoop,
  OpenLoopPriority,
  OpenLoopStatus,
  OpenLoopType,
  Priority,
  PriorityHorizon,
  PrioritySetBy,
  PriorityStatus,
  Relationship,
  SourceEmbedding,
  SourceItem,
  SourceType,
  Workflow,
  WorkflowStatus,
} from "@arvya/core";
import { InMemoryRepository } from "./in-memory-repository";
import { SupabaseRepository } from "./supabase-repository";
import { tryGetDb } from "./client";

export type CreateBrainData = {
  name: string;
  kind: BrainKind;
  thesis: string;
  metadata?: Record<string, unknown>;
};

export type CreateSourceData = {
  brainId: string;
  title: string;
  type: SourceType;
  content: string;
  externalUri?: string;
  storagePath?: string;
  metadata?: Record<string, unknown>;
};

export type CreateMemoryObjectData = {
  brainId: string;
  sourceItemId?: string;
  objectType: MemoryObjectType;
  name: string;
  description: string;
  properties?: Record<string, unknown>;
  sourceQuote?: string;
  confidence?: number;
  status?: MemoryObjectStatus;
};

export type UpdateMemoryObjectData = Partial<{
  sourceItemId: string | null;
  objectType: MemoryObjectType;
  name: string;
  description: string;
  properties: Record<string, unknown>;
  sourceQuote: string | null;
  confidence: number | null;
  status: MemoryObjectStatus | null;
}>;

export type CreateRelationshipData = {
  brainId: string;
  fromObjectId: string;
  toObjectId: string;
  relationshipType: string;
  sourceItemId?: string;
  sourceQuote?: string;
  confidence?: number;
  properties?: Record<string, unknown>;
};

export type UpdateRelationshipData = Partial<{
  sourceItemId: string | null;
  sourceQuote: string | null;
  confidence: number | null;
  properties: Record<string, unknown>;
}>;

export type CreateOpenLoopData = {
  brainId: string;
  sourceItemId?: string;
  title: string;
  description: string;
  loopType: OpenLoopType;
  owner?: string;
  status?: OpenLoopStatus;
  priority?: OpenLoopPriority;
  dueDate?: string;
  suggestedAction?: string;
  suggestedFollowUpEmail?: OpenLoop["suggestedFollowUpEmail"];
  requiresHumanApproval?: boolean;
  approvedAt?: string;
  outcome?: string;
  sourceQuote?: string;
  confidence?: number;
  properties?: Record<string, unknown>;
};

export type UpdateOpenLoopData = Partial<{
  title: string;
  description: string;
  loopType: OpenLoopType;
  owner: string | null;
  status: OpenLoopStatus;
  priority: OpenLoopPriority;
  dueDate: string | null;
  suggestedAction: string | null;
  suggestedFollowUpEmail: OpenLoop["suggestedFollowUpEmail"];
  requiresHumanApproval: boolean;
  approvedAt: string | null;
  outcome: string | null;
  sourceQuote: string | null;
  confidence: number | null;
  properties: Record<string, unknown>;
  closedAt: string | null;
}>;

export type CreateWorkflowData = {
  brainId: string;
  sourceItemId?: string;
  workflowType: string;
  status?: WorkflowStatus;
  state?: Record<string, unknown>;
  error?: string;
};

export type UpdateWorkflowData = Partial<{
  status: WorkflowStatus;
  state: Record<string, unknown>;
  error: string | null;
  completedAt: string | null;
}>;

export type CreateSourceEmbeddingData = {
  brainId: string;
  sourceItemId: string;
  chunkIndex: number;
  content: string;
  embedding?: number[] | null;
  metadata?: Record<string, unknown>;
};

export type ListOptions = {
  limit?: number;
};

export type CreatePriorityData = {
  brainId: string;
  statement: string;
  setBy?: PrioritySetBy;
  horizon?: PriorityHorizon;
  status?: PriorityStatus;
  setAt?: string;
  sourceRefs?: string[];
};

export type UpdatePriorityStatusData = {
  status: PriorityStatus;
};

export type ListPrioritiesOptions = {
  status?: PriorityStatus | PriorityStatus[];
  horizon?: PriorityHorizon | PriorityHorizon[];
  limit?: number;
};

export type CreateAgentRunData = {
  brainId: string;
  sourceItemId?: string;
  workflowId?: string;
  name: string;
  modelProvider: ModelProvider;
  stepName?: string;
  inputSummary: string;
  rawInput?: Record<string, unknown>;
};

export type UpdateAgentRunData = {
  status: AgentRunStatus;
  outputSummary?: string;
  rawOutput?: Record<string, unknown>;
  modelProvider?: ModelProvider;
  error?: string;
  completedAt?: string;
};

export type ConnectorType = "google_drive" | "gmail" | "outlook" | "recall" | "mock";
export type ConnectorStatus = "active" | "connected" | "paused" | "error";
export type ConnectorSyncRunStatus = "started" | "completed" | "failed";
export type BrainAlertSeverity = "info" | "warning" | "error" | "critical";
export type BrainAlertStatus = "unread" | "read" | "dismissed";
export type NotetakerProvider = "google_calendar" | "outlook_calendar";
export type NotetakerCalendarStatus = "connected" | "error" | "disabled";
export type NotetakerAutoJoinMode = "all_calls" | "external_only" | "arvya_related_only" | "manual_only";
export type NotetakerAutoJoinDecision = "join" | "skip" | "needs_review";
export type NotetakerBotStatus = "not_scheduled" | "scheduled" | "joining" | "in_call" | "completed" | "failed" | "canceled";

export type ConnectorConfig = {
  id: string;
  brainId: string;
  connectorType: ConnectorType;
  status: ConnectorStatus;
  config: Record<string, unknown>;
  credentials?: Record<string, unknown> | null;
  syncEnabled: boolean;
  syncIntervalMinutes?: number | null;
  lastSyncAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt?: string;
};

export type ConnectorSyncRun = {
  id: string;
  brainId: string;
  connectorConfigId?: string | null;
  connectorType: ConnectorType;
  status: ConnectorSyncRunStatus;
  startedAt: string;
  completedAt?: string;
  itemsFound: number;
  itemsIngested: number;
  itemsSkipped: number;
  error?: string;
  metadata: Record<string, unknown>;
};

export type BrainAlert = {
  id: string;
  brainId: string;
  alertType: string;
  title: string;
  description: string;
  severity: BrainAlertSeverity;
  sourceId?: string | null;
  openLoopId?: string | null;
  status: BrainAlertStatus;
  createdAt: string;
};

export type BrainEvent = {
  id: string;
  brainId: string;
  eventType: string;
  sourceSystem?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

export type CreateBrainEventData = {
  brainId: string;
  eventType: string;
  sourceSystem?: string | null;
  payload?: Record<string, unknown>;
};

export type NotetakerCalendar = {
  id: string;
  brainId: string;
  userId?: string | null;
  provider: NotetakerProvider;
  recallCalendarId?: string | null;
  externalCalendarId?: string | null;
  status: NotetakerCalendarStatus;
  autoJoinEnabled: boolean;
  autoJoinMode: NotetakerAutoJoinMode;
  config: Record<string, unknown>;
  lastSyncAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt?: string;
};

export type NotetakerMeeting = {
  id: string;
  brainId: string;
  notetakerCalendarId?: string | null;
  recallCalendarEventId?: string | null;
  recallBotId?: string | null;
  externalEventId?: string | null;
  provider: NotetakerProvider;
  title: string;
  meetingUrl?: string | null;
  startTime: string;
  endTime: string;
  participants: unknown[];
  autoJoinDecision: NotetakerAutoJoinDecision;
  autoJoinReason?: string | null;
  botStatus: NotetakerBotStatus;
  sourceItemId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export type NotetakerEvent = {
  id: string;
  brainId: string;
  notetakerMeetingId?: string | null;
  providerEventId?: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  processedAt?: string;
  createdAt: string;
};

export type CreateConnectorConfigData = {
  brainId: string;
  connectorType: ConnectorType;
  status?: ConnectorStatus;
  config?: Record<string, unknown>;
  credentials?: Record<string, unknown> | null;
  syncEnabled?: boolean;
  syncIntervalMinutes?: number | null;
};

export type UpdateConnectorConfigData = Partial<{
  status: ConnectorStatus;
  config: Record<string, unknown>;
  credentials: Record<string, unknown> | null;
  syncEnabled: boolean;
  syncIntervalMinutes: number | null;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}>;

export type CreateConnectorSyncRunData = {
  brainId: string;
  connectorConfigId?: string | null;
  connectorType: ConnectorType;
  status?: ConnectorSyncRunStatus;
  itemsFound?: number;
  itemsIngested?: number;
  itemsSkipped?: number;
  error?: string | null;
  metadata?: Record<string, unknown>;
};

export type UpdateConnectorSyncRunData = Partial<{
  status: ConnectorSyncRunStatus;
  completedAt: string | null;
  itemsFound: number;
  itemsIngested: number;
  itemsSkipped: number;
  error: string | null;
  metadata: Record<string, unknown>;
}>;

export type CreateBrainAlertData = {
  brainId: string;
  alertType: string;
  title: string;
  description: string;
  severity?: BrainAlertSeverity;
  sourceId?: string | null;
  openLoopId?: string | null;
  status?: BrainAlertStatus;
};

export type CreateNotetakerCalendarData = {
  brainId: string;
  userId?: string | null;
  provider: NotetakerProvider;
  recallCalendarId?: string | null;
  externalCalendarId?: string | null;
  status?: NotetakerCalendarStatus;
  autoJoinEnabled?: boolean;
  autoJoinMode?: NotetakerAutoJoinMode;
  config?: Record<string, unknown>;
  lastSyncAt?: string | null;
  lastError?: string | null;
};

export type UpdateNotetakerCalendarData = Partial<{
  recallCalendarId: string | null;
  externalCalendarId: string | null;
  status: NotetakerCalendarStatus;
  autoJoinEnabled: boolean;
  autoJoinMode: NotetakerAutoJoinMode;
  config: Record<string, unknown>;
  lastSyncAt: string | null;
  lastError: string | null;
}>;

export type CreateNotetakerMeetingData = {
  brainId: string;
  notetakerCalendarId?: string | null;
  recallCalendarEventId?: string | null;
  recallBotId?: string | null;
  externalEventId?: string | null;
  provider: NotetakerProvider;
  title: string;
  meetingUrl?: string | null;
  startTime: string;
  endTime: string;
  participants?: unknown[];
  autoJoinDecision?: NotetakerAutoJoinDecision;
  autoJoinReason?: string | null;
  botStatus?: NotetakerBotStatus;
  sourceItemId?: string | null;
  metadata?: Record<string, unknown>;
};

export type UpdateNotetakerMeetingData = Partial<{
  recallCalendarEventId: string | null;
  recallBotId: string | null;
  title: string;
  meetingUrl: string | null;
  startTime: string;
  endTime: string;
  participants: unknown[];
  autoJoinDecision: NotetakerAutoJoinDecision;
  autoJoinReason: string | null;
  botStatus: NotetakerBotStatus;
  sourceItemId: string | null;
  metadata: Record<string, unknown>;
}>;

export type CreateNotetakerEventData = {
  brainId: string;
  notetakerMeetingId?: string | null;
  providerEventId?: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
  processedAt?: string | null;
};

export type UpdateNotetakerEventData = Partial<{
  notetakerMeetingId: string | null;
  processedAt: string | null;
}>;

export type CreateMarketingContentItemData = {
  brainId: string;
  sourceItemId?: string | null;
  sourcePlatform: MarketingSourcePlatform;
  sourceType: MarketingSourceType;
  sourceUrl?: string | null;
  sourceExternalId?: string | null;
  sourceOwner?: string | null;
  sourceDate?: string | null;
  sourceConfidentiality?: MarketingConfidentiality;
  rawText: string;
  cleanedSummary?: string | null;
  contentSafeSummary?: string | null;
  requiresRedaction?: boolean;
  approvedForContent?: boolean;
  metadata?: Record<string, unknown>;
};

export type UpdateMarketingContentItemData = Partial<{
  cleanedSummary: string | null;
  contentSafeSummary: string | null;
  sourceConfidentiality: MarketingConfidentiality;
  requiresRedaction: boolean;
  approvedForContent: boolean;
  metadata: Record<string, unknown>;
}>;

export type CreateMarketingContentInsightData = {
  brainId: string;
  contentItemId: string;
  rawInsight: string;
  contentSafeInsight: string;
  sensitivityLevel?: MarketingSensitivityLevel;
  suggestedPillar?: string | null;
  suggestedChannels?: MarketingChannel[];
  approvedForContent?: boolean;
  metadata?: Record<string, unknown>;
};

export type UpdateMarketingContentInsightData = Partial<{
  contentSafeInsight: string;
  sensitivityLevel: MarketingSensitivityLevel;
  suggestedPillar: string | null;
  suggestedChannels: MarketingChannel[];
  approvedForContent: boolean;
  metadata: Record<string, unknown>;
}>;

export type CreateMarketingChannelPostData = {
  brainId: string;
  contentItemId?: string | null;
  contentInsightId?: string | null;
  channel: MarketingChannel;
  status?: MarketingPostStatus;
  bodyText: string;
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
  requiresReview?: boolean;
  sensitivityLevel?: MarketingSensitivityLevel;
  approvedBy?: string | null;
  approvedAt?: string | null;
  revisionReason?: string | null;
  safetyCheckStatus?: "not_run" | "passed" | "failed";
  safetyCheckReason?: string | null;
  isExemplar?: boolean;
  performanceTag?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  metadata?: Record<string, unknown>;
};

export type UpdateMarketingChannelPostData = Partial<Omit<CreateMarketingChannelPostData, "brainId" | "contentItemId" | "contentInsightId" | "channel">>;

export type CreateMarketingPostMetricData = {
  brainId: string;
  channelPostId: string;
  metricDate: string;
  impressions?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  saves?: number;
  follows?: number;
  rawMetrics?: Record<string, unknown>;
};

export type CreateMarketingEventData = {
  brainId: string;
  channelPostId?: string | null;
  eventType: MarketingEventType;
  eventSource: string;
  eventAt?: string;
  description: string;
  contactName?: string | null;
  companyName?: string | null;
  value?: number | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  attributionConfidence?: "direct" | "assisted" | "manual" | "unknown";
  metadata?: Record<string, unknown>;
};

export type CreateMarketingExperimentData = {
  brainId: string;
  tag: string;
  title: string;
  hypothesis: string;
  status?: MarketingExperiment["status"];
  startedAt?: string | null;
  endedAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreateMarketingWeeklyReportData = {
  brainId: string;
  weekStart: string;
  weekEnd: string;
  publishedCount: number;
  qualitativeOnly: boolean;
  summary: string;
  markdown: string;
  recommendedExperiments?: Array<{ title: string; rationale: string; tag?: string }>;
  metadata?: Record<string, unknown>;
};

export type CreateMarketingLlmUsageData = {
  brainId: string;
  jobType: string;
  modelProvider: ModelProvider;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  metadata?: Record<string, unknown>;
};

export interface BrainRepository {
  readonly mode: "in_memory" | "supabase";

  listBrains(): Promise<Brain[]>;
  getBrain(brainId: string): Promise<Brain | null>;
  createBrain(input: CreateBrainData): Promise<Brain>;

  createSourceItem(input: CreateSourceData): Promise<SourceItem>;
  getSourceItem(sourceItemId: string): Promise<SourceItem | null>;
  listSourceItems(brainId: string, options?: ListOptions): Promise<SourceItem[]>;

  createMemoryObjects(items: CreateMemoryObjectData[]): Promise<MemoryObject[]>;
  listMemoryObjects(brainId: string, options?: ListOptions): Promise<MemoryObject[]>;
  updateMemoryObject(memoryObjectId: string, update: UpdateMemoryObjectData): Promise<MemoryObject | null>;

  createRelationships(items: CreateRelationshipData[]): Promise<Relationship[]>;
  listRelationships(brainId: string, options?: ListOptions): Promise<Relationship[]>;
  updateRelationship(relationshipId: string, update: UpdateRelationshipData): Promise<Relationship | null>;

  createOpenLoops(items: CreateOpenLoopData[]): Promise<OpenLoop[]>;
  listOpenLoops(brainId: string, options?: ListOptions): Promise<OpenLoop[]>;
  updateOpenLoop(openLoopId: string, update: UpdateOpenLoopData): Promise<OpenLoop | null>;

  createWorkflow(input: CreateWorkflowData): Promise<Workflow>;
  updateWorkflow(workflowId: string, update: UpdateWorkflowData): Promise<Workflow | null>;
  listWorkflows(brainId: string, limit?: number): Promise<Workflow[]>;

  createSourceEmbeddings(items: CreateSourceEmbeddingData[]): Promise<SourceEmbedding[]>;
  searchBrain(input: {
    brainId: string;
    embedding: number[];
    query: string;
    limit: number;
  }): Promise<Array<{ memoryObject?: MemoryObject; openLoop?: OpenLoop; sourceItem?: SourceItem; score: number; reason: "vector" | "lexical" }>>;

  listPriorities(brainId: string, opts?: ListPrioritiesOptions): Promise<Priority[]>;
  createPriority(input: CreatePriorityData): Promise<Priority>;
  updatePriorityStatus(priorityId: string, update: UpdatePriorityStatusData): Promise<Priority | null>;

  listAgentRuns(brainId: string, limit?: number): Promise<AgentRun[]>;
  createAgentRun(input: CreateAgentRunData): Promise<AgentRun>;
  updateAgentRun(runId: string, update: UpdateAgentRunData): Promise<AgentRun | null>;

  listConnectorConfigs(brainId?: string): Promise<ConnectorConfig[]>;
  createConnectorConfig(input: CreateConnectorConfigData): Promise<ConnectorConfig>;
  updateConnectorConfig(configId: string, update: UpdateConnectorConfigData): Promise<ConnectorConfig | null>;
  listConnectorSyncRuns(input?: { brainId?: string; connectorConfigId?: string; limit?: number }): Promise<ConnectorSyncRun[]>;
  createConnectorSyncRun(input: CreateConnectorSyncRunData): Promise<ConnectorSyncRun>;
  updateConnectorSyncRun(runId: string, update: UpdateConnectorSyncRunData): Promise<ConnectorSyncRun | null>;
  listBrainAlerts(input?: { brainId?: string; status?: BrainAlertStatus; limit?: number }): Promise<BrainAlert[]>;
  createBrainAlert(input: CreateBrainAlertData): Promise<BrainAlert>;
  listBrainEvents(brainId: string, options?: ListOptions): Promise<BrainEvent[]>;
  createBrainEvent(input: CreateBrainEventData): Promise<BrainEvent>;

  listNotetakerCalendars(input?: { brainId?: string; status?: NotetakerCalendarStatus }): Promise<NotetakerCalendar[]>;
  createNotetakerCalendar(input: CreateNotetakerCalendarData): Promise<NotetakerCalendar>;
  updateNotetakerCalendar(calendarId: string, update: UpdateNotetakerCalendarData): Promise<NotetakerCalendar | null>;
  deleteNotetakerCalendar(calendarId: string): Promise<boolean>;
  listNotetakerMeetings(input?: { brainId?: string; calendarId?: string; from?: string; to?: string; limit?: number }): Promise<NotetakerMeeting[]>;
  createNotetakerMeeting(input: CreateNotetakerMeetingData): Promise<NotetakerMeeting>;
  updateNotetakerMeeting(meetingId: string, update: UpdateNotetakerMeetingData): Promise<NotetakerMeeting | null>;
  listNotetakerEvents(input?: { brainId?: string; providerEventId?: string; limit?: number }): Promise<NotetakerEvent[]>;
  createNotetakerEvent(input: CreateNotetakerEventData): Promise<NotetakerEvent>;
  updateNotetakerEvent(eventId: string, update: UpdateNotetakerEventData): Promise<NotetakerEvent | null>;

  createMarketingContentItem(input: CreateMarketingContentItemData): Promise<MarketingContentItem>;
  updateMarketingContentItem(contentItemId: string, update: UpdateMarketingContentItemData): Promise<MarketingContentItem | null>;
  listMarketingContentItems(brainId: string, options?: ListOptions): Promise<MarketingContentItem[]>;
  getMarketingContentItem(contentItemId: string): Promise<MarketingContentItem | null>;
  createMarketingContentInsights(items: CreateMarketingContentInsightData[]): Promise<MarketingContentInsight[]>;
  updateMarketingContentInsight(insightId: string, update: UpdateMarketingContentInsightData): Promise<MarketingContentInsight | null>;
  listMarketingContentInsights(brainId: string, options?: ListOptions & { approvedOnly?: boolean }): Promise<MarketingContentInsight[]>;
  getMarketingContentInsight(insightId: string): Promise<MarketingContentInsight | null>;
  createMarketingChannelPosts(items: CreateMarketingChannelPostData[]): Promise<MarketingChannelPost[]>;
  updateMarketingChannelPost(postId: string, update: UpdateMarketingChannelPostData): Promise<MarketingChannelPost | null>;
  listMarketingChannelPosts(brainId: string, options?: ListOptions & { status?: MarketingPostStatus | MarketingPostStatus[]; exemplarOnly?: boolean }): Promise<MarketingChannelPost[]>;
  getMarketingChannelPost(postId: string): Promise<MarketingChannelPost | null>;
  createMarketingPostMetric(input: CreateMarketingPostMetricData): Promise<MarketingPostMetric>;
  listMarketingPostMetrics(brainId: string, options?: ListOptions): Promise<MarketingPostMetric[]>;
  createMarketingEvent(input: CreateMarketingEventData): Promise<MarketingEvent>;
  listMarketingEvents(brainId: string, options?: ListOptions): Promise<MarketingEvent[]>;
  createMarketingExperiment(input: CreateMarketingExperimentData): Promise<MarketingExperiment>;
  listMarketingExperiments(brainId: string, options?: ListOptions): Promise<MarketingExperiment[]>;
  createMarketingWeeklyReport(input: CreateMarketingWeeklyReportData): Promise<MarketingWeeklyReport>;
  listMarketingWeeklyReports(brainId: string, options?: ListOptions): Promise<MarketingWeeklyReport[]>;
  createMarketingLlmUsage(input: CreateMarketingLlmUsageData): Promise<MarketingLlmUsage>;
  listMarketingLlmUsage(brainId: string, options?: ListOptions): Promise<MarketingLlmUsage[]>;
}

let cached: BrainRepository | null = null;

export function getRepository(): BrainRepository {
  if (cached) return cached;
  const db = tryGetDb();
  cached = db ? new SupabaseRepository(db) : new InMemoryRepository();
  return cached;
}

export function resetRepositoryForTests() {
  cached = null;
}
