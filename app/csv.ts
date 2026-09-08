/* Tasks as a spreadsheet.

   The backup file is for restoring the app; this is for reading. It is the only way to get
   the work into something that sorts, filters and adds up — a quarter's record in front of
   someone, a year's work in a column.

   Escaping is the whole job here, and it is why this is a module with tests rather than a
   template string: the data is full of pasted logs with commas, quotes and newlines in them,
   and a CSV that breaks on one row breaks every row after it. */

import type { Issue, Status, Lane } from "./backup.ts";
import { dateLabel, toDateTimeInput } from "./dates.ts";
import { isCompleteStatus } from "./tasks.ts";

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
  "Days late", "Project", "Service", "Tags", "Outcome", "How you'd say it outside the team", "What you'd tell yourself next time",
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
    issue.project ?? "",
    issue.service ?? "",
    (issue.tags ?? []).join("; "),
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

/* ---------------------------------------------------------------------------
   Reading a spreadsheet back in.

   Everything in this app had to be typed. A list of work already exists somewhere
   - a handover sheet, a ticket export, a list someone sent - and retyping it is
   the reason it never gets logged at all.

   Parsing is the same job as escaping, in reverse, and it has the same trap: a
   pasted log line with a comma or a newline inside a quoted cell. A parser that
   splits on commas is wrong on exactly the data this app collects.
--------------------------------------------------------------------------- */

/** Rows of raw cells. Handles quoted cells, escaped quotes, CRLF and a leading BOM. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  /* Excel writes a byte-order mark; left in place it becomes part of the first heading. */
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character !== '"') { cell += character; continue; }
      if (source[index + 1] === '"') { cell += '"'; index += 1; continue; }
      quoted = false;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === ",") { row.push(cell); cell = ""; continue; }
    if (character === "\r") continue;
    if (character === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += character;
  }
  row.push(cell);
  rows.push(row);
  /* A trailing newline leaves one empty row, and a spreadsheet often has several. */
  return rows.filter(item => item.some(value => value.trim() !== ""));
};

export type ColumnField = "title" | "details" | "owner" | "status" | "due" | "outcome" | "action" | "lane" | "priority" | "category" | "project" | "service" | "tags" | "people";
export const COLUMN_FIELDS: { field: ColumnField; label: string }[] = [
  { field: "title", label: "Title" },
  { field: "details", label: "Details" },
  { field: "owner", label: "Owner" },
  { field: "status", label: "Status" },
  { field: "due", label: "Due" },
  { field: "action", label: "Current action" },
  { field: "outcome", label: "Outcome" },
  { field: "lane", label: "Professional or personal" },
  { field: "priority", label: "Priority" },
  { field: "category", label: "Category" },
  { field: "project", label: "Project" },
  { field: "service", label: "Service or system" },
  { field: "tags", label: "Tags" },
  { field: "people", label: "Follow-up people" },
];

/* What each field's heading tends to be called in the places a list actually comes
   from - a ticket export, a handover sheet, this app's own spreadsheet. */
const HEADING_HINTS: Record<ColumnField, string[]> = {
  title: ["title", "summary", "task", "issue", "name", "work", "item", "subject"],
  details: ["details", "description", "notes", "context", "body", "comment"],
  owner: ["owner", "assignee", "assigned to", "responsible", "who"],
  status: ["status", "state", "stage", "progress"],
  due: ["due", "expected", "deadline", "target", "eta", "due date", "expected update"],
  outcome: ["outcome", "resolution", "result", "how it ended"],
  action: ["action", "current action", "next step", "next action"],
  lane: ["lane", "professional or personal", "type", "kind"],
  priority: ["priority", "severity", "importance"],
  category: ["category", "area", "component", "team", "label"],
  project: ["project", "initiative", "programme", "program"],
  service: ["service", "system", "application", "app", "component"],
  tags: ["tags", "labels", "keywords"],
  people: ["follow-up people", "follow up", "watchers", "stakeholders", "cc"],
};

const normalise = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, " ");

