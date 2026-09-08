import { existsSync } from "node:fs";
import assert from "node:assert/strict";
assert.equal(
  existsSync("dist/server/index.js"),
  true,
  "Build the web application first.",
);
assert.equal(
  existsSync("dist/client/sw.js"),
  true,
  "Desktop package needs the client assets.",
);
assert.equal(existsSync("desktop/main.cjs"), true);
console.log("Desktop package inputs are ready.");
