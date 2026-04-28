import assert from "node:assert/strict";
import { createCompanyDriftReview } from "../lib/brain/company-drift";
import { createBrain, generateCompanyDriftReview } from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import { resetAiClientForTests } from "../lib/ai";

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  resetRepositoryForTests();
  resetAiClientForTests();

  const repository = getRepository();
  const brain = await createBrain({
    name: "Arvya Company Brain",
    kind: "company",
    thesis: "Verify Company Brain catches drift and stores the review.",
  });

  const source = await repository.createSourceItem({
    brainId: brain.id,
    title: "Customer call about onboarding",
    type: "transcript",
    content: "The customer said onboarding is confusing and Naveen promised a follow-up.",
  });

  const dailyBrief = await repository.createSourceItem({
    brainId: brain.id,
    title: "Daily Founder Brief",
    type: "strategy_output",
    content: "Priorities:\n- Publish investor narrative: Fundraising story needs to be updated.",
    metadata: {
      domain_type: "daily_brief",
      structured_brief: {
        priorities: [{ title: "Publish investor narrative", detail: "Fundraising story needs to be updated." }],
      },
    },
  });

  const [insight] = await repository.createMemoryObjects([
    {
      brainId: brain.id,
      sourceItemId: source.id,
      objectType: "product_insight",
      name: "Onboarding is confusing",
      description: "Customer activation is blocked because onboarding is unclear.",
      confidence: 0.9,
      status: "open",
    },
  ]);

  const [loop] = await repository.createOpenLoops([
    {
      brainId: brain.id,
      sourceItemId: source.id,
      title: "Send onboarding follow-up",
      description: "Naveen promised to send the customer a follow-up.",
      loopType: "follow_up",
      status: "open",
      priority: "critical",
      dueDate: "2026-04-25T09:00:00.000Z",
      suggestedAction: "Send the promised onboarding follow-up.",
    },
  ]);

  const deterministicReview = createCompanyDriftReview({
    memoryObjects: [insight],
    openLoops: [loop],
    sourceItems: [source, dailyBrief],
    currentTime: new Date("2026-04-28T12:00:00.000Z").getTime(),
  });
  assert.ok(
    deterministicReview.findings.some((finding) => finding.alertType === "overdue_open_loop"),
    "expected deterministic review to flag overdue loop",
  );
  assert.ok(
    deterministicReview.findings.some((finding) => finding.alertType === "ownerless_high_priority_loop"),
    "expected deterministic review to flag ownerless critical loop",
  );
  assert.ok(
    deterministicReview.findings.some((finding) => finding.alertType === "strategic_priority_drift"),
    "expected deterministic review to flag priority without execution loop",
  );

  const { review, source: reportSource, alertsCreated } = await generateCompanyDriftReview(brain.id);
  assert.ok(review.findings.length >= 2, "expected stored drift review findings");
  assert.equal(reportSource.metadata?.domain_type, "company_drift_review");
  assert.match(reportSource.content, /Company Drift Review/);
  assert.ok(alertsCreated > 0, "expected drift review to create alerts");

  const alerts = await repository.listBrainAlerts({ brainId: brain.id });
  assert.ok(
    alerts.some((alert) => alert.alertType === "overdue_open_loop" && alert.openLoopId === loop.id),
    "expected overdue loop alert linked to open loop",
  );

  const runs = await repository.listAgentRuns(brain.id);
  assert.ok(
    runs.some((run) => run.name === "company_drift_review" && run.status === "succeeded"),
    "expected company drift review agent run",
  );

  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
    resetRepositoryForTests();
    assert.equal(getRepository().mode, "supabase");
  }

  console.log("Company drift verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
