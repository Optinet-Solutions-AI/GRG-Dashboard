import { createServerSupabaseClient } from "@/lib/supabase/server";
import { VolumeGridEditor } from "@/components/manage/VolumeGridEditor";
import { saveVolumes } from "./actions";

export default async function VolumesPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data: kws }, { data: ctys }, { data: vols }] = await Promise.all([
    supabase.from("keywords").select("id, text, global_volume").order("sort_order"),
    supabase.from("countries").select("id, code").order("sort_order"),
    supabase.from("keyword_volumes").select("keyword_id, country_id, volume"),
  ]);

  const keywords = (kws ?? []).map((k) => ({ id: k.id as string, text: k.text as string }));
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
