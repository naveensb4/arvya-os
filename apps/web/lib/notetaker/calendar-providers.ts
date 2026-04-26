import { getRepository, type NotetakerCalendar, type NotetakerProvider } from "@/lib/db/repository";
import type { NotetakerCalendarEvent } from "./runtime";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MICROSOFT_AUTH_BASE = "https://login.microsoftonline.com";
const MICROSOFT_GRAPH = "https://graph.microsoft.com/v1.0";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
export const OUTLOOK_CALENDAR_SCOPE = "offline_access Calendars.Read";

type OAuthCredentials = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  scope?: string;
  token_type?: string;
};

type TokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type OAuthState = {
  brainId: string;
  calendarId: string;
  provider: NotetakerProvider;
};

function env(name: string) {
  return process.env[name]?.trim() || undefined;
}

function extractMeetingUrl(input: { title?: string; description?: string; location?: string; meetingUrl?: string }) {
  if (input.meetingUrl?.trim()) return input.meetingUrl.trim();
  const haystack = [input.location, input.description, input.title].filter(Boolean).join("\n");
  const match = haystack.match(/https?:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|[\w.-]+)\/[^\s<>)"]+/i);
  return match?.[0];
}

function publicUrl(path: string) {
  const base = env("ARVYA_PUBLIC_BASE_URL")?.replace(/\/$/, "");
  return base ? `${base}${path}` : undefined;
}

function googleOAuthEnv() {
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  const redirectUri =
    env("GOOGLE_CALENDAR_REDIRECT_URI") ??
    publicUrl("/api/notetaker/google-calendar/auth/callback") ??
    env("GOOGLE_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google Calendar OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALENDAR_REDIRECT_URI or ARVYA_PUBLIC_BASE_URL.");
  }
  return { clientId, clientSecret, redirectUri };
}

function microsoftTenant() {
  return env("MICROSOFT_TENANT_ID") ?? "common";
}

function outlookOAuthEnv() {
  const clientId = env("MICROSOFT_CLIENT_ID");
  const clientSecret = env("MICROSOFT_CLIENT_SECRET");
  const redirectUri =
    env("MICROSOFT_CALENDAR_REDIRECT_URI") ??
    publicUrl("/api/notetaker/outlook-calendar/auth/callback") ??
    env("MICROSOFT_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Outlook Calendar OAuth is not configured. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_CALENDAR_REDIRECT_URI or ARVYA_PUBLIC_BASE_URL.");
  }
  return { clientId, clientSecret, redirectUri };
}

function encodeOAuthState(input: OAuthState) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

export function decodeNotetakerOAuthState(value: string): OAuthState {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<OAuthState>;
  if (!parsed.brainId || !parsed.calendarId || !parsed.provider) {
    throw new Error("Invalid Notetaker calendar OAuth state.");
  }
  return {
    brainId: parsed.brainId,
    calendarId: parsed.calendarId,
    provider: parsed.provider,
  };
}

function isExpired(credentials: OAuthCredentials) {
  if (!credentials.expires_at) return false;
  return Date.now() >= new Date(credentials.expires_at).getTime() - 60_000;
}

function tokenResponseToCredentials(response: TokenResponse, existing?: OAuthCredentials): OAuthCredentials {
  return {
    ...(existing ?? {}),
    access_token: response.access_token,
    refresh_token: response.refresh_token ?? existing?.refresh_token,
    expires_at: response.expires_in
      ? new Date(Date.now() + response.expires_in * 1000).toISOString()
      : existing?.expires_at,
    scope: response.scope ?? existing?.scope,
    token_type: response.token_type ?? existing?.token_type,
  };
}

async function postToken(url: string, body: URLSearchParams, providerName: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json() as TokenResponse & { error?: string; error_description?: string };
  if (!response.ok) throw new Error(json.error_description ?? json.error ?? `${providerName} OAuth token request failed.`);
  return json;
}

function credentialsFromCalendar(calendar: NotetakerCalendar): OAuthCredentials | null {
  const credentials = calendar.config.credentials;
  return credentials && typeof credentials === "object" ? credentials as OAuthCredentials : null;
}

