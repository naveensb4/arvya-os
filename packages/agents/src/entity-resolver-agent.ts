// Entity Resolver Agent
//
// Decides whether a newly extracted person/company is the same as one we
// already have in `canonical_entities`, or a genuinely new entity.
//
// This agent is model-agnostic. It takes an `AiClient` (anthropic / openai /
// local stub) and returns a structured decision. DB access lives outside
// (in apps/web/lib/brain/entity-resolver.ts), so the agent itself stays
// portable across providers.
//
// Decision tree (the order matters — cheaper checks first):
//
//   Tier 1 (deterministic, $0)         caller pre-runs:
//     - exact email match
//     - exact verified-alias match
//
//   Tier 2 (vector retrieval, ~$0)     caller pre-runs:
//     - top-1 cosine ≥ 0.92 → MERGE auto
//     - top-1 cosine < 0.7  → CREATE NEW auto
//     - 0.7–0.92            → falls through to this agent
//
//   Tier 3 (this agent, Haiku, ~$0.0001):
//     - Caller passes top-3 candidates with their evidence quotes.
//     - Agent returns {action, candidate_id?, confidence, reason}.
//     - Caller maps the result back to a DB write.
//
// Caller is expected to handle Tier 1 and Tier 2 before invoking this
// agent. We deliberately keep the LLM tier focused: it's only asked the
// genuinely ambiguous question ("is this the same person as one of these
// 3 candidates?"). Cheap, fast, and observable.

import { z } from "zod";
import type { AiClient } from "@arvya/core";

export type EntityCandidate = {
  // Stable id used by the caller to map back to canonical_entities.id.
  // We pass it through the LLM as an opaque string so the LLM can echo it.
  id: string;
  canonicalName: string;
  aliases?: string[];
  email?: string;
  role?: string;
  company?: string;
  // The 1-3 most recent evidence quotes from sources that mention this
  // entity. Helps the LLM judge whether the new extraction is "talking
  // about the same person."
  evidenceQuotes?: string[];
  cosineSimilarity?: number;
};

export type EntityToResolve = {
  type: "person" | "company";
  name: string;
  email?: string;
  role?: string;
  company?: string;
  domain?: string;
  // The verbatim quote from the new source that produced this extraction.
  sourceQuote?: string;
};

export const entityResolutionSchema = z.object({
  action: z.enum(["merge", "create_new", "merge_with_review"]),
  matchCandidateId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(400),
});
export type EntityResolution = z.infer<typeof entityResolutionSchema>;

const SYSTEM_PROMPT = `You are the Entity Resolver for Arvya OS, a closed-loop company brain. Your job: decide whether a newly extracted person or company is the same as one we already track, or a genuinely new entity.

You will see:
- The new extraction (name, email, role, company, source quote).
- 1-5 existing canonical entity candidates (name, aliases, email, role, evidence quotes).

Decide one of three actions:
- "merge": you are confident the new extraction refers to one of the candidates. Set matchCandidateId. Confidence >= 0.85.
- "merge_with_review": you think it's likely a match but there's residual ambiguity (similar name, missing email confirmation, etc). Set matchCandidateId. Confidence 0.5-0.85.
- "create_new": no candidate is a plausible match. matchCandidateId is null. Confidence < 0.5 OR a clear "different person/company" signal.

Hard rules:
- Treat short names ("Sudi", "Naveen", "PB") as likely shortenings of fuller candidates ("Sudi Mariappa", "Naveen Siva", "Prashanth Babu"). Do not require exact name match.
- An email address match is a strong merge signal even if names look different ("Sudi" + sudi@gmail.com vs candidate "Sudi Mariappa" + sudi@gmail.com → merge).
- An email mismatch is a strong create_new signal even if names match ("Naveen" at naveen@arvya.ai vs candidate "Naveen" at naveen@othercompany.com → likely different person, create_new).
- For companies, treat domain match as the strongest signal. "Arvya" + arvya.ai vs candidate "Arvya AI" + arvya.ai → merge.
- If the new extraction has only a short name (no email) and a candidate has a fuller name with the short name as a token, prefer merge unless context contradicts.
- If you are genuinely uncertain (50/50), choose merge_with_review with confidence around 0.6 so a human can disambiguate later.

Output strictly conforms to the provided JSON schema. Provide a one-sentence reason for the choice.`;

