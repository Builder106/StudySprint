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
    // The DEMO suite re-runs against the same `example@example.com` literal so
    // the recorded video stays consistent. In production, that domain is on
    // Supabase Auth's blocklist — but DEMO mode exists to record locally
    // against a relaxed/mocked Supabase, so we still fill the literal here.
    // For QA runs we append a timestamp suffix to non-deterministic emails so
    // re-runs don't collide; cleanup of the resulting auth.users row requires
    // service-role access which the e2e suite doesn't currently have, so the
    // demo_signup_<ts>@... rows accumulate. Sweep them out periodically with:
    //   delete from auth.users where email like 'demo_signup_%@studysprint.app';
    const uniqueEmail = email.startsWith("demo_signup")
      ? email.replace("@", `_${Date.now()}@`)
      : email;
    await page.fill('input[type="email"]', uniqueEmail);
    await page.fill('input[type="password"]', password);
  },
);

When("I submit the registration form", async ({ page }) => {
  await page.click('button[type="submit"]');
});

Then("I should be redirected to the dashboard", async ({ page }) => {
  await page.waitForURL("**/dashboard", { timeout: 10_000 });
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
