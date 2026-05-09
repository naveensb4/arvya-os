import { getRepository } from "@/lib/db/repository";
import { redirect } from "next/navigation";
import type { MeetingPrepBrief } from "@arvya/core";
import PrepViewClient from "./prep-view-client";

type PageProps = {
  params: Promise<{ brainId: string; meetingId: string }>;
};

export default async function MeetingPrepPage({ params }: PageProps) {
  const { brainId, meetingId } = await params;
  const repository = getRepository();

  const brain = await repository.getBrain(brainId);
  if (!brain) redirect("/onboarding");

  const meetings = await repository.listNotetakerMeetings({ brainId });
  const meeting = meetings.find((m) => m.id === meetingId);

  const runs = await repository.listAgentRuns(brainId, 200);
  const prepRun = runs.find(
    (r) =>
      r.name === "meeting_prep" &&
      (r.rawInput as Record<string, unknown>)?.meeting_id === meetingId &&
      r.status === "succeeded" &&
      r.rawOutput,
  );

  const brief = prepRun
    ? ((prepRun.rawOutput as Record<string, unknown>)?.structured as MeetingPrepBrief | undefined)
    : undefined;

  const statusDetail = prepRun
    ? ((prepRun.rawOutput as Record<string, unknown>)?.status_detail as string | undefined)
    : undefined;

  return (
    <PrepViewClient
      brainId={brainId}
      brainName={brain.name}
      meetingId={meetingId}
      meetingTitle={meeting?.title ?? "Unknown Meeting"}
      meetingStart={meeting?.startTime}
      meetingEnd={meeting?.endTime}
      brief={brief ?? null}
      isLowConfidence={statusDetail === "succeeded_low_confidence"}
      agentRunId={prepRun?.id}
    />
  );
}