function formatCandidate(c: EntityCandidate): string {
  const lines: string[] = [`<candidate id="${c.id}">`];
  lines.push(`  name: ${c.canonicalName}`);
  if (c.aliases && c.aliases.length > 0) lines.push(`  aliases: ${c.aliases.join(", ")}`);
  if (c.email) lines.push(`  email: ${c.email}`);
  if (c.role) lines.push(`  role: ${c.role}`);
  if (c.company) lines.push(`  company: ${c.company}`);
  if (typeof c.cosineSimilarity === "number") {
    lines.push(`  cosine_similarity: ${c.cosineSimilarity.toFixed(3)}`);
  }
  if (c.evidenceQuotes && c.evidenceQuotes.length > 0) {
    lines.push(`  evidence:`);
    for (const quote of c.evidenceQuotes.slice(0, 3)) {
      lines.push(`    - ${quote.replace(/\s+/g, " ").slice(0, 200)}`);
    }
  }
  lines.push(`</candidate>`);
  return lines.join("\n");
}

function buildPrompt(entity: EntityToResolve, candidates: EntityCandidate[]): string {
  const newBlock = [
    `<new_extraction type="${entity.type}">`,
    `  name: ${entity.name}`,
    entity.email ? `  email: ${entity.email}` : null,
    entity.role ? `  role: ${entity.role}` : null,
    entity.company ? `  company: ${entity.company}` : null,
    entity.domain ? `  domain: ${entity.domain}` : null,
    entity.sourceQuote
      ? `  source_quote: ${entity.sourceQuote.replace(/\s+/g, " ").slice(0, 240)}`
      : null,
    `</new_extraction>`,
  ]
    .filter(Boolean)
    .join("\n");

  const candidatesBlock = candidates.map(formatCandidate).join("\n");

  return `${newBlock}\n\n<candidates>\n${candidatesBlock}\n</candidates>\n\nDecide: merge, merge_with_review, or create_new.`;
}

export async function resolveEntity(input: {
  ai: AiClient;
  entity: EntityToResolve;
  candidates: EntityCandidate[];
}): Promise<EntityResolution> {
  // Empty candidate list — nothing to compare against, definitely new.
  if (input.candidates.length === 0) {
    return {
      action: "create_new",
      matchCandidateId: null,
      confidence: 1,
      reason: "No existing candidates to compare against.",
    };
  }

  // No AI available — fall back to a conservative merge_with_review on the
  // top candidate if one exists with a strong cosine, otherwise create_new.
  if (!input.ai.available) {
    const top = input.candidates[0];
    if (top && (top.cosineSimilarity ?? 0) >= 0.92) {
      return {
        action: "merge",
        matchCandidateId: top.id,
        confidence: 0.92,
        reason: "Auto-merge from cosine similarity (no AI available).",
      };
    }
    return {
      action: "create_new",
      matchCandidateId: null,
      confidence: 0.5,
      reason: "No AI available and top cosine below auto-merge threshold.",
    };
  }

  const result = await input.ai.completeStructured({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input.entity, input.candidates),
    schema: entityResolutionSchema,
    schemaName: "entity_resolution",
    schemaDescription:
      "Decide whether the new extraction is the same as a candidate, ambiguous, or new.",
    maxTokens: 400,
    temperature: 0,
  });

  // Validate the LLM's matchCandidateId actually maps to a passed-in
  // candidate — if it doesn't, fall back to create_new (no silent corruption).
  if (result.data.action !== "create_new" && result.data.matchCandidateId) {
    const found = input.candidates.find((c) => c.id === result.data.matchCandidateId);
    if (!found) {
      return {
        action: "create_new",
        matchCandidateId: null,
        confidence: 0.4,
        reason: `LLM returned unknown candidate id "${result.data.matchCandidateId}", treating as new.`,
      };
    }
  }

  return result.data;
}
