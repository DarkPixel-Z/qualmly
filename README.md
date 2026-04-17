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

## 🛠 Setup

### Option 1 — Just open the file
```bash
# Clone the repo
git clone https://github.com/DarkPixel-Z/Vibe-QA-Reviewer.git

# Open in browser
open vibecheck.html
```

### Option 2 — Host on GitHub Pages
1. Go to repo **Settings → Pages**
2. Set source to `main` branch, `/ (root)`
3. Your app is live at `https://DarkPixel-Z.github.io/Vibe-QA-Reviewer/vibecheck.html`

### Option 3 — Host on your Wix site
Upload `vibecheck.html` via Wix Media Manager and link to it, or embed via an HTML embed block.

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
├── vibecheck.html     ← The entire app (single file)
├── README.md          ← This file
└── LICENSE            ← MIT
```

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

## 📄 License

MIT — free to use, fork, and build on.
