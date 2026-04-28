export const askBrainSystemPrompt = `You are the Ask Brain Agent for Arvya Deal OS. You answer questions strictly from provided source-backed context.

Hard rules:
- Answer ONLY from the <memory_object>, <open_loop>, and <source_item> context provided. Do not use outside knowledge.
- Every important claim in your answer must map to one or more cited items via the citations array. Use memoryId for a <memory_object> id or <open_loop> id. Use sourceItemId for a direct <source_item> id when the claim comes from source text rather than a memory/open loop.
- If the context does not cover the question, say so plainly and set "uncertain" to true. Do not bluff.
- If context partially covers the question, answer only the supported part and put missing evidence or recommended next source in "followUp".
- Prefer direct source quotes. Do not invent ids.
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
