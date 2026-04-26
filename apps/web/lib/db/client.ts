import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: { db: Db; client: postgres.Sql } | null = null;

function buildDb(connectionString: string): { db: Db; client: postgres.Sql } {
  const client = postgres(connectionString, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
  });
  const db = drizzle(client, { schema });
  return { db, client };
}

export function tryGetDb(): Db | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!cached) {
    cached = buildDb(url);
  }
  return cached.db;
}

export function getDb(): Db {
  const db = tryGetDb();
  if (!db) {
    throw new Error("DATABASE_URL is required to use Supabase Postgres.");
  }
  return db;
}

export async function closeDbForTests() {
  if (!cached) return;
  const { client } = cached;
  cached = null;
  await client.end({ timeout: 5 });
}

export { schema };
