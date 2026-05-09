import type { OpenLoop } from "@arvya/core";
import { getOpenLoopReviewSnapshot } from "@/lib/brain/store";
import styles from "./page.module.css";
import { OpenLoopsViews } from "./views-client";

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

function isQuiet(l: OpenLoop): boolean {
  const ref = l.updatedAt ?? l.createdAt;
  if (!ref) return false;
  const now = Date.now();
  return now - new Date(ref).getTime() > 5 * 24 * 60 * 60 * 1000;
}

export default async function OpenLoopsPage({ params }: PageProps) {
  const { brainId } = await params;
  const snapshot = await getOpenLoopReviewSnapshot(brainId);

  const buckets: Record<Bucket, OpenLoop[]> = {
    promised: [],
    in_flight: [],
    quiet: [],
    closed: [],
  };
  for (const loop of snapshot.openLoops) {
    buckets[bucketFor(loop)].push(loop);
  }

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

      <OpenLoopsViews
        loops={snapshot.openLoops}
        sourcesById={Object.fromEntries(
          snapshot.sourceItems.map((s) => [
            s.id,
            { id: s.id, title: s.title, externalUri: s.externalUri ?? null },
          ]),
        )}
        myOwnerName="Naveen"
        brainId={brainId}
        buckets={{
          promised: buckets.promised,
          in_flight: buckets.in_flight,
          quiet: buckets.quiet,
          closed: buckets.closed,
        }}
      />
    </div>
  );
}
