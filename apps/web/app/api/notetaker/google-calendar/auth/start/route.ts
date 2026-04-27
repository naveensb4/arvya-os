import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { getRepository } from "@/lib/db/repository";
import { buildGoogleCalendarAuthUrl } from "@/lib/notetaker/calendar-providers";
import { reuseOrCreateNotetakerCalendar } from "@/lib/notetaker/runtime";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const brainId = url.searchParams.get("brainId")?.trim();
  if (!brainId) return NextResponse.json({ error: "brainId is required" }, { status: 400 });

  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const repository = getRepository();
  const calendar = await reuseOrCreateNotetakerCalendar({
    repository,
    brainId: selectedBrain.id,
    provider: "google_calendar",
    defaultExternalCalendarId: "primary",
    defaultConfig: { source: "google_calendar_oauth", oauth_pending: true },
  });

  try {
    return NextResponse.redirect(buildGoogleCalendarAuthUrl({
      brainId: selectedBrain.id,
      calendarId: calendar.id,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar OAuth is not configured.";
    return NextResponse.redirect(
      new URL(`/brains/${selectedBrain.id}/notetaker?error=${encodeURIComponent(message)}`, request.url),
    );
  }
}
