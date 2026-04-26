export const dailyBriefSystemPrompt = `You are the Daily Brief Agent for Arvya Deal OS. You generate a concise daily brief from source-backed memory objects and first-class open loops.

Hard rules:
- Use only the context provided. Do not invent items.
- Treat only approved/open loops as true action items. Do not promote loops that still need review.
- Prioritize open, in-progress, or waiting loops, overdue or high-priority items, recent decisions, and high-confidence insights.
- If memory is sparse, say so honestly. Never pad.
- priorities may reference memory object ids or open loop ids in memoryIds.

Output a structured JSON object via the provided schema.`;

export function buildDailyBriefPrompt(input: {
  brainName: string;
  brainKind: string;
  brainThesis: string;
  memoryObjects: Array<{
    id: string;
    objectType: string;
    name: string;
    description: string;
    confidence: number;
    status?: string;
    sourceTitle: string;
    createdAt: string;
  }>;
  openLoops: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    owner?: string;
    dueDate?: string;
    sourceTitle: string;
    createdAt: string;
  }>;
}): string {
  const memoryBlocks = input.memoryObjects
    .map(
      (memory) => `<memory_object id="${escapeXml(memory.id)}" type="${escapeXml(memory.objectType)}" confidence="${memory.confidence.toFixed(2)}"${memory.status ? ` status="${escapeXml(memory.status)}"` : ""} source="${escapeXml(memory.sourceTitle)}" createdAt="${escapeXml(memory.createdAt)}">
  <name>${escapeXml(memory.name)}</name>
  <description>${escapeXml(memory.description)}</description>
</memory_object>`,
    )
    .join("\n");

  const loopBlocks = input.openLoops
    .map(
      (loop) => `<open_loop id="${escapeXml(loop.id)}" status="${escapeXml(loop.status)}" priority="${escapeXml(loop.priority)}"${loop.owner ? ` owner="${escapeXml(loop.owner)}"` : ""}${loop.dueDate ? ` dueDate="${escapeXml(loop.dueDate)}"` : ""} source="${escapeXml(loop.sourceTitle)}" createdAt="${escapeXml(loop.createdAt)}">
  <title>${escapeXml(loop.title)}</title>
  <description>${escapeXml(loop.description)}</description>
</open_loop>`,
    )
    .join("\n");

  return `<brain>
<name>${escapeXml(input.brainName)}</name>
<kind>${escapeXml(input.brainKind)}</kind>
<thesis>${escapeXml(input.brainThesis)}</thesis>
</brain>

<memory_objects>
${memoryBlocks || "(none)"}
</memory_objects>

<open_loops>
${loopBlocks || "(none)"}
</open_loops>

Generate the daily brief using the structured output schema.`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
