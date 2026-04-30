import { createHmac, timingSafeEqual } from "node:crypto";
import { getRepository, type BrainRepository, type ConnectorConfig, type NotetakerAutoJoinMode, type NotetakerCalendar, type NotetakerMeeting, type NotetakerProvider } from "@/lib/db/repository";
import { processSourceItemIntoBrain } from "@/lib/workflows/source-ingestion";
import {
  buildDedupeKeys,
  buildSourceTraceMetadata,
  hashNormalizedSourceContent,
  mergeSourceTraceMetadata,
  normalizeSourceContent,
  sourceFingerprint,
  sourceMatchesFingerprint,
} from "@/lib/workflows/source-normalization";
import { listProviderCalendarEvents, MEETING_URL_PATTERN } from "./calendar-providers";

export function notetakerCalendarHasCredentials(calendar: NotetakerCalendar) {
  const creds = calendar.config?.credentials;
  return Boolean(creds && typeof creds === "object" && (creds as { access_token?: string }).access_token);
}

export function notetakerRecallConfigured() {
  return Boolean(process.env.RECALL_API_KEY?.trim());
}

function connectorHasAnyScope(config: ConnectorConfig, scopes: string[]) {
  const credentials = config.credentials as { scope?: unknown } | null | undefined;
  if (typeof credentials?.scope !== "string") return false;
  const grantedScopes = new Set(credentials.scope.split(/\s+/).filter(Boolean));
  return scopes.some((scope) => grantedScopes.has(scope));
}

function connectorHasAccessToken(config: ConnectorConfig) {
  const credentials = config.credentials as { access_token?: unknown } | null | undefined;
  return typeof credentials?.access_token === "string" && credentials.access_token.trim().length > 0;
}

async function ensureCalendarFromOutlookConnector(input: { brainId?: string } = {}) {
  const repository = getRepository();
  const configs = await repository.listConnectorConfigs(input.brainId);
  const outlookConfigs = configs.filter((config) =>
    config.connectorType === "outlook" &&
    config.status === "connected" &&
    connectorHasAccessToken(config) &&
    connectorHasAnyScope(config, ["Calendars.Read", "Calendars.ReadWrite"])
  );
  const createdOrUpdated: NotetakerCalendar[] = [];

  for (const config of outlookConfigs) {
    const existing = (await repository.listNotetakerCalendars({ brainId: config.brainId }))
      .find((calendar) => calendar.provider === "outlook_calendar");
    const credentials = config.credentials as Record<string, unknown>;
    const baseConfig = {
      ...(existing?.config ?? {}),
      credentials,
      inherited_from_connector_config_id: config.id,
      inherited_from_connector_type: "outlook",
      connected_at: existing?.config?.connected_at ?? new Date().toISOString(),
    };

    if (existing) {
      const updated = await repository.updateNotetakerCalendar(existing.id, {
        status: "connected",
        autoJoinEnabled: true,
        autoJoinMode: existing.autoJoinMode || "all_calls",
        config: baseConfig,
        lastError: null,
      });
      if (updated) createdOrUpdated.push(updated);
      continue;
    }

    createdOrUpdated.push(await repository.createNotetakerCalendar({
      brainId: config.brainId,
      provider: "outlook_calendar",
      status: "connected",
      autoJoinEnabled: true,
      autoJoinMode: "all_calls",
      externalCalendarId: null,
      config: baseConfig,
    }));
  }

  return createdOrUpdated;
}

export async function reuseOrCreateNotetakerCalendar(input: {
  repository: BrainRepository;
  brainId: string;
  provider: NotetakerProvider;
  defaultExternalCalendarId: string | null;
  defaultConfig: Record<string, unknown>;
}): Promise<NotetakerCalendar> {
  const existing = (await input.repository.listNotetakerCalendars({ brainId: input.brainId }))
    .filter((calendar) => calendar.provider === input.provider);

  if (existing.length === 0) {
    return input.repository.createNotetakerCalendar({
      brainId: input.brainId,
      provider: input.provider,
      status: "disabled",
      autoJoinEnabled: false,
      autoJoinMode: "all_calls",
      externalCalendarId: input.defaultExternalCalendarId,
      config: input.defaultConfig,
    });
  }

  const sorted = [...existing].sort((a, b) => {
    const aHas = notetakerCalendarHasCredentials(a) ? 1 : 0;
    const bHas = notetakerCalendarHasCredentials(b) ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);
  });
  const [primary, ...duplicates] = sorted;
  for (const duplicate of duplicates) {
    await input.repository.deleteNotetakerCalendar(duplicate.id);
  }
  return primary;
}

export type NotetakerCalendarEvent = {
  id: string;
  title: string;
  description?: string;
  meetingUrl?: string;
  startTime: string;
  endTime: string;
  participants?: unknown[];
  isCanceled?: boolean;
  isAllDay?: boolean;
  isPrivate?: boolean;
  recallCalendarEventId?: string;
  metadata?: Record<string, unknown>;
};

