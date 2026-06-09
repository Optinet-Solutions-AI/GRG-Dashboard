import { chromium } from "playwright";

const BASE = "https://optinet-seo-dashboard.vercel.app";
const out = ".tmp/shots";
import { mkdirSync } from "node:fs";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

// --- Desktop: ranking + open assistant chat ---
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await desk.newPage();
await p.goto(`${BASE}/ranking`, { waitUntil: "networkidle" });
// open the chat bubble
await p.click('button[aria-label="Open chat"]');
await p.waitForTimeout(400);
// type a question
await p.fill('input[aria-label="Type a message"]', "what changed in the rankings?");
await p.click('button[aria-label="Send"]');
await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/desktop-ranking-chat.png` });

// check scrollbar hidden: measure body scrollbar width
const scrollbarHidden = await p.evaluate(() => {
  const d = document.createElement("div");
  d.style.cssText = "width:100px;height:100px;overflow:scroll;position:absolute;top:-9999px";
  document.body.appendChild(d);
  const w = d.offsetWidth - d.clientWidth;
  d.remove();
  return w === 0;
});

// chat thread content
const botMsgs = await p.$$eval('div', () => 0).catch(() => 0);
const chatHasAnswer = await p.locator("text=/improved|dropped|top 100|ranking/i").count();

// --- Mobile: backlinks (sortable) + overview ---
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const m = await mob.newPage();
await m.goto(`${BASE}/backlinks`, { waitUntil: "networkidle" });
await m.screenshot({ path: `${out}/mobile-backlinks.png`, fullPage: false });
// click a sort header (Status) and confirm no crash
const hadHeaders = await m.locator('button:has-text("Keyword / anchor")').count();
await m.locator('button:has-text("Status")').first().click().catch(() => {});
await m.waitForTimeout(300);
await m.goto(`${BASE}/qa`, { waitUntil: "networkidle" });
await m.screenshot({ path: `${out}/mobile-qa.png`, fullPage: false });
const qaPageCount = await m.locator("tbody tr").count();

await browser.close();
console.log(JSON.stringify({ scrollbarHidden, chatHasAnswer, hadHeaders, qaPageCount }, null, 2));
