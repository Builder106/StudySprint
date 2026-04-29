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
    baseURL: process.env.BASE_URL ?? "http://localhost:5173",
    headless: true,
    viewport: { width: 2560, height: 1600 },
    video: { mode: "on", size: { width: 2560, height: 1600 } },
    launchOptions: { slowMo },
  },
  webServer: process.env.BASE_URL
    ? undefined
    : [
        {
          command: "cd backend && npm run dev",
          url: "http://localhost:4000/api/auth/me",
          reuseExistingServer: true,
          timeout: 30_000,
        },
        {
          command: "npm run dev:frontend",
          url: "http://localhost:5173",
          reuseExistingServer: true,
          timeout: 30_000,
        },
      ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 2560, height: 1600 },
        video: { mode: "on", size: { width: 2560, height: 1600 } },
      },
    },
  ],
});
