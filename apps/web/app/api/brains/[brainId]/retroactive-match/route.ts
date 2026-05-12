import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  detectOutcomes,
  type CandidateLoop,
  type SourceContext,
} from "@arvya/agents/outcome-detector-agent";
import { getAuthUser } from "@/lib/auth/session";
import { getAiClient } from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import {
  loopOutcomeLog,
  openLoops as openLoopsTable,
  sourceItems as sourceItemsTable,
} from "@/lib/db/schema";
import { getRepository } from "@/lib/db/repository";

// POST /api/brains/[brainId]/retroactive-match
//
// Runs the outcome detector against every existing source_item × candidate
// loop (with pre-filtering) and writes proposals to loop_outcome_log with
// properties.dryRun = true. Does NOT close any loops or write outcome
// memories. The user reviews proposals at /brains/[brainId]/retroactive-
// match and approves a batch via /apply.
//
// Cost on Arvya's current data (~14 sources, ~130 active loops): roughly
// $0.20-$0.50 of LLM. Synchronous; returns when done. If sources count
// grows, promote this to an Inngest background job.
//
// GET on the same path returns existing dry-run proposals (so the page
// can render without re-running).

const ACTIVE_STATUSES = ["open", "in_progress", "needs_review", "waiting"] as const;
const PRE_FILTER_MAX_LOOPS = 12; // per source

const STOP = new Set([
  "the","and","for","with","this","that","from","into","over",
  "your","you","but","not","are","was","will","have","has","had",
  "any","all","can","could","would","should","next","new","yes","no",
  "to","of","in","on","at","is","it","be","by","or","an","a",
  "re","fwd","subject","about",
]);

function tokensFromText(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !STOP.has(t)),
  );
}

function rowToCandidateLoop(row: typeof openLoopsTable.$inferSelect): CandidateLoop {
  const properties = (row.properties ?? {}) as Record<string, unknown>;
  const participantsRaw = properties.participants;
  const participants = Array.isArray(participantsRaw)
    ? participantsRaw.filter((p): p is string => typeof p === "string")
    : [];
  const daysOpen = Math.max(
    0,
    Math.floor((Date.now() - row.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    loopType: row.loopType,
    owner: row.owner,
    dueDate: row.dueDate?.toISOString() ?? null,
    daysOpen,
    sourceQuote: row.sourceQuote,
    participants,
  };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ brainId: string }> }) {
  const session = await getAuthUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { brainId } = await ctx.params;
  const db = getDb();

  const proposals = await db
    .select()
    .from(loopOutcomeLog)
    .where(
      and(
        eq(loopOutcomeLog.brainId, brainId),
        sql`(${loopOutcomeLog.properties}->>'dryRun')::boolean = true`,
        sql`(${loopOutcomeLog.properties}->>'applied') IS DISTINCT FROM 'true'`,
      ),
    )
    .orderBy(desc(loopOutcomeLog.confidence), desc(loopOutcomeLog.decidedAt))
    .limit(200);

  return NextResponse.json({ proposals });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ brainId: string }> }) {
  const session = await getAuthUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { brainId } = await ctx.params;

  const ai = getAiClient();
  if (!ai.available) {
    return NextResponse.json(
      { error: "AI provider not configured." },
      { status: 503 },
    );
  }

  const repository = getRepository();
  const brain = await repository.getBrain(brainId);
  if (!brain) return NextResponse.json({ error: "brain_not_found" }, { status: 404 });

  const db = getDb();

  // 1. Clear any prior un-applied proposals so a re-run replaces them.
  await db
    .delete(loopOutcomeLog)
    .where(
      and(
        eq(loopOutcomeLog.brainId, brainId),
        sql`(${loopOutcomeLog.properties}->>'dryRun')::boolean = true`,
        sql`(${loopOutcomeLog.properties}->>'applied') IS DISTINCT FROM 'true'`,
      ),
    );

  // 2. Pull active loops once.
  const activeLoopRows = await db
    .select()
    .from(openLoopsTable)
    .where(
      and(
        eq(openLoopsTable.brainId, brainId),
        sql`${openLoopsTable.status} = ANY(ARRAY[${sql.join(ACTIVE_STATUSES.map((s) => sql`${s}::open_loop_status`), sql`, `)}])`,
      ),
    );

  // 3. Pull all sources, oldest first (so loops created later don't get
  //    matched against earlier sources by mistake).
  const sourceRows = await db
    .select()
    .from(sourceItemsTable)
    .where(eq(sourceItemsTable.brainId, brainId))
    .orderBy(sourceItemsTable.createdAt);

  let proposalCount = 0;
  let sourcesScanned = 0;
  let llmCalls = 0;

  for (const source of sourceRows) {
    sourcesScanned += 1;
    const sourceTime = source.createdAt;
    const sourceTokens = new Set([
      ...tokensFromText(source.title),
      ...tokensFromText(source.content.slice(0, 4000)),
    ]);

    // Pre-filter: only loops created BEFORE this source, that have any
    // token overlap with the source title/content OR an owner in the source.
    const candidates = activeLoopRows
      .filter((loop) => loop.id !== source.id) // belt and suspenders
      .filter((loop) => loop.sourceItemId !== source.id) // skip self-source
      .filter((loop) => loop.createdAt.getTime() <= sourceTime.getTime() + 60_000)
      .filter((loop) => {
        const loopTokens = tokensFromText(`${loop.title} ${loop.description ?? ""}`);
        for (const t of loopTokens) {
          if (sourceTokens.has(t)) return true;
        }
        return false;
      })
      .slice(0, PRE_FILTER_MAX_LOOPS);

    if (candidates.length === 0) continue;

    const sourceContext: SourceContext = {
      sourceItemId: source.id,
      title: source.title,
      type: source.type,
      occurredAt: source.createdAt.toISOString(),
      content: source.content,
    };

    let decisions;
    try {
      llmCalls += 1;
      const result = await detectOutcomes({
        ai,
        source: sourceContext,
        loops: candidates.map(rowToCandidateLoop),
      });
      decisions = result.decisions;
    } catch (error) {
      console.error(`[retroactive] source ${source.id} failed:`, error);
      continue;
    }

    for (const decision of decisions) {
      if (decision.decision === "no_match") continue;
      // Insert with dryRun marker so the apply endpoint can find it.
      await db.insert(loopOutcomeLog).values({
        brainId,
        loopId: decision.loopId,
        sourceItemId: source.id,
        decision: decision.decision === "closed" && decision.confidence < 0.85
          ? "uncertain"
          : decision.decision,
        confidence: decision.confidence.toFixed(2),
        evidenceQuote: decision.evidenceQuote,
        agentRunId: null,
        properties: {
          dryRun: true,
          applied: false,
          reason: decision.reason,
          modelDecision: decision.decision,
        },
      });
      proposalCount += 1;
    }
  }

  return NextResponse.json({
    sourcesScanned,
    llmCalls,
    proposalCount,
  });
}
