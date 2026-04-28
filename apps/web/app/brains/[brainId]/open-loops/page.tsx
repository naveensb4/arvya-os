import { SectionShell } from "@/components/layout/section-shell";
import { OpenLoopCard } from "@/components/open-loops/open-loop-card";
import { bulkReviewOpenLoopsAction } from "@/app/actions";
import { getOpenLoopReviewSnapshot } from "@/lib/brain/store";
import type { OpenLoop, SourceItem } from "@arvya/core";

type PageProps = {
  params: Promise<{ brainId: string }>;
  searchParams: Promise<{
    filter?: string;
    owner?: string;
    source?: string;
  }>;
};

const owners = ["Naveen", "PB", "Arvya", "Unknown"];
const priorities = ["low", "medium", "high", "critical"];
const OPEN_LOOP_LIMIT = 25;
const SOURCE_FILTER_LIMIT = 50;

export default async function Page({ params, searchParams }: PageProps) {
  const { brainId } = await params;
  const filters = await searchParams;
  const snapshot = await getOpenLoopReviewSnapshot(brainId);
  const selectedBrainId = snapshot.selectedBrain.id;
  const sourceById = new Map(snapshot.sourceItems.map((source) => [source.id, source]));
  const filteredLoops = applyFilters(snapshot.openLoops, sourceById, filters);
  const visibleLoops = filteredLoops.slice(0, OPEN_LOOP_LIMIT);
  const hiddenLoopCount = Math.max(filteredLoops.length - visibleLoops.length, 0);
  const sourceIdsWithLoops = new Set(snapshot.openLoops.flatMap((loop) => (loop.sourceItemId ? [loop.sourceItemId] : [])));
  const sourceOptions = snapshot.sourceItems
    .filter((source) => sourceIdsWithLoops.has(source.id))
    .slice(0, SOURCE_FILTER_LIMIT);
  const counts = {
    needsReview: snapshot.openLoops.filter((loop) => loop.status === "needs_review").length,
    overdue: snapshot.openLoops.filter(isOverdue).length,
    dueSoon: snapshot.openLoops.filter(isDueSoon).length,
    highPriority: snapshot.openLoops.filter((loop) => loop.priority === "high" || loop.priority === "critical").length,
    dismissed: snapshot.openLoops.filter((loop) => loop.status === "dismissed").length,
  };

  return (
    <SectionShell brainId={selectedBrainId} title="Open Loop Review" description="Review extracted follow-ups, approve the real ones, and dismiss noisy detections.">
      <div className="mb-5 rounded-2xl bg-stone-50 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{filteredLoops.length} open loop{filteredLoops.length === 1 ? "" : "s"} match this view</p>
            <p className="mt-1 text-sm text-stone-500">
              Showing the first {visibleLoops.length} so the founder action queue stays fast and reviewable.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterLink brainId={selectedBrainId} label={`Needs review (${counts.needsReview})`} filter="needs_review" />
          <FilterLink brainId={selectedBrainId} label={`Overdue (${counts.overdue})`} filter="overdue" />
          <FilterLink brainId={selectedBrainId} label={`Due soon (${counts.dueSoon})`} filter="due_soon" />
          <FilterLink brainId={selectedBrainId} label={`High priority (${counts.highPriority})`} filter="high_priority" />
          <FilterLink brainId={selectedBrainId} label={`Dismissed (${counts.dismissed})`} filter="dismissed" />
          <FilterLink brainId={selectedBrainId} label="All" />
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-2" action={`/brains/${selectedBrainId}/open-loops`}>
          {filters.filter ? <input type="hidden" name="filter" value={filters.filter} /> : null}
          <label className="text-xs font-medium uppercase tracking-widest text-stone-500">
            By owner
            <select name="owner" defaultValue={filters.owner ?? ""} className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm normal-case tracking-normal">
              <option value="">Any owner</option>
              {owners.map((owner) => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium uppercase tracking-widest text-stone-500">
            By source
            <select name="source" defaultValue={filters.source ?? ""} className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm normal-case tracking-normal">
              <option value="">Any source</option>
              {sourceOptions.map((source) => (
                <option key={source.id} value={source.id}>{source.title}</option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2">
            <button className="button-secondary">Apply filters</button>
          </div>
        </form>
      </div>
      <form id="bulk-open-loop-actions" action={bulkReviewOpenLoopsAction} className="mb-5 rounded-2xl border border-stone-200 bg-white p-4">
        <input type="hidden" name="brainId" value={selectedBrainId} />
        <div className="grid gap-3 lg:grid-cols-4">
          <label className="text-xs font-medium uppercase tracking-widest text-stone-500">
            Bulk action
            <select name="bulkAction" className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm normal-case tracking-normal">
              <option value="approve">Approve selected</option>
              <option value="dismiss">Dismiss selected</option>
              <option value="assign">Assign selected</option>
              <option value="priority">Set priority</option>
            </select>
          </label>
          <label className="text-xs font-medium uppercase tracking-widest text-stone-500">
            Owner
            <select name="bulkOwner" className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm normal-case tracking-normal">
              {owners.slice(0, 2).map((owner) => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium uppercase tracking-widest text-stone-500">
            Priority
            <select name="bulkPriority" className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm normal-case tracking-normal">
              {priorities.map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button className="button-primary w-full">Apply to selected</button>
          </div>
        </div>
      </form>
      <div className="space-y-4">
        {visibleLoops.map((loop) => (
          <OpenLoopCard
            key={loop.id}
            brainId={selectedBrainId}
            loop={loop}
            source={loop.sourceItemId ? sourceById.get(loop.sourceItemId) : undefined}
          />
        ))}
        {filteredLoops.length === 0 ? (
          <p className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">
            No open loops match these filters.
          </p>
        ) : null}
      </div>
      {hiddenLoopCount > 0 ? (
        <p className="mt-5 rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">
          {hiddenLoopCount} more matching open loop{hiddenLoopCount === 1 ? "" : "s"} hidden. Narrow by status, owner, or source to review the rest.
        </p>
      ) : null}
    </SectionShell>
  );
}

function applyFilters(
  loops: OpenLoop[],
  sourceById: Map<string, SourceItem>,
  filters: { filter?: string; owner?: string; source?: string },
) {
  return loops.filter((loop) => {
    if (filters.filter === "needs_review" && loop.status !== "needs_review") return false;
    if (filters.filter === "overdue" && !isOverdue(loop)) return false;
    if (filters.filter === "due_soon" && !isDueSoon(loop)) return false;
    if (filters.filter === "high_priority" && loop.priority !== "high" && loop.priority !== "critical") return false;
    if (filters.filter === "dismissed" && loop.status !== "dismissed") return false;
    if (filters.owner && loop.owner?.toLowerCase() !== filters.owner.toLowerCase()) return false;
    if (filters.source && loop.sourceItemId !== filters.source) return false;
    if (filters.filter === "source" && !sourceById.has(loop.sourceItemId ?? "")) return false;
    return true;
  });
}

function isOverdue(loop: OpenLoop) {
  if (!loop.dueDate || loop.status === "done" || loop.status === "dismissed" || loop.status === "closed") return false;
  return new Date(loop.dueDate).getTime() < Date.now();
}

function isDueSoon(loop: OpenLoop) {
  if (!loop.dueDate || isOverdue(loop) || loop.status === "done" || loop.status === "dismissed" || loop.status === "closed") return false;
  return new Date(loop.dueDate).getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000;
}

function FilterLink({
  brainId,
  label,
  filter,
}: {
  brainId: string;
  label: string;
  filter?: string;
}) {
  const href = filter ? `/brains/${brainId}/open-loops?filter=${filter}` : `/brains/${brainId}/open-loops`;
  return <a className="button-secondary text-xs" href={href}>{label}</a>;
}
