/* Tasks as a spreadsheet.

   The backup file is for restoring the app; this is for reading. It is the only way to get
   the work into something that sorts, filters and adds up — a quarter's record in front of
   someone, a year's work in a column.

   Escaping is the whole job here, and it is why this is a module with tests rather than a
   template string: the data is full of pasted logs with commas, quotes and newlines in them,
   and a CSV that breaks on one row breaks every row after it. */

import type { Issue } from "./backup.ts";
import { dateLabel } from "./dates.ts";

/* A leading =, +, @, tab or carriage return makes a spreadsheet treat the cell as a formula.
   A pasted log line can easily start that way. The apostrophe is the standard defusing: it
   is not shown in the cell, and the text stays exactly as written.

   A leading "-" is left alone on purpose. It starts a formula too, but it far more often
   starts an ordinary sentence or a negative number, and mangling every one of those to guard
   a case that cannot execute anything by itself is the worse trade. */
const FORMULA_LEAD = /^[=+@\t\r]/;

export const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  const guarded = FORMULA_LEAD.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

/* CRLF because that is what the format says and what spreadsheets expect. */
export const toCsv = (rows: unknown[][]) => rows.map(row => row.map(csvCell).join(",")).join("\r\n");

const HEADINGS = [
  "Title", "Professional or personal", "Status", "Owner", "Logged", "Due", "Completed",
  "Days late", "Outcome", "How you'd say it outside the team", "What you'd tell yourself next time",
  "Follow-up people", "Repeats", "Current action",
];

const lateness = (issue: Issue) => {
  if (!issue.expected || issue.completedAt) return "";
  const days = Math.floor((Date.now() - new Date(issue.expected).getTime()) / 86400000);
  return days > 0 ? String(days) : "";
};

const cadence = (issue: Issue) => issue.repeat ? `Every ${issue.repeat.every} ${issue.repeat.unit}${issue.repeat.every === 1 ? "" : "s"}` : "";

export const issuesToCsv = (issues: Issue[]) => toCsv([
  HEADINGS,
  ...issues.map(issue => [
    issue.title,
    issue.lane ?? "not sorted",
    issue.status,
    issue.owner,
    dateLabel(issue.createdAt),
    issue.expected ? dateLabel(issue.expected) : "",
    issue.completedAt ? dateLabel(issue.completedAt) : "",
    lateness(issue),
    issue.outcome,
    issue.memory?.shareable ?? "",
    issue.memory?.learning ?? "",
    issue.followUpPeople.join("; "),
    cadence(issue),
    issue.action,
  ]),
]);

export const csvFileName = () => {
  const now = new Date();
  return `signal-petal-tasks-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.csv`;
};
