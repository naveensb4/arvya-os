import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type {
  AgentRun,
  Brain,
  MarketingChannelPost,
  MarketingContentInsight,
  MarketingContentItem,
  MarketingEvent,
  MarketingExperiment,
  MarketingLlmUsage,
  MarketingPostMetric,
  MarketingWeeklyReport,
  MemoryObject,
  ModelProvider,
  OpenLoop,
  Priority,
  Relationship,
  SourceEmbedding,
  SourceItem,
  Workflow,
} from "@arvya/core";
import type { Db } from "./client";
import {
  agentRuns,
  brainAlerts,
  brainEvents,
  brains,
  connectorConfigs,
  connectorSyncRuns,
  marketingChannelPosts,
  marketingContentInsights,
  marketingContentItems,
  marketingEvents,
  marketingExperiments,
  marketingLlmUsage,
  marketingPostMetrics,
  marketingWeeklyReports,
  memoryObjects,
  notetakerCalendars,
  notetakerEvents,
  notetakerMeetings,
  openLoops,
  priorities,
  relationships,
  sourceEmbeddings,
  sourceItems,
  workflows,
  type AgentRunRow,
  type BrainAlertRow,
  type BrainEventRow,
  type BrainRow,
  type ConnectorConfigRow,
  type ConnectorSyncRunRow,
  type MarketingChannelPostRow,
  type MarketingContentInsightRow,
  type MarketingContentItemRow,
  type MarketingEventRow,
  type MarketingExperimentRow,
  type MarketingLlmUsageRow,
  type MarketingPostMetricRow,
  type MarketingWeeklyReportRow,
  type MemoryObjectRow,
  type NotetakerCalendarRow,
  type NotetakerEventRow,
  type NotetakerMeetingRow,
  type OpenLoopRow,
  type PriorityRow,
  type RelationshipRow,
  type SourceEmbeddingRow,
  type SourceItemRow,
  type WorkflowRow,
} from "./schema";
import type {
  BrainRepository,
  CreateAgentRunData,
  CreateBrainAlertData,
  CreateBrainEventData,
  CreateBrainData,
  CreateConnectorConfigData,
  CreateConnectorSyncRunData,
  CreateMarketingChannelPostData,
  CreateMarketingContentInsightData,
  CreateMarketingContentItemData,
  CreateMarketingEventData,
  CreateMarketingExperimentData,
  CreateMarketingLlmUsageData,
  CreateMarketingPostMetricData,
  CreateMarketingWeeklyReportData,
  CreateMemoryObjectData,
  CreateNotetakerCalendarData,
  CreateNotetakerEventData,
  CreateNotetakerMeetingData,
  CreateOpenLoopData,
  CreatePriorityData,
  CreateRelationshipData,
  CreateSourceData,
  CreateSourceEmbeddingData,
  CreateWorkflowData,
  ListOptions,
  ListPrioritiesOptions,
  UpdateAgentRunData,
  UpdateConnectorConfigData,
  UpdateConnectorSyncRunData,
  UpdateMarketingChannelPostData,
  UpdateMarketingContentInsightData,
  UpdateMarketingContentItemData,
  UpdateMemoryObjectData,
  UpdateNotetakerCalendarData,
  UpdateNotetakerEventData,
  UpdateNotetakerMeetingData,
  UpdateOpenLoopData,
  UpdatePriorityStatusData,
  UpdateRelationshipData,
  UpdateWorkflowData,
} from "./repository";

