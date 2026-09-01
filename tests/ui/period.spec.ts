/* Copying a quarter or a year rather than a week.

   The point of the longer windows is the record of what was delivered — the thing that is
   painful to reconstruct when someone asks what you have done. So the shape of the summary
   changes with the window: over a week the forward-looking blocks are the living part, over
   a quarter nobody is reading a to-do list. */

import { test, expect, openApp, go, task, ago } from "./seed";

const DAY = 86400000;

const copyAs = async (page: import("@playwright/test").Page, period: "This week" | "This quarter" | "This year", scope: "Professional" | "Personal" | "Both") => {
  await page.locator(".review-copy-period button", { hasText: new RegExp(`^${period}$`) }).click();
  await page.locator(".review-copy-choices button", { hasText: new RegExp(`^${scope}$`) }).click();
  return page.evaluate(() => {
    const copied = (window as unknown as { __copied: string[] }).__copied;
    return copied[copied.length - 1] ?? "";
  });
};

/* Two months back is outside any week but inside this quarter for most of the year, and
   always inside this year. The assertions below account for the quarter boundary. */
const OLDER = task("older", {
  title: "Access review for the audit",
  lane: "professional",
  status: "Resolved",
  createdAt: ago(70 * DAY),
  completedAt: ago(60 * DAY),
  outcome: "Signed off",
});
/* Open and due within the fortnight, so there is genuinely something for next week to be
   about — otherwise the weekly copy has no Focus block and the comparison says nothing. */
const OPEN_SOON = task("soon", {
  title: "Vendor form rollout",
  lane: "professional",
  status: "Ongoing",
  createdAt: ago(20 * DAY),
  expected: new Date(Date.now() + 3 * DAY).toISOString(),
  action: "Chase the sign-off",
});
const THIS_WEEK = task("recent", {
  title: "Payment retry queue",
  lane: "professional",
  status: "Resolved",
  completedAt: ago(2 * 3600000),
  outcome: "Backlog cleared",
});
const OPEN_LATER = task("later", {
  title: "Certificate rotation",
  lane: "professional",
  status: "New",
  createdAt: ago(40 * DAY),
  expected: new Date(Date.now() + 80 * DAY).toISOString(),
  action: "Rotate and verify",
});

test.beforeEach(async ({ page }) => {
  await openApp(page, [OLDER, THIS_WEEK, OPEN_SOON, OPEN_LATER], []);
  await go(page, "Weekly review");
  await expect(page.locator(".review-copy")).toBeVisible();
});

test("the week covers the week and the year covers the year", async ({ page }) => {
  const week = await copyAs(page, "This week", "Professional");
  expect(week).toContain("Weekly update");
  expect(week).toContain("Payment retry queue");
  expect(week).not.toContain("Access review for the audit");

  const year = await copyAs(page, "This year", "Professional");
  expect(year).toContain("Year to date");
  expect(year).toContain("Payment retry queue");
  expect(year).toContain("Access review for the audit");
});

test("a longer window reports what was delivered, not what is next", async ({ page }) => {
  const week = await copyAs(page, "This week", "Professional");
  expect(week).toContain("Focus for next week");

  const year = await copyAs(page, "This year", "Professional");
  expect(year).not.toContain("Focus for next week");
  expect(year).not.toContain("Started this week");
  expect(year).toMatch(/Delivered \(2\)/);
  expect(year).toContain("Access review for the audit");
});

test("the quarter is labelled by its months and the year by its year", async ({ page }) => {
  const quarter = await copyAs(page, "This quarter", "Professional");
  expect(quarter).toMatch(/Quarter to date · [A-Z][a-z]{2}(–[A-Z][a-z]{2})? \d{4}/);

  const year = await copyAs(page, "This year", "Professional");
  expect(year).toContain(`Year to date · ${new Date().getFullYear()}`);
});

test("the longer windows keep every rule the weekly one has", async ({ page }) => {
  const year = await copyAs(page, "This year", "Professional");
  // Still professional only, still no diary, still nothing named twice.
  expect(year).not.toMatch(/reflection/i);
  const bullets = year.split("\n").filter(line => line.startsWith("•")).map(line => line.replace(/ —.*$/, "").trim());
  expect(new Set(bullets).size, `repeated bullet in:\n${year}`).toBe(bullets.length);

  const both = await copyAs(page, "This year", "Both");
  expect(both).toContain("PROFESSIONAL");
  expect(both).toContain("PERSONAL");
  expect(both).toContain("Year to date");
});

test("the chosen window sticks while you switch between the three voices", async ({ page }) => {
  await copyAs(page, "This year", "Professional");
  const personal = await copyAs(page, "This year", "Personal");
  expect(personal).toContain("Year to date");
  await expect(page.locator(".review-copy-period button", { hasText: "This year" })).toHaveAttribute("aria-pressed", "true");
});

test("a very long record names its tail rather than dropping it", async ({ page }) => {
  const many = Array.from({ length: 46 }, (_, i) => task(`bulk-${i}`, {
    title: `Delivered thing number ${i}`,
    lane: "professional",
    status: "Resolved",
    completedAt: ago((i + 1) * DAY),
  }));
  await openApp(page, many, []);
  await go(page, "Weekly review");
  const year = await copyAs(page, "This year", "Professional");
  expect(year).toMatch(/Delivered \(46\)/);
  expect(year).toMatch(/… and 6 more/);
  expect(year.split("\n").filter(line => line.startsWith("•"))).toHaveLength(40);
});
