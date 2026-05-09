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
  const runs = await repository.listAgentRuns(brainId, 200);
  const prepRuns = runs.filter((r) => r.name === "meeting_prep");
  const thisMonthRuns = prepRuns.filter((r) => {
    const d = new Date(r.startedAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  return (
    <MeetingPrepSettingsClient
      brainId={brainId}
      brainName={brain.name}
      meetingPrepEnabled={config.meeting_prep_enabled === true}
      linkedinEnabled={config.linkedin_enrichment_enabled === true}
      webSearchEnabled={config.web_search_enabled !== false}
      timezone={(config.timezone as string) ?? "America/Los_Angeles"}
      prepCountThisMonth={thisMonthRuns.length}
    />
  );
}
