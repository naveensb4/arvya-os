import { resetRepositoryForTests } from "@/lib/db/repository";
import {
  generateMarketingDrafts,
  generateMarketingWeeklyReport,
  recordMarketingEvent,
  recordMarketingMetric,
  scheduleMarketingPost,
  submitMarketingInput,
  updateMarketingPost,
} from "@/lib/marketing/store";

async function main() {
  delete process.env.DATABASE_URL;
  process.env.MARKETING_OS_DRY_RUN = "true";
  resetRepositoryForTests();

  const brainId = "arvya-company-brain";
  const { item, insights } = await submitMarketingInput({
    brainId,
    sourcePlatform: "manual",
    sourceType: "manual_note",
    rawText:
      "A banker said the hardest part of weekly deal updates is reconstructing buyer status, NDA follow-ups, and MD briefing context from scattered Outlook threads.",
  });
  if (!item.id || insights.length === 0) throw new Error("Marketing input did not create insights.");

  const drafts = await generateMarketingDrafts(brainId);
  if (drafts.length === 0) throw new Error("Marketing draft generation returned no drafts.");

  const approved = await updateMarketingPost(drafts[0].id, {
    status: "approved",
    approvedBy: "verify",
    bodyText: drafts[0].bodyText,
  });
  if (!approved || approved.status !== "approved") throw new Error("Marketing post was not approved.");

  const scheduled = await scheduleMarketingPost(approved.id, { approvedBy: "verify" });
  if (!scheduled.scheduled || scheduled.post?.status !== "scheduled") throw new Error("Marketing post was not scheduled.");

  await recordMarketingMetric(brainId, {
    channelPostId: approved.id,
    impressions: 100,
    reactions: 5,
    comments: 1,
  });
  await recordMarketingEvent(brainId, {
    channelPostId: approved.id,
    eventType: "dm",
    eventSource: "manual",
    description: "A prospect replied asking for a demo.",
    attributionConfidence: "manual",
  });
  const report = await generateMarketingWeeklyReport(brainId);
  if (!report.markdown.includes("Marketing Weekly Report")) throw new Error("Weekly report markdown was not generated.");

  console.log("Marketing OS verification passed", {
    contentItemId: item.id,
    insights: insights.length,
    drafts: drafts.length,
    scheduledPostId: scheduled.post?.id,
    reportId: report.id,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
