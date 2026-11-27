import { describe, expect, it } from "vitest";

import {
  buildMotionSafeTransitionHint,
  computeRelativeLuminance,
  computeSpatialBrushAudioParams,
  DEFAULT_RADIAL_PIE_SECTORS,
  harmonizeCutFlatColorsToKeyLight,
  kelvinToLinearRgbTint,
  MAX_SKIN_TONE_HUE_DRIFT_DEG,
  MAX_SPATIAL_BRUSH_GAIN_LINEAR,
  MIN_RADIAL_DEADZONE_RADIUS_PX,
  NEUTRAL_DAYLIGHT_KELVIN,
  planGazeAssistedCanvasViewport,
  recognizeStudioGestureChord,
  resolveRadialPieSector,
  type CutFlatColorRegionInput,
  type GesturePointerContact,
  type PanelReadingAnchor,
} from "./index";

function makeTouchContact(
  pointerId: number,
  overrides: Partial<GesturePointerContact> = {},
): GesturePointerContact {
  return {
    pointerId,
    pointerType: "touch",
    startX: 200 + pointerId * 40,
    startY: 300,
    currentX: 202 + pointerId * 40,
    currentY: 301,
    startTimeMs: 1_000,
    currentTimeMs: 1_110,
    isReleased: true,
    ...overrides,
  };
}

