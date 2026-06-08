import Link from "next/link";
import { BRAND } from "@/config/brand";
import { NAV_ITEMS } from "@/lib/nav";
import { signOut } from "@/app/auth/actions";
import { SiteSelector } from "@/components/SiteSelector";

type Site = { id: string; display_name: string };

export function TopNav({ userEmail, isAdmin, sites }: { userEmail: string; isAdmin: boolean; sites: Site[] }) {
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);
  return (
    <header className="bg-slate-900 text-white">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-4">
          <span className="text-lg font-extrabold">{BRAND.name}</span>
          <SiteSelector sites={sites} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{userEmail}</span>
          <form action={signOut}>
            <button type="submit" className="text-xs text-slate-300 hover:text-white underline">Sign out</button>
          </form>
        </div>
      </div>
      <nav className="flex gap-5 border-b-2 border-slate-800 px-5 pb-2 text-sm text-slate-300">
        {items.map((item) => (
          <Link key={item.href} href={item.href}
            className={item.adminOnly ? "ml-auto text-slate-400 hover:text-white" : "hover:text-white"}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
