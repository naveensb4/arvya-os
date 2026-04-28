import {
  driftReviewSchema,
  type AiClient,
  type Brain,
  type DriftReview,
  type MemoryObject,
  type OpenLoop,
  type Priority,
  type SourceItem,
} from "@arvya/core";
import {
  buildDriftReviewPrompt,
  driftReviewSystemPrompt,
  type DriftMemoryContext,
  type DriftOpenLoopContext,
  type DriftPriorityContext,
  type DriftSourceContext,
} from "@arvya/prompts/drift-review";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MEMORY_WINDOW_DAYS = 14;
const SOURCE_WINDOW_DAYS = 14;

function ageInDays(iso: string, nowMs: number): number {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.floor((nowMs - ts) / MS_PER_DAY));
}

function isWithinDays(iso: string, nowMs: number, days: number): boolean {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  return nowMs - ts <= days * MS_PER_DAY;
}

function entitiesFromMemory(memory: MemoryObject): string[] | undefined {
  const raw = memory.properties?.entities_mentioned ?? memory.properties?.entitiesMentioned;
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string");
  }
  return undefined;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }
  const unionSize = a.size + b.size - intersection;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

export type BuildDriftReviewInput = {
  brain: Brain;
  activePriorities: Priority[];
  memoryObjects: MemoryObject[];
  openLoops: OpenLoop[];
  sourceItems: SourceItem[];
  now?: Date;
  ai?: AiClient;
};