/** Best guess at which column is which, so the mapping starts mostly right. */
export const guessColumns = (headings: string[]) => {
  const mapping: Partial<Record<ColumnField, number>> = {};
  const claimed = new Set<number>();
  (Object.keys(HEADING_HINTS) as ColumnField[]).forEach(field => {
    const hints = HEADING_HINTS[field];
    const exact = headings.findIndex((heading, index) => !claimed.has(index) && hints.includes(normalise(heading)));
    const loose = exact >= 0 ? exact : headings.findIndex((heading, index) => !claimed.has(index) && hints.some(hint => normalise(heading).includes(hint)));
    if (loose >= 0) { mapping[field] = loose; claimed.add(loose); }
  });
  return mapping;
};

/* A stable id per row, so importing the same file twice UPDATES those tasks rather than
   duplicating them - the merge already matches on id, it just needed the id to hold still.
   FNV-1a: short, dependency-free, and steady enough across one spreadsheet. */
export const rowId = (parts: string[]) => {
  let hash = 0x811c9dc5;
  const source = parts.join(" ");
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `csv-${hash.toString(36)}-${source.length.toString(36)}`;
};

export type ColumnMap = Partial<Record<ColumnField, number>>;
export type ImportedRow = { issue: Issue; row: number };
export type CsvImportResult = { issues: Issue[]; skipped: { row: number; reason: string }[] };

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

/* A date in a spreadsheet can be almost anything. Only take what parses; a due date the
   app half-understood would be worse than none, because it would start counting as late. */
const asDue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return toDateTimeInput(parsed);
};

/* Match the sheet's status to one this workspace actually has, ignoring case and spacing.
   An unrecognised status becomes "New" rather than a status the rest of the app has never
   heard of and cannot colour, filter or count as finished. */
const asStatus = (value: string, statuses: Status[]) => {
  const wanted = normalise(value);
  return statuses.find(status => normalise(status) === wanted) ?? "";
};

export const rowsToIssues = (
  rows: string[][],
  mapping: ColumnMap,
  options: { statuses: Status[]; defaultOwner: string; lane?: Lane; now?: Date },
): CsvImportResult => {
  const { statuses, defaultOwner, lane } = options;
  const now = options.now ?? new Date();
  const at = now.toISOString();
  const issues: Issue[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const seen = new Set<string>();
  const cell = (row: string[], field: ColumnField) => {
    const index = mapping[field];
    return index === undefined ? "" : (row[index] ?? "").trim();
  };

  rows.forEach((row, index) => {
    /* +2: the heading is row 1, and a person counting rows in a spreadsheet counts from 1. */
    const number = index + 2;
    const title = cell(row, "title");
    if (!title) { skipped.push({ row: number, reason: "no title" }); return; }
    const id = rowId([title, cell(row, "due"), cell(row, "owner")]);
    if (seen.has(id)) { skipped.push({ row: number, reason: "the same task appears earlier in the file" }); return; }
    seen.add(id);
    const laneCell = normalise(cell(row, "lane"));
    const priorityCell = normalise(cell(row, "priority"));
    const status = asStatus(cell(row, "status"), statuses);
    issues.push({
      id,
      title,
      details: cell(row, "details"),
      owner: cell(row, "owner") || defaultOwner,
      action: cell(row, "action"),
      expected: asDue(cell(row, "due")),
      createdAt: at,
      status: status || "New",
      outcome: cell(row, "outcome"),
      followUpPeople: cell(row, "people").split(/[,;\n]+/).map(person => person.trim()).filter(Boolean),
      /* No timeline entry is written. An import is not an update somebody made, and the
         app does not put its own words in a writer's history. */
      updates: [],
      lane: laneCell === "personal" ? "personal" : laneCell === "professional" ? "professional" : lane,
      priority: (PRIORITIES as readonly string[]).includes(priorityCell) ? priorityCell as Issue["priority"] : "medium",
      category: cell(row, "category"),
      project: cell(row, "project"),
      service: cell(row, "service"),
      tags: cell(row, "tags").split(/[,;\n]+/).map(tag => tag.trim()).filter(Boolean),
      dependencyIds: [],
      /* A row that arrives already finished keeps that, and gets the completion stamp it
         needs to appear in the right week rather than defaulting to today. */
      completedAt: status && isCompleteStatus(status) ? at : undefined,
    });
  });
  return { issues, skipped };
};
