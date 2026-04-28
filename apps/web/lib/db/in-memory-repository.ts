import { nanoid } from "nanoid";
import type {
  AgentRun,
  Brain,
  MemoryObject,
  OpenLoop,
  Priority,
  Relationship,
  SourceEmbedding,
  SourceItem,
  Workflow,
} from "@arvya/core";
import type {
  BrainRepository,
  BrainAlert,
  ConnectorConfig,
  ConnectorSyncRun,
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
  CreatePriorityData,
  CreateRelationshipData,
  CreateSourceData,
  CreateSourceEmbeddingData,
  CreateWorkflowData,
  ListPrioritiesOptions,
  NotetakerCalendar,
  NotetakerEvent,
  NotetakerMeeting,
  UpdateAgentRunData,
  UpdateConnectorConfigData,
  UpdateConnectorSyncRunData,
  UpdateMemoryObjectData,
  UpdateNotetakerCalendarData,
  UpdateNotetakerEventData,
  UpdateNotetakerMeetingData,
  UpdateOpenLoopData,
  UpdatePriorityStatusData,
  UpdateRelationshipData,
  UpdateWorkflowData,
} from "./repository";

const seedAt = new Date("2026-04-25T16:00:00.000Z").toISOString();

const seedBrains: Brain[] = [
  {
    id: "arvya-company-brain",
    name: "Arvya Company Brain",
    kind: "company",
    thesis:
      "A living operating brain for Arvya that compounds every investor, customer, advisor, product, and engineering signal into a single source-backed memory.",
    createdAt: seedAt,
    updatedAt: seedAt,
  },
];

const seedSources: SourceItem[] = [
  {
    id: "seed-product-thesis",
    brainId: "arvya-company-brain",
    title: "Initial Deal OS Thesis",
    type: "strategy_output",
    content:
      "Arvya Deal OS should make the Brain the core object. Sources feed the Brain, agents act from the Brain, and open loops stay visible until closed. We should build manual source ingestion first before overbuilding integrations. The MVP needs source-backed answers, daily founder briefs, and clear agent run logs.",
    createdAt: seedAt,
  },
];

const seedMemories: MemoryObject[] = [
  {
    id: "seed-memory-brain-core",
    brainId: "arvya-company-brain",
    sourceItemId: "seed-product-thesis",
    objectType: "decision",
    name: "Brain is the core object",
    description:
      "The product architecture centers on Brains, with sources, memory, workflows, and agents orbiting that object.",
    sourceQuote: "Arvya Deal OS should make the Brain the core object.",
    confidence: 0.95,
    createdAt: seedAt,
  },
  {
    id: "seed-memory-source-backed",
    brainId: "arvya-company-brain",
    sourceItemId: "seed-product-thesis",
    objectType: "insight",
    name: "Source-backed answers are the quality bar",
    description:
      "Every meaningful answer must trace back to a source. Confident answers without evidence are dangerous.",
    sourceQuote:
      "The MVP needs source-backed answers, daily founder briefs, and clear agent run logs.",
    confidence: 0.9,
    createdAt: seedAt,
  },
];

const seedOpenLoops: OpenLoop[] = [
  {
    id: "seed-open-loop-manual-first",
    brainId: "arvya-company-brain",
    sourceItemId: "seed-product-thesis",
    title: "Manual ingestion before integrations",
    description:
      "Manual upload and paste must work end-to-end before Gmail, Drive, GitHub, Slack, Recall, or CRM connectors are built.",
    loopType: "product",
    status: "open",
    priority: "high",
    sourceQuote:
      "We should build manual source ingestion first before overbuilding integrations.",
    confidence: 0.92,
    requiresHumanApproval: false,
    properties: {},
    createdAt: seedAt,
    updatedAt: seedAt,
  },
];

const seedRelationships: Relationship[] = [];
const seedWorkflows: Workflow[] = [];
const seedEmbeddings: SourceEmbedding[] = [];

