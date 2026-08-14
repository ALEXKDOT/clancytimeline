import assert from "node:assert/strict";
import test from "node:test";

import {
  clampRatio,
  heartbeatIsStale,
  nextPointerSequence,
  normalizeMeta,
  normalizePointerRatios,
  normalizePointerState,
  normalizeSnapshot,
  pointerIsFresh,
  presentationIsLive,
  snapshotsMeaningfullyEqual,
} from "../app/presentation/state";
import {
  captureVerticalPosition,
  normalizedElementScroll,
  normalizedElementVerticalScroll,
  restoreElementHorizontalScroll,
  restoreElementVerticalScroll,
  restoreVerticalPosition,
} from "../app/presentation/scroll";
import type { PresentationSnapshot } from "../app/presentation/types";

const categories = {
  clinical: true,
  symptom: true,
  hospital: true,
  medication: true,
  collateral: true,
  digital: true,
  event: true,
  post: true,
};

function snapshot(overrides: Partial<PresentationSnapshot> = {}): PresentationSnapshot {
  return {
    schemaVersion: 1,
    revision: 1,
    clientId: "presenter-tab-a",
    updatedAt: 1_000,
    view: "course",
    zoom: 1,
    categories,
    searchQuery: "",
    medicationOverlayOpen: false,
    openFaqIds: "coordinated-care",
    selection: { kind: "none", id: "" },
    horizontalRatio: 0,
    vertical: { anchorId: "top", progress: 0, fallbackRatio: 0 },
    drawerRatio: 0,
    ...overrides,
  };
}

test("normalizes a complete presentation snapshot and rejects unsupported state", () => {
  assert.deepEqual(normalizeSnapshot(snapshot()), snapshot());
  assert.equal(normalizeSnapshot({ ...snapshot(), schemaVersion: 2 }), null);
  assert.equal(normalizeSnapshot({ ...snapshot(), view: "other" }), null);
  assert.equal(normalizeSnapshot({ ...snapshot(), zoom: 8 }), null);
  assert.equal(normalizeSnapshot({ ...snapshot(), selection: { kind: "event", id: "" } }), null);
  assert.equal(normalizeSnapshot({ ...snapshot(), categories: { ...categories, clinical: "yes" } }), null);
});

test("clamps all normalized scroll ratios and safely handles zero-length ranges", () => {
  assert.equal(clampRatio(-1), 0);
  assert.equal(clampRatio(0.42), 0.42);
  assert.equal(clampRatio(9), 1);
  assert.equal(clampRatio(Number.NaN), 0);

  const horizontal = { scrollLeft: 600, scrollWidth: 1_500, clientWidth: 500 } as HTMLElement;
  assert.equal(normalizedElementScroll(horizontal), 0.6);
  restoreElementHorizontalScroll(horizontal, 0.25);
  assert.equal(horizontal.scrollLeft, 250);

  const vertical = { scrollTop: 360, scrollHeight: 1_000, clientHeight: 400 } as HTMLElement;
  assert.equal(normalizedElementVerticalScroll(vertical), 0.6);
  restoreElementVerticalScroll(vertical, 0.5);
  assert.equal(vertical.scrollTop, 300);

  const fixed = { scrollLeft: 12, scrollWidth: 500, clientWidth: 500 } as HTMLElement;
  assert.equal(normalizedElementScroll(fixed), 0);
  restoreElementHorizontalScroll(fixed, 1);
  assert.equal(fixed.scrollLeft, 0);
});

test("captures semantic vertical progress and restores it on a differently sized page", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  let targetTop = -1;
  const fakeWindow = {
    scrollY: 750,
    scrollX: 0,
    innerHeight: 1_000,
    scrollTo: ({ top }: { top: number }) => { targetTop = top; },
  } as unknown as Window & typeof globalThis;
  const fakeDocument = { documentElement: { scrollHeight: 4_000 } } as Document;
  Object.assign(globalThis, { window: fakeWindow, document: fakeDocument });

  const anchor = (id: string, absolute: number) => ({
    id,
    element: {
      isConnected: true,
      getBoundingClientRect: () => ({ top: absolute - fakeWindow.scrollY }),
    } as HTMLElement,
  });

  try {
    const captured = captureVerticalPosition([
      anchor("top", 0),
      anchor("background", 500),
      anchor("workspace", 1_500),
      anchor("footer", 3_200),
    ]);
    assert.equal(captured.anchorId, "background");
    assert.equal(captured.progress, 0.25);

    restoreVerticalPosition(captured, [
      anchor("top", 0),
      anchor("background", 800),
      anchor("workspace", 2_800),
      anchor("footer", 5_000),
    ]);
    assert.equal(targetTop, 1_300);
  } finally {
    Object.assign(globalThis, { window: originalWindow, document: originalDocument });
  }
});

test("detects active, stopped, and stale heartbeat states using server-relative time", () => {
  const meta = normalizeMeta({
    schemaVersion: 1,
    active: true,
    presenterClientId: "presenter-tab-a",
    startedAt: 1_000,
    heartbeatAt: 10_000,
    endedAt: 0,
    disconnectedAt: 0,
  });
  assert.ok(meta);
  assert.equal(presentationIsLive(meta, 20_000, 18_000), true);
  assert.equal(heartbeatIsStale(meta, 28_001, 18_000), true);
  assert.equal(presentationIsLive({ ...meta!, active: false }, 10_001), false);
});

test("normalizes responsive laser coordinates, ordering, and stale visibility", () => {
  const pointer = {
    schemaVersion: 1 as const,
    clientId: "presenter-tab-a",
    sequence: 1_000,
    xRatio: 0.25,
    yRatio: 0.75,
    visible: true,
    updatedAt: 10_000,
  };
  assert.deepEqual(normalizePointerState(pointer), pointer);
  assert.equal(normalizePointerState({ ...pointer, sequence: 1.5 }), null);
  assert.equal(normalizePointerState({ ...pointer, xRatio: 1.01 }), null);
  assert.equal(normalizePointerState({ ...pointer, yRatio: -0.01 }), null);
  assert.deepEqual(normalizePointerRatios(250, 450, 1_000, 600), {
    xRatio: 0.25,
    yRatio: 0.75,
  });
  assert.deepEqual(normalizePointerRatios(-20, 900, 1_000, 600), {
    xRatio: 0,
    yRatio: 1,
  });
  assert.equal(nextPointerSequence(1_000, 900), 1_001);
  assert.equal(pointerIsFresh(pointer, 12_500), true);
  assert.equal(pointerIsFresh(pointer, 12_501), false);
  assert.equal(pointerIsFresh({ ...pointer, visible: false }, 10_100), false);
});

test("meaningful snapshot equality ignores transport metadata and tiny scroll noise", () => {
  const first = snapshot({ horizontalRatio: 0.50001, drawerRatio: 0.20001 });
  const second = snapshot({
    revision: 99,
    updatedAt: 9_999,
    horizontalRatio: 0.50002,
    drawerRatio: 0.20002,
  });
  assert.equal(snapshotsMeaningfullyEqual(first, second), true);
  assert.equal(snapshotsMeaningfullyEqual(first, snapshot({ searchQuery: "insomnia" })), false);
});
