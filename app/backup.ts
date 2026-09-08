import { toDateTimeInput } from "./dates.ts";

/* Shared shapes and the backup codec.

   This lives outside the page component so the restore path — the one action that
   replaces everything in the app — can be exercised by the test suite. */

export type Status = string;
export type Entry = { id: string; at: string; text: string; author: string };
/* An image attached to a task — a screenshot of the graph, the error, the ticket.

   It is stored inline as a data URL rather than in a second store, for the same reason
   nothing else here lives in a second place: one thing to save, back up, merge and
   restore. That makes size the whole problem, so every image is downscaled and
   re-encoded before it is ever kept, and `app/attachments.ts` owns those limits. */
export type Attachment = {
  id: string;
  name: string;
  addedAt: string;
  bytes: number;
  mimeType?: string;
  storage?: "indexeddb";
  dataUrl?: string;
};
export type Profile = { name: string; role: string };
/* Personal or professional, and optional on purpose: anything logged before this existed
   stays unsorted rather than being guessed at. Unsorted work only ever appears in the
   combined weekly summary, never in the one written to be pasted into a work channel. */
export type Lane = "professional" | "personal";
export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskRelation = {
  project?: string;
  service?: string;
  tags?: string[];
  parentId?: string;
  dependencyIds?: string[];
};
/* Work that comes round again: a certificate rotation, a quarterly review, a renewal.
   The next occurrence is a NEW task rather than the same one reopened, so a finished round
   stays finished — the week it shipped in keeps saying so, and the weekly summaries do not
   have to special-case anything. `repeatedFrom` is the thread back through the rounds. */
export type Repeat = { every: number; unit: "day" | "week" | "month" | "year" };
export type Issue = {
  id: string;
  title: string;
  details: string;
  owner: string;
  action: string;
  expected: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  focusHandledAt?: string;
  status: Status;
  outcome: string;
  followUpPeople: string[];
  updates: Entry[];
  lane?: Lane;
  priority?: Priority;
  category?: string;
  project?: string;
  service?: string;
  tags?: string[];
  parentId?: string;
  dependencyIds?: string[];
  archivedAt?: string;
  repeat?: Repeat;
  repeatedFrom?: string;
  /* Set when a long-finished task's update timeline was compacted to free storage.
     The task itself never moves and never leaves the counts — only the timeline goes,
     and only when the writer asks for it. `compactedUpdates` is how many were let go. */
  compactedAt?: string;
  compactedUpdates?: number;
  attachments?: Attachment[];
  /* `shareable` is the one line the writer chooses to say outside the team. It is asked for
     only on professional work, and when it is there the weekly summary uses it in place of
     the raw title and outcome — the app tidies wording, but it never invents meaning. */
  memory?: {
    symptoms: string;
    rootCause: string;
    resolution: string;
    learning: string;
    followUp: string;
    shareable?: string;
  };
  /* Nothing reads this any more — the feature that guessed related work was removed. It stays
     declared because the data is still sitting in people's saved backups, and a restore has to
     carry it through rather than quietly drop it. `tests/backup.test.mjs` holds that promise. */
  relatedIssueIds?: string[];
};
export type Mood =
  "bright" | "calm" | "okay" | "low" | "anxious" | "frustrated";
export type DiaryEntry = {
  id: string;
  at: string;
  title: string;
  text: string;
  mood: Mood;
  suggestion: string;
  updatedAt?: string;
  issueIds?: string[];
};
export type DiaryAction = "created" | "edited" | "deleted";
/* Diary events live in their own list rather than on the entry, so the record of a
   reflection having existed — and been reworked — survives deleting the entry itself. */
export type DiaryEvent = {
  id: string;
  entryId: string;
  at: string;
  action: DiaryAction;
  title: string;
  mood: Mood;
  detail: string;
};
export type DiaryVault = { salt: string; iv: string; data: string };
export type DailyCheckIn = {
  id: string;
  at: string;
  capacity: "high" | "steady" | "low";
  note: string;
  parkedIssueIds: string[];
  brief: string;
  win?: string;
  tomorrowMove?: string;
  resumeAt?: string;
};
/* A deletion has to travel, or the merge quietly undoes it.

   Merging by id keeps every record either side has seen, which is right for an edit and
   exactly wrong for a delete: the other device still holds the task, so the next sync
   hands it straight back and the writer deletes it again. The diary already solved this
   with its log of "deleted" events; tasks and statuses had no equivalent, so they came
   back. A tombstone is the id and the moment it went — small enough to keep, and enough
   for a merge to tell "never seen it" apart from "deliberately got rid of it".

   An edit made AFTER the deletion still wins, which is the same rule the diary uses: it
   means a task recreated on another device is not shot down by an old tombstone. */
