import type { OpenLoop, SourceItem } from "@arvya/core";
import { getOpenLoopReviewSnapshot } from "@/lib/brain/store";
import styles from "./page.module.css";

// Renders the prototype's 4-column kanban (Promised / In flight / Quiet stalled
// / Closed last 7d) on top of the existing getOpenLoopReviewSnapshot data.
//
// The legacy bulk-review form (bulkReviewOpenLoopsAction) is intentionally
// dropped from this view to keep the kanban clean. That action is still
// wired into the repository; if you need bulk review during the transition,
// use the prior page in git history (or rehome it as a separate "review
// queue" route in a follow-up). TODO: bring back inline approve/dismiss
// per-card once the prototype's interaction model is locked.

type PageProps = {
  params: Promise<{ brainId: string }>;
};

type Bucket = "promised" | "in_flight" | "quiet" | "closed";

function bucketFor(loop: OpenLoop): Bucket {
  const status = loop.status;
  if (status === "done" || status === "closed" || status === "dismissed") {
    return "closed";
  }
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
  if (days < 0) {
    return { text: `due in ${-days}d` };
  }
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
  const now = Date.now();
  return now - new Date(ref).getTime() < 7 * 24 * 60 * 60 * 1000;
}

function isQuiet(l: OpenLoop): boolean {
  const ref = l.updatedAt ?? l.createdAt;
  if (!ref) return false;
  const now = Date.now();
  return now - new Date(ref).getTime() > 5 * 24 * 60 * 60 * 1000;
}

export default async function OpenLoopsPage({ params }: PageProps) {
  const { brainId } = await params;
  const snapshot = await getOpenLoopReviewSnapshot(brainId);
  const sourceById = new Map(snapshot.sourceItems.map((s) => [s.id, s]));

  const buckets: Record<Bucket, OpenLoop[]> = {
    promised: [],
    in_flight: [],
    quiet: [],
    closed: [],
  };
  for (const loop of snapshot.openLoops) {
    buckets[bucketFor(loop)].push(loop);
  }

  // Closed bucket trims to last 7 days of activity for readability.
  const closedRecent = buckets.closed.filter(isClosedRecently).slice(0, 6);

  const overdueCount = buckets.quiet.length;
  const quietCount = buckets.in_flight.filter(isQuiet).length;
  const closedAllCount = buckets.closed.length;
  const totalOpen =
    buckets.promised.length + buckets.in_flight.length + buckets.quiet.length;

  return (
    <div>
      <header className={styles.pageHead}>
        <div>
          <span className={styles.eyebrow}>Closed-loop tracking</span>
          <h1>Open loops.</h1>
          <p className={styles.sub}>
            Every promise the brain has heard you make, with proof of fulfilment.
            Three things stay true here: nothing falls through the cracks
            silently, every promise has an owner, and done needs a source.
          </p>
        </div>
      </header>

      <div className={styles.summary}>
        <div className={styles.lede}>
          <b>{totalOpen} open loops.</b>{" "}
          {overdueCount} overdue, {quietCount} quiet (over 5 days no update),{" "}
          {buckets.in_flight.length - quietCount} tracking.
        </div>
        <div className={styles.stat}>
          <div className={styles.lab}>Overdue</div>
          <div className={`${styles.v} ${styles.vWarn}`}>{overdueCount}</div>
          <div className={styles.delta}>requires attention</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.lab}>Quiet</div>
          <div className={styles.v}>{quietCount}</div>
          <div className={styles.delta}>over 5 days silent</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.lab}>Closed (7d)</div>
          <div className={`${styles.v} ${styles.vGold}`}>{closedAllCount}</div>
          <div className={styles.delta}>shipped recently</div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.seg}>
          <button type="button" className={styles.segOn}>
            All <span className={styles.segCt}>{totalOpen}</span>
          </button>
          <button type="button">
            Mine <span className={styles.segCt}>{buckets.in_flight.filter((l) => l.owner === "Naveen").length}</span>
          </button>
        </div>
        <div className={styles.seg}>
          <button type="button" className={styles.segOn}>
            Board view
          </button>
          <button type="button">List</button>
          <button type="button">Timeline</button>
        </div>
      </div>

      <div className={styles.board}>
        <Column
          title="Promised"
          count={buckets.promised.length}
          loops={buckets.promised}
          sourceById={sourceById}
        />
        <Column
          title="In flight"
          count={buckets.in_flight.length}
          loops={buckets.in_flight}
          sourceById={sourceById}
        />
        <Column
          title="Quiet - stalled"
          count={buckets.quiet.length}
          loops={buckets.quiet}
          sourceById={sourceById}
          variant="warn"
        />
        <Column
          title="Closed (last 7d)"
          count={closedAllCount}
          loops={closedRecent}
          sourceById={sourceById}
          variant="go"
          trailingNote={
            closedAllCount > closedRecent.length
              ? `${closedAllCount - closedRecent.length} more closed this week`
              : null
          }
        />
      </div>

      <div className={styles.audit}>
        <div className={styles.lab}>How loops get opened and closed</div>
        The brain opens a loop when it detects a forward-looking commitment in
        any source - I will send, we will get back, by Friday, let me circle
        back, an issue assigned, a calendar promise. It closes a loop when it
        sees evidence - outbound email matching the recipient, a doc shared, a
        PR merged, a contract signed, an inbound thank-you.
      </div>
    </div>
  );
}

function Column({
  title,
  count,
  loops,
  sourceById,
  variant,
  trailingNote,
}: {
  title: string;
  count: number;
  loops: OpenLoop[];
  sourceById: Map<string, SourceItem>;
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
          const source = loop.sourceItemId
            ? sourceById.get(loop.sourceItemId)
            : undefined;
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
              <div className={styles.what}>{loop.title || "Untitled loop"}</div>
              {loop.description && loop.description !== loop.title ? (
                <div className={styles.ctx}>{loop.description}</div>
              ) : null}
              <div className={styles.src}>
                <b>{loop.owner ?? "Unassigned"}</b>
                {source ? <span>source: {source.title.slice(0, 24)}</span> : null}
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
