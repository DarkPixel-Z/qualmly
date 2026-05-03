# Qualmly — Chrome Extension

One-click audit of the AI-built app you're currently looking at. Loads qualmly.dev in a new tab with the URL pre-filled.

## Status

**Working stub — needs icons, store assets, and Chrome Web Store submission to ship publicly.**

What's done:
- ✅ Manifest V3 with proper permissions (least privilege: `activeTab` + `scripting`)
- ✅ Popup UI matching Qualmly brand
- ✅ Keyboard shortcut `Ctrl+Shift+Q` (Cmd+Shift+Q on Mac)
- ✅ Right-click context menu ("Audit this page with Qualmly")
- ✅ Blocks `chrome://`, `file://`, and qualmly.dev itself from being audited
- ✅ UTM tagging so we can see Chrome-extension traffic separately in qualmly.dev analytics

What's NOT done (1–2 hours each, blocking publication):
1. **Icons** — need 16/32/48/128 PNG icons in `icons/`. Reuse `icon.svg` from the parent repo, render via Inkscape/ImageMagick.
2. **`?url=...` query param handling on qualmly.dev** — the extension passes URL as a query param. The qualmly.dev `index.html` needs to read this on load and pre-fill the URL input. ~10 lines of JS in DOMContentLoaded.
3. **`?mode=code` query param handling** — switch to Code Review mode if `mode=code`. ~3 lines.
4. **Chrome Web Store assets** — store listing image (1280×800), screenshot, description.
5. **Privacy policy URL** — Chrome Web Store requires one. Reuse `qualmly.dev/docs/PRIVACY.md` or create extension-specific.

## File layout

```
extensions/chrome/
├── manifest.json
├── popup/
│   ├── popup.html
│   └── popup.js
├── background/
│   └── service-worker.js
├── icons/
│   ├── icon-16.png   ← TODO
│   ├── icon-32.png   ← TODO
│   ├── icon-48.png   ← TODO
│   └── icon-128.png  ← TODO
└── README.md          ← this file
```

## Install for development (without Chrome Web Store)

1. Open `chrome://extensions` in Chrome
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extensions/chrome/` folder
5. Visit any URL → click the Qualmly icon → "Audit this tab"

(Will fail to load until you add the 4 icon PNGs. Workaround: comment out the `icons` block in `manifest.json` while developing.)

## Privacy

The extension reads the URL of the active tab when you click the icon (or trigger the keyboard shortcut, or right-click "Audit this page"). It opens a new tab to qualmly.dev with that URL as a query parameter. **It does not read page content, send anything to a server, or persist data.** All `activeTab` access is gated on user gesture per Chrome's manifest V3 rules.

## What it adds vs the existing flow

Without the extension: copy URL → open qualmly.dev → paste URL → click audit. ~15 seconds.
With the extension: hit `Ctrl+Shift+Q` (or click icon → Audit). ~1 second.

This collapses the moment-of-suspicion ("is this Lovable app safe?") into a single keystroke. That's the whole pitch.

## Publishing checklist

When ready to publish to the Chrome Web Store:

- [ ] Generate 4 icon PNGs from `icon.svg`
- [ ] Add `?url=` and `?mode=` handlers to qualmly.dev
- [ ] Bump version in `manifest.json` to `1.0.0`
- [ ] Zip the contents of `extensions/chrome/` (NOT the folder — the contents)
- [ ] Submit to https://chrome.google.com/webstore/devconsole
- [ ] $5 one-time developer registration fee
- [ ] Approval typically takes 1–3 business days
- [ ] Once published, update README.md in the parent repo with the install link
