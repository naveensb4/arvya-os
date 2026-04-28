import {
  structuredDailyBriefSchema,
  type AiClient,
  type Brain,
  type DailyBrief,
  type MemoryObject,
  type OpenLoop,
  type Priority,
  type SourceItem,
  type StructuredDailyBrief,
} from "@arvya/core";
import {
  buildDailyBriefPrompt,
  dailyBriefSystemPrompt,
  type DailyBriefMemoryContextItem,
  type DailyBriefOpenLoopContextItem,
  type DailyBriefPriorityContextItem,
  type DailyBriefSourceContextItem,
} from "@arvya/prompts/daily-brief";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAILY_BRIEF_AI_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function ageInDays(iso: string, now: number): number {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.floor((now - ts) / MS_PER_DAY));
}

function memoryRank(memory: MemoryObject) {
  const outcomeBoost = memory.properties?.memory_source === "open_loop_outcome" ? 2 : 0;
  const confidence = memory.confidence ?? 0.7;
  const recency = new Date(memory.createdAt).getTime() / 1_000_000_000_000;
  return outcomeBoost + confidence + recency;
}

function isWithinDays(iso: string, now: number, days: number): boolean {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  return now - ts <= days * MS_PER_DAY;
}

type LoopFlags = {
  isOverdue: boolean;
  isDueSoon: boolean;
  daysOverdue?: number;
  daysUntilDue?: number;
};

function classifyLoop(loop: OpenLoop, nowMs: number, dueSoonWindowDays = 3): LoopFlags {
  if (!loop.dueDate) return { isOverdue: false, isDueSoon: false };
  const due = Date.parse(loop.dueDate);
  if (Number.isNaN(due)) return { isOverdue: false, isDueSoon: false };
  const isClosedStatus =
    loop.status === "done" || loop.status === "dismissed" || loop.status === "closed";
  if (isClosedStatus) return { isOverdue: false, isDueSoon: false };
  const diffDays = Math.floor((due - nowMs) / MS_PER_DAY);
  if (diffDays < 0) {
    return { isOverdue: true, isDueSoon: false, daysOverdue: -diffDays };
  }
  if (diffDays <= dueSoonWindowDays) {
    return { isOverdue: false, isDueSoon: true, daysUntilDue: diffDays };
  }
  return { isOverdue: false, isDueSoon: false };
}

function entitiesFromMemory(memory: MemoryObject): string[] | undefined {
  const raw = memory.properties?.entities_mentioned ?? memory.properties?.entitiesMentioned;
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string");
  }
  return undefined;
}

export type BuildDailyBriefInput = {
  brain: Brain;
  memoryObjects: MemoryObject[];
  openLoops: OpenLoop[];
  sourceItems: SourceItem[];
  activePriorities?: Priority[];
  recentAgentRunsLast24h?: number;
  now?: Date;
  ai?: AiClient;
};

