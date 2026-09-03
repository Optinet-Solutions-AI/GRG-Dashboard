// Bounded-concurrency mapper with a stop predicate.
//
// Serverless functions have a hard wall-clock limit, and work that grows with the
// data (one PageSpeed pass per tracked URL) will eventually cross it. Running a
// few at a time keeps a run fast, and the stop predicate lets a caller finish
// cleanly and report the remainder rather than being killed mid-write.

export type Outcome<T> =
  | { status: "done"; value: T }
  | { status: "failed"; error: string }
  | { status: "skipped" };

export async function mapWithLimit<In, Out>(
  items: In[],
  limit: number,
  fn: (item: In, index: number) => Promise<Out>,
  shouldStop?: () => boolean,
): Promise<Outcome<Out>[]> {
  const results: Outcome<Out>[] = items.map(() => ({ status: "skipped" }));
  let next = 0;

  async function worker() {
    for (;;) {
      if (shouldStop?.()) return;
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { status: "done", value: await fn(items[i], i) };
      } catch (e) {
        results[i] = { status: "failed", error: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}
