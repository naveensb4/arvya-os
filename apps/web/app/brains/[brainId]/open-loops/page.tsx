import type { OpenLoop } from "@arvya/core";
import { getOpenLoopReviewSnapshot } from "@/lib/brain/store";
import { detectDismissPatterns } from "@/lib/brain/dismiss-patterns";
import styles from "./page.module.css";
import { OpenLoopsClient } from "./views-client";

type PageProps = {
  params: Promise<{ brainId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function isActive(loop: OpenLoop): boolean {
  return !["closed", "done", "dismissed"].includes(loop.status);
}

function isQuiet(l: OpenLoop): boolean {
  const ref = l.updatedAt ?? l.createdAt;
  if (!ref) return false;
  return Date.now() - new Date(ref).getTime() > 5 * 24 * 60 * 60 * 1000;
}

const STALE_DAYS = 14;
function isStale(loop: OpenLoop): boolean {
  if (!["needs_review", "open"].includes(loop.status)) return false;
  const ageDays = (Date.now() - new Date(loop.createdAt).getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays < STALE_DAYS) return false;
  if (loop.updatedAt) {
    const updateDelta = new Date(loop.updatedAt).getTime() - new Date(loop.createdAt).getTime();
    if (updateDelta > 60_000) return false;
  }
  return true;
}

export default async function OpenLoopsPage({ params, searchParams }: PageProps) {
  const { brainId } = await params;
  const sp = await searchParams;
  const snapshot = await getOpenLoopReviewSnapshot(brainId);

  const activeLoops = snapshot.openLoops.filter(isActive);
  const closedLoops = snapshot.openLoops.filter((l) => !isActive(l));
  const overdueCount = activeLoops.filter(
    (l) => l.dueDate && new Date(l.dueDate).getTime() < Date.now(),
  ).length;
  const quietCount = activeLoops.filter(isQuiet).length;
  const totalOpen = activeLoops.length;

  const staleLoopIds = activeLoops.filter(isStale).map((l) => l.id);
  const dismissPatterns = detectDismissPatterns(snapshot.openLoops);
  const topPattern = dismissPatterns[0] ?? null;

  return (
    <div>
      <header className={styles.pageHead}>
        <div>
          <span className={styles.eyebrow}>Closed-loop tracking</span>
          <h1>Open loops.</h1>
          <p className={styles.sub}>
            Every promise the brain has heard you make, with proof of fulfilment.
            Nothing falls through the cracks silently.
          </p>
        </div>
      </header>

      <div className={styles.summary}>
        <div className={styles.lede}>
          <b>{totalOpen} open loop{totalOpen !== 1 ? "s" : ""}.</b>{" "}
          {overdueCount} overdue, {quietCount} quiet, {totalOpen - overdueCount - quietCount} tracking.
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
          <div className={styles.lab}>Closed</div>
          <div className={`${styles.v} ${styles.vGold}`}>{closedLoops.length}</div>
          <div className={styles.delta}>resolved</div>
        </div>
      </div>

      <OpenLoopsClient
        loops={snapshot.openLoops}
        sourcesById={Object.fromEntries(
          snapshot.sourceItems.map((s) => [
            s.id,
            { id: s.id, title: s.title, externalUri: s.externalUri ?? null },
          ]),
        )}
        brainId={brainId}
        staleLoopIds={staleLoopIds}
        dismissPattern={topPattern}
        initialSearchParams={sp}
      />
    </div>
  );
}
