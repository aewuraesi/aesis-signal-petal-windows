import { test } from "node:test";
import assert from "node:assert/strict";

import { professionalTone, professionalLine, renderBlocks, overdueSpan } from "../app/summary.ts";

/* The contract is tidying, never rewriting. Each case below is a line someone might really
   type into the tracker, paired with what should reach a work channel. */
const cases = [
  ["I need to fix the payment queue!!!", "Fix the payment queue"],
  ["don't forget to pull the Q3 logs", "Pull the Q3 logs"],
  ["TODO: write the runbook", "Write the runbook"],
  ["I'll post the forms tomorrow", "Post the forms tomorrow"],
  ["- sorted out the vendor form", "Sorted out the vendor form"],
  ["payment queue backing up 😩😩", "Payment queue backing up"],
  ["shipped it ugh", "Shipped it"],
  ["done!! yay!!", "Done"],
  ["  spaced   out    text  ", "Spaced out text"],
  ["Backlog cleared; failed charges now retry on a three-step schedule.", "Backlog cleared; failed charges now retry on a three-step schedule"],
];
for (const [raw, expected] of cases) {
  test(`tidies ${JSON.stringify(raw)}`, () => assert.equal(professionalTone(raw), expected));
}

/* The rules must never make a line worse, so anything already fit to send comes back
   byte-identical — including acronyms, identifiers and meaningful trailing words. */
const untouched = [
  "SSO rollout for the contractor accounts",
  "checkout-api latency spike",
  "Kafka consumer lag again",
  "Q3 access log review",
  "Chase Francis for the IdP metadata",
  "Renewed the TLS certificate ahead of expiry",
];
for (const line of untouched) {
  test(`leaves ${JSON.stringify(line)} alone`, () => assert.equal(professionalTone(line), line));
}

test("never returns nothing when there was something", () => {
  // If every rule fires the line still has to survive — an empty bullet is worse than a scruffy one.
  assert.equal(professionalTone("lol!!!"), "lol!");
  assert.equal(professionalTone("ugh"), "ugh");
  assert.equal(professionalTone("   "), "");
  assert.equal(professionalTone(""), "");
});

test("the writer's own shareable line wins over the raw title and outcome", () => {
  assert.equal(
    professionalLine({ shareable: "TLS certificate rotation completed ahead of expiry", title: "the cert thing", outcome: "renewed it" }),
    "TLS certificate rotation completed ahead of expiry",
  );
  assert.equal(professionalLine({ shareable: "   ", title: "the cert thing", outcome: "renewed it" }), "The cert thing — Renewed it");
  assert.equal(professionalLine({ title: "the cert thing" }), "The cert thing");
});

test("an empty block leaves no heading behind", () => {
  assert.equal(
    renderBlocks([{ heading: "Delivered", items: ["• One"] }, { heading: "In progress", items: [] }, { heading: "", items: ["No blockers."] }]),
    "Delivered\n• One\n\nNo blockers.",
  );
  assert.equal(renderBlocks([{ heading: "Delivered", items: [] }]), "");
});

test("day counts read as English", () => {
  assert.equal(overdueSpan(1), "1 day");
  assert.equal(overdueSpan(5), "5 days");
});
