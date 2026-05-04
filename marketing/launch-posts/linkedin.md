# LinkedIn — launch post

## What LinkedIn rewards (and what it punishes)

| Reward | Punish |
|---|---|
| Personal narrative ("I learned X") | Pure marketing copy |
| Hooks in line 1 (the only line shown before "see more") | Burying the lede |
| 5–10 short paragraphs (each 1–3 sentences) | Walls of text |
| Hashtags at the end (3–5 max) | Spam-tier hashtag stuffing |
| External links **in the first comment**, not the body | Links in the body (algorithm penalizes) |
| Tagging people who you know will engage | Tagging companies cold |
| 1–2 emojis as section breaks | Emoji confetti |

## The post

Copy this whole block into the LinkedIn composer:

```
9 out of 10 AI-built apps I just audited ship database
credentials in their JavaScript bundle.

I run DarkPixel Consulting. Every Lovable / Bolt / v0 client
project I'd cleaned up over the last 6 months had the same 3
issues. I wanted to know if the pattern held beyond my client
work — so I ran a public, passive recon on 10 apps from the
Lovable + Bolt showcase galleries.

Here's what I found across 10 apps:

→ 9/10 expose Supabase project URL + anon key in their JS
   bundle. (This is expected — but it means the entire security
   model rests on Row-Level Security policies being correct on
   every table.)

→ 0/10 set a Content-Security-Policy header.

→ 3/10 call admin-flavoured RPC functions directly from the
   client bundle. If those SQL functions don't enforce role
   checks in their body, ANY authenticated user can call them
   from DevTools.

→ 1/10 shipped 127.0.0.1 to production.

→ 1/10 shipped fake Stripe keys (sk_live_abc123…) as UI
   placeholder text in an admin dashboard.

I did NOT actively probe any backend. I read the
publicly-served HTML and JavaScript bundles only — the same
recon an attacker does in their first 60 seconds.

The takeaway is not "AI coding tools are bad." They're a real
productivity unlock. The takeaway is that the defaults need
work — Content-Security-Policy should be on by default, RLS
templates should ship with pgTAP tests, and unused auth
providers (Solana, Ethereum) shouldn't be enabled on apps
where they make no sense.

If you've shipped something with Lovable, Bolt, v0, Cursor,
Copilot, Claude Code, Windsurf, or Replit — there's a
30-second view-source check you can do today. It won't catch
everything but it catches the worst of it.

The tool I used is now also a GitHub Action (PR audits) and
a Python CLI (APK / IPA scanner) — both free. And as of
today: weekly auto-rescans for $99/yr if you want a Friday
afternoon "the bundle drifted" alert in your inbox. BYOK
Anthropic so the per-scan cost is your ~$0.03 — we make
money on the slot, you make money on the catches.

Full audit + methodology + the 6-fix list in the comments. ↓

#WebDev #AppSecurity #AICoding #IndieHackers #VibeCoding
```

## First comment (post this immediately after the post goes live)

```
Full writeup with the methodology and the 6-fix list:
https://www.darkpixelconsultinginc.co/blog/10-vibe-coded-apps-audit

Tool I used to run the audit (single HTML file, BYOK
Anthropic, open-source):
https://qualmly.dev

Three flavors, all BYOK:
• Browser tool — instant 30-sec audit (free)
• GitHub Action — runs on every PR (free)
   github.com/marketplace/actions/qualmly-audit
• Python CLI — APK/IPA scanner for mobile builds (free)
   pip install qualmly-mobile
• Continuous monitoring — weekly rescans, $99/yr per app

Disclosure: this is mine. Free to use; $15 for a written
commercial license, $49 for white-label rights. The audit
methodology in the blog post is reproducible by hand —
the tool just does the same thing in 30 seconds.
```

## Why this structure works

1. **Hook in line 1 is the headline finding.** That's all anyone sees in their feed. If "9/10 ship credentials" doesn't make them click "see more," nothing will.

2. **Personal voice ("I run DarkPixel Consulting") makes it credible.** Pure-data posts read as marketing; personal narrative reads as research.

3. **The arrow-bullets are a LinkedIn UI trick.** The platform renders → as visible bullets, but doesn't penalize them as links. They scan beautifully.

4. **Methodology disclaimer in the middle.** Builds trust mid-scroll. "I did NOT actively probe" is the line that makes a senior engineer keep reading instead of writing you off as a script kiddie.

5. **Soft CTA to "do this yourself".** The post sells reading, not the tool. The tool comes via the first comment.

6. **First comment is the only place the link goes.** LinkedIn shadow-deboosts posts with external links in the body by ~40%. Putting the link in your own first comment recovers most of that.

7. **5 hashtags, all relevant.** More than 5 hashtags = spam signal. Fewer than 3 = no discoverability.

## Engagement playbook (first 2 hours after posting)

LinkedIn ranks heavily on first-2-hour engagement. Plan to be at your desk for 90 minutes after posting and:

1. **Reply to every comment within 10 minutes.** Even just "Thanks — yeah, the 127.0.0.1 one was the one that surprised me too." Each reply weights the post higher.
2. **DM 3–5 connections asking them to engage.** Not "please like my post" — instead, "Hey, I just posted about an audit I ran, would value your take on whether the platform-defaults framing is right." That's an authentic ask, and most people will respond.
3. **Don't repost / boost.** If it doesn't take off naturally in the first 2 hours, it won't take off paid. Leave it.

## Day-2 follow-up post

If the launch post does well (>500 reactions / >50 comments), post a follow-up the next morning:

```
Yesterday's post on the 10-app audit got [X] comments. Three
themes worth surfacing:

1. [Top theme from comments]
2. [Second theme]
3. [Third theme]

The [most-asked question] keeps coming up. My take: [your take].

What I'm working on next: [tease the 50-app dataset / new feature].
```

This rides the engagement wave for a second day and signals to LinkedIn's algo that you're a recurring author on this topic. Compounding distribution.

## Who to tag (carefully)

DO NOT tag Lovable, Bolt, or v0's official accounts in the body. They might respond defensively, which kills the post.

DO tag, IF you have warm relationships:
- Friends in dev advocacy roles at adjacent companies (Supabase, Cloudflare, Vercel)
- Other indie hackers who'd plausibly comment
- 1–2 senior engineers at a company you've consulted with

Cold-tagging strangers gets ignored. Warm-tagging known supporters gets you 3-5 substantive first-hour comments which is the algorithmic ignition you need.

## What NOT to put in the post

- Pricing. "$15 / $49" goes in the first comment, never the body. LinkedIn body = the story. Comment = the offer.
- Quotes from the audited apps. You haven't completed the 14-day disclosure window yet.
- Specific company names. Aggregated stats only until disclosure replies are in.
- Animations / GIFs. LinkedIn de-prioritizes posts with native videos vs static text+image. One screenshot at most.
