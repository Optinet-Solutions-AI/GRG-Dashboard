import { TopNav } from "@/components/TopNav";
import { getCurrentUser, getCurrentRole, isAdminRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  const supabase = await createServerSupabaseClient();
  const { data: sites } = await supabase.from("sites").select("id, display_name").order("sort_order");
  return (
    <>
      <TopNav userEmail={user.email ?? ""} isAdmin={isAdminRole(role)} sites={sites ?? []} />
      <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
    </>
  );
}