async function writeCalendarCredentials(calendar: NotetakerCalendar, credentials: OAuthCredentials) {
  await getRepository().updateNotetakerCalendar(calendar.id, {
    config: {
      ...calendar.config,
      credentials,
      connected_at: new Date().toISOString(),
    },
    status: "connected",
    lastError: null,
  });
}

export function buildGoogleCalendarAuthUrl(input: { brainId: string; calendarId: string }) {
  const { clientId, redirectUri } = googleOAuthEnv();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", encodeOAuthState({ ...input, provider: "google_calendar" }));
  return url;
}

export function buildOutlookCalendarAuthUrl(input: { brainId: string; calendarId: string }) {
  const { clientId, redirectUri } = outlookOAuthEnv();
  const url = new URL(`${MICROSOFT_AUTH_BASE}/${microsoftTenant()}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OUTLOOK_CALENDAR_SCOPE);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("state", encodeOAuthState({ ...input, provider: "outlook_calendar" }));
  return url;
}

export async function exchangeGoogleCalendarCode(code: string, existing?: OAuthCredentials) {
  const { clientId, clientSecret, redirectUri } = googleOAuthEnv();
  const response = await postToken(GOOGLE_TOKEN_URL, new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  }), "Google Calendar");
  return tokenResponseToCredentials(response, existing);
}

export async function exchangeOutlookCalendarCode(code: string, existing?: OAuthCredentials) {
  const { clientId, clientSecret, redirectUri } = outlookOAuthEnv();
  const response = await postToken(`${MICROSOFT_AUTH_BASE}/${microsoftTenant()}/oauth2/v2.0/token`, new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: OUTLOOK_CALENDAR_SCOPE,
  }), "Outlook Calendar");
  return tokenResponseToCredentials(response, existing);
}

export async function connectNotetakerCalendar(input: {
  calendar: NotetakerCalendar;
  credentials: OAuthCredentials;
  externalCalendarId?: string | null;
}) {
  await getRepository().updateNotetakerCalendar(input.calendar.id, {
    externalCalendarId: input.externalCalendarId ?? input.calendar.externalCalendarId ?? "primary",
    config: {
      ...input.calendar.config,
      credentials: input.credentials,
      connected_at: new Date().toISOString(),
    },
    status: "connected",
    autoJoinEnabled: input.calendar.autoJoinEnabled,
    autoJoinMode: input.calendar.autoJoinMode || "all_calls",
    lastError: null,
  });
}

async function getGoogleAccessToken(calendar: NotetakerCalendar) {
  let credentials = credentialsFromCalendar(calendar);
  if (!credentials?.access_token) throw new Error("Google Calendar is not connected. Connect OAuth before syncing Notetaker.");
  if (isExpired(credentials)) {
    if (!credentials.refresh_token) throw new Error("Google Calendar refresh token is missing. Reconnect Google Calendar.");
    const { clientId, clientSecret } = googleOAuthEnv();
    const response = await postToken(GOOGLE_TOKEN_URL, new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refresh_token,
      grant_type: "refresh_token",
    }), "Google Calendar");
    credentials = tokenResponseToCredentials(response, credentials);
    await writeCalendarCredentials(calendar, credentials);
  }
  if (!credentials.access_token) throw new Error("Google Calendar access token is missing.");
  return credentials.access_token;
}

async function getOutlookAccessToken(calendar: NotetakerCalendar) {
  let credentials = credentialsFromCalendar(calendar);
  if (!credentials?.access_token) throw new Error("Outlook Calendar is not connected. Connect OAuth before syncing Notetaker.");
  if (isExpired(credentials)) {
    if (!credentials.refresh_token) throw new Error("Outlook Calendar refresh token is missing. Reconnect Outlook Calendar.");
    const { clientId, clientSecret } = outlookOAuthEnv();
    const response = await postToken(`${MICROSOFT_AUTH_BASE}/${microsoftTenant()}/oauth2/v2.0/token`, new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refresh_token,
      grant_type: "refresh_token",
      scope: OUTLOOK_CALENDAR_SCOPE,
    }), "Outlook Calendar");
    credentials = tokenResponseToCredentials(response, credentials);
    await writeCalendarCredentials(calendar, credentials);
  }
  if (!credentials.access_token) throw new Error("Outlook Calendar access token is missing.");
  return credentials.access_token;
}

export async function listProviderCalendarEvents(calendar: NotetakerCalendar): Promise<NotetakerCalendarEvent[]> {
  if (calendar.provider === "google_calendar") return listGoogleCalendarEvents(calendar);
  return listOutlookCalendarEvents(calendar);
}

async function listGoogleCalendarEvents(calendar: NotetakerCalendar): Promise<NotetakerCalendarEvent[]> {
  const calendarId = calendar.externalCalendarId || "primary";
  const url = new URL(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", new Date().toISOString());
  url.searchParams.set("timeMax", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "100");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${await getGoogleAccessToken(calendar)}` },
  });
  const json = await response.json() as { items?: GoogleCalendarEvent[]; error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? "Google Calendar event listing failed.");
  return (json.items ?? []).flatMap(normalizeGoogleEvent);
}

