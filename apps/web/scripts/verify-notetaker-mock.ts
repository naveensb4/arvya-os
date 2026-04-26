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
  type NotetakerCalendarEvent,
} from "../lib/notetaker/runtime";

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

    const joinDecision = shouldJoinMeeting(validEvent, { autoJoinEnabled: true, autoJoinMode: "all_calls" }, now);
    assert.equal(joinDecision.decision, "join");
    assert.equal(shouldJoinMeeting({ ...validEvent, id: "evt-no-url", meetingUrl: undefined }, { autoJoinEnabled: true, autoJoinMode: "all_calls" }, now).decision, "skip");
    assert.equal(shouldJoinMeeting({ ...validEvent, id: "evt-canceled", isCanceled: true }, { autoJoinEnabled: true, autoJoinMode: "all_calls" }, now).decision, "skip");
    assert.equal(shouldJoinMeeting({ ...validEvent, id: "evt-all-day", isAllDay: true }, { autoJoinEnabled: true, autoJoinMode: "all_calls" }, now).decision, "skip");
    assert.equal(shouldJoinMeeting({ ...validEvent, id: "evt-ended", endTime: "2026-04-25T15:00:00.000Z" }, { autoJoinEnabled: true, autoJoinMode: "all_calls" }, now).decision, "skip");
    assert.equal(shouldJoinMeeting({ ...validEvent, id: "evt-no-bot", title: "no-notetaker customer call" }, { autoJoinEnabled: true, autoJoinMode: "all_calls" }, now).decision, "skip");

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
    assert.equal(sync[0]?.status, "completed");
    assert.equal(sync[0]?.itemsFound, 4);
    assert.equal(sync[0]?.scheduled, 1);

    const meetings = await repository.listNotetakerMeetings({ calendarId: calendar.id });
    const scheduledMeeting = meetings.find((meeting) => meeting.externalEventId === validEvent.id);
    assert.ok(scheduledMeeting, "expected valid event to become a notetaker meeting");
    assert.equal(scheduledMeeting.autoJoinDecision, "join");
    assert.equal(scheduledMeeting.botStatus, "scheduled");
    assert.ok(scheduledMeeting.recallBotId, "expected Recall bot to be scheduled");
    assert.ok(meetings.some((meeting) => meeting.externalEventId === "evt-canceled" && meeting.autoJoinDecision === "skip"));

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
    assert.equal(manuallyScheduled.botStatus, "scheduled", "expected manual schedule action to schedule bot");
    const manuallySkipped = await skipNotetakerMeeting({
      brainId: brain.id,
      meetingId: manualMeeting.id,
    });
    assert.equal(manuallySkipped.autoJoinDecision, "skip", "expected manual skip action to mark meeting skipped");

    const webhookPayload = {
      brain_id: brain.id,
      event_id: "recall-transcript-done-1",
      event_type: "transcript.done",
      bot_id: scheduledMeeting.recallBotId,
      transcript_id: "transcript-1",
      transcript:
        "Naveen and PB decided Arvya Notetaker should auto-join Arvya calendar calls with a visible kill switch. Naveen should follow up with PB next week to live test Recall webhooks and confirm Google and Outlook calendar OAuth setup.",
    };
    const webhook = await handleNotetakerWebhook(webhookPayload, { client: new MockRecallClient() });
    assert.equal(webhook.duplicate, false);

    const afterWebhook = await getBrainSnapshot(brain.id);
    const transcriptSource = afterWebhook.sourceItems.find((source) => source.metadata?.domain_type === "meeting_transcript");
    assert.ok(transcriptSource, "expected meeting transcript source item");
    assert.ok(afterWebhook.memoryObjects.some((memory) => memory.sourceItemId === transcriptSource.id), "expected memory objects from transcript");
    assert.ok(afterWebhook.openLoops.some((loop) => loop.sourceItemId === transcriptSource.id), "expected open loops from transcript");

    const linkedMeeting = (await repository.listNotetakerMeetings({ calendarId: calendar.id }))
      .find((meeting) => meeting.externalEventId === validEvent.id);
    assert.equal(linkedMeeting?.sourceItemId, transcriptSource.id, "expected meeting to link to source item");

    const sourceCountBeforeRetry = afterWebhook.sourceItems.length;
    const loopCountBeforeRetry = afterWebhook.openLoops.length;
    await handleNotetakerWebhook(webhookPayload, { client: new MockRecallClient() });
    const afterRetry = await getBrainSnapshot(brain.id);
    assert.equal(afterRetry.sourceItems.length, sourceCountBeforeRetry, "expected transcript retry to avoid duplicate source items");
    assert.equal(afterRetry.openLoops.length, loopCountBeforeRetry, "expected transcript retry to avoid duplicate open loops");

    console.log("Notetaker mock verification passed.");
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
