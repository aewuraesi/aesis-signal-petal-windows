/* What the reminder worker is told, and what the writer is told back.

   The DECISION about whether a reminder is due lives in `public/sw.js` and nowhere
   else. That is the point of this change: the page used to decide and deliver, so
   reminders only existed while a tab was open and looking, and two open tabs could
   fire the same one twice. Now the page only describes the state of the work, the
   worker fires and remembers, and the page asks it what happened.

   Everything here is pure so the wording can be tested without a browser.

   Honest about the ceiling: a service worker can be woken while the browser is
   running - by another tab, by the app being reopened, or by periodic background
   sync where the browser offers it. Nothing in a web app can wake a machine that is
   asleep or a browser that is not running, and the settings copy says so rather than
   promising something that will quietly not happen. */

import type { Issue } from "./backup.ts";
import { isOverdue, isCompleteStatus } from "./tasks.ts";

export type ReminderSchedule = {
  remindersOn: boolean;
  /* Local wall-clock, like every other due date here: half four means half four
     wherever the writer is. */
  checkInAt: number | null;
  checkInLabel: string;
  day: string;
  overdue: number;
  upcoming: number;
};

export type ReminderRecord = { key: string; at: number; title: string };

const WITHIN_A_DAY = 86400000;

export const dueSoonIssues = (issues: Issue[], now = Date.now()) => issues.filter(issue =>
  !isCompleteStatus(issue.status)
  && !issue.archivedAt
  && !!issue.expected
  && new Date(issue.expected).getTime() - now < WITHIN_A_DAY);

export const dayKeyOf = (at: Date) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;

/** Today's check-in moment as a timestamp, or null when the time makes no sense. */
export const checkInMoment = (reminderTime: string, now: Date) => {
  const [hour, minute] = reminderTime.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const at = new Date(now);
  at.setHours(hour, minute, 0, 0);
  return at.getTime();
};

export const buildReminderSchedule = (
  issues: Issue[],
  options: { remindersOn: boolean; reminderTime: string; now?: Date },
): ReminderSchedule => {
  const now = options.now ?? new Date();
  const soon = dueSoonIssues(issues, now.getTime());
  const overdue = soon.filter(issue => isOverdue(issue)).length;
  return {
    remindersOn: options.remindersOn,
    checkInAt: checkInMoment(options.reminderTime, now),
    checkInLabel: options.reminderTime,
    day: dayKeyOf(now),
    overdue,
    upcoming: soon.length - overdue,
  };
};

/* What the settings panel says about a reminder that has not happened yet, or one
   that happened while nobody was looking. */
export const describeCheckIn = (schedule: ReminderSchedule, sent: ReminderRecord[], now = Date.now()) => {
  if (!schedule.remindersOn) return "Reminders are off.";
  if (schedule.checkInAt === null) return "That reminder time could not be read.";
  const today = sent.find(record => record.key === `check-in|${schedule.day}`);
  if (today) return `Today's check-in was sent at ${new Date(today.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
  if (now < schedule.checkInAt) return `Next check-in today at ${schedule.checkInLabel}.`;
  return `Today's check-in at ${schedule.checkInLabel} has not been delivered yet — it will arrive the next time this app is open.`;
};

/* A reminder that fired while the app was closed is worth surfacing on the way back
   in: the whole complaint about reminders is not knowing whether one happened. */
export const missedWhileAway = (sent: ReminderRecord[], lastSeen: number | null, now = Date.now()) => {
  if (!lastSeen) return [];
  return sent.filter(record => record.at > lastSeen && record.at <= now).sort((a, b) => a.at - b.at);
};
