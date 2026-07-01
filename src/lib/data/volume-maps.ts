// src/lib/data/volume-maps.ts
export type KeywordVolumes = {
  global: Map<string, number>;     // key: keyword text
  perMarket: Map<string, number>;  // key: `${keyword}|${country}`
};

type Rel<T> = T | T[] | null | undefined;
const one = <T,>(r: Rel<T>): T | undefined => (Array.isArray(r) ? r[0] : r ?? undefined);

export function buildVolumeMaps(
  keywords: { text: string; global_volume: number | null }[],
  volumes: { volume: number | null; keywords: Rel<{ text: string }>; countries: Rel<{ code: string }> }[],
): KeywordVolumes {
  const global = new Map<string, number>();
  for (const k of keywords) {
    if (k.global_volume != null) global.set(k.text, k.global_volume);
  }
  const perMarket = new Map<string, number>();
  for (const v of volumes) {
    const kw = one(v.keywords)?.text;
    const cc = one(v.countries)?.code;
    if (kw && cc && v.volume != null) perMarket.set(`${kw}|${cc}`, v.volume);
  }
  return { global, perMarket };
}
