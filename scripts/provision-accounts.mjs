import { createClient } from "@supabase/supabase-js";
import pg from "pg";

async function ensureUser(admin, email, password) {
  // Try to create; if it already exists, find and update the password.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && data?.user) return data.user.id;
  // Already exists -> locate by listing and update password.
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === email);
  if (!existing) throw new Error(`Could not create or find user ${email}: ${error?.message}`);
  await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  return existing.id;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;
  const adminEmail = process.env.ADMIN_EMAIL,
    adminPw = process.env.ADMIN_PASSWORD;
  const viewerEmail = process.env.VIEWER_EMAIL,
    viewerPw = process.env.VIEWER_PASSWORD;
  if (!url || !serviceKey || !dbUrl || !adminEmail || !adminPw || !viewerEmail || !viewerPw) {
    throw new Error("Missing required env vars for provisioning.");
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminId = await ensureUser(admin, adminEmail, adminPw);
  await ensureUser(admin, viewerEmail, viewerPw);

  // Promote admin role (the trigger created both as 'viewer').
  const isLocal = /localhost|127\.0\.0\.1/.test(dbUrl);
  const client = new pg.Client({ connectionString: dbUrl, ssl: isLocal ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("update public.profiles set role='admin' where id=$1", [adminId]);
    await client.query("update public.profiles set role='viewer' where id <> $1 and email=$2", [
      adminId,
      viewerEmail,
    ]);
    const r = await client.query("select email, role from public.profiles order by role");
    console.log("Profiles:", r.rows.map((x) => `${x.email}=${x.role}`).join(", "));
  } finally {
    await client.end();
  }
  console.log("Provisioning complete.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
