import { NextResponse } from "next/server";
import { syncConnectorConfig } from "@/lib/always-on/runtime";
import { isRateLimitError } from "@/lib/ai/resilient-call";
import { getRepository } from "@/lib/db/repository";
import { processSourceItemIntoBrain } from "@/lib/workflows/source-ingestion";

const MAX_CONCURRENCY = 5;
const MIN_CONCURRENCY = 1;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runParallelIngestion(brainId: string) {
  const repository = getRepository();
  const sourceItems = await repository.listSourceItems(brainId);
  const workflows = await repository.listWorkflows(brainId);

  const completedSourceIds = new Set(
    workflows
      .filter((w) => w.workflowType === "source_ingestion" && w.status === "completed")
      .map((w) => w.sourceItemId),
  );

  const pending = sourceItems.filter((s) => !completedSourceIds.has(s.id));
  if (pending.length === 0) return { ingested: 0, failed: 0, total: sourceItems.length };

  let ingested = 0;
  let failed = 0;
  let concurrency = MAX_CONCURRENCY;
  let activeWorkers = 0;
  const queue = [...pending];

  function onRateLimit() {
    concurrency = Math.max(MIN_CONCURRENCY, Math.floor(concurrency / 2));
    console.warn(`[sync] rate limited — reducing concurrency to ${concurrency}`);
  }

  function onSuccess() {
    if (concurrency < MAX_CONCURRENCY) {
      concurrency = Math.min(MAX_CONCURRENCY, concurrency + 1);
    }
  }

  async function worker() {
    activeWorkers++;
    while (queue.length > 0) {
      if (activeWorkers > concurrency) break;

      const item = queue.shift();
      if (!item) break;
      try {
        await processSourceItemIntoBrain({ brainId, sourceItemId: item.id });
        ingested++;
        onSuccess();
      } catch (error) {
        if (isRateLimitError(error)) {
          onRateLimit();
          queue.unshift(item);
          await sleep(5000 + Math.random() * 2000);
        } else {
          failed++;
          console.error(`[sync] ingestion failed for ${item.id}:`, error instanceof Error ? error.message : error);
        }
      }
    }
    activeWorkers--;
  }

  const workers = Array.from({ length: MAX_CONCURRENCY }, () => worker());
  await Promise.allSettled(workers);

  return { ingested, failed, total: sourceItems.length };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ brainId: string }> },
) {
  const { brainId } = await params;
  const repository = getRepository();
  const brain = await repository.getBrain(brainId);
  if (!brain) {
    return NextResponse.json({ error: "Brain not found" }, { status: 404 });
  }

  const configs = await repository.listConnectorConfigs(brainId);
  const gmailCfg = configs.find((c) => c.connectorType === "gmail" && c.status === "connected");
  const driveCfg = configs.find((c) => c.connectorType === "google_drive" && c.status === "connected");

  const syncResults: Record<string, unknown> = {};

  if (gmailCfg) {
    try {
      const result = await syncConnectorConfig(gmailCfg);
      syncResults.gmail = result;
    } catch (error) {
      syncResults.gmail = { error: error instanceof Error ? error.message : "Gmail sync failed" };
    }
  }

  if (driveCfg) {
    try {
      const result = await syncConnectorConfig(driveCfg);
      syncResults.drive = result;
    } catch (error) {
      syncResults.drive = { error: error instanceof Error ? error.message : "Drive sync failed" };
    }
  }

  const ingestionResult = await runParallelIngestion(brainId);

  return NextResponse.json({
    sync: syncResults,
    ingestion: ingestionResult,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ brainId: string }> },
) {
  const { brainId } = await params;
  const repository = getRepository();
  const brain = await repository.getBrain(brainId);
  if (!brain) {
    return NextResponse.json({ error: "Brain not found" }, { status: 404 });
  }

  const sourceItems = await repository.listSourceItems(brainId);
  const workflows = await repository.listWorkflows(brainId);
  const memoryObjects = await repository.listMemoryObjects(brainId);

  const completed = workflows.filter((w) => w.workflowType === "source_ingestion" && w.status === "completed").length;
  const failed = workflows.filter((w) => w.workflowType === "source_ingestion" && w.status === "failed").length;
  const running = workflows.filter((w) => w.workflowType === "source_ingestion" && w.status === "running").length;

  const people = memoryObjects.filter((m) => m.objectType === "person").length;
  const companies = memoryObjects.filter((m) => m.objectType === "company").length;

  const configs = await repository.listConnectorConfigs(brainId);
  const gmailCfg = configs.find((c) => c.connectorType === "gmail");
  const isOnboarding = gmailCfg?.config?.mode === "onboarding";

  return NextResponse.json({
    phase: running > 0 ? "processing" : completed > 0 ? "ready" : "pending",
    total: sourceItems.length,
    completed,
    failed,
    running,
    people,
    companies,
    isOnboarding,
  });
}
