// Pull the SEO-relevant facts out of a page's HTML.
//
// Deliberately dependency-free: jsdom is a devDependency (it exists for vitest) and is
// far too heavy to pull into the serverless bundle for what amounts to reading a dozen
// tags. Everything here is pure so the scoring can be unit-tested without a network.
//
// The one rule: never throw on malformed markup. A page that half-renders should still
// produce facts — the checks decide what a missing fact means.

export type PageFacts = {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  metaRobots: string | null;
  lang: string | null;
  dir: string | null;
  hasViewport: boolean;
  hasFavicon: boolean;
  h1: string[];
  h2Count: number;
  h3Count: number;
  wordCount: number;
  images: { total: number; withAlt: number };
  links: { internal: number; external: number; nofollowExternal: number };
  jsonLdTypes: string[];
  jsonLdBroken: number;
  og: string[];
  twitter: string[];
  hreflang: string[];
  mixedContent: number;
};

const STRIP_BLOCKS = /<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : null;
}

/** Every `<meta>`/`<link>`/`<a>`/`<img>` tag of a kind, as raw tag strings. */
function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function extractFacts(html: string, pageUrl: string): PageFacts {
  const clean = html.replace(COMMENTS, "");
  const head = clean.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? clean;
  const htmlTag = clean.match(/<html\b[^>]*>/i)?.[0] ?? "";

  const metas = tags(head, "meta");
  const metaByName = (name: string) =>
    metas.find((t) => (attr(t, "name") ?? "").toLowerCase() === name.toLowerCase()) ?? null;
  const links = tags(head, "link");
  const linkByRel = (rel: string) =>
    links.filter((t) => (attr(t, "rel") ?? "").toLowerCase().split(/\s+/).includes(rel));

  // Text/word count is measured on the body with scripts and styles removed, so inline
  // JSON-LD and CSS can't inflate a thin page into a "long" one.
  const bodyHtml = clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? clean;
  const readable = text(bodyHtml.replace(STRIP_BLOCKS, " "));
  const wordCount = readable ? readable.split(/\s+/).filter(Boolean).length : 0;

  const imgTags = tags(bodyHtml, "img");
  const withAlt = imgTags.filter((t) => (attr(t, "alt") ?? "").trim().length > 0).length;

  let host = "";
  try {
    host = new URL(pageUrl).host.replace(/^www\./, "");
  } catch {
    host = "";
  }
  let internal = 0;
  let external = 0;
  let nofollowExternal = 0;
  for (const a of bodyHtml.match(/<a\b[^>]*>/gi) ?? []) {
    const href = attr(a, "href");
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    let isExternal = false;
    if (/^https?:\/\//i.test(href)) {
      try {
        isExternal = new URL(href).host.replace(/^www\./, "") !== host;
      } catch {
        isExternal = false;
      }
    }
    if (isExternal) {
      external++;
      if ((attr(a, "rel") ?? "").toLowerCase().includes("nofollow")) nofollowExternal++;
    } else {
      internal++;
    }
  }

  const jsonLdTypes: string[] = [];
  let jsonLdBroken = 0;
  for (const block of clean.match(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? []) {
    const raw = block.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const parsed: unknown = JSON.parse(raw);
      const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node && typeof node === "object") {
          const t = (node as Record<string, unknown>)["@type"];
          if (typeof t === "string") jsonLdTypes.push(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && jsonLdTypes.push(x));
          for (const v of Object.values(node as Record<string, unknown>)) {
            if (v && typeof v === "object") walk(v);
          }
        }
      };
      walk(parsed);
    } catch {
      // A schema block that doesn't parse is worse than none: it looks present but
      // Google discards it, so count it instead of swallowing the error.
      jsonLdBroken++;
    }
  }

  const prop = (t: string) => (attr(t, "property") ?? attr(t, "name") ?? "").toLowerCase();
  const og = metas.map(prop).filter((p) => p.startsWith("og:")).map((p) => p.slice(3));
  const twitter = metas.map(prop).filter((p) => p.startsWith("twitter:")).map((p) => p.slice(8));

  // Mixed content only matters on an https page: an http subresource is blocked or warned
  // about by the browser, which is a real SEO/trust problem rather than a style nit.
  const mixedContent = pageUrl.startsWith("https://")
    ? (clean.match(/\b(?:src|href)\s*=\s*["']http:\/\/[^"']+["']/gi) ?? []).length
    : 0;

  return {
    title: clean.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ? text(clean.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)![1]) : null,
    metaDescription: (() => {
      const v = metaByName("description");
      const c = v ? (attr(v, "content") ?? "").trim() : "";
      return c || null;
    })(),
    canonical: (() => {
      const c = linkByRel("canonical")[0];
      return c ? attr(c, "href") : null;
    })(),
    metaRobots: (() => {
      const r = metaByName("robots");
      const c = r ? (attr(r, "content") ?? "").trim() : "";
      return c || null;
    })(),
    lang: attr(htmlTag, "lang"),
    dir: attr(htmlTag, "dir"),
    hasViewport: Boolean(metaByName("viewport")),
    hasFavicon: links.some((t) => (attr(t, "rel") ?? "").toLowerCase().includes("icon")),
    h1: (clean.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi) ?? []).map((h) => text(h)).filter(Boolean),
    h2Count: (clean.match(/<h2\b[^>]*>/gi) ?? []).length,
    h3Count: (clean.match(/<h3\b[^>]*>/gi) ?? []).length,
    wordCount,
    images: { total: imgTags.length, withAlt },
    links: { internal, external, nofollowExternal },
    jsonLdTypes: [...new Set(jsonLdTypes)],
    jsonLdBroken,
    og: [...new Set(og)],
    twitter: [...new Set(twitter)],
    hreflang: [...new Set(links.map((t) => attr(t, "hreflang")).filter((v): v is string => Boolean(v)))],
    mixedContent,
  };
}
