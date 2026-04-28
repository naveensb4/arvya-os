import {
  boolean,
  integer,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const brainKindEnum = pgEnum("brain_kind", [
  "company",
  "sell_side",
  "buy_side",
]);

export const sourceTypeEnum = pgEnum("source_type", [
  "transcript",
  "email",
  "note",
  "document",
  "github",
  "strategy_output",
  "web",
  "manual",
]);

export const memoryKindEnum = pgEnum("memory_kind", [
  "person",
  "company",
  "fact",
  "event",
  "decision",
  "insight",
  "risk",
  "question",
  "commitment",
  "task",
  "product_insight",
  "marketing_idea",
  "outcome",
  "investor_feedback",
  "customer_feedback",
  "advisor_feedback",
  "custom",
]);

export const memoryStatusEnum = pgEnum("memory_status", [
  "open",
  "in_progress",
  "waiting",
  "done",
  "closed",
  "snoozed",
]);

export const openLoopTypeEnum = pgEnum("open_loop_type", [
  "follow_up",
  "intro",
  "product",
  "investor",
  "sales",
  "marketing",
  "engineering",
  "deal",
  "diligence",
  "crm",
  "scheduling",
  "task",
  "investor_ask",
  "customer_ask",
  "strategic_question",
  "other",
]);

export const openLoopStatusEnum = pgEnum("open_loop_status", [
  "needs_review",
  "open",
  "in_progress",
  "waiting",
  "done",
  "dismissed",
  "closed",
]);

export const openLoopPriorityEnum = pgEnum("open_loop_priority", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const workflowStatusEnum = pgEnum("workflow_status", [
  "started",
  "running",
  "waiting_for_human",
  "completed",
  "failed",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const modelProviderEnum = pgEnum("model_provider", [
  "local",
  "anthropic",
  "openai",
]);

export const connectorTypeEnum = pgEnum("connector_type", [
  "google_drive",
  "gmail",
  "outlook",
  "recall",
  "mock",
]);

export const connectorStatusEnum = pgEnum("connector_status", [
  "active",
  "connected",
  "paused",
  "error",
]);

export const connectorSyncRunStatusEnum = pgEnum("connector_sync_run_status", [
  "started",
  "completed",
  "failed",
]);

export const brainAlertSeverityEnum = pgEnum("brain_alert_severity", [
  "info",
  "warning",
  "error",
  "critical",
]);

export const brainAlertStatusEnum = pgEnum("brain_alert_status", [
  "unread",
  "read",
  "dismissed",
]);

export const prioritySetByEnum = pgEnum("priority_set_by", [
  "naveen",
  "pb",
  "system",
]);

export const priorityHorizonEnum = pgEnum("priority_horizon", [
  "today",
  "week",
  "sprint",
  "quarter",
]);

export const priorityStatusEnum = pgEnum("priority_status", [
  "active",
  "achieved",
  "abandoned",
]);

export const notetakerProviderEnum = pgEnum("notetaker_provider", [
  "google_calendar",
  "outlook_calendar",
]);

export const notetakerCalendarStatusEnum = pgEnum("notetaker_calendar_status", [
  "connected",
  "error",
  "disabled",
]);

export const notetakerAutoJoinModeEnum = pgEnum("notetaker_auto_join_mode", [
  "all_calls",
  "external_only",
  "arvya_related_only",
  "manual_only",
]);

export const notetakerAutoJoinDecisionEnum = pgEnum("notetaker_auto_join_decision", [
  "join",
  "skip",
  "needs_review",
]);

export const notetakerBotStatusEnum = pgEnum("notetaker_bot_status", [
  "not_scheduled",
  "scheduled",
  "joining",
  "in_call",
  "completed",
  "failed",
  "canceled",
]);

export const brains = pgTable("brains", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  kind: brainKindEnum("kind").notNull().default("company"),
  thesis: text("thesis").notNull().default(""),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const brainTemplates = pgTable("brain_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: brainKindEnum("kind").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  thesisStarter: text("thesis_starter").notNull().default(""),
  defaultSourceTypes: jsonb("default_source_types").notNull().default([]),
  defaultWorkflows: jsonb("default_workflows").notNull().default([]),
  memoryLensOrder: jsonb("memory_lens_order").notNull().default([]),
  properties: jsonb("properties").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sourceItems = pgTable(
  "source_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    type: sourceTypeEnum("type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    externalUri: text("external_uri"),
    storagePath: text("storage_path"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("source_items_brain_id_idx").on(table.brainId),
    index("source_items_brain_created_at_idx").on(table.brainId, table.createdAt),
  ],
);

export const memoryObjects = pgTable(
  "memory_objects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id").references(() => sourceItems.id, {
      onDelete: "set null",
    }),
    objectType: memoryKindEnum("object_type").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    properties: jsonb("properties").notNull().default({}),
    sourceQuote: text("source_quote"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    status: memoryStatusEnum("status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("memory_objects_brain_id_idx").on(table.brainId),
    index("memory_objects_brain_created_at_idx").on(table.brainId, table.createdAt),
    index("memory_objects_source_item_id_idx").on(table.sourceItemId),
    index("memory_objects_type_idx").on(table.objectType),
    index("memory_objects_status_idx").on(table.status),
  ],
);

export const openLoops = pgTable(
  "open_loops",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id").references(() => sourceItems.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    loopType: openLoopTypeEnum("loop_type").notNull().default("other"),
    owner: text("owner"),
    status: openLoopStatusEnum("status").notNull().default("needs_review"),
    priority: openLoopPriorityEnum("priority").notNull().default("medium"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    suggestedAction: text("suggested_action"),
    suggestedFollowUpEmail: jsonb("suggested_follow_up_email"),
    requiresHumanApproval: boolean("requires_human_approval").notNull().default(false),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    outcome: text("outcome"),
    sourceQuote: text("source_quote"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    properties: jsonb("properties").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("open_loops_brain_id_idx").on(table.brainId),
    index("open_loops_brain_created_at_idx").on(table.brainId, table.createdAt),
    index("open_loops_source_item_id_idx").on(table.sourceItemId),
    index("open_loops_status_idx").on(table.status),
    index("open_loops_priority_idx").on(table.priority),
  ],
);

export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    fromObjectId: uuid("from_object_id")
      .notNull()
      .references(() => memoryObjects.id, { onDelete: "cascade" }),
    toObjectId: uuid("to_object_id")
      .notNull()
      .references(() => memoryObjects.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type").notNull(),
    sourceItemId: uuid("source_item_id").references(() => sourceItems.id, {
      onDelete: "set null",
    }),
    sourceQuote: text("source_quote"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    properties: jsonb("properties").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("relationships_brain_id_idx").on(table.brainId),
    index("relationships_brain_created_at_idx").on(table.brainId, table.createdAt),
    index("relationships_from_object_id_idx").on(table.fromObjectId),
    index("relationships_to_object_id_idx").on(table.toObjectId),
  ],
);

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id").references(() => sourceItems.id, {
      onDelete: "set null",
    }),
    workflowType: text("workflow_type").notNull(),
    status: workflowStatusEnum("status").notNull().default("started"),
    state: jsonb("state").notNull().default({}),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("workflows_brain_id_idx").on(table.brainId),
    index("workflows_brain_created_at_idx").on(table.brainId, table.createdAt),
    index("workflows_source_item_id_idx").on(table.sourceItemId),
    index("workflows_status_idx").on(table.status),
  ],
);

export const sourceEmbeddings = pgTable(
  "source_embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "cascade" }),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("source_embeddings_source_item_id_idx").on(table.sourceItemId),
    index("source_embeddings_brain_id_idx").on(table.brainId),
    index("source_embeddings_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id").references(() => sourceItems.id, {
      onDelete: "set null",
    }),
    workflowId: uuid("workflow_id").references(() => workflows.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    status: agentRunStatusEnum("status").notNull().default("queued"),
    modelProvider: modelProviderEnum("model_provider").notNull().default("local"),
    stepName: text("step_name"),
    inputSummary: text("input_summary").notNull().default(""),
    outputSummary: text("output_summary").notNull().default(""),
    rawInput: jsonb("raw_input").notNull().default({}),
    rawOutput: jsonb("raw_output").notNull().default({}),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("agent_runs_brain_id_idx").on(table.brainId),
    index("agent_runs_brain_started_at_idx").on(table.brainId, table.startedAt),
    index("agent_runs_source_item_id_idx").on(table.sourceItemId),
    index("agent_runs_workflow_id_idx").on(table.workflowId),
    index("agent_runs_started_at_idx").on(table.startedAt),
  ],
);

export const connectorConfigs = pgTable(
  "connector_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    connectorType: connectorTypeEnum("connector_type").notNull(),
    status: connectorStatusEnum("status").notNull().default("active"),
    config: jsonb("config").notNull().default({}),
    credentials: jsonb("credentials"),
    syncEnabled: boolean("sync_enabled").notNull().default(false),
    syncIntervalMinutes: integer("sync_interval_minutes"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("connector_configs_brain_id_idx").on(table.brainId),
    index("connector_configs_sync_enabled_idx").on(table.syncEnabled),
  ],
);

export const connectorSyncRuns = pgTable(
  "connector_sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    connectorConfigId: uuid("connector_config_id").references(() => connectorConfigs.id, {
      onDelete: "set null",
    }),
    connectorType: connectorTypeEnum("connector_type").notNull(),
    status: connectorSyncRunStatusEnum("status").notNull().default("started"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    itemsFound: integer("items_found").notNull().default(0),
    itemsIngested: integer("items_ingested").notNull().default(0),
    itemsSkipped: integer("items_skipped").notNull().default(0),
    error: text("error"),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => [
    index("connector_sync_runs_brain_id_idx").on(table.brainId),
    index("connector_sync_runs_connector_config_id_idx").on(table.connectorConfigId),
    index("connector_sync_runs_started_at_idx").on(table.startedAt),
  ],
);

export const brainAlerts = pgTable(
  "brain_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    alertType: text("alert_type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: brainAlertSeverityEnum("severity").notNull().default("info"),
    sourceId: uuid("source_id").references(() => sourceItems.id, { onDelete: "set null" }),
    openLoopId: uuid("open_loop_id").references(() => openLoops.id, { onDelete: "set null" }),
    status: brainAlertStatusEnum("status").notNull().default("unread"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_alerts_brain_id_idx").on(table.brainId),
    index("brain_alerts_status_idx").on(table.status),
    index("brain_alerts_created_at_idx").on(table.createdAt),
  ],
);

export const notetakerCalendars = pgTable(
  "notetaker_calendars",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    provider: notetakerProviderEnum("provider").notNull(),
    recallCalendarId: text("recall_calendar_id"),
    externalCalendarId: text("external_calendar_id"),
    status: notetakerCalendarStatusEnum("status").notNull().default("connected"),
    autoJoinEnabled: boolean("auto_join_enabled").notNull().default(true),
    autoJoinMode: notetakerAutoJoinModeEnum("auto_join_mode").notNull().default("all_calls"),
    config: jsonb("config").notNull().default({}),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notetaker_calendars_brain_id_idx").on(table.brainId),
    index("notetaker_calendars_recall_calendar_id_idx").on(table.recallCalendarId),
    index("notetaker_calendars_external_calendar_id_idx").on(table.externalCalendarId),
  ],
);

export const notetakerMeetings = pgTable(
  "notetaker_meetings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    notetakerCalendarId: uuid("notetaker_calendar_id").references(() => notetakerCalendars.id, {
      onDelete: "set null",
    }),
    recallCalendarEventId: text("recall_calendar_event_id"),
    recallBotId: text("recall_bot_id"),
    externalEventId: text("external_event_id"),
    provider: notetakerProviderEnum("provider").notNull(),
    title: text("title").notNull(),
    meetingUrl: text("meeting_url"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    participants: jsonb("participants").notNull().default([]),
    autoJoinDecision: notetakerAutoJoinDecisionEnum("auto_join_decision").notNull().default("needs_review"),
    autoJoinReason: text("auto_join_reason"),
    botStatus: notetakerBotStatusEnum("bot_status").notNull().default("not_scheduled"),
    sourceItemId: uuid("source_item_id").references(() => sourceItems.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notetaker_meetings_brain_id_idx").on(table.brainId),
    index("notetaker_meetings_calendar_id_idx").on(table.notetakerCalendarId),
    index("notetaker_meetings_recall_event_id_idx").on(table.recallCalendarEventId),
    index("notetaker_meetings_recall_bot_id_idx").on(table.recallBotId),
    index("notetaker_meetings_external_event_id_idx").on(table.externalEventId),
    index("notetaker_meetings_start_time_idx").on(table.startTime),
    index("notetaker_meetings_source_item_id_idx").on(table.sourceItemId),
  ],
);

