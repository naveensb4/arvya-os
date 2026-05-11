import {
  runClosedLoopAlignmentMonitor,
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
import {
  runMarketingDriveSync,
  runMarketingMetricsRefresh,
  runMarketingSchedulerSync,
  runMarketingWeeklyReport,
} from "@/lib/marketing/runtime";
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

export const marketingDriveSync = inngest.createFunction(
  { id: "marketing-drive-sync", name: "Marketing OS Drive sync", triggers: [{ cron: "15 */2 * * *" }] },
  async ({ step }) => {
    return step.run("sync marketing drive transcripts", runMarketingDriveSync);
  },
);

export const marketingSchedulerSync = inngest.createFunction(
  { id: "marketing-scheduler-sync", name: "Marketing OS scheduler sync", triggers: [{ cron: "*/30 * * * *" }] },
  async ({ step }) => {
    return step.run("sync marketing scheduler status", runMarketingSchedulerSync);
  },
);

export const marketingMetricsRefresh = inngest.createFunction(
  { id: "marketing-metrics-refresh", name: "Marketing OS metrics refresh", triggers: [{ cron: "0 9 * * *" }] },
  async ({ step }) => {
    return step.run("refresh marketing metrics", runMarketingMetricsRefresh);
  },
);

export const marketingWeeklyReport = inngest.createFunction(
  { id: "marketing-weekly-report", name: "Marketing OS weekly report", triggers: [{ cron: "0 17 * * 5" }] },
  async ({ step }) => {
    return step.run("generate marketing weekly report", runMarketingWeeklyReport);
  },
);

export const functions = [
  scheduledConnectorSync,
  sourceIngested,
  openLoopMonitor,
  closedLoopAlignmentMonitor,
  dailyFounderBrief,
  weeklyLearningMemo,
  notetakerCalendarSync,
  notetakerEventReceived,
  notetakerTranscriptReady,
  marketingDriveSync,
  marketingSchedulerSync,
  marketingMetricsRefresh,
  marketingWeeklyReport,
];
