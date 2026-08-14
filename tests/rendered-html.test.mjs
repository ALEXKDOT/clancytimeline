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
  assert.match(html, /93<\/strong> events shown/);
  assert.match(html, /Show medication context/);
  assert.match(html, /MEDICATION TIMELINE/);
  assert.match(html, /100-source master corpus/);
  assert.match(html, /event-card/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
});

test("renders evidence-aware controls and chronology boundaries", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /Evidence cutoff/);
  assert.match(html, /Aug 13, 2026 · Trial Day 13/);
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
  assert.match(page, /onsetStart: "2022-08-23T00:00:00"/);
  assert.match(page, /~12 months omitted/);
  assert.match(page, /Anxiety emerges after 12 well weeks/);
  assert.match(page, /Sep–Nov/);
  assert.match(page, /Severe depression persists, offense on January 24/);
  assert.match(css, /.story-beats \{[^}]*grid-template-columns: repeat\(4, 1fr\)/);
  assert.match(css, /\.filter-chip \{[^}]*height: 34px;[^}]*font-size: 11\.5px/);
});

test("renders a noninteractive three-period provider and medication background map", async () => {
  const [response, page, css] = await Promise.all([
    render(),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const html = await response.text();

  assert.match(html, /Providers seen and major medication trials/);
  assert.match(html, /01 \/ BACKGROUND/);
  assert.doesNotMatch(html, /01 \/ ORIENTATION/);
  assert.match(html, /Background summary only/);
  for (const month of ["September-November", "December", "January"]) assert.match(html, new RegExp(`>${month}<`));
  assert.match(html, /Jennifer Tufts, MD/);
  assert.match(html, /Rebecca H\. Jollotta, CNP/);
  assert.match(html, /Alia Goodheart, MD/);
  assert.match(html, /Ativan \(lorazepam\) 0\.5 mg ×7/);
  assert.match(html, /diazepam 2 mg was dispensed, but the original label quantity remains unresolved/);
  assert.match(html, /Prescribed or filled does not necessarily mean taken/);
  assert.match(page, /const orientationCareMap = \[/);
  assert.match(page, /className="section-number orientation-label"/);
  assert.match(page, /displayDate: "Late Nov\."/);
  assert.match(page, /displayDate: "~1 week later"/);
  assert.doesNotMatch(page, /className="orientation-copy"/);
  assert.doesNotMatch(page.slice(page.indexOf("const orientationCareMap"), page.indexOf("const events")), /Letitia Dukes|ASPIRE|Jennifer McAllister/);
  assert.doesNotMatch(page.slice(page.indexOf("const orientationCareMap"), page.indexOf("const events")), /date: "[^"]*(?:&|–)[^"]*"/);
  const careMapSource = page.slice(page.indexOf("const orientationCareMap"), page.indexOf("const events"));
  assert.match(careMapSource, /month: "September-November"[\s\S]*date: "Sep 15"[\s\S]*date: "Sep 28"[\s\S]*date: "Oct 3"[\s\S]*date: "Oct 20"[\s\S]*date: "Oct 21"[\s\S]*date: "Oct 26"[\s\S]*date: "Nov 2"[\s\S]*date: "Nov 30"/);
  assert.equal((html.match(/class="care-month"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /class="care-month-continuation"/);
  assert.match(css, /\.care-map-scroll \{[^}]*overflow-x: hidden/);
  assert.match(css, /\.care-map \{[^}]*width: 100%;[^}]*min-width: 0;[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.care-month > header span \{[^}]*white-space: nowrap/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.care-map \{ width: auto; min-width: 1000px; \}/);
  assert.match(css, /\.care-group time \{[^}]*font: 750 11px/);
  assert.match(css, /\.care-group strong \{[^}]*font-size: 15px/);
  assert.match(css, /\.care-group small \{[^}]*font-size: 11px/);
  assert.match(css, /\.care-group li \{[^}]*font-size: 14px/);
  assert.match(css, /\.header-credit \{[^}]*font-size: 13px/);
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

test("keeps event drawers self-contained and free of presenter instructions", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const eventData = page.slice(page.indexOf("const events:"), page.indexOf("const allEvents"));
  const birth = page.slice(page.indexOf('id: "birth"'), page.indexOf('id: "late-aug"'));
  const lateAugust = page.slice(page.indexOf('id: "late-aug"'), page.indexOf('id: "tufts-intake"'));

  assert.match(birth, /title: "Childbirth"/);
  assert.match(birth, /charged conduct occurred approximately eight months later/);
  assert.doesNotMatch(birth, /243 days|classic postpartum psychosis/i);
  assert.doesNotMatch(lateAugust, /caution:/);
  assert.match(page, /Prescription\/fill: sertraline 25 mg daily for one week, then 50 mg planned; 25 mg ×30 filled/);
  assert.match(page, /Medication decision: sertraline remained deferred; Clancy reported no doses taken/);
  assert.match(page, /Clancy stated she did not feel ready to return to nursing/);
  assert.match(page, /Medication decision: sertraline was stopped; an immediate replacement prescription was deferred/);

  for (const forbidden of [
    /separate (?:same-day )?medication card/i,
    /shown in a separate (?:same-day )?medication card/i,
    /appears? in a separate (?:same-day )?medication card/i,
    /\bthis card\b/i,
    /["'](?:do not|state only|keep this|never)\b/i,
    /named medication lane/i,
  ]) assert.doesNotMatch(eventData, forbidden);
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
  assert.match(page, /time: "4:46–4:48 PM", title: "Constipation-product activity and CVS call"/);
  assert.match(page, /time: "5:09–5:10 PM", title: "Calls associated with the food order"/);
  assert.match(page, /time: "5:33–5:34 PM", title: "Patrick and Lindsay speak from CVS"/);
  assert.match(page, /time: "By ~6:09 PM", title: "Quiet house and unanswered call"/);
  assert.match(page, /time: "~6:11 PM onward", title: "Discovery and emergency response"/);
  assert.doesNotMatch(page, /id: "jan24-day"|id: "cvs"|id: "threev"|id: "return"/);
});

test("integrates Day 13 digital evidence without converting searches into diagnoses or medication exposure", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /digital: \{ label: "Digital evidence"/);
  for (const id of ["surface-aug23", "phone-note-oct25", "phone-search-dec29", "mclean-text-jan3", "new-med-text-jan18", "phone-search-jan19"]) {
    assert.match(page, new RegExp(`id: "${id}"`), `${id} should be present`);
  }
  assert.match(page, /could not identify the human user/);
  assert.match(page, /not a clinician assessment/);
  assert.match(page, /attribution to amitriptyline remains unconfirmed/);
  assert.match(page, /Searches can reflect distress, curiosity, self-assessment/);
  assert.match(page, /event\.details\.join\(" "\)/);
  assert.match(page, /SRC-0099/);
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

test("includes care contacts recovered through the Day 12 review", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const id of ["oct3-therapy", "fluoxetine-start-report", "dec1-urgent-outreach", "dec2-dukes", "dec5-aspire", "dec12-dukes", "dec19-dukes", "dec27-dukes", "jan7-party"]) {
    assert.match(page, new RegExp(`id: "${id}"`), `${id} should be present`);
  }
  assert.match(page, /Aspire/);
  assert.match(page, /Latiesha Dukes/);
});

test("derives the drawer event tracker from the selected event", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /selection\?\.kind === "event"[^]*?visibleEvents\.findIndex\(\(event\) => event\.id === selection\.eventId\)/);
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
  assert.match(css, /\.filter-row \{[^}]*flex-wrap: wrap;[^}]*overflow: visible/);
  assert.match(css, /\.filter-chip \{[^}]*height: 34px;[^}]*padding: 0 10px;[^}]*font-size: 11\.5px/);
  assert.match(css, /\.filter-actions button \{[^}]*height: 32px;[^}]*padding: 0 9px;[^}]*font-size: 11px/);
  assert.match(css, /\.scroll-coach\.dismissed/);
});

