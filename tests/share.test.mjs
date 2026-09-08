import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSnapshot, shareableIssues, toSharedTask, isSharedSnapshot, expiryFrom } from "../app/share.ts";

const issue = over => ({
  id: "i1", title: "Rotate the staging certificate", details: "see https://grafana.internal/d/tls",
  owner: "Ewuresi", action: "", expected: "2026-09-10T15:00", createdAt: "2026-09-01T10:00:00.000Z",
  status: "Ongoing", outcome: "", followUpPeople: ["Kofi"], updates: [], lane: "professional", ...over,
});

test("personal work is never offered for sharing", () => {
  const list = [issue({ id: "a" }), issue({ id: "b", lane: "personal" }), issue({ id: "c", lane: undefined })];
  assert.deepEqual(shareableIssues(list).map(item => item.id), ["a", "c"]);
});

test("archived work is not offered either", () => {
  assert.deepEqual(shareableIssues([issue({ id: "a", archivedAt: "2026-09-01T00:00:00.000Z" })]), []);
});

test("a personal task cannot be shared even if it is asked for by id", () => {
  /* The filter is applied again at build time: what was ticked and what is allowed
     can disagree if the task became personal in between. */
  const snapshot = buildSnapshot([issue({ id: "p", lane: "personal" })], ["p"], { title: "Handover", sharedBy: "Ewuresi" });
  assert.deepEqual(snapshot.tasks, []);
});

test("a shared task carries nothing private", () => {
  const shared = toSharedTask(issue({
    attachments: [{ id: "x", name: "screenshot.png", addedAt: "", bytes: 1, dataUrl: "data:image/png;base64,AA" }],
    memory: { symptoms: "s", rootCause: "r", resolution: "res", learning: "private lesson", followUp: "f", shareable: "The certificate now rotates on its own." },
  }));
  const text = JSON.stringify(shared);
  assert.ok(!text.includes("private lesson"), "what you tell yourself is not what you tell the team");
  assert.ok(!text.includes("data:image"), "attachments never leave the browser");
  assert.ok(!text.includes("rootCause"));
  assert.equal(shared.shareable, "The certificate now rotates on its own.");
});

test("links written in a task come along so they are clickable", () => {
  assert.deepEqual(toSharedTask(issue({})).links, ["https://grafana.internal/d/tls"]);
});

test("only the chosen tasks are in the snapshot", () => {
  const snapshot = buildSnapshot([issue({ id: "a" }), issue({ id: "b" })], ["b"], { title: "Handover", sharedBy: "Ewuresi" });
  assert.deepEqual(snapshot.tasks.map(task => task.id), ["b"]);
  assert.equal(snapshot.title, "Handover");
  assert.equal(snapshot.sharedBy, "Ewuresi");
});

test("an untitled share still gets a name", () => {
  assert.equal(buildSnapshot([issue({})], ["i1"], { title: "   ", sharedBy: "" }).title, "Shared work");
});

test("a snapshot validates, and something else does not", () => {
  assert.equal(isSharedSnapshot(buildSnapshot([issue({})], ["i1"], { title: "H", sharedBy: "E" })), true);
  assert.equal(isSharedSnapshot({ title: "H" }), false);
  assert.equal(isSharedSnapshot(null), false);
});

test("an expiry window is a date, and no window is no date", () => {
  const from = Date.parse("2026-09-04T00:00:00.000Z");
  assert.equal(expiryFrom("7", from)?.toISOString(), "2026-09-11T00:00:00.000Z");
  assert.equal(expiryFrom("", from), null);
});
