import assert from "node:assert/strict";
import { extractedOpenLoopSchema } from "@arvya/core";
import { resetAiClientForTests } from "../lib/ai";
import {
  addSourceAndIngest,
  bulkUpdateOpenLoops,
  createBrain,
  generateDailyFounderBrief,
  getOpenLoopReviewSnapshot,
  updateOpenLoopReview,
} from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  resetRepositoryForTests();
  resetAiClientForTests();

  try {
    const repository = getRepository();
    assert.equal(repository.mode, "in_memory");
    assert.equal(
      extractedOpenLoopSchema.parse({
        title: "Review default",
        description: "Send the default status check.",
      }).status,
      "needs_review",
    );

    const brain = await createBrain({
      name: "Open Loop Review Verification Brain",
      kind: "company",
      thesis: "Verify review controls, filters, source context, and daily brief gating.",
    });

    const source = await addSourceAndIngest({
      brainId: brain.id,
      title: "Open loop review transcript",
      type: "transcript",
      content:
        "Naveen should send the updated deck to Jane by Friday. PB should share the demo link with the prospect next week. We may need to follow up on the noisy maybe-item later.",
      externalUri: "https://drive.google.com/file/d/review-verification",
    });

    const reviewSnapshot = await getOpenLoopReviewSnapshot(brain.id);
    assert.ok(reviewSnapshot.openLoops.length >= 2, "expected extracted loops to review");
    assert.ok(
      reviewSnapshot.openLoops.every((loop) => loop.status === "needs_review"),
      "expected new lower-confidence extracted loops to default to needs_review",
    );
    assert.ok(
      reviewSnapshot.openLoops.every((loop) => loop.sourceItemId === source.id && loop.sourceQuote),
      "expected every loop to retain source transcript evidence",
    );

    const [firstLoop, secondLoop] = reviewSnapshot.openLoops;
    await updateOpenLoopReview(brain.id, firstLoop.id, {
      status: "open",
      owner: "Naveen",
      priority: "high",
      dueDate: "2026-05-01",
      outcome: "Approved for follow-up.",
      approvedAt: new Date().toISOString(),
      closedAt: null,
    });
    await updateOpenLoopReview(brain.id, secondLoop.id, {
      status: "dismissed",
      owner: "PB",
      outcome: "Dismissed as noise.",
      closedAt: new Date().toISOString(),
    });

    await bulkUpdateOpenLoops(
      brain.id,
      reviewSnapshot.openLoops.slice(2).map((loop) => loop.id),
      { owner: "PB", priority: "critical" },
    );

    const persisted = await repository.listOpenLoops(brain.id);
    const approved = persisted.find((loop) => loop.id === firstLoop.id);
    const dismissed = persisted.find((loop) => loop.id === secondLoop.id);
    assert.equal(approved?.status, "open");
    assert.equal(approved?.owner, "Naveen");
    assert.equal(approved?.priority, "high");
    assert.equal(dismissed?.status, "dismissed");
    assert.equal(dismissed?.outcome, "Dismissed as noise.");

    const [bulkClosedLoop] = await repository.createOpenLoops([
      {
        brainId: brain.id,
        sourceItemId: source.id,
        title: "Bulk close should still teach the Brain",
        description: "This loop already has an outcome before the bulk close.",
        loopType: "follow_up",
        status: "open",
        priority: "medium",
        outcome: "The founder follow-up converted into a customer pilot.",
      },
    ]);
    await bulkUpdateOpenLoops(brain.id, [bulkClosedLoop.id], {
      status: "closed",
      closedAt: new Date().toISOString(),
    });
    const outcomeMemories = await repository.listMemoryObjects(brain.id);
    assert.ok(
      outcomeMemories.some(
        (memory) =>
          memory.properties?.memory_source === "open_loop_outcome" &&
          memory.properties?.openLoopId === bulkClosedLoop.id,
      ),
      "expected bulk terminal update to promote loop outcome into memory",
    );

    const brief = await generateDailyFounderBrief(brain.id);
    assert.deepEqual(brief.openLoops.map((loop) => loop.id), [firstLoop.id]);
    assert.deepEqual(brief.actions.map((loop) => loop.id), [firstLoop.id]);
    assert.ok(
      brief.loopsToReview.every((loop) => loop.status === "needs_review"),
      "expected Daily Brief to keep review backlog separate",
    );
    assert.ok(
      !brief.openLoops.some((loop) => loop.status === "dismissed" || loop.status === "needs_review"),
      "expected Daily Brief action items to exclude dismissed and unreviewed loops",
    );

    console.log("Open loop review verification passed.");
  } finally {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    resetRepositoryForTests();
    resetAiClientForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
