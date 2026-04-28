import { SectionShell } from "@/components/layout/section-shell";
import { CONNECTOR_TYPES, ensureDefaultConnectorConfigs } from "@/lib/always-on/runtime";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import {
  getRepository,
  type ConnectorConfig,
  type ConnectorSyncRun,
  type NotetakerCalendar,
  type NotetakerMeeting,
} from "@/lib/db/repository";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

const connectorDescriptions: Record<string, string> = {
  google_drive: "Scheduled polling for selected transcript folders only. Ingests .txt and .md files into the Brain.",
  gmail: "Scheduled polling for selected labels, then a required Aryva relevance check. Never sends email.",
  outlook: "Scheduled polling for selected folders or categories, then a required Aryva relevance check. Never sends email.",
  recall: "Webhook-first transcript ingestion. Scheduled sync stays off by default.",
  mock: "Local always-on verifier that exercises source creation, ingestion, sync runs, and alerts.",
};

export default async function Page({ params }: PageProps) {
  const { brainId } = await params;
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const repository = getRepository();
  const configs = await ensureDefaultConnectorConfigs(selectedBrainId);
  const now = new Date();
  const upcomingWindowEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const [syncRuns, notetakerCalendars, upcomingMeetings] = await Promise.all([
    repository.listConnectorSyncRuns({ brainId: selectedBrainId, limit: 30 }),
    repository.listNotetakerCalendars({ brainId: selectedBrainId }),
    repository.listNotetakerMeetings({
      brainId: selectedBrainId,
      from: now.toISOString(),
      to: upcomingWindowEnd.toISOString(),
      limit: 8,
    }),
  ]);

  return (
    <SectionShell brainId={selectedBrainId} title="Connections" description="Configure always-on source capture. Manual sync and scheduled sync use the same runtime path.">
      <div className="grid gap-4">
        {CONNECTOR_TYPES.map((connectorType) => {
          const config = configs.find((item) => item.connectorType === connectorType);
          if (!config) return null;
          const recentRuns = syncRuns.filter((run) => run.connectorConfigId === config.id).slice(0, 3);
          return (
            <ConnectorCard
              key={connectorType}
              brainId={selectedBrainId}
              config={config}
              recentRuns={recentRuns}
              notetakerCalendars={connectorType === "recall" ? notetakerCalendars : []}
              upcomingMeetings={connectorType === "recall" ? upcomingMeetings : []}
            />
          );
        })}
      </div>
    </SectionShell>
  );
}

