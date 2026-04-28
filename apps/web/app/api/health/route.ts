import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { tryGetDb } from "@/lib/db/client";
import { getRepository, type ConnectorConfig, type ConnectorType } from "@/lib/db/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EnvCheck = {
  name: string;
  present: boolean;
  required: boolean;
};

type GroupCheck = {
  ok: boolean;
  required: boolean;
  missing: string[];
  present: string[];
  notes?: string;
};

type ConnectorHealth = {
  connectorType: ConnectorType | "notetaker_calendar";
  configCount: number;
  withCredentials: number;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  watermark: string | null;
};

type HealthResponse = {
  status: "ok" | "degraded" | "fail";
  uptimeSeconds: number;
  timestamp: string;
  app: {
    ok: boolean;
    version: string;
    nodeEnv: string;
    publicBaseUrl: string | null;
  };
  database: {
    configured: boolean;
    reachable: boolean;
    error: string | null;
    latencyMs: number | null;
  };
  supabaseApi: {
    configured: boolean;
    reachable: boolean;
    storageReachable: boolean;
    bucket: string;
    error: string | null;
    latencyMs: number | null;
  };
  recall: GroupCheck & {
    webhookPath: string;
    webhookUrl: string | null;
  };
  inngest: GroupCheck;
  google: GroupCheck;
  microsoft: GroupCheck;
  ai: GroupCheck;
  supabase: GroupCheck;
  connectors: ConnectorHealth[];
  env: EnvCheck[];
};

const RECALL_WEBHOOK_PATH = "/api/connectors/recall/webhook";

function envPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

function group(input: {
  required: string[];
  optional?: string[];
  notes?: string;
}): GroupCheck {
  const missing = input.required.filter((name) => !envPresent(name));
  const present = [...input.required, ...(input.optional ?? [])].filter(envPresent);
  return {
    ok: missing.length === 0,
    required: input.required.length > 0,
    missing,
    present,
    notes: input.notes,
  };
}

async function checkDatabase(): Promise<HealthResponse["database"]> {
  const db = tryGetDb();
  if (!db) {
    return {
      configured: false,
      reachable: false,
      error: null,
      latencyMs: null,
    };
  }
  const start = Date.now();
  try {
    await db.execute(sql`select 1 as ok`);
    return {
      configured: true,
      reachable: true,
      error: null,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      error: error instanceof Error ? error.message : "unknown database error",
      latencyMs: Date.now() - start,
    };
  }
}

async function checkSupabaseApi(): Promise<HealthResponse["supabaseApi"]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_SOURCE_BUCKET?.trim() || "source-uploads";
  if (!supabaseUrl || !serviceRoleKey) {
    return {
      configured: false,
      reachable: false,
      storageReachable: false,
      bucket,
      error: null,
      latencyMs: null,
    };
  }

  const start = Date.now();
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { error: listError } = await supabase.storage.listBuckets();
    if (listError) throw listError;
    const { error: bucketError } = await supabase.storage.getBucket(bucket);
    return {
      configured: true,
      reachable: true,
      storageReachable: !bucketError,
      bucket,
      error: bucketError ? sanitizeError(bucketError.message) : null,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      storageReachable: false,
      bucket,
      error: sanitizeError(error instanceof Error ? error.message : "unknown Supabase API error"),
      latencyMs: Date.now() - start,
    };
  }
}

function publicBaseUrl() {
  return process.env.ARVYA_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || null;
}

