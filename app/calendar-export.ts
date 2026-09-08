import type { Issue } from "./backup";
import { isCompleteStatus } from "./tasks.ts";

const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const stamp = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export const issuesToCalendar = (issues: Issue[], now = new Date()) => {
  const events = issues.filter(issue => issue.expected && !issue.archivedAt && !isCompleteStatus(issue.status)).map(issue => {
    const start = new Date(issue.expected);
    const end = new Date(start.getTime() + 30 * 60000);
    const description = [issue.action, issue.project && `Project: ${issue.project}`, issue.service && `Service: ${issue.service}`].filter(Boolean).join("\n");
    return ["BEGIN:VEVENT", `UID:${escapeText(issue.id)}@signal-petal`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escapeText(issue.title)}`, `DESCRIPTION:${escapeText(description)}`, "END:VEVENT"].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Signal Petal//Work Calendar//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
};

export const calendarFileName = () => `signal-petal-calendar-${new Date().toISOString().slice(0, 10)}.ics`;
