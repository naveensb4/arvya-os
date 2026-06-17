import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  typeGate,
  calendarGate,
  duplicateGate,
  temporalGate,
  buildOpenLoopValidationPipeline,
  type ValidationContext,
  type GateEvidence,
} from "../validation-pipeline";
import type { ExtractedOpenLoop } from "@arvya/core";

function makeLoop(overrides: Partial<ExtractedOpenLoop> = {}): ExtractedOpenLoop {
  return {
    title: "Send deck to investor",
    description: "Follow up on the pitch meeting",
    loopType: "follow_up",
    owner: "Naveen",
    status: "needs_review",
    priority: "medium",
    confidence: 0.8,
    requiresHumanApproval: false,
    sourceQuote: "I will send the deck tomorrow",
    ...overrides,
  };
}

function makeContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    brainId: "brain-1",
    source: {
      id: "source-1",
      brainId: "brain-1",
      type: "email",
      title: "Re: Investor pitch",
      content: "Thanks for the meeting. I will send the deck.",
      createdAt: new Date().toISOString(),
      metadata: { occurred_at: new Date().toISOString() },
    } as any,
    repository: {
      listCalendarEvents: vi.fn().mockResolvedValue([]),
      listOpenLoops: vi.fn().mockResolvedValue([]),
    } as any,
    ...overrides,
  };
}

