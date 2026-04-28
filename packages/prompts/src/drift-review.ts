export const driftReviewSystemPrompt = `You are the Company Drift Review Agent for Arvya Deal OS.
Your job: compare current activity against the founders' stated priorities, customer commitments, investor narrative, product roadmap, and open risks. Then surface contradictions, stale priorities, missing owners, and work that no longer matches the plan.

Hard rules:
- Use ONLY the context provided. NEVER invent priorities, commitments, owners, customers, or quotes.
- Every signal MUST cite real ids: source_refs from <source id="..."> attributes, memory_refs from <memory id="..."> attributes, priority_refs from <priority id="..."> attributes shown in the context.
- Each signal must be specific. "Things are off-track" is bad; "We promised customer Acme a follow-up two weeks ago, no open loop owner, no recent memory shows progress" is good.
- Map each signal to one of these types:
  - commitment_dropped: a stated commitment (in priority or memory) has no recent matching activity, no owner, or an open loop went stale.
  - insight_unaddressed: an insight or piece of customer/investor feedback recurs but isn't reflected on the roadmap or in current work.
  - objection_recurring: a customer or investor objection keeps appearing without a narrative change or new evidence to counter it.
  - priority_drifting: stated priority diverges from current memory/sources/open loops (e.g., priority says X, work shows Y).
  - owner_missing: a commitment, follow-up, or open loop has no clear owner.
  - narrative_stale: the team is repeating the same investor/customer talking points despite new contradictory data.
- Severity:
  - high: customer/investor commitment dropped or live deal/funding risk; or a priority is being directly contradicted.
  - medium: drift exists but not yet causing visible harm; objection recurring without action.
  - low: emerging signal or recently uncovered.
- Recommend ONE concrete next action per signal — short, imperative ("Schedule a 1:1 with PB to assign the Acme follow-up"), and a recommended_owner (naveen / pb / system) when obvious.
- overall_alignment:
  - aligned: no high-severity signals and very few medium signals.
  - minor_drift: a few medium signals or one high signal that has a clear fix.
  - major_drift: multiple high signals across categories, or a stated priority is being ignored.
- summary_for_founders: 3-6 sentences for Naveen + PB. Start with the alignment verdict. State the most important drift first. Be candid and specific.
- If there is genuinely no drift, return signals: [] and overall_alignment: "aligned" with a short summary saying so. Do not pad.

Output a single JSON object that matches the provided schema. No prose outside the JSON.`;

export type DriftPriorityContext = {
  id: string;
  statement: string;
  setBy: string;
  horizon: string;
  status: string;
  setAt: string;
  ageDays: number;
};

export type DriftMemoryContext = {
  id: string;
  objectType: string;
  name: string;
  description: string;
  status?: string;
  confidence: number;
  ageDays: number;
  sourceItemId?: string;
  sourceTitle: string;
  createdAt: string;
  entitiesMentioned?: string[];
};

export type DriftOpenLoopContext = {
  id: string;
  title: string;
  description: string;
  loopType: string;
  status: string;
  priority: string;
  owner?: string;
  dueDate?: string;
  daysOverdue?: number;
  isOverdue?: boolean;
  ageDays: number;
  sourceTitle: string;
  closedAt?: string;
};

export type DriftSourceContext = {
  id: string;
  title: string;
  type: string;
  createdAt: string;
  ageDays: number;
};

