import type { DriftSignal } from "@arvya/core";
import { runDriftReviewAction } from "@/app/actions";
import {
  getLatestDriftReview,
  selectedBrainOrDefault,
} from "@/lib/brain/store";
import styles from "./page.module.css";

// TODO: the prototype's "What you said vs what you actually did" compare
// grid needs a backing data source (stated priorities + actual activity
// time-allocation). Until that lands, the compare grid uses
// `placeholderCompare`. Pattern cards map from real DriftSignal data when
// `getLatestDriftReview` returns a review; the recommendation + actions
// come from `signal.recommended_action` and `signal.recommended_owner`.

type CompareItem = {
  what: string;
  small?: string;
  pct: string;
  late?: boolean;
};

const placeholderCompare: { said: CompareItem[]; did: CompareItem[] } = {
  said: [
    { what: "Ship Drive ingestion", small: "unblocks 3 customers", pct: "P0" },
    { what: "Hire 2 eng", small: "back-end + applied AI", pct: "P0" },
    { what: "Vertical-template position paper", pct: "P1" },
    { what: "Close Series A", pct: "P1" },
    { what: "Q3 customer roadshow", pct: "P2" },
  ],
  did: [
    { what: "62 percent investor follow-ups", small: "Sequoia 28% - Insight 12% - 6 cold 22%", pct: "time" },
    { what: "14 percent Drive ingestion eng", small: "PR open, blocked on auth scope", pct: "behind", late: true },
    { what: "11 percent customer support", small: "Marlowe bug, Notion FAQ", pct: "flat" },
    { what: "0 percent vertical-template paper", small: "Not started, ownership unclear", pct: "skipped", late: true },
    { what: "0 percent hiring", small: "Last interview 22d ago, pipeline 4 to 1", pct: "stalled", late: true },
  ],
};

