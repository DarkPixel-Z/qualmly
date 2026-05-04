# Launch-day visual assets

Screenshots captured **2026-05-04** for the **2026-05-05 (Tuesday) launch**. All hero shots are 2× retina (2560×1600 actual pixels, 1280×800 logical viewport). Social-card variants are already cropped to platform-correct dimensions.

## Which file to use where

### 🎯 The money shot — use this for Twitter, LinkedIn, blog OG card

**`2-results-card-*.png`** — matchwise.app scan with score 47, 2 passed / 1 warning / 2 failed, real-looking critical findings (Supabase service-role JWT in JS, sk_live_ Stripe key, admin RPCs callable from client). This is the screenshot that matches the dataset claim in the launch tweet.

| Where | File | Dimensions |
|---|---|---|
| **Twitter** (attached image on launch tweet) | `2-results-card-twitter.png` | 1200×675 |
| **LinkedIn** (only image on the long-form post) | `2-results-card-linkedin.png` | 1200×627 |
| **Reddit r/SideProject** (top-of-post image) | `2-results-card-twitter.png` | 1200×675 |
| **Show HN** (no inline image, but use this in any first-comment proof reply) | `2-results-card-twitter.png` | 1200×675 |
| **Blog post OG card** (already linked from Wix) | `2-results-card-linkedin.png` | 1200×627 |

### 🌟 Hero shots — supporting visuals

| File | When to use | Dimensions |
|---|---|---|
| **`1-landing-*.png`** — App QA mode, fresh state with hero "Every qualm, caught before prod" | Day-2 follow-up tweet about the free tier; "what is Qualmly" explainer comment | 1200×675 / 1200×627 / 1080×1080 / 640×360 |
| **`3-code-review-*.png`** — Code Review mode hero "Paste code. Get it fixed." | Reply to "does it scan code too?" questions; second-day LinkedIn post if the launch post pops | (same set) |
| **`4-monitor-pitch-*.png`** — Monitor mode pitch with "Catch regressions while you sleep" + 3-step explainer | Reply to "what's the Pro tier?"; Conner Ardman email; Cole Medin email; the v1.4-launch tweet thread reply about continuous monitoring | (same set) |
| **`5-monitor-dashboard-*.png`** — Active watches list (matchwise.app, growthbook-staging, demo.qualmly.dev) | Proof that the Pro tier ACTUALLY exists; reply to "is this just a landing page?"; second-week follow-up | (same set) |

### Thumbnail (Reddit / link previews)

The `*-thumb.png` files are 640×360 — sized for Reddit's link card thumbnail and Show HN's optional preview. Drop them in only if a platform asks for a smaller image; main posts use the full-size `-twitter` variant.

## Launch-day file checklist

When you sit down at 9 AM ET tomorrow, copy these 5 files to your phone / desktop / wherever you'll be posting from:

- ✅ `2-results-card-twitter.png` (the launch image — used 4× across Twitter/LinkedIn/Reddit/Show HN)
- ✅ `4-monitor-pitch-twitter.png` (for the v1.4 thread reply)
- ✅ `5-monitor-dashboard-twitter.png` (Conner / Cole emails as proof-of-product)
- ✅ `1-landing-square.png` (Instagram if you cross-post; nice for the LinkedIn "about" embed)
- ✅ `3-code-review-twitter.png` (have on hand for second-day repurposing)

## How these were generated (so future-you can re-run)

```bash
# From repo root
python -m http.server 8765 &              # serve qualmly.dev locally
node marketing/launch-assets/capture.mjs  # 5 hero shots via Playwright
cd marketing/launch-assets
python crop_for_social.py                 # 4 platform crops per hero
```

Both scripts are in this folder and self-documenting.

## Source-of-truth files (do not crop these directly)

- `1-landing.png` (1280×800 source)
- `2-results-card.png`
- `3-code-review.png`
- `4-monitor-pitch.png`
- `5-monitor-dashboard.png`

## Crop scheme

Each hero produces 4 platform variants:

| Suffix | Dimensions | Platform |
|---|---|---|
| `-twitter.png` | 1200×675 | Twitter `summary_large_image` card |
| `-linkedin.png` | 1200×627 | LinkedIn share-link preview |
| `-square.png` | 1080×1080 | Instagram, generic OG fallback |
| `-thumb.png` | 640×360 | Reddit thumbnail, Show HN preview |

All crops use a "cover" strategy (no letterboxing) with per-image vertical anchors so the most important part of each screen is visible in the cropped frame. See `crop_for_social.py` `ANCHOR_PRESETS` to tweak.

## Re-shoot scenarios

Re-run `capture.mjs` if any of these happen:
- The qualmly.dev branding / colors change
- The Monitor tab layout changes
- You add/remove a navbar tab (currently 3: App QA / Code Review / Monitor)
- The build version pill needs to update (current: v1.4.1)

Re-run `crop_for_social.py` (no recapture needed) if you adjust per-image anchors in the preset table.
