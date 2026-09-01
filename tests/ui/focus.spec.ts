/* Keyboard handling inside dialogs.

   Every dialog claims `aria-modal="true"`, which tells a screen reader the rest of the page
   is inert. These tests are what make that claim true rather than decorative. */

import { test, expect, openApp, go, openLogForm, openTask } from "./seed";

/* A short, readable description of whatever has focus, so a failure says where focus went
   rather than only that it went somewhere wrong. */
const focused = (page: import("@playwright/test").Page) => page.evaluate(() => {
  const element = document.activeElement as HTMLElement | null;
  if (!element || element === document.body) return "body";
  const inDialog = Boolean(element.closest('[aria-modal="true"]'));
  const name = element.getAttribute("name") ?? element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40) ?? "";
  return `${inDialog ? "in" : "OUT"}:${element.tagName.toLowerCase()}:${name}`;
});

test("the log form opens with the caret in the first field, not on the close button", async ({ page }) => {
  await openApp(page);
  await openLogForm(page);
  expect(await focused(page)).toBe("in:input:title");
});

test("Tab cycles inside the dialog and never reaches the page behind it", async ({ page }) => {
  await openApp(page);
  await openLogForm(page);
  const seen: string[] = [];
  for (let step = 0; step < 25; step += 1) {
    await page.keyboard.press("Tab");
    seen.push(await focused(page));
  }
  expect(seen.filter(entry => entry.startsWith("OUT")), `focus escaped: ${seen.join(" | ")}`).toHaveLength(0);
  expect(seen).toContain("in:input:title");
});

test("Shift+Tab from the first control wraps to the last one in the dialog", async ({ page }) => {
  await openApp(page);
  await openLogForm(page);
  await page.keyboard.press("Shift+Tab");
  const wrapped = await focused(page);
  expect(wrapped.startsWith("in:")).toBe(true);
  expect(wrapped).not.toBe("in:input:title");
});

test("closing a dialog gives focus back to what opened it", async ({ page }) => {
  await openApp(page);
  await go(page, "Dashboard");
  const trigger = page.locator(".header-actions button", { hasText: "Log/Track" });
  await trigger.click();
  await expect(page.locator(".modal .lane-picker")).toBeVisible();
  await page.locator(".modal .close").click();
  await expect(page.locator(".modal")).toHaveCount(0);
  expect(await focused(page)).toContain("Log/Track");
});

test("a confirm dialog starts on the safe choice", async ({ page }) => {
  await openApp(page);
  await openTask(page, "SSO rollout");
  await page.locator(".detail-modal .delete").click();
  await expect(page.locator(".confirm-dialog")).toBeVisible();
  // Focus must not begin on "Delete issue": Enter is one keystroke from destroying the task.
  expect(await focused(page)).toBe("in:button:Keep issue");
  await page.locator(".confirm-dialog button", { hasText: "Keep issue" }).click();
});

test("the command palette opens ready to type", async ({ page }) => {
  await openApp(page);
  await page.locator(".command-trigger").click();
  await expect(page.locator(".command-palette")).toBeVisible();
  expect(await focused(page)).toContain("Search commands");
  await page.keyboard.type("passport");
  await expect(page.locator(".command-palette input")).toHaveValue("passport");
});

test("the hidden extra questions are skipped by Tab until they are opened", async ({ page }) => {
  await openApp(page);
  await go(page, "Insights");
  const tab = page.locator("[role=tab]", { hasText: "What you learned" });
  if (await tab.count()) await tab.click();
  await page.locator(".memory-center-focused .memory-list article", { hasText: "bike brakes" }).first().locator("button").click();
  await expect(page.locator(".memory-modal")).toBeVisible();
  await expect(page.locator("#memory-extra")).toBeHidden();

  const reachable = await page.evaluate(() => {
    const dialog = document.querySelector('[aria-modal="true"]')!;
    return [...dialog.querySelectorAll<HTMLElement>("textarea")].filter(el => el.getClientRects().length > 0).map(el => el.getAttribute("name"));
  });
  expect(reachable).not.toContain("rootCause");
  expect(reachable).toContain("resolution");
});
