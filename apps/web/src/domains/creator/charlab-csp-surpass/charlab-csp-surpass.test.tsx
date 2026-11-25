// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEMO_IK_ANCHOR_PRESETS,
  DEMO_VOICE_MEMO_PRESETS,
  StudioCharlabCspSurpassPanel,
  TACTILE_PAD_BUTTONS,
  acknowledgeBreakCompleted,
  applyDigitalCrownDelta,
  blowDry,
  consumeNextBalloonMemo,
  createDemoCharacterLiveLinkRegistry,
  createDemoColorDropCanvas,
  createDemoLtArchitectureMesh,
  createDemoOverhangingVectorStrokes,
  createDemoQuickShapeStroke,
  createInitialSmartwatchState,
  createWetPaintGrid,
  depositWetWatercolor,
  enqueueVoiceDialogueMemo,
  eraseVectorTailToIntersection,
  evaluateWristFatigueCoach,
  extractCharacterOklchSwatches,
  extractThreeLayerLtFromMesh,
  oklchToSrgb,
  propagateCharacterLiveLink,
  recognizeAndSnapQuickShape,
  recordDrawingBurst,
  simulateColorDropFill,
  solveCoupleAndPropIkAnchors,
  solveSceneHeightScale,
  srgbToOklch,
  stepGravityWatercolor,
  summarizeWetPaintGrid,
  triggerTactilePadButton,
} from "./index";

afterEach(cleanup);

