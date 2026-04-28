import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { closeDbForTests, getDb } from "../lib/db/client";

config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });

async function main() {
  const db = getDb();

  const enums = await db.execute(sql`
    SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    GROUP BY t.typname
    ORDER BY t.typname
  `);
  console.log("\n=== Postgres enums in live DB ===");
  for (const row of enums as unknown as Array<{ name: string; values: string[] }>) {
    console.log(`  ${row.name}: ${row.values.join(", ")}`);
  }

  const tables = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log("\n=== Tables in public schema ===");
  for (const row of tables as unknown as Array<{ table_name: string }>) {
    console.log(`  ${row.table_name}`);
  }

  const journal = await db.execute(sql`
    SELECT hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY id
  `).catch(() => null);
  if (journal) {
    console.log("\n=== drizzle migrations applied ===");
    for (const row of journal as unknown as Array<{ hash: string; created_at: string | number }>) {
      console.log(`  ${row.created_at} ${row.hash}`);
    }
  } else {
    console.log("\n(drizzle.__drizzle_migrations not present)");
  }

  await closeDbForTests();
}

main().catch(async (error) => {
  console.error(error);
  try { await closeDbForTests(); } catch {}
  process.exit(1);
});
