/* What a shared link contains, and - more to the point - what it does not.

   This is the only part of the app that puts anything on an address someone else can
   open, so the stripping happens HERE rather than at the call site: a future caller
   that forgets is the whole risk. The snapshot is built from scratch, field by field,
   rather than by deleting from an Issue - a new field added to Issue later then has
   to be opted IN to sharing, instead of leaking the day it is introduced.

   Never shared, at all:
   - the diary, in any form;
   - personal work, which the app has always promised stays out of anything that goes
     to a work channel;
   - attachments, which are screenshots of whatever happened to be on the screen;
   - what you learned, except the one line explicitly written to be said outside the
     team, because that is what that field is for. */

import type { Issue } from "./backup.ts";
import { findLinks } from "./links.ts";

export const SHARE_VERSION = 1;

export type SharedUpdate = { at: string; author: string; text: string };
export type SharedTask = {
  id: string;
  title: string;
  details: string;
  owner: string;
  status: string;
  expected: string;
  completedAt?: string;
  action: string;
  outcome: string;
  category?: string;
  priority?: string;
  followUpPeople: string[];
  shareable?: string;
  links: string[];
  updates: SharedUpdate[];
};
export type SharedSnapshot = {
  version: number;
  title: string;
  sharedBy: string;
  sharedAt: string;
  note: string;
  tasks: SharedTask[];
};

/** Work that may be offered for sharing at all. Personal work never is. */
export const shareableIssues = (issues: Issue[]) => issues.filter(issue => issue.lane !== "personal" && !issue.archivedAt);

export const toSharedTask = (issue: Issue): SharedTask => ({
  id: issue.id,
  title: issue.title,
  details: issue.details,
  owner: issue.owner,
  status: issue.status,
  expected: issue.expected,
  completedAt: issue.completedAt,
  action: issue.action,
  outcome: issue.outcome,
  category: issue.category || undefined,
  priority: issue.priority,
  followUpPeople: issue.followUpPeople,
  shareable: issue.memory?.shareable?.trim() || undefined,
  links: [...new Set([issue.details, issue.action, issue.outcome, ...issue.updates.map(update => update.text)].flatMap(text => findLinks(text ?? "")))],
  updates: issue.updates.map(update => ({ at: update.at, author: update.author, text: update.text })),
});

export const buildSnapshot = (
  issues: Issue[],
  chosen: string[],
  options: { title: string; sharedBy: string; note?: string; at?: string },
): SharedSnapshot => {
  const allowed = new Set(shareableIssues(issues).map(issue => issue.id));
  return {
    version: SHARE_VERSION,
    title: options.title.trim() || "Shared work",
    sharedBy: options.sharedBy.trim(),
    sharedAt: options.at ?? new Date().toISOString(),
    note: (options.note ?? "").trim(),
    /* Filtered against what is shareable, not just against what was ticked: the two
       can disagree if a task became personal after it was chosen. */
    tasks: issues.filter(issue => chosen.includes(issue.id) && allowed.has(issue.id)).map(toSharedTask),
  };
};

/* Unguessable, because the link IS the permission. randomUUID would do, but it is
   worth being explicit that this is a secret rather than an identifier. */
export const newShareId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
};

export const isSharedSnapshot = (value: unknown): value is SharedSnapshot => {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as SharedSnapshot;
  return typeof snapshot.title === "string"
    && typeof snapshot.sharedBy === "string"
    && typeof snapshot.sharedAt === "string"
    && Array.isArray(snapshot.tasks)
    && snapshot.tasks.every(task => task && typeof task.id === "string" && typeof task.title === "string" && Array.isArray(task.updates));
};

export const SHARE_WINDOWS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "", label: "Until I revoke it" },
] as const;

export const expiryFrom = (days: string, from = Date.now()) => (days ? new Date(from + Number(days) * 86400000) : null);
