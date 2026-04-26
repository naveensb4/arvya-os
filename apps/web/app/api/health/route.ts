import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { tryGetDb } from "@/lib/db/client";

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
  recall: GroupCheck & {
    webhookPath: string;
    webhookUrl: string | null;
  };
  inngest: GroupCheck;
  google: GroupCheck;
  microsoft: GroupCheck;
  ai: GroupCheck;
  supabase: GroupCheck;
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

function publicBaseUrl() {
  return process.env.ARVYA_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || null;
}

function recallWebhookUrl() {
  const base = publicBaseUrl();
  return base ? `${base}${RECALL_WEBHOOK_PATH}` : null;
}

export async function GET() {
  const database = await checkDatabase();

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
    if (requiredMissing > 0) return "degraded";
    if (!aiHasModelKey) return "degraded";
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
    recall,
    inngest,
    google,
    microsoft,
    ai,
    supabase,
    env,
  };

  const httpStatus = overall === "fail" ? 503 : 200;
  return NextResponse.json(body, {
    status: httpStatus,
    headers: { "cache-control": "no-store" },
  });
}
