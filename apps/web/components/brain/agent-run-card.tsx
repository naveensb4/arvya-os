import type { AgentRun } from "@arvya/core";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function AgentRunCard({ run }: { run: AgentRun }) {
  return (
    <article className="rounded-2xl bg-stone-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">
          {run.name.replaceAll("_", " ")}
          {run.stepName ? ` · ${run.stepName.replaceAll("_", " ")}` : ""}
        </p>
        <span className="rounded-full bg-stone-950 px-2 py-1 text-xs text-white">
          {run.status}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        {run.outputSummary || run.inputSummary}
      </p>
      <p className="mt-2 text-xs uppercase tracking-widest text-stone-400">
        {run.modelProvider} · {formatDate(run.startedAt)}
      </p>
    </article>
  );
}
