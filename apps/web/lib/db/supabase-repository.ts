import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type {
  AgentRun,
  Brain,
  MemoryObject,
  ModelProvider,
  OpenLoop,
  Relationship,
  SourceEmbedding,
  SourceItem,
  Workflow,
} from "@arvya/core";
import type { Db } from "./client";
import {
  agentRuns,
  brainAlerts,
  brains,
  connectorConfigs,
  connectorSyncRuns,
  memoryObjects,
  notetakerCalendars,
  notetakerEvents,
  notetakerMeetings,
  openLoops,
  relationships,
  sourceEmbeddings,
  sourceItems,
  workflows,
  type AgentRunRow,
  type BrainAlertRow,
  type BrainRow,
  type ConnectorConfigRow,
  type ConnectorSyncRunRow,
  type MemoryObjectRow,
  type NotetakerCalendarRow,
  type NotetakerEventRow,
  type NotetakerMeetingRow,
  type OpenLoopRow,
  type RelationshipRow,
  type SourceEmbeddingRow,
  type SourceItemRow,
  type WorkflowRow,
} from "./schema";
import type {
  BrainRepository,
  CreateAgentRunData,
  CreateBrainAlertData,
  CreateBrainData,
  CreateConnectorConfigData,
  CreateConnectorSyncRunData,
  CreateMemoryObjectData,
  CreateNotetakerCalendarData,
  CreateNotetakerEventData,
  CreateNotetakerMeetingData,
  CreateOpenLoopData,
  CreateRelationshipData,
  CreateSourceData,
  CreateSourceEmbeddingData,
  CreateWorkflowData,
  UpdateAgentRunData,
  UpdateConnectorConfigData,
  UpdateConnectorSyncRunData,
  UpdateMemoryObjectData,
  UpdateNotetakerCalendarData,
  UpdateNotetakerEventData,
  UpdateNotetakerMeetingData,
  UpdateOpenLoopData,
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

  async listSourceItems(brainId: string): Promise<SourceItem[]> {
    return (
      await this.db
        .select()
        .from(sourceItems)
        .where(eq(sourceItems.brainId, brainId))
        .orderBy(desc(sourceItems.createdAt))
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

  async listMemoryObjects(brainId: string): Promise<MemoryObject[]> {
    return (
      await this.db
        .select()
        .from(memoryObjects)
        .where(eq(memoryObjects.brainId, brainId))
        .orderBy(desc(memoryObjects.createdAt))
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

  async listRelationships(brainId: string): Promise<Relationship[]> {
    return (
      await this.db
        .select()
        .from(relationships)
        .where(eq(relationships.brainId, brainId))
        .orderBy(desc(relationships.createdAt))
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

  async listOpenLoops(brainId: string): Promise<OpenLoop[]> {
    return (
      await this.db
        .select()
        .from(openLoops)
        .where(eq(openLoops.brainId, brainId))
        .orderBy(desc(openLoops.createdAt))
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

  async listWorkflows(brainId: string): Promise<Workflow[]> {
    return (
      await this.db
        .select()
        .from(workflows)
        .where(eq(workflows.brainId, brainId))
        .orderBy(desc(workflows.createdAt))
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

    const sourceRows = vectorRows.length
      ? await this.db
          .select()
          .from(sourceItems)
          .where(eq(sourceItems.brainId, input.brainId))
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
}