const seedAgentRuns: AgentRun[] = [
  {
    id: "seed-agent-run",
    brainId: "arvya-company-brain",
    sourceItemId: "seed-product-thesis",
    name: "source_ingestion",
    status: "succeeded",
    modelProvider: "local",
    inputSummary: "Seeded product thesis",
    outputSummary:
      "Captured the Brain-first decision, manual-first open loop, and source-backed quality bar.",
    startedAt: seedAt,
    completedAt: seedAt,
  },
];
const seedConnectorConfigs: ConnectorConfig[] = [];
const seedConnectorSyncRuns: ConnectorSyncRun[] = [];
const seedBrainAlerts: BrainAlert[] = [];
const seedNotetakerCalendars: NotetakerCalendar[] = [];
const seedNotetakerMeetings: NotetakerMeeting[] = [];
const seedNotetakerEvents: NotetakerEvent[] = [];
const seedPriorities: Priority[] = [];

type InMemoryState = {
  brains: Brain[];
  sources: SourceItem[];
  memories: MemoryObject[];
  relationships: Relationship[];
  openLoops: OpenLoop[];
  workflows: Workflow[];
  embeddings: SourceEmbedding[];
  agentRuns: AgentRun[];
  priorities: Priority[];
  connectorConfigs: ConnectorConfig[];
  connectorSyncRuns: ConnectorSyncRun[];
  brainAlerts: BrainAlert[];
  notetakerCalendars: NotetakerCalendar[];
  notetakerMeetings: NotetakerMeeting[];
  notetakerEvents: NotetakerEvent[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function now(): string {
  return new Date().toISOString();
}

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }
  if (aMag === 0 || bMag === 0) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

function lexicalScore(text: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const haystack = text.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (haystack.includes(term)) hits += 1;
  }
  return hits / terms.length;
}

declare global {
  var __ARVYA_IN_MEMORY_STATE__: InMemoryState | undefined;
}

function createSeedState(): InMemoryState {
  return {
    brains: clone(seedBrains),
    sources: clone(seedSources),
    memories: clone(seedMemories),
    relationships: clone(seedRelationships),
    openLoops: clone(seedOpenLoops),
    workflows: clone(seedWorkflows),
    embeddings: clone(seedEmbeddings),
    agentRuns: clone(seedAgentRuns),
    priorities: clone(seedPriorities),
    connectorConfigs: clone(seedConnectorConfigs),
    connectorSyncRuns: clone(seedConnectorSyncRuns),
    brainAlerts: clone(seedBrainAlerts),
    notetakerCalendars: clone(seedNotetakerCalendars),
    notetakerMeetings: clone(seedNotetakerMeetings),
    notetakerEvents: clone(seedNotetakerEvents),
  };
}

function ensureStateCollection<K extends keyof InMemoryState>(
  state: InMemoryState,
  seedState: InMemoryState,
  key: K,
) {
  if (!Array.isArray(state[key])) {
    state[key] = seedState[key];
  }
}

function loadState(): InMemoryState {
  if (!globalThis.__ARVYA_IN_MEMORY_STATE__) {
    globalThis.__ARVYA_IN_MEMORY_STATE__ = createSeedState();
  }

  const state = globalThis.__ARVYA_IN_MEMORY_STATE__;
  const seedState = createSeedState();
  for (const key of Object.keys(seedState) as Array<keyof InMemoryState>) {
    ensureStateCollection(state, seedState, key);
  }

  return globalThis.__ARVYA_IN_MEMORY_STATE__;
}

export class InMemoryRepository implements BrainRepository {
  readonly mode = "in_memory" as const;

  async listBrains(): Promise<Brain[]> {
    return clone(loadState().brains);
  }

  async getBrain(brainId: string): Promise<Brain | null> {
    const found = loadState().brains.find((brain) => brain.id === brainId);
    return found ? clone(found) : null;
  }

  async createBrain(input: CreateBrainData): Promise<Brain> {
    const brain: Brain = {
      id: nanoid(),
      name: input.name,
      kind: input.kind,
      thesis: input.thesis,
      metadata: input.metadata ?? {},
      createdAt: now(),
      updatedAt: now(),
    };
    loadState().brains.push(brain);
    return clone(brain);
  }

  async listSourceItems(brainId: string, options: { limit?: number } = {}): Promise<SourceItem[]> {
    return clone(
      loadState()
        .sources.filter((source) => source.brainId === brainId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, options.limit ?? 500),
    );
  }