const fallbackHeadline =
  "You said you would ship Drive ingestion plus a vertical-template doc. The brain heard you spend 62 percent of your time on investor follow-ups instead.";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function DriftPage({ params }: PageProps) {
  const { brainId } = await params;
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const latest = await getLatestDriftReview(selectedBrainId);
  const review = latest?.review ?? null;

  return (
    <div>
      <header className={styles.pageHead}>
        <div>
          <span className={styles.eyebrow}>Drift review - weekly</span>
          <h1>Where we said we would be vs where we are.</h1>
        </div>
        <div className={styles.headRight}>
          {review
            ? `Compiled ${new Date(review.generated_at).toLocaleString()}`
            : "No review run yet"}
          <br />
          Next run: weekly cron
        </div>
      </header>

      {!review ? (
        <form action={runDriftReviewAction} className={styles.runForm}>
          <input type="hidden" name="brainId" value={selectedBrainId} />
          <div>
            <div className={styles.lab}>No drift review run yet.</div>
            <div className={styles.small}>
              Drift reviews run on demand. Each run is persisted as an agent_run
              (kind: drift_review).
            </div>
          </div>
          <button type="submit">Run drift review</button>
        </form>
      ) : (
        <form action={runDriftReviewAction} className={styles.runForm}>
          <input type="hidden" name="brainId" value={selectedBrainId} />
          <div>
            <div className={styles.lab}>
              Last run {new Date(review.generated_at).toLocaleString()}
            </div>
            <div className={styles.small}>
              Re-run after the next sources land.
            </div>
          </div>
          <button type="submit">Run new review</button>
        </form>
      )}

      <p className={styles.driftStmt}>
        {review?.summary_for_founders ?? fallbackHeadline}
      </p>

      <div className={styles.driftMeta}>
        <span>
          <span className={styles.pip} />
          <b>{review?.signals.length ?? 3}</b> patterns flagged
        </span>
        <span className="gold">
          alignment{" "}
          <b>
            {review?.overall_alignment === "aligned"
              ? "0.92"
              : review?.overall_alignment === "minor_drift"
                ? "0.62"
                : review?.overall_alignment === "major_drift"
                  ? "0.41"
                  : "0.41"}
          </b>{" "}
          <span style={{ color: "var(--text-tertiary)" }}>(was 0.62 last month)</span>
        </span>
        <span>
          signal <b>0.81</b>
        </span>
        <span className={styles.driftMetaRight}>
          from 142 meetings - 847 emails - 38 docs
        </span>
      </div>

      <div className={styles.compare}>
        <div className={styles.col}>
          <h3>What you said - strategy doc + last board update</h3>
          <ul>
            {placeholderCompare.said.map((item, i) => (
              <li key={i}>
                <span>
                  <b>{item.what}</b>
                  {item.small && <span className={styles.small}>{item.small}</span>}
                </span>
                <span className={styles.pct}>{item.pct}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.col}>
          <h3>What you actually did - last 30 days</h3>
          <ul>
            {placeholderCompare.did.map((item, i) => (
              <li key={i}>
                <span>
                  <b>{item.what}</b>
                  {item.small && <span className={styles.small}>{item.small}</span>}
                </span>
                <span className={`${styles.pct} ${item.late ? styles.pctLate : ""}`}>
                  {item.pct}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h2 className={styles.patternsHead}>
        {review?.signals.length
          ? `${review.signals.length} patterns worth a conversation.`
          : "3 patterns worth a conversation."}
      </h2>

      {(review?.signals ?? placeholderSignals).slice(0, 5).map((s, i) => (
        <PatternCard key={i} signal={s} />
      ))}
    </div>
  );
}

const placeholderSignals: DriftSignal[] = [
  {
    type: "narrative_stale",
    severity: "high",
    summary: "The pitch is no longer matching who buys.",
    detail:
      "Of the last 6 meaningful customer conversations, 4 were VC firms and Sequoia plus Insight cited 'Deal Brain' by name as why they took the call. The deck still leads with consulting use cases - the story you tell externally is diverging from the story your buyers tell back.",
    recommended_action: "Swap slide 2 before today's 14:00 with Insight. Draft ready.",
    source_refs: ["seq-apr-23", "ins-apr-12", "br-apr-28", "deck-v9"],
    memory_refs: [],
  },
  {
    type: "priority_drifting",
    severity: "high",
    summary: "Hiring has stalled silently.",
    detail:
      "Strategy says P0 hire 2 eng by end of Q2. Activity says: last interview 22 days ago, recruiter pipeline 4 to 1, no offers, JDs untouched since Mar 17. Zero of the last four standups mentioned hiring.",
    recommended_action: "30-min unblock with PB tomorrow. 3 lapsed candidates surfaced.",
    source_refs: ["jd-log", "rec-pipeline", "standups-4", "board-apr"],
    memory_refs: [],
  },
  {
    type: "objection_recurring",
    severity: "medium",
    summary: "Same FAQ question, three customers, this week.",
    detail:
      "Where does my data live came up from Notion (Mon), Atlassian (Tue), Marlowe (Thu). Answered three different ways across four reps. No canonical doc exists.",
    recommended_action: "Publish single FAQ entry. Brain drafted 4 sentences.",
    source_refs: ["notion-ticket", "atlassian-email", "marlowe-call"],
    memory_refs: [],
  },
];

function PatternCard({ signal }: { signal: DriftSignal }) {
  const isWarn = signal.severity !== "low";
  const conf = signal.severity === "high" ? "0.91" : signal.severity === "medium" ? "0.82" : "0.74";
  return (
    <div className={`${styles.pattern} ${isWarn ? styles.patternWarn : ""}`}>
      <div className={styles.patternHead}>
        <h3>{signal.summary}</h3>
        <span className={styles.patternConf}>
          confidence <b>{conf}</b>
        </span>
      </div>
      <div className={styles.patternBody}>{signal.detail}</div>
      <div className={styles.patternFoot}>
        <div className={styles.ev}>
          {signal.source_refs.slice(0, 4).map((ref) => (
            <span key={ref} className={styles.cite}>
              {ref.length > 20 ? `${ref.slice(0, 20)}...` : ref}
            </span>
          ))}
        </div>
        <div className={styles.reco}>
          <b>Recommend:</b> {signal.recommended_action}
        </div>
        <div className={styles.actions}>
          <button type="button">Snooze</button>
          <button type="button" className="primary">
            Review
          </button>
        </div>
      </div>
    </div>
  );
}
