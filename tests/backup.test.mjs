import { test } from "node:test";
import assert from "node:assert/strict";

import { encodeTransfer, decodeTransfer, isValidPayload, normaliseIssues, backupFileName, mergeTransferData } from "../app/backup.ts";

const issue = overrides => ({
  id: "i1", title: "Atlas PIN lookup failures", details: "PINs come back empty", owner: "Aesi",
  action: "", expected: "2026-08-22T15:00:00.000Z", createdAt: "2026-08-21T10:00:00.000Z",
  status: "Ongoing", outcome: "", followUpPeople: ["Chinonso"],
  updates: [{ id: "u1", at: "2026-08-21T10:00:00.000Z", author: "Aesi", text: "Issue logged." }],
  ...overrides,
});

const payload = overrides => ({
  version: 2,
  issues: [issue()],
  statuses: ["New", "Ongoing", "Resolved"],
  statusColors: { New: "#eee", Ongoing: "#ddd", Resolved: "#ccc" },
  diaryEntries: [{ id: "d1", at: "2026-08-21T18:00:00.000Z", title: "Long day", text: "Still chasing the list.", mood: "anxious", suggestion: "", issueIds: ["i1"] }],
  diaryLog: [{ id: "e1", entryId: "d1", at: "2026-08-21T18:00:00.000Z", action: "created", title: "Long day", mood: "anxious", detail: "5 words" }],
  dailyCheckIns: [{ id: "c1", at: "2026-08-21T18:30:00.000Z", capacity: "steady", note: "Start with Atlas.", parkedIssueIds: [], brief: "Capacity feels steady." }],
  profile: { name: "Aesi", role: "SRE" },
  settings: { theme: "petal", darkMode: false, reminderTime: "16:30", diaryFont: "hand", diaryPaper: "cream" },
  ...overrides,
});

test("the shareable line survives the round trip with the rest of the notes", () => {
  const memory = { symptoms: "", rootCause: "", resolution: "Raised the timeout", learning: "Alarm on timeouts.", followUp: "", shareable: "Payment retry backlog cleared" };
  const back = decodeTransfer(encodeTransfer(payload({ issues: [issue({ lane: "professional", memory })] })));
  assert.deepEqual(back.issues[0].memory, memory);
  // A record written before the field existed must still load, with no shareable line.
  const older = normaliseIssues([issue({ memory: { symptoms: "", rootCause: "", resolution: "Fixed", learning: "Note", followUp: "" } })]);
  assert.equal(older[0].memory.shareable, undefined);
});

test("a task's lane survives the round trip, and a nonsense one is dropped", () => {
  const original = payload({ issues: [issue({ lane: "professional" }), issue({ id: "i2", lane: "personal" }), issue({ id: "i3" })] });
  const back = decodeTransfer(encodeTransfer(original));
  assert.deepEqual(back.issues.map(item => item.lane), ["professional", "personal", undefined]);
  // An old backup, or a hand-edited one, must not smuggle a third lane into the summaries.
  const cleaned = normaliseIssues([issue({ lane: "work" }), issue({ id: "i2", lane: "personal" })]);
  assert.equal(cleaned[0].lane, undefined);
  assert.equal(cleaned[1].lane, "personal");
});

test("a backup survives the round trip unchanged", () => {
  const original = payload();
  assert.deepEqual(decodeTransfer(encodeTransfer(original)), original);
});

test("the round trip keeps non-ASCII text intact", () => {
  const original = payload({ diaryEntries: [{ id: "d1", at: "2026-08-21T18:00:00.000Z", title: "Café — résumé", text: "Ewurɛsi wrote “this”… 🌍", mood: "calm", suggestion: "" }] });
  assert.equal(decodeTransfer(encodeTransfer(original)).diaryEntries[0].text, "Ewurɛsi wrote “this”… 🌍");
});

test("valid payloads are accepted at both versions", () => {
  assert.equal(isValidPayload(payload()), true);
  assert.equal(isValidPayload(payload({ version: 1 })), true);
});

test("anything that is not a backup is rejected before it can replace data", () => {
  for (const bad of [
    null, undefined, 42, "a string", [],
    payload({ version: 3 }),
    payload({ version: undefined }),
    payload({ issues: undefined }),
    payload({ issues: "not an array" }),
    payload({ statuses: undefined }),
    payload({ statusColors: undefined }),
    payload({ statusColors: "not an object" }),
    { hello: "world" },
  ]) assert.equal(isValidPayload(bad), false, `should reject ${JSON.stringify(bad)?.slice(0, 40)}`);
});

test("an issue saved before follow-up people existed gets an array back", () => {
  const [restored] = normaliseIssues([issue({ followUpPeople: undefined })]);
  assert.deepEqual(restored.followUpPeople, []);
  assert.equal(restored.title, "Atlas PIN lookup failures");
});

