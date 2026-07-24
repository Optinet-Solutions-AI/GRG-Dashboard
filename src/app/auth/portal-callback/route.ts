import { NextResponse, type NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Portal SSO identifiers. These are PUBLIC (not secrets) and dashboard-specific, so we default
// them to the known values for this dashboard. Env vars still override. Hardcoding safe defaults
// keeps the issuer/audience checks ALWAYS enforced — they can never be accidentally unset (which
// would make jose skip the check and accept a token minted for a DIFFERENT dashboard).
const PORTAL_JWKS_URL = process.env.PORTAL_JWKS_URL ?? "https://dashboard-portal-tawny.vercel.app/api/sso/jwks";
const PORTAL_ISSUER = process.env.PORTAL_ISSUER ?? "https://dashboard-portal-tawny.vercel.app";
const SSO_AUDIENCE = process.env.SSO_AUDIENCE ?? "e672eab0-8ed4-4034-8ddb-b573d2958eeb";

// Module-level so the JWKS keys are cached across requests (URL is always defined → never throws).
const JWKS = createRemoteJWKSet(new URL(PORTAL_JWKS_URL));

// Secrets must be real env vars — fail closed at request time (not build time) if missing.
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required for SSO`);
  return v;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  // 1) Verify the portal's assertion (signature via JWKS + exact issuer + audience + expiry).
  let email: string;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: PORTAL_ISSUER,
      audience: SSO_AUDIENCE,
    });
    // typeof check, not String(...): String(undefined) === "undefined" (truthy) would defeat this.
    if (typeof payload.email !== "string" || payload.email.length === 0) throw new Error("no email claim");
    email = payload.email;
  } catch {
    return NextResponse.redirect(new URL("/login?error=sso", req.url));
  }

  const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const SUPABASE_ANON_KEY = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2) JIT-provision by email. (listUsers is paginated ~50/page; GRG has a tiny user base, so a
  //    single page is fine — revisit with pagination/filtering if the user count grows.)
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) return NextResponse.redirect(new URL("/login?error=provision", req.url));
  let user = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) return NextResponse.redirect(new URL("/login?error=provision", req.url));
    user = data.user;
  }

  // (No step 2b: this dashboard grants access to any authenticated user — RLS "read_authenticated".
  //  A profiles row with role 'viewer' is auto-created by the handle_new_user trigger on user
  //  insert; there is no separate approval/allowlist table to gate against.)

  // 3) Mint a session in OUR project: generate a magic-link token, then verifyOtp sets the cookies.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link.properties?.hashed_token) return NextResponse.redirect(new URL("/login?error=session", req.url));

  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  });
  const { error: otpErr } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (otpErr) return NextResponse.redirect(new URL("/login?error=session", req.url));

  return NextResponse.redirect(new URL("/", req.url));
}
