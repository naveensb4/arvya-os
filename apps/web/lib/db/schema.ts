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
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const brainKindEnum = pgEnum("brain_kind", [
  "company",
  "sell_side",
  "buy_side",
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

export const workspaceMemberRoleEnum = pgEnum("workspace_member_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);

export const connectorStatusEnum = pgEnum("connector_status", [
  "active",
  "connected",
  "paused",
  "error",
  "needs_reauth",
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

export const calendarEventStatusEnum = pgEnum("calendar_event_status", [
  "active",
  "cancelled",
  "deleted",
]);

export const calendarEventTypeEnum = pgEnum("calendar_event_type", [
  "virtual",
  "in_person",
  "hybrid",
  "unknown",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  authProvider: text("auth_provider"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceMemberRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("workspace_members_workspace_id_idx").on(table.workspaceId),
    index("workspace_members_user_id_idx").on(table.userId),
  ],
);

export const brains = pgTable("brains", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  kind: brainKindEnum("kind").notNull().default("company"),
  thesis: text("thesis").notNull().default(""),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  createdByUserId: uuid("created_by_user_id"),
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
    type: text("type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    externalUri: text("external_uri"),
    storagePath: text("storage_path"),
    createdByUserId: uuid("created_by_user_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("source_items_brain_id_idx").on(table.brainId),
    index("source_items_brain_created_at_idx").on(table.brainId, table.createdAt),
  ],
);

export const canonicalEntities = pgTable(
  "canonical_entities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id").notNull().references(() => brains.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    canonicalName: text("canonical_name").notNull(),
    displayName: text("display_name"),
    aliases: text("aliases").array().default([]),
    externalIds: jsonb("external_ids").notNull().default({}),
    properties: jsonb("properties").notNull().default({}),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    mergedFrom: uuid("merged_from").array().default([]),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("canonical_entities_brain_id_idx").on(table.brainId),
    index("canonical_entities_workspace_id_idx").on(table.workspaceId),
    index("canonical_entities_entity_type_idx").on(table.entityType),
    index("canonical_entities_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
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
    canonicalEntityId: uuid("canonical_entity_id").references(() => canonicalEntities.id, { onDelete: "set null" }),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("memory_objects_brain_id_idx").on(table.brainId),
    index("memory_objects_brain_created_at_idx").on(table.brainId, table.createdAt),
    index("memory_objects_source_item_id_idx").on(table.sourceItemId),
    index("memory_objects_type_idx").on(table.objectType),
    index("memory_objects_status_idx").on(table.status),
    index("memory_objects_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const entityMentions = pgTable(
  "entity_mentions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id").notNull().references(() => brains.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    canonicalEntityId: uuid("canonical_entity_id").notNull().references(() => canonicalEntities.id, { onDelete: "cascade" }),
    memoryObjectId: uuid("memory_object_id").references(() => memoryObjects.id, { onDelete: "set null" }),
    sourceItemId: uuid("source_item_id").references(() => sourceItems.id, { onDelete: "set null" }),
    mentionText: text("mention_text").notNull(),
    contextSnippet: text("context_snippet"),
    mentionedAt: timestamp("mentioned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("entity_mentions_brain_id_idx").on(table.brainId),
    index("entity_mentions_canonical_entity_id_idx").on(table.canonicalEntityId),
    index("entity_mentions_memory_object_id_idx").on(table.memoryObjectId),
    index("entity_mentions_source_item_id_idx").on(table.sourceItemId),
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
    createdByUserId: uuid("created_by_user_id"),
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
    embedding: vector("embedding", { dimensions: 1536 }),
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
    index("open_loops_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const loopOutcomeDecisionEnum = pgEnum("loop_outcome_decision", [
  "closed",
  "advanced",
  "contradicts",
  "no_match",
  "uncertain",
]);

// Audit trail for the closed-loop matcher. Every match attempt writes a row
// so the team can review what the brain auto-closed, override it if wrong,
// and (in C-week voice learning) train future matches on the corrections.
export const loopOutcomeLog = pgTable(
  "loop_outcome_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    loopId: uuid("loop_id")
      .notNull()
      .references(() => openLoops.id, { onDelete: "cascade" }),
    sourceItemId: uuid("source_item_id").references(() => sourceItems.id, {
      onDelete: "set null",
    }),
    decision: loopOutcomeDecisionEnum("decision").notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    evidenceQuote: text("evidence_quote"),
    agentRunId: uuid("agent_run_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    humanOverrode: boolean("human_overrode").notNull().default(false),
    humanOverrideAt: timestamp("human_override_at", { withTimezone: true }),
    properties: jsonb("properties").notNull().default({}),
  },
  (table) => [
    index("loop_outcome_log_brain_decided_at_idx").on(table.brainId, table.decidedAt),
    index("loop_outcome_log_loop_id_idx").on(table.loopId),
    index("loop_outcome_log_source_item_id_idx").on(table.sourceItemId),
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
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    isCurrent: boolean("is_current").default(true),
    strength: numeric("strength", { precision: 3, scale: 2 }),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }),
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

export const brainDocs = pgTable(
  "brain_docs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(),
    title: text("title").notNull(),
    content: jsonb("content").notNull(),
    contentText: text("content_text"),
    feedback: text("feedback"),
    feedbackAt: timestamp("feedback_at", { withTimezone: true }),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    externalEventId: text("external_event_id"),
    meetingId: uuid("meeting_id").references(() => notetakerMeetings.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_brain_docs_meeting").on(table.brainId, table.meetingId),
    index("idx_brain_docs_type").on(table.brainId, table.docType),
    index("idx_brain_docs_ext_event").on(table.brainId, table.externalEventId),
    index("idx_brain_docs_agent_run").on(table.agentRunId),
  ],
);

export const connectorConfigs = pgTable(
  "connector_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    connectorType: text("connector_type").notNull(),
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
    connectorType: text("connector_type").notNull(),
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

export const calendarEvents = pgTable(
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
    location: text("location"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    participants: jsonb("participants").notNull().default([]),
    autoJoinDecision: notetakerAutoJoinDecisionEnum("auto_join_decision").notNull().default("needs_review"),
    autoJoinReason: text("auto_join_reason"),
    botStatus: notetakerBotStatusEnum("bot_status").notNull().default("not_scheduled"),
    eventStatus: calendarEventStatusEnum("event_status").notNull().default("active"),
    eventType: calendarEventTypeEnum("event_type").notNull().default("unknown"),
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
    index("notetaker_meetings_event_status_idx").on(table.eventStatus),
  ],
);
export const notetakerMeetings = calendarEvents;

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

export const nudges = pgTable(
  "nudges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id").notNull().references(() => brains.id, { onDelete: "cascade" }),
    nudgeType: text("nudge_type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: text("severity").notNull().default("info"),
    relatedEntityId: uuid("related_entity_id").references(() => canonicalEntities.id, { onDelete: "set null" }),
    relatedOpenLoopId: uuid("related_open_loop_id").references(() => openLoops.id, { onDelete: "set null" }),
    suggestedAction: text("suggested_action"),
    deliveryChannels: text("delivery_channels").array().default([]),
    deliveredAt: jsonb("delivered_at").notNull().default({}),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("nudges_brain_id_idx").on(table.brainId),
    index("nudges_nudge_type_idx").on(table.nudgeType),
    index("nudges_created_at_idx").on(table.createdAt),
  ],
);

export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: workspaceMemberRoleEnum("role").notNull().default("member"),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("workspace_invites_workspace_id_idx").on(table.workspaceId),
    index("workspace_invites_token_idx").on(table.token),
    index("workspace_invites_email_idx").on(table.email),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    notificationType: text("notification_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: uuid("related_entity_id"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    deliveryError: text("delivery_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_brain_id_idx").on(table.brainId),
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_created_at_idx").on(table.createdAt),
    index("notifications_read_at_idx").on(table.readAt),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    notificationType: text("notification_type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config").notNull().default({}),
  },
  (table) => [
    index("notification_preferences_user_id_idx").on(table.userId),
    uniqueIndex("notification_preferences_unique_idx").on(
      table.userId,
      table.workspaceId,
      table.channel,
      table.notificationType,
    ),
  ],
);

export const pendingActions = pgTable(
  "pending_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    createdByAgent: text("created_by_agent").notNull(),
    actionType: text("action_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("pending"),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    executionResult: jsonb("execution_result"),
    executionError: text("execution_error"),
    relatedOpenLoopId: uuid("related_open_loop_id").references(() => openLoops.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pending_actions_brain_id_idx").on(table.brainId),
    index("pending_actions_status_idx").on(table.status),
    index("pending_actions_expires_at_idx").on(table.expiresAt),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    trigger: jsonb("trigger").notNull().default({}),
    procedure: jsonb("procedure").notNull().default([]),
    outputTemplate: jsonb("output_template"),
    learnedFromSources: text("learned_from_sources").array().default([]),
    version: integer("version").notNull().default(1),
    isSystem: boolean("is_system").notNull().default(false),
    status: text("status").notNull().default("active"),
    executionCount: integer("execution_count").notNull().default(0),
    lastExecutedAt: timestamp("last_executed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("skills_brain_id_idx").on(table.brainId),
    index("skills_status_idx").on(table.status),
  ],
);

export const brainEvents = pgTable(
  "brain_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    entityId: uuid("entity_id").references(() => canonicalEntities.id, { onDelete: "set null" }),
    sourceItemId: uuid("source_item_id").references(() => sourceItems.id, { onDelete: "set null" }),
    memoryObjectId: uuid("memory_object_id").references(() => memoryObjects.id, { onDelete: "set null" }),
    relationshipId: uuid("relationship_id").references(() => relationships.id, { onDelete: "set null" }),
    openLoopId: uuid("open_loop_id").references(() => openLoops.id, { onDelete: "set null" }),
    actor: text("actor").notNull().default("system"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_events_brain_id_idx").on(table.brainId),
    index("brain_events_event_type_idx").on(table.eventType),
    index("brain_events_entity_id_idx").on(table.entityId),
    index("brain_events_source_item_id_idx").on(table.sourceItemId),
    index("brain_events_created_at_idx").on(table.createdAt),
    index("brain_events_brain_created_at_idx").on(table.brainId, table.createdAt),
  ],
);

export const entityPages = pgTable(
  "entity_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => canonicalEntities.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    kind: text("kind").notNull().default("entity"),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull().default(""),
    summary: text("summary").notNull().default(""),
    aliases: text("aliases").array().default([]),
    evidenceIds: uuid("evidence_ids").array().default([]),
    compiledAt: timestamp("compiled_at", { withTimezone: true }),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    stale: boolean("stale").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("entity_pages_brain_id_idx").on(table.brainId),
    index("entity_pages_entity_id_idx").on(table.entityId),
    index("entity_pages_slug_idx").on(table.slug),
    uniqueIndex("entity_pages_brain_slug_idx").on(table.brainId, table.slug),
  ],
);

export const pageChunks = pgTable(
  "page_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    entityPageId: uuid("entity_page_id")
      .notNull()
      .references(() => entityPages.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => canonicalEntities.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    chunkKind: text("chunk_kind").notNull().default("compiled_truth"),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("page_chunks_brain_id_idx").on(table.brainId),
    index("page_chunks_entity_page_id_idx").on(table.entityPageId),
    index("page_chunks_entity_id_idx").on(table.entityId),
    index("page_chunks_chunk_kind_idx").on(table.chunkKind),
    index("page_chunks_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const skillExecutions = pgTable(
  "skill_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brainId: uuid("brain_id")
      .notNull()
      .references(() => brains.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    triggeredBy: text("triggered_by").notNull(),
    triggerPayload: jsonb("trigger_payload").default({}),
    status: text("status").notNull().default("running"),
    stepsCompleted: jsonb("steps_completed").default([]),
    currentStep: integer("current_step").notNull().default(0),
    output: jsonb("output"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("skill_executions_brain_id_idx").on(table.brainId),
    index("skill_executions_skill_id_idx").on(table.skillId),
    index("skill_executions_status_idx").on(table.status),
  ],
);

export type PriorityRow = typeof priorities.$inferSelect;
export type NewPriorityRow = typeof priorities.$inferInsert;

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type NewWorkspaceRow = typeof workspaces.$inferInsert;
export type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMemberRow = typeof workspaceMembers.$inferInsert;
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
export type CalendarEventRow = typeof calendarEvents.$inferSelect;
export type NewCalendarEventRow = typeof calendarEvents.$inferInsert;
export type NotetakerMeetingRow = CalendarEventRow;
export type NewNotetakerMeetingRow = NewCalendarEventRow;
export type NotetakerEventRow = typeof notetakerEvents.$inferSelect;
export type NewNotetakerEventRow = typeof notetakerEvents.$inferInsert;
export type WorkspaceInviteRow = typeof workspaceInvites.$inferSelect;
export type NewWorkspaceInviteRow = typeof workspaceInvites.$inferInsert;
export type CanonicalEntityRow = typeof canonicalEntities.$inferSelect;
export type NewCanonicalEntityRow = typeof canonicalEntities.$inferInsert;
export type EntityMentionRow = typeof entityMentions.$inferSelect;
export type NewEntityMentionRow = typeof entityMentions.$inferInsert;
export type LoopOutcomeLogRow = typeof loopOutcomeLog.$inferSelect;
export type NewLoopOutcomeLogRow = typeof loopOutcomeLog.$inferInsert;
export type NudgeRow = typeof nudges.$inferSelect;
export type NewNudgeRow = typeof nudges.$inferInsert;
export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
export type NotificationPreferenceRow = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreferenceRow = typeof notificationPreferences.$inferInsert;
export type PendingActionRow = typeof pendingActions.$inferSelect;
export type NewPendingActionRow = typeof pendingActions.$inferInsert;
export type SkillRow = typeof skills.$inferSelect;
export type NewSkillRow = typeof skills.$inferInsert;
export type SkillExecutionRow = typeof skillExecutions.$inferSelect;
export type NewSkillExecutionRow = typeof skillExecutions.$inferInsert;

export type BrainDocRow = typeof brainDocs.$inferSelect;
export type NewBrainDocRow = typeof brainDocs.$inferInsert;
export type BrainEventRow = typeof brainEvents.$inferSelect;
export type NewBrainEventRow = typeof brainEvents.$inferInsert;
export type EntityPageRow = typeof entityPages.$inferSelect;
export type NewEntityPageRow = typeof entityPages.$inferInsert;
export type PageChunkRow = typeof pageChunks.$inferSelect;
export type NewPageChunkRow = typeof pageChunks.$inferInsert;
