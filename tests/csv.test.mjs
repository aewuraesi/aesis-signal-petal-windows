import { test } from "node:test";
import assert from "node:assert/strict";

import { csvCell, toCsv, issuesToCsv, csvFileName } from "../app/csv.ts";

const task = (over = {}) => ({
  id: "t1", title: "A task", details: "", owner: "Ewuresi", action: "", expected: "",
  createdAt: "2026-08-24T09:00:00.000Z", status: "Ongoing", outcome: "", followUpPeople: [],
  updates: [], ...over,
});

test("ordinary text is left exactly as it is", () => {
  assert.equal(csvCell("Payment retry queue"), "Payment retry queue");
  assert.equal(csvCell(""), "");
  assert.equal(csvCell(undefined), "");
  assert.equal(csvCell(null), "");
});

test("commas, quotes and newlines are quoted rather than breaking the row", () => {
  assert.equal(csvCell("Rotated, verified, signed off"), '"Rotated, verified, signed off"');
  assert.equal(csvCell('She said "later"'), '"She said ""later"""');
  // A pasted log with real newlines in it must stay one cell.
  assert.equal(csvCell("line one\nline two"), '"line one\nline two"');
  assert.equal(csvCell("carriage\r\nreturn"), '"carriage\r\nreturn"');
});

test("a cell that would be read as a formula is defused", () => {
  // These execute on open in Excel and Sheets. The apostrophe is not shown in the cell.
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("+44 20 7946 0018"), "'+44 20 7946 0018");
  assert.equal(csvCell("@channel please review"), "'@channel please review");
  // A leading dash is left alone: it starts ordinary sentences far more often than formulas.
  assert.equal(csvCell("- first bullet"), "- first bullet");
});

test("a formula cell that also needs quoting gets both", () => {
  assert.equal(csvCell('=SUM(A1,A2)'), `"'=SUM(A1,A2)"`);
});

test("rows are joined with CRLF, which is what spreadsheets expect", () => {
  assert.equal(toCsv([["a", "b"], ["c", "d"]]), "a,b\r\nc,d");
});

test("the export carries the columns someone would actually sort by", () => {
  const csv = issuesToCsv([task({
    title: "Certificate rotation",
    lane: "professional",
    status: "Resolved",
    completedAt: "2026-08-28T10:00:00.000Z",
    outcome: "Rotated and verified",
    followUpPeople: ["Francis Wilson", "Maya Chen"],
    repeat: { every: 3, unit: "month" },
    memory: { symptoms: "", rootCause: "", resolution: "", learning: "Start a week earlier.", followUp: "", shareable: "TLS rotation completed ahead of expiry" },
  })]);
  const [headings, row] = csv.split("\r\n");
  assert.match(headings, /^Title,Professional or personal,Status,Owner,Logged,Due,Completed/);
  assert.match(row, /Certificate rotation/);
  assert.match(row, /professional/);
  assert.match(row, /TLS rotation completed ahead of expiry/);
  assert.match(row, /Start a week earlier\./);
  assert.match(row, /Francis Wilson; Maya Chen/);
  assert.match(row, /Every 3 months/);
});

test("a task with no lane says so rather than leaving a hole", () => {
  const row = issuesToCsv([task({ title: "Older thing" })].map(item => item)).split("\r\n")[1];
  assert.match(row, /Older thing,not sorted/);
});

test("lateness is a number for open work and blank once it is done", () => {
  const late = issuesToCsv([task({ title: "Late", expected: new Date(Date.now() - 5 * 86400000).toISOString() })]).split("\r\n")[1];
  assert.match(late, /,5,/);
  const done = issuesToCsv([task({ title: "Done", expected: new Date(Date.now() - 5 * 86400000).toISOString(), completedAt: "2026-08-28T10:00:00.000Z" })]).split("\r\n")[1];
  assert.doesNotMatch(done, /,5,/);
});

