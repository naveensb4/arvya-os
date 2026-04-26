import { SectionShell } from "@/components/layout/section-shell";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { getRepository, type NotetakerCalendar, type NotetakerMeeting } from "@/lib/db/repository";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { brainId } = await params;
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const repository = getRepository();
  const [calendars, meetings] = await Promise.all([
    repository.listNotetakerCalendars({ brainId: selectedBrain.id }),
    repository.listNotetakerMeetings({
      brainId: selectedBrain.id,
      from: "1970-01-01T00:00:00.000Z",
      to: "2100-01-01T00:00:00.000Z",
      limit: 50,
    }),
  ]);
  const lastProcessed = meetings.find((meeting) => meeting.sourceItemId);

  return (
    <SectionShell
      brainId={selectedBrain.id}
      title="Arvya Notetaker"
      description="Automatically schedule Recall bots for calendar calls and feed meeting transcripts into the Brain."
    >
      <div className="grid gap-4">
        <section className="rounded-2xl bg-stone-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow text-amber-700">Always-on meeting capture</p>
              <h2 className="mt-2 text-2xl font-semibold">Calendar auto-join</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                Default internal mode is all calls, with hard skips for missing meeting URLs, canceled/all-day/ended calls, private events without details, and no-notetaker markers.
              </p>
            </div>
            <form action="/api/notetaker/sync" method="post">
              <input type="hidden" name="brainId" value={selectedBrain.id} />
              <button className="button" type="submit">Force sync calendars</button>
            </form>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Metric label="Auto-join enabled" value={calendars.some((calendar) => calendar.autoJoinEnabled) ? "Yes" : "No"} />
            <Metric label="Mode" value={calendars[0]?.autoJoinMode?.replaceAll("_", " ") ?? "Not configured"} />
            <Metric label="Connected calendars" value={String(calendars.filter((calendar) => calendar.status === "connected").length)} />
            <Metric label="Last transcript" value={lastProcessed ? formatDate(lastProcessed.updatedAt) : "Never"} />
          </div>
        </section>

        <section className="rounded-2xl bg-stone-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Connected calendars</h2>
            <div className="flex flex-wrap gap-2">
              <a className="button-secondary" href={`/api/notetaker/google-calendar/auth/start?brainId=${encodeURIComponent(selectedBrain.id)}`}>
                Connect Google Calendar
              </a>
              <a className="button-secondary" href={`/api/notetaker/outlook-calendar/auth/start?brainId=${encodeURIComponent(selectedBrain.id)}`}>
                Connect Outlook Calendar
              </a>
            </div>
          </div>
          <div className="mt-3 grid gap-3">
            {calendars.map((calendar) => (
              <CalendarRow key={calendar.id} brainId={selectedBrain.id} calendar={calendar} />
            ))}
            {calendars.length === 0 ? (
              <p className="rounded-xl bg-white p-4 text-sm text-stone-500">No Notetaker calendar yet. Create one from Connections.</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl bg-stone-50 p-5">
          <h2 className="text-xl font-semibold">Upcoming meetings</h2>
          <div className="mt-3 grid gap-3">
            {meetings.map((meeting) => (
              <MeetingRow key={meeting.id} brainId={selectedBrain.id} meeting={meeting} />
            ))}
            {meetings.length === 0 ? (
              <p className="rounded-xl bg-white p-4 text-sm text-stone-500">No upcoming meetings synced yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    </SectionShell>
  );
}

function CalendarRow({ brainId, calendar }: { brainId: string; calendar: NotetakerCalendar }) {
  const credentialsConnected = Boolean(calendar.config.credentials);
  return (
    <div className="rounded-xl bg-white p-4 text-sm">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="font-medium">{calendar.provider.replace("_", " ")}</p>
          <p className="mt-1 text-stone-500">
            {credentialsConnected ? "OAuth connected" : "OAuth not connected"} · {calendar.status}
          </p>
        </div>
        <form action="/api/notetaker/config" method="post" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="brainId" value={brainId} />
          <input type="hidden" name="calendarId" value={calendar.id} />
          <input type="hidden" name="provider" value={calendar.provider} />
          <input type="hidden" name="recallCalendarId" value={calendar.recallCalendarId ?? ""} />
          <input type="hidden" name="externalCalendarId" value={calendar.externalCalendarId ?? ""} />
          <input type="hidden" name="autoJoinMode" value={calendar.autoJoinMode} />
          <label className="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-2">
            <input type="checkbox" name="autoJoinEnabled" defaultChecked={calendar.autoJoinEnabled} />
            Auto-join
          </label>
          <button className="button-secondary" type="submit">Save</button>
        </form>
      </div>
      <p className="mt-2 text-stone-500">Mode: {calendar.autoJoinMode.replaceAll("_", " ")}</p>
      <p className="mt-1 text-stone-500">Recall calendar: {calendar.recallCalendarId ?? "Not linked"}</p>
      <p className="mt-1 text-stone-500">External calendar: {calendar.externalCalendarId ?? "primary/default"}</p>
      {calendar.lastError ? <p className="mt-2 text-red-700">{calendar.lastError}</p> : null}
    </div>
  );
}

function MeetingRow({ brainId, meeting }: { brainId: string; meeting: NotetakerMeeting }) {
  return (
    <div className="rounded-xl bg-white p-4 text-sm">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="font-medium">{meeting.title}</p>
          <p className="mt-1 text-stone-500">{formatDate(meeting.startTime)} · {meeting.provider.replace("_", " ")}</p>
        </div>
        <div className="text-right">
          <p className="font-medium">{meeting.botStatus.replaceAll("_", " ")}</p>
          <p className="mt-1 text-stone-500">{meeting.autoJoinDecision}: {meeting.autoJoinReason ?? "No reason"}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {meeting.meetingUrl ? <span className="rounded-full bg-stone-100 px-3 py-1">Meeting URL found</span> : null}
        {meeting.recallBotId ? <span className="rounded-full bg-stone-100 px-3 py-1">Bot {meeting.recallBotId}</span> : null}
        {meeting.sourceItemId ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">Source ingested</span> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <form action="/api/notetaker/meetings/action" method="post">
          <input type="hidden" name="brainId" value={brainId} />
          <input type="hidden" name="meetingId" value={meeting.id} />
          <input type="hidden" name="action" value="schedule" />
          <button className="button-secondary" type="submit" disabled={!meeting.meetingUrl || meeting.botStatus === "scheduled"}>
            Schedule bot
          </button>
        </form>
        <form action="/api/notetaker/meetings/action" method="post">
          <input type="hidden" name="brainId" value={brainId} />
          <input type="hidden" name="meetingId" value={meeting.id} />
          <input type="hidden" name="action" value="skip" />
          <button className="button-secondary" type="submit" disabled={meeting.autoJoinDecision === "skip"}>
            Skip bot
          </button>
        </form>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="truncate text-sm font-medium capitalize">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-widest text-stone-500">{label}</p>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
