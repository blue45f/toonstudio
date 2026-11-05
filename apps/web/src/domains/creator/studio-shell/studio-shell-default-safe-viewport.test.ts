// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveStudioFloatingSurfaceRect,
  setStudioFloatingSurfaceDock,
  setStudioFloatingSurfaceLock,
  type StudioFloatingSurfaceViewport,
} from "../studio-floating-surface";
import {
  observeStudioShellCanvasBounds,
  excludeDockedStudioInspector,
  readStudioShellFloatingViewport,
  resolveStudioShellDefaultSafeViewport,
  studioShellLayoutForUserControl,
  type StudioShellCanvasBounds,
} from "./studio-shell-default-safe-viewport";
import { studioShellFloatingSurfaceById } from "./studio-shell-floating-layout";

const viewport: StudioFloatingSurfaceViewport = { width: 1440, height: 1000, insetLeft: 12, insetRight: 12, insetTop: 64, insetBottom: 88 };
const canvas = { left: 350, top: 330, right: 1107, bottom: 885 };
const size = { width: 152, height: 58 };
const constraints = { minWidth: size.width, maxWidth: size.width, minHeight: size.height, maxHeight: size.height };
function options(id: "offline-readiness" | "collaboration" = "offline-readiness") {
  const definition = studioShellFloatingSurfaceById(id);
  return { definition, viewport, canvas, layout: definition.defaultLayout, layoutOverride: "none" as const, size };
}
function rectangle(input: ReturnType<typeof options>) {
  return resolveStudioFloatingSurfaceRect(input.layout, resolveStudioShellDefaultSafeViewport(input), constraints, input.definition.defaultLayout);
}

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("저장하지 않은 두 상태 UI의 기본 표시 범위", () => {
  it.each(["offline-readiness", "collaboration"] as const)("%s가 도킹 패널을 제외한 실제 캔버스 안에 들어간다", (id) => {
    const input = options(id), before = structuredClone(input.layout), rect = rectangle(input);
    expect(rect.x).toBeGreaterThanOrEqual(canvas.left + 8);
    expect(rect.x + rect.width).toBeLessThanOrEqual(canvas.right - 8);
    expect(rect.y).toBeGreaterThanOrEqual(canvas.top + 8);
    expect(rect.y + rect.height).toBeLessThanOrEqual(canvas.bottom - 8);
    expect(input.layout).toEqual(before);
  });

  it("작업 패널 닫힘·좌측 도킹·너비 변경에 따라 같은 기존 resolver로 다시 계산한다", () => {
    const input = options();
    const narrow = rectangle({ ...input, canvas: { ...canvas, right: 960 } });
    const closed = rectangle({ ...input, canvas: { ...canvas, right: 1428 } });
    const dockedLeft = rectangle({ ...input, canvas: { ...canvas, left: 480, right: 1428 } });
    expect(narrow.x + narrow.width).toBe(952);
    expect(closed.x).toBeGreaterThan(narrow.x);
    expect(dockedLeft.x).toBeGreaterThanOrEqual(488);
    expect(dockedLeft.x + dockedLeft.width).toBe(1420);
  });

  it("캔버스가 전체 폭으로 보고돼도 실제 도킹된 inspector만 빼고 분리·닫힌 패널은 제외한다", () => {
    const full = { left: 56, top: 330, right: 1428, bottom: 885 };
    const inspector = { left: 1128, top: 330, right: 1440, bottom: 1000 };
    expect(excludeDockedStudioInspector(full, inspector, "right", false).right).toBe(1128);
    expect(excludeDockedStudioInspector(full, { ...inspector, left: 960 }, "right", false).right).toBe(960);
    expect(excludeDockedStudioInspector(full, { ...inspector, left: 0, right: 480 }, "left", false).left).toBe(480);
    expect(excludeDockedStudioInspector(full, inspector, "right", true)).toBe(full);
    expect(excludeDockedStudioInspector(full, { left: 0, top: 0, right: 0, bottom: 0 }, "right", false)).toBe(full);
  });

  it.each(["checking", "unknown", "present"] as const)("%s 출처에는 기본값과 같은 배치도 자동 이동하지 않는다", (layoutOverride) => {
    expect(resolveStudioShellDefaultSafeViewport({ ...options(), layoutOverride })).toBe(viewport);
  });

  it.each(["positionLocked", "sizeLocked"] as const)("%s 잠금은 유지한다", (kind) => {
    const input = options();
    expect(resolveStudioShellDefaultSafeViewport({ ...input, layout: { ...input.layout, [kind]: true } })).toBe(viewport);
  });

  it("다른 UI·다른 비율·좁거나 낮은 화면·측정 불가에서는 기존 범위를 유지하며 크기를 줄이지 않는다", () => {
    const input = options();
    expect(resolveStudioShellDefaultSafeViewport({ ...input, definition: studioShellFloatingSurfaceById("drawing-options") })).toBe(viewport);
    expect(resolveStudioShellDefaultSafeViewport({ ...input, layout: { ...input.layout, xRatio: 0.5 } })).toBe(viewport);
    expect(resolveStudioShellDefaultSafeViewport({ ...input, canvas: null })).toBe(viewport);
    expect(resolveStudioShellDefaultSafeViewport({ ...input, canvas: { ...canvas, right: canvas.left + size.width } })).toBe(viewport);
    expect(resolveStudioShellDefaultSafeViewport({ ...input, canvas: { ...canvas, bottom: canvas.top + size.height } })).toBe(viewport);
    expect(resolveStudioShellDefaultSafeViewport({ ...input, canvas: { ...canvas, left: NaN } })).toBe(viewport);
    const mobile = { ...viewport, width: 1023 };
    expect(resolveStudioShellDefaultSafeViewport({ ...input, viewport: mobile })).toBe(mobile);
  });

  it("첫 사용자 잠금은 자동 표시 픽셀 위치를 기존 형식으로 고정하고 명시 도킹은 선택한 화면 edge를 따른다", () => {
    const input = options(), display = resolveStudioShellDefaultSafeViewport(input), before = rectangle(input);
    const userLayout = studioShellLayoutForUserControl(input.layout, viewport, display, constraints, before);
    const locked = setStudioFloatingSurfaceLock(userLayout, "position", true);
    expect(resolveStudioFloatingSurfaceRect(locked, viewport, constraints)).toEqual(before);
    expect(locked.positionLocked).toBe(true);
    expect(Object.keys(locked).sort()).toEqual(Object.keys(input.layout).sort());
    const left = resolveStudioFloatingSurfaceRect(setStudioFloatingSurfaceDock(userLayout, "left"), viewport, constraints);
    expect(left.x).toBe(12);
    expect(left.y).toBe(before.y);
    expect(studioShellLayoutForUserControl(locked, viewport, viewport, constraints, before)).toBe(locked);
  });

  it("기존 drawing-options의 작성된 dock inset 계산을 그대로 유지한다", () => {
    const node = document.createElement("div");
    node.dataset.studioDrawOptionsDockLeft = "308"; node.dataset.studioDrawOptionsDockRight = "420";
    const definition = studioShellFloatingSurfaceById("drawing-options");
    const result = readStudioShellFloatingViewport(definition, node);
    expect(result.insetLeft).toBe(308 + definition.insetLeft);
    expect(result.insetRight).toBe(420 + definition.insetRight);
    expect(readStudioShellFloatingViewport(studioShellFloatingSurfaceById("collaboration"), node).insetRight).toBe(12);
  });
});

