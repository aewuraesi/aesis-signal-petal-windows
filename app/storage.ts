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
  try { localStorage.removeItem(key); forgive(key); return true; }
  catch (error) { remember(key, error); return false; }
};

/** For tests and for a writer who has freed some space and wants the warning to go away. */
export const clearStorageTrouble = () => {
  if (!failed.size) return;
  failed.clear();
  announce();
};
