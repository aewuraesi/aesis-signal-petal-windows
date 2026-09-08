import { test } from "node:test";
import assert from "node:assert/strict";

import { findLinks, splitLinks, linkLabel, issueLinks } from "../app/links.ts";

test("a link is found in the middle of a sentence", () => {
  assert.deepEqual(findLinks("dashboard is at https://grafana.internal/d/abc123 if you need it"), ["https://grafana.internal/d/abc123"]);
});

test("a full stop ending the sentence is not part of the link", () => {
  assert.deepEqual(findLinks("see https://example.com/runbook."), ["https://example.com/runbook"]);
  assert.deepEqual(findLinks("(https://example.com/a)"), ["https://example.com/a"]);
});

test("only http and https are ever recognised", () => {
  /* Turning arbitrary pasted text into a live link is how a log line becomes a hazard. */
  assert.deepEqual(findLinks("javascript:alert(1) and data:text/html,<b>x and file:///etc/passwd"), []);
});

test("splitting keeps every character of the original text", () => {
  const text = "start https://example.com/a, then https://example.com/b. done";
  assert.equal(splitLinks(text).map(part => part.value).join(""), text);
  assert.deepEqual(splitLinks(text).filter(part => part.kind === "link").map(part => part.value),
    ["https://example.com/a", "https://example.com/b"]);
});

test("text with no link comes back as one plain run", () => {
  assert.deepEqual(splitLinks("nothing to click here"), [{ kind: "text", value: "nothing to click here" }]);
});

test("a label is short enough to sit in a chip", () => {
  assert.equal(linkLabel("https://www.grafana.internal/d/abc123/"), "grafana.internal/abc123");
  assert.equal(linkLabel("https://example.com"), "example.com");
  assert.ok(linkLabel(`https://example.com/${"x".repeat(200)}`).length <= 44);
});

test("a task's links are gathered from everywhere they were written, without repeats", () => {
  const links = issueLinks({
    id: "i1", title: "t", details: "graph https://a.example/1", owner: "", action: "https://b.example/2",
    expected: "", createdAt: "", status: "Ongoing", outcome: "https://a.example/1", followUpPeople: [],
    updates: [{ id: "u1", at: "", author: "", text: "ticket https://c.example/3" }],
    memory: { symptoms: "", rootCause: "", resolution: "https://d.example/4", learning: "", followUp: "" },
  });
  /* Order follows where they were written: details, action, outcome, the timeline, then
     what was learned — so the newest thinking is last rather than first. */
  assert.deepEqual(links, ["https://a.example/1", "https://b.example/2", "https://c.example/3", "https://d.example/4"]);
});
