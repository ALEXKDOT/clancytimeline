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

test("server-renders the clinical timeline", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Clancy Case — Interactive Clinical Timeline<\/title>/i);
  assert.match(html, /Commonwealth/);
  assert.match(html, /Lindsay Clancy/);
  assert.match(html, /78<\/strong> events shown/);
  assert.match(html, /Show medication context/);
  assert.match(html, /MEDICATION TIMELINE/);
  assert.match(html, /event-card/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
});

test("renders evidence-aware controls and chronology boundaries", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /Evidence cutoff/);
  assert.match(html, /Aug 11, 2026 · Trial Day 11/);
  assert.match(html, /May 26, 2022 – January 24, 2023/);
  assert.match(html, /Post-offense/);
  assert.match(html, /Search symptoms, medications, clinicians/);
  assert.match(html, /Fit chronology at default zoom/);
});

test("keeps the omission band behind cards and classifies the October 26 visit", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  const visit = page.match(/id: "oct26"[^\n]+/)?.[0] ?? "";
  const prescriptions = page.match(/id: "rx-oct26"[^\n]+/)?.[0] ?? "";
  assert.match(visit, /category: "clinical"/);
  assert.match(prescriptions, /category: "medication"/);
  assert.match(css, /\.field-break \{ z-index: 1;/);
  assert.match(css, /\.event-card \{[^}]*z-index: 6;/);
});

test("separates the October 20 encounter from its medication decision and identifies contact modalities", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  const oct20Visit = page.match(/id: "sertraline-stop"[^\n]+/)?.[0] ?? "";
  const oct20Medication = page.match(/id: "med-oct20"[^\n]+/)?.[0] ?? "";
  const oct21Visit = page.match(/id: "oct21"[^\n]+/)?.[0] ?? "";
  const nov2Visit = page.match(/id: "nov2"[^\n]+/)?.[0] ?? "";

  assert.match(oct20Visit, /title: "Telehealth visit:/);
  assert.match(oct20Visit, /category: "clinical"/);
  assert.match(oct20Medication, /title: "Medication decision:/);
  assert.match(oct20Medication, /category: "medication"/);
  assert.match(oct21Visit, /title: "Telehealth follow-up:/);
  assert.match(nov2Visit, /title: "Telehealth follow-up:/);
});

test("labels the complete Tufts appointment series as video telehealth", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const tuftsVisitIds = [
    "tufts-intake", "sep28-visit", "oct3-visit", "sertraline-stop", "oct21", "oct26", "nov2",
    "tufts-nov22", "tufts-dec1", "tufts-dec16", "jan6", "tufts-jan9", "jan16", "jan23",
  ];

  for (const id of tuftsVisitIds) {
    const eventLine = page.match(new RegExp(`id: "${id}"[^\\n]+`))?.[0] ?? "";
    assert.match(eventLine, /title: "Telehealth (evaluation|visit|follow-up):/, `${id} should identify telehealth`);
    assert.match(eventLine, /category: "clinical"/, `${id} should remain a clinical encounter`);
  }
});

test("renders a larger medication legend and a month ruler inside the medication timeline", async () => {
  const [response, page, css] = await Promise.all([
    render(),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const html = await response.text();

  assert.match(html, /Medication timeline months/);
  assert.match(page, /className="med-month-ruler"/);
  assert.match(page, /medicationTicks\.map/);
  assert.match(css, /\.status-key \{[^}]*font-size: 11px/);
  assert.match(css, /\.key \{[^}]*width: 24px; height: 9px/);
});

test("collapses January 24 into one card with a provenance-preserving detail sequence", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /id: "jan24-sequence"/);
  assert.match(page, /<h3>January 24 timeline<\/h3>/);
  assert.match(page, /time: "4:48 PM", title: "CVS telephone call"/);
  assert.match(page, /time: "5:10 PM", title: "ThreeV telephone order"/);
  assert.match(page, /time: "Early evening", title: "Return home and discovery"/);
  assert.doesNotMatch(page, /id: "jan24-day"|id: "cvs"|id: "threev"|id: "return"/);
});

test("derives the drawer event tracker from the selected event", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const selectedEventIndex = selected && "title" in selected/);
  assert.match(page, /selectedEventIndex \+ 1} \/ \$\{visibleEvents\.length}/);
  assert.match(page, /showStoryEvent\(selectedEventIndex - 1\)/);
  assert.match(page, /showStoryEvent\(selectedEventIndex \+ 1\)/);
  assert.doesNotMatch(page, /useState<number \| null>\(null\)/);
});
