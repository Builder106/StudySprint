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
  const context = await browser.newContext({
    viewport: { width: 1280, height: 640 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(`file://${htmlPath}`);
  // Wait for fonts to settle so the wordmark / tagline don't render mid-swap.
  await page.evaluate(() => document.fonts.ready);
  const card = page.locator(".card");
  await card.screenshot({ path: pngPath });
  console.log(`Wrote ${pngPath}`);
} finally {
  await browser.close();
}
