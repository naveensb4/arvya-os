import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  loopOutcomeLog,
  memoryObjects as memoryObjectsTable,
  nudges as nudgesTable,
  openLoops as openLoopsTable,
  sourceItems as sourceItemsTable,
} from "@/lib/db/schema";
import styles from "../page.module.css";
import detailStyles from "./loop-detail.module.css";

// Per-loop detail page. The "loop history view" promised in the plan.
// Shows the chain:
//   creating source → commitment text → outcome detector decisions
//   → nudges sent → final outcome (if closed) → re-open option
//
// All four of these tables are loaded server-side via direct Drizzle
// queries (rather than the BrainRepository abstraction) because the
// loop_outcome_log and nudges queries need joins / orderings that the
// existing repository methods don't expose. The per-loop page is a
// supabase-only feature; the in-memory repo doesn't track this data.

type PageProps = {
  params: Promise<{ brainId: string; loopId: string }>;
};

function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const ms = Date.now() - date.getTime();
  if (Number.isNaN(ms)) return "";
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  if (ms < hour) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
  if (ms < day) return `${Math.floor(ms / hour)}h ago`;
  if (ms < 7 * day) return `${Math.floor(ms / day)}d ago`;
  return formatDate(iso);
}

function decisionLabel(decision: string): string {
  return ({
    closed: "Closed",
    advanced: "Advanced",
    contradicts: "Contradicts",
    no_match: "No match",
    uncertain: "Uncertain",
  } as Record<string, string>)[decision] ?? decision;
}

function decisionColor(decision: string): string {
  if (decision === "closed") return "#2ECC7A";
  if (decision === "advanced") return "#D89A3F";
  if (decision === "contradicts") return "#E64C4C";
  if (decision === "uncertain") return "#5C5CE6";
  return "#9aa1ae";
}

