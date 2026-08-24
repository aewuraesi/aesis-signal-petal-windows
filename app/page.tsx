"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

type Status = string;
type Entry = { id: string; at: string; text: string; author: string };
type Profile = { name: string; role: string };
type Mood = "bright" | "calm" | "okay" | "low" | "anxious" | "frustrated";
type DiaryEntry = {
  id: string; at: string; title: string; text: string; mood: Mood; suggestion: string; updatedAt?: string;
  suggestionTried?: boolean; suggestionHelpful?: boolean;
};
type DiaryAction = "created" | "edited" | "deleted";
/* Diary events live in their own list rather than on the entry, so the record of a
   reflection having existed — and been reworked — survives deleting the entry itself. */
type DiaryEvent = { id: string; entryId: string; at: string; action: DiaryAction; title: string; mood: Mood; detail: string };
type InsightRange = "7d" | "30d" | "90d" | "all";
type StatusDraft = { id: string; name: string; color: string; original?: string; kind?: "new" | "ongoing" | "terminal" };
type TransferPayload = { version: 1; issues: Issue[]; statuses: Status[]; statusColors: Record<string, string>; diaryEntries?: DiaryEntry[]; diaryLog?: DiaryEvent[] };
type MetricFocus = "home-open" | "home-overdue" | "home-resolved" | "mine-open" | "mine-overdue" | "mine-resolved" | "mine-total" | "attention-overdue" | "attention-oldest" | "attention-owners" | "attention-first";
type Issue = {
  id: string; title: string; details: string; owner: string; action: string;
  expected: string; createdAt: string; completedAt?: string; statusChangedAt?: string; status: Status; outcome: string; followUpPeople: string[]; updates: Entry[];
};

