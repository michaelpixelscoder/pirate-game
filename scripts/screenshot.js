/**
 * Headless screenshot script for pirate-game.
 * Requires the dev server running at http://127.0.0.1:5175/pirate-game/
 * or pass a custom base URL via the BASE_URL env var.
 *
 * Usage:
 *   node scripts/screenshot.js
 *   BASE_URL=http://127.0.0.1:5175 node scripts/screenshot.js
 *
 * Produces:
 *   screenshots/island-top.png    — top-down view of the island
 *   screenshots/island-wide.png   — wide angled view of the island
 */

import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "screenshots");

const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:5175") + "/pirate-game/";

/** How many animation frames to wait for the scene to fully render */
const SETTLE_FRAMES = 180;
const VIEWPORT = { width: 1920, height: 1080 };

const SHOTS = [
  {
    name: "island-top",
    params: "x=0&y=90&z=0&yaw=0&pitch=-1.45&hideUI",
    description: "Top-down view",
  },
  {
    name: "island-wide",
    params: "x=-60&y=40&z=-60&yaw=0.8&pitch=-0.5&hideUI",
    description: "Wide angled view",
  },
];

async function waitForFrames(page, count) {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let remaining = n;
        function tick() {
          if (--remaining <= 0) resolve();
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
    count
  );
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });

  for (const shot of SHOTS) {
    const url = `${BASE_URL}?${shot.params}`;
    console.log(`Capturing ${shot.description} → ${shot.name}.png`);
    console.log(`  URL: ${url}`);

    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait for the canvas to appear
    await page.waitForSelector("canvas", { timeout: 15000 });

    // Let the scene render for several frames
    await waitForFrames(page, SETTLE_FRAMES);

    const outPath = path.join(outDir, `${shot.name}.png`);
    await page.screenshot({ path: outPath, type: "png" });
    console.log(`  Saved: ${outPath}`);

    await page.close();
  }

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
