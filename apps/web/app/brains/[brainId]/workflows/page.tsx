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
    <SectionShell brainId={selectedBrainId} title="Workflows" description="Repeatable agent workflows that act from Brain memory.">
      <div className="grid gap-4 md:grid-cols-2">
        {snapshot.workflows.map((workflow) => (
          <article key={workflow.id} className="rounded-2xl border border-stone-100 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{workflow.workflowType.replaceAll("_", " ")}</h2>
              <span className="rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-600">
                {workflow.status}
              </span>
            </div>
            {workflow.error ? <p className="mt-2 text-sm leading-6 text-red-700">{workflow.error}</p> : null}
            <p className="mt-3 text-xs uppercase tracking-widest text-stone-400">
              Updated: {new Date(workflow.updatedAt ?? workflow.createdAt).toLocaleString()}
            </p>
          </article>
        ))}
        {snapshot.workflows.length === 0 ? (
          <p className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">
            No workflows have run yet. Ingest a source to create the first workflow record.
          </p>
        ) : null}
      </div>
    </SectionShell>
  );
}
