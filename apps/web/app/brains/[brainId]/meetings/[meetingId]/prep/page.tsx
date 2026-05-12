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

  const docs = await repository.listBrainDocs(brainId, {
    meetingId,
    docType: "meeting_prep",
    limit: 1,
  });
  const doc = docs[0] ?? null;

  let brief: MeetingPrepBrief | undefined;
  let statusDetail: string | undefined;
  let agentRunId: string | undefined;

  if (doc) {
    brief = doc.content as unknown as MeetingPrepBrief;
    agentRunId = doc.agentRunId;
  } else {
    const runs = await repository.listAgentRuns(brainId, 200);
    const prepRun = runs.find(
      (r) =>
        r.name === "meeting_prep" &&
        (r.rawInput as Record<string, unknown>)?.meeting_id === meetingId &&
        r.status === "succeeded" &&
        r.rawOutput,
    );
    if (prepRun) {
      brief = (prepRun.rawOutput as Record<string, unknown>)?.structured as MeetingPrepBrief | undefined;
      statusDetail = (prepRun.rawOutput as Record<string, unknown>)?.status_detail as string | undefined;
      agentRunId = prepRun.id;
    }
  }

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
      agentRunId={agentRunId}
      docId={doc?.id}
      initialFeedback={doc?.feedback}
    />
  );
}
