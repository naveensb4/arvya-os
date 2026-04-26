import Link from "next/link";
import { createBrainAction } from "@/app/actions";
import { brainTemplates } from "@arvya/core";
import { getRepository } from "@/lib/db/repository";

export default async function BrainsPage() {
  const brains = await getRepository().listBrains();
  return (
    <main className="min-h-screen bg-[#f6f2ea] px-6 py-8 text-stone-950">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow text-amber-700">Arvya Deal OS</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Brains</h1>
          </div>
          <Link href="/vision" className="button-secondary">Vision</Link>
        </div>
        <section className="card mt-6">
          <p className="eyebrow text-amber-700">Select</p>
          <h2 className="mt-2 text-3xl font-semibold">Choose a Brain</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {brains.map((brain) => (
              <Link key={brain.id} href={`/brains/${brain.id}`} className="rounded-2xl border border-stone-200 p-5 hover:border-stone-950">
                <p className="font-semibold">{brain.name}</p>
                <p className="mt-2 text-sm text-stone-600">{brain.thesis}</p>
              </Link>
            ))}
            {brains.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-stone-300 p-5 text-sm text-stone-600">
                No Brains yet. Create the first Arvya Brain below.
              </p>
            ) : null}
          </div>
        </section>
        <section className="card mt-6">
          <p className="eyebrow text-amber-700">Create</p>
          <h2 className="mt-2 text-3xl font-semibold">New Brain</h2>
          <form action={createBrainAction} className="mt-6 grid gap-3">
            <input name="name" placeholder="Sell-Side Deal Brain" className="field" />
            <select name="kind" className="field" defaultValue="company">
              {brainTemplates.map((template) => (
                <option key={template.kind} value={template.kind}>
                  {template.name}
                </option>
              ))}
            </select>
            <textarea
              name="thesis"
              placeholder={brainTemplates[0].thesisStarter}
              className="field min-h-28"
            />
            <button className="button w-fit">Create Brain</button>
          </form>
        </section>
      </div>
    </main>
  );
}
