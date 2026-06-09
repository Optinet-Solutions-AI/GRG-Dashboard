import { createServerSupabaseClient } from "@/lib/supabase/server";

export type GridRow = {
  keyword: string;
  keyword_sort: number;
  country: string;
  country_sort: number;
  position: number | null;
  prev_position: number | null;
};

export async function getRankingWeeks(): Promise<string[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("ranking_weeks");
  return (data ?? []).map((r: { week_date: string }) => r.week_date);
}

export async function getRankingGrid(siteId: string, week: string): Promise<GridRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("ranking_grid", { p_site_id: siteId, p_week: week });
  if (error || !data) return [];
  return data as GridRow[];
}

/**
 * One round-trip for the most recent `limit` weeks. Returns weeks newest-first
 * with their grid rows, replacing the per-week fan-out on the ranking page.
 */
export async function getRankingGridByWeek(
  siteId: string,
  limit = 26,
): Promise<{ week: string; rows: GridRow[] }[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("ranking_grid_multi", { p_site_id: siteId, p_limit: limit });
  if (error || !data) return [];
  const byWeek = new Map<string, GridRow[]>();
  for (const r of data as Array<GridRow & { week_date: string }>) {
    const list = byWeek.get(r.week_date) ?? [];
    list.push(r);
    byWeek.set(r.week_date, list);
  }
  // RPC already orders by week_date desc, so insertion order is newest-first.
  return [...byWeek.entries()].map(([week, rows]) => ({ week, rows }));
}
