import type Anthropic from "@anthropic-ai/sdk";
import { getRepository, type NotetakerCalendar } from "@/lib/db/repository";
import { getAiClient } from "@/lib/ai/provider";
import { retrieveRelevantContext } from "@/lib/retrieval";
import {
  listGoogleCalendarEventsForRange,
  listOutlookCalendarEventsForRange,
} from "@/lib/notetaker/calendar-providers";
import type { NotetakerCalendarEvent } from "@/lib/notetaker/runtime";

export type ToolResult = {
  result: unknown;
  summary: string;
};

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "search_brain_memory",
    description:
      "Search the brain's memory for information from ingested emails, transcripts, documents, and notes. Use this for questions about people, deals, conversations, action items, or anything the user has previously discussed or received.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query — what you want to find in the brain's memory",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_calendar_events",
    description:
      "Fetch calendar events for a date range. Use this for questions about meetings, schedule, availability, or calendar. Supports Google Calendar and Outlook.",
    input_schema: {
      type: "object" as const,
      properties: {
        from: {
          type: "string",
          description: "Start of the date range in ISO 8601 format (e.g. 2026-05-10T00:00:00Z)",
        },
        to: {
          type: "string",
          description: "End of the date range in ISO 8601 format (e.g. 2026-05-10T23:59:59Z)",
        },
      },
      required: ["from", "to"],
    },
  },
];

export function toolStatusMessage(toolName: string): string {
  switch (toolName) {
    case "search_brain_memory":
      return ":mag: Searching memory...";
    case "get_calendar_events":
      return ":calendar: Checking calendar...";
    default:
      return `:gear: Running ${toolName}...`;
  }
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  brainId: string,
): Promise<ToolResult> {
  switch (toolName) {
    case "search_brain_memory":
      return executeSearchMemory(input, brainId);
    case "get_calendar_events":
      return executeGetCalendarEvents(input, brainId);
    default:
      return { result: { error: `Unknown tool: ${toolName}` }, summary: `Unknown tool: ${toolName}` };
  }
}

async function executeSearchMemory(
  input: Record<string, unknown>,
  brainId: string,
): Promise<ToolResult> {
  const query = String(input.query ?? "");
  const repository = getRepository();
  const ai = getAiClient();

  const results = await retrieveRelevantContext({
    brainId,
    question: query,
    repository,
    ai,
    limit: 12,
  });

  if (results.length === 0) {
    return {
      result: { matches: [], message: "No relevant memory found for this query." },
      summary: ":mag: No matches found in memory",
    };
  }

  const matches = results.map((r) => {
    if (r.memoryObject) {
      return {
        type: r.memoryObject.objectType,
        name: r.memoryObject.name,
        description: r.memoryObject.description,
        sourceQuote: r.memoryObject.sourceQuote,
        sourceTitle: r.memoryObject.sourceItemId ? undefined : undefined,
        score: r.score,
      };
    }
    if (r.openLoop) {
      return {
        type: "open_loop",
        title: r.openLoop.title,
        description: r.openLoop.description,
        suggestedAction: r.openLoop.suggestedAction,
        priority: r.openLoop.priority,
        score: r.score,
      };
    }
    if (r.sourceItem) {
      return {
        type: "source",
        title: r.sourceItem.title,
        content: r.sourceItem.content?.slice(0, 500),
        sourceType: r.sourceItem.type,
        score: r.score,
      };
    }
    return { type: "unknown", score: r.score };
  });

  return {
    result: { matches },
    summary: `:mag: Found ${matches.length} result${matches.length === 1 ? "" : "s"} in memory`,
  };
}

async function executeGetCalendarEvents(
  input: Record<string, unknown>,
  brainId: string,
): Promise<ToolResult> {
  const from = String(input.from ?? "");
  const to = String(input.to ?? "");
  console.log(`[tools] get_calendar_events called with from=${from} to=${to} brainId=${brainId}`);

  if (!from || !to) {
    return {
      result: { error: "Both 'from' and 'to' date parameters are required." },
      summary: ":warning: Missing date range",
    };
  }

  const repository = getRepository();
  const allCalendars = await repository.listNotetakerCalendars({ brainId });
  const calendars = allCalendars.filter((c) => {
    const creds = c.config?.credentials as Record<string, unknown> | undefined;
    return creds && (creds.access_token || creds.refresh_token);
  });

  if (calendars.length === 0) {
    return {
      result: {
        error: "No calendar is connected to this brain. Connect Google Calendar or Outlook in the Arvya dashboard.",
      },
      summary: ":warning: No calendar connected",
    };
  }

  const allEvents: NotetakerCalendarEvent[] = [];
  const errors: string[] = [];

  for (const calendar of calendars) {
    try {
      const events = await fetchCalendarEventsForRange(calendar, from, to);
      allEvents.push(...events);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Calendar fetch failed";
      console.error(`[tools] calendar fetch error for ${calendar.provider}:`, msg);
      errors.push(`${calendar.provider}: ${msg}`);
    }
  }

  const sorted = allEvents
    .filter((e) => !e.isCanceled)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const events = sorted.map((e) => ({
    title: e.title,
    startTime: e.startTime,
    endTime: e.endTime,
    attendees: formatAttendees(e.participants),
    location: e.location,
    meetingUrl: e.meetingUrl,
    eventType: e.eventType,
    isAllDay: e.isAllDay,
  }));

  if (events.length === 0 && errors.length > 0) {
    return {
      result: { events: [], errors },
      summary: `:warning: Calendar error: ${errors[0]}`,
    };
  }

  return {
    result: { events, ...(errors.length > 0 ? { errors } : {}) },
    summary: `:calendar: Found ${events.length} event${events.length === 1 ? "" : "s"}`,
  };
}

async function fetchCalendarEventsForRange(
  calendar: NotetakerCalendar,
  from: string,
  to: string,
): Promise<NotetakerCalendarEvent[]> {
  if (calendar.provider === "google_calendar") {
    return listGoogleCalendarEventsForRange(calendar, from, to);
  }
  return listOutlookCalendarEventsForRange(calendar, from, to);
}

function formatAttendees(participants: unknown[] | undefined): string[] {
  if (!participants) return [];
  return participants
    .map((p) => {
      if (typeof p === "object" && p !== null) {
        const obj = p as Record<string, unknown>;
        const email = obj.email ?? (obj.emailAddress as Record<string, unknown>)?.address;
        const name = obj.displayName ?? (obj.emailAddress as Record<string, unknown>)?.name;
        if (name && email) return `${name} <${email}>`;
        return String(name ?? email ?? "");
      }
      return String(p);
    })
    .filter(Boolean);
}
