import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/repository", () => ({
  getRepository: vi.fn(),
}));

vi.mock("@/lib/brain/store", () => ({
  answerBrainQuestion: vi.fn(),
}));

vi.mock("@/lib/agents/meeting-prep", () => ({
  runMeetingPrep: vi.fn(),
  getLatestMeetingPrep: vi.fn(),
}));

import { handleSlackMention } from "../handler";
import { getRepository } from "@/lib/db/repository";
import { runMeetingPrep } from "@/lib/agents/meeting-prep";

const BRAIN_ID = "brain-test";
const BOT_TOKEN = "xoxb-test";
const TEAM_ID = "T123";

function makeSlackPayload(text: string, eventId = `evt-${Date.now()}`) {
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
  const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
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
    listMemoryObjects: vi.fn().mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({ id: `mo-${i}` })),
    ),
    listNotetakerMeetings: vi.fn().mockResolvedValue([
      { id: "m-1", title: "Acme <> Arvya", startTime: new Date().toISOString(), endTime: new Date().toISOString() },
      { id: "m-2", title: "Investor call with Sequoia", startTime: new Date().toISOString(), endTime: new Date().toISOString() },
    ]),
  };

  (getRepository as ReturnType<typeof vi.fn>).mockReturnValue(repo);
  return { repo, mockFetch };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("handleSlackMention — prep intent", () => {
  it('routes "prep me for Acme" to runMeetingPrep with correct meeting', async () => {
    const { repo } = setupMockRepository();
    (runMeetingPrep as ReturnType<typeof vi.fn>).mockResolvedValue({
      brief: { overall_confidence: 0.8 },
      agentRunId: "run-1",
      slackDelivered: true,
      status: "succeeded",
    });

    await handleSlackMention(makeSlackPayload("<@BOT> prep me for Acme"));

    expect(runMeetingPrep).toHaveBeenCalledWith(
      BRAIN_ID,
      "m-1",
      expect.objectContaining({ skipIdempotency: true }),
    );
  });

  it("responds with no-match message when meeting not found", async () => {
    const { repo, mockFetch } = setupMockRepository();
    repo.listNotetakerMeetings.mockResolvedValue([
      { id: "m-1", title: "Internal standup", startTime: new Date().toISOString(), endTime: new Date().toISOString() },
    ]);

    await handleSlackMention(makeSlackPayload("<@BOT> prep me for XYZ Corp"));

    const postCalls = mockFetch.mock.calls.filter(
      (c) => (c[0] as string).includes("chat.postMessage"),
    );
    expect(postCalls.length).toBeGreaterThan(0);
    const body = JSON.parse(postCalls[postCalls.length - 1][1]?.body as string);
    expect(body.text).toContain("couldn't match");
  });

  it("falls through to Q&A for non-prep mentions", async () => {
    setupMockRepository();
    const { answerBrainQuestion } = await import("@/lib/brain/store");
    (answerBrainQuestion as ReturnType<typeof vi.fn>).mockResolvedValue({
      question: "What is the latest deal status?",
      answer: "The deal is progressing well.",
      citations: [],
    });

    await handleSlackMention(makeSlackPayload("<@BOT> What is the latest deal status?"));

    expect(runMeetingPrep).not.toHaveBeenCalled();
    expect(answerBrainQuestion).toHaveBeenCalled();
  });
});
