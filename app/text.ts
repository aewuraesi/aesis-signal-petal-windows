/* Small text helpers shared by the diary engine, the summaries and the forms.

   These were inline in app/page.tsx. They are pure, they are used from several
   places, and having them here is what lets tests/text.test.mjs pin down the
   behaviour the rest of the app quietly depends on. */
/* Local, not UTC: the calendar builds its cell keys from local date parts, so keying
   entries in UTC put evening work on the following day for anyone west of Greenwich. */
/* Names are stored the way they should read. Owners and follow-up people are matched
   case-insensitively but rendered verbatim, so "maya chen" typed in a hurry sat beside
   "Maya Chen" in the owner report looking like a second person. Capitalising at the
   start and after a space, hyphen or apostrophe keeps O'Brien and Ana-Maria intact, and
   never changes the string's length — which is what lets the caret stay where it was
   while someone is still typing. */
export const titleCaseName = (value: string) => value.replace(/(^|[\s(/,;&'\u2019-])(\p{L})/gu, (_match, lead: string, letter: string) => lead + letter.toLocaleUpperCase());

export const peopleFromInput = (value: string) => Array.from(new Map(value.split(/[,;\n]+/).map(person => titleCaseName(person.trim())).filter(Boolean).map(person => [person.toLowerCase(), person])).values());
// Whole units only. "4 hours" is a fact; "0.17 days" is a spreadsheet talking.
/* ---------------------------------------------------------------------------
   Diary reflection engine.

   Everything here runs on the device — no entry ever leaves the browser. The
   engine reads one reflection in context (the words, the mood chosen, the hour
   it was written, and the entries before it) and answers in three beats:
   what it heard, what that combination suggests, and one step sized to the
   state the writer is actually in.
--------------------------------------------------------------------------- */

export const tidy = (value: string) => value.replace(/\s+/g, " ").trim().replace(/^[.,;:!?\-–—\s]+/, "").replace(/[.,;:\s]+$/, "");

export const clip = (value: string, limit = 96) => (value.length > limit ? `${value.slice(0, limit - 1).replace(/\s+\S*$/, "")}…` : value);

export const safeMemoryPreview = (value: string) => clip(value
  .replace(/https?:\/\/\S+/gi, "[link]")
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[technical detail]")
  .replace(/\s+/g, " ")
  .trim(), 170);

// Quoted fragments end in "…" when clipped, so a trailing full stop would read as an ellipsis of four.
export const quote = (value: string) => `“${value}${/[.…?!]$/.test(value) ? "" : "."}”`;

// Deterministic so an entry always renders the same reflection, while different entries vary.
export const pickFrom = <T,>(options: T[], seed: string) => options[Math.abs(Array.from(seed).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) | 0, 7)) % options.length];

export const wordCount = (value: string) => (value.trim() ? value.trim().split(/\s+/).length : 0);
