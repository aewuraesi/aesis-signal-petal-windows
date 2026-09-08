/* Every read and write of the browser's storage goes through here.

   This app keeps everything in one place — the browser — so storage refusing a write is not
   an edge case, it is THE failure mode. Before this existed, a single refusal threw out of a
   React effect and took the whole app down with it: the writer got the browser's own "This
   page couldn't load", lost the change, and was told nothing about why.

   So: nothing here ever throws. A write says whether it worked, a failure is remembered, and
   the UI reads that through an external store — the same shape the notification permission
   uses, and for the same reason: the truth lives outside React and has to be asked for. */

export type StorageTrouble = { reason: "full" | "blocked"; keys: string[] } | null;

const failed = new Map<string, "full" | "blocked">();
const listeners = new Set<() => void>();

/* useSyncExternalStore compares snapshots by identity, so the same object has to come back
   until something actually changes. */
let snapshot: StorageTrouble = null;

const rebuild = () => {
  if (!failed.size) { snapshot = null; return; }
  const keys = [...failed.keys()].sort();
  /* "Blocked" is the worse news — nothing can be saved at all — so it wins the wording when
     both have happened. */
  const reason = [...failed.values()].includes("blocked") ? "blocked" : "full";
  snapshot = { reason, keys };
};

const announce = () => { rebuild(); listeners.forEach(listener => listener()); };

/* Chrome, Firefox and Safari all name this differently, and Safari in private browsing throws
   a quota error for a write of any size — which is really "blocked", but it is indistinguishable
   from a full disk and the advice is the same either way. */
const isQuota = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || error.code === 22);

export const storageStore = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  },
  getSnapshot: () => snapshot,
  /* Nothing has been written on the server, so there is never trouble to report there. */
  getServerSnapshot: (): StorageTrouble => null,
};

const remember = (key: string, error: unknown) => {
  const reason = isQuota(error) ? "full" : "blocked";
  if (failed.get(key) === reason) return;
  failed.set(key, reason);
  announce();
};

/* A key is only forgiven when that same key saves again. Clearing on any successful write
   would let a harmless one — the theme, say — hide the fact that the task list is not saving. */
const forgive = (key: string) => {
  if (!failed.delete(key)) return;
  announce();
};

export const readStore = (key: string) => {
  try { return localStorage.getItem(key); }
  catch (error) { remember(key, error); return null; }
};

/** Returns false when the value did not reach storage. Never throws. */
export const writeStore = (key: string, value: string) => {
  try { localStorage.setItem(key, value); forgive(key); return true; }
  catch (error) { remember(key, error); return false; }
};

export const dropStore = (key: string) => {
  /* Forget what was last written under this key, or a later save of the same value
     would be skipped as unchanged and the key would stay empty. */
  lastWritten.delete(key);
  pending.delete(key);
  try { localStorage.removeItem(key); forgive(key); return true; }
  catch (error) { remember(key, error); return false; }
};

/** For tests and for a writer who has freed some space and wants the warning to go away. */
export const clearStorageTrouble = () => {
  if (!failed.size) return;
  failed.clear();
  announce();
};

/* ---------------------------------------------------------------------------
   Writing less often.

   Every keystroke in a task used to stringify the whole issue list and hand the
   whole string to localStorage. That is fine at 60 tasks and wasteful at 900, and
   the waste lands on the slowest thing in the app. So the big lists are queued
   instead: the value is produced once the typing stops, and skipped entirely when
   it has not actually changed since the last save.

   The debounce is the risk — a tab closed inside the window would lose the last
   change — so anything queued is flushed the moment the page is hidden.
--------------------------------------------------------------------------- */
const SAVE_DELAY_MS = 500;
const pending = new Map<string, () => string>();
const lastWritten = new Map<string, string>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const flushSaves = () => {
  if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
  if (!pending.size) return;
  const jobs = [...pending];
  pending.clear();
  jobs.forEach(([key, produce]) => {
    const value = produce();
    /* Unchanged means nothing to do — and a refused write is deliberately not
       remembered, so the next attempt tries again rather than assuming it landed. */
    if (lastWritten.get(key) === value) return;
    if (writeStore(key, value)) lastWritten.set(key, value);
  });
  remeasure(true);
};

/** Queue a value to be saved once the writer stops typing. Never throws. */
export const saveLater = (key: string, produce: () => string) => {
  pending.set(key, produce);
  if (saveTimer !== null) return;
  saveTimer = setTimeout(() => { saveTimer = null; flushSaves(); }, SAVE_DELAY_MS);
};

if (typeof window !== "undefined") {
  /* pagehide covers the back/forward cache and mobile Safari, where unload never fires. */
  window.addEventListener("pagehide", flushSaves);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSaves(); });
}

/* ---------------------------------------------------------------------------
   How much room is left.

   Browsers give localStorage a few megabytes and refuse writes with no warning
   once it is gone. The app already recovers from that refusal without losing the
   session; this is the part that lets the writer see it coming.
--------------------------------------------------------------------------- */
const KEY_PREFIX = "signal-petal-";
/* Five megabytes is the common limit across Chrome, Firefox and Safari, and values are
   stored as UTF-16 — so each character costs two bytes, not one. Being wrong by a
   little is fine here: it is a warning, not an accounting. */
export const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024;

export const measureStorage = () => {
  try {
    let bytes = 0;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      bytes += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
    }
    return bytes;
  } catch { return 0; }
};

let measuredBytes = 0;
let measuredAt = 0;
function remeasure(force = false) {
  const now = Date.now();
  if (!force && now - measuredAt < 2000) return;
  measuredAt = now;
  const next = measureStorage();
  if (next === measuredBytes) return;
  measuredBytes = next;
  listeners.forEach(listener => listener());
}

/* A number, not an object: useSyncExternalStore compares snapshots by identity. */
export const headroomStore = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  },
  getSnapshot: () => measuredBytes,
  getServerSnapshot: () => 0,
};

export const readHeadroom = () => { remeasure(true); return measuredBytes; };
