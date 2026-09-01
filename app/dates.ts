/* Dates, weeks, and the words used to say them.

   All of it is local time on purpose: a week starts on the Monday the writer is living in,
   not a Monday in UTC. Pure functions, so the awkward cases — a week that crosses a month,
   a span of exactly one hour, an empty timestamp — can be pinned down in tests instead of
   being poked at through the UI. */

export const startOfWeek = (value: Date) => { const at = new Date(value.getFullYear(), value.getMonth(), value.getDate()); at.setDate(at.getDate() - ((at.getDay() + 6) % 7)); return at; };

export const addDays = (value: Date, days: number) => { const at = new Date(value); at.setDate(at.getDate() + days); return at; };

export const toDateTimeInput = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}T${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;

export const weekLabel = (start: Date) => `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(start)} – ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(addDays(start, 6))}`;

export const daysSince = (value: string) => Math.floor((Date.now() - new Date(value).getTime()) / 86400000);

export const dateLabel = (value: string) => value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "No ETA";

export const dayKey = (value: string) => { const at = new Date(value); return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`; };

export const dayBefore = (key: string) => { const [year, month, day] = key.split("-").map(Number); const at = new Date(year, month - 1, day - 1); return dayKey(at.toISOString()); };

export const spanLabel = (from: string, to: string) => {
  const minutes = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
};

/* The last day of a month, used to keep a monthly cadence from wandering. */
const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/* Move a date on by a whole number of weeks, months or years.

   Naive month arithmetic drifts: `setMonth` on the 31st of a month whose successor is shorter
   rolls into the month after — 31 January plus one month becomes 3 March. Something due on the
   31st should land on the last day of the shorter month and then carry on at the 31st, so the
   day is clamped rather than allowed to overflow. */
export const advanceDate = (from: Date, every: number, unit: "week" | "month" | "year") => {
  const at = new Date(from.getFullYear(), from.getMonth(), from.getDate(), from.getHours(), from.getMinutes());
  if (unit === "week") { at.setDate(at.getDate() + every * 7); return at; }
  const months = (unit === "year" ? 12 : 1) * every;
  const day = at.getDate();
  at.setDate(1);
  at.setMonth(at.getMonth() + months);
  at.setDate(Math.min(day, daysInMonth(at.getFullYear(), at.getMonth())));
  return at;
};