test("places the arguments above the timeline in a full-width section", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const theories = page.indexOf("02 / THE ARGUMENTS");
  const workspace = page.indexOf('<section className="workspace"');
  const argumentsSection = page.slice(theories, workspace);

  assert.ok(theories > -1 && workspace > -1 && theories < workspace);
  assert.match(page, /<span>Defense<\/span>/);
  assert.match(page, /<span>Prosecution<\/span>/);
  assert.doesNotMatch(page, /THE PARTIES&apos; THEORIES|Defense theory · attorney argument|Commonwealth theory · attorney argument/);
  assert.doesNotMatch(page, /The central dispute is mental state|No retained criminal-responsibility expert had testified/);
  assert.doesNotMatch(page, /Three evidentiary separations/);
  assert.match(page, /<h3>Psychotic illness overwhelmed legal capacity\.<\/h3>/);
  assert.match(page, /<h3>Deliberate conduct with retained capacity\.<\/h3>/);
  assert.match(page, /characterized as postpartum or bipolar psychosis and exacerbated by profound insomnia and medication exposure/);
  assert.match(page, /deliberately created an opportunity to kill her children/);
  assert.match(page, /<strong>Evidence introduced through Day 13:<\/strong>/);
  assert.match(page, /Patrick&apos;s testimony regarding earlier thoughts of harming the children and severe sleep deprivation, together with Clancy&apos;s contemporaneous reports of impaired maternal bonding/);
  assert.match(page, /Patrick&apos;s later account that Clancy described hearing a male voice tell her this was her “last chance”/);
  assert.match(page, /What prosecutors characterize as a deliberate sequence of killings followed by locking of a bedroom door/);
  assert.match(page, /<strong>Important points:<\/strong>/);
  assert.match(page, /potential insanity\/lack of capacity is raised/);
  assert.match(css, /\.reading-guide \{[^}]*padding: 44px 40px 48px;\s*\}/);
  assert.match(css, /\.argument-evidence \{[^}]*font-size: 14px/);
  assert.match(css, /\.argument-boundary \{[^}]*font-size: 14px/);
  assert.doesNotMatch(argumentsSection, /<small>/);
});

