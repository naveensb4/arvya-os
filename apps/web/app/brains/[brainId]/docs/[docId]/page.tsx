import { getRepository } from "@/lib/db/repository";
import { redirect } from "next/navigation";
import type { MeetingPrepBrief } from "@arvya/core";
import PrepViewClient from "../../meetings/[meetingId]/prep/prep-view-client";

type PageProps = {
  params: Promise<{ brainId: string; docId: string }>;
};

export default async function DocViewerPage({ params }: PageProps) {
  const { brainId, docId } = await params;
  const repository = getRepository();

  const brain = await repository.getBrain(brainId);
  if (!brain) redirect("/onboarding");

  const doc = await repository.getBrainDoc(docId);
  if (!doc || doc.brainId !== brainId) redirect(`/brains/${brainId}`);

  if (doc.docType === "meeting_prep") {
    const brief = doc.content as unknown as MeetingPrepBrief;
    const meetings = doc.meetingId
      ? await repository.listNotetakerMeetings({ brainId })
      : [];
    const meeting = meetings.find((m) => m.id === doc.meetingId);

    return (
      <PrepViewClient
        brainId={brainId}
        brainName={brain.name}
        meetingId={doc.meetingId ?? ""}
        meetingTitle={meeting?.title ?? doc.title.replace("Meeting Prep: ", "")}
        meetingStart={meeting?.startTime}
        meetingEnd={meeting?.endTime}
        brief={brief}
        isLowConfidence={false}
        agentRunId={doc.agentRunId}
        docId={doc.id}
        initialFeedback={doc.feedback}
      />
    );
  }

  return (
    <main style={{
      maxWidth: 720,
      margin: "0 auto",
      padding: "56px 48px 96px",
      fontFamily: "'Instrument Sans', -apple-system, sans-serif",
      color: "var(--text-primary, #0E1726)",
    }}>
      <h1 style={{
        fontFamily: "'Roboto Slab', serif",
        fontSize: 28,
        fontWeight: 700,
        marginBottom: 24,
      }}>
        {doc.title}
      </h1>
      <pre style={{
        whiteSpace: "pre-wrap",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13,
        lineHeight: 1.7,
      }}>
        {doc.contentText ?? JSON.stringify(doc.content, null, 2)}
      </pre>
    </main>
  );
}