  async getSourceItem(sourceItemId: string): Promise<SourceItem | null> {
    const found = loadState().sources.find((source) => source.id === sourceItemId);
    return found ? clone(found) : null;
  }

  async createSourceItem(input: CreateSourceData): Promise<SourceItem> {
    const source: SourceItem = {
      id: nanoid(),
      brainId: input.brainId,
      title: input.title,
      type: input.type,
      content: input.content,
      externalUri: input.externalUri,
      storagePath: input.storagePath,
      metadata: input.metadata ?? {},
      createdAt: now(),
    };
    loadState().sources.unshift(source);
    return clone(source);
  }

  async listMemoryObjects(brainId: string, options: { limit?: number } = {}): Promise<MemoryObject[]> {
    return clone(
      loadState()
        .memories.filter((memory) => memory.brainId === brainId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, options.limit ?? 500),
    );
  }

  async createMemoryObjects(items: CreateMemoryObjectData[]): Promise<MemoryObject[]> {
    const created: MemoryObject[] = items.map((item) => ({
      id: nanoid(),
      brainId: item.brainId,
      sourceItemId: item.sourceItemId,
      objectType: item.objectType,
      name: item.name,
      description: item.description,
      properties: item.properties ?? {},
      sourceQuote: item.sourceQuote,
      confidence: item.confidence,
      status: item.status,
      createdAt: now(),
      updatedAt: now(),
    }));
    loadState().memories.unshift(...created);
    return clone(created);
  }

  async updateMemoryObject(memoryObjectId: string, update: UpdateMemoryObjectData): Promise<MemoryObject | null> {
    const memory = loadState().memories.find((item) => item.id === memoryObjectId);
    if (!memory) return null;
    Object.assign(memory, update, { updatedAt: now() });
    if (update.sourceItemId === null) delete memory.sourceItemId;
    if (update.sourceQuote === null) delete memory.sourceQuote;
    if (update.confidence === null) delete memory.confidence;
    if (update.status === null) delete memory.status;
    return clone(memory);
  }

  async createRelationships(items: CreateRelationshipData[]): Promise<Relationship[]> {
    const created = items.map((item) => ({
      id: nanoid(),
      brainId: item.brainId,
      fromObjectId: item.fromObjectId,
      toObjectId: item.toObjectId,
      relationshipType: item.relationshipType,
      sourceItemId: item.sourceItemId,
      sourceQuote: item.sourceQuote,
      confidence: item.confidence,
      properties: item.properties ?? {},
      createdAt: now(),
    }));
    loadState().relationships.unshift(...created);
    return clone(created);
  }

  async listRelationships(brainId: string, options: { limit?: number } = {}): Promise<Relationship[]> {
    return clone(loadState().relationships.filter((item) => item.brainId === brainId).slice(0, options.limit ?? 500));
  }

  async updateRelationship(relationshipId: string, update: UpdateRelationshipData): Promise<Relationship | null> {
    const relationship = loadState().relationships.find((item) => item.id === relationshipId);
    if (!relationship) return null;
    Object.assign(relationship, update);
    if (update.sourceItemId === null) delete relationship.sourceItemId;
    if (update.sourceQuote === null) delete relationship.sourceQuote;
    if (update.confidence === null) delete relationship.confidence;
    return clone(relationship);
  }

  async createOpenLoops(items: CreateOpenLoopData[]): Promise<OpenLoop[]> {
    const created = items.map((item) => ({
      id: nanoid(),
      brainId: item.brainId,
      sourceItemId: item.sourceItemId,
      title: item.title,
      description: item.description,
      loopType: item.loopType,
      owner: item.owner,
      status: item.status ?? "needs_review",
      priority: item.priority ?? "medium",
      dueDate: item.dueDate,
      suggestedAction: item.suggestedAction,
      suggestedFollowUpEmail: item.suggestedFollowUpEmail ?? null,
      requiresHumanApproval: item.requiresHumanApproval ?? false,
      approvedAt: item.approvedAt,
      outcome: item.outcome,
      sourceQuote: item.sourceQuote,
      confidence: item.confidence,
      properties: item.properties ?? {},
      createdAt: now(),
      updatedAt: now(),
    }));
    loadState().openLoops.unshift(...created);
    return clone(created);
  }

