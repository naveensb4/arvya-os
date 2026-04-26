import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { resetAiClientForTests } from "../lib/ai";
import {
  addSourceAndIngest,
  answerBrainQuestion,
  createBrain,
  updateOpenLoopStatus,
} from "../lib/brain/store";
import { closeDbForTests, getDb, schema } from "../lib/db/client";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";

config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Set it in .env.local or the shell before running pnpm verify:supabase.");
  }
}

async function main() {
  requireDatabaseUrl();
  resetRepositoryForTests();
  resetAiClientForTests();

  const repository = getRepository();
  assert.equal(repository.mode, "supabase");

  const marker = randomUUID();
  let brainId: string | undefined;

  try {
    const brain = await createBrain({
      name: `Supabase Persistence Verification ${marker}`,
      kind: "company",
      thesis: "Temporary Brain used to verify real Supabase persistence.",
    });
    brainId = brain.id;

    const sourceItem = await addSourceAndIngest({
      brainId: brain.id,
      title: `Supabase follow-up verification ${marker}`,
      type: "note",
      content:
        "Naveen met Jane Investor at Example Capital. Send the updated deck by Friday. Share the demo link with PB. The customer workflow pain is that founder notes are scattered across email and calls.",
    });

    const [
      persistedSource,
      sourceItems,
      memoryObjects,
      openLoops,
      workflows,
      agentRuns,
    ] = await Promise.all([
      repository.getSourceItem(sourceItem.id),
      repository.listSourceItems(brain.id),
      repository.listMemoryObjects(brain.id),
      repository.listOpenLoops(brain.id),
      repository.listWorkflows(brain.id),
      repository.listAgentRuns(brain.id),
    ]);

    assert.equal(persistedSource?.id, sourceItem.id, "expected source_item to persist");
    assert.ok(sourceItems.some((source) => source.id === sourceItem.id), "expected source_items row");
    assert.ok(memoryObjects.length > 0, "expected memory_objects rows");
    assert.ok(openLoops.length >= 2, "expected open_loops rows");
    assert.ok(workflows.some((workflow) => workflow.sourceItemId === sourceItem.id), "expected workflows row");
    assert.ok(
      agentRuns.some((run) => run.name === "source_ingestion" && run.sourceItemId === sourceItem.id),
      "expected source_ingestion agent_runs rows",
    );

    const answer = await answerBrainQuestion(brain.id, "What follow-ups do we owe?");
    assert.ok(answer.citations.length > 0, "expected answer to cite persisted sources");
    assert.ok(
      answer.citations.some(
        (citation) =>
          citation.sourceItemId === sourceItem.id &&
          /updated deck|demo link|Send the updated deck|Share the demo link/i.test(citation.evidence),
      ),
      "expected answer citation to point back to the verification source",
    );

    const loopToClose = (await repository.listOpenLoops(brain.id)).find((loop) =>
      /updated deck|demo link/i.test(`${loop.title} ${loop.description} ${loop.sourceQuote ?? ""}`),
    );
    assert.ok(loopToClose, "expected an open loop to close");

    const outcome = `Supabase verification outcome ${marker}`;
    await updateOpenLoopStatus(brain.id, loopToClose.id, "closed", outcome);

    const persistedLoops = await repository.listOpenLoops(brain.id);
    const closedLoop = persistedLoops.find((loop) => loop.id === loopToClose.id);
    assert.equal(closedLoop?.status, "closed");
    assert.equal(closedLoop?.outcome, outcome);
    assert.ok(closedLoop?.closedAt, "expected closed_at to persist");

    const postAskRuns = await repository.listAgentRuns(brain.id);
    assert.ok(postAskRuns.some((run) => run.name === "ask_brain"), "expected ask_brain agent_run row");

    console.log("Supabase persistence verification passed.");
  } finally {
    if (brainId) {
      try {
        await getDb().delete(schema.brains).where(eq(schema.brains.id, brainId));
      } catch (error) {
        console.warn("Supabase verification cleanup skipped:", error);
      }
    }
    resetRepositoryForTests();
    resetAiClientForTests();
    await closeDbForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
