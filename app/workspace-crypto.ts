import type { TransferPayload } from "./backup.ts";

export type WorkspaceEnvelope = {
  version: 1;
  encrypted: true;
  iv: string;
  data: string;
};
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const decode = (value: string) =>
  Uint8Array.from(
    atob(
      value.replaceAll("-", "+").replaceAll("_", "/") +
        "===".slice((value.length + 3) % 4),
    ),
    (char) => char.charCodeAt(0),
  );
const keyFromRecovery = (recoveryKey: string) =>
  crypto.subtle.importKey(
    "raw",
    decode(recoveryKey),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

export const createRecoveryKey = () =>
  encode(crypto.getRandomValues(new Uint8Array(32)));
export const isWorkspaceEnvelope = (
  value: unknown,
): value is WorkspaceEnvelope => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WorkspaceEnvelope>;
  return (
    item.version === 1 &&
    item.encrypted === true &&
    typeof item.iv === "string" &&
    typeof item.data === "string"
  );
};
export const sealWorkspace = async (
  recoveryKey: string,
  payload: TransferPayload,
): Promise<WorkspaceEnvelope> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await keyFromRecovery(recoveryKey),
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    version: 1,
    encrypted: true,
    iv: encode(iv),
    data: encode(new Uint8Array(data)),
  };
};
export const openWorkspace = async (
  recoveryKey: string,
  envelope: WorkspaceEnvelope,
): Promise<TransferPayload> => {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(envelope.iv) },
    await keyFromRecovery(recoveryKey),
    decode(envelope.data),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as TransferPayload;
};