function isoOrNull(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function numberOrUndefined(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return Number(value);
}

function dateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toBrain(row: BrainRow): Brain {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    thesis: row.thesis,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSourceItem(row: SourceItemRow): SourceItem {
  return {
    id: row.id,
    brainId: row.brainId,
    title: row.title,
    type: row.type,
    content: row.content,
    externalUri: row.externalUri ?? undefined,
    storagePath: row.storagePath ?? undefined,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMemoryObject(row: MemoryObjectRow): MemoryObject {
  return {
    id: row.id,
    brainId: row.brainId,
    sourceItemId: row.sourceItemId ?? undefined,
    objectType: row.objectType,
    name: row.name,
    description: row.description,
    properties: (row.properties ?? {}) as Record<string, unknown>,
    sourceQuote: row.sourceQuote ?? undefined,
    confidence: numberOrUndefined(row.confidence),
    status: row.status ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toOpenLoop(row: OpenLoopRow): OpenLoop {
  return {
    id: row.id,
    brainId: row.brainId,
    sourceItemId: row.sourceItemId ?? undefined,
    title: row.title,
    description: row.description,
    loopType: row.loopType,
    owner: row.owner ?? undefined,
    status: row.status,
    priority: row.priority,
    dueDate: isoOrNull(row.dueDate),
    suggestedAction: row.suggestedAction ?? undefined,
    suggestedFollowUpEmail: (row.suggestedFollowUpEmail ?? null) as OpenLoop["suggestedFollowUpEmail"],
    requiresHumanApproval: row.requiresHumanApproval,
    approvedAt: isoOrNull(row.approvedAt),
    outcome: row.outcome ?? undefined,
    sourceQuote: row.sourceQuote ?? undefined,
    confidence: numberOrUndefined(row.confidence),
    properties: (row.properties ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: isoOrNull(row.closedAt),
  };
}

function toRelationship(row: RelationshipRow): Relationship {
  return {
    id: row.id,
    brainId: row.brainId,
    fromObjectId: row.fromObjectId,
    toObjectId: row.toObjectId,
    relationshipType: row.relationshipType,
    sourceItemId: row.sourceItemId ?? undefined,
    sourceQuote: row.sourceQuote ?? undefined,
    confidence: numberOrUndefined(row.confidence),
    properties: (row.properties ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

function toWorkflow(row: WorkflowRow): Workflow {
  return {
    id: row.id,
    brainId: row.brainId,
    sourceItemId: row.sourceItemId ?? undefined,
    workflowType: row.workflowType,
    status: row.status,
    state: (row.state ?? {}) as Record<string, unknown>,
    error: row.error ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: isoOrNull(row.completedAt),
  };
}

function toSourceEmbedding(row: SourceEmbeddingRow): SourceEmbedding {
  return {
    id: row.id,
    sourceItemId: row.sourceItemId,
    brainId: row.brainId,
    chunkIndex: row.chunkIndex,
    content: row.content,
    embedding: row.embedding ?? null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPriority(row: PriorityRow): Priority {
  const sourceRefs = Array.isArray(row.sourceRefs)
    ? (row.sourceRefs as unknown[]).filter((value): value is string => typeof value === "string")
    : [];
  return {
    id: row.id,
    brainId: row.brainId,
    statement: row.statement,
    setAt: row.setAt.toISOString(),
    setBy: row.setBy,
    horizon: row.horizon,
    status: row.status,
    sourceRefs: sourceRefs.length > 0 ? sourceRefs : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAgentRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    brainId: row.brainId,
    sourceItemId: row.sourceItemId ?? undefined,
    workflowId: row.workflowId ?? undefined,
    name: row.name,
    status: row.status,
    modelProvider: row.modelProvider as ModelProvider,
    stepName: row.stepName ?? undefined,
    inputSummary: row.inputSummary,
    outputSummary: row.outputSummary,
    rawInput: (row.rawInput ?? {}) as Record<string, unknown>,
    rawOutput: (row.rawOutput ?? {}) as Record<string, unknown>,
    error: row.error ?? undefined,
    startedAt: row.startedAt.toISOString(),
    completedAt: isoOrNull(row.completedAt),
  };
}

function toConnectorConfig(row: ConnectorConfigRow) {
  return {
    id: row.id,
    brainId: row.brainId,
    connectorType: row.connectorType,
    status: row.status,
    config: (row.config ?? {}) as Record<string, unknown>,
    credentials: (row.credentials ?? null) as Record<string, unknown> | null,
    syncEnabled: row.syncEnabled,
    syncIntervalMinutes: row.syncIntervalMinutes,
    lastSyncAt: isoOrNull(row.lastSyncAt),
    lastSuccessAt: isoOrNull(row.lastSuccessAt),
    lastError: row.lastError ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toConnectorSyncRun(row: ConnectorSyncRunRow) {
  return {
    id: row.id,
    brainId: row.brainId,
    connectorConfigId: row.connectorConfigId,
    connectorType: row.connectorType,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    completedAt: isoOrNull(row.completedAt),
    itemsFound: row.itemsFound,
    itemsIngested: row.itemsIngested,
    itemsSkipped: row.itemsSkipped,
    error: row.error ?? undefined,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}

function toBrainAlert(row: BrainAlertRow) {
  return {
    id: row.id,
    brainId: row.brainId,
    alertType: row.alertType,
    title: row.title,
    description: row.description,
    severity: row.severity,
    sourceId: row.sourceId,
    openLoopId: row.openLoopId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function toBrainEvent(row: BrainEventRow) {
  return {
    id: row.id,
    brainId: row.brainId,
    eventType: row.eventType,
    sourceSystem: row.sourceSystem ?? undefined,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

function toNotetakerCalendar(row: NotetakerCalendarRow) {
  return {
    id: row.id,
    brainId: row.brainId,
    userId: row.userId,
    provider: row.provider,
    recallCalendarId: row.recallCalendarId,
    externalCalendarId: row.externalCalendarId,
    status: row.status,
    autoJoinEnabled: row.autoJoinEnabled,
    autoJoinMode: row.autoJoinMode,
    config: (row.config ?? {}) as Record<string, unknown>,
    lastSyncAt: isoOrNull(row.lastSyncAt),
    lastError: row.lastError ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toNotetakerMeeting(row: NotetakerMeetingRow) {
  return {
    id: row.id,
    brainId: row.brainId,
    notetakerCalendarId: row.notetakerCalendarId,
    recallCalendarEventId: row.recallCalendarEventId,
    recallBotId: row.recallBotId,
    externalEventId: row.externalEventId,
    provider: row.provider,
    title: row.title,
    meetingUrl: row.meetingUrl,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    participants: (row.participants ?? []) as unknown[],
    autoJoinDecision: row.autoJoinDecision,
    autoJoinReason: row.autoJoinReason ?? undefined,
    botStatus: row.botStatus,
    sourceItemId: row.sourceItemId,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toNotetakerEvent(row: NotetakerEventRow) {
  return {
    id: row.id,
    brainId: row.brainId,
    notetakerMeetingId: row.notetakerMeetingId,
    providerEventId: row.providerEventId,
    eventType: row.eventType,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    processedAt: isoOrNull(row.processedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toMarketingContentItem(row: MarketingContentItemRow): MarketingContentItem {
  return {
    id: row.id,
    brainId: row.brainId,
    sourceItemId: row.sourceItemId,
    sourcePlatform: row.sourcePlatform,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    sourceExternalId: row.sourceExternalId,
    sourceOwner: row.sourceOwner,
    sourceDate: isoOrNull(row.sourceDate),
    sourceConfidentiality: row.sourceConfidentiality,
    rawText: row.rawText,
    cleanedSummary: row.cleanedSummary,
    contentSafeSummary: row.contentSafeSummary,
    requiresRedaction: row.requiresRedaction,
    approvedForContent: row.approvedForContent,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMarketingContentInsight(row: MarketingContentInsightRow): MarketingContentInsight {
  return {
    id: row.id,
    brainId: row.brainId,
    contentItemId: row.contentItemId,
    rawInsight: row.rawInsight,
    contentSafeInsight: row.contentSafeInsight,
    sensitivityLevel: row.sensitivityLevel,
    suggestedPillar: row.suggestedPillar,
    suggestedChannels: stringArray(row.suggestedChannels) as MarketingContentInsight["suggestedChannels"],
    approvedForContent: row.approvedForContent,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMarketingChannelPost(row: MarketingChannelPostRow): MarketingChannelPost {
  return {
    id: row.id,
    brainId: row.brainId,
    contentItemId: row.contentItemId,
    contentInsightId: row.contentInsightId,
    channel: row.channel,
    status: row.status,
    bodyText: row.bodyText,
    mediaType: row.mediaType,
    mediaReference: row.mediaReference,
    plannedPostDate: isoOrNull(row.plannedPostDate),
    postingWindow: row.postingWindow,
    scheduledAt: isoOrNull(row.scheduledAt),
    publishedAt: isoOrNull(row.publishedAt),
    liveUrl: row.liveUrl,
    schedulerProvider: row.schedulerProvider,
    schedulerPostId: row.schedulerPostId,
    campaignTag: row.campaignTag,
    pillar: row.pillar,
    formatType: row.formatType,
    hookType: row.hookType,
    targetIcp: row.targetIcp,
    funnelStage: row.funnelStage,
    experimentTag: row.experimentTag,
    requiresReview: row.requiresReview,
    sensitivityLevel: row.sensitivityLevel,
    approvedBy: row.approvedBy,
    approvedAt: isoOrNull(row.approvedAt),
    revisionReason: row.revisionReason,
    safetyCheckStatus: row.safetyCheckStatus as MarketingChannelPost["safetyCheckStatus"],
    safetyCheckReason: row.safetyCheckReason,
    isExemplar: row.isExemplar,
    performanceTag: row.performanceTag,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    utmContent: row.utmContent,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMarketingPostMetric(row: MarketingPostMetricRow): MarketingPostMetric {
  return {
    id: row.id,
    brainId: row.brainId,
    channelPostId: row.channelPostId,
    metricDate: row.metricDate.toISOString(),
    impressions: row.impressions,
    reactions: row.reactions,
    comments: row.comments,
    shares: row.shares,
    clicks: row.clicks,
    saves: row.saves,
    follows: row.follows,
    rawMetrics: (row.rawMetrics ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMarketingExperiment(row: MarketingExperimentRow): MarketingExperiment {
  return {
    id: row.id,
    brainId: row.brainId,
    tag: row.tag,
    title: row.title,
    hypothesis: row.hypothesis,
    status: row.status,
    startedAt: isoOrNull(row.startedAt),
    endedAt: isoOrNull(row.endedAt),
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMarketingEvent(row: MarketingEventRow): MarketingEvent {
  return {
    id: row.id,
    brainId: row.brainId,
    channelPostId: row.channelPostId,
    eventType: row.eventType,
    eventSource: row.eventSource,
    eventAt: row.eventAt.toISOString(),
    description: row.description,
    contactName: row.contactName,
    companyName: row.companyName,
    value: numberOrUndefined(row.value),
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    utmContent: row.utmContent,
    attributionConfidence: row.attributionConfidence,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMarketingWeeklyReport(row: MarketingWeeklyReportRow): MarketingWeeklyReport {
  return {
    id: row.id,
    brainId: row.brainId,
    weekStart: row.weekStart.toISOString(),
    weekEnd: row.weekEnd.toISOString(),
    publishedCount: row.publishedCount,
    qualitativeOnly: row.qualitativeOnly,
    summary: row.summary,
    markdown: row.markdown,
    recommendedExperiments: (Array.isArray(row.recommendedExperiments) ? row.recommendedExperiments : []) as MarketingWeeklyReport["recommendedExperiments"],
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMarketingLlmUsage(row: MarketingLlmUsageRow): MarketingLlmUsage {
  return {
    id: row.id,
    brainId: row.brainId,
    jobType: row.jobType,
    modelProvider: row.modelProvider,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    estimatedCostUsd: Number(row.estimatedCostUsd),
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

export class SupabaseRepository implements BrainRepository {
  readonly mode = "supabase" as const;
  constructor(private readonly db: Db) {}

  async listBrains(): Promise<Brain[]> {
    return (await this.db.select().from(brains).orderBy(desc(brains.createdAt))).map(toBrain);
  }

  async getBrain(brainId: string): Promise<Brain | null> {
    if (!isUuid(brainId)) return null;
    const [row] = await this.db.select().from(brains).where(eq(brains.id, brainId)).limit(1);
    return row ? toBrain(row) : null;
  }

  async createBrain(input: CreateBrainData): Promise<Brain> {
    const [row] = await this.db
      .insert(brains)
      .values({
        name: input.name,
        kind: input.kind,
        thesis: input.thesis,
        metadata: input.metadata ?? {},
      })
      .returning();
    return toBrain(row);
  }

  async createSourceItem(input: CreateSourceData): Promise<SourceItem> {
    const [row] = await this.db
      .insert(sourceItems)
      .values({
        brainId: input.brainId,
        title: input.title,
        type: input.type,
        content: input.content,
        externalUri: input.externalUri ?? null,
        storagePath: input.storagePath ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return toSourceItem(row);
  }

  async getSourceItem(sourceItemId: string): Promise<SourceItem | null> {
    const [row] = await this.db
      .select()
      .from(sourceItems)
      .where(eq(sourceItems.id, sourceItemId))
      .limit(1);
    return row ? toSourceItem(row) : null;
  }

  async listSourceItems(brainId: string, options: ListOptions = {}): Promise<SourceItem[]> {
    return (
      await this.db
        .select()
        .from(sourceItems)
        .where(eq(sourceItems.brainId, brainId))
        .orderBy(desc(sourceItems.createdAt))
        .limit(options.limit ?? 500)
    ).map(toSourceItem);
  }

  async createMemoryObjects(items: CreateMemoryObjectData[]): Promise<MemoryObject[]> {
    if (items.length === 0) return [];
    const rows = await this.db
      .insert(memoryObjects)
      .values(
        items.map((item) => ({
          brainId: item.brainId,
          sourceItemId: item.sourceItemId ?? null,
          objectType: item.objectType,
          name: item.name,
          description: item.description,
          properties: item.properties ?? {},
          sourceQuote: item.sourceQuote ?? null,
          confidence: item.confidence === undefined ? null : item.confidence.toFixed(2),
          status: item.status ?? null,
        })),
      )
      .returning();
    return rows.map(toMemoryObject);
  }

  async listMemoryObjects(brainId: string, options: ListOptions = {}): Promise<MemoryObject[]> {
    return (
      await this.db
        .select()
        .from(memoryObjects)
        .where(eq(memoryObjects.brainId, brainId))
        .orderBy(desc(memoryObjects.createdAt))
        .limit(options.limit ?? 500)
    ).map(toMemoryObject);
  }

  async updateMemoryObject(memoryObjectId: string, update: UpdateMemoryObjectData): Promise<MemoryObject | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (update.sourceItemId !== undefined) set.sourceItemId = update.sourceItemId;
    if (update.objectType !== undefined) set.objectType = update.objectType;
    if (update.name !== undefined) set.name = update.name;
    if (update.description !== undefined) set.description = update.description;
    if (update.properties !== undefined) set.properties = update.properties;
    if (update.sourceQuote !== undefined) set.sourceQuote = update.sourceQuote;
    if (update.confidence !== undefined) set.confidence = update.confidence === null ? null : update.confidence.toFixed(2);
    if (update.status !== undefined) set.status = update.status;

    const [row] = await this.db.update(memoryObjects).set(set).where(eq(memoryObjects.id, memoryObjectId)).returning();
    return row ? toMemoryObject(row) : null;
  }

  async createRelationships(items: CreateRelationshipData[]): Promise<Relationship[]> {
    if (items.length === 0) return [];
    const rows = await this.db
      .insert(relationships)
      .values(
        items.map((item) => ({
          brainId: item.brainId,
          fromObjectId: item.fromObjectId,
          toObjectId: item.toObjectId,
          relationshipType: item.relationshipType,
          sourceItemId: item.sourceItemId ?? null,
          sourceQuote: item.sourceQuote ?? null,
          confidence: item.confidence === undefined ? null : item.confidence.toFixed(2),
          properties: item.properties ?? {},
        })),
      )
      .returning();
    return rows.map(toRelationship);
  }

  async listRelationships(brainId: string, options: ListOptions = {}): Promise<Relationship[]> {
    return (
      await this.db
        .select()
        .from(relationships)
        .where(eq(relationships.brainId, brainId))
        .orderBy(desc(relationships.createdAt))
        .limit(options.limit ?? 500)
    ).map(toRelationship);
  }

  async updateRelationship(relationshipId: string, update: UpdateRelationshipData): Promise<Relationship | null> {
    const set: Record<string, unknown> = {};
    if (update.sourceItemId !== undefined) set.sourceItemId = update.sourceItemId;
    if (update.sourceQuote !== undefined) set.sourceQuote = update.sourceQuote;
    if (update.confidence !== undefined) set.confidence = update.confidence === null ? null : update.confidence.toFixed(2);
    if (update.properties !== undefined) set.properties = update.properties;

    const [row] = await this.db.update(relationships).set(set).where(eq(relationships.id, relationshipId)).returning();
    return row ? toRelationship(row) : null;
  }

  async createOpenLoops(items: CreateOpenLoopData[]): Promise<OpenLoop[]> {
    if (items.length === 0) return [];
    const rows = await this.db
      .insert(openLoops)
      .values(
        items.map((item) => ({
          brainId: item.brainId,
          sourceItemId: item.sourceItemId ?? null,
          title: item.title,
          description: item.description,
          loopType: item.loopType,
          owner: item.owner ?? null,
          status: item.status ?? "needs_review",
          priority: item.priority ?? "medium",
          dueDate: dateOrNull(item.dueDate),
          suggestedAction: item.suggestedAction ?? null,
          suggestedFollowUpEmail: item.suggestedFollowUpEmail ?? null,
          requiresHumanApproval: item.requiresHumanApproval ?? false,
          approvedAt: dateOrNull(item.approvedAt),
          outcome: item.outcome ?? null,
          sourceQuote: item.sourceQuote ?? null,
          confidence: item.confidence === undefined ? null : item.confidence.toFixed(2),
          properties: item.properties ?? {},
        })),
      )
      .returning();
    return rows.map(toOpenLoop);
  }

  async listOpenLoops(brainId: string, options: ListOptions = {}): Promise<OpenLoop[]> {
    return (
      await this.db
        .select()
        .from(openLoops)
        .where(eq(openLoops.brainId, brainId))
        .orderBy(desc(openLoops.createdAt))
        .limit(options.limit ?? 500)
    ).map(toOpenLoop);
  }

  async updateOpenLoop(openLoopId: string, update: UpdateOpenLoopData): Promise<OpenLoop | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (update.title !== undefined) set.title = update.title;
    if (update.description !== undefined) set.description = update.description;
    if (update.loopType !== undefined) set.loopType = update.loopType;
    if (update.owner !== undefined) set.owner = update.owner;
    if (update.status !== undefined) {
      set.status = update.status;
      if (update.status === "done" || update.status === "dismissed" || update.status === "closed") {
        set.closedAt = new Date();
      }
    }
    if (update.priority !== undefined) set.priority = update.priority;
    if (update.dueDate !== undefined) set.dueDate = dateOrNull(update.dueDate);
    if (update.suggestedAction !== undefined) set.suggestedAction = update.suggestedAction;
    if (update.suggestedFollowUpEmail !== undefined) set.suggestedFollowUpEmail = update.suggestedFollowUpEmail;
    if (update.requiresHumanApproval !== undefined) set.requiresHumanApproval = update.requiresHumanApproval;
    if (update.approvedAt !== undefined) set.approvedAt = dateOrNull(update.approvedAt);
    if (update.outcome !== undefined) set.outcome = update.outcome;
    if (update.sourceQuote !== undefined) set.sourceQuote = update.sourceQuote;
    if (update.confidence !== undefined) set.confidence = update.confidence === null ? null : update.confidence.toFixed(2);
    if (update.properties !== undefined) set.properties = update.properties;
    if (update.closedAt !== undefined) set.closedAt = dateOrNull(update.closedAt);

    const [row] = await this.db.update(openLoops).set(set).where(eq(openLoops.id, openLoopId)).returning();
    return row ? toOpenLoop(row) : null;
  }

  async createWorkflow(input: CreateWorkflowData): Promise<Workflow> {
    const [row] = await this.db
      .insert(workflows)
      .values({
        brainId: input.brainId,
        sourceItemId: input.sourceItemId ?? null,
        workflowType: input.workflowType,
        status: input.status ?? "started",
        state: input.state ?? {},
        error: input.error ?? null,
      })
      .returning();
    return toWorkflow(row);
  }

  async updateWorkflow(workflowId: string, update: UpdateWorkflowData): Promise<Workflow | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (update.status !== undefined) set.status = update.status;
    if (update.state !== undefined) set.state = update.state;
    if (update.error !== undefined) set.error = update.error;
    if (update.completedAt !== undefined) set.completedAt = dateOrNull(update.completedAt);
    else if (update.status === "completed" || update.status === "failed") set.completedAt = new Date();
    const [row] = await this.db.update(workflows).set(set).where(eq(workflows.id, workflowId)).returning();
    return row ? toWorkflow(row) : null;
  }

  async listWorkflows(brainId: string, limit = 50): Promise<Workflow[]> {
    return (
      await this.db
        .select()
        .from(workflows)
        .where(eq(workflows.brainId, brainId))
        .orderBy(desc(workflows.createdAt))
        .limit(limit)
    ).map(toWorkflow);
  }

  async createSourceEmbeddings(items: CreateSourceEmbeddingData[]): Promise<SourceEmbedding[]> {
    if (items.length === 0) return [];
    try {
      const rows = await this.db
        .insert(sourceEmbeddings)
        .values(
          items.map((item) => ({
            brainId: item.brainId,
            sourceItemId: item.sourceItemId,
            chunkIndex: item.chunkIndex,
            content: item.content,
            embedding: item.embedding ?? null,
            metadata: item.metadata ?? {},
          })),
        )
        .returning();
      return rows.map(toSourceEmbedding);
    } catch (error) {
      console.warn("Source embedding write skipped. Is pgvector enabled?", error);
      return [];
    }
  }

  async searchBrain(input: {
    brainId: string;
    embedding: number[];
    query: string;
    limit: number;
  }) {
    const terms = input.query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 2);

    const lexicalPattern = `%${terms.join("%")}%`;
    const vectorLiteral = `[${input.embedding.join(",")}]`;

    const lexicalMemoryRows = terms.length
      ? await this.db
          .select()
          .from(memoryObjects)
          .where(
            and(
              eq(memoryObjects.brainId, input.brainId),
              sql`lower(${memoryObjects.name} || ' ' || ${memoryObjects.description} || ' ' || coalesce(${memoryObjects.sourceQuote}, '')) like ${lexicalPattern}`,
            ),
          )
          .limit(input.limit)
      : [];

    const lexicalLoopRows = terms.length
      ? await this.db
          .select()
          .from(openLoops)
          .where(
            and(
              eq(openLoops.brainId, input.brainId),
              sql`lower(${openLoops.title} || ' ' || ${openLoops.description} || ' ' || coalesce(${openLoops.sourceQuote}, '') || ' ' || coalesce(${openLoops.outcome}, '')) like ${lexicalPattern}`,
            ),
          )
          .limit(input.limit)
      : [];

    let vectorRows: Array<{ row: SourceEmbeddingRow; distance: number }> = [];
    if (input.embedding.length > 0) {
      try {
        vectorRows = await this.db
          .select({
            row: sourceEmbeddings,
            distance: sql<number>`${sourceEmbeddings.embedding} <=> ${vectorLiteral}::vector`.as("distance"),
          })
          .from(sourceEmbeddings)
          .where(
            and(
              eq(sourceEmbeddings.brainId, input.brainId),
              sql`${sourceEmbeddings.embedding} is not null`,
            ),
          )
          .orderBy(sql`distance asc`)
          .limit(input.limit);
      } catch (error) {
        console.warn("Vector search skipped. Is pgvector enabled?", error);
      }
    }

    const vectorSourceItemIds = [
      ...new Set(vectorRows.map(({ row }) => row.sourceItemId)),
    ];
    const sourceRows = vectorSourceItemIds.length
      ? await this.db
          .select()
          .from(sourceItems)
          .where(
            and(
              eq(sourceItems.brainId, input.brainId),
              inArray(sourceItems.id, vectorSourceItemIds),
            ),
          )
      : [];
    const sourceById = new Map(sourceRows.map((source) => [source.id, source]));

    return [
      ...vectorRows.flatMap(({ row, distance }) => {
        const sourceItem = sourceById.get(row.sourceItemId);
        if (!sourceItem) return [];
        return [{
          sourceItem: toSourceItem(sourceItem),
          score: 1 - Number(distance ?? 1),
          reason: "vector" as const,
        }];
      }),
      ...lexicalMemoryRows.map((row) => ({
        memoryObject: toMemoryObject(row),
        score: 0.8,
        reason: "lexical" as const,
      })),
      ...lexicalLoopRows.map((row) => ({
        openLoop: toOpenLoop(row),
        score: 0.85,
        reason: "lexical" as const,
      })),
    ]
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit);
  }

  async listPriorities(brainId: string, opts: ListPrioritiesOptions = {}): Promise<Priority[]> {
    const conditions = [eq(priorities.brainId, brainId)];
    if (opts.status) {
      const statusValues = Array.isArray(opts.status) ? opts.status : [opts.status];
      conditions.push(
        statusValues.length === 1
          ? eq(priorities.status, statusValues[0])
          : inArray(priorities.status, statusValues),
      );
    }
    if (opts.horizon) {
      const horizonValues = Array.isArray(opts.horizon) ? opts.horizon : [opts.horizon];
      conditions.push(
        horizonValues.length === 1
          ? eq(priorities.horizon, horizonValues[0])
          : inArray(priorities.horizon, horizonValues),
      );
    }

    const baseQuery = this.db
      .select()
      .from(priorities)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(priorities.setAt));

    const rows = typeof opts.limit === "number" ? await baseQuery.limit(opts.limit) : await baseQuery;
    return rows.map(toPriority);
  }

  async createPriority(input: CreatePriorityData): Promise<Priority> {
    const setAt = input.setAt ? new Date(input.setAt) : new Date();
    const [row] = await this.db
      .insert(priorities)
      .values({
        brainId: input.brainId,
        statement: input.statement,
        setAt,
        setBy: input.setBy ?? "naveen",
        horizon: input.horizon ?? "week",
        status: input.status ?? "active",
        sourceRefs: input.sourceRefs ?? [],
      })
      .returning();
    return toPriority(row);
  }

  async updatePriorityStatus(
    priorityId: string,
    update: UpdatePriorityStatusData,
  ): Promise<Priority | null> {
    const [row] = await this.db
      .update(priorities)
      .set({ status: update.status, updatedAt: new Date() })
      .where(eq(priorities.id, priorityId))
      .returning();
    return row ? toPriority(row) : null;
  }

  async listAgentRuns(brainId: string, limit = 50): Promise<AgentRun[]> {
    return (
      await this.db
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.brainId, brainId))
        .orderBy(desc(agentRuns.startedAt))
        .limit(limit)
    ).map(toAgentRun);
  }

  async createAgentRun(input: CreateAgentRunData): Promise<AgentRun> {
    const [row] = await this.db
      .insert(agentRuns)
      .values({
        brainId: input.brainId,
        sourceItemId: input.sourceItemId ?? null,
        workflowId: input.workflowId ?? null,
        name: input.name,
        status: "running",
        modelProvider: input.modelProvider,
        stepName: input.stepName ?? null,
        inputSummary: input.inputSummary,
        rawInput: input.rawInput ?? {},
      })
      .returning();
    return toAgentRun(row);
  }

  async updateAgentRun(runId: string, update: UpdateAgentRunData): Promise<AgentRun | null> {
    const set: Record<string, unknown> = { status: update.status };
    if (update.outputSummary !== undefined) set.outputSummary = update.outputSummary;
    if (update.rawOutput !== undefined) set.rawOutput = update.rawOutput;
    if (update.modelProvider !== undefined) set.modelProvider = update.modelProvider;
    if (update.error !== undefined) set.error = update.error;
    if (update.completedAt !== undefined) set.completedAt = dateOrNull(update.completedAt);
    else if (update.status !== "running") set.completedAt = new Date();

    const [row] = await this.db.update(agentRuns).set(set).where(eq(agentRuns.id, runId)).returning();
    return row ? toAgentRun(row) : null;
  }

  async listConnectorConfigs(brainId?: string) {
    const query = this.db.select().from(connectorConfigs);
    const rows = brainId
      ? await query.where(eq(connectorConfigs.brainId, brainId)).orderBy(desc(connectorConfigs.createdAt))
      : await query.orderBy(desc(connectorConfigs.createdAt));
    return rows.map(toConnectorConfig);
  }

  async createConnectorConfig(input: CreateConnectorConfigData) {
    const [row] = await this.db
      .insert(connectorConfigs)
      .values({
        brainId: input.brainId,
        connectorType: input.connectorType,
        status: input.status ?? "active",
        config: input.config ?? {},
        credentials: input.credentials ?? null,
        syncEnabled: input.syncEnabled ?? false,
        syncIntervalMinutes: input.syncIntervalMinutes ?? null,
      })
      .returning();
    return toConnectorConfig(row);
  }

  async updateConnectorConfig(configId: string, update: UpdateConnectorConfigData) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (update.status !== undefined) set.status = update.status;
    if (update.config !== undefined) set.config = update.config;
    if (update.credentials !== undefined) set.credentials = update.credentials;
    if (update.syncEnabled !== undefined) set.syncEnabled = update.syncEnabled;
    if (update.syncIntervalMinutes !== undefined) set.syncIntervalMinutes = update.syncIntervalMinutes;
    if (update.lastSyncAt !== undefined) set.lastSyncAt = dateOrNull(update.lastSyncAt);
    if (update.lastSuccessAt !== undefined) set.lastSuccessAt = dateOrNull(update.lastSuccessAt);
    if (update.lastError !== undefined) set.lastError = update.lastError;

    const [row] = await this.db
      .update(connectorConfigs)
      .set(set)
      .where(eq(connectorConfigs.id, configId))
      .returning();
    return row ? toConnectorConfig(row) : null;
  }

  async listConnectorSyncRuns(input: { brainId?: string; connectorConfigId?: string; limit?: number } = {}) {
    const filters = [
      input.brainId ? eq(connectorSyncRuns.brainId, input.brainId) : undefined,
      input.connectorConfigId ? eq(connectorSyncRuns.connectorConfigId, input.connectorConfigId) : undefined,
    ].filter(Boolean);
    const base = this.db.select().from(connectorSyncRuns);
    const rows = await (filters.length
      ? base.where(and(...filters)).orderBy(desc(connectorSyncRuns.startedAt)).limit(input.limit ?? 25)
      : base.orderBy(desc(connectorSyncRuns.startedAt)).limit(input.limit ?? 25));
    return rows.map(toConnectorSyncRun);
  }

  async createConnectorSyncRun(input: CreateConnectorSyncRunData) {
    const [row] = await this.db
      .insert(connectorSyncRuns)
      .values({
        brainId: input.brainId,
        connectorConfigId: input.connectorConfigId ?? null,
        connectorType: input.connectorType,
        status: input.status ?? "started",
        itemsFound: input.itemsFound ?? 0,
        itemsIngested: input.itemsIngested ?? 0,
        itemsSkipped: input.itemsSkipped ?? 0,
        error: input.error ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return toConnectorSyncRun(row);
  }

  async updateConnectorSyncRun(runId: string, update: UpdateConnectorSyncRunData) {
    const set: Record<string, unknown> = {};
    if (update.status !== undefined) set.status = update.status;
    if (update.completedAt !== undefined) set.completedAt = dateOrNull(update.completedAt);
    else if (update.status === "completed" || update.status === "failed") set.completedAt = new Date();
    if (update.itemsFound !== undefined) set.itemsFound = update.itemsFound;
    if (update.itemsIngested !== undefined) set.itemsIngested = update.itemsIngested;
    if (update.itemsSkipped !== undefined) set.itemsSkipped = update.itemsSkipped;
    if (update.error !== undefined) set.error = update.error;
    if (update.metadata !== undefined) set.metadata = update.metadata;

    const [row] = await this.db
      .update(connectorSyncRuns)
      .set(set)
      .where(eq(connectorSyncRuns.id, runId))
      .returning();
    return row ? toConnectorSyncRun(row) : null;
  }

  async listBrainAlerts(input: { brainId?: string; status?: "unread" | "read" | "dismissed"; limit?: number } = {}) {
    const filters = [
      input.brainId ? eq(brainAlerts.brainId, input.brainId) : undefined,
      input.status ? eq(brainAlerts.status, input.status) : undefined,
    ].filter(Boolean);
    const base = this.db.select().from(brainAlerts);
    const rows = await (filters.length
      ? base.where(and(...filters)).orderBy(desc(brainAlerts.createdAt)).limit(input.limit ?? 25)
      : base.orderBy(desc(brainAlerts.createdAt)).limit(input.limit ?? 25));
    return rows.map(toBrainAlert);
  }

  async createBrainAlert(input: CreateBrainAlertData) {
    const [row] = await this.db
      .insert(brainAlerts)
      .values({
        brainId: input.brainId,
        alertType: input.alertType,
        title: input.title,
        description: input.description,
        severity: input.severity ?? "info",
        sourceId: input.sourceId ?? null,
        openLoopId: input.openLoopId ?? null,
        status: input.status ?? "unread",
      })
      .returning();
    return toBrainAlert(row);
  }

  async listBrainEvents(brainId: string, options: { limit?: number } = {}) {
    const rows = await this.db
      .select()
      .from(brainEvents)
      .where(eq(brainEvents.brainId, brainId))
      .orderBy(desc(brainEvents.createdAt))
      .limit(options.limit ?? 100);
    return rows.map(toBrainEvent);
  }

  async createBrainEvent(input: CreateBrainEventData) {
    const [row] = await this.db
      .insert(brainEvents)
      .values({
        brainId: input.brainId,
        eventType: input.eventType,
        sourceSystem: input.sourceSystem ?? null,
        payload: input.payload ?? {},
      })
      .returning();
    return toBrainEvent(row);
  }

  async listNotetakerCalendars(input: { brainId?: string; status?: "connected" | "error" | "disabled" } = {}) {
    const filters = [
      input.brainId ? eq(notetakerCalendars.brainId, input.brainId) : undefined,
      input.status ? eq(notetakerCalendars.status, input.status) : undefined,
    ].filter(Boolean);
    const base = this.db.select().from(notetakerCalendars);
    const rows = await (filters.length
      ? base.where(and(...filters)).orderBy(desc(notetakerCalendars.createdAt))
      : base.orderBy(desc(notetakerCalendars.createdAt)));
    return rows.map(toNotetakerCalendar);
  }

  async createNotetakerCalendar(input: CreateNotetakerCalendarData) {
    const [row] = await this.db
      .insert(notetakerCalendars)
      .values({
        brainId: input.brainId,
        userId: input.userId ?? null,
        provider: input.provider,
        recallCalendarId: input.recallCalendarId ?? null,
        externalCalendarId: input.externalCalendarId ?? null,
        status: input.status ?? "connected",
        autoJoinEnabled: input.autoJoinEnabled ?? true,
        autoJoinMode: input.autoJoinMode ?? "all_calls",
        config: input.config ?? {},
        lastSyncAt: dateOrNull(input.lastSyncAt),
        lastError: input.lastError ?? null,
      })
      .returning();
    return toNotetakerCalendar(row);
  }

  async updateNotetakerCalendar(calendarId: string, update: UpdateNotetakerCalendarData) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (update.recallCalendarId !== undefined) set.recallCalendarId = update.recallCalendarId;
    if (update.externalCalendarId !== undefined) set.externalCalendarId = update.externalCalendarId;
    if (update.status !== undefined) set.status = update.status;
    if (update.autoJoinEnabled !== undefined) set.autoJoinEnabled = update.autoJoinEnabled;
    if (update.autoJoinMode !== undefined) set.autoJoinMode = update.autoJoinMode;
    if (update.config !== undefined) set.config = update.config;
    if (update.lastSyncAt !== undefined) set.lastSyncAt = dateOrNull(update.lastSyncAt);
    if (update.lastError !== undefined) set.lastError = update.lastError;
    const [row] = await this.db
      .update(notetakerCalendars)
      .set(set)
      .where(eq(notetakerCalendars.id, calendarId))
      .returning();
    return row ? toNotetakerCalendar(row) : null;
  }

  async deleteNotetakerCalendar(calendarId: string) {
    const rows = await this.db
      .delete(notetakerCalendars)
      .where(eq(notetakerCalendars.id, calendarId))
      .returning({ id: notetakerCalendars.id });
    return rows.length > 0;
  }

  async listNotetakerMeetings(
    input: { brainId?: string; calendarId?: string; from?: string; to?: string; limit?: number } = {},
  ) {
    const from = dateOrNull(input.from);
    const to = dateOrNull(input.to);
    const filters = [
      input.brainId ? eq(notetakerMeetings.brainId, input.brainId) : undefined,
      input.calendarId ? eq(notetakerMeetings.notetakerCalendarId, input.calendarId) : undefined,
      from ? gte(notetakerMeetings.startTime, from) : undefined,
      to ? lte(notetakerMeetings.startTime, to) : undefined,
    ].filter(Boolean);
    const base = this.db.select().from(notetakerMeetings);
    const rows = await (filters.length
      ? base.where(and(...filters)).orderBy(notetakerMeetings.startTime).limit(input.limit ?? 100)
      : base.orderBy(notetakerMeetings.startTime).limit(input.limit ?? 100));
    return rows.map(toNotetakerMeeting);
  }

  async createNotetakerMeeting(input: CreateNotetakerMeetingData) {
    const [row] = await this.db
      .insert(notetakerMeetings)
      .values({
        brainId: input.brainId,
        notetakerCalendarId: input.notetakerCalendarId ?? null,
        recallCalendarEventId: input.recallCalendarEventId ?? null,
        recallBotId: input.recallBotId ?? null,
        externalEventId: input.externalEventId ?? null,
        provider: input.provider,
        title: input.title,
        meetingUrl: input.meetingUrl ?? null,
        startTime: dateOrNull(input.startTime) ?? new Date(input.startTime),
        endTime: dateOrNull(input.endTime) ?? new Date(input.endTime),
        participants: input.participants ?? [],
        autoJoinDecision: input.autoJoinDecision ?? "needs_review",
        autoJoinReason: input.autoJoinReason ?? null,
        botStatus: input.botStatus ?? "not_scheduled",
        sourceItemId: input.sourceItemId ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    return toNotetakerMeeting(row);
  }

  async updateNotetakerMeeting(meetingId: string, update: UpdateNotetakerMeetingData) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (update.recallCalendarEventId !== undefined) set.recallCalendarEventId = update.recallCalendarEventId;
    if (update.recallBotId !== undefined) set.recallBotId = update.recallBotId;
    if (update.title !== undefined) set.title = update.title;
    if (update.meetingUrl !== undefined) set.meetingUrl = update.meetingUrl;
    if (update.startTime !== undefined) set.startTime = dateOrNull(update.startTime);
    if (update.endTime !== undefined) set.endTime = dateOrNull(update.endTime);
    if (update.participants !== undefined) set.participants = update.participants;
    if (update.autoJoinDecision !== undefined) set.autoJoinDecision = update.autoJoinDecision;
    if (update.autoJoinReason !== undefined) set.autoJoinReason = update.autoJoinReason;
    if (update.botStatus !== undefined) set.botStatus = update.botStatus;
    if (update.sourceItemId !== undefined) set.sourceItemId = update.sourceItemId;
    if (update.metadata !== undefined) set.metadata = update.metadata;
    const [row] = await this.db
      .update(notetakerMeetings)
      .set(set)
      .where(eq(notetakerMeetings.id, meetingId))
      .returning();
    return row ? toNotetakerMeeting(row) : null;
  }

  async listNotetakerEvents(input: { brainId?: string; providerEventId?: string; limit?: number } = {}) {
    const filters = [
      input.brainId ? eq(notetakerEvents.brainId, input.brainId) : undefined,
      input.providerEventId ? eq(notetakerEvents.providerEventId, input.providerEventId) : undefined,
    ].filter(Boolean);
    const base = this.db.select().from(notetakerEvents);
    const rows = await (filters.length
      ? base.where(and(...filters)).orderBy(desc(notetakerEvents.createdAt)).limit(input.limit ?? 100)
      : base.orderBy(desc(notetakerEvents.createdAt)).limit(input.limit ?? 100));
    return rows.map(toNotetakerEvent);
  }

  async createNotetakerEvent(input: CreateNotetakerEventData) {
    const [row] = await this.db
      .insert(notetakerEvents)
      .values({
        brainId: input.brainId,
        notetakerMeetingId: input.notetakerMeetingId ?? null,
        providerEventId: input.providerEventId ?? null,
        eventType: input.eventType,
        payload: input.payload ?? {},
        processedAt: dateOrNull(input.processedAt),
      })
      .returning();
    return toNotetakerEvent(row);
  }

  async updateNotetakerEvent(eventId: string, update: UpdateNotetakerEventData) {
    const set: Record<string, unknown> = {};
    if (update.notetakerMeetingId !== undefined) set.notetakerMeetingId = update.notetakerMeetingId;
    if (update.processedAt !== undefined) set.processedAt = dateOrNull(update.processedAt);
    const [row] = await this.db
      .update(notetakerEvents)
      .set(set)
      .where(eq(notetakerEvents.id, eventId))
      .returning();
    return row ? toNotetakerEvent(row) : null;
  }

  async createMarketingContentItem(input: CreateMarketingContentItemData): Promise<MarketingContentItem> {
    const [row] = await this.db.insert(marketingContentItems).values({
      brainId: input.brainId,
      sourceItemId: input.sourceItemId ?? null,
      sourcePlatform: input.sourcePlatform,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl ?? null,
      sourceExternalId: input.sourceExternalId ?? null,
      sourceOwner: input.sourceOwner ?? null,
      sourceDate: dateOrNull(input.sourceDate),
      sourceConfidentiality: input.sourceConfidentiality ?? "internal",
      rawText: input.rawText,
      cleanedSummary: input.cleanedSummary ?? null,
      contentSafeSummary: input.contentSafeSummary ?? null,
      requiresRedaction: input.requiresRedaction ?? true,
      approvedForContent: input.approvedForContent ?? false,
      metadata: input.metadata ?? {},
    }).returning();
    return toMarketingContentItem(row);
  }

  async updateMarketingContentItem(contentItemId: string, update: UpdateMarketingContentItemData): Promise<MarketingContentItem | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (update.cleanedSummary !== undefined) set.cleanedSummary = update.cleanedSummary;
    if (update.contentSafeSummary !== undefined) set.contentSafeSummary = update.contentSafeSummary;
    if (update.sourceConfidentiality !== undefined) set.sourceConfidentiality = update.sourceConfidentiality;
    if (update.requiresRedaction !== undefined) set.requiresRedaction = update.requiresRedaction;
    if (update.approvedForContent !== undefined) set.approvedForContent = update.approvedForContent;
    if (update.metadata !== undefined) set.metadata = update.metadata;
    const [row] = await this.db.update(marketingContentItems).set(set).where(eq(marketingContentItems.id, contentItemId)).returning();
    return row ? toMarketingContentItem(row) : null;
  }

  async listMarketingContentItems(brainId: string, options: ListOptions = {}): Promise<MarketingContentItem[]> {
    return (await this.db.select().from(marketingContentItems).where(eq(marketingContentItems.brainId, brainId)).orderBy(desc(marketingContentItems.createdAt)).limit(options.limit ?? 100)).map(toMarketingContentItem);
  }

  async getMarketingContentItem(contentItemId: string): Promise<MarketingContentItem | null> {
    const [row] = await this.db.select().from(marketingContentItems).where(eq(marketingContentItems.id, contentItemId)).limit(1);
    return row ? toMarketingContentItem(row) : null;
  }

  async createMarketingContentInsights(items: CreateMarketingContentInsightData[]): Promise<MarketingContentInsight[]> {
    if (items.length === 0) return [];
    const rows = await this.db.insert(marketingContentInsights).values(items.map((item) => ({
      brainId: item.brainId,
      contentItemId: item.contentItemId,
      rawInsight: item.rawInsight,
      contentSafeInsight: item.contentSafeInsight,
      sensitivityLevel: item.sensitivityLevel ?? "medium",
      suggestedPillar: item.suggestedPillar ?? null,
      suggestedChannels: item.suggestedChannels ?? [],
      approvedForContent: item.approvedForContent ?? false,
      metadata: item.metadata ?? {},
    }))).returning();
    return rows.map(toMarketingContentInsight);
  }

  async updateMarketingContentInsight(insightId: string, update: UpdateMarketingContentInsightData): Promise<MarketingContentInsight | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (update.contentSafeInsight !== undefined) set.contentSafeInsight = update.contentSafeInsight;
    if (update.sensitivityLevel !== undefined) set.sensitivityLevel = update.sensitivityLevel;
    if (update.suggestedPillar !== undefined) set.suggestedPillar = update.suggestedPillar;
    if (update.suggestedChannels !== undefined) set.suggestedChannels = update.suggestedChannels;
    if (update.approvedForContent !== undefined) set.approvedForContent = update.approvedForContent;
    if (update.metadata !== undefined) set.metadata = update.metadata;
    const [row] = await this.db.update(marketingContentInsights).set(set).where(eq(marketingContentInsights.id, insightId)).returning();
    return row ? toMarketingContentInsight(row) : null;
  }

  async listMarketingContentInsights(brainId: string, options: ListOptions & { approvedOnly?: boolean } = {}): Promise<MarketingContentInsight[]> {
    const conditions = [eq(marketingContentInsights.brainId, brainId)];
    if (options.approvedOnly) conditions.push(eq(marketingContentInsights.approvedForContent, true));
    return (await this.db.select().from(marketingContentInsights).where(and(...conditions)).orderBy(desc(marketingContentInsights.createdAt)).limit(options.limit ?? 100)).map(toMarketingContentInsight);
  }

  async getMarketingContentInsight(insightId: string): Promise<MarketingContentInsight | null> {
    const [row] = await this.db.select().from(marketingContentInsights).where(eq(marketingContentInsights.id, insightId)).limit(1);
    return row ? toMarketingContentInsight(row) : null;
  }

  async createMarketingChannelPosts(items: CreateMarketingChannelPostData[]): Promise<MarketingChannelPost[]> {
    if (items.length === 0) return [];
    const rows = await this.db.insert(marketingChannelPosts).values(items.map((item) => ({
      brainId: item.brainId,
      contentItemId: item.contentItemId ?? null,
      contentInsightId: item.contentInsightId ?? null,
      channel: item.channel,
      status: item.status ?? "draft",
      bodyText: item.bodyText,
      plannedPostDate: dateOrNull(item.plannedPostDate),
      postingWindow: item.postingWindow ?? null,
      scheduledAt: dateOrNull(item.scheduledAt),
      publishedAt: dateOrNull(item.publishedAt),
      liveUrl: item.liveUrl ?? null,
      schedulerProvider: item.schedulerProvider ?? null,
      schedulerPostId: item.schedulerPostId ?? null,
      campaignTag: item.campaignTag ?? null,
      pillar: item.pillar ?? null,
      formatType: item.formatType ?? null,
      hookType: item.hookType ?? null,
      targetIcp: item.targetIcp ?? null,
      funnelStage: item.funnelStage ?? null,
      experimentTag: item.experimentTag ?? null,
      requiresReview: item.requiresReview ?? true,
      sensitivityLevel: item.sensitivityLevel ?? "medium",
      approvedBy: item.approvedBy ?? null,
      approvedAt: dateOrNull(item.approvedAt),
      revisionReason: item.revisionReason ?? null,
      safetyCheckStatus: item.safetyCheckStatus ?? "not_run",
      safetyCheckReason: item.safetyCheckReason ?? null,
      isExemplar: item.isExemplar ?? false,
      performanceTag: item.performanceTag ?? null,
      utmSource: item.utmSource ?? null,
      utmMedium: item.utmMedium ?? null,
      utmCampaign: item.utmCampaign ?? null,
      utmContent: item.utmContent ?? null,
      metadata: item.metadata ?? {},
    }))).returning();
    return rows.map(toMarketingChannelPost);
  }

  async updateMarketingChannelPost(postId: string, update: UpdateMarketingChannelPostData): Promise<MarketingChannelPost | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    const copy = (key: keyof UpdateMarketingChannelPostData, column = key) => {
      if (update[key] !== undefined) set[column] = update[key];
    };
    copy("status"); copy("bodyText"); copy("plannedPostDate"); copy("postingWindow"); copy("scheduledAt"); copy("publishedAt");
    copy("liveUrl"); copy("schedulerProvider"); copy("schedulerPostId"); copy("campaignTag"); copy("pillar"); copy("formatType");
    copy("hookType"); copy("targetIcp"); copy("funnelStage"); copy("experimentTag"); copy("requiresReview"); copy("sensitivityLevel");
    copy("approvedBy"); copy("revisionReason"); copy("safetyCheckStatus"); copy("safetyCheckReason"); copy("isExemplar");
    copy("performanceTag"); copy("utmSource"); copy("utmMedium"); copy("utmCampaign"); copy("utmContent"); copy("metadata");
    if (update.approvedAt !== undefined) set.approvedAt = dateOrNull(update.approvedAt);
    if (update.plannedPostDate !== undefined) set.plannedPostDate = dateOrNull(update.plannedPostDate);
    if (update.scheduledAt !== undefined) set.scheduledAt = dateOrNull(update.scheduledAt);
    if (update.publishedAt !== undefined) set.publishedAt = dateOrNull(update.publishedAt);
    const [row] = await this.db.update(marketingChannelPosts).set(set).where(eq(marketingChannelPosts.id, postId)).returning();
    return row ? toMarketingChannelPost(row) : null;
  }

  async listMarketingChannelPosts(brainId: string, options: ListOptions & { status?: MarketingChannelPost["status"] | MarketingChannelPost["status"][]; exemplarOnly?: boolean } = {}): Promise<MarketingChannelPost[]> {
    const conditions = [eq(marketingChannelPosts.brainId, brainId)];
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      conditions.push(statuses.length === 1 ? eq(marketingChannelPosts.status, statuses[0]) : inArray(marketingChannelPosts.status, statuses));
    }
    if (options.exemplarOnly) conditions.push(eq(marketingChannelPosts.isExemplar, true));
    return (await this.db.select().from(marketingChannelPosts).where(and(...conditions)).orderBy(desc(marketingChannelPosts.createdAt)).limit(options.limit ?? 100)).map(toMarketingChannelPost);
  }

  async getMarketingChannelPost(postId: string): Promise<MarketingChannelPost | null> {
    const [row] = await this.db.select().from(marketingChannelPosts).where(eq(marketingChannelPosts.id, postId)).limit(1);
    return row ? toMarketingChannelPost(row) : null;
  }

  async createMarketingPostMetric(input: CreateMarketingPostMetricData): Promise<MarketingPostMetric> {
    const [row] = await this.db.insert(marketingPostMetrics).values({
      brainId: input.brainId,
      channelPostId: input.channelPostId,
      metricDate: dateOrNull(input.metricDate) ?? new Date(input.metricDate),
      impressions: input.impressions ?? 0,
      reactions: input.reactions ?? 0,
      comments: input.comments ?? 0,
      shares: input.shares ?? 0,
      clicks: input.clicks ?? 0,
      saves: input.saves ?? 0,
      follows: input.follows ?? 0,
      rawMetrics: input.rawMetrics ?? {},
    }).returning();
    return toMarketingPostMetric(row);
  }

  async listMarketingPostMetrics(brainId: string, options: ListOptions = {}): Promise<MarketingPostMetric[]> {
    return (await this.db.select().from(marketingPostMetrics).where(eq(marketingPostMetrics.brainId, brainId)).orderBy(desc(marketingPostMetrics.metricDate)).limit(options.limit ?? 500)).map(toMarketingPostMetric);
  }

  async createMarketingEvent(input: CreateMarketingEventData): Promise<MarketingEvent> {
    const [row] = await this.db.insert(marketingEvents).values({
      brainId: input.brainId,
      channelPostId: input.channelPostId ?? null,
      eventType: input.eventType,
      eventSource: input.eventSource,
      eventAt: dateOrNull(input.eventAt) ?? new Date(),
      description: input.description,
      contactName: input.contactName ?? null,
      companyName: input.companyName ?? null,
      value: input.value === undefined || input.value === null ? null : input.value.toFixed(2),
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,
      utmContent: input.utmContent ?? null,
      attributionConfidence: input.attributionConfidence ?? "unknown",
      metadata: input.metadata ?? {},
    }).returning();
    return toMarketingEvent(row);
  }

  async listMarketingEvents(brainId: string, options: ListOptions = {}): Promise<MarketingEvent[]> {
    return (await this.db.select().from(marketingEvents).where(eq(marketingEvents.brainId, brainId)).orderBy(desc(marketingEvents.eventAt)).limit(options.limit ?? 200)).map(toMarketingEvent);
  }

  async createMarketingExperiment(input: CreateMarketingExperimentData): Promise<MarketingExperiment> {
    const [row] = await this.db.insert(marketingExperiments).values({
      brainId: input.brainId,
      tag: input.tag,
      title: input.title,
      hypothesis: input.hypothesis,
      status: input.status ?? "planned",
      startedAt: dateOrNull(input.startedAt),
      endedAt: dateOrNull(input.endedAt),
      metadata: input.metadata ?? {},
    }).returning();
    return toMarketingExperiment(row);
  }

  async listMarketingExperiments(brainId: string, options: ListOptions = {}): Promise<MarketingExperiment[]> {
    return (await this.db.select().from(marketingExperiments).where(eq(marketingExperiments.brainId, brainId)).orderBy(desc(marketingExperiments.createdAt)).limit(options.limit ?? 100)).map(toMarketingExperiment);
  }

  async createMarketingWeeklyReport(input: CreateMarketingWeeklyReportData): Promise<MarketingWeeklyReport> {
    const [row] = await this.db.insert(marketingWeeklyReports).values({
      brainId: input.brainId,
      weekStart: dateOrNull(input.weekStart) ?? new Date(input.weekStart),
      weekEnd: dateOrNull(input.weekEnd) ?? new Date(input.weekEnd),
      publishedCount: input.publishedCount,
      qualitativeOnly: input.qualitativeOnly,
      summary: input.summary,
      markdown: input.markdown,
      recommendedExperiments: input.recommendedExperiments ?? [],
      metadata: input.metadata ?? {},
    }).returning();
    return toMarketingWeeklyReport(row);
  }

  async listMarketingWeeklyReports(brainId: string, options: ListOptions = {}): Promise<MarketingWeeklyReport[]> {
    return (await this.db.select().from(marketingWeeklyReports).where(eq(marketingWeeklyReports.brainId, brainId)).orderBy(desc(marketingWeeklyReports.weekStart)).limit(options.limit ?? 50)).map(toMarketingWeeklyReport);
  }

  async createMarketingLlmUsage(input: CreateMarketingLlmUsageData): Promise<MarketingLlmUsage> {
    const [row] = await this.db.insert(marketingLlmUsage).values({
      brainId: input.brainId,
      jobType: input.jobType,
      modelProvider: input.modelProvider,
      model: input.model,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      estimatedCostUsd: (input.estimatedCostUsd ?? 0).toFixed(4),
      metadata: input.metadata ?? {},
    }).returning();
    return toMarketingLlmUsage(row);
  }

  async listMarketingLlmUsage(brainId: string, options: ListOptions = {}): Promise<MarketingLlmUsage[]> {
    return (await this.db.select().from(marketingLlmUsage).where(eq(marketingLlmUsage.brainId, brainId)).orderBy(desc(marketingLlmUsage.createdAt)).limit(options.limit ?? 500)).map(toMarketingLlmUsage);
  }
}
