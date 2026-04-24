import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";

const { Given, When, Then } = createBdd();

// ── Auth background ──────────────────────────────────────────────────────────

Given(
  "I am logged in as {string} with password {string}",
  async ({ page }, email: string, password: string) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 10_000 });
  },
);

// ── Navigation ────────────────────────────────────────────────────────────────

When("I navigate to the new goal page", async ({ page }) => {
  await page.goto("/goals/new");
  await page.waitForLoadState("networkidle");
});

When("I navigate to the dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
});

// ── New goal form inputs ──────────────────────────────────────────────────────

When("I enter the title {string}", async ({ page }, title: string) => {
  await page.fill('input[placeholder="Finish calculus review"]', title);
});

When("I set the target hours to {string}", async ({ page }, hours: string) => {
  const input = page.locator('input[type="number"]');
  await input.fill(hours);
});

When("I submit the new goal form", async ({ page }) => {
  await page.click('button[type="submit"]');
});

// ── Assertions: goal detail ───────────────────────────────────────────────────

Then("I should be redirected to the goal detail page", async ({ page }) => {
  await page.waitForURL("**/goal/**", { timeout: 10_000 });
  expect(page.url()).toMatch(/\/goal\/\d+/);
});

Then(
  "I should see {string} as the goal title",
  async ({ page }, title: string) => {
    await expect(page.getByRole("heading", { name: title })).toBeVisible({
      timeout: 8_000,
    });
  },
);

// ── Assertions: validation ────────────────────────────────────────────────────

Then(
  "I should see the hours validation error {string}",
  async ({ page }, message: string) => {
    await expect(page.locator('[role="alert"]')).toContainText(message);
  },
);

Then("I should remain on the new goal page", async ({ page }) => {
  expect(page.url()).toContain("/goals/new");
});

// ── Assertions: dashboard ─────────────────────────────────────────────────────

Then("I should see at least one goal card", async ({ page }) => {
  // Each goal row is rendered inside a ContextMenuRoot wrapper; the title is a
  // heading or prominent text node. We just assert there is at least one link
  // pointing to /goal/<id>.
  const goalLinks = page.locator('a[href*="/goal/"]');
  await expect(goalLinks.first()).toBeVisible({ timeout: 8_000 });
});

// ── Setup: create goal via API ────────────────────────────────────────────────

Given(
  "I have a goal titled {string} with {int} target hours",
  async ({ page }, title: string, hours: number) => {
    // Retrieve the JWT that was stored during the Background login step.
    const token = await page.evaluate(() =>
      localStorage.getItem("studysprint.token"),
    );
    const baseURL = page.url().replace(/\/dashboard.*/, "");
    const apiBase = process.env.API_URL ?? "http://localhost:4000";

    await page.request.post(`${apiBase}/api/goals`, {
      data: { title, target_hours: hours, status: "Active" },
      headers: { Authorization: `Bearer ${token}` },
    });
  },
);

// ── Context menu: delete ──────────────────────────────────────────────────────

When(
  "I right-click on the {string} goal row",
  async ({ page }, title: string) => {
    // ContextMenuTrigger uses asChild, so the trigger IS the <a> link — no wrapper element.
    const row = page.locator('a[href*="/goal/"]').filter({ hasText: title });
    await row.first().click({ button: "right" });
  },
);

When(
  "I click {string} in the context menu",
  async ({ page }, label: string) => {
    await page.getByRole("menuitem", { name: label }).click();
  },
);

Then(
  "the goal {string} should no longer appear on the dashboard",
  async ({ page }, title: string) => {
    // Allow the delete mutation and re-render to settle.
    await page.waitForTimeout(1_000);
    await expect(page.getByText(title)).not.toBeVisible();
  },
);
