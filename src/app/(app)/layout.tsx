import { TopNav } from "@/components/TopNav";

// Phase 2 replaces this with the reference's auth-guarded async layout (cookies + DB),
// which is dynamic by nature. Until then, force dynamic rendering so the prerenderer
// doesn't trip on `useSearchParams()` inside the nav's SiteSelector.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav userEmail="local@dev" isAdmin={true} sites={[]} />
      <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
    </>
  );
}
