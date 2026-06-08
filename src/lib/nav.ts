export type NavItem = { label: string; href: string; adminOnly?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/" },
  { label: "SEO", href: "/seo" },
  { label: "Health", href: "/health" },
  { label: "PageSpeed", href: "/pagespeed" },
  { label: "Ranking", href: "/ranking" },
  { label: "Backlinks", href: "/backlinks" },
  { label: "QA", href: "/qa" },
  { label: "Analytics", href: "/analytics" },
  { label: "Manage", href: "/manage", adminOnly: true },
];
