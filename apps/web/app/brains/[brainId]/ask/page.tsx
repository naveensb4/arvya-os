import { AskForm } from "@/components/ask/ask-form";
import { SectionShell } from "@/components/layout/section-shell";
import { answerBrainQuestion, selectedBrainOrDefault } from "@/lib/brain/store";

type PageProps = {
  params: Promise<{ brainId: string }>;
  searchParams?: Promise<{ q?: string }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { brainId } = await params;
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const query = (await searchParams)?.q;
  const answer = query ? await answerBrainQuestion(selectedBrainId, query) : null;

  return (
    <SectionShell brainId={selectedBrainId} title="Ask Brain" description="Question-answering workspace for source-backed answers.">
      <AskForm brainId={selectedBrainId} defaultQuestion={query} />
      {answer ? (
        <section className="mt-6 rounded-2xl bg-stone-50 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow text-amber-700">Answer</p>
            {answer.confidenceLevel ? (
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  answer.confidenceLevel === "high"
                    ? "bg-emerald-100 text-emerald-800"
                    : answer.confidenceLevel === "medium"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-stone-200 text-stone-700"
                }`}
              >
                {answer.confidenceLevel} confidence
              </span>
            ) : null}
            {answer.uncertain ? (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">
                uncertain
              </span>
            ) : null}
          </div>
          <p className="mt-3 leading-7 text-stone-900">{answer.answer}</p>
          {answer.followUp ? (
            <p className="mt-3 text-sm leading-6 text-stone-600">{answer.followUp}</p>
          ) : null}
          {answer.uncertaintyNotes && answer.uncertaintyNotes.length > 0 ? (
            <div className="mt-3 rounded-xl bg-stone-100 p-3 text-xs leading-6 text-stone-600">
              <p className="font-semibold text-stone-800">Caveats</p>
              <ul className="mt-1 list-disc pl-5">
                {answer.uncertaintyNotes.map((note, index) => (
                  <li key={`${note}-${index}`}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {answer.structuredCitations && answer.structuredCitations.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {answer.structuredCitations.map((citation) => {
                const href = citationHref(selectedBrainId, citation);
                const label = citationLabel(citation);
                return (
                  <a
                    key={`${citation.kind}-${citation.id}`}
                    href={href}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-800 hover:bg-amber-100"
                    title={citation.snippet}
                  >
                    <span className="font-semibold uppercase tracking-widest">
                      {label}
                    </span>
                    <span className="font-mono">{citation.id.slice(0, 8)}</span>
                  </a>
                );
              })}
            </div>
          ) : null}
          <div className="mt-5 space-y-3">
            {answer.citations.map((citation) => (
              <blockquote
                key={`${citation.memoryObjectId ?? citation.openLoopId ?? citation.sourceItemId}-${citation.evidence}`}
                className="border-l-2 border-amber-600 pl-3 text-sm leading-6 text-stone-600"
              >
                {citation.evidence}
                <footer className="mt-1 font-medium text-stone-900">
                  {citation.sourceTitle}
                </footer>
              </blockquote>
            ))}
          </div>
        </section>
      ) : (
        <div className="mt-6 rounded-2xl bg-stone-50 p-5 text-sm leading-6 text-stone-700">
          Ask a question and the Brain will retrieve relevant memory, synthesize an answer, and cite source evidence.
        </div>
      )}
    </SectionShell>
  );
}

function citationHref(
  brainId: string,
  citation: { kind: "source" | "memory" | "open_loop"; id: string; sourceItemId?: string },
) {
  if (citation.kind === "source") {
    return `/brains/${brainId}/sources#${citation.id}`;
  }
  if (citation.kind === "open_loop") {
    return `/brains/${brainId}/open-loops#${citation.id}`;
  }
  return `/brains/${brainId}/memory#${citation.id}`;
}

function citationLabel(citation: { kind: "source" | "memory" | "open_loop" }) {
  if (citation.kind === "source") return "source";
  if (citation.kind === "open_loop") return "loop";
  return "memory";
}
