import assert from "node:assert/strict";
import { resetAiClientForTests } from "../lib/ai";
import {
  addSourceAndIngest,
  answerBrainQuestion,
  createBrain,
  getBrainSnapshot,
} from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

  delete process.env.DATABASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  resetRepositoryForTests();
  resetAiClientForTests();

  const repository = getRepository();
  assert.equal(repository.mode, "in_memory");

  try {
    for (const kind of ["sell_side", "buy_side"] as const) {
      const brain = await createBrain({
        name: kind === "sell_side" ? "Sell-Side Deal Brain Smoke" : "Buy-Side Deal Brain Smoke",
        kind,
        thesis: "Verify AI-first deal memory, open-loop detection, and source-backed answers.",
      });

      await addSourceAndIngest({
        brainId: brain.id,
        title: "Deal workflow smoke note",
        type: "note",
        content:
          "Maya at Acme asked for the diligence tracker by Friday. PB owns the CIM update. The key deal risk is missing buyer follow-up after the management meeting.",
      });

      const snapshot = await getBrainSnapshot(brain.id);
      assert.equal(snapshot.selectedBrain.kind, kind);
      assert.ok(snapshot.memoryObjects.length > 0, `${kind} expected source-backed memory`);
      assert.ok(snapshot.openLoops.length >= 2, `${kind} expected deal open loops`);
      assert.ok(
        snapshot.openLoops.some((loop) => /asked for the diligence tracker/i.test(loop.sourceQuote ?? loop.description)),
        `${kind} expected requested diligence tracker loop`,
      );
      assert.ok(
        snapshot.openLoops.some((loop) => /PB owns the CIM update/i.test(loop.sourceQuote ?? loop.description)),
        `${kind} expected CIM ownership loop`,
      );
      assert.ok(
        snapshot.openLoops.some((loop) => loop.loopType === "deal" || loop.loopType === "diligence"),
        `${kind} expected deal-specific loop classification`,
      );

      const answer = await answerBrainQuestion(brain.id, "What deal follow-ups do we owe?");
      assert.ok(answer.citations.length > 0, `${kind} expected source-backed citations`);
      assert.ok(
        answer.citations.some((citation) => /diligence tracker|CIM update|buyer follow-up/i.test(citation.evidence)),
        `${kind} expected citations from deal workflow note`,
      );
      assert.match(answer.answer, /diligence|tracker|CIM|follow|buyer/i);
    }

    console.log("Deal Brain verification passed.");
  } finally {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalAnthropicApiKey) process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    if (originalOpenAiApiKey) process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    resetRepositoryForTests();
    resetAiClientForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
