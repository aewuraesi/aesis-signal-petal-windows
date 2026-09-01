/* The task card's right-hand column.

   Measured before this was fixed: the column was sized by its own contents, so its right edge
   landed at 850, 966 and 1237px on three cards in the same list, and on two of them it ran
   straight over the Complete pill — the owner's name was printed underneath it. */

import { test, expect, openApp, task, ago } from "./seed";

const DAY = 86400000;
const soon = () => { const d = new Date(Date.now() + 3 * DAY); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/* One card with no follow-up people, one with a very long list, one with a single name —
   the three shapes that used to lay out three different ways. */
const CARDS = [
  task("none", { title: "ECI Intouch Service", lane: "professional", status: "Ongoing", expected: soon(), createdAt: ago(9 * DAY) }),
  task("many", {
    title: "Database Access", lane: "professional", status: "Ongoing", expected: soon(), createdAt: ago(9 * DAY),
    followUpPeople: ["ADESHINA Opeyemi", "OISAGHIE Victor", "ODEZUE Tobechukwu", "BOAKYE-MENSAH Nana Akua", "Philip Tackie-Yarboi", "OPOKU Francis"],
  }),
  task("one", { title: "Error not defined", lane: "personal", status: "Ongoing", expected: soon(), createdAt: ago(9 * DAY), followUpPeople: ["Giorgio Boakye"] }),
];

const cardGeometry = (page: import("@playwright/test").Page) => page.evaluate(() =>
  [...document.querySelectorAll(".issue-list .issue-card")].map(card => {
    const meta = card.querySelector(".issue-meta")!;
    const actions = card.querySelector(".issue-card-actions")!;
    const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, middle: (r.top + r.bottom) / 2 }; };
    return {
      rights: [...meta.children].map(child => Math.round(rect(child).right)),
      metaRight: rect(meta).right,
      actionsLeft: rect(actions).left,
      ownerMiddle: rect(meta.children[1]).middle,
      actionsMiddle: rect(actions).middle,
    };
  }));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await openApp(page, CARDS, []);
});

test("due date, owner and follow-up count share one right edge on every card", async ({ page }) => {
  const cards = await cardGeometry(page);
  expect(cards).toHaveLength(3);
  const edges = new Set(cards.flatMap(card => card.rights));
  expect([...edges], "the right-hand column is ragged").toHaveLength(1);
});

test("the column never runs under the Complete pill", async ({ page }) => {
  for (const card of await cardGeometry(page)) {
    expect(card.metaRight, "the meta column overlaps the actions").toBeLessThanOrEqual(card.actionsLeft);
  }
});

test("the owner sits on the pill's line, with or without follow-up people", async ({ page }) => {
  for (const card of await cardGeometry(page)) {
    expect(Math.abs(card.ownerMiddle - card.actionsMiddle), "the owner is off the pill's line").toBeLessThanOrEqual(2);
  }
});

test("a long list of names cannot widen the card", async ({ page }) => {
  const widths = await page.locator(".issue-list .issue-card").evaluateAll(cards => cards.map(card => Math.round(card.getBoundingClientRect().width)));
  expect(new Set(widths), "cards are different widths").toHaveProperty("size", 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("the alignment holds across desktop widths", async ({ page }) => {
  for (const width of [700, 900, 1100, 1400, 1700]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(200);
    const cards = await cardGeometry(page);
    expect(new Set(cards.flatMap(card => card.rights)), `ragged at ${width}px`).toHaveProperty("size", 1);
    for (const card of cards) {
      expect(card.metaRight, `overlap at ${width}px`).toBeLessThanOrEqual(card.actionsLeft);
      expect(Math.abs(card.ownerMiddle - card.actionsMiddle), `owner off the pill's line at ${width}px`).toBeLessThanOrEqual(2);
    }
  }
});
