import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { getRepository } from "@/lib/db/repository";
import {
  connectNotetakerCalendar,
  decodeNotetakerOAuthState,
  exchangeGoogleCalendarCode,
} from "@/lib/notetaker/calendar-providers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const oauthError = url.searchParams.get("error")?.trim();

  if (oauthError) return NextResponse.json({ error: oauthError }, { status: 400 });
  if (!code || !state) return NextResponse.json({ error: "Google Calendar OAuth callback requires code and state" }, { status: 400 });

  const { brainId, calendarId, provider } = decodeNotetakerOAuthState(state);
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const calendar = (await getRepository().listNotetakerCalendars({ brainId: selectedBrain.id }))
    .find((item) => item.id === calendarId && item.provider === provider);
  if (!calendar || calendar.provider !== "google_calendar") {
    return NextResponse.json({ error: "Google Calendar Notetaker calendar was not found" }, { status: 404 });
  }

  const existingCredentials = calendar.config.credentials && typeof calendar.config.credentials === "object"
    ? calendar.config.credentials
    : undefined;
  const credentials = await exchangeGoogleCalendarCode(code, existingCredentials);
  await connectNotetakerCalendar({ calendar, credentials, externalCalendarId: calendar.externalCalendarId ?? "primary" });

  revalidatePath(`/brains/${selectedBrain.id}/connections`);
  revalidatePath(`/brains/${selectedBrain.id}/notetaker`);
  return NextResponse.redirect(new URL(`/brains/${selectedBrain.id}/notetaker`, request.url));
}