describe("1. 3D 캐릭터 랩스 라이브 링크 엔진 (character-live-link-engine)", () => {
  it("캐릭터당 6종 의상/전투손상 슬롯을 제공하고 라이브 링크 변경을 연결된 컷으로 전파한다(로컬 잠금 컷은 보존)", () => {
    const registry = createDemoCharacterLiveLinkRegistry();
    expect(registry.profiles).toHaveLength(2);
    for (const profile of registry.profiles) {
      expect(profile.costumeSlots).toHaveLength(6);
      expect(profile.costumeSlots.map((s) => s.slotIndex)).toEqual([1, 2, 3, 4, 5, 6]);
    }

    const res = propagateCharacterLiveLink(registry, "seojun-184", {
      activeSlotId: "torn-heavy",
    });
    expect(res.nextRevision).toBe(2);
    expect(res.syncedCutIds).toEqual(["ep12-cut04", "ep12-cut07"]);
    expect(res.skippedLockedCutIds).toEqual(["ep12-cut09-flashback"]);

    const lockedCut = res.registry.cutBindings.find((b) => b.cutId === "ep12-cut09-flashback");
    expect(lockedCut?.activeSlotId).toBe("formal-uniform");
    const syncedCut = res.registry.cutBindings.find((b) => b.cutId === "ep12-cut04");
    expect(syncedCut?.activeSlotId).toBe("torn-heavy");
  });

  it("실제 키(184cm vs 162cm) 비율 기반 씬 자동 스케일과 바닥 접지(Y=0)를 0.1mm 이내로 정밀 계산한다", () => {
    const solution = solveSceneHeightScale(
      [
        {
          characterId: "seojun-184",
          displayNameKo: "강서준",
          realHeightCm: 184,
          rawMeshHeightM: 1.72,
          footWorldY: 0.05,
          heelLiftCm: 2.0,
        },
        {
          characterId: "yuna-162",
          displayNameKo: "한유나",
          realHeightCm: 162,
          rawMeshHeightM: 1.68,
          footWorldY: -0.03,
          heelLiftCm: 1.5,
        },
      ],
      0,
    );

    expect(solution.allGroundedOnFloor).toBe(true);
    expect(solution.maxHeightErrorMm).toBeLessThan(0.1);
    expect(solution.pairwiseRelations).toHaveLength(1);
    const rel = solution.pairwiseRelations[0]!;
    expect(rel.heightDiffCm).toBeCloseTo(22.0, 1);
    expect(rel.heightRatio).toBeCloseTo(184 / 162, 3);
    expect(rel.eyeLineDiffCm).toBeGreaterThan(18);
  });

  it("커플 손잡기·무기 파지 IK 앵커 잠금 오차가 0.5mm 미만임을 보장하고 도달 불가 앵커는 정직하게 보고한다", () => {
    for (const preset of DEMO_IK_ANCHOR_PRESETS) {
      const solved = solveCoupleAndPropIkAnchors(preset);
      expect(solved.lockedWithinTolerance).toBe(true);
      expect(solved.anchorDistanceErrorMm).toBeLessThan(0.5);
      expect(solved.primaryPose.elbowFlexionDeg).toBeGreaterThanOrEqual(4);
      expect(solved.primaryPose.elbowFlexionDeg).toBeLessThanOrEqual(152);
    }

    const unreachable = solveCoupleAndPropIkAnchors({
      ...DEMO_IK_ANCHOR_PRESETS[1]!,
      targetAnchorPos: { x: 2.4, y: 1.4, z: 0.5 },
    });
    expect(unreachable.lockedWithinTolerance).toBe(false);
    expect(unreachable.anchorDistanceErrorMm).toBeGreaterThan(500);
    expect(unreachable.recommendedRootStepM).toBeGreaterThan(0.5);
  });

  it("sRGB <-> OKLCH 왕복 정밀도와 캐릭터 헤어·피부·눈·의상 6부위 2D 자동 배색 스와치를 검증한다", () => {
    const sample = { r: 0.78, g: 0.34, b: 0.31 };
    const ok = srgbToOklch(sample);
    const back = oklchToSrgb(ok);
    expect(back.r).toBeCloseTo(sample.r, 2);
    expect(back.g).toBeCloseTo(sample.g, 2);
    expect(back.b).toBeCloseTo(sample.b, 2);

    const registry = createDemoCharacterLiveLinkRegistry();
    const report = extractCharacterOklchSwatches(registry.profiles[0]!, "combat-ready");
    expect(report.swatches).toHaveLength(6);
    expect(report.skinReadabilityPass).toBe(true);
    expect(report.paletteHarmonyScore).toBeGreaterThanOrEqual(70);
    for (const sw of report.swatches) {
      expect(sw.base.oklchCss).toMatch(/^oklch\(/u);
      expect(sw.celShadow.l).toBeLessThan(sw.base.l);
      expect(sw.celHighlight.l).toBeGreaterThan(sw.base.l);
      expect(sw.lineartInk.l).toBeLessThanOrEqual(0.24);
    }
  });
});

describe("2. CSP/Procreate/Rebelle 돌파 드로잉 엔진 (vector-quickshape-wetpaint-engine)", () => {
  it("CSP 벡터 교차점 지우개가 잉여 시작 꼬리와 끝 꼬리를 가장 가까운 교차점까지만 정확히 절단한다", () => {
    const initial = createDemoOverhangingVectorStrokes();

    // top-bar(y=48, x:24..216)와 left-pillar(x=56), right-pillar(x=184) 교차.
    const trimLeft = eraseVectorTailToIntersection(initial, { x: 34, y: 48 }, 15);
    expect(trimLeft.actionKind).toBe("trimmed-start-tail");
    expect(trimLeft.trimmedStrokeId).toBe("top-bar");
    expect(trimLeft.removedSegmentLengthPx).toBeCloseTo(32, 2);
    const topAfterLeft = trimLeft.strokes.find((s) => s.id === "top-bar")!;
    expect(topAfterLeft.points[0]!.x).toBeCloseTo(56, 3);
    expect(topAfterLeft.points[0]!.y).toBeCloseTo(48, 3);

    const trimRight = eraseVectorTailToIntersection(trimLeft.strokes, { x: 204, y: 48 }, 15);
    expect(trimRight.actionKind).toBe("trimmed-end-tail");
    const topAfterBoth = trimRight.strokes.find((s) => s.id === "top-bar")!;
    expect(topAfterBoth.points[0]!.x).toBeCloseTo(56, 3);
    expect(topAfterBoth.points[topAfterBoth.points.length - 1]!.x).toBeCloseTo(184, 3);
  });

  it("CSP 벡터 교차점 지우개가 두 교차점 사이 내부 선분을 클릭하면 정확히 두 조각으로 분할한다", () => {
    const initial = createDemoOverhangingVectorStrokes();
    const splitRes = eraseVectorTailToIntersection(initial, { x: 120, y: 48 }, 15);
    expect(splitRes.actionKind).toBe("split-between-intersections");
    expect(splitRes.removedSegmentLengthPx).toBeCloseTo(128, 2);
    expect(splitRes.strokes).toHaveLength(5);
    const partA = splitRes.strokes.find((s) => s.id === "top-bar-a")!;
    const partB = splitRes.strokes.find((s) => s.id === "top-bar-b")!;
    expect(partA.points[partA.points.length - 1]!.x).toBeCloseTo(56, 3);
    expect(partB.points[0]!.x).toBeCloseTo(184, 3);
  });

  it("3D LT 3층 추출 파이프라인이 외곽선·그림자·스크린톤(60LPI)을 분리 생성하고 광원 회전에 반응한다", () => {
    const mesh = createDemoLtArchitectureMesh();
    const baseCamera = {
      position: { x: 3.6, y: 2.5, z: 4.2 },
      target: { x: -0.1, y: 1.1, z: 0 },
      fovDeg: 45,
      viewportWidth: 240,
      viewportHeight: 160,
    };

    const ltFront = extractThreeLayerLtFromMesh(mesh, {
      camera: baseCamera,
      keyLightDir: { x: 0.7, y: 0.6, z: 0.4 },
      screentoneLpi: 60,
    });
    const ltBack = extractThreeLayerLtFromMesh(mesh, {
      camera: baseCamera,
      keyLightDir: { x: -0.8, y: 0.2, z: -0.6 },
      screentoneLpi: 60,
    });

    expect(ltFront.outlineLayer.edges.length).toBeGreaterThan(10);
    expect(ltFront.outlineLayer.silhouetteCount).toBeGreaterThan(0);
    expect(ltFront.shadowLayer.polygons.length).toBeGreaterThan(0);
    expect(ltFront.screentoneLayer.dots.length).toBeGreaterThan(20);
    expect(ltBack.shadowLayer.shadowAreaRatio).toBeGreaterThan(ltFront.shadowLayer.shadowAreaRatio);
  });

  it("Procreate급 QuickShape가 손떨림 있는 직선/원/타원/삼각형/사각형 5종을 RMS < 0.04로 정확히 인식·스냅한다", () => {
    const shapes = ["line", "circle", "ellipse", "triangle", "rectangle"] as const;
    for (const expected of shapes) {
      const stroke = createDemoQuickShapeStroke(expected);
      const res = recognizeAndSnapQuickShape(stroke, 0.04);
      expect(res.kind).toBe(expected);
      expect(res.snapped).toBe(true);
      expect(res.rmsError).toBeLessThan(0.04);
      expect(res.snappedPoints.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("Procreate급 QuickShape가 불규칙 낙서(scribble)는 억지 스냅하지 않고 freehand로 유지한다", () => {
    const scribble = createDemoQuickShapeStroke("scribble");
    const res = recognizeAndSnapQuickShape(scribble, 0.04);
    expect(res.kind).toBe("freehand");
    expect(res.snapped).toBe(false);
    expect(res.rmsError).toBeGreaterThanOrEqual(0.04);
  });

  it("ColorDrop 틈새 닫기가 열린 선화 누출을 막고 할로 방지 확장이 반투명 흰 테두리를 제거한다", () => {
    const canvas = createDemoColorDropCanvas(4);

    const leaked = simulateColorDropFill(canvas, {
      seed: { x: 21, y: 21 },
      dragThreshold: 0.45,
      gapCloseRadiusPx: 0,
      antiHaloExpandPx: 0,
    });
    expect(leaked.leakedToBorder).toBe(true);
    expect(leaked.gapSealed).toBe(false);

    const sealed = simulateColorDropFill(canvas, {
      seed: { x: 21, y: 21 },
      dragThreshold: 0.45,
      gapCloseRadiusPx: 3,
      antiHaloExpandPx: 1,
    });
    expect(sealed.leakedToBorder).toBe(false);
    expect(sealed.gapSealed).toBe(true);
    expect(sealed.filledPixelCount).toBeGreaterThan(400);
    expect(sealed.filledPixelCount).toBeLessThan(900);
    expect(sealed.haloPixelsBefore).toBeGreaterThan(0);
    expect(sealed.haloPixelsAfter).toBeLessThan(sealed.haloPixelsBefore);
    expect(sealed.haloEliminationRatio).toBeGreaterThan(0.75);
  });

  it("Rebelle급 기울기 중력 수채화가 기기 기울기 (gx, gy) 방향으로 물감을 이류(advection)시킨다", () => {
    const seeded = depositWetWatercolor(createWetPaintGrid(20, 20), 6, 5, 3, 0.9, 0.95);
    const startCom = summarizeWetPaintGrid(seeded).centerOfMass;

    let grid = seeded;
    for (let i = 0; i < 6; i += 1) {
      grid = stepGravityWatercolor(grid, { gx: 0.85, gy: 0.65, dt: 0.5 }).grid;
    }
    const endSummary = summarizeWetPaintGrid(grid);
    expect(endSummary.centerOfMass.x).toBeGreaterThan(startCom.x + 0.5);
    expect(endSummary.centerOfMass.y).toBeGreaterThan(startCom.y + 0.35);
    expect(endSummary.isCompletelyDry).toBe(false);
  });

  it("Rebelle급 blowDry() 1클릭 드라이어가 수분을 0으로 고정하고 이후 강한 기울기에도 안료가 전혀 흐르지 않는다", () => {
    const seeded = depositWetWatercolor(createWetPaintGrid(18, 18), 8, 8, 3, 0.9, 0.95);
    const dried = blowDry(seeded);

    expect(dried.summary.totalWater).toBe(0);
    expect(dried.summary.moisturePercent).toBe(0);
    expect(dried.summary.isCompletelyDry).toBe(true);
    expect(dried.summary.totalWetPigment).toBe(0);
    expect(dried.summary.totalDriedPigment).toBeGreaterThan(1);

    const afterTilt = stepGravityWatercolor(dried.grid, { gx: 1.0, gy: 1.0, dt: 0.7 });
    expect(afterTilt.centerShift.x).toBe(0);
    expect(afterTilt.centerShift.y).toBe(0);
    expect(afterTilt.summary.totalWater).toBe(0);
  });
});

describe("3. 스마트워치 동반 리모컨 프로토콜 (smartwatch-companion-engine)", () => {
  it("디지털 크라운 가변 감도가 저속 정밀 조절과 고속 가속 스핀을 구분하고 경계 촉각을 발생시킨다", () => {
    const init = createInitialSmartwatchState();
    const slow = applyDigitalCrownDelta(init, { deltaDeg: 15, angularVelocityDegPerSec: 25 });
    const fast = applyDigitalCrownDelta(init, { deltaDeg: 15, angularVelocityDegPerSec: 360 });

    expect(fast.effectiveGain).toBeGreaterThan(slow.effectiveGain * 2.5);
    expect(fast.appliedDelta).toBeGreaterThan(slow.appliedDelta * 2.5);
    expect(slow.packet.hapticPattern).toBe("tick-light");
    expect(fast.packet.hapticPattern).toBe("tick-firm");

    const zoomMode = { ...init, crownMode: "canvas-zoom" as const, canvasZoomPct: 790 };
    const hitMax = applyDigitalCrownDelta(zoomMode, { deltaDeg: 60, angularVelocityDegPerSec: 320 });
    expect(hitMax.hitBoundary).toBe(true);
    expect(hitMax.state.canvasZoomPct).toBe(800);
    expect(hitMax.packet.hapticPattern).toBe("boundary-thump");
  });

  it("4버튼 촉각 액션 패드(실행취소·다시실행·스포이드·좌우반전)가 캔버스 상태를 정확히 전이시킨다", () => {
    expect(TACTILE_PAD_BUTTONS).toHaveLength(4);
    let state = createInitialSmartwatchState();

    const afterUndo = triggerTactilePadButton(state, "undo");
    expect(afterUndo.executed).toBe(true);
    expect(afterUndo.state.undoStackDepth).toBe(state.undoStackDepth - 1);
    expect(afterUndo.state.redoStackDepth).toBe(state.redoStackDepth + 1);
    state = afterUndo.state;

    const afterRedo = triggerTactilePadButton(state, "redo");
    expect(afterRedo.state.undoStackDepth).toBe(12);
    state = afterRedo.state;

    const afterEye = triggerTactilePadButton(state, "eyedropper");
    expect(afterEye.state.eyedropperActive).toBe(true);
    state = afterEye.state;

    const afterFlip = triggerTactilePadButton(state, "flip-horizontal");
    expect(afterFlip.state.canvasFlippedHorizontal).toBe(true);
    expect(afterFlip.packet.hapticPattern).toBe("mirror-click");
  });

  it("누적 획 속도·작업시간 기반 손목 피로 휴식 코치가 경보를 상향하고 휴식 완료 시 회복한다", () => {
    const fresh = evaluateWristFatigueCoach({
      sessionDurationMinutes: 15,
      cumulativeStrokeMeters: 8,
      averageStrokeSpeedPxPerSec: 350,
      highPressureRatio: 0.15,
      minutesSinceLastBreak: 15,
    });
    expect(fresh.riskLevel).toBe("fresh");
    expect(fresh.recommendedBreakMinutes).toBe(0);

    let state = createInitialSmartwatchState();
    state = recordDrawingBurst(state, {
      addedMinutes: 65,
      addedStrokeMeters: 110,
      burstSpeedPxPerSec: 1650,
      burstHighPressureRatio: 0.9,
    });
    expect(state.fatigueReport.fatigueScore).toBeGreaterThanOrEqual(80);
    expect(state.fatigueReport.riskLevel).toBe("critical");
    expect(state.fatigueReport.requiresImmediateRest).toBe(true);

    const rested = acknowledgeBreakCompleted(state, 10);
    expect(rested.wristTelemetry.minutesSinceLastBreak).toBe(0);
    expect(rested.fatigueReport.fatigueScore).toBeLessThan(state.fatigueReport.fatigueScore - 30);
  });

  it("3초 음성 대사 캡처가 한국어 말풍선 스타일(외침/속마음/속삭임/내레이션)을 추론하고 FIFO 큐로 배치한다", () => {
    let state = createInitialSmartwatchState();
    for (const preset of DEMO_VOICE_MEMO_PRESETS.slice(1)) {
      state = enqueueVoiceDialogueMemo(state, preset);
    }
    expect(state.balloonMemoQueue).toHaveLength(4);
    expect(state.balloonMemoQueue.map((m) => m.inferredStyle)).toEqual([
      "shout",
      "thought",
      "whisper",
      "narration",
    ]);
    expect(state.balloonMemoQueue.every((m) => m.withinThreeSecBudget)).toBe(true);

    const popped = consumeNextBalloonMemo(state);
    expect(popped.consumed?.inferredStyle).toBe("shout");
    expect(popped.state.balloonMemoQueue).toHaveLength(3);
    expect(popped.state.placedMemoHistory).toHaveLength(1);
  });
});

describe("4. StudioCharlabCspSurpassPanel 통합 UI 및 엄격 코드 위생 계약", () => {
  it("Props 없이 단독 렌더링되고 3개 탭(캐릭터 라이브 링크 / 드로잉 돌파 / 스마트워치)을 전환한다", () => {
    render(<StudioCharlabCspSurpassPanel />);
    expect(screen.getByTestId("charlab-csp-surpass-panel")).toBeTruthy();
    expect(screen.getByTestId("tab-charlab").getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByTestId("tab-drawing-surpass"));
    expect(screen.getByTestId("tab-drawing-surpass").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("watercolor-blowdry-btn")).toBeTruthy();

    fireEvent.click(screen.getByTestId("tab-watch-remote"));
    expect(screen.getByTestId("tab-watch-remote").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("watch-pad-flip-horizontal")).toBeTruthy();
  });

  it("Tab 1에서 6종 의상/전투손상 슬롯 전환 및 키 조절 시 라이브 링크 동기화 콜백과 수치가 즉시 갱신된다", () => {
    const onLiveLinkSync = vi.fn();
    render(<StudioCharlabCspSurpassPanel onLiveLinkSync={onLiveLinkSync} />);

    fireEvent.click(screen.getByTestId("costume-slot-torn-heavy"));
    expect(onLiveLinkSync).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("live-link-sync-status").textContent).toContain("rev.2");

    fireEvent.change(screen.getByTestId("char-height-slider"), { target: { value: "190" } });
    expect(screen.getByTestId("selected-height-readout").textContent).toContain("190 cm");
    expect(screen.getByTestId("ik-lock-badge").textContent).toContain("LOCK");
    expect(screen.getByTestId("oklch-swatch-hair")).toBeTruthy();
  });

  it("Tab 2·Tab 3에서 교차점 절단·QuickShape·1클릭 드라이어·워치 크라운·4버튼·음성 큐가 즉시 동작한다", () => {
    render(<StudioCharlabCspSurpassPanel initialTab="drawing-surpass" />);

    fireEvent.click(screen.getByTestId("erase-top-left-tail-btn"));
    expect(screen.getByTestId("vector-erase-status").textContent).toContain("trimmed-start-tail");

    fireEvent.click(screen.getByTestId("quickshape-preset-triangle"));
    expect(screen.getByTestId("quickshape-badge").textContent).toContain("triangle");

    fireEvent.click(screen.getByTestId("watercolor-step-btn"));
    fireEvent.click(screen.getByTestId("watercolor-blowdry-btn"));
    expect(screen.getByTestId("wet-moisture-badge").textContent).toContain("0.0%");

    fireEvent.click(screen.getByTestId("tab-watch-remote"));
    fireEvent.click(screen.getByTestId("crown-spin-fast-up"));
    expect(screen.getByTestId("watch-crown-value").textContent).not.toContain("브러시 14px");

    fireEvent.click(screen.getByTestId("watch-pad-flip-horizontal"));
    expect(screen.getByTestId("watch-pad-state").textContent).toContain("좌우반전 ON");

    fireEvent.click(screen.getByTestId("voice-memo-enqueue-btn"));
    expect(screen.getByTestId("voice-queue-count").textContent).toContain("2건");
    fireEvent.click(screen.getByTestId("voice-memo-consume-btn"));
    expect(screen.getByTestId("voice-queue-count").textContent).toContain("2건");
    expect(screen.getByTestId("watch-queue-status").textContent).toContain("큐에서 지우지 않았어요");
  });

  it("워치 큐의 직접 입력은 미연결 확인과 탭 왕복 뒤에도 남고 실제 연결·배치 성공으로 표시하지 않는다", () => {
    render(<StudioCharlabCspSurpassPanel initialTab="watch-remote" />);
    expect(screen.getByTestId("charlab-scope-notice").textContent).toContain("독립 계산 예제");
    expect(screen.getByTestId("watch-scope-notice").textContent).toContain("BLE 연결·송신·진동");
    expect(createInitialSmartwatchState().connectedDeviceName).toContain("미연결");
    fireEvent.change(screen.getByTestId("voice-memo-input"), { target: { value: "다음 컷에 남겨둘 대사" } });
    fireEvent.click(screen.getByTestId("voice-memo-enqueue-btn"));
    fireEvent.click(screen.getByTestId("voice-memo-consume-btn"));
    fireEvent.click(screen.getByTestId("tab-charlab"));
    fireEvent.click(screen.getByTestId("tab-watch-remote"));
    expect(screen.getByDisplayValue("다음 컷에 남겨둘 대사")).toBeTruthy();
    expect(screen.getByTestId("voice-queue-count").textContent).toContain("2건");
    expect(screen.getByText("[normal] 다음 컷에 남겨둘 대사")).toBeTruthy();
  });

  it("레지스트리 알림은 비동기 실패·중복 억제·재시도를 처리하고 실제 모델 적용과 구분한다", async () => {
    const onLiveLinkSync = vi.fn().mockRejectedValueOnce(new Error("알림 실패")).mockResolvedValueOnce(undefined);
    render(<StudioCharlabCspSurpassPanel onLiveLinkSync={onLiveLinkSync} />);
    const costume = screen.getByTestId("costume-slot-torn-heavy");
    fireEvent.click(costume);
    expect(screen.getByTestId("charlab-csp-surpass-panel").getAttribute("aria-busy")).toBe("true");
    fireEvent.click(costume);
    expect(onLiveLinkSync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("charlab-callback-status").textContent).toContain("처리에 실패"));
    fireEvent.click(costume);
    await waitFor(() => expect(screen.getByTestId("charlab-callback-status").textContent).toContain("실제 모델·원고 적용이나 저장 완료를 뜻하지 않아요"));
    expect(onLiveLinkSync).toHaveBeenCalledTimes(2);
  });

  it("동기 레지스트리 알림 오류 후에도 다시 선택할 수 있다", () => {
    const onLiveLinkSync = vi.fn().mockImplementationOnce(() => { throw new Error("알림 오류"); });
    render(<StudioCharlabCspSurpassPanel onLiveLinkSync={onLiveLinkSync} />);
    const costume = screen.getByTestId("costume-slot-torn-heavy");
    fireEvent.click(costume);
    expect(screen.getByTestId("charlab-callback-status").textContent).toContain("처리에 실패");
    fireEvent.click(costume);
    expect(onLiveLinkSync).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("charlab-callback-status").textContent).toContain("실제 모델·원고 적용이나 저장 완료를 뜻하지 않아요");
  });

  it("엄격 규칙(모든 파일 800줄 이하 · Storage/BigInt리터럴/private Map store/원시 색/props={} 0건)을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "character-live-link-engine.ts",
      "vector-quickshape-wetpaint-engine.ts",
      "smartwatch-companion-engine.ts",
      "StudioCharlabCspSurpassPanel.tsx",
      "index.ts",
      "charlab-csp-surpass.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      if (file !== "charlab-csp-surpass.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
      }
      if (file.endsWith(".tsx") && file !== "charlab-csp-surpass.test.tsx") {
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
