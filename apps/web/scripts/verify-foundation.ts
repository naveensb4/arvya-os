import assert from "node:assert/strict";
import { resetAiClientForTests } from "../lib/ai";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import {
  addSourceAndIngest,
  answerBrainQuestion,
  createBrain,
  generateDailyFounderBrief,
  getBrainSnapshot,
  updateOpenLoopStatus,
} from "../lib/brain/store";

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  resetRepositoryForTests();
  resetAiClientForTests();

  const repository = getRepository();
  assert.equal(repository.mode, "in_memory");

  const brain = await createBrain({
    name: "Arvya Company Brain",
    kind: "company",
    thesis: "Verify first-class primitives and source-backed core loop.",
  });

  await addSourceAndIngest({
    brainId: brain.id,
    title: "Follow-up verification note",
    type: "note",
    content:
      "Naveen met Jane Investor at Example Capital. Send the updated deck by Friday. Share the demo link with PB. The customer workflow pain is that founder notes are scattered across email and calls.",
  });

  const snapshot = await getBrainSnapshot(brain.id);
  assert.equal(snapshot.sourceItems.length, 1);
  assert.ok(snapshot.memoryObjects.length > 0, "expected memory objects");
  assert.ok(snapshot.openLoops.length >= 2, "expected follow-up open loops");
  assert.ok(snapshot.workflows.length >= 1, "expected workflow record");
  assert.ok(
    snapshot.agentRuns.some((run) => run.stepName === "classify_source"),
    "expected classify_source agent run",
  );
  assert.ok(
    snapshot.agentRuns.some((run) => run.stepName === "extract_memory"),
    "expected extract_memory agent run",
  );
  assert.ok(
    snapshot.agentRuns.some((run) => run.stepName === "detect_open_loops"),
    "expected detect_open_loops agent run",
  );
  assert.ok(
    snapshot.agentRuns.some((run) => run.stepName === "generate_suggested_actions"),
    "expected generate_suggested_actions agent run",
  );
  assert.ok(
    snapshot.agentRuns.some((run) => run.stepName === "save_results"),
    "expected save_results agent run",
  );

  const answer = await answerBrainQuestion(brain.id, "What follow-ups do we owe?");
  assert.ok(answer.citations.length > 0, "expected source-backed citations");
  assert.ok(
    answer.citations.some((citation) => citation.evidence.includes("Send the updated deck")),
    "expected answer to cite source follow-up quote",
  );
  assert.match(answer.answer, /deck|demo|send|share|follow/i);

  const brief = await generateDailyFounderBrief(brain.id);
  assert.equal(brief.openLoops.length, 0, "expected unreviewed loops to stay out of action items");
  assert.ok(
    brief.loopsToReview.some((loop) => loop.title.includes("Send the updated deck")),
    "expected daily brief to separately include the loop review backlog",
  );

  const afterAgents = await getBrainSnapshot(brain.id);
  assert.ok(
    afterAgents.agentRuns.some((run) => run.name === "ask_brain"),
    "expected ask brain agent run",
  );
  assert.ok(
    afterAgents.agentRuns.some((run) => run.name === "daily_brief"),
    "expected daily brief agent run",
  );

  const loopToClose = afterAgents.openLoops.find((loop) =>
    loop.title.includes("Send the updated deck"),
  );
  assert.ok(loopToClose, "expected open loop to close");
  await updateOpenLoopStatus(
    brain.id,
    loopToClose.id,
    "closed",
    "Deck sent to Jane Investor after verification.",
  );

  const persistedLoops = await repository.listOpenLoops(brain.id);
  const closedLoop = persistedLoops.find((loop) => loop.id === loopToClose.id);
  assert.equal(closedLoop?.status, "closed");
  assert.equal(closedLoop?.outcome, "Deck sent to Jane Investor after verification.");
  assert.ok(closedLoop?.closedAt, "expected closed_at to persist");

  const memoriesAfterClose = await repository.listMemoryObjects(brain.id);
  const outcomeMemory = memoriesAfterClose.find(
    (memory) =>
      memory.properties?.memory_source === "open_loop_outcome" &&
      memory.properties?.openLoopId === loopToClose.id,
  );
  assert.ok(outcomeMemory, "expected closed loop outcome to become durable memory");
  assert.match(outcomeMemory.description, /Deck sent to Jane Investor/);
  assert.equal(outcomeMemory.sourceItemId, loopToClose.sourceItemId);

  await updateOpenLoopStatus(
    brain.id,
    loopToClose.id,
    "closed",
    "Deck sent to Jane Investor after verification.",
  );
  const outcomeMemoriesAfterRetry = (await repository.listMemoryObjects(brain.id)).filter(
    (memory) =>
      memory.properties?.memory_source === "open_loop_outcome" &&
      memory.properties?.openLoopId === loopToClose.id,
  );
  assert.equal(outcomeMemoriesAfterRetry.length, 1, "expected outcome memory promotion to be idempotent");

  const outcomeAnswer = await answerBrainQuestion(brain.id, "What happened after the deck follow-up was closed?");
  assert.match(outcomeAnswer.answer, /Deck sent|Jane Investor|verification/i);
  assert.ok(
    outcomeAnswer.citations.some((citation) => citation.memoryObjectId === outcomeMemory.id),
    "expected Ask Brain to cite outcome memory",
  );

  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
    resetRepositoryForTests();
    assert.equal(getRepository().mode, "supabase");
  }

  console.log("Foundation verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
