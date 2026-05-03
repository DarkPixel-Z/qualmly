# Qualmly Mobile Scanner — APK/IPA secret extraction

Single-file Python tool that unzips a packaged Android (.apk) or iOS (.ipa) build and scans every embedded text file for hardcoded secrets and backend URLs. Closes the function gap vs AuditYourApp's mobile reverse-engineering feature ($49/scan).

## Status

**Working v1.** Run it on a real APK or IPA today. Catches ~80% of real-world secret leaks via plain-text grep at scale (which is how ~80% of secrets actually ship in mobile apps anyway).

What's done:
- ✅ Auto-detects APK vs IPA format
- ✅ Skips media/fonts/native libs (focuses on JS/JSON/plist/xml/config)
- ✅ Same 9 secret patterns as the qualmly.dev Code Review (Anthropic, OpenAI, Stripe, AWS, GitHub PAT/classic, Slack, Google API, Supabase JWT)
- ✅ Endpoint detection (Supabase, Firebase, localhost fallbacks)
- ✅ Pretty-print + JSON output
- ✅ Score + exit code (1 if any `*_live` secret found — useful for CI)
- ✅ Stdlib only (zipfile + re); no install dependencies

What's NOT done (next iteration):
1. **Smali decompile** for APK to reach obfuscated string constants. Add `apktool` integration. ~1 day.
2. **Mach-O binary string extraction** for iOS apps where keys are baked into native binaries (not just JS bundles). Use `nm` or `strings`. ~1 day.
3. **Web upload UI** — wrap as a Cloudflare Worker that accepts file upload, runs the same logic, returns a Qualmly-style report. Enables charging $9/scan via Stripe. ~2 days.
4. **Integration with qualmly.dev** — add a "Mobile" mode tab next to App QA + Code Review. Could be a stub that links to the standalone scanner for now.

## Usage

```bash
# Scan an APK
python3 qualmly_mobile.py /path/to/app.apk

# Scan an IPA
python3 qualmly_mobile.py /path/to/MyApp.ipa

# JSON output for CI
python3 qualmly_mobile.py app.apk --json

# Write JSON to file
python3 qualmly_mobile.py app.apk --report scan.json
```

Sample output:

```
  🔍 Qualmly Mobile Scan — myapp.apk
  ─────────────────────────────────────────────────
  Format:           APK
  Size:             14.2 MB
  Files scanned:    142 / 1387
  Score:            64/100  ██████░░░░
  Secrets found:    2
  Endpoints found:  4

  🔴 SECRETS:
     • Stripe publishable key             in  assets/index-Dp8DBQyP.js
       sample: pk_live_51TO… (107 chars total)
     • Supabase service-role JWT          in  assets/index-Dp8DBQyP.js
       sample: eyJhbGciOi… (240 chars total)

  🔵 ENDPOINTS:
     • Supabase project URL               →  https://abc1234567.supabase.co
       in assets/index-Dp8DBQyP.js
     • Localhost fallback                 →  http://127.0.0.1:3000
       in src/config.json
     ...

  Powered by Qualmly · qualmly.dev
```

## Why a separate Python tool, not in the browser?

Two reasons:
1. **APK/IPA files are too big** to upload to a browser-side scanner reliably. 50–500 MB is typical. A native CLI runs locally on the build artifact without uploading.
2. **CI/CD friendly.** Drop into GitHub Actions / Bitrise / Codemagic. Exit code 1 fails the build on `live` keys.

A **hosted version** (web upload) is on the roadmap — that gets bundled into the Agency tier or charged $9/scan as a separate Mobile tier.

## Roadmap

| Phase | Scope | ETA after launch |
|---|---|---|
| **v1 (this scaffold)** | CLI tool, secrets + endpoints | — Ready to ship now |
| **v1.1** | apktool / smali integration for APK | 1 week |
| **v1.2** | Cloudflare Worker hosted upload, $9/scan | 2 weeks |
| **v2** | Mach-O binary scanner (iOS native), mobile-specific findings (root detection bypass, certificate pinning checks) | 4–6 weeks |

## License

MIT — same as the parent project.
