import type { AgentRun } from "@arvya/core";
import { getBrainSnapshot } from "@/lib/brain/store";
import styles from "./page.module.css";

// Renders the prototype's Audit log layout (KPI grid + tabs + run table +
// scheduled section) on top of the existing getBrainSnapshot agentRuns
// fetch. KPI counts are derived from the loaded runs; the scheduled section
// uses static prototype content until /api/brains/[brainId]/agent-stream
// (Phase 3.9) provides live data.

type PageProps = {
  params: Promise<{ brainId: string }>;
};

type RunStatus = "ok" | "run" | "fail" | "queued";

function statusFor(run: AgentRun): RunStatus {
  if (run.status === "running") return "run";
  if (run.status === "failed") return "fail";
  if (run.status === "queued") return "queued";
  return "ok";
}

function statusClass(s: RunStatus) {
  return {
    ok: styles.stOk,
    run: styles.stRun,
    fail: styles.stFail,
    queued: styles.stQueued,
  }[s];
}

function whenLabel(iso: string | null | undefined) {
  if (!iso) return "queued";
  const ms = Date.now() - new Date(iso).getTime();
  return formatRelative(ms);
}

function formatRelative(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function durationLabel(run: AgentRun): string {
  if (!run.completedAt) return "-";
  const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
  if (ms < 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function countByName(runs: AgentRun[]) {
  const c = new Map<string, number>();
  for (const r of runs) {
    const key = r.name;
    c.set(key, (c.get(key) ?? 0) + 1);
  }
  return c;
}

const PROTOTYPE_KPIS: Array<{ name: string; lab: string }> = [
  { name: "extract_memory", lab: "RUNS - 24h" },
  { name: "resolve_entity", lab: "RUNS - 24h" },
  { name: "compile_truth", lab: "RUNS - 24h" },
  { name: "propose_edge", lab: "RUNS - 24h" },
];

const SCHEDULED = [
  {
    name: "dream_cycle",
    summary: "Compares stated priorities vs actual activity, surfaces drift patterns.",
    schedule: "Sun - 06:00 IST",
    cost: "$0.84",
    next: "Sun 06:00",
  },
  {
    name: "morning_brief",
    summary: "Composes founder daily brief - 4 sections - sent to email + Slack DM.",
    schedule: "Daily - 07:30",
    cost: "$0.18",
    next: "Tomorrow 07:30",
  },
  {
    name: "stale_loops_sweep",
    summary: "Re-checks open loops over 3d quiet for new evidence - nudges or escalates.",
    schedule: "Daily - 09:00",
    cost: "$0.04",
    next: "Tomorrow 09:00",
  },
  {
    name: "behavioral_recompute",
    summary: "Recomputes behavioral models for hot people (last 14d touch).",
    schedule: "Mon - 04:00",
    cost: "$2.20",
    next: "Mon 04:00",
  },
];

export default async function AgentRunsPage({ params }: PageProps) {
  const { brainId } = await params;
  const snapshot = await getBrainSnapshot(brainId);
  const runs = snapshot.agentRuns ?? [];
  const total = runs.length;

  const counts = countByName(runs);
  const running = runs.filter((r) => statusFor(r) === "run").length;
  const failed = runs.filter((r) => statusFor(r) === "fail").length;

  return (
    <div>
      <header className={styles.pageHead}>
        <div>
          <span className={styles.eyebrow}>Audit log</span>
          <h1>Agent runs.</h1>
          <p>
            Every action the brain has taken - every memory extracted, entity
            resolved, edge proposed, draft generated. Filterable, replayable,
            attributable.
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`}>
            Export log
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`}>
            + Custom agent
          </button>
        </div>
      </header>

      <div className={styles.kpiGrid}>
        {PROTOTYPE_KPIS.map((k) => (
          <div key={k.name} className={styles.kpiCard}>
            <div className={styles.kpiNm}>{k.name}</div>
            <div className={styles.kpiLab}>{k.lab}</div>
            <div className={styles.kpiV}>
              {(counts.get(k.name) ?? 0).toLocaleString()}
            </div>
            <div className={styles.kpiDelta}>
              {counts.get(k.name) ? "live" : "no runs yet"}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.tabs}>
        <button type="button" className={styles.on}>
          All <span className={styles.ct}>{total}</span>
        </button>
        <button type="button">
          Running <span className={styles.ct}>{running}</span>
        </button>
        <button type="button">
          Failed <span className={styles.ct}>{failed}</span>
        </button>
        <button type="button">Manual</button>
        <button type="button">Scheduled</button>
        <button type="button">Dream cycle</button>
      </div>

      <div className={styles.runTable}>
        <div className={`${styles.runRow} ${styles.runHead}`}>
          <span />
          <span>Agent</span>
          <span>Summary</span>
          <span>Cost</span>
          <span>Latency</span>
          <span className={styles.metaMs}>When</span>
        </div>
        {total === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              fontSize: 13,
              color: "var(--text-tertiary)",
            }}
          >
            No agent runs yet. The brain logs every run here as it works.
          </div>
        ) : (
          runs.slice(0, 24).map((run) => {
            const s = statusFor(run);
            return (
              <div key={run.id} className={styles.runRow}>
                <span className={`${styles.st} ${statusClass(s)}`} />
                <div className={styles.nm}>
                  {run.name}
                  {run.stepName ? <span className={styles.arg}>({run.stepName})</span> : null}
                </div>
                <div className={styles.summaryCol}>
                  {run.outputSummary || run.inputSummary || "Run logged."}
                </div>
                <div className={styles.metaCol}>{/* cost - TODO Phase 1.5 */}-</div>
                <div className={styles.metaCol}>{durationLabel(run)}</div>
                <div className={`${styles.metaCol} ${styles.metaMs}`}>
                  {s === "run" ? "running" : whenLabel(run.startedAt)}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.tsHead}>Scheduled - this week</div>
      <div className={styles.runTable}>
        <div className={`${styles.runRow} ${styles.runHead}`}>
          <span />
          <span>Agent</span>
          <span>Schedule</span>
          <span>Last run</span>
          <span>Avg cost</span>
          <span className={styles.metaMs}>Next</span>
        </div>
        {SCHEDULED.map((s) => (
          <div key={s.name} className={styles.runRow}>
            <span className={`${styles.st} ${styles.stQueued}`} />
            <div className={styles.nm}>{s.name}</div>
            <div className={styles.summaryCol}>{s.summary}</div>
            <div className={styles.metaCol}>{s.schedule}</div>
            <div className={styles.metaCol}>{s.cost}</div>
            <div className={`${styles.metaCol} ${styles.metaMs}`}>{s.next}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
