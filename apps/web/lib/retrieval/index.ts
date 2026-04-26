import type { AiClient, MemoryObject, OpenLoop, SourceItem } from "@arvya/core";
import type { BrainRepository } from "@/lib/db/repository";

export type RetrievedContext = {
  memoryObject?: MemoryObject;
  openLoop?: OpenLoop;
  sourceItem?: SourceItem;
  score: number;
  reason: "vector" | "lexical";
};

export type RetrievalInput = {
  brainId: string;
  question: string;
  repository: BrainRepository;
  ai: AiClient;
  limit?: number;
};

const DEFAULT_LIMIT = 16;
const STOP_WORDS = new Set([
  "about",
  "after",
  "are",
  "based",
  "brain",
  "calls",
  "did",
  "does",
  "from",
  "have",
  "into",
  "known",
  "next",
  "our",
  "recent",
  "say",
  "should",
  "tell",
  "these",
  "this",
  "top",
  "transcript",
  "transcripts",
  "was",
  "were",
  "what",
  "which",
  "with",
]);

const QUERY_EXPANSIONS: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /\b(follow[- ]?ups?|owe|people|naveen|pb)\b/i, terms: ["follow", "send", "intro", "introduce", "meeting", "call", "email", "next"] },
  { pattern: /\b(product|build|customer|email)\b/i, terms: ["product", "feature", "workflow", "customer", "user", "pain", "demo", "mvp"] },
  { pattern: /\b(investors?|advisors?|advice)\b/i, terms: ["investor", "advisor", "advice", "fundraising", "seed", "deck", "runway", "strategy"] },
  { pattern: /\b(objections?|concerns?)\b/i, terms: ["objection", "concern", "price", "pricing", "risk", "blocker", "skeptical"] },
  { pattern: /\b(risks?|dropped balls?)\b/i, terms: ["risk", "blocker", "concern", "follow", "missed", "open", "priority", "urgent"] },
];

