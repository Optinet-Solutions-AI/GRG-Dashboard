import pg from "pg";

const EXPECTED_TABLES = [
  "sites", "keywords", "countries", "pagespeed_urls", "qa_pages", "qa_elements", "profiles",
  "seo_scores", "health_snapshots", "pagespeed_entries", "rankings", "keyword_volumes", "backlinks", "qa_checks",
];

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const restUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!dbUrl || !restUrl || !anonKey) {
    throw new Error("Missing env (need SUPABASE_DB_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(dbUrl);
  const client = new pg.Client({ connectionString: dbUrl, ssl: isLocal ? false : { rejectUnauthorized: false } });
  await client.connect();
  const failures = [];
  try {
    const tablesRes = await client.query(
      "select table_name from information_schema.tables where table_schema='public'",
    );
    const tables = new Set(tablesRes.rows.map((r) => r.table_name));
    for (const t of EXPECTED_TABLES) if (!tables.has(t)) failures.push(`missing table: ${t}`);

    const rlsRes = await client.query(
      "select tablename from pg_tables where schemaname='public' and rowsecurity=false and tablename = any($1)",
      [EXPECTED_TABLES],
    );
    for (const r of rlsRes.rows) failures.push(`RLS not enabled: ${r.tablename}`);

    const fn = await client.query("select 1 from pg_proc where proname='is_admin'");
    if (fn.rowCount !== 1) failures.push("is_admin() missing");
  } finally {
    await client.end();
  }

  // Anonymous PostgREST read must return no rows (RLS only grants to authenticated).
  const res = await fetch(`${restUrl}/rest/v1/sites?select=id`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  const body = await res.json();
  if (Array.isArray(body) && body.length > 0) {
    failures.push(`anon could read sites (${body.length} rows) — RLS leak`);
  }

  if (failures.length) {
    console.error("SCHEMA VERIFY FAILED:\n - " + failures.join("\n - "));
    process.exit(1);
  }
  console.log(`Schema verify OK: ${EXPECTED_TABLES.length} tables, RLS enabled, is_admin() present, anon read denied.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
