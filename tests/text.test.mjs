import { test } from "node:test";
import assert from "node:assert/strict";

import { titleCaseName, peopleFromInput, tidy, clip, safeMemoryPreview, quote, pickFrom, wordCount } from "../app/text.ts";

test("a name is capitalised without changing its length", () => {
  /* The caret sits at a character offset while someone is still typing, so a
     replacement that grew or shrank the string would move it. */
  const typed = "maya chen";
  assert.equal(titleCaseName(typed), "Maya Chen");
  assert.equal(titleCaseName(typed).length, typed.length);
});

test("apostrophes and hyphens stay inside the name", () => {
  assert.equal(titleCaseName("o'brien"), "O'Brien");
  assert.equal(titleCaseName("ana-maria"), "Ana-Maria");
  assert.equal(titleCaseName("kwame osei-tutu"), "Kwame Osei-Tutu");
});

test("the same person typed twice is one person", () => {
  assert.deepEqual(peopleFromInput("maya chen, Maya Chen; kofi"), ["Maya Chen", "Kofi"]);
});

test("people can be separated by commas, semicolons or newlines", () => {
  assert.deepEqual(peopleFromInput("ama\nkofi; yaa,  "), ["Ama", "Kofi", "Yaa"]);
});

test("tidy collapses whitespace and strips leading and trailing punctuation", () => {
  assert.equal(tidy("  and   then ,  it broke.  "), "and   then ,  it broke".replace(/\s+/g, " "));
  assert.equal(tidy("— it broke."), "it broke");
});

test("clip cuts on a word boundary and marks the cut", () => {
  const clipped = clip("the certificate rotation failed again this morning", 20);
  assert.ok(clipped.endsWith("…"));
  assert.ok(clipped.length <= 20);
  assert.ok(!clipped.includes("  "));
});

test("clip leaves a short value exactly as it was", () => {
  assert.equal(clip("short", 20), "short");
});

test("a memory preview drops links and IP addresses", () => {
  const preview = safeMemoryPreview("saw it at https://grafana.internal/d/abc on 10.24.8.19 all morning");
  assert.ok(!preview.includes("grafana"));
  assert.ok(!preview.includes("10.24.8.19"));
  assert.ok(preview.includes("[link]"));
  assert.ok(preview.includes("[technical detail]"));
});

test("a quote that already ends in punctuation does not gain a full stop", () => {
  assert.equal(quote("what now?"), "“what now?”");
  assert.equal(quote("it broke"), "“it broke.”");
});

test("a clipped quote is not given a fourth dot", () => {
  assert.equal(quote("still going…"), "“still going…”");
});

test("pickFrom is stable for one seed and spreads across many", () => {
  const options = ["a", "b", "c", "d"];
  assert.equal(pickFrom(options, "same"), pickFrom(options, "same"));
  const spread = new Set(Array.from({ length: 40 }, (_, i) => pickFrom(options, `seed-${i}`)));
  assert.ok(spread.size > 1, "one seed per entry should not always land on the same option");
});

test("word count ignores padding and empty text", () => {
  assert.equal(wordCount("  three  little   words "), 3);
  assert.equal(wordCount("   "), 0);
});
