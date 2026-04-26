import { createClient } from "@supabase/supabase-js";

const DEFAULT_BUCKET = "source-uploads";

let bucketReady: Promise<void> | null = null;

function storageConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) return null;
  return {
    supabaseUrl,
    serviceRoleKey,
    bucket: process.env.SUPABASE_SOURCE_BUCKET?.trim() || DEFAULT_BUCKET,
  };
}

function sanitizePathPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

async function ensureBucket(config: NonNullable<ReturnType<typeof storageConfig>>) {
  if (bucketReady) return bucketReady;

  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  bucketReady = (async () => {
    const { error: getError } = await supabase.storage.getBucket(config.bucket);
    if (!getError) return;

    const { error: createError } = await supabase.storage.createBucket(config.bucket, {
      public: false,
    });
    if (createError && !/already exists/i.test(createError.message)) {
      throw createError;
    }
  })();

  return bucketReady;
}

export function isSupabaseSourceStorageConfigured() {
  return Boolean(storageConfig());
}

export async function uploadSourceFileToStorage(input: {
  brainId: string;
  fileName: string;
  fileHash: string;
  contentType?: string;
  body: ArrayBuffer | Uint8Array;
}) {
  const config = storageConfig();
  if (!config) return undefined;

  await ensureBucket(config);

  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const safeFileName = sanitizePathPart(input.fileName) || "transcript.txt";
  const path = `${sanitizePathPart(input.brainId)}/${input.fileHash.slice(0, 16)}-${safeFileName}`;
  const { error } = await supabase.storage.from(config.bucket).upload(path, input.body, {
    contentType: input.contentType || "text/plain; charset=utf-8",
    upsert: false,
  });

  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }

  return `${config.bucket}/${path}`;
}
