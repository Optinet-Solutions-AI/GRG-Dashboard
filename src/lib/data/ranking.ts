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
