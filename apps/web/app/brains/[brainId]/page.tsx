import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getBrainSnapshot,
  getLatestDriftReview,
  isBrainNotFoundError,
} from "@/lib/brain/store";
import styles from "./page.module.css";

// Dashboard - prototype-matched layout per docs/prototype/Dashboard.html.
// Clean Octolane-style header (no big dark hero card), pulse strip, 2-col
// grid. Real data flows through getBrainSnapshot + getLatestDriftReview;
// placeholder content fills the meetings card and the right-rail charts
// until /api/brains/[brainId]/pulse, /meetings, /agent-stream (Phase 3.1
// / 3.2 / 3.9) and the heat-score / brief-persist materializations land.
//
// Charts (sparkline / donut / bars / live agent stream rotation) render as
// static SVGs here; the prototype's animated versions become small client
// components in a follow-up once the data is real.

const PRESET_PROMPTS = [
  "What did we promise customers this week?",
  "Which investors need follow-up?",
  "What is drifting from the roadmap?",
  "Catch me up on Marlowe",
];

const PLACEHOLDER_MEETINGS = [
  {
    when: "Now - 14:00 to 14:45",
    title: "BlackRock - graph spec walkthrough",
    sub: "Jon Smith - graph-spec.md attached",
    live: true,
  },
  {
    when: "15:30 to 16:00",
    title: "Sequoia - term-sheet questions",
    sub: "Roelof plus 1",
  },
  {
    when: "17:00 to 17:15",
    title: "Standup - sprint #18",
    sub: "4 attendees",
  },
  {
    when: "18:00 to 18:45",
    title: "Caffeinated - pilot kickoff",
    sub: "Maya Chen",
  },
];

const PLACEHOLDER_DRIFT_SIGNALS = [
  {
    title: "Sales narrative drift",
    body: "Investor deck says Brain for consulting, but 4 of 6 last customer calls were VC firms, and 2 cited Deal Brain as why they signed.",
  },
  {
    title: "Promise has no owner",
    body: "Monday's BlackRock call: we will send a graph spec by Thursday. Not on Linear, not in drafts.",
  },
  {
    title: "Same objection, third time",
    body: "Where does the data live? Clearco, Founders Fund, Caffeinated. Not in the FAQ.",
  },
];

const SOURCE_SPARK = [62, 71, 58, 82, 75, 90, 103, 88, 112, 98, 124, 131, 118, 142];
const DONUT_SEGMENTS = [
  { lab: "People", val: 0.94, color: "#0E1726" },
  { lab: "Companies", val: 0.91, color: "#D89A3F" },
  { lab: "Promises", val: 0.86, color: "#2ECC7A" },
  { lab: "Topics", val: 0.81, color: "#5C5CE6" },
];

const PROMISE_BARS = [
  { lab: "On track", val: 14, total: 22, kind: "green" as const },
  { lab: "Drifting", val: 5, total: 22, kind: "gold" as const },
  { lab: "Overdue", val: 3, total: 22, kind: "red" as const },
];

const LIVE_STREAM = [
  { name: "extract_memory", arg: "email - Sequoia thread", state: "run" as const },
  { name: "resolve_entity", arg: "J. Smith resolved to Jon Smith (BlackRock)", state: "ok" as const, t: "0.4s" },
  { name: "compile_truth", arg: "person/sarah-chen", state: "ok" as const, t: "2.1s" },
  { name: "detect_commitment", arg: "send by Thu - Jon", state: "ok" as const, t: "0.8s" },
  { name: "embed_segment", arg: "call/marlowe-q4 - 47 turns", state: "ok" as const, t: "3.4s" },
  { name: "propose_edge", arg: "BlackRock to Google - introduced_to", state: "ok" as const, t: "1.1s" },
];

type PageProps = {
  params: Promise<{ brainId: string }>;
};

