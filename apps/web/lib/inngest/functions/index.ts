import {
  runClosedLoopAlignmentMonitor,
  runDailyFounderBrief,
  runMeetingPrep30Min,
  runMeetingPrepBatch,
  runMeetingPrepDeltaWatch,
  runScheduledConnectorSync,
  runSourceIngested,
  runWeeklyLearningMemo,
} from "@/lib/always-on/runtime";
import {
  handleNotetakerWebhook,
  ingestNotetakerTranscript,
  runNotetakerCalendarSync,
} from "@/lib/notetaker/runtime";
import { runDeadlineNudgerForAllBrains } from "@/lib/slack-bot/nudge";
import { inngest } from "../client";

export const scheduledConnectorSync = inngest.createFunction(
  { id: "scheduled-connector-sync", name: "Scheduled connector sync", triggers: [{ cron: "*/10 * * * *" }] },
  async ({ step }) => {
    return step.run("sync eligible connectors", runScheduledConnectorSync);
  },
);

export const sourceIngested = inngest.createFunction(
  { id: "source-ingested", name: "Source ingested", triggers: [{ event: "source/ingested" }] },
  async ({ event, step }) => {
    const { brainId, sourceItemId } = event.data as {
      brainId: string;
      sourceItemId: string;
    };
    return step.run("process source item", () => runSourceIngested({ brainId, sourceItemId }));
  },
);

// openLoopMonitor was retired 2026-05-09. It only fired alerts after a
// loop went overdue and never notified anyone — the new deadline nudger
// (apps/web/lib/slack-bot/nudge.ts) covers pre-deadline, stale, and
// outcome-uncertain in one Slack-aware function. Kept the comment so
// future-us doesn't reinvent it.

export const closedLoopAlignmentMonitor = inngest.createFunction(
  { id: "closed-loop-alignment-monitor", name: "Closed-loop alignment monitor", triggers: [{ cron: "30 */4 * * *" }] },
  async ({ step }) => {
    return step.run("detect alignment gaps", runClosedLoopAlignmentMonitor);
  },
);

export const dailyFounderBrief = inngest.createFunction(
  { id: "daily-founder-brief", name: "Daily founder brief", triggers: [{ cron: "0 8 * * *" }] },
  async ({ step }) => {
    return step.run("generate daily founder brief", runDailyFounderBrief);
  },
);

export const weeklyLearningMemo = inngest.createFunction(
  { id: "weekly-learning-memo", name: "Weekly learning memo", triggers: [{ cron: "0 16 * * 5" }] },
  async ({ step }) => {
    return step.run("generate weekly learning memo", runWeeklyLearningMemo);
  },
);

export const notetakerCalendarSync = inngest.createFunction(
  { id: "notetaker-calendar-sync", name: "Notetaker calendar sync", triggers: [{ cron: "*/10 * * * *" }] },
  async ({ step }) => {
    return step.run("sync notetaker calendars", () => runNotetakerCalendarSync());
  },
);

export const notetakerEventReceived = inngest.createFunction(
  { id: "notetaker-event-received", name: "Notetaker event received", triggers: [{ event: "notetaker/event.received" }] },
  async ({ event, step }) => {
    const payload = event.data as Record<string, unknown>;
    return step.run("process notetaker webhook", () => handleNotetakerWebhook(payload));
  },
);

// Smart Nudger — runs every 30 minutes. Finds open loops with imminent
// due dates, stale loops, and outcome-uncertain loops; posts to the
// auto-created #arvya-brain Slack channel with interactive buttons.
// Throttle: 1 nudge per loop per kind per 24h, digest if >5 fire at once.
export const deadlineNudger = inngest.createFunction(
  { id: "deadline-nudger", name: "Deadline nudger", triggers: [{ cron: "*/30 * * * *" }] },
  async ({ step }) => {
    return step.run("post nudges to slack", () => runDeadlineNudgerForAllBrains());
  },
);

export const notetakerTranscriptReady = inngest.createFunction(
  { id: "notetaker-transcript-ready", name: "Notetaker transcript ready", triggers: [{ event: "notetaker/transcript.ready" }] },
  async ({ event, step }) => {
    const data = event.data as {
      brainId: string;
      botId?: string;
      transcriptId?: string;
      payload?: Record<string, unknown>;
    };
    return step.run("ingest notetaker transcript", () => ingestNotetakerTranscript(data));
  },
);

export const meetingPrepBatch = inngest.createFunction(
  { id: "meeting-prep-batch", name: "Meeting prep batch", triggers: [{ cron: "0 7 * * *" }] },
  async ({ step }) => {
    return step.run("generate meeting prep briefs", runMeetingPrepBatch);
  },
);

export const meetingPrep30Min = inngest.createFunction(
  { id: "meeting-prep-30min", name: "Meeting prep 30-min", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    return step.run("prep meetings starting in 30 min", runMeetingPrep30Min);
  },
);

export const meetingPrepDeltaWatch = inngest.createFunction(
  { id: "meeting-prep-delta-watch", name: "Meeting prep delta watch", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    return step.run("check for material deltas", runMeetingPrepDeltaWatch);
  },
);

export const functions = [
  scheduledConnectorSync,
  sourceIngested,
  closedLoopAlignmentMonitor,
  dailyFounderBrief,
  weeklyLearningMemo,
  notetakerCalendarSync,
  notetakerEventReceived,
  notetakerTranscriptReady,
  deadlineNudger,
  meetingPrepBatch,
  meetingPrep30Min,
  meetingPrepDeltaWatch,
];
