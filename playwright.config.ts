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
    // 127.0.0.1 is intentional — `localhost` resolves to ::1 (IPv6) first on
    // macOS, and Vite binds IPv4 only by default, so any other app already
    // listening on ::1:5173 wins the lookup race.
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:5173",
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // Auto-start the Vite dev server when no BASE_URL is provided.
  // Backend is now Supabase (managed) — no local API process to launch.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "deno task dev",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
        timeout: 30_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
    },
  ],
});
