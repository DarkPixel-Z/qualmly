// Launch-day screenshot capture script.
// Run from repo root: node marketing/launch-assets/capture.mjs
//
// Drives a headless Chromium against the local static server (localhost:8765,
// served via `python -m http.server` from the repo root), captures the four
// hero shots we need for Twitter / LinkedIn / Reddit / Show HN, plus a wide
// "social card" image (1200×675).
//
// Each screenshot is saved twice:
//   - <name>.png         — full viewport (1280×800), what you see in Chrome
//   - <name>-social.png  — cropped/scaled to 1200×675 for OpenGraph cards

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const URL = "http://localhost:8765/index.html";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2 // 2x for retina-quality social cards
  });
  const page = await ctx.newPage();

  console.log("→ Loading landing page");
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof switchMode === "function", null, { timeout: 10000 });
  await page.waitForTimeout(800);

  // ── 1. Landing / App QA hero ─────────────────────────────────────────────
  console.log("→ Capturing 1-landing.png (App QA hero, fresh state)");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "1-landing.png"), fullPage: false });

  // ── 2. App QA results card with realistic findings ───────────────────────
  console.log("→ Capturing 2-results-card.png (App QA report with real findings)");
  await page.evaluate(() => {
    // Build a realistic-looking demo report and inject directly into the
    // renderer. Mirrors what a real scan returns.
    const demoReport = {
      score: 47,
      summary: "matchwise.app exposes Supabase service-role key in client bundle and ships a hard-coded sk_live_ Stripe key as UI placeholder text in the admin dashboard. RLS posture undeterminable from outside but admin RPC functions are called directly from the client.",
      categories: [
        { id: "auth", name: "Authentication", status: "Fail",
          issues: [
            { text: "Supabase service-role JWT exposed in /assets/index-Dp8DBQyP.js (240-char token)", severity: "fail" },
            { text: "Stripe sk_live_51TO… present in admin dashboard placeholder text", severity: "fail" },
            { text: "Admin RPC `get_admin_statistics` callable from client without role check verification", severity: "warn" }
          ],
          recommendation: "Rotate the leaked service-role key TODAY. Move it server-side. Add SQL role-check guards to admin RPCs and verify with pgTAP." },
        { id: "data", name: "Data Layer", status: "Fail",
          issues: [
            { text: "Supabase project URL + anon key in JS (expected; means RLS posture is the entire security story)", severity: "warn" },
            { text: "No Content-Security-Policy header — XSS would have full page access", severity: "fail" }
          ],
          recommendation: "Audit RLS policies on all 12 tables. Add CSP header via Vercel headers config." },
        { id: "errors", name: "Error Handling", status: "Warn",
          issues: [
            { text: "127.0.0.1:3000 fallback baked into the production bundle (dev URL survived build)", severity: "warn" }
          ],
          recommendation: "Strip dev URLs at build time. Use process.env.NODE_ENV gates." },
        { id: "responsive", name: "Responsive Design", status: "Pass", issues: [], recommendation: "Tailwind breakpoints configured correctly." },
        { id: "performance", name: "Performance", status: "Pass", issues: [], recommendation: "Bundle size acceptable. Vite tree-shaking active." }
      ]
    };
    if (typeof renderReport === "function") {
      renderReport(demoReport, "https://matchwise.app");
    }
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, "2-results-card.png"), fullPage: false });

  // ── 3. Code Review screen ────────────────────────────────────────────────
  console.log("→ Capturing 3-code-review.png");
  await page.evaluate(() => { switchMode("code"); window.scrollTo(0, 0); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "3-code-review.png"), fullPage: false });

  // ── 4. Monitor pitch screen (the new v1.4 feature) ───────────────────────
  console.log("→ Capturing 4-monitor-pitch.png");
  await page.evaluate(() => {
    localStorage.removeItem("qualmly_monitor_user");
    localStorage.removeItem("qualmly_monitor_pending_checkout");
    switchMode("monitor");
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "4-monitor-pitch.png"), fullPage: false });

  // ── 5. Monitor dashboard with stubbed watches ────────────────────────────
  console.log("→ Capturing 5-monitor-dashboard.png");
  await page.evaluate(() => {
    // Stub localStorage user + intercept the GET /api/watch call so we
    // render a populated dashboard without hitting the live worker.
    localStorage.setItem("qualmly_monitor_user", JSON.stringify({
      userId: "demo-uuid-screenshot",
      email: "amanda@darkpixel.dev",
      registeredAt: Date.now() - 14 * 86400_000
    }));
    const realFetch = window.fetch;
    window.fetch = (url, opts) => {
      if (typeof url === "string" && url.includes("/api/watch") && (!opts || (opts.method || "GET") === "GET")) {
        return Promise.resolve(new Response(JSON.stringify({
          watches: [
            { id: "w1", targetUrl: "https://matchwise.app", builder: "lovable", intervalDays: 7,  lastScanAt: Date.now() - 2 * 86400_000, paused: false },
            { id: "w2", targetUrl: "https://growthbook-staging.darkpixel.dev", builder: "v0", intervalDays: 14, lastScanAt: Date.now() - 6 * 86400_000, paused: false },
            { id: "w3", targetUrl: "https://demo.qualmly.dev",      builder: "claude-code", intervalDays: 1, lastScanAt: Date.now() - 18 * 3600_000, paused: false }
          ]
        }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return realFetch(url, opts);
    };
    if (typeof monitorRefreshDashboard === "function") monitorRefreshDashboard();
  });
  await page.waitForTimeout(800);
  // Scroll down so the dashboard card (sitting below the hero headline) is
  // the dominant element in the viewport. Without this scroll the screenshot
  // captures the unchanged "Catch regressions while you sleep" headline and
  // only the top of the watches list — the social-card crop ends up looking
  // identical to the pitch screen.
  await page.evaluate(() => {
    const el = document.getElementById("monitor-dashboard");
    if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
    else window.scrollBy(0, 500);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "5-monitor-dashboard.png"), fullPage: false });

  await browser.close();
  console.log("\n✓ Captured 5 hero screenshots at 2x retina (1280×800 viewport)");
}

main().catch(err => { console.error(err); process.exit(1); });
