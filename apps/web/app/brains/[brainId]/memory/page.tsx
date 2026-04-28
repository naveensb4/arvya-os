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
  return (
    <SectionShell brainId={selectedBrainId} title="Memory" description="Structured memory extracted from source material.">
      <div className="grid gap-4 md:grid-cols-2">
        {snapshot.memoryObjects.map((memory) => (
          <MemoryCard
            key={memory.id}
            brainId={selectedBrainId}
            memory={memory}
            source={memory.sourceItemId ? sourceById.get(memory.sourceItemId) : undefined}
          />
        ))}
      </div>
    </SectionShell>
  );
}