describe("표시 경계 관찰의 변경·정리", () => {
  it("실제 캔버스 resize와 좌우 도킹 신호를 관찰하고 정리 뒤에는 호출하지 않는다", async () => {
    document.body.innerHTML = '<div data-studio-editor="true"><div data-studio-inspector-dock="right"><div data-studio-canvas-viewport></div><section id="studio-inspector"></section></div></div>';
    const element = document.querySelector<HTMLElement>("[data-studio-canvas-viewport]");
    if (!element) throw new Error("시험용 캔버스가 없습니다.");
    let rect = { ...canvas };
    vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => DOMRect.fromRect({ x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }));
    const inspector = document.querySelector<HTMLElement>("#studio-inspector");
    if (!inspector) throw new Error("시험용 작업 패널이 없습니다.");
    let inspectorRect = DOMRect.fromRect({ x: 1128, y: 330, width: 312, height: 670 });
    vi.spyOn(inspector, "getBoundingClientRect").mockImplementation(() => inspectorRect);
    let resized: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resized = callback; }
      observe() {} unobserve() {} disconnect = disconnect;
    });
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frameCallbacks.push(callback); return frameCallbacks.length; });
    const cancel = vi.fn(); vi.stubGlobal("cancelAnimationFrame", cancel);
    const observed: (StudioShellCanvasBounds | null)[] = [];
    const stop = observeStudioShellCanvasBounds((bounds) => observed.push(bounds));
    expect(observed).toEqual([canvas]);
    rect = { ...canvas, right: 960 }; resized?.(); frameCallbacks.shift()?.(0);
    expect(observed.at(-1)?.right).toBe(960);
    rect = { ...canvas, left: 480 };
    inspectorRect = DOMRect.fromRect({ x: 0, y: 330, width: 480, height: 670 });
    document.querySelector("[data-studio-inspector-dock]")?.setAttribute("data-studio-inspector-dock", "left");
    await Promise.resolve(); frameCallbacks.shift()?.(0);
    expect(observed.at(-1)?.left).toBe(480);
    rect = { ...rect, right: rect.left }; resized?.(); frameCallbacks.shift()?.(0);
    expect(observed.at(-1)).toBeNull();
    rect = { ...rect, right: 1428 }; resized?.(); frameCallbacks.shift()?.(0);
    expect(observed.at(-1)?.right).toBe(1428);
    inspectorRect = DOMRect.fromRect(); resized?.(); frameCallbacks.shift()?.(0);
    expect(observed.at(-1)?.left).toBe(480);
    stop(); expect(disconnect).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalled();
    const count = observed.length;
    resized?.(); frameCallbacks.shift()?.(0);
    document.body.replaceChildren(); await Promise.resolve();
    expect(observed).toHaveLength(count);
  });
});
