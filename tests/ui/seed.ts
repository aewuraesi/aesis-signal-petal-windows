/* Fixtures for the browser tests.

   The app is local-only, so a test sets the scene by writing localStorage before the first
   paint and reloading. Dates are always built relative to `now`: several screens key off
   "today" and "this week", so fixed dates would make the review, the streak and the overdue
   states untestable a week after they were written. */

import { test as base, expect, type Page } from "@playwright/test";

const HOUR = 3600000;
const DAY = 86400000;
export const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

type Overrides = {
  title: string;
  lane?: "professional" | "personal";
  status?: string;
  action?: string;
  outcome?: string;
  expected?: string;
  createdAt?: string;
  completedAt?: string;
  followUpPeople?: string[];
  memory?: Record<string, string>;
};

export const task = (id: string, over: Overrides) => ({
  id,
  title: over.title,
  details: "",
  owner: "Ewuresi",
  action: over.action ?? "",
  expected: over.expected ?? "",
  createdAt: over.createdAt ?? ago(5 * HOUR),
  updatedAt: ago(HOUR),
  completedAt: over.completedAt,
  status: over.status ?? "Ongoing",
  outcome: over.outcome ?? "",
  lane: over.lane,
  followUpPeople: over.followUpPeople ?? [],
  updates: [{ id: `${id}-u`, at: over.createdAt ?? ago(5 * HOUR), author: "Ewuresi", text: "Issue logged." }],
  memory: over.memory,
});

/* One week's worth of work, covering every shape the summaries have to handle: shipped with
   and without a shareable line, overdue and waiting on someone, newly logged, both lanes,
   and two left over from before the lane existed. Titles are long and scruffy on purpose —
   tidy sample data hides both layout bugs and tone bugs. */
export const WEEK = [
  task("t-shipped-pro", {
    title: "payment queue backing up again 😩",
    lane: "professional",
    status: "Resolved",
    completedAt: ago(2 * HOUR),
    outcome: "sorted it out!!",
    memory: { symptoms: "", rootCause: "", resolution: "raised the timeout", learning: "it was a silent timeout, not card declines — alarm on it next time.", followUp: "" },
  }),
  task("t-shipped-shareable", {
    title: "the vendor form thing",
    lane: "professional",
    status: "Resolved",
    completedAt: ago(4 * HOUR),
    outcome: "done ugh",
    memory: { symptoms: "", rootCause: "", resolution: "shipped", learning: "ship the form first.", followUp: "", shareable: "Vendor onboarding form is live, replacing the manual email thread" },
  }),
  task("t-blocked-pro", {
    title: "SSO rollout for the contractor accounts",
    lane: "professional",
    status: "Blocked",
    expected: ago(4 * DAY),
    action: "Chase the IdP metadata",
    followUpPeople: ["Francis Wilson"],
  }),
  task("t-new-pro", { title: "TODO: pull the Q3 access logs", lane: "professional", status: "New", createdAt: ago(3 * HOUR), action: "get them to the auditor" }),
  task("t-shipped-personal", { title: "bike brakes 🚲", lane: "personal", status: "Resolved", completedAt: ago(6 * HOUR), outcome: "done finally!!" }),
  task("t-overdue-personal", { title: "Passport renewal paperwork", lane: "personal", status: "Ongoing", expected: ago(3 * DAY), action: "Post the forms" }),
  task("t-unsorted-a", { title: "Something logged before any of this existed", status: "New", createdAt: ago(3 * HOUR) }),
  task("t-unsorted-b", { title: "Another one from before, with a deliberately long title to shake the layout out of shape", status: "Ongoing", createdAt: ago(3 * HOUR), expected: ago(2 * DAY) }),
];

export const PAGES = [
  { id: "d1", at: ago(2 * HOUR), title: "Long day", text: "I need to stop taking the on-call handover cold.", mood: "low", suggestion: "" },
  { id: "d2", at: ago(7 * HOUR), title: "Better", text: "Felt clearer today.", mood: "calm", suggestion: "" },
];

