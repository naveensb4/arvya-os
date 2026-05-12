import { describe, it, expect, vi } from "vitest";
import { analyzeTone } from "../tools/tone-analyze";
import type { AiClient, SourceItem } from "@arvya/core";

function makeMockAi(text = "Direct and concise, prefers bullet points"): AiClient {
  return {
    available: true,
    preferredProvider: "anthropic",
    embeddingModel: null,
    complete: vi.fn().mockResolvedValue({ text, provider: "anthropic" }),
    completeStructured: vi.fn(),
    embed: vi.fn().mockResolvedValue(null),
  };
}

function makeSourceItem(overrides: Partial<SourceItem> = {}): SourceItem {
  return {
    id: "si-1",
    brainId: "brain-1",
    title: "Email from john@acme.com",
    type: "email",
    content: "Hey team, john@acme.com wrote about the deal...",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("analyzeTone", () => {
  it("returns empty description when no matching source items found", async () => {
    const ai = makeMockAi();
    const result = await analyzeTone({
      attendeeEmail: "nobody@nowhere.com",
      attendeeName: "Nobody",
      sourceItems: [makeSourceItem()],
      ai,
    });

    expect(result.based_on_n_messages).toBe(0);
    expect(result.description).toBe("");
    expect(result.confidence).toBe(0);
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it("analyzes tone from matching email source items", async () => {
    const ai = makeMockAi("Formal and detailed, uses structured arguments");
    const result = await analyzeTone({
      attendeeEmail: "john@acme.com",
      attendeeName: "John",
      sourceItems: [
        makeSourceItem({ content: "john@acme.com sent a detailed proposal" }),
        makeSourceItem({ id: "si-2", content: "Follow up from John about pricing" }),
      ],
      ai,
    });

    expect(result.based_on_n_messages).toBe(2);
    expect(result.description).toBe("Formal and detailed, uses structured arguments");
    expect(result.confidence).toBeGreaterThan(0.4);
    expect(ai.complete).toHaveBeenCalledOnce();
  });

  it("returns low confidence when AI is unavailable", async () => {
    const ai = makeMockAi();
    ai.available = false;

    const result = await analyzeTone({
      attendeeEmail: "john@acme.com",
      attendeeName: "John",
      sourceItems: [makeSourceItem()],
      ai,
    });

    expect(result.based_on_n_messages).toBeGreaterThan(0);
    expect(result.confidence).toBe(0.1);
    expect(ai.complete).not.toHaveBeenCalled();
  });
});
