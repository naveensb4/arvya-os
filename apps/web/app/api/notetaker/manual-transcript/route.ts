import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { getRepository } from "@/lib/db/repository";
import { ingestNotetakerTranscript } from "@/lib/notetaker/runtime";

const SAMPLE_TRANSCRIPT = `Naveen: Welcome to the Arvya investor sync. Quick agenda — product update, customer pipeline, asks.
Investor: Sounds good. Where are you on the brain product?
Naveen: We shipped Notetaker last week. Calendar auto-join works for Google and Outlook. Transcripts ingest into the Brain and become memory and open loops automatically.
Investor: Who's using it?
Naveen: Three design partners are live. Two are paying. We need warm intros to operators-in-residence at Sequoia and a16z.
Investor: I'll intro you to two people this week. Please send a one-pager by Friday.
Naveen: Will do. Action item: send the one-pager Friday. Also follow up with the third design partner about pricing.`;

export async function POST(request: Request) {
  const formData = await request.formData();
  const brainId = String(formData.get("brainId") ?? "").trim();
  const transcriptInput = String(formData.get("transcript") ?? "").trim();
  const meetingTitle = String(formData.get("meetingTitle") ?? "").trim();
  const meetingUrl = String(formData.get("meetingUrl") ?? "").trim();

  if (!brainId) return NextResponse.json({ error: "brainId is required" }, { status: 400 });

  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const repository = getRepository();
  const transcript = transcriptInput || SAMPLE_TRANSCRIPT;
  const startTime = new Date().toISOString();
  const endTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const title = meetingTitle || "Manual Notetaker test transcript";

  const meeting = await repository.createNotetakerMeeting({
    brainId: selectedBrain.id,
    notetakerCalendarId: null,
    provider: "google_calendar",
    title,
    meetingUrl: meetingUrl || null,
    startTime,
    endTime,
    participants: [],
    autoJoinDecision: "join",
    autoJoinReason: "manual_paste",
    botStatus: "completed",
    metadata: { source_kind: "manual_paste", manual_pasted_at: new Date().toISOString() },
  });

  try {
    await ingestNotetakerTranscript({
      brainId: selectedBrain.id,
      meeting,
      payload: { transcript, transcript_id: `manual-${meeting.id}` },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to ingest transcript.";
    return NextResponse.redirect(
      new URL(`/brains/${selectedBrain.id}/notetaker?error=${encodeURIComponent(message)}`, request.url),
    );
  }

  revalidatePath(`/brains/${selectedBrain.id}/notetaker`);
  revalidatePath(`/brains/${selectedBrain.id}/sources`);
  return NextResponse.redirect(
    new URL(`/brains/${selectedBrain.id}/notetaker?connected=manual_transcript`, request.url),
  );
}
