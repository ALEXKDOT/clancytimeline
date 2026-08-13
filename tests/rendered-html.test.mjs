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
  assert.match(html, /75<\/strong> events shown/);
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