export type Deletions = {
  issues?: Record<string, string>;
  statuses?: Record<string, string>;
};

/* Version 2 adds the profile, settings and the diary vault. Version 1 backups still
   import — the extra fields are all optional, so an old code loses nothing it had. */
export type TransferPayload = {
  version: 1 | 2;
  issues: Issue[];
  statuses: Status[];
  statusColors: Record<string, string>;
  diaryEntries?: DiaryEntry[];
  diaryLog?: DiaryEvent[];
  diaryVault?: DiaryVault | null;
  dailyCheckIns?: DailyCheckIn[];
  profile?: { name: string; role: string } | null;
  settings?: {
    theme?: string;
    darkMode?: boolean;
    reminderTime?: string;
    diaryFont?: string;
    diaryPaper?: string;
    diaryEnabled?: boolean;
    dashboardPrefs?: {
      summary: boolean;
      focus: boolean;
      garden: boolean;
      cardOrder?: Array<"all" | "mine" | "attention" | "resolved" | "check-in">;
    };
    savedViews?: Array<{
      id: string;
      name: string;
      query: string;
      filter: "All" | "Mine" | "Overdue" | "Archive";
    }>;
  };
  deletions?: Deletions;
  files?: Record<string, { mimeType: string; data: string }>;
  exportedAt?: string;
};
export const encodeTransfer = (payload: TransferPayload) => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};
export const decodeTransfer = (value: string) => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as TransferPayload;
};
export const backupFileName = () => {
  const now = new Date();
  return `signal-petal-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.json`;
};

/* The single gate every restore goes through, whatever the source. */
export const isValidPayload = (
  payload: unknown,
): payload is TransferPayload => {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as TransferPayload;
  const validIssue = (issue: unknown) => {
    if (!issue || typeof issue !== "object") return false;
    const item = issue as Partial<Issue>;
    return (
      typeof item.id === "string" &&
      !!item.id &&
      typeof item.title === "string" &&
      typeof item.details === "string" &&
      typeof item.owner === "string" &&
      typeof item.action === "string" &&
      typeof item.expected === "string" &&
      typeof item.createdAt === "string" &&
      !Number.isNaN(Date.parse(item.createdAt)) &&
      typeof item.status === "string" &&
      typeof item.outcome === "string" &&
      Array.isArray(item.followUpPeople) &&
      item.followUpPeople.every((person) => typeof person === "string") &&
      Array.isArray(item.updates) &&
      item.updates.every(
        (update) =>
          update &&
          typeof update.id === "string" &&
          typeof update.at === "string" &&
          typeof update.text === "string" &&
          typeof update.author === "string",
      ) &&
      (item.priority === undefined ||
        ["low", "medium", "high", "urgent"].includes(item.priority)) &&
      (item.category === undefined || typeof item.category === "string") &&
      (item.project === undefined || typeof item.project === "string") &&
      (item.service === undefined || typeof item.service === "string") &&
      (item.tags === undefined ||
        (Array.isArray(item.tags) &&
          item.tags.every((tag) => typeof tag === "string"))) &&
      (item.parentId === undefined || typeof item.parentId === "string") &&
      (item.dependencyIds === undefined ||
        (Array.isArray(item.dependencyIds) &&
          item.dependencyIds.every((id) => typeof id === "string"))) &&
      (item.archivedAt === undefined ||
        (typeof item.archivedAt === "string" &&
          !Number.isNaN(Date.parse(item.archivedAt)))) &&
      validAttachments(item.attachments)
    );
  };
  /* A data URL that is not an image must never be stored, let alone rendered later:
     a backup file is something a writer might be handed by someone else. */
  const validAttachments = (value: unknown) => {
    if (value === undefined) return true;
    if (!Array.isArray(value)) return false;
    return value.every((item) => {
      if (!item || typeof item !== "object") return false;
      const attachment = item as Partial<Attachment>;
      const legacyImage =
        typeof attachment.dataUrl === "string" &&
        /^data:image\/(png|jpeg|webp|gif);base64,/.test(attachment.dataUrl);
      const durableFile =
        attachment.storage === "indexeddb" &&
        typeof attachment.mimeType === "string";
      return (
        typeof attachment.id === "string" &&
        !!attachment.id &&
        typeof attachment.name === "string" &&
        (legacyImage || durableFile)
      );
    });
  };
  const validDeletions = (value: unknown) => {
    if (value === undefined) return true;
    if (!value || typeof value !== "object") return false;
    return Object.values(value as Record<string, unknown>).every(
      (group) =>
        group === undefined ||
        (!!group &&
          typeof group === "object" &&
          Object.values(group as Record<string, unknown>).every(
            (at) => typeof at === "string",
          )),
    );
  };
  return (
    (candidate.version === 1 || candidate.version === 2) &&
    validDeletions(candidate.deletions) &&
    Array.isArray(candidate.issues) &&
    candidate.issues.every(validIssue) &&
    Array.isArray(candidate.statuses) &&
    candidate.statuses.every(
      (status) => typeof status === "string" && !!status.trim(),
    ) &&
    !!candidate.statusColors &&
    typeof candidate.statusColors === "object" &&
    (candidate.files === undefined ||
      (!!candidate.files &&
        typeof candidate.files === "object" &&
        Object.values(candidate.files).every(
          (file) =>
            file &&
            typeof file.mimeType === "string" &&
            typeof file.data === "string" &&
            /^[A-Za-z0-9+/]*={0,2}$/.test(file.data),
        )))
  );
};

