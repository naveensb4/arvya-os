import Link from "next/link";

export default function VisionPage() {
  return (
    <main className="min-h-screen bg-[#f6f2ea] px-6 py-10 text-stone-950">
      <article className="mx-auto max-w-4xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <Link href="/" className="button-secondary">
          Back to Brain
        </Link>
        <p className="eyebrow mt-8 text-amber-700">Vision</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Arvya Deal OS is a living Brain for high-context deal work.
        </h1>
        <p className="mt-5 text-lg leading-8 text-stone-700">
          The Brain is the core object. Sources feed the Brain. Memory is
          structured but flexible. Agents act from the Brain. Open loops are
          tracked until closed. Every important answer should be source-backed.
        </p>
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {[
            "Create or select a Brain.",
            "Paste or upload transcript, email, note, or document text.",
            "Run ingestion through LangGraph.",
            "Extract people, companies, facts, decisions, insights, open loops, and actions.",
            "Ask source-backed questions.",
            "Generate daily founder briefs and inspect agent runs.",
          ].map((item) => (
            <div key={item} className="rounded-2xl bg-stone-50 p-4">
              {item}
            </div>
          ))}
        </section>
        <p className="mt-8 leading-7 text-stone-700">
          The canonical working vision lives in <code>VISION.md</code>. Keep it
          updated as product decisions, architecture choices, and operating
          principles evolve.
        </p>
      </article>
    </main>
  );
}
