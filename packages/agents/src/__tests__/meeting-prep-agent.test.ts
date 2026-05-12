import { describe, it, expect } from "vitest";
import { z } from "zod";
import { meetingPrepBriefSchema, sourceRefSchema, meetingPrepAttendeeSchema } from "@arvya/core";
import type { MeetingPrepBrief, SourceRef, MeetingPrepAttendee } from "@arvya/core";
import { meetingPrepSystemPrompt, buildMeetingPrepPrompt } from "@arvya/prompts/meeting-prep";

function makeMinimalBrief(overrides: Partial<MeetingPrepBrief> = {}): MeetingPrepBrief {
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
      reason: "Quarterly review",
      sources: [],
      confidence: 0.8,
    },
    tone_calibration: {
      description: "",
      based_on_n_messages: 0,
      confidence: 0,
    },
    things_to_know: [],
    questions_to_ask: [],
    risks_to_dodge: [],
    open_loops_with_attendees: [],
    overall_confidence: 0.8,
    uncertainty_notes: [],
    source_count: 0,
    ...overrides,
  };
}

describe("MeetingPrepBrief schema", () => {
  it("validates a minimal valid brief", () => {
    const brief = makeMinimalBrief();
    const result = meetingPrepBriefSchema.safeParse(brief);
    expect(result.success).toBe(true);
  });

  it("rejects brief without meeting_id", () => {
    const brief = makeMinimalBrief();
    // @ts-expect-error testing invalid input
    delete brief.meeting_id;
    const result = meetingPrepBriefSchema.safeParse(brief);
    expect(result.success).toBe(false);
  });

  it("validates a fully populated brief with attendees and sections", () => {
    const brief = makeMinimalBrief({
      attendees: [
        {
          name: "Jane Doe",
          email: "jane@acme.com",
          company: "Acme",
          role: "CEO",
          linkedin_url: "https://linkedin.com/in/janedoe",
          mini_dossier: {
            recent_mentions: [
              { snippet: "Discussed pricing in last call", source_id: "si-1" },
            ],
          },
          confidence: 0.9,
        },
      ],
      things_to_know: [
        {
          point: "Acme raised Series B",
          sources: [{ kind: "web_url", id_or_url: "https://techcrunch.com/acme" }],
          origin: "web",
          freshness_label: "2 days ago",
          confidence: 0.85,
        },
      ],
      questions_to_ask: [
        {
          question: "What's the timeline for procurement?",
          rationale: "They mentioned evaluating in Q2",
          sources: [{ kind: "brain_source", id_or_url: "si-123" }],
          confidence: 0.7,
        },
      ],
      risks_to_dodge: [
        {
          risk: "Competitor demo scheduled next week",
          sources: [],
          confidence: 0.6,
          trust_label: "inference",
        },
      ],
      open_loops_with_attendees: [
        {
          loop_id: "ol-1",
          title: "Send pricing doc",
          due_date: "2026-05-10",
          overdue: false,
        },
      ],
    });

    const result = meetingPrepBriefSchema.safeParse(brief);
    expect(result.success).toBe(true);
  });

  it("enforces confidence bounds 0..1", () => {
    const brief = makeMinimalBrief({ overall_confidence: 1.5 });
    const result = meetingPrepBriefSchema.safeParse(brief);
    expect(result.success).toBe(false);
  });
});

describe("SourceRef schema", () => {
  it("validates all source kinds", () => {
    const kinds: SourceRef["kind"][] = [
      "brain_source",
      "memory_object",
      "open_loop",
      "web_url",
      "linkedin_url",
    ];
    for (const kind of kinds) {
      const ref: SourceRef = { kind, id_or_url: "test-id" };
      expect(sourceRefSchema.safeParse(ref).success).toBe(true);
    }
  });

  it("rejects unknown source kind", () => {
    const ref = { kind: "unknown_kind", id_or_url: "test" };
    expect(sourceRefSchema.safeParse(ref).success).toBe(false);
  });
});

describe("buildMeetingPrepPrompt", () => {
  it("includes meeting title, attendees, and brain context in prompt", () => {
    const prompt = buildMeetingPrepPrompt({
      meetingTitle: "Acme <> Arvya",
      meetingStart: "2026-05-09T10:00:00Z",
      meetingEnd: "2026-05-09T11:00:00Z",
      meetingId: "m-1",
      attendees: [
        { name: "John Doe", email: "john@acme.com", company: "Acme" },
      ],
      brainName: "Acme Deal",
      brainThesis: "Enterprise SaaS deal",
      linkedinEnabled: true,
      webSearchEnabled: true,
    });

    expect(prompt).toContain("Acme <> Arvya");
    expect(prompt).toContain("John Doe");
    expect(prompt).toContain("john@acme.com");
    expect(prompt).toContain("Acme Deal");
  });

  it("adds tool restriction notes when features are disabled", () => {
    const prompt = buildMeetingPrepPrompt({
      meetingTitle: "Test Meeting",
      meetingStart: "2026-05-09T10:00:00Z",
      meetingEnd: "2026-05-09T11:00:00Z",
      meetingId: "m-1",
      attendees: [],
      brainName: "Test",
      brainThesis: "Test thesis",
      linkedinEnabled: false,
      webSearchEnabled: false,
    });

    expect(prompt).toContain("LinkedIn enrichment is DISABLED");
    expect(prompt).toContain("Web search is DISABLED");
  });
});

describe("meetingPrepSystemPrompt", () => {
  it("mentions all three tools: retrieve_brain_context, web_search, linkedin_enrich", () => {
    expect(meetingPrepSystemPrompt).toContain("retrieve_brain_context");
    expect(meetingPrepSystemPrompt).toContain("web_search");
    expect(meetingPrepSystemPrompt).toContain("linkedin_enrich");
  });
});
