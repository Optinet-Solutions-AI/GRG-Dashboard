import { createServerSupabaseClient } from "@/lib/supabase/server";

export type Overview = {
  avg_seo: number | null;
  avg_pagespeed: number | null;
  keywords_top10: number;
  qa_passing: number;
  qa_total: number;
  total_backlinks: number;
  latest_week: string | null;
};
export type TrendPoint = { week_date: string; count: number };

export async function getOverview(siteId: string | null): Promise<Overview | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("dashboard_overview", { p_site_id: siteId }).single();
  if (error) return null;
  return data as Overview;
}

export async function getTop10Trend(siteId: string | null): Promise<TrendPoint[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("rankings_top10_trend", { p_site_id: siteId });
  if (error || !data) return [];
  return data as TrendPoint[];
}
