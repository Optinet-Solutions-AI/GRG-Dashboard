"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Single-admin dashboard: the user signs in with a simple username (e.g. "admin123"),
// which we map to the real Supabase Auth email. Supabase REQUIRES a valid email, so
// we only honour ADMIN_EMAIL if it actually looks like an email — otherwise we fall
// back to the real account. This makes "admin123 / admin123" work even if someone
// sets ADMIN_EMAIL to a username by mistake.
const envEmail = process.env.ADMIN_EMAIL;
const ADMIN_EMAIL = envEmail && envEmail.includes("@") ? envEmail : "john@optinetsolutions.com";
const USERNAME_TO_EMAIL: Record<string, string> = {
  admin123: ADMIN_EMAIL,
  admin: ADMIN_EMAIL,
};

export async function signIn(_prevState: { error: string } | undefined, formData: FormData) {
  const id = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // No "@" → treat as a username alias; unknown usernames also fall back to the admin account.
  const email = id.includes("@") ? id : (USERNAME_TO_EMAIL[id.toLowerCase()] ?? ADMIN_EMAIL);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Invalid username or password." };
  redirect("/");
}
