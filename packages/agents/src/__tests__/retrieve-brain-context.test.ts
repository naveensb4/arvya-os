import { describe, it, expect, vi } from "vitest";
import {
  createRetrieveBrainContextTool,
  CrossBrainAccessError,
} from "../tools/retrieve-brain-context";
import type { MemoryObject, OpenLoop, SourceItem } from "@arvya/core";

const BRAIN_A = "brain-aaa";
const BRAIN_B = "brain-bbb";

function makeMockRetriever(brainId: string) {
  return vi.fn().mockImplementation(async (input: { brainId: string; question: string }) => {
    if (input.brainId !== brainId) {
      return [];
    }
    return [
      {
        memoryObject: {
          id: `mo-${brainId}`,
          brainId,
          objectType: "person",
          name: "Test Person",
          description: "From brain context",
          createdAt: new Date().toISOString(),
        } satisfies MemoryObject,
        score: 0.9,
      },
      {
        openLoop: {
          id: `ol-${brainId}`,
          brainId,
          title: "Follow up",
          description: "Open loop",
          loopType: "follow_up",
          status: "open",
          priority: "medium",
          requiresHumanApproval: false,
          createdAt: new Date().toISOString(),
        } satisfies OpenLoop,
        score: 0.8,
      },
      {
        sourceItem: {
          id: `si-${brainId}`,
          brainId,
          title: "Email thread",
          type: "email",
          content: "Hello world",
          createdAt: new Date().toISOString(),
        } satisfies SourceItem,
        score: 0.7,
      },
    ];
  });
}

describe("createRetrieveBrainContextTool", () => {
  it("returns deduplicated memory objects, open loops, and source items", async () => {
    const retriever = makeMockRetriever(BRAIN_A);
    const tool = createRetrieveBrainContextTool({
      brainId: BRAIN_A,
      retrieveFn: retriever,
    });

    const result = await tool("test query");

    expect(result.memoryObjects).toHaveLength(1);
    expect(result.openLoops).toHaveLength(1);
    expect(result.sourceItems).toHaveLength(1);
    expect(result.totalResults).toBe(3);
    expect(retriever).toHaveBeenCalledWith({
      brainId: BRAIN_A,
      question: "test query",
      limit: 20,
    });
  });

  it("always passes closure-bound brainId regardless of query content", async () => {
    const retriever = makeMockRetriever(BRAIN_A);
    const tool = createRetrieveBrainContextTool({
      brainId: BRAIN_A,
      retrieveFn: retriever,
    });

    await tool("tell me about brain-bbb secrets");

    expect(retriever).toHaveBeenCalledWith(
      expect.objectContaining({ brainId: BRAIN_A }),
    );
  });

  it("returns empty arrays when retriever returns nothing", async () => {
    const retriever = vi.fn().mockResolvedValue([]);
    const tool = createRetrieveBrainContextTool({
      brainId: BRAIN_A,
      retrieveFn: retriever,
    });

    const result = await tool("nothing here");

    expect(result.memoryObjects).toEqual([]);
    expect(result.openLoops).toEqual([]);
    expect(result.sourceItems).toEqual([]);
    expect(result.totalResults).toBe(0);
  });

  // CRITICAL REGRESSION: Cross-brain data isolation
  it("CRITICAL: closure-bound brainId prevents cross-brain leak", async () => {
    const retrieverA = makeMockRetriever(BRAIN_A);
    const retrieverB = makeMockRetriever(BRAIN_B);

    const toolA = createRetrieveBrainContextTool({
      brainId: BRAIN_A,
      retrieveFn: retrieverA,
    });

    const toolB = createRetrieveBrainContextTool({
      brainId: BRAIN_B,
      retrieveFn: retrieverB,
    });

    const resultA = await toolA("shared query");
    const resultB = await toolB("shared query");

    // Tool A should only return Brain A data
    expect(retrieverA).toHaveBeenCalledWith(
      expect.objectContaining({ brainId: BRAIN_A }),
    );
    expect(resultA.memoryObjects[0]?.id).toBe(`mo-${BRAIN_A}`);

    // Tool B should only return Brain B data
    expect(retrieverB).toHaveBeenCalledWith(
      expect.objectContaining({ brainId: BRAIN_B }),
    );
    expect(resultB.memoryObjects[0]?.id).toBe(`mo-${BRAIN_B}`);

    // Verify no cross-contamination
    expect(resultA.memoryObjects.every((m) => m.brainId === BRAIN_A)).toBe(true);
    expect(resultB.memoryObjects.every((m) => m.brainId === BRAIN_B)).toBe(true);
    expect(resultA.openLoops.every((l) => l.brainId === BRAIN_A)).toBe(true);
    expect(resultB.openLoops.every((l) => l.brainId === BRAIN_B)).toBe(true);
  });
});
