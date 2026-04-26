import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { scheduleNotetakerBotForMeeting, skipNotetakerMeeting } from "@/lib/notetaker/runtime";

export async function POST(request: Request) {
  const formData = await request.formData();
  const brainId = String(formData.get("brainId") ?? "").trim();
  const meetingId = String(formData.get("meetingId") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();

  if (!brainId) return NextResponse.json({ error: "brainId is required" }, { status: 400 });
  if (!meetingId) return NextResponse.json({ error: "meetingId is required" }, { status: 400 });

  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  if (action === "schedule") {
    await scheduleNotetakerBotForMeeting({ brainId: selectedBrain.id, meetingId, manual: true });
  } else if (action === "skip") {
    await skipNotetakerMeeting({ brainId: selectedBrain.id, meetingId });
  } else {
    return NextResponse.json({ error: "Unsupported Notetaker meeting action" }, { status: 400 });
  }

  revalidatePath(`/brains/${selectedBrain.id}/notetaker`);
  revalidatePath(`/brains/${selectedBrain.id}/connections`);
  return NextResponse.redirect(new URL(`/brains/${selectedBrain.id}/notetaker`, request.url));
}
