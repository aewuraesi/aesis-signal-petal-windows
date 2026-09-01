/* Work that comes round again.

   The whole point is that a cadence survives being finished late and that the next round
   opens knowing what the last one learned. Both are easy to get subtly wrong and impossible
   to notice until months later, which is exactly what a test is for. */

import { test, expect, openApp, go, openTask, task, ago } from "./seed";

const DAY = 86400000;

const storedTasks = (page: import("@playwright/test").Page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem("signal-petal-issues") ?? "[]") as Array<Record<string, unknown>>);

/* A quarterly review that was due four days ago, so closing it now is closing it late. */
const QUARTERLY = task("cert", {
  title: "Certificate rotation",
  lane: "professional",
  status: "Ongoing",
  expected: ago(4 * DAY),
  action: "Rotate and verify",
  memory: { symptoms: "", rootCause: "", resolution: "Rotated it", learning: "Start a week earlier next time.", followUp: "" },
});

test("a task can be set to come round again, and says what that means", async ({ page }) => {
  await openApp(page, [QUARTERLY], []);
  await openTask(page, "Certificate rotation");

  const cadence = page.locator(".detail-modal .field", { hasText: "Does this come round again?" }).locator("select");
  await expect(cadence).toHaveValue("");
  await cadence.selectOption({ label: "Every 3 months" });

  expect(await storedTasks(page)).toContainEqual(expect.objectContaining({ id: "cert", repeat: { every: 3, unit: "month" } }));
  await expect(page.locator(".detail-modal .field", { hasText: "Does this come round again?" }).locator("small"))
    .toContainText(/the next one opens on its own/);
});

test("closing it out opens the next round, once", async ({ page }) => {
  await openApp(page, [{ ...QUARTERLY, repeat: { every: 3, unit: "month" } }], []);
  await openTask(page, "Certificate rotation");
  await page.locator(".detail-modal select").first().selectOption("Resolved");
  await page.waitForTimeout(400);

  const all = await storedTasks(page);
  const rounds = all.filter(item => item.title === "Certificate rotation");
  expect(rounds).toHaveLength(2);

  const next = rounds.find(item => item.id !== "cert")!;
  expect(next).toMatchObject({ status: "New", repeatedFrom: "cert", repeat: { every: 3, unit: "month" }, lane: "professional" });
  // The finished round keeps its own results; the new one starts clean.
  expect(next.outcome).toBe("");
  expect(next.memory).toBeUndefined();
  expect(next.completedAt).toBeUndefined();
});

test("the cadence holds even though it was finished late", async ({ page }) => {
  await openApp(page, [{ ...QUARTERLY, repeat: { every: 3, unit: "month" } }], []);
  await openTask(page, "Certificate rotation");
  await page.locator(".detail-modal select").first().selectOption("Resolved");
  await page.waitForTimeout(400);

  const next = (await storedTasks(page)).find(item => item.repeatedFrom === "cert")!;
  const due = new Date(next.expected as string).getTime();
  const wasDue = new Date(QUARTERLY.expected).getTime();
  // Three months on from when it was DUE, not from today — within a couple of days either way.
  const threeMonthsOn = new Date(wasDue);
  threeMonthsOn.setMonth(threeMonthsOn.getMonth() + 3);
  expect(Math.abs(due - threeMonthsOn.getTime()), `next round due ${next.expected}`).toBeLessThan(2 * DAY);
  expect(due).toBeGreaterThan(Date.now());
});

test("reopening and closing again does not stack up rounds", async ({ page }) => {
  await openApp(page, [{ ...QUARTERLY, repeat: { every: 1, unit: "month" } }], []);
  await openTask(page, "Certificate rotation");
  const status = page.locator(".detail-modal select").first();
  await status.selectOption("Resolved");
  await page.waitForTimeout(300);
  await status.selectOption("Ongoing");
  await page.waitForTimeout(300);
  await status.selectOption("Resolved");
  await page.waitForTimeout(400);

  expect((await storedTasks(page)).filter(item => item.repeatedFrom === "cert")).toHaveLength(1);
});

test("the next round opens with what was worked out last time", async ({ page }) => {
  await openApp(page, [{ ...QUARTERLY, repeat: { every: 3, unit: "month" } }], []);
  await openTask(page, "Certificate rotation");
  await page.locator(".detail-modal select").first().selectOption("Resolved");
  await page.waitForTimeout(400);
  await page.locator(".detail-modal .close").click();

  await openTask(page, "Certificate rotation");
  const before = page.locator(".round-before");
  await expect(before).toBeVisible();
  await expect(before).toContainText("LAST TIME ROUND");
  await expect(before).toContainText("Start a week earlier next time.");
});

test("a one-off stays a one-off", async ({ page }) => {
  await openApp(page, [task("once", { title: "A single thing", lane: "personal", status: "Ongoing", createdAt: ago(3600000) })], []);
  await openTask(page, "A single thing");
  await page.locator(".detail-modal select").first().selectOption("Resolved");
  await page.waitForTimeout(400);

  expect(await storedTasks(page)).toHaveLength(1);
  await expect(page.locator(".round-before")).toHaveCount(0);
});

test("a repeating task does not distort the weekly summary", async ({ page }) => {
  await openApp(page, [{ ...QUARTERLY, repeat: { every: 3, unit: "month" } }], []);
  await openTask(page, "Certificate rotation");
  await page.locator(".detail-modal select").first().selectOption("Resolved");
  await page.waitForTimeout(400);
  await page.locator(".detail-modal .close").click();

  await go(page, "Weekly review");
  await page.locator(".review-copy-choices button", { hasText: /^Professional$/ }).click();
  const text = await page.evaluate(() => {
    const copied = (window as unknown as { __copied: string[] }).__copied;
    return copied[copied.length - 1] ?? "";
  });
  /* The round that finished belongs under Delivered. The round that has just opened is due
     months away, so it must not appear as work started this week. */
  expect(text).toMatch(/Delivered \(1\)/);
  const mentions = text.split("\n").filter(line => line.includes("Certificate rotation"));
  expect(mentions, `named more than once:\n${text}`).toHaveLength(1);
});
