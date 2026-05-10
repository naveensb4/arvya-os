import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/repository", () => ({
  getRepository: vi.fn(),
}));

vi.mock("@/lib/ai/provider", () => ({
  getAiClient: vi.fn().mockReturnValue({
    available: false,
    embeddingModel: null,
    embed: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock("@/lib/retrieval", () => ({
  retrieveRelevantContext: vi.fn(),
}));

vi.mock("@/lib/notetaker/calendar-providers", () => ({
  listGoogleCalendarEventsForRange: vi.fn(),
  listOutlookCalendarEventsForRange: vi.fn(),
}));

import { executeTool, toolStatusMessage } from "../tools";
import { getRepository } from "@/lib/db/repository";
import { retrieveRelevantContext } from "@/lib/retrieval";
import { listGoogleCalendarEventsForRange } from "@/lib/notetaker/calendar-providers";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toolStatusMessage", () => {
  it("returns memory icon for search_brain_memory", () => {
    expect(toolStatusMessage("search_brain_memory")).toContain("Searching");
  });

  it("returns calendar icon for get_calendar_events", () => {
    expect(toolStatusMessage("get_calendar_events")).toContain("calendar");
  });
});

describe("executeTool — search_brain_memory", () => {
  it("returns matches from retrieval", async () => {
    (retrieveRelevantContext as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        memoryObject: {
          id: "mo-1",
          objectType: "person",
          name: "John Doe",
          description: "CEO at Acme",
          sourceQuote: "Met at conference",
        },
        score: 0.8,
        reason: "lexical",
      },
    ]);

    const result = await executeTool("search_brain_memory", { query: "John" }, "brain-1");

    expect((result.result as any).matches).toHaveLength(1);
    expect((result.result as any).matches[0].name).toBe("John Doe");
    expect(result.summary).toContain("1 result");
  });

  it("returns empty when no matches", async () => {
    (retrieveRelevantContext as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await executeTool("search_brain_memory", { query: "xyz" }, "brain-1");

    expect((result.result as any).matches).toHaveLength(0);
    expect(result.summary).toContain("No matches");
  });
});

describe("executeTool — get_calendar_events", () => {
  it("returns error when no calendars connected", async () => {
    const repo = {
      listNotetakerCalendars: vi.fn().mockResolvedValue([]),
    };
    (getRepository as ReturnType<typeof vi.fn>).mockReturnValue(repo);

    const result = await executeTool(
      "get_calendar_events",
      { from: "2026-05-10T00:00:00Z", to: "2026-05-10T23:59:59Z" },
      "brain-1",
    );

    expect((result.result as any).error).toContain("No calendar");
  });

  it("returns events from connected Google calendar", async () => {
    const repo = {
      listNotetakerCalendars: vi.fn().mockResolvedValue([
        { id: "cal-1", provider: "google_calendar", status: "connected", config: { credentials: { access_token: "tok", refresh_token: "ref" } } },
      ]),
    };
    (getRepository as ReturnType<typeof vi.fn>).mockReturnValue(repo);
    (listGoogleCalendarEventsForRange as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "ev-1",
        title: "Team standup",
        startTime: "2026-05-10T09:00:00Z",
        endTime: "2026-05-10T09:30:00Z",
        participants: [{ email: "alice@acme.com", displayName: "Alice" }],
        isCanceled: false,
        eventType: "virtual",
      },
    ]);

    const result = await executeTool(
      "get_calendar_events",
      { from: "2026-05-10T00:00:00Z", to: "2026-05-10T23:59:59Z" },
      "brain-1",
    );

    expect((result.result as any).events).toHaveLength(1);
    expect((result.result as any).events[0].title).toBe("Team standup");
    expect(result.summary).toContain("1 event");
  });

  it("filters canceled events", async () => {
    const repo = {
      listNotetakerCalendars: vi.fn().mockResolvedValue([
        { id: "cal-1", provider: "google_calendar", status: "connected", config: { credentials: { access_token: "tok", refresh_token: "ref" } } },
      ]),
    };
    (getRepository as ReturnType<typeof vi.fn>).mockReturnValue(repo);
    (listGoogleCalendarEventsForRange as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "ev-1",
        title: "Canceled meeting",
        startTime: "2026-05-10T09:00:00Z",
        endTime: "2026-05-10T09:30:00Z",
        isCanceled: true,
      },
    ]);

    const result = await executeTool(
      "get_calendar_events",
      { from: "2026-05-10T00:00:00Z", to: "2026-05-10T23:59:59Z" },
      "brain-1",
    );

    expect((result.result as any).events).toHaveLength(0);
  });
});

describe("executeTool — unknown tool", () => {
  it("returns error for unknown tool name", async () => {
    const result = await executeTool("nonexistent_tool", {}, "brain-1");

    expect((result.result as any).error).toContain("Unknown tool");
  });
});