export type RecallScheduleResult = {
  botId: string;
  status?: NotetakerMeeting["botStatus"];
  metadata?: Record<string, unknown>;
};

export type RecallClient = {
  listCalendarEvents(calendar: NotetakerCalendar): Promise<NotetakerCalendarEvent[]>;
  scheduleBot(input: { meeting: NotetakerMeeting; joinAt: string }): Promise<RecallScheduleResult>;
  fetchTranscript(input: { botId?: string | null; transcriptId?: string | null; payload?: Record<string, unknown> }): Promise<TranscriptPayload>;
};

export type TranscriptPayload = {
  text: string;
  transcriptId?: string;
  speakers?: unknown[];
  utterances?: Array<{ speaker?: string; timestamp?: string; text: string }>;
  metadata?: Record<string, unknown>;
};

export type AutoJoinDecision = {
  decision: "join" | "skip" | "needs_review";
  reason: string;
  meetingUrl?: string;
};

const DEFAULT_RECALL_BASE_URL = "https://us-west-2.recall.ai/api/v1";
const NO_BOT_MARKERS = ["no-notetaker", "no-arvya-bot"];
const NOTETAKER_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function boolValue(value: unknown) {
  return value === true || value === "true";
}

function contentHash(content: string) {
  return hashNormalizedSourceContent(content);
}

function recallBaseUrl() {
  return process.env.RECALL_BASE_URL?.replace(/\/$/, "") || DEFAULT_RECALL_BASE_URL;
}

function hasRecallApiKey() {
  return Boolean(process.env.RECALL_API_KEY?.trim());
}

const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export function verifyRecallWebhookSignature(input: {
  body: string;
  signature?: string | null;
  webhookId?: string | null;
  webhookTimestamp?: string | null;
  now?: number;
}) {
  const secret = process.env.RECALL_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production";
  }
  if (!input.signature) return false;
  if (!input.webhookId || !input.webhookTimestamp) return false;
  if (!secret.startsWith("whsec_")) return false;

  const timestampSeconds = Number.parseInt(input.webhookTimestamp, 10);
  if (!Number.isFinite(timestampSeconds)) return false;
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const toSign = `${input.webhookId}.${input.webhookTimestamp}.${input.body}`;
  const expected = createHmac("sha256", key).update(toSign).digest();

  const passedSignatures = input.signature.split(" ").map((part) => part.trim()).filter(Boolean);
  for (const versionedSig of passedSignatures) {
    const [version, signature] = versionedSig.split(",");
    if (version !== "v1" || !signature) continue;
    const received = Buffer.from(signature, "base64");
    if (received.length !== expected.length) continue;
    if (timingSafeEqual(new Uint8Array(expected), new Uint8Array(received))) return true;
  }
  return false;
}

