import { AgentRunCard } from "@/components/brain/agent-run-card";
import { SectionShell } from "@/components/layout/section-shell";
import { getBrainSnapshot } from "@/lib/brain/store";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { brainId } = await params;
  const snapshot = await getBrainSnapshot(brainId);
  const selectedBrainId = snapshot.selectedBrain.id;
  return (
    <SectionShell brainId={selectedBrainId} title="Agent Runs" description="Execution log for ingestion, briefs, questions, and follow-up agents.">
      <div className="space-y-4">
        {snapshot.agentRuns.map((run) => (
          <AgentRunCard key={run.id} run={run} />
        ))}
      </div>
    </SectionShell>
  );
}
