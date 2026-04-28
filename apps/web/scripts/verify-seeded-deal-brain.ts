import { config } from "dotenv";
import { strict as assert } from "node:assert";
import { resetAiClientForTests } from "../lib/ai";
import { answerBrainQuestion } from "../lib/brain/store";
import { closeDbForTests } from "../lib/db/client";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";

config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });

const BRAIN_ID = process.argv[2] ?? "b8e505ad-32cc-439e-ad6a-aaddf78a7603";

async function main() {
  resetRepositoryForTests();
  resetAiClientForTests();
  const repository = getRepository();
  assert.equal(repository.mode, "supabase", "must run against live Supabase");

  console.log(`Verifying seeded Deal Brain: ${BRAIN_ID}`);
  const brain = await repository.getBrain(BRAIN_ID);
  assert(brain, `brain ${BRAIN_ID} not found`);
  console.log(`  brain: ${brain.name} (${brain.kind})`);

  const sourceItems = await repository.listSourceItems(BRAIN_ID);
  console.log(`  sourceItems: ${sourceItems.length}`);
  assert(sourceItems.length >= 4, `expected >=4 sources, got ${sourceItems.length}`);

  const memoryObjects = await repository.listMemoryObjects(BRAIN_ID);
  console.log(`  memoryObjects: ${memoryObjects.length}`);
  assert(memoryObjects.length >= 30, `expected >=30 memories, got ${memoryObjects.length}`);

  const memoryNames = memoryObjects.map((m) => m.name.toLowerCase());
  const requiredEntities = ["acme", "vector", "highmark", "crane", "maya", "diligence"];
  for (const entity of requiredEntities) {
    const hit = memoryNames.find((n) => n.includes(entity));
    assert(hit, `expected memory referencing "${entity}"`);
    console.log(`  ✓ memory has: ${entity} -> "${hit}"`);
  }

  const openLoops = await repository.listOpenLoops(BRAIN_ID);
  console.log(`  openLoops: ${openLoops.length}`);
  assert(openLoops.length >= 10, `expected >=10 loops, got ${openLoops.length}`);

  const loopText = openLoops.map((l) => `${l.title} ${l.description}`).join(" ").toLowerCase();
  for (const phrase of ["diligence", "side letter", "working capital"]) {
    assert(loopText.includes(phrase), `expected open loop mentioning "${phrase}"`);
    console.log(`  ✓ open loop mentions: ${phrase}`);
  }

  const agentRuns = await repository.listAgentRuns(BRAIN_ID);
  console.log(`  agentRuns: ${agentRuns.length}`);
  assert(agentRuns.length >= 4, `expected >=4 agent runs, got ${agentRuns.length}`);
  const succeeded = agentRuns.filter((r) => r.status === "succeeded").length;
  console.log(`  agentRuns succeeded: ${succeeded}/${agentRuns.length}`);

  console.log("\nAsking 3 questions live...\n");
  const questions = [
    "What follow-ups do I owe by Friday?",
    "Which bidders are most at risk of dropping?",
    "What's the timeline for the second round bid?",
  ];

  for (const question of questions) {
    const t0 = Date.now();
    const answer = await answerBrainQuestion(BRAIN_ID, question);
    const ms = Date.now() - t0;
    console.log(`Q: ${question}`);
    console.log(`A (${ms}ms, ${answer.citations.length} citations):`);
    console.log(`   ${answer.answer.slice(0, 400).replace(/\n/g, "\n   ")}...`);
    assert(answer.answer.length > 100, "answer too short");
    assert(answer.citations.length >= 3, `expected >=3 citations, got ${answer.citations.length}`);
    for (const citation of answer.citations.slice(0, 3)) {
      assert(citation.sourceTitle, "citation missing sourceTitle");
      console.log(`   [${citation.confidence?.toFixed(2)}] ${citation.sourceTitle}`);
    }
    console.log();
  }

  console.log("✅ Live Deal Brain verification passed.");
}

main()
  .then(async () => {
    resetRepositoryForTests();
    resetAiClientForTests();
    await closeDbForTests();
  })
  .catch(async (err) => {
    console.error(err);
    try {
      await closeDbForTests();
    } catch {}
    process.exit(1);
  });
