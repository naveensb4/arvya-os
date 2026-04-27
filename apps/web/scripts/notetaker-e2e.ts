import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "../.env.local") });

import { getRepository } from "../lib/db/repository";
import {
  ingestNotetakerTranscript,
  MockRecallClient,
  runNotetakerCalendarSync,
  handleNotetakerWebhook,
  reuseOrCreateNotetakerCalendar,
} from "../lib/notetaker/runtime";

type MockEventConfig = { mockEvents?: Array<Record<string, unknown>> };

let pass = 0;
let fail = 0;
function expect(name: string, condition: boolean, detail?: string) {
  if (condition) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

(async () => {
  const repo = getRepository();
  const brains = await repo.listBrains();
  if (!brains[0]) {
    console.error("No brain available; aborting.");
    process.exit(1);
  }
  const brainId = brains[0].id;
  console.log(`Brain: ${brains[0].name} (${brainId})`);

  console.log("\n=== Full sync via mock client ===");
  const startISO = new Date(Date.now() + 30 * 60_000).toISOString();
  const endISO = new Date(Date.now() + 90 * 60_000).toISOString();
  const calendar = await reuseOrCreateNotetakerCalendar({
    repository: repo,
    brainId,
    provider: "google_calendar",
    defaultExternalCalendarId: "primary",
    defaultConfig: {
      source: "smoke_test_mock",
      mockEvents: [
        {
          id: `mock-evt-${Date.now()}`,
          title: "Arvya investor sync",
          description: "Mock event",
          meeting_url: "https://meet.google.com/mock-abc-defg",
          start_time: startISO,
          end_time: endISO,
          participants: [{ email: "investor@example.com" }, { email: "naveen@arvya.ai" }],
        },
      ],
    },
  });
  await repo.updateNotetakerCalendar(calendar.id, {
    status: "connected",
    autoJoinEnabled: true,
    autoJoinMode: "all_calls",
    config: {
      ...calendar.config,
      mockEvents: (calendar.config as MockEventConfig).mockEvents,
      credentials: { access_token: "mock", refresh_token: "mock" },
      source: "smoke_test_mock",
    },
  });

  const summaries = await runNotetakerCalendarSync({ client: new MockRecallClient() });
  const summary = summaries.find((s) => s.calendarId === calendar.id);
  expect("sync ran for our calendar", Boolean(summary));
  expect("sync found one event", summary?.itemsFound === 1, JSON.stringify(summary));
  expect("sync scheduled one bot", summary?.scheduled === 1, JSON.stringify(summary));

  const meetings = await repo.listNotetakerMeetings({ calendarId: calendar.id });
  const meeting = meetings[0];
  expect("meeting persisted with bot id", Boolean(meeting?.recallBotId));
  expect("meeting auto_join_decision = join", meeting?.autoJoinDecision === "join");

  console.log("\n=== Idempotent re-sync ===");
  const summaries2 = await runNotetakerCalendarSync({ client: new MockRecallClient() });
  const summary2 = summaries2.find((s) => s.calendarId === calendar.id);
  expect("re-sync skipped (already scheduled)", summary2?.scheduled === 0, JSON.stringify(summary2));

  console.log("\n=== Manual transcript ingest then duplicate ===");
  const uniqueTranscript = `Naveen: smoke run ${Date.now()}. Aaron: ack ${Math.random()}.`;
  const ingest = await ingestNotetakerTranscript({
    brainId,
    meeting,
    botId: meeting!.recallBotId,
    payload: {
      transcript: uniqueTranscript,
      transcript_id: `mock-transcript-${Date.now()}`,
    },
    client: new MockRecallClient(),
  });
  expect("first ingest creates source item", !ingest.duplicate && Boolean(ingest.sourceItem.id));

  const ingest2 = await ingestNotetakerTranscript({
    brainId,
    meeting: { ...meeting!, sourceItemId: ingest.sourceItem.id },
    botId: meeting!.recallBotId,
    payload: {
      transcript: uniqueTranscript,
      transcript_id: `mock-transcript-other`,
    },
    client: new MockRecallClient(),
  });
  expect("second ingest detected as duplicate", ingest2.duplicate === true);
  expect("duplicate keeps same source id", ingest2.sourceItem.id === ingest.sourceItem.id);

  console.log("\n=== Webhook ingest with nested Recall format (mock client) ===");
  const wResult = await handleNotetakerWebhook(
    {
      event: "transcript.done",
      event_id: `webhook-evt-${Date.now()}`,
      data: {
        bot: { id: meeting!.recallBotId, metadata: { brain_id: brainId, notetaker_meeting_id: meeting!.id } },
        transcript: { id: `nested-${Date.now()}` },
      },
      transcript: "Different content - new ingestion path through webhook handler.",
    },
    { client: new MockRecallClient() },
  );
  expect("webhook ingest finds prior meeting", Boolean((wResult as { result?: unknown }).result));

  console.log("\n=== Cleanup ===");
  await repo.deleteNotetakerCalendar(calendar.id);
  console.log(`  • removed calendar ${calendar.id}`);

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
