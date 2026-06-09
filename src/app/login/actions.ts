"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Single-admin dashboard: the user signs in with a simple username, which we
// map to the real Supabase Auth email. Anything containing "@" is treated as
// an email and passed through unchanged.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "john@optinetsolutions.com";
const USERNAME_TO_EMAIL: Record<string, string> = {
  admin123: ADMIN_EMAIL,
  admin: ADMIN_EMAIL,
};

export async function signIn(_prevState: { error: string } | undefined, formData: FormData) {
  const id = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const email = id.includes("@") ? id : (USERNAME_TO_EMAIL[id.toLowerCase()] ?? id);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Invalid username or password." };
  redirect("/");
}
