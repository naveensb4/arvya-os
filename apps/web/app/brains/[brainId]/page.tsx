import { notFound } from "next/navigation";
import Link from "next/link";
import type {
  DriftReview,
  MemoryObject,
  OpenLoop,
} from "@arvya/core";
import { SectionShell } from "@/components/layout/section-shell";
import { AgentRunCard } from "@/components/brain/agent-run-card";
import { MemoryCard } from "@/components/memory/memory-card";
import { OpenLoopCard } from "@/components/open-loops/open-loop-card";
import { SourceCard } from "@/components/sources/source-card";
import { buildDashboardModel } from "@/lib/brain/dashboard";
import {
  getBrainSnapshot,
  getLatestDriftReview,
  isBrainNotFoundError,
  listBrainPriorities,
} from "@/lib/brain/store";
import { getRepository } from "@/lib/db/repository";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { brainId } = await params;
  const snapshot = await getDashboardSnapshot(brainId);
  const selectedBrainId = snapshot.selectedBrain.id;
  const repository = getRepository();
  const [alerts, syncRuns, connectorConfigs, activePriorities, latestDrift] =
    await Promise.all([
      repository.listBrainAlerts({ brainId: selectedBrainId, status: "unread", limit: 5 }),
      repository.listConnectorSyncRuns({ brainId: selectedBrainId, limit: 10 }),
      repository.listConnectorConfigs(selectedBrainId),
      listBrainPriorities(selectedBrainId, { status: "active", limit: 5 }),
      getLatestDriftReview(selectedBrainId),
    ]);
  const sourceById = new Map(snapshot.sourceItems.map((source) => [source.id, source]));
  const dashboard = buildDashboardModel({ snapshot, syncRuns, connectorConfigs });

  return (
    <SectionShell brainId={selectedBrainId} title="Brain Overview" description="Founder command center for source capture, action loops, memory, and agent health.">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Brain Health" value={dashboard.brainHealth} />
        <Metric label="Last Source Ingestion" value={formatDate(dashboard.latestOperationalSource?.createdAt)} />
        <Metric label="New User Sources 24h" value={dashboard.newOperationalSources24h} />
        <Metric label="Overdue Action Loops" value={dashboard.overdueLoops.length} href={`/brains/${selectedBrainId}/open-loops?filter=overdue`} />
        <Metric label="Loops To Review" value={dashboard.reviewBacklog.length} href={`/brains/${selectedBrainId}/open-loops?filter=needs_review`} />
        <Metric label="Due Next 7 Days" value={dashboard.dueSoonLoops.length} href={`/brains/${selectedBrainId}/open-loops?filter=due_soon`} />
      </div>

      <section className="mt-6 rounded-2xl bg-stone-950 p-5 text-white">
        <p className="eyebrow text-amber-300">Today&apos;s Operating Read</p>
        <h2 className="mt-2 text-2xl font-semibold">{dashboard.commandSummary}</h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/brains/${selectedBrainId}/sources/new`} className="button bg-white text-stone-950 hover:bg-stone-100">
            Add Source
          </Link>
          <Link href={`/brains/${selectedBrainId}/open-loops`} className="button-secondary border-white/20 bg-white/10 text-white hover:bg-white/20">
            Review Open Loops
          </Link>
          <Link href={`/brains/${selectedBrainId}/ask`} className="button-secondary border-white/20 bg-white/10 text-white hover:bg-white/20">
            Ask Brain
          </Link>
          <Link
            href={`/brains/${selectedBrainId}/priorities`}
            className="button-secondary border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            Priorities ({activePriorities.length})
          </Link>
          <Link
            href={`/brains/${selectedBrainId}/drift`}
            className="button-secondary border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            Drift Review
          </Link>
        </div>
      </section>

      {latestDrift ? <DriftSummaryCard brainId={selectedBrainId} review={latestDrift.review} /> : null}

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Metric label="Failed Sync Runs" value={dashboard.failedSyncs} />
        <Metric label="Connector Health" value={dashboard.connectorHealth} />
        <Metric label="Drift Findings" value={dashboard.driftFindings.length} />
      </div>

      <section className="mt-6 rounded-2xl bg-stone-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-amber-700">Company Drift Review</p>
            <h2 className="mt-2 text-2xl font-semibold">{dashboard.driftSummary}</h2>
            <p className="mt-2 text-sm text-stone-600">
              Latest stored review: {dashboard.latestDriftReport ? formatDate(dashboard.latestDriftReport.createdAt) : "Never"}
            </p>
          </div>
          <Link href={`/brains/${selectedBrainId}/drift`} className="button">
            Review Drift
          </Link>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {dashboard.driftFindings.map((finding) => (
            <div key={finding.id} className="rounded-xl bg-white p-4 text-sm">
              <p className="text-xs uppercase tracking-widest text-stone-400">{finding.severity}</p>
              <p className="mt-1 font-medium">{finding.title}</p>
              <p className="mt-1 leading-6 text-stone-600">{finding.description}</p>
              <p className="mt-3 text-stone-800">
                <span className="font-medium">Next:</span> {finding.suggestedAction}
              </p>
            </div>
          ))}
          {dashboard.driftFindings.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-stone-500">No drift findings from current Brain context.</p>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-2xl bg-stone-50 p-5">
        <p className="eyebrow text-amber-700">Daily Brief</p>
        <h2 className="mt-2 text-2xl font-semibold">{dashboard.latestDailyBrief?.title ?? "No daily brief stored yet"}</h2>
        <p className="mt-2 whitespace-pre-line leading-7 text-stone-700">
          {dashboard.latestDailyBrief?.content ?? "The always-on daily-founder-brief job will store the morning brief here after it runs."}
        </p>
      </section>

      <section className="mt-6 rounded-2xl bg-stone-50 p-5">
        <p className="eyebrow text-amber-700">Latest Alerts</p>
        <div className="mt-4 space-y-2">
          {alerts.map((alert) => (
            <div key={alert.id} className="rounded-xl bg-white p-3 text-sm">
              <p className="font-medium">{alert.title}</p>
              <p className="mt-1 text-stone-600">{alert.description}</p>
            </div>
          ))}
          {alerts.length === 0 ? <p className="text-sm text-stone-500">No unread alerts.</p> : null}
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <FounderActionPanel
          title="Naveen Actions"
          loops={dashboard.naveenActions}
          emptyText="No approved actions assigned to Naveen."
        />
        <FounderActionPanel
          title="PB Actions"
          loops={dashboard.pbActions}
          emptyText="No approved actions assigned to PB."
        />
        <FounderActionPanel
          title="Suggested Next Actions"
          loops={dashboard.suggestedActions}
          emptyText="No suggested actions yet. Approve or ingest more open loops."
          showSuggestion
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-4">
        <MemoryListPanel
          title="Risks / Dropped Balls"
          items={dashboard.risks}
          emptyText="No risks captured yet."
        />
        <MemoryListPanel
          title="Questions To Resolve"
          items={dashboard.questions}
          emptyText="No open strategic questions captured yet."
        />
        <MemoryListPanel
          title="Product / Market Signals"
          items={dashboard.productInsights}
          emptyText="No product insights captured yet."
        />
        <MemoryListPanel
          title="Outcome Learnings"
          items={dashboard.outcomeLearnings}
          emptyText="No closed-loop outcomes captured yet."
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold">Action Queue</h2>
          <div className="mt-4 space-y-3">
            {dashboard.actionQueue.slice(0, 3).map((loop) => (
              <OpenLoopCard
                key={loop.id}
                brainId={selectedBrainId}
                loop={loop}
                source={loop.sourceItemId ? sourceById.get(loop.sourceItemId) : undefined}
                showReviewControls={false}
              />
            ))}
            {dashboard.actionQueue.length === 0 ? <Empty text="No open loops yet." /> : null}
          </div>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Recent Memory</h2>
          <div className="mt-4 space-y-3">
            {snapshot.memoryObjects.slice(0, 4).map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                source={memory.sourceItemId ? sourceById.get(memory.sourceItemId) : undefined}
                showEvidence={false}
                showEditControls={false}
              />
            ))}
            {snapshot.memoryObjects.length === 0 ? <Empty text="No memory captured yet." /> : null}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold">Recent User Sources</h2>
          <div className="mt-4 space-y-3">
            {dashboard.operationalSources.slice(0, 3).map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
            {dashboard.operationalSources.length === 0 ? <Empty text="No user-ingested sources yet." /> : null}
          </div>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Recent Agent Runs</h2>
          <div className="mt-4 space-y-3">
            {snapshot.agentRuns.slice(0, 3).map((run) => (
              <AgentRunCard key={run.id} run={run} />
            ))}
            {snapshot.agentRuns.length === 0 ? <Empty text="No agent runs yet." /> : null}
          </div>
        </section>
      </div>
    </SectionShell>
  );
}

async function getDashboardSnapshot(brainId: string) {
  try {
    return await getBrainSnapshot(brainId);
  } catch (error) {
    if (isBrainNotFoundError(error)) notFound();
    throw error;
  }
}

function Metric({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const content = (
    <div className="rounded-2xl bg-stone-50 p-4 transition hover:bg-stone-100">
      <p className="text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-widest text-stone-500">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-500">{text}</p>;
}

function FounderActionPanel({
  title,
  loops,
  emptyText,
  showSuggestion = false,
}: {
  title: string;
  loops: OpenLoop[];
  emptyText: string;
  showSuggestion?: boolean;
}) {
  return (
    <section className="rounded-2xl bg-stone-50 p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">
        {loops.map((loop) => (
          <div key={loop.id} className="rounded-xl bg-white p-3 text-sm">
            <p className="font-medium">{loop.title}</p>
            <p className="mt-1 text-stone-600">{showSuggestion ? loop.suggestedAction : loop.description}</p>
            <p className="mt-2 text-xs uppercase tracking-widest text-stone-400">
              {loop.priority} · {loop.status}
              {loop.dueDate ? ` · Due ${formatDate(loop.dueDate)}` : ""}
            </p>
          </div>
        ))}
        {loops.length === 0 ? <p className="rounded-xl bg-white p-3 text-sm text-stone-500">{emptyText}</p> : null}
      </div>
    </section>
  );
}

function MemoryListPanel({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: MemoryObject[];
  emptyText: string;
}) {
  return (
    <section className="rounded-2xl bg-stone-50 p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl bg-white p-3 text-sm">
            <p className="font-medium">{item.name}</p>
            <p className="mt-1 leading-6 text-stone-600">{item.description}</p>
            {item.sourceQuote ? (
              <blockquote className="mt-2 border-l-2 border-amber-600 pl-3 text-xs text-stone-500">
                {item.sourceQuote}
              </blockquote>
            ) : null}
          </div>
        ))}
        {items.length === 0 ? <p className="rounded-xl bg-white p-3 text-sm text-stone-500">{emptyText}</p> : null}
      </div>
    </section>
  );
}

const driftAlignmentBadge: Record<string, string> = {
  aligned: "bg-emerald-100 text-emerald-900",
  minor_drift: "bg-amber-100 text-amber-900",
  major_drift: "bg-red-100 text-red-900",
};

const driftAlignmentLabel: Record<string, string> = {
  aligned: "Aligned",
  minor_drift: "Minor drift",
  major_drift: "Major drift",
};


function DriftSummaryCard({ brainId, review }: { brainId: string; review: DriftReview }) {
  const highCount = review.signals.filter((s) => s.severity === "high").length;
  const mediumCount = review.signals.filter((s) => s.severity === "medium").length;
  return (
    <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-amber-700">Agent Drift Review</p>
          <div className="mt-2 flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                driftAlignmentBadge[review.overall_alignment] ?? "bg-stone-100 text-stone-700"
              }`}
            >
              {driftAlignmentLabel[review.overall_alignment] ?? review.overall_alignment}
            </span>
            <p className="text-sm text-stone-500">
              {review.signals.length} signal{review.signals.length === 1 ? "" : "s"}
              {highCount > 0 ? ` · ${highCount} high` : ""}
              {mediumCount > 0 ? ` · ${mediumCount} medium` : ""}
            </p>
          </div>
        </div>
        <Link href={`/brains/${brainId}/drift`} className="button-secondary text-xs">
          Open drift review
        </Link>
      </div>
      <p className="mt-3 leading-7 text-stone-700">{review.summary_for_founders}</p>
      <p className="mt-2 text-xs text-stone-400">
        Generated {new Date(review.generated_at).toLocaleString()}
      </p>
    </section>
  );
}
