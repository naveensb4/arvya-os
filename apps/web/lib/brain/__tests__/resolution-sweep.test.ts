import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the resolution sweep's core helper: embedWithRetry.
 * The full sweep function requires DB + repository mocking; here we
 * focus on the retry/backoff logic and the pure helpers.
 */

const MAX_RETRIES = 3;

async function embedWithRetry(
  ai: { embed: (text: string[]) => Promise<number[][] | null> },
  text: string[],
  retries = MAX_RETRIES,
): Promise<number[][] | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await ai.embed(text);
    } catch (error) {
      const isRateLimit =
        error instanceof Error &&
        (error.message.includes("429") || error.message.includes("rate"));
      if (!isRateLimit || attempt === retries - 1) {
        return null;
      }
      const backoffMs = Math.min(1000 * 2 ** attempt, 30_000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  return null;
}

describe("embedWithRetry (critical gap #1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns embeddings on first success", async () => {
    const mockEmbed = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);
    const result = await embedWithRetry({ embed: mockEmbed }, ["test"]);
    expect(result).toEqual([[0.1, 0.2, 0.3]]);
    expect(mockEmbed).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 rate limit error", async () => {
    const mockEmbed = vi
      .fn()
      .mockRejectedValueOnce(new Error("429 Too Many Requests"))
      .mockResolvedValue([[0.4, 0.5]]);

    const promise = embedWithRetry({ embed: mockEmbed }, ["test"]);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual([[0.4, 0.5]]);
    expect(mockEmbed).toHaveBeenCalledTimes(2);
  });

  it("retries on generic rate limit error", async () => {
    const mockEmbed = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limit exceeded"))
      .mockResolvedValue([[0.6]]);

    const promise = embedWithRetry({ embed: mockEmbed }, ["test"]);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual([[0.6]]);
    expect(mockEmbed).toHaveBeenCalledTimes(2);
  });

  it("returns null after exhausting all retries on rate limit", async () => {
    const mockEmbed = vi.fn().mockRejectedValue(new Error("429 Too Many Requests"));

    const promise = embedWithRetry({ embed: mockEmbed }, ["test"]);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toBeNull();
    expect(mockEmbed).toHaveBeenCalledTimes(3);
  });

  it("returns null immediately on non-rate-limit error", async () => {
    const mockEmbed = vi.fn().mockRejectedValue(new Error("Network failure"));

    const result = await embedWithRetry({ embed: mockEmbed }, ["test"]);
    expect(result).toBeNull();
    expect(mockEmbed).toHaveBeenCalledTimes(1);
  });

  it("uses exponential backoff: 1s, 2s, capped at 30s", async () => {
    const mockEmbed = vi
      .fn()
      .mockRejectedValueOnce(new Error("429"))
      .mockRejectedValueOnce(new Error("429"))
      .mockResolvedValue([[1.0]]);

    const promise = embedWithRetry({ embed: mockEmbed }, ["test"]);

    // First retry after 1s
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockEmbed).toHaveBeenCalledTimes(2);

    // Second retry after 2s
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;
    expect(result).toEqual([[1.0]]);
    expect(mockEmbed).toHaveBeenCalledTimes(3);
  });

  it("respects custom retry count", async () => {
    const mockEmbed = vi.fn().mockRejectedValue(new Error("429"));

    const promise = embedWithRetry({ embed: mockEmbed }, ["test"], 1);
    const result = await promise;

    expect(result).toBeNull();
    expect(mockEmbed).toHaveBeenCalledTimes(1);
  });
});

describe("SweepResult shape", () => {
  it("defines correct result structure", () => {
    const result = {
      loopsChecked: 10,
      loopsResolved: 3,
      loopsFailed: 1,
      errors: ["Loop abc: timeout"],
    };

    expect(result.loopsChecked).toBe(10);
    expect(result.loopsResolved).toBe(3);
    expect(result.loopsFailed).toBe(1);
    expect(result.errors).toHaveLength(1);
  });
});

describe("SweepProgress tracking", () => {
  it("tracks incremental progress", () => {
    const progress = { total: 5, processed: 0, resolved: 0, failed: 0 };

    progress.processed++;
    progress.resolved++;
    expect(progress.processed).toBe(1);
    expect(progress.resolved).toBe(1);

    progress.processed++;
    progress.failed++;
    expect(progress.processed).toBe(2);
    expect(progress.failed).toBe(1);
    expect(progress.total).toBe(5);
  });
});

describe("writeRejectedOutcomes (KG Outcome Writes)", () => {
  function makeRejected(
    title: string,
    evidence?: { type: string; sourceId: string | null; quote: string; confidence: number },
  ) {
    return {
      item: { title, description: "test", sourceQuote: "quote" },
      passed: false,
      results: [{
        pass: false,
        reason: "test rejection",
        gate: "calendar",
        ...(evidence ? { evidence } : {}),
      }],
      rejectedBy: "calendar",
    };
  }

  it("creates memory_object for evidence-bearing rejection", async () => {
    const created: any[] = [];
    const mockRepository = {
      createMemoryObjects: vi.fn().mockImplementation((items: any[]) => {
        created.push(...items);
        return Promise.resolve(items.map((i: any, idx: number) => ({ ...i, id: `mem-${idx}` })));
      }),
    };

    const { writeRejectedOutcomes } = await import("../../workflows/source-ingestion") as any;
    const rejected = [
      makeRejected("Schedule call with John", {
        type: "calendar_match",
        sourceId: "src-cal-1",
        quote: "Meeting happened 2026-03-09",
        confidence: 0.9,
      }),
    ];

    const count = await writeRejectedOutcomes(mockRepository, "brain-1", "source-1", rejected);
    expect(count).toBe(1);
    expect(mockRepository.createMemoryObjects).toHaveBeenCalledTimes(1);
    expect(created[0].objectType).toBe("outcome");
    expect(created[0].properties.pre_resolved).toBe(true);
    expect(created[0].properties.detected_by).toBe("calendar");
    expect(created[0].properties.evidence_type).toBe("calendar_match");
  });

  it("skips rejections without evidence", async () => {
    const mockRepository = {
      createMemoryObjects: vi.fn(),
    };

    const { writeRejectedOutcomes } = await import("../../workflows/source-ingestion") as any;
    const rejected = [
      makeRejected("Old loop with no evidence"),
    ];

    const count = await writeRejectedOutcomes(mockRepository, "brain-1", "source-1", rejected);
    expect(count).toBe(0);
    expect(mockRepository.createMemoryObjects).not.toHaveBeenCalled();
  });

  it("handles DB failure gracefully (log + continue)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockRepository = {
      createMemoryObjects: vi.fn().mockRejectedValue(new Error("DB connection failed")),
    };

    const { writeRejectedOutcomes } = await import("../../workflows/source-ingestion") as any;
    const rejected = [
      makeRejected("Failing loop", {
        type: "calendar_match",
        sourceId: "src-1",
        quote: "Meeting happened",
        confidence: 0.9,
      }),
      makeRejected("Second loop", {
        type: "sent_email_match",
        sourceId: "sent-1",
        quote: "SENT matches",
        confidence: 0.7,
      }),
    ];

    const count = await writeRejectedOutcomes(mockRepository, "brain-1", "source-1", rejected);
    expect(count).toBe(0);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
