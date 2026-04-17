# Privacy & Data Flow

VibeCheck is a **single HTML file** that runs entirely in your browser. DarkPixel Consulting Inc. operates **no servers** for VibeCheck. **We cannot see anything you paste into it.**

This document describes exactly what data leaves your browser, who receives it, and why — so you can decide whether it's appropriate for the code and URLs you intend to analyze.

---

## What leaves your browser

### App QA Mode — analyzing a live URL

| Data | Destination | Purpose |
|---|---|---|
| The URL you enter | `api.allorigins.win`, `api.codetabs.com`, `corsproxy.io` (CORS proxy network, tried in parallel) | Bypasses browser same-origin policy to fetch the page's HTML |
| The page's HTML content | Same proxies, then processed in your browser | Parses forms, navigation, scripts, accessibility markers |
| The URL (fallback) | `archive.org` Wayback Machine | Used only if all CORS proxies fail |
| App description + URL + extracted page summary | `api.anthropic.com` | Generates the QA report via Claude |

### Code Review Mode — analyzing pasted code

| Data | Destination | Purpose |
|---|---|---|
| The code you paste | `api.anthropic.com` | Generates the review via Claude |
| Your "what does this do?" description | `api.anthropic.com` | Same |

### Your Anthropic API key

Stored in the browser's **`sessionStorage`** — it lives only in the current browser tab and is wiped when the tab closes.

Transmitted **only to `api.anthropic.com`** via Anthropic's documented `x-api-key` header.

**Never** reaches DarkPixel, the CORS proxies, the Wayback Machine, or any other third party.

### Report history

When a report renders, a compressed copy is saved to your browser's **`localStorage`** under the key `vc_history` (last 8 reports). This data is **local to your browser only** and is never transmitted anywhere.

---

## What DarkPixel Consulting Inc. collects

**Directly from VibeCheck: nothing.** No analytics, no phone-home, no telemetry. The tool does not contact DarkPixel servers because there are none.

**From Gumroad (your purchase):** Gumroad provides us with your purchase email, name (if you provided one), amount, and country. We use this to:

- Deliver the software and any future updates you're entitled to
- Send occasional update notifications (1–2 per year; you can unsubscribe at any time)
- Respond to support requests
- Comply with Canadian tax and accounting obligations

We do not sell, rent, or share this data with third parties for their own marketing. Gumroad's own practices are governed by [Gumroad's Privacy Policy](https://gumroad.com/privacy).

---

## Guidance for sensitive data

**Do not paste into VibeCheck:**

- URLs containing session tokens, API keys, or other secrets in the URL itself
- Code containing production secrets, private keys, or real user PII
- Data covered by strict regulatory regimes — **PHI (HIPAA / PHIPA / PIPEDA)**, **PCI cardholder data**, or **trade secrets under an NDA**. The third-party CORS proxies and Anthropic's commercial terms may not satisfy your compliance obligations.

If you need to analyze regulated data, **redact first** — or do not use VibeCheck for that workload.

---

## Your rights

If you are a resident of Canada (PIPEDA), Quebec (Law 25), the EU/UK (GDPR), or California (CCPA/CPRA), you have rights regarding the data Gumroad shares with us — including access, correction, deletion, portability, and opting out of marketing.

To exercise any of these, email **info@darkpixelconsultinginc.co**. We respond within 30 days.

For data handled by downstream services:
- Anthropic: [anthropic.com/privacy](https://www.anthropic.com/privacy)
- allorigins.win, api.codetabs.com, corsproxy.io: see their respective websites
- Wayback Machine: [archive.org/about/terms.php](https://archive.org/about/terms.php)

---

## Contact

**DarkPixel Consulting Inc.**
info@darkpixelconsultinginc.co
Manitoba, Canada

*Last updated April 2026.*
