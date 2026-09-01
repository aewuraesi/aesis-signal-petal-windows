/* What happens when the browser refuses to store anything.

   The whole app lives in one browser's storage, so this is not an edge case — it is the
   failure mode. It used to take the entire app down: one refused write threw out of a React
   effect and the writer got the browser's own "This page couldn't load", with the change
   lost and nothing said about why. These tests exist because none of this is visible in
   normal use and it would regress in silence. */

import { test, expect, openApp, go, openLogForm, task, ago } from "./seed";

/* Refuses one key, the way a full quota shows up first: the biggest value is the one that
   stops fitting. Armed after load so the app starts from a working state. */
const refuseWritesTo = (page: import("@playwright/test").Page, key: string) => page.addInitScript((key) => {
  const real = Storage.prototype.setItem;
  Storage.prototype.setItem = function (name: string, value: string) {
    if (name === key && (window as unknown as { __armed?: boolean }).__armed) {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    }
    return real.call(this, name, value);
  };
}, key);

const arm = (page: import("@playwright/test").Page) =>
  page.evaluate(() => { (window as unknown as { __armed: boolean }).__armed = true; });

test("a refused save leaves the app standing and says what happened", async ({ page }) => {
  await refuseWritesTo(page, "signal-petal-issues");
  await openApp(page, [task("t1", { title: "Something already here", lane: "professional", status: "New", createdAt: ago(3600000) })], []);

  await openLogForm(page);
  await page.locator("input[name=title]").fill("A task logged when storage is full");
  await page.locator(".lane-picker .link-options button", { hasText: /^Professional$/ }).click();
  await arm(page);
  await page.locator(".modal .create").click();

  // The app is still there. This is the whole point: losing a task is bad, losing the app
  // on top of it is what made it unrecoverable.
  await expect(page.locator(".sidebar nav")).toBeVisible();
  await expect(page.locator(".data-alarm")).toBeVisible();
  await expect(page.locator(".data-alarm")).toContainText(/run out of room/);
  await expect(page.locator(".data-alarm")).toContainText(/has not been saved/);
  // And the way out is offered right there, not buried in Settings.
  await expect(page.locator(".data-alarm button", { hasText: "Save backup file" })).toBeVisible();
});

test("the warning stays until that same thing saves again", async ({ page }) => {
  await refuseWritesTo(page, "signal-petal-issues");
  await openApp(page, [task("t1", { title: "Something already here", lane: "personal", status: "New", createdAt: ago(3600000) })], []);
  await arm(page);

  await openLogForm(page);
  await page.locator("input[name=title]").fill("First attempt");
  await page.locator(".lane-picker .link-options button", { hasText: /^Personal$/ }).click();
  await page.locator(".modal .create").click();
  await expect(page.locator(".data-alarm")).toBeVisible();
  // Creating a task opens its detail; close it before going anywhere.
  await page.locator(".detail-modal .close").click();
  await expect(page.locator(".detail-modal")).toHaveCount(0);

  /* Changing the theme writes a different key and that write succeeds. The warning must NOT
     clear on it — the task list is still not saving, and a cheerful disappearance would be
     a lie about the state of the writer's data. */
  await go(page, "Settings");
  const theme = page.locator(".theme-bars, .settings-card button").first();
  if (await theme.count()) await theme.click({ timeout: 4000 }).catch(() => {});
  await expect(page.locator(".data-alarm")).toBeVisible();
});

test("nothing is said about storage when storage is fine", async ({ page }) => {
  await openApp(page);
  await expect(page.locator(".data-alarm")).toHaveCount(0);
  await openLogForm(page);
  await page.locator("input[name=title]").fill("An ordinary task");
  await page.locator(".lane-picker .link-options button", { hasText: /^Professional$/ }).click();
  await page.locator(".modal .create").click();
  await expect(page.locator(".data-alarm")).toHaveCount(0);
});

test("a backup that has never been saved is mentioned once, and can be put off", async ({ page }) => {
  await openApp(page);
  const nudge = page.locator(".data-nudge");
  await expect(nudge).toBeVisible();
  await expect(nudge).toContainText(/not saved a backup yet/);

  await nudge.locator("button", { hasText: "Not now" }).click();
  await expect(nudge).toHaveCount(0);

  // Still gone after a reload: putting it off has to actually stick, or it is nagging.
  await page.reload();
  await expect(page.locator(".metric-card", { hasText: "All tasks" }).locator("strong")).toHaveText("8");
  await expect(page.locator(".data-nudge")).toHaveCount(0);
});

test("an empty workspace is not nagged about backups", async ({ page }) => {
  await openApp(page, [], []);
  await expect(page.locator(".data-nudge")).toHaveCount(0);
});