/* Restoring an old backup must not produce an issue with no followUpPeople array,
   which every consumer indexes into without checking. */
const isGeneratedRelatedWorkUpdate = (update: Entry) =>
  update.author === "Signal Petal" &&
  update.text.startsWith("Related past work:");

/* The date field only understands YYYY-MM-DDTHH:mm. Anything else — an ISO stamp from an
   older version, a hand-edited backup, a sync payload written by different code — parses
   perfectly well for the overdue arithmetic but renders as an EMPTY field. The writer then
   sees no date at all on a task that is quietly counting as late, and saving the form writes
   the blank back. So it is coerced once, on the way in.

   Coercing to LOCAL wall-clock is deliberate. A due date here means "half four on Thursday",
   the way a paper diary means it, not an instant on a global timeline: it should read the
   same whichever country the writer opens the app in. Everything else in the record —
   createdAt, completedAt — is an absolute ISO instant, because those are facts about when
   something happened rather than intentions about when it should. */
const DATE_INPUT_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const asDateInput = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return "";
  if (DATE_INPUT_SHAPE.test(value)) return value;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? "" : toDateTimeInput(at);
};

export const normaliseIssues = (issues: Issue[]) =>
  issues.map((issue) => ({
    ...issue,
    followUpPeople: Array.isArray(issue.followUpPeople)
      ? issue.followUpPeople
      : [],
    expected: asDateInput(issue.expected),
    lane:
      issue.lane === "professional" || issue.lane === "personal"
        ? issue.lane
        : undefined,
    /* A hand-edited backup must not be able to introduce a cadence the app cannot compute. */
    repeat:
      issue.repeat &&
      Number.isFinite(issue.repeat.every) &&
      issue.repeat.every > 0 &&
      ["day", "week", "month", "year"].includes(issue.repeat.unit)
        ? { every: Math.floor(issue.repeat.every), unit: issue.repeat.unit }
        : undefined,
    focusHandledAt:
      typeof issue.focusHandledAt === "string"
        ? issue.focusHandledAt
        : undefined,
    priority: ["low", "medium", "high", "urgent"].includes(
      String(issue.priority),
    )
      ? issue.priority
      : "medium",
    category: typeof issue.category === "string" ? issue.category.trim() : "",
    project: typeof issue.project === "string" ? issue.project.trim() : "",
    service: typeof issue.service === "string" ? issue.service.trim() : "",
    tags: Array.isArray(issue.tags)
      ? [
          ...new Set(
            issue.tags.map((tag) => String(tag).trim()).filter(Boolean),
          ),
        ]
      : [],
    parentId:
      typeof issue.parentId === "string" && issue.parentId !== issue.id
        ? issue.parentId
        : undefined,
    dependencyIds: Array.isArray(issue.dependencyIds)
      ? [
          ...new Set(
            issue.dependencyIds.filter(
              (id) => typeof id === "string" && id !== issue.id,
            ),
          ),
        ]
      : [],
    archivedAt:
      typeof issue.archivedAt === "string" ? issue.archivedAt : undefined,
    /* Early versions promoted a loose keyword match into a permanent timeline entry.
     Those entries were machine guesses rather than user-authored history, so old
     backups and existing browser data are cleaned as they are loaded or merged. */
    updates: Array.isArray(issue.updates)
      ? issue.updates.filter((update) => !isGeneratedRelatedWorkUpdate(update))
      : [],
  }));

