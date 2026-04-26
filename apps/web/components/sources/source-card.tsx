import type { SourceItem } from "@arvya/core";

const SOURCE_PREVIEW_LIMIT = 420;

export function SourceCard({ source }: { source: SourceItem }) {
  const preview =
    source.content.length > SOURCE_PREVIEW_LIMIT
      ? `${source.content.slice(0, SOURCE_PREVIEW_LIMIT).trim()}...`
      : source.content;

  return (
    <article className="rounded-2xl border border-stone-100 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
        {source.type.replace("_", " ")}
      </p>
      <h3 className="mt-2 font-semibold">{source.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-stone-600">
        {preview}
      </p>
      {source.externalUri ? (
        <a
          href={source.externalUri}
          className="mt-3 block text-sm font-medium text-stone-950 underline"
        >
          Source reference
        </a>
      ) : null}
    </article>
  );
}
