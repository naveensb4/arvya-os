import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { loopOutcomeLog, openLoops as openLoopsTable } from "@/lib/db/schema";
import { getRepository } from "@/lib/db/repository";

// POST /api/brains/[brainId]/retroactive-match/apply
// Body: { proposalIds: string[] }   // loop_outcome_log row ids to apply
//
// For each approved proposal: closes (or advances) the loop, writes the
// outcome memory, marks the log row applied = true.

export async function POST(req: NextRequest, ctx: { params: Promise<{ brainId: string }> }) {
  const session = await getAuthUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { brainId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { proposalIds?: unknown };
  const proposalIds = Array.isArray(body.proposalIds)
    ? body.proposalIds.filter((id): id is string => typeof id === "string")
    : [];
  if (proposalIds.length === 0) {
    return NextResponse.json({ applied: 0 });
  }

  const db = getDb();
  const repository = getRepository();

  const proposals = await db
    .select()
    .from(loopOutcomeLog)
    .where(
      and(
        eq(loopOutcomeLog.brainId, brainId),
        inArray(loopOutcomeLog.id, proposalIds),
        sql`(${loopOutcomeLog.properties}->>'dryRun')::boolean = true`,
        sql`(${loopOutcomeLog.properties}->>'applied') IS DISTINCT FROM 'true'`,
      ),
    );

  let applied = 0;
  for (const proposal of proposals) {
    try {
      if (proposal.decision === "closed" || proposal.decision === "uncertain") {
        const outcomeText = proposal.evidenceQuote
          ? `Closed via retroactive review. Evidence: "${proposal.evidenceQuote}"`
          : "Closed via retroactive review.";
        const [loopRow] = await db
          .select()
          .from(openLoopsTable)
          .where(eq(openLoopsTable.id, proposal.loopId))
          .limit(1);
        if (!loopRow) continue;

        await repository.updateOpenLoop(proposal.loopId, {
          status: "closed",
          outcome: outcomeText,
          closedAt: new Date().toISOString(),
          properties: {
            ...((loopRow.properties ?? {}) as Record<string, unknown>),
            closedBy: "retroactive_review",
            closedFromSourceId: proposal.sourceItemId,
            closedConfidence: proposal.confidence ? Number(proposal.confidence) : null,
            closedByUserId: session.dbUser.id,
          },
        });
        await repository.createMemoryObjects([
          {
            brainId,
            sourceItemId: proposal.sourceItemId ?? undefined,
            objectType: "outcome",
            name: `Outcome: ${loopRow.title}`.slice(0, 120),
            description: outcomeText.slice(0, 800),
            sourceQuote: proposal.evidenceQuote ?? undefined,
            confidence: proposal.confidence ? Number(proposal.confidence) : 0.85,
            properties: {
              memory_source: "open_loop_outcome",
              open_loop_id: proposal.loopId,
              detected_by: "retroactive_review",
            },
          },
        ]);
      } else if (proposal.decision === "advanced") {
        const [loopRow] = await db
          .select()
          .from(openLoopsTable)
          .where(eq(openLoopsTable.id, proposal.loopId))
          .limit(1);
        if (!loopRow) continue;
        const props = (loopRow.properties ?? {}) as Record<string, unknown>;
        const evidence = (props.evidence as unknown[]) ?? [];
        await repository.updateOpenLoop(proposal.loopId, {
          properties: {
            ...props,
            lastEvidenceAt: new Date().toISOString(),
            lastEvidenceSourceId: proposal.sourceItemId,
            evidence: [
              ...evidence,
              {
                sourceItemId: proposal.sourceItemId,
                quote: proposal.evidenceQuote,
                confidence: proposal.confidence ? Number(proposal.confidence) : null,
                capturedAt: new Date().toISOString(),
                via: "retroactive_review",
              },
            ].slice(-10),
          },
        });
      }

      await db
        .update(loopOutcomeLog)
        .set({
          properties: sql`coalesce(${loopOutcomeLog.properties}, '{}'::jsonb)
            || jsonb_build_object('applied', true, 'appliedAt', ${new Date().toISOString()}, 'appliedByUserId', ${session.dbUser.id})`,
        })
        .where(eq(loopOutcomeLog.id, proposal.id));
      applied += 1;
    } catch (error) {
      console.error(`[retroactive-apply] failed for proposal ${proposal.id}:`, error);
    }
  }

  return NextResponse.json({ applied });
}
