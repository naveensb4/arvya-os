import { describe, it, expect } from "vitest";
import {
  formatPrepBrief,
  formatPrepFirstTimeTip,
  formatLowConfidenceMessage,
} from "../format-prep";
import type { MeetingPrepBrief } from "@arvya/core";

function makeTestBrief(overrides: Partial<MeetingPrepBrief> = {}): MeetingPrepBrief {
  return {
    meeting_id: "m-1",
    generated_at: "2026-05-09T06:00:00Z",
    meeting_window: {
      start: "2026-05-09T10:00:00Z",
      end: "2026-05-09T11:00:00Z",
      live_in_minutes: 240,
    },
    attendees: [
      {
        name: "Jane Smith",
        email: "jane@acme.com",
        company: "Acme Corp",
        role: "VP Sales",
        mini_dossier: {
          recent_mentions: [
            { snippet: "Discussed pricing last week", source_id: "si-1" },
          ],
        },
        confidence: 0.85,
      },
    ],
    why_now: {
      reason: "Q2 budget cycle ending, they need to decide this week",
      sources: [{ kind: "brain_source", id_or_url: "si-1" }],
      confidence: 0.9,
    },
    tone_calibration: {
      description: "Direct and data-driven",
      based_on_n_messages: 5,
      confidence: 0.7,
    },
    things_to_know: [
      {
        point: "Acme raised $50M Series C last month",
        sources: [{ kind: "web_url", id_or_url: "https://techcrunch.com/acme" }],
        origin: "web",
        freshness_label: "1 week",
        confidence: 0.95,
      },
    ],
    questions_to_ask: [
      {
        question: "What's your procurement timeline?",
        rationale: "They mentioned evaluating tools in Q2",
        sources: [{ kind: "brain_source", id_or_url: "si-2" }],
        confidence: 0.8,
      },
    ],
    risks_to_dodge: [
      {
        risk: "Competitor did a demo last week",
        sources: [],
        confidence: 0.6,
        trust_label: "inference",
      },
    ],
    open_loops_with_attendees: [
      {
        loop_id: "ol-1",
        title: "Send case study",
        due_date: "2026-05-08",
        overdue: true,
      },
    ],
    overall_confidence: 0.8,
    uncertainty_notes: [],
    source_count: 5,
    ...overrides,
  };
}

describe("formatPrepBrief", () => {
  it("includes all sections in output", () => {
    const brief = makeTestBrief();
    const { text, truncated } = formatPrepBrief(brief, "https://app.arvya.com/prep");

    expect(text).toContain("ASK THEM");
    expect(text).toContain("KNOW");
    expect(text).toContain("RISKS");
    expect(text).toContain("ATTENDEES");
    expect(text).toContain("OPEN LOOPS");
    expect(text).toContain("Jane Smith");
    expect(text).toContain("procurement timeline");
    expect(text).toContain("Competitor did a demo");
    expect(text).toContain("Send case study");
    expect(text).toContain(":warning: overdue");
    expect(text).toContain("Confidence 0.80");
    expect(text).toContain("5 sources cited");
    expect(text).toContain("https://app.arvya.com/prep");
    expect(truncated).toBe(false);
  });

  it("includes tone calibration when present", () => {
    const brief = makeTestBrief();
    const { text } = formatPrepBrief(brief, "https://app.arvya.com/prep");

    expect(text).toContain("Tone: Direct and data-driven");
  });

  it("truncates at 38KB and appends dashboard link", () => {
    const longPoint = "A".repeat(40_000);
    const brief = makeTestBrief({
      things_to_know: [
        {
          point: longPoint,
          sources: [],
          origin: "brain",
          freshness_label: "",
          confidence: 0.5,
        },
      ],
    });

    const { text, truncated } = formatPrepBrief(brief, "https://app.arvya.com/prep");

    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(38_000);
    expect(text).toContain("Full brief in dashboard");
  });

  it("includes feedback reaction emojis", () => {
    const brief = makeTestBrief();
    const { text } = formatPrepBrief(brief, "https://app.arvya.com/prep");

    expect(text).toContain("👍");
    expect(text).toContain("👎");
    expect(text).toContain("💬");
  });
});

describe("formatPrepFirstTimeTip", () => {
  it("mentions all surfaces: mention, slash command, dashboard", () => {
    const tip = formatPrepFirstTimeTip();
    expect(tip).toContain("prep me for");
    expect(tip).toContain("/meeting-prep");
    expect(tip).toContain("dashboard");
  });
});

describe("formatLowConfidenceMessage", () => {
  it("includes dashboard link and Gmail CTA", () => {
    const msg = formatLowConfidenceMessage("https://app.arvya.com/prep");
    expect(msg).toContain("https://app.arvya.com/prep");
    expect(msg).toContain("Gmail");
  });
});
