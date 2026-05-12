import { getRepository } from "@/lib/db/repository";
import { redirect } from "next/navigation";
import MeetingPrepSettingsClient from "./settings-client";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function MeetingPrepSettingsPage({ params }: PageProps) {
  const { brainId } = await params;
  const repository = getRepository();
  const brain = await repository.getBrain(brainId);
  if (!brain) redirect("/onboarding");

  const config = (brain.metadata ?? {}) as Record<string, unknown>;
  const prepDocs = await repository.listBrainDocs(brainId, { docType: "meeting_prep" });
  const thisMonthDocs = prepDocs.filter((d) => {
    const date = new Date(d.createdAt);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });

  return (
    <MeetingPrepSettingsClient
      brainId={brainId}
      brainName={brain.name}
      meetingPrepEnabled={config.meeting_prep_enabled === true}
      linkedinEnabled={config.linkedin_enrichment_enabled === true}
      webSearchEnabled={config.web_search_enabled !== false}
      timezone={(config.timezone as string) ?? "America/Los_Angeles"}
      prepCountThisMonth={thisMonthDocs.length}
    />
  );
}
