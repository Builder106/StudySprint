import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
  features: "e2e/features/**/*.feature",
  steps: "e2e/steps/**/*.ts",
});

export default defineConfig({
  testDir,
  timeout: 30_000,
  fullyParallel: false,
  retries: 1,
  reporter: [["list"], ["./e2e/reporter.ts"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5173",
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // Auto-start dev servers when no BASE_URL is provided (i.e. running locally).
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
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
    },
  ],
});
