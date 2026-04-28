import { SectionShell } from "@/components/layout/section-shell";
import { MemoryCard } from "@/components/memory/memory-card";
import { getBrainSnapshot } from "@/lib/brain/store";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { brainId } = await params;
  const snapshot = await getBrainSnapshot(brainId);
  const selectedBrainId = snapshot.selectedBrain.id;
  const sourceById = new Map(snapshot.sourceItems.map((source) => [source.id, source]));
  const insights = snapshot.memoryObjects.filter(
    (memory) => memory.objectType === "insight" || memory.objectType === "product_insight",
  );
  return (
    <SectionShell brainId={selectedBrainId} title="Insights" description="Strategic, product, customer, investor, and deal insights.">
      <div className="grid gap-4 md:grid-cols-2">
        {insights.map((memory) => (
          <MemoryCard
            key={memory.id}
            brainId={selectedBrainId}
            memory={memory}
            source={memory.sourceItemId ? sourceById.get(memory.sourceItemId) : undefined}
          />
        ))}
        {insights.length === 0 ? (
          <p className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">
            No insights yet. Ingest richer source material to populate this view.
          </p>
        ) : null}
      </div>
    </SectionShell>
  );
}
