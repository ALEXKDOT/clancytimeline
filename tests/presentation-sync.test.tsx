import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { StrictMode, type ReactNode } from "react";

import { usePresentationSync } from "../app/presentation/usePresentationSync";
import type {
  PresentationControlState,
  PresentationDomAdapter,
  PresentationMeta,
  PresentationSnapshot,
  PresentationTransport,
  PresentationTransportError,
  PresentationUser,
  Unsubscribe,
} from "../app/presentation/types";

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

const controls: PresentationControlState = {
  view: "course",
  zoom: 1,
  categories,
  searchQuery: "",
  medicationOverlayOpen: false,
  openFaqIds: "coordinated-care",
  selection: { kind: "none", id: "" },
};

function makeSnapshot(overrides: Partial<PresentationSnapshot> = {}): PresentationSnapshot {
  return {
    schemaVersion: 1,
    revision: 1,
    clientId: "presenter-client",
    updatedAt: Date.now(),
    ...controls,
    horizontalRatio: 0.4,
    vertical: { anchorId: "top", progress: 0, fallbackRatio: 0 },
    drawerRatio: 0.2,
    ...overrides,
  };
}

function makeMeta(overrides: Partial<PresentationMeta> = {}): PresentationMeta {
  const now = Date.now();
  return {
    schemaVersion: 1,
    active: true,
    presenterClientId: "presenter-client",
    startedAt: now,
    heartbeatAt: now,
    endedAt: 0,
    disconnectedAt: 0,
    ...overrides,
  };
}

class MockTransport implements PresentationTransport {
  configured = true;
  authorized = true;
  transientProbeFailures = 0;
  publishDelayMs = 0;
  connected = true;
  user: PresentationUser | null = null;
  meta: PresentationMeta | null = null;
  state: PresentationSnapshot | null = null;
  starts: PresentationSnapshot[] = [];
  publishes: PresentationSnapshot[] = [];
  stops = 0;
  signOuts = 0;
  releases = 0;
  heartbeats = 0;
  probes = 0;
  private metaListeners = new Set<(value: PresentationMeta | null) => void>();
  private stateListeners = new Set<(value: PresentationSnapshot | null) => void>();
  private connectionListeners = new Set<(value: boolean) => void>();
  private authListeners = new Set<(value: PresentationUser | null) => void>();

  get subscriptionCount() {
    return this.metaListeners.size + this.stateListeners.size
      + this.connectionListeners.size + this.authListeners.size;
  }

  subscribeMeta(onValue: (meta: PresentationMeta | null) => void): Unsubscribe {
    this.metaListeners.add(onValue);
    onValue(this.meta);
    return () => this.metaListeners.delete(onValue);
  }

  subscribeState(onValue: (state: PresentationSnapshot | null) => void): Unsubscribe {
    this.stateListeners.add(onValue);
    onValue(this.state);
    return () => this.stateListeners.delete(onValue);
  }

  subscribeConnection(onValue: (connected: boolean) => void): Unsubscribe {
    this.connectionListeners.add(onValue);
    onValue(this.connected);
    return () => this.connectionListeners.delete(onValue);
  }

  subscribeServerTimeOffset(onValue: (offsetMs: number) => void): Unsubscribe {
    onValue(0);
    return () => undefined;
  }

  subscribeAuth(onValue: (user: PresentationUser | null) => void): Unsubscribe {
    this.authListeners.add(onValue);
    onValue(this.user);
    return () => this.authListeners.delete(onValue);
  }

  async signInWithGoogle() {
    this.user = {
      uid: "presenter-uid",
      email: "presenter@example.test",
      emailVerified: true,
      displayName: "Presenter",
    };
    this.authListeners.forEach((listener) => listener(this.user));
    return this.user;
  }

  async signOut() {
    this.signOuts += 1;
    this.user = null;
    this.authListeners.forEach((listener) => listener(null));
  }

