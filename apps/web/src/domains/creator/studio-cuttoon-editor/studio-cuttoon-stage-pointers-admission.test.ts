// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultStudioAppSettings } from "../studio-app-settings";
import { resetStudioStrokeFocusActivityForTests } from "../studio-stroke-focus-activity";
import type { DrawEl } from "../studio-element-model";

import { bindStudioCuttoonStagePointersDown } from "./studio-cuttoon-stage-pointers-down";
import { bindStudioCuttoonStagePointersDownDraw } from "./studio-cuttoon-stage-pointers-down-draw";
import { bindStudioCuttoonStagePointersCursors } from "./studio-cuttoon-stage-pointers-cursors";

import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";

afterEach(() => {
  resetStudioStrokeFocusActivityForTests();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function drawPointer(pointerType: "mouse" | "pen"): PointerEvent {
  return Object.assign(new MouseEvent("pointerdown", {
    bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: 44, clientY: 84,
  }), {
    pointerType, pointerId: 17, isPrimary: true, pressure: pointerType === "pen" ? 0.75 : 0.5,
    width: 1, height: 1, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0,
    altitudeAngle: Math.PI / 2, azimuthAngle: 0, persistentDeviceId: 1,
    getCoalescedEvents: () => [], getPredictedEvents: () => [],
  });
}

function drawFixture(options: { zoom?: boolean; backdrop?: boolean; nullPosition?: boolean; rejectPage?: boolean } = {}) {
  let bounds = { left: 4, top: 4 };
  let point = { x: 0, y: 0 };
  const getBoundingClientRect = vi.fn(() => bounds);
  // DOM 경계만 대역으로 두고 아래 down·cursor 바인더와 첫 DrawEl 계획은 실제 구현을 연결한다.
  const stage = {
    setPointersPositions: vi.fn((event: PointerEvent) => {
      const rect = getBoundingClientRect();
      point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }),
    getRelativePointerPosition: () => options.nullPosition ? null : { ...point },
  };
  const cursorPosition = vi.fn();
  const drawCursor = vi.fn();
  const cursor = { position: cursorPosition, visible: () => true, getLayer: () => ({ drawScene: drawCursor }) };
  const drawingRef: { current: DrawEl | null } = { current: null };
  const firstDab = vi.fn((_stroke: DrawEl, _pointer: PointerEvent, _origin: { x: number; y: number }) => true);
  const prepareStrokeCommitPage = vi.fn(() => !options.rejectPage);
  const setError = vi.fn();
  const endLiveResourceEdit = vi.fn();
  const settleZoom = vi.fn(() => { bounds = { left: 14, top: 24 }; });
  const flushBackdrop = vi.fn(() => { bounds = { left: 24, top: 34 }; return true; });
  const prior: DrawEl = { id: "prior", type: "draw", brush: "pen", mode: "pen", kind: "freehand",
    points: [1, 1, 2, 2], stroke: "#111111", strokeWidth: 4, opacity: 1 };
  const host = {
    tool: "draw", drawMode: options.backdrop ? "eraser" : "pen", brush: "pen", drawShape: "line",
    livingInkFinalizingRef: { current: false }, hokusaiLiveFinalizingRef: { current: false },
    appSettingsRef: { current: defaultStudioAppSettings() },
    drawingPointerTransportRef: { current: { getSession: () => null, start: () => ({ started: true }) } },
    drawingRef, zoomGestureRef: { current: options.zoom ? {} : null },
    stageRef: { current: stage }, settleZoomGestureRef: { current: settleZoom },
    prepareStrokeCommitPage, setError, beginLiveResourceEdit: () => true, endLiveResourceEdit,
    activePage: { id: "page", elements: [] }, collaborationAccessRef: { current: { locked: false } },
    pendingStrokeCommitsRef: { current: options.backdrop ? { pageId: "page", strokes: [prior] } : null },
    pendingGpuStrokesRef: { current: [] }, flushPendingStrokeCommitsRef: { current: flushBackdrop },
    liveInkOverlayRendererRef: { current: { hasSettledStrokes: false } },
    liveStampOverlayRendererRef: { current: { hasSettledStrokes: false } },
    liveDynamicBrushOverlayRendererRef: { current: { hasSettledStrokes: false } },
    liveRetainedMediaOverlayRendererRef: { current: { hasSettledStrokes: false } },
    liveWetInkOverlayRendererRef: { current: { hasSettledStrokes: false } },
    studioCrdtDocumentRef: { current: null },
    brushCursorRef: { current: cursor }, brushCursorDrawRafRef: { current: null }, strokeGuideRef: { current: null },
    drawingAssistDocument: { advanced: { rulers: [], activeSnapRulerId: null } }, selected: null,
    activeCatalogBrush: { id: "pen", name: "Pen" }, brushOpacity: 1, color: "#111111", strokeWidth: 4,
    stabilizer: 0, stabilizerMode: "standard", postCorrection: 0, preserveCorners: true,
    pressureCurve: 1, pressureMinSize: 0, useVelocityPressure: false, velocitySensitivity: 1,
    effScale: 1, canvasH: 500, vanishingPoints: [], shapeFill: false, brushDynamics: {},
    tiltEnabled: false, tipAngle: 0, tipRoundness: 1, symmetryType: "none",
    symmetryCenterX: 0, symmetryCenterY: 0, symmetryRadialCount: 4, drawingPracticeTargetGroupId: null,
    setSelectedId: vi.fn(), scheduleLiveDrawPressure: vi.fn(), drawingInputSettingsRef: { current: null },
    drawingLastAuthoritativePointerRef: { current: null }, drawingInkTimeOriginRef: { current: null },
    drawingImmediateCausalInputRef: { current: false }, drawingThinLineInkInputRef: { current: null },
    drawingFixedRateFilterRef: { current: null }, drawingStabilizerRef: { current: null },
    drawingPrecisionStabilizerBridgeRef: { current: null }, drawingVelocityRef: { current: null },
    drawingVelocityPressureRef: { current: null }, perspectiveRayRef: { current: null },
    perspectiveGuideSnapRef: { current: null }, isometricAxisRayRef: { current: null },
    advancedRulerSnapRef: { current: null }, drawingGesturePreviewPublisherRef: { current: { begin: vi.fn() } },
    drawingCrdtPublisherRef: { current: { cancel: vi.fn() } }, drawingCrdtStrokeActiveRef: { current: false },
    beginStudioDrawLiveSurfaces: firstDab, stopQuickShapeTracking: vi.fn(), startFixedRateStrokePump: vi.fn(),
    discardDrawingPointerSession: vi.fn(),
  } as unknown as StudioCuttoonStagePointersHost;
  const api = {} as StudioCuttoonStagePointersApi;
  bindStudioCuttoonStagePointersCursors(host, api);
  bindStudioCuttoonStagePointersDownDraw(host, api);
  const dispatch = (pointer: PointerEvent, replayPosition?: { x: number; y: number }) => {
    stage.setPointersPositions(pointer);
    api.tryStageDownDraw({ target: { getStage: () => stage }, evt: pointer }, pointer, replayPosition);
  };
  return { dispatch, stage, getBoundingClientRect, cursorPosition, drawCursor, drawingRef, firstDab,
    prepareStrokeCommitPage, setError, endLiveResourceEdit, settleZoom, flushBackdrop, host };
}

describe("pointer admission host wiring", () => {
  it("선택 준비 중 첫 접촉을 DOM 플래그 대신 원본 입력 저널에 전달한다", () => {
    const capturePendingCatalogInput = vi.fn(() => true);
    const host = {
      nodeEditDragRef: { current: null }, liquifyDragRef: { current: null },
      pixelDragRef: { current: null }, pendingPixelSelectionRasterGestureRef: { current: null },
      pendingRasterRetouchGestureRef: { current: null }, bubbleShapeDragRef: { current: null },
      handleStudioPointCommentStageDown: () => false,
      capturePendingCatalogInput,
    } as unknown as StudioCuttoonStagePointersHost;
    const api = { tryStageDownDraw: vi.fn() } as unknown as StudioCuttoonStagePointersApi;
    bindStudioCuttoonStagePointersDown(host, api);
    const pointer = { pointerType: "pen", timeStamp: 1 } as PointerEvent;
    const stage = {};
    api.onStageDown({ target: { name: () => "bg", getStage: () => stage }, evt: pointer });
    expect(capturePendingCatalogInput).toHaveBeenCalledWith(pointer, stage);
    expect(api.tryStageDownDraw).not.toHaveBeenCalled();
  });
  it("asks the host to settle the previous page before starting a new draw operation", () => {
    const fixture = drawFixture({ rejectPage: true });
    fixture.dispatch(drawPointer("mouse"));
    expect(fixture.prepareStrokeCommitPage).toHaveBeenCalledOnce();
    expect(fixture.setError).toHaveBeenCalledWith(expect.stringContaining("이전 페이지의 마지막 획"));
    expect(fixture.drawingRef.current).toBeNull();
    expect(fixture.firstDab).not.toHaveBeenCalled();
  });

  for (const pointerType of ["mouse", "pen"] as const) {
    it.each([
      { zoom: false, backdrop: false, origin: { x: 40, y: 80 }, reads: 1 },
      { zoom: true, backdrop: false, origin: { x: 30, y: 60 }, reads: 2 },
      { zoom: false, backdrop: true, origin: { x: 20, y: 50 }, reads: 2 },
      { zoom: true, backdrop: true, origin: { x: 20, y: 50 }, reads: 3 },
    ])(`${pointerType}는 정착한 첫점과 커서 좌표를 공유하고 추가 bounds를 읽지 않는다: %j`, (input) => {
      const fixture = drawFixture(input);
      const pointer = drawPointer(pointerType);
      const focus = document.createElement("button"); document.body.append(focus); focus.focus();
      fixture.dispatch(pointer);
      expect(fixture.setError).not.toHaveBeenCalled();
      expect(fixture.firstDab).toHaveBeenCalledOnce();
      const [stroke, sample, origin] = fixture.firstDab.mock.calls[0] ?? [];
      expect(origin).toEqual(input.origin);
      expect(stroke?.points.slice(0, 2)).toEqual([input.origin.x, input.origin.y]);
      expect(sample).toBe(pointer);
      expect(fixture.drawingRef.current).toBe(stroke);
      expect(fixture.cursorPosition).toHaveBeenCalledExactlyOnceWith(input.origin);
      expect(fixture.drawCursor).toHaveBeenCalledOnce();
      expect(fixture.getBoundingClientRect).toHaveBeenCalledTimes(input.reads);
      expect(fixture.settleZoom).toHaveBeenCalledTimes(input.zoom ? 1 : 0);
      expect(fixture.flushBackdrop).toHaveBeenCalledTimes(input.backdrop ? 1 : 0);
      expect(pointer.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(focus);
    });

    it(`${pointerType} replay는 저장한 첫점과 현재 커서 좌표를 구분하는 기존 의미를 유지한다`, () => {
      const fixture = drawFixture();
      const replay = { x: 11, y: 22 };
      fixture.dispatch(drawPointer(pointerType), replay);
      expect(fixture.firstDab).toHaveBeenCalledOnce();
      const [stroke, , origin] = fixture.firstDab.mock.calls[0] ?? [];
      expect(origin).toEqual(replay);
      expect(stroke?.points.slice(0, 2)).toEqual([11, 22]);
      expect(fixture.cursorPosition).toHaveBeenCalledExactlyOnceWith({ x: 40, y: 80 });
      expect(fixture.getBoundingClientRect).toHaveBeenCalledTimes(2);
    });

    it(`${pointerType} event Stage와 다른 Stage의 문서 좌표를 커서에 잘못 재사용하지 않는다`, () => {
      const fixture = drawFixture();
      fixture.host.stageRef.current = { getRelativePointerPosition: () => ({ x: 90, y: 100 }) };
      fixture.dispatch(drawPointer(pointerType));
      expect(fixture.firstDab).toHaveBeenCalledOnce();
      expect(fixture.firstDab.mock.calls[0]?.[2]).toEqual({ x: 90, y: 100 });
      expect(fixture.cursorPosition).toHaveBeenCalledExactlyOnceWith({ x: 40, y: 80 });
      expect(fixture.getBoundingClientRect).toHaveBeenCalledTimes(2);
    });

    it(`${pointerType} Stage ref가 없으면 event Stage에서 얻은 첫 좌표를 그대로 사용한다`, () => {
      const fixture = drawFixture();
      fixture.host.stageRef.current = null;
      fixture.dispatch(drawPointer(pointerType));
      expect(fixture.firstDab).toHaveBeenCalledOnce();
      expect(fixture.firstDab.mock.calls[0]?.[2]).toEqual({ x: 40, y: 80 });
      expect(fixture.cursorPosition).toHaveBeenCalledExactlyOnceWith({ x: 40, y: 80 });
      expect(fixture.getBoundingClientRect).toHaveBeenCalledOnce();
    });

    it(`${pointerType} 좌표를 얻지 못하면 커서와 첫 dab을 만들지 않고 편집 점유를 반환한다`, () => {
      const fixture = drawFixture({ nullPosition: true });
      fixture.dispatch(drawPointer(pointerType));
      expect(fixture.firstDab).not.toHaveBeenCalled();
      expect(fixture.cursorPosition).not.toHaveBeenCalled();
      expect(fixture.drawingRef.current).toBeNull();
      expect(fixture.endLiveResourceEdit).toHaveBeenCalledOnce();
      expect(fixture.getBoundingClientRect).toHaveBeenCalledOnce();
    });
  }
});
