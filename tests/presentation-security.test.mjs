import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, rootUrl), "utf8"));
}

function collectRuleValues(value, key, output = []) {
  if (!value || typeof value !== "object") return output;
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey === key) output.push(entryValue);
    collectRuleValues(entryValue, key, output);
  }
  return output;
}

test("Realtime Database rules deny root access and never grant a public write", async () => {
  const { rules } = await readJson("database.rules.json");

  assert.equal(rules[".read"], false);
  assert.equal(rules[".write"], false);
  assert.equal(rules.presentations.$other[".read"], false);
  assert.equal(rules.presentations.$other[".write"], false);
  assert.equal(rules.presentations.main[".read"], false);
  assert.equal(rules.presentations.main[".write"], false);
  assert.ok(!collectRuleValues(rules, ".write").includes(true), "no path may contain .write: true");
});

test("only presentation metadata and state are publicly readable", async () => {
  const rules = (await readJson("database.rules.json")).rules;
  const main = rules.presentations.main;

  assert.equal(main.meta[".read"], true);
  assert.equal(main.state[".read"], true);
  assert.equal(main.authChecks[".read"], false);
  assert.equal(main.authChecks[".write"], false);
  assert.equal(collectRuleValues(rules, ".read").filter((value) => value === true).length, 2);
});

test("presentation writes require a verified exact presenter identity", async () => {
  const main = (await readJson("database.rules.json")).rules.presentations.main;

  for (const writeRule of [main.meta[".write"], main.state[".write"], main.authChecks.$uid[".write"]]) {
    assert.equal(typeof writeRule, "string");
    assert.match(writeRule, /auth\s*!=\s*null/);
    assert.match(writeRule, /email_verified\s*==\s*true/);
    assert.match(writeRule, /auth\.token\.email\s*==\s*'akrawec1@gmail\.com'/);
    assert.doesNotMatch(writeRule, /REPLACE_WITH_|\|\|/);
  }
  assert.match(main.authChecks.$uid[".write"], /auth\.uid\s*==\s*\$uid/);
  assert.match(main.authChecks.$uid[".validate"], /clientId/);
  assert.match(main.authChecks.$uid[".validate"], /checkedAt/);
  assert.match(main.authChecks.$uid.clientId[".validate"], /isString\(\)/);
  assert.match(main.authChecks.$uid.checkedAt[".validate"], /isNumber\(\)/);
});

test("state schema validates enums, booleans, bounded text, maps, and normalized ratios", async () => {
  const state = (await readJson("database.rules.json")).rules.presentations.main.state;

  assert.match(state[".validate"], /hasChildren/);
  assert.match(state.revision[".validate"], /%\s*1\s*==\s*0/);
  assert.match(state.view[".validate"], /'course'/);
  assert.match(state.view[".validate"], /'post'/);
  assert.match(state.searchQuery[".validate"], /isString\(\).*length\s*<=\s*240/);
  assert.match(state.medicationOverlayOpen[".validate"], /isBoolean\(\)/);
  assert.match(state.openFaqIds[".validate"], /isString\(\).*length\s*<=\s*500/);

  const categoryNames = ["clinical", "symptom", "hospital", "medication", "collateral", "digital", "event", "post"];
  for (const name of categoryNames) {
    assert.match(state.categories[".validate"], new RegExp(`'${name}'`));
    assert.match(state.categories[name][".validate"], /isBoolean\(\)/);
  }

  assert.match(state.selection[".validate"], /kind/);
  assert.match(state.selection[".validate"], /id/);
  assert.match(state.selection[".validate"], /length\s*<=\s*500/);
  for (const kind of ["none", "event", "medication", "cluster"]) {
    assert.match(state.selection.kind[".validate"], new RegExp(`'${kind}'`));
  }

  for (const ratioRule of [
    state.horizontalRatio[".validate"],
    state.vertical.progress[".validate"],
    state.vertical.fallbackRatio[".validate"],
    state.drawerRatio[".validate"],
  ]) {
    assert.match(ratioRule, />=\s*0/);
    assert.match(ratioRule, /<=\s*1/);
  }

  for (const anchorId of ["top", "background", "arguments", "workspace", "common-questions", "footer"]) {
    assert.match(state.vertical.anchorId[".validate"], new RegExp(`'${anchorId}'`));
  }
});

test("session metadata is versioned and validates lifecycle fields", async () => {
  const meta = (await readJson("database.rules.json")).rules.presentations.main.meta;

  assert.match(meta[".validate"], /schemaVersion/);
  assert.match(meta[".validate"], /startedAt/);
  assert.match(meta[".validate"], /heartbeatAt/);
  assert.match(meta[".validate"], /endedAt/);
  assert.match(meta[".validate"], /disconnectedAt/);
  assert.match(meta.schemaVersion[".validate"], /==\s*1/);
  assert.match(meta.active[".validate"], /isBoolean\(\)/);
});