  async listOpenLoops(brainId: string, options: { limit?: number } = {}): Promise<OpenLoop[]> {
    return clone(
      loadState()
        .openLoops.filter((loop) => loop.brainId === brainId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, options.limit ?? 500),
    );
  }

  async updateOpenLoop(openLoopId: string, update: UpdateOpenLoopData): Promise<OpenLoop | null> {
    const loop = loadState().openLoops.find((item) => item.id === openLoopId);
    if (!loop) return null;
    Object.assign(loop, update, { updatedAt: now() });
    if (
      (update.status === "done" || update.status === "dismissed" || update.status === "closed") &&
      !loop.closedAt
    ) {
      loop.closedAt = now();
    }
    return clone(loop);
  }

  async createWorkflow(input: CreateWorkflowData): Promise<Workflow> {
    const workflow: Workflow = {
      id: nanoid(),
      brainId: input.brainId,
      sourceItemId: input.sourceItemId,
      workflowType: input.workflowType,
      status: input.status ?? "started",
      state: input.state ?? {},
      error: input.error,
      createdAt: now(),
      updatedAt: now(),
    };
    loadState().workflows.unshift(workflow);
    return clone(workflow);
  }

  async updateWorkflow(workflowId: string, update: UpdateWorkflowData): Promise<Workflow | null> {
    const workflow = loadState().workflows.find((item) => item.id === workflowId);
    if (!workflow) return null;
    Object.assign(workflow, update, { updatedAt: now() });
    if (update.status === "completed" && !workflow.completedAt) workflow.completedAt = now();
    return clone(workflow);
  }

  async listWorkflows(brainId: string, limit?: number): Promise<Workflow[]> {
    const workflows = loadState()
      .workflows.filter((workflow) => workflow.brainId === brainId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return clone(
      typeof limit === "number" ? workflows.slice(0, limit) : workflows,
    );
  }

  async createSourceEmbeddings(items: CreateSourceEmbeddingData[]): Promise<SourceEmbedding[]> {
    const created = items.map((item) => ({
      id: nanoid(),
      brainId: item.brainId,
      sourceItemId: item.sourceItemId,
      chunkIndex: item.chunkIndex,
      content: item.content,
      embedding: item.embedding ?? null,
      metadata: item.metadata ?? {},
      createdAt: now(),
    }));
    loadState().embeddings.unshift(...created);
    return clone(created);
  }

  async searchBrain(input: {
    brainId: string;
    embedding: number[];
    query: string;
    limit: number;
  }) {
    const embeddingHits = loadState()
      .embeddings.filter(
        (embedding) =>
          embedding.brainId === input.brainId &&
          Array.isArray(embedding.embedding) &&
          embedding.embedding.length === input.embedding.length,
      )
      .flatMap((embedding) => {
        const sourceItem = loadState().sources.find(
          (source) => source.id === embedding.sourceItemId,
        );
        if (!sourceItem) return [];
        return [
          {
            sourceItem: clone(sourceItem),
            score: cosine(input.embedding, embedding.embedding ?? []),
            reason: "vector" as const,
          },
        ];
      })
      .filter((item) => item.score > 0);

    const terms = input.query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
    const lexical = [
      ...loadState().memories.map((memory) => ({
        memoryObject: clone(memory),
        score: lexicalScore(`${memory.name} ${memory.description} ${memory.sourceQuote ?? ""}`, terms),
        reason: "lexical" as const,
      })),
      ...loadState().openLoops.map((loop) => ({
        openLoop: clone(loop),
        score: lexicalScore(`${loop.title} ${loop.description} ${loop.sourceQuote ?? ""} ${loop.outcome ?? ""}`, terms),
        reason: "lexical" as const,
      })),
      ...loadState().sources.map((source) => ({
        sourceItem: clone(source),
        score: lexicalScore(`${source.title} ${source.content}`, terms),
        reason: "lexical" as const,
      })),
    ].filter((item) => item.score > 0);

    return [...embeddingHits, ...lexical]
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit);
  }

