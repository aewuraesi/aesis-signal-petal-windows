"use client";
import { useState } from "react";

export default function WorkspaceEncryption({
  recoveryKey,
  onEnable,
  onDisable,
  onImport,
}: {
  recoveryKey: string;
  onEnable: () => void;
  onDisable: () => void;
  onImport: (key: string) => boolean;
}) {
  const enabled = Boolean(recoveryKey);
  const [candidate, setCandidate] = useState("");
  const [message, setMessage] = useState("");
  return (
    <article className="settings-card">
      <p className="eyebrow">WORKSPACE ENCRYPTION</p>
      <h2>
        {enabled ? "Cloud data is encrypted" : "Encrypt synced workspace"}
      </h2>
      <p>
        {enabled
          ? "The server receives ciphertext only. Keep the recovery key somewhere safe; another device needs it to open the workspace."
          : "Protect tasks, settings, check-ins, and diary data before they leave this device."}
      </p>
      {enabled && (
        <label>
          Recovery key
          <textarea
            readOnly
            value={recoveryKey}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      {!enabled && (
        <label>
          Already have a recovery key?
          <input
            value={candidate}
            onChange={(event) => setCandidate(event.target.value.trim())}
            placeholder="Paste recovery key"
          />
          <button
            className="secondary"
            type="button"
            onClick={() => {
              const accepted = onImport(candidate);
              setMessage(
                accepted
                  ? "Recovery key saved. Sync will unlock now."
                  : "That recovery key is not in the expected format.",
              );
              if (accepted) setCandidate("");
            }}
          >
            Use recovery key
          </button>
        </label>
      )}
      {message && <p role="status">{message}</p>}
      <button
        className={enabled ? "delete" : "secondary"}
        type="button"
        onClick={enabled ? onDisable : onEnable}
      >
        {enabled ? "Turn off encryption" : "Create recovery key and encrypt"}
      </button>
    </article>
  );
}
