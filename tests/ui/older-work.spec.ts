/* Old finished work, and where it goes.

   Measured before this was built: after a year the default list was three cards of history for
   every one that still needed doing, interleaved. Nothing here hides anything permanently —
   the counts, the search and the summaries all still see everything. */

import { test, expect, openApp, go, task, ago } from "./seed";

const DAY = 86400000;

/* A year of work: logged steadily, most of it finished, a few old open things still hanging. */
const AGED = Array.from({ length: 24 }, (_, i) => {
  const age = (i + 1) * 15 * DAY;
  const finished = i % 4 !== 0;
  return task(`t${i}`, {
    title: `${finished ? "Finished" : "Still open"} item ${i}`,
    lane: i % 2 ? "professional" : "personal",
    status: finished ? "Resolved" : "Ongoing",
    createdAt: ago(age),
    completedAt: finished ? ago(age - 2 * DAY) : undefined,
    outcome: finished ? "Done" : "",
  });
});
const RECENT_DONE = task("fresh", {
  title: "Finished this week",
  lane: "professional",
  status: "Resolved",
  createdAt: ago(9 * DAY),
  completedAt: ago(2 * 3600000),
  outcome: "Done",
});

const listed = (page: import("@playwright/test").Page) =>
  page.locator(".issue-list .issue-card .issue-card-main").allInnerTexts();

test("the default list leads with what still needs doing", async ({ page }) => {
  await openApp(page, [...AGED, RECENT_DONE], []);
  const titles = await listed(page);
  const firstFinished = titles.findIndex(text => /Finished/.test(text));
  const lastOpen = titles.map(text => /Still open/.test(text)).lastIndexOf(true);
  expect(lastOpen, "an unfinished item was listed below a finished one").toBeLessThan(firstFinished);
});

test("work finished over a month ago is folded away, and says how much", async ({ page }) => {
  await openApp(page, [...AGED, RECENT_DONE], []);
  const fold = page.locator(".older-done");
  await expect(fold).toBeVisible();
  await expect(fold.locator("button")).toContainText(/Show \d+ older finished items/);

  // Recent work stays in the list; the old finished work does not.
  const titles = await listed(page);
  expect(titles.join(" ")).toContain("Finished this week");
  expect(titles.join(" ")).not.toContain("Finished item 23");
});

test("the fold opens and closes again", async ({ page }) => {
  await openApp(page, [...AGED, RECENT_DONE], []);
  const before = (await listed(page)).length;
  await page.locator(".older-done button").click();
  const after = await listed(page);
  expect(after.length).toBeGreaterThan(before);
  expect(after.join(" ")).toContain("Finished item 23");

  await page.locator(".older-done button", { hasText: /^Hide/ }).click();
  expect(await listed(page)).toHaveLength(before);
});

test("the count above the list still counts everything", async ({ page }) => {
  const all = [...AGED, RECENT_DONE];
  await openApp(page, all, []);
  /* The fold must never make the list disagree with the tally. Folding work out of view while
     the card says 25 would be the app lying about what it holds. */
  await expect(page.locator(".metric-card", { hasText: "All tasks" }).locator("strong")).toHaveText(String(all.length));
});

test("searching reaches folded work", async ({ page }) => {
  await openApp(page, [...AGED, RECENT_DONE], []);
  await page.locator('input[placeholder^="Search tasks"]').fill("Finished item 23");
  await expect(page.locator(".issue-list .issue-card")).toHaveCount(1);
  await expect(page.locator(".issue-list .issue-card")).toContainText("Finished item 23");
  // A search is an explicit ask, so nothing is folded during one.
  await expect(page.locator(".older-done")).toHaveCount(0);
});

test("asking for finished work shows all of it, in its own order", async ({ page }) => {
  await openApp(page, [...AGED, RECENT_DONE], []);
  await page.locator(".metric-card").filter({ has: page.locator("span", { hasText: /^Resolved$/ }) }).first().click();
  const titles = await listed(page);
  expect(titles.join(" ")).toContain("Finished item 23");
  await expect(page.locator(".older-done")).toHaveCount(0);
});

test("a young workspace is not told about older work it does not have", async ({ page }) => {
  await openApp(page, [RECENT_DONE], []);
  await expect(page.locator(".older-done")).toHaveCount(0);
});

test("folded work still reaches the year summary", async ({ page }) => {
  await openApp(page, [...AGED, RECENT_DONE], []);
  await go(page, "Weekly review");
  await page.locator(".review-copy-period button", { hasText: "This year" }).click();
  await page.locator(".review-copy-choices button", { hasText: /^Professional$/ }).click();
  const text = await page.evaluate(() => {
    const copied = (window as unknown as { __copied: string[] }).__copied;
    return copied[copied.length - 1] ?? "";
  });
  expect(text).toMatch(/Delivered \(\d+\)/);
});
