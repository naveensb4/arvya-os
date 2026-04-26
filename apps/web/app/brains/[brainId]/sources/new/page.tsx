import { SectionShell } from "@/components/layout/section-shell";
import { SourceForm } from "@/components/sources/source-form";
import { selectedBrainOrDefault } from "@/lib/brain/store";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { brainId } = await params;
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  return (
    <SectionShell brainId={selectedBrainId} title="New Source" description="Paste or upload the next transcript, email, note, document, or strategy output.">
      <SourceForm brainId={selectedBrainId} />
    </SectionShell>
  );
}