const defaultStatuses: Status[] = ["New", "Ongoing", "Waiting on dev", "Investigating", "Blocked", "Pending Monitoring", "Awaiting approval", "Resolved"];
const defaultStatusColors: Record<string, string> = {
  New: "#715391", Ongoing: "#647a3e", "Waiting on dev": "#9b6519", Investigating: "#a03e74",
  Blocked: "#bd415e", "Pending Monitoring": "#407d78", "Awaiting approval": "#41658e", Resolved: "#4f7b54", Closed: "#4f7b54",
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
const seed: Issue[] = [
  { id: "seed-1", title: "Checkout API latency spike", details: "p95 latency increased after the morning deploy. Watching the payments dependency.", owner: "Maya Chen", action: "Comparing traces and rolling back the feature flag if confirmed.", expected: "2026-08-13T16:30", createdAt: "2026-08-13T11:10", status: "Investigating", outcome: "", followUpPeople: [], updates: [{ id: "u1", at: "2026-08-13T11:10", author: "You", text: "Opened incident bridge and shared dashboard links." }, { id: "u2", at: "2026-08-13T12:05", author: "Maya Chen", text: "Trace points to a connection-pool regression; testing a flag rollback." }] },
  { id: "seed-2", title: "Kafka consumer lag", details: "Lag is building in the customer-events consumer group.", owner: "Jordan Lee", action: "Increasing partition concurrency and checking dead-letter volume.", expected: "2026-08-13T14:00", createdAt: "2026-08-13T09:25", status: "Waiting on dev", outcome: "", followUpPeople: [], updates: [{ id: "u3", at: "2026-08-13T09:25", author: "You", text: "Captured consumer metrics and assigned follow-up." }] },
  { id: "seed-3", title: "Certificate renewal runbook", details: "Document and validate the renewal sequence before the next rotation.", owner: "You", action: "Drafting the runbook and scheduling a staging dry run.", expected: "2026-08-15T15:00", createdAt: "2026-08-12T15:40", status: "Pending Monitoring", outcome: "", followUpPeople: [], updates: [{ id: "u4", at: "2026-08-12T15:40", author: "You", text: "Added expiry monitoring to the weekly review." }] },
];

const statusClass = (status: Status) => `status ${status.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
const isCompleteStatus = (status: Status) => status === "Resolved" || status === "Closed";
const encodeTransfer = (payload: TransferPayload) => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};
const decodeTransfer = (value: string) => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as TransferPayload;
};
const dateLabel = (value: string) => value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "No ETA";
const isOverdue = (issue: Issue) => !isCompleteStatus(issue.status) && issue.expected && new Date(issue.expected).getTime() < Date.now();
const daysOverdue = (issue: Issue) => Math.max(1, Math.ceil((Date.now() - new Date(issue.expected).getTime()) / 86400000));
const dayMs = 86400000;
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const durationLabel = (hours: number) => hours >= 48 ? `${Math.round(hours / 24)}d` : `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
/* Local, not UTC: the calendar builds its cell keys from local date parts, so keying
   entries in UTC put evening work on the following day for anyone west of Greenwich. */
const dayKey = (value: string) => { const at = new Date(value); return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`; };
const dayBefore = (key: string) => { const [year, month, day] = key.split("-").map(Number); const at = new Date(year, month - 1, day - 1); return dayKey(at.toISOString()); };
const peopleFromInput = (value: string) => Array.from(new Map(value.split(/[,;\n]+/).map(person => person.trim()).filter(Boolean).map(person => [person.toLowerCase(), person])).values());
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
// Quoted fragments end in "…" when clipped, so a trailing full stop would read as an ellipsis of four.
const quote = (value: string) => `“${value}${/[.…?!]$/.test(value) ? "" : "."}”`;
// Deterministic so an entry always renders the same reflection, while different entries vary.
const pickFrom = <T,>(options: T[], seed: string) => options[Math.abs(Array.from(seed).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) | 0, 7)) % options.length];

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
const describeDiaryChange = (before: DiaryEntry, after: { title: string; text: string; mood: Mood }) => {
  const parts: string[] = [];
  if (before.mood !== after.mood) parts.push(`mood ${moodName(before.mood).toLowerCase()} → ${moodName(after.mood).toLowerCase()}`);
  if (before.title.trim() !== after.title.trim()) parts.push(!before.title.trim() ? "title added" : !after.title.trim() ? "title removed" : "title changed");
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

const diarySuggestion = (mood: Mood, text: string, title = "", history: DiaryEntry[] = [], writtenAt?: string) => {
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
  const relatedFeedback = top ? history.find(entry => entry.suggestionHelpful !== undefined && detectThemes(`${entry.title} ${entry.text}`.toLowerCase()).some(theme => theme.id === top.id)) : undefined;
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
  if (top && relatedFeedback) {
    const options = themeStep[top.id];
    const previousStyle = options.findIndex(option => relatedFeedback.suggestion.includes(option.slice(0, 44)));
    if (previousStyle >= 0) step = relatedFeedback.suggestionHelpful ? options[previousStyle] : options[(previousStyle + 1) % options.length];
  }
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
  const [issues, setIssues] = useState<Issue[]>(seed);
  const [activeId, setActiveId] = useState<string>(seed[0].id);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
  const [diaryFont, setDiaryFont] = useState("journal");
  const [diaryPaper, setDiaryPaper] = useState("cream");
  const [editDraft, setEditDraft] = useState<{ title: string; text: string; mood: Mood }>({ title: "", text: "", mood: "okay" });
  const [diaryMood, setDiaryMood] = useState<Mood>("okay");
  const [diaryTitle, setDiaryTitle] = useState("");
  const [diaryText, setDiaryText] = useState("");
  const [diaryInsight, setDiaryInsight] = useState("");
  const [transferMessage, setTransferMessage] = useState("");
  const [followUpInput, setFollowUpInput] = useState("");
  const [newFollowUps, setNewFollowUps] = useState<string[]>([]);
  const [newFollowUpInput, setNewFollowUpInput] = useState("");
  const [filter, setFilter] = useState<"All" | "Mine" | "Overdue">("All");
  const [metricFocus, setMetricFocus] = useState<MetricFocus>("home-open");
  const [insightRange, setInsightRange] = useState<InsightRange>("30d");
  const [insightFocus, setInsightFocus] = useState("");
  const [showPersonalInsights, setShowPersonalInsights] = useState(true);
  const [section, setSection] = useState<"dashboard" | "calendar" | "metrics" | "diary" | "settings">("dashboard");
  const [calendarMonth, setCalendarMonth] = useState(new Date(2026, 7, 1));
  const [selectedDay, setSelectedDay] = useState<string>("2026-08-13");
  const [theme, setTheme] = useState("rose");
  const [darkMode, setDarkMode] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const permission = useSyncExternalStore(permissionStore.subscribe, permissionStore.getSnapshot, permissionStore.getServerSnapshot);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("16:30");
  const [reminderFeedback, setReminderFeedback] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let loadedIssues = seed;
    const saved = localStorage.getItem("signal-petal-issues");
    if (saved) {
      try { loadedIssues = (JSON.parse(saved) as Issue[]).map(i => { const createdAt = i.createdAt || i.updates?.[0]?.at || new Date().toISOString(); return { ...i, followUpPeople: Array.isArray(i.followUpPeople) ? i.followUpPeople.filter(person => typeof person === "string" && person.trim()).map(person => person.trim()) : [], createdAt, statusChangedAt: i.statusChangedAt || createdAt }; }); setIssues(loadedIssues); }
      catch { localStorage.removeItem("signal-petal-issues"); }
    }
    const savedStatuses = localStorage.getItem("signal-petal-statuses");
    let loadedStatuses = defaultStatuses;
    if (savedStatuses) {
      try { const parsed = JSON.parse(savedStatuses); if (Array.isArray(parsed)) loadedStatuses = parsed.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map(value => value.trim()); }
      catch { localStorage.removeItem("signal-petal-statuses"); }
    }
    const terminalStatus = loadedStatuses.includes("Closed") && !loadedStatuses.includes("Resolved") ? "Closed" : "Resolved";
    const customStatuses = Array.from(new Set([...loadedStatuses, ...loadedIssues.map(issue => issue.status)].filter(status => !["New", "Ongoing", "Resolved", "Closed"].includes(status))));
    setStatuses(["New", "Ongoing", ...customStatuses, terminalStatus]);
    const savedColors = localStorage.getItem("signal-petal-status-colors");
    if (savedColors) { try { const parsed = JSON.parse(savedColors); if (parsed && typeof parsed === "object") setStatusColors({ ...defaultStatusColors, ...parsed }); } catch { localStorage.removeItem("signal-petal-status-colors"); } }
    const savedProfile = localStorage.getItem("signal-petal-profile");
    if (savedProfile) { try { const parsed = JSON.parse(savedProfile) as Profile; if (parsed.name?.trim() && parsed.role?.trim()) setProfile({ name: parsed.name.trim(), role: parsed.role.trim() }); } catch { localStorage.removeItem("signal-petal-profile"); } }
    setTheme(localStorage.getItem("signal-petal-theme") || "rose");
    setDarkMode(localStorage.getItem("signal-petal-dark") === "true");
    setReminderTime(localStorage.getItem("signal-petal-reminder-time") || "16:30");
    setDiaryFont(localStorage.getItem("signal-petal-diary-font") || "journal");
    setDiaryPaper(localStorage.getItem("signal-petal-diary-paper") || "cream");
    let loadedDiary: DiaryEntry[] = [];
    const savedDiary = localStorage.getItem("signal-petal-diary");
    if (savedDiary) { try { const parsed = JSON.parse(savedDiary); if (Array.isArray(parsed)) loadedDiary = parsed; } catch { localStorage.removeItem("signal-petal-diary"); } }
    setDiaryEntries(loadedDiary);
    let loadedDiaryLog: DiaryEvent[] = [];
    const savedDiaryLog = localStorage.getItem("signal-petal-diary-log");
    if (savedDiaryLog) { try { const parsed = JSON.parse(savedDiaryLog); if (Array.isArray(parsed)) loadedDiaryLog = parsed; } catch { localStorage.removeItem("signal-petal-diary-log"); } }
    // Reflections written before the log existed still deserve a place on the calendar.
    const alreadyLogged = new Set(loadedDiaryLog.filter(event => event.action === "created").map(event => event.entryId));
    const backfilled = loadedDiary
      .filter(entry => !alreadyLogged.has(entry.id))
      .map<DiaryEvent>(entry => ({ id: `backfill-${entry.id}`, entryId: entry.id, at: entry.at, action: "created", title: entry.title, mood: entry.mood, detail: `${wordCount(entry.text)} word${wordCount(entry.text) === 1 ? "" : "s"}` }));
    setDiaryLog([...backfilled, ...loadedDiaryLog].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()));
    const savedReminders = localStorage.getItem("signal-petal-reminders-enabled");
    if ("Notification" in window) setRemindersEnabled(Notification.permission === "granted" && savedReminders !== "false");
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem("signal-petal-issues", JSON.stringify(issues)); }, [issues, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("signal-petal-statuses", JSON.stringify(statuses)); }, [statuses, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("signal-petal-status-colors", JSON.stringify(statusColors)); }, [statusColors, hydrated]);
  useEffect(() => { if (hydrated) { localStorage.setItem("signal-petal-theme", theme); localStorage.setItem("signal-petal-dark", String(darkMode)); } }, [theme, darkMode, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("signal-petal-reminders-enabled", String(remindersEnabled)); }, [remindersEnabled, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("signal-petal-reminder-time", reminderTime); }, [reminderTime, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("signal-petal-diary", JSON.stringify(diaryEntries)); }, [diaryEntries, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem("signal-petal-diary-log", JSON.stringify(diaryLog)); }, [diaryLog, hydrated]);
  useEffect(() => { if (hydrated) { localStorage.setItem("signal-petal-diary-font", diaryFont); localStorage.setItem("signal-petal-diary-paper", diaryPaper); } }, [diaryFont, diaryPaper, hydrated]);
  useEffect(() => { if (hydrated && profile) { localStorage.setItem("signal-petal-profile", JSON.stringify(profile)); document.title = `${profile.name}'s Signal Petal`; } }, [profile, hydrated]);
  useEffect(() => { void notificationWorker(); }, []);
  useEffect(() => {
    if (!showDetail && !showCreate && !showDeleteConfirm && !openDiaryId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showDeleteConfirm) setShowDeleteConfirm(false);
        else if (openDiaryId) { setOpenDiaryId(""); setEditingDiaryId(""); }
        else if (showCreate) setShowCreate(false);
        else setShowDetail(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = previousOverflow; };
  }, [showDetail, showCreate, showDeleteConfirm, openDiaryId]);
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
      if (dueSoon.length && localStorage.getItem("signal-petal-task-reminder-day") !== taskReminderKey) {
        const overdue = dueSoon.filter(isOverdue).length;
        const upcoming = dueSoon.length - overdue;
        const parts = [overdue ? `${overdue} overdue` : "", upcoming ? `${upcoming} due within 24 hours` : ""].filter(Boolean).join(" and ");
        const result = await sendReminderNotification("Signal Petal needs attention", `${parts}. Open your queue to record the next move.`, `signal-petal-tasks-${today}`);
        if (cancelled) return;
        if (result.delivery) { localStorage.setItem("signal-petal-task-reminder-day", taskReminderKey); setReminderFeedback(`Task reminder sent at ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`); }
        else setReminderFeedback(`Task reminder could not be delivered — ${result.reason}.`);
      }
      const [hour, minute] = reminderTime.split(":").map(Number);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
      // The time is part of the key, so moving the check-in earlier re-arms it for today.
      const checkInKey = `${today}|${reminderTime}`;
      if (now.getHours() * 60 + now.getMinutes() >= hour * 60 + minute && localStorage.getItem("signal-petal-check-in-day") !== checkInKey) {
        const result = await sendReminderNotification("Daily Signal Petal check-in", "Take a moment to update your work and write down how the day felt.", `signal-petal-check-in-${today}`);
        if (cancelled) return;
        if (result.delivery) { localStorage.setItem("signal-petal-check-in-day", checkInKey); setReminderFeedback(`Daily check-in sent at ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`); }
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
  const openEntryIndex = diaryEntries.findIndex(entry => entry.id === openDiaryId);
  const personalOwner = profile?.name || "You";
  const openCount = issues.filter(i => !isCompleteStatus(i.status)).length;
  const overdueCount = issues.filter(isOverdue).length;
  const mine = issues.filter(i => i.owner.toLowerCase() === personalOwner.toLowerCase());
  const mineOpen = mine.filter(i => !isCompleteStatus(i.status));
  const mineOverdue = mine.filter(isOverdue);
  const mineResolved = mine.filter(i => isCompleteStatus(i.status));
  const attentionQueue = issues.filter(isOverdue).sort((a, b) => new Date(a.expected).getTime() - new Date(b.expected).getTime());
  const visible = useMemo(() => {
    let scopedIssues: Issue[];
    if (filter === "Mine") {
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
    else scopedIssues = issues.filter(i => !isCompleteStatus(i.status));

    const terms = searchQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return scopedIssues;
    return scopedIssues.filter(issue => {
      const searchable = [issue.title, issue.details, issue.action, issue.owner, issue.status, issue.followUpPeople.join(" "), ...issue.updates.flatMap(update => [update.author, update.text])].join(" ").toLocaleLowerCase();
      return terms.every(term => searchable.includes(term));
    });
  }, [issues, filter, metricFocus, personalOwner, searchQuery]);
  const dashboardView = filter === "Mine" ? "mine" : filter === "Overdue" ? "attention" : "overview";
  const pageTitle = section === "calendar" ? "Your work calendar ✦" : section === "metrics" ? "Signals & progress ✦" : section === "diary" ? "A quiet place to land ✦" : section === "settings" ? "Settings ✦" : filter === "Mine" ? "My actions ✦" : filter === "Overdue" ? "Needs attention" : `Good afternoon, ${profile?.role || "there"} ✦`;
  const pageDescription = section === "calendar" ? "Choose a day to see the tasks you logged and the diary activity that went with them." : section === "metrics" ? "A clear read on delivery pace, follow-through, and where to focus." : section === "diary" ? "Vent freely, name the mood, and leave with one gentle next step." : section === "settings" ? "Personalize your workspace, workflow, notifications, and local data." : filter === "Mine" ? "Your personal action list, separated from the wider team queue." : filter === "Overdue" ? "A focused triage view for work that has passed its expected update." : "A lovely little command center for keeping work moving.";
  const ownerReport = useMemo(() => Object.entries(issues.reduce<Record<string, number>>((map, i) => { if (!isCompleteStatus(i.status)) map[i.owner] = (map[i.owner] || 0) + 1; return map; }, {})).sort((a,b) => b[1]-a[1]), [issues]);
  const diaryInsights = useMemo(() => {
    if (!diaryEntries.length) return null;
    const entries = [...diaryEntries].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const now = Date.now();
    const sevenDaysAgo = now - 7 * dayMs;
    const fourteenDaysAgo = now - 14 * dayMs;
    const recentEntries = entries.filter(entry => new Date(entry.at).getTime() >= sevenDaysAgo);
    const previousEntries = entries.filter(entry => { const at = new Date(entry.at).getTime(); return at >= fourteenDaysAgo && at < sevenDaysAgo; });
    const words = entries.map(entry => wordCount(entry.text));
    const totalWords = words.reduce((sum, count) => sum + count, 0);
    const averageMood = (group: DiaryEntry[]) => group.length ? group.reduce((sum, entry) => sum + moodWeight[entry.mood], 0) / group.length : null;
    const heavyShare = (group: DiaryEntry[]) => group.length ? Math.round((group.filter(entry => moodWeight[entry.mood] < 0).length / group.length) * 100) : null;
    const confidence = (sample: number) => sample >= 8 ? "Reliable pattern" : sample >= 4 ? "Emerging pattern" : "Early signal";
    const recentAverage = averageMood(recentEntries);
    const previousAverage = averageMood(previousEntries);
    const moodDelta = recentAverage !== null && previousAverage !== null ? recentAverage - previousAverage : null;
    const pulseDirection = moodDelta === null ? "Gathering a baseline" : moodDelta > .35 ? "Feeling lighter" : moodDelta < -.35 ? "Carrying more weight" : "Holding steady";
    const pulse = { currentCount: recentEntries.length, previousCount: previousEntries.length, currentAverage: recentAverage, previousAverage, delta: moodDelta, heavy: heavyShare(recentEntries), previousHeavy: heavyShare(previousEntries), direction: pulseDirection, confidence: confidence(recentEntries.length + previousEntries.length) };

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

    const themeTally = new Map<ThemeId, { id: ThemeId; label: string; count: number; entries: DiaryEntry[] }>();
    entries.forEach(entry => {
      const seen = new Set<ThemeId>();
      detectThemes(`${entry.title} ${entry.text}`.toLowerCase()).forEach(theme => {
        if (seen.has(theme.id)) return;
        seen.add(theme.id);
        const current = themeTally.get(theme.id);
        themeTally.set(theme.id, { id: theme.id, label: theme.label, count: (current?.count ?? 0) + 1, entries: [...(current?.entries ?? []), entry] });
      });
    });
    const positiveThemes = new Set<ThemeId>(["progress", "gratitude", "hope", "relief"]);
    const themePatterns = Array.from(themeTally.values()).map(theme => {
      const currentCount = theme.entries.filter(entry => new Date(entry.at).getTime() >= sevenDaysAgo).length;
      const previousCount = theme.entries.filter(entry => { const at = new Date(entry.at).getTime(); return at >= fourteenDaysAgo && at < sevenDaysAgo; }).length;
      const average = averageMood(theme.entries) ?? 0;
      const tone = positiveThemes.has(theme.id) || average > .35 ? "support" : average < -.2 ? "drain" : "mixed";
      const trend = currentCount > previousCount ? (previousCount ? "rising" : "new this week") : currentCount < previousCount ? "easing" : "steady";
      const evidence = theme.entries[theme.entries.length - 1];
      return { ...theme, currentCount, previousCount, average, tone, trend, confidence: confidence(theme.count), evidence, excerpt: clip(strongestClause(evidence.text), 118) };
    }).sort((a, b) => b.count - a.count || Math.abs(b.average) - Math.abs(a.average));
    const themes = themePatterns.slice(0, 5);
    const influences = [...themePatterns].sort((a, b) => {
      const tonePriority = (value: string) => value === "mixed" ? 0 : 1;
      return tonePriority(b.tone) - tonePriority(a.tone) || b.count - a.count || Math.abs(b.average) - Math.abs(a.average);
    }).slice(0, 4);

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

    // Reconstruct the queue that was open when each page was written. This is a closer
    // workload signal than counting tasks created that day, and it includes overdue and
    // follow-up load without pretending that association proves causation.
    const workload = entries.map(entry => {
      const at = new Date(entry.at).getTime();
      const open = issues.filter(issue => {
        const created = new Date(issue.createdAt).getTime();
        const completed = issue.completedAt ? new Date(issue.completedAt).getTime() : Number.POSITIVE_INFINITY;
        return created <= at && completed > at;
      });
      const overdue = open.filter(issue => issue.expected && new Date(issue.expected).getTime() < at).length;
      const followUps = open.reduce((sum, issue) => sum + issue.followUpPeople.length, 0);
      return { entry, open: open.length, overdue, followUps, score: open.length + overdue * 1.5 + followUps * .25 };
    });
    const workloadThreshold = median(workload.map(item => item.score));
    const onBusy = workload.filter(item => item.score > workloadThreshold).map(item => item.entry);
    const onQuiet = workload.filter(item => item.score <= workloadThreshold).map(item => item.entry);
    const crossover = onBusy.length >= 3 && onQuiet.length >= 3 ? { busy: heavyShare(onBusy) ?? 0, quiet: heavyShare(onQuiet) ?? 0, busyCount: onBusy.length, quietCount: onQuiet.length, threshold: Math.round(workloadThreshold * 10) / 10 } : null;

    const weeklyThemes = new Map<ThemeId, { id: ThemeId; label: string; count: number }>();
    recentEntries.forEach(entry => {
      const seen = new Set<ThemeId>();
      detectThemes(`${entry.title} ${entry.text}`.toLowerCase()).forEach(theme => {
        if (seen.has(theme.id)) return;
        seen.add(theme.id);
        const current = weeklyThemes.get(theme.id);
        weeklyThemes.set(theme.id, { id: theme.id, label: theme.label, count: (current?.count ?? 0) + 1 });
      });
    });
    const repeating = [...weeklyThemes.values()].sort((a, b) => b.count - a.count)[0];
    const lifted = [...recentEntries].filter(entry => moodWeight[entry.mood] > 0).sort((a, b) => moodWeight[b.mood] - moodWeight[a.mood] || new Date(b.at).getTime() - new Date(a.at).getTime())[0];
    const drained = [...recentEntries].filter(entry => moodWeight[entry.mood] < 0).sort((a, b) => moodWeight[a.mood] - moodWeight[b.mood] || new Date(b.at).getTime() - new Date(a.at).getTime())[0];
    const weekly = {
      count: recentEntries.length,
      lifted: lifted ? { entry: lifted, excerpt: clip(strongestClause(lifted.text), 105) } : null,
      drained: drained ? { entry: drained, excerpt: clip(strongestClause(drained.text), 105) } : null,
      repeating,
      experiment: repeating ? themeStep[repeating.id][0] : "Name one moment that changed your mood this week, then make one small choice that gives you more of the useful part.",
    };
    const feedback = {
      tried: entries.filter(entry => entry.suggestionTried).length,
      rated: entries.filter(entry => entry.suggestionHelpful !== undefined).length,
      helpful: entries.filter(entry => entry.suggestionHelpful === true).length,
    };

    return { entries, recentEntries, previousEntries, pulse, totalWords, longestWords: Math.max(...words), averageWords: Math.round(totalWords / entries.length), currentStreak, longestStreak, daysWritten: days.length, moodCounts, topMood, ribbon, themes, influences, clock, favouriteTime, brightestDay, heaviestDay, revisited, lift: lift as { from: DiaryEntry; to: DiaryEntry; gain: number } | null, crossover, weekly, feedback, words: signatureWords(entries) };
  }, [diaryEntries, diaryLog, issues]);

  const calendarDays = useMemo(() => { const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1); const end = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0); return Array.from({ length: start.getDay() + end.getDate() }, (_, i) => i - start.getDay() + 1); }, [calendarMonth]);
  const selectedIssues = issues.filter(i => dayKey(i.createdAt) === selectedDay);
  // Diary events sit beside issues on the calendar; only mood and title are shown, never the reflection.
  const selectedDiary = diaryLog.filter(event => dayKey(event.at) === selectedDay).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const monthTitle = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(calendarMonth);
  const resolvedIssues = issues.filter(i => isCompleteStatus(i.status));
  const taskInsights = useMemo(() => {
    const now = Date.now();
    const rangeDays = insightRange === "all" ? null : Number(insightRange.slice(0, -1));
    const validTime = (value?: string) => value ? new Date(value).getTime() : Number.NaN;
    const knownTimes = issues.flatMap(issue => [validTime(issue.createdAt), validTime(issue.completedAt)]).filter(Number.isFinite);
    const earliest = knownTimes.length ? Math.min(...knownTimes) : now;
    const rangeStart = rangeDays ? now - rangeDays * dayMs : earliest;
    const previousStart = rangeDays ? rangeStart - rangeDays * dayMs : rangeStart;
    const inWindow = (value: string | undefined, from = rangeStart, to = now) => { const at = validTime(value); return Number.isFinite(at) && at >= from && at <= to; };
    const created = issues.filter(issue => inWindow(issue.createdAt));
    const completed = issues.filter(issue => isCompleteStatus(issue.status) && inWindow(issue.completedAt));
    const previousCreated = rangeDays ? issues.filter(issue => inWindow(issue.createdAt, previousStart, rangeStart)) : [];
    const previousCompleted = rangeDays ? issues.filter(issue => isCompleteStatus(issue.status) && inWindow(issue.completedAt, previousStart, rangeStart)) : [];
    const open = issues.filter(issue => !isCompleteStatus(issue.status));
    const overdue = open.filter(isOverdue);
    const latestActivity = (issue: Issue) => Math.max(validTime(issue.createdAt) || 0, ...issue.updates.map(update => validTime(update.at) || 0));
    const stale = open.filter(issue => now - latestActivity(issue) >= 7 * dayMs);
    const dueSoon = open.filter(issue => { const due = validTime(issue.expected); return Number.isFinite(due) && due >= now && due <= now + dayMs; });
    const overdueOneToThree = overdue.filter(issue => { const days = Math.ceil((now - validTime(issue.expected)) / dayMs); return days <= 3; });
    const overdueFourToSeven = overdue.filter(issue => { const days = Math.ceil((now - validTime(issue.expected)) / dayMs); return days >= 4 && days <= 7; });
    const overdueEightPlus = overdue.filter(issue => Math.ceil((now - validTime(issue.expected)) / dayMs) >= 8);
    const noEta = open.filter(issue => !issue.expected);

    const problemsFor = (issue: Issue) => {
      const problems: string[] = [];
      if (!issue.owner.trim()) problems.push("owner");
      if (!issue.expected) problems.push("ETA");
      if (!issue.action.trim()) problems.push("current action");
      if (isCompleteStatus(issue.status) && !issue.outcome.trim()) problems.push("outcome");
      if (isCompleteStatus(issue.status) && !issue.completedAt) problems.push("completion timestamp");
      return problems;
    };
    const qualityProblems = new Map(issues.map(issue => [issue.id, problemsFor(issue)]));
    const qualityIssues = issues.filter(issue => (qualityProblems.get(issue.id)?.length || 0) > 0);
    const qualityCounts = {
      eta: issues.filter(issue => !issue.expected).length,
      action: issues.filter(issue => !issue.action.trim()).length,
      outcome: issues.filter(issue => isCompleteStatus(issue.status) && !issue.outcome.trim()).length,
      completion: issues.filter(issue => isCompleteStatus(issue.status) && !issue.completedAt).length,
    };

    const completionHours = completed.map(issue => (validTime(issue.completedAt) - validTime(issue.createdAt)) / 3600000).filter(hours => Number.isFinite(hours) && hours >= 0);
    const sortedCompletion = [...completionHours].sort((a, b) => a - b);
    const medianHours = median(completionHours);
    const p75Hours = sortedCompletion.length ? sortedCompletion[Math.min(sortedCompletion.length - 1, Math.ceil(sortedCompletion.length * .75) - 1)] : 0;
    const dueCompleted = completed.filter(issue => issue.expected && issue.completedAt);
    const onTimeCount = dueCompleted.filter(issue => validTime(issue.completedAt) <= validTime(issue.expected)).length;
    const onTimeRate = dueCompleted.length ? Math.round((onTimeCount / dueCompleted.length) * 100) : 0;

    const statusGroups = statuses.map(status => {
      const items = open.filter(issue => issue.status === status);
      const ages = items.map(issue => Math.max(0, (now - validTime(issue.statusChangedAt || issue.createdAt)) / dayMs));
      return { status, items, count: items.length, medianAge: median(ages) };
    }).filter(group => group.count).sort((a, b) => b.count - a.count || b.medianAge - a.medianAge);

    const ownerMap = new Map<string, Issue[]>();
    open.forEach(issue => ownerMap.set(issue.owner || "Unassigned", [...(ownerMap.get(issue.owner || "Unassigned") || []), issue]));
    const ownerGroups = Array.from(ownerMap, ([owner, items]) => ({ owner, items, overdue: items.filter(isOverdue).length, stale: items.filter(item => stale.some(issue => issue.id === item.id)).length, followUps: items.reduce((sum, item) => sum + item.followUpPeople.length, 0) })).sort((a, b) => b.items.length - a.items.length || b.overdue - a.overdue);

    const bucketCount = insightRange === "7d" ? 7 : 6;
    const span = Math.max(dayMs, now - rangeStart);
    const bucketSize = span / bucketCount;
    const flow = Array.from({ length: bucketCount }, (_, index) => {
      const from = rangeStart + bucketSize * index;
      const to = index === bucketCount - 1 ? now + 1 : from + bucketSize;
      return {
        label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(from)),
        created: issues.filter(issue => inWindow(issue.createdAt, from, to)).length,
        completed: issues.filter(issue => isCompleteStatus(issue.status) && inWindow(issue.completedAt, from, to)).length,
      };
    });
    const flowMax = Math.max(1, ...flow.flatMap(bucket => [bucket.created, bucket.completed]));

    const focusItems: Record<string, Issue[]> = { created, completed, overdue, stale, quality: qualityIssues, "age:soon": dueSoon, "age:1-3": overdueOneToThree, "age:4-7": overdueFourToSeven, "age:8+": overdueEightPlus, "age:no-eta": noEta };
    const focusLabels: Record<string, string> = { created: "Work logged in this period", completed: "Work completed in this period", overdue: "Currently overdue", stale: "No update for 7+ days", quality: "Tasks with missing information", "age:soon": "Due within 24 hours", "age:1-3": "Overdue by 1–3 days", "age:4-7": "Overdue by 4–7 days", "age:8+": "Overdue by 8+ days", "age:no-eta": "Open work without an ETA" };
    statusGroups.forEach(group => { focusItems[`status:${group.status}`] = group.items; focusLabels[`status:${group.status}`] = `${group.status} work`; });
    ownerGroups.forEach(group => { focusItems[`owner:${group.owner}`] = group.items; focusLabels[`owner:${group.owner}`] = `${group.owner}'s open work`; });

    const deliveryScore = open.length ? Math.max(0, 100 - Math.round((overdue.length / open.length) * 100)) : 100;
    const freshnessScore = open.length ? Math.max(0, 100 - Math.round((stale.length / open.length) * 100)) : 100;
    const documentationScore = issues.length ? Math.max(0, 100 - Math.round((qualityIssues.length / issues.length) * 100)) : 100;
    const reliabilityScore = dueCompleted.length ? onTimeRate : 100;
    const healthScore = Math.round((deliveryScore + freshnessScore + documentationScore + reliabilityScore) / 4);
    const healthLabel = healthScore >= 85 ? "Looking healthy" : healthScore >= 65 ? "Watch the flow" : "Needs attention";
    const rangeLabel = insightRange === "all" ? "All time" : `Last ${rangeDays} days`;
    const backlogDelta = created.length - completed.length;
    const bottleneck = statusGroups[0];
    const narrative = `${completed.length} ${completed.length === 1 ? "item was" : "items were"} completed and ${created.length} ${created.length === 1 ? "was" : "were"} logged in ${rangeLabel.toLowerCase()}. ${backlogDelta > 0 ? `The queue grew by ${backlogDelta}.` : backlogDelta < 0 ? `The queue reduced by ${Math.abs(backlogDelta)}.` : "The queue held steady."}${overdue.length ? ` ${overdue.length} ${overdue.length === 1 ? "item is" : "items are"} overdue.` : " Nothing is overdue."}${bottleneck ? ` ${bottleneck.status} is the busiest active stage with ${bottleneck.count}.` : " There is no active bottleneck."}`;
    const nextActions = [
      overdue.length ? `Start with the ${overdueEightPlus.length ? `${overdueEightPlus.length} item${overdueEightPlus.length === 1 ? "" : "s"} overdue by more than a week` : `${overdue.length} overdue item${overdue.length === 1 ? "" : "s"}`}.` : "Keep the current follow-up rhythm.",
      stale.length ? `Refresh ${stale.length} task${stale.length === 1 ? "" : "s"} with no update in seven days.` : "Every open task has a recent update.",
      qualityIssues.length ? `Complete missing information on ${qualityIssues.length} task${qualityIssues.length === 1 ? "" : "s"}.` : "Task records are complete enough for reliable reporting.",
    ];

    return { rangeDays, rangeLabel, created, completed, previousCreated, previousCompleted, open, overdue, stale, dueSoon, overdueOneToThree, overdueFourToSeven, overdueEightPlus, noEta, qualityIssues, qualityProblems, qualityCounts, completionHours, medianHours, p75Hours, dueCompleted, onTimeCount, onTimeRate, statusGroups, ownerGroups, flow, flowMax, focusItems, focusLabels, deliveryScore, freshnessScore, documentationScore, reliabilityScore, healthScore, healthLabel, narrative, nextActions };
  }, [issues, statuses, insightRange]);
  const insightFocusItems = insightFocus ? taskInsights.focusItems[insightFocus] || [] : [];
  const insightFocusLabel = insightFocus ? taskInsights.focusLabels[insightFocus] || "Insight details" : "";
  const appName = profile ? `${profile.name}'s Signal Petal` : "Signal Petal";
  const completionLabel = statuses.find(isCompleteStatus) || "Resolved";
  const queueTitle = filter === "Mine" ? metricFocus === "mine-open" ? "My open actions" : metricFocus === "mine-overdue" ? "My overdue actions" : metricFocus === "mine-resolved" ? `My ${completionLabel.toLowerCase()} actions` : "All my actions" : filter === "Overdue" ? metricFocus === "attention-oldest" ? "Oldest delayed item" : metricFocus === "attention-owners" ? "Overdue work by owner" : metricFocus === "attention-first" ? "First move to make" : "All overdue work" : metricFocus === "home-resolved" ? completionLabel : metricFocus === "home-overdue" ? "Needs attention" : "Open work";
  const statusStyle = (status: Status) => ({ "--status-color": statusColors[status] || "#7a5aa6" } as CSSProperties);

  function updateIssue(patch: Partial<Issue>) {
    if (!active) return;
    const now = new Date().toISOString();
    const statusChanged = Boolean(patch.status && patch.status !== active.status);
    const completedAt = patch.status && isCompleteStatus(patch.status) && !isCompleteStatus(active.status) ? now : patch.status && !isCompleteStatus(patch.status) ? undefined : active.completedAt;
    setIssues(items => items.map(i => i.id === active.id ? { ...i, ...patch, completedAt, statusChangedAt: statusChanged ? now : i.statusChangedAt || i.createdAt } : i));
  }
  function changeOwner(value: string) {
    if (!active) return;
    const nextOwner = value.trim();
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
    const remaining = issues.filter(i => i.id !== active.id);
    setIssues(remaining);
    setActiveId(remaining[0]?.id ?? "");
    setShowDeleteConfirm(false);
    setShowDetail(false);
  }
  function openSettings() {
    setStatusDraft(statuses.map(name => ({
      id: crypto.randomUUID(), name, original: name, color: statusColors[name] || "#7a5aa6",
      kind: name === "New" ? "new" : name === "Ongoing" ? "ongoing" : isCompleteStatus(name) ? "terminal" : undefined,
    })));
    setStatusInput("");
    setStatusError("");
    setTransferCode(encodeTransfer({ version: 1, issues, statuses, statusColors, diaryEntries, diaryLog }));
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
    const now = new Date().toISOString();
    setIssues(items => items.map(issue => renamed.has(issue.status) ? { ...issue, status: renamed.get(issue.status) as Status } : statuses.includes(issue.status) && !keptOriginals.has(issue.status) ? { ...issue, status: "Ongoing", completedAt: undefined, statusChangedAt: now } : issue));
    setStatusColors(Object.fromEntries(statusDraft.map(item => [item.name.trim(), item.color])));
    setStatuses(names);
    setStatusError("");
  }
  async function copyTransferCode() {
    try { await navigator.clipboard.writeText(transferCode); setTransferMessage("Backup code copied. Open Signal Petal at the other address and paste it there."); }
    catch { setTransferMessage("Copy was blocked by the browser. Select the code and copy it manually."); }
  }
  async function pasteTransferCode() {
    try { const code = await navigator.clipboard.readText(); setImportCode(code); setTransferMessage(code ? "Backup code pasted. Choose Import and replace to finish." : "The clipboard is empty."); }
    catch { setTransferMessage("Paste was blocked by the browser. Paste the backup code into the box manually."); }
  }
  function importTransfer() {
    try {
      const payload = decodeTransfer(importCode.trim());
      if (payload.version !== 1 || !Array.isArray(payload.issues) || !Array.isArray(payload.statuses) || !payload.statusColors || typeof payload.statusColors !== "object") throw new Error("Invalid backup");
      setIssues(payload.issues.map(issue => ({ ...issue, followUpPeople: Array.isArray(issue.followUpPeople) ? issue.followUpPeople : [], statusChangedAt: issue.statusChangedAt || issue.createdAt })));
      setStatuses(payload.statuses);
      setStatusColors(payload.statusColors);
      if (Array.isArray(payload.diaryEntries)) setDiaryEntries(payload.diaryEntries);
      if (Array.isArray(payload.diaryLog)) setDiaryLog(payload.diaryLog);
      setActiveId(payload.issues[0]?.id ?? "");
      setTransferCode(encodeTransfer(payload));
      setTransferMessage(`${payload.issues.length} task${payload.issues.length === 1 ? "" : "s"} imported successfully.`);
      setImportCode("");
    } catch { setTransferMessage("That backup code is not valid. Copy it again from the other Signal Petal address."); }
  }
  function addUpdate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const text = String(form.get("update") || "").trim(); if (!text || !active) return; updateIssue({ updates: [...active.updates, { id: crypto.randomUUID(), at: new Date().toISOString(), author: personalOwner, text }] }); event.currentTarget.reset(); }
  function addIssue(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const now = new Date().toISOString(); const issue: Issue = { id: crypto.randomUUID(), title: String(form.get("title")), details: String(form.get("details")), owner: String(form.get("owner")) || personalOwner, action: String(form.get("action")), expected: String(form.get("expected")), createdAt: now, statusChangedAt: now, status: "New", outcome: "", followUpPeople: newFollowUps, updates: [{ id: crypto.randomUUID(), at: now, author: personalOwner, text: "Issue logged." }] }; setIssues(items => [issue, ...items]); setActiveId(issue.id); setNewFollowUps([]); setNewFollowUpInput(""); setShowCreate(false); setShowDetail(true); }
  function saveProfile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("name") || "").trim(); const role = String(form.get("role") || "").trim(); if (name && role) setProfile({ name, role }); }
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
  function recordDiaryEvent(entry: { id: string; title: string; mood: Mood }, action: DiaryAction, detail: string, at = new Date().toISOString()) {
    setDiaryLog(events => [{ id: crypto.randomUUID(), entryId: entry.id, at, action, title: entry.title, mood: entry.mood, detail }, ...events]);
  }
  function addDiaryEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = diaryText.trim();
    if (!text) return;
    const at = new Date().toISOString();
    const suggestion = diarySuggestion(diaryMood, text, diaryTitle, diaryEntries, at);
    const entry: DiaryEntry = { id: crypto.randomUUID(), at, title: diaryTitle.trim(), text, mood: diaryMood, suggestion };
    setDiaryEntries(items => [entry, ...items]);
    recordDiaryEvent(entry, "created", `${wordCount(text)} word${wordCount(text) === 1 ? "" : "s"}`, at);
    setDiaryInsight(suggestion);
    setDiaryTitle("");
    setDiaryText("");
  }
  function startDiaryEdit(entry: DiaryEntry) {
    setEditingDiaryId(entry.id);
    setEditDraft({ title: entry.title, text: entry.text, mood: entry.mood });
  }
  function cancelDiaryEdit() { setEditingDiaryId(""); }
  function saveDiaryEdit(event: FormEvent<HTMLFormElement>, entry: DiaryEntry, index: number) {
    event.preventDefault();
    const text = editDraft.text.trim();
    if (!text) return;
    const updatedAt = new Date().toISOString();
    const detail = describeDiaryChange(entry, { ...editDraft, text });
    // The reflection is rewritten from the new words, using the entries that preceded this one.
    const suggestion = diarySuggestion(editDraft.mood, text, editDraft.title, diaryEntries.slice(index + 1), entry.at);
    setDiaryEntries(items => items.map(item => item.id === entry.id ? { ...item, title: editDraft.title.trim(), text, mood: editDraft.mood, suggestion, updatedAt } : item));
    recordDiaryEvent({ id: entry.id, title: editDraft.title.trim(), mood: editDraft.mood }, "edited", detail, updatedAt);
    setDiaryInsight(suggestion);
    setEditingDiaryId("");
  }
  function deleteDiaryEntry(entry: DiaryEntry) {
    setDiaryEntries(items => items.filter(item => item.id !== entry.id));
    recordDiaryEvent(entry, "deleted", `written ${dateLabel(entry.at)}`);
    if (editingDiaryId === entry.id) setEditingDiaryId("");
    if (openDiaryId === entry.id) setOpenDiaryId("");
  }
  function updateSuggestionFeedback(entryId: string, patch: Pick<DiaryEntry, "suggestionTried" | "suggestionHelpful">) {
    setDiaryEntries(items => items.map(item => item.id === entryId ? { ...item, ...patch } : item));
  }

  return <main className={`theme-${theme} ${darkMode ? "dark-mode" : ""}`}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">✦</span><div><strong>{appName}</strong><small>{profile?.role || "Personal work companion"}</small></div></div>
      <nav><button className={section === "dashboard" && filter === "All" ? "nav-active" : ""} onClick={() => { setSection("dashboard"); setFilter("All"); setMetricFocus("home-open"); }}>⌂ <span>Dashboard</span></button><button className={section === "calendar" ? "nav-active" : ""} onClick={() => setSection("calendar")}>▦ <span>Calendar</span></button><button className={section === "metrics" ? "nav-active" : ""} onClick={() => setSection("metrics")}>◌ <span>Insights</span></button><button className={section === "diary" ? "nav-active" : ""} onClick={() => setSection("diary")}>✎ <span>Diary</span></button><button className={section === "dashboard" && filter === "Mine" ? "nav-active nav-mine" : ""} onClick={() => { setSection("dashboard"); setFilter("Mine"); setMetricFocus("mine-total"); }}>♡ <span>My actions</span><em>{mine.length}</em></button><button className={section === "dashboard" && filter === "Overdue" ? "nav-active nav-attention" : ""} onClick={() => { setSection("dashboard"); setFilter("Overdue"); setMetricFocus("attention-overdue"); }}>! <span>Needs attention</span><em className="alert-count">{overdueCount}</em></button><button className={section === "settings" ? "nav-active" : ""} onClick={openSettings}>⚙ <span>Settings</span></button></nav>
      <div className="sidebar-bottom"><p>Appearance, workflow, notifications, and data tools are in Settings.</p></div>
    </aside>
    <section className={`workspace ${section === "dashboard" ? `view-${dashboardView}` : ""}`}>
      <header><div><p className="eyebrow">{section === "dashboard" && filter === "Mine" ? "PERSONAL FOCUS" : section === "dashboard" && filter === "Overdue" ? "TRIAGE MODE" : section === "diary" ? "PRIVATE REFLECTIONS" : section === "settings" ? "WORKSPACE PREFERENCES" : profile ? `${profile.name.toUpperCase()}'S WORKSPACE` : "YOUR WORKSPACE"}</p><h1>{pageTitle}</h1><p className="subhead">{pageDescription}</p></div>{section !== "settings" && section !== "diary" && <div className="header-actions"><button className="primary" type="button" onClick={openCreate}>+ Log/Track</button></div>}</header>
      {section === "dashboard" && <><section className="metric-row">{filter === "Mine" ? <><button className={`metric-card personal ${metricFocus === "mine-open" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "mine-open"} onClick={() => setMetricFocus("mine-open")}><span>My open actions</span><strong>{mineOpen.length}</strong><small>Assigned directly to you</small></button><button className={`metric-card ${mineOverdue.length ? "warm" : "good"} ${metricFocus === "mine-overdue" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "mine-overdue"} onClick={() => setMetricFocus("mine-overdue")}><span>My overdue</span><strong>{mineOverdue.length}</strong><small>{mineOverdue.length ? "Needs your follow-up" : "Your work is on track"}</small></button><button className={`metric-card ${metricFocus === "mine-resolved" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "mine-resolved"} onClick={() => setMetricFocus("mine-resolved")}><span>My {completionLabel.toLowerCase()}</span><strong>{mineResolved.length}</strong><small>Personal outcomes captured</small></button><button className={`metric-card ${metricFocus === "mine-total" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "mine-total"} onClick={() => setMetricFocus("mine-total")}><span>My total</span><strong>{mine.length}</strong><small>Across every status</small></button></> : filter === "Overdue" ? <><button className={`metric-card urgent ${metricFocus === "attention-overdue" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "attention-overdue"} onClick={() => setMetricFocus("attention-overdue")}><span>Overdue now</span><strong>{overdueCount}</strong><small>Past expected update</small></button><button className={`metric-card warm ${metricFocus === "attention-oldest" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "attention-oldest"} onClick={() => setMetricFocus("attention-oldest")}><span>Oldest delay</span><strong>{attentionQueue.length ? daysOverdue(attentionQueue[0]) : 0}d</strong><small>{attentionQueue.length ? attentionQueue[0].title : "Nothing is overdue"}</small></button><button className={`metric-card ${metricFocus === "attention-owners" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "attention-owners"} onClick={() => setMetricFocus("attention-owners")}><span>Owners affected</span><strong>{new Set(attentionQueue.map(i => i.owner)).size}</strong><small>People needing follow-up</small></button><button className={`metric-card ${metricFocus === "attention-first" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "attention-first"} onClick={() => setMetricFocus("attention-first")}><span>First move</span><strong>{attentionQueue.length ? "Now" : "Clear"}</strong><small>{attentionQueue.length ? "Start with the oldest item" : "No triage needed"}</small></button></> : <><button className={`metric-card ${metricFocus === "home-open" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "home-open"} onClick={() => setMetricFocus("home-open")}><span>Open work</span><strong>{openCount}</strong><small>Across your active issues</small></button><button className={`metric-card warm ${metricFocus === "home-overdue" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "home-overdue"} onClick={() => setMetricFocus("home-overdue")}><span>Needs attention</span><strong>{overdueCount}</strong><small>{overdueCount ? "Past its expected update" : "Everything is on track"}</small></button><button className={`metric-card ${metricFocus === "home-resolved" ? "metric-selected" : ""}`} type="button" aria-pressed={metricFocus === "home-resolved"} onClick={() => setMetricFocus("home-resolved")}><span>{completionLabel}</span><strong>{resolvedIssues.length}</strong><small>Outcomes documented</small></button><article><span>Next check-in</span><strong>Today</strong><small>Daily wrap-up at 4:30 PM</small></article></>}</section>
      <section className="content-grid">
        <div className={`issue-panel issue-panel-${dashboardView}`}><div className="section-heading"><div><p className="eyebrow">{filter === "Mine" ? "PERSONAL QUEUE" : filter === "Overdue" ? "PRIORITY QUEUE" : "WORK QUEUE"}</p><h2>{queueTitle}</h2></div><div className="filter-pills">{(["All", "Mine", "Overdue"] as const).map(f => <button className={filter === f ? "selected" : ""} onClick={() => { setFilter(f); setMetricFocus(f === "Mine" ? "mine-total" : f === "Overdue" ? "attention-overdue" : "home-open"); }} key={f}>{f === "All" ? "Open" : f}</button>)}</div></div><div className="task-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search tasks" placeholder="Search tasks, owners, statuses, or follow-up people…" value={searchQuery} onChange={event => setSearchQuery(event.target.value)}/>{searchQuery && <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear task search">Clear</button>}<small aria-live="polite">{visible.length} {visible.length === 1 ? "result" : "results"}</small></div><div className="issue-list">{visible.map(issue => <button key={issue.id} className={`issue-card ${issue.id === activeId ? "active" : ""}`} onClick={() => { setActiveId(issue.id); setFollowUpInput(""); setShowDetail(true); }}><div><span className={statusClass(issue.status)} style={statusStyle(issue.status)}>{issue.status}</span><h3>{issue.title}</h3><p>{issue.action || issue.details}</p>{issue.followUpPeople.length > 0 && <small className="issue-card-people">Follow up: {issue.followUpPeople.join(", ")}</small>}</div><div className="issue-meta"><span className={isOverdue(issue) ? "due overdue" : "due"}>{isOverdue(issue) ? "Overdue · " : "Due · "}{dateLabel(issue.expected)}</span><span>{issue.owner}</span>{issue.followUpPeople.length > 0 && <em>{issue.followUpPeople.length} follow-up {issue.followUpPeople.length === 1 ? "person" : "people"}</em>}</div></button>)}{!visible.length && <div className="empty">{searchQuery.trim() ? `No tasks match “${searchQuery.trim()}”.` : filter === "Mine" ? "No actions match this selection." : filter === "Overdue" || metricFocus === "home-overdue" ? "Nothing needs attention—every active item is on track." : metricFocus === "home-resolved" ? `No ${completionLabel.toLowerCase()} work yet.` : "No open work—your queue is looking beautifully clear."}</div>}</div></div>
        <aside className={`report-panel report-${dashboardView}`}>{filter === "Mine" ? <><p className="eyebrow">PERSONAL SNAPSHOT</p><h2>Your workload</h2><div className="focus-stat"><span>In progress</span><strong>{mineOpen.length}</strong></div><div className="focus-stat"><span>Overdue</span><strong>{mineOverdue.length}</strong></div><div className="focus-stat"><span>Completed</span><strong>{mineResolved.length}</strong></div><div className="report-divider"/><p className="eyebrow">FOCUS PROMPT</p><p className="report-note">Choose one clear next action, add an update, and keep your personal queue moving.</p></> : filter === "Overdue" ? <><p className="eyebrow">TRIAGE ORDER</p><h2>Oldest first</h2><div className="triage-list">{attentionQueue.slice(0, 3).map((issue, index) => <button key={issue.id} onClick={() => { setActiveId(issue.id); setShowDetail(true); }}><em>{index + 1}</em><span><strong>{issue.title}</strong><small>{issue.owner} · {dateLabel(issue.expected)}</small></span></button>)}{!attentionQueue.length && <p className="report-note">Your priority queue is clear.</p>}</div><div className="report-divider"/><p className="eyebrow">RECOVERY RHYTHM</p><p className="report-note">Confirm the owner, record the next step, and reset the expected update.</p></> : <><p className="eyebrow">AT A GLANCE</p><h2>Workload by owner</h2>{ownerReport.map(([owner,count]) => <div className="owner" key={owner}><div className="avatar">{owner.charAt(0)}</div><span>{owner}</span><strong>{count}</strong></div>)}<div className="report-divider"/><p className="eyebrow">WEEKLY OUTCOMES</p><p className="report-note">{completionLabel} work is retained with its outcome, so your weekly review writes itself.</p></>}</aside>
      </section>
      </>}
      {section === "calendar" && <section className="calendar-layout"><div className="calendar-panel"><div className="calendar-toolbar"><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><h2>{monthTitle}</h2><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div><div className="weekdays">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{calendarDays.map((day, index) => { if (day < 1) return <div className="calendar-day blank" key={index}/>; const key = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`; const logged = issues.filter(i => dayKey(i.createdAt) === key); const reflections = diaryLog.filter(event => dayKey(event.at) === key); return <button key={key} className={`calendar-day ${key === selectedDay ? "chosen" : ""}`} onClick={() => setSelectedDay(key)}><span>{day}</span>{(logged.length > 0 || reflections.length > 0) && <div className="day-counts">{logged.length > 0 && <em>{logged.length} logged</em>}{reflections.length > 0 && <em className="diary-count">✎ {reflections.length}</em>}</div>}{logged.slice(0, reflections.length ? 1 : 2).map(i => <small key={i.id}>{i.title}</small>)}{reflections.slice(0, 1).map(event => <small className="diary-line" key={event.id}>{moodName(event.mood)} · {event.title || "Untitled reflection"}</small>)}</button>; })}</div></div><aside className="day-summary"><p className="eyebrow">DAY SUMMARY</p><h2>{new Intl.DateTimeFormat("en", { weekday:"long", month:"long", day:"numeric" }).format(new Date(`${selectedDay}T12:00`))}</h2><p className="summary-count">{selectedIssues.length} issue{selectedIssues.length === 1 ? "" : "s"} logged{selectedDiary.length ? ` · ${selectedDiary.length} diary ${selectedDiary.length === 1 ? "entry" : "entries"}` : ""}</p>{selectedDiary.length > 0 && <div className="day-diary"><p className="eyebrow">DIARY</p>{selectedDiary.map(event => <button key={event.id} className={`day-diary-entry action-${event.action}`} onClick={() => setSection("diary")}><span className={`mood-tag mood-${event.mood}`}>{moods.find(item => item.value === event.mood)?.symbol} {moodName(event.mood)}</span><strong>{event.title || "Untitled reflection"}</strong><small>{diaryEventLabel(event.action)} · {dateLabel(event.at)}{event.detail ? ` · ${event.detail}` : ""}</small></button>)}</div>}<div className="day-issues">{selectedIssues.map(issue => <button key={issue.id} onClick={() => { setActiveId(issue.id); setShowDetail(true); }}><span className={statusClass(issue.status)} style={statusStyle(issue.status)}>{issue.status}</span><strong>{issue.title}</strong><small>{issue.owner} · {dateLabel(issue.createdAt)}</small></button>)}{!selectedIssues.length && !selectedDiary.length && <p className="empty">Nothing logged for this day.</p>}</div></aside></section>}
      {section === "metrics" && <section className="insights">
        <div className="insights-toolbar"><div><p className="eyebrow">WORK SIGNALS</p><h2>{taskInsights.rangeLabel}</h2><p>Choose a period, then click any signal to see the work behind it.</p></div><div className="insight-period" role="group" aria-label="Insight period">{(["7d", "30d", "90d", "all"] as InsightRange[]).map(range => <button key={range} type="button" className={insightRange === range ? "selected" : ""} aria-pressed={insightRange === range} onClick={() => { setInsightRange(range); setInsightFocus(""); }}>{range === "all" ? "All time" : range.toUpperCase()}</button>)}</div></div>

        <div className={`health-card ${taskInsights.healthScore >= 85 ? "healthy" : "watch"}`}><div><p className="eyebrow">OVERALL SIGNAL</p><h2>{taskInsights.healthLabel}</h2><p>{taskInsights.narrative}</p></div><div className="health-score"><strong>{taskInsights.healthScore}</strong><span>out of 100</span></div></div>

        <div className="insight-kpis">
          <button type="button" onClick={() => setInsightFocus("created")} className={insightFocus === "created" ? "selected" : ""}><span>Work logged</span><strong>{taskInsights.created.length}</strong><small>{taskInsights.rangeDays === null ? "Across all recorded work" : `${taskInsights.created.length - taskInsights.previousCreated.length >= 0 ? "+" : ""}${taskInsights.created.length - taskInsights.previousCreated.length} vs previous period`}</small></button>
          <button type="button" onClick={() => setInsightFocus("completed")} className={insightFocus === "completed" ? "selected" : ""}><span>Completed</span><strong>{taskInsights.completed.length}</strong><small>{taskInsights.rangeDays === null ? "With a recorded completion time" : `${taskInsights.completed.length - taskInsights.previousCompleted.length >= 0 ? "+" : ""}${taskInsights.completed.length - taskInsights.previousCompleted.length} vs previous period`}</small></button>
          <button type="button" onClick={() => setInsightFocus("completed")} className={insightFocus === "completed" ? "selected" : ""}><span>Median completion</span><strong>{taskInsights.completionHours.length ? durationLabel(taskInsights.medianHours) : "—"}</strong><small>{taskInsights.completionHours.length ? `75% finish within ${durationLabel(taskInsights.p75Hours)}` : "New completions will build this signal"}</small></button>
          <button type="button" onClick={() => setInsightFocus("overdue")} className={`${taskInsights.overdue.length ? "warm" : "good"} ${insightFocus === "overdue" ? "selected" : ""}`}><span>Overdue now</span><strong>{taskInsights.overdue.length}</strong><small>{taskInsights.overdue.length ? `${taskInsights.overdueEightPlus.length} overdue by more than a week` : "Every active item is on track"}</small></button>
        </div>

        {insightFocus && <section className="insight-drilldown" aria-live="polite"><div className="insight-drilldown-head"><div><p className="eyebrow">DRILL-DOWN</p><h3>{insightFocusLabel}</h3></div><button type="button" onClick={() => setInsightFocus("")}>Close</button></div><div className="insight-task-list">{insightFocusItems.map(issue => <button key={issue.id} type="button" onClick={() => { setActiveId(issue.id); setShowDetail(true); }}><span className={statusClass(issue.status)} style={statusStyle(issue.status)}>{issue.status}</span><strong>{issue.title}</strong><small>{issue.owner || "Unassigned"} · {issue.expected ? dateLabel(issue.expected) : "No ETA"}{insightFocus === "quality" ? ` · Missing ${taskInsights.qualityProblems.get(issue.id)?.join(", ")}` : ""}</small></button>)}{!insightFocusItems.length && <p className="empty">There is no matching work in this period.</p>}</div></section>}

        <div className="insight-dashboard-grid">
          <article className="insight-panel flow-panel"><div className="insight-panel-head"><div><p className="eyebrow">FLOW</p><h3>Logged versus completed</h3></div><div className="flow-legend"><span><i className="created"/>Logged</span><span><i className="completed"/>Completed</span></div></div><div className="flow-chart">{taskInsights.flow.map((bucket, index) => <div className="flow-bucket" key={`${bucket.label}-${index}`}><div className="flow-bars"><button type="button" className="created" style={{ height: `${bucket.created ? Math.max(8, Math.round((bucket.created / taskInsights.flowMax) * 100)) : 2}%` }} aria-label={`${bucket.created} logged from ${bucket.label}`} title={`${bucket.created} logged`} onClick={() => setInsightFocus("created")}/><button type="button" className="completed" style={{ height: `${bucket.completed ? Math.max(8, Math.round((bucket.completed / taskInsights.flowMax) * 100)) : 2}%` }} aria-label={`${bucket.completed} completed from ${bucket.label}`} title={`${bucket.completed} completed`} onClick={() => setInsightFocus("completed")}/></div><small>{bucket.label}</small></div>)}</div><p className="insight-note">{taskInsights.created.length > taskInsights.completed.length ? "More work entered than left during this period, so the backlog is growing." : taskInsights.created.length < taskInsights.completed.length ? "Completions outpaced new work—the queue is shrinking." : "New work and completions are balanced."}</p></article>

          <article className="insight-panel"><p className="eyebrow">RELIABILITY</p><h3>Signal breakdown</h3><div className="signal-breakdown">{[{ key: "overdue", label: "Delivery", value: taskInsights.deliveryScore }, { key: "stale", label: "Freshness", value: taskInsights.freshnessScore }, { key: "quality", label: "Data quality", value: taskInsights.documentationScore }, { key: "completed", label: "On-time completion", value: taskInsights.reliabilityScore }].map(signal => <button type="button" key={signal.label} onClick={() => setInsightFocus(signal.key)}><span>{signal.label}</span><span className="signal-track"><i style={{ width: `${signal.value}%` }}/></span><strong>{signal.value}%</strong></button>)}</div><p className="insight-note">{taskInsights.dueCompleted.length ? `${taskInsights.onTimeCount} of ${taskInsights.dueCompleted.length} measured completions met their ETA.` : "On-time reporting begins once a task has both an ETA and a recorded completion time."}</p></article>
        </div>

        <div className="insight-dashboard-grid">
          <article className="insight-panel"><p className="eyebrow">BOTTLENECKS</p><h3>Open work by status</h3><ul className="insight-ranked-list">{taskInsights.statusGroups.slice(0, 6).map(group => <li key={group.status}><button type="button" onClick={() => setInsightFocus(`status:${group.status}`)}><span><i style={{ background: statusColors[group.status] || "#7a5aa6" }}/><strong>{group.status}</strong><small>median {group.medianAge < 1 ? "under a day" : `${Math.round(group.medianAge)}d`} in this stage</small></span><em>{group.count}</em></button></li>)}{!taskInsights.statusGroups.length && <li className="empty">No active work.</li>}</ul></article>

          <article className="insight-panel"><p className="eyebrow">AGING &amp; RISK</p><h3>Where time is accumulating</h3><ul className="insight-ranked-list aging-list">{[{ key: "age:soon", label: "Due within 24 hours", items: taskInsights.dueSoon }, { key: "age:1-3", label: "1–3 days overdue", items: taskInsights.overdueOneToThree }, { key: "age:4-7", label: "4–7 days overdue", items: taskInsights.overdueFourToSeven }, { key: "age:8+", label: "8+ days overdue", items: taskInsights.overdueEightPlus }, { key: "age:no-eta", label: "No ETA", items: taskInsights.noEta }].map(group => <li key={group.key}><button type="button" onClick={() => setInsightFocus(group.key)}><span><strong>{group.label}</strong><small>{group.items.length ? "Click to review" : "Clear"}</small></span><em>{group.items.length}</em></button></li>)}</ul></article>
        </div>

        <div className="insight-dashboard-grid">
          <article className="insight-panel"><p className="eyebrow">OWNERS &amp; HANDOFFS</p><h3>Active workload</h3><ul className="insight-ranked-list owner-risk-list">{taskInsights.ownerGroups.slice(0, 6).map(group => <li key={group.owner}><button type="button" onClick={() => setInsightFocus(`owner:${group.owner}`)}><span><strong>{group.owner}</strong><small>{group.overdue} overdue · {group.stale} stale · {group.followUps} follow-up link{group.followUps === 1 ? "" : "s"}</small></span><em>{group.items.length}</em></button></li>)}{!taskInsights.ownerGroups.length && <li className="empty">No active ownership load.</li>}</ul></article>

          <article className="insight-panel data-quality-card"><div className="insight-panel-head"><div><p className="eyebrow">DATA QUALITY</p><h3>Can the numbers be trusted?</h3></div><button className="quality-score" type="button" onClick={() => setInsightFocus("quality")}>{taskInsights.documentationScore}%</button></div><div className="quality-grid"><button type="button" onClick={() => setInsightFocus("quality")}><strong>{taskInsights.qualityCounts.eta}</strong><span>Missing ETA</span></button><button type="button" onClick={() => setInsightFocus("quality")}><strong>{taskInsights.qualityCounts.action}</strong><span>Missing action</span></button><button type="button" onClick={() => setInsightFocus("quality")}><strong>{taskInsights.qualityCounts.outcome}</strong><span>Missing outcome</span></button><button type="button" onClick={() => setInsightFocus("quality")}><strong>{taskInsights.qualityCounts.completion}</strong><span>Legacy completion time</span></button></div><p className="insight-note">Completion timing now uses recorded completion timestamps only; older inferred dates no longer distort the result.</p></article>
        </div>

        <article className="insight-summary"><div><p className="eyebrow">SMART WEEKLY REVIEW</p><h3>What changed and what to do next</h3><p>{taskInsights.narrative}</p></div><ul>{taskInsights.nextActions.map(action => <li key={action}>{action}</li>)}</ul></article>

        <div className="diary-insights">
          <div className="diary-insights-head"><div><p className="eyebrow">PRIVATE PERSONAL RHYTHM</p><h2>The other half of the story ✦</h2><p>Optional patterns from moods and diary activity, calculated only on this device.</p></div><div className="insight-head-actions"><button className="secondary" type="button" onClick={() => setShowPersonalInsights(value => !value)}>{showPersonalInsights ? "Hide personal insights" : "Show personal insights"}</button>{diaryInsights && showPersonalInsights && <button className="secondary" type="button" onClick={() => setSection("diary")}>Open the diary</button>}</div></div>
          {!showPersonalInsights
            ? <div className="diary-insights-empty"><span>◌</span><h3>Personal insights are hidden.</h3><p>Your diary remains unchanged. Show this section whenever you want mood and workload patterns included.</p></div>
            : !diaryInsights
            ? <div className="diary-insights-empty"><span>✎</span><h3>Nothing to read yet.</h3><p>Write a few reflections and this fills up with your streaks, your moods, and the words you keep reaching for.</p></div>
            : <>
              <div className="metric-row insight-metrics">
                <article><span>Reflections</span><strong>{diaryInsights.entries.length}</strong><small>across {diaryInsights.daysWritten} day{diaryInsights.daysWritten === 1 ? "" : "s"}</small></article>
                <article className={diaryInsights.currentStreak > 1 ? "good" : ""}><span>Writing streak</span><strong>{diaryInsights.currentStreak || "—"}</strong><small>{diaryInsights.currentStreak > 1 ? `${diaryInsights.currentStreak} days running · best ${diaryInsights.longestStreak}` : `Longest run so far: ${diaryInsights.longestStreak} day${diaryInsights.longestStreak === 1 ? "" : "s"}`}</small></article>
                <article><span>Words written</span><strong>{diaryInsights.totalWords.toLocaleString()}</strong><small>{diaryInsights.averageWords} a page · longest {diaryInsights.longestWords}</small></article>
                <article><span>Pages revisited</span><strong>{diaryInsights.revisited}</strong><small>{diaryInsights.revisited ? "you went back and reworked them" : "no page has needed a second pass"}</small></article>
              </div>

              <article className="insight-panel diary-pulse-card">
                <div className="insight-panel-head"><div><p className="eyebrow">YOUR RECENT PULSE</p><h3>{diaryInsights.pulse.direction}</h3></div><span className="confidence-chip">{diaryInsights.pulse.confidence}</span></div>
                <div className="pulse-grid">
                  <div><span>Pages this week</span><strong>{diaryInsights.pulse.currentCount}</strong><small>{diaryInsights.pulse.previousCount ? `${diaryInsights.pulse.currentCount - diaryInsights.pulse.previousCount >= 0 ? "+" : ""}${diaryInsights.pulse.currentCount - diaryInsights.pulse.previousCount} versus the prior week` : "The prior week has no pages yet"}</small></div>
                  <div><span>Mood movement</span><strong>{diaryInsights.pulse.delta === null ? "—" : `${diaryInsights.pulse.delta > 0 ? "+" : ""}${diaryInsights.pulse.delta.toFixed(1)}`}</strong><small>{diaryInsights.pulse.delta === null ? "Two weeks create a comparison" : diaryInsights.pulse.delta > .35 ? "lighter than the previous week" : diaryInsights.pulse.delta < -.35 ? "heavier than the previous week" : "close to your previous week"}</small></div>
                  <div><span>Heavy entries</span><strong>{diaryInsights.pulse.heavy === null ? "—" : `${diaryInsights.pulse.heavy}%`}</strong><small>{diaryInsights.pulse.previousHeavy === null ? "Still building a baseline" : `${diaryInsights.pulse.previousHeavy}% in the prior week`}</small></div>
                </div>
                <p className="insight-note">This compares the last seven days with the seven before them. It describes movement in your entries; it does not diagnose or claim what caused it.</p>
              </article>

              <article className="insight-panel mood-ribbon-card">
                <div className="insight-panel-head"><div><p className="eyebrow">MOOD RIBBON</p><h3>Your last {diaryInsights.ribbon.length} page{diaryInsights.ribbon.length === 1 ? "" : "s"}, oldest first</h3></div><span className={`mood-tag mood-${diaryInsights.topMood.value}`}>{diaryInsights.topMood.symbol} mostly {diaryInsights.topMood.label.toLowerCase()}</span></div>
                <div className="mood-ribbon">{diaryInsights.ribbon.map(entry => <button key={entry.id} type="button" className={`ribbon-block mood-${entry.mood}`} title={`${moodName(entry.mood)} · ${dateLabel(entry.at)}${entry.title ? ` · ${entry.title}` : ""}`} aria-label={`${moodName(entry.mood)} on ${dateLabel(entry.at)}`} onClick={() => { setSection("diary"); setOpenDiaryId(entry.id); }}/>)}</div>
                <div className="mood-mix">{diaryInsights.moodCounts.filter(mood => mood.count).map(mood => <span key={mood.value} className={`mood-tag mood-${mood.value}`}>{mood.symbol} {mood.label} · {Math.round((mood.count / diaryInsights.entries.length) * 100)}%</span>)}</div>
              </article>

              <div className="insight-detail diary-influence-grid">
                <article className="insight-panel influences-panel">
                  <p className="eyebrow">WHAT INFLUENCED THE PAGE</p><h3>Supports and drains</h3>
                  {diaryInsights.influences.length
                    ? <div className="influence-list">{diaryInsights.influences.map(influence => <button type="button" className={`influence-card tone-${influence.tone}`} key={influence.id} onClick={() => { setSection("diary"); setOpenDiaryId(influence.evidence.id); }}><span><strong>{influence.label}</strong><em>{influence.tone === "support" ? "Associated with lighter entries" : influence.tone === "drain" ? "Associated with heavier entries" : "Mixed across your entries"}</em></span><q>{influence.excerpt}</q><small>{influence.count} page{influence.count === 1 ? "" : "s"} · {influence.confidence} · Open evidence →</small></button>)}</div>
                    : <p className="insight-note">No repeated influence is clear yet. A few more specific entries will make this evidence useful.</p>}
                </article>

                <article className="insight-panel weekly-reflection-card">
                  <p className="eyebrow">PRIVATE WEEKLY REFLECTION</p><h3>Your last seven days</h3>
                  {diaryInsights.weekly.count
                    ? <div className="weekly-reflection-list">
                        <button type="button" disabled={!diaryInsights.weekly.lifted} onClick={() => diaryInsights.weekly.lifted && (setSection("diary"), setOpenDiaryId(diaryInsights.weekly.lifted.entry.id))}><span>What lifted you</span><strong>{diaryInsights.weekly.lifted?.excerpt || "No lighter entry recorded yet."}</strong></button>
                        <button type="button" disabled={!diaryInsights.weekly.drained} onClick={() => diaryInsights.weekly.drained && (setSection("diary"), setOpenDiaryId(diaryInsights.weekly.drained.entry.id))}><span>What felt heavy</span><strong>{diaryInsights.weekly.drained?.excerpt || "No heavy entry recorded this week."}</strong></button>
                        <div><span>What repeated</span><strong>{diaryInsights.weekly.repeating ? `${diaryInsights.weekly.repeating.label} · ${diaryInsights.weekly.repeating.count} page${diaryInsights.weekly.repeating.count === 1 ? "" : "s"}` : "No theme repeated yet."}</strong></div>
                        <div className="weekly-experiment"><span>One experiment for next week</span><strong>{diaryInsights.weekly.experiment}</strong></div>
                      </div>
                    : <p className="insight-note">Write a reflection this week and the review will build from it.</p>}
                </article>
              </div>

              <div className="insight-detail">
                <article className="insight-panel">
                  <p className="eyebrow">WHAT KEEPS COMING UP</p><h3>Recurring threads</h3>
                  {diaryInsights.themes.length
                    ? <ul className="theme-bars theme-trends">{diaryInsights.themes.map(theme => <li key={theme.label}><span className="theme-name">{theme.label}<small>{theme.trend} · {theme.confidence}</small></span><span className="theme-track"><span style={{ width: `${Math.max(10, Math.round((theme.count / diaryInsights.entries.length) * 100))}%` }}/></span><em>{theme.count}</em></li>)}</ul>
                    : <p>No thread has repeated yet — write a few more and the pattern will show.</p>}
                  <p className="insight-note">{(() => {
                    if (!diaryInsights.themes.length) return "Threads are counted across every page, so they sharpen as you write.";
                    const lead = diaryInsights.themes[0];
                    const share = Math.round((lead.count / diaryInsights.entries.length) * 100);
                    const name = `${lead.label.charAt(0).toUpperCase()}${lead.label.slice(1)}`;
                    return share >= 30
                      ? `${name} is the strongest thread — ${lead.count} of your ${diaryInsights.entries.length} pages. At that rate it has stopped being a bad week and started being a condition worth changing on purpose.`
                      : `${name} leads so far, in ${lead.count} of ${diaryInsights.entries.length} pages. Early days — but that is the thread to watch.`;
                  })()}</p>
                </article>

                <article className="insight-panel">
                  <p className="eyebrow">WHEN YOU WRITE</p><h3>{diaryInsights.favouriteTime.label === "Late night" ? "A night writer ☾" : diaryInsights.favouriteTime.label === "Early" ? "An early writer ☀" : `Mostly ${diaryInsights.favouriteTime.label.toLowerCase()}`}</h3>
                  <ul className="clock-bars">{diaryInsights.clock.map(part => <li key={part.id} className={part.id === diaryInsights.favouriteTime.id ? "is-top" : ""}><span className="theme-name">{part.label}<small>{part.note}</small></span><span className="theme-track"><span style={{ width: `${part.count ? Math.max(8, Math.round((part.count / diaryInsights.entries.length) * 100)) : 0}%` }}/></span><em>{part.count}</em></li>)}</ul>
                  {diaryInsights.brightestDay && <p className="insight-note">{diaryInsights.brightestDay.name === diaryInsights.heaviestDay?.name ? `Every page so far lands on a ${diaryInsights.brightestDay.name}.` : `${diaryInsights.brightestDay.name}s read lightest; ${diaryInsights.heaviestDay?.name}s carry the most weight.`}</p>}
                </article>
              </div>

              <div className="insight-detail">
                <article className="insight-panel">
                  <p className="eyebrow">YOUR WORDS</p><h3>What you keep reaching for</h3>
                  {diaryInsights.words.length
                    ? <div className="word-cloud">{diaryInsights.words.map(([word, count], index) => <span key={word} className="word-chip" style={{ fontSize: `${Math.round(22 - index * 1.6)}px` }} title={`${count} times`}>{word}</span>)}</div>
                    : <p>Once a word shows up on more than one page it will appear here.</p>}
                </article>

                <article className="insight-panel">
                  <p className="eyebrow">DIARY &amp; THE QUEUE</p><h3>{diaryInsights.crossover ? "Higher-load days versus lighter ones" : diaryInsights.lift ? "Your biggest lift" : "Still gathering"}</h3>
                  {diaryInsights.crossover
                    ? <><div className="crossover"><div><strong>{diaryInsights.crossover.busy}%</strong><span>heavy with more open, overdue, or follow-up work</span><small>{diaryInsights.crossover.busyCount} pages</small></div><div><strong>{diaryInsights.crossover.quiet}%</strong><span>heavy with a lighter recorded queue</span><small>{diaryInsights.crossover.quietCount} pages</small></div></div><p className="insight-note">{diaryInsights.crossover.busy - diaryInsights.crossover.quiet >= 15 ? "Heavier entries are associated with a fuller recorded queue. Treat that as a workload signal to investigate, not proof that work caused the mood." : diaryInsights.crossover.quiet - diaryInsights.crossover.busy >= 15 ? "The lighter-queue days read heavier, so the recorded workload alone does not explain the shift." : "Your entries hold fairly steady across the two workload groups."}</p></>
                    : diaryInsights.lift
                      ? <p className="insight-note">Between {dateLabel(diaryInsights.lift.from.at)} and {dateLabel(diaryInsights.lift.to.at)} you moved from {moodName(diaryInsights.lift.from.mood).toLowerCase()} to {moodName(diaryInsights.lift.to.mood).toLowerCase()}{diaryInsights.lift.to.title ? ` on “${diaryInsights.lift.to.title}”` : ""}. Worth knowing what changed — that is the part you can repeat.</p>
                      : <p className="insight-note">Keep writing. Once both workload groups have at least three pages, this compares mood with the open, overdue, and follow-up load that was recorded at the time.</p>}
                </article>
              </div>

              <article className="insight-panel suggestion-learning-card">
                <div><p className="eyebrow">SUGGESTION LEARNING</p><h3>Teach Signal Petal what helps</h3><p>Open a diary page and mark whether you tried its next step or found it useful. Your feedback stays on this device and makes the usefulness record personal to you.</p></div>
                <div className="suggestion-learning-stats"><div><strong>{diaryInsights.feedback.tried}</strong><span>tried</span></div><div><strong>{diaryInsights.feedback.rated}</strong><span>rated</span></div><div><strong>{diaryInsights.feedback.rated ? `${Math.round((diaryInsights.feedback.helpful / diaryInsights.feedback.rated) * 100)}%` : "—"}</strong><span>helpful</span></div></div>
              </article>
            </>}
        </div></section>}
      {section === "diary" && <section className="diary-section" style={diarySkin}><div className="diary-grid"><form className={`diary-composer paper-${diaryPaper}`} onSubmit={addDiaryEntry}><div><p className="eyebrow">TODAY&apos;S CHECK-IN</p><h2>What needs room today?</h2><p className="diary-copy">Write it exactly as it feels. This entry stays in this browser.</p></div><fieldset className="mood-picker"><legend>How are you feeling?</legend>{moods.map(mood => <button key={mood.value} className={diaryMood === mood.value ? "mood-selected" : ""} type="button" aria-pressed={diaryMood === mood.value} onClick={() => setDiaryMood(mood.value)}><span>{mood.symbol}</span><small>{mood.label}</small></button>)}</fieldset><label>Give this moment a name <small>optional</small><input value={diaryTitle} onChange={event => setDiaryTitle(event.target.value)} placeholder="A short title…"/></label><label>Let it out<textarea className="diary-ruled" required value={diaryText} onChange={event => setDiaryText(event.target.value)} placeholder="What happened? What are you carrying? What do you wish you could say?"/></label><div className="diary-save"><span>Private on this device</span><button className="primary" type="submit">Save reflection</button></div></form><aside className="diary-companion"><span className="companion-mark">✦</span><p className="eyebrow">GENTLE NEXT STEP</p><h2>{diaryInsight ? "A thought for right now" : "Your private pause"}</h2><p>{diaryInsight || "After you save a reflection, Signal Petal will offer one small suggestion shaped by your mood and words."}</p><div className="diary-stats"><div><strong>{diaryEntries.length}</strong><span>Total entries</span></div><div><strong>{diaryEntries.filter(entry => Date.now() - new Date(entry.at).getTime() < 604800000).length}</strong><span>This week</span></div></div><small className="privacy-note">Suggestions are generated on this device. They are supportive prompts, not professional care.</small></aside></div><section className="diary-history"><div className="diary-history-heading"><div><p className="eyebrow">YOUR REFLECTIONS</p><h2>Recent entries</h2></div><span>{diaryEntries.length} saved</span></div><div className="diary-entry-list">{diaryEntries.map(entry => { const mood = moods.find(item => item.value === entry.mood) || moods[2]; return <article className={`diary-entry diary-page paper-${diaryPaper}`} key={entry.id}><button className="diary-page-open" type="button" onClick={() => { setOpenDiaryId(entry.id); setEditingDiaryId(""); }}><span className="diary-entry-top"><span className={`mood-tag mood-${entry.mood}`}>{mood.symbol} {mood.label}</span><time>{dateLabel(entry.at)}{entry.updatedAt ? ` · edited ${dateLabel(entry.updatedAt)}` : ""}</time></span><span className="diary-page-title">{entry.title || "Untitled reflection"}</span><span className="diary-ruled diary-page-body">{entry.text}</span><span className="diary-page-more">Open page →</span></button></article>; })}{!diaryEntries.length && <div className="diary-empty"><span>✎</span><h3>Your diary is ready.</h3><p>Your first reflection will appear here with its mood and gentle next step.</p></div>}</div></section></section>}
      {section === "settings" && <section className="settings-page" aria-labelledby="settings-page-title">
        <div className="settings-grid">
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
          <p className="eyebrow">DEVICE-LOCAL DATA</p><h2>Export or import your tasks</h2><p className="settings-copy">Copy a backup to move your tasks between browsers or addresses. Importing replaces the tasks and workflow currently stored here.</p>
          <div className="data-settings-grid"><div className="transfer-section"><div><strong>Export from this address</strong><small>Includes tasks, diary entries, owners, follow-up people, update history, statuses, and colors.</small></div><textarea className="transfer-code" readOnly value={transferCode} aria-label="Backup code"/><button className="secondary" type="button" onClick={copyTransferCode}>Copy backup code</button></div><div className="transfer-section"><div><strong>Import into this address</strong><small>Paste a Signal Petal backup code, then confirm the replacement.</small></div><textarea className="transfer-code" value={importCode} onChange={e => setImportCode(e.target.value)} placeholder="Paste a backup code here" aria-label="Backup code to import"/><div className="transfer-actions"><button className="secondary" type="button" onClick={pasteTransferCode}>Paste code</button><button className="primary" type="button" disabled={!importCode.trim()} onClick={importTransfer}>Import and replace</button></div></div></div>{transferMessage && <p className="transfer-message" role="status">{transferMessage}</p>}
        </article>
      </section>}
    </section>
    {showDetail && active && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowDetail(false); }}><section className="detail detail-modal" role="dialog" aria-modal="true" aria-labelledby="issue-detail-title"><button className="close" type="button" aria-label="Close issue details" onClick={() => setShowDetail(false)}>×</button><div className="detail-title"><div><span className={statusClass(active.status)} style={statusStyle(active.status)}>{active.status}</span><h2 id="issue-detail-title">{active.title}</h2><p>{active.details}</p></div><div className="detail-actions"><label>Status<select value={active.status} onChange={e => updateIssue({ status: e.target.value })}>{statuses.map(s => <option key={s}>{s}</option>)}</select></label><button className="delete" type="button" onClick={() => setShowDeleteConfirm(true)}>Delete issue</button></div></div><div className="detail-grid"><div className="field"><span>Primary owner</span><input key={active.id} defaultValue={active.owner} onBlur={e => changeOwner(e.target.value)}/></div><div className="field"><span>Expected update / done</span><input type="datetime-local" value={active.expected} onChange={e => updateIssue({expected:e.target.value})}/></div><div className="field wide people-field"><span>Follow-up people</span>{active.followUpPeople.length > 0 && <div className="people-chips">{active.followUpPeople.map(person => <span className="person-chip" key={person}>{person}<button type="button" aria-label={`Remove ${person}`} onClick={() => removeActiveFollowUp(person)}>×</button></span>)}</div>}<div className="people-add"><input value={followUpInput} onChange={e => setFollowUpInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addActiveFollowUps(); } }} placeholder="Add names, separated by commas" aria-label="Follow-up people to add"/><button className="secondary" type="button" onClick={addActiveFollowUps}>+ Add people</button></div><small>These names help you track who needs a follow-up; no notifications are sent.</small></div><div className="field wide"><span>What they’re doing / my current action</span><textarea value={active.action} onChange={e => updateIssue({action:e.target.value})}/></div><div className="field wide"><span>Outcome</span><textarea placeholder="Capture the resolution, learning, or impact…" value={active.outcome} onChange={e => updateIssue({outcome:e.target.value})}/></div></div><div className="timeline"><div className="timeline-heading"><h3>Update timeline</h3><span>{active.updates.length} entries</span></div>{active.updates.map(entry => <div className="timeline-entry" key={entry.id}><div className="timeline-dot"/><div><strong>{entry.author}</strong><time>{dateLabel(entry.at)}</time><p>{entry.text}</p></div></div>)}<form className="update-form" onSubmit={addUpdate}><input name="update" placeholder="Add your update, decision, or next step…" aria-label="New update"/><button className="primary">Add update</button></form></div><div className="detail-save-actions"><button className="primary" type="button" onClick={() => setShowDetail(false)}>Save changes</button></div></section></div>}
    {openEntry && (() => {
      const mood = moods.find(item => item.value === openEntry.mood) || moods[2];
      const drafting = editingDiaryId === openEntry.id;
      const suggestion = openEntry.suggestion || diarySuggestion(openEntry.mood, openEntry.text, openEntry.title, diaryEntries.slice(openEntryIndex + 1), openEntry.at);
      const trail = diaryLog.filter(event => event.entryId === openEntry.id);
      const close = () => { setOpenDiaryId(""); setEditingDiaryId(""); };
      return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }} style={diarySkin}>
        <section className={`diary-open paper-${diaryPaper}`} role="dialog" aria-modal="true" aria-labelledby="diary-open-title">
          <button className="close" type="button" aria-label="Close this page" onClick={close}>×</button>
          <div className="diary-open-head"><span className={`mood-tag mood-${drafting ? editDraft.mood : openEntry.mood}`}>{(drafting ? moods.find(item => item.value === editDraft.mood) || mood : mood).symbol} {(drafting ? moods.find(item => item.value === editDraft.mood) || mood : mood).label}</span><time>{dateLabel(openEntry.at)}{openEntry.updatedAt ? ` · edited ${dateLabel(openEntry.updatedAt)}` : ""}</time></div>
          {drafting
            ? <form className="diary-entry-edit" onSubmit={event => saveDiaryEdit(event, openEntry, openEntryIndex)}><fieldset className="mood-picker mood-picker-compact"><legend>Mood</legend>{moods.map(option => <button key={option.value} className={editDraft.mood === option.value ? "mood-selected" : ""} type="button" aria-pressed={editDraft.mood === option.value} onClick={() => setEditDraft(draft => ({ ...draft, mood: option.value }))}><span>{option.symbol}</span><small>{option.label}</small></button>)}</fieldset><label>Title <small>optional</small><input value={editDraft.title} onChange={event => setEditDraft(draft => ({ ...draft, title: event.target.value }))} placeholder="A short title…"/></label><label>Reflection<textarea className="diary-ruled" required value={editDraft.text} onChange={event => setEditDraft(draft => ({ ...draft, text: event.target.value }))}/></label><div className="diary-entry-actions"><button className="primary" type="submit">Save changes</button><button className="secondary" type="button" onClick={cancelDiaryEdit}>Cancel</button></div></form>
            : <><h2 id="diary-open-title" className="diary-open-title">{openEntry.title || "Untitled reflection"}</h2><div className="diary-ruled diary-open-body">{openEntry.text}</div><div className="entry-suggestion"><span>Try this</span><p>{suggestion}</p><div className="suggestion-feedback" role="group" aria-label="Suggestion feedback"><button type="button" className={openEntry.suggestionTried ? "selected" : ""} aria-pressed={Boolean(openEntry.suggestionTried)} onClick={() => updateSuggestionFeedback(openEntry.id, { suggestionTried: !openEntry.suggestionTried })}>✓ I tried this</button><button type="button" className={openEntry.suggestionHelpful === true ? "selected" : ""} aria-pressed={openEntry.suggestionHelpful === true} onClick={() => updateSuggestionFeedback(openEntry.id, { suggestionHelpful: openEntry.suggestionHelpful === true ? undefined : true })}>Helpful</button><button type="button" className={openEntry.suggestionHelpful === false ? "selected not-helpful" : ""} aria-pressed={openEntry.suggestionHelpful === false} onClick={() => updateSuggestionFeedback(openEntry.id, { suggestionHelpful: openEntry.suggestionHelpful === false ? undefined : false })}>Not for me</button></div><small className="feedback-note">Private feedback—used only in your on-device insights.</small></div>{trail.length > 0 && <ul className="entry-trail">{trail.map(event => <li key={event.id}><strong>{diaryEventLabel(event.action)}</strong> {dateLabel(event.at)} <span>{event.detail}</span></li>)}</ul>}<div className="diary-entry-actions"><button type="button" onClick={() => startDiaryEdit(openEntry)}>Edit</button><button type="button" className="entry-delete" onClick={() => deleteDiaryEntry(openEntry)}>Delete</button></div></>}
        </section>
      </div>;
    })()}
    {showCreate && <div className="modal-backdrop" role="presentation"><form className="modal" onSubmit={addIssue}><button className="close" type="button" onClick={() => setShowCreate(false)}>×</button><p className="eyebrow">NEW WORK ITEM</p><h2>Log/Track</h2><label>Title<input required name="title" placeholder="What needs attention?"/></label><label>Details<textarea name="details" placeholder="Context, impact, links, and useful clues…"/></label><div className="form-grid"><label>Primary owner<input name="owner" placeholder={personalOwner}/></label><label>Expected update<input name="expected" type="datetime-local"/></label></div><div className="people-field"><span>Follow-up people</span>{newFollowUps.length > 0 && <div className="people-chips">{newFollowUps.map(person => <span className="person-chip" key={person}>{person}<button type="button" aria-label={`Remove ${person}`} onClick={() => setNewFollowUps(items => items.filter(name => name !== person))}>×</button></span>)}</div>}<div className="people-add"><input value={newFollowUpInput} onChange={e => setNewFollowUpInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNewFollowUps(); } }} placeholder="Add names, separated by commas" aria-label="Follow-up people to add"/><button className="secondary" type="button" onClick={addNewFollowUps}>+ Add people</button></div><small>Optional. These people will only be tracked inside this issue.</small></div><label>Current action<textarea name="action" placeholder="What are they—or you—doing next?"/></label><button className="primary create" type="submit">Create issue</button></form></div>}
    {showDeleteConfirm && active && <div className="modal-backdrop confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description"><span className="confirm-icon">!</span><h2 id="delete-title">Delete this issue?</h2><p id="delete-description">“{active.title}” and its update history will be permanently removed.</p><div className="confirm-actions"><button className="secondary" type="button" autoFocus onClick={() => setShowDeleteConfirm(false)}>Keep issue</button><button className="danger" type="button" onClick={deleteIssue}>Delete issue</button></div></section></div>}
    {hydrated && !profile && <div className="profile-backdrop"><form className="profile-card" onSubmit={saveProfile} role="dialog" aria-modal="true" aria-labelledby="setup-title"><span className="profile-mark">✦</span><p className="eyebrow">WELCOME TO SIGNAL PETAL</p><h1 id="setup-title">Let&apos;s make this yours.</h1><p>Tell us a little about yourself and we&apos;ll personalize your workspace. This stays only in this browser.</p><label>Your name<input required name="name" autoFocus placeholder="e.g. Aesi"/></label><label>Your role<input required name="role" placeholder="e.g. Site Reliability Engineer"/></label><button className="primary" type="submit">Create my workspace</button></form></div>}
  </main>;
}