describe("wasm64-wave36-gesture-autocolor-spatial-nav", () => {
  it("1. 펜 드로잉 진행 중 동시에 닿은 손바닥·두 손가락 터치를 차단해 오작동 실행 취소를 막는다", () => {
    const activeStylus: GesturePointerContact = {
      pointerId: 10,
      pointerType: "pen",
      startX: 420,
      startY: 360,
      currentX: 465,
      currentY: 382,
      startTimeMs: 1_000,
      currentTimeMs: 1_080,
      isReleased: false,
      pressure: 0.62,
    };
    const result = recognizeStudioGestureChord({
      contacts: [activeStylus, makeTouchContact(1), makeTouchContact(2)],
      nowMs: 1_080,
    });

    expect(result.kind).toBe("palm-rejected-stylus-lock");
    expect(result.palmRejected).toBe(true);
    expect(result.activeStylusPointerId).toBe(10);
    expect(result.rejectedPointerIds).toEqual([1, 2]);
  });

  it("2. 펜을 뗀 직후 stylusActiveWithinMs 보호 구간 안의 터치는 잠그고, 구간 경과 후에는 정상 허용한다", () => {
    const chordContacts = [makeTouchContact(1), makeTouchContact(2)];

    const locked = recognizeStudioGestureChord({
      contacts: chordContacts,
      nowMs: 1_120,
      lastStylusActiveTimestampMs: 1_000,
      stylusActiveWithinMs: 180,
    });
    expect(locked.kind).toBe("palm-rejected-stylus-lock");
    expect(locked.palmRejected).toBe(true);

    const unlocked = recognizeStudioGestureChord({
      contacts: chordContacts,
      nowMs: 1_220,
      lastStylusActiveTimestampMs: 1_000,
      stylusActiveWithinMs: 180,
    });
    expect(unlocked.kind).toBe("two-finger-tap-undo");
    expect(unlocked.palmRejected).toBe(false);
  });

  it("3. 펜 입력이 없어도 접촉 반지름이 큰 손바닥 패드 터치는 오터치로 분류해 차단한다", () => {
    const res = recognizeStudioGestureChord({
      contacts: [
        makeTouchContact(7, { contactRadiusPx: 31 }),
        makeTouchContact(8, { contactRadiusPx: 9 }),
      ],
      nowMs: 2_000,
      palmContactRadiusThresholdPx: 24,
    });
    expect(res.kind).toBe("palm-rejected-stylus-lock");
    expect(res.palmRejected).toBe(true);
    expect(res.rejectedPointerIds).toEqual([7]);
  });

  it("4. 짧은 두 손가락 동시 탭을 직관적 한글 라벨과 함께 실행 취소(Undo)로 인식한다", () => {
    const res = recognizeStudioGestureChord({
      contacts: [makeTouchContact(1), makeTouchContact(2)],
      nowMs: 1_120,
    });
    expect(res.kind).toBe("two-finger-tap-undo");
    expect(res.labelKo).toBe("실행 취소");
    expect(res.palmRejected).toBe(false);
  });

  it("5. 짧은 세 손가락 동시 탭을 다시 실행(Redo)으로 정확히 분류한다", () => {
    const res = recognizeStudioGestureChord({
      contacts: [makeTouchContact(1), makeTouchContact(2), makeTouchContact(3)],
      nowMs: 1_130,
    });
    expect(res.kind).toBe("three-finger-tap-redo");
    expect(res.labelKo).toBe("다시 실행");
    expect(res.palmRejected).toBe(false);
  });

  it("6. 두 손가락 드래그·벌리기·비틀기 시 이동량·배율·회전각·피벗을 정밀 산출한다", () => {
    const first = makeTouchContact(1, {
      startX: 100,
      startY: 200,
      currentX: 130,
      currentY: 240,
      isReleased: false,
    });
    const second = makeTouchContact(2, {
      startX: 200,
      startY: 200,
      currentX: 130,
      currentY: 440,
      isReleased: false,
    });

    const res = recognizeStudioGestureChord({ contacts: [first, second], nowMs: 1_180 });
    expect(res.kind).toBe("two-finger-pinch-rotate-pan");
    expect(res.pinchRotatePan?.zoomScale).toBeCloseTo(2, 4);
    expect(res.pinchRotatePan?.rotationDeltaDeg).toBeCloseTo(90, 4);
    expect(res.pinchRotatePan?.pivotX).toBeCloseTo(130, 4);
    expect(res.pinchRotatePan?.pivotY).toBeCloseTo(340, 4);
    expect(res.pinchRotatePan?.panDeltaX).toBeCloseTo(-20, 4);
    expect(res.pinchRotatePan?.panDeltaY).toBeCloseTo(140, 4);
  });

  it("7. 원형 도구 메뉴는 호출자가 44px 미만을 요청해도 최소 44px 인체공학 데드존을 강제한다", () => {
    const insideFloor = resolveRadialPieSector({ dxPx: 43.5, dyPx: 0, deadzoneRadiusPx: 18 });
    expect(insideFloor.effectiveDeadzoneRadiusPx).toBe(MIN_RADIAL_DEADZONE_RADIUS_PX);
    expect(insideFloor.inDeadzone).toBe(true);
    expect(insideFloor.sectorIndex).toBeNull();

    const outsideFloor = resolveRadialPieSector({ dxPx: 45, dyPx: 0, deadzoneRadiusPx: 18 });
    expect(outsideFloor.inDeadzone).toBe(false);
    expect(outsideFloor.sectorIndex).toBe(0);
  });

  it("8. 8분할 원형 파이 메뉴가 0°..315° 전 방향 섹터와 무전문용어 한글 라벨을 일대일 매핑한다", () => {
    expect(DEFAULT_RADIAL_PIE_SECTORS).toHaveLength(8);
    for (let idx = 0; idx < 8; idx += 1) {
      const rad = ((idx * 45) * Math.PI) / 180;
      const resolved = resolveRadialPieSector({
        dxPx: Math.cos(rad) * 72,
        dyPx: Math.sin(rad) * 72,
      });
      expect(resolved.inDeadzone).toBe(false);
      expect(resolved.sectorIndex).toBe(idx);
      expect(resolved.sector?.labelKo.length).toBeGreaterThan(1);
    }
  });

  it("9. 원형 파이 메뉴의 각도·반경 히스테리시스가 경계(22.5° 및 44px) 근처 떨림을 억제한다", () => {
    const rad26 = (26 * Math.PI) / 180;
    const heldAngle = resolveRadialPieSector({
      dxPx: Math.cos(rad26) * 68,
      dyPx: Math.sin(rad26) * 68,
      previousSector: 0,
      angularHysteresisDeg: 8,
    });
    expect(heldAngle.sectorIndex).toBe(0);
    expect(heldAngle.hysteresisRetained).toBe(true);

    const rad34 = (34 * Math.PI) / 180;
    const switchedAngle = resolveRadialPieSector({
      dxPx: Math.cos(rad34) * 68,
      dyPx: Math.sin(rad34) * 68,
      previousSector: 0,
      angularHysteresisDeg: 8,
    });
    expect(switchedAngle.sectorIndex).toBe(1);

    const heldRadius = resolveRadialPieSector({
      dxPx: 41,
      dyPx: 0,
      previousSector: 0,
      radialHysteresisPx: 6,
    });
    expect(heldRadius.inDeadzone).toBe(false);
    expect(heldRadius.sectorIndex).toBe(0);
    expect(heldRadius.hysteresisRetained).toBe(true);

    const cancelledCenter = resolveRadialPieSector({
      dxPx: 32,
      dyPx: 0,
      previousSector: 0,
      radialHysteresisPx: 6,
    });
    expect(cancelledCenter.inDeadzone).toBe(true);
    expect(cancelledCenter.sectorIndex).toBeNull();
  });

  it("10. prefersReducedMotion 설정 시 전환 시간 0ms 및 변형 애니메이션 비활성 힌트를 반환한다", () => {
    const normalHint = buildMotionSafeTransitionHint(false);
    expect(normalHint.durationMs).toBe(150);
    expect(normalHint.animateTransform).toBe(true);
    expect(normalHint.activeScaleFactor).toBeCloseTo(0.98, 4);

    const reducedHint = buildMotionSafeTransitionHint(true);
    expect(reducedHint.durationMs).toBe(0);
    expect(reducedHint.cssTransitionProperty).toBe("none");
    expect(reducedHint.animateTransform).toBe(false);
    expect(reducedHint.activeScaleFactor).toBe(1);
  });

  it("11. 켈빈 색온도 변환이 6500K 백색 중립점을 보존하고 온도에 따라 청/적 비율이 단조 증가한다", () => {
    const neutral = kelvinToLinearRgbTint(NEUTRAL_DAYLIGHT_KELVIN);
    expect(neutral.r).toBeCloseTo(1, 5);
    expect(neutral.g).toBeCloseTo(1, 5);
    expect(neutral.b).toBeCloseTo(1, 5);

    const sunsetWarm = kelvinToLinearRgbTint(2_800);
    expect(sunsetWarm.r).toBeGreaterThan(sunsetWarm.g);
    expect(sunsetWarm.g).toBeGreaterThan(sunsetWarm.b);

    const moonlightCool = kelvinToLinearRgbTint(10_500);
    expect(moonlightCool.b).toBeGreaterThan(moonlightCool.g);
    expect(moonlightCool.g).toBeGreaterThan(moonlightCool.r);

    let prevBlueRedRatio = -1;
    for (const k of [2_000, 3_200, 4_800, 6_500, 8_500, 12_000, 16_000]) {
      const tint = kelvinToLinearRgbTint(k);
      const ratio = tint.b / tint.r;
      expect(ratio).toBeGreaterThan(prevBlueRedRatio);
      prevBlueRedRatio = ratio;
    }
  });

  it("12. 강렬한 노을광(2200K)과 달빛(11500K)에서도 피부 밑색 색상각 편차를 4° 이내로 고정한다", () => {
    const cutRegions: readonly CutFlatColorRegionInput[] = [
      { regionId: "rosy-face", labelKo: "장밋빛 피부", kind: "skin", baseSrgb: { r: 245, g: 192, b: 188 } },
      { regionId: "warm-hand", labelKo: "구릿빛 피부", kind: "skin", baseSrgb: { r: 198, g: 142, b: 112 } },
      { regionId: "white-shirt", labelKo: "흰색 셔츠 의상", kind: "costume", baseSrgb: { r: 232, g: 232, b: 236 } },
    ];

    for (const extremeKelvin of [2_200, 11_500]) {
      const report = harmonizeCutFlatColorsToKeyLight(cutRegions, {
        azimuthDeg: 135,
        elevationDeg: 28,
        keyKelvin: extremeKelvin,
        harmonizeStrength: 0.78,
      });

      expect(report.maxObservedSkinHueDriftDeg).toBeLessThanOrEqual(MAX_SKIN_TONE_HUE_DRIFT_DEG);
      let clampedCount = 0;
      for (const region of report.regions) {
        if (region.kind === "skin") {
          expect(region.oklchHueDriftDeg).toBeLessThanOrEqual(4);
          expect(region.srgbHueDriftDeg).toBeLessThanOrEqual(4);
          expect(region.baseHueDriftDeg).toBeLessThanOrEqual(4);
          if (region.skinHueClamped) clampedCount += 1;
        }
      }
      expect(clampedCount).toBeGreaterThanOrEqual(1);

      const shirt = report.regions.find((r) => r.regionId === "white-shirt");
      if (extremeKelvin < 4_000) {
        expect(shirt?.harmonizedBaseSrgb.r).toBeGreaterThan(shirt?.harmonizedBaseSrgb.b ?? 0);
      } else {
        expect(shirt?.harmonizedBaseSrgb.b).toBeGreaterThan(shirt?.harmonizedBaseSrgb.r ?? 255);
      }
    }
  });

  it("13. 컷 전체에 일관된 그림자·림라이트 각도와 명도 서열(셀 그림자 < 밑색 < 림라이트)을 생성한다", () => {
    const report = harmonizeCutFlatColorsToKeyLight(
      [
        { regionId: "cape", labelKo: "망토", kind: "costume", baseSrgb: { r: 88, g: 118, b: 186 } },
        { regionId: "bag", labelKo: "가죽 가방", kind: "prop", baseSrgb: { r: 152, g: 98, b: 64 } },
      ],
      { azimuthDeg: 40, elevationDeg: 32, keyKelvin: 5_200, ambientKelvin: 7_800 },
    );

    expect(report.rimEdgeAngleDeg).toBe(40);
    expect(report.shadowDirectionAngleDeg).toBe(220);

    for (const item of report.regions) {
      const shadowLuma = computeRelativeLuminance(item.celShadowSrgb);
      const baseLuma = computeRelativeLuminance(item.harmonizedBaseSrgb);
      const rimLuma = computeRelativeLuminance(item.rimLightSrgb);
      expect(shadowLuma).toBeLessThan(baseLuma);
      expect(rimLuma).toBeGreaterThan(baseLuma);
    }
  });

  it("14. 표면 법선 방향과 주광원 고도각에 따라 조도 및 림라이트 대비가 물리적으로 반응한다", () => {
    const facingLight: CutFlatColorRegionInput = {
      regionId: "lit-cheek",
      labelKo: "수광부 소품",
      kind: "prop",
      baseSrgb: { r: 165, g: 170, b: 176 },
      surfaceNormal: { azimuthDeg: 45, elevationDeg: 30 },
    };
    const facingAway: CutFlatColorRegionInput = {
      regionId: "back-cheek",
      labelKo: "배광부 소품",
      kind: "prop",
      baseSrgb: { r: 165, g: 170, b: 176 },
      surfaceNormal: { azimuthDeg: 225, elevationDeg: 30 },
    };

    const grazingReport = harmonizeCutFlatColorsToKeyLight([facingLight, facingAway], {
      azimuthDeg: 45,
      elevationDeg: 14,
      keyKelvin: 5_600,
      harmonizeStrength: 0.6,
    });
    const frontalReport = harmonizeCutFlatColorsToKeyLight([facingLight], {
      azimuthDeg: 45,
      elevationDeg: 85,
      keyKelvin: 5_600,
      harmonizeStrength: 0.6,
    });

    const litItem = grazingReport.regions[0];
    const awayItem = grazingReport.regions[1];
    const frontalItem = frontalReport.regions[0];
    expect(litItem?.incidenceCosine).toBeGreaterThan(awayItem?.incidenceCosine ?? 1);
    expect(computeRelativeLuminance(litItem?.harmonizedBaseSrgb ?? { r: 0, g: 0, b: 0 })).toBeGreaterThan(
      computeRelativeLuminance(awayItem?.harmonizedBaseSrgb ?? { r: 255, g: 255, b: 255 }),
    );

    const grazingRimGap =
      computeRelativeLuminance(litItem?.rimLightSrgb ?? { r: 0, g: 0, b: 0 }) -
      computeRelativeLuminance(litItem?.harmonizedBaseSrgb ?? { r: 0, g: 0, b: 0 });
    const frontalRimGap =
      computeRelativeLuminance(frontalItem?.rimLightSrgb ?? { r: 0, g: 0, b: 0 }) -
      computeRelativeLuminance(frontalItem?.harmonizedBaseSrgb ?? { r: 0, g: 0, b: 0 });
    expect(grazingRimGap).toBeGreaterThan(frontalRimGap);
  });

  it("15. 공간 브러시 오디오가 좌우 패닝(-1..1), 속도->주파수, 필압·거칠기->게인/Q를 정확히 매핑한다", () => {
    const slowSmoothLeft = computeSpatialBrushAudioParams({
      audioFeedbackEnabled: true,
      normalizedX: -1.6,
      normalizedY: -0.5,
      speedPxPerSec: 120,
      pressure: 0.25,
      paperGrainRoughness: 0.08,
    });
    const fastRoughRight = computeSpatialBrushAudioParams({
      audioFeedbackEnabled: true,
      normalizedX: 0.85,
      normalizedY: 0.75,
      speedPxPerSec: 1_400,
      pressure: 0.85,
      paperGrainRoughness: 0.92,
    });

    expect(slowSmoothLeft.stereoPan).toBe(-1);
    expect(fastRoughRight.stereoPan).toBeCloseTo(0.85, 5);
    expect(fastRoughRight.bandpassFrequencyHz).toBeGreaterThan(slowSmoothLeft.bandpassFrequencyHz);
    expect(fastRoughRight.bandpassQ).toBeLessThan(slowSmoothLeft.bandpassQ);
    expect(fastRoughRight.gainLinear).toBeGreaterThan(slowSmoothLeft.gainLinear);
    expect(fastRoughRight.gainLinear).toBeLessThanOrEqual(MAX_SPATIAL_BRUSH_GAIN_LINEAR);
    expect(fastRoughRight.verticalShelfGainDb).toBeGreaterThan(slowSmoothLeft.verticalShelfGainDb);
  });

  it("16. audioFeedbackEnabled가 꺼지거나 펜이 멈추면 잔향 없이 즉시 무음(gain=0)을 보장한다", () => {
    const muted = computeSpatialBrushAudioParams({
      audioFeedbackEnabled: false,
      normalizedX: 0.3,
      normalizedY: 0.2,
      speedPxPerSec: 1_800,
      pressure: 1,
      paperGrainRoughness: 1,
    });
    expect(muted.muted).toBe(true);
    expect(muted.gainLinear).toBe(0);
    expect(muted.smoothingTimeConstantSec).toBe(0);
    expect(muted.verticalShelfGainDb).toBe(0);

    const stationary = computeSpatialBrushAudioParams({
      audioFeedbackEnabled: true,
      normalizedX: 0,
      normalizedY: 0,
      speedPxPerSec: 0,
      pressure: 0.7,
      paperGrainRoughness: 0.5,
    });
    expect(stationary.muted).toBe(false);
    expect(stationary.isSilentStroke).toBe(true);
    expect(stationary.gainLinear).toBe(0);
  });

  it("17. 시선 보조 뷰포트는 중앙 데드존 안쪽의 미세 시선 흔들림에서 화면을 전혀 움직이지 않는다", () => {
    const viewport = { centerX: 500, centerY: 800, widthPx: 1_200, heightPx: 900, zoom: 1 };
    const plan = planGazeAssistedCanvasViewport({
      viewport,
      focusTarget: { canvasX: 610, canvasY: 880 },
      deadzoneViewportRatio: 0.2,
    });

    expect(plan.inDeadzone).toBe(true);
    expect(plan.transitionMode).toBe("hold-deadzone");
    expect(plan.nextCenterX).toBe(500);
    expect(plan.nextCenterY).toBe(800);
    expect(plan.nextZoom).toBe(1);
    expect(plan.screenStepPx).toBe(0);
  });

  it("18. 컷 읽기 앵커 스냅은 짧은 안구 스침을 무시하고 충분한 응시 시간 후에만 흔들림 없이 포획한다", () => {
    const anchors: readonly PanelReadingAnchor[] = [
      { anchorId: "cut-2-climax", labelKo: "2컷 대사 클로즈업", centerX: 900, centerY: 1_400, snapRadiusCanvas: 160 },
    ];
    const viewport = { centerX: 500, centerY: 800, widthPx: 1_000, heightPx: 800, zoom: 1 };

    const fleetingGlance = planGazeAssistedCanvasViewport({
      viewport,
      focusTarget: { canvasX: 910, canvasY: 1_390, dwellMs: 25 },
      panelAnchors: anchors,
      minAnchorSnapDwellMs: 110,
    });
    expect(fleetingGlance.snappedAnchorId).toBeNull();

    const steadyGaze = planGazeAssistedCanvasViewport({
      viewport,
      focusTarget: { canvasX: 910, canvasY: 1_390, dwellMs: 150 },
      panelAnchors: anchors,
      minAnchorSnapDwellMs: 110,
    });
    expect(steadyGaze.snappedAnchorId).toBe("cut-2-climax");
    expect(steadyGaze.snappedAnchorLabelKo).toBe("2컷 대사 클로즈업");
    expect(steadyGaze.transitionMode).toBe("anchor-glide-snap");
  });

  it("19. 원거리 시선 점프에서도 전정기관 보호 최대 속도를 넘지 않으며 오버슈트 없이 단조 수렴한다", () => {
    const anchor: PanelReadingAnchor = { anchorId: "cut-5-bottom", centerX: 500, centerY: 3_200, snapRadiusCanvas: 200 };
    let currentCenterY = 400;
    const maxSpeedPxPerSec = 600;
    const dtMs = 16;

    for (let frame = 0; frame < 12; frame += 1) {
      const step = planGazeAssistedCanvasViewport({
        viewport: { centerX: 500, centerY: currentCenterY, widthPx: 1_000, heightPx: 800, zoom: 1 },
        focusTarget: { canvasX: 500, canvasY: 3_200, dwellMs: 200 },
        panelAnchors: [anchor],
        maxPanSpeedScreenPxPerSec: maxSpeedPxPerSec,
        dtMs,
      });

      if (frame === 0) expect(step.vestibularSpeedClamped).toBe(true);
      expect(step.screenStepPx).toBeLessThanOrEqual(maxSpeedPxPerSec * (dtMs / 1_000) + 1e-6);
      expect(step.nextCenterY).toBeGreaterThan(currentCenterY);
      expect(step.nextCenterY).toBeLessThanOrEqual(anchor.centerY);
      expect(step.overshootPrevented).toBe(true);
      currentCenterY = step.nextCenterY;
    }
  });

  it("20. prefersReducedMotion 활성화 시 부유 커서 리드를 끄고 컷 읽기 앵커로 즉시 이산 점프한다", () => {
    const viewport = { centerX: 300, centerY: 300, widthPx: 1_000, heightPx: 800, zoom: 1.25 };
    const freeFloatAttempt = planGazeAssistedCanvasViewport({
      viewport,
      focusTarget: { canvasX: 950, canvasY: 900 },
      prefersReducedMotion: true,
    });
    expect(freeFloatAttempt.nextCenterX).toBe(300);
    expect(freeFloatAttempt.nextCenterY).toBe(300);
    expect(freeFloatAttempt.transitionDurationMs).toBe(0);

    const discreteSnap = planGazeAssistedCanvasViewport({
      viewport,
      focusTarget: { canvasX: 1_100, canvasY: 1_650, dwellMs: 160 },
      panelAnchors: [{ anchorId: "cut-next", centerX: 1_120, centerY: 1_640, snapRadiusCanvas: 180 }],
      prefersReducedMotion: true,
    });
    expect(discreteSnap.transitionMode).toBe("instant-discrete-snap");
    expect(discreteSnap.transitionDurationMs).toBe(0);
    expect(discreteSnap.nextCenterX).toBe(1_120);
    expect(discreteSnap.nextCenterY).toBe(1_640);
    expect(discreteSnap.nextZoom).toBe(1.25);
  });
});
