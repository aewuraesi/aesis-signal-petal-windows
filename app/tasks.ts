/* What a task's shape means: whether it is finished, whether it is late, and when it
   actually ended.

   `completedAtOf` is the one to be careful with. A task closed before `completedAt` existed
   has no explicit stamp, so its last update stands in — which is why bumping `updatedAt`
   alone (as changing a lane does) cannot move a task between weeks in the review. */

import type { Issue, Status, DiaryEntry, DailyCheckIn } from "./backup";
import { advanceDate, toDateTimeInput } from "./dates.ts";

export const isCompleteStatus = (status: Status) => status === "Resolved" || status === "Closed";

export const statusClass = (status: Status) => `status ${status.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;

export const completedAtOf = (issue: Issue) => issue.completedAt || issue.updates[issue.updates.length - 1]?.at || issue.createdAt;

export const isOverdue = (issue: Issue) => !isCompleteStatus(issue.status) && issue.expected && new Date(issue.expected).getTime() < Date.now();

export const daysOverdue = (issue: Issue) => Math.max(1, Math.ceil((Date.now() - new Date(issue.expected).getTime()) / 86400000));

/* When the next round falls due.

   Anchored to the date this round was DUE, not the date it was finished, so a cadence does
   not drift every time something is closed late. Closing a quarterly review three weeks late
   still puts the next one on its quarter. If that would land in the past — the thing was
   finished a year late — it rolls forward until it is genuinely ahead. */
export const nextDue = (issue: Issue, finishedAt: Date) => {
  if (!issue.repeat) return null;
  const anchor = issue.expected ? new Date(issue.expected) : finishedAt;
  const base = Number.isNaN(anchor.getTime()) ? finishedAt : anchor;
  let due = advanceDate(base, issue.repeat.every, issue.repeat.unit);
  for (let guard = 0; due.getTime() <= finishedAt.getTime() && guard < 400; guard += 1) {
    due = advanceDate(due, issue.repeat.every, issue.repeat.unit);
  }
  return due;
};

/* The next round, as a task in its own right.

   It keeps what describes the work — title, details, owner, lane, follow-up people, and the
   cadence itself — and drops everything that belonged to the round just finished: its outcome,
   its notes, its completion stamp. Those stay on the task that earned them. */
export const nextOccurrence = (issue: Issue, finishedAt: Date, id: string): Issue | null => {
  const due = nextDue(issue, finishedAt);
  if (!due) return null;
  const at = finishedAt.toISOString();
  return {
    ...issue,
    id,
    status: "New",
    outcome: "",
    completedAt: undefined,
    focusHandledAt: undefined,
    memory: undefined,
    expected: toDateTimeInput(due),
    createdAt: at,
    updatedAt: at,
    repeatedFrom: issue.id,
    updates: [{ id: `${id}-1`, at, author: issue.owner, text: "Came round again." }],
  };
};

/* Everything the review and the copied summaries need about one window of time.

   Pulled out of the component because the weekly screen and the quarter- or year-long copy
   ask exactly the same questions of different windows, and two implementations of "what
   shipped" would drift apart within a month. Pure, so the awkward boundaries — a task
   completed on the last evening of the window, a round that arrived rather than being
   started — can be pinned down in tests. */
export const workInPeriod = (issues: Issue[], entries: DiaryEntry[], checkIns: DailyCheckIn[], from: number, to: number) => {
  const within = (value: string) => { const at = new Date(value).getTime(); return at >= from && at < to; };
  const shipped = issues.filter(issue => isCompleteStatus(issue.status) && within(completedAtOf(issue)));
  /* A round that exists only because the last one was finished is not work anybody started —
     it arrived. It is already reported as delivered, and it surfaces again on its own terms
     when it is next worth attention. */
  const logged = issues.filter(issue => within(issue.createdAt) && !issue.repeatedFrom);
  const stalled = issues.filter(issue => !isCompleteStatus(issue.status) && issue.expected && new Date(issue.expected).getTime() < to && isOverdue(issue));
  /* Next week means next week. Work dated well beyond the window is open, but it is not what
     anyone is being asked to focus on. Undated work still qualifies: no date is not the same
     as not soon. */
  const horizon = to + 7 * 86400000;
  const priorities = [...issues.filter(issue => !isCompleteStatus(issue.status) && (!issue.expected || new Date(issue.expected).getTime() < horizon))]
    .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || (a.expected ? new Date(a.expected).getTime() : Infinity) - (b.expected ? new Date(b.expected).getTime() : Infinity))
    .slice(0, 3);
  const periodCheckIns = checkIns.filter(checkIn => within(checkIn.at));
  const parkedIds = Array.from(new Set(periodCheckIns.flatMap(checkIn => checkIn.parkedIssueIds)));
  const parkedIssues = parkedIds.map(id => issues.find(issue => issue.id === id)).filter((issue): issue is Issue => Boolean(issue));
  const pages = entries.filter(entry => within(entry.at)).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const focusMoves = issues.filter(issue => issue.focusHandledAt && within(issue.focusHandledAt));
  /* Work with no lane yet. Surfaced because a lane nobody ever sets is worse than no lane,
     and it is why the combined copy exists — nothing should fall out of both summaries
     without being seen. */
  const unsorted = [...new Map([...shipped, ...stalled, ...logged].filter(issue => !issue.lane).map(issue => [issue.id, issue] as const)).values()];
  return { shipped, logged, stalled, priorities, parkedIssues, pages, checkIns: periodCheckIns, focusMoves, unsorted, from, to };
};

export type PeriodWork = ReturnType<typeof workInPeriod>;
