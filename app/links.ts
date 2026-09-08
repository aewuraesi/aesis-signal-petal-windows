/* Links inside written text.

   An SRE logging an incident pastes dashboards, runbooks and tickets into the
   details and the update timeline. Those were plain text: you had to select the
   line and copy it out by hand to follow it. This finds them.

   Only http and https are ever recognised. Anything else — javascript:, data:,
   file: — is left as plain text, because turning arbitrary written text into a
   live link is exactly how a pasted log line becomes a hazard. */

import type { Issue } from "./backup.ts";

/* Stops at whitespace and at the brackets and quotes that usually wrap a URL rather
   than belong to it. Trailing sentence punctuation is trimmed separately, because
   "see https://example.com/runbook." ends a sentence, it does not end a path. */
const URL_PATTERN = /https?:\/\/[^\s<>"'`\])}]+/gi;
const TRAILING = /[.,;:!?]+$/;

export const findLinks = (text: string): string[] => {
  if (!text) return [];
  return (text.match(URL_PATTERN) ?? []).map(match => match.replace(TRAILING, "")).filter(Boolean);
};

/** Splits text into the runs between links and the links themselves, in order. */
export type TextPart = { kind: "text" | "link"; value: string };
export const splitLinks = (text: string): TextPart[] => {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const href = raw.replace(TRAILING, "");
    if (start > cursor) parts.push({ kind: "text", value: text.slice(cursor, start) });
    parts.push({ kind: "link", value: href });
    /* The punctuation trimmed off the end is still text and still has to be shown. */
    if (raw.length > href.length) parts.push({ kind: "text", value: raw.slice(href.length) });
    cursor = start + raw.length;
  }
  if (cursor < text.length) parts.push({ kind: "text", value: text.slice(cursor) });
  return parts;
};

/* A host and a short tail reads better in a chip than 90 characters of query string. */
export const linkLabel = (href: string) => {
  try {
    const url = new URL(href);
    const tail = url.pathname.replace(/\/$/, "").split("/").filter(Boolean).pop() ?? "";
    const label = tail ? `${url.hostname.replace(/^www\./, "")}/${tail}` : url.hostname.replace(/^www\./, "");
    return label.length > 44 ? `${label.slice(0, 43)}…` : label;
  } catch { return href; }
};

/* Every link the task carries, wherever it was written, in the order they were
   written, without repeats. The point is one place to look. */
export const issueLinks = (issue: Issue) => {
  const sources = [issue.details, issue.action, issue.outcome, ...issue.updates.map(update => update.text)];
  if (issue.memory) sources.push(issue.memory.symptoms, issue.memory.rootCause, issue.memory.resolution, issue.memory.learning, issue.memory.followUp, issue.memory.shareable ?? "");
  return [...new Set(sources.flatMap(source => findLinks(source ?? "")))];
};
