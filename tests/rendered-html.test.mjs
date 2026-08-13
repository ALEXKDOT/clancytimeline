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
  assert.match(html, /86<\/strong> events shown/);
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
  assert.match(html, /Arranged by Alex Krawec, MS4/);
  assert.match(html, /Feedback: AKrawec@mednet\.ucla\.edu/);
  assert.match(html, /May 26, 2022 – January 24, 2023/);
  assert.match(html, /Post-offense/);
  assert.match(html, /Search symptoms, medications, clinicians/);
  assert.match(html, /Fit chronology at default zoom/);
});

test("compresses the inactive post-offense year and renders the revised orientation arc", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /earlyEnd: "2023-05-01T00:00:00"/);
  assert.match(page, /lateStart: "2024-05-01T00:00:00"/);
  assert.match(page, /~12 months omitted/);
  assert.match(page, /Anxiety emerges after 12 well weeks/);
  assert.match(page, /Sep–Nov/);
  assert.match(page, /Severe depression persists, offense on January 24/);
  assert.match(css, /.story-beats \{[^}]*grid-template-columns: repeat\(4, 1fr\)/);
  assert.match(css, /\.filter-chip \{[^}]*height: 38px;[^}]*font-size: 13px/);
});

test("renders a noninteractive monthly provider and medication orientation map", async () => {
  const [response, page, css] = await Promise.all([
    render(),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const html = await response.text();

  assert.match(html, /Providers seen and major medication trials/);
  for (const month of ["September–October", "November", "December", "January"]) assert.match(html, new RegExp(`>${month}<`));
  assert.match(html, /Jennifer Tufts, MD/);
  assert.match(html, /Rebecca H\. Jollotta, CNP/);
  assert.match(html, /Alia Goodheart, MD/);
  assert.match(html, /Ativan \(lorazepam\) 0\.5 mg ×7/);
  assert.match(html, /Prescribed or filled does not necessarily mean taken/);
  assert.match(page, /const orientationCareMap = \[/);
  assert.match(page, /className="section-number orientation-label"/);
  assert.match(page, /displayDate: "Late Nov\."/);
  assert.match(page, /displayDate: "~1 week later"/);
  assert.doesNotMatch(page, /className="orientation-copy"/);
  assert.doesNotMatch(page.slice(page.indexOf("const orientationCareMap"), page.indexOf("const events")), /Letitia Dukes|ASPIRE|Jennifer McAllister/);
  assert.doesNotMatch(page.slice(page.indexOf("const orientationCareMap"), page.indexOf("const events")), /date: "[^"]*(?:&|–)[^"]*"/);
  const careMapSource = page.slice(page.indexOf("const orientationCareMap"), page.indexOf("const events"));
  assert.equal((careMapSource.match(/month: "/g) ?? []).length, 4);
  assert.doesNotMatch(careMapSource, /month: "September"|month: "October"/);
  assert.match(css, /\.care-map \{[^}]*grid-template-columns: 1\.05fr 1\.3fr 1\.45fr 1\.2fr/);
  assert.match(css, /\.care-group li \{[^}]*font-size: 12px/);
  assert.match(css, /\.orientation \{[^}]*padding: 42px 40px 34px;/);
  assert.doesNotMatch(page, /care-group[^\n]*onClick/);
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
  assert.match(page, /time: "5:33–5:34 PM", title: "Patrick and Lindsay speak from CVS"/);
  assert.match(page, /time: "By ~6:09 PM", title: "Quiet house and unanswered call"/);
  assert.match(page, /time: "~6:11 PM onward", title: "Discovery and emergency response"/);
  assert.doesNotMatch(page, /id: "jan24-day"|id: "cvs"|id: "threev"|id: "return"/);
});

test("separates civil pleading allegations from established event evidence", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /civilClaims\?:/);
  assert.match(page, /Civil pleading allegations/);
  assert.match(page, /not findings/);
  assert.match(page, /id: "child-thoughts"[^]*?civilClaims:/);
  assert.match(page, /id: "jan24-sequence"[^]*?civilClaims:/);
  assert.match(css, /\.civil-claims-box \{/);
});

test("includes care contacts recovered in the Day 11 bounded audit", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const id of ["oct3-therapy", "fluoxetine-start-report", "dec1-urgent-outreach", "dec2-dukes", "dec5-aspire", "dec12-dukes", "dec19-dukes", "jan7-party"]) {
    assert.match(page, new RegExp(`id: "${id}"`), `${id} should be present`);
  }
  assert.match(page, /ASPIRE/);
  assert.match(page, /Letitia Dukes/);
});

test("derives the drawer event tracker from the selected event", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /selection\?\.kind === "event" \? selection\.index : -1/);
  assert.match(page, /const selectedEvent = selectedEventIndex >= 0/);
  assert.match(page, /selectedEventIndex \+ 1} \/ \$\{visibleEvents\.length}/);
  assert.match(page, /showStoryEvent\(selectedEventIndex - 1\)/);
  assert.match(page, /showStoryEvent\(selectedEventIndex \+ 1\)/);
  assert.match(page, /key=\{selectedEvent \? selectedEvent\.id/);
  assert.doesNotMatch(page, /useState<number \| null>\(null\)/);
});

test("renders bulk filters, larger controls, and user-dismissed horizontal-scroll coaching", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, />Hide all<\/button>/);
  assert.match(page, />Show all<\/button>/);
  assert.doesNotMatch(page, />Reset<\/button>/);
  assert.match(page, /Hold Shift while scrolling/);
  assert.match(page, /event\.shiftKey/);
  assert.match(page, /Math\.abs\(event\.deltaX\)/);
  assert.match(css, /\.view-tabs strong \{[^}]*font-size: 16px/);
  assert.match(css, /\.filter-chip \{[^}]*height: 38px;[^}]*font-size: 13px/);
  assert.match(css, /\.scroll-coach\.dismissed/);
});

test("places the arguments above the timeline in a full-width section", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const theories = page.indexOf("02 / THE ARGUMENTS");
  const workspace = page.indexOf('<section className="workspace"');

  assert.ok(theories > -1 && workspace > -1 && theories < workspace);
  assert.match(page, /<span>Defense<\/span>/);
  assert.match(page, /<span>Prosecution<\/span>/);
  assert.doesNotMatch(page, /THE PARTIES&apos; THEORIES|Defense theory · attorney argument|Commonwealth theory · attorney argument/);
  assert.doesNotMatch(page, /The central dispute is mental state|No retained criminal-responsibility expert had testified/);
  assert.doesNotMatch(page, /Three evidentiary separations/);
  assert.match(css, /\.reading-guide \{[^}]*padding: 44px 40px 48px;\s*\}/);
  assert.match(css, /\.argument-grid article small \{[^}]*font-size: 13px/);
});

test("moves every event-card subtext into the existing drawer summary", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /<small>\{event\.short\}<\/small>/);
  assert.match(page, /<p className="drawer-summary"><span className="drawer-context">\{selected\.short\}<\/span>\{selected\.summary\}<\/p>/);
  assert.match(css, /\.drawer-context \{[^}]*display: block;/);
  assert.doesNotMatch(css, /\.event-card small \{/);
  assert.match(css, /\.event-card strong \{[^}]*-webkit-line-clamp: 3;/);
});