function tokenize(value: string): string[] {
  const baseTerms = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
  const expandedTerms = QUERY_EXPANSIONS.flatMap((expansion) =>
    expansion.pattern.test(value) ? expansion.terms : [],
  );
  return [...new Set([...baseTerms, ...expandedTerms])];
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

function isOpenLoopQuery(question: string): boolean {
  return /\b(follow[- ]?ups?|owe|owed|open loops?|next steps?|actions?)\b/i.test(question);
}

function isTranscriptQuery(question: string): boolean {
  return /\b(transcripts?|calls?|meetings?|recent calls?|people should|naveen or pb|investors?|advisors?|objections?|concerns?|build next|dropped balls?|product insights?)\b/i.test(question);
}

function sourceBias(source: SourceItem | undefined, transcriptQuery: boolean): number {
  if (!source) return transcriptQuery ? 0.25 : 1;
  const isTranscript =
    source.type === "transcript" ||
    source.metadata?.source_kind === "transcript" ||
    source.metadata?.domain_type === "transcript";
  if (transcriptQuery) return isTranscript ? 1.6 : 0.05;
  return isTranscript ? 1.15 : 1;
}

function sourceForCandidate(
  candidate: Pick<RetrievedContext, "memoryObject" | "openLoop" | "sourceItem">,
  sourceItemsById: Map<string, SourceItem>,
) {
  if (candidate.sourceItem) return candidate.sourceItem;
  const sourceItemId = candidate.memoryObject?.sourceItemId ?? candidate.openLoop?.sourceItemId;
  return sourceItemId ? sourceItemsById.get(sourceItemId) : undefined;
}

function candidateId(candidate: RetrievedContext): string {
  return (
    candidate.memoryObject?.id ??
    candidate.openLoop?.id ??
    candidate.sourceItem?.id ??
    `${candidate.reason}-${candidate.score}`
  );
}

function dedupeAndRank(candidates: RetrievedContext[], limit: number): RetrievedContext[] {
  const byId = new Map<string, RetrievedContext>();
  for (const candidate of candidates) {
    const id = candidateId(candidate);
    const existing = byId.get(id);
    if (!existing || candidate.score > existing.score) {
      byId.set(id, candidate);
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function retrieveRelevantContext(
  input: RetrievalInput,
): Promise<RetrievedContext[]> {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const candidates: RetrievedContext[] = [];

  if (input.ai.available && input.ai.embeddingModel) {
    try {
      const [questionEmbedding] = (await input.ai.embed([input.question])) ?? [];
      if (questionEmbedding && questionEmbedding.length > 0) {
        const vectorHits = await input.repository.searchBrain({
          brainId: input.brainId,
          embedding: questionEmbedding,
          query: input.question,
          limit: limit * 2,
        });
        candidates.push(...vectorHits.filter((hit) => hit.score > 0));
      }
    } catch (error) {
      console.warn("Vector retrieval failed, falling back to lexical:", error);
    }
  }

  const [memoryObjects, openLoops, sourceItems] = await Promise.all([
    input.repository.listMemoryObjects(input.brainId),
    input.repository.listOpenLoops(input.brainId),
    input.repository.listSourceItems(input.brainId),
  ]);
  const terms = tokenize(input.question);
  const shouldSurfaceOpenLoops = isOpenLoopQuery(input.question);
  const transcriptQuery = isTranscriptQuery(input.question);
  const sourceItemsById = new Map(sourceItems.map((source) => [source.id, source]));

  for (const candidate of candidates) {
    candidate.score *= sourceBias(sourceForCandidate(candidate, sourceItemsById), transcriptQuery);
  }

  for (const memoryObject of memoryObjects) {
    const source = memoryObject.sourceItemId ? sourceItemsById.get(memoryObject.sourceItemId) : undefined;
    const score = lexicalScore(
      `${memoryObject.name} ${memoryObject.description} ${memoryObject.sourceQuote ?? ""}`,
      terms,
    );
    if (score > 0) {
      const typeBoost = memoryObject.objectType === "product_insight" || memoryObject.objectType === "risk" ? 1.25 : 1;
      candidates.push({
        memoryObject,
        score: score * 0.65 * sourceBias(source, transcriptQuery) * typeBoost,
        reason: "lexical",
      });
    }
  }

  for (const openLoop of openLoops) {
    const source = openLoop.sourceItemId ? sourceItemsById.get(openLoop.sourceItemId) : undefined;
    const score = lexicalScore(
      `${openLoop.title} ${openLoop.description} ${openLoop.sourceQuote ?? ""} ${openLoop.suggestedAction ?? ""}`,
      terms,
    );
    if (score > 0 || shouldSurfaceOpenLoops) {
      const priorityBoost = openLoop.priority === "critical" ? 1.25 : openLoop.priority === "high" ? 1.15 : 1;
      const baseScore = score > 0 ? score * 0.9 : 0.35;
      candidates.push({
        openLoop,
        score: baseScore * sourceBias(source, transcriptQuery) * priorityBoost,
        reason: "lexical",
      });
    }
  }

  for (const sourceItem of sourceItems) {
    const score = lexicalScore(`${sourceItem.title} ${sourceItem.content}`, terms);
    if (score > 0) {
      candidates.push({
        sourceItem,
        score: score * 0.5 * sourceBias(sourceItem, transcriptQuery),
        reason: "lexical",
      });
    }
  }

  return dedupeAndRank(candidates, limit);
}

export function buildEmbeddingText(input: {
  objectType?: string;
  name?: string;
  description?: string;
  sourceQuote?: string;
  title?: string;
  content?: string;
}): string {
  return `${input.objectType ?? "source"}: ${input.name ?? input.title ?? ""}\n${input.description ?? input.content ?? ""}\nEvidence: ${input.sourceQuote ?? ""}`;
}
