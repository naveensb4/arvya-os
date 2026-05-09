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

import {
  verifyCitations,
  wasMeetingPreppedForBrain,
  getRegenCount,
  IdempotencyHitError,
} from "../meeting-prep";
import type { MeetingPrepBrief, SourceRef } from "@arvya/core";
import { getRepository } from "@/lib/db/repository";

function makeBrief(overrides: Partial<MeetingPrepBrief> = {}): MeetingPrepBrief {
  return {
    meeting_id: "m-1",
    generated_at: new Date().toISOString(),
    meeting_window: {
      start: "2026-05-09T10:00:00Z",
      end: "2026-05-09T11:00:00Z",
      live_in_minutes: 30,
    },
    attendees: [],
    why_now: {
      reason: "Test reason",
      sources: [{ kind: "brain_source", id_or_url: "valid-id-1" }],
      confidence: 0.8,
    },
    tone_calibration: { description: "", based_on_n_messages: 0, confidence: 0 },
    things_to_know: [
      {
        point: "Key fact",
        sources: [
          { kind: "brain_source", id_or_url: "valid-id-2" },
          { kind: "brain_source", id_or_url: "HALLUCINATED-ID" },
        ],
        origin: "brain",
        freshness_label: "",
        confidence: 0.9,
      },
    ],
    questions_to_ask: [],
    risks_to_dodge: [],
    open_loops_with_attendees: [],
    overall_confidence: 0.8,
    uncertainty_notes: [],
    source_count: 2,
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("verifyCitations", () => {
  it("drops hallucinated brain source IDs and lowers confidence by 0.1 per drop", () => {
    const validIds = new Set(["valid-id-1", "valid-id-2"]);
    const brief = makeBrief();

    const result = verifyCitations(brief, validIds);

    // "HALLUCINATED-ID" should be dropped from things_to_know[0]
    expect(result.things_to_know[0].sources).toHaveLength(1);
    expect(result.things_to_know[0].sources[0].id_or_url).toBe("valid-id-2");

    // Confidence lowered by 0.1 for 1 dropped ref
    expect(result.things_to_know[0].confidence).toBe(0.8);

    // Uncertainty note added
    expect(result.uncertainty_notes).toContain("dropped 1 hallucinated citation(s)");
  });

  it("preserves web_url and linkedin_url sources regardless of validIds", () => {
    const brief = makeBrief({
      why_now: {
        reason: "Test",
        sources: [
          { kind: "web_url", id_or_url: "https://example.com" },
          { kind: "linkedin_url", id_or_url: "https://linkedin.com/in/test" },
        ],
        confidence: 0.9,
      },
    });

    const result = verifyCitations(brief, new Set());

    expect(result.why_now.sources).toHaveLength(2);
    expect(result.why_now.confidence).toBe(0.9);
  });

  it("floors confidence at 0.2 when many refs dropped", () => {
    const brief = makeBrief({
      things_to_know: [
        {
          point: "Test",
          sources: Array.from({ length: 8 }, (_, i) => ({
            kind: "brain_source" as const,
            id_or_url: `bad-${i}`,
          })),
          origin: "brain" as const,
          freshness_label: "",
          confidence: 0.9,
        },
      ],
    });

    const result = verifyCitations(brief, new Set());

    expect(result.things_to_know[0].confidence).toBe(0.2);
  });

  it("recalculates overall_confidence as min of all section confidences", () => {
    const brief = makeBrief({
      why_now: {
        reason: "Test",
        sources: [{ kind: "brain_source", id_or_url: "valid" }],
        confidence: 0.9,
      },
      things_to_know: [
        {
          point: "Test",
          sources: [{ kind: "brain_source", id_or_url: "valid" }],
          origin: "brain",
          freshness_label: "",
          confidence: 0.5,
        },
      ],
    });

    const result = verifyCitations(brief, new Set(["valid"]));

    expect(result.overall_confidence).toBe(0.5);
  });
});

// CRITICAL REGRESSION: Idempotency guard
describe("wasMeetingPreppedForBrain — idempotency", () => {
  it("CRITICAL: returns true when matching prep run exists within window", async () => {
    const now = new Date();
    const repo = {
      listAgentRuns: vi.fn().mockResolvedValue([
        {
          id: "run-1",
          name: "meeting_prep",
          rawInput: { meeting_id: "m-target" },
          startedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          status: "succeeded",
        },
      ]),
    };
    (getRepository as ReturnType<typeof vi.fn>).mockReturnValue(repo);

    const result = await wasMeetingPreppedForBrain("brain-1", "m-target", 20);
    expect(result).toBe(true);
  });

  it("returns false when matching run is outside the window", async () => {
    const now = new Date();
    const repo = {
      listAgentRuns: vi.fn().mockResolvedValue([
        {
          id: "run-1",
          name: "meeting_prep",
          rawInput: { meeting_id: "m-target" },
          startedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          status: "succeeded",
        },
      ]),
    };
    (getRepository as ReturnType<typeof vi.fn>).mockReturnValue(repo);

    const result = await wasMeetingPreppedForBrain("brain-1", "m-target", 20);
    expect(result).toBe(false);
  });
});

describe("getRegenCount", () => {
  it("returns regen_count from latest prep run output", () => {
    const runs = [
      {
        name: "meeting_prep",
        rawInput: { meeting_id: "m-1" },
        rawOutput: { regen_count: 2 },
      },
      {
        name: "meeting_prep",
        rawInput: { meeting_id: "m-1" },
        rawOutput: { regen_count: 1 },
      },
    ];

    expect(getRegenCount("brain-1", "m-1", runs)).toBe(2);
  });

  it("returns 0 when no prep runs exist for this meeting", () => {
    const runs = [
      {
        name: "meeting_prep",
        rawInput: { meeting_id: "m-other" },
        rawOutput: { regen_count: 3 },
      },
    ];

    expect(getRegenCount("brain-1", "m-1", runs)).toBe(0);
  });
});
