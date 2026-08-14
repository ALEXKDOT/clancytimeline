"use client";

/* eslint-disable react-hooks/set-state-in-effect -- Pointer subscriptions and browser-lifecycle effects intentionally mirror external state. */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  PRESENTATION_POINTER_IDLE_MS,
  PRESENTATION_POINTER_STALE_AFTER_MS,
  PRESENTATION_POINTER_THROTTLE_MS,
} from "./config";
import {
  createPresentationTransport,
  normalizePresentationTransportError,
} from "./firebase";
import {
  PRESENTATION_SCHEMA_VERSION,
  type PresentationConnectionStatus,
  type PresentationPointerState,
  type PresentationTransportFactory,
} from "./types";

type LaserPoint = { x: number; y: number };

export interface PresentationLaserPointerProps {
  presenterMode: boolean;
  enabled: boolean;
  connection: PresentationConnectionStatus;
  isPresenting: boolean;
  isFollowing: boolean;
  clientId: string;
  activePresenterClientId: string | null;
  onDisable: () => void;
  onError?: (message: string | null) => void;
  transportFactory?: PresentationTransportFactory;
}

function clampRatio(value: number) {
  return Math.min(1, Math.max(0, value));
}

function isPresentationControl(target: EventTarget | null) {
  return target instanceof Element
    && Boolean(target.closest("[data-presentation-control]"));
}

/**
 * High-frequency laser traffic is deliberately isolated from the timeline
 * snapshot hook so pointer movement never rerenders the large chronology tree.
 */
