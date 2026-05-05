// Pre-launch verification sweep — confirms every public surface is live
// and serving the correct build / state. Run right before the 9 AM ET launch.
import { setTimeout as sleep } from "node:timers/promises";

const checks = [];

async function add(name, fn) {
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail });
  } catch (e) {
    checks.push({ name, ok: false, detail: e.message });
  }
}

// 1. qualmly.dev live + build + CSP + API base
await add("qualmly.dev live + correct build", async () => {
  const html = await fetch("https://qualmly.dev/?cb=" + Date.now()).then(r => r.text());
  const ver = html.match(/QUALMLY_BUILD\s*=\s*\{[^}]*version:\s*"([^"]+)"/);
  const apiBase = html.match(/MONITOR_API_BASE\s*=\s*"([^"]+)"/);
  const csp = html.match(/connect-src[^"]+/);
  const cspHasWorker = csp && csp[0].includes("qualmly-monitor.qualmly.workers.dev");
  if (!ver) throw new Error("QUALMLY_BUILD not found");
  if (!apiBase || !apiBase[1].includes("workers.dev")) throw new Error("MONITOR_API_BASE not workers.dev");
  if (!cspHasWorker) throw new Error("CSP missing worker domain");
  return `build ${ver[1]} | api ${apiBase[1]} | CSP allows worker ✓`;
});

// 2. Worker /health
await add("Worker /health 200", async () => {
  const r = await fetch("https://qualmly-monitor.qualmly.workers.dev/health").then(r => r.json());
  if (!r.ok) throw new Error("not ok: " + JSON.stringify(r));
  return `version ${r.version}`;
});

// 3. Worker /api/checkout returns Gumroad URL
await add("Worker /api/checkout → Gumroad", async () => {
  const r = await fetch("https://qualmly-monitor.qualmly.workers.dev/api/checkout", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
  }).then(r => r.json());
  if (!r.checkoutUrl?.includes("gumroad.com")) throw new Error("checkoutUrl missing/wrong: " + JSON.stringify(r));
  return r.checkoutUrl;
});

// 4. CORS preflight from qualmly.dev
await add("CORS preflight from qualmly.dev origin", async () => {
  const r = await fetch("https://qualmly-monitor.qualmly.workers.dev/api/register", {
    method: "OPTIONS",
    headers: { Origin: "https://qualmly.dev", "Access-Control-Request-Method": "POST" }
  });
  const allow = r.headers.get("access-control-allow-origin");
  if (allow !== "https://qualmly.dev") throw new Error("allow-origin: " + allow);
  return `200 / Allow-Origin: ${allow}`;
});

// 5. Gumroad product reachable
await add("Gumroad product page", async () => {
  const r = await fetch("https://darkpixel6.gumroad.com/l/jfidfb", { redirect: "follow" });
  if (!r.ok) throw new Error("status " + r.status);
  return `${r.status} OK`;
});

// 6. PyPI qualmly-mobile latest version
await add("PyPI qualmly-mobile @ 1.0.1", async () => {
  const r = await fetch("https://pypi.org/pypi/qualmly-mobile/json").then(r => r.json());
  if (r.info?.version !== "1.0.1") throw new Error("version " + r.info?.version);
  return `https://pypi.org/project/qualmly-mobile/${r.info.version}/`;
});

// 7. GitHub Action repo
await add("GitHub Action repo", async () => {
  const r = await fetch("https://github.com/DarkPixel-Z/qualmly-audit-action");
  if (!r.ok) throw new Error("status " + r.status);
  return "DarkPixel-Z/qualmly-audit-action";
});

// 8. GitHub main HEAD
await add("GitHub repo main branch", async () => {
  const r = await fetch("https://api.github.com/repos/DarkPixel-Z/qualmly/commits/main").then(r => r.json());
  if (!r.sha) throw new Error("no sha");
  const msg = (r.commit?.message || "").split("\n")[0].slice(0, 70);
  return `${r.sha.slice(0, 8)} — ${msg}`;
});

// 9. KV is empty (no leftover test data leaking into customer view)
//    Skipped: we'd need an API token to inspect KV directly.

console.log("\n=== FINAL PRE-FLIGHT (launch day) ===\n");
let allGreen = true;
for (const c of checks) {
  const mark = c.ok ? "PASS" : "FAIL";
  console.log(`[${mark}]  ${c.name}`);
  console.log(`        ${c.detail}`);
  if (!c.ok) allGreen = false;
}
console.log();
console.log(allGreen
  ? "==> 🟢 ALL SYSTEMS GO. Launch."
  : "==> 🔴 Issues above. Investigate before tweeting.");
