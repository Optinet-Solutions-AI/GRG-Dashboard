import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ENTITIES } from "@/lib/manage/entities";

export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex gap-6">
      <aside className="w-44 shrink-0">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Manage</h2>
        <nav className="flex flex-col gap-1 text-sm">
          {Object.values(ENTITIES).map((e) => (
            <Link key={e.slug} href={`/manage/${e.slug}`} className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100">
              {e.label}
            </Link>
          ))}
          <Link href="/manage/volumes" className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100">
            Search Volumes
          </Link>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
