/* Shared shapes and the backup codec.

   This lives outside the page component so the restore path — the one action that
   replaces everything in the app — can be exercised by the test suite. */

export type Status = string;
export type Entry = { id: string; at: string; text: string; author: string };
export type Profile = { name: string; role: string };
export type Issue = {
  id: string; title: string; details: string; owner: string; action: string;
  expected: string; createdAt: string; updatedAt?: string; completedAt?: string; focusHandledAt?: string; status: Status; outcome: string; followUpPeople: string[]; updates: Entry[];
  memory?: { symptoms: string; rootCause: string; resolution: string; learning: string; followUp: string };
  relatedIssueIds?: string[];
};
export type Mood = "bright" | "calm" | "okay" | "low" | "anxious" | "frustrated";
export type DiaryEntry = { id: string; at: string; title: string; text: string; mood: Mood; suggestion: string; updatedAt?: string; issueIds?: string[] };
export type DiaryAction = "created" | "edited" | "deleted";
/* Diary events live in their own list rather than on the entry, so the record of a
   reflection having existed — and been reworked — survives deleting the entry itself. */
export type DiaryEvent = { id: string; entryId: string; at: string; action: DiaryAction; title: string; mood: Mood; detail: string };
export type DiaryVault = { salt: string; iv: string; data: string };
export type DailyCheckIn = { id: string; at: string; capacity: "high" | "steady" | "low"; note: string; parkedIssueIds: string[]; brief: string };
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
  settings?: { theme?: string; darkMode?: boolean; reminderTime?: string; diaryFont?: string; diaryPaper?: string };
  exportedAt?: string;
};
export const encodeTransfer = (payload: TransferPayload) => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};
export const decodeTransfer = (value: string) => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as TransferPayload;
};
export const backupFileName = () => { const now = new Date(); return `signal-petal-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.json`; };

/* The single gate every restore goes through, whatever the source. */
export const isValidPayload = (payload: unknown): payload is TransferPayload => {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as TransferPayload;
  return (candidate.version === 1 || candidate.version === 2)
    && Array.isArray(candidate.issues)
    && Array.isArray(candidate.statuses)
    && !!candidate.statusColors
    && typeof candidate.statusColors === "object";
};

/* Restoring an old backup must not produce an issue with no followUpPeople array,
   which every consumer indexes into without checking. */
export const normaliseIssues = (issues: Issue[]) => issues.map(issue => ({ ...issue, followUpPeople: Array.isArray(issue.followUpPeople) ? issue.followUpPeople : [], focusHandledAt: typeof issue.focusHandledAt === "string" ? issue.focusHandledAt : undefined }));

const newest = (...values: Array<string | undefined>) => Math.max(0, ...values.map(value => value ? Date.parse(value) || 0 : 0));
const mergeById = <T extends { id: string }>(local: T[], incoming: T[], changedAt: (item: T) => number) => {
  const merged = new Map(local.map(item => [item.id, item]));
  incoming.forEach(item => {
    const existing = merged.get(item.id);
    if (!existing || changedAt(item) >= changedAt(existing)) merged.set(item.id, item);
  });
  return [...merged.values()];
};

export type MergeSummary = { addedTasks: number; updatedTasks: number; addedDiaryEntries: number; updatedDiaryEntries: number; addedCheckIns: number };

/* Merge imports are deliberately record-based. IDs identify the same record, while
   timestamps decide which copy is newer. Task timelines are merged independently so
   an older task shell can still contribute an update that only exists in one backup. */
export const mergeTransferData = (local: TransferPayload, incoming: TransferPayload) => {
  const localIssues = normaliseIssues(local.issues);
  const incomingIssues = normaliseIssues(incoming.issues);
  const localIssueIds = new Set(localIssues.map(item => item.id));
  let updatedTasks = 0;
  const issues = mergeById(localIssues, incomingIssues, issue => newest(issue.createdAt, issue.updatedAt, issue.completedAt, issue.focusHandledAt, ...issue.updates.map(update => update.at))).map(issue => {
    const localIssue = localIssues.find(item => item.id === issue.id);
    const incomingIssue = incomingIssues.find(item => item.id === issue.id);
    if (!localIssue || !incomingIssue) return issue;
    const updates = mergeById(localIssue.updates, incomingIssue.updates, update => newest(update.at)).sort((a, b) => newest(a.at) - newest(b.at));
    const winner = newest(incomingIssue.createdAt, incomingIssue.updatedAt, incomingIssue.completedAt, incomingIssue.focusHandledAt, ...incomingIssue.updates.map(update => update.at)) >= newest(localIssue.createdAt, localIssue.updatedAt, localIssue.completedAt, localIssue.focusHandledAt, ...localIssue.updates.map(update => update.at)) ? incomingIssue : localIssue;
    if (winner === incomingIssue || updates.length !== localIssue.updates.length) updatedTasks += 1;
    return { ...winner, updates };
  });

  const localDiary = local.diaryEntries ?? [];
  const incomingDiary = incoming.diaryEntries ?? [];
  const localDiaryIds = new Set(localDiary.map(item => item.id));
  let updatedDiaryEntries = 0;
  let diaryEntries = mergeById(localDiary, incomingDiary, item => newest(item.updatedAt, item.at));
  incomingDiary.forEach(item => { const prior = localDiary.find(entry => entry.id === item.id); if (prior && newest(item.updatedAt, item.at) >= newest(prior.updatedAt, prior.at)) updatedDiaryEntries += 1; });
  const diaryLog = mergeById(local.diaryLog ?? [], incoming.diaryLog ?? [], item => newest(item.at)).sort((a, b) => newest(a.at) - newest(b.at));
  diaryEntries = diaryEntries.filter(entry => {
    const deletion = diaryLog.filter(event => event.entryId === entry.id && event.action === "deleted").sort((a, b) => newest(b.at) - newest(a.at))[0];
    return !deletion || newest(entry.updatedAt, entry.at) > newest(deletion.at);
  });
  const localCheckIns = local.dailyCheckIns ?? [];
  const dailyCheckIns = mergeById(localCheckIns, incoming.dailyCheckIns ?? [], item => newest(item.at)).sort((a, b) => newest(b.at) - newest(a.at));
  const statuses = [...new Set([...local.statuses, ...incoming.statuses])];

  return {
    payload: { ...local, version: 2 as const, issues, statuses, statusColors: { ...incoming.statusColors, ...local.statusColors }, diaryEntries, diaryLog, dailyCheckIns, exportedAt: new Date().toISOString() },
    summary: {
      addedTasks: incomingIssues.filter(item => !localIssueIds.has(item.id)).length,
      updatedTasks,
      addedDiaryEntries: incomingDiary.filter(item => !localDiaryIds.has(item.id) && diaryEntries.some(entry => entry.id === item.id)).length,
      updatedDiaryEntries,
      addedCheckIns: dailyCheckIns.filter(item => !localCheckIns.some(localItem => localItem.id === item.id)).length,
    } satisfies MergeSummary,
  };
};
