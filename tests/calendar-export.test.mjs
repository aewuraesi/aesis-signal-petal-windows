import { test } from "node:test";
import assert from "node:assert/strict";
import { issuesToCalendar } from "../app/calendar-export.ts";

const issue = overrides => ({ id: "t1", title: "Rotate keys", details: "", owner: "Aesi", action: "Update vault", expected: "2026-09-10T09:00", createdAt: "2026-09-01T09:00:00.000Z", status: "Ongoing", outcome: "", followUpPeople: [], updates: [], ...overrides });

test("calendar export contains active dated work and excludes finished work", () => {
  const text = issuesToCalendar([issue({ project: "Security" }), issue({ id: "done", status: "Resolved" }), issue({ id: "undated", expected: "" })], new Date("2026-09-07T12:00:00.000Z"));
  assert.match(text, /SUMMARY:Rotate keys/);
  assert.match(text, /Project: Security/);
  assert.doesNotMatch(text, /UID:done/);
  assert.doesNotMatch(text, /UID:undated/);
});
