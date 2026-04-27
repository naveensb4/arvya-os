import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "../.env.local") });
loadEnv({ path: resolve(__dirname, "../../../.env.local") });

import {
  shouldJoinMeeting,
  verifyRecallWebhookSignature,
  type NotetakerCalendarEvent,
} from "../lib/notetaker/runtime";

let pass = 0;
let fail = 0;

function expect(name: string, condition: boolean, detail?: string) {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function evt(partial: Partial<NotetakerCalendarEvent> = {}): NotetakerCalendarEvent {
  const now = Date.now();
  const defaults: NotetakerCalendarEvent = {
    id: "evt",
    title: "Sync with Aaron",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    startTime: new Date(now + 30 * 60_000).toISOString(),
    endTime: new Date(now + 60 * 60_000).toISOString(),
    participants: [],
    metadata: {},
  };
  return { ...defaults, ...partial };
}

console.log("\n=== Auto-join decision matrix ===");

expect(
  "auto_join_disabled returns skip",
  shouldJoinMeeting(evt(), { autoJoinEnabled: false, autoJoinMode: "all_calls" }).decision === "skip",
);

expect(
  "manual_only returns needs_review",
  shouldJoinMeeting(evt(), { autoJoinEnabled: true, autoJoinMode: "manual_only" }).decision === "needs_review",
);

expect(
  "all_calls joins valid meeting",
  shouldJoinMeeting(evt(), { autoJoinEnabled: true, autoJoinMode: "all_calls" }).decision === "join",
);

expect(
  "missing meeting URL skips",
  shouldJoinMeeting(evt({ meetingUrl: undefined, description: "no link" }), {
    autoJoinEnabled: true,
    autoJoinMode: "all_calls",
  }).decision === "skip",
);

expect(
  "canceled event skips",
  shouldJoinMeeting(evt({ isCanceled: true }), { autoJoinEnabled: true, autoJoinMode: "all_calls" }).decision === "skip",
);

expect(
  "all-day event skips",
  shouldJoinMeeting(evt({ isAllDay: true }), { autoJoinEnabled: true, autoJoinMode: "all_calls" }).decision === "skip",
);

expect(
  "ended event skips",
  shouldJoinMeeting(
    evt({ endTime: new Date(Date.now() - 60_000).toISOString() }),
    { autoJoinEnabled: true, autoJoinMode: "all_calls" },
  ).decision === "skip",
);

expect(
  "no-notetaker marker in title skips",
  shouldJoinMeeting(evt({ title: "Strategy chat #no-notetaker" }), {
    autoJoinEnabled: true,
    autoJoinMode: "all_calls",
  }).decision === "skip",
);

expect(
  "arvya_related_only skips unrelated meeting",
  shouldJoinMeeting(evt({ title: "Lunch with mom" }), {
    autoJoinEnabled: true,
    autoJoinMode: "arvya_related_only",
  }).decision === "skip",
);

expect(
  "arvya_related_only joins arvya meeting",
  shouldJoinMeeting(evt({ title: "Arvya weekly demo", description: "" }), {
    autoJoinEnabled: true,
    autoJoinMode: "arvya_related_only",
  }).decision === "join",
);

expect(
  "external_only skips when only internal participants",
  shouldJoinMeeting(
    evt({ participants: [{ email: "naveen@arvya.ai" }, { email: "team@arvya.ai" }] }),
    { autoJoinEnabled: true, autoJoinMode: "external_only" },
  ).decision === "skip",
);

expect(
  "external_only joins when external participant present",
  shouldJoinMeeting(
    evt({ participants: [{ email: "investor@example.com" }, { email: "naveen@arvya.ai" }] }),
    { autoJoinEnabled: true, autoJoinMode: "external_only" },
  ).decision === "join",
);

console.log("\n=== Webhook signature replay protection ===");

const secret = process.env.RECALL_WEBHOOK_SECRET ?? "";
if (!secret) {
  console.log("  ! skipping signature tests (RECALL_WEBHOOK_SECRET not set)");
} else {
  const body = JSON.stringify({ event: "ping", event_id: "ping-1" });
  const id = "msg_test";
  const ts = Math.floor(Date.now() / 1000).toString();
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");

  expect(
    "valid signature accepted",
    verifyRecallWebhookSignature({ body, signature: `v1,${sig}`, webhookId: id, webhookTimestamp: ts }),
  );

  expect(
    "old timestamp rejected",
    !verifyRecallWebhookSignature({
      body,
      signature: `v1,${sig}`,
      webhookId: id,
      webhookTimestamp: (Number(ts) - 60 * 60).toString(),
    }),
  );

  expect(
    "future timestamp rejected",
    !verifyRecallWebhookSignature({
      body,
      signature: `v1,${sig}`,
      webhookId: id,
      webhookTimestamp: (Number(ts) + 60 * 60).toString(),
    }),
  );

  expect(
    "tampered body rejected",
    !verifyRecallWebhookSignature({
      body: body + " ",
      signature: `v1,${sig}`,
      webhookId: id,
      webhookTimestamp: ts,
    }),
  );

  expect(
    "missing webhook-id rejected",
    !verifyRecallWebhookSignature({ body, signature: `v1,${sig}`, webhookId: null, webhookTimestamp: ts }),
  );
}

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
