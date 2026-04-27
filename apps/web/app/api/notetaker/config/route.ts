import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { getRepository, type NotetakerAutoJoinMode, type NotetakerProvider } from "@/lib/db/repository";

const providers: NotetakerProvider[] = ["google_calendar", "outlook_calendar"];
const modes: NotetakerAutoJoinMode[] = ["all_calls", "external_only", "arvya_related_only", "manual_only"];

export async function POST(request: Request) {
  const formData = await request.formData();
  const brainId = String(formData.get("brainId") ?? "").trim();
  const calendarId = String(formData.get("calendarId") ?? "").trim();
  const provider = String(formData.get("provider") ?? "google_calendar") as NotetakerProvider;
  const autoJoinMode = String(formData.get("autoJoinMode") ?? "all_calls") as NotetakerAutoJoinMode;
  const autoJoinEnabled = formData.get("autoJoinEnabled") === "on" || formData.get("autoJoinEnabled") === "true";
  const recallCalendarId = String(formData.get("recallCalendarId") ?? "").trim();
  const externalCalendarId = String(formData.get("externalCalendarId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim();

  if (!brainId) return NextResponse.json({ error: "brainId is required" }, { status: 400 });
  if (!providers.includes(provider)) return NextResponse.json({ error: "Unsupported notetaker provider" }, { status: 400 });
  if (!modes.includes(autoJoinMode)) return NextResponse.json({ error: "Unsupported autoJoinMode" }, { status: 400 });

  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const repository = getRepository();

  if (calendarId) {
    const existing = (await repository.listNotetakerCalendars({ brainId: selectedBrain.id }))
      .find((item) => item.id === calendarId);
    const credentialsConnected = Boolean(
      existing?.config?.credentials && typeof existing.config.credentials === "object",
    );
    const nextStatus =
      !credentialsConnected ? "disabled" : autoJoinEnabled ? "connected" : "disabled";
    await repository.updateNotetakerCalendar(calendarId, {
      autoJoinEnabled,
      autoJoinMode,
      recallCalendarId: recallCalendarId || null,
      externalCalendarId: externalCalendarId || null,
      status: nextStatus,
      lastError: null,
    });
  } else {
    await repository.createNotetakerCalendar({
      brainId: selectedBrain.id,
      provider,
      autoJoinEnabled,
      autoJoinMode,
      recallCalendarId: recallCalendarId || null,
      externalCalendarId: externalCalendarId || null,
      status: "disabled",
      config: {
        source: "connections_ui",
        oauth_pending: true,
        note: "Recall Calendar V2 is preferred. Fallback direct scheduling can use external calendar event config.",
      },
    });
  }

  revalidatePath(`/brains/${selectedBrain.id}/connections`);
  revalidatePath(`/brains/${selectedBrain.id}/notetaker`);
  const fallback = `/brains/${selectedBrain.id}/notetaker`;
  return NextResponse.redirect(new URL(returnTo || fallback, request.url));
}
