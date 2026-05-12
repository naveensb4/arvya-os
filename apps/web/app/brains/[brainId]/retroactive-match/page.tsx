import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  loopOutcomeLog,
  openLoops as openLoopsTable,
  sourceItems as sourceItemsTable,
} from "@/lib/db/schema";
import { RetroactiveClient } from "./client";

// Retroactive matcher review queue. The page fetches existing dry-run
// proposals server-side, then the client component handles the actual
// dry-run trigger + apply flow.

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function RetroactiveMatchPage({ params }: PageProps) {
  const { brainId } = await params;
  const db = getDb();

  const proposals = await db
    .select({
      id: loopOutcomeLog.id,
      brainId: loopOutcomeLog.brainId,
      loopId: loopOutcomeLog.loopId,
      sourceItemId: loopOutcomeLog.sourceItemId,
      decision: loopOutcomeLog.decision,
      confidence: loopOutcomeLog.confidence,
      evidenceQuote: loopOutcomeLog.evidenceQuote,
      decidedAt: loopOutcomeLog.decidedAt,
      properties: loopOutcomeLog.properties,
      loopTitle: openLoopsTable.title,
      loopOwner: openLoopsTable.owner,
      loopStatus: openLoopsTable.status,
      sourceTitle: sourceItemsTable.title,
      sourceType: sourceItemsTable.type,
    })
    .from(loopOutcomeLog)
    .leftJoin(openLoopsTable, eq(loopOutcomeLog.loopId, openLoopsTable.id))
    .leftJoin(sourceItemsTable, eq(loopOutcomeLog.sourceItemId, sourceItemsTable.id))
    .where(
      and(
        eq(loopOutcomeLog.brainId, brainId),
        sql`(${loopOutcomeLog.properties}->>'dryRun')::boolean = true`,
        sql`(${loopOutcomeLog.properties}->>'applied') IS DISTINCT FROM 'true'`,
      ),
    )
    .orderBy(desc(loopOutcomeLog.confidence), desc(loopOutcomeLog.decidedAt))
    .limit(200);

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          Brain ops · retroactive matcher
        </span>
        <h1>Retroactive review</h1>
        <p style={{ color: "var(--text-secondary)", maxWidth: 720, lineHeight: 1.6 }}>
          Run the closed-loop matcher against every existing source you've already
          ingested, in dry-run mode. The brain will surface the loops it thinks
          have been resolved by inbound evidence already in your inbox. You
          approve which ones to actually close. Each LLM call costs about a
          tenth of a cent — running the full thing is ~$1 of spend, one time.
        </p>
      </header>

      <RetroactiveClient
        brainId={brainId}
        initialProposals={proposals.map((p) => ({
          id: p.id,
          loopId: p.loopId,
          loopTitle: p.loopTitle ?? "(loop deleted)",
          loopOwner: p.loopOwner ?? null,
          loopStatus: p.loopStatus ?? null,
          sourceItemId: p.sourceItemId,
          sourceTitle: p.sourceTitle ?? "(source unavailable)",
          sourceType: p.sourceType ?? null,
          decision: p.decision,
          confidence: p.confidence ? Number(p.confidence) : null,
          evidenceQuote: p.evidenceQuote,
          reason: typeof (p.properties as Record<string, unknown>)?.reason === "string"
            ? String((p.properties as Record<string, unknown>).reason)
            : null,
          decidedAt: p.decidedAt.toISOString(),
        }))}
      />
    </div>
  );
}
