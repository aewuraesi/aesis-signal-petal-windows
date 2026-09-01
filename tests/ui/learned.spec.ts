/* "What you learned": how much it asks for depends on the lane, and the one line meant for
   other people is only ever asked for on work other people will read. */

import { test, expect, openApp, go, storedTask } from "./seed";

/* The Insights band exists twice in the DOM — the older copy is switched off in CSS but its
   buttons are still there and still match. Everything here scopes to the live one. */
const record = (page: import("@playwright/test").Page, needle: string) =>
  page.locator(".memory-center-focused .memory-list article", { hasText: needle }).first();

const openLearned = async (page: import("@playwright/test").Page, needle: string) => {
  await go(page, "Insights");
  const tab = page.locator("[role=tab]", { hasText: "What you learned" });
  if (await tab.count()) await tab.click();
  await record(page, needle).locator("button").click();
  await expect(page.locator(".memory-modal")).toBeVisible();
};

test("professional work opens with the fuller questions already showing", async ({ page }) => {
  await openApp(page);
  await openLearned(page, "payment queue backing up");
  await expect(page.locator("#memory-extra")).toBeVisible();
  await expect(page.locator(".memory-modal-copy")).toContainText(/a colleague would follow it too/);
});

test("personal work keeps the short form", async ({ page }) => {
  await openApp(page);
  await openLearned(page, "bike brakes");
  await expect(page.locator("#memory-extra")).toBeHidden();
  await expect(page.locator(".memory-modal-copy")).toContainText(/A line or two is plenty/);
});

test("the shareable line is asked for on professional work only", async ({ page }) => {
  await openApp(page);
  await openLearned(page, "payment queue backing up");
  await expect(page.locator("textarea[name=shareable]")).toBeVisible();
  await page.locator(".memory-modal .close").click();

  await openLearned(page, "bike brakes");
  await expect(page.locator("textarea[name=shareable]")).toHaveCount(0);
});

test("the shareable line saves and reaches the summary", async ({ page }) => {
  await openApp(page);
  await openLearned(page, "payment queue backing up");
  const line = "Overnight payment retry backlog cleared; retries now capped at three attempts";
  await page.locator("textarea[name=shareable]").fill(line);
  await page.locator(".memory-modal button[type=submit]").click();
  await expect(page.locator(".memory-modal")).toHaveCount(0);

  expect(await storedTask(page, "t-shipped-pro")).toMatchObject({ memory: { shareable: line } });

  await go(page, "Weekly review");
  await page.locator(".review-copy-choices button", { hasText: /^Professional$/ }).click();
  const text = await page.evaluate(() => {
    const copied = (window as unknown as { __copied: string[] }).__copied;
    return copied[copied.length - 1] ?? "";
  });
  expect(text).toContain(line);
  expect(text).not.toContain("payment queue backing up again");
});

/* The collapsed questions are hidden, never unmounted: the form reads FormData on save, so
   unmounting them would quietly wipe whatever was already written in them. */
test("saving a short record does not erase the detail behind the fold", async ({ page }) => {
  await openApp(page);
  await openLearned(page, "payment queue backing up");
  await page.locator("textarea[name=rootCause]").fill("A socket timeout with no alarm on it");
  await page.locator(".memory-modal button[type=submit]").click();
  await expect(page.locator(".memory-modal")).toHaveCount(0);

  await openLearned(page, "payment queue backing up");
  await page.locator(".memory-more").click();
  await page.locator(".memory-modal button[type=submit]").click();
  expect(await storedTask(page, "t-shipped-pro")).toMatchObject({ memory: { rootCause: "A socket timeout with no alarm on it" } });
});
