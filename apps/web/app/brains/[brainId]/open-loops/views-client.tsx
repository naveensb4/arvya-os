"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { OpenLoop } from "@arvya/core";
import styles from "./page.module.css";
import listStyles from "./list.module.css";

type Bucket = "promised" | "in_flight" | "quiet" | "closed";
type ViewMode = "board" | "list" | "timeline";
type FilterMode = "all" | "mine";

type SourceLite = { id: string; title: string; externalUri: string | null };

type LoopsViewProps = {
  loops: OpenLoop[];
  sourcesById: Record<string, SourceLite>;
  myOwnerName: string;
  brainId: string;
  buckets: {
    promised: OpenLoop[];
    in_flight: OpenLoop[];
    quiet: OpenLoop[];
    closed: OpenLoop[];
  };
};

function bucketFor(loop: OpenLoop): Bucket {
  const status = loop.status;
  if (status === "done" || status === "closed" || status === "dismissed") return "closed";
  if (loop.dueDate) {
    const dueMs = new Date(loop.dueDate).getTime();
    if (dueMs < Date.now()) return "quiet";
  }
  if (status === "needs_review") return "promised";
  return "in_flight";
}

function ageLabel(loop: OpenLoop): { text: string; late?: boolean } {
  const ref = loop.dueDate ?? loop.createdAt;
  if (!ref) return { text: "recent" };
  const ms = Date.now() - new Date(ref).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 0) return { text: `due in ${-days}d` };
  if (days === 0) {
    const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
    return { text: `${hours}h ago` };
  }
  if (loop.dueDate && new Date(loop.dueDate).getTime() < Date.now()) {
    return { text: `${days}d late`, late: true };
  }
  return { text: `${days}d ago` };
}

function recipientLabel(loop: OpenLoop): string {
  if (loop.owner) return `to ${loop.owner}`;
  return "no recipient";
}

function isClosedRecently(l: OpenLoop): boolean {
  const ref = l.updatedAt ?? l.createdAt;
  if (!ref) return true;
  return Date.now() - new Date(ref).getTime() < 7 * 24 * 60 * 60 * 1000;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function priorityRank(p: string): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[p] ?? 4;
}

function dueRank(loop: OpenLoop): number {
  // Overdue first, then upcoming by date, then no-due-date last.
  if (!loop.dueDate) return Number.MAX_SAFE_INTEGER;
  return new Date(loop.dueDate).getTime();
}

// Bucket loops by urgency for the Timeline view.
type TimelineBucket = "overdue" | "today" | "this_week" | "next_week" | "later" | "no_due";
function timelineBucketFor(loop: OpenLoop): TimelineBucket {
  if (!loop.dueDate) return "no_due";
  const due = new Date(loop.dueDate).getTime();
  const now = Date.now();
  if (due < now) return "overdue";
  const day = 24 * 60 * 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = startOfToday.getTime() + day;
  if (due < endOfToday) return "today";
  if (due < startOfToday.getTime() + 7 * day) return "this_week";
  if (due < startOfToday.getTime() + 14 * day) return "next_week";
  return "later";
}

const TIMELINE_LABELS: Record<TimelineBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  this_week: "This week",
  next_week: "Next week",
  later: "Later",
  no_due: "No due date",
};