test("renders an audience-ready common-questions section after the timeline", async () => {
  const [response, page, css] = await Promise.all([
    render(),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const html = await response.text();

  assert.match(html, /<h2 id="common-questions-title">Common questions<\/h2>/);
  assert.match(html, /Did Dr\. Jennifer Tufts and Rebecca Jollotta know Clancy was seeing both of them\?/);
  assert.match(html, /Why did Clancy return to Tufts after switching to Julie Paul and Rebecca Jollotta\?/);
  assert.match(html, /What was the .*virtual Aspire crisis evaluation/);
  assert.match(html, /Did Jollotta diagnose Clancy with bipolar disorder\?/);
  assert.match(html, /Does a prescription or pharmacy fill prove that a medication was taken\?/);
  assert.match(page, /<details className="faq-item"/);
  assert.equal((page.match(/question: "/g) ?? []).length, 7);
  assert.ok(html.indexOf('class="workspace"') < html.indexOf('class="common-questions"'));
  assert.ok(html.indexOf('class="common-questions"') < html.indexOf("<footer"));
  assert.match(css, /\.common-questions \{[^}]*grid-template-columns:/);
  assert.match(css, /\.faq-item summary:focus-visible/);
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

test("clusters same-day November and December events without changing their evidence records", async () => {
  const [response, page, css] = await Promise.all([
    render(),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const html = await response.text();

  assert.match(page, /function buildTimelineCards/);
  assert.match(page, /day >= "2022-11-01"/);
  assert.match(page, /day <= "2022-12-31"/);
  assert.match(page, /!\/\[–~\]\|late\|after\|before\|about\/i\.test\(event\.displayDate\)/);
  assert.match(page, /kind: "cluster"; eventIds: string\[\]/);
  assert.match(html, /event-cluster/);
  assert.match(page, /Local event cluster/);
  assert.match(page, /Clustering changes only the display/);
  assert.match(css, /\.event-field \{[^}]*height: 650px/);
  assert.match(css, /\.main-axis \{[^}]*top: 325px/);
  assert.match(css, /\.cluster-event-list/);
});
