import { SectionShell } from "@/components/layout/section-shell";
import { AgentRunCard } from "@/components/brain/agent-run-card";
import { MemoryCard } from "@/components/memory/memory-card";
import { OpenLoopCard } from "@/components/open-loops/open-loop-card";
import { SourceCard } from "@/components/sources/source-card";
import { getBrainSnapshot } from "@/lib/brain/store";
import { getRepository } from "@/lib/db/repository";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { brainId } = await params;
  const snapshot = await getBrainSnapshot(brainId);
  const selectedBrainId = snapshot.selectedBrain.id;
  const repository = getRepository();
  const [alerts, syncRuns, connectorConfigs] = await Promise.all([
    repository.listBrainAlerts({ brainId: selectedBrainId, status: "unread", limit: 5 }),
    repository.listConnectorSyncRuns({ brainId: selectedBrainId, limit: 10 }),
    repository.listConnectorConfigs(selectedBrainId),
  ]);
  const sourceById = new Map(snapshot.sourceItems.map((source) => [source.id, source]));
  const latestDailyBrief = snapshot.sourceItems.find((source) => source.metadata?.domain_type === "daily_brief");
  const currentTime = new Date().getTime();
  const newSources24h = snapshot.sourceItems.filter(
    (source) => currentTime - new Date(source.createdAt).getTime() < 24 * 60 * 60 * 1000,
  ).length;
  const overdueLoops = snapshot.openLoops.filter(
    (loop) =>
      loop.dueDate &&
      loop.status !== "needs_review" &&
      new Date(loop.dueDate).getTime() < currentTime,
  );
  const failedSyncs = syncRuns.filter((run) => run.status === "failed").length;
  const enabledConnectors = connectorConfigs.filter((config) => config.syncEnabled);
  const failingConnectors = connectorConfigs.filter((config) => config.status === "error");
  const connectorHealth = failingConnectors.length > 0
    ? `${failingConnectors.length} failing`
    : `${enabledConnectors.length} always-on`;
  const brainHealth = failedSyncs > 0 || overdueLoops.length > 0 || failingConnectors.length > 0 ? "Warning" : "Healthy";
  return (
    <SectionShell brainId={selectedBrainId} title="Brain Overview" description="Snapshot of this Brain, its sources, open loops, memory, and recent agent activity.">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Brain Health" value={brainHealth} />
        <Metric label="Last Ingestion" value={formatDate(snapshot.sourceItems[0]?.createdAt)} />
        <Metric label="New Sources 24h" value={newSources24h} />
        <Metric label="Overdue Loops" value={overdueLoops.length} />
        <Metric label="Failed Syncs" value={failedSyncs} />
        <Metric label="Connector Health" value={connectorHealth} />
      </div>

      <section className="mt-6 rounded-2xl bg-stone-50 p-5">
        <p className="eyebrow text-amber-700">Daily Brief</p>
        <h2 className="mt-2 text-2xl font-semibold">{latestDailyBrief?.title ?? "No daily brief stored yet"}</h2>
        <p className="mt-2 whitespace-pre-line leading-7 text-stone-700">
          {latestDailyBrief?.content ?? "The daily-founder-brief job will store the morning brief here."}
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

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold">Open Loops</h2>
          <div className="mt-4 space-y-3">
            {snapshot.openLoops.slice(0, 3).map((loop) => (
              <OpenLoopCard
                key={loop.id}
                brainId={selectedBrainId}
                loop={loop}
                source={loop.sourceItemId ? sourceById.get(loop.sourceItemId) : undefined}
                showReviewControls={false}
              />
            ))}
            {snapshot.openLoops.length === 0 ? <Empty text="No open loops yet." /> : null}
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
              />
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold">Recent Sources</h2>
          <div className="mt-4 space-y-3">
            {snapshot.sourceItems.slice(0, 3).map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
          </div>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Recent Agent Runs</h2>
          <div className="mt-4 space-y-3">
            {snapshot.agentRuns.slice(0, 3).map((run) => (
              <AgentRunCard key={run.id} run={run} />
            ))}
          </div>
        </section>
      </div>
    </SectionShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <p className="text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-widest text-stone-500">{label}</p>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-500">{text}</p>;
}