describe("Type Gate", () => {
  it("passes valid action items", async () => {
    const result = await typeGate.run(makeLoop(), makeContext());
    expect(result.pass).toBe(true);
  });

  it("rejects calendar invitations", async () => {
    const result = await typeGate.run(
      makeLoop({ title: "Invitation: Weekly standup", description: "You have been invited to a meeting" }),
      makeContext(),
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("calendar invitation");
  });

  it("rejects greeting-only content", async () => {
    const result = await typeGate.run(
      makeLoop({ title: "Hi Naveen!", description: "" }),
      makeContext(),
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("greeting");
  });

  it("rejects recurring obligations", async () => {
    const result = await typeGate.run(
      makeLoop({ title: "Weekly standup meeting", description: "Every Monday at 9am" }),
      makeContext(),
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("recurring");
  });

  it("rejects too-short titles without description", async () => {
    const result = await typeGate.run(
      makeLoop({ title: "Hi", description: "" }),
      makeContext(),
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("too short");
  });

  it("passes RSVP-like content in body but not title", async () => {
    const result = await typeGate.run(
      makeLoop({ title: "Accepted: Team planning session" }),
      makeContext(),
    );
    expect(result.pass).toBe(false);
  });
});

describe("Calendar Gate", () => {
  it("passes non-scheduling loops", async () => {
    const result = await calendarGate.run(
      makeLoop({ loopType: "product", title: "Ship new feature" }),
      makeContext(),
    );
    expect(result.pass).toBe(true);
    expect(result.reason).toContain("not a scheduling loop");
  });

  it("passes when no calendar data", async () => {
    const result = await calendarGate.run(
      makeLoop({ loopType: "scheduling", title: "Schedule call with Mohan" }),
      makeContext(),
    );
    expect(result.pass).toBe(true);
    expect(result.reason).toContain("no calendar data");
  });

  it("rejects when meeting already happened", async () => {
    const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const ctx = makeContext({
      repository: {
        listCalendarEvents: vi.fn().mockResolvedValue([{
          id: "ev-1",
          title: "Call with Mohan",
          startTime: pastDate.toISOString(),
          endTime: new Date(pastDate.getTime() + 3600000).toISOString(),
          eventStatus: "active",
          participants: [{ name: "Mohan", email: "mohan@example.com" }],
        }]),
        listOpenLoops: vi.fn().mockResolvedValue([]),
      } as any,
    });
    const result = await calendarGate.run(
      makeLoop({ loopType: "scheduling", title: "Schedule call with Mohan" }),
      ctx,
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("meeting already happened");
  });

  it("keeps loop open for cancelled meetings", async () => {
    const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const ctx = makeContext({
      repository: {
        listCalendarEvents: vi.fn().mockResolvedValue([{
          id: "ev-1",
          title: "Call with Mohan",
          startTime: pastDate.toISOString(),
          endTime: new Date(pastDate.getTime() + 3600000).toISOString(),
          eventStatus: "cancelled",
          participants: [{ name: "Mohan", email: "mohan@example.com" }],
        }]),
        listOpenLoops: vi.fn().mockResolvedValue([]),
      } as any,
    });
    const result = await calendarGate.run(
      makeLoop({ loopType: "scheduling", title: "Schedule call with Mohan" }),
      ctx,
    );
    expect(result.pass).toBe(true);
    expect(result.reason).toContain("cancelled");
  });

  it("passes through on error", async () => {
    const ctx = makeContext({
      repository: {
        listCalendarEvents: vi.fn().mockRejectedValue(new Error("401")),
        listOpenLoops: vi.fn().mockResolvedValue([]),
      } as any,
    });
    const result = await calendarGate.run(
      makeLoop({ loopType: "scheduling", title: "Schedule call with Mohan" }),
      ctx,
    );
    expect(result.pass).toBe(true);
    expect(result.reason).toContain("error");
  });
});

describe("Duplicate Gate", () => {
  it("passes unique loops", async () => {
    const ctx = makeContext({
      repository: {
        listCalendarEvents: vi.fn().mockResolvedValue([]),
        listOpenLoops: vi.fn().mockResolvedValue([]),
      } as any,
    });
    const result = await duplicateGate.run(makeLoop(), ctx);
    expect(result.pass).toBe(true);
  });

  it("rejects exact title duplicates", async () => {
    const ctx = makeContext({
      repository: {
        listCalendarEvents: vi.fn().mockResolvedValue([]),
        listOpenLoops: vi.fn().mockResolvedValue([
          { id: "existing-1", title: "Send deck to investor", status: "open", sourceQuote: "" },
        ]),
      } as any,
    });
    const result = await duplicateGate.run(makeLoop(), ctx);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("duplicate");
  });

  it("rejects high-similarity source quotes", async () => {
    const ctx = makeContext({
      repository: {
        listCalendarEvents: vi.fn().mockResolvedValue([]),
        listOpenLoops: vi.fn().mockResolvedValue([
          {
            id: "existing-1",
            title: "Send updated deck to investors",
            status: "open",
            sourceQuote: "I will send the deck to the investor tomorrow morning",
          },
        ]),
      } as any,
    });
    const result = await duplicateGate.run(
      makeLoop({ sourceQuote: "I will send the deck to the investor tomorrow" }),
      ctx,
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("similarity");
  });

  it("passes for dismissed loops (not active)", async () => {
    const ctx = makeContext({
      repository: {
        listCalendarEvents: vi.fn().mockResolvedValue([]),
        listOpenLoops: vi.fn().mockResolvedValue([
          { id: "existing-1", title: "Send deck to investor", status: "dismissed", sourceQuote: "" },
        ]),
      } as any,
    });
    const result = await duplicateGate.run(makeLoop(), ctx);
    expect(result.pass).toBe(true);
  });
});

describe("Temporal Gate", () => {
  it("passes recent sources", async () => {
    const result = await temporalGate.run(makeLoop(), makeContext());
    expect(result.pass).toBe(true);
    expect(result.reason).toContain("under");
  });

  it("rejects old sources without future indicators", async () => {
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const ctx = makeContext({
      source: {
        id: "source-1",
        brainId: "brain-1",
        type: "email",
        title: "Old email",
        content: "Some old content",
        createdAt: oldDate.toISOString(),
        metadata: { occurred_at: oldDate.toISOString() },
      } as any,
    });
    const result = await temporalGate.run(
      makeLoop({ dueDate: undefined }),
      ctx,
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("no future date");
  });

  it("passes old sources with future due date", async () => {
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const ctx = makeContext({
      source: {
        id: "source-1",
        brainId: "brain-1",
        type: "email",
        title: "Old email",
        content: "Some old content",
        createdAt: oldDate.toISOString(),
        metadata: { occurred_at: oldDate.toISOString() },
      } as any,
    });
    const result = await temporalGate.run(
      makeLoop({ dueDate: futureDate.toISOString() }),
      ctx,
    );
    expect(result.pass).toBe(true);
    expect(result.reason).toContain("future due date");
  });

  it("passes old sources with future-facing language", async () => {
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const ctx = makeContext({
      source: {
        id: "source-1",
        brainId: "brain-1",
        type: "email",
        title: "Old email",
        content: "Some old content",
        createdAt: oldDate.toISOString(),
        metadata: { occurred_at: oldDate.toISOString() },
      } as any,
    });
    const result = await temporalGate.run(
      makeLoop({ title: "Schedule meeting next week", dueDate: undefined }),
      ctx,
    );
    expect(result.pass).toBe(true);
    expect(result.reason).toContain("future-facing");
  });

  it("passes old sources with correlated future calendar event", async () => {
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const ctx = makeContext({
      source: {
        id: "source-1",
        brainId: "brain-1",
        type: "email",
        title: "Old email",
        content: "Some old content",
        createdAt: oldDate.toISOString(),
        metadata: { occurred_at: oldDate.toISOString() },
      } as any,
      repository: {
        listCalendarEvents: vi.fn().mockResolvedValue([{
          id: "ev-1",
          title: "Investor pitch meeting",
          startTime: futureDate.toISOString(),
          endTime: new Date(futureDate.getTime() + 3600000).toISOString(),
          eventStatus: "active",
          participants: [{ name: "Naveen" }],
        }]),
        listOpenLoops: vi.fn().mockResolvedValue([]),
      } as any,
    });
    const result = await temporalGate.run(
      makeLoop({ title: "Prepare for investor pitch", dueDate: undefined }),
      ctx,
    );
    expect(result.pass).toBe(true);
    expect(result.reason).toContain("calendar event");
  });
});

describe("Gate Interaction Tests (D14)", () => {
  it("pipeline rejects a calendar invitation from old email", async () => {
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const pipeline = buildOpenLoopValidationPipeline();
    const ctx = makeContext({
      source: {
        id: "source-1",
        brainId: "brain-1",
        type: "email",
        title: "Invitation: Team sync",
        content: "You have been invited to a calendar event",
        createdAt: oldDate.toISOString(),
        metadata: { occurred_at: oldDate.toISOString() },
      } as any,
    });
    const result = await pipeline.validate(
      makeLoop({ title: "Invitation: Team sync", description: "You have been invited to a meeting" }),
      ctx,
    );
    expect(result.passed).toBe(false);
    expect(result.rejectedBy).toBe("type");
  });

  it("pipeline rejects when calendar gate catches meeting but type gate passes", async () => {
    const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const pipeline = buildOpenLoopValidationPipeline();
    const ctx = makeContext({
      repository: {
        listCalendarEvents: vi.fn().mockResolvedValue([{
          id: "ev-1",
          title: "Call with Sarah",
          startTime: pastDate.toISOString(),
          endTime: new Date(pastDate.getTime() + 3600000).toISOString(),
          eventStatus: "active",
          participants: [{ name: "Sarah" }],
        }]),
        listOpenLoops: vi.fn().mockResolvedValue([]),
      } as any,
    });
    const result = await pipeline.validate(
      makeLoop({ loopType: "scheduling", title: "Schedule call with Sarah" }),
      ctx,
    );
    expect(result.passed).toBe(false);
    expect(result.rejectedBy).toBe("calendar");
  });

  it("pipeline passes a valid non-meeting loop from recent email", async () => {
    const pipeline = buildOpenLoopValidationPipeline();
    const ctx = makeContext();
    const result = await pipeline.validate(
      makeLoop({ loopType: "investor", title: "Send updated pitch deck to Series A investors" }),
      ctx,
    );
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(4);
    expect(result.results.every((r) => r.pass)).toBe(true);
  });

  it("pipeline catches duplicate even when other gates pass", async () => {
    const pipeline = buildOpenLoopValidationPipeline();
    const ctx = makeContext({
      repository: {
        listCalendarEvents: vi.fn().mockResolvedValue([]),
        listOpenLoops: vi.fn().mockResolvedValue([
          { id: "existing-1", title: "Send deck to investor", status: "open", sourceQuote: "" },
        ]),
      } as any,
    });
    const result = await pipeline.validate(makeLoop(), ctx);
    expect(result.passed).toBe(false);
    expect(result.rejectedBy).toBe("duplicate");
  });

  it("batch validation correctly splits passed and rejected", async () => {
    const pipeline = buildOpenLoopValidationPipeline();
    const ctx = makeContext();
    const loops = [
      makeLoop({ title: "Follow up on deal terms" }),
      makeLoop({ title: "Invitation: Weekly standup", description: "You have been invited to a meeting" }),
      makeLoop({ title: "Prepare quarterly report" }),
    ];
    const { passed, rejected } = await pipeline.validateBatch(loops, ctx);
    expect(passed).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].rejectedBy).toBe("type");
  });

  it("temporal gate is last resort — calendar gate catches meeting loops first", async () => {
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const pastMeeting = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const pipeline = buildOpenLoopValidationPipeline();
    const ctx = makeContext({
      source: {
        id: "source-1",
        brainId: "brain-1",
        type: "email",
        title: "Old email about meeting",
        content: "We need to schedule a call with Mohan",
        createdAt: oldDate.toISOString(),
        metadata: { occurred_at: oldDate.toISOString() },
      } as any,
      repository: {
        listCalendarEvents: vi.fn().mockResolvedValue([{
          id: "ev-1",
          title: "Call with Mohan",
          startTime: pastMeeting.toISOString(),
          endTime: new Date(pastMeeting.getTime() + 3600000).toISOString(),
          eventStatus: "active",
          participants: [{ name: "Mohan" }],
        }]),
        listOpenLoops: vi.fn().mockResolvedValue([]),
      } as any,
    });
    const result = await pipeline.validate(
      makeLoop({ loopType: "scheduling", title: "Schedule call with Mohan", dueDate: undefined }),
      ctx,
    );
    expect(result.passed).toBe(false);
    expect(result.rejectedBy).toBe("calendar");
  });
});

describe("Calendar Gate Evidence (KG Outcome Writes)", () => {
  it("returns calendar_match evidence when rejecting a matched event", async () => {
    const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const ctx = makeContext({
      repository: {
        listCalendarEvents: vi.fn().mockResolvedValue([{
          id: "ev-1",
          sourceItemId: "source-cal-1",
          title: "Call with Mohan",
          startTime: pastDate.toISOString(),
          endTime: new Date(pastDate.getTime() + 3600000).toISOString(),
          eventStatus: "active",
          participants: [{ name: "Mohan", email: "mohan@example.com" }],
        }]),
        listOpenLoops: vi.fn().mockResolvedValue([]),
      } as any,
    });
    const result = await calendarGate.run(
      makeLoop({ loopType: "scheduling", title: "Schedule call with Mohan" }),
      ctx,
    );
    expect(result.pass).toBe(false);
    expect(result.evidence).toBeDefined();
    expect(result.evidence!.type).toBe("calendar_match");
    expect(result.evidence!.sourceId).toBe("source-cal-1");
    expect(result.evidence!.confidence).toBe(0.9);
    expect(result.evidence!.quote).toContain("Call with Mohan");
  });

  it("returns NO evidence when no participant overlap (non-scheduling skip)", async () => {
    const result = await calendarGate.run(
      makeLoop({ loopType: "product", title: "Ship new feature" }),
      makeContext(),
    );
    expect(result.pass).toBe(true);
    expect(result.evidence).toBeUndefined();
  });
});

describe("Temporal Gate SENT Evidence (KG Outcome Writes)", () => {
  it("finds SENT evidence and returns sent_email_match when rejecting old loop", async () => {
    const oldDate = new Date(Date.now() - 68 * 24 * 60 * 60 * 1000);
    const ctx = makeContext({
      source: {
        id: "source-1",
        brainId: "brain-1",
        type: "email",
        title: "Old email about NDA",
        content: "We need to get the NDA signed",
        createdAt: oldDate.toISOString(),
        metadata: { occurred_at: oldDate.toISOString() },
      } as any,
      sentSources: [{
        id: "sent-1",
        brainId: "brain-1",
        type: "email",
        title: "[SENT] NDA forwarded to legal",
        content: "Forwarding NDA",
        createdAt: new Date().toISOString(),
        metadata: { evidence_only: true },
      }] as any,
    });
    const result = await temporalGate.run(
      makeLoop({ title: "Get NDA signed", description: "NDA needs to be signed and sent to legal", dueDate: undefined }),
      ctx,
    );
    expect(result.pass).toBe(false);
    expect(result.evidence).toBeDefined();
    expect(result.evidence!.type).toBe("sent_email_match");
    expect(result.evidence!.sourceId).toBe("sent-1");
    expect(result.evidence!.confidence).toBe(0.7);
  });

  it("rejects without evidence when no SENT match exists", async () => {
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const ctx = makeContext({
      source: {
        id: "source-1",
        brainId: "brain-1",
        type: "email",
        title: "Old email",
        content: "Some old content",
        createdAt: oldDate.toISOString(),
        metadata: { occurred_at: oldDate.toISOString() },
      } as any,
      sentSources: [{
        id: "sent-unrelated",
        brainId: "brain-1",
        type: "email",
        title: "[SENT] Unrelated topic about marketing",
        content: "Marketing deck",
        createdAt: new Date().toISOString(),
        metadata: { evidence_only: true },
      }] as any,
    });
    const result = await temporalGate.run(
      makeLoop({ title: "Follow up with John on deal terms", dueDate: undefined }),
      ctx,
    );
    expect(result.pass).toBe(false);
    expect(result.evidence).toBeUndefined();
  });

  it("ignores non-evidence-only sources in SENT check (empty sentSources)", async () => {
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const ctx = makeContext({
      source: {
        id: "source-1",
        brainId: "brain-1",
        type: "email",
        title: "Old email",
        content: "Some old content",
        createdAt: oldDate.toISOString(),
        metadata: { occurred_at: oldDate.toISOString() },
      } as any,
      sentSources: [],
    });
    const result = await temporalGate.run(
      makeLoop({ dueDate: undefined }),
      ctx,
    );
    expect(result.pass).toBe(false);
    expect(result.evidence).toBeUndefined();
    expect(result.reason).toContain("no future date");
  });
});

describe("Evidence metadata shape validation", () => {
  it("evidence object has correct shape with all required fields", async () => {
    const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const ctx = makeContext({
      repository: {
        listCalendarEvents: vi.fn().mockResolvedValue([{
          id: "ev-1",
          sourceItemId: "src-cal-1",
          title: "Meeting with Alex",
          startTime: pastDate.toISOString(),
          endTime: new Date(pastDate.getTime() + 3600000).toISOString(),
          eventStatus: "active",
          participants: [{ name: "Alex" }],
        }]),
        listOpenLoops: vi.fn().mockResolvedValue([]),
      } as any,
    });
    const result = await calendarGate.run(
      makeLoop({ loopType: "scheduling", title: "Schedule call with Alex" }),
      ctx,
    );
    const evidence = result.evidence!;
    expect(evidence).toHaveProperty("type");
    expect(evidence).toHaveProperty("sourceId");
    expect(evidence).toHaveProperty("quote");
    expect(evidence).toHaveProperty("confidence");
    expect(["calendar_match", "sent_email_match", "duplicate_match"]).toContain(evidence.type);
    expect(typeof evidence.quote).toBe("string");
    expect(typeof evidence.confidence).toBe("number");
    expect(evidence.confidence).toBeGreaterThanOrEqual(0);
    expect(evidence.confidence).toBeLessThanOrEqual(1);
  });
});

describe("Dismiss Patterns", () => {
  it("detects patterns from dismissed loops", async () => {
    const { detectDismissPatterns } = await import("../dismiss-patterns");
    const now = new Date();
    const loops = [
      { id: "1", status: "dismissed", loopType: "scheduling", closedAt: now.toISOString(), createdAt: now.toISOString() },
      { id: "2", status: "dismissed", loopType: "scheduling", closedAt: now.toISOString(), createdAt: now.toISOString() },
      { id: "3", status: "dismissed", loopType: "scheduling", closedAt: now.toISOString(), createdAt: now.toISOString() },
      { id: "4", status: "open", loopType: "scheduling", createdAt: now.toISOString() },
      { id: "5", status: "open", loopType: "scheduling", createdAt: now.toISOString() },
      { id: "6", status: "open", loopType: "scheduling", createdAt: now.toISOString() },
      { id: "7", status: "open", loopType: "investor", createdAt: now.toISOString() },
    ] as any;
    const patterns = detectDismissPatterns(loops);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].loopType).toBe("scheduling");
    expect(patterns[0].count).toBe(3);
  });

  it("ignores patterns older than TTL", async () => {
    const { detectDismissPatterns } = await import("../dismiss-patterns");
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const loops = [
      { id: "1", status: "dismissed", loopType: "scheduling", closedAt: old.toISOString(), createdAt: old.toISOString() },
      { id: "2", status: "dismissed", loopType: "scheduling", closedAt: old.toISOString(), createdAt: old.toISOString() },
      { id: "3", status: "dismissed", loopType: "scheduling", closedAt: old.toISOString(), createdAt: old.toISOString() },
      { id: "4", status: "open", loopType: "scheduling", createdAt: now.toISOString() },
      { id: "5", status: "open", loopType: "scheduling", createdAt: now.toISOString() },
      { id: "6", status: "open", loopType: "scheduling", createdAt: now.toISOString() },
    ] as any;
    const patterns = detectDismissPatterns(loops);
    expect(patterns).toHaveLength(0);
  });
});
