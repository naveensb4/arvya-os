import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { getRepository } from "@/lib/db/repository";
import {
  connectNotetakerCalendar,
  decodeNotetakerOAuthState,
  exchangeOutlookCalendarCode,
} from "@/lib/notetaker/calendar-providers";

function notetakerError(request: Request, brainId: string, message: string) {
  return NextResponse.redirect(
    new URL(`/brains/${brainId}/notetaker?error=${encodeURIComponent(message)}`, request.url),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const oauthError = url.searchParams.get("error")?.trim();

  if (!state) {
    return NextResponse.json({ error: "Missing OAuth state." }, { status: 400 });
  }

  let decoded;
  try {
    decoded = decodeNotetakerOAuthState(state);
  } catch {
    return NextResponse.json({ error: "Invalid Notetaker OAuth state." }, { status: 400 });
  }
  const { brainId, calendarId, provider } = decoded;
  const { selectedBrain } = await selectedBrainOrDefault(brainId);

  if (oauthError) return notetakerError(request, selectedBrain.id, oauthError);
  if (!code) return notetakerError(request, selectedBrain.id, "Outlook Calendar OAuth callback was missing the authorization code.");

  const calendar = (await getRepository().listNotetakerCalendars({ brainId: selectedBrain.id }))
    .find((item) => item.id === calendarId && item.provider === provider);
  if (!calendar || calendar.provider !== "outlook_calendar") {
    return notetakerError(request, selectedBrain.id, "Outlook Calendar Notetaker calendar was not found.");
  }

  try {
    const existingCredentials = calendar.config.credentials && typeof calendar.config.credentials === "object"
      ? calendar.config.credentials
      : undefined;
    const credentials = await exchangeOutlookCalendarCode(code, existingCredentials);
    await connectNotetakerCalendar({
      calendar,
      credentials,
      externalCalendarId: calendar.externalCalendarId ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Outlook Calendar OAuth failed.";
    return notetakerError(request, selectedBrain.id, message);
  }

  revalidatePath(`/brains/${selectedBrain.id}/connections`);
  revalidatePath(`/brains/${selectedBrain.id}/notetaker`);
  return NextResponse.redirect(
    new URL(`/brains/${selectedBrain.id}/notetaker?connected=outlook_calendar`, request.url),
  );
}
