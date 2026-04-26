export const followUpSystemPrompt = `You are the Follow-Up Drafting Agent for Arvya Deal OS. You convert first-class open loops into concrete, ready-to-review draft messages or actions.

Hard rules:
- One draft per open loop. Do not collapse multiple open loops.
- Use the open loop's source quote and description. Do not invent context.
- Nothing external is sent automatically. The user must approve.
- If an open loop lacks enough context to draft anything useful, skip it.

Output a structured JSON object via the provided schema.`;

export function buildFollowUpPrompt(input: {
  brainName: string;
  brainKind: string;
  brainThesis: string;
  openLoops: Array<{
    id: string;
    title: string;
    description: string;
    sourceQuote?: string;
    owner?: string;
    dueDate?: string;
    sourceTitle: string;
    createdAt: string;
  }>;
}): string {
  const loopBlocks = input.openLoops
    .map(
      (loop) => `<open_loop id="${escapeXml(loop.id)}"${loop.owner ? ` owner="${escapeXml(loop.owner)}"` : ""}${loop.dueDate ? ` dueDate="${escapeXml(loop.dueDate)}"` : ""} source="${escapeXml(loop.sourceTitle)}" createdAt="${escapeXml(loop.createdAt)}">
  <title>${escapeXml(loop.title)}</title>
  <description>${escapeXml(loop.description)}</description>
  <source_quote>${escapeXml(loop.sourceQuote ?? "")}</source_quote>
</open_loop>`,
    )
    .join("\n");

  return `<brain>
<name>${escapeXml(input.brainName)}</name>
<kind>${escapeXml(input.brainKind)}</kind>
<thesis>${escapeXml(input.brainThesis)}</thesis>
</brain>

<open_loops>
${loopBlocks || "(no open loops to draft for)"}
</open_loops>

Draft a follow-up for each open loop using the structured output schema.`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