const newest = (...values: Array<string | undefined>) =>
  Math.max(0, ...values.map((value) => (value ? Date.parse(value) || 0 : 0)));
const mergeById = <T extends { id: string }>(
  local: T[],
  incoming: T[],
  changedAt: (item: T) => number,
) => {
  const merged = new Map(local.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    const existing = merged.get(item.id);
    if (!existing || changedAt(item) >= changedAt(existing))
      merged.set(item.id, item);
  });
  return [...merged.values()];
};

/* Tombstones are kept for half a year and then forgotten. A device that has been offline
   longer than that will re-add what it still holds — the alternative is a list that grows
   for the life of the app, and six months is far past the point where a returning copy is
   better treated as new data than as a stale opinion about a deletion. */
const DELETION_MEMORY_MS = 180 * 86400000;

const mergeDeletionGroup = (
  local: Record<string, string> = {},
  incoming: Record<string, string> = {},
  cutoff: number,
) => {
  const merged: Record<string, string> = {};
  [local, incoming].forEach((group) =>
    Object.entries(group).forEach(([id, at]) => {
      const when = newest(at);
      if (!when || when < cutoff) return;
      if (!merged[id] || newest(merged[id]) < when) merged[id] = at;
    }),
  );
  return merged;
};

export const mergeDeletions = (
  local: Deletions | undefined,
  incoming: Deletions | undefined,
  now = Date.now(),
): Deletions => {
  const cutoff = now - DELETION_MEMORY_MS;
  const issues = mergeDeletionGroup(local?.issues, incoming?.issues, cutoff);
  const statuses = mergeDeletionGroup(
    local?.statuses,
    incoming?.statuses,
    cutoff,
  );
  const result: Deletions = {};
  if (Object.keys(issues).length) result.issues = issues;
  if (Object.keys(statuses).length) result.statuses = statuses;
  return result;
};

/** The moment a task last changed in any way its owner would recognise. */
export const issueChangedAt = (issue: Issue) =>
  newest(
    issue.createdAt,
    issue.updatedAt,
    issue.completedAt,
    issue.focusHandledAt,
    ...issue.updates.map((update) => update.at),
  );

export type MergeSummary = {
  deletedTasks: number;
  addedTasks: number;
  updatedTasks: number;
  addedDiaryEntries: number;
  updatedDiaryEntries: number;
  addedCheckIns: number;
};

/* Merge imports are deliberately record-based. IDs identify the same record, while
   timestamps decide which copy is newer. Task timelines are merged independently so
   an older task shell can still contribute an update that only exists in one backup. */
