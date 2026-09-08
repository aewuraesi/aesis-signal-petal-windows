import { test } from "node:test";
import assert from "node:assert/strict";

import { buildReminderSchedule, checkInMoment, dueSoonIssues, describeCheckIn, missedWhileAway, dayKeyOf } from "../app/reminders.ts";

const toInput = date => {
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const issue = over => ({
  id: "i1", title: "t", details: "", owner: "", action: "", expected: "", createdAt: "2026-09-01T09:00:00.000Z",
  status: "Ongoing", outcome: "", followUpPeople: [], updates: [], ...over,
});

test("work due inside a day counts, finished and archived work does not", () => {
  const soon = toInput(new Date(Date.now() + 3600000));
  assert.equal(dueSoonIssues([issue({ expected: soon })]).length, 1);
  assert.equal(dueSoonIssues([issue({ expected: soon, status: "Resolved" })]).length, 0);
  assert.equal(dueSoonIssues([issue({ expected: soon, archivedAt: "2026-09-01T00:00:00.000Z" })]).length, 0);
  assert.equal(dueSoonIssues([issue({ expected: "" })]).length, 0, "no date is not due soon");
});

test("work due next week is not due soon", () => {
  assert.equal(dueSoonIssues([issue({ expected: toInput(new Date(Date.now() + 7 * 86400000)) })]).length, 0);
});

test("the check-in moment is local wall-clock, like every other time here", () => {
  const now = new Date(2026, 8, 4, 9, 0, 0);
  const at = new Date(checkInMoment("16:30", now));
  assert.equal(at.getHours(), 16);
  assert.equal(at.getMinutes(), 30);
  assert.equal(dayKeyOf(at), "2026-09-04");
});

test("a time that cannot be read gives no moment rather than a wrong one", () => {
  assert.equal(checkInMoment("not a time", new Date()), null);
});

test("the schedule separates overdue from merely upcoming", () => {
  const schedule = buildReminderSchedule([
    issue({ id: "a", expected: toInput(new Date(Date.now() - 3600000)) }),
    issue({ id: "b", expected: toInput(new Date(Date.now() + 3600000)) }),
  ], { remindersOn: true, reminderTime: "16:30" });
  assert.equal(schedule.overdue, 1);
  assert.equal(schedule.upcoming, 1);
  assert.equal(schedule.remindersOn, true);
});

test("what the panel says before, after, and once it has gone", () => {
  const now = new Date(2026, 8, 4, 9, 0, 0);
  const schedule = buildReminderSchedule([], { remindersOn: true, reminderTime: "16:30", now });
  assert.match(describeCheckIn(schedule, [], now.getTime()), /Next check-in today at 16:30/);
  const later = new Date(2026, 8, 4, 18, 0, 0).getTime();
  assert.match(describeCheckIn(schedule, [], later), /has not been delivered yet/);
  const sent = [{ key: `check-in|${schedule.day}`, at: new Date(2026, 8, 4, 16, 30).getTime(), title: "Daily check-in" }];
  assert.match(describeCheckIn(schedule, sent, later), /was sent at/);
});

test("reminders off is said plainly rather than dressed up", () => {
  const schedule = buildReminderSchedule([], { remindersOn: false, reminderTime: "16:30" });
  assert.equal(describeCheckIn(schedule, []), "Reminders are off.");
});

test("only what fired while you were away is reported back", () => {
  const sent = [
    { key: "a", at: 1000, title: "Old" },
    { key: "b", at: 3000, title: "While away" },
  ];
  assert.deepEqual(missedWhileAway(sent, 2000, 4000).map(record => record.title), ["While away"]);
  assert.deepEqual(missedWhileAway(sent, null, 4000), [], "a first visit has nothing to catch up on");
});
