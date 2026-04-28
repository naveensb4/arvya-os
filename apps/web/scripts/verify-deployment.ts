/**
 * Deployment verification for Replit (and other always-on hosts).
 *
 * Run after a fresh deployment to confirm:
 *  - DATABASE_URL connects to Supabase
 *  - Required Postgres tables exist
 *  - Source ingestion runs end-to-end against the live database
 *  - Required public-server config (Recall, ARVYA_PUBLIC_BASE_URL) is set
 *  - GET /api/health is reachable and reports a healthy state
 *
 * The script keeps the verification cheap and idempotent: it creates a
 * temporary verification Brain, ingests one transcript-style note, then
 * deletes the Brain so the live database stays clean.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { resetAiClientForTests } from "../lib/ai";
import {
  addSourceAndIngest,
  createBrain,
  getBrainSnapshot,
} from "../lib/brain/store";
import { closeDbForTests, getDb, schema } from "../lib/db/client";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";

config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });

type StepStatus = "ok" | "warn" | "fail";

type StepResult = {
  name: string;
  status: StepStatus;
  message?: string;
};

const RECALL_WEBHOOK_PATH = "/api/connectors/recall/webhook";
const REQUIRED_TABLES = [
  "brains",
  "source_items",
  "memory_objects",
  "open_loops",
  "workflows",
  "agent_runs",
  "connector_configs",
  "notetaker_calendars",
  "notetaker_meetings",
  "notetaker_events",
  "priorities",
];
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RECALL_API_KEY",
  "RECALL_WEBHOOK_SECRET",
  "ARVYA_PUBLIC_BASE_URL",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
];

function envPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

function hasModelKey() {
  return envPresent("ANTHROPIC_API_KEY") || envPresent("OPENAI_API_KEY");
}

function publicBaseUrl() {
  return process.env.ARVYA_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || null;
}

function step(name: string, status: StepStatus, message?: string): StepResult {
  return { name, status, message };
}

function logStep(result: StepResult) {
  const icon = result.status === "ok" ? "[ok] " : result.status === "warn" ? "[warn]" : "[fail]";
  const detail = result.message ? `  ${result.message}` : "";
  console.log(`${icon} ${result.name}${detail ? `\n        ${detail}` : ""}`);
}

async function checkRequiredEnv(): Promise<StepResult> {
  const missing = REQUIRED_ENV_VARS.filter((name) => !envPresent(name));
  if (missing.length === 0) {
    return step("Required Replit Secrets present", "ok", REQUIRED_ENV_VARS.join(", "));
  }
  return step(
    "Required Replit Secrets present",
    "fail",
    `Missing: ${missing.join(", ")}. Set these in Replit Secrets before deploying.`,
  );
}

async function checkModelKey(): Promise<StepResult> {
  if (hasModelKey()) {
    return step("Model API key configured", "ok");
  }
  return step(
    "Model API key configured",
    "warn",
    "Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set. The app will fall back to deterministic local extraction.",
  );
}

async function checkPublicBaseUrl(): Promise<StepResult> {
  const base = publicBaseUrl();
  if (!base) {
    return step(
      "ARVYA_PUBLIC_BASE_URL set",
      "fail",
      "Set ARVYA_PUBLIC_BASE_URL to your Replit deployment URL (e.g. https://arvya-os.<repl-domain>).",
    );
  }
  if (!/^https?:\/\//.test(base)) {
    return step(
      "ARVYA_PUBLIC_BASE_URL set",
      "fail",
      `ARVYA_PUBLIC_BASE_URL must start with http:// or https://. Got: ${base}`,
    );
  }
  return step("ARVYA_PUBLIC_BASE_URL set", "ok", base);
}

async function checkRecallWebhookConfig(): Promise<StepResult> {
  const base = publicBaseUrl();
  if (!base) {
    return step(
      "Recall webhook URL derivable",
      "fail",
      "Cannot derive Recall webhook URL without ARVYA_PUBLIC_BASE_URL.",
    );
  }
  const webhookUrl = `${base}${RECALL_WEBHOOK_PATH}`;
  return step(
    "Recall webhook URL derivable",
    "ok",
    `Paste this URL into the Recall dashboard: ${webhookUrl}`,
  );
}

async function checkSupabaseConnection(): Promise<StepResult> {
  if (!envPresent("DATABASE_URL")) {
    return step(
      "Supabase Postgres reachable",
      "fail",
      "DATABASE_URL is not set. Add the Supabase pooled connection string to Replit Secrets.",
    );
  }
  resetRepositoryForTests();
  const repository = getRepository();
  if (repository.mode !== "supabase") {
    return step(
      "Supabase Postgres reachable",
      "fail",
      "Repository did not switch to supabase mode. Confirm DATABASE_URL points at a Postgres instance.",
    );
  }
  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    return step("Supabase Postgres reachable", "ok");
  } catch (error) {
    return step(
      "Supabase Postgres reachable",
      "fail",
      error instanceof Error ? error.message : "unknown database error",
    );
  }
}

async function checkRequiredTables(): Promise<StepResult> {
  if (!envPresent("DATABASE_URL")) {
    return step("Required Postgres tables exist", "fail", "DATABASE_URL is not set.");
  }
  try {
    const db = getDb();
    const result = (await db.execute(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
    `)) as unknown as Array<{ table_name: string }>;
    const found = new Set(result.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((name) => !found.has(name));
    if (missing.length === 0) {
      return step("Required Postgres tables exist", "ok", `Found: ${REQUIRED_TABLES.join(", ")}`);
    }
    return step(
      "Required Postgres tables exist",
      "fail",
      `Missing tables: ${missing.join(", ")}. Run pnpm db:migrate against this database.`,
    );
  } catch (error) {
    return step(
      "Required Postgres tables exist",
      "fail",
      error instanceof Error ? error.message : "unknown error checking tables",
    );
  }
}

async function checkSourceIngestion(): Promise<StepResult> {
  if (!envPresent("DATABASE_URL")) {
    return step("Source ingestion works", "fail", "DATABASE_URL is not set.");
  }
  resetRepositoryForTests();
  resetAiClientForTests();
  const repository = getRepository();
  if (repository.mode !== "supabase") {
    return step("Source ingestion works", "fail", "Repository is not in supabase mode.");
  }

  const marker = randomUUID();
  let brainId: string | undefined;
  try {
    const brain = await createBrain({
      name: `Replit Deployment Verification ${marker}`,
      kind: "company",
      thesis: "Temporary Brain used to verify Replit deployment ingestion.",
    });
    brainId = brain.id;

    const sourceItem = await addSourceAndIngest({
      brainId: brain.id,
      title: `Deployment verification source ${marker}`,
      type: "note",
      content:
        "Naveen confirmed the Replit deployment is live. Send the deployment URL to PB by Monday. Confirm Recall webhook receives transcript events.",
    });

    const snapshot = await getBrainSnapshot(brain.id);
    assert.ok(
      snapshot.sourceItems.some((source) => source.id === sourceItem.id),
      "expected ingested source item to persist",
    );
    assert.ok(snapshot.memoryObjects.length > 0, "expected memory objects from ingestion");
    assert.ok(snapshot.openLoops.length > 0, "expected open loops from ingestion");
    assert.ok(
      snapshot.agentRuns.some((run) => run.name === "source_ingestion"),
      "expected source_ingestion agent run",
    );
    return step("Source ingestion works", "ok", `Brain ${brainId} → source ${sourceItem.id}`);
  } catch (error) {
    return step(
      "Source ingestion works",
      "fail",
      error instanceof Error ? error.message : "unknown ingestion error",
    );
  } finally {
    if (brainId) {
      try {
        await getDb().delete(schema.brains).where(eq(schema.brains.id, brainId));
      } catch (cleanupError) {
        console.warn("Deployment verification cleanup skipped:", cleanupError);
      }
    }
  }
}

async function checkRecallWebhookRoute(): Promise<StepResult> {
  const base = publicBaseUrl();
  if (!base) {
    return step(
      "Recall webhook route reachable",
      "warn",
      "Skipped: ARVYA_PUBLIC_BASE_URL not set.",
    );
  }
  const url = `${base}${RECALL_WEBHOOK_PATH}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (response.status === 401) {
      return step(
        "Recall webhook route reachable",
        "ok",
        `Returned 401 for an unsigned request, which is expected. ${url}`,
      );
    }
    if (response.status >= 200 && response.status < 500) {
      return step(
        "Recall webhook route reachable",
        "ok",
        `HTTP ${response.status} from ${url}`,
      );
    }
    return step(
      "Recall webhook route reachable",
      "fail",
      `HTTP ${response.status} from ${url}`,
    );
  } catch (error) {
    return step(
      "Recall webhook route reachable",
      "warn",
      `Could not reach ${url}: ${error instanceof Error ? error.message : "unknown error"}. The deployment may still be starting.`,
    );
  }
}

async function checkHealthRoute(): Promise<StepResult> {
  const base = publicBaseUrl();
  if (!base) {
    return step("/api/health responds", "warn", "Skipped: ARVYA_PUBLIC_BASE_URL not set.");
  }
  const url = `${base}/api/health`;
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const json = (await response.json().catch(() => null)) as { status?: string } | null;
    if (response.ok && json?.status === "ok") {
      return step("/api/health responds", "ok", `${url} → status=ok`);
    }
    if (response.ok) {
      return step(
        "/api/health responds",
        "warn",
        `${url} returned 200 but status=${json?.status ?? "unknown"}. Inspect the response for missing env or DB issues.`,
      );
    }
    return step(
      "/api/health responds",
      "fail",
      `HTTP ${response.status} from ${url}; status=${json?.status ?? "unknown"}`,
    );
  } catch (error) {
    return step(
      "/api/health responds",
      "warn",
      `Could not reach ${url}: ${error instanceof Error ? error.message : "unknown error"}.`,
    );
  }
}

async function main() {
  console.log("Verifying Arvya OS deployment...\n");
  const results: StepResult[] = [];

  results.push(await checkRequiredEnv());
  results.push(await checkModelKey());
  results.push(await checkPublicBaseUrl());
  results.push(await checkRecallWebhookConfig());
  results.push(await checkSupabaseConnection());
  results.push(await checkRequiredTables());
  results.push(await checkSourceIngestion());
  results.push(await checkRecallWebhookRoute());
  results.push(await checkHealthRoute());

  results.forEach(logStep);
  console.log();

  const failures = results.filter((r) => r.status === "fail");
  const warnings = results.filter((r) => r.status === "warn");

  resetRepositoryForTests();
  resetAiClientForTests();
  await closeDbForTests();

  if (failures.length > 0) {
    console.error(`Deployment verification failed: ${failures.length} blocking issue(s).`);
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn(`Deployment verification passed with ${warnings.length} warning(s). Review the messages above.`);
  } else {
    console.log("Deployment verification passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
