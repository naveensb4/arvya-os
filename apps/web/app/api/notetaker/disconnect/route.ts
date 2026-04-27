import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { getRepository } from "@/lib/db/repository";

export async function POST(request: Request) {
  const formData = await request.formData();
  const brainId = String(formData.get("brainId") ?? "").trim();
  const calendarId = String(formData.get("calendarId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim();

  if (!brainId) return NextResponse.json({ error: "brainId is required" }, { status: 400 });
  if (!calendarId) return NextResponse.json({ error: "calendarId is required" }, { status: 400 });

  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const repository = getRepository();
  const calendar = (await repository.listNotetakerCalendars({ brainId: selectedBrain.id }))
    .find((item) => item.id === calendarId);
  if (!calendar) {
    return NextResponse.redirect(
      new URL(`/brains/${selectedBrain.id}/notetaker?error=${encodeURIComponent("Calendar not found.")}`, request.url),
    );
  }

  await repository.deleteNotetakerCalendar(calendar.id);
  revalidatePath(`/brains/${selectedBrain.id}/connections`);
  revalidatePath(`/brains/${selectedBrain.id}/notetaker`);

  const fallback = `/brains/${selectedBrain.id}/notetaker`;
  return NextResponse.redirect(new URL(returnTo || fallback, request.url));
}