  async listAgentRuns(brainId: string, limit = 50): Promise<AgentRun[]> {
    return clone(
      loadState()
        .agentRuns.filter((run) => run.brainId === brainId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, limit),
    );
  }

  async createAgentRun(input: CreateAgentRunData): Promise<AgentRun> {
    const run: AgentRun = {
      id: nanoid(),
      brainId: input.brainId,
      sourceItemId: input.sourceItemId,
      workflowId: input.workflowId,
      name: input.name,
      status: "running",
      modelProvider: input.modelProvider,
      stepName: input.stepName,
      inputSummary: input.inputSummary,
      outputSummary: "",
      rawInput: input.rawInput,
      startedAt: now(),
    };
    loadState().agentRuns.unshift(run);
    return clone(run);
  }

  async updateAgentRun(
    runId: string,
    update: UpdateAgentRunData,
  ): Promise<AgentRun | null> {
    const run = loadState().agentRuns.find((item) => item.id === runId);
    if (!run) return null;
    run.status = update.status;
    if (update.outputSummary !== undefined) run.outputSummary = update.outputSummary;
    if (update.rawOutput !== undefined) run.rawOutput = update.rawOutput;
    if (update.modelProvider !== undefined) run.modelProvider = update.modelProvider;
    if (update.error !== undefined) run.error = update.error;
    if (update.completedAt !== undefined) run.completedAt = update.completedAt;
    if (update.status !== "running" && !run.completedAt) {
      run.completedAt = now();
    }
    return clone(run);
  }

  async listPriorities(brainId: string, opts: ListPrioritiesOptions = {}): Promise<Priority[]> {
    const statuses = opts.status
      ? Array.isArray(opts.status)
        ? opts.status
        : [opts.status]
      : undefined;
    const horizons = opts.horizon
      ? Array.isArray(opts.horizon)
        ? opts.horizon
        : [opts.horizon]
      : undefined;

    const filtered = loadState()
      .priorities.filter((priority) => priority.brainId === brainId)
      .filter((priority) => (statuses ? statuses.includes(priority.status) : true))
      .filter((priority) => (horizons ? horizons.includes(priority.horizon) : true))
      .sort((a, b) => b.setAt.localeCompare(a.setAt));

    return clone(typeof opts.limit === "number" ? filtered.slice(0, opts.limit) : filtered);
  }

  async createPriority(input: CreatePriorityData): Promise<Priority> {
    const setAt = input.setAt ?? now();
    const priority: Priority = {
      id: nanoid(),
      brainId: input.brainId,
      statement: input.statement,
      setAt,
      setBy: input.setBy ?? "naveen",
      horizon: input.horizon ?? "week",
      status: input.status ?? "active",
      sourceRefs: input.sourceRefs,
      createdAt: now(),
      updatedAt: now(),
    };
    loadState().priorities.unshift(priority);
    return clone(priority);
  }

  async updatePriorityStatus(
    priorityId: string,
    update: UpdatePriorityStatusData,
  ): Promise<Priority | null> {
    const priority = loadState().priorities.find((item) => item.id === priorityId);
    if (!priority) return null;
    priority.status = update.status;
    priority.updatedAt = now();
    return clone(priority);
  }

