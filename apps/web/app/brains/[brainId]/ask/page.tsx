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
