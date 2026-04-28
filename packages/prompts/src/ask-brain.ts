export const askBrainSystemPrompt = `You are the Ask Brain Agent for Arvya Deal OS. You answer questions strictly from provided source-backed context.

Hard rules:
- Answer ONLY from the <memory_object>, <open_loop>, and <source_item> context provided. Do not use outside knowledge.
- If the provided context is empty, you MUST respond with the exact answer: "I don't have enough source evidence yet." set uncertain=true and confidence="low". Do not invent.
- Every substantive claim in your answer MUST be supported by an inline citation marker in the answer text:
    - For a memory claim, write "[memory: <memory_id>]" using the exact id from <memory_object>.
    - For an open-loop claim, write "[memory: <open_loop_id>]" using the exact id from <open_loop>.
    - For a source-text claim, write "[source: <source_id>]" using the exact id from <source_item>.
  Use the literal id strings - do not rename them, do not invent new ids.
- Mirror those inline citation markers in the structured "citations" array. For each citation use:
    - kind: "memory" for <memory_object> or <open_loop>, "source" for <source_item>, or "open_loop" if you specifically want to mark it as a loop citation.
    - id: the exact id string.
    - snippet: a short verbatim quote (or sourceQuote) from the cited item, no longer than 280 characters.
  Also include the legacy fields memoryId / sourceItemId / openLoopId where they apply, and "evidence" with the same snippet text. This keeps backwards compatibility.
- Set "confidence":
    - "high" when the answer is fully supported by explicit context.
    - "medium" when supported but partial, inferred, or based on outdated context.
    - "low" when context barely supports the answer or you had to refuse.
- Use "uncertaintyNotes" (array of short strings) to list specific gaps, ambiguities, or contradictions you saw. Always include at least one note when confidence != "high".
- If context partially covers the question, answer only the supported part and put missing evidence or recommended next source in "followUp".
- Prefer outcome memories (objectType="outcome", or memories with property memory_source="open_loop_outcome") when the question is about what happened, what closed, or what changed. Cite them explicitly.
- When the question asks about transcripts or calls, prioritize transcript/call source items over email, newsletter, or account-notification sources.
- Separate evidence from recommendations: say what the sources show first, then label any recommendation as a recommendation.

Output a structured JSON object via the provided schema.`;

export function buildAskBrainPrompt(input: {
  brainName: string;
  brainKind: string;
  brainThesis: string;
  question: string;
  memoryObjects: Array<{
    id: string;
    objectType: string;
    name: string;
    description: string;
    sourceQuote?: string;
    confidence: number;
    sourceTitle: string;
    createdAt: string;
  }>;
  openLoops: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    sourceQuote?: string;
    outcome?: string;
    confidence: number;
    sourceTitle: string;
    createdAt: string;
  }>;
  sourceItems: Array<{
    id: string;
    title: string;
    type: string;
    content: string;
    createdAt: string;
  }>;
}): string {
  const memoryBlocks = input.memoryObjects
    .map(
      (memory) => `<memory_object id="${escapeXml(memory.id)}" type="${escapeXml(memory.objectType)}" confidence="${memory.confidence.toFixed(2)}" source="${escapeXml(memory.sourceTitle)}" createdAt="${escapeXml(memory.createdAt)}">
  <name>${escapeXml(memory.name)}</name>
  <description>${escapeXml(memory.description)}</description>
  <source_quote>${escapeXml(memory.sourceQuote ?? "")}</source_quote>
</memory_object>`,
    )
    .join("\n");

  const loopBlocks = input.openLoops
    .map(
      (loop) => `<open_loop id="${escapeXml(loop.id)}" status="${escapeXml(loop.status)}" priority="${escapeXml(loop.priority)}" confidence="${loop.confidence.toFixed(2)}" source="${escapeXml(loop.sourceTitle)}" createdAt="${escapeXml(loop.createdAt)}">
  <title>${escapeXml(loop.title)}</title>
  <description>${escapeXml(loop.description)}</description>
  <source_quote>${escapeXml(loop.sourceQuote ?? "")}</source_quote>
  ${loop.outcome ? `<outcome>${escapeXml(loop.outcome)}</outcome>` : ""}
</open_loop>`,
    )
    .join("\n");

  const sourceBlocks = input.sourceItems
    .map(
      (source) => `<source_item id="${escapeXml(source.id)}" type="${escapeXml(source.type)}" createdAt="${escapeXml(source.createdAt)}">
  <title>${escapeXml(source.title)}</title>
  <content>${escapeXml(source.content)}</content>
</source_item>`,
    )
    .join("\n");

  return `<brain>
<name>${escapeXml(input.brainName)}</name>
<kind>${escapeXml(input.brainKind)}</kind>
<thesis>${escapeXml(input.brainThesis)}</thesis>
</brain>

<question>${escapeXml(input.question)}</question>

<context>
${memoryBlocks || ""}
${loopBlocks || ""}
${sourceBlocks || ""}
</context>

Answer the question using only the context above. Cite each substantive claim. If evidence is insufficient, say so and set uncertain=true.`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