export function OpenLoopsViews({
  loops,
  sourcesById,
  myOwnerName,
  brainId,
  buckets,
}: LoopsViewProps) {
  const [view, setView] = useState<ViewMode>("board");
  const [filter, setFilter] = useState<FilterMode>("all");

  const filteredLoops = useMemo(() => {
    if (filter === "all") return loops;
    return loops.filter((l) => l.owner === myOwnerName);
  }, [loops, filter, myOwnerName]);

  const filteredBuckets = useMemo(() => {
    if (filter === "all") return buckets;
    const out: LoopsViewProps["buckets"] = {
      promised: [],
      in_flight: [],
      quiet: [],
      closed: [],
    };
    for (const loop of filteredLoops) out[bucketFor(loop)].push(loop);
    return out;
  }, [filter, filteredLoops, buckets]);

  const totalOpen =
    filteredBuckets.promised.length +
    filteredBuckets.in_flight.length +
    filteredBuckets.quiet.length;

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.seg}>
          <button
            type="button"
            className={filter === "all" ? styles.segOn : ""}
            onClick={() => setFilter("all")}
          >
            All <span className={styles.segCt}>{loops.filter((l) => l.status !== "closed" && l.status !== "done" && l.status !== "dismissed").length}</span>
          </button>
          <button
            type="button"
            className={filter === "mine" ? styles.segOn : ""}
            onClick={() => setFilter("mine")}
          >
            Mine <span className={styles.segCt}>{loops.filter((l) => l.owner === myOwnerName && l.status !== "closed" && l.status !== "done" && l.status !== "dismissed").length}</span>
          </button>
        </div>
        <div className={styles.seg}>
          <button
            type="button"
            className={view === "board" ? styles.segOn : ""}
            onClick={() => setView("board")}
          >
            Board view
          </button>
          <button
            type="button"
            className={view === "list" ? styles.segOn : ""}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            type="button"
            className={view === "timeline" ? styles.segOn : ""}
            onClick={() => setView("timeline")}
          >
            Timeline
          </button>
        </div>
      </div>

      {view === "board" ? (
        <BoardView buckets={filteredBuckets} sourcesById={sourcesById} brainId={brainId} />
      ) : view === "list" ? (
        <ListView loops={filteredLoops} sourcesById={sourcesById} brainId={brainId} />
      ) : (
        <TimelineView loops={filteredLoops} sourcesById={sourcesById} brainId={brainId} />
      )}

      <div className={styles.audit}>
        <div className={styles.lab}>How loops get opened and closed</div>
        The brain opens a loop when it detects a forward-looking commitment in
        any source - I will send, we will get back, by Friday, let me circle
        back, an issue assigned, a calendar promise. It closes a loop when it
        sees evidence - outbound email matching the recipient, a doc shared, a
        PR merged, a contract signed, an inbound thank-you. {totalOpen === 0 ? "(no loops to display)" : ""}
      </div>
    </>
  );
}

function BoardView({
  buckets,
  sourcesById,
  brainId,
}: {
  buckets: LoopsViewProps["buckets"];
  sourcesById: Record<string, SourceLite>;
  brainId: string;
}) {
  const closedRecent = buckets.closed.filter(isClosedRecently).slice(0, 6);
  const closedAllCount = buckets.closed.length;

  return (
    <div className={styles.board}>
      <Column title="Promised" count={buckets.promised.length} loops={buckets.promised} sourcesById={sourcesById} brainId={brainId} />
      <Column title="In flight" count={buckets.in_flight.length} loops={buckets.in_flight} sourcesById={sourcesById} brainId={brainId} />
      <Column
        title="Quiet - stalled"
        count={buckets.quiet.length}
        loops={buckets.quiet}
        sourcesById={sourcesById}
        brainId={brainId}
        variant="warn"
      />
      <Column
        title="Closed (last 7d)"
        count={closedAllCount}
        loops={closedRecent}
        sourcesById={sourcesById}
        brainId={brainId}
        variant="go"
        trailingNote={
          closedAllCount > closedRecent.length
            ? `${closedAllCount - closedRecent.length} more closed this week`
            : null
        }
      />
    </div>
  );
}

