# Qualmly Monitor — Deploy Walkthrough

End-to-end deploy of the continuous-monitoring Cloudflare Worker. ~30 minutes if everything has accounts already, ~60 minutes if you're setting up Resend / Cloudflare for the first time.

**Pre-flight: confirm you have these accounts.** All free tier is fine for the first ~3,000 paying customers.

| | Account | Why | Free? |
|---|---|---|---|
| ✅ | Cloudflare | hosts the Worker, KV namespaces, custom domain `monitor.qualmly.dev` | Yes |
| ✅ | Stripe | processes the $99/yr Pro subscription | Yes (account is free; takes 2.9% + 30¢ per charge) |
| ⚠ | Resend | sends the "findings changed" diff emails | Free tier: 3,000 emails/month, 100/day. Plenty. |
| ✅ | GitHub (already have) | optional — to wire wrangler deploys via Actions | Yes |

If you don't have Resend, sign up at https://resend.com → Add Domain → verify `qualmly.dev` (~10 min DNS step). Send-as `monitor@qualmly.dev`.

---

## Step 1 — install wrangler + log in to Cloudflare

```bash
npm install -g wrangler
wrangler login
```

Browser opens, you authorize. ~2 min.

---

## Step 2 — create the 3 KV namespaces

```bash
cd workers/monitoring
wrangler kv:namespace create USERS
wrangler kv:namespace create WATCHES
wrangler kv:namespace create HISTORY
```

Each command prints something like:
```
🌀 Creating namespace with title "USERS"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "USERS", id = "abc123def456..." }
```

**Copy the 3 IDs** and paste them into `workers/monitoring/wrangler.toml`, replacing the `REPLACE_WITH_KV_ID_AFTER_CREATE` placeholders.

---

## Step 3 — set Worker secrets

You need 4 secrets. Each command prompts for the value (hidden input).

```bash
# Resend API key — for sending diff emails
# Get from https://resend.com/api-keys
wrangler secret put RESEND_API_KEY

# Stripe secret key — for verifying webhooks (live key, sk_live_*)
# Get from https://dashboard.stripe.com/apikeys
wrangler secret put STRIPE_SECRET_KEY

# Stripe webhook signing secret — different from secret key
# Get from https://dashboard.stripe.com/webhooks → your endpoint → Signing secret
wrangler secret put STRIPE_WEBHOOK_SECRET

# Service-mode passphrase salt (used for encrypting the per-user
# service passphrase before storing in USERS KV). Generate any
# random 32-char string; keep it stable forever.
wrangler secret put SERVICE_PASSPHRASE_SALT
```

For SERVICE_PASSPHRASE_SALT, generate via:
```bash
openssl rand -hex 16
```

**Plus one of these two checkout configurations** (the qualmly.dev "Subscribe" button calls `/api/checkout` and uses whichever you set):

```bash
# Option A — Stripe Payment Link (simplest, recommended for launch)
# Create one at https://dashboard.stripe.com/payment-links pointing at the $99/yr price
wrangler secret put STRIPE_PAYMENT_LINK
# value looks like: https://buy.stripe.com/eVa3eu...

# OR Option B — full Checkout Session API (gives more control)
# (STRIPE_SECRET_KEY is already set above)
wrangler secret put STRIPE_PRICE_ID
# value looks like: price_1S...
```

---

## Step 4 — set up Stripe products + webhook

In the Stripe Dashboard:

1. **Products** → **+ Add product**
   - Name: **Qualmly Monitor — Pro**
   - Price: **$99 USD recurring annual**
   - Save the price ID (`price_*`) — you'll need it for checkout links.