export async function buildDailyBrief(input: BuildDailyBriefInput): Promise<DailyBrief> {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const todayIso = now.toISOString().slice(0, 10);

  const sourcesById = new Map(input.sourceItems.map((source) => [source.id, source]));

  const decisions = input.memoryObjects
    .filter((memory) => memory.objectType === "decision")
    .slice(0, 3);
  const insights = input.memoryObjects
    .filter((memory) => memory.objectType === "insight" || memory.objectType === "product_insight")
    .slice(0, 4);

  const actionableLoopStatuses = new Set(["open", "in_progress", "waiting"]);
  const actionableOpenLoops = input.openLoops
    .filter((loop) => actionableLoopStatuses.has(loop.status))
    .slice(0, 25);
  const loopsToReview = input.openLoops
    .filter((loop) => loop.status === "needs_review")
    .slice(0, 10);

  const enrichedLoops: DailyBriefOpenLoopContextItem[] = actionableOpenLoops.map((loop) => {
    const flags = classifyLoop(loop, nowMs);
    return {
      id: loop.id,
      title: loop.title,
      description: loop.description,
      status: loop.status,
      priority: loop.priority,
      owner: loop.owner,
      loopType: loop.loopType,
      dueDate: loop.dueDate,
      isOverdue: flags.isOverdue,
      isDueSoon: flags.isDueSoon,
      daysOverdue: flags.daysOverdue,
      daysUntilDue: flags.daysUntilDue,
      sourceTitle: sourcesById.get(loop.sourceItemId ?? "")?.title ?? "Unknown source",
      createdAt: loop.createdAt,
    };
  });

  const enrichedReviewLoops: DailyBriefOpenLoopContextItem[] = loopsToReview.map((loop) => ({
    id: loop.id,
    title: loop.title,
    description: loop.description,
    status: loop.status,
    priority: loop.priority,
    owner: loop.owner,
    loopType: loop.loopType,
    dueDate: loop.dueDate,
    sourceTitle: sourcesById.get(loop.sourceItemId ?? "")?.title ?? "Unknown source",
    createdAt: loop.createdAt,
  }));

  const recentMemoryWindow = 7;
  const recentMemoryAll = [...input.memoryObjects]
    .filter((memory) => isWithinDays(memory.createdAt, nowMs, recentMemoryWindow + 1))
    .sort((a, b) => memoryRank(b) - memoryRank(a))
    .slice(0, 80);

  const toContextMemory = (memory: MemoryObject): DailyBriefMemoryContextItem => ({
    id: memory.id,
    objectType: memory.objectType,
    name: memory.name,
    description: memory.description,
    confidence: memory.confidence ?? 0.7,
    status: memory.status,
    sourceItemId: memory.sourceItemId,
    sourceTitle: sourcesById.get(memory.sourceItemId ?? "")?.title ?? "Unknown source",
    createdAt: memory.createdAt,
    ageDays: ageInDays(memory.createdAt, nowMs),
    entitiesMentioned: entitiesFromMemory(memory),
  });

  const recentMemoryByKind = {
    insights: recentMemoryAll.filter((m) => m.objectType === "insight").map(toContextMemory),
    risks: recentMemoryAll.filter((m) => m.objectType === "risk").map(toContextMemory),
    commitments: recentMemoryAll.filter((m) => m.objectType === "commitment").map(toContextMemory),
    customer_feedback: recentMemoryAll
      .filter((m) => m.objectType === "customer_feedback")
      .map(toContextMemory),
    investor_feedback: recentMemoryAll
      .filter((m) => m.objectType === "investor_feedback")
      .map(toContextMemory),
    advisor_feedback: recentMemoryAll
      .filter((m) => m.objectType === "advisor_feedback")
      .map(toContextMemory),
    product_insights: recentMemoryAll
      .filter((m) => m.objectType === "product_insight")
      .map(toContextMemory),
    marketing_ideas: recentMemoryAll
      .filter((m) => m.objectType === "marketing_idea")
      .map(toContextMemory),
    decisions: recentMemoryAll.filter((m) => m.objectType === "decision").map(toContextMemory),
    questions: recentMemoryAll.filter((m) => m.objectType === "question").map(toContextMemory),
    other: recentMemoryAll
      .filter(
        (m) =>
          ![
            "insight",
            "risk",
            "commitment",
            "customer_feedback",
            "investor_feedback",
            "advisor_feedback",
            "product_insight",
            "marketing_idea",
            "decision",
            "question",
          ].includes(m.objectType),
      )
      .map(toContextMemory),
  };

  const recentSources: DailyBriefSourceContextItem[] = input.sourceItems
    .filter((source) => isWithinDays(source.createdAt, nowMs, recentMemoryWindow + 1))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 25)
    .map((source) => ({
      id: source.id,
      title: source.title,
      type: source.type,
      createdAt: source.createdAt,
    }));

  const activePriorities = (input.activePriorities ?? []).filter(
    (priority) => priority.status === "active",
  );
  const priorityContext: DailyBriefPriorityContextItem[] = activePriorities.map((priority) => ({
    id: priority.id,
    statement: priority.statement,
    setBy: priority.setBy,
    horizon: priority.horizon,
    status: priority.status,
    setAt: priority.setAt,
  }));

  const recentOutcomeMemories = input.memoryObjects
    .filter((memory) => memory.properties?.memory_source === "open_loop_outcome")
    .slice(0, 5);

  const overdueCount = enrichedLoops.filter((loop) => loop.isOverdue).length;
  const dueSoonCount = enrichedLoops.filter((loop) => loop.isDueSoon).length;

  const fallbackHeadline =
    overdueCount > 0
      ? `${overdueCount} overdue follow-up${overdueCount === 1 ? "" : "s"} need attention`
      : actionableOpenLoops.length > 0
        ? `${actionableOpenLoops.length} approved open loop${actionableOpenLoops.length === 1 ? "" : "s"} need attention`
        : loopsToReview.length > 0
          ? `${loopsToReview.length} new loop${loopsToReview.length === 1 ? "" : "s"} need review`
          : "Brain memory is current";

  const fallbackSummary = `${input.brain.name} has ${input.memoryObjects.length} memory objects, ${activePriorities.length} active priorities, ${actionableOpenLoops.length} approved open loops (${overdueCount} overdue, ${dueSoonCount} due soon), ${loopsToReview.length} new loops to review, and ${recentOutcomeMemories.length} recent outcome learning${recentOutcomeMemories.length === 1 ? "" : "s"}. Add sources or configure an AI key for richer synthesis.`;

  const fallbackPriorities = activePriorities.length > 0
    ? activePriorities.slice(0, 5).map((priority) => ({
        title: priority.statement,
        detail: `${priority.setBy} • ${priority.horizon}`,
        sourceItemIds: priority.sourceRefs ?? [],
      }))
    : actionableOpenLoops.slice(0, 5).map((loop) => ({
        title: loop.title,
        detail: loop.description,
        sourceItemIds: loop.sourceItemId ? [loop.sourceItemId] : [],
      }));

  const fallbackStructured: StructuredDailyBrief = {
    date: todayIso,
    top_priorities_today:
      activePriorities.length > 0
        ? activePriorities.slice(0, 5).map((priority) => ({
            priority_id: priority.id,
            statement: priority.statement,
            why_today: `${priority.horizon} priority set by ${priority.setBy}`,
          }))
        : actionableOpenLoops.slice(0, 3).map((loop) => ({
            statement: loop.title,
            why_today: loop.description.slice(0, 240),
          })),
    overdue_follow_ups: enrichedLoops
      .filter((loop) => loop.isOverdue)
      .map((loop) => ({
        open_loop_id: loop.id,
        title: loop.title,
        owner: loop.owner ?? "unassigned",
        days_overdue: loop.daysOverdue ?? 0,
      })),
    due_soon: enrichedLoops
      .filter((loop) => loop.isDueSoon)
      .map((loop) => ({
        open_loop_id: loop.id,
        title: loop.title,
        due_in_days: loop.daysUntilDue ?? 0,
      })),
    high_intent_relationships: [],
    product_insights_to_act_on: recentMemoryByKind.product_insights.slice(0, 5).map((memory) => ({
      insight: memory.name,
      source_refs: memory.sourceItemId ? [memory.sourceItemId] : [],
    })),
    marketing_opportunities: recentMemoryByKind.marketing_ideas.slice(0, 5).map((memory) => ({
      idea: memory.name,
      source_refs: memory.sourceItemId ? [memory.sourceItemId] : [],
    })),
    risks_and_dropped_balls: recentMemoryByKind.risks.slice(0, 5).map((memory) => ({
      description: memory.name,
      source_refs: memory.sourceItemId ? [memory.sourceItemId] : [],
      severity: "medium" as const,
    })),
    suggested_actions_naveen: actionableOpenLoops
      .filter((loop) => (loop.owner ?? "").toLowerCase().includes("naveen"))
      .slice(0, 3)
      .map((loop) => ({
        action: loop.suggestedAction ?? loop.title,
        source_refs: loop.sourceItemId ? [loop.sourceItemId] : undefined,
      })),
    suggested_actions_pb: actionableOpenLoops
      .filter((loop) => (loop.owner ?? "").toLowerCase().includes("pb"))
      .slice(0, 3)
      .map((loop) => ({
        action: loop.suggestedAction ?? loop.title,
        source_refs: loop.sourceItemId ? [loop.sourceItemId] : undefined,
      })),
    questions_to_resolve: recentMemoryByKind.questions.slice(0, 3).map((memory) => ({
      question: memory.name,
      why_now: memory.description.slice(0, 240),
    })),
    generated_at: now.toISOString(),
  };

  if (input.ai?.available) {
    try {
      const result = await withTimeout(
        input.ai.completeStructured({
          system: dailyBriefSystemPrompt,
          prompt: buildDailyBriefPrompt({
            brainName: input.brain.name,
            brainKind: input.brain.kind,
            brainThesis: input.brain.thesis,
            todayIso,
            activePriorities: priorityContext,
            openLoops: enrichedLoops,
            loopsToReview: enrichedReviewLoops,
            recentMemoryByKind,
            recentSources,
            recentAgentRunsLast24h: input.recentAgentRunsLast24h ?? 0,
          }),
          schema: structuredDailyBriefSchema,
          schemaName: "structured_daily_brief",
          schemaDescription:
            "A source-backed structured daily founder brief covering priorities, follow-ups, relationships, insights, risks, suggested actions, and questions.",
          maxTokens: 3200,
        }),
        DAILY_BRIEF_AI_TIMEOUT_MS,
        "Daily brief structured generation",
      );

      const structured: StructuredDailyBrief = {
        ...result.data,
        date: result.data.date || todayIso,
        generated_at: result.data.generated_at || now.toISOString(),
      };

      const headline =
        structured.top_priorities_today[0]?.statement ?? fallbackHeadline;
      const summary = `${structured.top_priorities_today.length} priorit${structured.top_priorities_today.length === 1 ? "y" : "ies"} today; ${structured.overdue_follow_ups.length} overdue, ${structured.due_soon.length} due soon; ${structured.risks_and_dropped_balls.length} risk${structured.risks_and_dropped_balls.length === 1 ? "" : "s"} tracked, ${structured.questions_to_resolve.length} open question${structured.questions_to_resolve.length === 1 ? "" : "s"}.`;

      const priorities = structured.top_priorities_today.length > 0
        ? structured.top_priorities_today.map((priority) => ({
            title: priority.statement,
            detail: priority.why_today,
            sourceItemIds: priority.priority_id ? [priority.priority_id] : [],
          }))
        : fallbackPriorities;

      return {
        brainId: input.brain.id,
        generatedAt: structured.generated_at,
        headline,
        summary,
        priorities,
        decisions,
        insights,
        actions: actionableOpenLoops,
        openLoops: actionableOpenLoops,
        loopsToReview,
        structured,
      };
    } catch (error) {
      // Fall through to fallback if AI fails.
      console.warn(
        "buildDailyBrief: structured AI generation failed, falling back to deterministic brief.",
        error,
      );
    }
  }

  return {
    brainId: input.brain.id,
    generatedAt: now.toISOString(),
    headline: fallbackHeadline,
    summary: fallbackSummary,
    priorities: fallbackPriorities,
    decisions,
    insights: [...recentOutcomeMemories, ...insights].slice(0, 4),
    actions: actionableOpenLoops,
    openLoops: actionableOpenLoops,
    loopsToReview,
    structured: fallbackStructured,
  };
}
