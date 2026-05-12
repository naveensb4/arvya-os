import { notFound } from "next/navigation";
import Link from "next/link";
import type { BrainDoc } from "@arvya/core";
import type { BrainEvent, CalendarEvent } from "@/lib/db/repository";
import { getRepository } from "@/lib/db/repository";
import {
  getBrainSnapshot,
  getLatestDriftReview,
  isBrainNotFoundError,
} from "@/lib/brain/store";
import { buildDashboardModel } from "@/lib/brain/dashboard";
import { runCalendarPipeline } from "@/lib/notetaker/runtime";
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

// Friendly labels for the recent-activity widget, replaces snake_case run
// names with what the user actually sees the brain doing.
const AGENT_RUN_LABELS: Record<string, string> = {
  daily_brief: "Compiled daily brief",
  ask_brain: "Answered a question",
  drift_review: "Reviewed drift",
  source_ingest: "Read a new source",
  meeting_prep: "Prepped for a meeting",
  post_meeting: "Processed meeting transcript",
  open_loop_monitor: "Checked open loops",
  scheduled_connector_sync: "Pulled new sources",
  weekly_learning_memo: "Compiled weekly memo",
};


// Drift signal fallback - shown only when no DriftReview has been run yet.
// Once getLatestDriftReview returns real data, these go unused.
const PLACEHOLDER_DRIFT_SIGNALS = [
  {
    title: "No drift signals yet.",
    body: "Run a drift review (Operations - Drift review in the sidebar) and patterns the brain has noticed across your sources will appear here.",
  },
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

function formatRelativeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDueLabel(iso: string | undefined): string {
  if (!iso) return "No due date";
  const due = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const diff = Math.round((dueDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff <= 7) return `Due in ${diff}d`;
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function loopStateLabel(loop: import("@arvya/core").OpenLoop): string {
  if (loop.status === "needs_review") return "Needs founder review";
  if (isOverdueLoop(loop)) return "Overdue";
  if (loop.status === "waiting") return "Waiting";
  return loop.priority === "critical" ? "Critical" : loop.priority;
}

function sourceTypeLabel(source: import("@arvya/core").SourceItem): string {
  const domain = source.metadata?.domain_type;
  if (typeof domain === "string") return domain.replace(/_/g, " ");
  return source.type.replace(/_/g, " ");
}

function brainEventSummary(event: BrainEvent): string {
  if (event.eventType === "connector_sync_completed") {
    const payload = event.payload ?? {};
    const ingested = typeof payload.ingested_count === "number" ? payload.ingested_count : 0;
    const found = typeof payload.found_count === "number" ? payload.found_count : 0;
    const source = event.sourceSystem?.replace(/_/g, " ") ?? "connector";
    return `${source} sync completed: ${ingested} ingested, ${found} found`;
  }
  return event.eventType.replace(/_/g, " ");
}

function build14DaySourceHistogram(
  items: import("@arvya/core").SourceItem[],
): number[] {
  // Counts per day for the last 14 days, oldest -> newest.
  const buckets = new Array(14).fill(0) as number[];
  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  for (const item of items) {
    const t = new Date(item.createdAt).getTime();
    const daysAgo = Math.floor((todayStart.getTime() - t) / dayMs);
    if (daysAgo < 0 || daysAgo >= 14) continue;
    const idx = 13 - daysAgo;
    buckets[idx] += 1;
  }
  return buckets;
}

function buildConfidenceDonut(
  memoryObjects: import("@arvya/core").MemoryObject[],
) {
  // Group memory objects by objectType, average their confidence.
  const groups = new Map<string, { sum: number; count: number }>();
  for (const m of memoryObjects) {
    const key = m.objectType ?? "other";
    const conf = typeof m.confidence === "number" ? m.confidence : 0.7;
    const g = groups.get(key) ?? { sum: 0, count: 0 };
    g.sum += conf;
    g.count += 1;
    groups.set(key, g);
  }
  const palette: Record<string, string> = {
    person: "#0E1726",
    company: "#D89A3F",
    commitment: "#2ECC7A",
    insight: "#5C5CE6",
    decision: "#B85FD9",
    fact: "#2DBBB0",
  };
  return Array.from(groups.entries())
    .map(([key, g]) => ({
      lab: key.charAt(0).toUpperCase() + key.slice(1),
      val: g.sum / Math.max(1, g.count),
      color: palette[key] ?? "#6E6E73",
    }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 5);
}

function buildPromiseBars(openLoops: import("@arvya/core").OpenLoop[]) {
  // Bucket loops by status into On track / Drifting / Overdue.
  let onTrack = 0;
  let drifting = 0;
  let overdue = 0;
  const nowMs = Date.now();
  for (const loop of openLoops) {
    if (loop.status === "done" || loop.status === "closed" || loop.status === "dismissed") {
      continue;
    }
    const dueMs = loop.dueDate ? new Date(loop.dueDate).getTime() : null;
    if (dueMs !== null && dueMs < nowMs) {
      overdue += 1;
    } else if (loop.status === "needs_review") {
      drifting += 1;
    } else {
      onTrack += 1;
    }
  }
  const total = onTrack + drifting + overdue || 1;
  return [
    { lab: "On track", val: onTrack, total, kind: "green" as const },
    { lab: "Drifting", val: drifting, total, kind: "gold" as const },
    { lab: "Overdue", val: overdue, total, kind: "red" as const },
  ];
}

const AVATAR_PALETTE = [
  "#29B36B",
  "#E64C4C",
  "#4E91F0",
  "#D89A3F",
  "#B85FD9",
  "#5C5CE6",
  "#2DBBB0",
  "#F08531",
];

function avatarFor(name: string): { initials: string; color: string } {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const color = AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
  return { initials, color };
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.5 1.75H8.75L11.375 4.375V12.25H3.5V1.75Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M8.75 1.75V4.375H11.375" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <line x1="5.25" y1="6.5" x2="9.625" y2="6.5" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="5.25" y1="8.75" x2="9.625" y2="8.75" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  );
}

function renderMeetingRows(
  meetings: CalendarEvent[],
  brainId: string,
  docByMeetingId?: Map<string | undefined, BrainDoc>,
) {
  // Group consecutive meetings on the same day so only the first row of each
  // day shows the date-block; later rows on the same day get a hidden block.
  // Also flag the meeting that is currently happening as `now`.
  const now = Date.now();
  let lastDay = "";
  return meetings.map((m, i) => {
    const start = new Date(m.startTime);
    const end = new Date(m.endTime);
    const dayKey = start.toISOString().slice(0, 10);
    const showDayLab =
      i > 0 && dayKey !== lastDay
        ? start.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })
        : null;
    const showDateBlock = i === 0 || dayKey !== lastDay;
    lastDay = dayKey;
    const isLive = start.getTime() <= now && now <= end.getTime();
    const dow = start.toLocaleDateString(undefined, { weekday: "short" });
    const day = start.getDate();
    const startLabel = start.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    const endLabel = end.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    const participants = Array.isArray(m.participants) ? m.participants : [];
    const avatars = participants
      .slice(0, 4)
      .map((p) => {
        if (typeof p === "string") return avatarFor(p);
        if (p && typeof p === "object") {
          const obj = p as Record<string, unknown>;
          const label =
            (typeof obj.name === "string" && obj.name) ||
            (typeof obj.email === "string" && obj.email) ||
            "?";
          return avatarFor(label);
        }
        return avatarFor("?");
      });

    return (
      <div key={m.id}>
        {showDayLab ? (
          <div className={styles.meetDayLab}>{showDayLab}</div>
        ) : null}
        <div
          className={`${styles.meetRow} ${isLive ? styles.meetRowNow : ""}`}
        >
          <div
            className={`${styles.dateBlock} ${
              !showDateBlock ? styles.dateBlockBare : ""
            }`}
          >
            <span className={styles.dow}>{dow}</span>
            <span className={styles.day}>{day}</span>
          </div>
          <span className={styles.meetRail} />
          <div className={styles.meetBody}>
            <div className={styles.meetTitle}>
              {m.title}
              {m.eventType === "in_person" ? (
                <span className={`${styles.eventBadge} ${styles.eventBadgeInPerson}`}>In-person</span>
              ) : m.eventType === "hybrid" ? (
                <span className={`${styles.eventBadge} ${styles.eventBadgeHybrid}`}>Hybrid</span>
              ) : null}
              {isLive ? (
                <span className={styles.live}>
                  ▶ Now - {startLabel} - {endLabel}
                </span>
              ) : null}
            </div>
            <div className={styles.meetTime}>
              {!isLive
                ? `${startLabel} - ${endLabel}`
                : null}
              {participants.length > 0
                ? `${!isLive ? " - " : ""}${participants.length} attendees`
                : null}
            </div>
            {m.location && !m.meetingUrl ? (
              <div className={styles.meetLocation}>{m.location}</div>
            ) : null}
          </div>
          <div className={styles.meetRight}>
            <div className={`${styles.meetActions} ${isLive ? styles.meetActionsLive : ""}`}>
              {(() => {
                const doc = docByMeetingId?.get(m.id);
                if (doc) {
                  return (
                    <Link
                      className={styles.meetBtn}
                      href={`/brains/${brainId}/meetings/${m.id}/prep`}
                      title="Open meeting prep doc"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      <DocIcon /> Prepped
                    </Link>
                  );
                }
                return (
                  <Link
                    className={styles.meetBtn}
                    href={`/brains/${brainId}/ask?mode=meeting-prep&meetingId=${m.id}`}
                  >
                    Prep
                  </Link>
                );
              })()}
              {m.meetingUrl ? (
                <a
                  className={`${styles.meetBtn} ${styles.meetBtnPrimary}`}
                  href={m.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Join →
                </a>
              ) : null}
            </div>
            <div className={styles.avStack}>
              {avatars.map((a, j) => (
                <span
                  key={j}
                  className={styles.av}
                  style={{ background: a.color }}
                >
                  {a.initials}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  });
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

type DonutSegment = { lab: string; val: number; color: string };

function buildDonutSegments(segments: DonutSegment[]) {
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

  // Real meetings from the notetaker pipeline. Window: now -> +48h.
  const repository = getRepository();
  const now = new Date();
  const currentTime = now.getTime();
  const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const [connectorConfigs, syncRuns, brainEvents] = await Promise.all([
    repository.listConnectorConfigs(selectedBrainId),
    repository.listConnectorSyncRuns({ brainId: selectedBrainId, limit: 25 }),
    repository.listBrainEvents(selectedBrainId, { limit: 12 }),
  ]);
  const dashboard = buildDashboardModel({
    snapshot,
    syncRuns,
    connectorConfigs,
    currentTime,
  });

  const calendars = await repository.listNotetakerCalendars({
    brainId: selectedBrainId,
    status: "connected",
  });
  const stale = calendars.find((c) => {
    if (!c.lastSyncAt) return true;
    return Date.now() - new Date(c.lastSyncAt).getTime() > 5 * 60 * 1000;
  });
  if (stale) {
    runCalendarPipeline({ brainId: selectedBrainId }).catch(() => {});
  }

  const upcomingMeetings = await repository.listCalendarEvents({
    brainId: selectedBrainId,
    from: now.toISOString(),
    to: windowEnd.toISOString(),
    eventStatus: "active",
    limit: 10,
  });
  const sourceById = new Map(sourceItems.map((s) => [s.id, s]));

  const meetingIds = upcomingMeetings.map((m) => m.id);
  const meetingDocs = meetingIds.length > 0
    ? await repository.listBrainDocsForMeetings(selectedBrainId, meetingIds)
    : [];
  const docByMeetingId = new Map(meetingDocs.map((d) => [d.meetingId, d]));

  const driftSignals = latestDrift?.review.signals ?? [];
  const driftDisplay =
    driftSignals.length > 0
      ? driftSignals.slice(0, 3).map((s) => ({ title: s.summary, body: s.detail }))
      : PLACEHOLDER_DRIFT_SIGNALS;

  const overdueLoops = dashboard.overdueLoops.length;
  const needsAttention = [
    ...dashboard.overdueLoops,
    ...dashboard.reviewBacklog,
    ...dashboard.dueSoonLoops,
    ...dashboard.actionQueue,
  ].filter((loop, index, arr) => arr.findIndex((item) => item.id === loop.id) === index).slice(0, 6);
  const founderDecisionItems = [
    ...dashboard.reviewBacklog.map((loop) => ({
      id: loop.id,
      title: loop.title || loop.description || "Review extracted loop",
      body: loop.sourceQuote ?? loop.description,
      href: `/brains/${selectedBrainId}/open-loops`,
      label: "Review loop",
    })),
    ...dashboard.driftFindings.map((finding, index) => ({
      id: `drift-${index}`,
      title: finding.title,
      body: finding.description,
      href: `/brains/${selectedBrainId}/drift`,
      label: finding.severity,
    })),
    ...dashboard.questions.map((question) => ({
      id: question.id,
      title: question.name,
      body: question.description,
      href: `/brains/${selectedBrainId}/memory`,
      label: "Question",
    })),
  ].slice(0, 5);
  const changeItems = [
    ...brainEvents.map((event) => ({
      id: event.id,
      title: brainEventSummary(event),
      meta: formatRelativeAgo(event.createdAt),
      href: `/brains/${selectedBrainId}/connections`,
    })),
    ...dashboard.operationalSources.slice(0, 6).map((source) => ({
      id: source.id,
      title: source.title,
      meta: `${sourceTypeLabel(source)} - ${formatRelativeAgo(source.createdAt)}`,
      href: `/brains/${selectedBrainId}/sources`,
    })),
  ].slice(0, 6);

  // Real 14-day source ingestion histogram. Bucket sourceItems by their
  // createdAt date, fill empty days with 0.
  const sparkSeries = build14DaySourceHistogram(sourceItems);
  const sparkValueToday = sparkSeries[sparkSeries.length - 1] ?? 0;
  const sparkValuePrevWeek = sparkSeries.slice(0, 7).reduce((s, v) => s + v, 0);
  const sparkValueThisWeek = sparkSeries.slice(7).reduce((s, v) => s + v, 0);
  const sparkPctChange =
    sparkValuePrevWeek > 0
      ? Math.round(((sparkValueThisWeek - sparkValuePrevWeek) / sparkValuePrevWeek) * 100)
      : null;
  const spark = buildSparklinePath(sparkSeries);

  // Real compile-confidence donut: average memoryObject.confidence per type.
  const donutData = buildConfidenceDonut(memoryObjects);
  const donut = buildDonutSegments(donutData);
  const overallConfidence =
    donutData.length > 0
      ? donutData.reduce((s, d) => s + d.val, 0) / donutData.length
      : 0;

  // Real promises-by-status bars from open loops.
  const promiseBars = buildPromiseBars(openLoops);
  const promisesTotal = openLoops.length;

  // Real live agent stream: 6 most recent runs.
  const liveRuns = (agentRuns ?? [])
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 6);
  const failedRuns = agentRuns.filter((r) => r.status === "failed").length;

  // Real "last drift review" - the most recent run of the drift_review
  // agent. Replaces the unimplemented "dream cycle" tile.
  const lastDriftRun = agentRuns
    .filter((r) => r.name === "drift_review" && r.status === "succeeded")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const lastDriftAgo = lastDriftRun
    ? formatRelativeAgo(lastDriftRun.startedAt)
    : "never";

  // Real ingesting count: agent runs in the "running" state right now.
  const runningCount = agentRuns.filter((r) => r.status === "running").length;

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
              {sparkValueToday}
              {sparkPctChange !== null ? (
                <small>
                  {sparkPctChange >= 0 ? "+" : ""}
                  {sparkPctChange}%
                </small>
              ) : null}
            </b>
          </div>
          <div className={styles.stat}>
            Memory objects
            <b>{memoryObjects.length.toLocaleString()}</b>
          </div>
          <div className={styles.stat}>
            Open loops
            <b>{openLoops.length}</b>
          </div>
          <div className={styles.stat}>
            Brain confidence
            <b>{overallConfidence > 0 ? overallConfidence.toFixed(2) : "-"}</b>
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
        <Link
          href={`/brains/${selectedBrainId}/drift`}
          style={{ textDecoration: "none", color: "inherit" }}
          title="The brain compares what was said vs what was done across your sources, and surfaces patterns. Click to open or run a new review."
        >
          <span className={styles.pulseLab}>Last drift review</span>
          <span className={styles.pulseV}>{lastDriftAgo}</span>
          <span className={styles.pulseSub}>
            {lastDriftRun ? "click to review" : "click to run"}
          </span>
        </Link>
      </div>

      <section className={styles.cockpit} aria-label="Today cockpit">
        <div className={styles.cockpitPrimary}>
          <div className={styles.cockpitHead}>
            <div>
              <span className={styles.eyebrow}>Needs attention now</span>
              <h2>{dashboard.commandSummary}</h2>
            </div>
            <Link href={`/brains/${selectedBrainId}/open-loops`}>Open loops</Link>
          </div>
          {needsAttention.length === 0 ? (
            <div className={styles.emptyPanel}>
              No urgent loops. Add sources or run a drift review to keep the operating picture fresh.
            </div>
          ) : (
            <div className={styles.focusList}>
              {needsAttention.map((loop) => {
                const sourceTitle = loop.sourceItemId ? sourceById.get(loop.sourceItemId)?.title : undefined;
                return (
                  <Link
                    key={loop.id}
                    href={`/brains/${selectedBrainId}/open-loops`}
                    className={styles.focusItem}
                  >
                    <span className={styles.focusState}>{loopStateLabel(loop)}</span>
                    <span className={styles.focusTitle}>{loop.title || loop.description || "Untitled loop"}</span>
                    <span className={styles.focusMeta}>
                      {loop.owner ? `${loop.owner} - ` : ""}
                      {formatDueLabel(loop.dueDate)}
                      {sourceTitle ? ` - evidence: ${sourceTitle.slice(0, 42)}` : ""}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.cockpitSide}>
          <div className={styles.sidePanel}>
            <div className={styles.sidePanelHead}>
              <h3>Founder decisions</h3>
              <span>{founderDecisionItems.length}</span>
            </div>
            {founderDecisionItems.length === 0 ? (
              <p className={styles.sideEmpty}>No review items or strategic questions are waiting.</p>
            ) : (
              founderDecisionItems.map((item) => (
                <Link key={item.id} href={item.href} className={styles.decisionItem}>
                  <span>{item.label}</span>
                  <b>{item.title}</b>
                  <small>{item.body}</small>
                </Link>
              ))
            )}
          </div>

          <div className={styles.sidePanel}>
            <div className={styles.sidePanelHead}>
              <h3>What changed</h3>
              <span>{changeItems.length}</span>
            </div>
            {changeItems.length === 0 ? (
              <p className={styles.sideEmpty}>No connector events or recent sources yet.</p>
            ) : (
              changeItems.map((item) => (
                <Link key={item.id} href={item.href} className={styles.changeItem}>
                  <b>{item.title}</b>
                  <span>{item.meta}</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      <div className={styles.dashGrid}>
        <div>
          <div className={styles.card} style={{ paddingBottom: 4 }}>
            <div className={styles.cardHead}>
              <h3>Today&apos;s meetings</h3>
              <span className={styles.cardMeta}>
                {upcomingMeetings.length} upcoming
              </span>
            </div>
            {upcomingMeetings.length === 0 ? (
              <div
                style={{
                  padding: "32px 20px",
                  textAlign: "center",
                  fontSize: 13,
                  color: "var(--text-tertiary)",
                }}
              >
                No upcoming meetings on the calendar.
              </div>
            ) : (
              renderMeetingRows(upcomingMeetings, selectedBrainId, docByMeetingId)
            )}
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
              <h3>Suggested next actions</h3>
              <span className={styles.cardMeta}>
                {Math.min(dashboard.suggestedActions.length, 5)} of {openLoops.length} - source-backed
              </span>
            </div>
            {dashboard.suggestedActions.length === 0 ? (
              <div
                style={{
                  padding: "32px 20px",
                  textAlign: "center",
                  fontSize: 13,
                  color: "var(--text-tertiary)",
                }}
              >
                No suggested actions yet. The Brain adds them as loops are approved and enriched.
              </div>
            ) : (
              dashboard.suggestedActions.map((loop) => {
                const age = ageDays(loop.dueDate ?? loop.createdAt);
                const old = age >= 3;
                const sourceTitle = loop.sourceItemId
                  ? sourceById.get(loop.sourceItemId)?.title
                  : undefined;
                return (
                  <div key={loop.id} className={styles.row}>
                    <span className={styles.ck} />
                    <div>
                      <div className={styles.t}>
                        {loop.title || loop.description || "Untitled action"}
                      </div>
                      <div className={styles.meta}>
                        {loop.owner ? (
                          <span className={styles.who}>{loop.owner.toUpperCase()}</span>
                        ) : null}
                        {loop.priority ? (
                          <span> - {loop.priority}</span>
                        ) : null}
                        {sourceTitle ? (
                          <span>
                            {" "}
                            -{" "}
                            <Link
                              className={styles.cite}
                              href={`/brains/${selectedBrainId}/sources`}
                            >
                              source: {sourceTitle.slice(0, 32)}
                            </Link>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`${styles.age} ${old ? styles.ageOld : ""}`}
                    >
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
              <span className="stat">{sparkValueToday}</span>
              {sparkPctChange !== null ? (
                <small
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color:
                      sparkPctChange >= 0
                        ? "var(--arvya-status-active)"
                        : "var(--text-tertiary)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {sparkPctChange >= 0 ? "+" : ""}
                  {sparkPctChange}% vs last week
                </small>
              ) : null}
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
                    <b>{overallConfidence > 0 ? overallConfidence.toFixed(2) : "-"}</b>
                    <small>brain</small>
                  </div>
                </div>
              </div>
              <div className={styles.donutLegend}>
                {donutData.length === 0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                      padding: "4px 0",
                    }}
                  >
                    No memory objects yet.
                  </div>
                ) : (
                  donutData.map((s) => (
                    <div key={s.lab} className="it">
                      <span className="sw" style={{ background: s.color }} />
                      <span>{s.lab}</span>
                      <span className="v">{s.val.toFixed(2)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className={styles.chartCard}>
            <div className={styles.chartHd}>
              <h4>Promises by status</h4>
              <span className="meta">{promisesTotal} tracked</span>
            </div>
            <div className={styles.bars}>
              {promiseBars.map((b) => (
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
              <h3>Recent activity</h3>
              <span
                className={styles.cardMeta}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
                title="Background jobs the brain has run: ingesting sources, compiling memory, generating briefs, answering questions."
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: runningCount > 0 ? "#D89A3F" : "#2ECC7A",
                    display: "inline-block",
                  }}
                />
                {runningCount > 0 ? "working" : "idle"}
              </span>
            </div>
            {liveRuns.length === 0 ? (
              <div
                style={{
                  padding: "20px 12px",
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  textAlign: "center",
                }}
              >
                No background jobs have run yet.
              </div>
            ) : (
              liveRuns.map((run) => {
                const state =
                  run.status === "running"
                    ? "run"
                    : run.status === "succeeded"
                      ? "ok"
                      : "fail";
                const label =
                  AGENT_RUN_LABELS[run.name] ?? run.name.replace(/_/g, " ");
                return (
                  <div key={run.id} className="row">
                    <span className={`ic ${state === "run" ? "icRun" : ""}`}>
                      {state === "ok" ? "✓" : state === "fail" ? "!" : null}
                    </span>
                    <span>
                      <span className="nm">{label}</span>
                    </span>
                    <span className={`st ${state === "run" ? "stRun" : ""}`}>
                      {state === "run"
                        ? "running"
                        : formatRelativeAgo(run.startedAt)}
                    </span>
                  </div>
                );
              })
            )}
            <div className={styles.liveFoot}>
              <span>
                {agentRuns.length} runs - {failedRuns} failed
                {runningCount > 0 ? ` - ${runningCount} live` : ""}
              </span>
              <Link href={`/brains/${selectedBrainId}/agent-runs`}>All runs</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
