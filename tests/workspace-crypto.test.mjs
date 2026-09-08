import test from "node:test";
import assert from "node:assert/strict";
import {
  createRecoveryKey,
  isWorkspaceEnvelope,
  openWorkspace,
  sealWorkspace,
} from "../app/workspace-crypto.ts";

const payload = {
  version: 2,
  issues: [],
  statuses: ["New", "Resolved"],
  statusColors: { New: "#000" },
};

test("a recovery key encrypts and opens a complete workspace", async () => {
  const key = createRecoveryKey();
  const sealed = await sealWorkspace(key, payload);
  assert.equal(isWorkspaceEnvelope(sealed), true);
  assert.equal(JSON.stringify(sealed).includes("Resolved"), false);
  assert.deepEqual(await openWorkspace(key, sealed), payload);
});

test("a different recovery key cannot open the workspace", async () => {
  const sealed = await sealWorkspace(createRecoveryKey(), payload);
  await assert.rejects(() => openWorkspace(createRecoveryKey(), sealed));
});
