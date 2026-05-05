// Stability runner — fires e2e-deep-check.mjs 9 times sequentially against
// the live qualmly.dev, captures each run's pass/fail breakdown, and writes
// the aggregated report to marketing/launch-assets/.deep-check-results.md.
//
// Sequential not parallel: 9 simultaneous register calls would all create
// users with timestamped emails which IS unique per call but the cron-side
// cleanup is annoying. Sequential keeps the test surface honest.

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..", "..", "..");
const TEST_SCRIPT = path.join(__dirname, "e2e-deep-check.mjs");
const OUT = path.join(REPO, "marketing", "launch-assets", "deep-check-results.md");

const N_RUNS = 9;

function runOnce(idx) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const proc = spawn("node", [TEST_SCRIPT], { cwd: REPO, shell: false });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", d => stdout += d.toString());
    proc.stderr.on("data", d => stderr += d.toString());
    proc.on("close", code => {
      const elapsed = Date.now() - t0;
      // Parse pass/fail lines
      const lines = (stdout + stderr).split("\n");
      const passed = lines.filter(l => l.match(/^\s*✓/)).length;
      const failed = lines.filter(l => l.match(/^\s*✗/)).length;
      const failureNames = lines
        .filter(l => l.match(/^\s*✗/))
        .map(l => l.replace(/^\s*✗\s*/, "").split("  —")[0].trim());
      resolve({
        idx, code, elapsed, passed, failed, failureNames,
        stdout: stdout.slice(-3000),  // last 3k chars only
      });
    });
  });
}

const runs = [];
console.log(`\nRunning e2e-deep-check ${N_RUNS} times sequentially...\n`);

for (let i = 1; i <= N_RUNS; i++) {
  process.stdout.write(`Run ${i}/${N_RUNS}... `);
  const r = await runOnce(i);
  runs.push(r);
  process.stdout.write(`exit=${r.code} passed=${r.passed} failed=${r.failed} elapsed=${(r.elapsed/1000).toFixed(1)}s\n`);
}

// ── Aggregate ─────────────────────────────────────────────────────────
const totalPassed = runs.reduce((s, r) => s + r.passed, 0);
const totalFailed = runs.reduce((s, r) => s + r.failed, 0);
const allGreen = runs.every(r => r.failed === 0);
const failuresByName = {};
for (const r of runs) {
  for (const name of r.failureNames) {
    failuresByName[name] = (failuresByName[name] || 0) + 1;
  }
}
const elapsedTotal = runs.reduce((s, r) => s + r.elapsed, 0);

// ── Markdown report ───────────────────────────────────────────────────
const ts = new Date().toISOString();
const md = [];
md.push(`# Deep-check stability report`);
md.push(``);
md.push(`Generated: ${ts}`);
md.push(`Site: https://qualmly.dev`);
md.push(`Test script: \`workers/monitoring/.scripts/e2e-deep-check.mjs\``);
md.push(``);
md.push(`## Summary`);
md.push(``);
md.push(`- Total runs: **${N_RUNS}**`);
md.push(`- Total checks executed: ${totalPassed + totalFailed}`);
md.push(`- Total passed: **${totalPassed}**`);
md.push(`- Total failed: **${totalFailed}**`);
md.push(`- All green every run: ${allGreen ? "✅ yes" : "❌ no"}`);
md.push(`- Wall-clock total: ${(elapsedTotal/1000).toFixed(1)}s (avg ${(elapsedTotal/1000/N_RUNS).toFixed(1)}s/run)`);
md.push(``);

if (Object.keys(failuresByName).length === 0) {
  md.push(`### 🟢 ZERO failures across all ${N_RUNS} runs.`);
  md.push(``);
} else {
  md.push(`### Persistent failures`);
  md.push(``);
  md.push(`| Failure | Failed in N/${N_RUNS} runs | Verdict |`);
  md.push(`|---|---|---|`);
  for (const [name, count] of Object.entries(failuresByName).sort((a,b) => b[1]-a[1])) {
    let verdict;
    if (count === N_RUNS) verdict = "🔴 100% reproducible — real bug";
    else if (count >= N_RUNS / 2) verdict = "🟡 mostly reproduces — likely real, sometimes recovers";
    else if (count > 1) verdict = "🟠 intermittent — flaky test or race condition";
    else verdict = "⚪ one-off — likely transient";
    md.push(`| ${name} | ${count} | ${verdict} |`);
  }
  md.push(``);
}

md.push(`## Per-run detail`);
md.push(``);
md.push(`| Run | Exit | Passed | Failed | Elapsed | Failures |`);
md.push(`|---|---|---|---|---|---|`);
for (const r of runs) {
  const fails = r.failureNames.length === 0 ? "(none)" : r.failureNames.map(n => "`" + n.slice(0, 50) + "`").join(", ");
  md.push(`| ${r.idx} | ${r.code} | ${r.passed} | ${r.failed} | ${(r.elapsed/1000).toFixed(1)}s | ${fails} |`);
}
md.push(``);

md.push(`## Last run's tail (for context)`);
md.push(``);
md.push("```");
md.push(runs[runs.length - 1].stdout.split("\n").slice(-30).join("\n"));
md.push("```");
md.push(``);

fs.writeFileSync(OUT, md.join("\n"), "utf8");
console.log(`\n✓ Report written to: ${OUT}`);
console.log(`  Pass rate: ${totalPassed}/${totalPassed + totalFailed} (${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%)`);
console.log(`  ${allGreen ? "🟢 All-green every run" : "🔴 At least one failure"}`);
