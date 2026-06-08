// Apply all SQL migrations in supabase/migrations/ to the database in SUPABASE_DB_URL,
// in filename order, each wrapped in its own transaction. Use for the hosted DB
// (Supabase CLI's `db reset` is local-only). Intended for a fresh project; migrations
// use plain `create table` (no IF NOT EXISTS), so re-running on a populated DB will error
// on the first already-existing object — that's expected. Run via:
//   npm run db:apply   (which passes --env-file=.env.local)
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is not set (check .env.local).");
  if (dbUrl.includes("<password>") || dbUrl.includes("<ref>")) {
    throw new Error("SUPABASE_DB_URL still contains placeholders — fill in your real connection string in .env.local.");
  }
  const isLocal = /localhost|127\.0\.0\.1/.test(dbUrl);

  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error(`No .sql files found in ${dir}`);

  const client = new pg.Client({ connectionString: dbUrl, ssl: isLocal ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8");
      process.stdout.write(`Applying ${f} ... `);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("commit");
        console.log("ok");
      } catch (e) {
        await client.query("rollback");
        throw new Error(`migration ${f} failed: ${e.message}`);
      }
    }
    console.log(`\nApplied ${files.length} migration(s) successfully.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
