import { TopNav } from "@/components/TopNav";
import { getCurrentUser, getCurrentRole, isAdminRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const role = user ? await getCurrentRole() : null;
  const supabase = await createServerSupabaseClient();
  const { data: sites } = await supabase.from("sites").select("id, display_name").order("sort_order");
  return (
    <>
      <TopNav userEmail={user?.email ?? ""} isAdmin={isAdminRole(role)} sites={sites ?? []} />
      <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
      <AssistantWidget />
    </>
  );
}
