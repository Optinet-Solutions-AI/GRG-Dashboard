import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Public read-only dashboard: anyone may VIEW any page without logging in. The middleware
  // only refreshes the session — it does NOT gate access. Editing is guarded server-side
  // (requireAdmin() on every write action + the Manage layout); anonymous visitors just see
  // read-only pages. Convenience: a logged-in admin who hits /login is sent to the home page.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