test("Firebase configuration points to the locked rules and commits only public browser config", async () => {
  const firebase = await readJson("firebase.json");
  const [envExample, envProduction, gitignore, standaloneViteConfig] = await Promise.all([
    readFile(new URL(".env.example", rootUrl), "utf8"),
    readFile(new URL(".env.production", rootUrl), "utf8"),
    readFile(new URL(".gitignore", rootUrl), "utf8"),
    readFile(new URL("standalone/vite.config.ts", rootUrl), "utf8"),
  ]);

  assert.equal(firebase.database.rules, "database.rules.json");
  for (const variable of [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_DATABASE_URL",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
  ]) assert.match(envExample, new RegExp(`^${variable}=`, "m"));

  assert.doesNotMatch(envExample, /private[_ -]?key|service[_ -]?account|refresh[_ -]?token/i);
  assert.match(envExample, /not credentials/i);
  assert.match(envExample, /do not grant database write access/i);
  assert.match(envProduction, /^VITE_FIREBASE_API_KEY=AIzaSyBw_x9d6SQguoCEBvccW1UJsAolsnYEUUE$/m);
  assert.match(envProduction, /^VITE_FIREBASE_AUTH_DOMAIN=clancy-timeline\.firebaseapp\.com$/m);
  assert.match(envProduction, /^VITE_FIREBASE_DATABASE_URL=https:\/\/clancy-timeline-default-rtdb\.firebaseio\.com$/m);
  assert.match(envProduction, /^VITE_FIREBASE_PROJECT_ID=clancy-timeline$/m);
  assert.match(envProduction, /^VITE_FIREBASE_STORAGE_BUCKET=clancy-timeline\.firebasestorage\.app$/m);
  assert.match(envProduction, /^VITE_FIREBASE_MESSAGING_SENDER_ID=325670930986$/m);
  assert.match(envProduction, /^VITE_FIREBASE_APP_ID=1:325670930986:web:1c8a45ec7cb2c6e05dd153$/m);
  assert.match(envProduction, /^VITE_FIREBASE_MEASUREMENT_ID=G-5G5Z9SM7J9$/m);
  assert.doesNotMatch(envProduction, /private[_ -]?key|service[_ -]?account|refresh[_ -]?token/i);
  assert.match(envProduction, /not credentials/i);
  assert.match(gitignore, /^!\.env\.production$/m);
  assert.match(standaloneViteConfig, /envDir:\s*["']\.\.["']/);
  for (const localOnly of ["/.firebase/", ".firebaserc", "firebase-debug.log", "database-debug.log"] ) {
    assert.match(gitignore, new RegExp(localOnly.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("page integration exposes stable anchors and keeps presenter controls opt-in", async () => {
  const [page, controls, hook] = await Promise.all([
    readFile(new URL("app/page.tsx", rootUrl), "utf8"),
    readFile(new URL("app/presentation/PresentationControls.tsx", rootUrl), "utf8"),
    readFile(new URL("app/presentation/usePresentationSync.ts", rootUrl), "utf8"),
  ]);

  assert.match(page, /get\("presenter"\) === "1"/);
  assert.match(page, /visible=\{presentationMounted && presenterMode\}/);
  assert.match(page, /data-presentation-timeline-scroll/);
  assert.match(page, /data-presentation-drawer/);
  for (const anchor of ["top", "background", "arguments", "workspace", "common-questions", "footer"]) {
    assert.match(page, new RegExp(`data-presentation-anchor="${anchor}"`));
  }
  assert.match(page, /maxLength=\{PRESENTATION_MAX_SEARCH_LENGTH\}/);
  assert.match(controls, /document\.documentElement\.style\.overflow = "hidden"/);
  assert.match(controls, /passive: false/);
  assert.match(controls, /isLost \|\| connection !== "online"/);
  assert.match(hook, /publishSnapshot\(\)\.catch\(\(\) => undefined\)/);
});

test("generated GitHub Pages artifact is self-contained and includes presenter mode", async () => {
  const [docsHtml, standaloneHtml, noJekyll] = await Promise.all([
    readFile(new URL("docs/index.html", rootUrl), "utf8"),
    readFile(new URL("standalone-dist/Clancy_Interactive_Clinical_Timeline.html", rootUrl), "utf8"),
    readFile(new URL("docs/.nojekyll", rootUrl), "utf8"),
  ]);

  assert.equal(docsHtml, standaloneHtml);
  assert.equal(noJekyll, "");
  assert.match(docsHtml, /Presenter controls/);
  assert.match(docsHtml, /Start presenting/);
  assert.match(docsHtml, /Following presenter/);
  assert.match(docsHtml, /Explore locally/);
  assert.match(docsHtml, /<style>[\s\S]+<\/style>/);
  assert.match(docsHtml, /<script type="module">[\s\S]+<\/script>/);
  assert.doesNotMatch(docsHtml, /<(?:script|link)\b[^>]+(?:src|href)="(?!data:|#)/i);
});
