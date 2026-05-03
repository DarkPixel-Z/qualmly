# Launch posts — strategy & sequencing

## The bigger picture

You have **one shot per audience**. If Show HN doesn't take off, you can't re-submit the same URL. Reddit will downvote a re-skinned tool launch. LinkedIn won't penalize a second post but feed-saturation will kill reach.

So the order matters. **Stagger the launches** to maximize each platform's first-touch impact, and **let the Wix blog post do the work in the background** for organic search.

## Recommended sequence

| Day | Channel | Post | Why this order |
|---|---|---|---|
| **0 (today)** | DarkPixel Wix blog | Audit blog post goes live | Anchors all the other links. Has to exist before any social post links to it. |
| **0** | Send 6 disclosure emails | All same day | Starts the 14-day clock so Day 14 has something to land on. |
| **1** | Theo X DM | `theo-draft.md` Draft 1 | One human-curated relationship attempt before the broadcast. |
| **2** | LinkedIn | `linkedin.md` post + first comment | LinkedIn audience converts best on weekdays. Tuesday best, Wednesday close second. |
| **3** | Show HN | `show-hn.md` body | HN traffic peaks Tue/Wed 9–10:30 AM ET. Aim for that window. |
| **3** | r/SideProject (concurrent with HN) | `reddit-webdev.md` Version 2 | r/SideProject is the safe Reddit target. Welcomes self-promo. |
| **4–5** | r/webdev or skip | `reddit-webdev.md` Version 1 | ONLY if no recent self-promo flag in the last 30 days. Otherwise skip. |
| **7–10** | Jack Herrington email | `jack-draft.md` | After the post has had a week to compound; reference HN/Reddit traction. |
| **14** | Disclosure window closes | Edit blog post with named case studies if any | Drives a second wave of traffic when published. |
| **14–21** | Fireship content form | `fireship-draft.md` | Only if Theo or Jack covered. Needs social proof to land. |
| **14–28** | Chrome extension goes live | Web Store submission cleared after D-U-N-S verification | Standalone "Qualmly is now in your address bar — `Ctrl+Shift+Q` from any tab" announcement. Tweet, LinkedIn, dev.to, repost on r/SideProject. Second viral wave — AND riding any momentum from Day 1's launch. |
| **30** | Follow-up blog post | "30 days after the audit: what changed" | Re-energizes the campaign for a second wave. Combines disclosure-response stats + Chrome extension launch + any media coverage. |

## What success looks like at each tier

**HN — best to worst:**
- Front page, 200+ points, 100+ comments → 5,000-15,000 unique visits, 30-100 paid conversions in week 1
- Front page, 80-200 points → 1,500-5,000 visits, 10-30 conversions
- Off front page within 1 hour → 100-400 visits, 1-3 conversions
- Flagged / killed → 0-20 visits

**LinkedIn — best to worst:**
- 5,000+ reactions, 200+ comments → 800-2,000 profile views, 200-500 site clicks, 5-15 conversions
- 1,000-5,000 reactions → 200-800 profile views, 50-200 site clicks
- <500 reactions → quiet, but still useful for SEO + trust signal

**Reddit — best to worst:**
- r/SideProject top 5 of the day → 800-2,500 visits, 5-20 conversions
- r/SideProject mid-page → 200-500 visits
- r/webdev front page (long-shot) → 3,000-8,000 visits
- r/webdev removed by mods → 0 visits + bad rep

## Platform-by-platform "what to do if it bombs"

**HN bombs:**
1. Wait 7 days.
2. Re-submit with a NEW URL (not the same writeup) — e.g. a follow-up post, or qualmly.dev directly, or the disclosure-results post.
3. Different angle in the body — e.g. lead with "I built X and learned Y," not the dataset.
4. If the second submission also bombs, accept HN isn't the channel and focus elsewhere.

**LinkedIn bombs:**
1. Don't repost. LinkedIn punishes duplicate-content.
2. Wait 5–7 days.
3. Post a different angle: behind-the-scenes of building Qualmly, or a single specific finding ("the 127.0.0.1 in production story") as a standalone.
4. Comment heavily on other people's posts in adjacent topics for 1–2 weeks to rebuild reach before posting again.

**r/SideProject bombs:**
1. r/SideProject doesn't really "bomb" — it just gets quiet.
2. Cross-post to r/SaaS, r/indiehackers (off-Reddit), and r/webdev (only if safe).
3. If multiple subreddits are dead: the angle is wrong. Iterate the title before iterating the body.

## What to NOT do

- **Don't post to all 4 channels in the same hour.** You'll exhaust your engagement-window-to-self-engage capacity. Spread across days.
- **Don't link multiple platforms to each other in the body.** "Also see my HN post" reads as desperate. Each platform stands alone.
- **Don't run paid ads against the launch in week 1.** Paid traffic dilutes organic ranking signals on every platform. Wait for 2 weeks of organic data first.
- **Don't post during major news events.** If a tech CEO has just been fired or a Cloudflare outage is happening, your post will be invisible. Push back 24 hours.

## Data to track per channel

For each post, track in a single Google Sheet (or `marketing/launch-results.csv`):

| Channel | Posted | URL | Score/Reactions | Comments | Replies sent | Direct site clicks | Gumroad conversions |
|---|---|---|---|---|---|---|---|

After 30 days you'll know which channel converts best per dollar of effort. That informs the next launch.

## Files in this folder

- `_post-strategy.md` — this file
- `show-hn.md` — Show HN body, title, posting playbook, anticipated Q&A
- `reddit-webdev.md` — TWO versions: discussion-led (r/webdev safe) and build-led (r/SideProject)
- `linkedin.md` — LinkedIn post body, first-comment link, engagement playbook, day-2 follow-up template
