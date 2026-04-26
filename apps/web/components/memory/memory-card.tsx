import type { MemoryObject, SourceItem } from "@arvya/core";

export function MemoryCard({
  memory,
  source,
  showEvidence = true,
}: {
  memory: MemoryObject;
  source?: SourceItem;
  showEvidence?: boolean;
}) {
  return (
    <article className="rounded-2xl border border-stone-100 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
          {memory.objectType.replace("_", " ")}
        </p>
        <span className="rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-600">
          {Math.round((memory.confidence ?? 0.7) * 100)}%
        </span>
      </div>
      <h3 className="mt-2 font-semibold">{memory.name}</h3>
      <p className="mt-1 text-sm leading-6 text-stone-600">{memory.description}</p>
      {showEvidence && memory.sourceQuote ? (
        <blockquote className="mt-3 border-l-2 border-amber-600 pl-3 text-sm leading-6 text-stone-500">
          {memory.sourceQuote}
        </blockquote>
      ) : null}
      {source ? <p className="mt-3 text-xs text-stone-400">Source: {source.title}</p> : null}
    </article>
  );
}
