import { test, expect, openApp, openTask, go } from "./seed";

test("task detail has a shareable URL that survives refresh", async ({ page }) => {
  await openApp(page);
  await openTask(page, "SSO rollout");
  await expect(page).toHaveURL(/\/tasks\/t-blocked-pro$/);
  await page.reload();
  await expect(page.locator(".detail-modal")).toBeVisible();
  await expect(page.locator("#issue-detail-title")).toHaveValue("SSO rollout for the contractor accounts");
});

test("resolved work can be archived and restored", async ({ page }) => {
  await openApp(page);
  await openTask(page, "bike brakes");
  await page.getByRole("button", { name: "Archive issue" }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  const archived = page.locator(".issue-card", { hasText: "bike brakes" });
  await expect(archived).toBeVisible();
  await archived.getByRole("button", { name: "Restore" }).click();
  await expect(archived).toBeHidden();
});

test("interactive controls have visible keyboard focus and accessible names", async ({ page }) => {
  await openApp(page);
  await go(page, "Dashboard");
  const unnamedButtons = await page.locator("button").evaluateAll(buttons => buttons.filter(button => !(button.getAttribute("aria-label") || button.textContent?.trim() || button.getAttribute("title"))).length);
  expect(unnamedButtons).toBe(0);
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus-visible");
  await expect(focused).toBeVisible();
});
