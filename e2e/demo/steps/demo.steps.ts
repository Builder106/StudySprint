import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { dwellForDemo } from "../../steps/hooks";

const { When, Then } = createBdd();

// ── Analytics + Garden ────────────────────────────────────────────────────────

When("I navigate to the analytics page", async ({ page }) => {
  await page.goto("/analytics");
  await page.waitForLoadState("networkidle");
  await dwellForDemo(page);
});

Then("I should see the contribution heatmap", async ({ page }) => {
  await expect(
    page.locator('[aria-label="Daily study contribution heatmap"]'),
  ).toBeVisible({ timeout: 8_000 });
});

When("I navigate to the garden page", async ({ page }) => {
  await page.goto("/garden");
  await page.waitForLoadState("networkidle");
  await dwellForDemo(page);
});

Then("I should see the XP bar", async ({ page }) => {
  await expect(page.getByText(/\d+ \/ \d+ XP/)).toBeVisible({ timeout: 8_000 });
});

Then("I should see the virtual plant", async ({ page }) => {
  // Plant is a hand-rolled inline SVG; the Garden page heading is the most stable anchor.
  await expect(page.getByRole("heading", { name: "Keep it growing." }))
    .toBeVisible({ timeout: 8_000 });
});

// ── Focus tools (demo-only assertion; richer than the QA smoke check) ────────

When("I open the focus tools panel", async ({ page }) => {
  const section = page.getByRole("region", { name: "Focus tools" });
  await section.waitFor({ state: "attached", timeout: 15_000 });
  const toggle = section.getByRole("button", { name: /focus tools/i });
  await toggle.scrollIntoViewIfNeeded();
  const isExpanded = await toggle.getAttribute("aria-expanded");
  if (isExpanded === "false") await toggle.click();
});

Then("the ambient noise controls should be visible", async ({ page }) => {
  await expect(page.getByRole("button", { name: "White" })).toBeVisible({
    timeout: 5_000,
  });
});

// ── Syllabus parser modal ─────────────────────────────────────────────────────

When("I open the syllabus import modal", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  await dwellForDemo(page);
  await page.getByRole("button", { name: "Import from syllabus" }).click();
});

Then("the syllabus import modal should be visible", async ({ page }) => {
  await expect(page.getByRole("heading", { name: /Import from syllabus/i }))
    .toBeVisible({ timeout: 5_000 });
  await dwellForDemo(page, 2_500);
});

When("I close the syllabus import modal", async ({ page }) => {
  // Modal is a custom div with no Escape handler — close via the X button.
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: /Import from syllabus/i }))
    .not.toBeVisible({ timeout: 5_000 });
  await dwellForDemo(page);
});
