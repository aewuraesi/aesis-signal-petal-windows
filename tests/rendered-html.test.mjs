import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Signal Petal workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Aesi&#x27;s Signal Petal — SRE Work Tracker<\/title>/i);
  assert.match(html, /A private local workspace for SRE issue tracking and follow-ups\./i);
  assert.match(html, /Signal Petal/);
  assert.match(html, /Dashboard/);
  assert.match(html, /Log\/Track/);
  assert.match(html, /Open work/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps private diary intelligence and long task content contained", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /YOUR RECENT PULSE/);
  assert.match(page, /WHAT INFLUENCED THE PAGE/);
  assert.match(page, /PRIVATE WEEKLY REFLECTION/);
  assert.match(page, /SUGGESTION LEARNING/);
  assert.match(page, /suggestionTried\?: boolean/);
  assert.match(page, /suggestionHelpful\?: boolean/);
  assert.match(page, /open, overdue, and follow-up load/);

  assert.match(css, /\.detail-modal\{[^}]*overflow-x:hidden;[^}]*overflow-y:auto/);
  assert.match(css, /\.detail-modal \.detail-title p[^}]*overflow-wrap:anywhere;word-break:break-word/);
  assert.match(css, /\.pulse-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:650px\)[\s\S]*\.pulse-grid\{grid-template-columns:1fr\}/);
});
