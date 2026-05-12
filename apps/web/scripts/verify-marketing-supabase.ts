import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { closeDbForTests, getDb, schema } from "../lib/db/client";
import { resetAiClientForTests } from "../lib/ai";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import {
  generateMarketingDrafts,
  generateMarketingWeeklyReport,
  recordMarketingEvent,
  recordMarketingMetric,
  scheduleMarketingPost,
  submitMarketingInput,
  updateMarketingPost,
} from "../lib/marketing/store";

config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });

const REQUIRED_TABLES = [
  "marketing_content_items",
  "marketing_content_insights",
  "marketing_channel_posts",
  "marketing_post_metrics",
  "marketing_events",
  "marketing_experiments",
  "marketing_weekly_reports",
  "marketing_llm_usage",
];

async function assertMarketingTables() {
  const db = getDb();
  const rows = (await db.execute(sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
  `)) as unknown as Array<{ table_name: string }>;
  const found = new Set(rows.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((table) => !found.has(table));
  assert.deepEqual(missing, [], `Missing Marketing OS tables: ${missing.join(", ")}`);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required. Set it in .env.local or the shell before running this verifier.");
  }

  process.env.MARKETING_OS_DRY_RUN = "true";
  resetRepositoryForTests();
  resetAiClientForTests();

  const repository = getRepository();
  assert.equal(repository.mode, "supabase");
  await assertMarketingTables();

  const marker = randomUUID();
  let workspaceId: string | undefined;
  let brainId: string | undefined;

  try {
    const workspace = await repository.createWorkspace({
      name: `Marketing Supabase Verification Workspace ${marker}`,
    });
    workspaceId = workspace.id;
    const brain = await repository.createBrain({
      name: `Marketing Supabase Verification ${marker}`,
      kind: "company",
      thesis: "Temporary brain used to verify Marketing OS persistence.",
      workspaceId: workspace.id,
    });
    brainId = brain.id;

    const { item, insights } = await submitMarketingInput({
      brainId,
      sourcePlatform: "manual",
      sourceType: "manual_note",
      rawText:
        "A banker said deal teams need an always-on company brain that remembers buyer status, NDA follow-ups, MD briefing context, and customer proof from Outlook and meetings.",
    });
    assert.ok(item.id, "expected marketing content item");
    assert.ok(insights.length > 0, "expected marketing insights");

    const drafts = await generateMarketingDrafts(brainId);
    assert.ok(drafts.length > 0, "expected marketing drafts");

    const approved = await updateMarketingPost(drafts[0].id, {
      status: "approved",
      approvedBy: "verify",
      bodyText: drafts[0].bodyText,
    });
    assert.equal(approved?.status, "approved");

    const scheduled = await scheduleMarketingPost(approved!.id, { approvedBy: "verify" });
    assert.equal(scheduled.scheduled, true);
    assert.equal(scheduled.post?.status, "scheduled");

    await recordMarketingMetric(brainId, {
      channelPostId: approved!.id,
      impressions: 42,
      reactions: 4,
      comments: 1,
    });
    await recordMarketingEvent(brainId, {
      channelPostId: approved!.id,
      eventType: "dm",
      eventSource: "manual",
      description: "A prospect replied asking for a company brain demo.",
      attributionConfidence: "manual",
    });

    const report = await generateMarketingWeeklyReport(brainId);
    assert.ok(report.markdown.length > 200, "expected a substantive marketing report");
    assert.ok(report.summary.length > 20, "expected a report summary");
    assert.ok(report.recommendedExperiments.length > 0, "expected recommended experiments");

    console.log("Marketing Supabase verification passed", {
      brainId,
      contentItemId: item.id,
      insights: insights.length,
      drafts: drafts.length,
      scheduledPostId: scheduled.post?.id,
      reportId: report.id,
    });
  } finally {
    if (brainId) {
      try {
        await getDb().delete(schema.brains).where(eq(schema.brains.id, brainId));
      } catch (error) {
        console.warn("Marketing Supabase brain cleanup skipped:", error);
      }
    }
    if (workspaceId) {
      try {
        await getDb().delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
      } catch (error) {
        console.warn("Marketing Supabase workspace cleanup skipped:", error);
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
