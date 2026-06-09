"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { NavItem } from "@/lib/nav";

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const site = params.get("site");
  const qs = site ? `?site=${encodeURIComponent(site)}` : "";

  return (
    <nav className="flex flex-wrap items-center gap-1 px-3 pb-2 sm:px-5">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={`${item.href}${qs}`}
            aria-current={active ? "page" : undefined}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              item.adminOnly ? "ml-auto" : "",
              active
                ? "bg-white/15 text-white"
                : "text-slate-300 hover:bg-white/10 hover:text-white",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