export default async function LoopDetailPage({ params }: PageProps) {
  const { brainId, loopId } = await params;
  const db = getDb();

  // The loop itself.
  const [loopRow] = await db
    .select()
    .from(openLoopsTable)
    .where(and(eq(openLoopsTable.id, loopId), eq(openLoopsTable.brainId, brainId)))
    .limit(1);
  if (!loopRow) notFound();

  // The source that originated the loop (the commitment).
  const sourceRows = loopRow.sourceItemId
    ? await db
        .select()
        .from(sourceItemsTable)
        .where(eq(sourceItemsTable.id, loopRow.sourceItemId))
        .limit(1)
    : [];
  const originSource = sourceRows[0] ?? null;

  // Outcome detector audit trail for this loop, oldest first so the
  // timeline reads top-down chronologically.
  const decisionRows = await db
    .select()
    .from(loopOutcomeLog)
    .where(eq(loopOutcomeLog.loopId, loopId))
    .orderBy(desc(loopOutcomeLog.decidedAt));

  // Resolve all evidence-source titles in one query so the timeline can
  // show "Closed by: [source title]" without N+1.
  const evidenceSourceIds = decisionRows
    .map((row) => row.sourceItemId)
    .filter((id): id is string => Boolean(id));
  const evidenceSources = evidenceSourceIds.length > 0
    ? await db
        .select({ id: sourceItemsTable.id, title: sourceItemsTable.title, externalUri: sourceItemsTable.externalUri, type: sourceItemsTable.type })
        .from(sourceItemsTable)
        .where(sql`${sourceItemsTable.id} = ANY(${evidenceSourceIds})`)
    : [];
  const evidenceSourceById = new Map(evidenceSources.map((s) => [s.id, s]));

  // All nudges this loop has received.
  const nudgeRows = await db
    .select()
    .from(nudgesTable)
    .where(eq(nudgesTable.relatedOpenLoopId, loopId))
    .orderBy(desc(nudgesTable.createdAt));

  // Outcome memory if the loop closed.
  const outcomeMemory = await db
    .select()
    .from(memoryObjectsTable)
    .where(
      and(
        eq(memoryObjectsTable.brainId, brainId),
        sql`${memoryObjectsTable.properties}->>'open_loop_id' = ${loopId}`,
        eq(memoryObjectsTable.objectType, "outcome"),
      ),
    )
    .limit(5);

  const properties = (loopRow.properties ?? {}) as Record<string, unknown>;
  const isClosed = ["closed", "done", "dismissed"].includes(loopRow.status);
  const isOverdue =
    loopRow.dueDate &&
    !isClosed &&
    new Date(loopRow.dueDate).getTime() < Date.now();

  return (
    <div>
      <header className={styles.pageHead}>
        <div>
          <Link href={`/brains/${brainId}/open-loops`} className={detailStyles.back}>
            ← Back to action items
          </Link>
          <span className={styles.eyebrow}>
            Loop · {loopRow.loopType.replace(/_/g, " ")}
            {isClosed ? " · CLOSED" : isOverdue ? " · OVERDUE" : ""}
          </span>
          <h1>{loopRow.title}</h1>
          {loopRow.description && loopRow.description !== loopRow.title ? (
            <p className={styles.sub}>{loopRow.description}</p>
          ) : null}
        </div>
      </header>

      <section className={detailStyles.metaGrid}>
        <div className={detailStyles.metaCell}>
          <div className={detailStyles.metaLab}>Owner</div>
          <div className={detailStyles.metaVal}>{loopRow.owner ?? "Unassigned"}</div>
        </div>
        <div className={detailStyles.metaCell}>
          <div className={detailStyles.metaLab}>Status</div>
          <div className={detailStyles.metaVal} style={{ textTransform: "capitalize" }}>
            {loopRow.status.replace(/_/g, " ")}
          </div>
        </div>
        <div className={detailStyles.metaCell}>
          <div className={detailStyles.metaLab}>Priority</div>
          <div className={detailStyles.metaVal} style={{ textTransform: "capitalize" }}>
            {loopRow.priority}
          </div>
        </div>
        <div className={detailStyles.metaCell}>
          <div className={detailStyles.metaLab}>Due</div>
          <div className={detailStyles.metaVal}>
            {loopRow.dueDate ? formatDate(loopRow.dueDate) : "—"}
          </div>
        </div>
        <div className={detailStyles.metaCell}>
          <div className={detailStyles.metaLab}>Created</div>
          <div className={detailStyles.metaVal}>{formatRelative(loopRow.createdAt)}</div>
        </div>
        <div className={detailStyles.metaCell}>
          <div className={detailStyles.metaLab}>Closed</div>
          <div className={detailStyles.metaVal}>
            {loopRow.closedAt ? formatRelative(loopRow.closedAt) : "—"}
          </div>
        </div>
      </section>

      <section className={detailStyles.section}>
        <h2 className={detailStyles.sectionLabel}>Origin</h2>
        {originSource ? (
          <div className={detailStyles.originCard}>
            <div className={detailStyles.originHead}>
              <span className={detailStyles.originType}>{originSource.type}</span>
              <span className={detailStyles.originDate}>
                {formatRelative(originSource.createdAt)}
              </span>
            </div>
            <div className={detailStyles.originTitle}>
              {originSource.externalUri ? (
                <a href={originSource.externalUri} target="_blank" rel="noreferrer">
                  {originSource.title}
                </a>
              ) : (
                originSource.title
              )}
            </div>
            {loopRow.sourceQuote ? (
              <blockquote className={detailStyles.quote}>
                {loopRow.sourceQuote}
              </blockquote>
            ) : null}
          </div>
        ) : (
          <p className={detailStyles.empty}>
            This loop was created without a linked source (likely manual entry).
          </p>
        )}
      </section>

      <section className={detailStyles.section}>
        <h2 className={detailStyles.sectionLabel}>
          Outcome detector · {decisionRows.length}{" "}
          {decisionRows.length === 1 ? "decision" : "decisions"}
        </h2>
        {decisionRows.length === 0 ? (
          <p className={detailStyles.empty}>
            No outcome decisions logged yet. The brain will check this loop
            against every new source it ingests.
          </p>
        ) : (
          <ol className={detailStyles.timeline}>
            {decisionRows.map((row) => {
              const evidence = row.sourceItemId
                ? evidenceSourceById.get(row.sourceItemId)
                : undefined;
              const props = (row.properties ?? {}) as Record<string, unknown>;
              const reason = typeof props.reason === "string" ? props.reason : "";
              const applied = props.applied === true;
              return (
                <li key={row.id} className={detailStyles.timelineItem}>
                  <div className={detailStyles.timelineHead}>
                    <span
                      className={detailStyles.decisionPill}
                      style={{ background: decisionColor(row.decision) }}
                    >
                      {decisionLabel(row.decision)}
                    </span>
                    <span className={detailStyles.timelineDate}>
                      {formatRelative(row.decidedAt)}
                    </span>
                    {row.confidence ? (
                      <span className={detailStyles.confidence}>
                        conf {Number(row.confidence).toFixed(2)}
                      </span>
                    ) : null}
                    {applied ? (
                      <span className={detailStyles.appliedPill}>applied</span>
                    ) : (
                      <span className={detailStyles.skippedPill}>logged only</span>
                    )}
                  </div>
                  {evidence ? (
                    <div className={detailStyles.timelineSource}>
                      from{" "}
                      {evidence.externalUri ? (
                        <a href={evidence.externalUri} target="_blank" rel="noreferrer">
                          {evidence.title}
                        </a>
                      ) : (
                        evidence.title
                      )}
                    </div>
                  ) : null}
                  {row.evidenceQuote ? (
                    <blockquote className={detailStyles.timelineQuote}>
                      “{row.evidenceQuote}”
                    </blockquote>
                  ) : null}
                  {reason ? (
                    <div className={detailStyles.timelineReason}>{reason}</div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className={detailStyles.section}>
        <h2 className={detailStyles.sectionLabel}>
          Nudges · {nudgeRows.length}
        </h2>
        {nudgeRows.length === 0 ? (
          <p className={detailStyles.empty}>
            No nudges sent yet. The deadline nudger posts pre-deadline and
            stale alerts to <code>#arvya-brain</code> once configured.
          </p>
        ) : (
          <ul className={detailStyles.nudgeList}>
            {nudgeRows.map((nudge) => (
              <li key={nudge.id} className={detailStyles.nudgeItem}>
                <div className={detailStyles.nudgeHead}>
                  <span className={detailStyles.nudgeKind}>{nudge.nudgeType}</span>
                  <span className={detailStyles.nudgeDate}>
                    {formatRelative(nudge.createdAt)}
                  </span>
                </div>
                <div>{nudge.title}</div>
                {nudge.dismissedAt ? (
                  <div className={detailStyles.nudgeStatus}>
                    Dismissed · {formatRelative(nudge.dismissedAt)}
                  </div>
                ) : nudge.acknowledgedAt ? (
                  <div className={detailStyles.nudgeStatus}>
                    Acknowledged · {formatRelative(nudge.acknowledgedAt)}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {outcomeMemory.length > 0 ? (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionLabel}>Outcome</h2>
          <div className={detailStyles.outcomeCard}>
            {outcomeMemory.map((memory) => (
              <div key={memory.id} className={detailStyles.outcomeRow}>
                <div className={detailStyles.outcomeName}>{memory.name}</div>
                <div className={detailStyles.outcomeDescription}>
                  {memory.description}
                </div>
                {memory.sourceQuote ? (
                  <blockquote className={detailStyles.timelineQuote}>
                    “{memory.sourceQuote}”
                  </blockquote>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {loopRow.outcome ? (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionLabel}>Closure note</h2>
          <p className={detailStyles.outcomeNote}>{loopRow.outcome}</p>
        </section>
      ) : null}

      {Object.keys(properties).length > 0 ? (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionLabel}>Raw properties</h2>
          <details className={detailStyles.rawDetails}>
            <summary>Show JSON</summary>
            <pre className={detailStyles.rawPre}>
              {JSON.stringify(properties, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}
    </div>
  );
}
