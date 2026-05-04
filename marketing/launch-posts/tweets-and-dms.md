# Tweets + DMs + Outreach emails — copy-paste ready for Tuesday

All copy below is launch-day ready. Drop into the relevant text field, hit send. No editing required — but tighten if your gut says so.

---

# Twitter / X — primary launch tweet (9:45 AM ET)

**Image to attach:** screenshot of qualmly.dev with the App QA scan results card showing a real Stripe-key finding (lime gradient + dark UI). Crop to 1200×675 (Twitter card aspect).

```
I scanned 10 vibe-coded apps and found:

• 9/10 ship Supabase creds in JS
• 0/10 set a CSP header
• 1/10 ships sk_live_ as placeholder text
• 1/10 ships 127.0.0.1 to prod

I built a free 30-second auditor for Lovable / Bolt / v0 apps.

qualmly.dev — drop a URL, see the qualms.
```

**Why this shape:** Hook is concrete data, not a tagline. Specific numbers = credibility. Mentions the platforms by name (the keyword everyone searches). Soft tool plug at the end. Under 280.

---

# Twitter / X — follow-up reply chain (post within 60 seconds of the parent)

Reply 1 of 4 (in the thread):

```
The full audit + methodology + 6-fix list:
darkpixelconsultinginc.co/blog/10-vibe-coded-apps-audit

Disclosed to all 10 app owners 14 days ago. Aggregate stats only.
```

Reply 2 of 4:

```
Three flavors, all BYOK Anthropic:

→ Browser tool: qualmly.dev (free, ~$0.03/scan of your key)
→ GitHub Action: runs on every PR (free)
   github.com/marketplace/actions/qualmly-audit
→ Python CLI: APK / IPA scanner (free)
   pip install qualmly-mobile
```

Reply 3 of 4:

```
And as of today: continuous monitoring.

Drop a URL once, get a weekly rescan diff in your inbox when
something new breaks.

$99/yr per app. We make money on the slot — you make money on
the catches.
```

Reply 4 of 4 (the open question — drives replies):

```
Honest question for builders here: what's the one Lovable / Bolt /
v0 default that, if it changed, would meaningfully cut the leak
rate?

CSP on by default? RLS pgTAP tests? "Don't ship `_live_` keys"
linting? Genuinely curious which moves the needle.
```

---

# Twitter / X — second-day post (Wed morning)

Only post if the launch tweet got >100 likes / >20 replies. Otherwise skip.

```
Yesterday I posted findings from a 10-app vibe-code audit.
It hit [N] views / [N] replies.

The 3 themes that came up most:

1. "Lovable already does X" — yes, but only on new projects since
   April. Older projects don't auto-migrate.

2. "Why not just generate the RLS?" — see thread for the
   pgTAP-test angle. The TL;DR: scaffolding without verification
   is theater.

3. "Are you running this on banks?" — out of scope. The audit
   targeted publicly-listed showcase apps. Don't run Qualmly on
   anything you don't own.

Continuing to scan more apps. Numbers will be a 50-app dataset
in 2 weeks.
```

---

# Riley Brown DM (X) — 10:00 AM ET

Riley posts a lot about Lovable / Bolt; high signal. ONE attempt, conversational, no pitch.

```
Hey Riley — saw your post on the [recent Lovable thing]. I just
ran a security/QA audit on 10 apps from the Lovable + Bolt
showcases and the results lined up scarily close to what you
said — 9/10 ship Supabase creds, 0/10 have CSP set.

Wrote it up here if it's useful for the next deep-dive:
darkpixelconsultinginc.co/blog/10-vibe-coded-apps-audit

Tool I used is free / BYOK / open source — qualmly.dev. Not
asking for anything specific, just thought you'd find the
dataset interesting given how much you cover this space.

Cheers, Amanda
```

