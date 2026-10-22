import { chromium } from "playwright";
const URL = "https://grg-dashboard.vercel.app";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1250 } });
await p.goto(`${URL}/login`, { waitUntil: "domcontentloaded" });
await p.fill("#email", process.env.ADMIN_EMAIL);
await p.fill("#password", process.env.ADMIN_PASSWORD);
await p.click('button[type="submit"]');
await p.waitForURL(/\/(?!login)/, { timeout: 30000 }).catch(() => {});

const siteIds = await p.evaluate(async () => {
  const sel = document.querySelector("select");
  return sel ? [...sel.options].map((o) => ({ v: o.value, t: o.textContent?.trim() })) : [];
});

const read = async (url) => {
  await p.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  const t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  return {
    total: t.match(/TOTAL BACKLINKS (\d+)/)?.[1],
    control: t.match(/All keywords (\d+) Tracked keywords only (\d+)/)?.slice(1).join(" / "),
    note: /None of this site's \d+ backlinks/.test(t) ? t.match(/None of this site's[^.]*\./)?.[0] : null,
    stale: /No backlinks yet/.test(t),
    kwPanel: t.match(/Backlinks per keyword (\d+) keyword/)?.[1],
  };
};

for (const s of siteIds) {
  console.log(`\n== ${s.t}`);
  console.log("  all     :", JSON.stringify(await read(`${URL}/backlinks?site=${s.v}`)));
  console.log("  tracked :", JSON.stringify(await read(`${URL}/backlinks?site=${s.v}&keywords=tracked`)));
}
await p.goto(`${URL}/backlinks?keywords=tracked`, { waitUntil: "networkidle" });
await p.screenshot({ path: "tracked.tmp.png", clip: { x: 0, y: 120, width: 1500, height: 560 } });
await b.close();
