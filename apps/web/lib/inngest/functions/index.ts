import {
  runDailyFounderBrief,
  runOpenLoopMonitor,
  runScheduledConnectorSync,
  runSourceIngested,
  runWeeklyLearningMemo,
} from "@/lib/always-on/runtime";
import {
  handleNotetakerWebhook,
  ingestNotetakerTranscript,
  runNotetakerCalendarSync,
} from "@/lib/notetaker/runtime";
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

export const openLoopMonitor = inngest.createFunction(
  { id: "open-loop-monitor", name: "Open loop monitor", triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => {
    return step.run("create overdue loop alerts", runOpenLoopMonitor);
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

export const functions = [
  scheduledConnectorSync,
  sourceIngested,
  openLoopMonitor,
  dailyFounderBrief,
  weeklyLearningMemo,
  notetakerCalendarSync,
  notetakerEventReceived,
  notetakerTranscriptReady,
];
