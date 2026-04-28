import type { OpenLoop, SourceItem } from "@arvya/core";
import { closeOpenLoopWithOutcomeAction, reviewOpenLoopAction } from "@/app/actions";

const ownerOptions = ["Naveen", "PB", "Arvya", "Unknown"];
const priorityOptions = ["low", "medium", "high", "critical"];
const statusOptions = ["needs_review", "open", "in_progress", "waiting", "done", "dismissed"];

export function OpenLoopCard({
  brainId,
  loop,
  source,
  showReviewControls = true,
}: {
  brainId: string;
  loop: OpenLoop;
  source?: SourceItem;
  showReviewControls?: boolean;
}) {
  const dueDateValue = loop.dueDate ? loop.dueDate.slice(0, 10) : "";

  return (
    <article className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {showReviewControls ? (
            <label className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-amber-700">
              <input
                form="bulk-open-loop-actions"
                type="checkbox"
                name="openLoopIds"
                value={loop.id}
                className="size-4 rounded border-amber-300"
              />
              Select
            </label>
          ) : null}
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
            {loop.status} · {loop.priority} · {loop.loopType.replace("_", " ")}
            {loop.confidence ? ` · ${Math.round(loop.confidence * 100)}% confidence` : ""}
          </p>
          <h3 className="mt-2 font-semibold">{loop.title}</h3>
          <p className="mt-1 text-sm leading-6 text-stone-700">{loop.description}</p>
          {loop.owner || loop.dueDate ? (
            <p className="mt-2 text-xs text-stone-500">
              {loop.owner ? `Owner: ${loop.owner}` : "Owner unassigned"}
              {loop.dueDate ? ` · Due: ${formatDateOnly(loop.dueDate)}` : ""}
            </p>
          ) : null}
          {loop.suggestedAction ? (
            <p className="mt-2 text-sm leading-6 text-stone-700">Suggested: {loop.suggestedAction}</p>
          ) : null}
          {loop.outcome ? (
            <p className="mt-2 text-sm leading-6 text-stone-700">Outcome: {loop.outcome}</p>
          ) : null}
          {loop.sourceQuote ? (
            <blockquote className="mt-3 border-l-2 border-amber-600 pl-3 text-sm text-stone-600">
              {loop.sourceQuote}
            </blockquote>
          ) : null}
          {source ? (
            <div className="mt-3 rounded-xl bg-white/70 p-3 text-xs text-stone-600">
              <p className="font-semibold text-stone-800">Source transcript</p>
              <p className="mt-1">{source.title}</p>
              <p className="mt-1 uppercase tracking-widest text-stone-400">{source.type}</p>
              {source.externalUri ? (
                <a className="mt-2 inline-block text-amber-700 underline" href={source.externalUri}>
                  Open source link
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
        {showReviewControls ? (
          <div className="flex flex-wrap gap-2 sm:max-w-44">
            <QuickAction brainId={brainId} openLoopId={loop.id} action="approve" label="Approve" />
            <QuickAction brainId={brainId} openLoopId={loop.id} action="done" label="Mark done" />
            <QuickAction brainId={brainId} openLoopId={loop.id} action="dismiss" label="Dismiss noise" />
          </div>
        ) : null}
      </div>
      {showReviewControls && loop.status !== "closed" ? (
        <details className="mt-4 rounded-xl bg-white/75 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-amber-800">
            Close with outcome
          </summary>
          <form action={closeOpenLoopWithOutcomeAction} className="mt-3 grid gap-3">
            <input type="hidden" name="brainId" value={brainId} />
            <input type="hidden" name="openLoopId" value={loop.id} />
            {loop.sourceItemId ? (
              <input type="hidden" name="evidenceSourceItemId" value={loop.sourceItemId} />
            ) : null}
            <label className="text-xs font-medium text-stone-600">
              Outcome / what happened
              <textarea
                name="outcome"
                rows={3}
                required
                placeholder='e.g. "Sent pricing deck on April 28; Acme reviewing internally."'
                className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm"
              />
            </label>
            <div>
              <button className="button-primary text-xs">Close loop with outcome</button>
            </div>
          </form>
        </details>
      ) : null}
      {showReviewControls ? (
      <form action={reviewOpenLoopAction} className="mt-4 grid gap-3 rounded-xl bg-white/75 p-3 md:grid-cols-2">
        <input type="hidden" name="brainId" value={brainId} />
        <input type="hidden" name="openLoopId" value={loop.id} />
        <input type="hidden" name="reviewAction" value="edit" />
        <input type="hidden" name="approvedAt" value={loop.approvedAt ?? ""} />
        <label className="text-xs font-medium text-stone-600 md:col-span-2">
          Title
          <input name="title" defaultValue={loop.title} className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm" />
        </label>
        <label className="text-xs font-medium text-stone-600 md:col-span-2">
          Description
          <textarea
            name="description"
            defaultValue={loop.description}
            rows={3}
            className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Owner
          <select name="owner" defaultValue={loop.owner ?? ""} className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm">
            <option value="">Unassigned</option>
            {ownerOptions.map((owner) => (
              <option key={owner} value={owner}>{owner}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-stone-600">
          Priority
          <select name="priority" defaultValue={loop.priority} className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm">
            {priorityOptions.map((priority) => (
              <option key={priority} value={priority}>{priority}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-stone-600">
          Status
          <select name="status" defaultValue={loop.status} className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm">
            {statusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-stone-600">
          Due date
          <input type="date" name="dueDate" defaultValue={dueDateValue} className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm" />
        </label>
        <label className="text-xs font-medium text-stone-600 md:col-span-2">
          Outcome
          <textarea
            name="outcome"
            defaultValue={loop.outcome ?? ""}
            rows={2}
            placeholder="What happened, why it was dismissed, or the desired resolution."
            className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm"
          />
        </label>
        <div className="md:col-span-2">
          <button className="button-secondary">Save edits</button>
        </div>
      </form>
      ) : null}
    </article>
  );
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function QuickAction({
  brainId,
  openLoopId,
  action,
  label,
}: {
  brainId: string;
  openLoopId: string;
  action: string;
  label: string;
}) {
  return (
    <form action={reviewOpenLoopAction}>
      <input type="hidden" name="brainId" value={brainId} />
      <input type="hidden" name="openLoopId" value={openLoopId} />
      <input type="hidden" name="reviewAction" value={action} />
      <button className="button-secondary whitespace-nowrap text-xs">{label}</button>
    </form>
  );
}
