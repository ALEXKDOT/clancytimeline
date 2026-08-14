"use client";

/* eslint-disable react-hooks/set-state-in-effect -- Firebase subscription and session-lifecycle effects intentionally mirror external state. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  PRESENTATION_AUTH_RETRY_MS,
  PRESENTATION_HEARTBEAT_MS,
  PRESENTATION_REMOTE_SUPPRESSION_MS,
  PRESENTATION_SCROLL_THROTTLE_MS,
} from "./config";
import {
  createPresentationTransport,
  normalizePresentationTransportError,
} from "./firebase";
import {
  captureVerticalPosition,
  defaultPresentationDomAdapter,
  nextAnimationFrames,
  normalizedElementScroll,
  normalizedElementVerticalScroll,
  restoreElementHorizontalScroll,
  restoreElementVerticalScroll,
  restoreVerticalPosition,
} from "./scroll";
import {
  normalizeControlState,
  presentationIsLive,
  snapshotContentKey,
} from "./state";
import {
  PRESENTATION_CATEGORY_KEYS,
  PRESENTATION_SCHEMA_VERSION,
  type PresentationConnectionStatus,
  type PresentationMeta,
  type PresentationSnapshot,
  type PresentationTransportError,
  type UsePresentationSyncOptions,
  type UsePresentationSyncResult,
} from "./types";

let runtimeClientId: string | null = null;

export function getStablePresentationClientId() {
  if (typeof window === "undefined") return "server-render";
  if (runtimeClientId) return runtimeClientId;
  // Module scope remains stable across React Strict Mode remounts but, unlike
  // sessionStorage, is not cloned when a presenter opens a second tab.
  runtimeClientId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return runtimeClientId;
}

export function usePresentationSync({
  presenterMode,
  localState,
  applyRemoteControls,
  applyRemoteSelection,
  dom,
  transportFactory,
}: UsePresentationSyncOptions): UsePresentationSyncResult {
  const [clientId] = useState(getStablePresentationClientId);
  const [transport] = useState(() =>
    transportFactory ? transportFactory() : createPresentationTransport(),
  );
  const [connection, setConnection] = useState<PresentationConnectionStatus>(
    transport.configured ? "connecting" : "disabled",
  );
  const [user, setUser] = useState<UsePresentationSyncResult["user"]>(null);
  const [authorization, setAuthorization] = useState<UsePresentationSyncResult["authorization"]>(
    "signed-out",
  );
  const [authorizationRetryToken, setAuthorizationRetryToken] = useState(0);
  const [remoteMeta, setRemoteMeta] = useState<PresentationMeta | null>(null);
  const [latestRemoteState, setLatestRemoteState] = useState<PresentationSnapshot | null>(null);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [isPresenting, setIsPresenting] = useState(false);
  const [isExploring, setIsExploring] = useState(false);
  const [hadLiveSession, setHadLiveSession] = useState(false);
  const [error, setError] = useState<PresentationTransportError | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [lastPublishedAt, setLastPublishedAt] = useState(0);
  const [lastReceivedAt, setLastReceivedAt] = useState(0);

  const localStateRef = useRef(localState);
  const domRef = useRef(dom);
  const applyControlsRef = useRef(applyRemoteControls);
  const applySelectionRef = useRef(applyRemoteSelection);
  const remoteMetaRef = useRef(remoteMeta);
  const remoteStateRef = useRef(latestRemoteState);
  const isPresentingRef = useRef(isPresenting);
  const applyingRemoteRef = useRef(false);
  const suppressionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyGenerationRef = useRef(0);
  const lastAppliedRevisionRef = useRef<{ clientId: string; revision: number } | null>(null);
  const revisionRef = useRef(0);
  const lastPublishedSnapshotRef = useRef<PresentationSnapshot | null>(null);
  const pendingPublishSnapshotRef = useRef<PresentationSnapshot | null>(null);
  const publishDrainRef = useRef<Promise<void> | null>(null);
  const publishDrainTokenRef = useRef<object | null>(null);
  const previousConnectionRef = useRef(connection);
  const authorizationProbeRef = useRef<{
    key: string;
    promise: Promise<void>;
  } | null>(null);

  useEffect(() => {
    localStateRef.current = localState;
    domRef.current = dom;
    applyControlsRef.current = applyRemoteControls;
    applySelectionRef.current = applyRemoteSelection;
    remoteMetaRef.current = remoteMeta;
    remoteStateRef.current = latestRemoteState;
    isPresentingRef.current = isPresenting;
  }, [applyRemoteControls, applyRemoteSelection, dom, isPresenting, latestRemoteState, localState, remoteMeta]);

  const resolveDom = useCallback(() => ({
    getAnchors: domRef.current?.getAnchors ?? defaultPresentationDomAdapter.getAnchors,
    getTimelineScroller:
      domRef.current?.getTimelineScroller ?? defaultPresentationDomAdapter.getTimelineScroller,
    getDrawerScroller:
      domRef.current?.getDrawerScroller ?? defaultPresentationDomAdapter.getDrawerScroller,
  }), []);

  const recordError = useCallback((nextError: unknown) => {
    setError(normalizePresentationTransportError(nextError));
  }, []);

  const makeSnapshot = useCallback(() => {
    const controls = normalizeControlState(localStateRef.current);
    if (!controls) {
      throw Object.assign(new Error("The local timeline state is not valid for presentation."), {
        code: "presentation/invalid-local-state",
      });
    }
    const adapter = resolveDom();
    revisionRef.current += 1;
    return {
      schemaVersion: PRESENTATION_SCHEMA_VERSION,
      revision: revisionRef.current,
      clientId,
      updatedAt: Date.now() + serverTimeOffset,
      ...controls,
      horizontalRatio: normalizedElementScroll(adapter.getTimelineScroller()),
      vertical: captureVerticalPosition(adapter.getAnchors()),
      drawerRatio: normalizedElementVerticalScroll(adapter.getDrawerScroller()),
    } satisfies PresentationSnapshot;
  }, [clientId, resolveDom, serverTimeOffset]);

  const publishSnapshot = useCallback((force = false) => {
    if (!transport.configured || !isPresentingRef.current || applyingRemoteRef.current) {
      return Promise.resolve();
    }
    let snapshot: PresentationSnapshot;
    try {
      snapshot = makeSnapshot();
    } catch (publishError) {
      recordError(publishError);
      return Promise.reject(publishError);
    }
    if (
      !force &&
      lastPublishedSnapshotRef.current &&
      snapshotContentKey(lastPublishedSnapshotRef.current) === snapshotContentKey(snapshot)
    ) {
      return Promise.resolve();
    }
    lastPublishedSnapshotRef.current = snapshot;
    pendingPublishSnapshotRef.current = snapshot;

    if (publishDrainRef.current) return publishDrainRef.current;

    const drainToken = {};
    const drain = Promise.resolve().then(async () => {
      try {
        while (pendingPublishSnapshotRef.current) {
          const nextSnapshot = pendingPublishSnapshotRef.current;
          pendingPublishSnapshotRef.current = null;
          await transport.publish(nextSnapshot);
          setLastPublishedAt(Date.now());
        }
      } catch (publishError) {
        // A failed write invalidates both the in-flight snapshot and any newer
        // coalesced snapshot. The next local change or reconnect will enqueue a
        // complete fresh snapshot instead of replaying stale intermediate state.
        pendingPublishSnapshotRef.current = null;
        lastPublishedSnapshotRef.current = null;
        recordError(publishError);
        throw publishError;
      } finally {
        // Clearing inside the drain (rather than in a chained `finally`) leaves
        // no microtask-sized window in which a newly queued snapshot can stall.
        if (publishDrainTokenRef.current === drainToken) {
          publishDrainRef.current = null;
          publishDrainTokenRef.current = null;
        }
      }
    });
    publishDrainTokenRef.current = drainToken;
    publishDrainRef.current = drain;
    return drain;
  }, [makeSnapshot, recordError, transport]);

  const applyRemoteSnapshot = useCallback(async (snapshot: PresentationSnapshot, force = false) => {
    const lastApplied = lastAppliedRevisionRef.current;
    if (
      !force &&
      lastApplied?.clientId === snapshot.clientId &&
      snapshot.revision <= lastApplied.revision
    ) return;
    lastAppliedRevisionRef.current = {
      clientId: snapshot.clientId,
      revision: snapshot.revision,
    };
    const generation = ++applyGenerationRef.current;
    applyingRemoteRef.current = true;
    if (suppressionTimeoutRef.current) clearTimeout(suppressionTimeoutRef.current);

    const { selection, ...controls } = snapshot;
    applyControlsRef.current(controls);
    await nextAnimationFrames(2);
    if (generation !== applyGenerationRef.current) return;

    applySelectionRef.current(selection);
    await nextAnimationFrames(2);
    if (generation !== applyGenerationRef.current) return;

    const adapter = resolveDom();
    restoreVerticalPosition(snapshot.vertical, adapter.getAnchors());
    restoreElementHorizontalScroll(adapter.getTimelineScroller(), snapshot.horizontalRatio);
    restoreElementVerticalScroll(adapter.getDrawerScroller(), snapshot.drawerRatio);

    suppressionTimeoutRef.current = setTimeout(() => {
      if (generation === applyGenerationRef.current) applyingRemoteRef.current = false;
    }, PRESENTATION_REMOTE_SUPPRESSION_MS);
  }, [resolveDom]);

  useEffect(() => {
    if (!transport.configured) return;
    setConnection("connecting");
    const onListenerError = (listenerError: PresentationTransportError) => {
      setError(listenerError);
      setConnection("error");
    };
    const unsubscribeConnection = transport.subscribeConnection((connected) => {
      setConnection(connected ? "connected" : "disconnected");
    });
    const unsubscribeOffset = transport.subscribeServerTimeOffset(setServerTimeOffset);
    const unsubscribeMeta = transport.subscribeMeta((meta) => {
      setRemoteMeta(meta);
      setClockNow(Date.now());
    }, onListenerError);
    const unsubscribeState = transport.subscribeState((state) => {
      setLatestRemoteState(state);
      if (state) {
        revisionRef.current = Math.max(revisionRef.current, state.revision);
        setLastReceivedAt(Date.now());
      }
    }, onListenerError);
    const unsubscribeAuth = presenterMode
      ? transport.subscribeAuth(setUser)
      : () => undefined;
    return () => {
      unsubscribeAuth();
      unsubscribeState();
      unsubscribeMeta();
      unsubscribeOffset();
      unsubscribeConnection();
    };
  }, [presenterMode, transport]);

  useEffect(() => {
    if (!presenterMode) return;
    if (!user) {
      authorizationProbeRef.current = null;
      setAuthorization("signed-out");
      return;
    }
    if (!user.emailVerified) {
      setAuthorization("unauthorized");
      return;
    }
    if (connection !== "connected") {
      setAuthorization("unavailable");
      return;
    }

    const probeKey = `${user.uid}:${clientId}`;
    if (authorizationProbeRef.current?.key !== probeKey) {
      authorizationProbeRef.current = {
        key: probeKey,
        promise: transport.probeAuthorization(user, clientId),
      };
    }
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    setAuthorization("checking");
    authorizationProbeRef.current.promise.then(
      () => {
        if (!cancelled) {
          setAuthorization("authorized");
          setError(null);
        }
      },
      (probeError) => {
        if (!cancelled) {
          const normalized = normalizePresentationTransportError(probeError);
          const code = normalized.code.toLowerCase();
          const isAuthorizationDenial = code.includes("permission")
            || code.includes("not-authorized")
            || code.includes("email-not-verified");
          if (!isAuthorizationDenial && authorizationProbeRef.current?.key === probeKey) {
            authorizationProbeRef.current = null;
          }
          setAuthorization(isAuthorizationDenial ? "unauthorized" : "unavailable");
          setError(normalized);
          if (!isAuthorizationDenial) {
            retryTimeout = window.setTimeout(
              () => setAuthorizationRetryToken((token) => token + 1),
              PRESENTATION_AUTH_RETRY_MS,
            );
          }
        }
      },
    );
    return () => {
      cancelled = true;
      if (retryTimeout) window.clearTimeout(retryTimeout);
    };
  }, [authorizationRetryToken, clientId, connection, presenterMode, transport, user]);

  const serverNow = clockNow + serverTimeOffset;
  const liveSession = presentationIsLive(remoteMeta, serverNow);
  const matchingRemoteState = Boolean(
    liveSession &&
      latestRemoteState &&
      latestRemoteState.clientId === remoteMeta?.presenterClientId,
  );
  const isFollowing = !presenterMode
    && connection === "connected"
    && matchingRemoteState
    && !isExploring;

  useEffect(() => {
    if (!remoteMeta?.active) return;
    const interval = window.setInterval(() => setClockNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [remoteMeta?.active]);

  useEffect(() => {
    if (isFollowing || (!presenterMode && liveSession)) setHadLiveSession(true);
    if (remoteMeta && !remoteMeta.active) setHadLiveSession(false);
    if (!liveSession && isExploring) setIsExploring(false);
  }, [isExploring, isFollowing, liveSession, presenterMode, remoteMeta]);

  useEffect(() => {
    if (!presenterMode) return;
    const ownsLiveSession = Boolean(
      liveSession && remoteMeta?.presenterClientId === clientId,
    );
    if (ownsLiveSession) {
      setIsPresenting(true);
      return;
    }
    if (isPresentingRef.current) {
      setIsPresenting(false);
      if (remoteMeta?.active && remoteMeta.presenterClientId !== clientId) {
        void transport.releasePresenterConnection();
        setError({
          code: "presentation/session-replaced",
          message: "Another authorized tab now owns the live presentation.",
        });
      }
    }
  }, [clientId, liveSession, presenterMode, remoteMeta, transport]);

  useEffect(() => {
    if (!isFollowing || !latestRemoteState || !matchingRemoteState) return;
    void applyRemoteSnapshot(latestRemoteState);
  }, [applyRemoteSnapshot, isFollowing, latestRemoteState, matchingRemoteState]);

  const localControlKey = useMemo(() => JSON.stringify({
    view: localState.view,
    zoom: localState.zoom,
    categories: PRESENTATION_CATEGORY_KEYS.map((key) => localState.categories[key]),
    searchQuery: localState.searchQuery,
    medicationOverlayOpen: localState.medicationOverlayOpen,
    openFaqIds: localState.openFaqIds,
    selection: localState.selection,
  }), [localState]);

  useEffect(() => {
    if (isPresenting) return;
    pendingPublishSnapshotRef.current = null;
  }, [isPresenting]);

  useEffect(() => {
    const previousConnection = previousConnectionRef.current;
    previousConnectionRef.current = connection;
    if (
      connection === "connected"
      && previousConnection !== "connected"
      && isPresentingRef.current
    ) {
      // Firebase may have acknowledged an older queued write after a network
      // interruption. Reassert one complete current snapshot on reconnect.
      void publishSnapshot(true).catch(() => undefined);
    }
  }, [connection, publishSnapshot]);

  useEffect(() => {
    if (!isPresenting || applyingRemoteRef.current) return;
    void publishSnapshot().catch(() => undefined);
  }, [isPresenting, localControlKey, publishSnapshot]);

  useEffect(() => {
    if (!isPresenting) return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let lastWrite = 0;
    const onScroll = () => {
      if (applyingRemoteRef.current) return;
      const elapsed = Date.now() - lastWrite;
      const publish = () => {
        timeout = null;
        lastWrite = Date.now();
        void publishSnapshot().catch(() => undefined);
      };
      if (elapsed >= PRESENTATION_SCROLL_THROTTLE_MS) publish();
      else if (!timeout) timeout = setTimeout(publish, PRESENTATION_SCROLL_THROTTLE_MS - elapsed);
    };
    const adapter = resolveDom();
    const timeline = adapter.getTimelineScroller();
    const drawer = adapter.getDrawerScroller();
    window.addEventListener("scroll", onScroll, { passive: true });
    timeline?.addEventListener("scroll", onScroll, { passive: true });
    drawer?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      timeline?.removeEventListener("scroll", onScroll);
      drawer?.removeEventListener("scroll", onScroll);
      if (timeout) clearTimeout(timeout);
    };
  }, [isPresenting, localState.selection.id, localState.selection.kind, publishSnapshot, resolveDom]);

  useEffect(() => {
    if (!isPresenting) return;
    const interval = window.setInterval(() => {
      void transport.heartbeat(clientId).catch((heartbeatError) => {
        const normalized = normalizePresentationTransportError(heartbeatError);
        recordError(normalized);
        if (normalized.code === "presentation/session-lost") setIsPresenting(false);
      });
    }, PRESENTATION_HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [clientId, isPresenting, recordError, transport]);

  useEffect(() => () => {
    applyGenerationRef.current += 1;
    pendingPublishSnapshotRef.current = null;
    if (suppressionTimeoutRef.current) clearTimeout(suppressionTimeoutRef.current);
  }, []);

  const signIn = useCallback(async () => {
    if (!presenterMode) return;
    setIsBusy(true);
    setError(null);
    try {
      setUser(await transport.signInWithGoogle());
    } catch (signInError) {
      recordError(signInError);
    } finally {
      setIsBusy(false);
    }
  }, [presenterMode, recordError, transport]);

  const signOut = useCallback(async () => {
    if (isPresentingRef.current) {
      recordError(Object.assign(
        new Error("Stop the live presentation before signing out."),
        { code: "presentation/stop-before-sign-out" },
      ));
      return;
    }
    const meta = remoteMetaRef.current;
    const ownsActiveSession = Boolean(
      meta?.active && meta.presenterClientId === clientId,
    );
    if (ownsActiveSession && connection !== "connected") {
      recordError(Object.assign(
        new Error("Reconnect before signing out so this tab can safely end its presentation session."),
        { code: "presentation/reconnect-before-sign-out" },
      ));
      return;
    }
    setIsBusy(true);
    try {
      if (ownsActiveSession) {
        pendingPublishSnapshotRef.current = null;
        await transport.stop(clientId);
        setIsPresenting(false);
        lastPublishedSnapshotRef.current = null;
      }
      await transport.signOut();
      setUser(null);
      setAuthorization("signed-out");
      authorizationProbeRef.current = null;
    } catch (signOutError) {
      recordError(signOutError);
    } finally {
      setIsBusy(false);
    }
  }, [clientId, connection, recordError, transport]);

  const startPresenting = useCallback(async () => {
    if (!presenterMode) return;
    if (connection !== "connected") {
      recordError(Object.assign(new Error("Firebase must be connected before presenting."), {
        code: "presentation/not-connected",
      }));
      return;
    }
    if (authorization !== "authorized") {
      recordError(Object.assign(new Error("This Google account is not authorized to present."), {
        code: "presentation/not-authorized",
      }));
      return;
    }
    const meta = remoteMetaRef.current;
    if (meta?.active && meta.presenterClientId !== clientId) {
      recordError(Object.assign(
        new Error("Another presenter tab is active or still disconnecting. Wait for it to stop before starting here."),
        { code: "presentation/session-already-active" },
      ));
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      pendingPublishSnapshotRef.current = null;
      const snapshot = makeSnapshot();
      await transport.start(snapshot);
      lastPublishedSnapshotRef.current = snapshot;
      setLastPublishedAt(Date.now());
      setIsPresenting(true);
    } catch (startError) {
      recordError(startError);
      setIsPresenting(false);
    } finally {
      setIsBusy(false);
    }
  }, [authorization, clientId, connection, makeSnapshot, presenterMode, recordError, transport]);

  const stopPresenting = useCallback(async () => {
    if (!isPresentingRef.current) return;
    setIsBusy(true);
    setError(null);
    try {
      pendingPublishSnapshotRef.current = null;
      await transport.stop(clientId);
      setIsPresenting(false);
      lastPublishedSnapshotRef.current = null;
    } catch (stopError) {
      recordError(stopError);
    } finally {
      setIsBusy(false);
    }
  }, [clientId, recordError, transport]);

  const exploreLocally = useCallback(() => {
    applyGenerationRef.current += 1;
    applyingRemoteRef.current = false;
    if (suppressionTimeoutRef.current) clearTimeout(suppressionTimeoutRef.current);
    setIsExploring(true);
  }, []);

  const rejoinPresenter = useCallback(() => {
    setIsExploring(false);
    const state = remoteStateRef.current;
    const meta = remoteMetaRef.current;
    if (
      state &&
      presentationIsLive(meta, Date.now() + serverTimeOffset) &&
      state.clientId === meta?.presenterClientId
    ) {
      void applyRemoteSnapshot(state, true);
    }
  }, [applyRemoteSnapshot, serverTimeOffset]);

  const publishNow = useCallback(() => publishSnapshot(true), [publishSnapshot]);

  return {
    configured: transport.configured,
    presenterMode,
    clientId,
    connection,
    user,
    authorization,
    isPresenting,
    liveSessionActive: liveSession,
    isFollowing,
    isExploring,
    hadLiveSession,
    isBusy,
    error,
    latestRemoteState,
    lastPublishedAt,
    lastReceivedAt,
    signIn,
    signOut,
    startPresenting,
    stopPresenting,
    exploreLocally,
    rejoinPresenter,
    publishNow,
  };
}
