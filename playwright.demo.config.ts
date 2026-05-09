import "./e2e/setup/load-env";
import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

// Demo config — produces 4 narrative video walkthroughs for the README.
// Shares step definitions with the QA suite under e2e/steps/, plus demo-only
// steps under e2e/demo/steps/. Generated test files go to a separate
// .features-gen-demo so they don't collide with the QA `bddgen` output.
const testDir = defineBddConfig({
  features: "e2e/demo/features/**/*.feature",
  steps: ["e2e/steps/**/*.ts", "e2e/demo/steps/**/*.ts"],
  outputDir: ".features-gen-demo",
});

const slowMo = Number(process.env.DEMO_SLOWMO ?? 1200);

export default defineConfig({
  testDir,
  timeout: 180_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["./e2e/reporter.ts"]],
  use: {
    // See playwright.config.ts for why 127.0.0.1 instead of localhost.
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:5173",
    headless: true,
    viewport: { width: 1440, height: 900 },
    video: { mode: "on", size: { width: 1440, height: 900 } },
    launchOptions: { slowMo },
  },
  webServer: process.env.BASE_URL ? undefined : {
    command: "deno task dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        video: { mode: "on", size: { width: 1440, height: 900 } },
      },
    },
  ],
});
