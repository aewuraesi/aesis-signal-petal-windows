import { test } from "node:test";
import assert from "node:assert/strict";

import { isCompleteStatus, statusClass, completedAtOf, isOverdue, daysOverdue, nextDue, nextOccurrence } from "../app/tasks.ts";

const task = (over = {}) => ({
  id: "t1", title: "A task", details: "", owner: "Ewuresi", action: "", expected: "",
  createdAt: "2026-08-24T09:00:00.000Z", status: "Ongoing", outcome: "", followUpPeople: [],
  updates: [{ id: "u1", at: "2026-08-24T09:00:00.000Z", author: "Ewuresi", text: "Issue logged." }],
  ...over,
});

test("only Resolved and Closed count as finished", () => {
  assert.equal(isCompleteStatus("Resolved"), true);
  assert.equal(isCompleteStatus("Closed"), true);
  for (const open of ["New", "Ongoing", "Blocked", "Waiting on dev", "Pending Monitoring"]) {
    assert.equal(isCompleteStatus(open), false, open);
  }
});

test("a status becomes a css class safely, whatever it is called", () => {
  assert.equal(statusClass("Waiting on dev"), "status waiting-on-dev");
  assert.equal(statusClass("Pending Monitoring"), "status pending-monitoring");
  // A custom status with punctuation or trailing spaces must not produce a broken class.
  assert.equal(statusClass("  Needs sign-off!  "), "status needs-sign-off");
});

test("when a task ended: the explicit stamp, then its last update, then when it was logged", () => {
  assert.equal(completedAtOf(task({ completedAt: "2026-08-28T10:00:00.000Z" })), "2026-08-28T10:00:00.000Z");
  // No stamp: the last update stands in. This is what decides which week it shipped in, and
  // it is why bumping updatedAt alone cannot move a task between weeks.
  assert.equal(
    completedAtOf(task({ updates: [{ id: "u1", at: "2026-08-24T09:00:00.000Z" }, { id: "u2", at: "2026-08-27T16:00:00.000Z" }] })),
    "2026-08-27T16:00:00.000Z",
  );
  assert.equal(completedAtOf(task({ updates: [] })), "2026-08-24T09:00:00.000Z");
});

test("overdue means open, dated, and past", () => {
  const past = new Date(Date.now() - 3 * 86400000).toISOString();
  const future = new Date(Date.now() + 3 * 86400000).toISOString();
  assert.ok(isOverdue(task({ expected: past })));
  assert.ok(!isOverdue(task({ expected: future })));
  // Finished work is never overdue, however late it was.
  assert.ok(!isOverdue(task({ expected: past, status: "Resolved" })));
  // Neither is work nobody has given a date to — an undated task is not late, just undated.
  assert.ok(!isOverdue(task({ expected: "" })));
});

test("lateness is counted in whole days and never reads as zero", () => {
  /* A hair under three days, not exactly three: lateness is rounded UP, so an exact multiple
     becomes four the moment the clock ticks between building the date and reading it. */
  assert.equal(daysOverdue(task({ expected: new Date(Date.now() - (3 * 86400000 - 60000)).toISOString() })), 3);
  // A deadline that passed minutes ago is "1 day past", because "0 days past" says nothing.
  assert.equal(daysOverdue(task({ expected: new Date(Date.now() - 60000).toISOString() })), 1);
});

const local = (y, m, d, h = 9, min = 0) => new Date(y, m - 1, d, h, min);
const repeating = (over = {}) => task({ repeat: { every: 3, unit: "month" }, expected: "2026-03-31T09:00", ...over });

test("a one-off has no next round", () => {
  assert.equal(nextDue(task(), local(2026, 4, 2)), null);
  assert.equal(nextOccurrence(task(), local(2026, 4, 2), "new-id"), null);
});

test("the next round is counted from when it was DUE, not when it was finished", () => {
  // Finished three weeks late; the quarter must not slip by three weeks.
  const due = nextDue(repeating(), local(2026, 4, 21));
  assert.equal(due.getFullYear(), 2026);
  assert.equal(due.getMonth() + 1, 6);
  assert.equal(due.getDate(), 30); // 31 March plus three months, clamped to a 30-day June
});

test("finishing something very late still schedules ahead, never behind", () => {
  const due = nextDue(repeating(), local(2027, 5, 4));
  assert.ok(due.getTime() > local(2027, 5, 4).getTime(), `next round landed in the past: ${due}`);
});

test("a task with no date at all counts from when it was finished", () => {
  const due = nextDue(repeating({ expected: "" }), local(2026, 4, 2));
  assert.equal(due.getMonth() + 1, 7);
  assert.equal(due.getDate(), 2);
});

test("the next round keeps the work and drops the last round's results", () => {
  const finished = repeating({
    status: "Resolved", outcome: "Rotated the certificate", completedAt: "2026-04-02T10:00:00.000Z",
    focusHandledAt: "2026-04-01T10:00:00.000Z", lane: "professional", followUpPeople: ["Francis Wilson"],
    memory: { symptoms: "", rootCause: "", resolution: "Rotated it", learning: "Start a week earlier.", followUp: "" },
  });
  const next = nextOccurrence(finished, local(2026, 4, 2), "round-2");

  assert.equal(next.id, "round-2");
  assert.equal(next.title, finished.title);
  assert.equal(next.lane, "professional");
  assert.deepEqual(next.followUpPeople, ["Francis Wilson"]);
  assert.deepEqual(next.repeat, { every: 3, unit: "month" });
  assert.equal(next.repeatedFrom, finished.id);

  // Everything that belonged to the round just finished stays with it.
  assert.equal(next.status, "New");
  assert.equal(next.outcome, "");
  assert.equal(next.completedAt, undefined);
  assert.equal(next.focusHandledAt, undefined);
  assert.equal(next.memory, undefined);
  assert.equal(next.updates.length, 1);
});
