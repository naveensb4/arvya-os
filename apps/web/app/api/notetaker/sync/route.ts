import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { runNotetakerCalendarSync } from "@/lib/notetaker/runtime";

export async function POST(request: Request) {
  const formData = await request.formData();
  const brainId = String(formData.get("brainId") ?? "").trim();
  if (!brainId) return NextResponse.json({ error: "brainId is required" }, { status: 400 });

  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  await runNotetakerCalendarSync({ brainId: selectedBrain.id });

  revalidatePath(`/brains/${selectedBrain.id}/connections`);
  revalidatePath(`/brains/${selectedBrain.id}/notetaker`);
  return NextResponse.redirect(new URL(`/brains/${selectedBrain.id}/notetaker`, request.url));
}
