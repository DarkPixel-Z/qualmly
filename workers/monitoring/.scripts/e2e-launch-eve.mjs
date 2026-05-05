// End-to-end smoke test against the LIVE qualmly.dev — pretends to be a real
// user signing up for the Pro tier. Walks register → watch CRUD → sign-out.
//
// Catches: GitHub Pages serving stale build, CORS, frontend↔worker glue,
// PBKDF2 timing in a real browser, validation errors surfacing in the UI,
// dashboard render correctness, button debounce.
//
// Run from repo root:
//   node workers/monitoring/.scripts/e2e-launch-eve.mjs

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "..", "..", "..", "marketing", "launch-assets", ".e2e-shots");
import fs from "node:fs";
fs.mkdirSync(SHOTS, { recursive: true });

const SITE = "https://qualmly.dev";
const TEST_ID = Date.now();
const TEST_EMAIL = `launch-eve-${TEST_ID}@example.com`;
const TEST_PASSPHRASE = "test-passphrase-launch-eve-12345";
const TEST_KEY = "sk-ant-api03-LAUNCH-EVE-NOT-REAL-KEY_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const WATCH_URL_1 = "https://example.com";
const WATCH_URL_2 = "https://example.org";

const fails = [];
const consoleErrors = [];
const networkFails = [];

