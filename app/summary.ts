/* Text handling for the copied weekly summaries.

   This is TIDYING, not rewriting. Every rule here has to be safe on text it was never
   written for, because the result is pasted into a work channel without being read first.
   When a rule is unsure it does nothing: a line that survives untouched is a far better
   failure than a mangled one. Nothing here reaches the network, and nothing here tries to
   guess meaning — "the cert thing" stays "the cert thing". The one-line summary a writer
   can add when closing a task out is what covers that; see `Issue.memory.shareable`.

   It lives outside the page component so every rule can be exercised by the test suite. */

export type SummaryBlock = { heading: string; items: string[] };

/* An empty block disappears rather than printing "nothing this week": an update that lists
   its own empty headings reads like a form return, not like a person writing it. */
export const renderBlocks = (blocks: SummaryBlock[]) =>
  blocks.filter(block => block.items.length).map(block => [block.heading, ...block.items].filter(Boolean).join("\n")).join("\n\n");

export const overdueSpan = (days: number) => `${days} day${days === 1 ? "" : "s"}`;

/* Trailing noise. Only matched at the very end, and only as whole words, so "meh" inside
   "mehndi" and a genuine "again" mid-sentence are both left alone. */
const TAIL_FILLER = /(?:^|\s)(?:lol|lmao|rofl|ugh+|argh+|urgh+|smh|meh|yay+|woo+|whew+|phew+|sigh+|oof+|hooray+)$/i;
/* Notes-to-self. Stripped from the front only, once, so the line becomes a statement of
   work rather than an instruction to the writer. */
const SELF_TALK = /^(?:i\s+(?:need|have|had|want|ought)\s+to|i\s+must|i\s+should|i\s+will|i'?ll|need\s+to|have\s+to|must|should|todo|to\s?do|remember\s+to|don'?t\s+forget\s+to|make\s+sure\s+to)\b[\s:,-]*/i;
const LEADING_BULLET = /^[-*•·+•]+\s*/;
const PICTOGRAPH = /\p{Extended_Pictographic}|️|‍/gu;
const TAIL_PUNCTUATION = /[\s.!?…,;:~-]+$/;

/* True when the first word looks like an identifier, a path or an acronym rather than an
   ordinary word — capitalising `checkout-api` or `pnpm` would be a change for the worse. */
const looksLikeToken = (word: string) => /[./\\_@:-]/.test(word) || (word.length > 1 && word === word.toUpperCase());

/**
 * Tidy one line of the writer's own text for the professional summary.
 * Never returns an empty string: if the rules would eat the whole line, the original
 * (trimmed) text is returned instead.
 */
export const professionalTone = (raw: string) => {
  const original = (raw ?? "").trim();
  if (!original) return "";
  let text = original.replace(PICTOGRAPH, " ").replace(LEADING_BULLET, "");
  // Shouting punctuation reads as unedited; one mark carries the same meaning.
  text = text.replace(/([!?])\1{1,}/g, "$1").replace(/\.{4,}/g, "…");
  text = text.replace(/\s+/g, " ").trim();
  /* If the rules would eat the whole line, this is what comes back — cleaned of the things
     that are always safe to clean, rather than the raw text with its emoji still in. */
  const floor = text || original;
  text = text.replace(SELF_TALK, "");
  // Filler and the punctuation around it come off together, and can be layered ("ugh!!!").
  for (let pass = 0; pass < 4; pass += 1) {
    const shorter = text.replace(TAIL_PUNCTUATION, "").replace(TAIL_FILLER, "");
    if (shorter === text) break;
    text = shorter;
  }
  text = text.replace(TAIL_PUNCTUATION, "").trim();
  if (!text) return floor;
  const [first] = text.split(" ");
  if (!looksLikeToken(first) && /^[a-z]/.test(text)) text = text[0].toUpperCase() + text.slice(1);
  return text;
};

/** The line the professional summary uses for a piece of work, best available first. */
export const professionalLine = (parts: { shareable?: string; title: string; outcome?: string }) => {
  const shareable = professionalTone(parts.shareable ?? "");
  if (shareable) return shareable;
  const title = professionalTone(parts.title);
  const outcome = professionalTone(parts.outcome ?? "");
  return outcome ? `${title} — ${outcome}` : title;
};