function ConnectorCard({
  brainId,
  config,
  recentRuns,
  notetakerCalendars,
  upcomingMeetings,
}: {
  brainId: string;
  config: ConnectorConfig;
  recentRuns: ConnectorSyncRun[];
  notetakerCalendars: NotetakerCalendar[];
  upcomingMeetings: NotetakerMeeting[];
}) {
  const label = config.connectorType.replace("_", " ");
  const isOAuthConnector = config.connectorType === "google_drive" || config.connectorType === "gmail" || config.connectorType === "outlook";
  const connected = isOAuthConnector
    ? config.status === "connected"
    : config.status === "active";
  const alwaysOnStatus = config.syncEnabled && connected ? "Always-on" : "Manual";
  const isGoogleDrive = config.connectorType === "google_drive";
  const isGmail = config.connectorType === "gmail";
  const isOutlook = config.connectorType === "outlook";
  const folderIds = Array.isArray(config.config.folderIds)
    ? config.config.folderIds.map((item) => String(item)).join("\n")
    : "";
  const labelIds = Array.isArray(config.config.labelIds)
    ? config.config.labelIds.map((item) => String(item)).join("\n")
    : "";
  const outlookFolderIds = Array.isArray(config.config.outlookFolderIds)
    ? config.config.outlookFolderIds.map((item) => String(item)).join("\n")
    : "";
  const outlookCategoryNames = Array.isArray(config.config.outlookCategoryNames)
    ? config.config.outlookCategoryNames.map((item) => String(item)).join("\n")
    : "";
  const maxItemTestMode = config.config.maxItemTestMode === true;
  const isRecall = config.connectorType === "recall";
  const recallConfigured = Boolean(process.env.RECALL_API_KEY?.trim());
  const primaryNotetakerCalendar = notetakerCalendars[0];
  const authStartPath =
    isGoogleDrive ? "/api/connectors/google-drive/auth/start" :
    isGmail ? "/api/connectors/gmail/auth/start" :
    isOutlook ? "/api/connectors/outlook/auth/start" :
    "";
  const syncPath =
    isGoogleDrive ? "/api/connectors/google-drive/sync" :
    isGmail ? "/api/connectors/gmail/sync" :
    isOutlook ? "/api/connectors/outlook/sync" :
    "/api/connectors/sync-now";

  return (
    <section className="rounded-2xl bg-stone-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-amber-700">{alwaysOnStatus}</p>
          <h2 className="mt-2 text-2xl font-semibold capitalize">{label}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            {connectorDescriptions[config.connectorType]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOAuthConnector ? (
            <a className="button-secondary" href={`${authStartPath}?brainId=${encodeURIComponent(brainId)}`}>
              {connected ? `Reconnect ${connectorDisplayName(config.connectorType)}` : `Connect ${connectorDisplayName(config.connectorType)}`}
            </a>
          ) : null}
          <form action={syncPath} method="post">
            <input type="hidden" name="brainId" value={brainId} />
            <input type="hidden" name="connectorConfigId" value={config.id} />
            <button className="button" type="submit">Sync now</button>
          </form>
        </div>
      </div>

      {isOAuthConnector ? (
        <div className="mt-5 rounded-xl bg-white p-4 text-sm">
          <p className="font-medium">{connected ? `${connectorDisplayName(config.connectorType)} connected` : `${connectorDisplayName(config.connectorType)} not connected`}</p>
          <p className="mt-1 text-stone-500">Credentials are stored server-side and are never sent to the browser.</p>
          {isGmail ? (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900">
              Create a Gmail label named <span className="font-semibold">Arvya Brain</span>, apply it to 5-10 important threads, then save that label name or ID below. A second message-level gate still skips anything that does not mention Aryva/Arvya or an Aryva domain.
            </p>
          ) : null}
          {isOutlook ? (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900">
              Create an Outlook folder or category named <span className="font-semibold">Arvya Brain</span>, move or categorize 5-10 important emails, then save that folder/category name below. A second message-level gate still skips anything that does not mention Aryva/Arvya or an Aryva domain.
            </p>
          ) : null}
        </div>
      ) : null}

      {isRecall ? (
        <div className="mt-5 grid gap-4 rounded-xl bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Arvya Notetaker</p>
              <p className="mt-1 text-stone-500">
                Recall API is {recallConfigured ? "configured" : "missing"}. Transcripts become source items and use the Brain ingestion pipeline.
              </p>
            </div>
            <a className="button-secondary" href={`/brains/${brainId}/notetaker`}>Open Notetaker</a>
          </div>

          <form action="/api/notetaker/config" method="post" className="grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]">
            <input type="hidden" name="brainId" value={brainId} />
            {primaryNotetakerCalendar ? <input type="hidden" name="calendarId" value={primaryNotetakerCalendar.id} /> : null}
            <label className="rounded-xl bg-stone-50 px-4 py-3">
              <span className="block text-xs uppercase tracking-widest text-stone-500">Provider</span>
              <select className="mt-1 w-full bg-transparent" name="provider" defaultValue={primaryNotetakerCalendar?.provider ?? "google_calendar"}>
                <option value="google_calendar">Google Calendar</option>
                <option value="outlook_calendar">Outlook Calendar</option>
              </select>
            </label>
            <label className="rounded-xl bg-stone-50 px-4 py-3">
              <span className="block text-xs uppercase tracking-widest text-stone-500">Auto-join mode</span>
              <select className="mt-1 w-full bg-transparent" name="autoJoinMode" defaultValue={primaryNotetakerCalendar?.autoJoinMode ?? "all_calls"}>
                <option value="all_calls">All calls</option>
                <option value="external_only">External only</option>
                <option value="arvya_related_only">Arvya-related only</option>
                <option value="manual_only">Manual only</option>
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-xl bg-stone-50 px-4 py-3">
              <input type="checkbox" name="autoJoinEnabled" defaultChecked={primaryNotetakerCalendar?.autoJoinEnabled ?? true} />
              Enable auto-join
            </label>
            <button className="button-secondary" type="submit">{primaryNotetakerCalendar ? "Save Notetaker" : "Create Notetaker"}</button>
            <label className="rounded-xl bg-stone-50 px-4 py-3 md:col-span-2">
              <span className="block text-xs uppercase tracking-widest text-stone-500">Recall calendar ID</span>
              <input className="mt-1 w-full bg-transparent" name="recallCalendarId" defaultValue={primaryNotetakerCalendar?.recallCalendarId ?? ""} placeholder="cal_..." />
            </label>
            <label className="rounded-xl bg-stone-50 px-4 py-3 md:col-span-2">
              <span className="block text-xs uppercase tracking-widest text-stone-500">External calendar ID</span>
              <input className="mt-1 w-full bg-transparent" name="externalCalendarId" defaultValue={primaryNotetakerCalendar?.externalCalendarId ?? ""} placeholder="primary or calendar email" />
            </label>
          </form>

          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Calendars" value={String(notetakerCalendars.length)} />
            <Metric label="Upcoming meetings" value={String(upcomingMeetings.length)} />
            <Metric label="Bots scheduled" value={String(upcomingMeetings.filter((meeting) => meeting.botStatus === "scheduled").length)} />
            <Metric label="Last webhook" value={formatDate(lastWebhookAt(upcomingMeetings))} />
          </div>
        </div>
      ) : null}

      <form action="/api/connectors/configs" method="post" className="mt-5 grid gap-3 md:grid-cols-[1fr_160px_auto]">
        <input type="hidden" name="brainId" value={brainId} />
        <input type="hidden" name="connectorType" value={config.connectorType} />
        {isGoogleDrive ? (
          <label className="rounded-xl bg-white px-4 py-3 text-sm md:col-span-3">
            <span className="block text-xs uppercase tracking-widest text-stone-500">Google Drive folder IDs</span>
            <textarea
              className="mt-2 min-h-24 w-full resize-y bg-transparent outline-none"
              name="folderIds"
              defaultValue={folderIds}
              placeholder="One folder ID per line"
            />
          </label>
        ) : null}
        {isGmail ? (
          <label className="rounded-xl bg-white px-4 py-3 text-sm md:col-span-3">
            <span className="block text-xs uppercase tracking-widest text-stone-500">Gmail label names or IDs</span>
            <textarea
              className="mt-2 min-h-24 w-full resize-y bg-transparent outline-none"
              name="labelIds"
              defaultValue={labelIds}
              placeholder="Arvya Brain"
            />
          </label>
        ) : null}
        {isOutlook ? (
          <>
            <label className="rounded-xl bg-white px-4 py-3 text-sm md:col-span-3">
              <span className="block text-xs uppercase tracking-widest text-stone-500">Outlook mail folder names or IDs</span>
              <textarea
                className="mt-2 min-h-24 w-full resize-y bg-transparent outline-none"
                name="outlookFolderIds"
                defaultValue={outlookFolderIds}
                placeholder="Arvya Brain"
              />
            </label>
            <label className="rounded-xl bg-white px-4 py-3 text-sm md:col-span-3">
              <span className="block text-xs uppercase tracking-widest text-stone-500">Outlook category names</span>
              <textarea
                className="mt-2 min-h-24 w-full resize-y bg-transparent outline-none"
                name="outlookCategoryNames"
                defaultValue={outlookCategoryNames}
                placeholder="Arvya Brain"
              />
            </label>
          </>
        ) : null}
        <label className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm">
          <input type="checkbox" name="syncEnabled" defaultChecked={config.syncEnabled} />
          Enable scheduled sync
        </label>
        {isGmail || isOutlook ? (
          <label className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm">
            <input type="checkbox" name="maxItemTestMode" defaultChecked={maxItemTestMode} />
            Max-item test mode
          </label>
        ) : null}
        <label className="rounded-xl bg-white px-4 py-3 text-sm">
          <span className="block text-xs uppercase tracking-widest text-stone-500">Interval</span>
          <input
            className="mt-1 w-full bg-transparent"
            name="syncIntervalMinutes"
            type="number"
            min={5}
            step={5}
            defaultValue={config.syncIntervalMinutes ?? 10}
          />
        </label>
        <button className="button-secondary" type="submit">Save</button>
      </form>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <Metric label="Status" value={config.status} />
        <Metric label="Last Sync" value={formatDate(config.lastSyncAt)} />
        <Metric label="Last Success" value={formatDate(config.lastSuccessAt)} />
        <Metric label="Last Error" value={config.lastError ?? "None"} />
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-stone-500">Recent sync runs</h3>
        <div className="mt-3 space-y-2">
          {recentRuns.map((run) => (
            <div key={run.id} className="rounded-xl bg-white p-3 text-sm text-stone-700">
              <span className="font-medium">{run.status}</span>
              <span className="text-stone-400"> · </span>
              <span>{formatDate(run.startedAt)}</span>
              <span className="text-stone-400"> · </span>
              <span>
                {run.itemsFound} found, {run.itemsIngested} ingested, {run.itemsSkipped} skipped, {itemsFailed(run)} failed
              </span>
              {run.error ? <p className="mt-1 text-red-700">{run.error}</p> : null}
            </div>
          ))}
          {recentRuns.length === 0 ? (
            <p className="rounded-xl bg-white p-3 text-sm text-stone-500">No sync runs yet.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function connectorDisplayName(type: ConnectorConfig["connectorType"]) {
  if (type === "google_drive") return "Google Drive";
  if (type === "gmail") return "Gmail";
  if (type === "outlook") return "Outlook";
  return type.replace("_", " ");
}

function itemsFailed(run: ConnectorSyncRun) {
  const value = run.metadata?.itemsFailed;
  return typeof value === "number" ? value : 0;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="truncate text-sm font-medium">{value}</p>
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

function lastWebhookAt(meetings: NotetakerMeeting[]) {
  const timestamps = meetings
    .map((meeting) => meeting.metadata?.notetaker_ingested_at ?? meeting.metadata?.transcriptProcessedAt)
    .filter((value): value is string => typeof value === "string");
  return timestamps.sort().at(-1);
}
