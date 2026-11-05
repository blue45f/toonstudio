import {
  createStudioFloatingSurfaceLayout,
  type StudioFloatingSurfaceConstraints,
  type StudioFloatingSurfaceLayout,
  type StudioFloatingSurfaceRect,
  type StudioFloatingSurfaceViewport,
} from "../studio-floating-surface";
import type { StudioFloatingSurfaceLayoutOverride } from "../use-studio-floating-surface-layout";
import type { StudioShellFloatingSurfaceDefinition } from "./studio-shell-floating-layout";

export interface StudioShellCanvasBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** 도킹 패널과 겹치는 캔버스 경계를 제외한다. */
export function excludeDockedStudioInspector(canvas: StudioShellCanvasBounds, inspector: StudioShellCanvasBounds | null,
  dock: string | null, detached: boolean): StudioShellCanvasBounds {
  if (!inspector || detached || inspector.right <= inspector.left || inspector.bottom <= inspector.top
    || inspector.top >= canvas.bottom || inspector.bottom <= canvas.top) return canvas;
  if (dock === "left") return { ...canvas, left: Math.max(canvas.left, inspector.right) };
  if (dock === "right") return { ...canvas, right: Math.min(canvas.right, inspector.left) };
  return canvas;
}

export function usesStudioShellDefaultSafeViewport(id: StudioShellFloatingSurfaceDefinition["id"]): boolean {
  return id === "offline-readiness" || id === "collaboration";
}

/** 자동 배치는 표시 범위만 바꾼다. 저장 배치는 유지한다. */
export function resolveStudioShellDefaultSafeViewport({ definition, viewport, canvas, layout, layoutOverride, size }: {
  definition: StudioShellFloatingSurfaceDefinition;
  viewport: StudioFloatingSurfaceViewport;
  canvas: StudioShellCanvasBounds | null;
  layout: StudioFloatingSurfaceLayout;
  layoutOverride: StudioFloatingSurfaceLayoutOverride;
  size: Readonly<{ width: number; height: number }>;
}): StudioFloatingSurfaceViewport {
  if (!usesStudioShellDefaultSafeViewport(definition.id) || viewport.width < 1024
    || !canvas || layoutOverride !== "none" || layout.positionLocked || layout.sizeLocked
    || layout.xRatio !== definition.defaultLayout.xRatio || layout.yRatio !== definition.defaultLayout.yRatio
    || layout.dock !== definition.defaultLayout.dock
    || ![canvas.left, canvas.top, canvas.right, canvas.bottom].every(Number.isFinite)) return viewport;
  const gap = 8;
  const left = Math.max(viewport.insetLeft ?? 0, canvas.left + gap);
  const top = Math.max(viewport.insetTop ?? 0, canvas.top + gap);
  const right = Math.min(viewport.width - (viewport.insetRight ?? 0), canvas.right - gap);
  const bottom = Math.min(viewport.height - (viewport.insetBottom ?? 0), canvas.bottom - gap);
  // 좁은 화면에서도 알림을 줄이지 않는다. 측정한 실물이 맞지 않으면 기존 표시 범위를 유지한다.
  if (!(size.width > 0 && size.height > 0) || right - left < size.width || bottom - top < size.height) return viewport;
  return { ...viewport, insetLeft: left, insetTop: top, insetRight: viewport.width - right, insetBottom: viewport.height - bottom };
}

/** 첫 사용자 조작 때 표시 위치를 기존 화면 비율로 저장한다. */
export function studioShellLayoutForUserControl(layout: StudioFloatingSurfaceLayout, viewport: StudioFloatingSurfaceViewport,
  displayViewport: StudioFloatingSurfaceViewport, constraints: StudioFloatingSurfaceConstraints, rect: StudioFloatingSurfaceRect): StudioFloatingSurfaceLayout {
  return displayViewport === viewport ? layout : createStudioFloatingSurfaceLayout(rect, viewport, constraints, {
    dock: "free", positionLocked: layout.positionLocked, sizeLocked: layout.sizeLocked,
  });
}

function numericDatasetValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** 사용자 배치 저장에 쓰는 전체 화면 기준이다. */
export function readStudioShellFloatingViewport(
  definition: StudioShellFloatingSurfaceDefinition,
  node: HTMLElement | null = null,
): StudioFloatingSurfaceViewport {
  const visual = typeof window === "undefined" ? null : window.visualViewport;
  const offsetLeft = visual?.offsetLeft ?? 0;
  const offsetTop = visual?.offsetTop ?? 0;
  const authoredDockLeft = definition.id === "drawing-options" ? numericDatasetValue(node?.dataset.studioDrawOptionsDockLeft) : null;
  const authoredDockRight = definition.id === "drawing-options" ? numericDatasetValue(node?.dataset.studioDrawOptionsDockRight) : null;
  return {
    width: offsetLeft + (visual?.width ?? globalThis.innerWidth ?? 1),
    height: offsetTop + (visual?.height ?? globalThis.innerHeight ?? 1),
    insetTop: offsetTop + definition.insetTop,
    insetRight: authoredDockRight === null ? definition.insetRight : authoredDockRight + definition.insetRight,
    insetBottom: definition.insetBottom,
    insetLeft: offsetLeft + (authoredDockLeft === null ? definition.insetLeft : authoredDockLeft + definition.insetLeft),
  };
}

/** border·scrollbar gutter를 제외한 실제 표시 영역을 화면 좌표로 읽는다. */
function clientBounds(element: HTMLElement): StudioShellCanvasBounds | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || element.clientWidth <= 0 || element.clientHeight <= 0) return null;
  const scaleX = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
  const scaleY = element.offsetHeight > 0 ? rect.height / element.offsetHeight : 1;
  return { left: rect.left + element.clientLeft * scaleX, top: rect.top + element.clientTop * scaleY,
    right: rect.left + (element.clientLeft + element.clientWidth) * scaleX,
    bottom: rect.top + (element.clientTop + element.clientHeight) * scaleY };
}
const CLIPPED_OVERFLOW = /^(auto|scroll|hidden|clip|overlay)$/u;

/** 캔버스·패널 경계를 관찰한다. 저장 쓰기는 없다. */
export function observeStudioShellCanvasBounds(listener: (bounds: StudioShellCanvasBounds | null) => void): () => void {
  let observed = new Set<HTMLElement>();
  let frame = 0;
  let active = true;
  const measure = () => {
    frame = 0;
    if (!active) return;
    const canvases = Array.from(document.querySelectorAll<HTMLElement>('[data-studio-editor="true"] [data-studio-canvas-viewport]'));
    const targets = new Set([...canvases, ...document.querySelectorAll<HTMLElement>('[data-studio-editor="true"] #studio-inspector')]);
    const canvas = canvases.find((element) => clientBounds(element) !== null);
    let bounds = canvas ? clientBounds(canvas) : null;
    if (bounds) for (let ancestor = canvas?.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const clipX = CLIPPED_OVERFLOW.test(style.overflowX), clipY = CLIPPED_OVERFLOW.test(style.overflowY);
      if (!clipX && !clipY) continue;
      targets.add(ancestor);
      const clip = clientBounds(ancestor);
      if (!clip) { bounds = null; break; }
      bounds = { left: clipX ? Math.max(bounds.left, clip.left) : bounds.left,
        right: clipX ? Math.min(bounds.right, clip.right) : bounds.right,
        top: clipY ? Math.max(bounds.top, clip.top) : bounds.top,
        bottom: clipY ? Math.min(bounds.bottom, clip.bottom) : bounds.bottom };
    }
    for (const previous of observed) if (!targets.has(previous)) resize?.unobserve(previous);
    for (const target of targets) if (!observed.has(target)) resize?.observe(target);
    observed = targets;
    // 숨겨진 캔버스도 관찰해 재표시 때 갱신한다.
    const inspector = canvas?.closest('[data-studio-editor="true"]')?.querySelector<HTMLElement>("#studio-inspector");
    const inspectorRect = inspector?.getBoundingClientRect();
    const dock = canvas?.closest("[data-studio-inspector-dock]")?.getAttribute("data-studio-inspector-dock") ?? null;
    listener(bounds ? excludeDockedStudioInspector(bounds, inspectorRect ?? null, dock,
      inspector?.dataset.studioPanelDetached === "true") : null);
  };
  const schedule = () => { if (active && !frame) frame = requestAnimationFrame(measure); };
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  const mutation = new MutationObserver(schedule);
  mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-studio-inspector-dock", "data-studio-panel-detached"] });
  globalThis.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  measure();
  return () => {
    active = false;
    cancelAnimationFrame(frame); resize?.disconnect(); mutation.disconnect();
    globalThis.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("scroll", schedule);
  };
}
