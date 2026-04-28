import assert from "node:assert/strict";
import type { Brain, IngestionResult, MemoryObjectType, SourceItem } from "@arvya/core";
import { ingestionExtractionFixtures } from "@arvya/agents/evals/ingestion-extraction-fixtures";
import { runSourceIngestionWorkflow } from "@arvya/agents/ingestion-agent";
import { getAiClient, resetAiClientForTests } from "../lib/ai";

const brain: Brain = {
  id: "brain_ingestion_eval",
  name: "Arvya Company Brain",
  kind: "company",
  thesis:
    "Company operating memory for people, companies, decisions, commitments, risks, product insights, feedback, and open loops.",
  createdAt: new Date("2026-04-28T00:00:00.000Z").toISOString(),
};

function sourceItem(index: number): SourceItem {
  const fixture = ingestionExtractionFixtures[index];
  return {
    id: `source_${fixture.id}`,
    brainId: brain.id,
    title: fixture.source.title,
    type: fixture.source.type,
    content: fixture.source.content,
    createdAt: brain.createdAt,
  };
}

function haystackForMemory(result: IngestionResult, objectType: string) {
  return result.memoryObjects
    .filter((memory) => memory.objectType === objectType)
    .map((memory) => `${memory.name}\n${memory.description}\n${memory.sourceQuote ?? ""}`)
    .join("\n")
    .toLowerCase();
}

function assertIncludes(haystack: string, needle: string, message: string) {
  assert.ok(haystack.includes(needle.toLowerCase()), message);
}

function assertDeterministicFixture(index: number, result: IngestionResult) {
  const fixture = ingestionExtractionFixtures[index];

  for (const expected of fixture.expected.memories) {
    assertIncludes(
      haystackForMemory(result, expected.objectType),
      expected.text,
      `${fixture.id}: expected ${expected.objectType} memory containing "${expected.text}"`,
    );
  }

  for (const expected of fixture.expected.openLoops) {
    const loop = result.openLoops.find((candidate) =>
      `${candidate.title}\n${candidate.description}\n${candidate.sourceQuote ?? ""}`
        .toLowerCase()
        .includes(expected.text.toLowerCase()),
    );
    assert.ok(loop, `${fixture.id}: expected open loop containing "${expected.text}"`);
    if (expected.loopType) {
      assert.equal(loop.loopType, expected.loopType, `${fixture.id}: expected loop type ${expected.loopType}`);
    }
    if (expected.requiresHumanApproval !== undefined) {
      assert.equal(
        loop.requiresHumanApproval,
        expected.requiresHumanApproval,
        `${fixture.id}: expected requiresHumanApproval=${expected.requiresHumanApproval}`,
      );
    }
  }

  for (const expected of fixture.expected.relationships) {
    assert.ok(
      result.relationships.some(
        (relationship) =>
          relationship.fromName === expected.fromName &&
          relationship.toName === expected.toName,
      ),
      `${fixture.id}: expected relationship ${expected.fromName} -> ${expected.toName}`,
    );
  }
}

function assertLlmSmoke(result: IngestionResult) {
  const objectTypes = new Set(result.memoryObjects.map((memory) => memory.objectType));
  const requiredTypes: MemoryObjectType[] = [
    "person",
    "company",
    "decision",
    "commitment",
    "risk",
    "product_insight",
  ];
  for (const required of requiredTypes) {
    assert.ok(objectTypes.has(required), `LLM extraction should include ${required}`);
  }
  assert.ok(result.openLoops.length >= 2, "LLM extraction should detect unresolved open loops");
  assert.ok(
    result.memoryObjects.every((memory) => memory.sourceQuote),
    "LLM extraction should keep source quotes on memory objects",
  );
}

async function main() {
  for (let index = 0; index < ingestionExtractionFixtures.length; index += 1) {
    const result = await runSourceIngestionWorkflow({
      brain,
      source: sourceItem(index),
    });
    assertDeterministicFixture(index, result);
  }

  resetAiClientForTests();
  const ai = getAiClient();
  if (ai.available) {
    const result = await runSourceIngestionWorkflow({
      brain,
      source: sourceItem(0),
      ai,
    });
    assertLlmSmoke(result);
    console.log("LLM-backed ingestion extraction smoke passed.");
  } else {
    console.log("LLM-backed ingestion extraction smoke skipped; no AI key configured.");
  }

  console.log("Ingestion extraction verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
