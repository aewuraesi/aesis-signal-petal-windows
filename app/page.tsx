"use client";

import { type ChangeEvent, FormEvent, type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import Petal from "./petal";
import CommandPalette, { type CommandItem } from "./components/CommandPalette";
import OnboardingDialog from "./components/OnboardingDialog";
import TaskActionControls from "./components/TaskActionControls";
import TaskBadges from "./components/TaskBadges";
import { isValidPayload, normaliseIssues, encodeTransfer, decodeTransfer, backupFileName, mergeTransferData } from "./backup";
import { professionalTone, professionalLine, renderBlocks, overdueSpan } from "./summary";
import { startOfWeek, addDays, toDateTimeInput, weekLabel, daysSince, dateLabel, dayKey, dayBefore, spanLabel } from "./dates";
import { isCompleteStatus, statusClass, completedAtOf, isOverdue, daysOverdue, nextOccurrence, workInPeriod, type PeriodWork } from "./tasks";
import { useDialogFocus } from "./dialog-focus";
import { readStore, writeStore, dropStore, storageStore, type StorageTrouble } from "./storage";
import { issuesToCsv, csvFileName } from "./csv";
import type { Status, Profile, Issue, Lane, Repeat, Mood, DiaryEntry, DiaryAction, DiaryEvent, DiaryVault, DailyCheckIn, TransferPayload } from "./backup";

// A completed issue's timestamp: the explicit stamp if there is one, else its last update.
/* Her words, not the app's: the control says professional and personal. */
const repeatChoices: { label: string; value?: Repeat }[] = [
  { label: "No, it is a one-off" },
  { label: "Every week", value: { every: 1, unit: "week" } },
  { label: "Every 2 weeks", value: { every: 2, unit: "week" } },
  { label: "Every month", value: { every: 1, unit: "month" } },
  { label: "Every 3 months", value: { every: 3, unit: "month" } },
  { label: "Every 6 months", value: { every: 6, unit: "month" } },
  { label: "Every year", value: { every: 1, unit: "year" } },
];
const repeatKey = (repeat?: Repeat) => repeat ? `${repeat.every}-${repeat.unit}` : "";
const laneOptions: { value: Lane; label: string }[] = [{ value: "professional", label: "Professional" }, { value: "personal", label: "Personal" }];
type StatusDraft = { id: string; name: string; color: string; original?: string; kind?: "new" | "ongoing" | "terminal" };
type MetricFocus = "home-total" | "home-open" | "home-overdue" | "home-resolved" | "mine-open" | "mine-overdue" | "mine-resolved" | "mine-total" | "attention-overdue" | "attention-oldest" | "attention-owners" | "attention-first";
type FocusRecommendation = { issue: Issue; kind: "overdue" | "missing-eta" | "missing-action"; priority: number; reason: string; move: string };
type InsightRange = "7" | "30" | "90" | "all";
type InsightSection = "work" | "memory" | "rhythm";
type InsightDrilldown = "completed" | "on-time" | "cycle" | "overdue" | "";
type SyncState = "checking" | "syncing" | "synced" | "offline" | "signed-out" | "error";

// Tip up, base just past the bloom centre at (112, 52); rotating it sweeps the flower.
const GARDEN_PETAL = "M112 8C127.5 21.2 129.7 43.2 112 58C94.3 43.2 96.5 21.2 112 8Z";

function SignalGarden({ stage, label, compact = false }: { stage: number; label: string; compact?: boolean }) {
  const safeStage = Math.max(0, Math.min(4, stage));
  return <div className={`signal-garden stage-${safeStage} ${compact ? "is-compact" : ""}`} role="img" aria-label={label}>
    <svg className="garden-svg" viewBox="0 0 220 140" aria-hidden="true">
      <defs><linearGradient id="garden-petal" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ef79aa"/><stop offset="1" stopColor="#bf4f87"/></linearGradient><linearGradient id="garden-leaf" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#83b779"/><stop offset="1" stopColor="#477652"/></linearGradient><radialGradient id="garden-glow"><stop stopColor="#f4b7d2" stopOpacity=".5"/><stop offset="1" stopColor="#f4b7d2" stopOpacity="0"/></radialGradient></defs>
      <circle className="svg-garden-glow" cx="113" cy="48" r="52" fill="url(#garden-glow)"/>
      <ellipse className="svg-garden-soil" cx="112" cy="123" rx="76" ry="12" fill="#c99572"/><ellipse className="svg-garden-seed" cx="112" cy="119" rx="8" ry="4" fill="#8d6049"/>
      <path className="svg-garden-stem" d="M112 119 C110 94 116 72 112 57" fill="none" stroke="#52835b" strokeWidth="7" strokeLinecap="round"/>
      <path className="svg-garden-leaf leaf-left" d="M109 94 C83 95 72 82 70 68 C91 69 105 76 111 91Z" fill="url(#garden-leaf)"/>
      <path className="svg-garden-leaf leaf-right" d="M114 84 C133 82 145 71 149 57 C130 58 118 66 113 80Z" fill="url(#garden-leaf)"/>
      {/* One petal rotated five times, rather than five petals placed by hand. The hand-placed
          set had tips at 0/82/147/213/278° — gaps of 82,65,66,65,82 where they should all be
          72 — and reaches from 44.8 to 48.2, so the bloom sat lopsided with the lower petals
          crowded. Generating it guarantees both. The silhouette is the app mark's petal at
          78% width: wide enough to stay friendly, narrow enough that five of them meet
          without merging into one mass. */}
      <g className="svg-garden-bloom">
        <path className="svg-petal petal-top" d={GARDEN_PETAL} fill="url(#garden-petal)"/>
        <g transform="rotate(72 112 52)"><path className="svg-petal petal-right" d={GARDEN_PETAL} fill="url(#garden-petal)"/></g>
        <g transform="rotate(144 112 52)"><path className="svg-petal petal-lower-right" d={GARDEN_PETAL} fill="url(#garden-petal)"/></g>
        <g transform="rotate(216 112 52)"><path className="svg-petal petal-lower-left" d={GARDEN_PETAL} fill="url(#garden-petal)"/></g>
        <g transform="rotate(288 112 52)"><path className="svg-petal petal-left" d={GARDEN_PETAL} fill="url(#garden-petal)"/></g>
        <circle className="svg-garden-heart" cx="112" cy="52" r="13" fill="#f4c95d"/><circle className="svg-garden-heart-light" cx="108.5" cy="48.5" r="3.2" fill="#fff" opacity=".5"/>
      </g>
      <g className="svg-garden-sparks" fill="#d65f98"><path d="M48 38c2 8 6 12 14 14-8 2-12 6-14 14-2-8-6-12-14-14 8-2 12-6 14-14Z"/><circle cx="171" cy="39" r="4"/><circle cx="179" cy="53" r="2.5"/></g>
    </svg>
  </div>;
}

const defaultStatuses: Status[] = ["New", "Ongoing", "Waiting on dev", "Investigating", "Blocked", "Pending Monitoring", "Awaiting approval", "Resolved"];
const defaultStatusColors: Record<string, string> = {
  New: "#715391", Ongoing: "#647a3e", "Waiting on dev": "#9b6519", Investigating: "#a03e74",
  Blocked: "#bd415e", "Pending Monitoring": "#407d78", "Awaiting approval": "#41658e", Resolved: "#4f7b54", Closed: "#4f7b54",
};
/* The greeting used to say "Good afternoon" at every hour, to the writer's ROLE
   rather than their name. It is the first line of every session — it should at
   least be true. */
/* A year in pixels: one square per day, coloured by that day's mood. The classic
   journalling keepsake, and the only view that shows a whole year at once. Days
   with more than one page take the last mood written that day. */
const yearGrid = (entries: DiaryEntry[], year: number) => {
  const byDay = new Map<string, DiaryEntry>();
  entries.forEach(entry => {
    const at = new Date(entry.at);
    if (at.getFullYear() !== year) return;
    const key = dayKey(entry.at);
    const held = byDay.get(key);
    if (!held || new Date(entry.at).getTime() > new Date(held.at).getTime()) byDay.set(key, entry);
  });
  const today = dayKey(new Date().toISOString());
  return Array.from({ length: 12 }, (_, month) => ({
    month,
    label: new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(year, month, 1)),
    days: Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => {
      const day = index + 1;
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { day, key, entry: byDay.get(key), isToday: key === today, isFuture: key > today };
    }),
  }));
};
const greetingFor = (hour: number, name: string) => {
  const who = name || "there";
  if (hour < 0) return `Hello, ${who}`;
  if (hour < 5) return `Still up, ${who}`;
  if (hour < 12) return `Good morning, ${who}`;
  if (hour < 17) return `Good afternoon, ${who}`;
  if (hour < 22) return `Good evening, ${who}`;
  return `Winding down, ${who}`;
};
const themes = [
  ["rose", "Rose quartz"], ["lilac", "Lilac haze"], ["peach", "Peach fizz"], ["blush", "Blush bloom"], ["berry", "Berry luxe"],
  ["ocean", "Ocean slate"], ["forest", "Forest moss"], ["navy", "Midnight navy"], ["sand", "Desert sand"], ["graphite", "Graphite"],
] as const;
/* Diary paper faces. System stacks only — a local-first app should not wait on a font
   server to render your own writing, and every stack degrades to a sane default. */
const diaryFonts = [
  ["journal", "Journal sans", "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"],
  ["serif", "Classic serif", "\"Iowan Old Style\", \"Palatino Linotype\", Palatino, \"Book Antiqua\", Georgia, ui-serif, serif"],
  ["typewriter", "Typewriter", "\"American Typewriter\", \"Courier New\", ui-monospace, monospace"],
  ["hand", "Handwritten", "\"Bradley Hand\", \"Segoe Print\", \"Segoe Script\", \"Apple Chancery\", \"Comic Sans MS\", cursive"],
  ["rounded", "Rounded", "ui-rounded, \"SF Pro Rounded\", \"Varela Round\", \"Trebuchet MS\", system-ui, sans-serif"],
] as const;
const diaryPapers = [["cream", "Cream"], ["ivory", "Ivory"], ["blush", "Blush"], ["mint", "Mint"], ["sky", "Sky"], ["lilac", "Lilac"], ["sand", "Sand"], ["slate", "Slate"]] as const;
const moods: { value: Mood; label: string; symbol: string }[] = [
  { value: "bright", label: "Bright", symbol: "☀" }, { value: "calm", label: "Calm", symbol: "◡" },
  { value: "okay", label: "Okay", symbol: "•" }, { value: "low", label: "Low", symbol: "☁" },
  { value: "anxious", label: "Anxious", symbol: "≈" }, { value: "frustrated", label: "Frustrated", symbol: "△" },
];
/* ---------------------------------------------------------------------------
   Optional diary lock. AES-GCM with a key derived from the passphrase by PBKDF2.
   The key is never written anywhere — it lives in memory for the session only —
   so there is deliberately no recovery path if the passphrase is lost.
--------------------------------------------------------------------------- */
const LOCK_ITERATIONS = 250000;
const toB64 = (bytes: Uint8Array) => { let binary = ""; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary); };
const fromB64 = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const deriveDiaryKey = async (passphrase: string, salt: Uint8Array) => {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: LOCK_ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
};
const sealDiary = async (key: CryptoKey, salt: string, entries: DiaryEntry[], log: DiaryEvent[]): Promise<DiaryVault> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(JSON.stringify({ entries, log })) as unknown as BufferSource);
  return { salt, iv: toB64(iv), data: toB64(new Uint8Array(sealed)) };
};
const openDiaryVault = async (key: CryptoKey, vault: DiaryVault) => {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(vault.iv) as unknown as BufferSource }, key, fromB64(vault.data) as unknown as BufferSource);
  const payload = JSON.parse(new TextDecoder().decode(plain)) as { entries: DiaryEntry[]; log: DiaryEvent[] };
  return { entries: Array.isArray(payload.entries) ? payload.entries : [], log: Array.isArray(payload.log) ? payload.log : [] };
};
const readStoredVault = (): DiaryVault | null => {
  const raw = readStore("signal-petal-diary-vault");
  if (!raw) return null;
  try { const parsed = JSON.parse(raw) as DiaryVault; return parsed?.salt && parsed?.iv && parsed?.data ? parsed : null; } catch { return null; }
};
/* Excel reads a UTF-8 file as the local codepage unless it finds a byte-order mark, which
   turns every em dash and accented name into mojibake. The BOM is three bytes and fixes it. */
const saveCsvFile = (text: string) => {
  const url = URL.createObjectURL(new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
};
const saveBackupFile = (payload: TransferPayload) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
};
/* Local, not UTC: the calendar builds its cell keys from local date parts, so keying
   entries in UTC put evening work on the following day for anyone west of Greenwich. */
/* Names are stored the way they should read. Owners and follow-up people are matched
   case-insensitively but rendered verbatim, so "maya chen" typed in a hurry sat beside
   "Maya Chen" in the owner report looking like a second person. Capitalising at the
   start and after a space, hyphen or apostrophe keeps O'Brien and Ana-Maria intact, and
   never changes the string's length — which is what lets the caret stay where it was
   while someone is still typing. */
