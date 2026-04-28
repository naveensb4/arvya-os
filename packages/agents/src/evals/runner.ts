import type {
  AiClient,
  Brain,
  IngestionResult,
  MemoryObjectType,
  SourceItem,
} from "@arvya/core";
import { runSourceIngestionWorkflow } from "../ingestion-agent";
import { closedLoopFixtures, type ClosedLoopFixture } from "./closed-loop-fixtures";

export type FixtureScore = {
  fixtureId: string;
  title: string;
  extractedKinds: MemoryObjectType[];
  expectedKinds: MemoryObjectType[];
  missingKinds: MemoryObjectType[];
  falsePositiveKinds: MemoryObjectType[];
  matchedExpectations: number;
  totalExpectations: number;
  loopMatches: number;
  loopExpected: number;
  score: number;
  durationMs: number;
  notes: string[];
  error?: string;
};

export type EvalRunSummary = {
  fixtures: FixtureScore[];
  aggregateScore: number;
  totalFixtures: number;
};

const evalBrain: Brain = {
  id: "brain_closed_loop_eval",
  name: "Arvya Closed-Loop Eval Brain",
  kind: "company",
  thesis:
    "Eval brain for verifying closed-loop ingestion: people, companies, decisions, commitments, risks, product insights, feedback, advisor input, outcomes, and outreach replies.",
  createdAt: new Date("2026-04-28T00:00:00.000Z").toISOString(),
};

function fixtureSourceItem(fixture: ClosedLoopFixture): SourceItem {
  return {
    id: `source_${fixture.id}`,
    brainId: evalBrain.id,
    title: fixture.source.title,
    type: fixture.classificationHint,
    content: fixture.source.content,
    createdAt: evalBrain.createdAt,
  };
}

function memoriesByKind(result: IngestionResult, kind: MemoryObjectType) {
  return result.memoryObjects.filter((memory) => memory.objectType === kind);
}

function memoryHaystack(result: IngestionResult, kind: MemoryObjectType) {
  return memoriesByKind(result, kind)
    .map(
      (memory) =>
        `${memory.name}\n${memory.description}\n${memory.sourceQuote ?? ""}`,
    )
    .join("\n")
    .toLowerCase();
}

function loopHaystack(result: IngestionResult) {
  return result.openLoops
    .map(
      (loop) => `${loop.title}\n${loop.description}\n${loop.sourceQuote ?? ""}`,
    )
    .join("\n")
    .toLowerCase();
}

function scoreFixture(
  fixture: ClosedLoopFixture,
  result: IngestionResult,
  durationMs: number,
): FixtureScore {
  const expectedKinds: MemoryObjectType[] = fixture.expected.memories.map(
    (memory) => memory.kind,
  );
  const extractedKindSet = new Set(
    result.memoryObjects.map((memory) => memory.objectType),
  );
  const extractedKinds: MemoryObjectType[] = [...extractedKindSet];

  const missingKinds: MemoryObjectType[] = [];
  let matchedExpectations = 0;
  let totalExpectations = 0;
  const notes: string[] = [];

  for (const expected of fixture.expected.memories) {
    totalExpectations += 1;
    const memories = memoriesByKind(result, expected.kind);
    if (memories.length < expected.minCount) {
      missingKinds.push(expected.kind);
      notes.push(
        `Missing ${expected.kind}: expected >=${expected.minCount}, got ${memories.length}`,
      );
      continue;
    }
    if (expected.entities && expected.entities.length > 0) {
      const haystack = memoryHaystack(result, expected.kind);
      const allFound = expected.entities.every((entity) =>
        haystack.includes(entity.toLowerCase()),
      );
      if (!allFound) {
        notes.push(
          `Entities not all present for ${expected.kind}: expected [${expected.entities.join(", ")}]`,
        );
        continue;
      }
    }
    matchedExpectations += 1;
  }

  let loopMatches = 0;
  const loopExpected = fixture.expected.openLoops.length;
  const loopText = loopHaystack(result);
  for (const expected of fixture.expected.openLoops) {
    totalExpectations += 1;
    if (!loopText.includes(expected.text.toLowerCase())) {
      notes.push(`Open loop missing fragment: "${expected.text}"`);
      continue;
    }
    if (expected.kind) {
      const matchingLoop = result.openLoops.find(
        (loop) =>
          `${loop.title}\n${loop.description}\n${loop.sourceQuote ?? ""}`
            .toLowerCase()
            .includes(expected.text.toLowerCase()) &&
          loop.loopType === expected.kind,
      );
      if (!matchingLoop) {
        notes.push(
          `Open loop kind mismatch: expected "${expected.kind}" for "${expected.text}"`,
        );
        continue;
      }
    }
    matchedExpectations += 1;
    loopMatches += 1;
  }

  const expectedKindSet = new Set(expectedKinds);
  const falsePositiveKinds = extractedKinds.filter(
    (kind) => !expectedKindSet.has(kind),
  );

  const score =
    totalExpectations === 0 ? 1 : matchedExpectations / totalExpectations;

  return {
    fixtureId: fixture.id,
    title: fixture.title,
    extractedKinds,
    expectedKinds,
    missingKinds,
    falsePositiveKinds,
    matchedExpectations,
    totalExpectations,
    loopMatches,
    loopExpected,
    score: Number(score.toFixed(3)),
    durationMs,
    notes,
  };
}

