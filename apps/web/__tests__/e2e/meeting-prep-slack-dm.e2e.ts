import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/repository", () => ({
  getRepository: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getAiClient: vi.fn(),
}));

vi.mock("@/lib/retrieval", () => ({
  retrieveRelevantContext: vi.fn(),
}));

vi.mock("@/lib/connectors/slack", () => ({
  openSlackDm: vi.fn(),
  postSlackMessage: vi.fn(),
}));

import { runMeetingPrep } from "@/lib/agents/meeting-prep";
import { getRepository } from "@/lib/db/repository";
import { getAiClient } from "@/lib/ai";
import { retrieveRelevantContext } from "@/lib/retrieval";
import { openSlackDm, postSlackMessage } from "@/lib/connectors/slack";

const BRAIN_ID = "brain-e2e";
const MEETING_ID = "m-e2e";

function setupFullMocks() {
  const repo = {
    getBrain: vi.fn().mockResolvedValue({
      id: BRAIN_ID,
      name: "E2E Brain",
      kind: "company",
      thesis: "Test",
      metadata: { meeting_prep_enabled: true },
      createdAt: new Date().toISOString(),
    }),
    listNotetakerMeetings: vi.fn().mockResolvedValue([
      {
        id: MEETING_ID,
        title: "Acme <> Arvya sync",
        startTime: new Date(Date.now() + 3600000).toISOString(),
        endTime: new Date(Date.now() + 7200000).toISOString(),
        participants: [
          { name: "Jane Smith", email: "jane@acme.com", company: "Acme" },
        ],
      },
    ]),
    listAgentRuns: vi.fn().mockResolvedValue([]),
    createBrainDoc: vi.fn().mockResolvedValue({ id: "doc-e2e" }),
    createAgentRun: vi.fn().mockResolvedValue({ id: "run-e2e" }),
    updateAgentRun: vi.fn().mockResolvedValue(undefined),
    listConnectorConfigs: vi.fn().mockResolvedValue([
      {
        connectorType: "slack",
        status: "connected",
        brainId: BRAIN_ID,
        config: { installerUserId: "U123" },
        credentials: { botToken: "xoxb-test", installerUserId: "U123" },
      },
    ]),
  };
  (getRepository as ReturnType<typeof vi.fn>).mockReturnValue(repo);

  const ai = {
    available: true,
    preferredProvider: "anthropic" as const,
    embeddingModel: null,
    complete: vi.fn().mockResolvedValue({ text: "Direct and professional", provider: "anthropic" }),
    completeStructured: vi.fn().mockResolvedValue({
      data: {
        meeting_id: MEETING_ID,
        generated_at: new Date().toISOString(),
        meeting_window: {
          start: new Date(Date.now() + 3600000).toISOString(),
          end: new Date(Date.now() + 7200000).toISOString(),
          live_in_minutes: 60,
        },
        attendees: [
          {
            name: "Jane Smith",
            email: "jane@acme.com",
            company: "Acme",
            role: "VP Sales",
            mini_dossier: { recent_mentions: [] },
            confidence: 0.8,
          },
        ],
        why_now: {
          reason: "Q2 check-in on pipeline",
          sources: [{ kind: "brain_source", id_or_url: "si-1" }],
          confidence: 0.85,
        },
        tone_calibration: { description: "", based_on_n_messages: 0, confidence: 0 },
        things_to_know: [
          {
            point: "Acme closed Series C",
            sources: [{ kind: "brain_source", id_or_url: "si-1" }],
            origin: "brain",
            freshness_label: "recent",
            confidence: 0.9,
          },
        ],
        questions_to_ask: [
          {
            question: "Timeline for decision?",
            rationale: "Q2 budget",
            sources: [{ kind: "brain_source", id_or_url: "si-1" }],
            confidence: 0.8,
          },
        ],
        risks_to_dodge: [],
        open_loops_with_attendees: [],
        overall_confidence: 0.85,
        uncertainty_notes: [],
        source_count: 3,
      },
      provider: "anthropic",
    }),
    embed: vi.fn().mockResolvedValue(null),
  };
  (getAiClient as ReturnType<typeof vi.fn>).mockReturnValue(ai);

  (retrieveRelevantContext as ReturnType<typeof vi.fn>).mockResolvedValue([
    {
      sourceItem: {
        id: "si-1",
        brainId: BRAIN_ID,
        title: "Email",
        type: "email",
        content: "Acme discussion",
        createdAt: new Date().toISOString(),
      },
      score: 0.9,
    },
  ]);

  (openSlackDm as ReturnType<typeof vi.fn>).mockResolvedValue("D123");
  (postSlackMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ts: "123456.789" });

  return { repo, ai };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("E2E: meeting prep → Slack DM delivery", () => {
  it("happy path: generates brief, verifies citations, delivers Slack DM", async () => {
    const { repo } = setupFullMocks();

    const result = await runMeetingPrep(BRAIN_ID, MEETING_ID, {
      skipIdempotency: true,
    });

    // Brief was generated with valid structure
    expect(result.brief).toBeDefined();
    expect(result.brief.meeting_id).toBe(MEETING_ID);
    expect(result.brief.overall_confidence).toBeGreaterThanOrEqual(0.4);

    // Agent run was created and updated
    expect(repo.createAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        brainId: BRAIN_ID,
        name: "meeting_prep",
      }),
    );
    expect(repo.updateAgentRun).toHaveBeenCalled();

    // Slack DM was delivered
    expect(openSlackDm).toHaveBeenCalledWith("xoxb-test", "U123");
    expect(postSlackMessage).toHaveBeenCalledWith(
      "xoxb-test",
      "D123",
      expect.stringContaining("ASK THEM"),
    );

    expect(result.slackDelivered).toBe(true);
    expect(result.status).toBe("succeeded");
    expect(result.brief.slack_message_ts).toBe("123456.789");
  });
});
