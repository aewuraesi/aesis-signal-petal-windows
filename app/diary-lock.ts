import { readStore } from "./storage.ts";
import type { DiaryEntry, DiaryEvent, DiaryVault } from "./backup.ts";

/* ---------------------------------------------------------------------------
   Optional diary lock. AES-GCM with a key derived from the passphrase by PBKDF2.
   The key is never written anywhere — it lives in memory for the session only —
   so there is deliberately no recovery path if the passphrase is lost.
--------------------------------------------------------------------------- */
export const LOCK_ITERATIONS = 250000;

export const toB64 = (bytes: Uint8Array) => { let binary = ""; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary); };

export const fromB64 = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));

export const deriveDiaryKey = async (passphrase: string, salt: Uint8Array) => {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: LOCK_ITERATIONS, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
};

export const sealDiary = async (key: CryptoKey, salt: string, entries: DiaryEntry[], log: DiaryEvent[]): Promise<DiaryVault> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(JSON.stringify({ entries, log })) as unknown as BufferSource);
  return { salt, iv: toB64(iv), data: toB64(new Uint8Array(sealed)) };
};

export const openDiaryVault = async (key: CryptoKey, vault: DiaryVault) => {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(vault.iv) as unknown as BufferSource }, key, fromB64(vault.data) as unknown as BufferSource);
  const payload = JSON.parse(new TextDecoder().decode(plain)) as { entries: DiaryEntry[]; log: DiaryEvent[] };
  return { entries: Array.isArray(payload.entries) ? payload.entries : [], log: Array.isArray(payload.log) ? payload.log : [] };
};

export const readStoredVault = (): DiaryVault | null => {
  const raw = readStore("signal-petal-diary-vault");
  if (!raw) return null;
  try { const parsed = JSON.parse(raw) as DiaryVault; return parsed?.salt && parsed?.iv && parsed?.data ? parsed : null; } catch { return null; }
};
