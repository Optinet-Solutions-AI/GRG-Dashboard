import { describe, it, expect } from "vitest";
import { mapWithLimit } from "./concurrency";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapWithLimit", () => {
  it("never runs more than `limit` tasks at once", async () => {
    let running = 0;
    let peak = 0;
    await mapWithLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await sleep(10);
      running--;
      return n;
    });
    expect(peak).toBe(2);
  });

  it("returns results in input order, not completion order", async () => {
    const r = await mapWithLimit([30, 10, 20], 3, async (ms) => {
      await sleep(ms);
      return ms;
    });
    expect(r.map((x) => x.status === "done" && x.value)).toEqual([30, 10, 20]);
  });

  it("isolates a failure so the rest still complete", async () => {
    const r = await mapWithLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });
    expect(r[0]).toEqual({ status: "done", value: 1 });
    expect(r[1]).toEqual({ status: "failed", error: "boom" });
    expect(r[2]).toEqual({ status: "done", value: 3 });
  });

  it("stops starting new work once the deadline predicate trips, marking the rest skipped", async () => {
    // The PageSpeed cron must never blow its 60s function limit: better to do 2 of 6
    // and report the remainder than to be killed mid-write.
    let started = 0;
    const r = await mapWithLimit(
      [1, 2, 3, 4, 5, 6], 1,
      async (n) => { started++; await sleep(5); return n; },
      () => started >= 2,
    );
    expect(started).toBe(2);
    expect(r.filter((x) => x.status === "skipped").length).toBe(4);
  });

  it("handles an empty input", async () => {
    expect(await mapWithLimit([], 3, async (n) => n)).toEqual([]);
  });
});
