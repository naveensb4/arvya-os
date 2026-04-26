import { SectionShell } from "@/components/layout/section-shell";
import { BatchUploadForm } from "@/components/sources/batch-upload-form";
import { selectedBrainOrDefault } from "@/lib/brain/store";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { brainId } = await params;
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  return (
    <SectionShell
      brainId={selectedBrainId}
      title="Batch Upload Sources"
      description="Upload multiple transcript files and ingest each one into this Brain."
    >
      <BatchUploadForm brainId={selectedBrainId} />
    </SectionShell>
  );
}