function isOverdueLoop(l: import("@arvya/core").OpenLoop): boolean {
  if (!l.dueDate) return false;
  return new Date(l.dueDate).getTime() < Date.now();
}

function ageDays(iso: string | undefined): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function buildSparklinePath(data: number[]): { path: string; fillPath: string; tip: { x: number; y: number } } {
  const W = 280;
  const H = 64;
  const max = Math.max(...data) * 1.15;
  const min = Math.min(...data) * 0.7;
  const stepX = W / (data.length - 1);
  const pts = data.map((v, i): [number, number] => [
    i * stepX,
    H - ((v - min) / (max - min)) * H,
  ]);
  const path = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const fillPath = `${path} L ${W},${H} L 0,${H} Z`;
  const tipPt = pts[pts.length - 1];
  return { path, fillPath, tip: { x: tipPt[0], y: tipPt[1] } };
}

function buildDonutSegments(segments: typeof DONUT_SEGMENTS) {
  const r = 15.9155;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.val, 0);
  let acc = 0;
  return segments.map((s) => {
    const len = (s.val / total) * c;
    const offset = -acc;
    acc += len;
    return { ...s, len, offset, c };
  });
}

export default async function DashboardPage({ params }: PageProps) {
  const { brainId } = await params;

  let snapshot;
  try {
    snapshot = await getBrainSnapshot(brainId);
  } catch (error) {
    if (isBrainNotFoundError(error)) notFound();
    throw error;
  }

  const selectedBrainId = snapshot.selectedBrain.id;
  const latestDrift = await getLatestDriftReview(selectedBrainId);
  const openLoops = snapshot.openLoops ?? [];
  const memoryObjects = snapshot.memoryObjects ?? [];
  const sourceItems = snapshot.sourceItems ?? [];
  const agentRuns = snapshot.agentRuns ?? [];

  const driftSignals = latestDrift?.review.signals ?? [];
  const driftDisplay =
    driftSignals.length > 0
      ? driftSignals.slice(0, 3).map((s) => ({ title: s.summary, body: s.detail }))
      : PLACEHOLDER_DRIFT_SIGNALS;

  const overdueLoops = openLoops.filter(isOverdueLoop).length;

  const topActions = openLoops.slice(0, 5);

  const spark = buildSparklinePath(SOURCE_SPARK);
  const donut = buildDonutSegments(DONUT_SEGMENTS);

  return (
    <div>
      <header className={styles.pageHd}>
        <div className={styles.eyebrow}>
          {snapshot.selectedBrain.name ?? "Today"}
          <span className={styles.eyeDot} />
          brain online
        </div>
        <h1>Good morning.</h1>
        <p className={styles.lede}>
          {sourceItems.length} artifacts logged. {memoryObjects.length} memory
          objects compiled. {openLoops.length} open loops, {overdueLoops} overdue.
        </p>

        <div className={styles.stats}>
          <div className={styles.stat}>
            Sources today
            <b>
              {sourceItems.length}
              <small>+38%</small>
            </b>
          </div>
          <div className={styles.stat}>
            Memory objects
            <b>{memoryObjects.length.toLocaleString()}</b>
          </div>
          <div className={styles.stat}>
            Action items
            <b>{openLoops.length}</b>
          </div>
          <div className={styles.stat}>
            Brain confidence
            <b>0.89</b>
          </div>
        </div>

        <form action={`/brains/${selectedBrainId}/ask`} className={styles.ask}>
          <input
            name="q"
            placeholder='Ask the brain anything - "what did we promise customers this week?"'
            className={styles.askInput}
          />
          <button type="submit" className={styles.askSend} aria-label="Ask">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </form>

        <div className={styles.quickrail}>
          {PRESET_PROMPTS.map((q) => (
            <Link
              key={q}
              href={`/brains/${selectedBrainId}/ask?q=${encodeURIComponent(q)}`}
            >
              {q}
            </Link>
          ))}
        </div>
      </header>

      <div className={styles.pulse}>
        <div>
          <span className={styles.pulseLab}>Ingesting</span>
          <span className={`${styles.pulseV} ${styles.pulseVGold}`}>
            {agentRuns.filter((r) => r.status === "running").length}
            <i className={styles.pulseVDot} />
          </span>
          <span className={styles.pulseSub}>live</span>
        </div>
        <div>
          <span className={styles.pulseLab}>Compiled today</span>
          <span className={styles.pulseV}>{memoryObjects.length}</span>
          <span className={styles.pulseSub}>memory objects</span>
        </div>
        <div>
          <span className={styles.pulseLab}>Promises tracked</span>
          <span className={styles.pulseV}>{openLoops.length}</span>
          <span className={overdueLoops > 0 ? styles.pulseSubWarn : styles.pulseSub}>
            {overdueLoops} overdue
          </span>
        </div>
        <div>
          <span className={styles.pulseLab}>Last dream cycle</span>
          <span className={styles.pulseV}>4h ago</span>
          <span className={styles.pulseSub}>+12 new edges</span>
        </div>
      </div>

      <div className={styles.dashGrid}>
        <div>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h3>Today&apos;s meetings</h3>
              <span className={styles.cardMeta}>
                {PLACEHOLDER_MEETINGS.length} - 2 with auto-join
              </span>
            </div>
            <div className={styles.cardBody}>
              {PLACEHOLDER_MEETINGS.map((m, i) => (
                <div
                  key={i}
                  style={{
                    padding: "10px 0",
                    borderTop: i === 0 ? "0" : "1px solid var(--cream-200)",
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                    {m.title}
                    {m.live && (
                      <span
                        style={{
                          color: "var(--arvya-gold-700)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          marginLeft: 6,
                        }}
                      >
                        Now
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-tertiary)",
                      fontFamily: "var(--font-mono)",
                      marginTop: 2,
                    }}
                  >
                    {m.when} - {m.sub}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.driftCard}>
            <div className={styles.driftCardHead}>
              <span className={styles.eyebrow}>
                Drift detected - {driftDisplay.length} signals
              </span>
              <Link
                href={`/brains/${selectedBrainId}/drift`}
                className={styles.eyebrow}
                style={{ textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                Open drift review
              </Link>
            </div>
            {driftDisplay.map((s, i) => (
              <div key={i} className={styles.driftSig}>
                <span className="ic">+</span>
                <div className="body">
                  <b>{s.title}</b> {s.body}
                </div>
                <span className="review">Review</span>
              </div>
            ))}
          </div>

          <div className={`${styles.card} ${styles.actionList}`}>
            <div className={styles.cardHead}>
              <h3>Action items</h3>
              <span className={styles.cardMeta}>
                {Math.min(topActions.length, 5)} of {openLoops.length} - brain-ranked
              </span>
            </div>
            {topActions.length === 0 ? (
              <div
                style={{
                  padding: "32px 20px",
                  textAlign: "center",
                  fontSize: 13,
                  color: "var(--text-tertiary)",
                }}
              >
                No open action items. The brain logs new ones as it reads sources.
              </div>
            ) : (
              topActions.map((loop) => {
                const age = ageDays(loop.dueDate ?? loop.createdAt);
                const old = age >= 3;
                return (
                  <div key={loop.id} className="row">
                    <span className="ck" />
                    <div>
                      <div className="t">{loop.title || loop.description || "Untitled action"}</div>
                      {loop.owner ? (
                        <div className="meta">
                          <span className="who">{loop.owner.toUpperCase()}</span>
                        </div>
                      ) : null}
                    </div>
                    <span className={`age ${old ? "old" : ""}`}>
                      {age <= 0 ? "today" : `${age}d`}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className={styles.chartCard}>
            <div className={styles.chartHd}>
              <h4>Sources ingested</h4>
              <span className="meta">Last 14 days</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
              <span className="stat">{SOURCE_SPARK[SOURCE_SPARK.length - 1]}</span>
              <small
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--arvya-status-active)",
                  letterSpacing: "0.04em",
                }}
              >
                +38% vs last week
              </small>
            </div>
            <div className={styles.spark}>
              <svg viewBox="0 0 280 64" preserveAspectRatio="none" aria-hidden>
                <defs>
                  <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D89A3F" stopOpacity="0.24" />
                    <stop offset="100%" stopColor="#D89A3F" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={spark.fillPath} fill="url(#sparkFill)" />
                <path
                  d={spark.path}
                  fill="none"
                  stroke="#0E1726"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx={spark.tip.x.toFixed(1)}
                  cy={spark.tip.y.toFixed(1)}
                  r="3.5"
                  fill="#D89A3F"
                  stroke="#fff"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <div className={styles.legend}>
              <span className="it">
                <span className="sw" style={{ background: "#0E1726" }} />
                Today
              </span>
              <span className="it">
                <span className="sw" style={{ background: "var(--cream-300)" }} />
                14-day avg
              </span>
            </div>
          </div>

          <div className={styles.chartCard}>
            <div className={styles.chartHd}>
              <h4>Compile confidence</h4>
              <span className="meta">By domain</span>
            </div>
            <div className={styles.donutWrap}>
              <div className={styles.donut}>
                <svg viewBox="0 0 36 36" aria-hidden>
                  <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#F5F1EB" strokeWidth="3.4" />
                  {donut.map((s) => (
                    <circle
                      key={s.lab}
                      cx="18"
                      cy="18"
                      r="15.9155"
                      fill="none"
                      stroke={s.color}
                      strokeWidth="3.4"
                      strokeDasharray={`${s.len} ${s.c - s.len}`}
                      strokeDashoffset={s.offset}
                    />
                  ))}
                </svg>
                <div className={styles.ctr}>
                  <div>
                    <b>0.89</b>
                    <small>brain</small>
                  </div>
                </div>
              </div>
              <div className={styles.donutLegend}>
                {DONUT_SEGMENTS.map((s) => (
                  <div key={s.lab} className="it">
                    <span className="sw" style={{ background: s.color }} />
                    <span>{s.lab}</span>
                    <span className="v">{s.val.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.chartCard}>
            <div className={styles.chartHd}>
              <h4>Promises by status</h4>
              <span className="meta">{PROMISE_BARS.reduce((s, b) => s + b.val, 0)} tracked</span>
            </div>
            <div className={styles.bars}>
              {PROMISE_BARS.map((b) => (
                <div key={b.lab} className="bar">
                  <span className="lab">{b.lab}</span>
                  <span className="tr">
                    <span
                      className={`fl ${b.kind}`}
                      style={{ width: `${((b.val / b.total) * 100).toFixed(1)}%` }}
                    />
                  </span>
                  <span className="v">{b.val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={`${styles.card} ${styles.live}`} style={{ marginBottom: 0 }}>
            <div className={styles.cardHead}>
              <h3>Brain - live</h3>
              <span
                className={styles.cardMeta}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#2ECC7A",
                    display: "inline-block",
                  }}
                />
                watching
              </span>
            </div>
            {LIVE_STREAM.map((ev, i) => (
              <div key={i} className="row">
                <span className={`ic ${ev.state === "run" ? "icRun" : ""}`}>
                  {ev.state === "ok" ? "+" : null}
                </span>
                <span>
                  <span className="nm">{ev.name}</span>
                  <span className="arg">{ev.arg}</span>
                </span>
                <span className={`st ${ev.state === "run" ? "stRun" : ""}`}>
                  {ev.state === "run" ? "running" : ev.t}
                </span>
              </div>
            ))}
            <div className={styles.liveFoot}>
              <span>
                {agentRuns.length} runs today - {agentRuns.filter((r) => r.status === "failed").length} failed
              </span>
              <Link href={`/brains/${selectedBrainId}/agent-runs`}>All runs</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
