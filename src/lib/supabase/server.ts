import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // The second arg carries Cache-Control/Pragma/Expires headers that prevent
        // CDNs/proxies from caching auth-cookie responses. They cannot be applied
        // from a Server Component (no Response object here); they are applied in the
        // session-refresh middleware (proxy.ts) added in Phase 2. See @supabase/ssr
        // SetAllCookies docs.
        setAll(cookiesToSet, _responseHeaders) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component without a writable cookie store — safe to ignore
          }
        },
      },
    },
  );
}
