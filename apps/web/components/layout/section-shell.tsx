import Link from "next/link";
import { BrainNav } from "@/components/brain/brain-nav";
import { getBrainSnapshot } from "@/lib/brain/store";

export async function SectionShell({
  brainId,
  title,
  description,
  children,
}: {
  brainId?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const snapshot = await getBrainSnapshot(brainId);

  return (
    <main className="min-h-screen bg-[#f6f2ea] px-6 py-8 text-stone-950">
      <div className="mx-auto max-w-7xl">
        <Link href="/" className="button-secondary">
          Back home
        </Link>
        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
          <BrainNav brain={snapshot.selectedBrain} />
          <section className="card">
            <p className="eyebrow text-amber-700">Brain Workspace</p>
            <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
            <p className="mt-2 max-w-3xl leading-7 text-stone-600">{description}</p>
            <div className="mt-6">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
