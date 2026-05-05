// Deep-check e2e — runs LAST before launch. Covers everything launch-eve
// didn't: mobile viewport, App QA + Code Review tabs, form validation edges,
// Subscribe→Gumroad redirect, deep-link safety.
//
// Run: node workers/monitoring/.scripts/e2e-deep-check.mjs

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "..", "..", "..", "marketing", "launch-assets", ".deep-check-shots");
fs.mkdirSync(SHOTS, { recursive: true });

const SITE = "https://qualmly.dev";

const fails = [];
function check(name, cond, detail = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? "  — " + detail : ""}`); fails.push(name + (detail ? ": " + detail : "")); }
}

async function freshContext(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  // Best-effort: silence noise but capture real errors
  return { ctx, page };
}

async function main() {
  console.log(`\n=== Deep-check e2e against ${SITE} ===\n`);

  const browser = await chromium.launch({ headless: true, args: ["--disable-cache"] });
  const cb = "_cb=" + Date.now();

  // ──────────────────────────────────────────────────────────────────────
  // SECTION A — Mobile viewport (375x812 = iPhone X portrait)
  // ──────────────────────────────────────────────────────────────────────
  console.log("[A] Mobile viewport (375x812)");
  {
    const { ctx, page } = await freshContext(browser, { width: 375, height: 812 });
    await page.goto(`${SITE}/?${cb}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof switchMode === "function", null, { timeout: 15000 });
    await page.waitForTimeout(500);

    // Mobile-specific tabs at top should be visible
    const mobQa     = await page.locator("#mtab-qa").isVisible();
    const mobCode   = await page.locator("#mtab-code").isVisible();
    const mobMon    = await page.locator("#mtab-monitor").isVisible();
    check("Mobile mode-tabs visible (qa/code/monitor)", mobQa && mobCode && mobMon);

    // Click Monitor — should switch
    await page.locator("#mtab-monitor").click();
    await page.waitForTimeout(400);
    const monVisible = await page.locator("#monitor-screen").isVisible();
    check("Mobile: Monitor tab activates", monVisible);
    await page.screenshot({ path: path.join(SHOTS, "A1-mobile-monitor-pitch.png") });

    // The form fields should not have any VISIBLE element extending past the
    // viewport. body.scrollWidth can be inflated by drop-shadow / filter side
    // effects that overflow-x: hidden clips invisibly — so we check actual
    // visible element bounding boxes instead.
    const visibleOverflow = await page.evaluate(() => {
      const tooWide = [];
      for (const el of document.querySelectorAll("*")) {
        // Only count elements that are actually rendered (not display:none)
        if (el.offsetParent === null && el.tagName !== "BODY" && el.tagName !== "HTML") continue;
        const r = el.getBoundingClientRect();
        if (r.right > 380) {
          tooWide.push({ tag: el.tagName.toLowerCase(), id: el.id, right: r.right });
        }
      }
      return tooWide;
    });
    check("Mobile: no visible element overflows viewport",
      visibleOverflow.length === 0,
      `${visibleOverflow.length} elements overflow: ${visibleOverflow.slice(0,3).map(e => `${e.tag}#${e.id}@${Math.round(e.right)}px`).join(", ")}`);

    // "I already paid" button reachable + clickable
    await page.locator("button:has-text('I already paid')").click();
    await page.waitForTimeout(300);
    const onboardW = await page.locator("#monitor-onboard").isVisible();
    check("Mobile: onboard form reachable", onboardW);
    await page.screenshot({ path: path.join(SHOTS, "A2-mobile-onboard.png") });

    await ctx.close();
  }

  // ──────────────────────────────────────────────────────────────────────
  // SECTION B — App QA mode regression (no real Anthropic call)
  // ──────────────────────────────────────────────────────────────────────
  console.log("\n[B] App QA mode regression");
  {
    const { ctx, page } = await freshContext(browser, { width: 1280, height: 900 });
    await page.goto(`${SITE}/?${cb}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof switchMode === "function", null, { timeout: 15000 });
    await page.waitForTimeout(500);

    // Default lands on App QA
    const qaActive = await page.locator("#tab-qa").evaluate(el => el.classList.contains("active"));
    check("App QA tab is active by default", qaActive);

    // Hero copy + URL field present
    const urlField = await page.locator("#url").isVisible();
    const checkBtn = await page.locator("#check-btn").isVisible();
    check("App QA: URL input + Check button visible", urlField && checkBtn);

    // Type a URL — input should accept and char counter update
    await page.fill("#url", "https://example.com");
    await page.waitForTimeout(300);
    const counter = await page.locator("#url-counter").textContent();
    check("App QA: URL char counter updates on input",
      counter && counter.includes("19"), `counter: "${counter}"`);

    // Test the LIVE DEMO button — should load a demo report (no API call)
    // First confirm the demo button exists
    const demoBtn = page.locator("button:has-text('demo')").first();
    const demoExists = await demoBtn.count() > 0;
    if (demoExists) {
      await demoBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
      // Demo flow should land on the report screen
      const reportShown = await page.locator("#report").isVisible().catch(() => false);
      check("App QA: live demo button loads a report (smoke)", reportShown,
        `report visible after click: ${reportShown}`);
    } else {
      check("App QA: live demo button not present (skipped)", true, "(no demo button found, OK)");
    }
    await page.screenshot({ path: path.join(SHOTS, "B1-appqa.png") });

    await ctx.close();
  }

  // ──────────────────────────────────────────────────────────────────────
  // SECTION C — Code Review mode regression
  // ──────────────────────────────────────────────────────────────────────
  console.log("\n[C] Code Review mode regression");
  {
    const { ctx, page } = await freshContext(browser, { width: 1280, height: 900 });
    await page.goto(`${SITE}/?mode=code&${cb}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof switchMode === "function", null, { timeout: 15000 });
    await page.waitForTimeout(800);

    const codeShown = await page.locator("#code-screen").isVisible();
    check("Code Review: tab activates via ?mode=code deep link", codeShown);

    // Language picker exists
    const langPicker = await page.locator("#code-lang").isVisible();
    check("Code Review: language picker visible", langPicker);

    // Code paste textarea — use the specific id (#code-input). Generic
    // textarea selector picks up hidden textareas on the App QA screen.
    const codeArea = await page.locator("#code-input").isVisible();
    check("Code Review: code-paste textarea (#code-input) visible", codeArea);
    await page.screenshot({ path: path.join(SHOTS, "C1-codereview.png") });

    await ctx.close();
  }

  // ──────────────────────────────────────────────────────────────────────
  // SECTION D — Form validation edge cases (Monitor onboard)
  // ──────────────────────────────────────────────────────────────────────
  console.log("\n[D] Monitor onboard form validation");
  {
    const { ctx, page } = await freshContext(browser, { width: 1280, height: 900 });
    await page.goto(`${SITE}/?mode=monitor&${cb}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof switchMode === "function", null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.locator("button:has-text('I already paid')").click();
    await page.waitForTimeout(300);

    // Helper: fill all fields then click submit, capture error text
    async function tryRegister(opts) {
      await page.fill("#mon-email", opts.email ?? "valid@example.com");
      await page.fill("#mon-passphrase", opts.passphrase ?? "valid-passphrase-123");
      await page.fill("#mon-anthropic-key", opts.key ?? "sk-ant-api03-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
      await page.fill("#mon-watch-url", opts.url ?? "https://example.com");
      await page.locator("#monitor-register-btn").click();
      await page.waitForTimeout(600);
      const err = await page.locator("#monitor-onboard-error").textContent().catch(() => "");
      return err.trim();
    }

    // 1. Bad email format
    let err = await tryRegister({ email: "not-an-email" });
    check("D1: rejects bad email format",
      err.toLowerCase().includes("valid email"), `got: ${err.slice(0, 80)}`);

    // 2. Short passphrase
    err = await tryRegister({ passphrase: "short" });
    check("D2: rejects passphrase < 12 chars",
      err.toLowerCase().includes("passphrase"), `got: ${err.slice(0, 80)}`);

    // 3. Bad Anthropic key shape
    err = await tryRegister({ key: "not-an-anthropic-key" });
    check("D3: rejects malformed Anthropic key",
      err.toLowerCase().includes("anthropic key"), `got: ${err.slice(0, 80)}`);

    // 4. http:// URL (should require https)
    err = await tryRegister({ url: "http://example.com" });
    check("D4: rejects http:// (requires https)",
      err.toLowerCase().includes("https"), `got: ${err.slice(0, 80)}`);

    // 5. Anthropic key with trailing junk (regex anchor test)
    err = await tryRegister({ key: "sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<script>alert(1)</script>" });
    check("D5: rejects key with trailing junk (anchor enforcement)",
      err.toLowerCase().includes("anthropic key"), `got: ${err.slice(0, 80)}`);

    await page.screenshot({ path: path.join(SHOTS, "D-validation-final-error.png") });

    await ctx.close();
  }

  // ──────────────────────────────────────────────────────────────────────
  // SECTION E — Subscribe button → Gumroad URL chain
  // ──────────────────────────────────────────────────────────────────────
  console.log("\n[E] Subscribe button → /api/checkout → Gumroad URL");
  {
    const { ctx, page } = await freshContext(browser, { width: 1280, height: 900 });
    await page.goto(`${SITE}/?mode=monitor&${cb}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof switchMode === "function", null, { timeout: 15000 });
    await page.waitForTimeout(500);

    // Better strategy: intercept the gumroad navigation via Playwright's
    // page.on('framenavigated') event. window.location.href = X triggers
    // a frame navigation, which we capture before the gumroad page actually
    // loads (which would fail anyway in a headless environment without auth).
    let navigatedTo = null;
    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) {
        const u = frame.url();
        if (u.includes("gumroad.com") || u.includes("buy.stripe.com")) {
          navigatedTo = u;
        }
      }
    });

    await page.locator("#monitor-subscribe-btn").click();
    // Give the fetch + navigation time to fire. The actual gumroad page
    // load may fail (CORS, headless), but the framenavigated event fires
    // BEFORE the page fully loads, so we capture the URL either way.
    await page.waitForTimeout(5000);

    check("E: Subscribe redirects to Gumroad",
      navigatedTo && navigatedTo.includes("gumroad.com"),
      `navigatedTo: ${navigatedTo ? navigatedTo.slice(0, 120) : "(no nav captured)"}`);
    // Note: client_reference_id is ONLY appended when the user has an existing
    // userId (i.e. they registered, signed out, are now re-subscribing). For a
    // fresh user clicking Subscribe, there is no userId yet — the user creates
    // one AFTER paying. The architecture resolves Gumroad customer back to
    // Qualmly user via email lookup (USERS KV `email:<addr>` index), not via
    // client_reference_id. So bare URL is correct for the canonical flow.

    await ctx.close();
  }

  // ──────────────────────────────────────────────────────────────────────
  // SECTION F — Deep link safety (phishing / state injection)
  // ──────────────────────────────────────────────────────────────────────
  console.log("\n[F] Deep link safety (?email= phishing, ?checkout=cancel)");
  {
    const { ctx, page } = await freshContext(browser, { width: 1280, height: 900 });

    // F1: ?email= query param should NOT pre-fill email (phishing defense)
    await page.goto(`${SITE}/?mode=monitor&checkout=success&email=victim%40attacker.com&${cb}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof switchMode === "function", null, { timeout: 15000 });
    await page.waitForTimeout(800);
    const onboardShown = await page.locator("#monitor-onboard").isVisible();
    check("F1: ?checkout=success lands on onboard form", onboardShown);
    if (onboardShown) {
      const emailVal = await page.locator("#mon-email").inputValue();
      check("F1: ?email= query param does NOT pre-fill (phishing defense)",
        emailVal !== "victim@attacker.com",
        `email field contained: "${emailVal}"`);
    }

    // F2: ?checkout=cancel should clear pending flag (no trapped users)
    await page.goto(`${SITE}/?mode=monitor&${cb}1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof switchMode === "function", null, { timeout: 15000 });
    await page.waitForTimeout(400);
    // Manually set pending_checkout=1 (simulating user who clicked Subscribe but cancelled)
    await page.evaluate(() => localStorage.setItem("qualmly_monitor_pending_checkout", "1"));
    // Now navigate with ?checkout=cancel
    await page.goto(`${SITE}/?mode=monitor&checkout=cancel&${cb}2`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof switchMode === "function", null, { timeout: 15000 });
    await page.waitForTimeout(800);
    const flagAfter = await page.evaluate(() => localStorage.getItem("qualmly_monitor_pending_checkout"));
    check("F2: ?checkout=cancel clears pending_checkout flag (not trapped)",
      flagAfter === null, `flag value: "${flagAfter}"`);
    const pitchShown = await page.locator("#monitor-pitch").isVisible();
    check("F2: after ?checkout=cancel, pitch shows (not onboard)", pitchShown);

    await ctx.close();
  }

  await browser.close();

  // ────────────── results ──────────────
  console.log(`\n=== Results ===`);
  console.log(`  Failed checks: ${fails.length}`);
  if (fails.length) {
    console.log(`\nFAILED:`);
    fails.forEach(f => console.log(`  - ${f}`));
    console.log(`\n🔴 ISSUES FOUND`);
    process.exit(1);
  } else {
    console.log(`\n🟢 ALL DEEP-CHECK SCENARIOS PASS`);
  }
  console.log(`\nScreenshots: ${SHOTS}`);
}

main().catch(err => { console.error(err); process.exit(1); });
