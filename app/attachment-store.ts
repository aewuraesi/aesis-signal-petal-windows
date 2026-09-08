const DATABASE = "signal-petal-files";
const STORE = "attachments";

const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ?? new Error("Attachment storage could not be opened."),
      );
  });

const run = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) => {
  const db = await database();
  const request = action(db.transaction(STORE, mode).objectStore(STORE));
  const result = await new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
};

export const storeAttachment = (id: string, blob: Blob) =>
  run("readwrite", (store) => store.put(blob, id));
export const readAttachment = (id: string) =>
  run<Blob | undefined>("readonly", (store) => store.get(id));
export const deleteAttachment = (id: string) =>
  run("readwrite", (store) => store.delete(id));
export const dataUrlBlob = async (dataUrl: string) =>
  (await fetch(dataUrl)).blob();
export const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
export const base64Blob = (data: string, mimeType: string) => {
  const binary = atob(data);
  return new Blob(
    [Uint8Array.from(binary, (character) => character.charCodeAt(0))],
    { type: mimeType },
  );
};
