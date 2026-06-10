// Pure string utilities for the tokenless NLU. No network, no model — unit-testable.

/** Lowercase, strip punctuation, collapse whitespace, pad with spaces for boundary checks. */
export function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[?!.,;:()"'’]/g, " ")} `.replace(/\s+/g, " ");
}

/** Word tokens from text. Arabic preserved (only ASCII punctuation is stripped). */
export function tokenize(text: string): string[] {
  return normalize(text).trim().split(" ").filter(Boolean);
}

/** Light English suffix stripper, applied iteratively until stable. Leaves non-ASCII
 *  (Arabic) and short stems untouched, so it never mangles entities. */
export function stem(token: string): string {
  if (!/^[a-z]+$/.test(token)) return token;
  let t = token;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of ["ing", "ed", "s"]) {
      if (t.endsWith(suf) && t.length - suf.length >= 3) {
        t = t.slice(0, -suf.length);
        changed = true;
        break;
      }
    }
  }
  return t;
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** True if two words are equal, or close enough to be a typo. Only fuzzes words with
 *  length >= 5 on BOTH sides (short words like seo/ceo must match exactly), with a
 *  distance budget of 1 (<=7 chars) or 2 (longer) and a small length gap. */
export function fuzzyEq(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  if (Math.abs(a.length - b.length) > 2) return false;
  const budget = Math.max(a.length, b.length) <= 7 ? 1 : 2;
  return levenshtein(a, b) <= budget;
}