export function extractMeetingUrl(input: { title?: string; description?: string; location?: string; meetingUrl?: string }) {
  const explicit = stringValue(input.meetingUrl);
  if (explicit && (MEETING_URL_PATTERN.test(explicit) || /^https?:\/\//i.test(explicit))) return explicit;
  const haystack = [input.location, input.description, input.title].filter(Boolean).join("\n");
  const match = haystack.match(MEETING_URL_PATTERN);
  return match?.[0];
}

export function shouldJoinMeeting(
  event: NotetakerCalendarEvent,
  policy: { autoJoinEnabled: boolean; autoJoinMode: NotetakerAutoJoinMode },
  now = new Date(),
): AutoJoinDecision {
  const meetingUrl = extractMeetingUrl({
    title: event.title,
    description: event.description,
    meetingUrl: event.meetingUrl,
  });
  const titleAndDescription = `${event.title} ${event.description ?? ""}`.toLowerCase();
  const participantText = JSON.stringify(event.participants ?? []).toLowerCase();

  if (!policy.autoJoinEnabled) return { decision: "skip", reason: "auto_join_disabled" };
  if (policy.autoJoinMode === "manual_only") return { decision: "needs_review", reason: "manual_only_mode", meetingUrl };
  if (!meetingUrl) return { decision: "skip", reason: "missing_meeting_url" };
  if (event.isCanceled) return { decision: "skip", reason: "canceled_event", meetingUrl };
  if (event.isAllDay) return { decision: "skip", reason: "all_day_event", meetingUrl };
  if (new Date(event.endTime).getTime() <= now.getTime()) return { decision: "skip", reason: "already_ended", meetingUrl };
  if (event.isPrivate && !event.title.trim()) return { decision: "skip", reason: "private_event_without_details", meetingUrl };
  if (NO_BOT_MARKERS.some((marker) => titleAndDescription.includes(marker))) {
    return { decision: "skip", reason: "explicit_no_notetaker_marker", meetingUrl };
  }

  if (policy.autoJoinMode === "all_calls") return { decision: "join", reason: "all_calls_policy", meetingUrl };
  if (policy.autoJoinMode === "arvya_related_only") {
    return titleAndDescription.includes("arvya") ||
      titleAndDescription.includes("aryva") ||
      participantText.includes("@arvya.") ||
      participantText.includes("@aryva.")
      ? { decision: "join", reason: "arvya_related_match", meetingUrl }
      : { decision: "skip", reason: "not_arvya_related", meetingUrl };
  }
  if (policy.autoJoinMode === "external_only") {
    const participants = event.participants ?? [];
    const hasExternal = participants.some((participant) => {
      const text = JSON.stringify(participant).toLowerCase();
      return text.includes("@") && !text.includes("@arvya");
    });
    return hasExternal
      ? { decision: "join", reason: "external_participant_match", meetingUrl }
      : { decision: "skip", reason: "not_external", meetingUrl };
  }

  return { decision: "needs_review", reason: "unknown_policy", meetingUrl };
}

class RecallApiClient implements RecallClient {
  private async request<T>(path: string, init?: RequestInit) {
    const apiKey = process.env.RECALL_API_KEY?.trim();
    if (!apiKey) throw new Error("Recall API is not configured. Set RECALL_API_KEY.");
    const response = await fetch(`${recallBaseUrl()}${path}`, {
      ...init,
      headers: {
        authorization: `Token ${apiKey}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const rawText = await response.text();
    let json: T & { detail?: string; error?: string };
    try {
      json = JSON.parse(rawText);
    } catch {
      json = {} as T & { detail?: string; error?: string };
    }
    if (!response.ok) {
      const detail = (json as { detail?: string }).detail;
      const error = (json as { error?: string }).error;
      let fieldErrors = "";
      try {
        fieldErrors = Object.entries(json as Record<string, unknown>)
          .filter(([, v]) => Array.isArray(v) || typeof v === "string")
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? (v as unknown[]).join(", ") : v}`)
          .join("; ");
      } catch {
        fieldErrors = "";
      }
      const reason = detail || error || fieldErrors || rawText.slice(0, 300);
      console.error("[recall] api error", { status: response.status, path, body: rawText });
      throw new Error(`Recall ${response.status} ${path}${reason ? ` — ${reason}` : ""}`);
    }
    return json;
  }

  async listCalendarEvents(calendar: NotetakerCalendar): Promise<NotetakerCalendarEvent[]> {
    if (!calendar.recallCalendarId) return listProviderCalendarEvents(calendar);
    const json = await this.request<{ results?: unknown[]; calendar_events?: unknown[] }>(
      `/calendar-events?calendar_id=${encodeURIComponent(calendar.recallCalendarId)}`,
    );
    const events = json.results ?? json.calendar_events ?? [];
    return events.flatMap((item) => normalizeRecallCalendarEvent(item));
  }

  async scheduleBot(input: { meeting: NotetakerMeeting; joinAt: string }): Promise<RecallScheduleResult> {
    if (!input.meeting.meetingUrl) throw new Error("Cannot schedule Recall bot without a meeting URL.");
    const metadata: Record<string, string> = {
      brain_id: input.meeting.brainId,
      notetaker_meeting_id: input.meeting.id,
    };
    if (input.meeting.externalEventId) metadata.external_event_id = input.meeting.externalEventId;
    const json = await this.request<{ id?: string; bot_id?: string; status?: string }>("/bot", {
      method: "POST",
      body: JSON.stringify({
        meeting_url: input.meeting.meetingUrl,
        bot_name: "Arvya Notetaker",
        join_at: input.joinAt,
        recording_config: {
          transcript: {
            provider: {
              recallai_streaming: { mode: "prioritize_accuracy" },
            },
          },
        },
        metadata,
      }),
    });
    return {
      botId: stringValue(json.id) ?? stringValue(json.bot_id) ?? `recall-bot-${input.meeting.id}`,
      status: "scheduled",
      metadata: { recallScheduleResponse: json },
    };
  }

  async fetchTranscript(input: { botId?: string | null; transcriptId?: string | null; payload?: Record<string, unknown> }) {
    const inline = transcriptFromPayload(input.payload ?? {});
    if (inline.text) return inline;

    let downloadUrl: string | undefined;
    let transcriptId = input.transcriptId ?? undefined;

    if (transcriptId) {
      const artifact = await this.request<RecallTranscriptArtifact>(`/transcript/${encodeURIComponent(transcriptId)}/`);
      downloadUrl = artifact.data?.download_url;
    } else if (input.botId) {
      const bot = await this.request<RecallBotResponse>(`/bot/${encodeURIComponent(input.botId)}/`);
      const transcriptArtifact = (bot.recordings ?? [])
        .flatMap((recording) => (recording.media_shortcuts?.transcript ? [recording.media_shortcuts.transcript] : []))
        .find((t) => t.data?.download_url);
      if (!transcriptArtifact) {
        const status = bot.status_changes?.[bot.status_changes.length - 1]?.code ?? "unknown";
        throw new Error(`Transcript not ready yet (bot status: ${status}). Wait for the meeting to end and try again.`);
      }
      transcriptId = transcriptArtifact.id;
      downloadUrl = transcriptArtifact.data?.download_url;
    } else {
      throw new Error("Recall transcript fetch requires a botId or transcriptId.");
    }

    if (!downloadUrl) throw new Error("Recall transcript artifact has no download URL yet.");

    const downloadResponse = await fetch(downloadUrl);
    if (!downloadResponse.ok) {
      throw new Error(`Recall transcript download failed: ${downloadResponse.status}`);
    }
    const downloadJson = await downloadResponse.json() as RecallTranscriptDownload;
    const utterances = flattenRecallTranscriptDownload(downloadJson);
    const text = formatUtterances(utterances);
    if (!text) throw new Error("Recall transcript download returned no words.");
    return {
      transcriptId,
      text,
      utterances,
      metadata: { transcript_id: transcriptId, raw_artifact: downloadJson },
    };
  }
}

type RecallTranscriptArtifact = {
  id?: string;
  data?: { download_url?: string };
  status?: { code?: string };
};

type RecallBotResponse = {
  id?: string;
  status_changes?: Array<{ code?: string }>;
  recordings?: Array<{
    id?: string;
    media_shortcuts?: {
      transcript?: RecallTranscriptArtifact;
    };
  }>;
};

type RecallTranscriptDownload = Array<{
  participant?: { name?: string | null; email?: string | null };
  language_code?: string;
  words?: Array<{
    text?: string;
    start_timestamp?: { absolute?: string | null; relative?: number };
  }>;
}>;

function flattenRecallTranscriptDownload(payload: RecallTranscriptDownload) {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((segment) => {
    const speaker = segment.participant?.name ?? segment.participant?.email ?? undefined;
    const text = (segment.words ?? []).map((word) => word.text ?? "").join(" ").replace(/\s+/g, " ").trim();
    if (!text) return [];
    const timestamp = segment.words?.[0]?.start_timestamp?.absolute ?? undefined;
    return [{ speaker, timestamp, text }];
  });
}

export class MockRecallClient implements RecallClient {
  async listCalendarEvents(calendar: NotetakerCalendar): Promise<NotetakerCalendarEvent[]> {
    const configured = calendar.config.mockEvents;
    return Array.isArray(configured) ? configured.map((event) => normalizeConfiguredEvent(event)).filter(Boolean) : [];
  }

  async scheduleBot(input: { meeting: NotetakerMeeting; joinAt: string }): Promise<RecallScheduleResult> {
    return {
      botId: `mock-recall-bot-${input.meeting.externalEventId ?? input.meeting.id}`,
      status: "scheduled",
      metadata: { mockScheduledAt: nowIso(), joinAt: input.joinAt },
    };
  }

  async fetchTranscript(input: { botId?: string | null; transcriptId?: string | null; payload?: Record<string, unknown> }) {
    const inline = transcriptFromPayload(input.payload ?? {});
    if (inline.text) return inline;
    return {
      transcriptId: input.transcriptId ?? input.botId ?? "mock-transcript",
      text: "Naveen and PB reviewed Arvya Notetaker. Decision: auto-join Arvya calls with a kill switch. Action: test Recall webhook ingestion and confirm calendar OAuth setup.",
    };
  }
}

function getRecallClient(options?: { client?: RecallClient }) {
  return options?.client ?? (hasRecallApiKey() ? new RecallApiClient() : new MockRecallClient());
}

function normalizeConfiguredEvent(value: unknown): NotetakerCalendarEvent {
  const item = (value ?? {}) as Record<string, unknown>;
  const id = stringValue(item.id) ?? stringValue(item.externalEventId) ?? stringValue(item.recallCalendarEventId);
  const title = typeof item.title === "string" ? item.title : "Untitled meeting";
  const startTime = stringValue(item.startTime) ?? stringValue(item.start_time);
  const endTime = stringValue(item.endTime) ?? stringValue(item.end_time);
  if (!id || !startTime || !endTime) throw new Error("Mock notetaker events require id, startTime, and endTime.");
  return {
    id,
    title,
    description: stringValue(item.description),
    meetingUrl: stringValue(item.meetingUrl) ?? stringValue(item.meeting_url),
    startTime,
    endTime,
    participants: Array.isArray(item.participants) ? item.participants : [],
    isCanceled: boolValue(item.isCanceled) || boolValue(item.canceled),
    isAllDay: boolValue(item.isAllDay) || boolValue(item.all_day),
    isPrivate: boolValue(item.isPrivate) || boolValue(item.private),
    recallCalendarEventId: stringValue(item.recallCalendarEventId) ?? stringValue(item.recall_calendar_event_id),
    metadata: (item.metadata ?? {}) as Record<string, unknown>,
  };
}

function normalizeRecallCalendarEvent(value: unknown): NotetakerCalendarEvent[] {
  const item = (value ?? {}) as Record<string, unknown>;
  const id = stringValue(item.id) ?? stringValue(item.calendar_event_id) ?? stringValue(item.external_event_id);
  const startTime = stringValue(item.start_time) ?? stringValue(item.startTime);
  const endTime = stringValue(item.end_time) ?? stringValue(item.endTime);
  if (!id || !startTime || !endTime) return [];
  return [{
    id,
    title: typeof item.title === "string" ? item.title : stringValue(item.summary) ?? "Untitled meeting",
    description: stringValue(item.description),
    meetingUrl: stringValue(item.meeting_url) ?? stringValue(item.meetingUrl),
    startTime,
    endTime,
    participants: Array.isArray(item.participants) ? item.participants : [],
    isCanceled: stringValue(item.status) === "cancelled" || boolValue(item.is_canceled),
    isAllDay: boolValue(item.is_all_day),
    isPrivate: stringValue(item.visibility) === "private",
    recallCalendarEventId: id,
    metadata: item,
  }];
}

function transcriptFromPayload(payload: Record<string, unknown>): TranscriptPayload {
  const text = stringValue(payload.transcript) ?? stringValue(payload.text) ?? stringValue(payload.content) ?? "";
  const utterances = Array.isArray(payload.utterances)
    ? payload.utterances.flatMap((utterance) => {
        const item = utterance as Record<string, unknown>;
        const utteranceText = stringValue(item.text) ?? stringValue(item.words);
        if (!utteranceText) return [];
        return [{
          speaker: stringValue(item.speaker) ?? stringValue(item.speaker_name),
          timestamp: stringValue(item.timestamp) ?? stringValue(item.start_time),
          text: utteranceText,
        }];
      })
    : undefined;
  return {
    text: text || formatUtterances(utterances ?? []),
    transcriptId: stringValue(payload.transcriptId) ?? stringValue(payload.transcript_id) ?? stringValue(payload.id),
    speakers: Array.isArray(payload.speakers) ? payload.speakers : undefined,
    utterances,
    metadata: payload,
  };
}

function formatUtterances(utterances: Array<{ speaker?: string; timestamp?: string; text: string }>) {
  return utterances.map((item) => {
    const prefix = [item.timestamp, item.speaker].filter(Boolean).join(" ");
    return prefix ? `${prefix}: ${item.text}` : item.text;
  }).join("\n");
}

function joinAtForMeeting(meeting: NotetakerMeeting) {
  const start = new Date(meeting.startTime).getTime();
  const joinAt = Math.max(Date.now(), start - 2 * 60 * 1000);
  return new Date(joinAt).toISOString();
}

function isWithinLookahead(event: NotetakerCalendarEvent, now = Date.now()) {
  const start = new Date(event.startTime).getTime();
  return Number.isFinite(start) && start <= now + NOTETAKER_LOOKAHEAD_MS;
}

async function findMeetingForEvent(input: { brainId: string; botId?: string; calendarEventId?: string; externalEventId?: string }) {
  const meetings = await getRepository().listNotetakerMeetings({ brainId: input.brainId, limit: 500 });
  return meetings.find((meeting) =>
    (input.botId && meeting.recallBotId === input.botId) ||
    (input.calendarEventId && meeting.recallCalendarEventId === input.calendarEventId) ||
    (input.externalEventId && meeting.externalEventId === input.externalEventId)
  );
}

async function findBrainAndMeetingForEvent(input: {
  brainHint?: string;
  botId?: string;
  calendarEventId?: string;
  externalEventId?: string;
}) {
  const repository = getRepository();
  if (input.brainHint) {
    const meeting = await findMeetingForEvent({
      brainId: input.brainHint,
      botId: input.botId,
      calendarEventId: input.calendarEventId,
      externalEventId: input.externalEventId,
    });
    return { brainId: input.brainHint, meeting };
  }

  const matches = [];
  for (const brain of await repository.listBrains()) {
    const meeting = await findMeetingForEvent({
      brainId: brain.id,
      botId: input.botId,
      calendarEventId: input.calendarEventId,
      externalEventId: input.externalEventId,
    });
    if (meeting) matches.push({ brainId: brain.id, meeting });
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error("Recall webhook matched multiple Brains. Include brain_id in the webhook metadata.");
  }
  throw new Error("Recall webhook could not be mapped to a Brain. Include brain_id in the bot metadata or schedule the meeting first.");
}

export async function runNotetakerCalendarSync(options: { brainId?: string; client?: RecallClient } = {}) {
  const repository = getRepository();
  const client = getRecallClient(options);
  await ensureCalendarFromOutlookConnector({ brainId: options.brainId });
  const calendars = (await repository.listNotetakerCalendars({ brainId: options.brainId, status: "connected" }))
    .filter((calendar) => calendar.autoJoinEnabled && calendar.status !== "disabled");
  const summaries = [];

  for (const calendar of calendars) {
    let itemsFound = 0;
    let scheduled = 0;
    let skipped = 0;
    if (!calendar.recallCalendarId && !notetakerCalendarHasCredentials(calendar)) {
      summaries.push({
        calendarId: calendar.id,
        status: "skipped",
        itemsFound,
        scheduled,
        skipped,
        reason: "oauth_not_completed",
      });
      continue;
    }
    try {
      const events = (await client.listCalendarEvents(calendar)).filter((event) => isWithinLookahead(event));
      itemsFound = events.length;
      const existingMeetings = await repository.listNotetakerMeetings({ calendarId: calendar.id, limit: 500 });

      for (const event of events) {
        const decision = shouldJoinMeeting(event, {
          autoJoinEnabled: calendar.autoJoinEnabled,
          autoJoinMode: calendar.autoJoinMode,
        });
        const existing = existingMeetings.find((meeting) =>
          meeting.externalEventId === event.id ||
          (event.recallCalendarEventId && meeting.recallCalendarEventId === event.recallCalendarEventId)
        );
        const baseMeeting = {
          brainId: calendar.brainId,
          notetakerCalendarId: calendar.id,
          recallCalendarEventId: event.recallCalendarEventId ?? null,
          externalEventId: event.id,
          provider: calendar.provider,
          title: event.title,
          meetingUrl: decision.meetingUrl ?? event.meetingUrl ?? null,
          startTime: event.startTime,
          endTime: event.endTime,
          participants: event.participants ?? [],
          autoJoinDecision: decision.decision,
          autoJoinReason: decision.reason,
          metadata: {
            ...(event.metadata ?? {}),
            calendar_provider: calendar.provider,
            notetaker_synced_at: nowIso(),
          },
        };
        const meeting = existing
          ? await repository.updateNotetakerMeeting(existing.id, baseMeeting)
          : await repository.createNotetakerMeeting(baseMeeting);
        if (!meeting) continue;

        if (decision.decision !== "join") {
          skipped += 1;
          continue;
        }
        if (meeting.recallBotId || meeting.botStatus === "scheduled") {
          skipped += 1;
          continue;
        }
        const bot = await client.scheduleBot({ meeting, joinAt: joinAtForMeeting(meeting) });
        await repository.updateNotetakerMeeting(meeting.id, {
          recallBotId: bot.botId,
          botStatus: bot.status ?? "scheduled",
          metadata: { ...meeting.metadata, ...(bot.metadata ?? {}) },
        });
        scheduled += 1;
      }

      await repository.updateNotetakerCalendar(calendar.id, {
        lastSyncAt: nowIso(),
        lastError: null,
      });
      summaries.push({ calendarId: calendar.id, status: "completed", itemsFound, scheduled, skipped });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown notetaker calendar sync error";
      await repository.updateNotetakerCalendar(calendar.id, {
        status: "error",
        lastSyncAt: nowIso(),
        lastError: message,
      });
      summaries.push({ calendarId: calendar.id, status: "failed", itemsFound, scheduled, skipped, error: message });
    }
  }

  return summaries;
}

export async function scheduleNotetakerBotForMeeting(input: {
  brainId: string;
  meetingId: string;
  client?: RecallClient;
  manual?: boolean;
}) {
  const repository = getRepository();
  const meeting = (await repository.listNotetakerMeetings({ brainId: input.brainId, limit: 500 }))
    .find((item) => item.id === input.meetingId);
  if (!meeting) throw new Error(`Notetaker meeting not found: ${input.meetingId}`);
  if (!meeting.meetingUrl) throw new Error("Cannot schedule Notetaker bot without a meeting URL.");
  if (meeting.recallBotId && meeting.botStatus === "scheduled") return meeting;

  const client = getRecallClient({ client: input.client });
  const bot = await client.scheduleBot({ meeting, joinAt: joinAtForMeeting(meeting) });
  const updated = await repository.updateNotetakerMeeting(meeting.id, {
    recallBotId: bot.botId,
    botStatus: bot.status ?? "scheduled",
    autoJoinDecision: "join",
    autoJoinReason: input.manual ? "manual_schedule" : meeting.autoJoinReason ?? "scheduled",
    metadata: {
      ...meeting.metadata,
      ...(bot.metadata ?? {}),
      manually_scheduled_at: input.manual ? nowIso() : undefined,
    },
  });
  return updated ?? meeting;
}

export async function fetchNotetakerTranscriptForMeeting(input: {
  brainId: string;
  meetingId: string;
  client?: RecallClient;
}) {
  const repository = getRepository();
  const meeting = (await repository.listNotetakerMeetings({ brainId: input.brainId, limit: 500 }))
    .find((item) => item.id === input.meetingId);
  if (!meeting) throw new Error(`Notetaker meeting not found: ${input.meetingId}`);
  if (!meeting.recallBotId) throw new Error("This meeting has no Recall bot. Schedule a bot or wait for it to join the call first.");
  return ingestNotetakerTranscript({
    brainId: input.brainId,
    meeting,
    botId: meeting.recallBotId,
    client: input.client,
  });
}

export async function skipNotetakerMeeting(input: { brainId: string; meetingId: string; reason?: string }) {
  const repository = getRepository();
  const meeting = (await repository.listNotetakerMeetings({ brainId: input.brainId, limit: 500 }))
    .find((item) => item.id === input.meetingId);
  if (!meeting) throw new Error(`Notetaker meeting not found: ${input.meetingId}`);
  const updated = await repository.updateNotetakerMeeting(meeting.id, {
    autoJoinDecision: "skip",
    autoJoinReason: input.reason ?? "manual_skip",
    botStatus: meeting.recallBotId ? "canceled" : "not_scheduled",
    metadata: {
      ...meeting.metadata,
      manually_skipped_at: nowIso(),
    },
  });
  return updated ?? meeting;
}

export async function ingestNotetakerTranscript(input: {
  brainId: string;
  meeting?: NotetakerMeeting | null;
  botId?: string | null;
  transcriptId?: string | null;
  payload?: Record<string, unknown>;
  client?: RecallClient;
}) {
  const repository = getRepository();
  const client = getRecallClient({ client: input.client });
  const meeting = input.meeting ?? await findMeetingForEvent({ brainId: input.brainId, botId: input.botId ?? undefined });
  if (meeting?.sourceItemId) {
    const existing = await repository.getSourceItem(meeting.sourceItemId);
    if (existing) return { duplicate: true, sourceItem: existing, ingested: await processSourceItemIntoBrain({ brainId: input.brainId, sourceItemId: existing.id }) };
  }

  const transcript = await client.fetchTranscript({
    botId: input.botId ?? meeting?.recallBotId,
    transcriptId: input.transcriptId,
    payload: input.payload,
  });
  const normalizedTranscriptText = normalizeSourceContent(transcript.text);
  if (!normalizedTranscriptText) throw new Error("Transcript is empty.");

  const externalId = `recall:${input.transcriptId ?? transcript.transcriptId ?? input.botId ?? meeting?.recallBotId ?? contentHash(normalizedTranscriptText)}`;
  const hash = contentHash(normalizedTranscriptText);
  const metadata = mergeSourceTraceMetadata(
    buildSourceTraceMetadata({
      sourceKind: "transcript",
      sourceSystem: "recall",
      connectorType: "recall",
      externalId,
      externalUri: meeting?.meetingUrl ?? undefined,
      originalTitle: meeting?.title,
      occurredAt: meeting?.startTime,
    }),
    {
      domain_type: "meeting_transcript",
      content_hash: hash,
      source_content_hash: hash,
      recall_bot_id: input.botId ?? meeting?.recallBotId,
      recall_transcript_id: input.transcriptId ?? transcript.transcriptId,
      recall_calendar_event_id: meeting?.recallCalendarEventId,
      external_event_id: meeting?.externalEventId,
      notetaker_meeting_id: meeting?.id,
      participants: meeting?.participants ?? [],
      meeting_url: meeting?.meetingUrl,
      speakers: transcript.speakers,
      utterances: transcript.utterances,
      notetaker_ingested_at: nowIso(),
    },
  );
  const fingerprint = sourceFingerprint({
    title: meeting?.title ?? externalId,
    content: normalizedTranscriptText,
    externalUri: meeting?.meetingUrl ?? undefined,
    metadata,
  });
  const duplicate = (await repository.listSourceItems(input.brainId)).find((source) => {
    return sourceMatchesFingerprint(source, fingerprint);
  });
  if (duplicate) {
    if (meeting && meeting.sourceItemId !== duplicate.id) {
      await repository.updateNotetakerMeeting(meeting.id, {
        sourceItemId: duplicate.id,
        botStatus: "completed",
      });
    }
    return { duplicate: true, sourceItem: duplicate, ingested: await processSourceItemIntoBrain({ brainId: input.brainId, sourceItemId: duplicate.id }) };
  }

  const title = meeting
    ? `${meeting.title} - ${meeting.startTime.slice(0, 10)}`
    : `Recall transcript ${input.transcriptId ?? input.botId ?? nowIso()}`;
  const sourceItem = await repository.createSourceItem({
    brainId: input.brainId,
    type: "transcript",
    title,
    content: normalizedTranscriptText,
    externalUri: meeting?.meetingUrl ?? undefined,
    metadata: {
      ...metadata,
      dedupe_keys: buildDedupeKeys(fingerprint),
    },
  });
  const ingested = await processSourceItemIntoBrain({ brainId: input.brainId, sourceItemId: sourceItem.id });
  if (meeting) {
    await repository.updateNotetakerMeeting(meeting.id, {
      sourceItemId: sourceItem.id,
      botStatus: "completed",
      metadata: { ...meeting.metadata, transcriptMetadata: transcript.metadata ?? {} },
    });
  }
  return { duplicate: false, sourceItem, ingested };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const RECALL_STATUS_MAP: Record<string, NotetakerMeeting["botStatus"]> = {
  joining_call: "joining",
  in_waiting_room: "joining",
  in_call_not_recording: "in_call",
  in_call_recording: "in_call",
  call_ended: "in_call",
  recording_done: "completed",
  done: "completed",
  analysis_done: "completed",
  fatal: "failed",
  failed: "failed",
  bot_kicked_from_call: "canceled",
  canceled: "canceled",
  ready: "scheduled",
  scheduled: "scheduled",
  joining: "joining",
  in_call: "in_call",
  completed: "completed",
};

function mapRecallStatus(code: string | undefined): NotetakerMeeting["botStatus"] | undefined {
  if (!code) return undefined;
  return RECALL_STATUS_MAP[code.toLowerCase()];
}

type ExtractedRecallPayload = {
  eventType: string;
  providerEventId?: string;
  botId?: string;
  transcriptId?: string;
  recordingId?: string;
  calendarEventId?: string;
  externalEventId?: string;
  status?: string;
  inlineTranscript?: string;
  transcriptDownloadUrl?: string;
  brainHint?: string;
};

function extractRecallWebhook(payload: Record<string, unknown>): ExtractedRecallPayload {
  const data = asRecord(payload.data) ?? {};
  const innerData = asRecord(data.data) ?? {};
  const bot = asRecord(payload.bot) ?? asRecord(data.bot);
  const transcript = asRecord(payload.transcript) ?? asRecord(data.transcript);
  const recording = asRecord(payload.recording) ?? asRecord(data.recording);
  const status = asRecord(payload.status) ?? asRecord(data.status) ?? innerData;

  const eventType =
    stringValue(payload.event) ??
    stringValue(payload.event_type) ??
    stringValue(payload.type) ??
    "recall.webhook";

  const botMetadata = asRecord(bot?.metadata) ?? asRecord(payload.metadata);

  return {
    eventType,
    providerEventId:
      stringValue(payload.eventId) ??
      stringValue(payload.event_id) ??
      stringValue(payload.id) ??
      stringValue(data.event_id) ??
      stringValue(transcript?.id) ??
      stringValue(payload.transcript_id) ??
      stringValue(payload.bot_id),
    botId:
      stringValue(payload.botId) ??
      stringValue(payload.bot_id) ??
      stringValue(bot?.id) ??
      stringValue(botMetadata?.bot_id),
    transcriptId:
      stringValue(payload.transcriptId) ??
      stringValue(payload.transcript_id) ??
      stringValue(transcript?.id),
    recordingId:
      stringValue(payload.recording_id) ??
      stringValue(recording?.id),
    calendarEventId:
      stringValue(payload.calendar_event_id) ??
      stringValue(payload.recall_calendar_event_id) ??
      stringValue(asRecord(data.calendar_event)?.id),
    externalEventId:
      stringValue(payload.external_event_id) ??
      stringValue(botMetadata?.external_event_id),
    status: stringValue(status?.code) ?? stringValue(payload.status),
    inlineTranscript:
      stringValue(payload.transcript) ??
      stringValue(payload.text) ??
      stringValue(payload.content),
    transcriptDownloadUrl:
      stringValue(asRecord(transcript?.data)?.download_url) ??
      stringValue(asRecord(data.data)?.download_url) ??
      stringValue(asRecord(payload.data)?.download_url),
    brainHint:
      stringValue(payload.brainId) ??
      stringValue(payload.brain_id) ??
      stringValue(botMetadata?.brain_id),
  };
}

export async function handleNotetakerWebhook(payload: Record<string, unknown>, options: { client?: RecallClient } = {}) {
  const repository = getRepository();
  const extracted = extractRecallWebhook(payload);
  const resolved = await findBrainAndMeetingForEvent({
    brainHint: extracted.brainHint,
    botId: extracted.botId,
    calendarEventId: extracted.calendarEventId,
    externalEventId: extracted.externalEventId,
  });
  const brainId = resolved.brainId;

  const existingEvent = extracted.providerEventId
    ? (await repository.listNotetakerEvents({ brainId, providerEventId: extracted.providerEventId, limit: 1 }))[0]
    : undefined;
  if (existingEvent?.processedAt) return { duplicate: true, event: existingEvent };

  const meeting = resolved.meeting;
  const event = existingEvent ?? await repository.createNotetakerEvent({
    brainId,
    notetakerMeetingId: meeting?.id ?? null,
    providerEventId: extracted.providerEventId,
    eventType: extracted.eventType,
    payload,
  });

  let result: unknown = null;
  if (meeting && (extracted.eventType.includes("bot") || extracted.eventType.includes("status"))) {
    const mapped = mapRecallStatus(extracted.status);
    if (mapped) {
      await repository.updateNotetakerMeeting(meeting.id, { botStatus: mapped });
    }
  }

  const isTranscriptEvent =
    extracted.eventType.includes("transcript") ||
    extracted.eventType.includes("recording.done") ||
    Boolean(extracted.inlineTranscript) ||
    Boolean(extracted.transcriptDownloadUrl);

  if (isTranscriptEvent) {
    const ingestionPayload: Record<string, unknown> = { ...payload };
    if (extracted.inlineTranscript) ingestionPayload.transcript = extracted.inlineTranscript;
    if (extracted.transcriptId) ingestionPayload.transcript_id = extracted.transcriptId;
    result = await ingestNotetakerTranscript({
      brainId,
      meeting,
      botId: extracted.botId,
      transcriptId: extracted.transcriptId,
      payload: ingestionPayload,
      client: options.client,
    });
  }

  const processed = await repository.updateNotetakerEvent(event.id, {
    notetakerMeetingId: meeting?.id ?? event.notetakerMeetingId ?? null,
    processedAt: nowIso(),
  });
  return { duplicate: false, event: processed ?? event, result };
}