**If they reply:** offer the raw 47-app dataset (the bigger one we'll publish in 2 weeks) as a scoop in exchange for a mention. Don't lead with that — lead with the gift.

---

# Conner Ardman email — 10:30 AM ET

Conner runs a YT channel that covers AI dev tooling. Email > DM for him.

```
Subject: Audit data on 10 vibe-coded apps — useful for a video?

Hi Conner,

Big fan of your AI tooling videos. I just shipped an audit on 10
apps built with Lovable, Bolt, and v0. Findings:

• 9/10 expose Supabase creds in their JS bundle
• 0/10 set a Content-Security-Policy header
• 1/10 shipped sk_live_ as UI placeholder text
• 1/10 shipped 127.0.0.1 to production

Full writeup with methodology:
https://www.darkpixelconsultinginc.co/blog/10-vibe-coded-apps-audit

If you're considering a "should I trust vibe-coded apps in
prod?" video, happy to give you (a) the raw dataset, (b) a
pre-launch demo of the tool I built (qualmly.dev — BYOK, free),
and (c) an interview if useful.

No expectations either way — just figured a security-flavored
counterpoint to the usual "Lovable is amazing!" hype might be
fresh content.

Cheers,
Amanda
DarkPixel Consulting
```

---

# Cole Medin email — 11:00 AM ET

Cole's audience overlaps with the "AI agents in production" segment — perfect Monitor target.

```
Subject: Continuous security rescans for AI-built apps — built it after the n8n thread

Hi Cole,

Loved the recent agent-architecture series. One thread you raised
that I've been chewing on: how do you keep an AI-built app secure
*after* the initial deploy, when the LLM keeps writing new
endpoints?

I just shipped a tool that does exactly that — drop a URL, get
a weekly rescan diff in your inbox when something new breaks.
$99/yr per app, BYOK Anthropic so the rescan cost is your
~$0.03/week off your own credit.

qualmly.dev — Monitor tab.

Free tier still does the one-shot audit. The $99/yr is for the
"set and forget" recurring crowd, which I think is your audience.

Happy to walk through the architecture if useful for a video —
it's a Cloudflare Worker + KV + AES-GCM keys + a cron, all
open source.

Cheers,
Amanda
```

---

# AI Jason DM (X) — 11:15 AM ET

AI Jason covers indie AI tools. Lower priority than Riley/Conner; warm only.

```
Hey Jason — built a security/QA scanner for vibe-coded apps:
qualmly.dev

Free tier, BYOK, open source. Just shipped a continuous-monitoring
tier today ($99/yr, weekly rescans by email). Thought it might
fit your indie-AI roundup.

If interesting, happy to do a 5-min demo. If not, no worries —
just wanted to put it on your radar.
```

---

# r/SideProject — 10:15 AM ET

Title:
```
[Show & Tell] Built a 30-sec security scanner for vibe-coded apps after the Lovable incident — scanned 10, wrote up findings
```

Body:
```
Hey r/SideProject,

For the last 6 months I've been cleaning up Lovable / Bolt / v0
apps as a consulting service, and the same 3 issues kept showing
up. Wanted to know if it was systemic or just my client base, so
I scanned 10 publicly-listed showcase apps.

Findings (passive recon only, no active probing):

• 9/10 ship Supabase project URL + anon key in their JS bundle
• 0/10 set a Content-Security-Policy header
• 3/10 call admin RPC functions directly from the client
• 1/10 ships 127.0.0.1 to production
• 1/10 ships fake `sk_live_` keys as UI placeholder text

Full methodology + 6-fix list:
darkpixelconsultinginc.co/blog/10-vibe-coded-apps-audit

Built a tool while I was at it — qualmly.dev. Single HTML file,
vanilla JS, BYOK Anthropic API key (~$0.03/scan). Free tier
forever. Open source: github.com/DarkPixel-Z/qualmly

Also distributed as:
• GitHub Action (PR auditing) — free
• Python CLI for APK/IPA scanning — `pip install qualmly-mobile`
• Continuous monitoring (weekly rescans by email) — $99/yr per app

What I'd love feedback on:
1. Is the 30-sec one-shot scan the right primary surface, or
   should it default to the continuous-monitoring tab?
2. The "BYOK so the per-scan cost is on your credit, not mine"
   model — does that read as cheap or as a feature?

Roast / ideas / "you missed X" comments welcome.

Disclosure: this is mine. The $99/yr Pro tier and $15 commercial
license are how I make money on it. The browser tool, the
GitHub Action, and the Python CLI are all genuinely free
forever.
```

**Posting rule:** r/SideProject welcomes "I built X with [details]" but DEMANDS the details. Generic launches get downvoted. The findings list IS the details.

---

# Day-1 cheat sheet timing recap

| Time (ET) | Channel | What to send | File |
|---|---|---|---|
| 9:00 | Wix blog | Audit post | DAY-1-CHEATSHEET.md §9:00 |
| 9:15 | 6 disclosure emails | One per audited app | DAY-1-CHEATSHEET.md §9:15 |
| 9:30 | LinkedIn | Long-form post + first comment | linkedin.md |
| 9:45 | Twitter/X | Tweet + 4-reply thread | tweets-and-dms.md §Twitter |
| 10:00 | Show HN | Submission + body comment | show-hn.md |
| 10:15 | r/SideProject | Title + body | tweets-and-dms.md §SideProject |
| 10:30 | Riley DM | X DM | tweets-and-dms.md §Riley |
| 11:00 | Conner email | Long-form email | tweets-and-dms.md §Conner |
| 11:15 | AI Jason DM | Short DM | tweets-and-dms.md §AI-Jason |
| 12:00 | Cole email | Long-form Monitor-focused email | tweets-and-dms.md §Cole |
| 1:00 PM | LUNCH. Touch nothing. | The first 2-hour window is over. | — |

After 1:00 PM, the algorithms have decided. Reply to comments for the rest of the day, but DON'T post anything new.

---

# What goes on the qualmly.dev landing page itself

Make sure these 3 are visible above the fold by tomorrow:

1. **Pricing strip** at the top: `Free forever for 1-shot audits · $99/yr for weekly rescans · BYOK Anthropic` (no scary pricing wall)
2. **Three buttons** (App QA / Code Review / Monitor) — already shipped in v1.4
3. **Demo button** — loads a hardcoded example report so first-time visitors see the output before grabbing a key

If the v1.4 build doesn't already have a banner mentioning the GitHub Action + PyPI distribution, add a small one-liner: *"Also available as a GitHub Action and Python CLI — same scanner, three surfaces."*
