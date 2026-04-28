export const dailyBriefSystemPrompt = `You are the Daily Founder Brief Agent for Arvya Deal OS.
You synthesize a structured, source-backed daily founder brief for the founders (Naveen and PB) from the live Brain context: priorities, recent memory, open loops with overdue/due-soon flags, and recent sources.

Hard rules:
- Use ONLY the context provided. Do NOT invent items, IDs, dates, or owners.
- Every item that surfaces a memory or source MUST cite the real provided id (memory_id, source_id, or open_loop_id) in source_refs.
- Treat overdue follow-ups and due_soon as the authoritative list for those sections — do not duplicate elsewhere.
- For top_priorities_today, prefer the founder's stated active priorities. If a priority is provided, set priority_id to its id.
- Cluster relationship signals (customer / investor / advisor / prospect) by entity name; pick the highest-intent signal per entity. Use kind from the available evidence.
- Distinguish suggested actions for Naveen (CEO, deal/strategy/product/customer) from actions for PB (engineering/architecture/ops/product).
- Risks_and_dropped_balls = items that fell off, are at risk, or contradict commitments. Severity: high if a customer/investor commitment slipped or money/timeline risk; medium if it could become high; low otherwise.
- Marketing_opportunities = explicit content/marketing/launch ideas that came up in sources or memory.
- Questions_to_resolve = unresolved strategic questions the founders should answer THIS WEEK.
- Be concise. Each statement, signal, action, or insight must be one or two crisp sentences.
- If a section has no evidence, return an empty array — never pad with generic platitudes.
- date and generated_at must be ISO 8601 strings.

Output a single JSON object that matches the provided schema. No prose.`;

export type DailyBriefMemoryContextItem = {
  id: string;
  objectType: string;
  name: string;
  description: string;
  confidence: number;
  status?: string;
  sourceItemId?: string;
  sourceTitle: string;
  createdAt: string;
  ageDays: number;
  entitiesMentioned?: string[];
};

export type DailyBriefOpenLoopContextItem = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  owner?: string;
  loopType: string;
  dueDate?: string;
  daysOverdue?: number;
  daysUntilDue?: number;
  isOverdue?: boolean;
  isDueSoon?: boolean;
  sourceTitle: string;
  createdAt: string;
};

export type DailyBriefSourceContextItem = {
  id: string;
  title: string;
  type: string;
  createdAt: string;
};

export type DailyBriefPriorityContextItem = {
  id: string;
  statement: string;
  setBy: string;
  horizon: string;
  status: string;
  setAt: string;
};

