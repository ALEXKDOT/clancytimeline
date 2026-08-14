import {
  PRESENTATION_MAX_FAQ_IDS_LENGTH,
  PRESENTATION_MAX_SEARCH_LENGTH,
  PRESENTATION_MAX_SELECTION_ID_LENGTH,
  PRESENTATION_POINTER_STALE_AFTER_MS,
  PRESENTATION_STALE_AFTER_MS,
} from "./config";
import {
  PRESENTATION_CATEGORY_KEYS,
  PRESENTATION_SCHEMA_VERSION,
  type PresentationCategoryState,
  type PresentationControlState,
  type PresentationMeta,
  type PresentationPointerState,
  type PresentationSelection,
  type PresentationSnapshot,
  type PresentationVerticalPosition,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

export function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeCategories(value: unknown): PresentationCategoryState | null {
  if (!isRecord(value)) return null;
  const normalized = {} as PresentationCategoryState;
  for (const key of PRESENTATION_CATEGORY_KEYS) {
    if (typeof value[key] !== "boolean") return null;
    normalized[key] = value[key];
  }
  return normalized;
}

export function normalizeSelection(value: unknown): PresentationSelection | null {
  if (!isRecord(value)) return null;
  if (
    value.kind !== "none" &&
    value.kind !== "event" &&
    value.kind !== "medication" &&
    value.kind !== "cluster"
  ) {
    return null;
  }
  if (!boundedString(value.id, PRESENTATION_MAX_SELECTION_ID_LENGTH)) return null;
  if (value.kind === "none" && value.id !== "") return null;
  if (value.kind !== "none" && value.id.length === 0) return null;
  return { kind: value.kind, id: value.id };
}

export function normalizeVerticalPosition(value: unknown): PresentationVerticalPosition | null {
  if (!isRecord(value)) return null;
  if (!boundedString(value.anchorId, 80) || value.anchorId.length === 0) return null;
  if (!finiteNumber(value.progress) || !finiteNumber(value.fallbackRatio)) return null;
  return {
    anchorId: value.anchorId,
    progress: clampRatio(value.progress),
    fallbackRatio: clampRatio(value.fallbackRatio),
  };
}

export function normalizeControlState(value: unknown): PresentationControlState | null {
  if (!isRecord(value)) return null;
  if (value.view !== "course" && value.view !== "post") return null;
  if (!finiteNumber(value.zoom) || value.zoom < 0.5 || value.zoom > 2.5) return null;
  if (!boundedString(value.searchQuery, PRESENTATION_MAX_SEARCH_LENGTH)) return null;
  if (typeof value.medicationOverlayOpen !== "boolean") return null;
  if (!boundedString(value.openFaqIds, PRESENTATION_MAX_FAQ_IDS_LENGTH)) return null;
  const categories = normalizeCategories(value.categories);
  const selection = normalizeSelection(value.selection);
  if (!categories || !selection) return null;
  return {
    view: value.view,
    zoom: value.zoom,
    categories,
    searchQuery: value.searchQuery,
    medicationOverlayOpen: value.medicationOverlayOpen,
    openFaqIds: value.openFaqIds,
    selection,
  };
}

export function normalizeSnapshot(value: unknown): PresentationSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== PRESENTATION_SCHEMA_VERSION) return null;
  if (!Number.isInteger(value.revision) || (value.revision as number) < 0) return null;
  if (!boundedString(value.clientId, 100) || value.clientId.length === 0) return null;
  if (!finiteNumber(value.updatedAt) || value.updatedAt < 0) return null;
  if (!finiteNumber(value.horizontalRatio) || !finiteNumber(value.drawerRatio)) return null;
  const controls = normalizeControlState(value);
  const vertical = normalizeVerticalPosition(value.vertical);
  if (!controls || !vertical) return null;
  return {
    schemaVersion: PRESENTATION_SCHEMA_VERSION,
    revision: value.revision as number,
    clientId: value.clientId,
    updatedAt: value.updatedAt,
    ...controls,
    horizontalRatio: clampRatio(value.horizontalRatio),
    vertical,
    drawerRatio: clampRatio(value.drawerRatio),
  };
}