  async probeAuthorization() {
    this.probes += 1;
    if (this.transientProbeFailures > 0) {
      this.transientProbeFailures -= 1;
      throw { code: "NETWORK_ERROR", message: "Temporary authorization probe failure." };
    }
    if (!this.authorized) {
      throw { code: "PERMISSION_DENIED", message: "Permission denied by test rules." };
    }
  }

  async start(snapshot: PresentationSnapshot) {
    this.starts.push(snapshot);
    this.state = { ...snapshot, updatedAt: Date.now() };
    this.meta = makeMeta({ presenterClientId: snapshot.clientId });
    this.emitState(this.state);
    this.emitMeta(this.meta);
  }

  async publish(snapshot: PresentationSnapshot) {
    this.publishes.push(snapshot);
    if (this.publishDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.publishDelayMs));
    }
    this.state = snapshot;
    this.emitState(snapshot);
  }

  async heartbeat() { this.heartbeats += 1; }

  async stop() {
    this.stops += 1;
    this.meta = makeMeta({ active: false, endedAt: Date.now() });
    this.emitMeta(this.meta);
  }

  async releasePresenterConnection() { this.releases += 1; }

  emitMeta(value: PresentationMeta | null) {
    this.meta = value;
    this.metaListeners.forEach((listener) => listener(value));
  }

  emitState(value: PresentationSnapshot | null) {
    this.state = value;
    this.stateListeners.forEach((listener) => listener(value));
  }

  emitConnection(value: boolean) {
    this.connected = value;
    this.connectionListeners.forEach((listener) => listener(value));
  }

  fail(error: PresentationTransportError) {
    // Listener-error paths are statically covered; this helper documents the shape.
    return error;
  }
}

let jsdom: JSDOM;

beforeEach(() => {
  jsdom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
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
  jsdom.window.requestAnimationFrame = (callback: FrameRequestCallback) =>
    jsdom.window.setTimeout(() => callback(Date.now()), 0);
  jsdom.window.cancelAnimationFrame = (id: number) => jsdom.window.clearTimeout(id);
  jsdom.window.scrollTo = () => undefined;
});

afterEach(() => {
  cleanup();
  jsdom.window.close();
});

function renderSync(
  transport: MockTransport,
  presenterMode: boolean,
  applyControls: (value: Omit<PresentationControlState, "selection">) => void = () => undefined,
  applySelection: (value: PresentationControlState["selection"]) => void = () => undefined,
  localState: PresentationControlState = controls,
  dom: Partial<PresentationDomAdapter> = {
    getAnchors: () => [],
    getTimelineScroller: () => null,
    getDrawerScroller: () => null,
  },
) {
  return renderHook(() => usePresentationSync({
    presenterMode,
    localState,
    applyRemoteControls: applyControls,
    applyRemoteSelection: applySelection,
    transportFactory: () => transport,
    dom,
  }), {
    wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
  });
}

test("presenter mode never starts automatically and rejects a rules-denied account", async () => {
  const transport = new MockTransport();
  transport.authorized = false;
  const hook = renderSync(transport, true);

  await waitFor(() => assert.equal(hook.result.current.connection, "connected"));
  assert.equal(transport.starts.length, 0);
  await act(() => hook.result.current.signIn());
  await waitFor(() => assert.equal(hook.result.current.authorization, "unauthorized"));
  await act(() => hook.result.current.startPresenting());
  assert.equal(transport.starts.length, 0);
  assert.equal(hook.result.current.isPresenting, false);
});

test("a transient authorization probe failure retries without signing out", async () => {
  const transport = new MockTransport();
  transport.transientProbeFailures = 1;
  const hook = renderSync(transport, true);

  await waitFor(() => assert.equal(hook.result.current.connection, "connected"));
  await act(() => hook.result.current.signIn());
  await waitFor(() => assert.equal(hook.result.current.authorization, "unavailable"));
  await waitFor(
    () => assert.equal(hook.result.current.authorization, "authorized"),
    { timeout: 3_500 },
  );
  assert.ok(transport.probes >= 2);
});