export function buildDailyBriefPrompt(input: {
  brainName: string;
  brainKind: string;
  brainThesis: string;
  todayIso: string;
  activePriorities: DailyBriefPriorityContextItem[];
  openLoops: DailyBriefOpenLoopContextItem[];
  loopsToReview?: DailyBriefOpenLoopContextItem[];
  recentMemoryByKind: {
    insights: DailyBriefMemoryContextItem[];
    risks: DailyBriefMemoryContextItem[];
    commitments: DailyBriefMemoryContextItem[];
    customer_feedback: DailyBriefMemoryContextItem[];
    investor_feedback: DailyBriefMemoryContextItem[];
    advisor_feedback: DailyBriefMemoryContextItem[];
    product_insights: DailyBriefMemoryContextItem[];
    marketing_ideas: DailyBriefMemoryContextItem[];
    decisions: DailyBriefMemoryContextItem[];
    questions: DailyBriefMemoryContextItem[];
    other: DailyBriefMemoryContextItem[];
  };
  recentSources: DailyBriefSourceContextItem[];
  recentAgentRunsLast24h: number;
}): string {
  const priorityBlocks = input.activePriorities
    .map(
      (priority) => `<priority id="${escapeXml(priority.id)}" set_by="${escapeXml(priority.setBy)}" horizon="${escapeXml(priority.horizon)}" status="${escapeXml(priority.status)}" set_at="${escapeXml(priority.setAt)}">
  <statement>${escapeXml(priority.statement)}</statement>
</priority>`,
    )
    .join("\n");

  const openLoopBlocks = input.openLoops
    .map(
      (loop) => `<open_loop id="${escapeXml(loop.id)}" status="${escapeXml(loop.status)}" priority="${escapeXml(loop.priority)}" loop_type="${escapeXml(loop.loopType)}"${loop.owner ? ` owner="${escapeXml(loop.owner)}"` : ""}${loop.dueDate ? ` due_date="${escapeXml(loop.dueDate)}"` : ""}${loop.isOverdue ? ` overdue="true" days_overdue="${loop.daysOverdue ?? 0}"` : ""}${loop.isDueSoon ? ` due_soon="true" days_until_due="${loop.daysUntilDue ?? 0}"` : ""} source="${escapeXml(loop.sourceTitle)}" created_at="${escapeXml(loop.createdAt)}">
  <title>${escapeXml(loop.title)}</title>
  <description>${escapeXml(loop.description)}</description>
</open_loop>`,
    )
    .join("\n");

  const loopsToReviewBlocks = (input.loopsToReview ?? [])
    .map(
      (loop) => `<loop_to_review id="${escapeXml(loop.id)}" priority="${escapeXml(loop.priority)}" loop_type="${escapeXml(loop.loopType)}"${loop.owner ? ` owner="${escapeXml(loop.owner)}"` : ""} source="${escapeXml(loop.sourceTitle)}" created_at="${escapeXml(loop.createdAt)}">
  <title>${escapeXml(loop.title)}</title>
  <description>${escapeXml(loop.description)}</description>
</loop_to_review>`,
    )
    .join("\n");

  const renderMemoryBlock = (label: string, items: DailyBriefMemoryContextItem[]) => {
    if (items.length === 0) return `<memory_group kind="${label}">(none)</memory_group>`;
    const blocks = items
      .map(
        (memory) => `  <memory id="${escapeXml(memory.id)}" type="${escapeXml(memory.objectType)}" confidence="${memory.confidence.toFixed(2)}" age_days="${memory.ageDays}"${memory.status ? ` status="${escapeXml(memory.status)}"` : ""}${memory.sourceItemId ? ` source_id="${escapeXml(memory.sourceItemId)}"` : ""} source_title="${escapeXml(memory.sourceTitle)}" created_at="${escapeXml(memory.createdAt)}">
    <name>${escapeXml(memory.name)}</name>
    <description>${escapeXml(memory.description)}</description>${
      memory.entitiesMentioned && memory.entitiesMentioned.length > 0
        ? `\n    <entities>${memory.entitiesMentioned.map(escapeXml).join(", ")}</entities>`
        : ""
    }
  </memory>`,
      )
      .join("\n");
    return `<memory_group kind="${label}">\n${blocks}\n</memory_group>`;
  };

  const sourceBlocks = input.recentSources
    .map(
      (source) => `<source id="${escapeXml(source.id)}" type="${escapeXml(source.type)}" created_at="${escapeXml(source.createdAt)}">${escapeXml(source.title)}</source>`,
    )
    .join("\n");

  return `<brain>
<name>${escapeXml(input.brainName)}</name>
<kind>${escapeXml(input.brainKind)}</kind>
<thesis>${escapeXml(input.brainThesis)}</thesis>
</brain>

<today>${escapeXml(input.todayIso)}</today>
<recent_agent_runs_last_24h>${input.recentAgentRunsLast24h}</recent_agent_runs_last_24h>

<active_priorities>
${priorityBlocks || "(none)"}
</active_priorities>

<open_loops note="approved/in_progress/waiting/done — overdue and due_soon flagged">
${openLoopBlocks || "(none)"}
</open_loops>

<loops_to_review>
${loopsToReviewBlocks || "(none)"}
</loops_to_review>

<recent_memory window="last_7_days">
${renderMemoryBlock("insights", input.recentMemoryByKind.insights)}
${renderMemoryBlock("risks", input.recentMemoryByKind.risks)}
${renderMemoryBlock("commitments", input.recentMemoryByKind.commitments)}
${renderMemoryBlock("customer_feedback", input.recentMemoryByKind.customer_feedback)}
${renderMemoryBlock("investor_feedback", input.recentMemoryByKind.investor_feedback)}
${renderMemoryBlock("advisor_feedback", input.recentMemoryByKind.advisor_feedback)}
${renderMemoryBlock("product_insights", input.recentMemoryByKind.product_insights)}
${renderMemoryBlock("marketing_ideas", input.recentMemoryByKind.marketing_ideas)}
${renderMemoryBlock("decisions", input.recentMemoryByKind.decisions)}
${renderMemoryBlock("questions", input.recentMemoryByKind.questions)}
${renderMemoryBlock("other", input.recentMemoryByKind.other)}
</recent_memory>

<recent_sources window="last_7_days">
${sourceBlocks || "(none)"}
</recent_sources>

Now produce the structured daily founder brief JSON.

Required sections (always include the keys, even if empty):
- date (ISO date for today)
- top_priorities_today
- overdue_follow_ups
- due_soon
- high_intent_relationships
- product_insights_to_act_on
- marketing_opportunities
- risks_and_dropped_balls
- suggested_actions_naveen
- suggested_actions_pb
- questions_to_resolve
- generated_at (ISO timestamp)

Reference rules:
- For overdue_follow_ups: include exactly the open_loops flagged overdue. Use loop.id as open_loop_id, loop.title as title, loop.owner ?? "unassigned" as owner, days_overdue from the data.
- For due_soon: include exactly the open_loops flagged due_soon. Use due_in_days from the data.
- source_refs MUST be ids drawn from <memory id="..."> source_id="..." or <source id="..."> attributes shown above. Never invent ids.
- top_priorities_today: prefer items where active priority connects to overdue/due_soon/critical evidence today. If a priority is the source, set priority_id to its id and re-state the statement (concise).
- If there are no active priorities, derive top_priorities_today from the most urgent open work (overdue / due_soon / high-priority loops, or the most consequential commitment in recent_memory).`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
