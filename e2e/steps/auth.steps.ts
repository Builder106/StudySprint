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
    // Append a run-unique suffix so repeated test runs don't hit "email already registered".
    const uniqueEmail = email.startsWith("e2e_")
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
    // The demo account is pre-seeded via `npm run seed` — nothing to provision here.
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
