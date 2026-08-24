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

test("keeps private diary content contained and focus guidance actionable", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /PRIVATE REFLECTIONS/);
  assert.match(page, /Everything here is worked out on this device/);
  assert.match(page, /no plaintext copy is allowed to linger/);
  assert.match(page, /FOCUS NOW/);
  assert.match(page, /Followed up/);
  assert.match(page, /rescheduleFocus/);
  assert.match(page, /handled for today/);
  assert.match(page, /TWO-MINUTE WRAP-UP/);
  assert.match(page, /What can intentionally wait/);
  assert.match(page, /never included in copied work summaries/);
  assert.match(page, /ACT ON THE SIGNAL/);
  assert.match(page, /NEXT WEEK’S PRIORITIES/);
  assert.match(page, /OPERATIONAL MEMORY/);
  assert.match(page, /YOUR FIRST SIGNAL LOOP/);
  assert.match(page, /Command palette/);
  assert.match(page, /missing-eta/);
  assert.match(page, /missing-action/);

  assert.match(css, /\.detail-modal\{[^}]*overflow-x:hidden;[^}]*overflow-y:auto/);
  assert.match(css, /\.detail-title h2,\.detail-title p\{overflow-wrap:anywhere;word-break:break-word/);
  assert.match(css, /\.focus-now\{[^}]*grid-template-columns:minmax\(210px,.42fr\) minmax\(0,1.58fr\) auto/);
  assert.match(css, /@media\(max-width:650px\)[\s\S]*\.focus-item\{grid-template-columns:26px minmax\(0,1fr\)\}/);
  assert.match(css, /\.daily-check-in-modal\{[^}]*max-height:calc\(100dvh - 40px\)/);
});

test("ships an installable offline application shell", async () => {
  const [manifest, worker, layout] = await Promise.all([
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /start_url: "\/"/);
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/);
  assert.match(worker, /signal-petal-shell-v2/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /caches\.match\("\/"\)/);
});