export function PresentationLaserPointer({
  presenterMode,
  enabled,
  connection,
  isPresenting,
  isFollowing,
  clientId,
  activePresenterClientId,
  onDisable,
  onError,
  transportFactory,
}: PresentationLaserPointerProps) {
  const [transport] = useState(() =>
    transportFactory ? transportFactory() : createPresentationTransport(),
  );
  const [localPoint, setLocalPoint] = useState<LaserPoint | null>(null);
  const [remotePoint, setRemotePoint] = useState<LaserPoint | null>(null);
  const [remotePointer, setRemotePointer] = useState<PresentationPointerState | null>(null);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);

  const mountedRef = useRef(true);
  const lastPointRef = useRef<LaserPoint>({ x: 0.5, y: 0.5 });
  const sequenceRef = useRef(0);
  const locallyVisibleRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteStaleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const pendingRenderPointRef = useRef<LaserPoint | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttledPointerRef = useRef<PresentationPointerState | null>(null);
  const lastThrottleFlushRef = useRef(0);
  const pendingWriteRef = useRef<PresentationPointerState | null>(null);
  const writeDrainRef = useRef<Promise<void> | null>(null);

  const reportPointerError = useCallback((error: unknown) => {
    const normalized = normalizePresentationTransportError(error);
    locallyVisibleRef.current = false;
    throttledPointerRef.current = null;
    pendingWriteRef.current = null;
    if (mountedRef.current) {
      setLocalPoint(null);
      setRemotePoint(null);
      onError?.(`Laser pointer unavailable: ${normalized.message}`);
      onDisable();
    }
  }, [onDisable, onError]);

  const drainWrites = useCallback(() => {
    if (writeDrainRef.current) return writeDrainRef.current;

    const drain = Promise.resolve().then(async () => {
      try {
        while (pendingWriteRef.current) {
          const next = pendingWriteRef.current;
          pendingWriteRef.current = null;
          await transport.publishPointer(next);
        }
      } catch (error) {
        pendingWriteRef.current = null;
        reportPointerError(error);
      } finally {
        writeDrainRef.current = null;
      }
    });
    writeDrainRef.current = drain;
    return drain;
  }, [reportPointerError, transport]);

  const enqueueWrite = useCallback((pointer: PresentationPointerState) => {
    pendingWriteRef.current = pointer;
    void drainWrites();
  }, [drainWrites]);

  const flushThrottledPointer = useCallback(() => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    const pointer = throttledPointerRef.current;
    throttledPointerRef.current = null;
    if (!pointer) return;
    lastThrottleFlushRef.current = Date.now();
    enqueueWrite(pointer);
  }, [enqueueWrite]);

  const publishPointer = useCallback((point: LaserPoint, visible: boolean, immediate = false) => {
    const pointer: PresentationPointerState = {
      schemaVersion: PRESENTATION_SCHEMA_VERSION,
      clientId,
      sequence: Math.min(
        Number.MAX_SAFE_INTEGER,
        Math.max(sequenceRef.current + 1, Date.now()),
      ),
      visible,
      xRatio: clampRatio(point.x),
      yRatio: clampRatio(point.y),
      updatedAt: Date.now(),
    };
    sequenceRef.current = pointer.sequence;

    if (immediate) {
      throttledPointerRef.current = pointer;
      flushThrottledPointer();
      return;
    }

    throttledPointerRef.current = pointer;
    const elapsed = Date.now() - lastThrottleFlushRef.current;
    if (elapsed >= PRESENTATION_POINTER_THROTTLE_MS && !throttleTimerRef.current) {
      flushThrottledPointer();
      return;
    }
    if (!throttleTimerRef.current) {
      throttleTimerRef.current = setTimeout(
        flushThrottledPointer,
        Math.max(0, PRESENTATION_POINTER_THROTTLE_MS - elapsed),
      );
    }
  }, [clientId, flushThrottledPointer]);

  const renderLocalPoint = useCallback((point: LaserPoint) => {
    pendingRenderPointRef.current = point;
    if (renderFrameRef.current !== null) return;
    renderFrameRef.current = window.requestAnimationFrame(() => {
      renderFrameRef.current = null;
      const next = pendingRenderPointRef.current;
      pendingRenderPointRef.current = null;
      if (next && mountedRef.current) setLocalPoint(next);
    });
  }, []);

  const hideLocalPointer = useCallback((publish = true) => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (renderFrameRef.current !== null) {
      window.cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
      pendingRenderPointRef.current = null;
    }
    const wasVisible = locallyVisibleRef.current
      || throttledPointerRef.current?.visible === true;
    locallyVisibleRef.current = false;
    if (mountedRef.current) setLocalPoint(null);
    if (publish && wasVisible && connection === "connected" && isPresenting) {
      publishPointer(lastPointRef.current, false, true);
    }
  }, [connection, isPresenting, publishPointer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (presenterMode || !transport.configured) return;
    const unsubscribeOffset = transport.subscribeServerTimeOffset(setServerTimeOffset);
    const unsubscribePointer = transport.subscribePointer(
      setRemotePointer,
      (error) => {
        const normalized = normalizePresentationTransportError(error);
        setRemotePointer(null);
        onError?.(`Laser pointer unavailable: ${normalized.message}`);
      },
    );
    return () => {
      unsubscribePointer();
      unsubscribeOffset();
    };
  }, [onError, presenterMode, transport]);

  useEffect(() => {
    if (remoteStaleTimerRef.current) {
      clearTimeout(remoteStaleTimerRef.current);
      remoteStaleTimerRef.current = null;
    }

    if (
      presenterMode
      || !isFollowing
      || connection !== "connected"
      || !activePresenterClientId
      || !remotePointer?.visible
      || remotePointer.clientId !== activePresenterClientId
    ) {
      setRemotePoint(null);
      return;
    }

    const age = Date.now() + serverTimeOffset - remotePointer.updatedAt;
    const freshnessRemaining = PRESENTATION_POINTER_STALE_AFTER_MS - Math.max(0, age);
    if (freshnessRemaining <= 0) {
      setRemotePoint(null);
      return;
    }

    setRemotePoint({ x: remotePointer.xRatio, y: remotePointer.yRatio });
    remoteStaleTimerRef.current = setTimeout(
      () => setRemotePoint(null),
      freshnessRemaining,
    );
    return () => {
      if (remoteStaleTimerRef.current) {
        clearTimeout(remoteStaleTimerRef.current);
        remoteStaleTimerRef.current = null;
      }
    };
  }, [
    activePresenterClientId,
    connection,
    isFollowing,
    presenterMode,
    remotePointer,
    serverTimeOffset,
  ]);

  useEffect(() => {
    const canPoint = presenterMode
      && enabled
      && isPresenting
      && connection === "connected"
      && activePresenterClientId === clientId;
    if (!canPoint) {
      hideLocalPointer(true);
      if (enabled) onDisable();
      return;
    }

    onError?.(null);

    const resetIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(
        () => hideLocalPointer(true),
        PRESENTATION_POINTER_IDLE_MS,
      );
    };

    const movePointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (isPresentationControl(event.target)) {
        hideLocalPointer(true);
        return;
      }
      const point = {
        x: clampRatio(event.clientX / Math.max(1, window.innerWidth)),
        y: clampRatio(event.clientY / Math.max(1, window.innerHeight)),
      };
      lastPointRef.current = point;
      locallyVisibleRef.current = true;
      renderLocalPoint(point);
      publishPointer(point, true);
      resetIdleTimer();
    };

    const leaveViewport = (event: PointerEvent) => {
      if (event.relatedTarget === null) hideLocalPointer(true);
    };
    const hideForVisibility = () => {
      if (document.visibilityState !== "visible") hideLocalPointer(true);
    };
    const hideForBlur = () => hideLocalPointer(true);

    window.addEventListener("pointermove", movePointer, { passive: true });
    document.addEventListener("pointerout", leaveViewport, { passive: true });
    document.addEventListener("visibilitychange", hideForVisibility);
    window.addEventListener("blur", hideForBlur);
    return () => {
      window.removeEventListener("pointermove", movePointer);
      document.removeEventListener("pointerout", leaveViewport);
      document.removeEventListener("visibilitychange", hideForVisibility);
      window.removeEventListener("blur", hideForBlur);
      hideLocalPointer(true);
    };
  }, [
    activePresenterClientId,
    clientId,
    connection,
    enabled,
    hideLocalPointer,
    isPresenting,
    onDisable,
    onError,
    presenterMode,
    publishPointer,
    renderLocalPoint,
  ]);

  useEffect(() => () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (remoteStaleTimerRef.current) clearTimeout(remoteStaleTimerRef.current);
    if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
    if (renderFrameRef.current !== null) window.cancelAnimationFrame(renderFrameRef.current);
    if (presenterMode && locallyVisibleRef.current && connection === "connected") {
      const point = lastPointRef.current;
      void transport.publishPointer({
        schemaVersion: PRESENTATION_SCHEMA_VERSION,
        clientId,
        sequence: Math.min(Number.MAX_SAFE_INTEGER, sequenceRef.current + 1),
        visible: false,
        xRatio: point.x,
        yRatio: point.y,
        updatedAt: Date.now(),
      }).catch(() => undefined);
    }
  }, [clientId, connection, presenterMode, transport]);

  const point = presenterMode ? localPoint : remotePoint;
  if (!point) return null;

  return (
    <div
      className="presentation-laser-layer"
      data-presentation-laser
      aria-hidden="true"
    >
      <span
        className="presentation-laser-dot"
        style={{
          "--presentation-laser-x": `${point.x * 100}%`,
          "--presentation-laser-y": `${point.y * 100}%`,
        } as CSSProperties}
      />
    </div>
  );
}
