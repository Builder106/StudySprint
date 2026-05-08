#!/usr/bin/env -S deno run -A
//
// Renders docs/social-card.html to docs/social-card.png at 1280×640.
// Drives Playwright's chromium binary (already installed for the e2e
// suite) so there's no extra browser to install.
//
// Upload the resulting PNG at:
//   https://github.com/Builder106/StudySprint/settings → Social preview

import { chromium } from "npm:playwright@1.59.1";
import { fromFileUrl, resolve } from "jsr:@std/path";

const repoRoot = fromFileUrl(new URL("..", import.meta.url));
const htmlPath = resolve(repoRoot, "docs/social-card.html");
const pngPath = resolve(repoRoot, "docs/social-card.png");

const browser = await chromium.launch({ headless: true });
try {
  // GitHub spec: 1280x640. DPR=1 gives a PNG that's exactly 1280x640
  // pixels — no downscaling on GitHub's side, no rounding artifacts.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 640 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`file://${htmlPath}`);
  // Wait for fonts to settle so the wordmark / tagline don't render mid-swap.
  await page.evaluate(() => document.fonts.ready);
  // Screenshot the viewport, not the .card element, so width/height match
  // the configured viewport exactly. (The card itself fills the viewport
  // because we removed the body padding in social-card.html.)
  await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: 1280, height: 640 } });
  console.log(`Wrote ${pngPath}`);
} finally {
  await browser.close();
}
