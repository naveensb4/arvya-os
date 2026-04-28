import { SectionShell } from "@/components/layout/section-shell";
import { MemoryCard } from "@/components/memory/memory-card";
import { selectedBrainOrDefault } from "@/lib/brain/store";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

const MEMORY_PAGE_LIMIT = 120;

export default async function Page({ params }: PageProps) {
  const { brainId } = await params;
  const { repository, selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const [memoryObjects, sourceItems] = await Promise.all([
    repository.listMemoryObjects(selectedBrainId),
    repository.listSourceItems(selectedBrainId),
  ]);
  const sourceById = new Map(sourceItems.map((source) => [source.id, source]));
  const visibleMemoryObjects = memoryObjects.slice(0, MEMORY_PAGE_LIMIT);

  return (
    <SectionShell brainId={selectedBrainId} title="Memory" description="Structured memory extracted from source material.">
      {memoryObjects.length > MEMORY_PAGE_LIMIT ? (
        <p className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          Showing the latest {MEMORY_PAGE_LIMIT} of {memoryObjects.length} memories. Search and filters will make the full
          memory graph easier to browse as it grows.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {visibleMemoryObjects.map((memory) => (
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
