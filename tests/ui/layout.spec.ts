/* Layout guards.

   The recurring failure in this app is a long title or a pasted log widening a grid column
   and pushing the whole page sideways. It is invisible on tidy sample data and obvious on
   real data, so the fixtures are deliberately scruffy and the assertion is blunt: the page
   itself never scrolls horizontally, at any width, on any screen. */

import { test, expect, openApp, go, openLogForm, type Screen } from "./seed";

const WIDTHS = [360, 390, 414, 768, 820, 1024, 1280, 1600];
const SCREENS: Screen[] = ["Dashboard", "Calendar", "Insights", "Diary", "Weekly review", "Settings"];

const overflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/* Names the element sticking out, so a failure says what to fix rather than only that
   something is wrong. */
const widest = (page: import("@playwright/test").Page) => page.evaluate(() => {
  let worst = "", edge = document.documentElement.clientWidth;
  document.querySelectorAll("main *").forEach(element => {
    const box = element.getBoundingClientRect();
    if (box.width && box.right > edge + 0.5) { edge = box.right; worst = `${element.tagName}.${element.className}`.slice(0, 90); }
  });
  return worst;
});

for (const width of WIDTHS) {
  test(`no sideways scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    for (const screen of SCREENS) {
      await go(page, screen);
      await page.waitForTimeout(150);
      expect(await overflow(page), `${screen} at ${width}px — widest: ${await widest(page)}`).toBeLessThanOrEqual(1);
    }
  });
}

test("the log form fits the narrowest phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openApp(page);
  await openLogForm(page);
  const modal = await page.locator(".modal").first().boundingBox();
  const button = await page.locator(".modal .create").boundingBox();
  expect(button!.width).toBeLessThanOrEqual(modal!.width);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("every day in the month grid is the same width", async ({ page }) => {
  await openApp(page);
  await go(page, "Calendar");
  const widths = await page.locator(".calendar-day").evaluateAll(cells => cells.map(cell => Math.round(cell.getBoundingClientRect().width)));
  expect(widths.length).toBeGreaterThan(0);
  expect(new Set(widths).size, `day cells have ${new Set(widths).size} different widths`).toBe(1);
});

/* Regression: at 720p the log form is taller than the window. It used to neither scroll nor
   pin its button, so the only way to create a task was to make the window bigger. */
test("the log form can be submitted on a short desktop window", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openApp(page);
  await openLogForm(page);
  await page.locator("input[name=title]").fill("Logged from a short window");
  await page.locator(".lane-picker .link-options button", { hasText: /^Professional$/ }).click();
  await page.locator(".modal .create").click({ timeout: 5000 });

  const created = await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem("signal-petal-issues") ?? "[]") as Array<Record<string, unknown>>;
    return all.some(item => item.title === "Logged from a short window");
  });
  expect(created, "the Create button was out of reach").toBe(true);
});
