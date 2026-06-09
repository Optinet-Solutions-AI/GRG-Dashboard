import { BRAND } from "@/config/brand";
import { NAV_ITEMS } from "@/lib/nav";
import { signOut } from "@/app/auth/actions";
import { SiteSelector } from "@/components/SiteSelector";
import { NavLinks } from "@/components/NavLinks";

type Site = { id: string; display_name: string };

export function TopNav({ userEmail, isAdmin, sites }: { userEmail: string; isAdmin: boolean; sites: Site[] }) {
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);
  return (
    <header className="bg-gradient-to-b from-slate-900 to-slate-800 text-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-5">
        <div className="flex items-center gap-4">
          <div className="leading-tight">
            <div className="text-lg font-extrabold tracking-tight">{BRAND.name}</div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{BRAND.productName}</div>
          </div>
          <SiteSelector sites={sites} />
        </div>
        <div className="flex items-center gap-3">
          {isAdmin ? (
            <>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">Admin</span>
              <span className="hidden text-xs text-slate-400 sm:inline">{userEmail}</span>
              <form action={signOut}>
                <button type="submit" className="text-xs text-slate-300 underline hover:text-white">Sign out</button>
              </form>
            </>
          ) : (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">Live report</span>
          )}
        </div>
      </div>
      <NavLinks items={items} />
    </header>
  );
}
