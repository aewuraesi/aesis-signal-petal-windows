import type { TransferPayload } from "./backup";

export type RecoveryPoint = { id: string; at: string; reason: string; payload: TransferPayload };
const DATABASE = "signal-petal-recovery";
const STORE = "points";
const MAX_POINTS = 7;

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const allPoints = async (database: IDBDatabase) => new Promise<RecoveryPoint[]>((resolve, reject) => {
  const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
  request.onsuccess = () => resolve((request.result as RecoveryPoint[]).sort((a, b) => b.at.localeCompare(a.at)));
  request.onerror = () => reject(request.error);
});

export const listRecoveryPoints = async () => {
  if (typeof indexedDB === "undefined") return [];
  const database = await openDatabase();
  try { return await allPoints(database); } finally { database.close(); }
};

export const saveRecoveryPoint = async (payload: TransferPayload, reason = "Automatic recovery point") => {
  if (typeof indexedDB === "undefined") return [];
  const database = await openDatabase();
  try {
    const points = await allPoints(database);
    const day = new Date().toISOString().slice(0, 10);
    const existing = points.find(point => point.id === day);
    const point: RecoveryPoint = { id: day, at: new Date().toISOString(), reason, payload };
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE, "readwrite").objectStore(STORE).put(point);
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
    const next = [point, ...points.filter(item => item.id !== existing?.id)].sort((a, b) => b.at.localeCompare(a.at));
    for (const old of next.slice(MAX_POINTS)) await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE, "readwrite").objectStore(STORE).delete(old.id);
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
    return next.slice(0, MAX_POINTS);
  } finally { database.close(); }
};