export async function runClosedLoopEvals(
  options: { ai?: AiClient; fixtures?: ClosedLoopFixture[] } = {},
): Promise<EvalRunSummary> {
  const fixtures = options.fixtures ?? closedLoopFixtures;
  const results: FixtureScore[] = [];

  for (const fixture of fixtures) {
    const start = Date.now();
    try {
      const result = await runSourceIngestionWorkflow({
        brain: evalBrain,
        source: fixtureSourceItem(fixture),
        ai: options.ai,
      });
      results.push(scoreFixture(fixture, result, Date.now() - start));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        fixtureId: fixture.id,
        title: fixture.title,
        extractedKinds: [],
        expectedKinds: fixture.expected.memories.map((memory) => memory.kind),
        missingKinds: fixture.expected.memories.map((memory) => memory.kind),
        falsePositiveKinds: [],
        matchedExpectations: 0,
        totalExpectations:
          fixture.expected.memories.length + fixture.expected.openLoops.length,
        loopMatches: 0,
        loopExpected: fixture.expected.openLoops.length,
        score: 0,
        durationMs: Date.now() - start,
        notes: [`Workflow threw: ${message}`],
        error: message,
      });
    }
  }

  const aggregateScore =
    results.length === 0
      ? 0
      : Number(
          (results.reduce((sum, item) => sum + item.score, 0) / results.length).toFixed(3),
        );

  return {
    fixtures: results,
    aggregateScore,
    totalFixtures: results.length,
  };
}

export function formatEvalSummary(summary: EvalRunSummary): string {
  const lines: string[] = [];
  lines.push("Closed-loop eval results:");
  for (const fixture of summary.fixtures) {
    const status = fixture.score >= 0.7 ? "✅" : fixture.score >= 0.4 ? "⚠️ " : "❌";
    lines.push(
      `${status} ${fixture.fixtureId} score=${fixture.score} matched=${fixture.matchedExpectations}/${fixture.totalExpectations} loops=${fixture.loopMatches}/${fixture.loopExpected} (${fixture.durationMs}ms)`,
    );
    if (fixture.missingKinds.length > 0) {
      lines.push(`   missing kinds: ${fixture.missingKinds.join(", ")}`);
    }
    if (fixture.falsePositiveKinds.length > 0) {
      lines.push(
        `   false-positive kinds: ${fixture.falsePositiveKinds.join(", ")}`,
      );
    }
    for (const note of fixture.notes) {
      lines.push(`   - ${note}`);
    }
    if (fixture.error) {
      lines.push(`   error: ${fixture.error}`);
    }
  }
  lines.push("");
  lines.push(
    `Aggregate score: ${summary.aggregateScore} across ${summary.totalFixtures} fixtures`,
  );
  return lines.join("\n");
}
