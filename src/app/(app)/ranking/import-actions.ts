"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { decodeExport, parseAhrefsExport } from "@/lib/rankings/parse-ahrefs";

function minus7(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

type Result = { ok?: boolean; message?: string; error?: string };

export async function importRankings(_prev: Result | undefined, formData: FormData): Promise<Result> {
  await requireAdmin();
  const siteId = String(formData.get("site_id") ?? "");
  const file = formData.get("file");
  if (!siteId) return { error: "No site selected." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Ahrefs CSV export." };

  let rows;
  try {
    const text = decodeExport(new Uint8Array(await file.arrayBuffer()));
    rows = parseAhrefsExport(text);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not parse the file." };
  }
  if (!rows.length) return { error: "No data rows found in the file." };

  const dates = rows.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const weekCur = dates.at(-1);
  if (!weekCur) return { error: "Could not read the export's update date." };
  const weekPrev = minus7(weekCur);

  const supabase = await createServerSupabaseClient();
  const [{ data: kws }, { data: cts }] = await Promise.all([
    supabase.from("keywords").select("id, text"),
    supabase.from("countries").select("id, code"),
  ]);
  const kwMap = new Map(((kws ?? []) as Array<{ id: string; text: string }>).map((k) => [k.text.trim(), k.id]));
  const ccMap = new Map(((cts ?? []) as Array<{ id: string; code: string }>).map((c) => [c.code.toUpperCase(), c.id]));

  const payload: Array<{ week_date: string; site_id: string; country_id: string; keyword_id: string; position: number | null }> = [];
  const unmatched = new Set<string>();
  for (const r of rows) {
    const kid = kwMap.get(r.keyword);
    const cid = ccMap.get(r.countryCode);
    if (!kid || !cid) { unmatched.add(`${r.keyword || "?"} / ${r.countryCode || "?"}`); continue; }
    payload.push({ week_date: weekPrev, site_id: siteId, country_id: cid, keyword_id: kid, position: r.previous });
    payload.push({ week_date: weekCur, site_id: siteId, country_id: cid, keyword_id: kid, position: r.current });
  }
  if (!payload.length) {
    return { error: "No rows matched this site's keywords/countries — is the export for this project?" };
  }

  const { error } = await supabase.from("rankings").upsert(payload, { onConflict: "week_date,site_id,country_id,keyword_id" });
  if (error) return { error: error.message };

  revalidatePath("/ranking");
  const pairs = payload.length / 2;
  const ranked = payload.filter((p) => p.week_date === weekCur && p.position !== null).length;
  const skipped = unmatched.size ? ` ${unmatched.size} unmatched skipped.` : "";
  return { ok: true, message: `Imported ${pairs} keyword×country pairs for week ${weekCur}: ${ranked} ranking, ${pairs - ranked} not.${skipped}` };
}
