# Deep-check stability report

Generated: 2026-05-05T17:11:07.506Z
Site: https://qualmly.dev
Test script: `workers/monitoring/.scripts/e2e-deep-check.mjs`

## Summary

- Total runs: **9**
- Total checks executed: 189
- Total passed: **189**
- Total failed: **0**
- All green every run: ✅ yes
- Wall-clock total: 216.2s (avg 24.0s/run)

### 🟢 ZERO failures across all 9 runs.

## Per-run detail

| Run | Exit | Passed | Failed | Elapsed | Failures |
|---|---|---|---|---|---|
| 1 | 0 | 21 | 0 | 24.8s | (none) |
| 2 | 0 | 21 | 0 | 23.9s | (none) |
| 3 | 0 | 21 | 0 | 23.0s | (none) |
| 4 | 0 | 21 | 0 | 23.2s | (none) |
| 5 | 0 | 21 | 0 | 25.6s | (none) |
| 6 | 0 | 21 | 0 | 24.1s | (none) |
| 7 | 0 | 21 | 0 | 25.4s | (none) |
| 8 | 0 | 21 | 0 | 23.2s | (none) |
| 9 | 0 | 21 | 0 | 23.0s | (none) |

## Last run's tail (for context)

```
  ✓ App QA: live demo button loads a report (smoke)

[C] Code Review mode regression
  ✓ Code Review: tab activates via ?mode=code deep link
  ✓ Code Review: language picker visible
  ✓ Code Review: code-paste textarea (#code-input) visible

[D] Monitor onboard form validation
  ✓ D1: rejects bad email format
  ✓ D2: rejects passphrase < 12 chars
  ✓ D3: rejects malformed Anthropic key
  ✓ D4: rejects http:// (requires https)
  ✓ D5: rejects key with trailing junk (anchor enforcement)

[E] Subscribe button → /api/checkout → Gumroad URL
  ✓ E: Subscribe redirects to Gumroad

[F] Deep link safety (?email= phishing, ?checkout=cancel)
  ✓ F1: ?checkout=success lands on onboard form
  ✓ F1: ?email= query param does NOT pre-fill (phishing defense)
  ✓ F2: ?checkout=cancel clears pending_checkout flag (not trapped)
  ✓ F2: after ?checkout=cancel, pitch shows (not onboard)

=== Results ===
  Failed checks: 0

🟢 ALL DEEP-CHECK SCENARIOS PASS

Screenshots: C:\Users\angya\OneDrive\Desktop\tech\vqr-work\marketing\launch-assets\.deep-check-shots

```
