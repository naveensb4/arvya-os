import assert from "node:assert/strict";
import { resetAiClientForTests } from "../lib/ai";
import { createBrain, getBrainSnapshot } from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import {
  MockRecallClient,
  handleNotetakerWebhook,
  runNotetakerCalendarSync,
  scheduleNotetakerBotForMeeting,
  shouldJoinMeeting,
  skipNotetakerMeeting,
  verifyRecallWebhookSignature,
  type NotetakerCalendarEvent,
} from "../lib/notetaker/runtime";

let pass = 0;
let fail = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    pass += 1;
    console.log(`✅ ${label}`);
  } catch (error) {
    fail += 1;
    console.log(`❌ ${label}`);
    console.log(`   ${(error as Error).message}`);
  }
}

const now = new Date("2026-04-25T16:00:00.000Z");
const futureStart = new Date(Date.now() + 30 * 60 * 1000).toISOString();
const futureEnd = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const validEvent: NotetakerCalendarEvent = {
  id: "evt-valid-arvya",
  title: "Arvya Notetaker planning",
  description: "Discuss Recall calendar automation and open loop extraction.",
  meetingUrl: "https://meet.google.com/abc-defg-hij",
  startTime: futureStart,
  endTime: futureEnd,
  participants: [{ email: "naveen@arvya.com" }, { email: "pb@arvya.com" }],
};

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  resetRepositoryForTests();
  resetAiClientForTests();

  try {
    const repository = getRepository();
    assert.equal(repository.mode, "in_memory");

    check("auto-join policy keeps meeting URLs and skips disqualified events", () => {
      assert.equal(shouldJoinMeeting(validEvent, { autoJoinEnabled: true, autoJoinMode: "all_calls" }, now).decision, "join");
      assert.equal(shouldJoinMeeting({ ...validEvent, id: "evt-no-url", meetingUrl: undefined }, { autoJoinEnabled: true, autoJoinMode: "all_calls" }, now).decision, "skip");
      assert.equal(shouldJoinMeeting({ ...validEvent, id: "evt-canceled", isCanceled: true }, { autoJoinEnabled: true, autoJoinMode: "all_calls" }, now).decision, "skip");
      assert.equal(shouldJoinMeeting({ ...validEvent, id: "evt-all-day", isAllDay: true }, { autoJoinEnabled: true, autoJoinMode: "all_calls" }, now).decision, "skip");
      assert.equal(shouldJoinMeeting({ ...validEvent, id: "evt-ended", endTime: "2026-04-25T15:00:00.000Z" }, { autoJoinEnabled: true, autoJoinMode: "all_calls" }, now).decision, "skip");
      assert.equal(shouldJoinMeeting({ ...validEvent, id: "evt-no-bot", title: "no-notetaker customer call" }, { autoJoinEnabled: true, autoJoinMode: "all_calls" }, now).decision, "skip");
    });

    check("recall webhook signature fails closed in production without secret", () => {
      assert.equal(verifyRecallWebhookSignature({ body: "{}" }), true, "dev without Recall webhook secret should allow local mock testing");
      const mutableEnv = process.env as Record<string, string | undefined>;
      const originalNodeEnv = process.env.NODE_ENV;
      mutableEnv.NODE_ENV = "production";
      try {
        assert.equal(verifyRecallWebhookSignature({ body: "{}" }), false);
      } finally {
        if (originalNodeEnv === undefined) {
          delete mutableEnv.NODE_ENV;
        } else {
          mutableEnv.NODE_ENV = originalNodeEnv;
        }
      }
    });

    const brain = await createBrain({
      name: "Arvya Company Brain",
      kind: "company",
      thesis: "Verify Notetaker captures meeting transcripts into the Brain ingestion pipeline.",
    });
    const calendar = await repository.createNotetakerCalendar({
      brainId: brain.id,
      provider: "google_calendar",
      status: "connected",
      autoJoinEnabled: true,
      autoJoinMode: "all_calls",
      recallCalendarId: "mock-calendar",
      config: {
        mockEvents: [
          validEvent,
          { ...validEvent, id: "evt-private-no-details", title: "", isPrivate: true },
          { ...validEvent, id: "evt-no-url", meetingUrl: undefined },
          { ...validEvent, id: "evt-canceled", isCanceled: true },
        ],
      },
    });

    const sync = await runNotetakerCalendarSync({ client: new MockRecallClient() });
    check("calendar sync schedules exactly one bot for the valid event", () => {
      assert.equal(sync[0]?.status, "completed");
      assert.equal(sync[0]?.itemsFound, 4);
      assert.equal(sync[0]?.scheduled, 1);
    });

    const meetings = await repository.listNotetakerMeetings({ calendarId: calendar.id });
    const scheduledMeeting = meetings.find((meeting) => meeting.externalEventId === validEvent.id);
    check("scheduled meeting carries decision + bot id", () => {
      assert.ok(scheduledMeeting);
      assert.equal(scheduledMeeting?.autoJoinDecision, "join");
      assert.equal(scheduledMeeting?.botStatus, "scheduled");
      assert.ok(scheduledMeeting?.recallBotId);
      assert.ok(meetings.some((meeting) => meeting.externalEventId === "evt-canceled" && meeting.autoJoinDecision === "skip"));
    });

    const calendarsAfterFirst = await repository.listNotetakerCalendars({ brainId: brain.id });
    const calendarAfterFirst = calendarsAfterFirst.find((item) => item.id === calendar.id);
    check("calendar.lastSyncAt advanced (notetaker watermark)", () => {
      assert.ok(calendarAfterFirst?.lastSyncAt);
    });

    const lastSyncAtFirst = calendarAfterFirst?.lastSyncAt ?? null;

    // Re-running calendar sync without new events must remain idempotent (no duplicate bots).
    const reSync = await runNotetakerCalendarSync({ client: new MockRecallClient() });
    const meetingsAfterReSync = await repository.listNotetakerMeetings({ calendarId: calendar.id });
    check("re-running calendar sync does not double-schedule bots", () => {
      assert.equal(reSync[0]?.status, "completed");
      const scheduledCount = meetingsAfterReSync.filter((meeting) => meeting.botStatus === "scheduled").length;
      assert.equal(scheduledCount, 1);
    });
    const calendarsAfterReSync = await repository.listNotetakerCalendars({ brainId: brain.id });
    const calendarAfterReSync = calendarsAfterReSync.find((item) => item.id === calendar.id);
    check("calendar.lastSyncAt is set on every successful run", () => {
      assert.ok(calendarAfterReSync?.lastSyncAt);
      const before = lastSyncAtFirst ? Date.parse(lastSyncAtFirst) : 0;
      const after = calendarAfterReSync?.lastSyncAt ? Date.parse(calendarAfterReSync.lastSyncAt) : 0;
      assert.ok(after >= before);
    });

    const manualMeeting = await repository.createNotetakerMeeting({
      brainId: brain.id,
      notetakerCalendarId: calendar.id,
      provider: "google_calendar",
      externalEventId: "evt-manual",
      title: "Manual Notetaker scheduling test",
      meetingUrl: "https://meet.google.com/manual-test",
      startTime: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
      autoJoinDecision: "needs_review",
      autoJoinReason: "manual_test",
    });
    const manuallyScheduled = await scheduleNotetakerBotForMeeting({
      brainId: brain.id,
      meetingId: manualMeeting.id,
      client: new MockRecallClient(),
      manual: true,
    });
    check("manual schedule action routes through Recall", () => assert.equal(manuallyScheduled.botStatus, "scheduled"));
    const manuallySkipped = await skipNotetakerMeeting({ brainId: brain.id, meetingId: manualMeeting.id });
    check("manual skip action marks meeting skipped", () => assert.equal(manuallySkipped.autoJoinDecision, "skip"));

    const transcript =
      "Naveen and PB decided Arvya Notetaker should auto-join Arvya calendar calls with a visible kill switch. Naveen should follow up with PB next week to live test Recall webhooks and confirm Google and Outlook calendar OAuth setup.";
    const webhookPayload = {
      brain_id: brain.id,
      event_id: "recall-transcript-done-1",
      event_type: "transcript.done",
      bot_id: scheduledMeeting?.recallBotId,
      transcript_id: "transcript-1",
      transcript,
    };
    const webhook = await handleNotetakerWebhook(webhookPayload, { client: new MockRecallClient() });
    check("first transcript webhook ingests as new source", () => assert.equal(webhook.duplicate, false));

    const afterWebhook = await getBrainSnapshot(brain.id);
    const transcriptSource = afterWebhook.sourceItems.find((source) => source.metadata?.domain_type === "meeting_transcript");
    check("transcript becomes a meeting_transcript source_item with dedupe keys", () => {
      assert.ok(transcriptSource);
      assert.equal(transcriptSource?.metadata?.source_system, "recall");
      assert.equal((transcriptSource?.metadata?.source_trace as Record<string, unknown> | undefined)?.source_kind, "transcript");
      assert.equal(transcriptSource?.content, transcriptSource?.content?.trim());
      assert.ok(Array.isArray(transcriptSource?.metadata?.dedupe_keys));
    });
    check("transcript ingestion produces memory + open loops", () => {
      assert.ok(afterWebhook.memoryObjects.some((memory) => memory.sourceItemId === transcriptSource?.id));
      assert.ok(afterWebhook.openLoops.some((loop) => loop.sourceItemId === transcriptSource?.id));
    });

    const linkedMeeting = (await repository.listNotetakerMeetings({ calendarId: calendar.id }))
      .find((meeting) => meeting.externalEventId === validEvent.id);
    check("scheduled meeting links back to the transcript source_item", () => {
      assert.equal(linkedMeeting?.sourceItemId, transcriptSource?.id);
    });

    const sourceCountBeforeRetry = afterWebhook.sourceItems.length;
    const loopCountBeforeRetry = afterWebhook.openLoops.length;
    await handleNotetakerWebhook(webhookPayload, { client: new MockRecallClient() });
    const afterRetry = await getBrainSnapshot(brain.id);
    check("retrying the same webhook is idempotent (transcript_id dedupe)", () => {
      assert.equal(afterRetry.sourceItems.length, sourceCountBeforeRetry);
      assert.equal(afterRetry.openLoops.length, loopCountBeforeRetry);
    });

    const routedWithoutBrainHint = await handleNotetakerWebhook({
      event_id: "recall-transcript-done-no-brain-hint",
      event_type: "transcript.done",
      bot_id: scheduledMeeting?.recallBotId,
      transcript_id: "transcript-1-renamed",
      transcript,
    }, { client: new MockRecallClient() });
    const afterNoHint = await getBrainSnapshot(brain.id);
    check("webhook without brain_id still routes through scheduled bot and dedupes by content", () => {
      assert.equal(routedWithoutBrainHint.duplicate, false);
      assert.equal(afterNoHint.sourceItems.length, sourceCountBeforeRetry);
    });

    if (fail > 0) {
      console.log(`\nNotetaker mock verification: ${pass} passed, ${fail} failed`);
      process.exit(1);
    }
    console.log(`\nNotetaker mock verification passed: ${pass}/${pass} checks`);
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
