import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/repository", () => ({
  getRepository: vi.fn(),
}));

vi.mock("../agent", () => ({
  runAgent: vi.fn(),
}));

import { handleSlackMention } from "../handler";
import { getRepository } from "@/lib/db/repository";
import { runAgent } from "../agent";

const BRAIN_ID = "brain-test";
const BOT_TOKEN = "xoxb-test";
const TEAM_ID = "T123";

function makeSlackPayload(text: string, eventId = `evt-${Date.now()}-${Math.random()}`) {
  return {
    type: "event_callback",
    event_id: eventId,
    event: {
      type: "app_mention",
      text,
      user: "U123",
      channel: "C123",
      ts: "1234567890.000001",
      team: TEAM_ID,
    },
    team_id: TEAM_ID,
  };
}

function setupMockRepository() {
  const mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify({ ok: true, ts: "msg-ts-1" }), { status: 200 }),
  );

  const repo = {
    listConnectorConfigs: vi.fn().mockResolvedValue([
      {
        connectorType: "slack",
        status: "connected",
        brainId: BRAIN_ID,
        config: { teamId: TEAM_ID },
        credentials: { botToken: BOT_TOKEN },
      },
    ]),
    getBrain: vi.fn().mockResolvedValue({
      id: BRAIN_ID,
      name: "Test Brain",
      kind: "company",
      thesis: "Test",
      createdAt: new Date().toISOString(),
    }),
  };

  (getRepository as ReturnType<typeof vi.fn>).mockReturnValue(repo);
  return { repo, mockFetch };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("handleSlackMention", () => {
  it("posts Thinking then calls runAgent for any question", async () => {
    const { mockFetch } = setupMockRepository();
    (runAgent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await handleSlackMention(makeSlackPayload("<@BOT> What's on my calendar today?"));

    const postCalls = mockFetch.mock.calls.filter(
      (c) => (c[0] as string).includes("chat.postMessage"),
    );
    expect(postCalls.length).toBeGreaterThan(0);
    const thinkingBody = JSON.parse(postCalls[0][1]?.body as string);
    expect(thinkingBody.text).toContain("Thinking");

    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        brainId: BRAIN_ID,
        brainName: "Test Brain",
        question: "What's on my calendar today?",
      }),
    );
  });

  it("deduplicates events by event_id", async () => {
    setupMockRepository();
    (runAgent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const payload = makeSlackPayload("<@BOT> hello", "evt-dedup");
    await handleSlackMention(payload);
    await handleSlackMention(payload);

    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it("skips empty questions after cleaning mentions", async () => {
    setupMockRepository();
    (runAgent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await handleSlackMention(makeSlackPayload("<@BOT>"));

    expect(runAgent).not.toHaveBeenCalled();
  });

  it("handles missing brain gracefully", async () => {
    const { repo, mockFetch } = setupMockRepository();
    repo.getBrain.mockResolvedValue(null);

    await handleSlackMention(makeSlackPayload("<@BOT> hello"));

    const updateCalls = mockFetch.mock.calls.filter(
      (c) => (c[0] as string).includes("chat.update"),
    );
    expect(updateCalls.length).toBeGreaterThan(0);
    const body = JSON.parse(updateCalls[0][1]?.body as string);
    expect(body.text).toContain("couldn't find your brain");
  });
});