2. *(Optional)* Add a second product **Qualmly Monitor — Agency** at $299/yr if you want the second tier.
3. **Developers → Webhooks** → **+ Add endpoint**
   - URL: `https://monitor.qualmly.dev/webhooks/stripe` (you'll set up this domain in Step 6)
   - Events: subscribe to:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - Save → click the new endpoint → **Reveal signing secret** → that's `STRIPE_WEBHOOK_SECRET` from Step 3.

---

## Step 5 — deploy the Worker

```bash
cd workers/monitoring
wrangler deploy
```

Output:
```
Total Upload: 5.21 KiB / gzip: 2.04 KiB
Worker Startup Time: 8 ms
Uploaded qualmly-monitor (1.23 sec)
Published qualmly-monitor (0.34 sec)
  https://qualmly-monitor.<YOUR-SUBDOMAIN>.workers.dev
```

The Worker is live at the `*.workers.dev` URL. Hit `/health` to confirm:
```bash
curl https://qualmly-monitor.<YOUR-SUBDOMAIN>.workers.dev/health
# → {"ok":true,"version":"monitor-v0.1.0-scaffold"}
```

---

## Step 6 — wire `monitor.qualmly.dev` custom domain

In Cloudflare Dashboard:

1. **DNS** → add a CNAME: `monitor` → `qualmly-monitor.<YOUR-SUBDOMAIN>.workers.dev` (proxied, orange cloud)
2. **Workers & Pages** → click your `qualmly-monitor` worker → **Triggers** → **Custom Domains** → **+ Add Custom Domain** → `monitor.qualmly.dev`. Cloudflare auto-provisions a TLS cert (~30 sec).

Test:
```bash
curl https://monitor.qualmly.dev/health
```

Update the Stripe webhook URL (Step 4) to use `https://monitor.qualmly.dev/webhooks/stripe`.

---

## Step 7 — add the registration UI to qualmly.dev (optional, for v1.4)

For users to actually subscribe, qualmly.dev needs a "Continuous monitoring" tab/section that:

1. Walks them through Stripe Checkout (creates a session pointing at the price ID from Step 4).
2. After return-from-checkout, calls `POST monitor.qualmly.dev/api/register` to create the user + encrypted-key blob.
3. Calls `POST monitor.qualmly.dev/api/watch` to add the first watch target.

**This is the v1.4 frontend work.** The Worker backend is fully deployable today; the UI integration is a separate ~1 day of work in `index.html`.

For an MVP you can skip the in-app UI and use Gumroad as the payment layer:
- Sell "Qualmly Monitor — Pro" as a Gumroad product at $99/yr.
- After purchase, manually run `wrangler kv:put` to add the user to USERS KV.
- Manual flow for the first ~10 customers, then automate.

---

## Step 8 — verify the cron actually fires

```bash
# View Worker logs in real time
wrangler tail
```

The cron (`0 * * * *`) fires at the top of each hour. You'll see:
```
[monitor] cron fired: 0 * * * * 2026-05-04T01:00:00.000Z
[monitor] scheduled run: scanned=0 skipped=0 total=0
```

Once you have a watch target registered, it scans on the first hour past its `lastScanAt + intervalDays`.

---

## Cost projection

| Users | Watches | Scans/month | Anthropic cost (BYOK = user pays) | Resend (free tier 3k/mo) | Cloudflare Worker |
|---|---|---|---|---|---|
| 10 | 30 | ~120 | user pays ~$0.36/user/month from their key | Free | Free |
| 100 | 300 | ~1,200 | user pays ~$0.36/user/month | Free | Free |
| 1,000 | 3,000 | ~12,000 | user pays | $20/mo for higher Resend tier | Likely still free; ~$5/mo if KV reads spike |
| 10,000 | 30,000 | ~120,000 | user pays | $80/mo | $5–$20/mo |

**At 1,000 paying customers ($99/yr × 1,000 = $99,000/yr revenue):** infrastructure cost is ~$25/month. That's the unfair-margin business model the Worker enables.

---

## What's NOT in this scaffold (to ship after launch)

1. **Service-mode passphrase setup flow** — when a user enables continuous monitoring, qualmly.dev needs to ask them for a passphrase that gets stored separately (encrypted with `SERVICE_PASSPHRASE_SALT`) so the cron can decrypt their Anthropic key without their session. Currently the Worker assumes this exists at `svc:<userId>` in USERS KV but the UI to set it doesn't exist yet.
2. **Failure backoff** — if a user's Anthropic key fails 3x in a row (revoked, exhausted credit), pause the watch and email them.
3. **Per-watch Slack/Discord webhook** — for teams who want notifications in chat, not email.
4. **Public scoreboard / status page** — opt-in "my Qualmly score is X" public URL for transparency-bro startups.

Each is ~1-3 days. Ship in v1.5+ based on what paying users actually ask for.

---

## When ready to flip on

1. Steps 1–6 above (~30 min if accounts ready)
2. Add the v1.4 frontend UI to qualmly.dev — 1 day of work
3. Tweet / email the launch list: **"Qualmly Monitor — weekly rescans, $99/yr"** with Stripe link
4. Manually onboard the first ~5 customers to flush out edge cases
5. After that, the system is autonomous — cron runs hourly, scans run weekly, emails go out on changes, Stripe handles renewals/cancellations
