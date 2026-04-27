import { SectionShell } from "@/components/layout/section-shell";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { getRepository, type NotetakerCalendar, type NotetakerMeeting } from "@/lib/db/repository";

type PageProps = {
  params: Promise<{ brainId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const providerLabels: Record<NotetakerCalendar["provider"], string> = {
  google_calendar: "Google Calendar",
  outlook_calendar: "Outlook Calendar",
};

export default async function Page({ params, searchParams }: PageProps) {
  const { brainId } = await params;
  const queryParams: Record<string, string | string[] | undefined> = searchParams ? await searchParams : {};
  const errorMessage = typeof queryParams.error === "string" ? queryParams.error : undefined;
  const connectedProvider = typeof queryParams.connected === "string" ? queryParams.connected : undefined;
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
  const recallConfigured = Boolean(process.env.RECALL_API_KEY?.trim());
  const returnTo = `/brains/${selectedBrain.id}/notetaker`;

  return (
    <SectionShell
      brainId={selectedBrain.id}
      title="Arvya Notetaker"
      description="Automatically schedule Recall bots for calendar calls and feed meeting transcripts into the Brain."
    >
      <div className="grid gap-4">
        {errorMessage ? (
          <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold">Notetaker error</p>
            <p className="mt-1">{errorMessage}</p>
          </div>
        ) : null}
        {connectedProvider === "manual_transcript" ? (
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Transcript ingested</p>
            <p className="mt-1">Open Sources or ask the Brain about it — extraction, embeddings, and open loops have already run.</p>
          </div>
        ) : connectedProvider ? (
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">{providerLabels[connectedProvider as NotetakerCalendar["provider"]] ?? connectedProvider} connected</p>
            <p className="mt-1">Click Force sync calendars to pull the next 7 days of meetings.</p>
          </div>
        ) : null}
        {!recallConfigured ? (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Recall API key is not set</p>
            <p className="mt-1">
              Calendar detection works, but bots will not actually join calls until you set <code className="rounded bg-amber-100 px-1">RECALL_API_KEY</code>{" "}
              in <code className="rounded bg-amber-100 px-1">.env.local</code>. Until then, scheduled bots are mocked and no transcripts will arrive.
            </p>
          </div>
        ) : null}

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
            <Metric label="Connected calendars" value={String(calendars.filter(calendarHasCredentials).length)} />
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
              <CalendarRow key={calendar.id} brainId={selectedBrain.id} calendar={calendar} returnTo={returnTo} />
            ))}
            {calendars.length === 0 ? (
              <p className="rounded-xl bg-white p-4 text-sm text-stone-500">No Notetaker calendar yet. Click Connect Google Calendar or Connect Outlook Calendar above.</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl bg-stone-50 p-5">
          <h2 className="text-xl font-semibold">Test the pipeline without Recall</h2>
          <p className="mt-2 max-w-3xl text-sm text-stone-600">
            Paste a meeting transcript below to skip Recall entirely. Arvya will create a meeting row, ingest the transcript as a source item, and run it through extraction and embeddings just like a live call. Leave the box empty to use a built-in sample.
          </p>
          <form action="/api/notetaker/manual-transcript" method="post" className="mt-3 grid gap-2">
            <input type="hidden" name="brainId" value={selectedBrain.id} />
            <input
              name="meetingTitle"
              className="rounded-xl bg-white px-3 py-2 text-sm"
              placeholder="Meeting title (optional)"
            />
            <input
              name="meetingUrl"
              className="rounded-xl bg-white px-3 py-2 text-sm"
              placeholder="Meeting URL (optional)"
            />
            <textarea
              name="transcript"
              rows={6}
              className="rounded-xl bg-white px-3 py-2 text-sm"
              placeholder="Paste a transcript here, or leave empty to use a sample."
            />
            <div>
              <button className="button" type="submit">Ingest transcript</button>
            </div>
          </form>
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

function calendarHasCredentials(calendar: NotetakerCalendar) {
  const creds = calendar.config?.credentials;
  return Boolean(creds && typeof creds === "object" && (creds as { access_token?: string }).access_token);
}

function CalendarRow({ brainId, calendar, returnTo }: { brainId: string; calendar: NotetakerCalendar; returnTo: string }) {
  const credentialsConnected = calendarHasCredentials(calendar);
  const oauthPending = !credentialsConnected;
  const reconnectPath =
    calendar.provider === "google_calendar"
      ? "/api/notetaker/google-calendar/auth/start"
      : "/api/notetaker/outlook-calendar/auth/start";

  return (
    <div className="rounded-xl bg-white p-4 text-sm">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="font-medium">{providerLabels[calendar.provider] ?? calendar.provider}</p>
          <p className="mt-1 text-stone-500">
            {credentialsConnected ? "OAuth connected" : "OAuth not connected"} · status: {calendar.status}
          </p>
          {oauthPending ? (
            <p className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900">
              Click Connect to finish OAuth before this calendar will sync.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <a className="button-secondary" href={`${reconnectPath}?brainId=${encodeURIComponent(brainId)}`}>
            {credentialsConnected ? "Reconnect" : "Connect"}
          </a>
          <form action="/api/notetaker/disconnect" method="post">
            <input type="hidden" name="brainId" value={brainId} />
            <input type="hidden" name="calendarId" value={calendar.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button className="button-secondary" type="submit">Disconnect</button>
          </form>
        </div>
      </div>
      <form action="/api/notetaker/config" method="post" className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="brainId" value={brainId} />
        <input type="hidden" name="calendarId" value={calendar.id} />
        <input type="hidden" name="provider" value={calendar.provider} />
        <input type="hidden" name="recallCalendarId" value={calendar.recallCalendarId ?? ""} />
        <input type="hidden" name="externalCalendarId" value={calendar.externalCalendarId ?? ""} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="rounded-full bg-stone-100 px-3 py-2">
          <span className="mr-2 text-xs uppercase tracking-widest text-stone-500">Mode</span>
          <select name="autoJoinMode" defaultValue={calendar.autoJoinMode} className="bg-transparent">
            <option value="all_calls">All calls</option>
            <option value="external_only">External only</option>
            <option value="arvya_related_only">Arvya-related only</option>
            <option value="manual_only">Manual only</option>
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-2">
          <input type="checkbox" name="autoJoinEnabled" defaultChecked={calendar.autoJoinEnabled} disabled={!credentialsConnected} />
          Auto-join
        </label>
        <button className="button-secondary" type="submit" disabled={!credentialsConnected}>Save</button>
      </form>
      <p className="mt-2 text-stone-500">External calendar: {calendar.externalCalendarId ?? "default (primary inbox)"}</p>
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
          <button
            className="button-secondary"
            type="submit"
            disabled={
              !meeting.meetingUrl ||
              meeting.botStatus === "scheduled" ||
              meeting.botStatus === "completed" ||
              meeting.botStatus === "in_call"
            }
          >
            Schedule bot
          </button>
        </form>
        <form action="/api/notetaker/meetings/action" method="post">
          <input type="hidden" name="brainId" value={brainId} />
          <input type="hidden" name="meetingId" value={meeting.id} />
          <input type="hidden" name="action" value="skip" />
          <button
            className="button-secondary"
            type="submit"
            disabled={
              meeting.autoJoinDecision === "skip" ||
              meeting.botStatus === "completed" ||
              meeting.botStatus === "in_call"
            }
          >
            Skip bot
          </button>
        </form>
        <form action="/api/notetaker/meetings/action" method="post">
          <input type="hidden" name="brainId" value={brainId} />
          <input type="hidden" name="meetingId" value={meeting.id} />
          <input type="hidden" name="action" value="fetch_transcript" />
          <button className="button-secondary" type="submit" disabled={!meeting.recallBotId || Boolean(meeting.sourceItemId)}>
            Fetch transcript
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
    timeZone: "UTC",
  }).format(new Date(value));
}