const titleCaseName = (value: string) => value.replace(/(^|[\s(/,;&'\u2019-])(\p{L})/gu, (_match, lead: string, letter: string) => lead + letter.toLocaleUpperCase());
const peopleFromInput = (value: string) => Array.from(new Map(value.split(/[,;\n]+/).map(person => titleCaseName(person.trim())).filter(Boolean).map(person => [person.toLowerCase(), person])).values());
// Whole units only. "4 hours" is a fact; "0.17 days" is a spreadsheet talking.
/* ---------------------------------------------------------------------------
   Diary reflection engine.

   Everything here runs on the device — no entry ever leaves the browser. The
   engine reads one reflection in context (the words, the mood chosen, the hour
   it was written, and the entries before it) and answers in three beats:
   what it heard, what that combination suggests, and one step sized to the
   state the writer is actually in.
--------------------------------------------------------------------------- */

const heavyMoods: Mood[] = ["low", "anxious", "frustrated"];
const moodLabel = (mood: Mood) => (moods.find(item => item.value === mood)?.label ?? "okay").toLowerCase();
const tidy = (value: string) => value.replace(/\s+/g, " ").trim().replace(/^[.,;:!?\-–—\s]+/, "").replace(/[.,;:\s]+$/, "");
const clip = (value: string, limit = 96) => (value.length > limit ? `${value.slice(0, limit - 1).replace(/\s+\S*$/, "")}…` : value);
const safeMemoryPreview = (value: string) => clip(value
  .replace(/https?:\/\/\S+/gi, "[link]")
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[technical detail]")
  .replace(/\s+/g, " ")
  .trim(), 170);
// Quoted fragments end in "…" when clipped, so a trailing full stop would read as an ellipsis of four.
const quote = (value: string) => `“${value}${/[.…?!]$/.test(value) ? "" : "."}”`;
// Deterministic so an entry always renders the same reflection, while different entries vary.
const pickFrom = <T,>(options: T[], seed: string) => options[Math.abs(Array.from(seed).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) | 0, 7)) % options.length];

/* The work side of the app had no voice: every header and empty state was fixed text,
   while the diary rotated prompts and reflections. This is one line under the title that
   reads the queue and says something about it. Seeded on the date so it holds still for
   the whole day instead of reshuffling on every render. */
const deskLines = {
  clear: ["Nothing overdue, nothing unowned. Rare — enjoy it.", "Empty queue. Whatever you did last week, do that again.", "All quiet. This is what the good days look like."],
  shipping: ["{n} closed today. That is the part nobody logs and everybody feels.", "{n} off the list today — the queue is shorter because of you.", "{n} done today. Worth noticing before you open the next one."],
  pressure: ["{n} past their expected update. Start at the top; the rest gets easier.", "{n} overdue — not a crisis, just the order to work in.", "{n} waiting longer than you promised. One at a time."],
  steady: ["{n} open and every one of them on time.", "{n} in flight, nothing late. Keep it boring.", "{n} open, all on schedule. Steady is a result."],
} as const;
const deskLine = (open: number, overdue: number, closedToday: number, seed: string) => {
  const [bucket, count] = overdue ? ["pressure", overdue] as const
    : closedToday ? ["shipping", closedToday] as const
    : open ? ["steady", open] as const
    : ["clear", 0] as const;
  return pickFrom([...deskLines[bucket]], `${seed}-${bucket}`).replace("{n}", String(count));
};

const crisisPattern = /\b(kill (?:myself|me)|end (?:my life|it all)|take my own life|suicid\w*|hurt myself|harm myself|self[- ]harm|want to die|better off (?:dead|without me)|no reason to (?:live|go on)|don'?t want to wake up)\b/i;
// A negator immediately before a phrase flips its meaning: "I'm not exhausted" is not exhaustion.
const negatorPattern = /\b(?:not|no longer|never|hardly|barely|isn'?t|wasn'?t|aren'?t|weren'?t|don'?t|doesn'?t|didn'?t)\s+(?:\w+\s+){0,2}$/i;

type ThemeId = "exhaustion" | "progress" | "blocked" | "overload" | "conflict" | "uncertainty" | "selfBlame" | "gratitude" | "loneliness" | "rumination" | "bodyCare" | "hope" | "relief";
const themeLexicon: { id: ThemeId; label: string; pattern: RegExp }[] = [
  { id: "exhaustion", label: "running on empty", pattern: /\b(exhaust\w*|drain\w*|burn(?:t|ed) out|burnout|no energy|running on empty|no sleep|couldn'?t sleep|didn'?t sleep|wiped out|worn out|so tired|too tired|shattered)\b/gi },
  { id: "progress", label: "real movement", pattern: /\b(finished|shipped|resolved|fixed|solved|cracked|delivered|completed|sorted|went well|worked out|breakthrough|proud|milestone|got it (?:done|working))\b/gi },
  { id: "blocked", label: "a handoff that has stalled", pattern: /\b(waiting|blocked|no (?:response|reply|answer|update)|still (?:hasn'?t|haven'?t)|chasing|follow(?:ing)?[ -]?up|approval|sign[ -]?off|depend\w*|handoff|stuck|ignored|radio silence)\b/gi },
  { id: "overload", label: "more demand than capacity", pattern: /\b(too much|overwhelm\w*|backlog|deadline\w*|swamped|slammed|back[ -]to[ -]back|no time|juggl\w*|spread thin|piling up|everything at once|pressure|workload|firefighting)\b/gi },
  { id: "conflict", label: "friction with another person", pattern: /\b(argu\w*|snapped(?: at)?|shouted|disagree\w*|tension|push ?back|conflict|rude|dismissive|undermin\w*|disrespect\w*|talked over|blamed me|called me out|had a go at|criticis\w*|criticiz\w*|careless|in front of (?:everyone|the team|others|the whole)|made me look|passive[ -]aggressive|annoyed|angry|furious|frustrat\w*|want to say something to)\b/gi },
  { id: "uncertainty", label: "an open question you cannot close yet", pattern: /\b(not sure|unsure|unclear|what if|uncertain\w*|don'?t know (?:if|whether|what)|waiting to hear|up in the air|no idea|worried|worry\w*|anxious|anxiety|nervous|scared|afraid|dread\w*)\b/gi },
  { id: "selfBlame", label: "a verdict you passed on yourself", pattern: /\b(my fault|i should(?:'?ve| have)|i shouldn'?t have|stupid|idiot|messed (?:it )?up|screwed up|let (?:everyone|them|him|her|myself) down|not good enough|failed|failure|embarrass\w*|ashamed|guilt\w*|regret)\b/gi },
  { id: "gratitude", label: "something that held you up", pattern: /\b(grateful|thankful|appreciate\w*|lucky|supported|helped me|had my back|checked in on me|generous|kind of (?:him|her|them))\b/gi },
  { id: "loneliness", label: "distance from other people", pattern: /\b(lonely|alone|isolat\w*|no ?one|nobody|by myself|disconnect\w*|left out|invisible|miss (?:him|her|them|talking|having))\b/gi },
  { id: "rumination", label: "a thought running on a loop", pattern: /\b(can(?:'?t| ?not) stop thinking|keep thinking|replay\w*|(?:keeps?|kept) going over|going over (?:it|and over)|in my head|overthink\w*|spiral\w*|ruminat\w*|second[- ]guess\w*|kept me (?:up|awake))\b/gi },
  { id: "bodyCare", label: "your body last in the queue", pattern: /\b(skipped (?:lunch|breakfast|dinner|meals?)|haven'?t eaten|forgot to eat|no break|worked through|headache|migraine|didn'?t stop|no lunch)\b/gi },
  { id: "hope", label: "something opening up", pattern: /\b(looking forward|excited|can'?t wait|hopeful|new (?:role|start|project|chapter|job)|opportunit\w*|fresh start)\b/gi },
  { id: "relief", label: "a weight lifting", pattern: /\b(relieved|relief|weight off|finally over|behind me|calmer|settled|breathed)\b/gi },
];

const detectThemes = (note: string) => themeLexicon
  .map(theme => {
    const hits = Array.from(note.matchAll(theme.pattern))
      .filter(match => !negatorPattern.test(note.slice(Math.max(0, (match.index ?? 0) - 26), match.index ?? 0)));
    return { id: theme.id, label: theme.label, score: hits.length };
  })
  .filter(theme => theme.score > 0)
  .sort((a, b) => b.score - a.score);

const intensityOf = (raw: string) => {
  const boosters = (raw.match(/\b(really|so|very|extremely|completely|totally|absolutely|utterly|again|still|constantly|every ?(?:day|time)|all (?:day|week|night))\b/gi) || []).length;
  const shouts = (raw.match(/\b[A-Z]{3,}\b/g) || []).length + (raw.match(/!/g) || []).length;
  const words = raw.trim().split(/\s+/).length;
  return Math.min(1, boosters * 0.16 + shouts * 0.12 + (words > 120 ? 0.25 : words > 55 ? 0.14 : 0));
};

/* The clause on one side of a contrast word is usually where the real point is hiding —
   but which side depends on the word. After "but" or "however" comes the point; before
   "although" or "even though" comes the point, and after it comes the concession. Either
   way the quote stops at the sentence end so it does not run into the next thought. */
const pivotClause = (text: string) => {
  const forward = text.match(/\b(?:but|however|even so|yet)\b([^.!?\n]{12,})/i);
  if (forward) return clip(tidy(forward[1]));
  const backward = text.match(/([^.!?\n]{12,})\b(?:although|even though|though)\b/i);
  if (backward) return clip(tidy(backward[1]).replace(/[\s,]*\b(?:even|and|but|so)\s*$/i, ""));
  return "";
};
const statedNeed = (text: string) => clip(tidy((text.match(/\bi (?:just )?(?:need|want|wish|have to|keep meaning to|would love)\b[^.!?\n]{4,110}/i) || [""])[0]));
const openQuestion = (text: string) => clip(tidy((text.match(/[^.!?\n]{10,110}\?/) || [""])[0]));
const strongestClause = (text: string) => clip(tidy(text.split(/[.!?\n]+/).map(tidy).filter(part => part.split(" ").length >= 4).sort((a, b) => b.length - a.length)[0] || tidy(text)));
const peopleMentioned = (text: string) => Array.from(new Set([
  ...Array.from(text.matchAll(/\bmy (manager|lead|boss|teammate|colleague|team|partner|client|director|mentor|friend|mum|mom|dad|sister|brother|husband|wife)\b/gi)).map(match => `my ${match[1].toLowerCase()}`),
  ...Array.from(text.matchAll(/\b([A-Z][a-z]{2,})\s+(?:said|asked|told|replied|refused|agreed|pushed|apologi|ignored|promised)/g)).map(match => match[1]),
])).slice(0, 2);
const hasTimePressure = (text: string) => /\b(today|tonight|tomorrow|by (?:mon|tue|wed|thu|fri|sat|sun)\w*|end of (?:the )?(?:day|week)|eod|this week|deadline|due|overdue|late)\b/i.test(text);
/* Only all-or-nothing phrasing aimed at a pattern, not the ordinary literal uses. "In
   front of everyone" is a fact; "I always do this" is a verdict, and only the second one
   is worth gently questioning. */
const absoluteWord = (text: string) => tidy((text.match(/\b(?:i (?:always|never)|(?:always|never) (?:works|happens|goes|ends?|get|gets|do|does)|every time i|no ?one ever|everyone else)\b/i) || [""])[0]);

const themeInsight: Record<ThemeId, string[]> = {
  exhaustion: ["Tiredness that gets written down is usually past the point where rest fixes it on its own — it needs something removed from the list, not just a good night.", "This reads less like a bad night and more like a deficit that has been building. Deficits do not clear themselves; something has to come off the list."],
  progress: ["Wins are easy to bank and forget. The useful part is not that it worked — it is knowing exactly which decision made it work.", "This is worth more than a good feeling: a repeatable move is hiding in here, and it is only repeatable if you name it while it is fresh."],
  blocked: ["Waiting quietly costs you twice: the work does not move, and you carry it anyway. Most stalls survive because nobody made the ask specific.", "The thing holding this up is a person or a decision, not a difficulty. That kind of block responds to one clear sentence far more than to patience."],
  overload: ["When everything is urgent, the real risk is not missing something — it is spending your best hours on whichever thing shouted loudest.", "Competing demands do not resolve by working faster. They resolve by someone deciding what does not get done, and that someone can be you."],
  conflict: ["Friction remembered this vividly is usually still unresolved in your head, which means you will keep replaying their words instead of choosing yours.", "There are two things tangled here: what actually happened, and what it seemed to mean about you. They are worth separating before you respond."],
  uncertainty: ["Uncertainty expands to fill whatever space you give it. It shrinks when you draw a line between what you can influence and what you can only wait on.", "Your mind is trying to solve a question it does not yet have the information for — which is why it keeps circling without landing."],
  selfBlame: ["You have written a verdict, not an account. Verdicts do not teach you anything; accounts do.", "Notice how much of this is aimed at you rather than at what happened. Almost every situation has a share that was never yours to carry."],
  gratitude: ["Support noticed is support you can go back to. Most people never tell the person, and the connection quietly thins.", "This is the kind of detail worth keeping. Knowing precisely what helped tells you what to ask for next time."],
  loneliness: ["Distance like this tends to be self-sealing: the further out you feel, the harder it gets to reach, and the further out you feel.", "Feeling unseen rarely means nobody would come. It usually means nobody has been told."],
  rumination: ["A thought on a loop is not analysis, even though it feels like it. It is the same input running again because it never got an output.", "Replaying it has already given you whatever information it holds. Past that point it is just cost."],
  bodyCare: ["You are treating your own maintenance as the flexible part of the day. It is the part everything else runs on.", "Skipping the basics buys an hour and costs the afternoon — and it is usually the first thing to go on exactly the days it matters most."],
  hope: ["Anticipation is fuel, but it fades quietly if nothing is put in the calendar. Make it concrete while you still feel it.", "This is a real signal about what you want more of. Worth acting on before the week absorbs it."],
  relief: ["Relief is worth pausing on rather than immediately filling. The space you just made will be taken by default if you do not claim it.", "Something ended well. Notice what that lightness tells you about what was actually weighing the most."],
};
const themeStep: Record<ThemeId, string[]> = {
  exhaustion: ["Pick one commitment in the next two days and cancel, delay, or hand it over — then protect a specific rest window tonight and treat it like a meeting.", "Choose the single least consequential thing on tomorrow and drop it. Then decide now what time you stop tonight."],
  progress: ["Write the one decision that made this work, in a sentence, and add it where you will see it next time something similar starts.", "Name the exact move that unlocked it and pick one place this week to use it again."],
  blocked: ["Draft the follow-up now, in one sentence: what you need, from whom, by when. Send it before you close this.", "Write down the person and the single decision you are waiting on, then send the shortest possible ask with a date in it."],
  overload: ["List everything, circle the one item with the largest consequence if it slips, and give it your next focused block. Let the rest wait visibly rather than silently.", "Choose the three that actually matter, put the rest on a named “not this week” list, and tell one person what you have dropped."],
  conflict: ["Before replying, write three lines: what happened, what you felt, what outcome you want. Then let only the third one shape your next sentence.", "Decide the outcome you want from this person, then write one sentence that serves it. Say the rest to your notebook, not to them."],
  uncertainty: ["Make two short lists — what you can influence today, what you cannot — and take one ten-minute action from the first.", "Write the specific question you are actually waiting on an answer to, then decide who or what could answer it and when you will check."],
  selfBlame: ["Rewrite this as an account: what happened, what was outside your control, and the one thing you would change. Stop before adding a judgement.", "Name one part of this that was genuinely someone else's or nobody's, and one adjustment that is yours. Keep only the second."],
  gratitude: ["Tell them. One message, today, naming the specific thing they did — it takes a minute and it holds the thread open.", "Write down what exactly helped, then plan one way to invite more of it this week."],
  loneliness: ["Pick one safe person and send something small and honest — not an explanation, just an opening. A question is easier for them to answer than an update.", "Choose one person and put a real time in the calendar with them this week, however short."],
  rumination: ["Give it a container: ten minutes, on paper, then stop. Anything still circling after that goes on tomorrow's list, not tonight's.", "Write the loop out in full once, then write what you would need in order to close it. Do the smallest part of that."],
  bodyCare: ["Before anything else: water, food, and ten minutes away from the screen. Put the next break in the calendar so it survives a busy afternoon.", "Eat something properly and step outside briefly. Then block one real break into tomorrow before the day fills up."],
  hope: ["Put one concrete step in the calendar this week while the energy is here — a date makes it real.", "Take the first small action toward it today, even a five-minute one, so it is no longer only an idea."],
  relief: ["Claim some of the space you just made: choose one restorative thing and do it before the gap fills itself.", "Note what has just come off your plate, and decide deliberately what does — and does not — take its place."],
};
const gentleStep = "Keep it small: water, food, daylight, or one honest message to someone you trust. Small is the right size today.";

const moodName = (mood: Mood) => moods.find(item => item.value === mood)?.label ?? "Okay";
const wordCount = (value: string) => (value.trim() ? value.trim().split(/\s+/).length : 0);
// A log line is only useful if it says what actually changed, not merely that something did.
const describeDiaryChange = (before: DiaryEntry, after: { title: string; text: string; mood: Mood; issueIds: string[] }) => {
  const parts: string[] = [];
  if (before.mood !== after.mood) parts.push(`mood ${moodName(before.mood).toLowerCase()} → ${moodName(after.mood).toLowerCase()}`);
  if (before.title.trim() !== after.title.trim()) parts.push(!before.title.trim() ? "title added" : !after.title.trim() ? "title removed" : "title changed");
  const beforeLinks = (before.issueIds ?? []).length;
  const afterLinks = after.issueIds.length;
  if (beforeLinks !== afterLinks) parts.push(afterLinks > beforeLinks ? `linked to ${afterLinks - beforeLinks} more task${afterLinks - beforeLinks === 1 ? "" : "s"}` : `unlinked ${beforeLinks - afterLinks} task${beforeLinks - afterLinks === 1 ? "" : "s"}`);
  if (before.text.trim() !== after.text.trim()) {
    const delta = wordCount(after.text) - wordCount(before.text);
    parts.push(delta > 0 ? `${delta} word${delta === 1 ? "" : "s"} added` : delta < 0 ? `${-delta} word${delta === -1 ? "" : "s"} removed` : "wording reworked");
  }
  return parts.length ? parts.join(" · ") : "opened and saved without changes";
};
const diaryEventLabel = (action: DiaryAction) => (action === "created" ? "Written" : action === "edited" ? "Edited" : "Deleted");


/* ---------------------------------------------------------------------------
   Diary insights. Every number here is derived on the device from entries the
   writer already has — nothing is inferred about them beyond what they wrote.
--------------------------------------------------------------------------- */
const moodWeight: Record<Mood, number> = { bright: 2, calm: 1, okay: 0, low: -1, anxious: -1, frustrated: -1 };
const partsOfDay = [
  { id: "early", label: "Early", note: "before noon", from: 5, to: 11 },
  { id: "afternoon", label: "Afternoon", note: "midday to five", from: 12, to: 16 },
  { id: "evening", label: "Evening", note: "after work", from: 17, to: 21 },
  { id: "night", label: "Late night", note: "after ten", from: 22, to: 4 },
] as const;
const partOfDay = (hour: number) => partsOfDay.find(part => (part.from <= part.to ? hour >= part.from && hour <= part.to : hour >= part.from || hour <= part.to)) ?? partsOfDay[1];
const wordStops = new Set(("about after again against already also always another around back because been before being between both cannot could does doing down during each even ever every first from getting given goes going gone have having here into itself just keep kept last like made make more most much must need never next nothing once only other over really same should some something still such take taken than that their them then there these they thing things think this those three through today together took under until very want week were what when where which while will with without would your yourself").split(" "));
// Five letters and up, seen at least twice: shorter or rarer words are noise, not signature.
const signatureWords = (entries: DiaryEntry[]) => {
  const tally = new Map<string, number>();
  entries.forEach(entry => (`${entry.title} ${entry.text}`.toLowerCase().match(/[a-z][a-z'-]{4,}/g) || [])
    .filter(word => !wordStops.has(word))
    .forEach(word => tally.set(word, (tally.get(word) ?? 0) + 1)));
  return Array.from(tally.entries()).filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 8);
};

/* Prompts for a blank page. Stable through the day so the page does not shuffle
   under you, with a nudge available when none of them fit. */
const writingPrompts = [
  "What took up the most room in your head today?",
  "What went better than you expected?",
  "Who do you need to say something to, and what would you say?",
  "What are you carrying that is not yours to carry?",
  "If today repeated tomorrow, what one thing would you change?",
  "What did you decide today, and what made you decide it?",
  "What are you avoiding, and what does avoiding it cost?",
  "Where did the time actually go?",
  "What would make tomorrow easier, and can you set it up tonight?",
  "What is working right now that you would like more of?",
  "What did someone do for you today?",
  "What are you proud of that nobody else noticed?",
];
const lookBackWindows = [{ days: 365, label: "A year ago" }, { days: 180, label: "Six months ago" }, { days: 90, label: "Three months ago" }, { days: 30, label: "A month ago" }, { days: 7, label: "A week ago" }] as const;
export const diarySuggestion = (mood: Mood, text: string, title = "", history: DiaryEntry[] = [], writtenAt?: string) => {
  const raw = `${title} ${text}`.trim();
  const note = raw.toLowerCase();
  if (crisisPattern.test(note)) {
    return "What you have written matters, and it is more than this app should try to answer. Please reach out to someone today — a person you trust, your doctor, or your local crisis line — and if you are in immediate danger, call your local emergency number. Try not to be on your own right now.";
  }

  const themes = detectThemes(note);
  const top = themes[0];
  const second = themes[1];
  const intensity = intensityOf(raw);
  const need = statedNeed(text);
  const question = openQuestion(text);
  const pivot = pivotClause(text);
  const people = peopleMentioned(raw);
  const heavyMood = heavyMoods.includes(mood);
  const absolute = absoluteWord(text);
  const hour = new Date(writtenAt || Date.now()).getHours();
  const seed = `${mood}|${raw}`;

  const recent = history.filter(entry => Date.now() - new Date(entry.at).getTime() < 8 * 86400000).slice(0, 8);
  const recurrence = top ? recent.filter(entry => detectThemes(`${entry.title} ${entry.text}`.toLowerCase()).some(theme => theme.id === top.id)).length : 0;
  const heavyStreak = heavyMood && history.slice(0, 2).length === 2 && history.slice(0, 2).every(entry => heavyMoods.includes(entry.mood));
  const lifted = (mood === "bright" || mood === "calm") && history[0] && heavyMoods.includes(history[0].mood);
  const positiveContent = themes.some(theme => ["progress", "gratitude", "relief", "hope"].includes(theme.id) && theme.score >= 2);

  // 1 — reflect back the specific thing they wrote, in their own words.
  /* When a theme drives the insight, quote a line that actually carries that theme —
     quoting the longest sentence instead made the mirror and the insight disagree. */
  const themedClause = () => {
    const pattern = top ? themeLexicon.find(theme => theme.id === top.id)?.pattern : undefined;
    if (!pattern) return strongestClause(text);
    const carrying = text.split(/[.!?\n]+/).map(tidy).filter(part => part.split(" ").length >= 4)
      .filter(clause => Array.from(clause.matchAll(pattern)).some(match => !negatorPattern.test(clause.slice(Math.max(0, (match.index ?? 0) - 26), match.index ?? 0))))
      .sort((a, b) => b.length - a.length);
    return carrying.length ? clip(carrying[0]) : strongestClause(text);
  };
  const mirror = need
    ? pickFrom([`You said it yourself: ${quote(need)}`, `The clearest line in this is your own: ${quote(need)}`], seed)
    : question
      ? `You ended on a question — ${quote(question)} — and that is the honest centre of this entry.`
      : pivot
        ? pickFrom([`Past the setup, this is where the weight sits: ${quote(pivot)}`, `You moved through the context quickly and landed here: ${quote(pivot)}`], seed)
        : title.trim()
          ? `“${clip(tidy(title))}” — and the line that carries it is ${quote(themedClause())}`
          : quote(themedClause());

  // 2 — what the combination suggests, using history where it earns its place.
  let insight: string;
  if (lifted) insight = `Your last entry was ${moodLabel(history[0].mood)} and today is ${moodLabel(mood)}. Something moved between then and now, and naming it precisely is what makes it repeatable rather than lucky.`;
  else if (heavyStreak) insight = "That is three entries in a row carrying weight. One hard day is weather; three is a pattern — and patterns usually need something structural to change, not more effort from you.";
  else if (top && recurrence >= 2) insight = `${top.label.charAt(0).toUpperCase()}${top.label.slice(1)} has now appeared in ${recurrence + 1} of your recent entries. At that frequency it has stopped being a bad day and started being a condition worth changing on purpose.`;
  else if (positiveContent && heavyMood) insight = `You described real progress and still marked the day ${moodLabel(mood)}. That gap is the more interesting thing here — the work moved and something else did not, and it is usually the something else that needs attention.`;
  else if (top && second && top.id === "blocked" && second.id === "conflict") insight = "This is both a stalled handoff and a strained relationship, and they are feeding each other — the longer the silence runs, the more personal it starts to feel.";
  else if (top && second && (top.id === "overload" || second.id === "overload") && (top.id === "exhaustion" || second.id === "exhaustion")) insight = "Too much to do and nothing left to do it with is a combination that does not resolve by pushing. At this point capacity is the constraint, not effort.";
  else if (top && second && (top.id === "selfBlame" || second.id === "selfBlame") && (top.id === "progress" || second.id === "progress")) insight = "You recorded something that went well and still found the fault to sit with. That habit is expensive: it quietly deletes your own evidence.";
  else if (top) insight = pickFrom(themeInsight[top.id], seed);
  else if (absolute) insight = `The phrase “${absolute}” is doing a lot of work in here. Under pressure that kind of certainty arrives fast, and it is almost never as true as it feels.`;
  else if (raw.split(/\s+/).length < 25) insight = "This is short, which is fine — but short entries are hard to learn from later. One concrete detail turns a note into something you can look back on.";
  else insight = `This reads as ${moodLabel(mood)} more than it reads as any one problem, which usually means the state is worth tending before the to-do list is.`;

  // 3 — one step, sized to what is actually left in the tank.
  let step = top ? pickFrom(themeStep[top.id], seed) : "Write one sentence for what you need next, then turn that need into the smallest practical action.";
  // Only name a person where the entry makes it unambiguous who the other side is.
  if (people.length && top?.id === "conflict") step = step.replace(/\bthis person\b/, people[0]).replace(/\bthem\b/, people[0]);
  if (!top && (mood === "low" || heavyMood)) step = gentleStep;
  // A themed step still applies on a heavy day — it just needs permission to be done badly.
  else if (mood === "low" || (top?.id === "exhaustion" && intensity > 0.45)) step = `${step} If today is not the day for all of it, do the smaller half.`;
  if (absolute && top && top.id !== "selfBlame") step = `${step} And where you wrote “${absolute}”, try naming the one specific time instead — the specific version is the one you can do something about.`;

  const closing = hour >= 23 || hour < 5
    ? " Written this late, everything carries more weight than it will at nine in the morning — hold any big conclusion until then."
    : hasTimePressure(text) && intensity > 0.35
      ? " And the clock in this entry is real, so give the step a time rather than a hope."
      : "";

  return `${mirror} ${insight} ${step}${closing}`;
};
type NotificationDelivery = "service-worker" | "browser";
type NotificationResult = { delivery: NotificationDelivery; reason?: string } | { delivery: null; reason: string };

/* The notification worker is registered once per page load and shared. Registering
   inside every send (as this used to) hands back a registration whose worker has not
   activated yet, and showNotification() throws on a registration with no active worker —
   which is why the first, and often every, reminder silently fell through. */
let workerRegistration: Promise<ServiceWorkerRegistration | null> | null = null;
const notificationWorker = () => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  if (!workerRegistration) {
    workerRegistration = navigator.serviceWorker.register("/sw.js")
      .then(async registration => {
        if (registration.active) return registration;
        // navigator.serviceWorker.ready only resolves once a worker is active for this scope.
        const settled = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>(resolve => window.setTimeout(() => resolve(null), 5000)),
        ]);
        return settled ?? (registration.active ? registration : null);
      })
      .catch(error => { console.warn("Signal Petal could not register its notification worker.", error); return null; });
  }
  return workerRegistration;
};
const describeError = (error: unknown) => (error instanceof Error && error.message ? error.message : String(error));
const sendReminderNotification = async (title: string, body: string, tag: string): Promise<NotificationResult> => {
  if (typeof window === "undefined" || !("Notification" in window)) return { delivery: null, reason: "this browser has no Notification support" };
  if (Notification.permission === "denied") return { delivery: null, reason: "notifications are blocked for this address in your browser settings" };
  if (Notification.permission !== "granted") return { delivery: null, reason: "notification permission has not been granted yet" };

  const failures: string[] = [];
  const registration = await notificationWorker();
  if (registration?.active) {
    try {
      const options: NotificationOptions = { body, tag };
      // renotify is rejected by some engines; retry without it rather than losing the notification.
      try { await registration.showNotification(title, { ...options, renotify: true } as NotificationOptions); }
      catch { await registration.showNotification(title, options); }
      return { delivery: "service-worker" };
    } catch (error) { failures.push(`background service: ${describeError(error)}`); }
  } else if ("serviceWorker" in navigator) {
    failures.push("background service: the notification worker never became active");
  }

  try {
    const notification = new Notification(title, { body, tag });
    notification.onclick = () => { window.focus(); notification.close(); };
    notification.onerror = () => console.warn("Signal Petal browser notification was rejected by the operating system.");
    return { delivery: "browser", reason: failures.join(" · ") || undefined };
  } catch (error) {
    failures.push(`browser: ${describeError(error)}`);
    return { delivery: null, reason: failures.join(" · ") };
  }
};
/* Notification permission is browser state, not component state: it changes from the
   permission prompt, from site settings, and from another tab. Reading it through an
   external store keeps the UI honest instead of showing whatever it was at page load. */
const permissionListeners = new Set<() => void>();
const announcePermissionChange = () => permissionListeners.forEach(listener => listener());
const permissionStore = {
  subscribe(onChange: () => void) {
    permissionListeners.add(onChange);
    let cancelled = false;
    let watcher: PermissionStatus | null = null;
    navigator.permissions?.query({ name: "notifications" as PermissionName })
      .then(status => { if (cancelled) return; watcher = status; status.addEventListener("change", onChange); })
      .catch(() => undefined);
    const onVisible = () => { if (document.visibilityState === "visible") onChange(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onChange);
    return () => {
      cancelled = true;
      permissionListeners.delete(onChange);
      watcher?.removeEventListener("change", onChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onChange);
    };
  },
  getSnapshot: (): NotificationPermission | "unsupported" => ("Notification" in window ? Notification.permission : "unsupported"),
  getServerSnapshot: (): NotificationPermission | "unsupported" => "default",
};
const osLevelHint ="If nothing appeared on screen, the block is outside the browser: on macOS open System Settings → Notifications, allow your browser, and check that Do Not Disturb or a Focus mode is off. On Windows, check Settings → System → Notifications.";
const describeDelivery = (result: NotificationResult, label: string) => result.delivery
  ? `${label} sent through ${result.delivery === "service-worker" ? "the background notification service" : "the browser"}. ${osLevelHint}`
  : `${label} could not be delivered — ${result.reason}.`;

export default function Home() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [activeId, setActiveId] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDailyCheckIn, setShowDailyCheckIn] = useState(false);
  const [memoryIssueId, setMemoryIssueId] = useState("");
  // The three optional fields stay mounted while collapsed so FormData still carries
  // their existing values on save; hiding them with `hidden` rather than unmounting.
  useDialogFocus();
  const [memoryDetail, setMemoryDetail] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const [dailyCheckIns, setDailyCheckIns] = useState<DailyCheckIn[]>([]);
  const [checkInCapacity, setCheckInCapacity] = useState<DailyCheckIn["capacity"]>("steady");
  const [checkInNote, setCheckInNote] = useState("");
  const [checkInParked, setCheckInParked] = useState<string[]>([]);
  const [checkInStep, setCheckInStep] = useState(0);
  const [checkInWin, setCheckInWin] = useState("");
  const [checkInTomorrowMove, setCheckInTomorrowMove] = useState("");
  const [checkInResumeAt, setCheckInResumeAt] = useState("");
  const [checkInShowAll, setCheckInShowAll] = useState(false);
  const [showCheckInHistory, setShowCheckInHistory] = useState(false);
  const [checkInSaved, setCheckInSaved] = useState(false);
  const [statuses, setStatuses] = useState<Status[]>(defaultStatuses);
  const [statusColors, setStatusColors] = useState<Record<string, string>>(defaultStatusColors);
  const [statusDraft, setStatusDraft] = useState<StatusDraft[]>([]);
  const [statusInput, setStatusInput] = useState("");
  const [statusError, setStatusError] = useState("");
  const [transferCode, setTransferCode] = useState("");
  const [importCode, setImportCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [diaryLog, setDiaryLog] = useState<DiaryEvent[]>([]);
  const [editingDiaryId, setEditingDiaryId] = useState("");
  const [openDiaryId, setOpenDiaryId] = useState("");
  const [confirmDiaryDelete, setConfirmDiaryDelete] = useState("");
  /* Deleting is guarded AND undoable: the confirm stops the misclick, the undo
     catches the moment you meant a different page. */
  const [undo, setUndo] = useState<{ label: string; restore: () => void } | null>(null);
  /* The one moment worth celebrating in a queue app is something leaving the queue.
     Closing an issue used to be a silent <select> change and the card just vanished. */
  const [win, setWin] = useState<{ title: string; span: string } | null>(null);
  const [diaryFont, setDiaryFont] = useState("journal");
  const [diaryPaper, setDiaryPaper] = useState("cream");
  const [diaryQuery, setDiaryQuery] = useState("");
  const [diaryMoodFilter, setDiaryMoodFilter] = useState<Mood | "">("");
  const [promptIndex, setPromptIndex] = useState(0);
  const [diaryLinks, setDiaryLinks] = useState<string[]>([]);
  const [editDraft, setEditDraft] = useState<{ title: string; text: string; mood: Mood; issueIds: string[] }>({ title: "", text: "", mood: "okay", issueIds: [] });
  const [diaryMood, setDiaryMood] = useState<Mood>("okay");
  const [diaryTitle, setDiaryTitle] = useState("");
  const [diaryText, setDiaryText] = useState("");
  const [transferMessage, setTransferMessage] = useState("");
  const [lastBackup, setLastBackup] = useState("");
  const [lockOn, setLockOn] = useState(false);
  const [diaryLocked, setDiaryLocked] = useState(false);
  const [diaryKey, setDiaryKey] = useState<CryptoKey | null>(null);
  const [lockPass, setLockPass] = useState("");
  const [lockConfirm, setLockConfirm] = useState("");
  const [lockUnderstood, setLockUnderstood] = useState(false);
  const [lockMessage, setLockMessage] = useState("");
  const [lockBusy, setLockBusy] = useState(false);
  const [showLockSetup, setShowLockSetup] = useState(false);
  // Only the salt needs to outlive a re-seal; the ciphertext is read back from storage.
  const saltRef = useRef("");
  const [followUpInput, setFollowUpInput] = useState("");
  const [newFollowUps, setNewFollowUps] = useState<string[]>([]);
  const [newLane, setNewLane] = useState<Lane | undefined>(undefined);
  const [newFollowUpInput, setNewFollowUpInput] = useState("");
  const [filter, setFilter] = useState<"All" | "Mine" | "Overdue" | "Archive">("All");
  const [metricFocus, setMetricFocus] = useState<MetricFocus>("home-total");
  const [focusRescheduleId, setFocusRescheduleId] = useState("");
  const [focusCompletingId, setFocusCompletingId] = useState("");
  const [section, setSection] = useState<"dashboard" | "calendar" | "metrics" | "diary" | "review" | "settings">("dashboard");
  const [insightRange, setInsightRange] = useState<InsightRange>("30");
  const [insightSection, setInsightSection] = useState<InsightSection>("work");
  const [insightDrilldown, setInsightDrilldown] = useState<InsightDrilldown>("");
  const [diaryInsightPrefs, setDiaryInsightPrefs] = useState({ mood: true, themes: true, words: false });
  const [reviewWeek, setReviewWeek] = useState<Date | null>(null);
  const [reviewRange, setReviewRange] = useState<"calendar" | "recent">("calendar");
  const [reviewCopied, setReviewCopied] = useState("");
  /* On by default because the takeaway is the line that makes an update read as thought-through; one click removes it. */
  const [reviewTakeaway, setReviewTakeaway] = useState(true);
  const [copyPeriod, setCopyPeriod] = useState<"week" | "quarter" | "year">("week");
  const [showOlderDone, setShowOlderDone] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date(2026, 7, 1));
  const [selectedDay, setSelectedDay] = useState<string>("2026-08-13");
  const [theme, setTheme] = useState("rose");
  const [darkMode, setDarkMode] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const permission = useSyncExternalStore(permissionStore.subscribe, permissionStore.getSnapshot, permissionStore.getServerSnapshot);
  const storageTrouble: StorageTrouble = useSyncExternalStore(storageStore.subscribe, storageStore.getSnapshot, storageStore.getServerSnapshot);
  const [backupSnoozed, setBackupSnoozed] = useState("");
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("16:30");
  const [reminderFeedback, setReminderFeedback] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("checking");
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [syncAccount, setSyncAccount] = useState<{ email: string; displayName: string } | null>(null);
  const [showResetAccount, setShowResetAccount] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const syncRevision = useRef(0);
  const cloudReady = useRef(false);
  // -1 until hydration, so the server and the first client render agree.
  const [nowHour, setNowHour] = useState(-1);
  const [pixelYear, setPixelYear] = useState(0);

  useEffect(() => {
    let loadedIssues: Issue[] = [];
    const saved = readStore("signal-petal-issues");
    if (saved) {
      try { loadedIssues = normaliseIssues(JSON.parse(saved) as Issue[]).map(i => ({ ...i, followUpPeople: i.followUpPeople.filter(person => typeof person === "string" && person.trim()).map(person => person.trim()), createdAt: i.createdAt || i.updates?.[0]?.at || new Date().toISOString() })); setIssues(loadedIssues); }
      catch { dropStore("signal-petal-issues"); }
    }
    const savedStatuses = readStore("signal-petal-statuses");
    let loadedStatuses = defaultStatuses;
    if (savedStatuses) {
      try { const parsed = JSON.parse(savedStatuses); if (Array.isArray(parsed)) loadedStatuses = parsed.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map(value => value.trim()); }
      catch { dropStore("signal-petal-statuses"); }
    }
    const terminalStatus = loadedStatuses.includes("Closed") && !loadedStatuses.includes("Resolved") ? "Closed" : "Resolved";
    const customStatuses = Array.from(new Set([...loadedStatuses, ...loadedIssues.map(issue => issue.status)].filter(status => !["New", "Ongoing", "Resolved", "Closed"].includes(status))));
    setStatuses(["New", "Ongoing", ...customStatuses, terminalStatus]);
    const savedColors = readStore("signal-petal-status-colors");
    if (savedColors) { try { const parsed = JSON.parse(savedColors); if (parsed && typeof parsed === "object") setStatusColors({ ...defaultStatusColors, ...parsed }); } catch { dropStore("signal-petal-status-colors"); } }
    const savedProfile = readStore("signal-petal-profile");
    if (savedProfile) { try { const parsed = JSON.parse(savedProfile) as Profile; if (parsed.name?.trim() && parsed.role?.trim()) setProfile({ name: parsed.name.trim(), role: parsed.role.trim() }); } catch { dropStore("signal-petal-profile"); } }
    setTheme(readStore("signal-petal-theme") || "rose");
    setDarkMode(readStore("signal-petal-dark") === "true");
    setReminderTime(readStore("signal-petal-reminder-time") || "16:30");
    setDiaryFont(readStore("signal-petal-diary-font") || "journal");
    setDiaryPaper(readStore("signal-petal-diary-paper") || "cream");
    const savedInsightPrefs = readStore("signal-petal-insight-privacy");
    if (savedInsightPrefs) {
      try { const parsed = JSON.parse(savedInsightPrefs); if (parsed && typeof parsed === "object") setDiaryInsightPrefs(current => ({ ...current, ...parsed })); }
      catch { dropStore("signal-petal-insight-privacy"); }
    }
    setLastBackup(readStore("signal-petal-last-backup") || "");
    setBackupSnoozed(readStore("signal-petal-backup-snoozed") || "");
    const savedCheckIns = readStore("signal-petal-daily-check-ins");
    if (savedCheckIns) { try { const parsed = JSON.parse(savedCheckIns); if (Array.isArray(parsed)) setDailyCheckIns(parsed); } catch { dropStore("signal-petal-daily-check-ins"); } }
    setPromptIndex(Math.floor(new Date().setHours(0, 0, 0, 0) / 86400000) % writingPrompts.length);
    setReviewWeek(startOfWeek(new Date()));
    const storedVault = readStoredVault();
    if (storedVault) { saltRef.current = storedVault.salt; setLockOn(true); setDiaryLocked(true); }
    let loadedDiary: DiaryEntry[] = [];
    const savedDiary = readStore("signal-petal-diary");
    if (savedDiary) { try { const parsed = JSON.parse(savedDiary); if (Array.isArray(parsed)) loadedDiary = parsed; } catch { dropStore("signal-petal-diary"); } }
    if (!readStoredVault()) setDiaryEntries(loadedDiary);
    let loadedDiaryLog: DiaryEvent[] = [];
    const savedDiaryLog = readStore("signal-petal-diary-log");
    if (savedDiaryLog) { try { const parsed = JSON.parse(savedDiaryLog); if (Array.isArray(parsed)) loadedDiaryLog = parsed; } catch { dropStore("signal-petal-diary-log"); } }
    // Reflections written before the log existed still deserve a place on the calendar.
    const alreadyLogged = new Set(loadedDiaryLog.filter(event => event.action === "created").map(event => event.entryId));
    const backfilled = loadedDiary
      .filter(entry => !alreadyLogged.has(entry.id))
      .map<DiaryEvent>(entry => ({ id: `backfill-${entry.id}`, entryId: entry.id, at: entry.at, action: "created", title: entry.title, mood: entry.mood, detail: `${wordCount(entry.text)} word${wordCount(entry.text) === 1 ? "" : "s"}` }));
    if (!readStoredVault()) setDiaryLog([...backfilled, ...loadedDiaryLog].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()));
    const savedReminders = readStore("signal-petal-reminders-enabled");
    if ("Notification" in window) setRemindersEnabled(Notification.permission === "granted" && savedReminders !== "false");
    setNowHour(new Date().getHours());
    setPixelYear(new Date().getFullYear());
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) writeStore("signal-petal-issues", JSON.stringify(issues)); }, [issues, hydrated]);
  useEffect(() => { if (hydrated) writeStore("signal-petal-statuses", JSON.stringify(statuses)); }, [statuses, hydrated]);
  useEffect(() => { if (hydrated) writeStore("signal-petal-status-colors", JSON.stringify(statusColors)); }, [statusColors, hydrated]);
  useEffect(() => { if (hydrated) { writeStore("signal-petal-theme", theme); writeStore("signal-petal-dark", String(darkMode)); } }, [theme, darkMode, hydrated]);
  useEffect(() => { if (hydrated) writeStore("signal-petal-reminders-enabled", String(remindersEnabled)); }, [remindersEnabled, hydrated]);
  useEffect(() => { if (hydrated) writeStore("signal-petal-reminder-time", reminderTime); }, [reminderTime, hydrated]);
  useEffect(() => { if (hydrated) writeStore("signal-petal-daily-check-ins", JSON.stringify(dailyCheckIns)); }, [dailyCheckIns, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    const syncTaskRoute = (closeWhenMissing = false) => {
      const match = window.location.pathname.match(/^\/tasks\/([^/]+)$/);
      if (!match) { if (closeWhenMissing) setShowDetail(false); return; }
      const issueId = decodeURIComponent(match[1]);
      if (issues.some(issue => issue.id === issueId)) openIssueDetail(issueId, false);
    };
    syncTaskRoute();
    const onPopState = () => syncTaskRoute(true);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [hydrated, issues]);
  useEffect(() => { if (hydrated) writeStore("signal-petal-insight-privacy", JSON.stringify(diaryInsightPrefs)); }, [diaryInsightPrefs, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    if (lockOn) {
      // With the lock on, no plaintext copy is allowed to linger.
      dropStore("signal-petal-diary");
      dropStore("signal-petal-diary-log");
      return;
    }
    writeStore("signal-petal-diary", JSON.stringify(diaryEntries));
    writeStore("signal-petal-diary-log", JSON.stringify(diaryLog));
  }, [diaryEntries, diaryLog, hydrated, lockOn]);
  // Re-seal whenever the unlocked diary changes.
  useEffect(() => {
    if (!hydrated || !lockOn || diaryLocked || !diaryKey || !saltRef.current) return;
    let cancelled = false;
    void (async () => {
      const sealed = await sealDiary(diaryKey, saltRef.current, diaryEntries, diaryLog);
      if (!cancelled) writeStore("signal-petal-diary-vault", JSON.stringify(sealed));
    })();
    return () => { cancelled = true; };
  }, [diaryEntries, diaryLog, diaryKey, diaryLocked, lockOn, hydrated]);
  useEffect(() => { if (hydrated) { writeStore("signal-petal-diary-font", diaryFont); writeStore("signal-petal-diary-paper", diaryPaper); } }, [diaryFont, diaryPaper, hydrated]);
  useEffect(() => { if (hydrated && profile) { writeStore("signal-petal-profile", JSON.stringify(profile)); document.title = `${profile.name}'s Signal Petal`; } }, [profile, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void (async () => {
      setSyncState("checking");
      try {
        const response = await fetch("/api/sync", { cache: "no-store" });
        if (response.status === 401) { setSyncState("signed-out"); return; }
        if (!response.ok) throw new Error("Cloud sync is unavailable.");
        const result = await response.json() as { payload: TransferPayload | null; revision: number; updatedAt: string | null; account: { email: string; displayName: string } };
        if (cancelled) return;
        syncRevision.current = result.revision;
        setSyncAccount(result.account);
        if (result.payload && isValidPayload(result.payload)) {
          const local = currentPayload();
          const incomingHasLockedDiary = !!result.payload.diaryVault;
          const localHasLockedDiary = !!local.diaryVault;
          const safeIncoming = incomingHasLockedDiary || localHasLockedDiary
            ? { ...result.payload, diaryEntries: local.diaryEntries, diaryLog: local.diaryLog, diaryVault: local.diaryVault }
            : result.payload;
          const merged = mergeTransferData(local, safeIncoming).payload;
          setIssues(merged.issues); setStatuses(merged.statuses); setStatusColors(merged.statusColors);
          setDiaryEntries(merged.diaryEntries ?? []); setDiaryLog(merged.diaryLog ?? []); setDailyCheckIns(merged.dailyCheckIns ?? []);
          if (result.payload.profile) setProfile(result.payload.profile);
          if (result.payload.settings) {
            if (result.payload.settings.theme) setTheme(result.payload.settings.theme);
            if (typeof result.payload.settings.darkMode === "boolean") setDarkMode(result.payload.settings.darkMode);
            if (result.payload.settings.reminderTime) setReminderTime(result.payload.settings.reminderTime);
            if (result.payload.settings.diaryFont) setDiaryFont(result.payload.settings.diaryFont);
            if (result.payload.settings.diaryPaper) setDiaryPaper(result.payload.settings.diaryPaper);
          }
          if (incomingHasLockedDiary && !localHasLockedDiary && result.payload.diaryVault) {
            writeStore("signal-petal-diary-vault", JSON.stringify(result.payload.diaryVault));
            saltRef.current = result.payload.diaryVault.salt; setLockOn(true); setDiaryLocked(true);
          }
          setActiveId(merged.issues[0]?.id ?? "");
        }
        setLastSyncedAt(result.updatedAt ?? "");
        cloudReady.current = true;
        setSyncState(result.payload ? "synced" : "syncing");
      } catch {
        if (!cancelled) setSyncState(navigator.onLine ? "error" : "offline");
      }
    })();
    return () => { cancelled = true; };
  }, [hydrated]);
  useEffect(() => {
    if (!hydrated || !cloudReady.current) return;
    setSyncState(navigator.onLine ? "syncing" : "offline");
    const timer = window.setTimeout(async () => {
      if (!navigator.onLine) return setSyncState("offline");
      try {
        const response = await fetch("/api/sync", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: currentPayload(), revision: syncRevision.current }) });
        if (response.status === 401) { cloudReady.current = false; return setSyncState("signed-out"); }
        const result = await response.json() as { revision?: number; updatedAt?: string; payload?: TransferPayload };
        if (response.status === 409 && result.payload && isValidPayload(result.payload)) {
          syncRevision.current = result.revision ?? syncRevision.current;
          const merged = mergeTransferData(currentPayload(), result.payload).payload;
          setIssues(merged.issues); setStatuses(merged.statuses); setStatusColors(merged.statusColors);
          setDiaryEntries(merged.diaryEntries ?? []); setDiaryLog(merged.diaryLog ?? []); setDailyCheckIns(merged.dailyCheckIns ?? []);
          setSyncMessage("A newer cloud copy was found and safely merged with this device.");
          return setSyncState("syncing");
        }
        if (!response.ok) throw new Error("Sync failed");
        syncRevision.current = result.revision ?? syncRevision.current;
        setLastSyncedAt(result.updatedAt ?? new Date().toISOString()); setSyncState("synced");
      } catch { setSyncState(navigator.onLine ? "error" : "offline"); }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [issues, statuses, statusColors, diaryEntries, diaryLog, dailyCheckIns, profile, theme, darkMode, reminderTime, diaryFont, diaryPaper, hydrated, lockOn]);
  useEffect(() => { void notificationWorker(); }, []);
  useEffect(() => {
    const refresh = () => setNowHour(new Date().getHours());
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(refresh, 600000);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 12000);
    return () => window.clearTimeout(timer);
  }, [undo]);
  useEffect(() => {
    if (!win) return;
    const timer = window.setTimeout(() => setWin(null), 7000);
    return () => window.clearTimeout(timer);
  }, [win]);
  useEffect(() => {
    if (!showDetail && !showCreate && !showDeleteConfirm && !showDailyCheckIn && !memoryIssueId && !showOnboarding && !showCommandPalette && !openDiaryId && !confirmDiaryDelete) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (confirmDiaryDelete) setConfirmDiaryDelete("");
        else if (showDeleteConfirm) setShowDeleteConfirm(false);
        else if (openDiaryId) { setOpenDiaryId(""); setEditingDiaryId(""); }
        else if (memoryIssueId) setMemoryIssueId("");
        else if (showCommandPalette) setShowCommandPalette(false);
        else if (showOnboarding) finishOnboarding();
        else if (showDailyCheckIn) setShowDailyCheckIn(false);
        else if (showCreate) setShowCreate(false);
        else setShowDetail(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = previousOverflow; };
  }, [showDetail, showCreate, showDeleteConfirm, showDailyCheckIn, memoryIssueId, showOnboarding, showCommandPalette, openDiaryId, confirmDiaryDelete]);
  useEffect(() => {
    const openCommands = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandQuery(""); setCommandIndex(0); setShowCommandPalette(true); }
      else if (event.key === "/" && !typing && !showDetail && !showCreate) { event.preventDefault(); setCommandQuery(""); setCommandIndex(0); setShowCommandPalette(true); }
    };
    document.addEventListener("keydown", openCommands);
    return () => document.removeEventListener("keydown", openCommands);
  }, [showDetail, showCreate]);
  /* The scheduler reads the live queue through a ref so that editing an issue no longer
     tears down and restarts the one-minute timer. */
  const issuesRef = useRef(issues);
  useEffect(() => { issuesRef.current = issues; }, [issues]);
  // A saved preference is not the same as permission — reminders only run when both hold.
  const remindersOn = remindersEnabled && permission === "granted";
  useEffect(() => {
    if (!hydrated || !remindersOn) return;
    let cancelled = false;
    const check = async () => {
      if (cancelled || !("Notification" in window) || Notification.permission !== "granted") return;
      const now = new Date();
      const pad = (value: number) => String(value).padStart(2, "0");
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const dueSoon = issuesRef.current.filter(issue => !isCompleteStatus(issue.status) && issue.expected && new Date(issue.expected).getTime() <= now.getTime() + 24 * 60 * 60 * 1000);
      // Keying on which items are due — not just the date — means work that slips later in
      // the day still raises an alert instead of being swallowed by this morning's reminder.
      const taskReminderKey = `${today}|${dueSoon.map(issue => issue.id).sort().join(",")}`;
      if (dueSoon.length && readStore("signal-petal-task-reminder-day") !== taskReminderKey) {
        const overdue = dueSoon.filter(isOverdue).length;
        const upcoming = dueSoon.length - overdue;
        const parts = [overdue ? `${overdue} overdue` : "", upcoming ? `${upcoming} due within 24 hours` : ""].filter(Boolean).join(" and ");
        const result = await sendReminderNotification("Signal Petal needs attention", `${parts}. Open your queue to record the next move.`, `signal-petal-tasks-${today}`);
        if (cancelled) return;
        if (result.delivery) { writeStore("signal-petal-task-reminder-day", taskReminderKey); setReminderFeedback(`Task reminder sent at ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`); }
        else setReminderFeedback(`Task reminder could not be delivered — ${result.reason}.`);
      }
      const [hour, minute] = reminderTime.split(":").map(Number);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
      // The time is part of the key, so moving the check-in earlier re-arms it for today.
      const checkInKey = `${today}|${reminderTime}`;
      if (now.getHours() * 60 + now.getMinutes() >= hour * 60 + minute && readStore("signal-petal-check-in-day") !== checkInKey) {
        const result = await sendReminderNotification("Daily Signal Petal check-in", "Take a moment to update your work and write down how the day felt.", `signal-petal-check-in-${today}`);
        if (cancelled) return;
        if (result.delivery) { writeStore("signal-petal-check-in-day", checkInKey); setReminderFeedback(`Daily check-in sent at ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`); }
        else setReminderFeedback(`Daily check-in could not be delivered — ${result.reason}.`);
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    const timer = window.setInterval(() => void check(), 60000);
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [hydrated, remindersOn, reminderTime]);

  const active = issues.find(i => i.id === activeId) ?? issues[0];
  const notificationState = permission === "unsupported" ? "Not supported in this browser"
    : permission === "denied" ? "Blocked — allow in your browser settings"
    : permission === "default" ? "Off — turn on to allow notifications"
    : remindersOn ? "Notifications on" : "Allowed, reminders paused";
  const diaryFontStack = (diaryFonts.find(font => font[0] === diaryFont) ?? diaryFonts[0])[2];
  const diarySkin = { "--diary-font": diaryFontStack } as CSSProperties;
  const openEntry = diaryEntries.find(entry => entry.id === openDiaryId);
  const review = useMemo(() => {
    if (!reviewWeek) return null;
    const today = new Date();
    const recentStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    const from = (reviewRange === "recent" ? recentStart : reviewWeek).getTime();
    const to = (reviewRange === "recent" ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) : addDays(reviewWeek, 7)).getTime();
    const work = workInPeriod(issues, diaryEntries, dailyCheckIns, from, to);
    const { shipped, pages } = work;
    const owed = pages.map(entry => statedNeed(entry.text)).filter(Boolean).slice(0, 3);
    const previous = diaryEntries.filter(entry => { const at = new Date(entry.at).getTime(); return at >= from - 7 * 86400000 && at < from; });
    const carried = previous.map(entry => statedNeed(entry.text)).filter(Boolean).slice(0, 2);
    const feel = pages.length ? pages.reduce((sum, entry) => sum + moodWeight[entry.mood], 0) / pages.length : null;
    const gardenStage = Math.min(4, Number(shipped.length > 0) + Number(pages.length > 0) + Number(work.checkIns.length > 0) + Number(work.focusMoves.length > 0));
    return { ...work, owed, carried, feel, gardenStage, isThisWeek: reviewRange === "calendar" && startOfWeek(today).getTime() === from, isRecent: reviewRange === "recent" };
  }, [reviewWeek, reviewRange, issues, diaryEntries, dailyCheckIns]);
  /* Numbered from the oldest page, so page 1 stays page 1 forever. */
  const pageNumbers = useMemo(() => {
    const order = [...diaryEntries].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return new Map(order.map((entry, index) => [entry.id, index + 1]));
  }, [diaryEntries]);
  const diaryYears = Array.from(new Set(diaryEntries.map(entry => new Date(entry.at).getFullYear()))).sort((a, b) => b - a);
  const shownYear = pixelYear || new Date().getFullYear();
  const pixels = useMemo(() => (diaryEntries.length ? yearGrid(diaryEntries, shownYear) : null), [diaryEntries, shownYear]);
  const pixelsWritten = pixels ? pixels.reduce((sum, row) => sum + row.days.filter(day => day.entry).length, 0) : 0;
  /* Work that closed WITH an outcome written down. A counter cannot show you what
     you actually did this quarter; the outcomes in your own words can. */
  const shippedWall = useMemo(() => issues
    .filter(issue => isCompleteStatus(issue.status) && issue.outcome.trim())
    .sort((a, b) => new Date(completedAtOf(b)).getTime() - new Date(completedAtOf(a)).getTime())
    .slice(0, 12), [issues]);
  /* The round before this one, so a task that has come round again can open with what was
     worked out last time rather than as a blank slate. */
  const previousRound = active?.repeatedFrom ? issues.find(item => item.id === active.repeatedFrom) : undefined;
  const previousNote = previousRound?.memory?.learning?.trim() || previousRound?.memory?.resolution?.trim() || previousRound?.outcome?.trim() || "";
  const backupAge = lastBackup ? daysSince(lastBackup) : null;
  /* Only worth mentioning when there is something to lose, it has actually been a while, and
     the writer has not already said not now this week. The same 14 days Settings uses. */
  const backupDue = (issues.length > 0 || diaryEntries.length > 0)
    && (backupAge === null || backupAge >= 14)
    && (!backupSnoozed || daysSince(backupSnoozed) >= 7);
  const confirmEntry = diaryEntries.find(entry => entry.id === confirmDiaryDelete);
  const diaryNeedle = diaryQuery.trim().toLowerCase();
  const visibleDiary = diaryEntries.filter(entry =>
    (!diaryMoodFilter || entry.mood === diaryMoodFilter) &&
    (!diaryNeedle || `${entry.title} ${entry.text}`.toLowerCase().includes(diaryNeedle)));
  /* Look back finds the nearest page to a round number of days ago, within a few days
     either side, so a young diary still has something to show. */
  const lookBack = (() => {
    for (const window of lookBackWindows) {
      const target = Date.now() - window.days * 86400000;
      const near = diaryEntries
        .map(entry => ({ entry, gap: Math.abs(new Date(entry.at).getTime() - target) }))
        .filter(candidate => candidate.gap <= 4 * 86400000)
        .sort((a, b) => a.gap - b.gap)[0];
      if (near) return { label: window.label, entry: near.entry };
    }
    return null;
  })();
  const personalOwner = profile?.name || "You";
  const currentIssues = issues.filter(issue => !issue.archivedAt);
  const todayKey = dayKey(new Date().toISOString());
  const todayCheckIn = dailyCheckIns.find(checkIn => dayKey(checkIn.at) === todayKey);
  const previousCheckIn = [...dailyCheckIns].filter(checkIn => dayKey(checkIn.at) !== todayKey).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
  const completedToday = currentIssues.filter(issue => isCompleteStatus(issue.status) && dayKey(completedAtOf(issue)) === todayKey);
  const focusHandledToday = currentIssues.filter(issue => issue.focusHandledAt && dayKey(issue.focusHandledAt) === todayKey);
  const openCount = currentIssues.filter(i => !isCompleteStatus(i.status)).length;
  const overdueCount = currentIssues.filter(isOverdue).length;
  const mine = currentIssues.filter(i => i.owner.toLowerCase() === personalOwner.toLowerCase());
  const mineOpen = mine.filter(i => !isCompleteStatus(i.status));
  const mineOverdue = mine.filter(isOverdue);
  const mineResolved = mine.filter(i => isCompleteStatus(i.status));
  const attentionQueue = currentIssues.filter(isOverdue).sort((a, b) => new Date(a.expected).getTime() - new Date(b.expected).getTime());
  const parkableIssues = [...currentIssues.filter(issue => !isCompleteStatus(issue.status))].sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || (a.expected ? new Date(a.expected).getTime() : Infinity) - (b.expected ? new Date(b.expected).getTime() : Infinity));
  const checkInResumeMinimum = toDateTimeInput(addDays(new Date(), 1));
  const focusRecommendations = useMemo<FocusRecommendation[]>(() => issues
    .filter(issue => !isCompleteStatus(issue.status))
    .filter(issue => !issue.focusHandledAt || Date.now() - new Date(issue.focusHandledAt).getTime() >= 86400000)
    .flatMap(issue => {
      const recommendations: FocusRecommendation[] = [];
      if (isOverdue(issue)) {
        const delay = daysOverdue(issue);
        const people = issue.followUpPeople.length ? issue.followUpPeople.join(", ") : issue.owner;
        recommendations.push({ issue, kind: "overdue", priority: 300 + delay, reason: `${delay} day${delay === 1 ? "" : "s"} past the expected update`, move: issue.owner === personalOwner && !issue.followUpPeople.length ? "Confirm your next move." : `Confirm the next move with ${people}.` });
      } else if (!issue.expected) {
        recommendations.push({ issue, kind: "missing-eta", priority: 180, reason: "No expected update is set", move: "Choose when this should surface again." });
      }
      if (!issue.action.trim()) {
        recommendations.push({ issue, kind: "missing-action", priority: isOverdue(issue) ? 240 : 140, reason: "The next action is unclear", move: `Name what ${issue.owner === personalOwner ? "you are" : `${issue.owner} is`} doing next.` });
      }
      return recommendations;
    })
    .sort((a, b) => b.priority - a.priority)
    .filter((recommendation, index, all) => all.findIndex(item => item.issue.id === recommendation.issue.id) === index)
    .slice(0, 3), [issues, personalOwner]);
  const visible = useMemo(() => {
    let scopedIssues: Issue[];
    if (filter === "Archive") {
      scopedIssues = issues.filter(issue => Boolean(issue.archivedAt));
    } else if (filter === "Mine") {
      if (metricFocus === "mine-open") scopedIssues = mineOpen;
      else if (metricFocus === "mine-overdue") scopedIssues = mineOverdue;
      else if (metricFocus === "mine-resolved") scopedIssues = mineResolved;
      else scopedIssues = mine;
    } else if (filter === "Overdue") {
      if (metricFocus === "attention-oldest" || metricFocus === "attention-first") scopedIssues = attentionQueue.slice(0, 1);
      else if (metricFocus === "attention-owners") scopedIssues = [...attentionQueue].sort((a, b) => a.owner.localeCompare(b.owner) || new Date(a.expected).getTime() - new Date(b.expected).getTime());
      else scopedIssues = attentionQueue;
    } else if (metricFocus === "home-resolved") scopedIssues = issues.filter(i => isCompleteStatus(i.status));
    else if (metricFocus === "home-overdue") scopedIssues = issues.filter(isOverdue);
    else if (metricFocus === "home-total") scopedIssues = issues;
    else scopedIssues = issues.filter(i => !isCompleteStatus(i.status));

    scopedIssues = filter === "Archive" ? scopedIssues : scopedIssues.filter(issue => !issue.archivedAt);

    const terms = searchQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const searched = terms.length ? scopedIssues.filter(issue => {
      const searchable = [issue.title, issue.details, issue.action, issue.owner, issue.status, issue.priority || "", issue.category || "", issue.followUpPeople.join(" "), ...issue.updates.flatMap(update => [update.author, update.text])].join(" ").toLocaleLowerCase();
      return terms.every(term => searchable.includes(term));
    }) : scopedIssues;

    /* "All tasks" is ordered by when things were logged, which after a year means finished
       work sits interleaved with the work that still needs doing — measured at three cards in
       four. So the default view leads with what is unfinished, then the finished work with the
       most recent first. Any other card, and any search, is an explicit ask and is left in the
       order it came in. */
    if (filter !== "All" || metricFocus !== "home-total" || terms.length) return searched;
    const unfinished = searched.filter(issue => !isCompleteStatus(issue.status));
    const finished = searched.filter(issue => isCompleteStatus(issue.status))
      .sort((a, b) => new Date(completedAtOf(b)).getTime() - new Date(completedAtOf(a)).getTime());
    return [...unfinished, ...finished];
  }, [issues, filter, metricFocus, personalOwner, searchQuery]);
  /* Work finished more than a month ago is history rather than a queue. It is folded out of
     the default list — never out of the counts, the search or the summaries — and the fold
     says how much it is holding, so the list never quietly disagrees with the tally above it. */
  const foldingOlder = filter === "All" && metricFocus === "home-total" && !searchQuery.trim();
  const olderDone = foldingOlder ? visible.filter(issue => isCompleteStatus(issue.status) && daysSince(completedAtOf(issue)) > 30) : [];
  const olderDoneIds = new Set(olderDone.map(issue => issue.id));
  const shownIssues = foldingOlder && !showOlderDone ? visible.filter(issue => !olderDoneIds.has(issue.id)) : visible;
  /* Derived rather than stored: the celebration is "you closed work today and the queue
     is empty", which is true for as long as it is true and gone tomorrow on its own. */
  const queueJustCleared = !focusRecommendations.length && completedToday.length > 0;
  const todayLine = deskLine(openCount, overdueCount, completedToday.length, todayKey);
  const wroteToday = diaryEntries.some(entry => dayKey(entry.at) === todayKey);
  const dailyMovesDone = Math.min(3, focusHandledToday.length);
  const gardenStage = Math.min(4, Number(dailyMovesDone > 0) + Number(completedToday.length > 0) + Number(Boolean(todayCheckIn)) + Number(wroteToday));
  const dashboardView = filter === "Mine" ? "mine" : filter === "Overdue" ? "attention" : "overview";
  const pageTitle = section === "review" ? "Your week in review" : section === "calendar" ? "Your work calendar" : section === "metrics" ? "Signals & progress" : section === "diary" ? "A quiet place to land" : section === "settings" ? "Settings" : filter === "Mine" ? "My actions" : filter === "Overdue" ? "Needs attention" : greetingFor(nowHour, profile?.name || "");
  /* Triage mode is the one screen that does not get the flourish — it is the view you
     open when something is wrong, and a little flower on it reads as tone-deaf. */
  const titleMark = !(section === "dashboard" && filter === "Overdue");
  const pageDescription = section === "review" ? "What moved, what stalled, and how the week actually felt — in one place." : section === "calendar" ? "Choose a day to see the tasks you logged and the diary activity that went with them." : section === "metrics" ? "A clear read on delivery pace, follow-through, and where to focus." : section === "diary" ? "Vent freely, name the mood, and leave with one gentle next step." : section === "settings" ? "Personalize your workspace, workflow, notifications, and local data." : filter === "Mine" ? "Your personal action list, separated from the wider team queue." : filter === "Overdue" ? "A focused triage view for work that has passed its expected update." : "A lovely little command center for keeping work moving.";
  const ownerReport = useMemo(() => Object.entries(issues.reduce<Record<string, number>>((map, i) => { if (!isCompleteStatus(i.status)) map[i.owner] = (map[i.owner] || 0) + 1; return map; }, {})).sort((a,b) => b[1]-a[1]), [issues]);
  const diaryInsights = useMemo(() => {
    if (!diaryEntries.length) return null;
    const entries = [...diaryEntries].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const words = entries.map(entry => wordCount(entry.text));
    const totalWords = words.reduce((sum, count) => sum + count, 0);

    // Streaks are counted in days written, not entries — two entries in one evening is one day.
    const days = Array.from(new Set(entries.map(entry => dayKey(entry.at)))).sort();
    let longestStreak = 1;
    let run = 1;
    days.forEach((day, index) => {
      if (index === 0) return;
      run = dayBefore(day) === days[index - 1] ? run + 1 : 1;
      longestStreak = Math.max(longestStreak, run);
    });
    const today = dayKey(new Date().toISOString());
    const latest = days[days.length - 1];
    let currentStreak = latest === today || latest === dayBefore(today) ? 1 : 0;
    if (currentStreak) for (let index = days.length - 1; index > 0; index -= 1) {
      if (dayBefore(days[index]) !== days[index - 1]) break;
      currentStreak += 1;
    }

    const moodCounts = moods.map(mood => ({ ...mood, count: entries.filter(entry => entry.mood === mood.value).length }));
    const topMood = [...moodCounts].sort((a, b) => b.count - a.count)[0];
    const ribbon = entries.slice(-28);

    const themeTally = new Map<string, { label: string; count: number }>();
    entries.forEach(entry => {
      const seen = new Set<string>();
      detectThemes(`${entry.title} ${entry.text}`.toLowerCase()).forEach(theme => {
        if (seen.has(theme.id)) return;
        seen.add(theme.id);
        const current = themeTally.get(theme.id);
        themeTally.set(theme.id, { label: theme.label, count: (current?.count ?? 0) + 1 });
      });
    });
    const themes = Array.from(themeTally.values()).sort((a, b) => b.count - a.count).slice(0, 4);

    const clock = partsOfDay.map(part => ({ ...part, count: entries.filter(entry => partOfDay(new Date(entry.at).getHours()).id === part.id).length }));
    const favouriteTime = [...clock].sort((a, b) => b.count - a.count)[0];

    const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weekdays = weekdayNames.map((name, index) => {
      const onDay = entries.filter(entry => new Date(entry.at).getDay() === index);
      return { name, count: onDay.length, weight: onDay.length ? onDay.reduce((sum, entry) => sum + moodWeight[entry.mood], 0) / onDay.length : 0 };
    }).filter(day => day.count > 0);
    const brightestDay = [...weekdays].sort((a, b) => b.weight - a.weight)[0];
    const heaviestDay = [...weekdays].sort((a, b) => a.weight - b.weight)[0];

    const revisited = new Set(diaryLog.filter(event => event.action === "edited").map(event => event.entryId)).size;

    // The biggest jump between two entries in a row — worth knowing what moved.
    let lift: { from: DiaryEntry; to: DiaryEntry; gain: number } | null = null;
    entries.forEach((entry, index) => {
      if (!index) return;
      const gain = moodWeight[entry.mood] - moodWeight[entries[index - 1].mood];
      if (gain > 0 && gain >= (lift?.gain ?? 1)) lift = { from: entries[index - 1], to: entry, gain };
    });

    // Do the days you log a lot of work read differently from the quiet ones?
    const busyDays = new Set(Array.from(new Set(issues.map(issue => dayKey(issue.createdAt)))).filter(day => issues.filter(issue => dayKey(issue.createdAt) === day).length >= 3));
    const onBusy = entries.filter(entry => busyDays.has(dayKey(entry.at)));
    const onQuiet = entries.filter(entry => !busyDays.has(dayKey(entry.at)));
    const heavyShare = (group: DiaryEntry[]) => Math.round((group.filter(entry => moodWeight[entry.mood] < 0).length / group.length) * 100);
    const crossover = onBusy.length >= 3 && onQuiet.length >= 3 ? { busy: heavyShare(onBusy), quiet: heavyShare(onQuiet), busyCount: onBusy.length, quietCount: onQuiet.length } : null;

    return { entries, totalWords, longestWords: Math.max(...words), averageWords: Math.round(totalWords / entries.length), currentStreak, longestStreak, daysWritten: days.length, moodCounts, topMood, ribbon, themes, clock, favouriteTime, brightestDay, heaviestDay, revisited, lift: lift as { from: DiaryEntry; to: DiaryEntry; gain: number } | null, crossover, words: signatureWords(entries) };
  }, [diaryEntries, diaryLog, issues]);

  /* One mood per day for the month grid: the average weight of everything written that
     day, snapped back to the nearest named mood. Averaging stops a single frustrated
     line from colouring a day that was mostly calm. */
  const moodByDay = useMemo(() => {
    const groups = new Map<string, Mood[]>();
    diaryEntries.forEach(entry => { const key = dayKey(entry.at); groups.set(key, [...(groups.get(key) ?? []), entry.mood]); });
    return new Map(Array.from(groups, ([key, list]) => {
      const average = list.reduce((sum, mood) => sum + moodWeight[mood], 0) / list.length;
      const counts = list.reduce<Partial<Record<Mood, number>>>((map, mood) => ({ ...map, [mood]: (map[mood] ?? 0) + 1 }), {});
      // Ties go to the mood actually written most that day, not to whichever sorts first.
      const nearest = [...moods].sort((a, b) => Math.abs(moodWeight[a.value] - average) - Math.abs(moodWeight[b.value] - average) || (counts[b.value] ?? 0) - (counts[a.value] ?? 0))[0];
      return [key, nearest.value] as const;
    }));
  }, [diaryEntries]);
  const calendarDays = useMemo(() => { const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1); const end = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0); return Array.from({ length: start.getDay() + end.getDate() }, (_, i) => i - start.getDay() + 1); }, [calendarMonth]);
  const selectedIssues = issues.filter(i => i.expected && dayKey(i.expected) === selectedDay && !i.archivedAt);
  // Diary events sit beside issues on the calendar; only mood and title are shown, never the reflection.
  const selectedDiary = diaryLog.filter(event => dayKey(event.at) === selectedDay).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const monthTitle = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(calendarMonth);
  const resolvedIssues = currentIssues.filter(i => isCompleteStatus(i.status));
  const missingEtaIssues = issues.filter(issue => !isCompleteStatus(issue.status) && !issue.expected);
  const missingOutcomeIssues = resolvedIssues.filter(issue => !issue.outcome.trim());
  const memoryIssue = issues.find(issue => issue.id === memoryIssueId);
  const insightWindow = useMemo(() => {
    const to = Date.now() + 1;
    if (insightRange === "all") return { from: 0, to, previousFrom: 0, previousTo: 0, label: "All time" };
    const days = Number(insightRange);
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1).getTime();
    return { from, to, previousFrom: from - days * 86400000, previousTo: from, label: `Last ${days} days` };
  }, [insightRange]);
  const inInsightWindow = (value: string, previous = false) => {
    const at = new Date(value).getTime();
    return previous ? at >= insightWindow.previousFrom && at < insightWindow.previousTo : at >= insightWindow.from && at < insightWindow.to;
  };
  const insightResolved = resolvedIssues.filter(issue => inInsightWindow(completedAtOf(issue)));
  const previousResolved = insightRange === "all" ? [] : resolvedIssues.filter(issue => inInsightWindow(completedAtOf(issue), true));
  const insightLogged = issues.filter(issue => inInsightWindow(issue.createdAt));
  const insightCompletedWithTime = insightResolved.filter(issue => issue.completedAt || issue.updates.length);
  const insightCompletionHours = insightCompletedWithTime.map(issue => (new Date(completedAtOf(issue)).getTime() - new Date(issue.createdAt).getTime()) / 3600000).filter(hours => hours >= 0);
  const insightAverageHours = insightCompletionHours.length ? insightCompletionHours.reduce((sum, hours) => sum + hours, 0) / insightCompletionHours.length : 0;
  const insightDueResolved = insightResolved.filter(issue => issue.expected && (issue.completedAt || issue.updates.length));
  const insightOnTimeCount = insightDueResolved.filter(issue => new Date(completedAtOf(issue)).getTime() <= new Date(issue.expected).getTime()).length;
  const insightOnTimeRate = insightDueResolved.length ? Math.round((insightOnTimeCount / insightDueResolved.length) * 100) : 0;
  const previousDueResolved = previousResolved.filter(issue => issue.expected && (issue.completedAt || issue.updates.length));
  const previousOnTimeCount = previousDueResolved.filter(issue => new Date(completedAtOf(issue)).getTime() <= new Date(issue.expected).getTime()).length;
  const previousOnTimeRate = previousDueResolved.length ? Math.round((previousOnTimeCount / previousDueResolved.length) * 100) : 0;
  const previousCompletionHours = previousResolved.map(issue => (new Date(completedAtOf(issue)).getTime() - new Date(issue.createdAt).getTime()) / 3600000).filter(hours => hours >= 0);
  const previousAverageHours = previousCompletionHours.length ? previousCompletionHours.reduce((sum, hours) => sum + hours, 0) / previousCompletionHours.length : 0;
  const previousOverdueCount = insightRange === "all" ? 0 : issues.filter(issue => {
    const boundary = insightWindow.previousTo - 1;
    const created = new Date(issue.createdAt).getTime();
    const expected = issue.expected ? new Date(issue.expected).getTime() : Infinity;
    const completed = isCompleteStatus(issue.status) ? new Date(completedAtOf(issue)).getTime() : Infinity;
    return created <= boundary && expected < boundary && completed > boundary;
  }).length;
  const insightSampleSize = insightResolved.length + insightLogged.length;
  const insightConfidence = insightSampleSize >= 12 ? "Strong signal" : insightSampleSize >= 5 ? "Growing signal" : "Early signal";
  const insightHeadline = overdueCount ? `${overdueCount} overdue signal${overdueCount === 1 ? " needs" : "s need"} a decision` : missingEtaIssues.length ? `${missingEtaIssues.length} active item${missingEtaIssues.length === 1 ? " needs" : "s need"} an expectation` : "The queue is keeping its promises";
  const insightHeadlineCopy = overdueCount ? "Start with the oldest handoff, record the next move, and reset the date if the promise has changed." : missingEtaIssues.length ? "A date makes follow-through measurable and gives the work permission to leave your head." : "No active work is overdue. Preserve the rhythm by recording outcomes as work closes.";
  const insightDrilldownIssues = insightDrilldown === "completed" ? insightResolved : insightDrilldown === "on-time" ? insightDueResolved : insightDrilldown === "cycle" ? insightCompletedWithTime : insightDrilldown === "overdue" ? issues.filter(isOverdue) : [];
  const waitingIssues = issues.filter(issue => !isCompleteStatus(issue.status) && /waiting|blocked|pending|approval/i.test(issue.status));
  const staleIssues = issues.filter(issue => !isCompleteStatus(issue.status) && Date.now() - new Date(issue.updatedAt || issue.updates[issue.updates.length - 1]?.at || issue.createdAt).getTime() >= 3 * 86400000);
  const oldestActive = [...issues.filter(issue => !isCompleteStatus(issue.status))].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  /* Completion timing for the Insights surface. */
  const appName = profile ? `${profile.name}'s Signal Petal` : "Signal Petal";
  const commandNeedle = commandQuery.trim().toLowerCase();
  const commandIssues = commandNeedle ? issues.filter(issue => `${issue.title} ${issue.owner} ${issue.status}`.toLowerCase().includes(commandNeedle)).slice(0, 5) : [];
  /* Reflections are searched by their body but only ever shown by mood, title and date —
     the same line the calendar draws. A locked diary contributes nothing. */
  const commandDiary = commandNeedle && !diaryLocked ? diaryEntries.filter(entry => `${entry.title} ${entry.text}`.toLowerCase().includes(commandNeedle)).slice(0, 4) : [];
  const commandActions = ([["create", "＋", "Log a new signal", "N"], ["focus", "✦", "Open Focus now", "F"], ["check-in", "◷", "Start daily check-in", "D"], ["insights", "◌", "Open actionable insights", "I"], ["review", "▦", "Open weekly review", "W"], ["settings", "⚙", "Open settings", "S"]] as const).filter(([, , label]) => !commandNeedle || label.toLowerCase().includes(commandNeedle));
  /* One flat list, so ↑ ↓ and ↵ have something to walk. The palette footer advertised
     those keys from the day it shipped and nothing had ever implemented them. */
  const commandItems: CommandItem[] = [
    ...commandActions.map(([id, icon, label, shortcut]) => ({ key: `action-${id}`, group: "QUICK ACTIONS", icon: icon === "✦" ? <Petal size={14}/> : icon, label, hint: shortcut, run: () => runCommand(id) })),
    ...commandIssues.map(issue => ({ key: `issue-${issue.id}`, group: "WORK ITEMS", icon: "↗", label: issue.title, hint: `${issue.owner} · ${issue.status}`, run: () => { setShowCommandPalette(false); openIssueDetail(issue.id); } })),
    ...commandDiary.map(entry => ({ key: `diary-${entry.id}`, group: "REFLECTIONS", icon: moods.find(mood => mood.value === entry.mood)?.symbol ?? "✎", label: entry.title || "Untitled reflection", hint: `${moodName(entry.mood)} · ${dateLabel(entry.at)}`, run: () => { setShowCommandPalette(false); setOpenDiaryId(entry.id); } })),
  ];
  // Clamped in render rather than reset from an effect, so a shrinking list can never point past its end.
  const commandCursor = commandItems.length ? Math.min(commandIndex, commandItems.length - 1) : 0;
  function walkCommands(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setCommandIndex(index => Math.min(index + 1, Math.max(0, commandItems.length - 1))); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setCommandIndex(index => Math.max(0, index - 1)); }
    else if (event.key === "Enter") { event.preventDefault(); commandItems[commandCursor]?.run(); }
  }
  const completionLabel = statuses.find(isCompleteStatus) || "Resolved";
  const queueTitle = filter === "Archive" ? "Archived tasks" : filter === "Mine" ? metricFocus === "mine-open" ? "My open actions" : metricFocus === "mine-overdue" ? "My overdue actions" : metricFocus === "mine-resolved" ? `My ${completionLabel.toLowerCase()} actions` : "All my actions" : filter === "Overdue" ? metricFocus === "attention-oldest" ? "Oldest delayed item" : metricFocus === "attention-owners" ? "Overdue work by owner" : metricFocus === "attention-first" ? "First move to make" : "All overdue work" : metricFocus === "home-total" ? "All tasks" : metricFocus === "home-resolved" ? completionLabel : metricFocus === "home-overdue" ? "Needs attention" : "Open work";
  const statusStyle = (status: Status) => ({ "--status-color": statusColors[status] || "#7a5aa6" } as CSSProperties);

  function updateIssue(patch: Partial<Issue>) {
    if (!active) return;
    const updatedAt = new Date().toISOString();
    const justCompleted = Boolean(patch.status && isCompleteStatus(patch.status) && !isCompleteStatus(active.status));
    const completedAt = justCompleted ? updatedAt : patch.status && !isCompleteStatus(patch.status) ? undefined : active.completedAt;
    if (justCompleted) setWin({ title: active.title, span: spanLabel(active.createdAt, updatedAt) });
    setIssues(items => {
      const updated = items.map(i => i.id === active.id ? { ...i, ...patch, updatedAt, completedAt } : i);
      return justCompleted ? withNextRound(updated, active.id, new Date(updatedAt)) : updated;
    });
  }
  /* Opening the next round belongs here rather than in each handler: work is closed out from
     the detail panel and from the focus card, and a cadence that only fired from one of them
     would be worse than none. Reopening and re-closing must not stack up duplicates either,
     so an existing round pointing back at this task is the guard. */
  function withNextRound(items: Issue[], finishedId: string, finishedAt: Date) {
    const finished = items.find(item => item.id === finishedId);
    if (!finished?.repeat) return items;
    if (items.some(item => item.repeatedFrom === finishedId)) return items;
    const next = nextOccurrence(finished, finishedAt, crypto.randomUUID());
    return next ? [next, ...items] : items;
  }
  /* Title-casing a controlled input replaces the value React is holding, and React
     re-assigns input.value on commit, which parks the caret at the end. The transform
     never changes the string's length, so remembering the offset and putting it back
     after paint is enough — and it only fires when the case actually changed. */
  function onNameInput(event: ChangeEvent<HTMLInputElement>, set: (value: string) => void) {
    const field = event.currentTarget;
    const caret = field.selectionStart;
    const next = titleCaseName(field.value);
    set(next);
    if (caret !== null && next !== field.value) window.requestAnimationFrame(() => { if (document.activeElement === field) field.setSelectionRange(caret, caret); });
  }
  // Uncontrolled owner fields never round-trip through React, so the DOM value is edited directly.
  function onOwnerInput(event: ChangeEvent<HTMLInputElement>) {
    const field = event.currentTarget;
    const caret = field.selectionStart;
    const next = titleCaseName(field.value);
    if (next === field.value) return;
    field.value = next;
    if (caret !== null) field.setSelectionRange(caret, caret);
  }
  function openIssueDetail(issueId: string, updateUrl = true) {
    setActiveId(issueId); setFollowUpInput(""); setShowDetail(true);
    if (updateUrl && window.location.pathname !== `/tasks/${encodeURIComponent(issueId)}`) window.history.pushState({ taskId: issueId }, "", `/tasks/${encodeURIComponent(issueId)}`);
  }
  function closeIssueDetail() {
    setShowDetail(false);
    if (window.location.pathname.startsWith("/tasks/")) window.history.pushState({}, "", "/");
  }
  function completeIssue(issue: Issue) {
    const completionStatus = statuses.find(isCompleteStatus) || "Resolved";
    const at = new Date().toISOString();
    const before = issue;
    setIssues(items => withNextRound(
      items.map(item => item.id === issue.id ? { ...item, status: completionStatus, updatedAt: at, completedAt: at } : item),
      issue.id,
      new Date(at),
    ));
    setWin({ title: issue.title, span: spanLabel(issue.createdAt, at) });
    /* Undo takes the next round back out with it, or undoing a completion quietly leaves
       behind a task nobody asked for. */
    offerUndo(`Completed “${issue.title}”.`, () => setIssues(items => items.filter(item => item.repeatedFrom !== before.id).map(item => item.id === before.id ? before : item)));
  }
  function archiveIssue(issue: Issue) { const archivedAt = new Date().toISOString(); setIssues(items => items.map(item => item.id === issue.id ? { ...item, archivedAt, updatedAt: archivedAt } : item)); closeIssueDetail(); offerUndo(`Archived “${issue.title}”.`, () => setIssues(items => items.map(item => item.id === issue.id ? { ...item, archivedAt: undefined } : item))); }
  function restoreIssue(issue: Issue) { setIssues(items => items.map(item => item.id === issue.id ? { ...item, archivedAt: undefined, updatedAt: new Date().toISOString() } : item)); }
  function removeIssue(issue: Issue) {
    setActiveId(issue.id);
    setShowDeleteConfirm(true);
  }
  function openInsightQueue(kind: "overdue" | "eta" | "outcome") {
    if (kind === "overdue") { setSection("dashboard"); setFilter("Overdue"); setMetricFocus("attention-overdue"); return; }
    const issue = (kind === "eta" ? missingEtaIssues : missingOutcomeIssues)[0];
    if (issue) openIssueDetail(issue.id);
  }
  function openMemoryRecord(issue: Issue) {
    const kept = issue.memory;
    /* Professional work is where the fuller note earns its keep, so it starts open rather
       than behind a click. Nothing extra is required — closing something out must stay easy. */
    setMemoryDetail(Boolean(kept?.rootCause.trim() || kept?.followUp.trim()) || issue.lane === "professional");
    setMemoryIssueId(issue.id);
  }
  function saveOperationalMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memoryIssue) return;
    const form = new FormData(event.currentTarget);
    /* The shareable line is only rendered for professional work, so FormData has no entry for
       it on a personal record — fall back to what is stored, or switching lanes would wipe it. */
    const memory = { symptoms: String(form.get("symptoms") || "").trim(), rootCause: String(form.get("rootCause") || "").trim(), resolution: String(form.get("resolution") || "").trim(), learning: String(form.get("learning") || "").trim(), followUp: String(form.get("followUp") || "").trim(), shareable: String(form.get("shareable") ?? memoryIssue.memory?.shareable ?? "").trim() };
    setIssues(items => items.map(issue => issue.id === memoryIssue.id ? { ...issue, memory, outcome: issue.outcome || memory.resolution, updates: [...issue.updates, { id: crypto.randomUUID(), at: new Date().toISOString(), author: personalOwner, text: "Notes updated." }] } : issue));
    setMemoryIssueId("");
  }
  function openDailyCheckIn() {
    setCheckInCapacity(todayCheckIn?.capacity ?? "steady");
    setCheckInNote(todayCheckIn?.note ?? "");
    setCheckInParked(todayCheckIn?.parkedIssueIds ?? []);
    setCheckInWin(todayCheckIn?.win ?? "");
    setCheckInTomorrowMove(todayCheckIn?.tomorrowMove ?? "");
    setCheckInResumeAt(todayCheckIn?.resumeAt ?? checkInResumeMinimum);
    setCheckInStep(0);
    setCheckInShowAll(false);
    setShowCheckInHistory(false);
    setCheckInSaved(false);
    setShowDailyCheckIn(true);
  }
  function saveDailyCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const now = new Date().toISOString();
    const parked = issues.filter(issue => checkInParked.includes(issue.id));
    const capacityLabel = checkInCapacity === "high" ? "strong" : checkInCapacity === "low" ? "limited" : "steady";
    const parts = [`Capacity feels ${capacityLabel}.`, `${completedToday.length} item${completedToday.length === 1 ? "" : "s"} completed today.`, `${overdueCount} item${overdueCount === 1 ? " is" : "s are"} overdue.`];
    if (parked.length) parts.push(`${parked.length} item${parked.length === 1 ? " is" : "s are"} intentionally waiting${checkInResumeAt ? ` until ${dateLabel(checkInResumeAt)}` : ""}: ${parked.map(issue => issue.title).join(", ")}.`);
    if (checkInWin.trim()) parts.push(`Today’s win: ${checkInWin.trim()}.`);
    if (checkInTomorrowMove.trim()) parts.push(`Tomorrow’s first move: ${checkInTomorrowMove.trim()}.`);
    if (checkInNote.trim()) parts.push(checkInNote.trim());
    const checkIn: DailyCheckIn = { id: todayCheckIn?.id ?? crypto.randomUUID(), at: now, capacity: checkInCapacity, note: checkInNote.trim(), parkedIssueIds: checkInParked, brief: parts.join(" "), win: checkInWin.trim(), tomorrowMove: checkInTomorrowMove.trim(), resumeAt: parked.length ? checkInResumeAt : undefined };
    setDailyCheckIns(items => [checkIn, ...items.filter(item => dayKey(item.at) !== todayKey)]);
    if (parked.length && checkInResumeAt) {
      setIssues(items => items.map(issue => checkInParked.includes(issue.id) ? {
        ...issue,
        expected: checkInResumeAt,
        updatedAt: now,
        updates: [...issue.updates, { id: crypto.randomUUID(), at: now, author: personalOwner, text: `Intentionally deferred during the daily check-in until ${dateLabel(checkInResumeAt)}.` }],
      } : issue));
    }
    setCheckInSaved(true);
    setCheckInStep(3);
  }
  function applyFocusAction(issue: Issue, patch: Partial<Issue>, updateText: string, confirmation: string) {
    const before = issue;
    const at = new Date().toISOString();
    setFocusRescheduleId("");
    setFocusCompletingId(issue.id);
    window.setTimeout(() => {
      setIssues(items => items.map(item => item.id === issue.id ? { ...item, ...patch, focusHandledAt: patch.focusHandledAt === undefined ? at : patch.focusHandledAt, updatedAt: at, updates: [...item.updates, { id: crypto.randomUUID(), at, author: personalOwner, text: updateText }] } : item));
      setFocusCompletingId("");
      offerUndo(confirmation, () => setIssues(items => items.map(item => item.id === before.id ? before : item)));
    }, 260);
  }
  function recordFocusFollowUp(issue: Issue) {
    const people = issue.followUpPeople.length ? issue.followUpPeople.join(", ") : issue.owner;
    applyFocusAction(issue, { focusHandledAt: new Date().toISOString() }, `Followed up with ${people}.`, `Follow-up recorded for “${issue.title}”.`);
  }
  function markFocusHandled(issue: Issue) {
    applyFocusAction(issue, { focusHandledAt: new Date().toISOString() }, "Reviewed in Focus now and handled for today.", `“${issue.title}” is handled for today.`);
  }
  function rescheduleFocus(issue: Issue, preset: "tomorrow" | "three-days" | "monday") {
    const next = new Date();
    if (preset === "tomorrow") { next.setDate(next.getDate() + 1); next.setHours(9, 0, 0, 0); }
    else if (preset === "three-days") { next.setDate(next.getDate() + 3); if (!issue.expected) next.setHours(9, 0, 0, 0); else { const prior = new Date(issue.expected); next.setHours(prior.getHours(), prior.getMinutes(), 0, 0); } }
    else { const days = (8 - next.getDay()) % 7 || 7; next.setDate(next.getDate() + days); next.setHours(9, 0, 0, 0); }
    const expected = toDateTimeInput(next);
    applyFocusAction(issue, { expected }, `Expected update rescheduled to ${dateLabel(expected)}.`, `“${issue.title}” moved to ${dateLabel(expected)}.`);
  }
  function changeOwner(value: string) {
    if (!active) return;
    const nextOwner = titleCaseName(value.trim());
    if (!nextOwner || nextOwner === active.owner) return;
    updateIssue({ owner: nextOwner, updates: [...active.updates, { id: crypto.randomUUID(), at: new Date().toISOString(), author: personalOwner, text: `Primary owner changed from ${active.owner} to ${nextOwner}.` }] });
  }
  function addActiveFollowUps() {
    if (!active) return;
    const existing = new Set(active.followUpPeople.map(person => person.toLowerCase()));
    const additions = peopleFromInput(followUpInput).filter(person => !existing.has(person.toLowerCase()) && person.toLowerCase() !== active.owner.toLowerCase());
    if (!additions.length) return setFollowUpInput("");
    updateIssue({ followUpPeople: [...active.followUpPeople, ...additions], updates: [...active.updates, { id: crypto.randomUUID(), at: new Date().toISOString(), author: personalOwner, text: `Added ${additions.join(", ")} as follow-up ${additions.length === 1 ? "person" : "people"}.` }] });
    setFollowUpInput("");
  }
  function removeActiveFollowUp(person: string) {
    if (!active) return;
    updateIssue({ followUpPeople: active.followUpPeople.filter(name => name !== person), updates: [...active.updates, { id: crypto.randomUUID(), at: new Date().toISOString(), author: personalOwner, text: `Removed ${person} from follow-up people.` }] });
  }
  function addNewFollowUps() {
    const existing = new Set(newFollowUps.map(person => person.toLowerCase()));
    const additions = peopleFromInput(newFollowUpInput).filter(person => !existing.has(person.toLowerCase()));
    if (additions.length) setNewFollowUps(items => [...items, ...additions]);
    setNewFollowUpInput("");
  }
  function openCreate() { setNewFollowUps([]); setNewFollowUpInput(""); setShowCreate(true); }
  function deleteIssue() {
    if (!active) return;
    const removed = active;
    const index = issues.findIndex(issue => issue.id === removed.id);
    const remaining = issues.filter(i => i.id !== removed.id);
    setIssues(remaining);
    setActiveId(remaining[0]?.id ?? "");
    setShowDeleteConfirm(false);
    setShowDetail(false);
    offerUndo(`Deleted “${removed.title}”.`, () => {
      setIssues(items => { const next = items.filter(item => item.id !== removed.id); next.splice(Math.max(0, index), 0, removed); return next; });
      setActiveId(removed.id);
    });
  }
  function openSettings() {
    setStatusDraft(statuses.map(name => ({
      id: crypto.randomUUID(), name, original: name, color: statusColors[name] || "#7a5aa6",
      kind: name === "New" ? "new" : name === "Ongoing" ? "ongoing" : isCompleteStatus(name) ? "terminal" : undefined,
    })));
    setStatusInput("");
    setStatusError("");
    setTransferCode(encodeTransfer({ version: 1, issues, statuses, statusColors, diaryEntries, diaryLog, dailyCheckIns }));
    setImportCode("");
    setTransferMessage("");
    setSection("settings");
  }
  function addStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = statusInput.trim();
    if (!name) return;
    if (statusDraft.some(item => item.name.trim().toLowerCase() === name.toLowerCase())) return setStatusError("That status already exists.");
    setStatusDraft(items => [...items.slice(0, -1), { id: crypto.randomUUID(), name, color: "#7a5aa6" }, items[items.length - 1]].filter(Boolean) as StatusDraft[]);
    setStatusInput("");
    setStatusError("");
  }
  function saveStatuses() {
    const names = statusDraft.map(item => item.name.trim());
    if (names.some(name => !name)) return setStatusError("Every status needs a name.");
    if (!names.includes("New") || !names.includes("Ongoing") || !names.some(isCompleteStatus)) return setStatusError("New, Ongoing, and Resolved or Closed are required.");
    if (new Set(names.map(name => name.toLowerCase())).size !== names.length) return setStatusError("Status names must be unique.");
    const renamed = new Map(statusDraft.filter(item => item.original).map(item => [item.original as string, item.name.trim()]));
    const keptOriginals = new Set(statusDraft.flatMap(item => item.original ? [item.original] : []));
    setIssues(items => items.map(issue => renamed.has(issue.status) ? { ...issue, status: renamed.get(issue.status) as Status } : statuses.includes(issue.status) && !keptOriginals.has(issue.status) ? { ...issue, status: "Ongoing", completedAt: undefined } : issue));
    setStatusColors(Object.fromEntries(statusDraft.map(item => [item.name.trim(), item.color])));
    setStatuses(names);
    setStatusError("");
  }
  async function enableDiaryLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lockPass.length < 8) return setLockMessage("Use at least 8 characters.");
    if (lockPass !== lockConfirm) return setLockMessage("Those two passphrases do not match.");
    if (!lockUnderstood) return setLockMessage("Please confirm you understand there is no recovery.");
    setLockBusy(true);
    try {
      const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
      const key = await deriveDiaryKey(lockPass, fromB64(salt));
      writeStore("signal-petal-diary-vault", JSON.stringify(await sealDiary(key, salt, diaryEntries, diaryLog)));
      dropStore("signal-petal-diary");
      dropStore("signal-petal-diary-log");
      saltRef.current = salt;
      setDiaryKey(key);
      setLockOn(true);
      setDiaryLocked(false);
      setShowLockSetup(false);
      setLockMessage("The diary is locked. It will ask for the passphrase next time you open Signal Petal.");
    } catch { setLockMessage("The diary could not be locked. Nothing was changed."); }
    finally { setLockBusy(false); setLockPass(""); setLockConfirm(""); setLockUnderstood(false); }
  }
  async function unlockDiary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const vault = readStoredVault();
    if (!vault) return setLockMessage("There is nothing locked on this device.");
    setLockBusy(true);
    try {
      const key = await deriveDiaryKey(lockPass, fromB64(vault.salt));
      const opened = await openDiaryVault(key, vault);
      saltRef.current = vault.salt;
      setDiaryKey(key);
      setDiaryEntries(opened.entries);
      setDiaryLog(opened.log);
      setDiaryLocked(false);
      setLockMessage("");
    } catch { setLockMessage("That passphrase did not work."); }
    finally { setLockBusy(false); setLockPass(""); }
  }
  function lockDiaryNow() {
    setDiaryKey(null);
    setDiaryLocked(true);
    setDiaryEntries([]);
    setDiaryLog([]);
    setOpenDiaryId("");
    setEditingDiaryId("");
    setLockMessage("");
  }
  function removeDiaryLock() {
    if (diaryLocked) return setLockMessage("Unlock the diary first, then the lock can be removed.");
    dropStore("signal-petal-diary-vault");
    writeStore("signal-petal-diary", JSON.stringify(diaryEntries));
    writeStore("signal-petal-diary-log", JSON.stringify(diaryLog));
    saltRef.current = "";
    setDiaryKey(null);
    setLockOn(false);
    setLockMessage("The lock is off. Your reflections are readable on this device again.");
  }
  function setIssueLane(id: string, lane: Lane) {
    /* Only the lane changes. The timestamp bump is what lets a sync merge see it; "shipped
       this week" reads the update list rather than updatedAt, so the week does not move. */
    setIssues(items => items.map(issue => issue.id === id ? { ...issue, lane, updatedAt: new Date().toISOString() } : issue));
  }
  /* One set of facts, two registers. The professional text is built to be pasted into Teams
     or Slack with no editing pass: no app voice, no empty headings, nothing from the diary.
     The personal one stays plain. Unsorted work appears only in the combined copy. */
  /* How much of a period a summary covers changes what belongs in it. Over a week, what
     started and what is next are the living part. Over a quarter or a year nobody is reading
     a to-do list — they want the record of what was delivered, so the forward-looking blocks
     drop away and Delivered carries the weight. */
  type Span = "week" | "long";

  function deliveredBlock(shipped: Issue[], span: Span, done: (issue: Issue) => string) {
    /* A year of work pasted whole is not a message anyone reads. The tail is named rather
       than silently dropped, because a count that does not add up is worse than a long list. */
    const cap = span === "long" ? 40 : shipped.length;
    const shown = shipped.slice(0, cap);
    const items = shown.map(done);
    if (shipped.length > shown.length) items.push(`\u2026 and ${shipped.length - shown.length} more`);
    return items;
  }

  function professionalSummary(work: PeriodWork, heading: string, span: Span) {
    const mine = (items: Issue[]) => items.filter(issue => issue.lane === "professional");
    const shipped = mine(work.shipped), stalled = mine(work.stalled), parked = mine(work.parkedIssues);
    /* Each item is named once, and the sections claim it in order of how much they say. Next
       week's focus keeps its items; "started" gives up the overlap, because that is the line
       a reader loses least by not seeing twice. */
    const named = new Set([...shipped, ...stalled].map(issue => issue.id));
    const priorities = span === "week" ? mine(work.priorities).filter(issue => !named.has(issue.id)) : [];
    priorities.forEach(issue => named.add(issue.id));
    const logged = span === "week" ? mine(work.logged).filter(issue => !named.has(issue.id)) : [];
    const body = renderBlocks([
      { heading: `Delivered (${shipped.length})`, items: deliveredBlock(shipped, span, issue => `\u2022 ${professionalLine({ shareable: issue.memory?.shareable, title: issue.title, outcome: issue.outcome })}`) },
      { heading: "In progress", items: stalled.map(issue => `\u2022 ${professionalTone(issue.title)} \u2014 ${overdueSpan(daysOverdue(issue))} past its due date${issue.followUpPeople.length ? `, awaiting input from ${issue.followUpPeople.join(", ")}` : ""}`) },
      { heading: "", items: (shipped.length || logged.length) && !stalled.length ? ["Nothing is currently past its due date."] : [] },
      { heading: "Started this week", items: logged.map(issue => `\u2022 ${professionalTone(issue.title)}`) },
      { heading: "Focus for next week", items: priorities.map(issue => `\u2022 ${professionalTone(issue.title)} \u2014 ${professionalTone(issue.action) || "next step still to be set"}`) },
      { heading: "Deliberately deferred", items: span === "week" ? parked.map(issue => `\u2022 ${professionalTone(issue.title)}`) : [] },
    ]);
    const learnings = reviewTakeaway ? shipped.map(issue => professionalTone(issue.memory?.learning ?? "")).filter(Boolean).slice(0, span === "long" ? 3 : 2) : [];
    const takeaway = learnings.length ? `Takeaway\n${learnings.map(text => learnings.length > 1 ? `\u2022 ${text}` : text).join("\n")}` : "";
    return [heading, body || "Nothing is marked professional for this period.", takeaway].filter(Boolean).join("\n\n");
  }

  function personalSummary(work: PeriodWork, heading: string, span: Span) {
    const mine = (items: Issue[]) => items.filter(issue => issue.lane === "personal");
    const shipped = mine(work.shipped), stalled = mine(work.stalled), parked = mine(work.parkedIssues);
    const named = new Set([...shipped, ...stalled].map(issue => issue.id));
    const priorities = span === "week" ? mine(work.priorities).filter(issue => !named.has(issue.id)) : [];
    priorities.forEach(issue => named.add(issue.id));
    const logged = span === "week" ? mine(work.logged).filter(issue => !named.has(issue.id)) : [];
    const body = renderBlocks([
      { heading: "Done", items: deliveredBlock(shipped, span, issue => `\u2022 ${issue.title}${issue.outcome.trim() ? ` \u2014 ${issue.outcome.trim()}` : ""}`) },
      { heading: "Still going", items: stalled.map(issue => `\u2022 ${issue.title} \u2014 ${overdueSpan(daysOverdue(issue))} past when you wanted it done`) },
      { heading: "New this week", items: logged.map(issue => `\u2022 ${issue.title}`) },
      { heading: "Next", items: priorities.map(issue => `\u2022 ${issue.title}`) },
      { heading: "Can wait", items: span === "week" ? parked.map(issue => `\u2022 ${issue.title}`) : [] },
    ]);
    // Deliberately a count, never the words — the same rule the whole summary has always had.
    const reflections = work.pages.length ? `${work.pages.length} reflection${work.pages.length === 1 ? "" : "s"} written. The words themselves are not in here.` : "";
    return [heading, body || "Nothing is marked personal for this period.", reflections].filter(Boolean).join("\n\n");
  }

  /* The window a copy covers. The week follows whatever the review is showing; the longer
     periods run from their own start up to now, because a quarter you are still in is the
     one worth reporting. */
  function copyWindow() {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    if (copyPeriod === "quarter") {
      const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const months = new Intl.DateTimeFormat("en", { month: "short" });
      return { from: start.getTime(), to: endOfToday, span: "long" as const,
        label: `${months.format(start)}\u2013${months.format(now)} ${now.getFullYear()}` };
    }
    if (copyPeriod === "year") {
      const start = new Date(now.getFullYear(), 0, 1);
      return { from: start.getTime(), to: endOfToday, span: "long" as const, label: String(now.getFullYear()) };
    }
    return { from: review!.from, to: review!.to, span: "week" as const,
      label: review!.isRecent ? `last 7 days (${weekLabel(new Date(review!.from))})` : weekLabel(reviewWeek!) };
  }

  function buildReviewSummary(scope: "professional" | "personal" | "both") {
    if (!review || !reviewWeek) return "";
    const period = copyWindow();
    const work = copyPeriod === "week" ? review : workInPeriod(issues, diaryEntries, dailyCheckIns, period.from, period.to);
    const title = copyPeriod === "week" ? "Weekly update" : copyPeriod === "quarter" ? "Quarter to date" : "Year to date";
    if (scope === "professional") return professionalSummary(work, `${title} \u00b7 ${period.label}`, period.span);
    if (scope === "personal") return personalSummary(work, `${copyPeriod === "week" ? "This week" : title} \u00b7 ${period.label}`, period.span);
    const unsorted = work.unsorted.length
      ? `NOT SORTED YET\n${work.unsorted.map(issue => `\u2022 ${issue.title}`).join("\n")}\n\nMark each one professional or personal to have it counted above.`
      : "";
    return [`${title} \u00b7 ${period.label}`,
      `PROFESSIONAL\n${professionalSummary(work, "", period.span)}`,
      `PERSONAL\n${personalSummary(work, "", period.span)}`,
      unsorted].filter(Boolean).join("\n\n");
  }
  async function copyReviewSummary(scope: "professional" | "personal" | "both") {
    if (!review || !reviewWeek) return;
    try {
      await navigator.clipboard.writeText(buildReviewSummary(scope));
      setReviewCopied(scope === "professional" ? "Professional summary copied \u2014 ready to paste into Teams or Slack as it is." : scope === "personal" ? "Personal summary copied. None of your diary text is in it." : "Both halves copied as one message. None of your diary text is in it.");
    } catch { setReviewCopied("Copy was blocked by the browser. Select the summary and copy it manually."); }
  }
  function currentPayload(): TransferPayload {
    return {
      version: 2, issues, statuses, statusColors,
      // A locked diary is exported as ciphertext; an unlocked one as plain entries.
      diaryEntries: lockOn ? [] : diaryEntries,
      diaryLog: lockOn ? [] : diaryLog,
      diaryVault: lockOn ? readStoredVault() : null,
      dailyCheckIns,
      profile,
      settings: { theme, darkMode, reminderTime, diaryFont, diaryPaper },
      exportedAt: new Date().toISOString(),
    };
  }
  function markBackedUp() {
    const at = new Date().toISOString();
    setLastBackup(at);
    writeStore("signal-petal-last-backup", at);
  }
  function snoozeBackupNudge() {
    const at = new Date().toISOString();
    setBackupSnoozed(at);
    writeStore("signal-petal-backup-snoozed", at);
  }
  function downloadBackup() {
    saveBackupFile(currentPayload());
    markBackedUp();
    setTransferMessage(`Saved ${backupFileName()} to your downloads.${lockOn ? " Your diary stays encrypted inside it." : ""}`);
  }
  async function restoreFromFile(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      applyPayload(JSON.parse(await file.text()) as TransferPayload, file.name);
    } catch { setTransferMessage("That file could not be read as a Signal Petal backup."); }
    // Clear the input so choosing the same file twice still fires a change.
    input.value = "";
  }
  async function copyTransferCode() {
    try { await navigator.clipboard.writeText(transferCode); setTransferMessage("Backup code copied. Open Signal Petal at the other address and paste it there."); }
    catch { setTransferMessage("Copy was blocked by the browser. Select the code and copy it manually."); }
  }
  async function pasteTransferCode() {
    try { const code = await navigator.clipboard.readText(); setImportCode(code); setTransferMessage(code ? "Backup code pasted. Choose Import and merge to finish." : "The clipboard is empty."); }
    catch { setTransferMessage("Paste was blocked by the browser. Paste the backup code into the box manually."); }
  }
  function applyPayload(payload: TransferPayload, source: string) {
    if (!isValidPayload(payload)) {
      setTransferMessage(`${source} is not a Signal Petal backup.`);
      return;
    }
    const local = currentPayload();
    const diarySkipped = lockOn || !!payload.diaryVault;
    const safeIncoming = diarySkipped ? { ...payload, diaryEntries: local.diaryEntries, diaryLog: local.diaryLog, diaryVault: local.diaryVault } : payload;
    const { payload: merged, summary } = mergeTransferData(local, safeIncoming);
    setIssues(merged.issues);
    setStatuses(merged.statuses);
    setStatusColors(merged.statusColors);
    setDiaryEntries(merged.diaryEntries ?? []);
    setDiaryLog(merged.diaryLog ?? []);
    setDailyCheckIns(merged.dailyCheckIns ?? []);
    if (!profile && merged.profile) setProfile(merged.profile);
    setActiveId(merged.issues[0]?.id ?? "");
    setTransferCode(encodeTransfer(merged));
    const changes = [`${summary.addedTasks} task${summary.addedTasks === 1 ? "" : "s"} added`, `${summary.updatedTasks} updated`, `${summary.addedDiaryEntries} reflection${summary.addedDiaryEntries === 1 ? "" : "s"} added`, `${summary.updatedDiaryEntries} updated`, `${summary.addedCheckIns} check-in${summary.addedCheckIns === 1 ? "" : "s"} added`];
    setTransferMessage(`Merged ${source}: ${changes.join(", ")}.${diarySkipped ? " Encrypted diary data was left unchanged; unlock it before exporting if you want reflections included in a merge." : " Existing local records and preferences were kept."}`);
    setImportCode("");
  }
  function importTransfer() {
    try {
      applyPayload(decodeTransfer(importCode.trim()), "that backup code");
    } catch { setTransferMessage("That backup code is not valid. Copy it again from the other Signal Petal address."); }
  }
  async function resetAccount() {
    if (resetConfirmation !== "RESET") return;
    setResetBusy(true); setSyncMessage("");
    try {
      const response = await fetch("/api/sync", { method: "DELETE" });
      if (!response.ok && response.status !== 401) throw new Error("Cloud reset failed");
      Object.keys(localStorage).filter(key => key.startsWith("signal-petal-")).forEach(key => dropStore(key));
      location.reload();
    } catch {
      setResetBusy(false);
      setSyncMessage("Nothing was cleared because the cloud account could not be reached. Check your connection and try again.");
      setShowResetAccount(false);
    }
  }
  function addUpdate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const text = String(form.get("update") || "").trim(); if (!text || !active) return; updateIssue({ updates: [...active.updates, { id: crypto.randomUUID(), at: new Date().toISOString(), author: personalOwner, text }] }); event.currentTarget.reset(); }
  function addIssue(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const now = new Date().toISOString(); const title = String(form.get("title")); const details = String(form.get("details")); const updates = [{ id: crypto.randomUUID(), at: now, author: personalOwner, text: "Issue logged." }]; const issue: Issue = { id: crypto.randomUUID(), title, details, owner: titleCaseName(String(form.get("owner")).trim()) || personalOwner, action: String(form.get("action")), expected: String(form.get("expected")), createdAt: now, updatedAt: now, status: String(form.get("status") || "New"), outcome: "", lane: newLane, priority: String(form.get("priority") || "medium") as Issue["priority"], category: String(form.get("category") || "").trim(), followUpPeople: newFollowUps, updates }; setIssues(items => [issue, ...items]); setActiveId(issue.id); setNewFollowUps([]); setNewFollowUpInput(""); setNewLane(undefined); setShowCreate(false); setShowDetail(true); }
  function saveProfile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const name = titleCaseName(String(form.get("name") || "").trim()); const role = String(form.get("role") || "").trim(); if (name && role) { setProfile({ name, role }); if (readStore("signal-petal-onboarding-complete") !== "true") { setOnboardingStep(0); setShowOnboarding(true); } } }
  function updateProfile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const name = titleCaseName(String(form.get("name") || "").trim()); const role = String(form.get("role") || "").trim(); if (name && role) setProfile({ name, role }); }
  function replayOnboarding() { setOnboardingStep(0); setShowOnboarding(true); }
  function finishOnboarding(action?: "create" | "focus" | "check-in") { writeStore("signal-petal-onboarding-complete", "true"); setShowOnboarding(false); if (action === "create") openCreate(); else if (action === "focus") { setSection("dashboard"); setFilter("All"); } else if (action === "check-in") openDailyCheckIn(); }
  function runCommand(command: "create" | "focus" | "check-in" | "review" | "insights" | "settings") { setShowCommandPalette(false); setCommandIndex(0); if (command === "create") openCreate(); else if (command === "focus") { setSection("dashboard"); setFilter("All"); setMetricFocus("home-total"); } else if (command === "check-in") openDailyCheckIn(); else if (command === "review") setSection("review"); else if (command === "insights") setSection("metrics"); else openSettings(); }
  async function requestNotificationPermission() {
    if (!("Notification" in window)) { setReminderFeedback("This browser does not support web notifications."); return "unsupported" as const; }
    const result = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    // Not every engine fires a permission "change" event after the prompt, so nudge the store.
    announcePermissionChange();
    if (result !== "granted") {
      setRemindersEnabled(false);
      setReminderFeedback(result === "denied"
        ? "Your browser is blocking notifications for this address. Open the icon beside the address bar, set Notifications to Allow, then reload this page."
        : "The permission prompt was dismissed. Choose “Allow” when it appears so reminders can reach you.");
    }
    return result;
  }
  async function toggleNotifications() {
    if (remindersOn) { setRemindersEnabled(false); setReminderFeedback("Reminders paused. Your check-in time is saved for when you switch them back on."); return; }
    if (await requestNotificationPermission() !== "granted") return;
    setRemindersEnabled(true);
    setReminderFeedback(describeDelivery(
      await sendReminderNotification("Signal Petal reminders are on", "You’ll receive task alerts and your daily check-in while Signal Petal is active.", `signal-petal-enabled-${Date.now()}`),
      "Setup notification",
    ));
  }
  async function testNotifications() {
    if (await requestNotificationPermission() !== "granted") return;
    setRemindersEnabled(true);
    setReminderFeedback(describeDelivery(
      await sendReminderNotification("Signal Petal test", "This is your reminder test. Notifications are ready on this device.", `signal-petal-test-${Date.now()}`),
      "Test notification",
    ));
  }
  const linkableIssues = [...issues].sort((a, b) => Number(isCompleteStatus(a.status)) - Number(isCompleteStatus(b.status)) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 12);
  function offerUndo(label: string, restore: () => void) { setUndo({ label, restore }); }
  function recordDiaryEvent(entry: { id: string; title: string; mood: Mood }, action: DiaryAction, detail: string, at = new Date().toISOString()) {
    setDiaryLog(events => [{ id: crypto.randomUUID(), entryId: entry.id, at, action, title: entry.title, mood: entry.mood, detail }, ...events]);
  }
  function addDiaryEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = diaryText.trim();
    if (!text) return;
    const at = new Date().toISOString();
    const entry: DiaryEntry = { id: crypto.randomUUID(), at, title: diaryTitle.trim(), text, mood: diaryMood, suggestion: "", issueIds: diaryLinks };
    setDiaryEntries(items => [entry, ...items]);
    recordDiaryEvent(entry, "created", `${wordCount(text)} word${wordCount(text) === 1 ? "" : "s"}`, at);
    setDiaryTitle("");
    setDiaryText("");
    setDiaryLinks([]);
  }
  function startDiaryEdit(entry: DiaryEntry) {
    setEditingDiaryId(entry.id);
    setEditDraft({ title: entry.title, text: entry.text, mood: entry.mood, issueIds: entry.issueIds ?? [] });
  }
  function cancelDiaryEdit() { setEditingDiaryId(""); }
  function saveDiaryEdit(event: FormEvent<HTMLFormElement>, entry: DiaryEntry) {
    event.preventDefault();
    const text = editDraft.text.trim();
    if (!text) return;
    const updatedAt = new Date().toISOString();
    const detail = describeDiaryChange(entry, { ...editDraft, text });
    setDiaryEntries(items => items.map(item => item.id === entry.id ? { ...item, title: editDraft.title.trim(), text, mood: editDraft.mood, suggestion: "", updatedAt, issueIds: editDraft.issueIds } : item));
    recordDiaryEvent({ id: entry.id, title: editDraft.title.trim(), mood: editDraft.mood }, "edited", detail, updatedAt);
    setEditingDiaryId("");
  }
  function deleteDiaryEntry(entry: DiaryEntry) {
    const index = diaryEntries.findIndex(item => item.id === entry.id);
    const priorLog = diaryLog;
    setDiaryEntries(items => items.filter(item => item.id !== entry.id));
    recordDiaryEvent(entry, "deleted", `written ${dateLabel(entry.at)}`);
    if (editingDiaryId === entry.id) setEditingDiaryId("");
    if (openDiaryId === entry.id) setOpenDiaryId("");
    setConfirmDiaryDelete("");
    offerUndo(`Deleted “${entry.title || "Untitled reflection"}”.`, () => {
      // Put the page back where it was and drop the deletion from the log entirely.
      setDiaryEntries(items => { const next = items.filter(item => item.id !== entry.id); next.splice(Math.max(0, index), 0, entry); return next; });
      setDiaryLog(priorLog);
    });
  }

  return <main className={`theme-${theme} ${darkMode ? "dark-mode" : ""}`}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Petal size={26} label="Signal Petal"/></span><div><strong>{appName}</strong><small>{profile?.role || "Personal work companion"}</small></div></div>
      <nav><button className={section === "dashboard" ? "nav-active" : ""} onClick={() => { setSection("dashboard"); setFilter("All"); setMetricFocus("home-total"); }}>⌂ <span>Dashboard</span></button><button className={section === "calendar" ? "nav-active" : ""} onClick={() => setSection("calendar")}>▦ <span>Calendar</span></button><button className={section === "metrics" ? "nav-active" : ""} onClick={() => setSection("metrics")}>◌ <span>Insights</span></button><button className={section === "diary" ? "nav-active" : ""} onClick={() => setSection("diary")}>✎ <span>Diary</span></button><button className={section === "review" ? "nav-active" : ""} onClick={() => setSection("review")}>◷ <span>Weekly review</span></button><button className={section === "settings" ? "nav-active" : ""} onClick={openSettings}>⚙ <span>Settings</span></button></nav>
      <div className="sidebar-bottom"><p>Appearance, workflow, notifications, and data tools are in Settings.</p></div>
    </aside>
    <button className="command-trigger" type="button" onClick={() => { setCommandQuery(""); setCommandIndex(0); setShowCommandPalette(true); }} aria-label="Open command palette">⌘ K</button>
    <section className={`workspace ${section === "dashboard" ? `view-${dashboardView}` : ""}`}>
      {storageTrouble && <div className="data-alarm" role="alert"><div><strong>{storageTrouble.reason === "full" ? "This browser has run out of room." : "This browser is not letting anything be saved."}</strong><p>{storageTrouble.reason === "full" ? "Your last change is on screen but it has not been saved, and nothing new can be saved until there is space here. Save a backup file now \u2014 that copy is the one that survives." : "Your changes are on screen, but nothing is reaching storage, so they will be gone when this tab closes. Save a backup file now."}</p></div><button className="primary" type="button" onClick={downloadBackup}>Save backup file</button></div>}
      {!storageTrouble && backupDue && <div className="data-nudge"><div><strong>{backupAge === null ? "You have not saved a backup yet." : `Your last backup was ${backupAge} days ago.`}</strong><p>Everything here lives in this browser. A backup file is the copy that survives it being cleared.</p></div><div className="data-nudge-actions"><button className="secondary" type="button" onClick={snoozeBackupNudge}>Not now</button><button className="primary" type="button" onClick={downloadBackup}>Save backup file</button></div></div>}
      <header><div><p className="eyebrow">{section === "dashboard" && filter === "Mine" ? "PERSONAL FOCUS" : section === "dashboard" && filter === "Overdue" ? "TRIAGE MODE" : section === "diary" ? "PRIVATE REFLECTIONS" : section === "settings" ? "WORKSPACE PREFERENCES" : profile ? `${profile.name.toUpperCase()}'S WORKSPACE` : "YOUR WORKSPACE"}</p><h1>{pageTitle}{titleMark && <Petal className="title-petal" size={24}/>}</h1><p className="subhead">{pageDescription}</p></div>{section !== "settings" && section !== "diary" && section !== "review" && <div className="header-actions"><button className="primary" type="button" onClick={openCreate}>+ Log/Track</button></div>}</header>
      {section === "dashboard" && <>{filter === "All" && <p className="day-line">{todayLine}</p>}<section className="metric-row dashboard-switcher" aria-label="Dashboard views"><button className={`metric-card ${filter === "All" && metricFocus === "home-total" ? "metric-selected" : ""}`} type="button" aria-pressed={filter === "All" && metricFocus === "home-total"} onClick={() => { setFilter("All"); setMetricFocus("home-total"); }}><span>All tasks</span><strong>{currentIssues.length}</strong><small>Across every status and owner</small></button><button className={`metric-card personal ${filter === "Mine" ? "metric-selected" : ""}`} type="button" aria-pressed={filter === "Mine"} onClick={() => { setFilter("Mine"); setMetricFocus("mine-total"); }}><span>My actions</span><strong>{mine.length}</strong><small>Assigned directly to you</small></button><button className={`metric-card warm urgent ${filter === "Overdue" ? "metric-selected" : ""}`} type="button" aria-pressed={filter === "Overdue"} onClick={() => { setFilter("Overdue"); setMetricFocus("attention-overdue"); }}><span>Needs attention</span><strong>{overdueCount}</strong><small>{overdueCount ? "Past the expected update" : "Everything is on track"}</small></button><button className={`metric-card ${filter === "All" && metricFocus === "home-resolved" ? "metric-selected" : ""}`} type="button" aria-pressed={filter === "All" && metricFocus === "home-resolved"} onClick={() => { setFilter("All"); setMetricFocus("home-resolved"); }}><span>{completionLabel}</span><strong>{resolvedIssues.length}</strong><small>Outcomes documented</small></button><button className={`metric-card check-in-card ${todayCheckIn ? "good" : ""}`} type="button" onClick={openDailyCheckIn}><span>Next check-in</span><strong>{todayCheckIn ? "Done" : "Today"}</strong><small>{todayCheckIn ? "Daily brief completed" : `Daily wrap-up at ${reminderTime}`}</small></button></section><section className="metric-row dashboard-view-metrics">{filter === "Mine" ? <><button className={`metric-card personal ${metricFocus === "mine-open" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "mine-open"} onClick={() => setMetricFocus("mine-open")}><span>My open actions</span><strong>{mineOpen.length}</strong><small>Assigned directly to you</small></button><button className={`metric-card ${mineOverdue.length ? "warm" : "good"} ${metricFocus === "mine-overdue" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "mine-overdue"} onClick={() => setMetricFocus("mine-overdue")}><span>My overdue</span><strong>{mineOverdue.length}</strong><small>{mineOverdue.length ? "Needs your follow-up" : "Your work is on track"}</small></button><button className={`metric-card ${metricFocus === "mine-resolved" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "mine-resolved"} onClick={() => setMetricFocus("mine-resolved")}><span>My {completionLabel.toLowerCase()}</span><strong>{mineResolved.length}</strong><small>Personal outcomes captured</small></button><button className={`metric-card ${metricFocus === "mine-total" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "mine-total"} onClick={() => setMetricFocus("mine-total")}><span>My total</span><strong>{mine.length}</strong><small>Across every status</small></button></> : filter === "Overdue" ? <><button className={`metric-card urgent ${metricFocus === "attention-overdue" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "attention-overdue"} onClick={() => setMetricFocus("attention-overdue")}><span>Overdue now</span><strong>{overdueCount}</strong><small>Past expected update</small></button><button className={`metric-card warm ${metricFocus === "attention-oldest" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "attention-oldest"} onClick={() => setMetricFocus("attention-oldest")}><span>Oldest delay</span><strong>{attentionQueue.length ? daysOverdue(attentionQueue[0]) : 0}d</strong><small>{attentionQueue.length ? attentionQueue[0].title : "Nothing is overdue"}</small></button><button className={`metric-card ${metricFocus === "attention-owners" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "attention-owners"} onClick={() => setMetricFocus("attention-owners")}><span>Owners affected</span><strong>{new Set(attentionQueue.map(i => i.owner)).size}</strong><small>People needing follow-up</small></button><button className={`metric-card ${metricFocus === "attention-first" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "attention-first"} onClick={() => setMetricFocus("attention-first")}><span>First move</span><strong>{attentionQueue.length ? "Now" : "Clear"}</strong><small>{attentionQueue.length ? "Start with the oldest item" : "No triage needed"}</small></button></> : <><button className={`metric-card ${metricFocus === "home-open" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "home-open"} onClick={() => setMetricFocus("home-open")}><span>Open work</span><strong>{openCount}</strong><small>Across your active issues</small></button><button className={`metric-card warm ${metricFocus === "home-overdue" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "home-overdue"} onClick={() => setMetricFocus("home-overdue")}><span>Needs attention</span><strong>{overdueCount}</strong><small>{overdueCount ? "Past its expected update" : "Everything is on track"}</small></button><button className={`metric-card ${metricFocus === "home-resolved" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "home-resolved"} onClick={() => setMetricFocus("home-resolved")}><span>{completionLabel}</span><strong>{resolvedIssues.length}</strong><small>Outcomes documented</small></button><article><span>Next check-in</span><strong>Today</strong><small>Daily wrap-up at 4:30 PM</small></article></>}</section>
      {filter === "All" && <section className="garden-card" aria-labelledby="garden-title"><div className="garden-copy"><p className="eyebrow">TODAY’S SIGNAL GARDEN</p><h2 id="garden-title">{gardenStage === 4 ? "Today is in full bloom" : gardenStage ? "Your day is taking root" : "Plant the first signal"}</h2><p>{gardenStage === 4 ? "You moved work, closed a loop, checked in, and made room to reflect." : "Each meaningful loop adds something—without points, pressure, or a perfect-day requirement."}</p><div className="garden-milestones"><span className={dailyMovesDone ? "is-grown" : ""}>Focus move</span><span className={completedToday.length ? "is-grown" : ""}>Closed loop</span><span className={todayCheckIn ? "is-grown" : ""}>Checked in</span><span className={wroteToday ? "is-grown" : ""}>Reflected</span></div></div><SignalGarden stage={gardenStage} label={`Today’s Signal Garden is at stage ${gardenStage} of 4`}/></section>}
      {filter === "All" && <section className={`focus-now ${focusRecommendations.length ? "has-focus" : "is-clear"} ${queueJustCleared ? "just-cleared" : ""}`} aria-labelledby="focus-now-title">
        <div className="focus-now-intro">{queueJustCleared && <span className="cleared-mark" aria-hidden="true">✓</span>}<p className="eyebrow">{queueJustCleared ? "QUEUE CLEAR" : "TODAY’S THREE MOVES"}</p><h2 id="focus-now-title">{focusRecommendations.length ? "The next moves that matter" : queueJustCleared ? "You cleared it." : "Your queue is in good shape"}</h2><div className="focus-progress" aria-label={`${dailyMovesDone} of 3 focus moves handled`}><span>{[0,1,2].map(step => <i className={step < dailyMovesDone ? "is-done" : ""} key={step}/>)}</span><strong>{dailyMovesDone} of 3 handled</strong></div><p>{focusRecommendations.length ? "Signal Petal ranked these by urgency and clarity, so you can move the queue without rereading everything." : queueJustCleared ? "Nothing overdue, nothing without a next move, and work actually left the queue today." : "Every active item has a clear next move and nothing is overdue."}</p>{queueJustCleared && <p className="cleared-note"><strong>{completedToday.length} closed today:</strong> {completedToday.slice(0, 3).map(issue => clip(issue.title, 34)).join(" · ")}{completedToday.length > 3 ? ` and ${completedToday.length - 3} more` : ""}</p>}</div>
        {focusRecommendations.length > 0 && <div className="focus-now-list">{focusRecommendations.map((recommendation, index) => <article className={`focus-item focus-${recommendation.kind} ${focusRescheduleId === recommendation.issue.id ? "is-rescheduling" : ""} ${focusCompletingId === recommendation.issue.id ? "is-completing" : ""}`} key={recommendation.issue.id}>
          <span className="focus-rank">{index + 1}</span><div className="focus-item-copy"><div className="focus-item-top"><span>{recommendation.kind === "overdue" ? "Overdue" : recommendation.kind === "missing-eta" ? "Needs an ETA" : "Needs a next action"}</span><small>{recommendation.issue.owner}</small></div><h3>{recommendation.issue.title}</h3><p><strong>{recommendation.reason}.</strong> {recommendation.move}</p></div>
          <div className="focus-actions"><button type="button" onClick={() => recordFocusFollowUp(recommendation.issue)}>✓ Followed up</button><button type="button" aria-expanded={focusRescheduleId === recommendation.issue.id} onClick={() => setFocusRescheduleId(id => id === recommendation.issue.id ? "" : recommendation.issue.id)}>◷ Reschedule</button><button type="button" onClick={() => markFocusHandled(recommendation.issue)}>Done for now</button><button className="focus-open" type="button" onClick={() => openIssueDetail(recommendation.issue.id)} aria-label={`Open ${recommendation.issue.title}`}>Open <span aria-hidden="true">→</span></button></div>
          {focusRescheduleId === recommendation.issue.id && <div className="focus-reschedule" aria-label={`Reschedule ${recommendation.issue.title}`}><span>Bring this back:</span><button type="button" onClick={() => rescheduleFocus(recommendation.issue, "tomorrow")}>Tomorrow · 9:00 AM</button><button type="button" onClick={() => rescheduleFocus(recommendation.issue, "three-days")}>In 3 days</button><button type="button" onClick={() => rescheduleFocus(recommendation.issue, "monday")}>Next Monday · 9:00 AM</button><button className="focus-cancel" type="button" onClick={() => setFocusRescheduleId("")} aria-label="Cancel rescheduling">×</button></div>}
        </article>)}</div>}
        {focusRecommendations.length > 0 && <button className="focus-all" type="button" onClick={() => { if (overdueCount) { setFilter("Overdue"); setMetricFocus("attention-overdue"); } else openIssueDetail(focusRecommendations[0].issue.id); }}>{overdueCount ? "Open triage queue" : "Review first signal"} <span aria-hidden="true">→</span></button>}
      </section>}
      <section className="content-grid">
        <div className={`issue-panel issue-panel-${dashboardView}`}><div className="section-heading"><div><p className="eyebrow">{filter === "Mine" ? "PERSONAL QUEUE" : filter === "Overdue" ? "PRIORITY QUEUE" : "WORK QUEUE"}</p><h2>{queueTitle}</h2></div><div className="filter-pills">{(["All", "Mine", "Overdue", "Archive"] as const).map(f => <button className={filter === f && (f !== "All" || metricFocus === "home-open") ? "selected" : ""} onClick={() => { setFilter(f); setMetricFocus(f === "Mine" ? "mine-total" : f === "Overdue" ? "attention-overdue" : "home-open"); }} key={f}>{f === "All" ? metricFocus === "home-total" ? "All" : metricFocus === "home-resolved" ? completionLabel : "Open" : f}</button>)}</div></div><div className="task-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search tasks" placeholder="Search tasks, owners, statuses, or follow-up people…" value={searchQuery} onChange={event => setSearchQuery(event.target.value)}/>{searchQuery && <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear task search">Clear</button>}<small aria-live="polite">{visible.length} {visible.length === 1 ? "result" : "results"}</small></div><div className="issue-list">{shownIssues.map(issue => <article key={issue.id} className={`issue-card ${issue.id === activeId ? "active" : ""}`}><button className="issue-card-main" type="button" onClick={() => openIssueDetail(issue.id)}><div><TaskBadges issue={issue} statusColors={statusColors}/><h3>{issue.title}</h3><p>{issue.action || issue.details}</p>{issue.followUpPeople.length > 0 && <small className="issue-card-people">Follow up: {issue.followUpPeople.join(", ")}</small>}</div><div className="issue-meta"><span className={isOverdue(issue) ? "due overdue" : "due"}>{isOverdue(issue) ? "Overdue · " : "Due · "}{dateLabel(issue.expected)}</span><span>{issue.owner}</span><em>{issue.followUpPeople.length > 0 ? `${issue.followUpPeople.length} follow-up ${issue.followUpPeople.length === 1 ? "person" : "people"}` : ""}</em></div></button><TaskActionControls issue={issue} onComplete={completeIssue} onDelete={removeIssue} onRestore={restoreIssue}/></article>)}{olderDone.length > 0 && <div className="older-done">{showOlderDone ? <button type="button" onClick={() => setShowOlderDone(false)}>Hide the {olderDone.length} older finished item{olderDone.length === 1 ? "" : "s"}</button> : <button type="button" onClick={() => setShowOlderDone(true)}>Show {olderDone.length} older finished item{olderDone.length === 1 ? "" : "s"}</button>}<small>Finished more than a month ago. Still counted above, still searchable, still in your summaries.</small></div>}{!visible.length && <div className="empty">{searchQuery.trim() ? `No tasks match “${searchQuery.trim()}”.` : filter === "Mine" ? "No actions match this selection." : filter === "Overdue" || metricFocus === "home-overdue" ? "Nothing needs attention—every active item is on track." : metricFocus === "home-resolved" ? `No ${completionLabel.toLowerCase()} work yet.` : "No open work—your queue is looking beautifully clear."}</div>}</div></div>
        <aside className={`report-panel report-${dashboardView}`}>{filter === "Mine" ? <><p className="eyebrow">PERSONAL SNAPSHOT</p><h2>Your workload</h2><div className="focus-stat"><span>In progress</span><strong>{mineOpen.length}</strong></div><div className="focus-stat"><span>Overdue</span><strong>{mineOverdue.length}</strong></div><div className="focus-stat"><span>Completed</span><strong>{mineResolved.length}</strong></div><div className="report-divider"/><p className="eyebrow">FOCUS PROMPT</p><p className="report-note">Choose one clear next action, add an update, and keep your personal queue moving.</p></> : filter === "Overdue" ? <><p className="eyebrow">TRIAGE ORDER</p><h2>Oldest first</h2><div className="triage-list">{attentionQueue.slice(0, 3).map((issue, index) => <button key={issue.id} onClick={() => { setActiveId(issue.id); setShowDetail(true); }}><em>{index + 1}</em><span><strong>{issue.title}</strong><small>{issue.owner} · {dateLabel(issue.expected)}</small></span></button>)}{!attentionQueue.length && <p className="report-note">Your priority queue is clear.</p>}</div><div className="report-divider"/><p className="eyebrow">RECOVERY RHYTHM</p><p className="report-note">Confirm the owner, record the next step, and reset the expected update.</p></> : <><p className="eyebrow">AT A GLANCE</p><h2>Workload by owner</h2>{ownerReport.map(([owner,count]) => <div className="owner" key={owner}><div className="avatar">{owner.charAt(0)}</div><span>{owner}</span><strong>{count}</strong></div>)}<div className="report-divider"/><p className="eyebrow">WEEKLY OUTCOMES</p><p className="report-note">{completionLabel} work is retained with its outcome, so your weekly review writes itself.</p></>}</aside>
      </section>
      </>}
      {section === "calendar" && <section className="calendar-layout"><div className="calendar-panel"><div className="calendar-toolbar"><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><h2>{monthTitle}</h2><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div><div className="weekdays">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{calendarDays.map((day, index) => { if (day < 1) return <div className="calendar-day blank" key={index}/>; const key = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`; const due = issues.filter(i => i.expected && dayKey(i.expected) === key && !i.archivedAt); const reflections = diaryLog.filter(event => dayKey(event.at) === key); const dayMood = moodByDay.get(key); return <button key={key} className={`calendar-day ${key === selectedDay ? "chosen" : ""} ${dayMood ? `has-mood mood-${dayMood}` : ""}`} onClick={() => setSelectedDay(key)}><span>{day}</span>{(due.length > 0 || reflections.length > 0) && <div className="day-counts">{due.length > 0 && <em>{due.length} due</em>}{reflections.length > 0 && <em className="diary-count">✎ {reflections.length}</em>}</div>}{due.slice(0, reflections.length ? 1 : 2).map(i => <small key={i.id}>{i.title}</small>)}{reflections.slice(0, 1).map(event => <small className="diary-line" key={event.id}>{moodName(event.mood)} · {event.title || "Untitled reflection"}</small>)}</button>; })}</div>{moodByDay.size > 0 && <div className="calendar-legend"><span>HOW THE DAYS FELT</span>{moods.map(mood => <span className={`legend-dot legend-${mood.value}`} key={mood.value}><i aria-hidden="true"/>{mood.label}</span>)}</div>}</div><aside className="day-summary"><p className="eyebrow">DAY SUMMARY</p><h2>{new Intl.DateTimeFormat("en", { weekday:"long", month:"long", day:"numeric" }).format(new Date(`${selectedDay}T12:00`))}</h2><p className="summary-count">{selectedIssues.length} issue{selectedIssues.length === 1 ? "" : "s"} due{selectedDiary.length ? ` · ${selectedDiary.length} diary ${selectedDiary.length === 1 ? "entry" : "entries"}` : ""}</p>{selectedDiary.length > 0 && <div className="day-diary"><p className="eyebrow">DIARY</p>{selectedDiary.map(event => <button key={event.id} className={`day-diary-entry action-${event.action}`} onClick={() => setSection("diary")}><span className={`mood-tag mood-${event.mood}`}>{moods.find(item => item.value === event.mood)?.symbol} {moodName(event.mood)}</span><strong>{event.title || "Untitled reflection"}</strong><small>{diaryEventLabel(event.action)} · {dateLabel(event.at)}{event.detail ? ` · ${event.detail}` : ""}</small></button>)}</div>}<div className="day-issues">{selectedIssues.map(issue => <article key={issue.id}><button className="day-issue-main" type="button" onClick={() => openIssueDetail(issue.id)}><span className={statusClass(issue.status)} style={statusStyle(issue.status)}>{issue.status}</span><strong>{issue.title}</strong><small>{issue.owner} · {dateLabel(issue.expected)}</small></button><div className="day-issue-actions">{!isCompleteStatus(issue.status) && <button type="button" onClick={() => completeIssue(issue)}>✓ Complete</button>}<button type="button" onClick={() => openIssueDetail(issue.id)}>Reschedule</button></div></article>)}{!selectedIssues.length && !selectedDiary.length && <p className="empty">Nothing logged for this day.</p>}</div></aside></section>}
      {section === "metrics" && <section className="insights-2026">
        <div className="insights-toolbar">
          <div className="insight-section-tabs" role="tablist" aria-label="Insights sections">
            {([['work','Work signals'],['memory','What you learned'],['rhythm','Personal rhythm']] as const).map(([value,label]) => <button key={value} type="button" role="tab" aria-selected={insightSection === value} className={insightSection === value ? "is-selected" : ""} onClick={() => { setInsightSection(value); setInsightDrilldown(""); }}>{label}</button>)}
          </div>
          {insightSection === "work" && <div className="insight-range" aria-label="Insight time range">{([['7','7 days'],['30','30 days'],['90','90 days'],['all','All time']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={insightRange === value} className={insightRange === value ? "is-selected" : ""} onClick={() => { setInsightRange(value); setInsightDrilldown(""); }}>{label}</button>)}</div>}
        </div>

        {insightSection === "work" && <>
          <article className={`signal-headline ${overdueCount ? "watch" : "healthy"}`}>
            <div><p className="eyebrow">THE SIGNAL WORTH ACTING ON</p><h2>{insightHeadline}</h2><p>{insightHeadlineCopy}</p></div>
            <button type="button" onClick={() => overdueCount ? openInsightQueue("overdue") : missingEtaIssues.length ? openInsightQueue("eta") : setSection("dashboard")}>{overdueCount ? "Work the oldest →" : missingEtaIssues.length ? "Set an expectation →" : "Open the queue →"}</button>
          </article>
          <div className="insight-context"><span>{insightWindow.label}</span><span>{insightConfidence} · {insightSampleSize} work event{insightSampleSize === 1 ? "" : "s"}</span></div>
          <div className="metric-row insight-metrics insight-metric-buttons">
            <button className={`metric-card ${insightDrilldown === "completed" ? "metric-selected" : ""}`} type="button" onClick={() => setInsightDrilldown(current => current === "completed" ? "" : "completed")}><span>Completed</span><strong>{insightResolved.length}</strong><small>{insightRange === "all" ? `${resolvedIssues.length} recorded outcomes` : `${insightResolved.length - previousResolved.length >= 0 ? "+" : ""}${insightResolved.length - previousResolved.length} versus prior period`}</small></button>
            <button className={`metric-card ${insightOnTimeRate >= 80 ? "good" : "warm"} ${insightDrilldown === "on-time" ? "metric-selected" : ""}`} type="button" onClick={() => setInsightDrilldown(current => current === "on-time" ? "" : "on-time")}><span>On-time completion</span><strong>{insightDueResolved.length ? `${insightOnTimeRate}%` : "—"}</strong><small>{insightRange === "all" || !previousDueResolved.length ? `${insightOnTimeCount} of ${insightDueResolved.length} by ETA` : `${insightOnTimeRate - previousOnTimeRate >= 0 ? "+" : ""}${insightOnTimeRate - previousOnTimeRate} points versus prior`}</small></button>
            <button className={`metric-card ${insightDrilldown === "cycle" ? "metric-selected" : ""}`} type="button" onClick={() => setInsightDrilldown(current => current === "cycle" ? "" : "cycle")}><span>Average cycle time</span><strong>{insightCompletionHours.length ? `${insightAverageHours.toFixed(1)}h` : "—"}</strong><small>{insightRange === "all" || !previousCompletionHours.length ? "From logged to completed" : `${Math.abs(insightAverageHours - previousAverageHours).toFixed(1)}h ${insightAverageHours <= previousAverageHours ? "faster" : "slower"} than prior`}</small></button>
            <button className={`metric-card ${overdueCount ? "warm" : "good"} ${insightDrilldown === "overdue" ? "metric-selected" : ""}`} type="button" onClick={() => setInsightDrilldown(current => current === "overdue" ? "" : "overdue")}><span>Overdue now</span><strong>{overdueCount}</strong><small>{insightRange === "all" ? "Current active queue" : `${overdueCount - previousOverdueCount >= 0 ? "+" : ""}${overdueCount - previousOverdueCount} versus prior boundary`}</small></button>
          </div>
          {insightDrilldown && <section className="insight-drilldown" aria-live="polite"><div><p className="eyebrow">CONTRIBUTING WORK</p><h3>{insightDrilldown === "completed" ? "Completed in this period" : insightDrilldown === "on-time" ? "Work with a tracked ETA" : insightDrilldown === "cycle" ? "Cycle-time records" : "Currently overdue"}</h3></div>{insightDrilldownIssues.length ? <div>{insightDrilldownIssues.map(issue => <button key={issue.id} type="button" onClick={() => openIssueDetail(issue.id)}><span><strong>{issue.title}</strong><small>{issue.owner} · {isCompleteStatus(issue.status) ? dateLabel(completedAtOf(issue)) : `${daysOverdue(issue)}d overdue`}</small></span><b>Open →</b></button>)}</div> : <p>No records contribute to this metric yet.</p>}</section>}

          <section className="bottleneck-center">
            <div className="memory-head"><div><p className="eyebrow">WHERE WORK WAITS</p><h2>Find the bottleneck, not the blame</h2><p>These are live queue conditions, independent of the selected reporting period.</p></div><span>{waitingIssues.length + staleIssues.length} waiting signals</span></div>
            <div className="bottleneck-grid">
              <button type="button" disabled={!oldestActive} onClick={() => oldestActive && openIssueDetail(oldestActive.id)}><span>Oldest active work</span><strong>{oldestActive ? `${daysSince(oldestActive.createdAt)}d` : "—"}</strong><small>{oldestActive ? clip(oldestActive.title, 54) : "The queue is empty"}</small></button>
              <button type="button" disabled={!waitingIssues.length} onClick={() => waitingIssues[0] && openIssueDetail(waitingIssues[0].id)}><span>Waiting or blocked</span><strong>{waitingIssues.length}</strong><small>{waitingIssues.length ? "Open the oldest waiting item" : "No blocked handoffs"}</small></button>
              <button type="button" disabled={!staleIssues.length} onClick={() => staleIssues[0] && openIssueDetail(staleIssues[0].id)}><span>No update for 3+ days</span><strong>{staleIssues.length}</strong><small>{staleIssues.length ? "Record the next movement" : "Every active item is fresh"}</small></button>
              <button type="button" disabled={!ownerReport.length} onClick={() => { setSection("dashboard"); setFilter("All"); setMetricFocus("home-open"); }}><span>Highest active load</span><strong>{ownerReport[0]?.[1] ?? 0}</strong><small>{ownerReport[0]?.[0] ?? "No active owner"}</small></button>
            </div>
          </section>

          <section className="insight-action-center" aria-labelledby="insight-action-title-v2"><div className="insight-action-head"><div><p className="eyebrow">ACT ON THE SIGNAL</p><h2 id="insight-action-title-v2">Turn the gaps into next moves</h2><p>Each action opens the exact queue or record that needs attention.</p></div><span>{overdueCount + missingEtaIssues.length + missingOutcomeIssues.length} open recommendation{overdueCount + missingEtaIssues.length + missingOutcomeIssues.length === 1 ? "" : "s"}</span></div><div className="insight-action-list"><article className={overdueCount ? "needs-action" : "is-complete"}><span className="insight-action-mark">{overdueCount ? "!" : "✓"}</span><div><strong>Recover overdue work</strong><p>{overdueCount ? `${overdueCount} active item${overdueCount === 1 ? " is" : "s are"} past the expected update.` : "No active work is overdue."}</p></div>{overdueCount > 0 && <button type="button" onClick={() => openInsightQueue("overdue")}>Work the queue →</button>}</article><article className={missingEtaIssues.length ? "needs-action" : "is-complete"}><span className="insight-action-mark">{missingEtaIssues.length ? "◷" : "✓"}</span><div><strong>Set missing expectations</strong><p>{missingEtaIssues.length ? `${missingEtaIssues.length} active item${missingEtaIssues.length === 1 ? " has" : "s have"} no ETA.` : "Every active item has an expected update."}</p></div>{missingEtaIssues.length > 0 && <button type="button" onClick={() => openInsightQueue("eta")}>Set the first ETA →</button>}</article><article className={missingOutcomeIssues.length ? "needs-action" : "is-complete"}><span className="insight-action-mark">{missingOutcomeIssues.length ? "✎" : "✓"}</span><div><strong>Preserve the outcome</strong><p>{missingOutcomeIssues.length ? `${missingOutcomeIssues.length} completed item${missingOutcomeIssues.length === 1 ? " is" : "s are"} missing the result or learning.` : "Every completed item has an outcome."}</p></div>{missingOutcomeIssues.length > 0 && <button type="button" onClick={() => openInsightQueue("outcome")}>Capture the first outcome →</button>}</article></div></section>
        </>}

        {insightSection === "work" && shippedWall.length > 0 && <section className="insight-panel shipped-wall">
          <div className="insight-panel-head"><div><p className="eyebrow">THE SHIPPED WALL</p><h3>What you actually delivered</h3></div><span className="wall-count">{shippedWall.length} with an outcome</span></div>
          <p className="insight-note wall-note">Closed work where you wrote down what changed. This is the answer to &ldquo;what have you been doing?&rdquo; — in your own words, not a counter.</p>
          <div className="wall-grid">{shippedWall.map(issue => <button key={issue.id} type="button" className="wall-card" onClick={() => { setActiveId(issue.id); setShowDetail(true); }}>
            <strong>{issue.title}</strong>
            <p>{issue.outcome}</p>
            <small>{dateLabel(completedAtOf(issue))}</small>
          </button>)}</div>
        </section>}

        {insightSection === "memory" && <section className="memory-center memory-center-focused"><div className="memory-head"><div><p className="eyebrow">WHAT YOU LEARNED</p><h2>Keep what you worked out, not just the fact that it ended</h2><p>Previews stay short — links, addresses and long pasted text only appear once you open a record.</p></div><span>{resolvedIssues.length} closed out</span></div>{resolvedIssues.length ? <div className="memory-list">{resolvedIssues.map(issue => { const raw = issue.memory?.resolution || issue.outcome || "Nothing written down yet."; return <article key={issue.id}><div><strong>{issue.title}</strong><p>{safeMemoryPreview(raw)}</p></div><button type="button" onClick={() => openMemoryRecord(issue)}>{issue.memory?.resolution && issue.memory?.learning ? "Review" : "Write it down"} →</button></article>; })}</div> : <p className="memory-empty">Close something out and it will show up here, waiting for a line about how it went.</p>}</section>}

        {insightSection === "rhythm" && <section className="diary-insights diary-insights-focused">
          <div className="diary-insights-head"><div><p className="eyebrow">FROM YOUR DIARY</p><h2>Personal rhythm, on your terms<Petal className="title-petal" size={19}/></h2><p>Private, on-device patterns. Turn off any signal you do not want reflected here.</p></div>{diaryInsights && <button className="secondary" type="button" onClick={() => setSection("diary")}>Open the diary</button>}</div>
          <div className="privacy-controls" aria-label="Diary insight privacy controls">{([['mood','Mood patterns'],['themes','Recurring themes'],['words','Repeated words']] as const).map(([key,label]) => <button key={key} type="button" aria-pressed={diaryInsightPrefs[key]} className={diaryInsightPrefs[key] ? "is-on" : ""} onClick={() => setDiaryInsightPrefs(current => ({ ...current, [key]: !current[key] }))}><span>{diaryInsightPrefs[key] ? "✓" : ""}</span>{label}</button>)}</div>
          {diaryLocked ? <div className="diary-insights-empty"><span><Petal size={26}/></span><h3>Your diary is locked.</h3><p>Unlock it on the Diary page and these patterns come back with it.</p></div> : !diaryInsights ? <div className="diary-insights-empty"><span>✎</span><h3>Nothing to read yet.</h3><p>Write a few reflections and this fills up gently.</p></div> : <>
            <div className="insight-context"><span>{diaryInsights.entries.length < 8 || diaryInsights.daysWritten < 4 ? "Early pattern" : "Established pattern"}</span><span>{diaryInsights.entries.length} reflections across {diaryInsights.daysWritten} day{diaryInsights.daysWritten === 1 ? "" : "s"}</span></div>
            <div className="metric-row insight-metrics"><article><span>Reflections</span><strong>{diaryInsights.entries.length}</strong><small>Private pages on this device</small></article><article className={diaryInsights.currentStreak > 1 ? "good" : ""}><span>Writing streak</span><strong>{diaryInsights.currentStreak || "—"}</strong><small>Best run: {diaryInsights.longestStreak} day{diaryInsights.longestStreak === 1 ? "" : "s"}</small></article><article><span>Words written</span><strong>{diaryInsights.totalWords.toLocaleString()}</strong><small>{diaryInsights.averageWords} per page</small></article><article><span>Pages revisited</span><strong>{diaryInsights.revisited}</strong><small>Reflections you returned to</small></article></div>
            {diaryInsightPrefs.mood && <article className="insight-panel mood-ribbon-card"><div className="insight-panel-head"><div><p className="eyebrow">MOOD RIBBON</p><h3>Your last {diaryInsights.ribbon.length} pages</h3></div><span className={`mood-tag mood-${diaryInsights.topMood.value}`}>{diaryInsights.topMood.symbol} mostly {diaryInsights.topMood.label.toLowerCase()}</span></div><div className="mood-ribbon">{diaryInsights.ribbon.map(entry => <button key={entry.id} type="button" className={`ribbon-block mood-${entry.mood}`} aria-label={`${moodName(entry.mood)} on ${dateLabel(entry.at)}`} onClick={() => { setOpenDiaryId(entry.id); }}/>)}</div></article>}
            {diaryInsightPrefs.mood && pixels && <article className="insight-panel year-card">
              <div className="insight-panel-head">
                <div><p className="eyebrow">A YEAR IN PIXELS</p><h3>{pixelsWritten} day{pixelsWritten === 1 ? "" : "s"} written in {shownYear}</h3></div>
                {diaryYears.length > 1 && <div className="year-switch">{diaryYears.map(year => <button key={year} type="button" className={year === shownYear ? "is-selected" : ""} aria-pressed={year === shownYear} onClick={() => setPixelYear(year)}>{year}</button>)}</div>}
              </div>
              <div className="year-grid" role="img" aria-label={`Mood for each day of ${shownYear}. ${pixelsWritten} days written.`}>
                {pixels.map(row => <div className="year-row" key={row.month}>
                  <span className="year-month">{row.label}</span>
                  <div className="year-days">{row.days.map(day => day.entry
                    ? <button key={day.key} type="button" className={`year-pixel mood-${day.entry.mood} ${day.isToday ? "is-today" : ""}`} title={`${moodName(day.entry.mood)} · ${dateLabel(day.entry.at)}${day.entry.title ? ` · ${day.entry.title}` : ""}`} aria-label={`${moodName(day.entry.mood)} on ${dateLabel(day.entry.at)}`} onClick={() => { setOpenDiaryId(day.entry!.id); }}/>
                    : <span key={day.key} className={`year-pixel is-blank ${day.isToday ? "is-today" : ""} ${day.isFuture ? "is-future" : ""}`} aria-hidden="true"/>)}</div>
                </div>)}
              </div>
              <p className="insight-note">{pixelsWritten === 0 ? `Nothing written in ${shownYear} yet — each square fills in as you write.` : `Every square is a day. The gaps are days too — this is a record, not a scorecard.`}</p>
            </article>}
            <div className="insight-detail">
              {diaryInsightPrefs.themes && <article className="insight-panel"><p className="eyebrow">RECURRING THREADS</p><h3>What may be repeating</h3>{diaryInsights.themes.length ? <ul className="theme-bars">{diaryInsights.themes.map(theme => <li key={theme.label}><span className="theme-name">{theme.label}</span><span className="theme-track"><span style={{ width: `${Math.max(10, Math.round((theme.count / diaryInsights.entries.length) * 100))}%` }}/></span><em>{theme.count}</em></li>)}</ul> : <p>No thread has repeated yet.</p>}<p className="insight-note">{diaryInsights.entries.length < 8 || diaryInsights.daysWritten < 4 ? "This is an early observation, not a conclusion. A few more days of writing will make it more reliable." : "These are repeated themes in your own words, offered as prompts rather than conclusions."}</p></article>}
              {diaryInsightPrefs.words && <article className="insight-panel"><p className="eyebrow">REPEATED WORDS</p><h3>Language you return to</h3>{diaryInsights.words.length ? <div className="word-cloud">{diaryInsights.words.map(([word,count],index) => <span key={word} className="word-chip" style={{ fontSize: `${Math.round(20 - index * 1.2)}px` }} title={`${count} times`}>{word}</span>)}</div> : <p>No word has repeated enough to show yet.</p>}<p className="insight-note">Hidden by default because individual words can lose their meaning outside the page they came from.</p></article>}
            </div>
          </>}
        </section>}
      </section>}
      {section === "diary" && diaryLocked && <section className="diary-section"><div className="lock-screen"><span className="lock-mark"><Petal size={37}/></span><p className="eyebrow">LOCKED</p><h2>Your diary is closed.</h2><p>Enter the passphrase you set. It is not stored anywhere, so nobody — including this app — can open these pages without it.</p><form onSubmit={unlockDiary}><label>Passphrase<input type="password" autoComplete="current-password" value={lockPass} onChange={event => setLockPass(event.target.value)} required/></label><button className="primary" type="submit" disabled={lockBusy}>{lockBusy ? "Opening…" : "Unlock"}</button></form>{lockMessage && <p className="lock-message" role="status">{lockMessage}</p>}</div></section>}
      {section === "diary" && !diaryLocked && <section className="diary-section" style={diarySkin}><div className="diary-grid"><form className={`diary-composer paper-${diaryPaper}`} onSubmit={addDiaryEntry}><div><p className="eyebrow">TODAY&apos;S CHECK-IN</p><h2>What needs room today?</h2><p className="diary-copy">Write it exactly as it feels. This entry stays in this browser.</p></div><div className={`streak-banner ${diaryInsights?.currentStreak ? "" : "is-cold"}`}><span className="streak-flame" aria-hidden="true">{diaryInsights?.currentStreak ? <Petal size={20}/> : "✎"}</span><div><strong>{!diaryInsights ? "Your first page." : !diaryInsights.currentStreak ? "No run going." : diaryInsights.currentStreak === 1 ? "Day one." : `${diaryInsights.currentStreak} days running.`}</strong><small>{!diaryInsights ? "Write once and the streak starts at one." : !diaryInsights.currentStreak ? `Your longest was ${diaryInsights.longestStreak} day${diaryInsights.longestStreak === 1 ? "" : "s"}. Today can start the next one.` : wroteToday ? `Today is already on the page.${diaryInsights.currentStreak >= diaryInsights.longestStreak ? " This is your longest run yet." : ` Your best is ${diaryInsights.longestStreak} days.`}` : `Write today to keep it going.${diaryInsights.currentStreak >= diaryInsights.longestStreak ? " One more makes it your longest run." : ` Your best is ${diaryInsights.longestStreak} days.`}`}</small></div></div><fieldset className="mood-picker"><legend>How are you feeling?</legend>{moods.map(mood => <button key={mood.value} className={diaryMood === mood.value ? "mood-selected" : ""} type="button" aria-pressed={diaryMood === mood.value} onClick={() => setDiaryMood(mood.value)}><span>{mood.symbol}</span><small>{mood.label}</small></button>)}</fieldset><label>Give this moment a name <small>optional</small><input value={diaryTitle} onChange={event => setDiaryTitle(event.target.value)} placeholder="A short title…"/></label><div className="diary-prompt"><span>{writingPrompts[promptIndex]}</span><button type="button" onClick={() => setPromptIndex(index => (index + 1) % writingPrompts.length)} aria-label="Show another prompt">Another</button></div><label>Let it out<textarea className="diary-ruled" required value={diaryText} onChange={event => setDiaryText(event.target.value)} placeholder="What happened? What are you carrying? What do you wish you could say?"/></label>{linkableIssues.length > 0 && <div className="link-picker"><span>Is this about a task? <small>optional</small></span><div className="link-options">{linkableIssues.map(issue => <button key={issue.id} type="button" className={diaryLinks.includes(issue.id) ? "is-linked" : ""} aria-pressed={diaryLinks.includes(issue.id)} onClick={() => setDiaryLinks(current => current.includes(issue.id) ? current.filter(id => id !== issue.id) : [...current, issue.id])}>{issue.title}</button>)}</div></div>}<div className="diary-save"><span>Private on this device</span><button className="primary" type="submit">Save reflection</button></div></form><aside className="diary-companion"><span className="companion-mark"><Petal size={32}/></span><p className="eyebrow">YOUR DIARY</p><h2>At a glance</h2><p>A quiet record of the moments you have chosen to put into words.</p><div className="diary-stats"><div><strong>{diaryEntries.length}</strong><span>Total entries</span></div><div><strong>{diaryEntries.filter(entry => Date.now() - new Date(entry.at).getTime() < 604800000).length}</strong><span>Last 7 days</span></div><div><strong className="stat-best">{diaryInsights?.longestStreak ?? 0}</strong><span>Longest run</span></div></div>{lookBack && <button className="look-back" type="button" onClick={() => setOpenDiaryId(lookBack.entry.id)}><span className="eyebrow">{lookBack.label.toUpperCase()}</span><strong>{lookBack.entry.title || "Untitled reflection"}</strong><small>{moodName(lookBack.entry.mood)} · {dateLabel(lookBack.entry.at)}</small></button>}<small className="privacy-note">Your entries remain private and are only included in your encrypted or account-synced data.</small></aside></div><section className="diary-history"><div className="diary-history-heading"><div><p className="eyebrow">YOUR REFLECTIONS</p><h2>Recent entries</h2></div>{lockOn && <button className="secondary lock-now" type="button" onClick={lockDiaryNow}>Lock the diary</button>}<span>{diaryNeedle || diaryMoodFilter ? `${visibleDiary.length} of ${diaryEntries.length}` : `${diaryEntries.length} saved`}</span></div>
        <div className="diary-filters"><input type="search" value={diaryQuery} onChange={event => setDiaryQuery(event.target.value)} placeholder="Search your reflections…" aria-label="Search reflections"/><div className="mood-filter">{moods.map(option => <button key={option.value} type="button" className={`mood-tag mood-${option.value} ${diaryMoodFilter === option.value ? "is-chosen" : ""}`} aria-pressed={diaryMoodFilter === option.value} onClick={() => setDiaryMoodFilter(current => current === option.value ? "" : option.value)}>{option.symbol} {option.label}</button>)}{(diaryNeedle || diaryMoodFilter) && <button type="button" className="clear-filters" onClick={() => { setDiaryQuery(""); setDiaryMoodFilter(""); }}>Clear</button>}</div></div><div className="diary-entry-list">{visibleDiary.map(entry => { const mood = moods.find(item => item.value === entry.mood) || moods[2]; return <article className={`diary-entry diary-page paper-${diaryPaper}`} key={entry.id}><button className="diary-page-open" type="button" onClick={() => { setOpenDiaryId(entry.id); setEditingDiaryId(""); }}><span className="diary-entry-top"><span className={`mood-tag mood-${entry.mood}`}>{mood.symbol} {mood.label}</span><time>{dateLabel(entry.at)}{entry.updatedAt ? ` · edited ${dateLabel(entry.updatedAt)}` : ""}</time></span><span className="diary-page-title"><em className="page-number">Page {pageNumbers.get(entry.id) ?? 1}</em>{entry.title || "Untitled reflection"}</span><span className="diary-ruled diary-page-body">{entry.text}</span><span className="diary-page-more">Open page →</span></button></article>; })}{!visibleDiary.length && <div className="diary-empty"><span>✎</span><h3>{diaryEntries.length ? "Nothing matches that." : "Your diary is ready."}</h3><p>{diaryEntries.length ? "Try a different word, or clear the filters to see every page." : "Your first reflection will appear here with its mood and gentle next step."}</p></div>}</div></section></section>}
      {section === "review" && reviewWeek && review && <section className="review-page">
        <div className="review-toolbar">
          <div className={`review-nav ${review.isRecent ? "is-recent" : ""}`}>{!review.isRecent && <button type="button" aria-label="Previous week" onClick={() => setReviewWeek(week => addDays(week ?? new Date(), -7))}>‹</button>}<div><strong>{review.isRecent ? "Recent 7 days" : weekLabel(reviewWeek)}</strong><small>{review.isRecent ? weekLabel(new Date(review.from)) : review.isThisWeek ? "This week so far" : "A finished week"}</small></div>{!review.isRecent && <button type="button" aria-label="Next week" disabled={review.isThisWeek} onClick={() => setReviewWeek(week => addDays(week ?? new Date(), 7))}>›</button>}</div>
          <div className="review-actions"><button className="secondary" type="button" onClick={() => { setReviewRange(range => range === "calendar" ? "recent" : "calendar"); setReviewWeek(startOfWeek(new Date())); }}>{review.isRecent ? "Calendar week" : "Recent 7 days"}</button>{!review.isRecent && !review.isThisWeek && <button className="secondary" type="button" onClick={() => setReviewWeek(startOfWeek(new Date()))}>This week</button>}</div>
        </div>
        <div className="review-copy">
          <div className="review-copy-head"><div><p className="eyebrow">TAKE IT SOMEWHERE ELSE</p><h3>Copy your work as…</h3></div><label className="review-takeaway"><input type="checkbox" checked={reviewTakeaway} onChange={event => setReviewTakeaway(event.target.checked)}/><span>Include a takeaway line</span></label></div>
          <div className="review-copy-period" role="group" aria-label="How far back to cover">{([["week", "This week"], ["quarter", "This quarter"], ["year", "This year"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={copyPeriod === value} className={copyPeriod === value ? "is-chosen" : ""} onClick={() => setCopyPeriod(value)}>{label}</button>)}</div><div className="review-copy-choices"><button className="primary" type="button" onClick={() => copyReviewSummary("professional")}>Professional</button><button className="secondary" type="button" onClick={() => copyReviewSummary("personal")}>Personal</button><button className="secondary" type="button" onClick={() => copyReviewSummary("both")}>Both</button></div>
          <small>{copyPeriod === "week" ? "The professional one is written to be pasted straight into Teams or Slack. Your diary text is never in any of them." : "Over a longer stretch this is the record of what you delivered — what is next is left out, because nobody reads a to-do list in a review. Your diary text is never in any of them."}</small>
          {review.unsorted.length > 0 && <div className="review-unsorted"><p>{review.unsorted.length === 1 ? "One thing this week predates the professional/personal choice, so it only appears in the combined copy." : `${review.unsorted.length} things this week predate the professional/personal choice, so they only appear in the combined copy.`}</p><ul>{review.unsorted.map(issue => <li key={issue.id}><span>{issue.title}</span><span className="review-unsorted-actions">{laneOptions.map(option => <button key={option.value} type="button" onClick={() => setIssueLane(issue.id, option.value)}>{option.label}</button>)}</span></li>)}</ul></div>}
        </div>
        {reviewCopied && <p className="transfer-message" role="status">{reviewCopied}</p>}

        {review.carried.length > 0 && <article className="review-carried"><p className="eyebrow">YOU SAID LAST WEEK</p>{review.carried.map(line => <blockquote key={line}>“{line}.”</blockquote>)}<small>Your own words from the week before. Did it happen?</small></article>}

        <div className="review-columns">
          <article className="review-card shipped">
            <div className="review-card-head"><p className="eyebrow">SHIPPED</p><strong>{review.shipped.length}</strong></div>
            {review.shipped.length
              ? <ul>{review.shipped.map(issue => <li key={issue.id}><button type="button" onClick={() => { setActiveId(issue.id); setShowDetail(true); }}><span>{issue.title}</span>{issue.outcome && <small>{issue.outcome}</small>}</button></li>)}</ul>
              : <p className="review-empty">Nothing closed out this week. That is worth knowing too — it usually means the work was bigger than it looked.</p>}
          </article>

          <article className="review-card stalled">
            <div className="review-card-head"><p className="eyebrow">STALLED</p><strong>{review.stalled.length}</strong></div>
            {review.stalled.length
              ? <ul>{review.stalled.map(issue => <li key={issue.id}><button type="button" onClick={() => { setActiveId(issue.id); setShowDetail(true); }}><span>{issue.title}</span><small>{daysOverdue(issue)} day{daysOverdue(issue) === 1 ? "" : "s"} past its ETA{issue.followUpPeople.length ? ` · waiting on ${issue.followUpPeople.join(", ")}` : ""}</small></button></li>)}</ul>
              : <p className="review-empty">Nothing is past its ETA. Rare and worth noticing.</p>}
          </article>

          <article className="review-card logged">
            <div className="review-card-head"><p className="eyebrow">NEW THIS WEEK</p><strong>{review.logged.length}</strong></div>
            {review.logged.length
              ? <ul>{review.logged.slice(0, 8).map(issue => <li key={issue.id}><button type="button" onClick={() => { setActiveId(issue.id); setShowDetail(true); }}><span>{issue.title}</span><small>{issue.status}</small></button></li>)}{review.logged.length > 8 && <li className="review-more">and {review.logged.length - 8} more</li>}</ul>
              : <p className="review-empty">Nothing new landed on you this week.</p>}
          </article>
        </div>

        <div className="review-forward"><article className="review-card"><div className="review-card-head"><p className="eyebrow">NEXT WEEK’S PRIORITIES</p><strong>{review.priorities.length}</strong></div>{review.priorities.length ? <ol>{review.priorities.map(issue => <li key={issue.id}><button type="button" onClick={() => openIssueDetail(issue.id)}><span>{issue.title}</span><small>{isOverdue(issue) ? `${daysOverdue(issue)}d overdue` : issue.action || "Define the next action"}</small></button></li>)}</ol> : <p className="review-empty">No active work needs to carry forward.</p>}</article><article className="review-card"><div className="review-card-head"><p className="eyebrow">INTENTIONALLY DEFERRED</p><strong>{review.parkedIssues.length}</strong></div>{review.parkedIssues.length ? <ul>{review.parkedIssues.map(issue => <li key={issue.id}><button type="button" onClick={() => openIssueDetail(issue.id)}><span>{issue.title}</span><small>Parked during a daily check-in</small></button></li>)}</ul> : <p className="review-empty">Nothing was explicitly parked in a daily check-in.</p>}<small className="review-private-note">{review.checkIns.length} daily brief{review.checkIns.length === 1 ? "" : "s"} saved. Private capacity and notes stay out of copied summaries.</small></article></div>

        <article className="review-card review-garden"><div><p className="eyebrow">WEEK IN BLOOM</p><h2>{review.gardenStage === 4 ? "A full Signal Garden" : review.gardenStage ? "The week took root" : "A quiet patch"}</h2><p>{review.gardenStage === 4 ? "Work moved, loops closed, boundaries were set, and the personal side of the week had room too." : "The garden grows from focus moves, completed work, daily briefs, and reflections—not from being busy."}</p><div className="garden-milestones"><span className={review.focusMoves.length ? "is-grown" : ""}>Focus</span><span className={review.shipped.length ? "is-grown" : ""}>Shipped</span><span className={review.checkIns.length ? "is-grown" : ""}>Checked in</span><span className={review.pages.length ? "is-grown" : ""}>Reflected</span></div></div><SignalGarden stage={review.gardenStage} compact label={`This week’s Signal Garden is at stage ${review.gardenStage} of 4`}/></article>

        <article className="review-card review-feel">
          <div className="review-card-head"><p className="eyebrow">HOW THE WEEK FELT</p><strong>{review.pages.length} page{review.pages.length === 1 ? "" : "s"}</strong></div>
          {review.pages.length
            ? <>
              <div className="mood-ribbon">{review.pages.map(entry => <button key={entry.id} type="button" className={`ribbon-block mood-${entry.mood}`} title={`${moodName(entry.mood)} · ${dateLabel(entry.at)}`} aria-label={`${moodName(entry.mood)} on ${dateLabel(entry.at)}`} onClick={() => { setOpenDiaryId(entry.id); }}/>)}</div>
              <p className="review-feel-note">{review.feel === null ? "" : review.feel >= 1 ? "A good week on the page — mostly bright and calm." : review.feel > 0 ? "More light than heavy across the week." : review.feel === 0 ? "An even week: some lift, some weight." : review.feel > -0.6 ? "The week leaned heavy. Worth reading back before planning the next one." : "A hard week by your own account. Whatever you plan next, plan it for the person who wrote those pages."}</p>
              {review.owed.length > 0 && <div className="review-owed"><p className="eyebrow">IN YOUR OWN WORDS</p>{review.owed.map(line => <blockquote key={line}>“{line}.”</blockquote>)}</div>}
            </>
            : <p className="review-empty">No reflections this week. The work side of the review still stands, but the other half is missing.</p>}
        </article>
      </section>}
      {section === "settings" && <section className="settings-page" aria-labelledby="settings-page-title">
        <div className="settings-grid">
          <article className="settings-card">
            <p className="eyebrow">PROFILE</p><h2>Your workspace</h2>
            <form className="profile-settings-form" onSubmit={updateProfile}>
              <label className="settings-field">Your name<input name="name" required defaultValue={profile?.name || ""}/></label>
              <label className="settings-field">Your role<input name="role" required defaultValue={profile?.role || ""}/></label>
              <div className="settings-actions"><button className="secondary" type="button" onClick={replayOnboarding}>Replay onboarding</button><button className="primary" type="submit">Save profile</button></div>
            </form>
          </article>
          <article className="settings-card">
            <p className="eyebrow">APPEARANCE</p><h2 id="settings-page-title">Theme &amp; display</h2>
            <label className="settings-field">Theme<select value={theme} onChange={e => setTheme(e.target.value)}>{themes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <button className="settings-toggle" type="button" role="switch" aria-checked={darkMode} onClick={() => setDarkMode(value => !value)}><span><strong>Dark mode</strong><small>{darkMode ? "On" : "Off"}</small></span><span className={`switch-track ${darkMode ? "is-on" : ""}`} aria-hidden="true"/></button>
          </article>
          <article className="settings-card">
            <p className="eyebrow">DIARY</p><h2>Paper &amp; handwriting</h2>
            <p className="settings-copy">Choose the face you write in and the colour of the page. Both apply everywhere in the diary.</p>
            <label className="settings-field">Writing font<select value={diaryFont} onChange={event => setDiaryFont(event.target.value)}>{diaryFonts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="paper-picker"><span>Page colour</span><div className="paper-swatches">{diaryPapers.map(([value, label]) => <button key={value} type="button" className={`paper-swatch paper-${value} ${diaryPaper === value ? "is-chosen" : ""}`} aria-pressed={diaryPaper === value} aria-label={label} title={label} onClick={() => setDiaryPaper(value)}/>)}</div></div>
            <div className={`paper-preview diary-ruled paper-${diaryPaper}`} style={diarySkin} aria-hidden="true">Today felt long, but I got through it. Tomorrow I start with the one thing I keep pushing back.</div>
          </article>
          <article className="settings-card">
            <p className="eyebrow">PRIVACY</p><h2>Diary lock</h2>
            <p className="settings-copy">Without a lock, anything written in the diary can be read by anyone who opens this browser&apos;s developer tools on this computer.</p>
            <button className="settings-toggle" type="button" role="switch" aria-checked={lockOn} onClick={() => { setLockMessage(""); if (lockOn) removeDiaryLock(); else setShowLockSetup(true); }}><span><strong>Lock the diary with a passphrase</strong><small>{lockOn ? (diaryLocked ? "On — locked right now" : "On — unlocked for this session") : "Off"}</small></span><span className={`switch-track ${lockOn ? "is-on" : ""}`} aria-hidden="true"/></button>
            {lockOn && !diaryLocked && <button className="secondary" type="button" onClick={lockDiaryNow}>Lock it now</button>}
            {lockMessage && !showLockSetup && <p className="lock-message" role="status">{lockMessage}</p>}
          </article>
          <article className="settings-card">
            <p className="eyebrow">NOTIFICATIONS</p><h2>Reminders</h2>
            <p className="settings-copy">Get alerts for overdue work, items due within 24 hours, and your daily check-in.</p>
            <button className="settings-toggle" type="button" role="switch" aria-checked={remindersOn} onClick={toggleNotifications}><span><strong>Signal Petal notifications</strong><small>{notificationState}</small></span><span className={`switch-track ${remindersOn ? "is-on" : ""}`} aria-hidden="true"/></button>
            <div className="reminder-controls"><label>Daily check-in time<input type="time" value={reminderTime} onChange={event => setReminderTime(event.target.value)}/></label><button className="secondary" type="button" onClick={testNotifications}>Send test notification</button></div>
            <p className="reminder-explainer">{permission === "denied"
              ? "This browser is blocking notifications for this address. Open the icon beside the address bar, set Notifications to Allow, then reload — the switch above cannot override a browser block."
              : permission === "unsupported"
                ? "This browser has no Notification support, so reminders cannot be delivered here. Chrome, Edge, Firefox, and Safari all support them."
                : "Automatic checks run while Signal Petal is open. Use the test to confirm browser and system permissions."}</p>{reminderFeedback && <p className="reminder-feedback" role="status">{reminderFeedback}</p>}
          </article>
        </div>
        <article className="settings-card settings-wide">
          <p className="eyebrow">WORKFLOW</p><h2>Customize statuses</h2><p className="settings-copy">New, Ongoing, and your completion status stay in the workflow. Choose Resolved or Closed, set colors, and edit or remove every other status. Removed work moves to Ongoing.</p>
          <div className="status-list">{statusDraft.map((item, index) => <div className="status-row" key={item.id}>{item.kind === "terminal" ? <select aria-label="Completion status" value={item.name} onChange={e => { const name = e.target.value; setStatusDraft(items => items.map(draft => draft.id === item.id ? { ...draft, name } : draft)); setStatusError(""); }}><option>Resolved</option><option>Closed</option></select> : <input aria-label={`Status ${index + 1}`} value={item.name} disabled={item.kind === "new" || item.kind === "ongoing"} onChange={e => { const name = e.target.value; setStatusDraft(items => items.map(draft => draft.id === item.id ? { ...draft, name } : draft)); setStatusError(""); }}/>}<input className="status-color" type="color" aria-label={`Color for ${item.name}`} value={item.color} onChange={e => { const color = e.target.value; setStatusDraft(items => items.map(draft => draft.id === item.id ? { ...draft, color } : draft)); }}/>{item.kind ? <span className="status-lock">Required</span> : <button type="button" title="Remove status; matching issues will move to Ongoing" onClick={() => setStatusDraft(items => items.filter(draft => draft.id !== item.id))}>Remove</button>}</div>)}</div>
          <form className="status-add" onSubmit={addStatus}><input value={statusInput} onChange={e => { setStatusInput(e.target.value); setStatusError(""); }} placeholder="Add a new status" aria-label="New status name"/><button className="secondary" type="submit">+ Add</button></form>{statusError && <p className="status-error" role="alert">{statusError}</p>}<div className="settings-actions"><button className="primary" type="button" onClick={saveStatuses}>Save status changes</button></div>
        </article>
        <article className="settings-card settings-wide">
          <p className="eyebrow">CLOUD &amp; DATA</p><h2>Sync, export, or reset your data</h2><p className="settings-copy">Your signed-in account syncs automatically across devices. This browser also keeps an offline copy, and backups remain available for independent safekeeping.</p>
          <div className={`sync-status sync-${syncState}`} role="status" aria-live="polite"><span className="sync-dot" aria-hidden="true"/><div className="sync-status-copy"><strong>{syncState === "synced" ? "Cloud sync is on" : syncState === "syncing" ? "Syncing changes…" : syncState === "checking" ? "Checking cloud sync…" : syncState === "offline" ? "Offline — changes are saved on this device" : syncState === "signed-out" ? "Sign in to turn on cloud sync" : "Cloud sync needs attention"}</strong><small>{syncState === "synced" && lastSyncedAt ? `Signed in as ${syncAccount?.email || "your ChatGPT account"} · Last synced ${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(lastSyncedAt))}.` : syncState === "offline" ? `Signed in${syncAccount?.email ? ` as ${syncAccount.email}` : ""}. Sync will resume automatically when the connection returns.` : syncState === "signed-out" ? "Use a ChatGPT account to securely keep the same Signal Petal data on all your devices." : syncState === "error" ? "Your local copy is safe. Reload or try again when the service is available." : "Tasks, check-ins, workflow settings, and diary data are included."}</small>{syncState === "signed-out" && <><a className="sync-sign-in" href="/signin-with-chatgpt?return_to=%2F">Sign in with ChatGPT</a><small className="sync-account-help">You can sign into ChatGPT with Google, Microsoft, Apple, or an email address such as Yahoo or iCloud. Signal Petal does not access your email, Google Drive, or iCloud files.</small></>}</div></div>
          <div className="backup-file">
            <div className={`backup-status ${backupAge === null ? "never" : backupAge >= 14 ? "stale" : "fresh"}`}>
              <div><strong>{backupAge === null ? "No backup saved yet" : backupAge === 0 ? "Backed up today" : `Last backup ${backupAge} day${backupAge === 1 ? "" : "s"} ago`}</strong><small>{backupAge === null || backupAge >= 14 ? "Cloud sync protects your account data; a downloaded backup gives you an independent copy you control." : "Keep an occasional backup file for recovery outside the synced account."}</small></div>
              <button className="primary" type="button" onClick={downloadBackup}>Save backup file</button>
            </div>
            <div className="backup-status export-row"><div><strong>Open your work in a spreadsheet</strong><small>Every task with its dates, outcomes and notes, as a .csv. This one is for reading and sorting \u2014 the backup file above is the one that restores the app.</small></div><button className="secondary" type="button" onClick={() => saveCsvFile(issuesToCsv(issues))} disabled={!issues.length}>Save spreadsheet</button></div><div className="backup-restore"><div><strong>Merge from a backup file</strong><small>Keeps local data, updates matching records with the newest version, and adds missing records.</small></div><label className="file-button">Choose a backup file<input type="file" accept="application/json,.json" onChange={restoreFromFile}/></label></div>
          </div>
          <div className="data-settings-grid"><div className="transfer-section"><div><strong>Move to another browser</strong><small>A code you can paste into Signal Petal somewhere else. For keeping a copy, use the backup file above instead.</small></div><textarea className="transfer-code" readOnly value={transferCode} aria-label="Backup code"/><button className="secondary" type="button" onClick={copyTransferCode}>Copy backup code</button></div><div className="transfer-section"><div><strong>Merge into this address</strong><small>Matching records keep the latest version; records that are not here yet are added.</small></div><textarea className="transfer-code" value={importCode} onChange={e => setImportCode(e.target.value)} placeholder="Paste a backup code here" aria-label="Backup code to import"/><div className="transfer-actions"><button className="secondary" type="button" onClick={pasteTransferCode}>Paste code</button><button className="primary" type="button" disabled={!importCode.trim()} onClick={importTransfer}>Import and merge</button></div></div></div>{transferMessage && <p className="transfer-message" role="status">{transferMessage}</p>}
          <div className="danger-zone"><div><strong>Reset account</strong><small>Permanently deletes cloud and device data, including tasks, diary entries, check-ins, preferences, and test data. Your sign-in itself is not deleted.</small></div><button className="delete" type="button" onClick={() => { setResetConfirmation(""); setShowResetAccount(true); }}>Reset account…</button></div>{syncMessage && <p className="status-error" role="alert">{syncMessage}</p>}
        </article>
      </section>}
    </section>
    {showResetAccount && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !resetBusy) setShowResetAccount(false); }}><section className="confirm-card reset-card" role="dialog" aria-modal="true" aria-labelledby="reset-account-title"><p className="eyebrow">PERMANENT ACTION</p><h2 id="reset-account-title">Reset this account?</h2><p>This deletes every Signal Petal record from the cloud and this device. It cannot be undone. Download a backup first if there is anything you may need.</p><label>Type <strong>RESET</strong> to continue<input data-autofocus value={resetConfirmation} onChange={event => setResetConfirmation(event.target.value)} autoComplete="off"/></label><div className="confirm-actions"><button className="secondary" type="button" disabled={resetBusy} onClick={() => setShowResetAccount(false)}>Cancel</button><button className="delete" type="button" disabled={resetConfirmation !== "RESET" || resetBusy} onClick={resetAccount}>{resetBusy ? "Resetting…" : "Delete all data"}</button></div></section></div>}
    {showDetail && active && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closeIssueDetail(); }}><section className="detail detail-modal" role="dialog" aria-modal="true" aria-labelledby="issue-detail-title"><button className="close" type="button" aria-label="Close issue details" onClick={closeIssueDetail}>×</button><div className="detail-title"><div className="detail-heading-fields"><label>Title<input id="issue-detail-title" value={active.title} onChange={e => updateIssue({ title: e.target.value })}/></label><label>Details<textarea value={active.details} onChange={e => updateIssue({ details: e.target.value })}/></label></div><div className="detail-actions"><label>Status<select value={active.status} onChange={e => updateIssue({ status: e.target.value })}>{statuses.map(s => <option key={s}>{s}</option>)}</select></label>{active.archivedAt ? <button className="secondary" type="button" onClick={() => restoreIssue(active)}>Restore issue</button> : isCompleteStatus(active.status) ? <button className="secondary" type="button" onClick={() => archiveIssue(active)}>Archive issue</button> : null}<button className="delete" type="button" onClick={() => setShowDeleteConfirm(true)}>Delete issue</button></div></div>{previousRound && <div className="round-before"><div><p className="eyebrow">LAST TIME ROUND</p><strong>{dateLabel(completedAtOf(previousRound))}</strong><p>{previousNote || "Nothing was written down last time."}</p></div><button className="secondary" type="button" onClick={() => openIssueDetail(previousRound.id)}>Open that one →</button></div>}<div className="detail-grid"><div className="field lane-field"><span>Professional or personal</span><div className="link-options">{laneOptions.map(option => <button key={option.value} type="button" className={active.lane === option.value ? "is-linked" : ""} aria-pressed={active.lane === option.value} onClick={() => updateIssue({ lane: option.value })}>{option.label}</button>)}</div><small>{active.lane ? "" : "This one predates the choice. Pick one \u2014 until you do it only appears in the combined weekly summary."}</small></div><div className="field"><span>Priority</span><select value={active.priority || "medium"} onChange={e => updateIssue({ priority: e.target.value as Issue["priority"] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div><div className="field"><span>Category</span><input value={active.category || ""} onChange={e => updateIssue({ category: e.target.value })} placeholder="e.g. Reliability, Admin"/></div><div className="field"><span>Primary owner</span><input key={active.id} defaultValue={active.owner} onChange={onOwnerInput} onBlur={e => changeOwner(e.target.value)}/></div><div className="field"><span>Does this come round again?</span><select value={repeatKey(active.repeat)} onChange={event => updateIssue({ repeat: repeatChoices.find(choice => repeatKey(choice.value) === event.target.value)?.value })}>{repeatChoices.map(choice => <option key={repeatKey(choice.value) || "once"} value={repeatKey(choice.value)}>{choice.label}</option>)}</select><small>{active.repeat ? "When you close this out, the next one opens on its own \u2014 counted from the date below, so the rhythm holds even if you finish late." : ""}</small></div><div className="field"><span>Expected update / done</span><input type="datetime-local" value={active.expected} onChange={e => updateIssue({expected:e.target.value})}/></div><div className="field wide people-field"><span>Follow-up people</span>{active.followUpPeople.length > 0 && <div className="people-chips">{active.followUpPeople.map(person => <span className="person-chip" key={person}>{person}<button type="button" aria-label={`Remove ${person}`} onClick={() => removeActiveFollowUp(person)}>×</button></span>)}</div>}<div className="people-add"><input value={followUpInput} onChange={e => onNameInput(e, setFollowUpInput)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addActiveFollowUps(); } }} placeholder="Add names, separated by commas" aria-label="Follow-up people to add"/><button className="secondary" type="button" onClick={addActiveFollowUps}>+ Add people</button></div><small>These names help you track who needs a follow-up; no notifications are sent.</small></div><div className="field wide"><span>What they’re doing / my current action</span><textarea value={active.action} onChange={e => updateIssue({action:e.target.value})}/></div><div className="field wide"><span>Outcome</span><textarea placeholder="Capture the resolution, learning, or impact…" value={active.outcome} onChange={e => updateIssue({outcome:e.target.value})}/></div></div>{!diaryLocked && diaryEntries.some(entry => (entry.issueIds ?? []).includes(active.id)) && <div className="issue-reflections"><div className="issue-reflections-head"><p className="eyebrow">FROM YOUR DIARY</p><small>Only you can see this.</small></div>{diaryEntries.filter(entry => (entry.issueIds ?? []).includes(active.id)).map(entry => { const mood = moods.find(item => item.value === entry.mood) || moods[2]; return <button key={entry.id} type="button" onClick={() => { setShowDetail(false); setOpenDiaryId(entry.id); }}><span className={`mood-tag mood-${entry.mood}`}>{mood.symbol} {mood.label}</span><strong>{entry.title || "Untitled reflection"}</strong><small>{dateLabel(entry.at)}</small></button>; })}</div>}<div className="timeline"><div className="timeline-heading"><h3>Update timeline</h3><span>{active.updates.length} entries</span></div>{active.updates.map(entry => <div className="timeline-entry" key={entry.id}><div className="timeline-dot"/><div><strong>{entry.author}</strong><time>{dateLabel(entry.at)}</time><p>{entry.text}</p></div></div>)}<form className="update-form" onSubmit={addUpdate}><input name="update" placeholder="Add your update, decision, or next step…" aria-label="New update"/><button className="primary">Add update</button></form></div><div className="detail-save-actions"><button className="primary" type="button" onClick={closeIssueDetail}>Save changes</button></div></section></div>}
    {openEntry && (() => {
      const mood = moods.find(item => item.value === openEntry.mood) || moods[2];
      const drafting = editingDiaryId === openEntry.id;
      const trail = diaryLog.filter(event => event.entryId === openEntry.id);
      const close = () => { setOpenDiaryId(""); setEditingDiaryId(""); };
      return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }} style={diarySkin}>
        <section className={`diary-open paper-${diaryPaper}`} role="dialog" aria-modal="true" aria-labelledby="diary-open-title">
          <button className="close" type="button" aria-label="Close this page" onClick={close}>×</button>
          <div className="diary-open-head"><em className="page-number">Page {pageNumbers.get(openEntry.id) ?? 1}</em><span className={`mood-tag mood-${drafting ? editDraft.mood : openEntry.mood}`}>{(drafting ? moods.find(item => item.value === editDraft.mood) || mood : mood).symbol} {(drafting ? moods.find(item => item.value === editDraft.mood) || mood : mood).label}</span><time>{dateLabel(openEntry.at)}{openEntry.updatedAt ? ` · edited ${dateLabel(openEntry.updatedAt)}` : ""}</time></div>
          {drafting
            ? <form className="diary-entry-edit" onSubmit={event => saveDiaryEdit(event, openEntry)}><fieldset className="mood-picker mood-picker-compact"><legend>Mood</legend>{moods.map(option => <button key={option.value} className={editDraft.mood === option.value ? "mood-selected" : ""} type="button" aria-pressed={editDraft.mood === option.value} onClick={() => setEditDraft(draft => ({ ...draft, mood: option.value }))}><span>{option.symbol}</span><small>{option.label}</small></button>)}</fieldset><label>Title <small>optional</small><input value={editDraft.title} onChange={event => setEditDraft(draft => ({ ...draft, title: event.target.value }))} placeholder="A short title…"/></label><div className="link-picker"><span>Linked tasks</span><div className="link-options">{linkableIssues.map(issue => <button key={issue.id} type="button" className={editDraft.issueIds.includes(issue.id) ? "is-linked" : ""} aria-pressed={editDraft.issueIds.includes(issue.id)} onClick={() => setEditDraft(draft => ({ ...draft, issueIds: draft.issueIds.includes(issue.id) ? draft.issueIds.filter(id => id !== issue.id) : [...draft.issueIds, issue.id] }))}>{issue.title}</button>)}</div></div><label>Reflection<textarea className="diary-ruled" required value={editDraft.text} onChange={event => setEditDraft(draft => ({ ...draft, text: event.target.value }))}/></label><div className="diary-entry-actions"><button className="primary" type="submit">Save changes</button><button className="secondary" type="button" onClick={cancelDiaryEdit}>Cancel</button></div></form>
            : <><h2 id="diary-open-title" className="diary-open-title">{openEntry.title || "Untitled reflection"}</h2><div className="diary-ruled diary-open-body">{openEntry.text}</div>{(openEntry.issueIds ?? []).length > 0 && <div className="entry-links"><span>About</span><div>{(openEntry.issueIds ?? []).map(id => { const issue = issues.find(item => item.id === id); return issue ? <button key={id} type="button" onClick={() => { setOpenDiaryId(""); setActiveId(id); setShowDetail(true); }}>{issue.title}</button> : null; })}</div></div>}{trail.length > 0 && <ul className="entry-trail">{trail.map(event => <li key={event.id}><strong>{diaryEventLabel(event.action)}</strong> {dateLabel(event.at)} <span>{event.detail}</span></li>)}</ul>}<div className="diary-entry-actions"><button type="button" onClick={() => startDiaryEdit(openEntry)}>Edit</button><button type="button" className="entry-delete" onClick={() => setConfirmDiaryDelete(openEntry.id)}>Delete</button></div></>}
        </section>
      </div>;
    })()}
    {showDailyCheckIn && <div className="modal-backdrop daily-check-in-v2-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowDailyCheckIn(false); }}>
      <form className="daily-check-in-modal-v2" onSubmit={saveDailyCheckIn} role="dialog" aria-modal="true" aria-labelledby="daily-check-in-title-v2">
        <button className="close" type="button" aria-label="Close daily check-in" onClick={() => setShowDailyCheckIn(false)}>×</button>
        {checkInStep < 3 && <><div className="check-in-heading"><p className="eyebrow">TWO-MINUTE WRAP-UP</p><h2 id="daily-check-in-title-v2">{["Review today","Make the boundary","Set up tomorrow"][checkInStep]}</h2><p>{["Start with what changed, then plan with the capacity you actually have.","Choose only what can genuinely wait and give it a date to return.","Leave one clear first move so tomorrow starts without rereading the whole queue."][checkInStep]}</p></div><div className="check-in-steps" aria-label={`Step ${checkInStep + 1} of 3`}>{[0,1,2].map(step => <span key={step} className={step <= checkInStep ? "is-active" : ""}><b>{step + 1}</b>{["Review","Decide","Tomorrow"][step]}</span>)}</div></>}

        {checkInStep === 0 && <div className="check-in-stage"><div className="check-in-facts"><div><strong>{completedToday.length}</strong><span>completed today</span></div><div className={overdueCount ? "needs-care" : ""}><strong>{overdueCount}</strong><span>currently overdue</span></div><div><strong>{openCount}</strong><span>still open</span></div></div>{previousCheckIn && <div className="check-in-change"><span>Since your last brief</span><strong>{completedToday.length ? `${completedToday.length} loop${completedToday.length === 1 ? "" : "s"} closed today` : "The queue is still waiting for movement"}</strong><small>Last capacity: {previousCheckIn.capacity === "high" ? "strong" : previousCheckIn.capacity === "low" ? "limited" : "steady"}</small></div>}<fieldset className="capacity-picker"><legend>What capacity are you planning with?</legend><p>Private in Signal Petal and never included in copied work summaries.</p><div>{([['high','Strong','Room for demanding work'],['steady','Steady','A normal, focused load'],['low','Limited','Protect the essentials']] as const).map(([value,label,copy]) => <button key={value} type="button" className={checkInCapacity === value ? "is-selected" : ""} aria-pressed={checkInCapacity === value} onClick={() => setCheckInCapacity(value)}><strong>{label}</strong><small>{copy}</small></button>)}</div></fieldset></div>}

        {checkInStep === 1 && <div className="check-in-stage">{parkableIssues.length ? <fieldset className="park-picker-v2"><legend>What can intentionally wait?</legend><p>The most urgent work is shown first. Selected items return on one shared date, which updates their expected time and keeps Insights honest.</p><div>{parkableIssues.slice(0, checkInShowAll ? parkableIssues.length : 5).map(issue => <label key={issue.id}><input type="checkbox" checked={checkInParked.includes(issue.id)} onChange={() => setCheckInParked(ids => ids.includes(issue.id) ? ids.filter(id => id !== issue.id) : [...ids, issue.id])}/><span><strong>{issue.title}</strong><small>{isOverdue(issue) ? `${daysOverdue(issue)}d overdue` : issue.expected ? dateLabel(issue.expected) : "No expectation set"} · {issue.owner}</small></span></label>)}</div>{parkableIssues.length > 5 && <button className="show-all-work" type="button" onClick={() => setCheckInShowAll(value => !value)}>{checkInShowAll ? "Show the priority five" : `Show all ${parkableIssues.length} active items`}</button>}</fieldset> : <div className="check-in-clear"><Petal size={30}/><strong>The queue is clear.</strong><p>There is nothing to defer tonight.</p></div>}{checkInParked.length > 0 && <label className="resume-field">Bring these back on<input type="datetime-local" min={checkInResumeMinimum} value={checkInResumeAt} onChange={event => setCheckInResumeAt(event.target.value)} required/><small>This becomes the new expected update for {checkInParked.length} selected item{checkInParked.length === 1 ? "" : "s"}.</small></label>}</div>}

        {checkInStep === 2 && <div className="check-in-stage tomorrow-stage"><label>Today’s win <small>optional</small><input value={checkInWin} onChange={event => setCheckInWin(event.target.value)} placeholder="What moved or became clearer?"/></label><label>Tomorrow’s first move <small>recommended</small><textarea value={checkInTomorrowMove} onChange={event => setCheckInTomorrowMove(event.target.value)} placeholder="The first concrete action you want waiting for you…"/></label><label>Anything else tomorrow-you should know? <small>optional</small><textarea value={checkInNote} onChange={event => setCheckInNote(event.target.value)} placeholder="A decision, constraint, or useful context…"/></label><div className="check-in-preview"><p className="eyebrow">YOUR BRIEF WILL CAPTURE</p><span>{completedToday.length} completed · {overdueCount} overdue · {checkInParked.length} deferred · {checkInCapacity} capacity{checkInTomorrowMove.trim() ? " · first move ready" : ""}</span></div></div>}

        {checkInStep === 3 && checkInSaved && <div className="check-in-receipt" role="status"><span className="receipt-mark"><Petal size={34}/></span><p className="eyebrow">DAILY BRIEF SAVED</p><h2>Tomorrow has a starting point.</h2><p>{checkInParked.length ? `${checkInParked.length} item${checkInParked.length === 1 ? " was" : "s were"} deferred to ${dateLabel(checkInResumeAt)}.` : "Nothing was pushed aside without a decision."}</p>{checkInTomorrowMove.trim() && <blockquote>{checkInTomorrowMove.trim()}</blockquote>}<div className="check-in-actions"><button className="secondary" type="button" onClick={() => { setCheckInStep(0); setCheckInSaved(false); }}>Edit brief</button><button className="primary" type="button" onClick={() => setShowDailyCheckIn(false)}>Done</button></div></div>}

        {checkInStep < 3 && <div className="check-in-actions check-in-nav">{checkInStep > 0 ? <button className="secondary" type="button" onClick={() => setCheckInStep(step => step - 1)}>Back</button> : <button className="secondary" type="button" onClick={() => setShowDailyCheckIn(false)}>Cancel</button>}<button className="primary" type={checkInStep === 2 ? "submit" : "button"} onClick={checkInStep < 2 ? () => setCheckInStep(step => step + 1) : undefined}>{checkInStep === 2 ? todayCheckIn ? "Update daily brief" : "Save daily brief" : "Continue"}</button></div>}
        {checkInStep < 3 && dailyCheckIns.length > 0 && <div className="check-in-history-toggle"><button type="button" onClick={() => setShowCheckInHistory(value => !value)}>{showCheckInHistory ? "Hide previous briefs" : "View previous briefs"}</button>{showCheckInHistory && <div className="check-in-history">{dailyCheckIns.slice(0,3).map(checkIn => <article key={checkIn.id}><time>{dateLabel(checkIn.at)}</time><p>{clip(checkIn.brief, 220)}</p></article>)}</div>}</div>}
      </form>
    </div>}
    {showCommandPalette && <CommandPalette query={commandQuery} items={commandItems} cursor={commandCursor} onQueryChange={value => { setCommandQuery(value); setCommandIndex(0); }} onCursorChange={setCommandIndex} onKeyDown={walkCommands} onClose={() => setShowCommandPalette(false)}/>}
    {showOnboarding && profile && <OnboardingDialog step={onboardingStep} onStepChange={setOnboardingStep} onFinish={finishOnboarding}/>}
    {memoryIssue && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setMemoryIssueId(""); }}><form className="memory-modal" onSubmit={saveOperationalMemory} role="dialog" aria-modal="true" aria-labelledby="memory-title"><button className="close" type="button" aria-label="Close this record" onClick={() => setMemoryIssueId("")}>×</button><p className="eyebrow">WHAT YOU LEARNED</p><h2 id="memory-title">{memoryIssue.title}</h2><p className="memory-modal-copy">{memoryIssue.lane === "professional" ? "Write it so a colleague would follow it too \u2014 this is what the professional weekly summary draws on." : memoryIssue.lane === "personal" ? "A line or two is plenty. None of this goes into anything you paste into a work chat." : "Two boxes are enough. Write it so that future you recognises this faster next time."}</p><label>What finally worked<textarea name="resolution" defaultValue={memoryIssue.memory?.resolution ?? memoryIssue.outcome} placeholder={memoryIssue.lane === "professional" ? "What actually ended it \u2014 the change, the decision, or the person who unblocked it." : "What actually ended it?"} required/></label>{memoryIssue.lane === "professional" && <label>How you’d say this outside the team <small>optional</small><textarea name="shareable" defaultValue={memoryIssue.memory?.shareable ?? ""} placeholder="One line a colleague could read cold. The professional summary uses this instead of the title."/></label>}<label>What you’d tell yourself next time<textarea name="learning" defaultValue={memoryIssue.memory?.learning ?? ""} placeholder={memoryIssue.lane === "professional" ? "What to repeat, change or avoid \u2014 written so it still makes sense to someone who was not there." : "What to repeat, change, or avoid."} required/></label><button className="memory-more" type="button" aria-expanded={memoryDetail} aria-controls="memory-extra" onClick={() => setMemoryDetail(open => !open)}>{memoryDetail ? "− Hide the extra detail" : "+ Add more detail"}</button><div className="memory-extra" id="memory-extra" hidden={!memoryDetail}><label>What was going on<textarea name="symptoms" defaultValue={memoryIssue.memory?.symptoms ?? memoryIssue.details} placeholder={memoryIssue.lane === "professional" ? "What was happening, who or what it was holding up, and for how long." : "What was happening, and who or what it affected."}/></label><label>What was actually behind it<textarea name="rootCause" defaultValue={memoryIssue.memory?.rootCause ?? ""} placeholder={memoryIssue.lane === "professional" ? "What was really behind it, not just the first thing that was tried." : "Why it happened, once you knew."}/></label><label>Anything to keep an eye on<textarea name="followUp" defaultValue={memoryIssue.memory?.followUp ?? ""} placeholder={memoryIssue.lane === "professional" ? "What still needs watching, and who is on it." : "Something to check again later, or a change worth making."}/></label></div><div className="check-in-actions"><button className="secondary" type="button" onClick={() => setMemoryIssueId("")}>Cancel</button><button className="primary" type="submit">Save what you learned</button></div></form></div>}
    {confirmEntry && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setConfirmDiaryDelete(""); }}>
      <section className="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-diary-title">
        <h2 id="confirm-diary-title">Delete this reflection?</h2>
        <p>“{confirmEntry.title || "Untitled reflection"}” from {dateLabel(confirmEntry.at)}. Its place in your calendar and insights goes with it. You will get a short window to undo.</p>
        <div className="confirm-actions"><button className="secondary" type="button" onClick={() => setConfirmDiaryDelete("")}>Keep it</button><button className="delete" type="button" onClick={() => deleteDiaryEntry(confirmEntry)}>Delete</button></div>
      </section>
    </div>}
    {win && !undo && <div className="undo-bar is-win" role="status"><span className="win-mark" aria-hidden="true">✓</span><span className="win-copy"><strong>{clip(win.title, 46)} is done.</strong><small>{win.span} from logged to closed{completedToday.length > 1 ? ` · ${completedToday.length} closed today` : ""}</small></span><button className="undo-dismiss" type="button" aria-label="Dismiss" onClick={() => setWin(null)}>×</button></div>}
    {undo && <div className="undo-bar" role="status"><span>{undo.label}</span><button type="button" onClick={() => { undo.restore(); setUndo(null); }}>Undo</button><button className="undo-dismiss" type="button" aria-label="Dismiss" onClick={() => setUndo(null)}>×</button></div>}
    {showLockSetup && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowLockSetup(false); }}>
      <form className="confirm-card lock-setup" onSubmit={enableDiaryLock} role="dialog" aria-modal="true" aria-labelledby="lock-setup-title">
        <h2 id="lock-setup-title">Lock the diary</h2>
        <p>Your reflections will be encrypted on this computer with a key made from this passphrase. The key is never saved.</p>
        <p className="lock-warning"><strong>There is no recovery.</strong> Forget the passphrase and these pages are gone for good — not by me, not by anyone. Write it down somewhere safe before you continue.</p>
        <label>Passphrase <small>at least 8 characters</small><input type="password" autoComplete="new-password" value={lockPass} onChange={event => setLockPass(event.target.value)} required minLength={8}/></label>
        <label>Type it again<input type="password" autoComplete="new-password" value={lockConfirm} onChange={event => setLockConfirm(event.target.value)} required/></label>
        <label className="lock-check"><input type="checkbox" checked={lockUnderstood} onChange={event => setLockUnderstood(event.target.checked)}/><span>I understand that losing this passphrase means losing the diary.</span></label>
        {lockMessage && <p className="lock-message" role="status">{lockMessage}</p>}
        <div className="confirm-actions"><button className="secondary" type="button" onClick={() => { setShowLockSetup(false); setLockMessage(""); }}>Cancel</button><button className="primary" type="submit" disabled={lockBusy}>{lockBusy ? "Locking…" : "Lock the diary"}</button></div>
      </form>
    </div>}
    {showCreate && <div className="modal-backdrop" role="presentation"><form className="modal" onSubmit={addIssue} role="dialog" aria-modal="true" aria-labelledby="create-title"><button className="close" type="button" aria-label="Close this form" onClick={() => setShowCreate(false)}>×</button><p className="eyebrow">NEW WORK ITEM</p><h2 id="create-title">Log/Track</h2><label>Title<input required name="title" placeholder="What needs attention?"/></label><label>Starting status<select name="status" defaultValue="New">{statuses.map(status => <option key={status}>{status}</option>)}</select></label><div className="link-picker lane-picker"><span>Professional or personal?</span><div className="link-options">{laneOptions.map(option => <button key={option.value} type="button" className={newLane === option.value ? "is-linked" : ""} aria-pressed={newLane === option.value} onClick={() => setNewLane(option.value)}>{option.label}</button>)}</div><small>{newLane === "professional" ? "Closing this out will ask for a little more, and it can go in the professional weekly summary." : newLane === "personal" ? "Closing this out stays short, and it stays out of anything you paste into a work chat." : "Pick one. Every task is one or the other, and it decides which weekly summary this one turns up in."}</small></div><label>Details<textarea name="details" placeholder="Context, impact, links, and useful clues…"/></label><div className="form-grid"><label>Priority<select name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Category<input name="category" placeholder="e.g. Reliability, Admin"/></label></div><div className="form-grid"><label>Primary owner<input name="owner" placeholder={personalOwner} onChange={onOwnerInput}/></label><label>Expected update<input name="expected" type="datetime-local"/></label></div><div className="people-field"><span>Follow-up people</span>{newFollowUps.length > 0 && <div className="people-chips">{newFollowUps.map(person => <span className="person-chip" key={person}>{person}<button type="button" aria-label={`Remove ${person}`} onClick={() => setNewFollowUps(items => items.filter(name => name !== person))}>×</button></span>)}</div>}<div className="people-add"><input value={newFollowUpInput} onChange={e => onNameInput(e, setNewFollowUpInput)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNewFollowUps(); } }} placeholder="Add names, separated by commas" aria-label="Follow-up people to add"/><button className="secondary" type="button" onClick={addNewFollowUps}>+ Add people</button></div><small>Optional. These people will only be tracked inside this issue.</small></div><label>Current action<textarea name="action" placeholder="What are they—or you—doing next?"/></label><button className="primary create" type="submit" disabled={!newLane}>{newLane ? "Create issue" : "Choose professional or personal first"}</button></form></div>}
    {showDeleteConfirm && active && <div className="modal-backdrop confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description"><span className="confirm-icon">!</span><h2 id="delete-title">Delete this issue?</h2><p id="delete-description">“{active.title}” and its update history will be permanently removed.</p><div className="confirm-actions"><button className="secondary" type="button" data-autofocus onClick={() => setShowDeleteConfirm(false)}>Keep issue</button><button className="danger" type="button" onClick={deleteIssue}>Delete issue</button></div></section></div>}
    {hydrated && !profile && <div className="profile-backdrop"><form className="profile-card" onSubmit={saveProfile} role="dialog" aria-modal="true" aria-labelledby="setup-title"><span className="profile-mark"><Petal size={31}/></span><p className="eyebrow">WELCOME TO SIGNAL PETAL</p><h1 id="setup-title">Let&apos;s make this yours.</h1><p>Tell us a little about yourself and we&apos;ll personalize your workspace. This stays only in this browser.</p><label>Your name<input required name="name" data-autofocus placeholder="e.g. Aesi"/></label><label>Your role<input required name="role" placeholder="e.g. Site Reliability Engineer"/></label><button className="primary" type="submit">Create my workspace</button><div className="profile-restore"><span>Coming back after losing your data?</span><label className="file-button">Restore from a backup file<input type="file" accept="application/json,.json" onChange={restoreFromFile}/></label>{transferMessage && <small role="status">{transferMessage}</small>}</div></form></div>}
  </main>;
}