function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}${detail ? "  — " + detail : ""}`);
    fails.push(name + (detail ? ": " + detail : ""));
  }
}

async function main() {
  console.log(`\n=== E2E launch-eve smoke (${new Date().toISOString()}) ===`);
  console.log(`Site:     ${SITE}`);
  console.log(`Test ID:  ${TEST_ID}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-cache"]
  });
  // Note: do NOT set Cache-Control via extraHTTPHeaders — that triggers CORS
  // preflights everywhere (cdnjs, fonts.gstatic, worker) which all reject
  // unknown allow-headers entries. Cachebuster on the URL is sufficient.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Capture console errors
  page.on("console", msg => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Suppress known-benign / expected errors:
      //   - "frame-ancestors via meta" — informational warning, can't be set via meta
      //   - 409 / 400 status messages from step 8's intentional re-register
      //   - Our own throws that we then surface in UI ([monitor] Error: Register failed...)
      if (text.includes("frame-ancestors")) return;
      if (text.includes("status of 409")) return;
      if (text.includes("Register failed: an account with this email already exists")) return;
      consoleErrors.push(text);
    }
  });
  page.on("pageerror", err => consoleErrors.push("pageerror: " + err.message));
  // Capture failed network requests (CORS, 4xx/5xx)
  page.on("requestfailed", req => {
    networkFails.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText || "?"}`);
  });
  page.on("response", async res => {
    if (res.status() >= 400) {
      const url = res.url();
      // Don't flag intentional worker rejections — step 8 EXPECTS a 409 on
      // re-register, and certain other endpoints return 4xx by design.
      // Only count 5xx + unexpected non-409 4xx as real failures.
      if (res.status() >= 500) {
        networkFails.push(`${res.status()} ${res.request().method()} ${url}`);
      } else if (res.status() === 409) {
        // Expected — silent
      } else if (url.includes("workers.dev")) {
        // Other 4xx on worker is suspicious; flag it
        networkFails.push(`${res.status()} ${res.request().method()} ${url}`);
      }
    }
  });

  // ── Step 1: Land on Monitor tab via deep link ───────────────────────────
  console.log("STEP 1: Navigate to qualmly.dev/?mode=monitor");
  // Cache-bust: GitHub Pages + CDN can serve stale HTML for up to ~10 min
  // post-deploy. Hot launch-day reality: we're frequently chasing the CDN.
  await page.goto(SITE + `/?mode=monitor&_cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof switchMode === "function", null, { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, "01-landing.png") });

  const buildVersion = await page.evaluate(() => QUALMLY_BUILD?.version);
  check("Live qualmly.dev build is v1.4.1+", buildVersion?.startsWith("v1.4."), `got: ${buildVersion}`);

  const apiBase = await page.evaluate(() => MONITOR_API_BASE);
  check("MONITOR_API_BASE points at workers.dev", apiBase === "https://qualmly-monitor.qualmly.workers.dev",
    `got: ${apiBase}`);

  // Should be on the pitch (not registered yet, no pending checkout)
  const pitchVisible = await page.locator("#monitor-pitch").isVisible();
  check("Pitch screen shows on first visit", pitchVisible);

  // ── Step 2: Click "I already paid" → onboard form ──────────────────────
  console.log("\nSTEP 2: Click 'I already paid'");
  await page.locator("button:has-text('I already paid')").click();
  await page.waitForTimeout(400);
  const onboardVisible = await page.locator("#monitor-onboard").isVisible();
  check("Onboard form appears", onboardVisible);
  await page.screenshot({ path: path.join(SHOTS, "02-onboard.png") });

  // ── Step 3: Fill form + submit ─────────────────────────────────────────
  console.log("\nSTEP 3: Fill onboard form + submit");
  await page.fill("#mon-email", TEST_EMAIL);
  await page.fill("#mon-passphrase", TEST_PASSPHRASE);
  await page.fill("#mon-anthropic-key", TEST_KEY);
  await page.fill("#mon-watch-url", WATCH_URL_1);
  // builder + interval default to lovable + 7 days

  const t0 = Date.now();
  await page.locator("#monitor-register-btn").click();

  // Wait for either dashboard appearance or error display
  await Promise.race([
    page.waitForFunction(() => document.getElementById("monitor-dashboard")?.style.display === "block", null, { timeout: 30000 }),
    page.waitForFunction(() => {
      const e = document.getElementById("monitor-onboard-error");
      return e && e.style.display !== "none" && e.textContent;
    }, null, { timeout: 30000 })
  ]).catch(() => {});
  const elapsed = Date.now() - t0;

  const dashShows = await page.evaluate(() => document.getElementById("monitor-dashboard")?.style.display === "block");
  const errText   = await page.locator("#monitor-onboard-error").innerText().catch(() => "");

  check("Register + first watch succeeded (dashboard visible)", dashShows,
    errText ? `error shown: ${errText.slice(0, 120)}` : `elapsed: ${elapsed}ms`);
  check(`PBKDF2 + register completed in <10s (was ${elapsed}ms)`, elapsed < 10000);
  await page.screenshot({ path: path.join(SHOTS, "03-after-register.png") });

  if (!dashShows) {
    console.log("\nDashboard did not appear — bailing out.");
    console.log("Error text:", errText);
    await browser.close();
    return finish();
  }

  // ── Step 4: Verify watch appears in dashboard ──────────────────────────
  console.log("\nSTEP 4: Verify dashboard shows the watch");
  await page.waitForTimeout(800); // let _monitorLoadWatches finish
  const list1 = await page.locator("#monitor-watches-list").innerText();
  check("Dashboard lists the registered watch (URL match)", list1.includes("example.com"));
  check("Dashboard shows 'lovable' builder + '7d' interval", list1.includes("lovable") && list1.includes("7d"));
  await page.screenshot({ path: path.join(SHOTS, "04-dashboard-1watch.png") });

  // ── Step 5: Add a second watch via dashboard ───────────────────────────
  console.log("\nSTEP 5: Add a second watch via the dashboard form");
  await page.locator("button:has-text('+ Add watch')").first().click();
  await page.waitForTimeout(300);
  await page.fill("#mon-add-url", WATCH_URL_2);
  await page.locator("#monitor-add-watch-card button:has-text('+ Add watch')").click();
  await page.waitForTimeout(2000);
  const list2 = await page.locator("#monitor-watches-list").innerText();
  check("Dashboard now shows 2 watches", list2.includes("example.com") && list2.includes("example.org"));
  await page.screenshot({ path: path.join(SHOTS, "05-dashboard-2watches.png") });

  // ── Step 6: Remove one watch ───────────────────────────────────────────
  console.log("\nSTEP 6: Remove one watch (auto-confirm dialog)");
  // Auto-accept the confirm() dialog
  page.on("dialog", d => d.accept().catch(() => {}));
  await page.locator("button:has-text('Remove')").first().click();
  await page.waitForTimeout(2000);
  const list3 = await page.locator("#monitor-watches-list").innerText();
  // After remove, only 1 watch should remain
  const remains = list3.includes("example.com") + list3.includes("example.org");
  check("After remove, exactly 1 watch left", remains === 1, `list: ${list3.slice(0, 200)}`);
  await page.screenshot({ path: path.join(SHOTS, "06-after-remove.png") });

  // ── Step 7: Sign out ───────────────────────────────────────────────────
  console.log("\nSTEP 7: Sign out (auto-confirm dialog)");
  await page.locator("button:has-text('Sign out')").click();
  await page.waitForTimeout(1000);
  const backToPitch = await page.locator("#monitor-pitch").isVisible();
  check("After sign-out, pitch screen reappears", backToPitch);
  const userCleared = await page.evaluate(() => !localStorage.getItem("qualmly_monitor_user"));
  check("localStorage user record cleared after sign-out", userCleared);
  await page.screenshot({ path: path.join(SHOTS, "07-after-signout.png") });

  // ── Step 8: Re-register with same email should 409 ─────────────────────
  console.log("\nSTEP 8: Re-register same email — should reject with 409");
  await page.locator("button:has-text('I already paid')").click();
  await page.waitForTimeout(300);
  await page.fill("#mon-email", TEST_EMAIL);
  await page.fill("#mon-passphrase", TEST_PASSPHRASE);
  await page.fill("#mon-anthropic-key", TEST_KEY);
  await page.fill("#mon-watch-url", WATCH_URL_1);
  await page.locator("#monitor-register-btn").click();
  await page.waitForTimeout(4000);
  const reErr = await page.locator("#monitor-onboard-error").innerText().catch(() => "");
  check("Re-register surfaces 409 'account already exists' message",
    reErr.toLowerCase().includes("already exists") || reErr.toLowerCase().includes("409"),
    `got: ${reErr.slice(0, 120)}`);
  await page.screenshot({ path: path.join(SHOTS, "08-re-register-rejected.png") });

  await browser.close();
  return finish();

  function finish() {
    console.log(`\n=== Results ===`);
    console.log(`  Failed checks:    ${fails.length}`);
    console.log(`  Console errors:   ${consoleErrors.length}`);
    console.log(`  Failed network:   ${networkFails.length}`);
    if (fails.length) {
      console.log(`\nFAILED CHECKS:`);
      fails.forEach(f => console.log(`  - ${f}`));
    }
    if (consoleErrors.length) {
      console.log(`\nCONSOLE ERRORS:`);
      consoleErrors.slice(0, 10).forEach(e => console.log(`  - ${e.slice(0, 200)}`));
    }
    if (networkFails.length) {
      console.log(`\nFAILED NETWORK:`);
      networkFails.slice(0, 10).forEach(n => console.log(`  - ${n}`));
    }
    console.log(`\nScreenshots: ${SHOTS}`);
    if (fails.length === 0 && consoleErrors.length === 0 && networkFails.length === 0) {
      console.log(`\n🟢 ALL GREEN — full e2e flow works on live qualmly.dev`);
    } else {
      console.log(`\n🔴 ISSUES FOUND — review above`);
      process.exit(1);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
