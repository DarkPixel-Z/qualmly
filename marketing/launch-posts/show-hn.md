# Show HN — submission

## Title (use this exact wording)

```
Show HN: Qualmly – I scanned 10 AI-built apps; 9 leak Supabase creds in JS
```

**Why this title:** "Show HN: Qualmly" identifies the tool. The dataset hook ("9 leak Supabase creds") creates the click. Under 80 chars. Specific platforms (Supabase, JS) signal technical substance. No clickbait punctuation.

## URL field

Use the BLOG POST, not qualmly.dev directly:
```
https://www.darkpixelconsultinginc.co/blog/10-vibe-coded-apps-audit
```

HN ranks Show HN higher when the URL points at content/writeup rather than at a marketing landing page. The post links to qualmly.dev anyway.

## Text (the comment that runs alongside the submission)

```
Hi HN — I'm Amanda from DarkPixel Consulting. I built
Qualmly (qualmly.dev) because every AI-coded project I audited at
the consulting layer had the same 3 RLS misconfigurations.

To test whether the pattern holds beyond my client work, I ran a
passive public-recon audit on 10 apps from the Lovable + Bolt
showcases. Findings:

- 9/10 expose Supabase project URL + anon key in the JS bundle
  (this is by design for the JS client, but means RLS posture is the
  whole game — and we couldn't verify it from outside)
- 0/10 set a Content-Security-Policy
- 3/10 call admin RPC functions (rpc("get_admin_statistics"), etc.)
  directly from the client bundle, which is the failure mode where
  one missing role-check in the SQL body = full admin data exposure
  to any authenticated user
- 1/10 ships 127.0.0.1 to production (dev fallback survived the build)
- 1/10 ships realistic-looking fake Stripe keys (sk_live_abc123…) as
  UI placeholder text in an admin dashboard, which trips every CI
  secret scanner

I did NOT actively probe any backend. I read the publicly-served HTML
and JS bundles only — the same recon an attacker does in their first
60 seconds. The blog post lays out the methodology and what we
explicitly didn't do.

Qualmly itself: single HTML file, vanilla JS, no backend, BYOK
Anthropic API key. ~$0.03 per scan. Open source on GitHub
(github.com/DarkPixel-Z/qualmly). The homepage has a "Try a live
demo" button that loads a hardcoded example report so you can see
what the output looks like before grabbing a key.

Built two real security guardrails that I think are interesting:
1. The Code Review mode scans pasted code for 9 known credential
   patterns (Anthropic, Stripe, AWS, GitHub, etc.) before sending to
   Anthropic, with a one-click auto-strip that replaces matches with
   [REDACTED]. Catches the foot-shot of pasting your own .env.
2. SHA-384 SRI on the cdnjs scripts (jspdf, html2canvas) so a
   compromised cdnjs can't inject keystroke loggers.

It's also distributed in three other shapes that share the same
prompt and the same 9 secret patterns:
- GitHub Action (PR audits): github.com/marketplace/actions/qualmly-audit
- Python CLI for APK / IPA scanning: pip install qualmly-mobile
- Continuous monitoring (Cloudflare Worker, weekly cron-based diff +
  Resend email). $99/yr per app — BYOK so the cron pulls ~$0.03/scan
  off the user's Anthropic credit, not ours. Single revenue surface.

Disclosed findings to all 10 app owners with a 14-day window before
the post went live. Aggregate stats only, no app named without
consent.

Curious for HN's take on:
- Should AI coding platforms (Lovable, Bolt, v0) generate verifiable
  RLS scaffolds + pgTAP tests by default? If yes, what's the right
  failure mode — refuse to deploy, or just warn?
- Are the patterns we found actually fixable at the platform layer,
  or is this fundamentally a "user has to know what they're doing"
  problem that no tooling solves?

Roast away.
```

## Why this works on HN

- "Show HN" prefix is the convention. Always use it for product launches.
- First-person voice — HN penalizes corporate/marketing tone.
- Bullet-point findings are scannable. HN readers skim before clicking.
- Methodology + ethics disclaimer up front earns trust. HN distrusts security writeups that read like marketing.
- The "interesting things I built" section gives commenters technical hooks to discuss.
- Open question at the end is comment-bait — invites discussion which boosts ranking.
- Discloses commercial intent (links to Gumroad through the blog post) without pretending this is pure open-source.

## When to post

- **Day:** Tuesday or Wednesday (highest HN traffic).
- **Time:** 9:00–10:30 AM Eastern (catches East-coast lunch + West-coast morning). Avoid Mondays (HN is flooded post-weekend) and Fridays (low engagement).
- **One submission only.** If it doesn't take off in 2 hours, don't repost. Rate-limit kicks in and re-submissions get ghosted. Try again from a different angle in a different week.

## What to do AFTER you submit

1. **DO NOT vote on your own submission** — HN detects this and shadow-bans accounts.
2. **DO NOT ask others to upvote** — tank-able offence.
3. **DO** reply to comments quickly and substantively. Engagement = ranking.
4. **DO** treat hostile comments charitably. HN respects you defending your work calmly. They despise defensive reactions.
5. **DO** add a comment yourself within the first 30 minutes with one extra detail you didn't put in the body — this signals you're around for discussion.

## Common questions you should pre-write answers for

> "How do I know your scanner doesn't hallucinate findings?"

The recon part is grep — fully verifiable. `curl https://app.com/assets/index.js | grep supabase.co` will show you the same Supabase URL Qualmly finds. The Claude-generated narrative on top is opinionated; we expose a "fix confidence" score per finding so you can weight them. Source on GitHub if you want to read the prompt.

> "Why a single HTML file? Just use a Vite build."

Three reasons. (1) The pitch — "your code never touches our servers" — is provable when there's nothing to ship except an HTML file the user can read. (2) GitHub Pages can host it for free with no build step. (3) Buyers can self-host the .zip on their own intranet, which matters for clients in regulated industries who don't want SaaS dependencies.

> "Why charge at all if it's MIT?"

Source is free. The $15 is a written commercial license you can show clients/accountants. $49 Agency tier adds white-label rights for consulting deliverables. If you just want it for yourself, MIT covers you.

> "Are you going to run this on production banking apps?"

Out of scope. The audit dataset deliberately targeted publicly-listed apps from showcases — opt-in for being publicly visible. Don't run Qualmly on something you don't own without permission.
