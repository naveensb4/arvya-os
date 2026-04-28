import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL not set");
  }

  const sql = postgres(dbUrl, { max: 1 });

  const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migration files in ${migrationsDir}:`);
  for (const f of files) console.log(`  - ${f}`);

  await sql.unsafe(
    `CREATE TABLE IF NOT EXISTS "public"."__arvya_migrations" (
       "tag" text PRIMARY KEY,
       "applied_at" timestamptz DEFAULT now() NOT NULL
     )`
  );

  const appliedRows = await sql<{ tag: string }[]>`
    SELECT tag FROM public.__arvya_migrations
  `;
  const applied = new Set(appliedRows.map((r) => r.tag));

  for (const file of files) {
    const tag = file.replace(/\.sql$/, "");
    if (applied.has(tag)) {
      console.log(`✓ ${tag} (already applied)`);
      continue;
    }

    const fullPath = path.join(migrationsDir, file);
    const body = await readFile(fullPath, "utf8");

    console.log(`→ applying ${tag}...`);

    const statements = body
      .split(/--\s*>\s*statement-breakpoint/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await sql.unsafe(stmt);
      } catch (err) {
        const e = err as { code?: string; message?: string };
        const code = e.code ?? "";
        const msg = e.message ?? "";
        const safeRe =
          /already exists|duplicate (object|key|column)|does not exist|cannot drop/i;
        if (
          code === "42710" || // duplicate_object
          code === "42P07" || // duplicate_table
          code === "42701" || // duplicate_column
          code === "42P06" || // duplicate_schema
          code === "42704" || // undefined_object (e.g., dropping enum value that's gone)
          code === "23505" || // unique_violation on enum value
          safeRe.test(msg)
        ) {
          console.log(`  · stmt ${i + 1}: tolerated (${code} ${msg.slice(0, 80)})`);
          continue;
        }
        console.error(`✗ ${tag} failed at statement ${i + 1}/${statements.length}`);
        console.error(`  code=${code}`);
        console.error(`  msg=${msg}`);
        console.error(`  sql=${stmt.slice(0, 400)}`);
        await sql.end({ timeout: 5 });
        process.exit(1);
      }
    }

    await sql`
      INSERT INTO public.__arvya_migrations (tag) VALUES (${tag})
      ON CONFLICT (tag) DO NOTHING
    `;
    console.log(`✓ ${tag} applied`);
  }

  await sql.end({ timeout: 5 });
  console.log("\nAll migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