export const notetakerEvents = pgTable(
  "notetaker_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    notetakerMeetingId: uuid("notetaker_meeting_id").references(() => notetakerMeetings.id, {
      onDelete: "set null",
    }),
    providerEventId: text("provider_event_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notetaker_events_brain_id_idx").on(table.brainId),
    index("notetaker_events_meeting_id_idx").on(table.notetakerMeetingId),
    index("notetaker_events_provider_event_id_idx").on(table.providerEventId),
    index("notetaker_events_type_idx").on(table.eventType),
  ],
);

export const priorities = pgTable(
  "priorities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    statement: text("statement").notNull(),
    setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
    setBy: prioritySetByEnum("set_by").notNull().default("naveen"),
    horizon: priorityHorizonEnum("horizon").notNull().default("week"),
    status: priorityStatusEnum("status").notNull().default("active"),
    sourceRefs: jsonb("source_refs").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("priorities_brain_id_idx").on(table.brainId),
    index("priorities_brain_status_idx").on(table.brainId, table.status),
    index("priorities_status_idx").on(table.status),
    index("priorities_set_at_idx").on(table.setAt),
  ],
);

export type PriorityRow = typeof priorities.$inferSelect;
export type NewPriorityRow = typeof priorities.$inferInsert;

export type BrainRow = typeof brains.$inferSelect;
export type NewBrainRow = typeof brains.$inferInsert;
export type SourceItemRow = typeof sourceItems.$inferSelect;
export type NewSourceItemRow = typeof sourceItems.$inferInsert;
export type MemoryObjectRow = typeof memoryObjects.$inferSelect;
export type NewMemoryObjectRow = typeof memoryObjects.$inferInsert;
export type OpenLoopRow = typeof openLoops.$inferSelect;
export type NewOpenLoopRow = typeof openLoops.$inferInsert;
export type RelationshipRow = typeof relationships.$inferSelect;
export type NewRelationshipRow = typeof relationships.$inferInsert;
export type WorkflowRow = typeof workflows.$inferSelect;
export type NewWorkflowRow = typeof workflows.$inferInsert;
export type SourceEmbeddingRow = typeof sourceEmbeddings.$inferSelect;
export type NewSourceEmbeddingRow = typeof sourceEmbeddings.$inferInsert;
export type AgentRunRow = typeof agentRuns.$inferSelect;
export type NewAgentRunRow = typeof agentRuns.$inferInsert;
export type ConnectorConfigRow = typeof connectorConfigs.$inferSelect;
export type NewConnectorConfigRow = typeof connectorConfigs.$inferInsert;
export type ConnectorSyncRunRow = typeof connectorSyncRuns.$inferSelect;
export type NewConnectorSyncRunRow = typeof connectorSyncRuns.$inferInsert;
export type BrainAlertRow = typeof brainAlerts.$inferSelect;
export type NewBrainAlertRow = typeof brainAlerts.$inferInsert;
export type NotetakerCalendarRow = typeof notetakerCalendars.$inferSelect;
export type NewNotetakerCalendarRow = typeof notetakerCalendars.$inferInsert;
export type NotetakerMeetingRow = typeof notetakerMeetings.$inferSelect;
export type NewNotetakerMeetingRow = typeof notetakerMeetings.$inferInsert;
export type NotetakerEventRow = typeof notetakerEvents.$inferSelect;
export type NewNotetakerEventRow = typeof notetakerEvents.$inferInsert;