// Notion-style dense list. Sortable by due date / priority / age.
// Replaces the "vertical scroll forever" experience of the kanban
// when you have 130+ loops in one column.
function ListView({
  loops,
  sourcesById,
  brainId,
}: {
  loops: OpenLoop[];
  sourcesById: Record<string, SourceLite>;
  brainId: string;
}) {
  type SortKey = "due" | "priority" | "age" | "status";
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    const open = loops.filter((l) => l.status !== "closed" && l.status !== "done" && l.status !== "dismissed");
    const cmp = (a: OpenLoop, b: OpenLoop): number => {
      let result = 0;
      if (sortKey === "due") {
        result = dueRank(a) - dueRank(b);
      } else if (sortKey === "priority") {
        result = priorityRank(a.priority) - priorityRank(b.priority);
      } else if (sortKey === "age") {
        result = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else {
        result = (a.status ?? "").localeCompare(b.status ?? "");
      }
      if (result === 0) result = priorityRank(a.priority) - priorityRank(b.priority);
      return sortDir === "asc" ? result : -result;
    };
    return [...open].sort(cmp);
  }, [loops, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "age" ? "desc" : "asc");
    }
  };

  if (sorted.length === 0) {
    return <div className={listStyles.empty}>No open loops match this filter.</div>;
  }

  return (
    <div className={listStyles.tableWrap}>
      <table className={listStyles.table}>
        <thead>
          <tr>
            <th className={listStyles.colTitle}>Action</th>
            <th>Owner</th>
            <th>
              <button type="button" onClick={() => toggleSort("due")} className={listStyles.sortBtn}>
                Due {sortKey === "due" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            </th>
            <th>
              <button type="button" onClick={() => toggleSort("priority")} className={listStyles.sortBtn}>
                Priority {sortKey === "priority" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            </th>
            <th>
              <button type="button" onClick={() => toggleSort("status")} className={listStyles.sortBtn}>
                Status {sortKey === "status" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            </th>
            <th>Source</th>
            <th>
              <button type="button" onClick={() => toggleSort("age")} className={listStyles.sortBtn}>
                Age {sortKey === "age" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((loop) => {
            const age = ageLabel(loop);
            const source = loop.sourceItemId ? sourcesById[loop.sourceItemId] : undefined;
            const isOverdue = loop.dueDate && new Date(loop.dueDate).getTime() < Date.now();
            return (
              <tr key={loop.id} className={isOverdue ? listStyles.rowLate : ""}>
                <td className={listStyles.colTitle}>
                  <Link
                    href={`/brains/${brainId}/open-loops/${loop.id}`}
                    className={listStyles.titleLink}
                  >
                    <div className={listStyles.title}>{loop.title || "Untitled"}</div>
                    {loop.description && loop.description !== loop.title ? (
                      <div className={listStyles.desc}>{loop.description}</div>
                    ) : null}
                  </Link>
                </td>
                <td>
                  <span className={listStyles.owner}>{loop.owner ?? "—"}</span>
                </td>
                <td>
                  {loop.dueDate ? (
                    <span className={isOverdue ? listStyles.dueLate : listStyles.due}>
                      {formatDate(loop.dueDate)}
                    </span>
                  ) : (
                    <span className={listStyles.dueNone}>—</span>
                  )}
                </td>
                <td>
                  <span className={`${listStyles.priority} ${listStyles[`prio_${loop.priority}`] ?? ""}`}>
                    {loop.priority}
                  </span>
                </td>
                <td>
                  <span className={listStyles.status}>{loop.status.replace(/_/g, " ")}</span>
                </td>
                <td>
                  {source ? (
                    source.externalUri ? (
                      <a href={source.externalUri} target="_blank" rel="noreferrer" className={listStyles.sourceLink}>
                        {source.title.slice(0, 36)}
                        {source.title.length > 36 ? "…" : ""}
                      </a>
                    ) : (
                      <span className={listStyles.sourceText}>
                        {source.title.slice(0, 36)}
                        {source.title.length > 36 ? "…" : ""}
                      </span>
                    )
                  ) : (
                    <span className={listStyles.dueNone}>—</span>
                  )}
                </td>
                <td>
                  <span className={age.late ? listStyles.dueLate : listStyles.due}>{age.text}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TimelineView({
  loops,
  sourcesById,
  brainId,
}: {
  loops: OpenLoop[];
  sourcesById: Record<string, SourceLite>;
  brainId: string;
}) {
  const groups = useMemo(() => {
    const out: Record<TimelineBucket, OpenLoop[]> = {
      overdue: [],
      today: [],
      this_week: [],
      next_week: [],
      later: [],
      no_due: [],
    };
    for (const loop of loops) {
      if (loop.status === "closed" || loop.status === "done" || loop.status === "dismissed") continue;
      out[timelineBucketFor(loop)].push(loop);
    }
    for (const key of Object.keys(out) as TimelineBucket[]) {
      out[key].sort((a, b) => dueRank(a) - dueRank(b));
    }
    return out;
  }, [loops]);

  const buckets: TimelineBucket[] = ["overdue", "today", "this_week", "next_week", "later", "no_due"];
  const totalShown = buckets.reduce((sum, k) => sum + groups[k].length, 0);
  if (totalShown === 0) {
    return <div className={listStyles.empty}>No open loops match this filter.</div>;
  }

  return (
    <div className={listStyles.timeline}>
      {buckets.map((bucket) => {
        const items = groups[bucket];
        if (items.length === 0) return null;
        const variant =
          bucket === "overdue" ? listStyles.bucketWarn : bucket === "today" ? listStyles.bucketToday : "";
        return (
          <div key={bucket} className={`${listStyles.bucket} ${variant}`}>
            <div className={listStyles.bucketHead}>
              <span>{TIMELINE_LABELS[bucket]}</span>
              <span className={listStyles.bucketCount}>{items.length}</span>
            </div>
            <ul className={listStyles.bucketList}>
              {items.map((loop) => {
                const source = loop.sourceItemId ? sourcesById[loop.sourceItemId] : undefined;
                return (
                  <li key={loop.id} className={listStyles.tlItem}>
                    <div className={listStyles.tlRow}>
                      <span className={`${listStyles.priority} ${listStyles[`prio_${loop.priority}`] ?? ""}`}>
                        {loop.priority}
                      </span>
                      <Link
                        href={`/brains/${brainId}/open-loops/${loop.id}`}
                        className={listStyles.tlTitleLink}
                      >
                        <span className={listStyles.tlTitle}>{loop.title || "Untitled"}</span>
                      </Link>
                      {loop.dueDate ? (
                        <span className={listStyles.tlDue}>{formatDate(loop.dueDate)}</span>
                      ) : null}
                    </div>
                    <div className={listStyles.tlMeta}>
                      {loop.owner ? <span>{loop.owner}</span> : <span>unassigned</span>}
                      {source ? (
                        <>
                          <span className={listStyles.tlDot}>·</span>
                          {source.externalUri ? (
                            <a href={source.externalUri} target="_blank" rel="noreferrer" className={listStyles.sourceLink}>
                              {source.title.slice(0, 32)}
                              {source.title.length > 32 ? "…" : ""}
                            </a>
                          ) : (
                            <span>{source.title.slice(0, 32)}{source.title.length > 32 ? "…" : ""}</span>
                          )}
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Column({
  title,
  count,
  loops,
  sourcesById,
  brainId,
  variant,
  trailingNote,
}: {
  title: string;
  count: number;
  loops: OpenLoop[];
  sourcesById: Record<string, SourceLite>;
  brainId: string;
  variant?: "warn" | "go";
  trailingNote?: string | null;
}) {
  const colClass =
    variant === "warn"
      ? `${styles.col} ${styles.colWarn}`
      : variant === "go"
        ? `${styles.col} ${styles.colGo}`
        : styles.col;

  return (
    <div className={colClass}>
      <div className={styles.colHead}>
        <span>{title}</span>
        <span className={styles.colHeadCt}>{count}</span>
      </div>
      {loops.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--text-tertiary)",
            letterSpacing: "0.04em",
            textAlign: "center",
            padding: "20px 0",
          }}
        >
          empty
        </p>
      ) : (
        loops.map((loop) => {
          const age = ageLabel(loop);
          const source = loop.sourceItemId ? sourcesById[loop.sourceItemId] : undefined;
          const isLate = variant === "warn";
          return (
            <div
              key={loop.id}
              className={`${styles.loop} ${isLate ? styles.loopLate : ""}`}
            >
              <div className={styles.top}>
                <span className={`${styles.age} ${age.late ? styles.ageLate : ""}`}>
                  {age.text}
                </span>
                <span className={styles.whoPill}>{recipientLabel(loop)}</span>
              </div>
              <Link href={`/brains/${brainId}/open-loops/${loop.id}`} className={listStyles.boardTitleLink}>
                <div className={styles.what}>{loop.title || "Untitled loop"}</div>
                {loop.description && loop.description !== loop.title ? (
                  <div className={styles.ctx}>{loop.description}</div>
                ) : null}
              </Link>
              <div className={styles.src}>
                <b>{loop.owner ?? "Unassigned"}</b>
                {source ? (
                  source.externalUri ? (
                    <a href={source.externalUri} target="_blank" rel="noreferrer" className={listStyles.sourceLink}>
                      source: {source.title.slice(0, 24)}
                    </a>
                  ) : (
                    <span>source: {source.title.slice(0, 24)}</span>
                  )
                ) : null}
              </div>
            </div>
          );
        })
      )}
      {trailingNote ? (
        <div
          style={{
            textAlign: "center",
            padding: "14px 0",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--text-tertiary)",
            letterSpacing: "0.08em",
          }}
        >
          {trailingNote}
        </div>
      ) : null}
    </div>
  );
}
