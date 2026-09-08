import { test } from "node:test";
import assert from "node:assert/strict";

import { sectionFromHash, hashForSection, SECTIONS } from "../app/routing.ts";

test("a hash names a screen, with or without the slash", () => {
  assert.equal(sectionFromHash("#diary"), "diary");
  assert.equal(sectionFromHash("#/diary"), "diary");
  assert.equal(sectionFromHash("#Diary"), "diary");
});

test("a hash that names nothing this app knows is ignored", () => {
  /* Anyone can put anything after a #; it must not be able to blank the screen. */
  assert.equal(sectionFromHash("#nonsense"), null);
  assert.equal(sectionFromHash(""), null);
  assert.equal(sectionFromHash("#"), null);
});

test("the dashboard gets the bare address so a shared link is the short one", () => {
  assert.equal(hashForSection("dashboard"), "");
});

test("every screen survives a round trip through the address bar", () => {
  SECTIONS.filter(section => section !== "dashboard").forEach(section => {
    assert.equal(sectionFromHash(hashForSection(section)), section, `${section} did not come back`);
  });
});
