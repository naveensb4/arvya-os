import { createHash, timingSafeEqual } from "node:crypto";
import { getRepository, type NotetakerAutoJoinMode, type NotetakerCalendar, type NotetakerMeeting } from "@/lib/db/repository";
import { processSourceItemIntoBrain } from "@/lib/workflows/source-ingestion";
import { listProviderCalendarEvents } from "./calendar-providers";

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
  return createHash("sha256").update(content).digest("hex");
}

function recallBaseUrl() {
  return process.env.RECALL_BASE_URL?.replace(/\/$/, "") || DEFAULT_RECALL_BASE_URL;
}

function hasRecallApiKey() {
  return Boolean(process.env.RECALL_API_KEY?.trim());
}

export function verifyRecallWebhookSignature(input: { body: string; signature?: string | null }) {
  const secret = process.env.RECALL_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  if (!input.signature) return false;

  const expectedHex = createHash("sha256").update(`${secret}.${input.body}`).digest("hex");
  const candidates = [
    input.signature,
    input.signature.replace(/^sha256=/, ""),
  ];
  return candidates.some((candidate) => {
    const expected = Buffer.from(expectedHex);
    const received = Buffer.from(candidate);
    return expected.length === received.length && timingSafeEqual(expected, received);
  });
}

export function extractMeetingUrl(input: { title?: string; description?: string; location?: string; meetingUrl?: string }) {
  const explicit = stringValue(input.meetingUrl);
  if (explicit) return explicit;
  const haystack = [input.location, input.description, input.title].filter(Boolean).join("\n");
  const match = haystack.match(/https?:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|[\w.-]+)\/[^\s<>)"]+/i);
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
    return titleAndDescription.includes("arvya")
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
    const json = await response.json().catch(() => ({})) as T & { detail?: string; error?: string };
    if (!response.ok) throw new Error(json.detail ?? json.error ?? `Recall request failed: ${path}`);
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
    const json = await this.request<{ id?: string; bot_id?: string; status?: string }>("/bot", {
      method: "POST",
      body: JSON.stringify({
        meeting_url: input.meeting.meetingUrl,
        bot_name: "Arvya Notetaker",
        join_at: input.joinAt,
        metadata: {
          brain_id: input.meeting.brainId,
          notetaker_meeting_id: input.meeting.id,
          external_event_id: input.meeting.externalEventId,
        },
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
    const id = input.transcriptId ?? input.botId;
    if (!id) throw new Error("Recall transcript fetch requires a botId or transcriptId.");
    const json = await this.request<Record<string, unknown>>(`/bot/${encodeURIComponent(id)}/transcript`);
    const normalized = transcriptFromPayload(json);
    if (!normalized.text) throw new Error("Recall transcript response did not include transcript text.");
    return normalized;
  }
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

export async function runNotetakerCalendarSync(options: { client?: RecallClient } = {}) {
  const repository = getRepository();
  const client = getRecallClient(options);
  const calendars = (await repository.listNotetakerCalendars({ status: "connected" }))
    .filter((calendar) => calendar.autoJoinEnabled && calendar.status !== "disabled");
  const summaries = [];

  for (const calendar of calendars) {
    let itemsFound = 0;
    let scheduled = 0;
    let skipped = 0;
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
  if (!transcript.text.trim()) throw new Error("Transcript is empty.");

  const externalId = `recall:${input.transcriptId ?? transcript.transcriptId ?? input.botId ?? meeting?.recallBotId ?? contentHash(transcript.text)}`;
  const hash = contentHash(transcript.text);
  const duplicate = (await repository.listSourceItems(input.brainId)).find((source) => {
    const metadata = source.metadata ?? {};
    return metadata.external_id === externalId || metadata.content_hash === hash;
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
    content: transcript.text,
    externalUri: meeting?.meetingUrl ?? undefined,
    metadata: {
      source_kind: "transcript",
      domain_type: "meeting_transcript",
      connector_type: "recall",
      external_id: externalId,
      content_hash: hash,
      occurred_at: meeting?.startTime,
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

export async function handleNotetakerWebhook(payload: Record<string, unknown>, options: { client?: RecallClient } = {}) {
  const repository = getRepository();
  const brainId = stringValue(payload.brainId) ?? stringValue(payload.brain_id) ?? (await repository.listBrains())[0]?.id;
  if (!brainId) throw new Error("No Brain exists for Recall webhook ingestion.");

  const eventType = stringValue(payload.event) ?? stringValue(payload.event_type) ?? stringValue(payload.type) ?? "recall.webhook";
  const providerEventId =
    stringValue(payload.eventId) ??
    stringValue(payload.event_id) ??
    stringValue(payload.id) ??
    stringValue(payload.transcript_id) ??
    stringValue(payload.bot_id);
  const existingEvent = providerEventId
    ? (await repository.listNotetakerEvents({ brainId, providerEventId, limit: 1 }))[0]
    : undefined;
  if (existingEvent?.processedAt) return { duplicate: true, event: existingEvent };

  const botId = stringValue(payload.botId) ?? stringValue(payload.bot_id) ?? stringValue((payload.bot as Record<string, unknown> | undefined)?.id);
  const transcriptId = stringValue(payload.transcriptId) ?? stringValue(payload.transcript_id);
  const calendarEventId = stringValue(payload.calendar_event_id) ?? stringValue(payload.recall_calendar_event_id);
  const externalEventId = stringValue(payload.external_event_id);
  const meeting = await findMeetingForEvent({ brainId, botId, calendarEventId, externalEventId });
  const event = existingEvent ?? await repository.createNotetakerEvent({
    brainId,
    notetakerMeetingId: meeting?.id ?? null,
    providerEventId,
    eventType,
    payload,
  });

  let result: unknown = null;
  if (meeting && eventType.includes("bot")) {
    const status = stringValue(payload.status);
    if (status === "joining" || status === "in_call" || status === "failed" || status === "canceled" || status === "completed") {
      await repository.updateNotetakerMeeting(meeting.id, { botStatus: status });
    }
  }
  if (
    eventType.includes("transcript") ||
    eventType.includes("recording.done") ||
    stringValue(payload.transcript) ||
    stringValue(payload.text)
  ) {
    result = await ingestNotetakerTranscript({
      brainId,
      meeting,
      botId,
      transcriptId,
      payload,
      client: options.client,
    });
  }

  const processed = await repository.updateNotetakerEvent(event.id, {
    notetakerMeetingId: meeting?.id ?? event.notetakerMeetingId ?? null,
    processedAt: nowIso(),
  });
  return { duplicate: false, event: processed ?? event, result };
}