test("authorized presenter explicitly starts, publishes a complete snapshot, and stops", async () => {
  const transport = new MockTransport();
  const hook = renderSync(transport, true);

  await waitFor(() => assert.equal(hook.result.current.connection, "connected"));
  await act(() => hook.result.current.signIn());
  await waitFor(() => assert.equal(hook.result.current.authorization, "authorized"));
  assert.equal(transport.starts.length, 0);

  await act(() => hook.result.current.startPresenting());
  await waitFor(() => assert.equal(hook.result.current.isPresenting, true));
  assert.equal(transport.starts.length, 1);
  assert.equal(transport.starts[0].view, "course");
  assert.deepEqual(transport.starts[0].selection, { kind: "none", id: "" });
  assert.equal(transport.starts[0].openFaqIds, "coordinated-care");

  await act(() => hook.result.current.stopPresenting());
  await waitFor(() => assert.equal(hook.result.current.isPresenting, false));
  assert.equal(transport.stops, 1);
});

test("presenter timeline and drawer scrolling publish normalized, throttled snapshots", async () => {
  const transport = new MockTransport();
  const timeline = document.createElement("div");
  const drawer = document.createElement("aside");
  Object.defineProperties(timeline, {
    scrollWidth: { configurable: true, value: 2_000 },
    clientWidth: { configurable: true, value: 500 },
  });
  Object.defineProperties(drawer, {
    scrollHeight: { configurable: true, value: 1_200 },
    clientHeight: { configurable: true, value: 400 },
  });
  const localState = {
    ...controls,
    selection: { kind: "event", id: "birth" } as const,
  };
  const hook = renderSync(transport, true, undefined, undefined, localState, {
    getAnchors: () => [],
    getTimelineScroller: () => timeline,
    getDrawerScroller: () => drawer,
  });

  await waitFor(() => assert.equal(hook.result.current.connection, "connected"));
  await act(() => hook.result.current.signIn());
  await waitFor(() => assert.equal(hook.result.current.authorization, "authorized"));
  await act(() => hook.result.current.startPresenting());
  await waitFor(() => assert.equal(hook.result.current.isPresenting, true));
  transport.publishes.length = 0;

  act(() => {
    timeline.scrollLeft = 750;
    drawer.scrollTop = 400;
    for (let index = 0; index < 20; index += 1) {
      timeline.dispatchEvent(new window.Event("scroll"));
      drawer.dispatchEvent(new window.Event("scroll"));
    }
  });
  await waitFor(() => assert.ok(transport.publishes.length >= 1));
  await new Promise((resolve) => setTimeout(resolve, 130));
  assert.ok(transport.publishes.length <= 2, "scroll bursts should not write on every event");
  assert.equal(transport.publishes.at(-1)?.horizontalRatio, 0.5);
  assert.equal(transport.publishes.at(-1)?.drawerRatio, 0.5);
});

