import { createBdd } from "playwright-bdd";
import type { Page } from "@playwright/test";

const { Before, After } = createBdd();

// Dwell helper for demo recordings. slowMo delays between Playwright *actions*
// (click, fill) but not between assertions or after page.goto(), so any step
// that ends in a "thing just appeared" assertion needs an explicit pause to
// give the viewer time to register the new state. No-op outside DEMO mode.
export const DEMO_DWELL_MS = Number(process.env.DEMO_DWELL_MS ?? 1500);
export async function dwellForDemo(page: Page, ms: number = DEMO_DWELL_MS) {
  if (process.env.DEMO !== "1") return;
  try {
    await page.waitForTimeout(ms);
  } catch {
    // page may be closed mid-scenario
  }
}

// In DEMO mode the recorded videos double as feature demos. Hold the final
// frame for ~1.5s so the end-state of each scenario reads as a still, not a
// blink-and-miss-it cut. No-op for normal CI runs.
const DEMO_TAIL_MS = Number(process.env.DEMO_TAIL_MS ?? 1500);

// Fake cursor injected into every page in DEMO mode. Playwright drives real
// mousemove events on the page during clicks/hovers, so a CSS-positioned dot
// listening to those events traces the same path the test takes — giving the
// viewer a focal point that browser headless mode otherwise hides.
const CURSOR_SCRIPT = `
  (() => {
    if (window.__demoCursorInstalled) return;
    window.__demoCursorInstalled = true;
    const install = () => {
      const dot = document.createElement('div');
      dot.id = '__demoCursor';
      dot.style.cssText = [
        'position:fixed',
        'top:0','left:0',
        'width:18px','height:18px',
        'border-radius:50%',
        'background:rgba(204,255,0,0.95)',
        'border:2px solid rgba(0,0,0,0.85)',
        'box-shadow:0 0 12px rgba(204,255,0,0.6)',
        'pointer-events:none',
        'z-index:2147483647',
        'transform:translate(-50%,-50%)',
        'transition:transform 80ms ease-out',
      ].join(';');
      document.body.appendChild(dot);
      const move = (e) => {
        dot.style.left = e.clientX + 'px';
        dot.style.top = e.clientY + 'px';
      };
      const click = () => {
        dot.style.transform = 'translate(-50%,-50%) scale(1.6)';
        setTimeout(() => { dot.style.transform = 'translate(-50%,-50%)'; }, 180);
      };
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mousedown', click, true);
    };
    if (document.body) install();
    else document.addEventListener('DOMContentLoaded', install);
  })();
`;

// Per-character keystroke delay for fill() calls in DEMO mode.
const DEMO_TYPE_DELAY = Number(process.env.DEMO_TYPE_DELAY ?? 70);

// CSS-level page zoom in DEMO mode. 1.0 = native, 1.25 = 25% bigger.
// Keeps the 2560×1600 frame sharp while making UI feel "filmed close".
const DEMO_ZOOM = Number(process.env.DEMO_ZOOM ?? 1.3);

// Zoom the html element AND counter-scale anything sized in viewport units
// so the visual page height stays exactly one viewport. Without this, a
// 'min-h-screen' container at zoom 1.3 renders at 130vh and pushes centered
// content out of frame.
const ZOOM_SCRIPT = `
  (() => {
    if (window.__demoZoomInstalled) return;
    window.__demoZoomInstalled = true;
    const apply = () => {
      const z = ${DEMO_ZOOM};
      const inv = (1 / z) * 100;
      const style = document.createElement('style');
      style.textContent = [
        'html { zoom: ' + z + '; }',
        '.min-h-screen { min-height: ' + inv + 'vh !important; }',
        '.h-screen { height: ' + inv + 'vh !important; }',
      ].join(' ');
      document.head.appendChild(style);
    };
    if (document.head) apply();
    else document.addEventListener('DOMContentLoaded', apply);
  })();
`;

// Pin html/body to a dark background and pre-seed next-themes to dark before
// React mounts. Without this, every page.goto() flashes browser-default white
// for a frame before the dark theme class is applied — visible in recordings.
const DARK_BG_SCRIPT = `
  (() => {
    try { localStorage.setItem('theme', 'dark'); } catch (_) {}
    const apply = () => {
      const style = document.createElement('style');
      style.textContent = 'html, body { background: #0a0a0a !important; color-scheme: dark; }';
      (document.head || document.documentElement).appendChild(style);
      if (document.documentElement) document.documentElement.classList.add('dark');
    };
    apply();
  })();
`;

// Worker-scoped flag — Locator.prototype is shared, so we only patch once.
let locatorFillPatched = false;

Before(async ({ page }) => {
  if (process.env.DEMO !== "1") return;
  // Re-inject on every navigation so the cursor + zoom + dark bg survive route changes.
  await page.addInitScript(DARK_BG_SCRIPT);
  await page.addInitScript(CURSOR_SCRIPT);
  if (DEMO_ZOOM !== 1) await page.addInitScript(ZOOM_SCRIPT);

  if (!locatorFillPatched) {
    const sampleLocator = page.locator("body");
    const proto = Object.getPrototypeOf(sampleLocator);
    const originalFill = proto.fill;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    proto.fill = async function (value: string, options?: any) {
      await originalFill.call(this, "", options);
      if (value) await this.pressSequentially(value, { delay: DEMO_TYPE_DELAY });
    };
    locatorFillPatched = true;
  }
});

After(async ({ page }) => {
  if (process.env.DEMO !== "1") return;
  try {
    await page.waitForTimeout(DEMO_TAIL_MS);
  } catch {
    // page may already be closed if the scenario errored
  }
});
