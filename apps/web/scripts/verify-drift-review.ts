import assert from "node:assert/strict";
import { driftReviewSchema } from "@arvya/core";
import { resetAiClientForTests } from "../lib/ai";
import {
  createBrain,
  createBrainPriority,
  generateDriftReview,
  getLatestDriftReview,
} from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";

type Check = { label: string; passed: boolean; detail?: string };

const checks: Check[] = [];
function record(label: string, passed: boolean, detail?: string) {
  checks.push({ label, passed, detail });
  console.log(`${passed ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  resetRepositoryForTests();
  resetAiClientForTests();

  const repository = getRepository();

  const brain = await createBrain({
    name: "Verify Drift Review Brain",
    kind: "company",
    thesis: "Validate company drift review surfaces priority drift and dropped commitments.",
  });

  const callSource = await repository.createSourceItem({
    brainId: brain.id,
    title: "Customer call — Acme onboarding",
    type: "transcript",
    content: "Acme said onboarding is confusing. Naveen committed to send a follow-up doc.",
  });
  const infraSource = await repository.createSourceItem({
    brainId: brain.id,
    title: "Engineering note — infra migration",
    type: "note",
    content: "PB and engineering spent the week migrating Postgres infra to a new region.",
  });

  // Memory contradicts the priority (priority says ship beta; memory shows infra work + dropped customer follow-up).
  const memories = await repository.createMemoryObjects([
    {
      brainId: brain.id,
      sourceItemId: callSource.id,
      objectType: "commitment",
      name: "Acme follow-up doc",
      description: "Naveen committed to send Acme a follow-up doc.",
      confidence: 0.95,
      status: "open",
    },
    {
      brainId: brain.id,
      sourceItemId: infraSource.id,
      objectType: "decision",
      name: "Infra migration this week",
      description: "Engineering will spend the week on infra migration, not on beta.",
      confidence: 0.9,
      status: "open",
    },
    {
      brainId: brain.id,
      sourceItemId: callSource.id,
      objectType: "customer_feedback",
      name: "Acme onboarding pain",
      description: "Customer called onboarding confusing.",
      confidence: 0.85,
      status: "open",
    },
  ]);

  // Open loop that should have been closed: it's open with no owner and overdue.
  const overdue = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const loops = await repository.createOpenLoops([
    {
      brainId: brain.id,
      sourceItemId: callSource.id,
      title: "Send Acme follow-up doc",
      description: "Acme follow-up that never went out.",
      loopType: "follow_up",
      status: "open",
      priority: "critical",
      dueDate: overdue,
      suggestedAction: "Email Acme the follow-up doc.",
    },
  ]);

  // Priorities — first one is what the team is supposedly focused on.
  const priorityShip = await createBrainPriority(brain.id, {
    statement: "Ship beta to 10 design partner customers this week.",
    setBy: "naveen",
    horizon: "week",
    status: "active",
  });
  await createBrainPriority(brain.id, {
    statement: "Close the loop on outstanding customer commitments.",
    setBy: "naveen",
    horizon: "week",
    status: "active",
  });

  const result = await generateDriftReview(brain.id);
  const review = result.review;

  const parsed = driftReviewSchema.safeParse(review);
  record(
    "Drift review validates against Zod schema",
    parsed.success,
    parsed.success ? undefined : parsed.error.issues.map((i) => i.message).join("; "),
  );

  record(
    "Drift review has overall_alignment field",
    typeof review.overall_alignment === "string",
    review.overall_alignment,
  );
  record(
    "Drift review has summary_for_founders",
    typeof review.summary_for_founders === "string" && review.summary_for_founders.length > 0,
  );

  record(
    "Drift review surfaces at least one signal",
    review.signals.length > 0,
    `signals=${review.signals.length}`,
  );

  const targetSignal = review.signals.find(
    (s) => s.type === "priority_drifting" || s.type === "commitment_dropped",
  );
  record(
    "At least one signal of type priority_drifting or commitment_dropped",
    Boolean(targetSignal),
    targetSignal ? `type=${targetSignal.type}, severity=${targetSignal.severity}` : undefined,
  );

  // Citations must reference real ids.
  const sourceIds = new Set([callSource.id, infraSource.id]);
  const memoryIds = new Set(memories.map((m) => m.id));
  const priorityIds = new Set([priorityShip.id]);
  const refsAreReal = review.signals.every((signal) => {
    const allSourceRefsValid = signal.source_refs.every((id) => sourceIds.has(id));
    const allMemoryRefsValid = signal.memory_refs.every((id) => memoryIds.has(id));
    const allPriorityRefsValid = (signal.priority_refs ?? []).every((id) =>
      priorityIds.has(id),
    );
    return allSourceRefsValid && allMemoryRefsValid && allPriorityRefsValid;
  });
  record("All citation refs in signals are real ids (or empty)", refsAreReal);

  const someRefsExist = review.signals.some(
    (signal) =>
      signal.source_refs.length > 0 ||
      signal.memory_refs.length > 0 ||
      (signal.priority_refs ?? []).length > 0,
  );
  record(
    "At least one signal includes at least one source/memory/priority ref",
    someRefsExist,
  );

  const latest = await getLatestDriftReview(brain.id);
  record(
    "Latest drift review is persisted as an agent_run",
    Boolean(latest && latest.review.signals.length === review.signals.length),
    latest ? `agentRunId=${latest.agentRunId}` : undefined,
  );

  // Confirm the priority used in seed isn't unused.
  void loops;

  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
    resetRepositoryForTests();
  }

  const failed = checks.filter((c) => !c.passed);
  console.log(
    `\n${failed.length === 0 ? "✅" : "❌"} Drift review verifier: ${
      checks.length - failed.length
    }/${checks.length} checks passed.`,
  );
  if (failed.length > 0) {
    process.exit(1);
  }

  assert.ok(true);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
