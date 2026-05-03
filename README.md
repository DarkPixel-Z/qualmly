# ⚡ Qualmly — ship with no qualms

> AI reviewer that raises every concern about code shipped from Lovable, Bolt, v0, Cursor, and Copilot. Get a real audit in 30 seconds — no engineer required.

![Qualmly](https://img.shields.io/badge/v1.3-C9FF47?style=flat-square&labelColor=0C0C10)
![License](https://img.shields.io/badge/license-MIT-3DFFA0?style=flat-square&labelColor=0C0C10)
![Built with Claude](https://img.shields.io/badge/built%20with-Claude%20API-5B8DEF?style=flat-square&labelColor=0C0C10)
[![GitHub Marketplace](https://img.shields.io/badge/GitHub_Marketplace-Qualmly_Audit-2DA44E?style=flat-square&labelColor=0C0C10&logo=github)](https://github.com/marketplace/actions/qualmly-audit)

**[Try it now → qualmly.dev](https://qualmly.dev)** &middot; **[Add to your repo → GitHub Marketplace](https://github.com/marketplace/actions/qualmly-audit)**

---

## 🚀 What it does

Qualmly is a **single HTML file** — no backend, no install, no database. Drop it anywhere and it runs.

### ⚡ App QA Mode
Paste a live app URL and get a full QA report across **8 categories**:
- Navigation & routing
- Form handling & validation
- Auth & access control
- Error handling & edge cases
- Mobile responsiveness
- Performance basics
- Accessibility (WCAG 2.2)
- Data persistence & state

**Real URL crawling** — Qualmly actually fetches your live page using a 5-layer proxy fallback system:
1. 3 CORS proxies in parallel (allorigins, codetabs, corsproxy)
2. Wayback Machine archive fallback
3. sitemap.xml crawl for route structure
4. robots.txt parsing
5. Manual HTML paste for auth-walled apps

> **Privacy note:** the target URL and its HTML are routed through third-party CORS proxies (allorigins.win, api.codetabs.com, corsproxy.io) and archive.org. Your Anthropic API key never touches them — only the page you're auditing does. Don't audit authenticated URLs that leak session tokens in the URL.

### 📄 Code Review Mode
Paste any code (30+ languages supported) and get:
- **OWASP Top 10 (2025)** security audit
- **CWE/SANS Top 25** vulnerability scan
- **WCAG 2.2** accessibility check
- **SOLID, DRY, KISS, 12-Factor** architecture review
- **UAT test scenarios** with priority + automation hints
- **Per-issue fix confidence score**
- **📝 Plain-English toggle** — rewrites every finding for non-technical readers
- **🛡 Mark as intentional** — click on any finding, explain the context, Qualmly re-evaluates and downgrades or dismisses as appropriate

### 🚀 Paste-into-builder prompts
Every finding comes with a natural-language fix prompt tuned to the AI coding tool you use — **Lovable, Bolt, v0, Cursor, GitHub Copilot, Claude Code, Windsurf, Replit, or Webflow AI**. Copy → paste into your chat → done.

### 💰 Cost transparency
Every review shows the exact Anthropic spend. Typical run: ~$0.03.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🌐 Real URL crawling | 5-layer fallback — proxies → Wayback → sitemap → manual paste |
| 🛡 Vibe-Code preset | Scans for the failures common in AI-generated code (missing Supabase RLS, leaked `sk_live_` keys, exposed admin routes, unverified Stripe webhooks, CORS=* with credentials) |
| 🚀 Builder paste prompts | Copy-paste natural-language fixes for 9 AI coding tools |
| 📝 Plain-English mode | Rewrites every finding for a non-technical reader |
| 🛡 Mark-as-intentional | Per-finding "this is OK because..." re-evaluation |
| 📊 Scored reports | 0–100 quality score with animated ring |
| 🔐 API key storage | 3 modes: sessionStorage, localStorage, or AES-GCM encrypted with passphrase |
| ⏱ Idle auto-clear | Optional auto-wipe after inactivity (30m / 2h / 4h / 8h / 24h) |
| ⚙ Preferences | Defaults + custom-focus textarea; exportable/importable JSON |
| 📁 Multi-file review | Tab-based code editor for multi-file projects |
| 🔍 Severity filter | Filter issues by Critical / Warning / Info + live search |
| 📜 Report history | Last 8 reports saved in localStorage |
| ↔ Diff view | Before/After diff on every inserted fix |
| 🔁 Re-run | Re-analyze after applying fixes to verify improvement |
| 💰 Cost footer | Live Anthropic spend per review |
| 📤 Export | HTML, PDF, and Word (.doc) export for all reports |
| 📱 Mobile-ready | Full responsive layout with mobile mode switcher |
| 📲 Install as app | PWA manifest — click "Install" in Chrome/Edge for a desktop app |
| 🔗 Shareable URLs | Reports encoded into URL hash — share without a server |

---

## 🛠 How to run it

Three ways to use Qualmly, ordered from zero-friction to full control.

### A — Use the hosted version (easiest)

Open **[https://qualmly.dev](https://qualmly.dev)** in your browser. Bookmark it. Done.

Your Anthropic API key stays in **your** browser (sessionStorage / localStorage / encrypted, your choice) and only leaves your machine to reach Anthropic's servers. The hosted version doesn't send anything anywhere else — we don't operate a server for this tool.

### B — Install as an app

From the hosted URL above, Chrome or Edge will show an **install icon** in the address bar (a little screen-with-arrow). Click it → Qualmly becomes a desktop app with its own icon and window. No browser chrome, no bookmark to hunt for.

On iPhone/Android: open the URL → browser menu → **"Add to Home Screen"**.

### C — Run it locally (download + serve)

If you bought the Gumroad package, or cloned the repo, you'll have three files you need to keep together:

- `index.html` — the app
- `manifest.json` — tells the browser it's a PWA
- `icon.svg` — the app icon

**Don't just double-click `index.html`.** Browsers treat `file://` as a "unique security origin," which breaks the Anthropic API call and the URL-crawling proxies. You need to serve the files over HTTP. Easiest way:

```bash
# Windows (Python bundled with Windows 10+)
cd path/to/qualmly-folder
python -m http.server 8765

# macOS / Linux
cd path/to/qualmly-folder
python3 -m http.server 8765

# Or with Node (any OS)
npx http-server -p 8765
```

Then open **http://localhost:8765/** in your browser. Leave the terminal running while you use the app; `Ctrl+C` when done.

### D — Host on your own site

Upload all three files (`index.html`, `manifest.json`, `icon.svg`) to any static-site host — Netlify, Vercel, Cloudflare Pages, GitHub Pages, your Wix site's media library, etc. Point your browser at whatever URL your host gives you.

---

## 🔑 API Key

Qualmly uses the **Anthropic Claude API** directly from the browser.

1. Get a key at [console.anthropic.com](https://console.anthropic.com) → API Keys
2. On first run, Qualmly prompts you with a modal
3. Pick your storage mode:
   - **Tab only** (default) — `sessionStorage`, wipes on tab close
   - **Remember** — `localStorage` plaintext
   - **Remember + Encrypt** — `localStorage` AES-GCM, passphrase-unlocked each session

> **Never commit your API key to a repo.** The modal handles it safely.

---

## 💰 Pricing & License

The source in this repository is **MIT** — free to use, fork, study, and modify.

**[Get it on Gumroad →](https://darkpixel6.gumroad.com/l/qualmly-app)**

| Tier | Price | What you get |
|---|---|---|
| **Personal** | **$15** | Use it yourself on any project, any client work. Email support + update access. *(Launch-week price: **$9** for the first 100 buyers.)* |
| **Agency / White-label** | **$49** | Everything in Personal, plus permission to rebrand the report (remove or replace the DarkPixel CTA) and bundle the tool into paid client deliverables. |

The paid grants *add* rights on top of MIT; they don't remove any MIT rights from the public source. If you're using the repo as-is, with the DarkPixel CTA intact, MIT alone covers you. Full commercial license: [docs/COMMERCIAL-LICENSE.md](docs/COMMERCIAL-LICENSE.md).

Need a deeper engagement — custom review prompts tuned to your stack, on-prem hosting, or a full QA/security audit done by humans? **[Book DarkPixel Consulting](https://www.darkpixelconsultinginc.co/)**.

---

## ❓ FAQ

**If the source is MIT-licensed, why pay?**
The paid Gumroad tiers add commercial rights on top of MIT: email support, 12 months of update access, a written commercial license you can show clients or accountants, and — with the Agency tier — permission to white-label the report. If you just want the tool for yourself and don't need any of that, the MIT source is free. No purchase required.

**Do I need my own API key?**
Yes. Qualmly calls Anthropic's Claude API directly from your browser using **your** key. Get one at [console.anthropic.com](https://console.anthropic.com). Typical review costs a few cents and the exact amount is shown on every report.

**Is it safe to tick "Remember on this device"?**
Depends on the machine. Three storage modes are available on the API-key modal:

- **Tab only** (default) — the key lives in `sessionStorage` and wipes when the tab closes. Safest; you retype each session.
- **Remember** — the key is stored as plaintext in `localStorage`. Survives browser restarts. **Anyone with access to this browser profile can read it** — don't tick on shared or borrowed machines.
- **Remember + Encrypt with passphrase** — the key is encrypted at rest using AES-GCM with a passphrase-derived PBKDF2 key (Web Crypto, no home-rolled cryptography). Storage is safe against disk-level snooping. You type the passphrase once per session to unlock.

You can also set an **idle-timeout** in Preferences (Never / 30 min / 2 h / 4 h / 8 h / 24 h) that auto-clears the in-memory key after inactivity — useful on shared machines even in plaintext mode.

**What data leaves my machine?**
- Target URL → 3 third-party CORS proxies (allorigins, codetabs, corsproxy) and optionally Wayback Machine
- Pasted code or URL summary → Anthropic's API
- Your API key → Anthropic only, never anyone else
- **Zero** data to DarkPixel servers (there are none)

Full details: [docs/PRIVACY.md](docs/PRIVACY.md).

**Can I rebrand the report for my agency's clients?**
With the Agency / White-label tier, yes — remove or replace the DarkPixel CTA and bundle the tool into your audit deliverables. See [docs/COMMERCIAL-LICENSE.md](docs/COMMERCIAL-LICENSE.md).

**Is this a real security audit?**
No. It's AI-assisted triage — useful for catching common mistakes quickly, not a substitute for a human audit on anything customer-facing or regulated. See [docs/DISCLAIMER.md](docs/DISCLAIMER.md).

**What about refunds?**
See the refund policy on the Gumroad listing at the time of purchase.

---

## 📁 File Structure

```
qualmly/
├── index.html         ← The entire app (~2900 lines, no build step)
├── manifest.json      ← PWA manifest — lets Chrome/Edge "Install as app"
├── icon.svg           ← App icon used by the manifest + browser tab
├── CNAME              ← GitHub Pages custom-domain config (qualmly.dev)
├── README.md          ← This file
├── LICENSE            ← MIT (public-source terms)
└── docs/
    ├── COMMERCIAL-LICENSE.md   ← Rights granted by paid Gumroad tiers
    ├── DISCLAIMER.md           ← AS-IS / verify-before-shipping
    └── PRIVACY.md              ← Full data-flow disclosure
```

`index.html`, `manifest.json`, and `icon.svg` must stay in the same directory for the "Install as app" button to appear in Chrome/Edge.

---

## 🔌 Companion projects

| Project | Repo | Status |
|---|---|---|
| **GitHub Action** — Qualmly Code Review on every PR | [`DarkPixel-Z/qualmly-audit-action`](https://github.com/DarkPixel-Z/qualmly-audit-action) | ✅ v1.0.0 shipped |
| **Chrome extension** — `Ctrl+Shift+Q` to audit current tab | [`extensions/chrome/`](./extensions/chrome) | 🟡 Working stub (needs icons + Web Store) |
| **Mobile APK/IPA scanner** — secrets + endpoints in mobile builds | [`mobile-scanner/`](./mobile-scanner) | ✅ v1 Python CLI |
| **Continuous monitoring** — scheduled rescans + email diffs | [`workers/monitoring/`](./workers/monitoring) | 🟡 Architectural scaffold |

## 🗺 Roadmap

- [x] CI/CD webhook — trigger reviews on every push *(see GitHub Action above)*
- [x] Mobile binary scanner *(see Mobile scanner above)*
- [ ] Continuous monitoring with email diff *(scaffold ready)*
- [ ] OG image generator for shareable report previews
- [ ] GitHub Gist integration — save/load code files directly
- [ ] Team/agency white-label (remove DarkPixel CTA, swap in yours)

---

## 🏢 Built by

**[DarkPixel Consulting Inc.](https://www.darkpixelconsultinginc.co/)** — Expert web & app development. We ship it right the first time.

---

## 📄 License

The source in this repository is **MIT** — see [LICENSE](LICENSE).

Paid Gumroad tiers add commercial rights (white-label, commercial support, updates) on top of MIT — see [docs/COMMERCIAL-LICENSE.md](docs/COMMERCIAL-LICENSE.md).
