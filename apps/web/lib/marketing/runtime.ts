import { getRepository } from "@/lib/db/repository";
import {
  generateMarketingWeeklyReport,
  refreshMarketingMetrics,
  syncMarketingDriveTranscripts,
  syncMarketingSchedulerStatus,
} from "./store";

async function listBrainIds() {
  const brains = await getRepository().listBrains();
  return brains.map((brain) => brain.id);
}

export async function runMarketingDriveSync() {
  const results = [];
  for (const brainId of await listBrainIds()) {
    results.push({ brainId, ...(await syncMarketingDriveTranscripts(brainId)) });
  }
  return { brains: results.length, results };
}

export async function runMarketingSchedulerSync() {
  const results = [];
  for (const brainId of await listBrainIds()) {
    results.push({ brainId, ...(await syncMarketingSchedulerStatus(brainId)) });
  }
  return { brains: results.length, results };
}

export async function runMarketingMetricsRefresh() {
  const results = [];
  for (const brainId of await listBrainIds()) {
    results.push({ brainId, ...(await refreshMarketingMetrics(brainId)) });
  }
  return { brains: results.length, results };
}

export async function runMarketingWeeklyReport() {
  const reports = [];
  for (const brainId of await listBrainIds()) {
    reports.push(await generateMarketingWeeklyReport(brainId));
  }
  return { reports: reports.length };
}
