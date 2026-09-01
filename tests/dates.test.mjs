import { test } from "node:test";
import assert from "node:assert/strict";

import { startOfWeek, addDays, toDateTimeInput, weekLabel, daysSince, dateLabel, dayKey, dayBefore, spanLabel, advanceDate } from "../app/dates.ts";

/* Every date here is built with the local constructor rather than parsed from a string, so
   these assertions hold in any time zone — including the ones where a UTC-parsed date lands
   on the day before. */
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

test("a week starts on Monday, and Monday starts itself", () => {
  assert.equal(startOfWeek(at(2026, 8, 31)).getDate(), 31); // a Monday
  assert.equal(startOfWeek(at(2026, 9, 6)).getDate(), 31);  // the Sunday still belongs to it
  assert.equal(startOfWeek(at(2026, 9, 7)).getDate(), 7);   // the next Monday starts the next
});

test("a week is stripped back to midnight, whatever time of day it is asked about", () => {
  const start = startOfWeek(at(2026, 8, 31, 23, 59));
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
});

test("adding days crosses months and years", () => {
  assert.equal(toDateTimeInput(addDays(at(2026, 8, 31), 7)).slice(0, 10), "2026-09-07");
  assert.equal(toDateTimeInput(addDays(at(2026, 12, 30), 3)).slice(0, 10), "2027-01-02");
  assert.equal(toDateTimeInput(addDays(at(2026, 3, 1), -1)).slice(0, 10), "2026-02-28");
});

test("the datetime-local value keeps the wall-clock time it was given", () => {
  assert.equal(toDateTimeInput(at(2026, 8, 31, 9, 5)), "2026-08-31T09:05");
});

test("a week label names both ends, even across a month", () => {
  assert.equal(weekLabel(at(2026, 8, 31)), "Aug 31 – Sep 6");
  assert.equal(weekLabel(at(2026, 9, 7)), "Sep 7 – Sep 13");
});

test("days since counts whole days, and today is zero", () => {
  assert.equal(daysSince(new Date().toISOString()), 0);
  assert.equal(daysSince(new Date(Date.now() - 3 * 86400000).toISOString()), 3);
});

test("a date label says the day and the time, and names the gap when there is none", () => {
  assert.match(dateLabel(at(2026, 8, 31, 14, 30).toISOString()), /Aug 31.*2:30/);
  // An undated task reads as "No ETA" rather than a blank, so the gap is visible in the UI.
  assert.equal(dateLabel(""), "No ETA");
});

test("day keys are local, sortable, and step backwards across boundaries", () => {
  assert.equal(dayKey(at(2026, 8, 31, 23, 30).toISOString()), "2026-08-31");
  assert.equal(dayBefore("2026-09-01"), "2026-08-31");
  assert.equal(dayBefore("2027-01-01"), "2026-12-31");
  assert.equal(dayBefore("2026-03-01"), "2026-02-28");
});

test("a span reads in the largest unit that still means something", () => {
  const from = at(2026, 8, 31, 9, 0).toISOString();
  const span = (minutes) => spanLabel(from, new Date(at(2026, 8, 31, 9, 0).getTime() + minutes * 60000).toISOString());
  assert.equal(span(1), "1 minute");
  assert.equal(span(45), "45 minutes");
  assert.equal(span(60), "1 hour");
  assert.equal(span(35 * 60), "35 hours");
  assert.equal(span(48 * 60), "2 days");
  // Work that finished the instant it was logged still reads as time passing, not as zero.
  assert.equal(span(0), "1 minute");
});

/* Cadence arithmetic. The failure everyone hits is the end of the month, so it gets most of
   the attention here. */
test("weeks advance by sevens", () => {
  assert.equal(toDateTimeInput(advanceDate(at(2026, 8, 31), 1, "week")).slice(0, 10), "2026-09-07");
  assert.equal(toDateTimeInput(advanceDate(at(2026, 8, 31), 2, "week")).slice(0, 10), "2026-09-14");
});

test("a monthly cadence lands on the same date, and clamps when that date does not exist", () => {
  assert.equal(toDateTimeInput(advanceDate(at(2026, 1, 15), 1, "month")).slice(0, 10), "2026-02-15");
  // 31 January plus a month is the last day of February, NOT the 3rd of March.
  assert.equal(toDateTimeInput(advanceDate(at(2026, 1, 31), 1, "month")).slice(0, 10), "2026-02-28");
  assert.equal(toDateTimeInput(advanceDate(at(2028, 1, 31), 1, "month")).slice(0, 10), "2028-02-29");
  assert.equal(toDateTimeInput(advanceDate(at(2026, 3, 31), 1, "month")).slice(0, 10), "2026-04-30");
});

test("clamping does not make the cadence drift permanently", () => {
  // Anchored on the 31st each time, a short month must not pull every later round back to it.
  const january = at(2026, 1, 31);
  assert.equal(toDateTimeInput(advanceDate(january, 1, "month")).slice(0, 10), "2026-02-28");
  assert.equal(toDateTimeInput(advanceDate(january, 2, "month")).slice(0, 10), "2026-03-31");
  assert.equal(toDateTimeInput(advanceDate(january, 3, "month")).slice(0, 10), "2026-04-30");
});

test("quarters, half-years and years cross the year boundary", () => {
  assert.equal(toDateTimeInput(advanceDate(at(2026, 11, 15), 3, "month")).slice(0, 10), "2027-02-15");
  assert.equal(toDateTimeInput(advanceDate(at(2026, 10, 1), 6, "month")).slice(0, 10), "2027-04-01");
  assert.equal(toDateTimeInput(advanceDate(at(2026, 8, 31), 1, "year")).slice(0, 10), "2027-08-31");
  assert.equal(toDateTimeInput(advanceDate(at(2028, 2, 29), 1, "year")).slice(0, 10), "2029-02-28");
});

test("the time of day is carried along", () => {
  assert.equal(toDateTimeInput(advanceDate(at(2026, 8, 31, 16, 30), 3, "month")), "2026-11-30T16:30");
});
