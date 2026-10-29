// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import { defaultStudioAppSettings } from "../studio-app-settings";

import {
  installStudioCanvasSpacePanInput,
  installStudioCanvasTouchInput,
  installStudioCanvasWheelInput,
} from "./studio-canvas-viewport-input";

import type { StudioBrushSnapshot } from "../brush/studio-brush-library";
import type { StudioZoomGestureState, StudioZoomGestureStep } from "./studio-zoom-gesture-engine";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function retain(dispose: (() => void) | undefined): () => void {
  if (!dispose) throw new Error("fixture에 리스너가 설치되지 않았습니다.");
  const cleanup = () => {
    dispose();
    const index = cleanups.indexOf(cleanup);
    if (index >= 0) cleanups.splice(index, 1);
  };
  cleanups.push(cleanup);
  return cleanup;
}

function viewport() {
  const node = document.createElement("div");
  document.body.append(node);
  Object.defineProperties(node, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  node.scrollLeft = 100;
  node.scrollTop = 50;
  const width = { current: 150 };
  const zoomRef = { current: 1 };
  const zoomGestureRef: { current: Pick<StudioZoomGestureState, "targetZoom"> | null } = { current: null };
  const currentBrushSnapshotRef: { current: Pick<StudioBrushSnapshot, "enginePrograms"> | null } = { current: null };
  const targets: number[] = [];
  const step = vi.fn<StudioZoomGestureStep>((nextTarget) => {
    targets.push(nextTarget(zoomRef.current));
  });
  const stepZoomGestureRef: { current: StudioZoomGestureStep } = { current: step };
  const input = {
    wrapRef: { current: node },
    appSettingsRef: { current: defaultStudioAppSettings() },
    canvasPointerGestureIsOwned: vi.fn(() => false),
    canvasEditingGestureIsOwned: vi.fn(() => false),
    viewTransformSuppressedRef: { current: false },
    zoomLockedRef: { current: false },
    touchViewPanActiveRef: { current: false },
    zoomGestureRef,
    zoomRef,
    stepZoomGestureRef,
    settleZoomGestureRef: { current: vi.fn() },
    updateScrollPosRef: { current: vi.fn() },
    currentBrushSnapshotRef,
    setStrokeWidth: vi.fn((update: (current: number) => number) => {
      width.current = update(width.current);
    }),
  };
  return { node, input, width, step, targets };
}

function wheel(node: Element, options: WheelEventInit) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...options });
  node.dispatchEvent(event);
  return event;
}

type TouchPoint = { identifier: number; clientX: number; clientY: number };

// jsdom의 TouchEvent 구현 대신 실제 DOM Event 전파와 수동 touches 목록을 사용한다.
function touch(node: Element, type: string, points: TouchPoint[]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: points });
  node.dispatchEvent(event);
  return event;
}

function pair(distance: number): TouchPoint[] {
  return [
    { identifier: 1, clientX: 100, clientY: 100 },
    { identifier: 2, clientX: 100 + distance, clientY: 100 },
  ];
}

