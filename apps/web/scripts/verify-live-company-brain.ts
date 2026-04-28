import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { resetAiClientForTests } from "../lib/ai";
import { addSourceAndIngest, answerBrainQuestion } from "../lib/brain/store";
import { closeDbForTests } from "../lib/db/client";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";

config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });

function requireLiveConfig() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for live Company Brain verification.");
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim() && !process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("ANTHROPIC_API_KEY or OPENAI_API_KEY is required for live Company Brain verification.");
  }
}

async function main() {
  requireLiveConfig();
  resetRepositoryForTests();
  resetAiClientForTests();

  const repository = getRepository();
  assert.equal(repository.mode, "supabase", "live Company Brain verification must use Supabase");

  const brains = await repository.listBrains();
  const companyBrain = brains.find((brain) => brain.name === "Arvya Company Brain");
  assert.ok(companyBrain, "expected Arvya Company Brain to exist");

  const marker = `live-company-${randomUUID()}`;
  const sourceItem = await addSourceAndIngest({
    brainId: companyBrain.id,
    title: `Live Company Brain verification ${marker}`,
    type: "note",
    content:
      `Live Company Brain verification marker ${marker}. ` +
      "Rowan Investor at Northstar Ventures asked for a source-backed founder brief by Friday. " +
      "PB committed to send the Recall transcript ingestion status by tomorrow. " +
      "Decision: prioritize Company Brain closed-loop reliability before Deal Brain polish. " +
      "Risk: without citations, the operating answer cannot be trusted.",
  });

  const [memoryObjects, openLoops] = await Promise.all([
    repository.listMemoryObjects(companyBrain.id, { limit: 200 }),
    repository.listOpenLoops(companyBrain.id, { limit: 200 }),
  ]);

  assert.ok(
    memoryObjects.some((memory) => memory.sourceItemId === sourceItem.id),
    "expected memory objects from live Company Brain source",
  );
  assert.ok(
    openLoops.some((loop) => loop.sourceItemId === sourceItem.id),
    "expected open loops from live Company Brain source",
  );

  const answer = await answerBrainQuestion(
    companyBrain.id,
    `What did Rowan ask for in ${marker}, and what did PB commit to send?`,
  );

  assert.match(answer.answer, /founder brief|Recall transcript|Rowan|PB/i);
  assert.ok(answer.citations.length > 0, "expected citations in Company Brain answer");
  assert.ok(
    answer.citations.some(
      (citation) =>
        citation.sourceItemId === sourceItem.id &&
        /founder brief|Recall transcript|Rowan|PB/i.test(citation.evidence),
    ),
    "expected citation back to the live Company Brain verification source",
  );

  console.log(
    `Live Company Brain verified: source=${sourceItem.id}, memory=${memoryObjects.length}, openLoops=${openLoops.length}, citations=${answer.citations.length}`,
  );
  console.log(answer.answer);

  resetRepositoryForTests();
  resetAiClientForTests();
  await closeDbForTests();
}

main().catch(async (error) => {
  console.error(error);
  resetRepositoryForTests();
  resetAiClientForTests();
  await closeDbForTests();
  process.exit(1);
});