test("existing follow-up people are left alone", () => {
  assert.deepEqual(normaliseIssues([issue()])[0].followUpPeople, ["Chinonso"]);
});

test("generated related-work guesses are removed without touching real updates", () => {
  const generated = { id: "auto", at: "2026-08-21T10:01:00.000Z", author: "Signal Petal", text: "Related past work: Work on my tracker Portal. Review those resolutions before starting from zero." };
  const real = { id: "real", at: "2026-08-21T10:02:00.000Z", author: "Signal Petal", text: "A genuine recorded update." };
  const [restored] = normaliseIssues([issue({ updates: [issue().updates[0], generated, real] })]);
  assert.deepEqual(restored.updates.map(update => update.id), ["u1", "real"]);
});

test("Focus now handled timestamps survive restore and malformed values are dropped", () => {
  const handledAt = "2026-08-24T10:30:00.000Z";
  assert.equal(normaliseIssues([issue({ focusHandledAt: handledAt })])[0].focusHandledAt, handledAt);
  assert.equal(normaliseIssues([issue({ focusHandledAt: 42 })])[0].focusHandledAt, undefined);
});

test("daily briefs survive the backup round trip", () => {
  const restored = decodeTransfer(encodeTransfer(payload()));
  assert.equal(restored.dailyCheckIns[0].capacity, "steady");
  assert.equal(restored.dailyCheckIns[0].note, "Start with Atlas.");
});

test("structured operational memory survives the backup round trip", () => {
  const memory = { symptoms: "PINs missing", rootCause: "Empty upstream response", resolution: "Added fallback", learning: "Alert on empty bodies", followUp: "Update runbook" };
  const restored = decodeTransfer(encodeTransfer(payload({ issues: [issue({ memory, relatedIssueIds: ["old-1"] })] })));
  assert.deepEqual(restored.issues[0].memory, memory);
  assert.deepEqual(restored.issues[0].relatedIssueIds, ["old-1"]);
});

test("a locked backup carries ciphertext and no readable entries", () => {
  const locked = payload({ diaryEntries: [], diaryLog: [], diaryVault: { salt: "c2FsdA==", iv: "aXZpdml2", data: "Y2lwaGVy" } });
  const restored = decodeTransfer(encodeTransfer(locked));
  assert.equal(restored.diaryEntries.length, 0);
  assert.equal(restored.diaryVault.data, "Y2lwaGVy");
  assert.ok(!JSON.stringify(restored).includes("Still chasing"));
});

test("a corrupt code throws rather than returning junk", () => {
  assert.throws(() => decodeTransfer("this is not base64 at all !!"));
});

test("the backup file is named for the day it was made", () => {
  assert.match(backupFileName(), /^signal-petal-backup-\d{4}-\d{2}-\d{2}\.json$/);
});

test("merge imports add missing records without removing local data", () => {
  const local = payload();
  const imported = payload({
    issues: [issue({ id: "i2", title: "New imported task" })],
    diaryEntries: [{ ...local.diaryEntries[0], id: "d2", title: "Imported page" }],
    diaryLog: [],
    dailyCheckIns: [{ ...local.dailyCheckIns[0], id: "c2" }],
  });
  const { payload: merged, summary } = mergeTransferData(local, imported);
  assert.deepEqual(new Set(merged.issues.map(item => item.id)), new Set(["i1", "i2"]));
  assert.deepEqual(new Set(merged.diaryEntries.map(item => item.id)), new Set(["d1", "d2"]));
  assert.equal(merged.dailyCheckIns.length, 2);
  assert.equal(summary.addedTasks, 1);
  assert.equal(summary.addedDiaryEntries, 1);
});

test("merge imports keep the latest matching record and combine task updates", () => {
  const local = payload({ issues: [issue({ title: "Local title" })] });
  const imported = payload({ issues: [issue({ title: "Latest title", updates: [issue().updates[0], { id: "u2", at: "2026-08-24T12:00:00.000Z", author: "Aesi", text: "Latest update" }] })] });
  const { payload: merged } = mergeTransferData(local, imported);
  assert.equal(merged.issues[0].title, "Latest title");
  assert.deepEqual(merged.issues[0].updates.map(item => item.id), ["u1", "u2"]);
});

test("diary deletion history prevents an old page from being resurrected", () => {
  const deleted = payload({ diaryEntries: [], diaryLog: [{ ...payload().diaryLog[0], action: "deleted", at: "2026-08-24T12:00:00.000Z" }] });
  const staleBackup = payload();
  const { payload: merged } = mergeTransferData(deleted, staleBackup);
  assert.equal(merged.diaryEntries.length, 0);
});
