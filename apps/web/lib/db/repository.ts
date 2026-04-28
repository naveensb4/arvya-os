import type {
  AgentRun,
  AgentRunStatus,
  Brain,
  BrainKind,
  MemoryObject,
  MemoryObjectStatus,
  MemoryObjectType,
  ModelProvider,
  OpenLoop,
  OpenLoopPriority,
  OpenLoopStatus,
  OpenLoopType,
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

export interface BrainRepository {
  readonly mode: "in_memory" | "supabase";

  listBrains(): Promise<Brain[]>;
  getBrain(brainId: string): Promise<Brain | null>;
  createBrain(input: CreateBrainData): Promise<Brain>;

  createSourceItem(input: CreateSourceData): Promise<SourceItem>;
  getSourceItem(sourceItemId: string): Promise<SourceItem | null>;
  listSourceItems(brainId: string): Promise<SourceItem[]>;

  createMemoryObjects(items: CreateMemoryObjectData[]): Promise<MemoryObject[]>;
  listMemoryObjects(brainId: string): Promise<MemoryObject[]>;
  updateMemoryObject(memoryObjectId: string, update: UpdateMemoryObjectData): Promise<MemoryObject | null>;

  createRelationships(items: CreateRelationshipData[]): Promise<Relationship[]>;
  listRelationships(brainId: string): Promise<Relationship[]>;
  updateRelationship(relationshipId: string, update: UpdateRelationshipData): Promise<Relationship | null>;

  createOpenLoops(items: CreateOpenLoopData[]): Promise<OpenLoop[]>;
  listOpenLoops(brainId: string): Promise<OpenLoop[]>;
  updateOpenLoop(openLoopId: string, update: UpdateOpenLoopData): Promise<OpenLoop | null>;

  createWorkflow(input: CreateWorkflowData): Promise<Workflow>;
  updateWorkflow(workflowId: string, update: UpdateWorkflowData): Promise<Workflow | null>;
  listWorkflows(brainId: string): Promise<Workflow[]>;

  createSourceEmbeddings(items: CreateSourceEmbeddingData[]): Promise<SourceEmbedding[]>;
  searchBrain(input: {
    brainId: string;
    embedding: number[];
    query: string;
    limit: number;
  }): Promise<Array<{ memoryObject?: MemoryObject; openLoop?: OpenLoop; sourceItem?: SourceItem; score: number; reason: "vector" | "lexical" }>>;

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
