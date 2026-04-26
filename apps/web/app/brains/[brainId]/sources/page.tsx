import Link from "next/link";
import { SectionShell } from "@/components/layout/section-shell";
import { SourceCard } from "@/components/sources/source-card";
import { selectedBrainOrDefault } from "@/lib/brain/store";

type PageProps = {
  params: Promise<{ brainId: string }>;
  searchParams: Promise<{ ingested?: string }>;
};

const RECENT_SOURCE_LIMIT = 24;

export default async function Page({ params, searchParams }: PageProps) {
  const { brainId } = await params;
  const filters = await searchParams;
  const { repository, selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const sourceItems = await repository.listSourceItems(selectedBrainId);
  const recentSources = sourceItems.slice(0, RECENT_SOURCE_LIMIT);
  const hiddenSourceCount = Math.max(sourceItems.length - recentSources.length, 0);

  return (
    <SectionShell brainId={selectedBrainId} title="Sources" description="Recent source material feeding memory, open loops, and source-backed answers.">
      <div className="mb-5 rounded-2xl bg-stone-50 p-4">
        {filters.ingested ? (
          <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
            Source ingested. The Brain updated memory, open loops, retrieval context, and agent logs from the new material.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{sourceItems.length} total sources</p>
            <p className="mt-1 text-sm text-stone-500">
              Showing the latest {recentSources.length}. Use Ask Brain or filters downstream to work across the full source history.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/brains/${selectedBrainId}/sources/new`} className="button">Add Source</Link>
            <Link href={`/brains/${selectedBrainId}/sources/batch-upload`} className="button-secondary">
              Batch Upload
            </Link>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {recentSources.map((source) => (
          <SourceCard key={source.id} source={source} />
        ))}
        {sourceItems.length === 0 ? (
          <p className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">
            No sources yet. Add a transcript, email, note, or document to start building memory.
          </p>
        ) : null}
      </div>
      {hiddenSourceCount > 0 ? (
        <p className="mt-5 rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">
          {hiddenSourceCount} older source{hiddenSourceCount === 1 ? "" : "s"} hidden to keep this workspace fast.
        </p>
      ) : null}
    </SectionShell>
  );
}
