import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";

const { Given, When, Then } = createBdd();

Given("I am on the StudySprint home page", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

When("I navigate to the registration page", async ({ page }) => {
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
});

When(
  "I enter the email {string} and password {string}",
  async ({ page }, email: string, password: string) => {
    // DEMO mode re-runs against deterministic literals (e.g. example@example.com)
    // so the recorded video shows the same email every take. Supabase rejects
    // the second signup with "User already registered" — wipe the user via
    // service-role admin first so registration succeeds fresh on every run.
    // Skipped silently if SUPABASE_SECRET_KEY isn't available.
    //
    // QA runs use a timestamp-suffixed `demo_signup_<ts>@studysprint.app` so
    // re-runs don't collide; the globalTeardown sweeps those after the suite.
    let uniqueEmail = email;
    if (email.startsWith("demo_signup")) {
      uniqueEmail = email.replace("@", `_${Date.now()}@`);
    } else if (process.env.DEMO === "1") {
      await wipeUserByEmail(email);
    }
    await page.fill('input[type="email"]', uniqueEmail);
    await page.fill('input[type="password"]', password);
  },
);

async function wipeUserByEmail(email: string): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    console.warn(`[demo] wipeUserByEmail(${email}): SUPABASE_SECRET_KEY missing, skipping`);
    return;
  }

  const headers = { apikey: secret, Authorization: `Bearer ${secret}` };
  const target = email.toLowerCase();

  // The Supabase admin /users endpoint doesn't support a server-side email
  // filter — paginate through everything and match locally. 200 per page is
  // the documented max; for a project with <200 users this is one round-trip.
  for (let page = 1; page < 20; page++) {
    const list = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    if (!list.ok) {
      console.warn(`[demo] listUsers page=${page} ${list.status}: ${await list.text()}`);
      return;
    }
    const data = (await list.json()) as {
      users?: Array<{ id: string; email?: string | null }>;
    };
    const users = data.users ?? [];
    for (const u of users) {
      if (u.email?.toLowerCase() !== target) continue;
      const del = await fetch(`${url}/auth/v1/admin/users/${u.id}`, {
        method: "DELETE",
        headers,
      });
      if (!del.ok) {
        console.warn(`[demo] deleteUser ${u.id} ${del.status}: ${await del.text()}`);
      }
    }
    if (users.length < 200) break; // last page
  }
}

When("I submit the registration form", async ({ page }) => {
  await page.click('button[type="submit"]');
});

Then("I should be redirected to the dashboard", async ({ page }) => {
  // Race the redirect against the alert div so a rejected sign-in/up
  // surfaces its actual error text instead of a 10s navigation timeout.
  const error = page.locator('[role="alert"]');
  await Promise.race([
    page.waitForURL("**/dashboard", { timeout: 10_000 }),
    error.waitFor({ state: "visible", timeout: 10_000 }).then(async () => {
      const msg = (await error.textContent())?.trim() ?? "(no message)";
      throw new Error(`Auth failed before dashboard redirect: ${msg}`);
    }),
  ]);
  expect(page.url()).toContain("/dashboard");
});

Then("I should see my study goals listed", async ({ page }) => {
  await expect(page.locator("main")).toBeVisible();
});

Then("I should see the error {string}", async ({ page }, message: string) => {
  await expect(page.locator('[role="alert"]')).toContainText(message);
});

Then("I should remain on the registration page", async ({ page }) => {
  expect(page.url()).toContain("/register");
});

Given(
  "a registered account with email {string} and password {string}",
  async ({}, _email: string, _password: string) => {
    // The shared test account must exist in Supabase Auth before the suite
    // runs — see CONTRIBUTING.md "Test fixtures" for the bootstrap script.
    // No-op in-test; just a documentation hook for the .feature file.
  },
);

When(
  "I enter the email {string} and password {string} on the login form",
  async ({ page }, email: string, password: string) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
  },
);

When("I click Sign in", async ({ page }) => {
  await page.click('button[type="submit"]');
});

Then("I should see an error message on the login page", async ({ page }) => {
  await expect(page.locator('[role="alert"]')).toBeVisible();
});

Then("I should remain on the home page", async ({ page }) => {
  expect(page.url()).not.toContain("/dashboard");
});