/** The one line every diary test guards: this sentence must never reach a copied summary. */
export const PRIVATE_SENTENCE = "stop taking the on-call handover cold";

export const openApp = async (page: Page, tasks: unknown[] = WEEK, pages: unknown[] = PAGES) => {
  await page.addInitScript(([tasks, pages]) => {
    // Clipboard writes are captured rather than performed: headless Chromium has no real one,
    // and the assertions are about the TEXT, which is the part that gets pasted into a chat.
    (window as unknown as { __copied: string[] }).__copied = [];
    localStorage.setItem("signal-petal-issues", JSON.stringify(tasks));
    localStorage.setItem("signal-petal-diary", JSON.stringify(pages));
    localStorage.setItem("signal-petal-diary-log", "[]");
    localStorage.setItem("signal-petal-profile", JSON.stringify({ name: "Ewuresi", role: "SRE" }));
    localStorage.setItem("signal-petal-onboarding-complete", "true");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { (window as unknown as { __copied: string[] }).__copied.push(text); } },
    });
  }, [tasks, pages] as [unknown[], unknown[]]);
  await page.goto("/");
  /* The page is server-rendered, so the nav is on screen and clickable a beat before React
     has attached anything to it — a click landing in that gap does nothing at all, silently.

     The signal has to be something the SERVER could not have rendered. The seeded profile
     name is exactly that: with no localStorage the header says "YOUR WORKSPACE", and it only
     becomes the writer's name once hydration has run and read storage. The task count is not
     safe on its own — a seed of zero tasks matches the server's empty state, so the wait
     passes instantly and every click after it lands in the gap. */
  await expect(page.locator(".workspace header .eyebrow").first()).toContainText("EWURESI");
  if (tasks.length) {
    await expect(page.locator(".metric-card", { hasText: "All tasks" }).locator("strong")).toHaveText(String(tasks.length));
  }
};

/* The sidebar's own labels. Navigation goes through `.sidebar nav` and nothing else: the
   word "Review" also appears on a button inside every memory card, and the hidden second
   copy of that band sits earlier in the DOM, so a bare role lookup finds the wrong one. */
export type Screen = "Dashboard" | "Calendar" | "Insights" | "Diary" | "Weekly review" | "Settings";

export const go = async (page: Page, screen: Screen) => {
  /* Each nav button is an icon glyph plus a <span> with the label, so the button's own text
     is "◷ Weekly review" — the label lives on the span and that is what gets matched. */
  await page.locator(".sidebar nav span").filter({ hasText: new RegExp(`^${screen}$`) }).click();
};

/** The log form is opened from the header, which only offers it on the screens that have it. */
export const openLogForm = async (page: Page) => {
  await go(page, "Dashboard");
  await page.locator(".header-actions button", { hasText: "Log/Track" }).click();
  await expect(page.locator(".modal .lane-picker")).toBeVisible();
};

/** Opens a task's detail from the dashboard list.

   The card is a container with its own row of quick actions, so the part that opens the
   detail is `.issue-card-main` — clicking the card itself would land on whichever action
   button happened to be under the cursor. */
export const openTask = async (page: Page, needle: string) => {
  await go(page, "Dashboard");
  await page.locator(".issue-list .issue-card", { hasText: needle }).first().locator(".issue-card-main").click();
  await expect(page.locator(".detail-modal")).toBeVisible();
};

export const lastCopied = (page: Page) => page.evaluate(() => {
  const copied = (window as unknown as { __copied: string[] }).__copied;
  return copied[copied.length - 1] ?? "";
});

export const storedTask = (page: Page, id: string) => page.evaluate((id) => {
  const all = JSON.parse(localStorage.getItem("signal-petal-issues") ?? "[]") as Array<Record<string, unknown>>;
  return all.find(task => task.id === id) ?? null;
}, id);

export const test = base;
export { expect };
