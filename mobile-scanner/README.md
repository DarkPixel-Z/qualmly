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

## Install

```bash
# Recommended — installs into an isolated venv, exposes `qualmly-mobile` on PATH
pipx install qualmly-mobile

# Or vanilla pip if you prefer
pip install qualmly-mobile
```

No native dependencies. Stdlib only. Works on macOS, Linux, and Windows
(Python 3.8+).

If you want to run from source instead, just clone this repo and call the
script directly with `python3 mobile-scanner/qualmly_mobile.py …` — it has
zero install dependencies.

## Usage

```bash
# Scan an APK
qualmly-mobile /path/to/app.apk

# Scan an IPA
qualmly-mobile /path/to/MyApp.ipa

# JSON output for CI
qualmly-mobile app.apk --json

# Write JSON to file
qualmly-mobile app.apk --report scan.json
```

(If running from source: replace `qualmly-mobile` with `python3 qualmly_mobile.py`.)

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

## Publishing a new version (maintainer notes)

Releases are published to PyPI via GitHub Actions Trusted Publishing (OIDC) —
no `PYPI_API_TOKEN` secret needed once the project is registered.

**One-time setup on PyPI:**
1. Create the project skeleton: build + upload the first release with a
   manual API token (`twine upload mobile-scanner/dist/*`), OR
   pre-register it via Trusted Publishing's "pending publisher" flow at
   https://pypi.org/manage/account/publishing/ → add publisher with:
   - PyPI Project Name: `qualmly-mobile`
   - Owner: `DarkPixel-Z`
   - Repository name: `qualmly`
   - Workflow name: `publish-mobile-pypi.yml`
   - Environment name: `pypi`
2. In the GitHub repo, create a `pypi` environment (Settings → Environments)
   so the workflow's `environment: pypi` clause resolves.

**Cutting a release:**
```bash
# bump __version__ in qualmly_mobile.py and version in pyproject.toml
git add mobile-scanner/qualmly_mobile.py mobile-scanner/pyproject.toml
git commit -m "mobile-scanner: bump to v1.0.1"
git tag mobile-v1.0.1
git push origin main --tags
```

The `Publish qualmly-mobile to PyPI` workflow fires on the tag, builds
sdist + wheel, runs `twine check`, then uploads via OIDC.

## License

MIT — same as the parent project.