export const mergeTransferData = (
  local: TransferPayload,
  incoming: TransferPayload,
) => {
  const localIssues = normaliseIssues(local.issues);
  const incomingIssues = normaliseIssues(incoming.issues);
  const localIssueIds = new Set(localIssues.map((item) => item.id));
  let updatedTasks = 0;
  const issues = mergeById(localIssues, incomingIssues, (issue) =>
    newest(
      issue.createdAt,
      issue.updatedAt,
      issue.completedAt,
      issue.focusHandledAt,
      ...issue.updates.map((update) => update.at),
    ),
  ).map((issue) => {
    const localIssue = localIssues.find((item) => item.id === issue.id);
    const incomingIssue = incomingIssues.find((item) => item.id === issue.id);
    if (!localIssue || !incomingIssue) return issue;
    const updates = mergeById(
      localIssue.updates,
      incomingIssue.updates,
      (update) => newest(update.at),
    ).sort((a, b) => newest(a.at) - newest(b.at));
    const winner =
      newest(
        incomingIssue.createdAt,
        incomingIssue.updatedAt,
        incomingIssue.completedAt,
        incomingIssue.focusHandledAt,
        ...incomingIssue.updates.map((update) => update.at),
      ) >=
      newest(
        localIssue.createdAt,
        localIssue.updatedAt,
        localIssue.completedAt,
        localIssue.focusHandledAt,
        ...localIssue.updates.map((update) => update.at),
      )
        ? incomingIssue
        : localIssue;
    if (
      winner === incomingIssue ||
      updates.length !== localIssue.updates.length
    )
      updatedTasks += 1;
    return { ...winner, updates };
  });

  const deletions = mergeDeletions(local.deletions, incoming.deletions);
  /* Same rule the diary uses: a change made after the deletion outranks it, so a task
     genuinely recreated on the other device survives an old tombstone. */
  const survivingIssues = issues.filter((issue) => {
    const goneAt = deletions.issues?.[issue.id];
    return !goneAt || issueChangedAt(issue) > newest(goneAt);
  });
  const deletedTasks = issues.length - survivingIssues.length;

  const localDiary = local.diaryEntries ?? [];
  const incomingDiary = incoming.diaryEntries ?? [];
  const localDiaryIds = new Set(localDiary.map((item) => item.id));
  let updatedDiaryEntries = 0;
  let diaryEntries = mergeById(localDiary, incomingDiary, (item) =>
    newest(item.updatedAt, item.at),
  );
  incomingDiary.forEach((item) => {
    const prior = localDiary.find((entry) => entry.id === item.id);
    if (
      prior &&
      newest(item.updatedAt, item.at) >= newest(prior.updatedAt, prior.at)
    )
      updatedDiaryEntries += 1;
  });
  const diaryLog = mergeById(
    local.diaryLog ?? [],
    incoming.diaryLog ?? [],
    (item) => newest(item.at),
  ).sort((a, b) => newest(a.at) - newest(b.at));
  diaryEntries = diaryEntries.filter((entry) => {
    const deletion = diaryLog
      .filter(
        (event) => event.entryId === entry.id && event.action === "deleted",
      )
      .sort((a, b) => newest(b.at) - newest(a.at))[0];
    return !deletion || newest(entry.updatedAt, entry.at) > newest(deletion.at);
  });
  const localCheckIns = local.dailyCheckIns ?? [];
  const dailyCheckIns = mergeById(
    localCheckIns,
    incoming.dailyCheckIns ?? [],
    (item) => newest(item.at),
  ).sort((a, b) => newest(b.at) - newest(a.at));
  /* A status is only really gone if nothing is left standing on it. Dropping one that a
     surviving task still uses would leave that task pointing at a status the app does not
     know about, which is worse than a stray name in the list. */
  const statusesInUse = new Set(survivingIssues.map((issue) => issue.status));
  const statuses = [
    ...new Set([...local.statuses, ...incoming.statuses]),
  ].filter((name) => !deletions.statuses?.[name] || statusesInUse.has(name));

  return {
    payload: {
      ...local,
      version: 2 as const,
      issues: survivingIssues,
      statuses,
      deletions,
      statusColors: { ...incoming.statusColors, ...local.statusColors },
      diaryEntries,
      diaryLog,
      dailyCheckIns,
      exportedAt: new Date().toISOString(),
    },
    summary: {
      deletedTasks,
      addedTasks: incomingIssues.filter(
        (item) =>
          !localIssueIds.has(item.id) &&
          survivingIssues.some((issue) => issue.id === item.id),
      ).length,
      updatedTasks,
      addedDiaryEntries: incomingDiary.filter(
        (item) =>
          !localDiaryIds.has(item.id) &&
          diaryEntries.some((entry) => entry.id === item.id),
      ).length,
      updatedDiaryEntries,
      addedCheckIns: dailyCheckIns.filter(
        (item) => !localCheckIns.some((localItem) => localItem.id === item.id),
      ).length,
    } satisfies MergeSummary,
  };
};