test("slow presenter writes keep only the latest pending snapshot and reconnect reasserts current state", async () => {
  const transport = new MockTransport();
  transport.publishDelayMs = 250;
  const timeline = document.createElement("div");
  Object.defineProperties(timeline, {
    scrollWidth: { configurable: true, value: 2_000 },
    clientWidth: { configurable: true, value: 500 },
  });
  const hook = renderSync(transport, true, undefined, undefined, controls, {
    getAnchors: () => [],
    getTimelineScroller: () => timeline,
    getDrawerScroller: () => null,
  });

  await waitFor(() => assert.equal(hook.result.current.connection, "connected"));
  await act(() => hook.result.current.signIn());
  await waitFor(() => assert.equal(hook.result.current.authorization, "authorized"));
  await act(() => hook.result.current.startPresenting());
  await waitFor(() => assert.equal(hook.result.current.isPresenting, true));
  transport.publishes.length = 0;

  timeline.scrollLeft = 150;
  let drain!: Promise<void>;
  act(() => {
    drain = hook.result.current.publishNow();
  });
  await waitFor(() => assert.equal(transport.publishes.length, 1));

  act(() => {
    for (let index = 2; index <= 10; index += 1) {
      timeline.scrollLeft = index * 120;
      void hook.result.current.publishNow();
    }
  });
  await act(async () => drain);

  assert.equal(
    transport.publishes.length,
    2,
    "one slow in-flight write should retain only one latest pending snapshot",
  );
  assert.equal(transport.publishes[0].horizontalRatio, 0.1);
  assert.equal(transport.publishes[1].horizontalRatio, 0.8);

  transport.publishDelayMs = 0;
  transport.publishes.length = 0;
  act(() => transport.emitConnection(false));
  await waitFor(() => assert.equal(hook.result.current.connection, "disconnected"));
  timeline.scrollLeft = 300;
  act(() => transport.emitConnection(true));
  await waitFor(() => assert.equal(hook.result.current.connection, "connected"));
  await waitFor(() => assert.equal(transport.publishes.length, 1));
  assert.equal(transport.publishes[0].horizontalRatio, 0.2);
});

test("a stale session owner retires active metadata before sign-out and never abandons it offline", async () => {
  const onlineTransport = new MockTransport();
  const onlineHook = renderSync(onlineTransport, true);

  await waitFor(() => assert.equal(onlineHook.result.current.connection, "connected"));
  await act(() => onlineHook.result.current.signIn());
  await waitFor(() => assert.equal(onlineHook.result.current.authorization, "authorized"));
  await act(() => onlineHook.result.current.startPresenting());
  await waitFor(() => assert.equal(onlineHook.result.current.isPresenting, true));

  act(() => onlineTransport.emitMeta(makeMeta({
    presenterClientId: onlineHook.result.current.clientId,
    heartbeatAt: Date.now() - 25_000,
  })));
  await waitFor(() => assert.equal(onlineHook.result.current.isPresenting, false));
  await act(() => onlineHook.result.current.signOut());
  assert.equal(onlineTransport.stops, 1, "owned active metadata must be retired first");
  assert.equal(onlineTransport.signOuts, 1);
  assert.equal(onlineTransport.meta?.active, false);
  onlineHook.unmount();

  const offlineTransport = new MockTransport();
  const offlineHook = renderSync(offlineTransport, true);
  await waitFor(() => assert.equal(offlineHook.result.current.connection, "connected"));
  await act(() => offlineHook.result.current.signIn());
  await waitFor(() => assert.equal(offlineHook.result.current.authorization, "authorized"));
  await act(() => offlineHook.result.current.startPresenting());
  await waitFor(() => assert.equal(offlineHook.result.current.isPresenting, true));

  act(() => offlineTransport.emitMeta(makeMeta({
    presenterClientId: offlineHook.result.current.clientId,
    heartbeatAt: Date.now() - 25_000,
  })));
  await waitFor(() => assert.equal(offlineHook.result.current.isPresenting, false));
  act(() => offlineTransport.emitConnection(false));
  await waitFor(() => assert.equal(offlineHook.result.current.connection, "disconnected"));
  await act(() => offlineHook.result.current.signOut());
  assert.equal(offlineTransport.stops, 0);
  assert.equal(offlineTransport.signOuts, 0);
  assert.equal(offlineTransport.releases, 0, "pending onDisconnect must remain armed");
  assert.equal(offlineTransport.meta?.active, true);
  assert.equal(offlineHook.result.current.error?.code, "presentation/reconnect-before-sign-out");
});