export async function buildDriftReview(input: BuildDriftReviewInput): Promise<DriftReview> {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const sourcesById = new Map(input.sourceItems.map((source) => [source.id, source]));

  const recentMemory = input.memoryObjects
    .filter((memory) => isWithinDays(memory.createdAt, nowMs, MEMORY_WINDOW_DAYS + 1))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 80);

  const recentSources = input.sourceItems
    .filter((source) => isWithinDays(source.createdAt, nowMs, SOURCE_WINDOW_DAYS + 1))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);

  const activeOpenLoops = input.openLoops
    .filter(
      (loop) =>
        loop.status === "open" ||
        loop.status === "in_progress" ||
        loop.status === "waiting" ||
        loop.status === "needs_review",
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 60);

  const priorityContext: DriftPriorityContext[] = input.activePriorities
    .filter((priority) => priority.status === "active")
    .map((priority) => ({
      id: priority.id,
      statement: priority.statement,
      setBy: priority.setBy,
      horizon: priority.horizon,
      status: priority.status,
      setAt: priority.setAt,
      ageDays: ageInDays(priority.setAt, nowMs),
    }));

  const memoryContext: DriftMemoryContext[] = recentMemory.map((memory) => ({
    id: memory.id,
    objectType: memory.objectType,
    name: memory.name,
    description: memory.description,
    status: memory.status,
    confidence: memory.confidence ?? 0.7,
    ageDays: ageInDays(memory.createdAt, nowMs),
    sourceItemId: memory.sourceItemId,
    sourceTitle: sourcesById.get(memory.sourceItemId ?? "")?.title ?? "Unknown source",
    createdAt: memory.createdAt,
    entitiesMentioned: entitiesFromMemory(memory),
  }));

  const openLoopContext: DriftOpenLoopContext[] = activeOpenLoops.map((loop) => {
    const due = loop.dueDate ? Date.parse(loop.dueDate) : NaN;
    const isOverdue = !Number.isNaN(due) && due < nowMs;
    return {
      id: loop.id,
      title: loop.title,
      description: loop.description,
      loopType: loop.loopType,
      status: loop.status,
      priority: loop.priority,
      owner: loop.owner,
      dueDate: loop.dueDate,
      daysOverdue: isOverdue ? Math.floor((nowMs - due) / MS_PER_DAY) : undefined,
      isOverdue,
      ageDays: ageInDays(loop.createdAt, nowMs),
      sourceTitle: sourcesById.get(loop.sourceItemId ?? "")?.title ?? "Unknown source",
      closedAt: loop.closedAt,
    };
  });

  const sourceContext: DriftSourceContext[] = recentSources.map((source) => ({
    id: source.id,
    title: source.title,
    type: source.type,
    createdAt: source.createdAt,
    ageDays: ageInDays(source.createdAt, nowMs),
  }));

  if (input.ai?.available) {
    try {
      const result = await input.ai.completeStructured({
        system: driftReviewSystemPrompt,
        prompt: buildDriftReviewPrompt({
          brainName: input.brain.name,
          brainKind: input.brain.kind,
          brainThesis: input.brain.thesis,
          todayIso: now.toISOString(),
          activePriorities: priorityContext,
          recentMemory: memoryContext,
          openLoops: openLoopContext,
          recentSources: sourceContext,
        }),
        schema: driftReviewSchema,
        schemaName: "drift_review",
        schemaDescription:
          "Structured company drift review surfacing contradictions between stated priorities and current activity.",
        maxTokens: 3200,
      });

      return {
        ...result.data,
        generated_at: result.data.generated_at || now.toISOString(),
      };
    } catch (error) {
      console.warn(
        "buildDriftReview: structured AI generation failed, falling back to deterministic review.",
        error,
      );
    }
  }

  // Deterministic heuristic fallback when AI is unavailable.
  const signals: DriftReview["signals"] = [];

  const memoryTokensById = new Map<string, Set<string>>(
    memoryContext.map((memory) => [
      memory.id,
      tokenize(`${memory.name} ${memory.description}`),
    ]),
  );
  const loopTokensById = new Map<string, Set<string>>(
    openLoopContext.map((loop) => [loop.id, tokenize(`${loop.title} ${loop.description}`)]),
  );

  for (const priority of priorityContext) {
    const tokens = tokenize(priority.statement);
    const matchingMemory = memoryContext.filter((memory) => {
      const score = jaccard(tokens, memoryTokensById.get(memory.id) ?? new Set());
      return score > 0.08;
    });
    const matchingLoop = openLoopContext.filter((loop) => {
      const score = jaccard(tokens, loopTokensById.get(loop.id) ?? new Set());
      return score > 0.08;
    });
    if (matchingMemory.length === 0 && matchingLoop.length === 0) {
      signals.push({
        type: "priority_drifting",
        severity: priority.ageDays > 7 ? "high" : "medium",
        summary: `Priority "${priority.statement.slice(0, 80)}" has no recent matching activity.`,
        detail: `Set ${priority.ageDays} day${priority.ageDays === 1 ? "" : "s"} ago by ${priority.setBy}, horizon ${priority.horizon}. No memory or open loops in the last ${MEMORY_WINDOW_DAYS} days reflect this work.`,
        source_refs: [],
        memory_refs: [],
        priority_refs: [priority.id],
        recommended_action:
          priority.setBy === "naveen"
            ? "Naveen and PB review whether this priority is still real or should be retired."
            : "Bring this back to the next founders sync and confirm ownership and current state.",
        recommended_owner: "naveen",
      });
    }
  }

  // Helper: find the source id behind a given open loop via the originating loop record.
  const loopSourceById = new Map<string, string | undefined>(
    input.openLoops.map((loop) => [loop.id, loop.sourceItemId]),
  );
  // Helper: find memory ids that strongly match a given open loop.
  function memoryRefsForLoop(loopId: string): string[] {
    const tokens = loopTokensById.get(loopId) ?? new Set();
    return memoryContext
      .filter((memory) => jaccard(tokens, memoryTokensById.get(memory.id) ?? new Set()) > 0.1)
      .map((memory) => memory.id);
  }

  for (const loop of openLoopContext) {
    const loopSourceId = loopSourceById.get(loop.id);
    const loopMemoryRefs = memoryRefsForLoop(loop.id);
    if (!loop.owner && (loop.status === "open" || loop.status === "in_progress")) {
      signals.push({
        type: "owner_missing",
        severity: loop.isOverdue ? "high" : "medium",
        summary: `Open loop "${loop.title.slice(0, 80)}" has no owner.`,
        detail: `${loop.loopType} loop, status ${loop.status}, age ${loop.ageDays} day${loop.ageDays === 1 ? "" : "s"}.${loop.isOverdue ? ` Overdue by ${loop.daysOverdue} day${loop.daysOverdue === 1 ? "" : "s"}.` : ""}`,
        source_refs: loopSourceId ? [loopSourceId] : [],
        memory_refs: loopMemoryRefs.slice(0, 4),
        recommended_action: "Assign Naveen or PB as the explicit owner before next stand-up.",
        recommended_owner: "naveen",
      });
    }
    if (loop.isOverdue && (loop.daysOverdue ?? 0) > 3) {
      signals.push({
        type: "commitment_dropped",
        severity: (loop.daysOverdue ?? 0) > 7 ? "high" : "medium",
        summary: `Loop "${loop.title.slice(0, 80)}" is ${loop.daysOverdue} day${(loop.daysOverdue ?? 0) === 1 ? "" : "s"} overdue.`,
        detail: `${loop.loopType} loop with status ${loop.status}, owner ${loop.owner ?? "unassigned"}. Past due since ${loop.dueDate}.`,
        source_refs: loopSourceId ? [loopSourceId] : [],
        memory_refs: loopMemoryRefs.slice(0, 4),
        recommended_action: "Either close this loop with an outcome or re-commit a new due date today.",
        recommended_owner: loop.owner?.toLowerCase().includes("pb") ? "pb" : "naveen",
      });
    }
  }

  // Group commitments by entity to find dropped commitments without matching loops.
  const commitments = memoryContext.filter((memory) => memory.objectType === "commitment");
  for (const commitment of commitments) {
    const tokens = memoryTokensById.get(commitment.id) ?? new Set();
    const hasMatchingLoop = openLoopContext.some((loop) => {
      const score = jaccard(tokens, loopTokensById.get(loop.id) ?? new Set());
      return score > 0.1;
    });
    if (!hasMatchingLoop && commitment.ageDays >= 3) {
      signals.push({
        type: "commitment_dropped",
        severity: commitment.ageDays > 10 ? "high" : "medium",
        summary: `Commitment "${commitment.name.slice(0, 80)}" has no active loop.`,
        detail: `Captured ${commitment.ageDays} day${commitment.ageDays === 1 ? "" : "s"} ago. No active open loop currently tracks this commitment.`,
        source_refs: commitment.sourceItemId ? [commitment.sourceItemId] : [],
        memory_refs: [commitment.id],
        recommended_action: "Open a follow-up loop with a clear owner and due date.",
        recommended_owner: "naveen",
      });
    }
  }

  const highCount = signals.filter((s) => s.severity === "high").length;
  const mediumCount = signals.filter((s) => s.severity === "medium").length;
  const overall: DriftReview["overall_alignment"] =
    highCount >= 2 ? "major_drift" : highCount === 1 || mediumCount >= 2 ? "minor_drift" : "aligned";

  const summary =
    signals.length === 0
      ? `Arvya company brain is aligned: ${priorityContext.length} active priorit${priorityContext.length === 1 ? "y" : "ies"} all show recent matching activity. ${openLoopContext.length} open loops are tracked.`
      : `Found ${signals.length} drift signal${signals.length === 1 ? "" : "s"} (${highCount} high, ${mediumCount} medium). ${overall === "major_drift" ? "Major drift — pause new work until at least the high-severity items are owned." : overall === "minor_drift" ? "Minor drift — fixable inside one founders sync." : "Tracking only emerging signals."}`;

  return {
    generated_at: now.toISOString(),
    overall_alignment: overall,
    signals: signals.slice(0, 25),
    summary_for_founders: summary,
  };
}
