import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin";
}

/** The verified current user (contacts the auth server), or null. */
export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/** The current user's role from profiles, or null if not logged in. */
export async function getCurrentRole(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (error || !data) return null;
  return data.role as string;
}

/** Redirect to /login if not authenticated; returns the user. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Redirect non-admins away; returns true for admins. */
export async function requireAdmin() {
  const role = await getCurrentRole();
  if (!isAdminRole(role)) redirect("/");
  return true;
}
