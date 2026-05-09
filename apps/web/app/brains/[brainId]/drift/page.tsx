import type { DriftSignal } from "@arvya/core";
import { runDriftReviewAction } from "@/app/actions";
import {
  getBrainSnapshot,
  getLatestDriftReview,
  selectedBrainOrDefault,
} from "@/lib/brain/store";
import styles from "./page.module.css";

// Drift review - prototype layout per docs/prototype/Drift.html, but only
// renders content backed by a real `drift_review` agent run. The "said vs
// did" compare grid was prototype-only fixture data; we drop it until a
// real "stated priorities vs activity" data source lands.

type PageProps = {
  params: Promise<{ brainId: string }>;
};

function alignmentLabel(
  alignment: string | undefined,
): { label: string; score: string } {
  if (alignment === "aligned") return { label: "Aligned", score: "0.92" };
  if (alignment === "minor_drift") return { label: "Minor drift", score: "0.62" };
  if (alignment === "major_drift") return { label: "Major drift", score: "0.41" };
  return { label: "-", score: "-" };
}

export default async function DriftPage({ params }: PageProps) {
  const { brainId } = await params;
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const latest = await getLatestDriftReview(selectedBrainId);
  const review = latest?.review ?? null;
  const snapshot = await getBrainSnapshot(selectedBrainId);
  const sourceCount = snapshot.sourceItems?.length ?? 0;
  const memoryCount = snapshot.memoryObjects?.length ?? 0;
  const align = alignmentLabel(review?.overall_alignment);

  return (
    <div>
      <header className={styles.pageHead}>
        <div>
          <span className={styles.eyebrow}>Drift review</span>
          <h1>Where we said we would be vs where we are.</h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              maxWidth: "60ch",
              marginTop: 8,
              lineHeight: 1.55,
            }}
          >
            The brain compares what you said you would do (priorities, plans,
            promises in your sources) with what is actually happening across
            calls, emails, and documents. Patterns it finds get flagged here.
          </p>
        </div>
        <div className={styles.headRight}>
          {review
            ? `Compiled ${new Date(review.generated_at).toLocaleString()}`
            : "No review run yet"}
          <br />
          Runs on demand or weekly cron
        </div>
      </header>

      <form action={runDriftReviewAction} className={styles.runForm}>
        <input type="hidden" name="brainId" value={selectedBrainId} />
        <div>
          <div className={styles.lab}>
            {review ? "Re-run drift review" : "No drift review run yet"}
          </div>
          <div className={styles.small}>
            {review
              ? "Each run creates a new agent_run with the latest signals."
              : "Run one to see patterns the brain has noticed across your sources."}
          </div>
        </div>
        <button type="submit">{review ? "Run new review" : "Run drift review"}</button>
      </form>

      {!review ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            fontSize: 14,
            color: "var(--text-tertiary)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: 12,
            marginTop: 24,
          }}
        >
          A drift review reads your sources, your stated priorities, and your
          activity, then flags places they have diverged. Click <b>Run drift
          review</b> above to generate one.
        </div>
      ) : (
        <>
          <p className={styles.driftStmt}>{review.summary_for_founders}</p>

          <div className={styles.driftMeta}>
            <span>
              <span className={styles.pip} />
              <b>{review.signals.length}</b>{" "}
              {review.signals.length === 1 ? "pattern flagged" : "patterns flagged"}
            </span>
            <span className="gold">
              alignment <b>{align.score}</b>{" "}
              <span style={{ color: "var(--text-tertiary)" }}>({align.label})</span>
            </span>
            <span className={styles.driftMetaRight}>
              from {sourceCount} {sourceCount === 1 ? "source" : "sources"} -{" "}
              {memoryCount} memory objects
            </span>
          </div>

          <h2 className={styles.patternsHead}>
            {review.signals.length === 0
              ? "Nothing flagged this run."
              : `${review.signals.length} ${
                  review.signals.length === 1 ? "pattern" : "patterns"
                } worth a conversation.`}
          </h2>

          {review.signals.slice(0, 8).map((s, i) => (
            <PatternCard key={i} signal={s} />
          ))}
        </>
      )}
    </div>
  );
}

function PatternCard({ signal }: { signal: DriftSignal }) {
  const isWarn = signal.severity !== "low";
  const sev =
    signal.severity === "high"
      ? "High"
      : signal.severity === "medium"
        ? "Medium"
        : "Low";
  return (
    <div className={`${styles.pattern} ${isWarn ? styles.patternWarn : ""}`}>
      <div className={styles.patternHead}>
        <h3>{signal.summary}</h3>
        <span className={styles.patternConf}>
          severity <b>{sev}</b>
        </span>
      </div>
      <div className={styles.patternBody}>{signal.detail}</div>
      <div className={styles.patternFoot}>
        {signal.source_refs.length > 0 ? (
          <div className={styles.ev}>
            {signal.source_refs.slice(0, 4).map((ref) => (
              <span key={ref} className={styles.cite}>
                {ref.length > 20 ? `${ref.slice(0, 20)}...` : ref}
              </span>
            ))}
          </div>
        ) : null}
        {signal.recommended_action ? (
          <div className={styles.reco}>
            <b>Recommend:</b> {signal.recommended_action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
