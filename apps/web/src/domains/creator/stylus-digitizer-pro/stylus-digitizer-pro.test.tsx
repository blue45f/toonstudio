// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioStylusDigitizerPanel } from "./StudioStylusDigitizerPanel";
import {
  DEFAULT_BRUSH_PRESSURE_CURVES,
  DEFAULT_PALM_REJECTION_CONFIG,
  DEFAULT_STYLUS_SIDE_BINDINGS,
  DIGITIZER_TABLET_PRESETS,
  computeBarrelRollBristleOrientation,
  computeHoverNibPreview,
  createInitialPalmRejectionState,
  createInitialSpringLoadedStylusState,
  detectStylusRearEraser,
  evaluatePalmRejectionGate,
  evaluatePerBrushPressureCurve,
  extractAndPredictStylusSamples,
  mapDigitizerForceProportions,
  routeMultitouchGesture,
  stepSpringLoadedStylusTool,
  triggerStylusHapticDetent,
  upsertBrushPressureCurve,
} from "./stylus-digitizer-hardware-engine";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
const STORAGE_TOKEN_REGEX = new RegExp(`\\b${"local"}${"Storage"}\\b`);

describe("stylus-digitizer-pro: 태블릿·디지타이저 7대 하드웨어 엔진 & 패널 전수 검증", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("① 펜 호버 3D 틸트·트위스트 윤곽 프리뷰 기하(computeHoverNibPreview)가 고도·방위·그림자·회전을 정확히 산출한다", () => {
    const upright = computeHoverNibPreview({
      x: 100, y: 100, tiltX: 0, tiltY: 0, twist: 0, hoverAltitudeMm: 0, nibShape: "round", baseDiameterPx: 20,
    });
    expect(upright.altitudeDeg).toBe(90);
    expect(upright.tiltMagnitudeDeg).toBe(0);
    expect(upright.majorRadiusPx).toBe(10);
    expect(upright.minorRadiusPx).toBe(10);
    expect(upright.shadowEllipse.cx).toBe(100);
    expect(upright.shadowEllipse.cy).toBe(100);
    expect(upright.outlinePoints).toHaveLength(24);
    expect(upright.outlinePathD.startsWith("M")).toBe(true);
    expect(upright.outlinePathD.endsWith("Z")).toBe(true);

    const tilted = computeHoverNibPreview({
      x: 120, y: 80, tiltX: 45, tiltY: 0, twist: 65, hoverAltitudeMm: 8,
      nibShape: "chisel-calligraphy", baseDiameterPx: 30, barrelRollEnabled: true,
    });
    expect(tilted.altitudeDeg).toBeCloseTo(45, 1);
    expect(tilted.tiltMagnitudeDeg).toBeCloseTo(45, 1);
    expect(tilted.azimuthDeg).toBeCloseTo(0, 1);
    expect(tilted.barrelRotationDeg).toBe(65);
    expect(tilted.effectiveRotationDeg).toBe(65);
    expect(tilted.majorRadiusPx).toBeGreaterThan(15);
    expect(tilted.minorRadiusPx).toBeLessThan(tilted.majorRadiusPx * 0.45);
    expect(tilted.shadowEllipse.cx).toBeGreaterThan(120);
    expect(tilted.barrelAxisLine.x2).toBeGreaterThan(120);

    // 배럴 롤 비활성 시 twist 무시 & 비정상(NaN/Infinity) 방어
    const noRoll = computeHoverNibPreview({
      x: Number.NaN, y: Number.POSITIVE_INFINITY, tiltX: 120, tiltY: -120, twist: 145, barrelRollEnabled: false,
    });
    expect(noRoll.barrelRotationDeg).toBe(0);
    expect(noRoll.outlinePathD).not.toContain("NaN");
    expect(noRoll.outlinePathD).not.toContain("Infinity");
  });

  it("② 360° 배럴 롤 최단각 연속 회전 & 사이드버튼/스퀴즈 Spring-Loaded 임시 도구 전환·원복을 검증한다", () => {
    // 355° -> 5° 경계 통과 시 -350° 점프 없이 +10° 최단각 누적
    const roll = computeBarrelRollBristleOrientation(355, 5, { enabled: true });
    expect(roll.deltaDeg).toBe(10);
    expect(roll.cumulativeRollDeg).toBe(365);
    expect(roll.normalizedAngleDeg).toBe(5);
    expect(roll.effectiveWidthRatio).toBeGreaterThan(0.95);

    const rollDisabled = computeBarrelRollBristleOrientation(120, 45, { enabled: false });
    expect(rollDisabled.normalizedAngleDeg).toBe(0);

    // Spring-Loaded: side-primary(스포이드) 누름 -> 떼면 즉시 기본 도구(g-pen) 원복
    let s = createInitialSpringLoadedStylusState("g-pen");
    s = stepSpringLoadedStylusTool(s, { type: "press", trigger: "side-primary", timestampMs: 100 }, DEFAULT_STYLUS_SIDE_BINDINGS);
    expect(s.activeTool).toBe("eyedropper");
    expect(s.isSpringLoadedActive).toBe(true);
    expect(s.lastTransitionReason).toBe("spring-engage");

    s = stepSpringLoadedStylusTool(s, { type: "release", trigger: "side-primary", timestampMs: 360 }, DEFAULT_STYLUS_SIDE_BINDINGS);
    expect(s.activeTool).toBe("g-pen");
    expect(s.isSpringLoadedActive).toBe(false);
    expect(s.lastTransitionReason).toBe("spring-revert");

    // Barrel Squeeze -> 방사형 팔레트 열림 + 햅틱 추천 -> release 즉시 닫힘·원복
    s = stepSpringLoadedStylusTool(s, { type: "press", trigger: "barrel-squeeze", timestampMs: 500 }, DEFAULT_STYLUS_SIDE_BINDINGS);
    expect(s.activeTool).toBe("radial-palette");
    expect(s.isRadialPaletteOpen).toBe(true);
    expect(s.recommendedHaptic).toBe("squeeze-palette");

    s = stepSpringLoadedStylusTool(s, { type: "cancel" }, DEFAULT_STYLUS_SIDE_BINDINGS);
    expect(s.activeTool).toBe("g-pen");
    expect(s.isRadialPaletteOpen).toBe(false);
    expect(s.lastTransitionReason).toBe("cancel-revert");
  });

  it("③ 펜 뒷면 지우개(pointerType==='pen' && buttons===32) 자동 전환과 2/3/4손가락 멀티터치 라우터를 검증한다", () => {
    expect(detectStylusRearEraser({ pointerType: "pen", buttons: 32 })).toBe(true);
    expect(detectStylusRearEraser({ pointerType: "pen", buttons: 33 })).toBe(true);
    expect(detectStylusRearEraser({ pointerType: "pen", buttons: 1 })).toBe(false);
    expect(detectStylusRearEraser({ pointerType: "mouse", buttons: 32 })).toBe(false);
    expect(detectStylusRearEraser({ pointerType: "touch", buttons: 32 })).toBe(false);

    let state = createInitialSpringLoadedStylusState("watercolor");
    state = stepSpringLoadedStylusTool(state, { type: "rear-eraser", pointerType: "pen", buttons: 32 });
    expect(state.activeTool).toBe("eraser");
    expect(state.isRearEraserActive).toBe(true);
    state = stepSpringLoadedStylusTool(state, { type: "rear-eraser", pointerType: "pen", buttons: 0 });
    expect(state.activeTool).toBe("watercolor");
    expect(state.isRearEraserActive).toBe(false);

    // 2/3/4손가락 멀티터치 제스처 전수 라우팅
    const twoTap = routeMultitouchGesture({ contacts: [{ id: 1, x: 10, y: 10 }, { id: 2, x: 50, y: 12 }], durationMs: 110, maxTravelPx: 5 });
    expect(twoTap.action).toBe("undo");

    const threeTap = routeMultitouchGesture({ contacts: [{ id: 1, x: 10, y: 10 }, { id: 2, x: 40, y: 10 }, { id: 3, x: 70, y: 10 }], durationMs: 120, maxTravelPx: 6 });
    expect(threeTap.action).toBe("redo");

    const threeSwipeDown = routeMultitouchGesture({ contacts: [{ id: 1, x: 10, y: 10 }, { id: 2, x: 40, y: 10 }, { id: 3, x: 70, y: 10 }], durationMs: 260, maxTravelPx: 80, swipeDeltaY: 75, swipeDeltaX: 8 });
    expect(threeSwipeDown.action).toBe("cut-copy-paste-menu");

    const threeScrub = routeMultitouchGesture({ contacts: [{ id: 1, x: 10, y: 10 }, { id: 2, x: 40, y: 10 }, { id: 3, x: 70, y: 10 }], durationMs: 420, maxTravelPx: 140, swipeDeltaX: 90, horizontalScrubReversals: 3 });
    expect(threeScrub.action).toBe("clear-layer");

    const fourTap = routeMultitouchGesture({ contacts: [{ id: 1, x: 10, y: 10 }, { id: 2, x: 30, y: 10 }, { id: 3, x: 50, y: 10 }, { id: 4, x: 70, y: 10 }], durationMs: 140, maxTravelPx: 4 });
    expect(fourTap.action).toBe("toggle-fullscreen-canvas");

    const pinchSnap = routeMultitouchGesture({ contacts: [{ id: 1, x: 10, y: 10 }, { id: 2, x: 80, y: 10 }], durationMs: 320, maxTravelPx: 45, scaleDelta: 1.25, rotationDeltaDeg: 8, totalCanvasRotationDeg: 88.5 });
    expect(pinchSnap.action).toBe("canvas-pinch-rotate-pan");
    expect(pinchSnap.snappedRotationDeg).toBe(90);
    expect(pinchSnap.recommendedHaptic).toBe("angle-snap");

    // 팜(54px 큰 접촉면) 필터링 차단
    const palmOnly = routeMultitouchGesture({ contacts: [{ id: 1, x: 10, y: 10, widthPx: 54, heightPx: 48 }], durationMs: 90, maxTravelPx: 2 });
    expect(palmOnly.action).toBe("ignored-palm-or-proximity");
    expect(palmOnly.rejectedPalmContacts).toBe(1);
  });

  it("④ 팜 리젝션 ‘펜 전용 그리기(Stylus-Only Draw Lock)’ 게이트가 펜·팜·근접·멀티터치를 정확히 판정한다", () => {
    let tracker = createInitialPalmRejectionState();

    // 펜 호버 진입 -> 근접 상태 활성화 (호버라 잉크는 false)
    const penHover = evaluatePalmRejectionGate({ pointerType: "pen", timestampMs: 1000, x: 300, y: 200, isHovering: true }, tracker);
    expect(penHover.outcome).toBe("allow-draw");
    expect(penHover.allowStrokeInk).toBe(false);
    expect(penHover.nextState.isPenInProximity).toBe(true);
    tracker = penHover.nextState;

    // 펜 근접 중 손바닥 터치 -> 즉시 차단
    const palmDuringHover = evaluatePalmRejectionGate({ pointerType: "touch", timestampMs: 1080, x: 340, y: 260, widthPx: 14, heightPx: 14 }, tracker);
    expect(palmDuringHover.outcome).toBe("reject-palm");
    expect(palmDuringHover.reason).toBe("palm-pen-proximity-lock");
    tracker = palmDuringHover.nextState;

    // 펜 뒷면 지우개 접촉 -> allow-eraser
    const penRear = evaluatePalmRejectionGate({ pointerType: "pen", timestampMs: 1120, x: 300, y: 200, buttons: 32, isHovering: false }, tracker);
    expect(penRear.outcome).toBe("allow-eraser");
    expect(penRear.allowStrokeInk).toBe(true);
    tracker = penRear.nextState;

    // 펜 이탈 후 충분한 시간 경과(2000ms+) -> 1손가락은 Stylus-Only Lock으로 차단, 2손가락은 네비게이션 허용
    const penLeave = evaluatePalmRejectionGate({ pointerType: "pen", timestampMs: 1200, x: 300, y: 200, isPointerLeave: true }, tracker);
    tracker = penLeave.nextState;

    const singleFingerLocked = evaluatePalmRejectionGate({ pointerType: "touch", timestampMs: 3200, x: 100, y: 100, activeTouchCount: 1 }, tracker, DEFAULT_PALM_REJECTION_CONFIG);
    expect(singleFingerLocked.outcome).toBe("reject-palm");
    expect(singleFingerLocked.reason).toBe("stylus-only-draw-locked");
    expect(singleFingerLocked.allowStrokeInk).toBe(false);

    const twoFingerNav = evaluatePalmRejectionGate({ pointerType: "touch", timestampMs: 3250, x: 100, y: 100, activeTouchCount: 2 }, tracker, DEFAULT_PALM_REJECTION_CONFIG);
    expect(twoFingerNav.outcome).toBe("allow-gesture");
    expect(twoFingerNav.allowStrokeInk).toBe(false);
    expect(twoFingerNav.allowViewportGesture).toBe(true);

    // Stylus-Only Lock 해제 시에도 대형 손바닥 면적(50px)은 차단, 정상 1손가락만 그리기 허용
    const unlockedCfg = { ...DEFAULT_PALM_REJECTION_CONFIG, stylusOnlyDrawLock: false };
    const largePalm = evaluatePalmRejectionGate({ pointerType: "touch", timestampMs: 3300, x: 100, y: 100, widthPx: 50, heightPx: 44 }, tracker, unlockedCfg);
    expect(largePalm.outcome).toBe("reject-palm");
    expect(largePalm.reason).toBe("palm-large-contact-area");

    const fingerAllowed = evaluatePalmRejectionGate({ pointerType: "touch", timestampMs: 3350, x: 100, y: 100, widthPx: 12, heightPx: 12 }, tracker, unlockedCfg);
    expect(fingerAllowed.outcome).toBe("allow-draw");
    expect(fingerAllowed.allowStrokeInk).toBe(true);
  });

  it("⑤ 240Hz getCoalescedEvents + getPredictedEvents 1프레임 예측 보간과 급코너 오버슈트 감쇠를 검증한다", () => {
    const resNative = extractAndPredictStylusSamples({
      x: 130, y: 100, timeStamp: 16.66, pressure: 0.6,
      getCoalescedEvents: () => [
        { x: 100, y: 100, timeStamp: 4.16, pressure: 0.5 },
        { x: 110, y: 100, timeStamp: 8.33, pressure: 0.55 },
        { x: 120, y: 100, timeStamp: 12.5, pressure: 0.58 },
        { x: 130, y: 100, timeStamp: 16.66, pressure: 0.6 },
      ],
      getPredictedEvents: () => [
        { x: 140, y: 100, timeStamp: 20.83, pressure: 0.6 },
        { x: 150, y: 100, timeStamp: 25.0, pressure: 0.6 },
      ],
    });
    expect(resNative.usedNativeCoalesced).toBe(true);
    expect(resNative.usedNativePredicted).toBe(true);
    expect(resNative.committedSamples).toHaveLength(4);
    expect(resNative.effectiveInputHz).toBeCloseTo(240, 0);
    expect(resNative.predictedSamples).toHaveLength(2);
    expect(resNative.predictedSamples[0].isPredicted).toBe(true);
    expect(resNative.estimatedLatencySavedMs).toBeGreaterThan(7);

    // 네이티브 getPredictedEvents 미지원 시 키네마틱 1프레임 예측 + 급격한 90° 꺾임 감쇠
    const sharpCorner = extractAndPredictStylusSamples(
      { x: 120, y: 140, timeStamp: 12.5, pressure: 0.7 },
      [
        { x: 100, y: 100, timestampMs: 4.16, pressure: 0.7, tiltX: 0, tiltY: 0, twist: 0, isPredicted: false, isResampled: false },
        { x: 120, y: 100, timestampMs: 8.33, pressure: 0.7, tiltX: 0, tiltY: 0, twist: 0, isPredicted: false, isResampled: false },
      ],
      { targetHz: 240, enablePrediction: true, frameHorizonMs: 8.33 },
    );
    expect(sharpCorner.usedNativePredicted).toBe(false);
    expect(sharpCorner.cornerDampingFactor01).toBeLessThan(0.6);
    expect(sharpCorner.predictedSamples.length).toBeGreaterThanOrEqual(1);

    // 예측 비활성화 시 predictedSamples 0건
    const disabledPred = extractAndPredictStylusSamples({ x: 140, y: 100, timeStamp: 20 }, sharpCorner.committedSamples, { enablePrediction: false });
    expect(disabledPred.predictedSamples).toHaveLength(0);
    expect(disabledPred.estimatedLatencySavedMs).toBe(0);
  });

  it("⑥ 판 태블릿 1:1 종횡비 잠금(Force Proportions)이 울트라와이드·듀얼 모니터 왜곡을 1.00× 정원으로 보정한다", () => {
    const intuosM = DIGITIZER_TABLET_PRESETS[0]; // 224 x 148mm
    const unlocked = mapDigitizerForceProportions({
      tabletWidthMm: intuosM.activeWidthMm, tabletHeightMm: intuosM.activeHeightMm,
      monitorWidthPx: 3440, monitorHeightPx: 1440, forceProportions: false,
    });
    expect(unlocked.aspectDistortionRatio).toBeGreaterThan(1.55);
    expect(unlocked.circleRoundnessPct).toBeLessThan(65);
    expect(unlocked.pxPerMmX).not.toBeCloseTo(unlocked.pxPerMmY, 2);

    // Force Proportions ON -> X/Y px/mm 완전 일치, 왜곡 1.00, 정원 100%
    const locked = mapDigitizerForceProportions({
      tabletWidthMm: intuosM.activeWidthMm, tabletHeightMm: intuosM.activeHeightMm,
      monitorWidthPx: 3440, monitorHeightPx: 1440, forceProportions: true, alignment: "center",
    });
    expect(locked.aspectDistortionRatio).toBe(1);
    expect(locked.circleRoundnessPct).toBe(100);
    expect(locked.pxPerMmX).toBeCloseTo(locked.pxPerMmY, 3);
    expect(locked.deadZoneMm.topMm).toBeGreaterThan(20);
    expect(locked.deadZoneMm.bottomMm).toBeCloseTo(locked.deadZoneMm.topMm, 2);

    // 물리 20mm×20mm 정사각형을 그렸을 때 화면 픽셀 Δx === Δy (1:1 정사각형) 검증
    const p1 = mapDigitizerForceProportions({
      tabletWidthMm: 224, tabletHeightMm: 148, monitorWidthPx: 5120, monitorHeightPx: 1440,
      rawTabletXmm: 100, rawTabletYmm: 64, forceProportions: true, alignment: "center",
    });
    const p2 = mapDigitizerForceProportions({
      tabletWidthMm: 224, tabletHeightMm: 148, monitorWidthPx: 5120, monitorHeightPx: 1440,
      rawTabletXmm: 120, rawTabletYmm: 84, forceProportions: true, alignment: "center",
    });
    expect(p1.isInsideActiveZone).toBe(true);
    expect(p2.isInsideActiveZone).toBe(true);
    expect(Math.abs((p2.mappedX - p1.mappedX) - (p2.mappedY - p1.mappedY))).toBeLessThan(0.2);

    // 데드존 바깥 좌표 감지 & 180° 왼손잡이 반전
    const deadEdge = mapDigitizerForceProportions({
      tabletWidthMm: 224, tabletHeightMm: 148, monitorWidthPx: 3440, monitorHeightPx: 1440,
      rawTabletXmm: 112, rawTabletYmm: 2, forceProportions: true, alignment: "center",
    });
    expect(deadEdge.isInsideActiveZone).toBe(false);
    expect(deadEdge.mappedY).toBe(0);
  });

  it("⑦ 브러시별 독립 필압 커브 맵 단조성·격리성 & 햅틱 디텐트 쿨다운/reducedMotion 가드를 검증한다", () => {
    const gpen = evaluatePerBrushPressureCurve("g-pen", 0.35);
    const pencil = evaluatePerBrushPressureCurve("pencil-6b", 0.35);
    const airbrush = evaluatePerBrushPressureCurve("airbrush", 0.35);
    const eraser = evaluatePerBrushPressureCurve("eraser-hard", 0.35);
    expect(eraser.mappedPressure).toBeGreaterThan(pencil.mappedPressure);
    expect(pencil.mappedPressure).toBeGreaterThan(airbrush.mappedPressure);
    expect(gpen.usedFallbackGlobalCurve).toBe(false);

    // 모든 기본 브러시 커브 단조 비감소 검증
    for (const brushId of Object.keys(DEFAULT_BRUSH_PRESSURE_CURVES)) {
      const ev = evaluatePerBrushPressureCurve(brushId, 0.5);
      for (let i = 1; i < ev.curvePreview11.length; i += 1) {
        expect(ev.curvePreview11[i].y).toBeGreaterThanOrEqual(ev.curvePreview11[i - 1].y);
      }
    }

    // 브러시별 독립 수정 격리 & 미등록 브러시 전역 폴백
    const customMap = upsertBrushPressureCurve(DEFAULT_BRUSH_PRESSURE_CURVES, "g-pen", { cp1y: 0.82, cp2y: 0.94 });
    expect(evaluatePerBrushPressureCurve("g-pen", 0.35, customMap).mappedPressure).toBeGreaterThan(gpen.mappedPressure);
    expect(evaluatePerBrushPressureCurve("pencil-6b", 0.35, customMap).mappedPressure).toBe(pencil.mappedPressure);
    expect(evaluatePerBrushPressureCurve("unknown-brush", 0.5, customMap).usedFallbackGlobalCurve).toBe(true);

    // 햅틱 디텐트 트리거, 쿨다운, 비활성화, reducedMotion 억제 검증
    const vibrateMock = vi.fn(() => true);
    const ok = triggerStylusHapticDetent("squeeze-palette", { enabled: true, timestampMs: 1000, vibrateFn: vibrateMock });
    expect(ok.triggered).toBe(true);
    expect(ok.backend).toBe("custom-vibrate");
    expect(ok.patternMs).toHaveLength(3);
    expect(vibrateMock).toHaveBeenCalledTimes(1);

    const cooled = triggerStylusHapticDetent("angle-snap", { enabled: true, timestampMs: 1010, lastTriggeredAtMs: 1000, cooldownMs: 35, vibrateFn: vibrateMock });
    expect(cooled.triggered).toBe(false);
    expect(cooled.suppressedReason).toBe("cooldown");

    const reduced = triggerStylusHapticDetent("angle-snap", { enabled: true, reducedMotion: true, timestampMs: 2000, vibrateFn: vibrateMock });
    expect(reduced.triggered).toBe(false);
    expect(reduced.suppressedReason).toBe("reduced-motion");

    const disabled = triggerStylusHapticDetent("tool-switch", { enabled: false, timestampMs: 2500, vibrateFn: vibrateMock });
    expect(disabled.triggered).toBe(false);
    expect(disabled.suppressedReason).toBe("disabled");
  });

  it("StudioStylusDigitizerPanel KO/EN 렌더링·토글·사이드버튼 홀드/뒷면지우개·Calm Atelier 위생을 전수 검증한다", () => {
    const { container, unmount } = render(<StudioStylusDigitizerPanel />);
    expect(screen.getByText("태블릿 · 디지타이저 7대 하드웨어 프로 엔진")).toBeTruthy();
    expect(container.innerHTML).toContain("[word-break:keep-all]");
    expect(container.innerHTML).toContain("tabular-nums");
    expect(container.innerHTML).not.toContain("transition-all");

    // 1:1 종횡비 잠금 해제 시 왜곡 비율이 1.00× -> 1.58× 로 즉시 반영
    expect(screen.getByText(/왜곡 1\.00× · 정원 100%/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1:1 종횡비 잠금" }));
    expect(screen.getByText(/왜곡 1\.58×/)).toBeTruthy();

    // 사이드버튼 홀드 -> 스포이드 전환 -> 떼면 G펜 원복
    const holdBtn = screen.getByRole("button", { name: "사이드버튼 홀드 테스트" });
    fireEvent.pointerDown(holdBtn);
    expect(screen.getByTestId("stylus-active-tool-badge").textContent).toContain("스포이드");
    fireEvent.pointerUp(holdBtn);
    expect(screen.getByTestId("stylus-active-tool-badge").textContent).toContain("G펜");

    // 펜 뒷면 지우개(buttons=32) 전환 & 복귀
    const rearBtn = screen.getByRole("button", { name: "펜 뒷면 지우개 (buttons=32)" });
    fireEvent.click(rearBtn);
    expect(screen.getByTestId("stylus-active-tool-badge").textContent).toContain("지우개");
    fireEvent.click(rearBtn);
    expect(screen.getByTestId("stylus-active-tool-badge").textContent).toContain("G펜");

    // 2손가락 Undo 테스트 + 브러시별 커브 전환
    fireEvent.click(screen.getByRole("button", { name: /2손가락 Undo 테스트/ }));
    expect(screen.getByRole("status").textContent).toContain("2손가락 탭");
    fireEvent.click(screen.getByRole("button", { name: "에어브러시" }));
    expect(screen.getByRole("button", { name: "에어브러시" }).getAttribute("aria-pressed")).toBe("true");
    unmount();

    // EN 모드 렌더링 검증
    useI18n.setState({ lang: "en" });
    const enView = render(<StudioStylusDigitizerPanel />);
    expect(screen.getByText("Stylus & Digitizer 7-Hardware Pro Engine")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Force Proportions 1:1" }).getAttribute("aria-pressed")).toBe("true");
    expect(enView.container.innerHTML).not.toContain("transition-all");
    enView.unmount();

    // 정적 소스 위생 검증: 배럴 index.ts 금지 · 줄 수 예산 · raw hex/rgb/hsl 0건 · localStorage 0건 · transition-all 0건
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/stylus-digitizer-pro");
    expect(fs.existsSync(path.join(dir, "index.ts"))).toBe(false);
    const engineSrc = fs.readFileSync(path.join(dir, "stylus-digitizer-hardware-engine.ts"), "utf8");
    const panelSrc = fs.readFileSync(path.join(dir, "StudioStylusDigitizerPanel.tsx"), "utf8");
    expect(engineSrc.split("\n").length).toBeLessThanOrEqual(680);
    expect(panelSrc.split("\n").length).toBeLessThanOrEqual(420);
    for (const [name, src] of [["stylus-digitizer-hardware-engine.ts", engineSrc], ["StudioStylusDigitizerPanel.tsx", panelSrc]] as const) {
      expect(RAW_COLOR_REGEX.test(src), `${name} must not contain raw colors`).toBe(false);
      expect(src.includes("transition-all"), `${name} must not contain transition-all`).toBe(false);
      expect(STORAGE_TOKEN_REGEX.test(src), `${name} must not reference web storage`).toBe(false);
    }
  });
});