type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  visibility?: string;
  hangoutLink?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
  conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }> };
};

function normalizeGoogleEvent(event: GoogleCalendarEvent): NotetakerCalendarEvent[] {
  const id = event.id;
  const start = event.start?.dateTime ?? event.start?.date;
  const end = event.end?.dateTime ?? event.end?.date;
  if (!id || !start || !end) return [];
  const meetingUrl = extractMeetingUrl({
    title: event.summary,
    description: event.description,
    location: event.location,
    meetingUrl: event.hangoutLink ?? event.conferenceData?.entryPoints?.find((entry) => entry.uri)?.uri,
  });
  return [{
    id,
    title: event.summary ?? "Untitled meeting",
    description: event.description,
    meetingUrl,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    participants: event.attendees ?? [],
    isCanceled: event.status === "cancelled",
    isAllDay: Boolean(event.start?.date && !event.start.dateTime),
    isPrivate: event.visibility === "private",
    metadata: {
      provider_raw_event: event,
      provider_html_link: event.htmlLink,
      calendar_source: "google_calendar_api",
    },
  }];
}

async function listOutlookCalendarEvents(calendar: NotetakerCalendar): Promise<NotetakerCalendarEvent[]> {
  const calendarSegment = calendar.externalCalendarId
    ? `/me/calendars/${encodeURIComponent(calendar.externalCalendarId)}/events`
    : "/me/events";
  const url = new URL(`${MICROSOFT_GRAPH}${calendarSegment}`);
  url.searchParams.set("$top", "100");
  url.searchParams.set("$select", "id,subject,bodyPreview,body,location,isCancelled,isAllDay,sensitivity,start,end,attendees,onlineMeeting,onlineMeetingUrl,webLink");
  url.searchParams.set("$filter", `start/dateTime ge '${new Date().toISOString()}' and start/dateTime le '${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()}'`);
  url.searchParams.set("$orderby", "start/dateTime asc");
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${await getOutlookAccessToken(calendar)}`,
      prefer: "outlook.timezone=\"UTC\"",
    },
  });
  const json = await response.json() as { value?: OutlookCalendarEvent[]; error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? "Outlook Calendar event listing failed.");
  return (json.value ?? []).flatMap(normalizeOutlookEvent);
}

type OutlookCalendarEvent = {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string };
  location?: { displayName?: string };
  isCancelled?: boolean;
  isAllDay?: boolean;
  sensitivity?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  attendees?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  onlineMeeting?: { joinUrl?: string };
  onlineMeetingUrl?: string;
  webLink?: string;
};

function normalizeOutlookEvent(event: OutlookCalendarEvent): NotetakerCalendarEvent[] {
  const id = event.id;
  const start = event.start?.dateTime;
  const end = event.end?.dateTime;
  if (!id || !start || !end) return [];
  const description = event.bodyPreview ?? event.body?.content;
  const meetingUrl = extractMeetingUrl({
    title: event.subject,
    description,
    location: event.location?.displayName,
    meetingUrl: event.onlineMeeting?.joinUrl ?? event.onlineMeetingUrl,
  });
  return [{
    id,
    title: event.subject ?? "Untitled meeting",
    description,
    meetingUrl,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    participants: event.attendees ?? [],
    isCanceled: event.isCancelled,
    isAllDay: event.isAllDay,
    isPrivate: event.sensitivity === "private",
    metadata: {
      provider_raw_event: event,
      provider_web_link: event.webLink,
      calendar_source: "microsoft_graph_calendar_api",
    },
  }];
}
