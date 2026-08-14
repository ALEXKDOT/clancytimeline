import assert from "node:assert/strict";
import { register } from "node:module";
import { afterEach, beforeEach, test } from "node:test";

import { cleanup, fireEvent, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import React from "react";

const cssLoader = `
  export async function load(url, context, nextLoad) {
    if (url.endsWith(".css")) {
      return { format: "module", shortCircuit: true, source: "export default {};" };
    }
    return nextLoad(url, context);
  }
`;
register(`data:text/javascript,${encodeURIComponent(cssLoader)}`, import.meta.url);

const {
  AudienceFollowControl,
  PresentationInteractionShield,
  PresenterPanel,
} = await import("../app/presentation/PresentationControls.tsx");

let jsdom;

beforeEach(() => {
  jsdom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://alexkdot.github.io/clancytimeline/",
  });

  for (const [key, value] of Object.entries({
    window: jsdom.window,
    document: jsdom.window.document,
    navigator: jsdom.window.navigator,
    HTMLElement: jsdom.window.HTMLElement,
    Element: jsdom.window.Element,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});

afterEach(() => {
  cleanup();
  jsdom.window.close();
});

function followingView(active, extraControl = null) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(AudienceFollowControl, {
      visible: true,
      followState: "following",
      connection: "online",
      onExplore: () => undefined,
      onRejoin: () => undefined,
    }),
    extraControl,
    React.createElement(PresentationInteractionShield, { active }),
  );
}

function presenterView(overrides = {}) {
  return React.createElement(PresenterPanel, {
    visible: true,
    connection: "online",
    auth: "authorized",
    isLive: true,
    audienceUrl: "https://alexkdot.github.io/clancytimeline/",
    laserEnabled: false,
    laserAvailable: true,
    onSignIn: () => undefined,
    onSignOut: () => undefined,
    onStart: () => undefined,
    onStop: () => undefined,
    onToggleLaser: () => undefined,
    ...overrides,
  });
}

test("live presenter exposes an accessible laser toggle with visible state", () => {
  let toggles = 0;
  const view = render(presenterView({ onToggleLaser: () => { toggles += 1; } }));
  const toggle = view.getByRole("button", { name: "Turn laser pointer on" });

  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.equal(toggle.getAttribute("aria-keyshortcuts"), "L");
  assert.match(toggle.textContent, /Laser pointer/);
  assert.match(toggle.textContent, /Off/);
  fireEvent.click(toggle);
  assert.equal(toggles, 1);

  view.rerender(presenterView({ laserEnabled: true }));
  const enabledToggle = view.getByRole("button", { name: "Turn laser pointer off" });
  assert.equal(enabledToggle.getAttribute("aria-pressed"), "true");
  assert.match(enabledToggle.textContent, /On/);
});

test("L toggles the live laser but never hijacks typing or browser shortcuts", () => {
  let toggles = 0;
  const view = render(presenterView({ onToggleLaser: () => { toggles += 1; } }));

  fireEvent.keyDown(window, { key: "l" });
  assert.equal(toggles, 1);
  fireEvent.keyDown(window, { key: "L", repeat: true });
  fireEvent.keyDown(window, { key: "l", ctrlKey: true });
  fireEvent.keyDown(window, { key: "l", metaKey: true });
  fireEvent.keyDown(window, { key: "l", altKey: true });
  assert.equal(toggles, 1);

  const input = document.createElement("input");
  document.body.appendChild(input);
  fireEvent.keyDown(input, { key: "l" });
  assert.equal(toggles, 1);

  const editor = document.createElement("div");
  editor.setAttribute("contenteditable", "");
  document.body.appendChild(editor);
  fireEvent.keyDown(editor, { key: "l" });
  assert.equal(toggles, 1);

  view.rerender(presenterView({
    isLive: false,
    onToggleLaser: () => { toggles += 1; },
  }));
  fireEvent.keyDown(window, { key: "l" });
  assert.equal(toggles, 1);
});

test("following moves focus to Explore locally and restores prior focus on cleanup", () => {
  const priorControl = document.createElement("button");
  priorControl.textContent = "Timeline filter";
  document.body.appendChild(priorControl);
  priorControl.focus();

  const view = render(followingView(true));
  const exploreButton = view.getByRole("button", { name: "Explore locally" });

  assert.equal(document.activeElement, exploreButton);

  view.rerender(followingView(false));
  assert.equal(document.activeElement, priorControl);
});

test("following traps Tab within presentation controls and blocks background keyboard focus", () => {
  const backgroundButton = document.createElement("button");
  backgroundButton.textContent = "Background timeline control";
  document.body.appendChild(backgroundButton);
  backgroundButton.focus();

  const finalControl = React.createElement(
    "aside",
    { "data-presentation-control": true },
    React.createElement("button", { type: "button" }, "Secondary presentation control"),
  );
  const view = render(followingView(true, finalControl));
  const exploreButton = view.getByRole("button", { name: "Explore locally" });
  const secondaryButton = view.getByRole("button", { name: "Secondary presentation control" });

  secondaryButton.focus();
  fireEvent.keyDown(secondaryButton, { key: "Tab" });
  assert.equal(document.activeElement, exploreButton);

  exploreButton.focus();
  fireEvent.keyDown(exploreButton, { key: "Tab", shiftKey: true });
  assert.equal(document.activeElement, secondaryButton);

  backgroundButton.focus();
  assert.equal(document.activeElement, exploreButton);

  const backgroundKey = new window.KeyboardEvent("keydown", {
    key: "ArrowRight",
    bubbles: true,
    cancelable: true,
  });
  backgroundButton.dispatchEvent(backgroundKey);
  assert.equal(backgroundKey.defaultPrevented, true);
});
