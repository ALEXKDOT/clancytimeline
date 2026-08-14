import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import React from "react";

const { PresentationLaserPointer } = await import(
  "../app/presentation/PresentationLaserPointer.tsx"
);

class MockPointerTransport {
  configured = true;
  publishes = [];
  pointer = null;
  pointerListeners = new Set();

  subscribePointer(onValue) {
    this.pointerListeners.add(onValue);
    onValue(this.pointer);
    return () => this.pointerListeners.delete(onValue);
  }

  subscribeServerTimeOffset(onValue) {
    onValue(0);
    return () => undefined;
  }

  async publishPointer(pointer) {
    this.publishes.push(pointer);
  }

  emitPointer(pointer) {
    this.pointer = pointer;
    this.pointerListeners.forEach((listener) => listener(pointer));
  }
}

let jsdom;

beforeEach(() => {
  jsdom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://alexkdot.github.io/clancytimeline/?presenter=1",
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
  Object.defineProperties(jsdom.window, {
    innerWidth: { configurable: true, value: 1_000 },
    innerHeight: { configurable: true, value: 500 },
  });
  jsdom.window.requestAnimationFrame = (callback) =>
    jsdom.window.setTimeout(() => callback(Date.now()), 0);
  jsdom.window.cancelAnimationFrame = (id) => jsdom.window.clearTimeout(id);
});

afterEach(() => {
  cleanup();
  jsdom.window.close();
});

function pointerEvent(type, { x, y, pointerType = "mouse", relatedTarget } = {}) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { configurable: true, value: x ?? 0 },
    clientY: { configurable: true, value: y ?? 0 },
    pointerType: { configurable: true, value: pointerType },
    relatedTarget: { configurable: true, value: relatedTarget ?? null },
  });
  return event;
}

function presenterProps(transport, overrides = {}) {
  return {
    presenterMode: true,
    enabled: true,
    connection: "connected",
    isPresenting: true,
    isFollowing: false,
    clientId: "presenter-client",
    activePresenterClientId: "presenter-client",
    onDisable: () => undefined,
    transportFactory: () => transport,
    ...overrides,
  };
}

function audienceProps(transport, overrides = {}) {
  return {
    presenterMode: false,
    enabled: false,
    connection: "connected",
    isPresenting: false,
    isFollowing: true,
    clientId: "audience-client",
    activePresenterClientId: "presenter-client",
    onDisable: () => undefined,
    transportFactory: () => transport,
    ...overrides,
  };
}

test("presenter pointer normalizes viewport coordinates and hides over controls", async () => {
  const transport = new MockPointerTransport();
  const view = render(React.createElement(
    PresentationLaserPointer,
    presenterProps(transport),
  ));

  act(() => window.dispatchEvent(pointerEvent("pointermove", { x: 500, y: 125 })));
  await waitFor(() => assert.ok(view.container.querySelector(".presentation-laser-dot")));
  const renderedDot = view.container.querySelector(".presentation-laser-dot");
  assert.equal(renderedDot.style.getPropertyValue("--presentation-laser-x"), "50%");
  assert.equal(renderedDot.style.getPropertyValue("--presentation-laser-y"), "25%");
  await waitFor(() => assert.equal(transport.publishes.at(-1)?.visible, true));
  assert.equal(transport.publishes.at(-1)?.xRatio, 0.5);
  assert.equal(transport.publishes.at(-1)?.yRatio, 0.25);

  const control = document.createElement("button");
  control.dataset.presentationControl = "";
  document.body.appendChild(control);
  act(() => control.dispatchEvent(pointerEvent("pointermove", { x: 900, y: 450 })));
  await waitFor(() => assert.equal(view.container.querySelector(".presentation-laser-dot"), null));
  await waitFor(() => assert.equal(transport.publishes.at(-1)?.visible, false));
});

test("presenter movement bursts are throttled and retain the latest point", async () => {
  const transport = new MockPointerTransport();
  const view = render(React.createElement(
    PresentationLaserPointer,
    presenterProps(transport),
  ));

  act(() => {
    for (let index = 1; index <= 10; index += 1) {
      window.dispatchEvent(pointerEvent("pointermove", {
        x: index * 90,
        y: index * 45,
      }));
    }
  });
  await waitFor(() => assert.ok(transport.publishes.length >= 1));
  await new Promise((resolve) => setTimeout(resolve, 100));

  const visiblePublishes = transport.publishes.filter((pointer) => pointer.visible);
  assert.ok(visiblePublishes.length <= 2, "movement must not write every captured event");
  assert.equal(visiblePublishes.at(-1)?.xRatio, 0.9);
  assert.equal(visiblePublishes.at(-1)?.yRatio, 0.9);
  await waitFor(() => {
    const dot = view.container.querySelector(".presentation-laser-dot");
    assert.equal(dot?.style.getPropertyValue("--presentation-laser-x"), "90%");
  });
});

test("audience shows only a fresh pointer from the active presenter and never writes", async () => {
  const transport = new MockPointerTransport();
  const view = render(React.createElement(
    PresentationLaserPointer,
    audienceProps(transport),
  ));
  const freshPointer = {
    schemaVersion: 1,
    clientId: "presenter-client",
    sequence: 8,
    xRatio: 0.32,
    yRatio: 0.68,
    visible: true,
    updatedAt: Date.now(),
  };

  act(() => transport.emitPointer(freshPointer));
  await waitFor(() => assert.ok(view.container.querySelector(".presentation-laser-dot")));
  assert.equal(transport.publishes.length, 0);

  view.rerender(React.createElement(
    PresentationLaserPointer,
    audienceProps(transport, { isFollowing: false }),
  ));
  await waitFor(() => assert.equal(view.container.querySelector(".presentation-laser-dot"), null));

  act(() => transport.emitPointer({ ...freshPointer, sequence: 9, updatedAt: Date.now() }));
  view.rerender(React.createElement(
    PresentationLaserPointer,
    audienceProps(transport),
  ));
  await waitFor(() => assert.ok(view.container.querySelector(".presentation-laser-dot")));

  act(() => transport.emitPointer({
    ...freshPointer,
    clientId: "replaced-presenter",
    sequence: 10,
    updatedAt: Date.now(),
  }));
  await waitFor(() => assert.equal(view.container.querySelector(".presentation-laser-dot"), null));

  act(() => transport.emitPointer({
    ...freshPointer,
    sequence: 11,
    updatedAt: Date.now() - 3_000,
  }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(view.container.querySelector(".presentation-laser-dot"), null);
  assert.equal(transport.publishes.length, 0, "an audience client must remain read-only");
});