export function normalizeMeta(value: unknown): PresentationMeta | null {
  if (!isRecord(value) || value.schemaVersion !== PRESENTATION_SCHEMA_VERSION) return null;
  if (typeof value.active !== "boolean") return null;
  if (!boundedString(value.presenterClientId, 100)) return null;
  const timestamps = [
    value.startedAt,
    value.heartbeatAt,
    value.endedAt,
    value.disconnectedAt,
  ];
  if (timestamps.some((timestamp) => !finiteNumber(timestamp) || timestamp < 0)) return null;
  return {
    schemaVersion: PRESENTATION_SCHEMA_VERSION,
    active: value.active,
    presenterClientId: value.presenterClientId,
    startedAt: value.startedAt as number,
    heartbeatAt: value.heartbeatAt as number,
    endedAt: value.endedAt as number,
    disconnectedAt: value.disconnectedAt as number,
  };
}

export function normalizePointerState(value: unknown): PresentationPointerState | null {
  if (!isRecord(value) || value.schemaVersion !== PRESENTATION_SCHEMA_VERSION) return null;
  if (!boundedString(value.clientId, 100) || value.clientId.length === 0) return null;
  if (
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 0
  ) return null;
  if (
    !finiteNumber(value.xRatio) ||
    !finiteNumber(value.yRatio) ||
    value.xRatio < 0 ||
    value.xRatio > 1 ||
    value.yRatio < 0 ||
    value.yRatio > 1
  ) return null;
  if (typeof value.visible !== "boolean") return null;
  if (!finiteNumber(value.updatedAt) || value.updatedAt < 0) return null;
  return {
    schemaVersion: PRESENTATION_SCHEMA_VERSION,
    clientId: value.clientId,
    sequence: value.sequence as number,
    xRatio: value.xRatio,
    yRatio: value.yRatio,
    visible: value.visible,
    updatedAt: value.updatedAt,
  };
}

export function normalizePointerRatios(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return {
    xRatio: viewportWidth > 0 ? clampRatio(clientX / viewportWidth) : 0,
    yRatio: viewportHeight > 0 ? clampRatio(clientY / viewportHeight) : 0,
  };
}

export function nextPointerSequence(previous: number, now = Date.now()) {
  const safePrevious = Number.isSafeInteger(previous) && previous >= 0 ? previous : 0;
  const safeNow = Number.isSafeInteger(now) && now >= 0 ? now : 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(safePrevious + 1, safeNow));
}

export function pointerIsFresh(
  pointer: PresentationPointerState | null,
  serverNow: number,
  staleAfterMs = PRESENTATION_POINTER_STALE_AFTER_MS,
) {
  if (!pointer?.visible || pointer.updatedAt <= 0) return false;
  return serverNow - pointer.updatedAt <= staleAfterMs;
}

export function snapshotContentKey(snapshot: PresentationSnapshot) {
  return JSON.stringify({
    view: snapshot.view,
    zoom: snapshot.zoom,
    categories: PRESENTATION_CATEGORY_KEYS.map((key) => snapshot.categories[key]),
    searchQuery: snapshot.searchQuery,
    medicationOverlayOpen: snapshot.medicationOverlayOpen,
    openFaqIds: snapshot.openFaqIds,
    selection: snapshot.selection,
    horizontalRatio: Number(snapshot.horizontalRatio.toFixed(4)),
    vertical: {
      anchorId: snapshot.vertical.anchorId,
      progress: Number(snapshot.vertical.progress.toFixed(4)),
      fallbackRatio: Number(snapshot.vertical.fallbackRatio.toFixed(4)),
    },
    drawerRatio: Number(snapshot.drawerRatio.toFixed(4)),
  });
}

export function snapshotsMeaningfullyEqual(
  left: PresentationSnapshot | null,
  right: PresentationSnapshot | null,
) {
  if (!left || !right) return left === right;
  return snapshotContentKey(left) === snapshotContentKey(right);
}

export function heartbeatIsStale(
  meta: PresentationMeta | null,
  serverNow: number,
  staleAfterMs = PRESENTATION_STALE_AFTER_MS,
) {
  if (!meta?.active || meta.heartbeatAt <= 0) return true;
  return serverNow - meta.heartbeatAt > staleAfterMs;
}

export function presentationIsLive(
  meta: PresentationMeta | null,
  serverNow: number,
  staleAfterMs = PRESENTATION_STALE_AFTER_MS,
) {
  return Boolean(meta?.active) && !heartbeatIsStale(meta, serverNow, staleAfterMs);
}
