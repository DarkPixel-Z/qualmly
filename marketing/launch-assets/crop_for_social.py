"""Crop the captured hero screenshots to social-media card dimensions.

For each <n>-<name>.png in this folder, produce:
  - <n>-<name>-twitter.png    1200x675   (Twitter summary_large_image)
  - <n>-<name>-linkedin.png   1200x627   (LinkedIn share card)
  - <n>-<name>-square.png     1080x1080  (Instagram / generic square)
  - <n>-<name>-thumb.png      640x360    (Reddit thumbnail / Show HN preview)

Strategy ("cover" — fills the target frame, may crop edges):
  - Scale source so its WIDTH matches target width
  - Vertically anchor the crop based on per-image preset:
      "top"    — keep the top of the source visible (good for hero shots)
      "head"   — keep ~top-third visible (good for hero with content below)
      "center" — middle-anchored crop (good for results card)
"""
from PIL import Image
from pathlib import Path

HERE = Path(__file__).parent
SOURCES = sorted(HERE.glob("[1-9]-*.png"))

# Vertical anchor for each source image's crop.
# 0.0 = align top of source to top of target
# 0.5 = center align
# 1.0 = align bottom of source to bottom of target
ANCHOR_PRESETS = {
    "1-landing.png":            0.18,  # show navbar + headline + a bit of form
    "2-results-card.png":       0.10,  # show navbar + score + ALL findings
    "3-code-review.png":        0.20,
    "4-monitor-pitch.png":      0.15,  # navbar + headline + 3-step explainer
    "5-monitor-dashboard.png":  0.20,  # dashboard card is now the focal point
}

TARGETS = [
    (1200, 675, "twitter"),
    (1200, 627, "linkedin"),
    (1080, 1080, "square"),
    (640, 360, "thumb"),
]

def cover_crop(img, target_w, target_h, vertical_anchor=0.5):
    """Cover-fit: scale source so it fills target, crop the overflow.

    vertical_anchor: 0.0..1.0, where to anchor the crop on the y-axis.
    """
    sw, sh = img.size
    src_aspect = sw / sh
    tgt_aspect = target_w / target_h

    if src_aspect > tgt_aspect:
        # Source is wider — fit by height, crop sides
        scale = target_h / sh
        new_w = int(sw * scale)
        new_h = target_h
        scaled = img.resize((new_w, new_h), Image.LANCZOS)
        # Center-crop horizontally
        x_off = (new_w - target_w) // 2
        return scaled.crop((x_off, 0, x_off + target_w, target_h))
    else:
        # Source is taller — fit by width, crop top/bottom
        scale = target_w / sw
        new_w = target_w
        new_h = int(sh * scale)
        scaled = img.resize((new_w, new_h), Image.LANCZOS)
        # Anchor-driven vertical crop
        max_y_off = new_h - target_h
        y_off = int(max_y_off * vertical_anchor)
        return scaled.crop((0, y_off, target_w, y_off + target_h))

def main():
    for src_path in SOURCES:
        name = src_path.name
        if name not in ANCHOR_PRESETS:
            print(f"  skip {name}: no preset")
            continue
        anchor = ANCHOR_PRESETS[name]
        with Image.open(src_path) as img:
            # Convert to RGB (some are RGBA after Playwright)
            if img.mode != "RGB":
                bg = Image.new("RGB", img.size, (14, 14, 21))
                bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                img = bg
            stem = src_path.stem
            for target_w, target_h, suffix in TARGETS:
                out = HERE / f"{stem}-{suffix}.png"
                cropped = cover_crop(img, target_w, target_h, anchor)
                cropped.save(out, "PNG", optimize=True)
                print(f"  wrote {out.name} ({target_w}x{target_h})")

    print("\nOK")

if __name__ == "__main__":
    main()
