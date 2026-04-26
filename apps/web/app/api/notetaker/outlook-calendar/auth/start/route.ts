import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { getRepository } from "@/lib/db/repository";
import { buildOutlookCalendarAuthUrl } from "@/lib/notetaker/calendar-providers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const brainId = url.searchParams.get("brainId")?.trim();
  if (!brainId) return NextResponse.json({ error: "brainId is required" }, { status: 400 });

  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const repository = getRepository();
  const existing = (await repository.listNotetakerCalendars({ brainId: selectedBrain.id }))
    .find((calendar) => calendar.provider === "outlook_calendar");
  const calendar = existing ?? await repository.createNotetakerCalendar({
    brainId: selectedBrain.id,
    provider: "outlook_calendar",
    status: "connected",
    autoJoinEnabled: true,
    autoJoinMode: "all_calls",
    config: { source: "outlook_calendar_oauth" },
  });

  return NextResponse.redirect(buildOutlookCalendarAuthUrl({
    brainId: selectedBrain.id,
    calendarId: calendar.id,
  }));
}
