import { SectionShell } from "@/components/layout/section-shell";
import { getBrainTemplate } from "@arvya/core";
import { getBrainSnapshot } from "@/lib/brain/store";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { brainId } = await params;
  const snapshot = await getBrainSnapshot(brainId);
  const selectedBrainId = snapshot.selectedBrain.id;
  const template = getBrainTemplate(snapshot.selectedBrain.kind);
  return (
    <SectionShell brainId={selectedBrainId} title="Settings" description="Brain metadata, templates, source policy, and future connector configuration.">
      <section className="rounded-2xl bg-stone-50 p-5">
        <p className="eyebrow text-amber-700">Brain</p>
        <h2 className="mt-2 text-2xl font-semibold">{snapshot.selectedBrain.name}</h2>
        <p className="mt-2 leading-7 text-stone-700">{snapshot.selectedBrain.thesis}</p>
        <p className="mt-4 text-sm text-stone-500">Template: {template.name}</p>
      </section>
      <section className="mt-6 rounded-2xl bg-stone-50 p-5">
        <p className="eyebrow text-amber-700">Source Policy</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {template.defaultSourceTypes.map((type) => (
            <span key={type} className="rounded-full bg-white px-3 py-1 text-sm">
              {type.replace("_", " ")}
            </span>
          ))}
        </div>
      </section>
    </SectionShell>
  );
}
