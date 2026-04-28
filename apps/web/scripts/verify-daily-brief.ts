import assert from "node:assert/strict";
import { structuredDailyBriefSchema } from "@arvya/core";
import { resetAiClientForTests } from "../lib/ai";
import {
  createBrain,
  createBrainPriority,
  generateDailyFounderBrief,
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
    name: "Verify Daily Brief Brain",
    kind: "company",
    thesis: "Validate the structured daily founder brief end-to-end.",
  });

  const callSource = await repository.createSourceItem({
    brainId: brain.id,
    title: "Customer call — Acme onboarding",
    type: "transcript",
    content:
      "Acme said onboarding is confusing. Naveen committed to send a follow-up doc by Friday.",
  });

  const investorSource = await repository.createSourceItem({
    brainId: brain.id,
    title: "Investor email — Sequoia",
    type: "email",
    content:
      "Sequoia partner asked for an updated narrative around moat and timing. They want a follow-up call.",
  });

  const memories = await repository.createMemoryObjects([
    {
      brainId: brain.id,
      sourceItemId: callSource.id,
      objectType: "product_insight",
      name: "Onboarding is confusing",
      description: "Customer activation blocked by unclear onboarding.",
      confidence: 0.9,
      status: "open",
    },
    {
      brainId: brain.id,
      sourceItemId: callSource.id,
      objectType: "commitment",
      name: "Send Acme follow-up doc",
      description: "Naveen committed to send Acme the onboarding follow-up by Friday.",
      confidence: 0.95,
      status: "open",
    },
    {
      brainId: brain.id,
      sourceItemId: investorSource.id,
      objectType: "investor_feedback",
      name: "Sequoia narrative request",
      description: "Sequoia wants the moat and timing story refreshed.",
      confidence: 0.85,
      status: "open",
    },
    {
      brainId: brain.id,
      sourceItemId: callSource.id,
      objectType: "risk",
      name: "Acme deal at risk",
      description: "If we miss the follow-up, Acme could churn before the trial ends.",
      confidence: 0.7,
      status: "open",
    },
    {
      brainId: brain.id,
      sourceItemId: callSource.id,
      objectType: "customer_feedback",
      name: "Acme onboarding feedback",
      description: "Acme rep called the onboarding flow confusing twice on the call.",
      confidence: 0.8,
      status: "open",
    },
  ]);
  assert.ok(memories.length === 5, "expected 5 memory objects to be seeded");

  const now = new Date("2026-04-28T12:00:00.000Z");
  const overdue = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();
  const dueSoon = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const future = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const loops = await repository.createOpenLoops([
    {
      brainId: brain.id,
      sourceItemId: callSource.id,
      title: "Send Acme onboarding follow-up doc",
      description: "Promised to Acme on the call last week.",
      loopType: "follow_up",
      status: "in_progress",
      priority: "critical",
      owner: "Naveen",
      dueDate: overdue,
      suggestedAction: "Email Acme the follow-up doc.",
    },
    {
      brainId: brain.id,
      sourceItemId: investorSource.id,
      title: "Reply to Sequoia narrative request",
      description: "Investor email requesting an updated moat narrative.",
      loopType: "follow_up",
      status: "open",
      priority: "high",
      owner: "Naveen",
      dueDate: dueSoon,
      suggestedAction: "Send Sequoia the refreshed narrative.",
    },
    {
      brainId: brain.id,
      sourceItemId: callSource.id,
      title: "Spec onboarding fix",
      description: "Engineering spec for fixing the onboarding flow.",
      loopType: "task",
      status: "open",
      priority: "medium",
      owner: "PB",
      dueDate: future,
      suggestedAction: "Draft the v1 spec for the new onboarding.",
    },
    {
      brainId: brain.id,
      title: "Backlog cleanup",
      description: "Routine backlog hygiene loop.",
      loopType: "task",
      status: "open",
      priority: "low",
    },
  ]);
  assert.ok(loops.length === 4, "expected 4 open loops to be seeded");

  await createBrainPriority(brain.id, {
    statement: "Ship beta to 10 design partner customers by end of week.",
    setBy: "naveen",
    horizon: "week",
    status: "active",
  });
  await createBrainPriority(brain.id, {
    statement: "Refresh investor narrative around moat and timing.",
    setBy: "naveen",
    horizon: "week",
    status: "active",
  });

  const brief = await generateDailyFounderBrief(brain.id);

  record("Brief returned a structured daily brief", Boolean(brief.structured));
  if (!brief.structured) {
    process.exit(1);
  }
  const structured = brief.structured;

  const parsed = structuredDailyBriefSchema.safeParse(structured);
  record(
    "Structured brief validates against Zod schema",
    parsed.success,
    parsed.success ? undefined : parsed.error.issues.map((i) => i.message).join("; "),
  );

  // Required sections present (all keys must be arrays).
  const requiredSections = [
    "top_priorities_today",
    "overdue_follow_ups",
    "due_soon",
    "high_intent_relationships",
    "product_insights_to_act_on",
    "marketing_opportunities",
    "risks_and_dropped_balls",
    "suggested_actions_naveen",
    "suggested_actions_pb",
    "questions_to_resolve",
  ] as const;
  for (const section of requiredSections) {
    record(
      `Section "${section}" is present and an array`,
      Array.isArray((structured as Record<string, unknown>)[section]),
    );
  }
  record("date is set", typeof structured.date === "string" && structured.date.length > 0);
  record("generated_at is set", typeof structured.generated_at === "string" && structured.generated_at.length > 0);

  // Overdue follow-ups must include the Acme overdue loop.
  const acmeOverdue = structured.overdue_follow_ups.some((item) =>
    item.title.toLowerCase().includes("acme") || loops[0].id === item.open_loop_id,
  );
  record(
    "Overdue follow-ups include the overdue Acme loop",
    acmeOverdue,
    `count=${structured.overdue_follow_ups.length}`,
  );

  // Due soon should include the Sequoia loop (~2 days away).
  const dueSoonHasSequoia = structured.due_soon.some((item) =>
    loops[1].id === item.open_loop_id || item.title.toLowerCase().includes("sequoia"),
  );
  record(
    "Due-soon includes the Sequoia loop",
    dueSoonHasSequoia,
    `count=${structured.due_soon.length}`,
  );

  // At least one citation must reference a real source or memory id.
  const sourceIds = new Set([callSource.id, investorSource.id]);
  const memoryIds = new Set(memories.map((m) => m.id));
  const allRefs: string[] = [
    ...structured.high_intent_relationships.flatMap((r) => r.source_refs),
    ...structured.product_insights_to_act_on.flatMap((r) => r.source_refs),
    ...structured.marketing_opportunities.flatMap((r) => r.source_refs),
    ...structured.risks_and_dropped_balls.flatMap((r) => r.source_refs),
    ...(structured.suggested_actions_naveen.flatMap((r) => r.source_refs ?? [])),
    ...(structured.suggested_actions_pb.flatMap((r) => r.source_refs ?? [])),
  ];
  const realRef = allRefs.some((ref) => sourceIds.has(ref) || memoryIds.has(ref));
  record(
    "At least one citation references a real source or memory id",
    realRef,
    `total refs collected=${allRefs.length}`,
  );

  // Top priorities should be non-empty (we seeded two).
  record(
    "top_priorities_today is non-empty",
    structured.top_priorities_today.length > 0,
    `count=${structured.top_priorities_today.length}`,
  );

  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
    resetRepositoryForTests();
  }

  const failed = checks.filter((c) => !c.passed);
  console.log(
    `\n${failed.length === 0 ? "✅" : "❌"} Daily brief verifier: ${
      checks.length - failed.length
    }/${checks.length} checks passed.`,
  );
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
