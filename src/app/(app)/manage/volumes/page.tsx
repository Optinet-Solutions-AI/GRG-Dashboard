import { createServerSupabaseClient } from "@/lib/supabase/server";
import { VolumeGridEditor } from "@/components/manage/VolumeGridEditor";
import { keywordsTrackedBySomeSite } from "@/lib/manage/tracked-keywords";
import { saveVolumes } from "./actions";

export default async function VolumesPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data: kws }, { data: ctys }, { data: vols }, { data: targets }] = await Promise.all([
    supabase.from("keywords").select("id, text, global_volume").order("sort_order"),
    supabase.from("countries").select("id, code").order("sort_order"),
    supabase.from("keyword_volumes").select("keyword_id, country_id, volume"),
    // The editor follows the rank-tracked roster, not the whole keywords table: that table is
    // shared by the three sites and only ever grew, so it listed 410 keywords while 85 were
    // tracked. A volume typed against an untracked keyword is shown nowhere and measured by
    // nothing.
    supabase.from("keyword_targets").select("keyword_id"),
  ]);

  const all = (kws ?? []).map((k) => ({ id: k.id as string, text: k.text as string }));
  const keywords = keywordsTrackedBySomeSite(all, targets as { keyword_id: string }[] | null);
  const hidden = all.length - keywords.length;
  const countries = (ctys ?? []).map((c) => ({ id: c.id as string, code: c.code as string }));

  const globalPrefill: Record<string, number | null> = {};
  for (const k of (kws ?? []) as Array<{ id: string; global_volume: number | null }>) {
    globalPrefill[k.id] = k.global_volume;
  }
  const cellPrefill: Record<string, number | null> = {};
  for (const v of (vols ?? []) as Array<{ keyword_id: string; country_id: string; volume: number | null }>) {
    cellPrefill[`${v.keyword_id}|${v.country_id}`] = v.volume;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Search Volumes</h1>
      <p className="text-xs text-slate-500">
        Global search volume (GSV) per keyword and per-market search volume (SV). Blank = unknown. Saved values appear on the ranking grid.
      </p>
      <p className="text-xs text-slate-500">
        {keywords.length} keyword{keywords.length === 1 ? "" : "s"} — the ones the three sites are rank-tracked for.
        {hidden > 0
          ? ` ${hidden} older keyword${hidden === 1 ? "" : "s"} no site tracks any more ${hidden === 1 ? "is" : "are"} not listed; their recorded positions are kept.`
          : ""}
      </p>
      <VolumeGridEditor
        keywords={keywords}
        countries={countries}
        globalPrefill={globalPrefill}
        cellPrefill={cellPrefill}
        action={saveVolumes}
      />
    </div>
  );
}
