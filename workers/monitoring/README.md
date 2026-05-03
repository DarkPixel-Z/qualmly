# Qualmly Continuous Monitoring — Cloudflare Worker

Scheduled rescans + email-on-change for registered watch targets. The recurring-revenue tier ($99/year) that closes the function gap vs Vibe App Scanner ($99/mo) and AuditYourApp ($29/mo).

## Status

**Architectural scaffold.** All routes work, KV reads/writes work, cron handler fires. The wire-up to a real Anthropic call + Resend email sender is ~3 days of remaining work.

What's done:
- ✅ Cloudflare Worker entrypoint with full route handler (register, watch CRUD, results, Stripe webhook stub)
- ✅ KV namespace bindings for USERS, WATCHES, HISTORY
- ✅ Cron trigger (`0 * * * *` — hourly) that loops watches, runs scans where due
- ✅ AES-GCM Anthropic-key encryption (300k PBKDF2 iterations, mirrors the qualmly.dev scheme)
- ✅ Diff logic (`shouldNotify` — score drop ≥10 OR new fail-severity finding)
- ✅ Subscription gating (per-watch `subscriptionActive` flag, set by Stripe webhook)

What's NOT done (blocks production):
1. **Anthropic call wiring** in `runScanForWatch` — currently returns an empty result. Needs to mirror the Qualmly App QA prompt + parse logic. ~1 day.
2. **Resend integration** — `sendDiffEmail` is currently `console.log` only. Sign up at resend.com, get API key, uncomment the fetch. ~2 hours.
3. **Stripe subscription wiring** — `handleStripeWebhook` is a stub. Need signature verification + `customer.subscription.updated` handler that flips `subscriptionActive`. ~4 hours.
4. **Frontend (qualmly.dev/monitor)** — users need a UI to register, add watches, see history. Could be a separate route on qualmly.dev or its own subdomain. ~1 day.
5. **Email diff template** — `buildEmailHtml` is referenced but not implemented. ~1 hour.

## Architecture

```
User                           Worker                       External
─────                          ──────                       ────────
  │                              │                              │
  │  POST /api/register          │                              │
  │  { email, anthropicKey,      │                              │
  │    passphrase }              │                              │
  ├─────────────────────────────>│                              │
  │                              │  AES-GCM encrypt key         │
  │                              │  KV.put(user:<id>)           │
  │  { userId }                  │                              │
  │<─────────────────────────────┤                              │
  │                              │                              │
  │  Stripe Checkout flow        │                              │
  ├──────────────────────────────────────────────────────────>  │
  │                              │  POST /webhooks/stripe       │
  │                              │<──────────────────────────── │
  │                              │  flip subscriptionActive=true│
  │                              │                              │
  │  POST /api/watch             │                              │
  │  { targetUrl, intervalDays } │                              │
  ├─────────────────────────────>│                              │
  │                              │  KV.put(watch:<id>)          │
  │                              │                              │
  │                              │   ⏰ cron fires every hour   │
  │                              │   loop watches               │
  │                              │   for each due:              │
  │                              │     decrypt key              │
  │                              │     call Anthropic ────────> │
  │                              │     diff vs HISTORY:latest   │
  │                              │     if changed:              │
  │                              │       send email via Resend  │
  │                              │     KV.put(HISTORY:latest)   │
  │                              │                              │
  │  GET /api/watch/<id>/results │                              │
  ├─────────────────────────────>│                              │
  │  { latest, history[] }       │                              │
  │<─────────────────────────────┤                              │
```

## Pricing (proposed)

| Tier | Price | Features |
|---|---|---|
| **OSS / single-file Qualmly** | Free / $15 / $49 (one-time) | The existing tool. No watches, no recurring. |
| **Pro Monitor** | $99 / year | 3 watch targets, weekly rescan, email on findings change, 30-scan history per target. |
| **Agency Monitor** | $299 / year | 25 watch targets, daily rescan, branded email diffs, API access for embedding scores. |

Anchored against:
- Vibe App Scanner Continuous: $99/mo = $1,188/yr → Qualmly Pro is **12× cheaper**
- AuditYourApp Continuous Guard: $29/mo = $348/yr → Qualmly Pro is **3.5× cheaper**

## File layout

```
workers/monitoring/
├── src/
│   └── index.js          ← Worker entrypoint, all routes + cron
├── wrangler.toml         ← Cloudflare deploy config
└── README.md             ← this file
```

## Deploy (when wire-up is finished)

```bash
cd workers/monitoring
npx wrangler kv:namespace create USERS
npx wrangler kv:namespace create WATCHES
npx wrangler kv:namespace create HISTORY
# Paste the returned IDs into wrangler.toml
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler deploy
```

Custom domain: bind to `monitor.qualmly.dev` in the Cloudflare dashboard once deployed.

## Cost (Cloudflare side)

Worker free tier: 100k requests/day + 10ms CPU per request. The cron handler runs 24× per day. Each scan = 1 Anthropic call (~5–15s wall time, but CPU on the Worker side is minimal — most time is awaiting Anthropic).

Rough projection at 1,000 paid users with 3 watches each:
- 24,000 cron-triggered scans/month → well under free tier
- KV reads/writes: ~150k/month → free tier covers 100k, may need Workers Paid ($5/mo)
- **Total Worker infrastructure cost: $0–$5/month for the first ~3,000 users.**

## Privacy

Same model as the OSS tool: Anthropic keys are encrypted at rest with the user's passphrase (PBKDF2 + AES-GCM). The decrypted key lives in memory only during the scan request. We never log keys or content.

Difference from the OSS tool: this Worker DOES persist scan results in our KV (so we can diff against them next time). The OSS tool keeps results in the user's browser only. The privacy doc needs to call this out clearly when we ship.

## Why ship this AFTER the launch

Three reasons:
1. **Pricing model is recurring.** Recurring revenue requires customer-support infra (refunds, churn handling) that doesn't exist yet for Qualmly. Bolt this on after the one-time-purchase model has 50+ paying customers.
2. **Breaks the single-file pitch.** The OSS tool's purity ("read every line before trusting it with your key") gets diluted when there's a backend. Keep them positioned as separate products.
3. **Validation needed first.** Run polls in launch comments asking "would you pay $99/yr for weekly rescans?" — if <30% interest, don't build.
