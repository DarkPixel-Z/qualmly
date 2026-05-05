// Diagnose mobile horizontal overflow — focus on Hero specifically.
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();

await page.goto("https://qualmly.dev/?mode=monitor&_cb=" + Date.now(), { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof switchMode === "function", null, { timeout: 15000 });
await page.waitForTimeout(800);

// Outline EVERY element that has scrollWidth > clientWidth (= an overflowing
// element) so we can see them in a screenshot. Using the chrome devtools
// "show overflowing elements" trick.
await page.addStyleTag({ content: `
  *.__overflow-hl { outline: 2px solid red !important; outline-offset: -2px !important; }
` });
await page.evaluate(() => {
  for (const el of document.querySelectorAll("*")) {
    if (el.scrollWidth - el.clientWidth > 5) {
      el.classList.add("__overflow-hl");
    }
  }
});
await page.screenshot({ path: "C:/Users/angya/OneDrive/Desktop/tech/vqr-work/marketing/launch-assets/.deep-check-shots/mobile-overflow-highlight.png", fullPage: true });
console.log("Screenshot saved with red outlines on overflowing elements\n");


// Drill into the Monitor hero
const data = await page.evaluate(() => {
  const hero = document.querySelector("#monitor-screen .hero");
  if (!hero) return null;
  const heroRect = hero.getBoundingClientRect();
  const allDescendants = [];
  for (const el of hero.querySelectorAll("*")) {
    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    allDescendants.push({
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      cls: (el.className || "").toString(),
      scrollW: el.scrollWidth,
      offsetW: el.offsetWidth,
      rectLeft: Math.round(rect.left),
      rectRight: Math.round(rect.right),
      rectWidth: Math.round(rect.width),
      whitespace: cs.whiteSpace,
      wordBreak: cs.wordBreak,
      display: cs.display,
      letterSpacing: cs.letterSpacing,
      fontSize: cs.fontSize,
      text: (el.textContent || "").trim().slice(0, 50),
    });
  }
  return {
    bodyW: document.body.scrollWidth,
    heroScrollW: hero.scrollWidth,
    heroOffsetW: hero.offsetWidth,
    heroLeft: Math.round(heroRect.left),
    heroRight: Math.round(heroRect.right),
    descendants: allDescendants
  };
});

console.log(`Body scrollWidth: ${data.bodyW}`);
console.log(`Hero: scrollW=${data.heroScrollW} offsetW=${data.heroOffsetW} left=${data.heroLeft} right=${data.heroRight}\n`);
console.log("Descendants:");
for (const d of data.descendants) {
  const overflow = d.rectRight > 375 ? " ← OVERFLOWS" : "";
  console.log(`  <${d.tag}.${d.cls.split(" ")[0] || "_"}> rect=[${d.rectLeft}..${d.rectRight}] (${d.rectWidth}px) scrollW=${d.scrollW} fs=${d.fontSize} ls=${d.letterSpacing} ws=${d.whitespace}${overflow}`);
  console.log(`     "${d.text}"`);
}

await browser.close();
