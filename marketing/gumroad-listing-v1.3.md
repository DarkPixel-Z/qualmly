# Gumroad Listing Refresh — v1.3.0

Open https://gumroad.com/products/vbpigw/edit and paste each section below into the matching Gumroad field.

---

## STEP 1 — Replace BOTH product files

In the **Content** tab (or whichever variant has the file uploads):

**For the Personal variant** — delete the old file, upload:
```
C:\Users\angya\OneDrive\Desktop\qualmly-gumroad-uploads\qualmly-personal.zip
```

**For the Agency variant** — delete the old file, upload:
```
C:\Users\angya\OneDrive\Desktop\qualmly-gumroad-uploads\qualmly-agency.zip
```

(File sizes are now 70 KB / 72 KB — slightly bigger than v1.2.0 because index.html grew with the new features.)

---

## STEP 2 — Update the product Description

Replace the entire description with this (paste-ready). Keep the existing rich-text formatting if Gumroad strips line breaks; otherwise paste as-is.

```
Qualmly is the AI reviewer that raises every concern about code shipped from Lovable, Bolt, v0, Cursor, Copilot, Claude Code, Windsurf, Replit, or Webflow AI. Get a real audit in 30 seconds — no engineer required.

✅ ONE HTML file — drop it on any host, run it from your browser, audit any URL.
✅ BYOK Anthropic — your code never touches our servers. Your key, your bill.
✅ ~$0.03 per scan — typical Anthropic spend for a full 8-category audit.
✅ Open-source MIT — read every line on GitHub before trusting it.

────────── WHAT'S NEW IN v1.3.0 (May 2026) ──────────

🔓 Active Supabase RLS probe — confirms whether RLS is enforced (opt-in, owner-only)
🛡 Pasted-code secret detection — scans for 9 credential patterns before sending to Anthropic
👀 "Try a live demo" button — first-time visitors see a real report without grabbing an API key
🎉 Viral share card — copy as terminal, README badge, X/LinkedIn share
🔐 Phishing-paste warning + SRI on all third-party scripts
🪪 Build version stamp + "Clear all data" footer button

────────── COMPANION TOOLS (free with purchase) ──────────

📦 GitHub Action — Qualmly Audit on every PR
   github.com/marketplace/actions/qualmly-audit

📱 Mobile APK/IPA scanner — Python CLI for embedded secrets in mobile builds
   github.com/DarkPixel-Z/qualmly/tree/main/mobile-scanner

🌐 Chrome extension (coming very soon) — Ctrl+Shift+Q to audit the current tab
   Web Store submission queued; pending D-U-N-S business verification.
   Free, MIT — install link will be added to your purchase page on approval.

────────── HOW IT WORKS ──────────

⚡ App QA Mode
Paste a live app URL. Get a full QA report across 8 categories: navigation, forms, auth, errors, mobile responsiveness, performance, accessibility, data persistence. Real URL crawling via 5-layer proxy fallback.

📄 Code Review Mode
Paste any code (30+ languages). Get OWASP Top 10 + CWE/SANS Top 25 + WCAG 2.2 + SOLID/DRY/KISS/12-Factor findings. Plus UAT scenarios with priority + automation hints.

🚀 Paste-into-builder prompts
Every finding comes with a natural-language fix prompt tuned to YOUR AI coding tool — Lovable, Bolt, v0, Cursor, GitHub Copilot, Claude Code, Windsurf, Replit, or Webflow AI. Copy → paste into your chat → done.

📝 Plain-English mode
One toggle rewrites every finding for a non-technical reader. Show your CTO, your client, your investor.

🛡 Mark-as-intentional
Click any finding, explain the context, Qualmly re-evaluates and downgrades or dismisses if the explanation holds.

────────── WHAT YOU GET ──────────

👤 PERSONAL ($15) — single-developer license. Use it on your own projects, in your job, in your client work. Email support, 12 months of updates, a written commercial license you can show your accountant.

🏢 AGENCY / WHITE-LABEL ($49) — everything in Personal, plus the right to remove the DarkPixel CTA from generated reports and bundle Qualmly into paid client deliverables. Ideal for consulting shops and agencies that audit AI-coded apps for clients.

The public source on GitHub is MIT-licensed — free to use, fork, study, modify. Your Gumroad purchase adds commercial rights ON TOP of MIT. Full terms: github.com/DarkPixel-Z/qualmly/blob/main/docs/COMMERCIAL-LICENSE.md

────────── WHY NOT CodeRabbit / Snyk / Qodo? ──────────

CodeRabbit is $15/user/month. Qualmly is $15 ONE TIME for life-of-tool updates.
Snyk and Qodo are $18/user/month. Same math.
Vibe App Scanner Continuous is $99/MONTH. Qualmly is $15 lifetime.

For a 12-month TCO comparison: a single CodeRabbit user costs $180/year. The Personal tier of Qualmly is $15. Same audit quality (we use Anthropic Claude Sonnet 4.6, not a smaller model).

────────── ABOUT ──────────

Built by DarkPixel Consulting Inc. — a web and app development practice that ships AI-coded apps the right way the first time. We built Qualmly because every AI-coded project we audited at the consulting layer had at least three of the same RLS / secret-leak / CSP-missing patterns. Now you can audit yours before you ship.

Free to use forever via the open-source repo. The Gumroad tiers add commercial rights, support, and updates on top of MIT.

⚡ qualmly.dev
🏢 darkpixelconsultinginc.co
📦 github.com/DarkPixel-Z/qualmly
```

---

## STEP 3 — Update the Summary (the line that shows in search results)

Replace with:

```
30-second AI security + QA audit for any Lovable, Bolt, v0, or Cursor app. Open source, BYOK Anthropic, ~$0.03 per scan. v1.3.0.
```

(132 chars — fits the SEO previews everywhere.)

---

## STEP 4 — Confirm cover image / thumbnail still good

The 1200×1200 thumbnail (`qualmly-thumbnail.png`) and 1200×630 landscape (`qualmly-thumbnail-landscape.png`) in the gumroad-uploads folder are unchanged from launch — still work. No update needed.

---

## STEP 5 — Save changes

Top-right of the Gumroad edit page → **Save changes**. Then click **View product page** to verify it renders correctly with the new copy.

---

## STEP 6 — Test purchase yourself (5 min)

Same as before — use a 100%-off offer code to buy your own Personal tier as a test. Verify the email Gumroad sends has the new zip and the new README.txt contents. If the version stamp inside the zip's `index.html` reads `v1.3.0`, you're golden.

---

## What you have on disk now

```
C:\Users\angya\OneDrive\Desktop\qualmly-gumroad-uploads\
├── qualmly-personal.zip                  ← 70 KB, v1.3.0 ← UPLOAD THIS
├── qualmly-agency.zip                    ← 72 KB, v1.3.0 ← UPLOAD THIS
├── qualmly-personal-OLD-v1.0.zip         (kept for rollback)
├── qualmly-personal-OLD-v1.2.zip         (kept for rollback)
├── qualmly-agency-OLD-v1.0.zip           (kept for rollback)
├── qualmly-agency-OLD-v1.2.zip           (kept for rollback)
├── qualmly-thumbnail.png                 (unchanged — already on Gumroad)
└── qualmly-thumbnail-landscape.png       (unchanged — already on Gumroad)
```