test("an open or late-joining audience applies the newest complete state in staged order", async () => {
  const transport = new MockTransport();
  transport.state = makeSnapshot({
    view: "post",
    zoom: 1.42,
    searchQuery: "voice",
    medicationOverlayOpen: true,
    openFaqIds: "command-voice-timing",
    selection: { kind: "event", id: "jan24-sequence" },
    revision: 12,
  });
  transport.meta = makeMeta();
  const applied: string[] = [];
  const hook = renderSync(
    transport,
    false,
    (value) => applied.push(`controls:${value.view}:${value.searchQuery}:${value.openFaqIds}`),
    (value) => applied.push(`selection:${value.kind}:${value.id}`),
  );

  await waitFor(() => assert.equal(hook.result.current.isFollowing, true));
  await waitFor(() => assert.deepEqual(applied, [
    "controls:post:voice:command-voice-timing",
    "selection:event:jan24-sequence",
  ]));
  assert.equal(transport.publishes.length, 0, "audience remote application must never feed back");

  act(() => transport.emitState(makeSnapshot({
    view: "course",
    revision: 13,
    selection: { kind: "medication", id: "quetiapine" },
  })));
  await waitFor(() => assert.equal(applied.at(-1), "selection:medication:quetiapine"));
  act(() => transport.emitState(makeSnapshot({ revision: 14, selection: { kind: "none", id: "" } })));
  await waitFor(() => assert.equal(applied.at(-1), "selection:none:"));
  assert.equal(transport.publishes.length, 0);
});

test("Explore locally pauses application and Rejoin immediately applies the latest state", async () => {
  const transport = new MockTransport();
  transport.state = makeSnapshot({ revision: 3 });
  transport.meta = makeMeta();
  const selections: string[] = [];
  const hook = renderSync(
    transport,
    false,
    () => undefined,
    (value) => selections.push(`${value.kind}:${value.id}`),
  );
  await waitFor(() => assert.equal(hook.result.current.isFollowing, true));
  await waitFor(() => assert.equal(selections.length, 1));

  act(() => hook.result.current.exploreLocally());
  assert.equal(hook.result.current.isExploring, true);
  act(() => transport.emitState(makeSnapshot({ revision: 4, selection: { kind: "event", id: "birth" } })));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(selections.length, 1);

  act(() => hook.result.current.rejoinPresenter());
  await waitFor(() => assert.equal(selections.at(-1), "event:birth"));
  assert.equal(hook.result.current.isExploring, false);
});

test("stop and stale heartbeat unlock audiences; listener cleanup is Strict-Mode safe", async () => {
  const transport = new MockTransport();
  transport.state = makeSnapshot({ revision: 8 });
  transport.meta = makeMeta();
  const hook = renderSync(transport, false);
  await waitFor(() => assert.equal(hook.result.current.isFollowing, true));
  assert.equal(transport.subscriptionCount, 3, "audience has one meta, state, and connection listener");

  act(() => transport.emitMeta(makeMeta({ active: false, endedAt: Date.now() })));
  await waitFor(() => assert.equal(hook.result.current.isFollowing, false));
  await waitFor(() => assert.equal(hook.result.current.hadLiveSession, false));

  act(() => transport.emitMeta(makeMeta()));
  await waitFor(() => assert.equal(hook.result.current.isFollowing, true));
  act(() => transport.emitConnection(false));
  await waitFor(() => assert.equal(hook.result.current.isFollowing, false));
  assert.equal(hook.result.current.hadLiveSession, true);
  act(() => transport.emitConnection(true));
  await waitFor(() => assert.equal(hook.result.current.isFollowing, true));
  act(() => transport.emitMeta(makeMeta({ heartbeatAt: Date.now() - 25_000 })));
  await waitFor(() => assert.equal(hook.result.current.isFollowing, false));
  assert.equal(hook.result.current.hadLiveSession, true);

  hook.unmount();
  assert.equal(transport.subscriptionCount, 0);
  const remount = renderSync(transport, false);
  await waitFor(() => assert.equal(transport.subscriptionCount, 3));
  remount.unmount();
  assert.equal(transport.subscriptionCount, 0);
});
