# ⚡ VibeCheck — QA for things you shipped too fast

> AI-powered QA & Code Review tool for vibe-coded apps. Get a real audit in 30 seconds — no engineer required.

![VibeCheck](https://img.shields.io/badge/beta-v0.1-C9FF47?style=flat-square&labelColor=0C0C10)
![License](https://img.shields.io/badge/license-MIT-3DFFA0?style=flat-square&labelColor=0C0C10)
![Built with Claude](https://img.shields.io/badge/built%20with-Claude%20API-5B8DEF?style=flat-square&labelColor=0C0C10)

---

## 🚀 What it does

VibeCheck is a **single HTML file** — no backend, no install, no database. Drop it anywhere and it runs.

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

**Real URL crawling** — VibeCheck actually fetches your live page using a 5-layer proxy fallback system:
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
- **⚡ Insert Fix** button — replaces bad code in-place with a diff view
- **↺ Re-run Review** after applying fixes

---

## ✨ Features

| Feature | Details |
|---|---|
| 🌐 Real URL crawling | 5-layer fallback — proxies → Wayback → sitemap → manual paste |
| 📊 Scored reports | 0–100 quality score with animated ring |
| 🔐 API key modal | Secure in-browser key entry, stored in sessionStorage only |
| 📁 Multi-file review | Tab-based code editor for multi-file projects |
| 🔍 Severity filter | Filter issues by Critical / Warning / Info + live search |
| 📜 Report history | Last 8 reports saved in localStorage |
| ↔ Diff view | Before/After diff on every inserted fix |
| 🔁 Re-run | Re-analyze after applying fixes to verify improvement |
| 📤 Export | HTML, PDF, and Word (.doc) export for all reports |
| 📱 Mobile-ready | Full responsive layout with mobile mode switcher |
| 🔗 Shareable URLs | Reports encoded into URL hash — share without a server |
| 🏢 DarkPixel CTA | Professional consulting CTA on every report |

---

## 🛠 How to run it

Three ways to use VibeCheck, ordered from zero-friction to full control.

### A — Use the hosted version (easiest)

Open **[https://darkpixel-z.github.io/Vibe-QA-Reviewer/vibecheck.html](https://darkpixel-z.github.io/Vibe-QA-Reviewer/vibecheck.html)** in your browser. Bookmark it. Done.

Your Anthropic API key stays in **your** browser (sessionStorage) and only ever leaves your machine to reach Anthropic's servers. The hosted version doesn't send anything anywhere else — we don't operate a server for this tool.

### B — Install as an app

From the hosted URL above, Chrome or Edge will show an **install icon** in the address bar (a little screen-with-arrow). Click it → VibeCheck becomes a desktop app with its own icon and window. No browser chrome, no bookmark to hunt for.

On iPhone/Android: open the URL → browser menu → **"Add to Home Screen"**.

### C — Run it locally (download + serve)

If you bought the Gumroad package, or cloned the repo, you'll have three files you need to keep together:

- `vibecheck.html` — the app
- `manifest.json` — tells the browser it's a PWA
- `icon.svg` — the app icon

**Don't just double-click `vibecheck.html`.** Browsers treat `file://` as a "unique security origin," which breaks the Anthropic API call and the URL-crawling proxies. You need to serve the files over HTTP. Easiest way:

```bash
# Windows (Python bundled with Windows 10+)
cd path/to/vibecheck-folder
python -m http.server 8765

# macOS / Linux
cd path/to/vibecheck-folder
python3 -m http.server 8765

# Or with Node (any OS)
npx http-server -p 8765
```

Then open **http://localhost:8765/vibecheck.html** in your browser. Leave the terminal running while you use the app; `Ctrl+C` when done.

### D — Host on your own site

Upload all three files (`vibecheck.html`, `manifest.json`, `icon.svg`) to any static-site host — Netlify, Vercel, Cloudflare Pages, GitHub Pages, your Wix site's media library, etc. Point your browser at whatever URL your host gives you.

---

## 🔑 API Key

VibeCheck uses the **Anthropic Claude API** directly from the browser.

1. Get a free key at [console.anthropic.com](https://console.anthropic.com) → API Keys
2. On first run, VibeCheck prompts you with a secure modal
3. Key is stored in `sessionStorage` — never leaves your browser except to Anthropic's servers

> **Never commit your API key to this repo.** The modal handles it safely.

---

## 🧪 Test Entry

Use this to verify everything is working:

| Field | Value |
|---|---|
| **App URL** | `https://app.lovable.dev/projects/demo` |
| **What does it do** | A SaaS project management dashboard where users log in, create projects, assign tasks to team members, set deadlines, and track progress with a kanban board. Built with Lovable using Supabase for authentication and database. |
| **App type** | SaaS / Dashboard |
| **Built with** | Lovable |

**What to check:**
- ✅ Terminal animation plays (12 steps)
- ✅ Crawl status shows in terminal (proxy result or fallback message)
- ✅ Crawl badge appears on report (green = live crawl, amber = inference)
- ✅ Score ring animates
- ✅ All 8 category cards render
- ✅ Code fix snippets appear in each expanded card
- ✅ DarkPixel CTA appears below cards
- ✅ HTML / PDF / Word download buttons work
- ✅ URL hash updates to `#r=...` (shareable link)

---

## 📁 File Structure

```
Vibe-QA-Reviewer/
├── vibecheck.html     ← The entire app (~2600 lines, no build step)
├── manifest.json      ← PWA manifest — lets Chrome/Edge "Install as app"
├── icon.svg           ← App icon used by the manifest + browser tab
├── README.md          ← This file
├── LICENSE            ← MIT (public-source terms)
└── docs/
    ├── COMMERCIAL-LICENSE.md   ← Rights granted by paid Gumroad tiers
    ├── DISCLAIMER.md           ← AS-IS / verify-before-shipping
    └── PRIVACY.md              ← Full data-flow disclosure
```

`vibecheck.html`, `manifest.json`, and `icon.svg` must stay in the same directory for the "Install as app" button to appear in Chrome/Edge.

---

## 🗺 Roadmap

- [ ] OG image generator for shareable report previews
- [ ] GitHub Gist integration — save/load code files directly
- [ ] CI/CD webhook — trigger reviews on every push
- [ ] Team/agency white-label (remove DarkPixel CTA, swap in yours)

---

## 🏢 Built by

**[DarkPixel Consulting Inc.](https://www.darkpixelconsultinginc.co/)** — Expert web & app development. We ship it right the first time.

---

## 💰 Pricing & License

The source in this repository is **MIT** — free to use, fork, study, and modify.

**[Get it on Gumroad →](https://gumroad.com/)** <!-- replace with your actual Gumroad URL -->

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
Yes. VibeCheck calls Anthropic's Claude API directly from your browser using **your** key. Get one at [console.anthropic.com](https://console.anthropic.com). Typical review costs a few cents and the exact amount is shown on every report.

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
