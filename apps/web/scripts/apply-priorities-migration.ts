import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { closeDbForTests, getDb } from "../lib/db/client";
import { sql } from "drizzle-orm";

config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });

async function main() {
  const filePath = path.join(process.cwd(), "supabase/migrations/0005_priorities.sql");
  const raw = await readFile(filePath, "utf-8");
  const statements = raw
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const db = getDb();
  for (const statement of statements) {
    const preview = statement.split("\n").slice(0, 2).join(" ").slice(0, 80);
    console.log(`-> ${preview} ...`);
    await db.execute(sql.raw(statement));
  }
  console.log(`Applied ${statements.length} statements.`);

  const result = (await db.execute(sql`SELECT to_regclass('public.priorities') AS exists`)) as unknown as Array<{
    exists: string | null;
  }>;
  console.log(`priorities table present: ${result?.[0]?.exists ?? "no"}`);

  await closeDbForTests();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await closeDbForTests();
  } catch {}
  process.exit(1);
});