export function buildDriftReviewPrompt(input: {
  brainName: string;
  brainKind: string;
  brainThesis: string;
  todayIso: string;
  activePriorities: DriftPriorityContext[];
  recentMemory: DriftMemoryContext[];
  openLoops: DriftOpenLoopContext[];
  recentSources: DriftSourceContext[];
}): string {
  const priorityBlocks = input.activePriorities
    .map(
      (priority) => `<priority id="${escapeXml(priority.id)}" set_by="${escapeXml(priority.setBy)}" horizon="${escapeXml(priority.horizon)}" status="${escapeXml(priority.status)}" set_at="${escapeXml(priority.setAt)}" age_days="${priority.ageDays}">
  <statement>${escapeXml(priority.statement)}</statement>
</priority>`,
    )
    .join("\n");

  const memoryBlocks = input.recentMemory
    .map(
      (memory) => `<memory id="${escapeXml(memory.id)}" type="${escapeXml(memory.objectType)}" confidence="${memory.confidence.toFixed(2)}" age_days="${memory.ageDays}"${memory.status ? ` status="${escapeXml(memory.status)}"` : ""}${memory.sourceItemId ? ` source_id="${escapeXml(memory.sourceItemId)}"` : ""} source_title="${escapeXml(memory.sourceTitle)}" created_at="${escapeXml(memory.createdAt)}">
  <name>${escapeXml(memory.name)}</name>
  <description>${escapeXml(memory.description)}</description>${
    memory.entitiesMentioned && memory.entitiesMentioned.length > 0
      ? `\n  <entities>${memory.entitiesMentioned.map(escapeXml).join(", ")}</entities>`
      : ""
  }
</memory>`,
    )
    .join("\n");

  const openLoopBlocks = input.openLoops
    .map(
      (loop) => `<open_loop id="${escapeXml(loop.id)}" loop_type="${escapeXml(loop.loopType)}" status="${escapeXml(loop.status)}" priority="${escapeXml(loop.priority)}"${loop.owner ? ` owner="${escapeXml(loop.owner)}"` : " owner=\"unassigned\""}${loop.dueDate ? ` due_date="${escapeXml(loop.dueDate)}"` : ""}${loop.isOverdue ? ` overdue="true" days_overdue="${loop.daysOverdue ?? 0}"` : ""} age_days="${loop.ageDays}" source="${escapeXml(loop.sourceTitle)}">
  <title>${escapeXml(loop.title)}</title>
  <description>${escapeXml(loop.description)}</description>
</open_loop>`,
    )
    .join("\n");

  const sourceBlocks = input.recentSources
    .map(
      (source) => `<source id="${escapeXml(source.id)}" type="${escapeXml(source.type)}" created_at="${escapeXml(source.createdAt)}" age_days="${source.ageDays}">${escapeXml(source.title)}</source>`,
    )
    .join("\n");

  return `<brain>
<name>${escapeXml(input.brainName)}</name>
<kind>${escapeXml(input.brainKind)}</kind>
<thesis>${escapeXml(input.brainThesis)}</thesis>
</brain>

<today>${escapeXml(input.todayIso)}</today>

<active_priorities>
${priorityBlocks || "(none)"}
</active_priorities>

<recent_memory window="last_14_days">
${memoryBlocks || "(none)"}
</recent_memory>

<open_loops>
${openLoopBlocks || "(none)"}
</open_loops>

<recent_sources window="last_14_days">
${sourceBlocks || "(none)"}
</recent_sources>

Now compare the founders' stated priorities, commitments, customer/investor signals, and open loops to current memory and sources. Find drift. Output the structured drift review JSON.

Reminders:
- For each signal, cite at least one of: source_refs, memory_refs, priority_refs (priority_refs are the IDs from <active_priorities>).
- If a stated priority has zero matching memory/source/open loop activity in the last 14 days, that is a strong priority_drifting signal.
- If a customer / investor / advisor commitment exists in memory but no open_loop has matching status open / in_progress / waiting, that is a commitment_dropped signal.
- If a recurring objection or insight appears across multiple memories but no priority/loop addresses it, that is insight_unaddressed or objection_recurring.
- Only emit narrative_stale when there is concrete evidence: same talking point appearing despite contradictory new data.
- recommended_owner = "naveen" for CEO/strategy/customer/investor moves; "pb" for engineering/architecture/ops; "system" only when this is a process fix Arvya OS itself should run automatically.`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
