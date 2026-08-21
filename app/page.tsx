"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

type Status = string;
type Entry = { id: string; at: string; text: string; author: string };
type Profile = { name: string; role: string };
type Mood = "bright" | "calm" | "okay" | "low" | "anxious" | "frustrated";
type DiaryEntry = { id: string; at: string; title: string; text: string; mood: Mood; suggestion: string };
type StatusDraft = { id: string; name: string; color: string; original?: string; kind?: "new" | "ongoing" | "terminal" };
type TransferPayload = { version: 1; issues: Issue[]; statuses: Status[]; statusColors: Record<string, string>; diaryEntries?: DiaryEntry[] };
type MetricFocus = "home-open" | "home-overdue" | "home-resolved" | "mine-open" | "mine-overdue" | "mine-resolved" | "mine-total" | "attention-overdue" | "attention-oldest" | "attention-owners" | "attention-first";
type Issue = {
  id: string; title: string; details: string; owner: string; action: string;
  expected: string; createdAt: string; completedAt?: string; status: Status; outcome: string; followUpPeople: string[]; updates: Entry[];
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
const dayKey = (value: string) => new Date(value).toISOString().slice(0, 10);
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
  const heavyStreak = heavyMood && history.slice(0, 2).length === 2 && history.slice(0, 2).every(entry => heavyMoods.includes(entry.mood));
  const lifted = (mood === "bright" || mood === "calm") && history[0] && heavyMoods.includes(history[0].mood);
  const positiveContent = themes.some(theme => ["progress", "gratitude", "relief", "hope"].includes(theme.id) && theme.score >= 2);

  // 1 — reflect back the specific thing they wrote, in their own words.
  const mirror = need
    ? pickFrom([`You said it yourself: ${quote(need)}`, `The clearest line in this is your own: ${quote(need)}`], seed)
    : question
      ? `You ended on a question — ${quote(question)} — and that is the honest centre of this entry.`
      : pivot
        ? pickFrom([`Past the setup, this is where the weight sits: ${quote(pivot)}`, `You moved through the context quickly and landed here: ${quote(pivot)}`], seed)
        : title.trim()
          ? `“${clip(tidy(title))}” — and the line that carries it is ${quote(strongestClause(text))}`
          : quote(strongestClause(text));

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
      try { loadedIssues = (JSON.parse(saved) as Issue[]).map(i => ({ ...i, followUpPeople: Array.isArray(i.followUpPeople) ? i.followUpPeople.filter(person => typeof person === "string" && person.trim()).map(person => person.trim()) : [], createdAt: i.createdAt || i.updates?.[0]?.at || new Date().toISOString() })); setIssues(loadedIssues); }
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
    const savedDiary = localStorage.getItem("signal-petal-diary");
    if (savedDiary) { try { const parsed = JSON.parse(savedDiary); if (Array.isArray(parsed)) setDiaryEntries(parsed); } catch { localStorage.removeItem("signal-petal-diary"); } }
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
  useEffect(() => { if (hydrated && profile) { localStorage.setItem("signal-petal-profile", JSON.stringify(profile)); document.title = `${profile.name}'s Signal Petal`; } }, [profile, hydrated]);
  useEffect(() => { void notificationWorker(); }, []);
  useEffect(() => {
    if (!showDetail && !showCreate && !showDeleteConfirm) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showDeleteConfirm) setShowDeleteConfirm(false);
        else if (showCreate) setShowCreate(false);
        else setShowDetail(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = previousOverflow; };
  }, [showDetail, showCreate, showDeleteConfirm]);
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
  const pageDescription = section === "calendar" ? "Choose a day to see every task and issue you logged." : section === "metrics" ? "A clear read on delivery pace, follow-through, and where to focus." : section === "diary" ? "Vent freely, name the mood, and leave with one gentle next step." : section === "settings" ? "Personalize your workspace, workflow, notifications, and local data." : filter === "Mine" ? "Your personal action list, separated from the wider team queue." : filter === "Overdue" ? "A focused triage view for work that has passed its expected update." : "A lovely little command center for keeping work moving.";
  const ownerReport = useMemo(() => Object.entries(issues.reduce<Record<string, number>>((map, i) => { if (!isCompleteStatus(i.status)) map[i.owner] = (map[i.owner] || 0) + 1; return map; }, {})).sort((a,b) => b[1]-a[1]), [issues]);
  const calendarDays = useMemo(() => { const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1); const end = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0); return Array.from({ length: start.getDay() + end.getDate() }, (_, i) => i - start.getDay() + 1); }, [calendarMonth]);
  const selectedIssues = issues.filter(i => dayKey(i.createdAt) === selectedDay);
  const monthTitle = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(calendarMonth);
  const resolvedIssues = issues.filter(i => isCompleteStatus(i.status));
  const completedWithTime = resolvedIssues.filter(i => i.completedAt || i.updates.length);
  const completionHours = completedWithTime.map(i => (new Date(i.completedAt || i.updates[i.updates.length - 1].at).getTime() - new Date(i.createdAt).getTime()) / 3600000).filter(h => h >= 0);
  const averageHours = completionHours.length ? completionHours.reduce((sum, h) => sum + h, 0) / completionHours.length : 0;
  const dueResolved = resolvedIssues.filter(i => i.expected && (i.completedAt || i.updates.length));
  const onTimeCount = dueResolved.filter(i => new Date(i.completedAt || i.updates[i.updates.length - 1].at).getTime() <= new Date(i.expected).getTime()).length;
  const onTimeRate = dueResolved.length ? Math.round((onTimeCount / dueResolved.length) * 100) : 0;
  const health = overdueCount > 0 || (dueResolved.length > 0 && onTimeRate < 80) ? "Needs improvement" : "Looking healthy";
  const appName = profile ? `${profile.name}'s Signal Petal` : "Signal Petal";
  const completionLabel = statuses.find(isCompleteStatus) || "Resolved";
  const queueTitle = filter === "Mine" ? metricFocus === "mine-open" ? "My open actions" : metricFocus === "mine-overdue" ? "My overdue actions" : metricFocus === "mine-resolved" ? `My ${completionLabel.toLowerCase()} actions` : "All my actions" : filter === "Overdue" ? metricFocus === "attention-oldest" ? "Oldest delayed item" : metricFocus === "attention-owners" ? "Overdue work by owner" : metricFocus === "attention-first" ? "First move to make" : "All overdue work" : metricFocus === "home-resolved" ? completionLabel : metricFocus === "home-overdue" ? "Needs attention" : "Open work";
  const statusStyle = (status: Status) => ({ "--status-color": statusColors[status] || "#7a5aa6" } as CSSProperties);

  function updateIssue(patch: Partial<Issue>) { if (!active) return; const completedAt = patch.status && isCompleteStatus(patch.status) && !isCompleteStatus(active.status) ? new Date().toISOString() : patch.status && !isCompleteStatus(patch.status) ? undefined : active.completedAt; setIssues(items => items.map(i => i.id === active.id ? { ...i, ...patch, completedAt } : i)); }
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
    setTransferCode(encodeTransfer({ version: 1, issues, statuses, statusColors, diaryEntries }));
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
      setIssues(payload.issues.map(issue => ({ ...issue, followUpPeople: Array.isArray(issue.followUpPeople) ? issue.followUpPeople : [] })));
      setStatuses(payload.statuses);
      setStatusColors(payload.statusColors);
      if (Array.isArray(payload.diaryEntries)) setDiaryEntries(payload.diaryEntries);
      setActiveId(payload.issues[0]?.id ?? "");
      setTransferCode(encodeTransfer(payload));
      setTransferMessage(`${payload.issues.length} task${payload.issues.length === 1 ? "" : "s"} imported successfully.`);
      setImportCode("");
    } catch { setTransferMessage("That backup code is not valid. Copy it again from the other Signal Petal address."); }
  }
  function addUpdate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const text = String(form.get("update") || "").trim(); if (!text || !active) return; updateIssue({ updates: [...active.updates, { id: crypto.randomUUID(), at: new Date().toISOString(), author: personalOwner, text }] }); event.currentTarget.reset(); }
  function addIssue(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const now = new Date().toISOString(); const issue: Issue = { id: crypto.randomUUID(), title: String(form.get("title")), details: String(form.get("details")), owner: String(form.get("owner")) || personalOwner, action: String(form.get("action")), expected: String(form.get("expected")), createdAt: now, status: "New", outcome: "", followUpPeople: newFollowUps, updates: [{ id: crypto.randomUUID(), at: now, author: personalOwner, text: "Issue logged." }] }; setIssues(items => [issue, ...items]); setActiveId(issue.id); setNewFollowUps([]); setNewFollowUpInput(""); setShowCreate(false); setShowDetail(true); }
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
  function addDiaryEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = diaryText.trim();
    if (!text) return;
    const at = new Date().toISOString();
    const suggestion = diarySuggestion(diaryMood, text, diaryTitle, diaryEntries, at);
    const entry: DiaryEntry = { id: crypto.randomUUID(), at, title: diaryTitle.trim(), text, mood: diaryMood, suggestion };
    setDiaryEntries(items => [entry, ...items]);
    setDiaryInsight(suggestion);
    setDiaryTitle("");
    setDiaryText("");
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
      {section === "calendar" && <section className="calendar-layout"><div className="calendar-panel"><div className="calendar-toolbar"><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><h2>{monthTitle}</h2><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div><div className="weekdays">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{calendarDays.map((day, index) => { if (day < 1) return <div className="calendar-day blank" key={index}/>; const key = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`; const logged = issues.filter(i => dayKey(i.createdAt) === key); return <button key={key} className={`calendar-day ${key === selectedDay ? "chosen" : ""}`} onClick={() => setSelectedDay(key)}><span>{day}</span>{logged.length > 0 && <em>{logged.length} logged</em>}{logged.slice(0,2).map(i => <small key={i.id}>{i.title}</small>)}</button>; })}</div></div><aside className="day-summary"><p className="eyebrow">DAY SUMMARY</p><h2>{new Intl.DateTimeFormat("en", { weekday:"long", month:"long", day:"numeric" }).format(new Date(`${selectedDay}T12:00`))}</h2><p className="summary-count">{selectedIssues.length} issue{selectedIssues.length === 1 ? "" : "s"} logged</p><div className="day-issues">{selectedIssues.map(issue => <button key={issue.id} onClick={() => { setActiveId(issue.id); setShowDetail(true); }}><span className={statusClass(issue.status)} style={statusStyle(issue.status)}>{issue.status}</span><strong>{issue.title}</strong><small>{issue.owner} · {dateLabel(issue.createdAt)}</small></button>)}{!selectedIssues.length && <p className="empty">No work logged for this day.</p>}</div></aside></section>}
      {section === "metrics" && <section className="insights"><div className={`health-card ${health === "Looking healthy" ? "healthy" : "watch"}`}><div><p className="eyebrow">OVERALL SIGNAL</p><h2>{health}</h2><p>{health === "Looking healthy" ? "Follow-ups and completion timing are in a good place." : "A few signals need attention—start with overdue items and slow handoffs."}</p></div><strong>{health === "Looking healthy" ? "✦" : "!"}</strong></div><div className="metric-row insight-metrics"><article><span>Completion rate</span><strong>{issues.length ? Math.round((resolvedIssues.length / issues.length) * 100) : 0}%</strong><small>{resolvedIssues.length} of {issues.length} issues completed</small></article><article className={onTimeRate >= 80 ? "good" : "warm"}><span>On-time completion</span><strong>{dueResolved.length ? `${onTimeRate}%` : "—"}</strong><small>{dueResolved.length ? `${onTimeCount} completed by their ETA` : "Set ETAs to begin tracking"}</small></article><article><span>Avg. completion time</span><strong>{completionHours.length ? `${averageHours.toFixed(1)}h` : "—"}</strong><small>{completionHours.length ? "From logged to completed" : "Complete work to measure"}</small></article><article className={overdueCount ? "warm" : "good"}><span>Currently overdue</span><strong>{overdueCount}</strong><small>{overdueCount ? "Follow up to get back on track" : "No active work is overdue"}</small></article></div><div className="insight-detail"><article><p className="eyebrow">WHAT THIS MEANS</p><h2>Completion timing</h2><div className="progress-track"><span style={{ width: `${Math.max(8, onTimeRate)}%` }}/></div><p>{dueResolved.length ? `${onTimeRate}% of work with a logged ETA was completed on time. ${onTimeRate >= 80 ? "That’s a solid operating rhythm." : "Aim for 80% or higher by checking in before ETAs slip."}` : "Once you complete issues with expected completion times, you’ll see a timing trend here."}</p></article><article><p className="eyebrow">FOCUS NEXT</p><h2>Recommended actions</h2><ul><li>{overdueCount ? `Follow up on ${overdueCount} overdue issue${overdueCount === 1 ? "" : "s"}.` : "Keep your current follow-up rhythm."}</li><li>Capture an outcome whenever work is completed.</li><li>Set an expected update time for clearer delivery signals.</li></ul></article></div></section>}
      {section === "diary" && <section className="diary-page"><div className="diary-grid"><form className="diary-composer" onSubmit={addDiaryEntry}><div><p className="eyebrow">TODAY&apos;S CHECK-IN</p><h2>What needs room today?</h2><p className="diary-copy">Write it exactly as it feels. This entry stays in this browser.</p></div><fieldset className="mood-picker"><legend>How are you feeling?</legend>{moods.map(mood => <button key={mood.value} className={diaryMood === mood.value ? "mood-selected" : ""} type="button" aria-pressed={diaryMood === mood.value} onClick={() => setDiaryMood(mood.value)}><span>{mood.symbol}</span><small>{mood.label}</small></button>)}</fieldset><label>Give this moment a name <small>optional</small><input value={diaryTitle} onChange={event => setDiaryTitle(event.target.value)} placeholder="A short title…"/></label><label>Let it out<textarea required value={diaryText} onChange={event => setDiaryText(event.target.value)} placeholder="What happened? What are you carrying? What do you wish you could say?"/></label><div className="diary-save"><span>Private on this device</span><button className="primary" type="submit">Save reflection</button></div></form><aside className="diary-companion"><span className="companion-mark">✦</span><p className="eyebrow">GENTLE NEXT STEP</p><h2>{diaryInsight ? "A thought for right now" : "Your private pause"}</h2><p>{diaryInsight || "After you save a reflection, Signal Petal will offer one small suggestion shaped by your mood and words."}</p><div className="diary-stats"><div><strong>{diaryEntries.length}</strong><span>Total entries</span></div><div><strong>{diaryEntries.filter(entry => Date.now() - new Date(entry.at).getTime() < 604800000).length}</strong><span>This week</span></div></div><small className="privacy-note">Suggestions are generated on this device. They are supportive prompts, not professional care.</small></aside></div><section className="diary-history"><div className="diary-history-heading"><div><p className="eyebrow">YOUR REFLECTIONS</p><h2>Recent entries</h2></div><span>{diaryEntries.length} saved</span></div><div className="diary-entry-list">{diaryEntries.map((entry, index) => { const mood = moods.find(item => item.value === entry.mood) || moods[2]; const suggestion = entry.suggestion || diarySuggestion(entry.mood, entry.text, entry.title, diaryEntries.slice(index + 1), entry.at); return <article className="diary-entry" key={entry.id}><div className="diary-entry-top"><span className={`mood-tag mood-${entry.mood}`}>{mood.symbol} {mood.label}</span><time>{dateLabel(entry.at)}</time></div><h3>{entry.title || "Untitled reflection"}</h3><p>{entry.text}</p><div className="entry-suggestion"><span>Try this</span><p>{suggestion}</p></div><button type="button" onClick={() => setDiaryEntries(items => items.filter(item => item.id !== entry.id))}>Delete</button></article>; })}{!diaryEntries.length && <div className="diary-empty"><span>✎</span><h3>Your diary is ready.</h3><p>Your first reflection will appear here with its mood and gentle next step.</p></div>}</div></section></section>}
      {section === "settings" && <section className="settings-page" aria-labelledby="settings-page-title">
        <div className="settings-grid">
          <article className="settings-card">
            <p className="eyebrow">APPEARANCE</p><h2 id="settings-page-title">Theme &amp; display</h2>
            <label className="settings-field">Theme<select value={theme} onChange={e => setTheme(e.target.value)}>{themes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <button className="settings-toggle" type="button" role="switch" aria-checked={darkMode} onClick={() => setDarkMode(value => !value)}><span><strong>Dark mode</strong><small>{darkMode ? "On" : "Off"}</small></span><span className={`switch-track ${darkMode ? "is-on" : ""}`} aria-hidden="true"/></button>
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
    {showCreate && <div className="modal-backdrop" role="presentation"><form className="modal" onSubmit={addIssue}><button className="close" type="button" onClick={() => setShowCreate(false)}>×</button><p className="eyebrow">NEW WORK ITEM</p><h2>Log/Track</h2><label>Title<input required name="title" placeholder="What needs attention?"/></label><label>Details<textarea name="details" placeholder="Context, impact, links, and useful clues…"/></label><div className="form-grid"><label>Primary owner<input name="owner" placeholder={personalOwner}/></label><label>Expected update<input name="expected" type="datetime-local"/></label></div><div className="people-field"><span>Follow-up people</span>{newFollowUps.length > 0 && <div className="people-chips">{newFollowUps.map(person => <span className="person-chip" key={person}>{person}<button type="button" aria-label={`Remove ${person}`} onClick={() => setNewFollowUps(items => items.filter(name => name !== person))}>×</button></span>)}</div>}<div className="people-add"><input value={newFollowUpInput} onChange={e => setNewFollowUpInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNewFollowUps(); } }} placeholder="Add names, separated by commas" aria-label="Follow-up people to add"/><button className="secondary" type="button" onClick={addNewFollowUps}>+ Add people</button></div><small>Optional. These people will only be tracked inside this issue.</small></div><label>Current action<textarea name="action" placeholder="What are they—or you—doing next?"/></label><button className="primary create" type="submit">Create issue</button></form></div>}
    {showDeleteConfirm && active && <div className="modal-backdrop confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description"><span className="confirm-icon">!</span><h2 id="delete-title">Delete this issue?</h2><p id="delete-description">“{active.title}” and its update history will be permanently removed.</p><div className="confirm-actions"><button className="secondary" type="button" autoFocus onClick={() => setShowDeleteConfirm(false)}>Keep issue</button><button className="danger" type="button" onClick={deleteIssue}>Delete issue</button></div></section></div>}
    {hydrated && !profile && <div className="profile-backdrop"><form className="profile-card" onSubmit={saveProfile} role="dialog" aria-modal="true" aria-labelledby="setup-title"><span className="profile-mark">✦</span><p className="eyebrow">WELCOME TO SIGNAL PETAL</p><h1 id="setup-title">Let&apos;s make this yours.</h1><p>Tell us a little about yourself and we&apos;ll personalize your workspace. This stays only in this browser.</p><label>Your name<input required name="name" autoFocus placeholder="e.g. Aesi"/></label><label>Your role<input required name="role" placeholder="e.g. Site Reliability Engineer"/></label><button className="primary" type="submit">Create my workspace</button></form></div>}
  </main>;
}
