import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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

  /* A \uXXXX escape is NOT an escape in JSX text — it renders as those six literal characters.
     Inside a braced expression or an attribute string it is fine, which is what makes it easy
     to get wrong; it has shipped twice, an arrow and an em dash. Grepping the source for this
     cannot tell JSX text from an arrow function followed by a regex, so the check is on the
     rendered output instead. Dialogs are not server-rendered — the browser suite covers those. */
  const rawEscapes = html.match(/\\u[0-9a-fA-F]{4}/g) ?? [];
  assert.deepEqual(rawEscapes, [], `\\uXXXX reached the page as text: ${rawEscapes.join(" | ")}`);
  assert.match(html, /<title>Aesi&#x27;s Signal Petal — SRE Work Tracker<\/title>/i);
  assert.match(html, /A private, cloud-synced workspace for issue tracking and follow-ups\./i);
  assert.match(html, /Signal Petal/);
  assert.match(html, /Dashboard/);
  assert.match(html, /Log\/Track/);
  assert.match(html, /Open work/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps private diary content contained and focus guidance actionable", async () => {
  /* page.tsx is being broken up a piece at a time, so the source these assertions read is
     page.tsx PLUS everything under app/components — listed, not named. Otherwise every
     extraction breaks whichever strings happen to have moved that day. */
  const componentDir = new URL("../app/components/", import.meta.url);
  const componentFiles = (await readdir(componentDir)).filter(name => name.endsWith(".tsx") || name.endsWith(".ts"));
  const [page, css, ...components] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ...componentFiles.map(name => readFile(new URL(name, componentDir), "utf8")),
  ]);
  const source = [page, ...components].join("\n");

  assert.match(source, /PRIVATE REFLECTIONS/);
  /* The Insights diary band must keep promising that nothing leaves the device. This used
     to be pinned to the wording in the older, hidden copy of the band; that copy is gone
     and this is the live one's sentence. */
  assert.match(source, /Private, on-device patterns/);
  assert.match(source, /no plaintext copy is allowed to linger/);
  assert.match(source, /TODAY’S THREE MOVES/);
  assert.match(source, /TODAY’S SIGNAL GARDEN/);
  assert.match(source, /WEEK IN BLOOM/);
  assert.match(source, /Followed up/);
  assert.match(source, /rescheduleFocus/);
  assert.match(source, /handled for today/);
  assert.match(source, /TWO-MINUTE WRAP-UP/);
  assert.match(source, /What can intentionally wait/);
  assert.match(source, /never included in copied work summaries/);
  assert.match(source, /ACT ON THE SIGNAL/);
  assert.match(source, /NEXT WEEK’S PRIORITIES/);
  assert.match(source, /WHAT YOU LEARNED/);

  // The professional summary is built to be pasted into a work chat as it is, so it must
  // keep drawing only on professional work — and, as ever, never on the diary.
  assert.match(source, /function professionalSummary/);
  assert.match(source, /function personalSummary/);
  assert.match(source, /issue\.lane === "professional"/);
  assert.match(source, /issue\.lane === "personal"/);
  assert.match(source, /ready to paste into Teams or Slack/);
  assert.match(source, /NOT SORTED YET/);
  // A task can never be logged without a lane; unsorted only ever means "logged before this existed".
  assert.match(source, /disabled=\{!newLane\}/);
  assert.match(source, /Choose professional or personal first/);
  // The extra shareable line is asked for on professional work only, and the summary tidies
  // every line of the writer's own text before it reaches a work channel.
  assert.match(source, /How you’d say this outside the team/);
  assert.match(source, /name="shareable"/);
  assert.match(source, /professionalLine\(\{ shareable: issue\.memory\?\.shareable/);
  assert.match(source, /professionalTone\(issue\.title\)/);
  assert.match(source, /Deliberately a count, never the words/);
  // Unsorted work is reachable from exactly one place in the copy: the combined one.
  assert.match(source, /review\.unsorted/);
  assert.match(source, /YOUR FIRST SIGNAL LOOP/);
  assert.match(source, /Command palette/);
  assert.match(source, /missing-eta/);
  assert.match(source, /missing-action/);


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
