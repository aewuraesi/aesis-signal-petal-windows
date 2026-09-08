import { test } from "node:test";
import assert from "node:assert/strict";

import { detectThemes, statedNeed, moodName, describeDiaryChange, signatureWords, partOfDay, yearGrid, diarySuggestion } from "../app/diary.ts";

const entry = overrides => ({ id: "d1", at: "2026-08-21T18:00:00.000Z", title: "", text: "", mood: "okay", suggestion: "", ...overrides });

test("a negator immediately before a phrase cancels the theme", () => {
  /* "I am not exhausted" is not exhaustion. The window is the 26 characters
     before the match, which is what makes this cheap and good enough. */
  assert.ok(detectThemes("i am exhausted").some(theme => theme.id === "exhaustion"));
  assert.ok(!detectThemes("i am not exhausted").some(theme => theme.id === "exhaustion"));
});

test("themes come back strongest first", () => {
  const themes = detectThemes("blocked, still blocked, waiting on them again and completely blocked");
  assert.ok(themes.length > 0);
  assert.deepEqual(themes.map(theme => theme.score), [...themes.map(theme => theme.score)].sort((a, b) => b - a));
});

test("a stated need is pulled out in the writer's own words", () => {
  assert.match(statedNeed("Long day. I need to stop taking the handover cold. Anyway."), /stop taking the handover cold/);
  assert.equal(statedNeed("Nothing much happened today."), "");
});

test("mood names are stable and unknown moods fall back", () => {
  assert.equal(moodName("bright"), "Bright");
  assert.equal(moodName("nonsense"), "Okay");
});

test("a change log line says what actually changed", () => {
  const before = entry({ title: "Long day", text: "one two three", mood: "low", issueIds: [] });
  const line = describeDiaryChange(before, { title: "Long day", text: "one two three four", mood: "calm", issueIds: ["i1"] });
  assert.match(line, /mood low → calm/);
  assert.match(line, /linked to 1 more task/);
  assert.match(line, /1 word added/);
});

test("saving without touching anything says so rather than inventing a change", () => {
  const before = entry({ title: "Long day", text: "same words", mood: "low", issueIds: [] });
  assert.equal(describeDiaryChange(before, { title: "Long day", text: "same words", mood: "low", issueIds: [] }), "opened and saved without changes");
});

test("signature words need five letters and two sightings", () => {
  const words = signatureWords([
    entry({ text: "handover handover rota" }),
    entry({ id: "d2", text: "handover again and the rota" }),
  ]).map(([word]) => word);
  assert.ok(words.includes("handover"));
  assert.ok(!words.includes("rota"), "four letters is noise, not signature");
});

test("late night wraps around midnight", () => {
  assert.equal(partOfDay(23).id, "night");
  assert.equal(partOfDay(2).id, "night");
  assert.equal(partOfDay(9).id, "early");
});

test("the year grid has twelve months and a real February", () => {
  const grid = yearGrid([], 2027);
  assert.equal(grid.length, 12);
  assert.equal(grid[1].days.length, 28);
  assert.equal(yearGrid([], 2028)[1].days.length, 29);
});

test("the crisis branch answers first and offers no productivity advice", () => {
  /* Never let a theme override this, and never demote it below theme detection. */
  const reply = diarySuggestion("low", "i want to die and nothing is working", "", []);
  assert.match(reply, /crisis line|emergency/i);
  assert.ok(!/next step|smallest practical action/i.test(reply));
});

test("a reflection is the same every time it is rendered", () => {
  const text = "Blocked on the same handover again. I need to write the runbook down.";
  assert.equal(diarySuggestion("low", text, "", []), diarySuggestion("low", text, "", []));
});