test("every row has the same number of cells, whatever is in them", () => {
  const cells = (line) => (line.match(/(^|,)("([^"]|"")*"|[^,]*)/g) ?? []).length;
  const csv = issuesToCsv([
    task({ title: 'A "quoted", comma-laden title', outcome: "line one\nline two" }),
    task({ id: "t2", title: "Plain" }),
  ]);
  const lines = csv.split(/\r\n(?=(?:[^"]|"[^"]*")*$)/);
  assert.equal(lines.length, 3);
  assert.equal(new Set(lines.map(cells)).size, 1);
});

test("the file is named for the day it was saved", () => {
  assert.match(csvFileName(), /^signal-petal-tasks-\d{4}-\d{2}-\d{2}\.csv$/);
});

/* ---------------------------------------------------------------------------
   Reading a spreadsheet back in.
--------------------------------------------------------------------------- */
import { parseCsv, guessColumns, rowsToIssues, rowId } from "../app/csv.ts";

const STATUSES = ["New", "Ongoing", "Blocked", "Resolved"];

test("a comma inside a quoted cell does not split the row", () => {
  assert.deepEqual(parseCsv('a,"b,c",d'), [["a", "b,c", "d"]]);
});

test("a newline inside a quoted cell stays inside the cell", () => {
  /* This is the case that matters: pasted logs have newlines in them. */
  assert.deepEqual(parseCsv('title,details\r\n"Cert expiry","line one\nline two"'),
    [["title", "details"], ["Cert expiry", "line one\nline two"]]);
});

test("a doubled quote is one quote", () => {
  assert.deepEqual(parseCsv('"she said ""no"""'), [['she said "no"']]);
});

test("a leading byte-order mark is not part of the first heading", () => {
  assert.deepEqual(parseCsv("﻿title,owner"), [["title", "owner"]]);
});

test("blank rows are dropped", () => {
  assert.deepEqual(parseCsv("a,b\r\n\r\n,\r\nc,d"), [["a", "b"], ["c", "d"]]);
});

test("columns are guessed from the headings a list actually arrives with", () => {
  assert.deepEqual(guessColumns(["Summary", "Assignee", "State", "Due date"]),
    { title: 0, owner: 1, status: 2, due: 3 });
});

test("one heading is not claimed by two fields", () => {
  const mapping = guessColumns(["Task", "Task owner"]);
  assert.notEqual(mapping.title, mapping.owner);
});

test("a row with no title is skipped and named", () => {
  const { issues, skipped } = rowsToIssues([["", "Ewuresi"], ["Rotate the cert", "Ewuresi"]],
    { title: 0, owner: 1 }, { statuses: STATUSES, defaultOwner: "Ewuresi" });
  assert.equal(issues.length, 1);
  assert.deepEqual(skipped, [{ row: 2, reason: "no title" }]);
});

test("an unreadable due date is left empty rather than guessed", () => {
  /* A half-understood date would start counting the task as late. */
  const { issues } = rowsToIssues([["Rotate the cert", "sometime soon"]], { title: 0, due: 1 },
    { statuses: STATUSES, defaultOwner: "Ewuresi" });
  assert.equal(issues[0].expected, "");
});

test("a status the workspace does not have becomes New", () => {
  const { issues } = rowsToIssues([["A", "In Review"], ["B", "blocked"]], { title: 0, status: 1 },
    { statuses: STATUSES, defaultOwner: "Ewuresi" });
  assert.equal(issues[0].status, "New");
  assert.equal(issues[1].status, "Blocked", "matching ignores case");
});

test("a row that arrives finished gets the stamp that puts it in the right week", () => {
  const { issues } = rowsToIssues([["A", "Resolved"]], { title: 0, status: 1 },
    { statuses: STATUSES, defaultOwner: "Ewuresi" });
  assert.ok(issues[0].completedAt, "without this it would never appear in a summary");
});

test("the owner falls back to you when the sheet has none", () => {
  const { issues } = rowsToIssues([["A", ""]], { title: 0, owner: 1 },
    { statuses: STATUSES, defaultOwner: "Ewuresi" });
  assert.equal(issues[0].owner, "Ewuresi");
});

test("importing the same file twice does not duplicate the work", () => {
  const rows = [["Rotate the cert", "Ewuresi"]];
  const first = rowsToIssues(rows, { title: 0, owner: 1 }, { statuses: STATUSES, defaultOwner: "Ewuresi" });
  const second = rowsToIssues(rows, { title: 0, owner: 1 }, { statuses: STATUSES, defaultOwner: "Ewuresi" });
  assert.equal(first.issues[0].id, second.issues[0].id, "a stable id lets the merge update instead of adding");
});

test("a repeated row inside one file is imported once", () => {
  const { issues, skipped } = rowsToIssues([["A", "Ewuresi"], ["A", "Ewuresi"]], { title: 0, owner: 1 },
    { statuses: STATUSES, defaultOwner: "Ewuresi" });
  assert.equal(issues.length, 1);
  assert.equal(skipped.length, 1);
});

test("an imported task carries no machine-written history", () => {
  const { issues } = rowsToIssues([["A"]], { title: 0 }, { statuses: STATUSES, defaultOwner: "Ewuresi" });
  assert.deepEqual(issues[0].updates, []);
});

test("a row id is stable for the same content and different for different content", () => {
  assert.equal(rowId(["a", "b"]), rowId(["a", "b"]));
  assert.notEqual(rowId(["a", "b"]), rowId(["a", "c"]));
});
