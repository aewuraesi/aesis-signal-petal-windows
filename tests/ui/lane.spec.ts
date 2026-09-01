/* The professional/personal choice: mandatory going forward, never clearable, and the one
   legacy state it allows has a way out. */

import { test, expect, openApp, go, openLogForm, openTask, storedTask, task, ago, WEEK } from "./seed";

test("a task cannot be logged without choosing a lane", async ({ page }) => {
  await openApp(page);
  await openLogForm(page);
  const submit = page.locator(".modal .create");
  await page.locator("input[name=title]").fill("A new thing that needs a lane");

  await expect(submit).toBeDisabled();
  await expect(submit).toHaveText(/Choose professional or personal first/);

  await page.locator(".lane-picker .link-options button", { hasText: /^Personal$/ }).click();
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveText("Create issue");
});

test("clicking the chosen lane again does not clear it", async ({ page }) => {
  await openApp(page);
  await openLogForm(page);
  const personal = page.locator(".lane-picker .link-options button", { hasText: /^Personal$/ });
  await personal.click();
  await personal.click();
  await expect(personal).toHaveClass(/is-linked/);
  await expect(page.locator(".modal .create")).toBeEnabled();
});

test("the chosen lane reaches the created task, and the next one starts blank", async ({ page }) => {
  await openApp(page);
  await openLogForm(page);
  await page.locator("input[name=title]").fill("Laned on the way in");
  await page.locator(".lane-picker .link-options button", { hasText: /^Professional$/ }).click();
  await page.locator(".modal .create").click();

  const created = await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem("signal-petal-issues") ?? "[]") as Array<Record<string, unknown>>;
    return all.find(item => item.title === "Laned on the way in") ?? null;
  });
  expect(created).toMatchObject({ lane: "professional" });

  // Nothing inherits the previous choice: the next task has to be chosen for on purpose.
  await page.keyboard.press("Escape");
  await openLogForm(page);
  await expect(page.locator(".lane-picker .link-options button.is-linked")).toHaveCount(0);
  await expect(page.locator(".modal .create")).toBeDisabled();
});

test("an open task can switch lanes but never go back to neither", async ({ page }) => {
  await openApp(page);
  await openTask(page, "Something logged before");

  const field = page.locator(".detail-modal .lane-field");
  await expect(field.locator("> small")).toContainText(/predates the choice/);

  await field.locator(".link-options button", { hasText: /^Professional$/ }).click();
  expect(await storedTask(page, "t-unsorted-a")).toMatchObject({ lane: "professional" });

  await field.locator(".link-options button", { hasText: /^Professional$/ }).click();
  expect(await storedTask(page, "t-unsorted-a"), "clicking the chosen lane cleared it").toMatchObject({ lane: "professional" });

  await field.locator(".link-options button", { hasText: /^Personal$/ }).click();
  expect(await storedTask(page, "t-unsorted-a")).toMatchObject({ lane: "personal" });
});

test("the review lists work from before the lane existed, and sorting it there clears the row", async ({ page }) => {
  await openApp(page);
  await go(page, "Weekly review");
  const rows = page.locator(".review-unsorted li");
  await expect(rows).toHaveCount(2);

  await rows.first().locator("button", { hasText: /^Professional$/ }).click();
  await expect(rows).toHaveCount(1);
});

test("a week with nothing left over shows no unsorted strip at all", async ({ page }) => {
  await openApp(page, WEEK.filter(item => item.lane));
  await go(page, "Weekly review");
  await expect(page.locator(".review-copy")).toBeVisible();
  await expect(page.locator(".review-unsorted")).toHaveCount(0);
});

test("a lane with no work in it says so rather than printing an empty shell", async ({ page }) => {
  await openApp(page, [task("only-pro", { title: "The only thing this week", lane: "professional", status: "New", createdAt: ago(3600000) })], []);
  await go(page, "Weekly review");
  await page.locator(".review-copy-choices button", { hasText: /^Personal$/ }).click();
  const text = await page.evaluate(() => {
    const copied = (window as unknown as { __copied: string[] }).__copied;
    return copied[copied.length - 1] ?? "";
  });
  expect(text).toContain("Nothing is marked personal for this period.");
});
