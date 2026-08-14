import { clampRatio } from "./state";
import type {
  PresentationAnchorTarget,
  PresentationDomAdapter,
  PresentationVerticalPosition,
} from "./types";

export const PRESENTATION_ANCHOR_ATTRIBUTE = "data-presentation-anchor";
export const PRESENTATION_TIMELINE_ATTRIBUTE = "data-presentation-timeline-scroll";
export const PRESENTATION_DRAWER_ATTRIBUTE = "data-presentation-drawer";

export function normalizedElementScroll(element: HTMLElement | null) {
  if (!element) return 0;
  const range = Math.max(0, element.scrollWidth - element.clientWidth);
  return range > 0 ? clampRatio(element.scrollLeft / range) : 0;
}
export function normalizedElementVerticalScroll(element: HTMLElement | null) {
  if (!element) return 0;
  const range = Math.max(0, element.scrollHeight - element.clientHeight);
  return range > 0 ? clampRatio(element.scrollTop / range) : 0;
}

export function restoreElementHorizontalScroll(element: HTMLElement | null, ratio: number) {
  if (!element) return;
  const range = Math.max(0, element.scrollWidth - element.clientWidth);
  element.scrollLeft = range * clampRatio(ratio);
}

export function restoreElementVerticalScroll(element: HTMLElement | null, ratio: number) {
  if (!element) return;
  const range = Math.max(0, element.scrollHeight - element.clientHeight);
  element.scrollTop = range * clampRatio(ratio);
}

function absoluteTop(element: HTMLElement) {
  return element.getBoundingClientRect().top + window.scrollY;
}

function sortedAnchors(anchors: PresentationAnchorTarget[]) {
  return anchors
    .filter((anchor) => anchor.id && anchor.element.isConnected)
    .map((anchor) => ({ ...anchor, top: absoluteTop(anchor.element) }))
    .sort((left, right) => left.top - right.top);
}

export function captureVerticalPosition(
  anchors: PresentationAnchorTarget[],
  scrollY = typeof window === "undefined" ? 0 : window.scrollY,
  documentHeight = typeof document === "undefined"
    ? 0
    : document.documentElement.scrollHeight,
  viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight,
): PresentationVerticalPosition {
  const maxScroll = Math.max(0, documentHeight - viewportHeight);
  const fallbackRatio = maxScroll > 0 ? clampRatio(scrollY / maxScroll) : 0;

  if (typeof window === "undefined" || anchors.length === 0) {
    return { anchorId: "top", progress: fallbackRatio, fallbackRatio };
  }

  const positioned = sortedAnchors(anchors);
  if (positioned.length === 0) {
    return { anchorId: "top", progress: fallbackRatio, fallbackRatio };
  }

  let currentIndex = 0;
  for (let index = 1; index < positioned.length; index += 1) {
    if (positioned[index].top <= scrollY + 1) currentIndex = index;
    else break;
  }

  const current = positioned[currentIndex];
  const nextTop = positioned[currentIndex + 1]?.top ?? maxScroll;
  const range = Math.max(0, nextTop - current.top);
  const progress = range > 0 ? clampRatio((scrollY - current.top) / range) : 0;
  return { anchorId: current.id, progress, fallbackRatio };
}

export function restoreVerticalPosition(
  position: PresentationVerticalPosition,
  anchors: PresentationAnchorTarget[],
) {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const positioned = sortedAnchors(anchors);
  const anchorIndex = positioned.findIndex((anchor) => anchor.id === position.anchorId);

  let target = maxScroll * clampRatio(position.fallbackRatio);
  if (anchorIndex >= 0) {
    const currentTop = positioned[anchorIndex].top;
    const nextTop = positioned[anchorIndex + 1]?.top ?? maxScroll;
    target = currentTop + Math.max(0, nextTop - currentTop) * clampRatio(position.progress);
  }

  target = Math.max(0, Math.min(maxScroll, target));
  window.scrollTo({ top: target, left: window.scrollX, behavior: "auto" });
  return target;
}

function defaultAnchors(): PresentationAnchorTarget[] {
  if (typeof document === "undefined") return [];
  return Array.from(document.querySelectorAll<HTMLElement>(`[${PRESENTATION_ANCHOR_ATTRIBUTE}]`))
    .map((element) => ({
      id: element.getAttribute(PRESENTATION_ANCHOR_ATTRIBUTE) ?? "",
      element,
    }))
    .filter((anchor) => anchor.id.length > 0);
}

export const defaultPresentationDomAdapter: PresentationDomAdapter = {
  getAnchors: defaultAnchors,
  getTimelineScroller: () =>
    typeof document === "undefined"
      ? null
      : document.querySelector<HTMLElement>(`[${PRESENTATION_TIMELINE_ATTRIBUTE}]`),
  getDrawerScroller: () =>
    typeof document === "undefined"
      ? null
      : document.querySelector<HTMLElement>(`[${PRESENTATION_DRAWER_ATTRIBUTE}]`),
};

export function nextAnimationFrames(count = 2) {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}
