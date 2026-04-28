import type { MemoryObject, SourceItem } from "@arvya/core";
import { updateMemoryObjectAction } from "@/app/actions";

const memoryTypeOptions = [
  "person",
  "company",
  "fact",
  "event",
  "decision",
  "insight",
  "risk",
  "question",
  "commitment",
  "task",
  "product_insight",
  "marketing_idea",
  "custom",
];

const memoryStatusOptions = ["open", "in_progress", "waiting", "done", "closed", "snoozed"];

export function MemoryCard({
  brainId,
  memory,
  source,
  showEvidence = true,
  showEditControls = true,
}: {
  brainId?: string;
  memory: MemoryObject;
  source?: SourceItem;
  showEvidence?: boolean;
  showEditControls?: boolean;
}) {
  const confidence = Math.round((memory.confidence ?? 0.7) * 100);
  const sourceItemIds = Array.isArray(memory.properties?.sourceItemIds)
    ? memory.properties.sourceItemIds.filter((item): item is string => typeof item === "string")
    : [];
  const aliases = Array.isArray(memory.properties?.aliases)
    ? memory.properties.aliases.filter((item): item is string => typeof item === "string")
    : [];
  const mentionCount = Number(memory.properties?.mentionCount ?? 1);

  return (
    <article className="rounded-2xl border border-stone-100 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
          {memory.objectType.replace("_", " ")}
        </p>
        <span className="rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-600" title="Model confidence for this memory">
          {confidence}% confidence
        </span>
      </div>
      <h3 className="mt-2 font-semibold">{memory.name}</h3>
      <p className="mt-1 text-sm leading-6 text-stone-600">{memory.description}</p>
      {mentionCount > 1 || aliases.length > 1 ? (
        <p className="mt-2 text-xs text-stone-500">
          Seen {mentionCount} times
          {aliases.length > 1 ? ` · Aliases: ${aliases.slice(0, 3).join(", ")}` : ""}
        </p>
      ) : null}
      {showEvidence && memory.sourceQuote ? (
        <blockquote className="mt-3 border-l-2 border-amber-600 pl-3 text-sm leading-6 text-stone-500">
          {memory.sourceQuote}
        </blockquote>
      ) : null}
      <div className="mt-3 rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
        <p className="font-semibold text-stone-800">Source and quality</p>
        <p className="mt-1">{source ? source.title : "No primary source attached"}</p>
        <p className="mt-1 uppercase tracking-widest text-stone-400">
          {source?.type ?? "memory"} · {confidence}% confidence
          {sourceItemIds.length > 1 ? ` · ${sourceItemIds.length} sources merged` : ""}
        </p>
        {source?.externalUri ? (
          <a className="mt-2 inline-block text-amber-700 underline" href={source.externalUri}>
            Open source link
          </a>
        ) : null}
      </div>
      {showEditControls && brainId ? (
        <details className="mt-4 rounded-xl bg-white/75">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-stone-500">
            Edit memory
          </summary>
          <form action={updateMemoryObjectAction} className="mt-3 grid gap-3 rounded-xl bg-stone-50 p-3 md:grid-cols-2">
            <input type="hidden" name="brainId" value={brainId} />
            <input type="hidden" name="memoryObjectId" value={memory.id} />
            <label className="text-xs font-medium text-stone-600">
              Type
              <select name="objectType" defaultValue={memory.objectType} className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm">
                {memoryTypeOptions.map((type) => (
                  <option key={type} value={type}>{type.replace("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-stone-600">
              Status
              <select name="status" defaultValue={memory.status ?? ""} className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm">
                <option value="">No status</option>
                {memoryStatusOptions.map((status) => (
                  <option key={status} value={status}>{status.replace("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-stone-600 md:col-span-2">
              Name
              <input name="name" defaultValue={memory.name} className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-stone-600 md:col-span-2">
              Description
              <textarea name="description" defaultValue={memory.description} rows={3} className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-stone-600">
              Confidence
              <input type="number" min="0" max="100" name="confidence" defaultValue={confidence} className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-stone-600 md:col-span-2">
              Source quote
              <textarea name="sourceQuote" defaultValue={memory.sourceQuote ?? ""} rows={2} className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm" />
            </label>
            <div className="md:col-span-2">
              <button className="button-secondary">Save memory</button>
            </div>
          </form>
        </details>
      ) : null}
    </article>
  );
}