  async listConnectorConfigs(brainId?: string): Promise<ConnectorConfig[]> {
    return clone(
      loadState()
        .connectorConfigs.filter((config) => !brainId || config.brainId === brainId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async createConnectorConfig(input: CreateConnectorConfigData): Promise<ConnectorConfig> {
    const config: ConnectorConfig = {
      id: nanoid(),
      brainId: input.brainId,
      connectorType: input.connectorType,
      status: input.status ?? "active",
      config: input.config ?? {},
      credentials: input.credentials ?? null,
      syncEnabled: input.syncEnabled ?? false,
      syncIntervalMinutes: input.syncIntervalMinutes ?? null,
      createdAt: now(),
      updatedAt: now(),
    };
    loadState().connectorConfigs.unshift(config);
    return clone(config);
  }

  async updateConnectorConfig(configId: string, update: UpdateConnectorConfigData): Promise<ConnectorConfig | null> {
    const config = loadState().connectorConfigs.find((item) => item.id === configId);
    if (!config) return null;
    Object.assign(config, update, { updatedAt: now() });
    return clone(config);
  }

  async listConnectorSyncRuns(
    input: { brainId?: string; connectorConfigId?: string; limit?: number } = {},
  ): Promise<ConnectorSyncRun[]> {
    return clone(
      loadState()
        .connectorSyncRuns.filter((run) => {
          if (input.brainId && run.brainId !== input.brainId) return false;
          if (input.connectorConfigId && run.connectorConfigId !== input.connectorConfigId) return false;
          return true;
        })
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, input.limit ?? 25),
    );
  }

  async createConnectorSyncRun(input: CreateConnectorSyncRunData): Promise<ConnectorSyncRun> {
    const run: ConnectorSyncRun = {
      id: nanoid(),
      brainId: input.brainId,
      connectorConfigId: input.connectorConfigId ?? null,
      connectorType: input.connectorType,
      status: input.status ?? "started",
      startedAt: now(),
      itemsFound: input.itemsFound ?? 0,
      itemsIngested: input.itemsIngested ?? 0,
      itemsSkipped: input.itemsSkipped ?? 0,
      error: input.error ?? undefined,
      metadata: input.metadata ?? {},
    };
    loadState().connectorSyncRuns.unshift(run);
    return clone(run);
  }

  async updateConnectorSyncRun(
    runId: string,
    update: UpdateConnectorSyncRunData,
  ): Promise<ConnectorSyncRun | null> {
    const run = loadState().connectorSyncRuns.find((item) => item.id === runId);
    if (!run) return null;
    Object.assign(run, update);
    if ((update.status === "completed" || update.status === "failed") && !run.completedAt) {
      run.completedAt = now();
    }
    return clone(run);
  }

  async listBrainAlerts(
    input: { brainId?: string; status?: "unread" | "read" | "dismissed"; limit?: number } = {},
  ): Promise<BrainAlert[]> {
    return clone(
      loadState()
        .brainAlerts.filter((alert) => {
          if (input.brainId && alert.brainId !== input.brainId) return false;
          if (input.status && alert.status !== input.status) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, input.limit ?? 25),
    );
  }

  async createBrainAlert(input: CreateBrainAlertData): Promise<BrainAlert> {
    const alert: BrainAlert = {
      id: nanoid(),
      brainId: input.brainId,
      alertType: input.alertType,
      title: input.title,
      description: input.description,
      severity: input.severity ?? "info",
      sourceId: input.sourceId ?? null,
      openLoopId: input.openLoopId ?? null,
      status: input.status ?? "unread",
      createdAt: now(),
    };
    loadState().brainAlerts.unshift(alert);
    return clone(alert);
  }

  async listNotetakerCalendars(
    input: { brainId?: string; status?: "connected" | "error" | "disabled" } = {},
  ): Promise<NotetakerCalendar[]> {
    return clone(
      loadState()
        .notetakerCalendars.filter((calendar) => {
          if (input.brainId && calendar.brainId !== input.brainId) return false;
          if (input.status && calendar.status !== input.status) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async createNotetakerCalendar(input: CreateNotetakerCalendarData): Promise<NotetakerCalendar> {
    const calendar: NotetakerCalendar = {
      id: nanoid(),
      brainId: input.brainId,
      userId: input.userId ?? null,
      provider: input.provider,
      recallCalendarId: input.recallCalendarId ?? null,
      externalCalendarId: input.externalCalendarId ?? null,
      status: input.status ?? "connected",
      autoJoinEnabled: input.autoJoinEnabled ?? true,
      autoJoinMode: input.autoJoinMode ?? "all_calls",
      config: input.config ?? {},
      lastSyncAt: input.lastSyncAt ?? undefined,
      lastError: input.lastError ?? undefined,
      createdAt: now(),
      updatedAt: now(),
    };
    loadState().notetakerCalendars.unshift(calendar);
    return clone(calendar);
  }

  async updateNotetakerCalendar(
    calendarId: string,
    update: UpdateNotetakerCalendarData,
  ): Promise<NotetakerCalendar | null> {
    const calendar = loadState().notetakerCalendars.find((item) => item.id === calendarId);
    if (!calendar) return null;
    Object.assign(calendar, update, { updatedAt: now() });
    return clone(calendar);
  }

  async deleteNotetakerCalendar(calendarId: string): Promise<boolean> {
    const state = loadState();
    const before = state.notetakerCalendars.length;
    state.notetakerCalendars = state.notetakerCalendars.filter((item) => item.id !== calendarId);
    for (const meeting of state.notetakerMeetings) {
      if (meeting.notetakerCalendarId === calendarId) meeting.notetakerCalendarId = null;
    }
    return state.notetakerCalendars.length !== before;
  }

  async listNotetakerMeetings(
    input: { brainId?: string; calendarId?: string; from?: string; to?: string; limit?: number } = {},
  ): Promise<NotetakerMeeting[]> {
    const from = input.from ? new Date(input.from).getTime() : Number.NEGATIVE_INFINITY;
    const to = input.to ? new Date(input.to).getTime() : Number.POSITIVE_INFINITY;
    return clone(
      loadState()
        .notetakerMeetings.filter((meeting) => {
          const start = new Date(meeting.startTime).getTime();
          if (input.brainId && meeting.brainId !== input.brainId) return false;
          if (input.calendarId && meeting.notetakerCalendarId !== input.calendarId) return false;
          if (start < from || start > to) return false;
          return true;
        })
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .slice(0, input.limit ?? 100),
    );
  }

  async createNotetakerMeeting(input: CreateNotetakerMeetingData): Promise<NotetakerMeeting> {
    const meeting: NotetakerMeeting = {
      id: nanoid(),
      brainId: input.brainId,
      notetakerCalendarId: input.notetakerCalendarId ?? null,
      recallCalendarEventId: input.recallCalendarEventId ?? null,
      recallBotId: input.recallBotId ?? null,
      externalEventId: input.externalEventId ?? null,
      provider: input.provider,
      title: input.title,
      meetingUrl: input.meetingUrl ?? null,
      startTime: input.startTime,
      endTime: input.endTime,
      participants: input.participants ?? [],
      autoJoinDecision: input.autoJoinDecision ?? "needs_review",
      autoJoinReason: input.autoJoinReason ?? null,
      botStatus: input.botStatus ?? "not_scheduled",
      sourceItemId: input.sourceItemId ?? null,
      metadata: input.metadata ?? {},
      createdAt: now(),
      updatedAt: now(),
    };
    loadState().notetakerMeetings.unshift(meeting);
    return clone(meeting);
  }

  async updateNotetakerMeeting(
    meetingId: string,
    update: UpdateNotetakerMeetingData,
  ): Promise<NotetakerMeeting | null> {
    const meeting = loadState().notetakerMeetings.find((item) => item.id === meetingId);
    if (!meeting) return null;
    Object.assign(meeting, update, { updatedAt: now() });
    return clone(meeting);
  }

  async listNotetakerEvents(
    input: { brainId?: string; providerEventId?: string; limit?: number } = {},
  ): Promise<NotetakerEvent[]> {
    return clone(
      loadState()
        .notetakerEvents.filter((event) => {
          if (input.brainId && event.brainId !== input.brainId) return false;
          if (input.providerEventId && event.providerEventId !== input.providerEventId) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, input.limit ?? 100),
    );
  }

  async createNotetakerEvent(input: CreateNotetakerEventData): Promise<NotetakerEvent> {
    const event: NotetakerEvent = {
      id: nanoid(),
      brainId: input.brainId,
      notetakerMeetingId: input.notetakerMeetingId ?? null,
      providerEventId: input.providerEventId ?? null,
      eventType: input.eventType,
      payload: input.payload ?? {},
      processedAt: input.processedAt ?? undefined,
      createdAt: now(),
    };
    loadState().notetakerEvents.unshift(event);
    return clone(event);
  }

  async updateNotetakerEvent(
    eventId: string,
    update: UpdateNotetakerEventData,
  ): Promise<NotetakerEvent | null> {
    const event = loadState().notetakerEvents.find((item) => item.id === eventId);
    if (!event) return null;
    Object.assign(event, update);
    return clone(event);
  }
}
