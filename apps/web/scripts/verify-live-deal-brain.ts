import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { resetAiClientForTests } from "../lib/ai";
import {
  createBrain,
  getBrainSnapshot,
  updateOpenLoopStatus,
} from "../lib/brain/store";
import { answerFromContext } from "@arvya/agents/ask-brain-agent";
import { ingestSourceIntoBrain } from "../lib/workflows/source-ingestion";
import { closeDbForTests, getDb, schema } from "../lib/db/client";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import type { BrainKind } from "@arvya/core";

config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Set it in .env.local or the shell before running pnpm verify:live-deal-brain.",
    );
  }
}

const dealNoteContent =
  "Maya at Acme Capital asked for the diligence tracker by Friday. " +
  "PB owns the CIM update for the new buyer list. " +
  "The key deal risk is missing buyer follow-up after the Wednesday management meeting; Naveen needs to confirm buyer next steps before Monday's IC prep. " +
  "Action item: Naveen to send the updated quality of earnings memo to Acme Capital tomorrow.";

async function withHeartbeat<T>(label: string, call: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  const interval = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(`${label} still running after ${elapsedSeconds}s...`);
  }, 10_000);
  try {
    return await call();
  } finally {
    clearInterval(interval);
  }
}

async function verifyKind(kind: BrainKind, marker: string) {
  const repository = getRepository();
  assert.equal(repository.mode, "supabase", `${kind}: repository must be supabase-backed`);

  console.log(`[${kind}] creating verification brain...`);
  const brain = await createBrain({
    name:
      kind === "sell_side"
        ? `Live Sell-Side Deal Brain ${marker}`
        : `Live Buy-Side Deal Brain ${marker}`,
    kind,
    thesis: "Live verification: source-backed deal memory, open loops, and Q&A.",
  });

  try {
    console.log(`[${kind}] ingesting deal verification source...`);
    const ingestion = await withHeartbeat(`[${kind}] ingestion`, () =>
      ingestSourceIntoBrain({
        brainId: brain.id,
        title: `Deal verification note ${marker}`,
        type: "note",
        content: dealNoteContent,
        externalUri: undefined,
        metadata: { connector_type: "gmail", verification_mode: "deterministic_live_db" },
      }),
    );
    const sourceItem = ingestion.sourceItem;

    console.log(`[${kind}] reading persisted brain state...`);
    const [snapshot, sourceItems, memoryObjects, openLoops, agentRuns] = await Promise.all([
      getBrainSnapshot(brain.id),
      repository.listSourceItems(brain.id),
      repository.listMemoryObjects(brain.id),
      repository.listOpenLoops(brain.id),
      repository.listAgentRuns(brain.id),
    ]);

    assert.equal(snapshot.selectedBrain.kind, kind, `${kind}: brain kind mismatch`);
    assert.ok(
      sourceItems.some((item) => item.id === sourceItem.id),
      `${kind}: expected ingested source persisted`,
    );
    assert.ok(memoryObjects.length > 0, `${kind}: expected memory_objects rows`);
    assert.ok(openLoops.length >= 2, `${kind}: expected at least 2 open loops`);
    assert.ok(
      openLoops.some((loop) =>
        /diligence tracker|CIM update|buyer next steps|quality of earnings/i.test(
          `${loop.title} ${loop.description} ${loop.sourceQuote ?? ""}`,
        ),
      ),
      `${kind}: expected an open loop derived from the deal note`,
    );
    assert.ok(
      agentRuns.some((run) => run.name === "source_ingestion" && run.sourceItemId === sourceItem.id),
      `${kind}: expected source_ingestion agent_runs row`,
    );

    console.log(`[${kind}] asking source-backed deal follow-up question...`);
    const answer = await answerFromContext({
      question: "What deal follow-ups do we owe?",
      memoryObjects,
      openLoops,
      sourceItems,
      brain,
    });
    assert.ok(answer.citations.length > 0, `${kind}: expected source-backed citations`);
    assert.ok(
      answer.citations.some(
        (citation) =>
          citation.sourceItemId === sourceItem.id &&
          /diligence tracker|CIM update|buyer next steps|quality of earnings/i.test(
            citation.evidence,
          ),
      ),
      `${kind}: expected citation back to the deal verification note`,
    );
    assert.match(answer.answer, /diligence|tracker|CIM|buyer|follow|memo|IC/i);

    const loopToClose = openLoops.find((loop) =>
      /diligence tracker|CIM update|buyer next steps|quality of earnings/i.test(
        `${loop.title} ${loop.description} ${loop.sourceQuote ?? ""}`,
      ),
    );
    assert.ok(loopToClose, `${kind}: expected at least one deal-related loop to close`);

    const outcome = `Live deal verification outcome ${marker} (${kind})`;
    console.log(`[${kind}] closing one deal loop with an outcome...`);
    await updateOpenLoopStatus(brain.id, loopToClose.id, "closed", outcome);

    const refreshedLoops = await repository.listOpenLoops(brain.id);
    const closedLoop = refreshedLoops.find((loop) => loop.id === loopToClose.id);
    assert.equal(closedLoop?.status, "closed", `${kind}: expected loop to persist as closed`);
    assert.equal(closedLoop?.outcome, outcome, `${kind}: expected outcome to persist`);
    assert.ok(closedLoop?.closedAt, `${kind}: expected closed_at to persist`);

    console.log(
      `[${kind}] live deal brain verified: ${memoryObjects.length} memory rows, ${openLoops.length} open loops, ${answer.citations.length} citations.`,
    );
  } finally {
    try {
      console.log(`[${kind}] cleaning up verification brain...`);
      await getDb().delete(schema.brains).where(eq(schema.brains.id, brain.id));
    } catch (cleanupError) {
      console.warn(`[${kind}] cleanup skipped:`, cleanupError);
    }
  }
}

async function main() {
  requireDatabaseUrl();
  resetRepositoryForTests();
  resetAiClientForTests();

  const marker = randomUUID();

  try {
    for (const kind of ["sell_side", "buy_side"] as const) {
      await verifyKind(kind, marker);
    }
    console.log("Live Deal Brain verification passed.");
  } finally {
    resetRepositoryForTests();
    resetAiClientForTests();
    await closeDbForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