function maxIso(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function sanitizeError(input: string | null | undefined) {
  if (!input) return null;
  // Strip token-shaped substrings just in case a connector wrote one into lastError.
  const stripped = input
    .replace(/(eyJ[A-Za-z0-9_-]{10,})/g, "[redacted]")
    .replace(/\b(?:[A-Za-z0-9_-]{40,})\b/g, "[redacted]");
  return stripped.slice(0, 240);
}

function summarizeConnectorConfigs(configs: ConnectorConfig[]): ConnectorHealth[] {
  const byType = new Map<ConnectorType, ConnectorHealth>();
  for (const config of configs) {
    const current = byType.get(config.connectorType) ?? {
      connectorType: config.connectorType,
      configCount: 0,
      withCredentials: 0,
      lastSyncAt: null,
      lastSuccessAt: null,
      lastError: null,
      watermark: null,
    };
    current.configCount += 1;
    if (config.credentials && Object.keys(config.credentials).length > 0) {
      current.withCredentials += 1;
    }
    current.lastSyncAt = maxIso(current.lastSyncAt, config.lastSyncAt ?? null);
    current.lastSuccessAt = maxIso(current.lastSuccessAt, config.lastSuccessAt ?? null);
    if (config.lastError && !current.lastError) {
      current.lastError = sanitizeError(config.lastError);
    }
    const watermark = typeof config.config?.watermark === "string" ? config.config.watermark : null;
    current.watermark = maxIso(current.watermark, watermark);
    byType.set(config.connectorType, current);
  }
  return [...byType.values()];
}

async function loadConnectorHealth(): Promise<ConnectorHealth[]> {
  try {
    const repository = getRepository();
    const configs = await repository.listConnectorConfigs();
    const summary = summarizeConnectorConfigs(configs);
    const calendars = await repository.listNotetakerCalendars();
    if (calendars.length > 0) {
      const lastSyncAt = calendars.reduce<string | null>((acc, calendar) => maxIso(acc, calendar.lastSyncAt ?? null), null);
      const lastError = calendars
        .map((calendar) => sanitizeError(calendar.lastError))
        .find((value): value is string => Boolean(value)) ?? null;
      summary.push({
        connectorType: "notetaker_calendar",
        configCount: calendars.length,
        withCredentials: calendars.filter((calendar) => {
          const creds = (calendar.config as Record<string, unknown> | undefined)?.credentials;
          return creds !== null && typeof creds === "object" && Object.keys(creds as Record<string, unknown>).length > 0;
        }).length,
        lastSyncAt,
        lastSuccessAt: lastSyncAt,
        lastError,
        watermark: lastSyncAt,
      });
    }
    return summary.sort((a, b) => a.connectorType.localeCompare(b.connectorType));
  } catch {
    return [];
  }
}

function recallWebhookUrl() {
  const base = publicBaseUrl();
  return base ? `${base}${RECALL_WEBHOOK_PATH}` : null;
}

export async function GET() {
  const [database, supabaseApi, connectors] = await Promise.all([
    checkDatabase(),
    checkSupabaseApi(),
    loadConnectorHealth(),
  ]);

  const supabase = group({
    required: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    optional: ["SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"],
  });

  const ai = group({
    required: ["DEFAULT_MODEL_PROVIDER", "DEFAULT_MODEL"],
    optional: [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "OPENAI_EMBEDDING_MODEL",
      "ANTHROPIC_MODEL",
      "OPENAI_MODEL",
    ],
    notes: "At least one of ANTHROPIC_API_KEY or OPENAI_API_KEY is needed for live model output.",
  });
  const aiHasModelKey = envPresent("ANTHROPIC_API_KEY") || envPresent("OPENAI_API_KEY");

  const recallGroup = group({
    required: ["RECALL_API_KEY", "RECALL_WEBHOOK_SECRET", "ARVYA_PUBLIC_BASE_URL"],
    optional: ["RECALL_BASE_URL"],
  });
  const recall: HealthResponse["recall"] = {
    ...recallGroup,
    webhookPath: RECALL_WEBHOOK_PATH,
    webhookUrl: recallWebhookUrl(),
  };

  const inngest = group({
    required: ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"],
  });

  const google = group({
    required: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    optional: [
      "GOOGLE_REDIRECT_URI",
      "GOOGLE_CALENDAR_REDIRECT_URI",
      "GOOGLE_TRANSCRIPTS_FOLDER_ID",
      "GMAIL_CLIENT_ID",
      "GMAIL_CLIENT_SECRET",
      "GMAIL_REDIRECT_URI",
    ],
    notes: "ARVYA_PUBLIC_BASE_URL provides defaults for Calendar and Drive callbacks if explicit redirects are unset.",
  });

  const microsoft = group({
    required: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    optional: [
      "MICROSOFT_TENANT_ID",
      "MICROSOFT_REDIRECT_URI",
      "MICROSOFT_CALENDAR_REDIRECT_URI",
    ],
  });

  const env: EnvCheck[] = [
    { name: "DATABASE_URL", present: envPresent("DATABASE_URL"), required: true },
    { name: "NEXT_PUBLIC_SUPABASE_URL", present: envPresent("NEXT_PUBLIC_SUPABASE_URL"), required: true },
    { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", present: envPresent("NEXT_PUBLIC_SUPABASE_ANON_KEY"), required: true },
    { name: "SUPABASE_SERVICE_ROLE_KEY", present: envPresent("SUPABASE_SERVICE_ROLE_KEY"), required: true },
    { name: "ANTHROPIC_API_KEY", present: envPresent("ANTHROPIC_API_KEY"), required: false },
    { name: "OPENAI_API_KEY", present: envPresent("OPENAI_API_KEY"), required: false },
    { name: "OPENAI_EMBEDDING_MODEL", present: envPresent("OPENAI_EMBEDDING_MODEL"), required: false },
    { name: "DEFAULT_MODEL_PROVIDER", present: envPresent("DEFAULT_MODEL_PROVIDER"), required: false },
    { name: "DEFAULT_MODEL", present: envPresent("DEFAULT_MODEL"), required: false },
    { name: "RECALL_API_KEY", present: envPresent("RECALL_API_KEY"), required: true },
    { name: "RECALL_BASE_URL", present: envPresent("RECALL_BASE_URL"), required: false },
    { name: "RECALL_WEBHOOK_SECRET", present: envPresent("RECALL_WEBHOOK_SECRET"), required: true },
    { name: "ARVYA_PUBLIC_BASE_URL", present: envPresent("ARVYA_PUBLIC_BASE_URL"), required: true },
    { name: "GOOGLE_CLIENT_ID", present: envPresent("GOOGLE_CLIENT_ID"), required: true },
    { name: "GOOGLE_CLIENT_SECRET", present: envPresent("GOOGLE_CLIENT_SECRET"), required: true },
    { name: "GOOGLE_REDIRECT_URI", present: envPresent("GOOGLE_REDIRECT_URI"), required: false },
    { name: "GOOGLE_CALENDAR_REDIRECT_URI", present: envPresent("GOOGLE_CALENDAR_REDIRECT_URI"), required: false },
    { name: "GOOGLE_TRANSCRIPTS_FOLDER_ID", present: envPresent("GOOGLE_TRANSCRIPTS_FOLDER_ID"), required: false },
    { name: "MICROSOFT_CLIENT_ID", present: envPresent("MICROSOFT_CLIENT_ID"), required: true },
    { name: "MICROSOFT_CLIENT_SECRET", present: envPresent("MICROSOFT_CLIENT_SECRET"), required: true },
    { name: "MICROSOFT_TENANT_ID", present: envPresent("MICROSOFT_TENANT_ID"), required: false },
    { name: "MICROSOFT_REDIRECT_URI", present: envPresent("MICROSOFT_REDIRECT_URI"), required: false },
    { name: "MICROSOFT_CALENDAR_REDIRECT_URI", present: envPresent("MICROSOFT_CALENDAR_REDIRECT_URI"), required: false },
    { name: "INNGEST_EVENT_KEY", present: envPresent("INNGEST_EVENT_KEY"), required: true },
    { name: "INNGEST_SIGNING_KEY", present: envPresent("INNGEST_SIGNING_KEY"), required: true },
  ];

  const requiredMissing = env.filter((item) => item.required && !item.present).length;
  const dbOk = database.reachable || !database.configured;
  const overall: HealthResponse["status"] = (() => {
    if (database.configured && !database.reachable) return "fail";
    if (supabaseApi.configured && !supabaseApi.reachable) return "fail";
    if (requiredMissing > 0) return "degraded";
    if (!aiHasModelKey) return "degraded";
    if (supabaseApi.configured && !supabaseApi.storageReachable) return "degraded";
    if (!dbOk) return "fail";
    return "ok";
  })();

  const body: HealthResponse = {
    status: overall,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    app: {
      ok: true,
      version: process.env.npm_package_version || "0.0.0",
      nodeEnv: process.env.NODE_ENV || "unknown",
      publicBaseUrl: publicBaseUrl(),
    },
    database,
    supabaseApi,
    recall,
    inngest,
    google,
    microsoft,
    ai,
    supabase,
    connectors,
    env,
  };

  const httpStatus = overall === "fail" ? 503 : 200;
  return NextResponse.json(body, {
    status: httpStatus,
    headers: { "cache-control": "no-store" },
  });
}
