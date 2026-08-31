import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "@playwright/test";
import { buildDemoTitleCard } from "./demo-video-title-card.mjs";

const sourceCommit = "9f32dda65d8123f6f37a58fa869daef6340fd1be";

test("title cards are self-contained, dark and exact-release labelled", () => {
  const intro = buildDemoTitleCard({ kind: "intro", sourceCommit });
  const outro = buildDemoTitleCard({ kind: "outro", sourceCommit });
  assert.match(intro, /background: #070a08/u);
  assert.match(intro, /Proof before <span>permission\.<\/span>/u);
  assert.match(intro, /EXACT TESTNET BUILD&nbsp; 9f32dda6/u);
  assert.match(intro, /CHAIN 97 \/ NO MAINNET/u);
  assert.match(outro, /Hire agents by proof, not <span>promises\.<\/span>/u);
  assert.match(outro, /PROOFERA\.TANGVU\.DEV/u);
  assert.doesNotMatch(`${intro}${outro}`, /https?:\/\//u);
});

test("intro renders at the final viewport without a white opening frame", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      colorScheme: "dark",
      viewport: { height: 900, width: 1440 }
    });
    await page.setContent(buildDemoTitleCard({ kind: "intro", sourceCommit }));
    await page.waitForTimeout(2_800);
    const rendered = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const heading = document.querySelector("h1")?.getBoundingClientRect();
      return {
        backgroundColor: body.backgroundColor,
        headingHeight: heading?.height ?? 0,
        titleCard: document.querySelector('[data-proofera-title-card="intro"]') !== null,
        viewport: [window.innerWidth, window.innerHeight]
      };
    });
    assert.deepEqual(rendered.viewport, [1440, 900]);
    assert.equal(rendered.backgroundColor, "rgb(7, 10, 8)");
    assert.equal(rendered.titleCard, true);
    assert.ok(rendered.headingHeight > 100);
    const screenshot = await page.screenshot({ type: "png" });
    assert.ok(screenshot.length > 50_000);
    if (process.env.PROOFERA_TITLE_PREVIEW_PATH) {
      await writeFile(process.env.PROOFERA_TITLE_PREVIEW_PATH, screenshot, { flag: "wx" });
    }
  } finally {
    await browser.close();
  }
});

test("title card rejects unbounded kind or release input", () => {
  assert.throws(
    () => buildDemoTitleCard({ kind: "intro", sourceCommit: "HEAD" }),
    /DEMO_TITLE_CARD_INPUT_INVALID/u
  );
  assert.throws(
    () => buildDemoTitleCard({ kind: "unknown", sourceCommit }),
    /DEMO_TITLE_CARD_INPUT_INVALID/u
  );
});
