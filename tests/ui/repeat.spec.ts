/* Work that comes round again.

   The whole point is that a cadence survives being finished late and that the next round
   opens knowing what the last one learned. Both are easy to get subtly wrong and impossible
   to notice until months later, which is exactly what a test is for. */

import { test, expect, openApp, go, openTask, task, ago, settled } from "./seed";

const DAY = 86400000;

const storedTasks = async (page: import("@playwright/test").Page) => {
  await settled(page);
  return page.evaluate(() => JSON.parse(localStorage.getItem("signal-petal-issues") ?? "[]") as Array<Record<string, unknown>>);
};

/* A quarterly review that was due four days ago, so closing it now is closing it late.

   Since rounds also open on the calendar, seeding this one means its next round is already
   open by the time the page has hydrated — which is the point of that feature and is why
   the completion-path tests below use QUARTERLY_AHEAD instead. */
const QUARTERLY = task("cert", {
  title: "Certificate rotation",
  lane: "professional",
  status: "Ongoing",
  expected: ago(4 * DAY),
  action: "Rotate and verify",
  memory: { symptoms: "", rootCause: "", resolution: "Rotated it", learning: "Start a week earlier next time.", followUp: "" },
});

/* The same work, still ahead of its date, so nothing opens on its own and closing it is
   the only thing that can open the next round. */
const QUARTERLY_AHEAD = { ...QUARTERLY, id: "cert", expected: new Date(Date.now() + 20 * DAY).toISOString().slice(0, 16) };

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
  await openApp(page, [{ ...QUARTERLY_AHEAD, repeat: { every: 3, unit: "month" } }], []);
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

test("the cadence holds even though the round was missed", async ({ page }) => {
  /* Four days past its date, so the next round opens on its own. The rule under test is
     the same either way: the cadence counts from when it was DUE, not from today, or every
     missed round would push a quarterly review out into a five-monthly one. */
  await openApp(page, [{ ...QUARTERLY, repeat: { every: 3, unit: "month" } }], []);

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
  await openApp(page, [{ ...QUARTERLY_AHEAD, repeat: { every: 1, unit: "month" } }], []);
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
  await openApp(page, [{ ...QUARTERLY_AHEAD, repeat: { every: 3, unit: "month" } }], []);
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
  await openApp(page, [{ ...QUARTERLY_AHEAD, repeat: { every: 3, unit: "month" } }], []);
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

/* ---------------------------------------------------------------------------
   Rounds that open because the date passed, not because anything was closed.

   The cadence used to depend entirely on closing the current round, so the one
   case where the rhythm matters most - the round nobody got to - was the exact
   case where it silently stopped.
--------------------------------------------------------------------------- */

test("a missed round opens the next one on its own, and says the old one is still open", async ({ page }) => {
  await openApp(page, [{ ...QUARTERLY, repeat: { every: 3, unit: "month" } }], []);

  const rounds = (await storedTasks(page)).filter(item => item.title === "Certificate rotation");
  expect(rounds, "the next round should open without anything being closed").toHaveLength(2);

  const next = rounds.find(item => item.id !== "cert")!;
  expect(next).toMatchObject({ status: "New", repeatedFrom: "cert" });
  expect(new Date(next.expected as string).getTime()).toBeGreaterThan(Date.now());

  /* The round nobody got to is left open. It was not done, and the app does not get to
     decide otherwise - it is marked instead. */
  const stale = rounds.find(item => item.id === "cert")!;
  expect(stale.status).toBe("Ongoing");
  expect(stale.completedAt).toBeUndefined();
  /* The mark belongs to the round that was left behind, not to the one that just opened,
     so find the card by the mark rather than taking whichever card comes first. */
  const marked = page.locator(".issue-card", { has: page.locator(".overtaken-chip") });
  await expect(marked).toHaveCount(1);
  await expect(marked).toContainText("Certificate rotation");
});

test("it does not keep opening rounds every time the app is reloaded", async ({ page }) => {
  await openApp(page, [{ ...QUARTERLY, repeat: { every: 3, unit: "month" } }], []);
  expect((await storedTasks(page)).filter(item => item.repeatedFrom === "cert")).toHaveLength(1);

  await page.reload();
  await expect(page.locator(".workspace header .eyebrow").first()).toContainText("EWURESI");
  await page.waitForTimeout(700);
  expect((await storedTasks(page)).filter(item => item.repeatedFrom === "cert"), "a reload must not open another").toHaveLength(1);
});

test("work that is late but does not repeat is left completely alone", async ({ page }) => {
  await openApp(page, [task("late", { title: "A late one-off", lane: "professional", status: "Ongoing", expected: ago(4 * DAY) })], []);
  expect(await storedTasks(page)).toHaveLength(1);
  await expect(page.locator(".overtaken-chip")).toHaveCount(0);
});
