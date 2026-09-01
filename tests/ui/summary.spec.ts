/* The copied weekly summaries.

   These are the highest-stakes strings the app produces: they get pasted into a work chat
   without being read first. Every test here is a thing that would be embarrassing rather
   than merely broken. */

import { test, expect, openApp, go, lastCopied, PRIVATE_SENTENCE } from "./seed";

const copy = async (page: import("@playwright/test").Page, which: "Professional" | "Personal" | "Both") => {
  await page.locator(".review-copy-choices button", { hasText: new RegExp(`^${which}$`) }).click();
  return lastCopied(page);
};

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await go(page, "Weekly review");
  await expect(page.locator(".review-copy")).toBeVisible();
});

test("the professional summary carries only professional work", async ({ page }) => {
  const text = await copy(page, "Professional");
  expect(text).toContain("SSO rollout for the contractor accounts");
  expect(text).not.toContain("Passport renewal");
  expect(text).not.toContain("bike brakes");
  expect(text).not.toContain("Another one from before");
});

test("the personal summary carries only personal work", async ({ page }) => {
  const text = await copy(page, "Personal");
  expect(text).toContain("Passport renewal");
  expect(text).not.toContain("SSO rollout");
  expect(text).not.toContain("payment queue");
});

test("no summary ever contains diary writing, only a count of it", async ({ page }) => {
  for (const which of ["Professional", "Personal", "Both"] as const) {
    const text = await copy(page, which);
    expect(text, `${which} summary`).not.toContain(PRIVATE_SENTENCE);
    expect(text, `${which} summary`).not.toContain("Felt clearer today");
  }
  /* The count no longer says "this week" — the same summary can now cover a quarter or a
     year, and the heading directly above it already names the period. */
  expect(await copy(page, "Personal")).toMatch(/2 reflections written\./);
  // The professional half does not mention the diary at all, not even to count it.
  expect(await copy(page, "Professional")).not.toMatch(/reflection/i);
});

test("the professional summary tidies the writer's own wording", async ({ page }) => {
  const text = await copy(page, "Professional");
  expect(text).not.toContain("😩");
  expect(text).not.toContain("!!");
  expect(text).not.toContain("TODO:");
  expect(text).toContain("Payment queue backing up again");
  expect(text).toContain("Pull the Q3 access logs");
});

test("a shareable line replaces the raw title and outcome", async ({ page }) => {
  const text = await copy(page, "Professional");
  expect(text).toContain("Vendor onboarding form is live, replacing the manual email thread");
  expect(text).not.toContain("the vendor form thing");
  expect(text).not.toContain("done ugh");
});

test("the takeaway is optional and comes off cleanly", async ({ page }) => {
  expect(await copy(page, "Professional")).toContain("Takeaway");
  await page.locator(".review-takeaway input").uncheck();
  expect(await copy(page, "Professional")).not.toContain("Takeaway");
  await page.locator(".review-takeaway input").check();
  expect(await copy(page, "Professional")).toContain("Takeaway");
});

test("the combined copy labels both halves and owns up to the unsorted pile", async ({ page }) => {
  const text = await copy(page, "Both");
  expect(text).toContain("PROFESSIONAL");
  expect(text).toContain("PERSONAL");
  expect(text).toContain("NOT SORTED YET");
  expect(text).toContain("Something logged before any of this existed");
});

test("nothing is named twice in one summary", async ({ page }) => {
  const text = await copy(page, "Professional");
  const bullets = text.split("\n").filter(line => line.startsWith("•")).map(line => line.replace(/ —.*$/, "").trim());
  expect(new Set(bullets).size, `repeated bullet in:\n${text}`).toBe(bullets.length);
});

test("empty sections leave no heading behind", async ({ page }) => {
  const text = await copy(page, "Professional");
  expect(text).not.toMatch(/\n\s*\n\s*[A-Z][a-z ]+\n\s*\n/);
  expect(text).not.toMatch(/nothing (closed|new|is)/i);
});

test("each copy says what it did, and says the diary stayed out of it", async ({ page }) => {
  await copy(page, "Professional");
  await expect(page.locator(".transfer-message")).toContainText(/Teams or Slack/);
  await copy(page, "Personal");
  await expect(page.locator(".transfer-message")).toContainText(/None of your diary text is in it/);
});
