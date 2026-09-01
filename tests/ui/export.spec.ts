/* Getting the work out of the app: a spreadsheet to read and sort, and a page fit to print.

   Both are things nobody tries until the moment they need them, which is the worst moment to
   discover the file is empty or the print is a screenshot of a sidebar. */

import { test, expect, openApp, go, openLogForm, task, ago } from "./seed";

const DAY = 86400000;

/* Deliberately hostile content: a comma, a quote, a newline and a leading = are all things a
   pasted log actually contains, and all four break a naive CSV. */
const AWKWARD = [
  task("a", {
    title: 'Payment queue, "retry" storm',
    lane: "professional",
    status: "Resolved",
    createdAt: ago(9 * DAY),
    completedAt: ago(2 * 3600000),
    outcome: "Cleared.\nRetries now capped.",
    memory: { symptoms: "", rootCause: "", resolution: "", learning: "Alarm on timeouts.", followUp: "", shareable: "Retry backlog cleared" },
  }),
  task("b", { title: "=SUM(A1:A9) came out of a log line", lane: "personal", status: "Ongoing", createdAt: ago(3 * DAY), expected: ago(4 * DAY) }),
];

test("the spreadsheet downloads and survives its own content", async ({ page }) => {
  await openApp(page, AWKWARD, []);
  await go(page, "Settings");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("button", { hasText: "Save spreadsheet" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^signal-petal-tasks-\d{4}-\d{2}-\d{2}\.csv$/);

  const stream = await download.createReadStream();
  const text = await new Promise<string>((resolve, reject) => {
    let out = "";
    stream.on("data", chunk => { out += chunk; });
    stream.on("end", () => resolve(out));
    stream.on("error", reject);
  });

  // The byte-order mark is what stops Excel turning em dashes into mojibake.
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain("Title,Professional or personal,Status");
  expect(text).toContain('"Payment queue, ""retry"" storm"');
  expect(text).toContain("'=SUM(A1:A9) came out of a log line");
  expect(text).toContain("Retry backlog cleared");
  // Both of these have a lane, so nothing should be reported as unsorted.
  expect(text).not.toContain("not sorted");

  /* Two tasks plus a heading, no matter how many newlines are inside the cells — splitting on
     CRLF outside quotes is the only honest way to count rows. */
  const rows = text.replace(/^\uFEFF/, "").split(/\r\n(?=(?:[^"]|"[^"]*")*$)/);
  expect(rows).toHaveLength(3);
});

test("the button is offered only when there is something to export", async ({ page }) => {
  await openApp(page, [], []);
  await go(page, "Settings");
  await expect(page.locator("button", { hasText: "Save spreadsheet" })).toBeDisabled();
});

test("printing drops the workspace furniture and keeps the reading matter", async ({ page }) => {
  await openApp(page);
  await go(page, "Weekly review");
  await page.emulateMedia({ media: "print" });

  // Navigation, the command trigger and the copy controls mean nothing on paper.
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".command-trigger")).toBeHidden();
  await expect(page.locator(".review-copy")).toBeHidden();
  // What someone is printing this for is still there.
  await expect(page.locator(".review-page")).toBeVisible();

  await page.emulateMedia({ media: "screen" });
  await expect(page.locator(".sidebar")).toBeVisible();
});

test("a warning about unsaved work stays on the printed page", async ({ page }) => {
  await page.addInitScript(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === "signal-petal-issues" && (window as unknown as { __armed?: boolean }).__armed) {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }
      return real.call(this, name, value);
    };
  });
  await openApp(page, [task("t", { title: "Something", lane: "personal", status: "New", createdAt: ago(3600000) })], []);
  /* Moving between screens writes nothing, so it cannot fail. Saving a task is what reaches
     storage, and therefore what raises the warning. */
  await openLogForm(page);
  await page.locator("input[name=title]").fill("Logged while storage is full");
  await page.locator(".lane-picker .link-options button", { hasText: /^Personal$/ }).click();
  await page.evaluate(() => { (window as unknown as { __armed: boolean }).__armed = true; });
  await page.locator(".modal .create").click();
  await expect(page.locator(".data-alarm")).toBeVisible();
  await page.locator(".detail-modal .close").click().catch(() => {});

  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".data-alarm")).toBeVisible();
});