describe("Studio 캔버스 viewport DOM 입력 adapter", () => {
  it("휠 수평 이동을 브러시 크기와 줌보다 먼저 적용하고 cleanup 뒤에는 처리하지 않는다", () => {
    const { node, input, step } = viewport();
    input.appSettingsRef.current.mouse.wheel = "brush-size";
    const dispose = retain(installStudioCanvasWheelInput(input));
    const event = wheel(node, { deltaX: 40 });
    expect(event.defaultPrevented).toBe(true);
    expect(node.scrollLeft).toBe(140);
    expect(input.setStrokeWidth).not.toHaveBeenCalled();
    expect(step).not.toHaveBeenCalled();
    dispose();
    wheel(node, { deltaX: 30 });
    expect(node.scrollLeft).toBe(140);
  });

  it("pen-owned 입력은 HUD 위에서도 소비하고 idle HUD와 suppressed view는 통과시킨다", () => {
    const { node, input, step } = viewport();
    input.appSettingsRef.current.mouse.wheel = "zoom";
    const hud = document.createElement("button");
    hud.dataset.studioViewToolsHud = "true";
    node.append(hud);
    retain(installStudioCanvasWheelInput(input));
    input.canvasPointerGestureIsOwned.mockReturnValue(true);
    expect(wheel(hud, { deltaY: -40 }).defaultPrevented).toBe(true);
    expect(step).not.toHaveBeenCalled();
    input.canvasPointerGestureIsOwned.mockReturnValue(false);
    expect(wheel(hud, { deltaY: -40 }).defaultPrevented).toBe(false);
    input.viewTransformSuppressedRef.current = true;
    expect(wheel(node, { deltaY: -40 }).defaultPrevented).toBe(false);
    expect(step).not.toHaveBeenCalled();
    expect(node.scrollLeft).toBe(100);
  });

  it("설치 뒤 바뀐 brush enginePrograms와 reverse/shift 설정을 이벤트 시점에 읽는다", () => {
    const { node, input, width } = viewport();
    input.appSettingsRef.current.mouse.wheel = "brush-size";
    retain(installStudioCanvasWheelInput(input));
    input.currentBrushSnapshotRef.current = {
      enginePrograms: createBrushStudioV6ProductBrush(createBrushStudioV6Program("oil-hair-mixer")).enginePrograms,
    };
    wheel(node, { deltaY: -40 });
    expect(width.current).toBe(151);
    input.appSettingsRef.current.mouse.reverseWheel = true;
    wheel(node, { deltaY: 40, shiftKey: true });
    expect(width.current).toBe(156);
  });

  it("modifier wheel은 최신 zoom callback을 호출하고 zoom lock을 존중한다", () => {
    const { node, input, step } = viewport();
    input.appSettingsRef.current.mouse.wheel = "brush-size";
    retain(installStudioCanvasWheelInput(input));
    const latest = vi.fn<StudioZoomGestureStep>();
    input.stepZoomGestureRef.current = latest;
    expect(wheel(node, { ctrlKey: true, deltaY: -40, clientX: 33, clientY: 44 }).defaultPrevented).toBe(true);
    expect(latest).toHaveBeenCalledWith(expect.any(Function), 33, 44);
    expect(step).not.toHaveBeenCalled();
    input.zoomLockedRef.current = true;
    wheel(node, { ctrlKey: true, deltaY: -40 });
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("한 손가락 pan 도중 pen 편집이 소유권을 얻으면 스크롤을 멈추고 세션을 해제한다", () => {
    const { node, input } = viewport();
    input.appSettingsRef.current.touch.oneFingerDrag = "pan";
    retain(installStudioCanvasTouchInput(input));
    touch(node, "touchstart", [{ identifier: 1, clientX: 100, clientY: 100 }]);
    expect(input.touchViewPanActiveRef.current).toBe(true);
    expect(touch(node, "touchmove", [{ identifier: 1, clientX: 120, clientY: 125 }]).defaultPrevented).toBe(true);
    expect([node.scrollLeft, node.scrollTop]).toEqual([80, 25]);
    expect(input.updateScrollPosRef.current).toHaveBeenCalledTimes(1);
    input.canvasEditingGestureIsOwned.mockReturnValue(true);
    expect(touch(node, "touchmove", [{ identifier: 1, clientX: 160, clientY: 160 }]).defaultPrevented).toBe(true);
    expect(input.touchViewPanActiveRef.current).toBe(false);
    expect([node.scrollLeft, node.scrollTop]).toEqual([80, 25]);
    expect(input.updateScrollPosRef.current).toHaveBeenCalledTimes(1);
  });

  it("핀치 2→3→2 전환은 새 기준선을 잡고 최신 targetZoom에서 재개한 뒤 한 번 정착한다", () => {
    const { node, input, step, targets } = viewport();
    input.appSettingsRef.current.touch.twoFinger = "pan-zoom";
    retain(installStudioCanvasTouchInput(input));
    touch(node, "touchstart", pair(100));
    touch(node, "touchmove", pair(200));
    expect(targets).toEqual([2]);
    expect(step).toHaveBeenLastCalledWith(expect.any(Function), 200, 100, {
      followClient: true, originClientX: 150, originClientY: 100,
    });
    touch(node, "touchmove", [...pair(200), { identifier: 3, clientX: 400, clientY: 100 }]);
    input.zoomGestureRef.current = { targetZoom: 2 };
    touch(node, "touchmove", pair(250));
    expect(step).toHaveBeenCalledTimes(1);
    touch(node, "touchmove", pair(300));
    expect(targets[1]).toBeCloseTo(2.4);
    touch(node, "touchend", [pair(100)[0]]);
    expect(input.settleZoomGestureRef.current).toHaveBeenCalledTimes(1);
    touch(node, "touchcancel", []);
    expect(input.settleZoomGestureRef.current).toHaveBeenCalledTimes(1);
  });

  it("touch 소유권·suppression·HUD·설정 변경과 cancel 정착을 유지한다", () => {
    const { node, input, step } = viewport();
    const hud = document.createElement("button");
    hud.dataset.studioViewToolsHud = "true";
    node.append(hud);
    retain(installStudioCanvasTouchInput(input));
    input.canvasPointerGestureIsOwned.mockReturnValue(true);
    expect(touch(hud, "touchmove", pair(100)).defaultPrevented).toBe(true);
    input.canvasPointerGestureIsOwned.mockReturnValue(false);
    input.viewTransformSuppressedRef.current = true;
    expect(touch(node, "touchmove", pair(100)).defaultPrevented).toBe(false);
    input.viewTransformSuppressedRef.current = false;
    expect(touch(hud, "touchmove", pair(100)).defaultPrevented).toBe(false);
    input.appSettingsRef.current.touch.twoFinger = "undo-redo";
    touch(node, "touchstart", pair(100));
    touch(node, "touchmove", pair(200));
    expect(step).not.toHaveBeenCalled();
    input.appSettingsRef.current.touch.twoFinger = "pan-zoom";
    touch(node, "touchstart", pair(100));
    touch(node, "touchmove", pair(200));
    touch(node, "touchcancel", []);
    expect(input.settleZoomGestureRef.current).toHaveBeenCalledTimes(1);
  });

  it("기존 passive 옵션과 cleanup 대상을 유지하며 cleanup은 추가 zoom 정착을 만들지 않는다", () => {
    const { node, input, step } = viewport();
    const add = vi.spyOn(node, "addEventListener");
    const remove = vi.spyOn(node, "removeEventListener");
    const dispose = retain(installStudioCanvasTouchInput(input));
    for (const type of ["touchstart", "touchend", "touchcancel"]) {
      expect(add).toHaveBeenCalledWith(type, expect.any(Function), { passive: true });
    }
    expect(add).toHaveBeenCalledWith("touchmove", expect.any(Function), { passive: false });
    input.appSettingsRef.current.touch.twoFinger = "pan-zoom";
    touch(node, "touchstart", pair(100));
    touch(node, "touchmove", pair(200));
    dispose();
    expect(remove.mock.calls).toHaveLength(4);
    expect(input.touchViewPanActiveRef.current).toBe(false);
    expect(input.settleZoomGestureRef.current).not.toHaveBeenCalled();
    touch(node, "touchmove", pair(300));
    expect(step).toHaveBeenCalledTimes(1);
  });

  it("Space는 버튼·SVG·편집 타깃에 양보하고 canvas pan 및 keyup 해제를 유지한다", () => {
    const { node } = viewport();
    const button = document.createElement("button");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    button.append(icon);
    node.append(button);
    const input = { editing: null, isSpacePressed: false, setIsSpacePressed: vi.fn(), setIsPanning: vi.fn() };
    const dispose = retain(installStudioCanvasSpacePanInput(input));
    const fire = (target: Element, type: string) => {
      const event = new KeyboardEvent(type, { code: "Space", bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    };
    expect(fire(icon, "keydown").defaultPrevented).toBe(false);
    expect(input.setIsSpacePressed).not.toHaveBeenCalled();
    expect(fire(node, "keydown").defaultPrevented).toBe(true);
    expect(input.setIsSpacePressed).toHaveBeenLastCalledWith(true);
    fire(node, "keyup");
    expect(input.setIsSpacePressed).toHaveBeenLastCalledWith(false);
    expect(input.setIsPanning).toHaveBeenLastCalledWith(false);
    dispose();
    input.setIsSpacePressed.mockClear();
    fire(node, "keydown");
    expect(input.setIsSpacePressed).not.toHaveBeenCalled();
    retain(installStudioCanvasSpacePanInput({ ...input, editing: { id: "text" } }));
    expect(fire(node, "keydown").defaultPrevented).toBe(false);
    expect(input.setIsSpacePressed).not.toHaveBeenCalled();
  });
});
