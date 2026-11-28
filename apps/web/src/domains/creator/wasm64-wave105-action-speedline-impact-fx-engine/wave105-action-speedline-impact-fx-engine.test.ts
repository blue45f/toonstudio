import { describe, expect, it } from "vitest";
import {
  buildActionImpactFxWgsl,
  doesPolygonIntrudeKeepOuts,
  doesSegmentIntrudeBalloonBox,
  doesSegmentIntrudeEllipse,
  escapeActionFxXml,
  generateFocalSafeActionSpeedlines,
  intersectRayAabb,
  intersectRayEllipse,
  isPointInsideBalloonBox,
  isPointInsideSafeEllipse,
  renderActionImpactFxSvg,
  summarizeActionImpactFxKo,
  synthesizeSwordSlashRibbonAndImpactFx,
  validateActionImpactFxWgsl,
  type ActionSpeedlineSpec,
  type BalloonKeepOutBox,
  type PanelRect,
  type SafeEllipse,
  type SpeedlineFieldMode,
  type SwordSlashSpec,
  type Vec2,
} from "./index";

const DEFAULT_PANEL: PanelRect = { x: 0, y: 0, width: 800, height: 600 };

const DEFAULT_SUBJECT: SafeEllipse = {
  cx: 400,
  cy: 300,
  rx: 120,
  ry: 145,
  marginPx: 8,
};

const MULTI_BALLOONS: readonly BalloonKeepOutBox[] = [
  { id: "balloon-top-left", x: 36, y: 32, width: 170, height: 96, paddingPx: 6 },
  { id: "balloon-top-right", x: 590, y: 40, width: 168, height: 112, paddingPx: 6 },
  { id: "balloon-bottom-left", x: 48, y: 452, width: 185, height: 100, paddingPx: 6 },
];

const CUBIC_SLASH_SPEC: SwordSlashSpec = {
  id: "hero-crescent-slash",
  curve: {
    p0: { x: 140, y: 455 },
    p1: { x: 245, y: 150 },
    p2: { x: 540, y: 110 },
    p3: { x: 690, y: 270 },
  },
  peakWidthPx: 46,
  entryTipWidthPx: 1,
  exitTipWidthPx: 0.5,
  velocityProfile: "crescent-arc",
  wakeStreakCount: 7,
  shockwaveRingCount: 3,
  shockwaveBaseRadiusPx: 42,
  crackRayCount: 10,
  afterimageCount: 4,
  flashContrastIntensity: 0.92,
  animatedShimmerRateHz: 18,
  seed: 10577,
};

const ALL_MODES: readonly SpeedlineFieldMode[] = [
  "radial-focus-burst",
  "directional-motion-blur",
  "curved-vortex-rush",
  "impact-flash-beta",
];

function assertAllVerticesFinite(vertices: readonly Vec2[]): void {
  expect(vertices.length).toBeGreaterThanOrEqual(3);
  for (const pt of vertices) {
    expect(Number.isFinite(pt.x)).toBe(true);
    expect(Number.isFinite(pt.y)).toBe(true);
  }
}

function independentlyVerifyZeroKeepOutIntrusion(
  polygons: readonly (readonly Vec2[])[],
  subject: SafeEllipse,
  balloons: readonly BalloonKeepOutBox[],
): void {
  for (const verts of polygons) {
    assertAllVerticesFinite(verts);
    expect(doesPolygonIntrudeKeepOuts(verts, subject, balloons)).toBe(false);
    for (let i = 0; i < verts.length; i += 1) {
      const curr = verts[i];
      const next = verts[(i + 1) % verts.length];
      expect(isPointInsideSafeEllipse(curr, subject)).toBe(false);
      expect(doesSegmentIntrudeEllipse(curr, next, subject)).toBe(false);
      for (const box of balloons) {
        expect(isPointInsideBalloonBox(curr, box)).toBe(false);
        expect(doesSegmentIntrudeBalloonBox(curr, next, box)).toBe(false);
      }
    }
  }
}

describe("Wave 105: 물리 기반 만화 집중선·속도선·검기 궤적·임팩트 VFX 생성 엔진", () => {
  it("1. 동일 시드에서 4종 속도선·집중선 모드가 비트 단위로 동일한 결과를 결정적으로 재현한다", () => {
    for (const mode of ALL_MODES) {
      const spec: ActionSpeedlineSpec = {
        mode,
        panel: DEFAULT_PANEL,
        subjectSafeEllipse: DEFAULT_SUBJECT,
        balloonKeepOutBoxes: MULTI_BALLOONS,
        directionDeg: 28,
        seed: 20261128,
      };
      const runA = generateFocalSafeActionSpeedlines(spec);
      const runB = generateFocalSafeActionSpeedlines(spec);
      const runDiffSeed = generateFocalSafeActionSpeedlines({ ...spec, seed: 20261129 });

      expect(runA).toEqual(runB);
      expect(runA.polygons).not.toEqual(runDiffSeed.polygons);
    }
  });

  it("2. 4종 모드 모두 NaN/Infinity 없는 유효한 테이퍼 잉크 폴리곤(끝단 0px)을 생성한다", () => {
    for (const mode of ALL_MODES) {
      const res = generateFocalSafeActionSpeedlines({
        mode,
        panel: DEFAULT_PANEL,
        subjectSafeEllipse: DEFAULT_SUBJECT,
        balloonKeepOutBoxes: MULTI_BALLOONS,
        directionDeg: 18,
        seed: 10501,
      });

      expect(res.polygons.length).toBeGreaterThanOrEqual(20);
      for (const poly of res.polygons) {
        assertAllVerticesFinite(poly.vertices);
        expect(poly.tipWidthPx).toBe(0);
        expect(poly.outerBaseWidthPx).toBeGreaterThan(0);
        expect(Number.isFinite(poly.lengthPx)).toBe(true);
        expect(poly.lengthPx).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it("3. radial-focus-burst는 주선·보조선 2단 G펜 바늘을 생성하며 외곽 기저 폭이 끝단보다 뚜렷하게 넓다", () => {
    const res = generateFocalSafeActionSpeedlines({
      mode: "radial-focus-burst",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      lineCount: 96,
      outerBaseWidthPx: 7.5,
      seed: 10503,
    });

    expect(res.metrics.primaryLineCount).toBeGreaterThan(8);
    expect(res.metrics.secondaryLineCount).toBeGreaterThan(20);
    const primaryWidths = res.polygons.filter((p) => p.tier === "primary").map((p) => p.outerBaseWidthPx);
    const secondaryWidths = res.polygons.filter((p) => p.tier === "secondary").map((p) => p.outerBaseWidthPx);
    const avgPrimary = primaryWidths.reduce((a, b) => a + b, 0) / primaryWidths.length;
    const avgSecondary = secondaryWidths.reduce((a, b) => a + b, 0) / secondaryWidths.length;
    expect(avgPrimary).toBeGreaterThan(avgSecondary * 1.4);
  });

  it("4. radial-focus-burst에서 모든 폴리곤 정점과 변이 subjectSafeEllipse를 0건 침범한다", () => {
    const res = generateFocalSafeActionSpeedlines({
      mode: "radial-focus-burst",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      lineCount: 120,
      outerBaseWidthPx: 9,
      seed: 10504,
    });

    expect(res.metrics.keepOutIntrusionCount).toBe(0);
    expect(res.metrics.subjectCarvedLineCount).toBeGreaterThan(60);
    independentlyVerifyZeroKeepOutIntrusion(
      res.polygons.map((p) => p.vertices),
      DEFAULT_SUBJECT,
      [],
    );
  });

  it("5. radial-focus-burst에서 다중 말풍선 금지 영역을 정밀 클리핑하여 침범 0건을 보장한다", () => {
    const res = generateFocalSafeActionSpeedlines({
      mode: "radial-focus-burst",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      balloonKeepOutBoxes: MULTI_BALLOONS,
      lineCount: 120,
      outerBaseWidthPx: 8.5,
      seed: 10505,
    });

    expect(res.metrics.keepOutIntrusionCount).toBe(0);
    expect(res.metrics.balloonClippedLineCount).toBeGreaterThan(10);
    independentlyVerifyZeroKeepOutIntrusion(
      res.polygons.map((p) => p.vertices),
      DEFAULT_SUBJECT,
      MULTI_BALLOONS,
    );
  });

  it("6. 손펜 유기적 각도 군집 리듬: 인접 각도 분산이 양수이고 360도 4사분면을 고르게 덮는다", () => {
    const res = generateFocalSafeActionSpeedlines({
      mode: "radial-focus-burst",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      lineCount: 96,
      clusterCount: 16,
      seed: 10506,
    });

    expect(res.metrics.adjacentSpacingVariance).toBeGreaterThan(0.0001);
    expect(res.metrics.angularEntropyScore).toBeGreaterThan(0.3);
    const total = res.metrics.totalLineCount;
    for (const qCount of res.metrics.quadrantCounts) {
      expect(qCount).toBeGreaterThanOrEqual(Math.floor(total * 0.18));
    }
  });

  it("7. directional-motion-blur는 임의 각도 directionDeg에 대해 내적 공선성 0.999 초과로 정렬된다", () => {
    const angles = [0, 37, 135, -25];
    for (const directionDeg of angles) {
      const res = generateFocalSafeActionSpeedlines({
        mode: "directional-motion-blur",
        panel: DEFAULT_PANEL,
        subjectSafeEllipse: DEFAULT_SUBJECT,
        balloonKeepOutBoxes: MULTI_BALLOONS,
        directionDeg,
        perspectiveConvergeStrength: 0,
        lineCount: 64,
        seed: 10507 + Math.abs(directionDeg),
      });

      expect(res.polygons.length).toBeGreaterThan(24);
      expect(res.metrics.directionalCollinearityMin).toBeGreaterThan(0.999);
      const rad = (directionDeg * Math.PI) / 180;
      const targetDir = { x: Math.cos(rad), y: Math.sin(rad) };
      for (const poly of res.polygons) {
        const vx = poly.startPoint.x - poly.endPoint.x;
        const vy = poly.startPoint.y - poly.endPoint.y;
        const len = Math.hypot(vx, vy);
        const dotAbs = Math.abs((vx / len) * targetDir.x + (vy / len) * targetDir.y);
        expect(dotAbs).toBeGreaterThan(0.999);
      }
    }
  });

  it("8. directional-motion-blur가 중앙 인물 타원과 복수 말풍선을 모두 침범 0건으로 분할 절삭한다", () => {
    const res = generateFocalSafeActionSpeedlines({
      mode: "directional-motion-blur",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      balloonKeepOutBoxes: MULTI_BALLOONS,
      directionDeg: -14,
      lineCount: 72,
      seed: 10508,
    });

    expect(res.metrics.keepOutIntrusionCount).toBe(0);
    expect(res.metrics.subjectCarvedLineCount).toBeGreaterThan(10);
    expect(res.metrics.balloonClippedLineCount).toBeGreaterThan(8);
    independentlyVerifyZeroKeepOutIntrusion(
      res.polygons.map((p) => p.vertices),
      DEFAULT_SUBJECT,
      MULTI_BALLOONS,
    );
  });

  it("9. directional-motion-blur에서 perspectiveConvergeStrength > 0 적용 시에도 안전 영역 침범 0건을 유지한다", () => {
    const res = generateFocalSafeActionSpeedlines({
      mode: "directional-motion-blur",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      balloonKeepOutBoxes: MULTI_BALLOONS,
      directionDeg: 10,
      perspectiveConvergeStrength: 0.3,
      lineCount: 60,
      seed: 10509,
    });

    expect(res.metrics.keepOutIntrusionCount).toBe(0);
    expect(res.metrics.directionalCollinearityMin).toBeLessThan(0.999);
    independentlyVerifyZeroKeepOutIntrusion(
      res.polygons.map((p) => p.vertices),
      DEFAULT_SUBJECT,
      MULTI_BALLOONS,
    );
  });

  it("10. curved-vortex-rush는 다정점 소용돌이 곡선 리본을 생성하며 인물·말풍선 침범이 0건이다", () => {
    const res = generateFocalSafeActionSpeedlines({
      mode: "curved-vortex-rush",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      balloonKeepOutBoxes: MULTI_BALLOONS,
      vortexSwirlRad: 0.55,
      lineCount: 76,
      seed: 10510,
    });

    expect(res.polygons.length).toBeGreaterThan(30);
    expect(res.metrics.keepOutIntrusionCount).toBe(0);
    for (const poly of res.polygons) {
      expect(poly.vertices.length).toBeGreaterThanOrEqual(5);
    }
    independentlyVerifyZeroKeepOutIntrusion(
      res.polygons.map((p) => p.vertices),
      DEFAULT_SUBJECT,
      MULTI_BALLOONS,
    );
  });

  it("11. curved-vortex-rush에서 vortexSwirlRad 부호를 반전하면 소용돌이 회전 방향이 결정적으로 반전된다", () => {
    const cw = generateFocalSafeActionSpeedlines({
      mode: "curved-vortex-rush",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      vortexSwirlRad: 0.6,
      lineCount: 48,
      seed: 10511,
    });
    const ccw = generateFocalSafeActionSpeedlines({
      mode: "curved-vortex-rush",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      vortexSwirlRad: -0.6,
      lineCount: 48,
      seed: 10511,
    });

    expect(cw.polygons.length).toBeGreaterThan(20);
    expect(ccw.polygons.length).toBeGreaterThan(20);
    expect(cw.polygons[0].startPoint).not.toEqual(ccw.polygons[0].startPoint);
  });

  it("12. impact-flash-beta는 외곽 흑백 베타 링과 날카로운 내부 가시를 침범 0건으로 생성한다", () => {
    const res = generateFocalSafeActionSpeedlines({
      mode: "impact-flash-beta",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      balloonKeepOutBoxes: MULTI_BALLOONS,
      lineCount: 92,
      flashRingThicknessRatio: 0.2,
      seed: 10512,
    });

    expect(res.outerBetaRingPolygons.length).toBeGreaterThan(20);
    expect(res.metrics.flashSpikeCount).toBeGreaterThan(20);
    expect(res.metrics.keepOutIntrusionCount).toBe(0);
    independentlyVerifyZeroKeepOutIntrusion(
      [...res.polygons.map((p) => p.vertices), ...res.outerBetaRingPolygons],
      DEFAULT_SUBJECT,
      MULTI_BALLOONS,
    );
  });

  it("13. 초점(focalPoint)이 인물 안전 타원 바깥으로 크게 치우쳐도 침범 0건을 유지한다", () => {
    const res = generateFocalSafeActionSpeedlines({
      mode: "radial-focus-burst",
      panel: DEFAULT_PANEL,
      focalPoint: { x: 110, y: 120 },
      subjectSafeEllipse: { cx: 520, cy: 360, rx: 115, ry: 135, marginPx: 6 },
      balloonKeepOutBoxes: MULTI_BALLOONS,
      lineCount: 84,
      seed: 10513,
    });

    expect(res.polygons.length).toBeGreaterThan(30);
    expect(res.metrics.keepOutIntrusionCount).toBe(0);
    independentlyVerifyZeroKeepOutIntrusion(
      res.polygons.map((p) => p.vertices),
      { cx: 520, cy: 360, rx: 115, ry: 135, marginPx: 6 },
      MULTI_BALLOONS,
    );
  });

  it("14. 말풍선이 인물 안전 타원 경계와 겹치는 극한 배치에서도 침범 0건으로 안전 절삭한다", () => {
    const overlappingBalloons: readonly BalloonKeepOutBox[] = [
      { id: "overlap-1", x: 470, y: 190, width: 170, height: 120, paddingPx: 6 },
      { id: "overlap-2", x: 180, y: 340, width: 150, height: 110, paddingPx: 6 },
    ];
    for (const mode of ALL_MODES) {
      const res = generateFocalSafeActionSpeedlines({
        mode,
        panel: DEFAULT_PANEL,
        subjectSafeEllipse: DEFAULT_SUBJECT,
        balloonKeepOutBoxes: overlappingBalloons,
        directionDeg: 33,
        seed: 10514,
      });
      expect(res.metrics.keepOutIntrusionCount).toBe(0);
      independentlyVerifyZeroKeepOutIntrusion(
        [...res.polygons.map((p) => p.vertices), ...res.outerBetaRingPolygons],
        DEFAULT_SUBJECT,
        overlappingBalloons,
      );
    }
  });

  it("15. 비정상 수치(NaN 시드, 0폭 말풍선, 음수 지터)가 입력되어도 예외나 NaN 없이 복구한다", () => {
    const res = generateFocalSafeActionSpeedlines({
      mode: "radial-focus-burst",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      balloonKeepOutBoxes: [{ id: "degenerate", x: 100, y: 100, width: 0, height: -20 }],
      innerArrivalJitterPx: -50,
      seed: Number.NaN,
    });

    expect(res.polygons.length).toBeGreaterThan(20);
    expect(res.metrics.keepOutIntrusionCount).toBe(0);
    for (const poly of res.polygons) {
      assertAllVerticesFinite(poly.vertices);
    }
  });

  it("16. 정밀 기하 교차 함수 intersectRayEllipse와 intersectRayAabb가 해석적 거리를 정확히 반환한다", () => {
    const ellHit = intersectRayEllipse(
      { x: 400, y: 300 },
      { x: 1, y: 0 },
      { cx: 400, cy: 300, rx: 100, ry: 50 },
    );
    expect(ellHit).not.toBeNull();
    expect(ellHit?.start).toBeCloseTo(-100, 6);
    expect(ellHit?.end).toBeCloseTo(100, 6);

    const aabbHit = intersectRayAabb({ x: 0, y: 50 }, { x: 1, y: 0 }, 120, 20, 220, 80);
    expect(aabbHit).not.toBeNull();
    expect(aabbHit?.start).toBeCloseTo(120, 6);
    expect(aabbHit?.end).toBeCloseTo(220, 6);

    const aabbMiss = intersectRayAabb({ x: 0, y: 5 }, { x: 1, y: 0 }, 120, 20, 220, 80);
    expect(aabbMiss).toBeNull();
  });

  it("17. 3차 베지어 검기 궤적 리본이 닫힌 유한 폴리곤을 생성하고 중앙 폭이 양 끝단보다 뚜렷하게 넓다", () => {
    const fx = synthesizeSwordSlashRibbonAndImpactFx(CUBIC_SLASH_SPEC);

    expect(fx.curveDegree).toBe(3);
    assertAllVerticesFinite(fx.closedPolygon);
    expect(fx.outerArc.length).toBe(fx.innerArc.length);
    expect(fx.closedPolygon.length).toBe(fx.outerArc.length + fx.innerArc.length);
    expect(fx.metrics.peakBellyWidthPx).toBeGreaterThan(fx.metrics.entryWidthPx * 10);
    expect(fx.metrics.peakBellyWidthPx).toBeGreaterThan(fx.metrics.exitWidthPx * 10);
    expect(fx.metrics.arcLengthPx).toBeGreaterThan(400);
  });

  it("18. 2차 베지어 곡선(p3 생략)으로도 유효한 검기 초승달 리본을 합성한다", () => {
    const quadFx = synthesizeSwordSlashRibbonAndImpactFx({
      curve: {
        p0: { x: 120, y: 420 },
        p1: { x: 380, y: 90 },
        p2: { x: 660, y: 310 },
      },
      peakWidthPx: 38,
      seed: 10518,
    });

    expect(quadFx.curveDegree).toBe(2);
    assertAllVerticesFinite(quadFx.closedPolygon);
    expect(quadFx.metrics.peakBellyWidthPx).toBeGreaterThan(34);
    expect(quadFx.metrics.peakBellyWidthPx).toBeGreaterThan(quadFx.metrics.entryWidthPx * 8);
  });

  it("19. 검기 속도 프로파일(heavy-cleave vs whip-snap)에 따라 최대 두께 위치(peakU)가 물리적으로 이동한다", () => {
    const heavy = synthesizeSwordSlashRibbonAndImpactFx({
      ...CUBIC_SLASH_SPEC,
      velocityProfile: "heavy-cleave",
    });
    const whip = synthesizeSwordSlashRibbonAndImpactFx({
      ...CUBIC_SLASH_SPEC,
      velocityProfile: "whip-snap",
    });

    expect(heavy.metrics.peakU).toBeLessThan(0.48);
    expect(whip.metrics.peakU).toBeGreaterThan(0.6);
    expect(whip.metrics.peakU).toBeGreaterThan(heavy.metrics.peakU + 0.15);
  });

  it("20. 검기 후류 선(trailingStreakLines)이 국소 곡선 접선 방향을 높은 정렬도로 추종한다", () => {
    const fx = synthesizeSwordSlashRibbonAndImpactFx(CUBIC_SLASH_SPEC);

    expect(fx.trailingStreakLines.length).toBe(7);
    expect(fx.metrics.meanWakeTangentAlignment).toBeGreaterThan(0.95);
    for (const streak of fx.trailingStreakLines) {
      expect(streak.points.length).toBe(3);
      expect(streak.dotAlignment).toBeGreaterThan(0.92);
      for (const pt of streak.points) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  it("21. 충격파 링 반경이 단조 증가하고 파열 균열 폴리라인이 충돌점에서 방사형으로 뻗는다", () => {
    const fx = synthesizeSwordSlashRibbonAndImpactFx(CUBIC_SLASH_SPEC);

    expect(fx.shockwaveRings.length).toBe(3);
    for (let i = 1; i < fx.shockwaveRings.length; i += 1) {
      expect(fx.shockwaveRings[i].radiusPx).toBeGreaterThan(fx.shockwaveRings[i - 1].radiusPx);
      expect(fx.shockwaveRings[i].strokeWidthPx).toBeLessThanOrEqual(fx.shockwaveRings[i - 1].strokeWidthPx);
    }

    expect(fx.fractureCracks.length).toBe(10);
    for (const crack of fx.fractureCracks) {
      expect(crack.points[0]).toEqual(fx.impactPoint);
      expect(crack.points.length).toBeGreaterThanOrEqual(5);
      for (const pt of crack.points) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  it("22. 잔상 모션 고스트(afterimageGhosts)의 불투명도가 지수적으로 엄격 단조 감소한다", () => {
    const fx = synthesizeSwordSlashRibbonAndImpactFx(CUBIC_SLASH_SPEC);

    expect(fx.afterimageGhosts.length).toBe(4);
    for (let i = 0; i < fx.afterimageGhosts.length; i += 1) {
      const ghost = fx.afterimageGhosts[i];
      expect(ghost.opacity).toBeGreaterThan(0);
      expect(ghost.opacity).toBeLessThan(1);
      assertAllVerticesFinite(ghost.closedPolygon);
      if (i > 0) {
        expect(ghost.opacity).toBeLessThan(fx.afterimageGhosts[i - 1].opacity);
        expect(ghost.lagFactor).toBeGreaterThan(fx.afterimageGhosts[i - 1].lagFactor);
      }
    }
  });

  it("23. prefersReducedMotion: true 적용 시 점멸률 0Hz, 플래시 대비 상한 제한, 정적 임팩트 레이아웃을 보장한다", () => {
    const reduced = synthesizeSwordSlashRibbonAndImpactFx(CUBIC_SLASH_SPEC, {
      prefersReducedMotion: true,
    });

    expect(reduced.motionSafety.prefersReducedMotion).toBe(true);
    expect(reduced.motionSafety.animatedShimmerRate).toBe(0);
    expect(reduced.motionSafety.effectiveFlashContrast).toBeLessThanOrEqual(0.35);
    expect(reduced.motionSafety.staticGraphicLayout).toBe(true);
    expect(reduced.motionSafety.afterimageRenderMode).toBe("static-echo");
    expect(reduced.closedPolygon.length).toBeGreaterThan(16);
    expect(reduced.shockwaveRings.length).toBe(3);
  });

  it("24. 기본 모션 모드(prefersReducedMotion: false)에서는 요청한 점멸률과 플래시 대비를 그대로 유지한다", () => {
    const normal = synthesizeSwordSlashRibbonAndImpactFx(CUBIC_SLASH_SPEC, {
      prefersReducedMotion: false,
    });

    expect(normal.motionSafety.prefersReducedMotion).toBe(false);
    expect(normal.motionSafety.animatedShimmerRate).toBe(18);
    expect(normal.motionSafety.effectiveFlashContrast).toBeCloseTo(0.92, 6);
    expect(normal.motionSafety.staticGraphicLayout).toBe(false);
    expect(normal.motionSafety.afterimageRenderMode).toBe("motion-trail");
  });

  it("25. 4종 속도선 모드 모두 WebGPU WGSL 셰이더 생성과 구조 검증을 오류 0건으로 통과한다", () => {
    for (const mode of ALL_MODES) {
      const artifact = buildActionImpactFxWgsl(mode);
      const report = validateActionImpactFxWgsl(artifact);

      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(artifact.uniformBufferByteLength % 16).toBe(0);
      expect(artifact.bindings.length).toBe(4);
      expect(artifact.entryPoints).toEqual([
        "cs_carve_action_speedlines",
        "fs_action_impact_composite",
      ]);
    }
  });

  it("26. WebGPU WGSL 저모션 옵션(prefersReducedMotion: true)이 점멸 0배수·대비 0.35 상한을 셰이더에 내장한다", () => {
    const artifact = buildActionImpactFxWgsl("radial-focus-burst", { prefersReducedMotion: true });
    const report = validateActionImpactFxWgsl(artifact);

    expect(report.valid).toBe(true);
    expect(artifact.prefersReducedMotion).toBe(true);
    expect(artifact.wgsl).toContain("u_fx.motion_safety_and_slash.x * 0.0");
    expect(artifact.wgsl).toContain("min(u_fx.motion_safety_and_slash.y, 0.35)");
  });

  it("27. WGSL 검증기가 중괄호 불균형·비정렬 유니폼·NaN 리터럴·바인딩 누락을 정확히 적발한다", () => {
    const base = buildActionImpactFxWgsl("radial-focus-burst");
    const broken = validateActionImpactFxWgsl({
      ...base,
      uniformBufferByteLength: 100,
      wgsl: base.wgsl.replace("@group(0) @binding(2)", "").replace("return vec4<f32>", "return NaN; { vec4<f32>"),
    });

    expect(broken.valid).toBe(false);
    expect(broken.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("28. renderActionImpactFxSvg가 NaN/Infinity 및 원시 hex/rgb 없이 100% OKLCH 고대비 SVG를 출력한다", () => {
    const speedlineField = generateFocalSafeActionSpeedlines({
      mode: "impact-flash-beta",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      balloonKeepOutBoxes: MULTI_BALLOONS,
      seed: 10528,
    });
    const slashFx = synthesizeSwordSlashRibbonAndImpactFx(CUBIC_SLASH_SPEC);
    const svg = renderActionImpactFxSvg({
      title: "결전 베기 컷",
      speedlineField,
      slashFx,
      theme: "print-high-contrast",
    });

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).toContain('data-layer="outer-beta-ring"');
    expect(svg).toContain('data-layer="sword-slash-ribbon"');
    expect(svg).toContain('data-layer="slash-shockwaves-and-cracks"');
  });

  it("29. renderActionImpactFxSvg가 XML 특수문자를 안전 이스케이프하고 studio-dark 테마도 OKLCH만 사용한다", () => {
    const hostileBalloons: readonly BalloonKeepOutBox[] = [
      { id: '<script>"&\'balloon</script>', x: 40, y: 40, width: 140, height: 80 },
    ];
    const speedlineField = generateFocalSafeActionSpeedlines({
      mode: "curved-vortex-rush",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      balloonKeepOutBoxes: hostileBalloons,
      seed: 10529,
    });
    const svg = renderActionImpactFxSvg({
      title: `검기 <격돌> & "섬광" '컷'`,
      speedlineField,
      theme: "studio-dark",
    });

    expect(escapeActionFxXml(`<a&"'>`)).toBe("&lt;a&amp;&quot;&apos;&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&lt;격돌&gt;");
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
  });

  it("30. summarizeActionImpactFxKo가 번역투 없는 자연 한국어로 연출 모드·침범 0건·군집 리듬·저모션 상태를 보고한다", () => {
    const speedlineField = generateFocalSafeActionSpeedlines({
      mode: "radial-focus-burst",
      panel: DEFAULT_PANEL,
      subjectSafeEllipse: DEFAULT_SUBJECT,
      balloonKeepOutBoxes: MULTI_BALLOONS,
      seed: 10530,
    });
    const slashFx = synthesizeSwordSlashRibbonAndImpactFx(CUBIC_SLASH_SPEC, {
      prefersReducedMotion: true,
    });
    const wgslArtifact = buildActionImpactFxWgsl("radial-focus-burst", {
      prefersReducedMotion: true,
    });
    const report = summarizeActionImpactFxKo({
      title: "클라이맥스 일격",
      speedlineField,
      slashFx,
      wgslArtifact,
    });

    expect(report.mode).toBe("radial-focus-burst");
    expect(report.modeLabelKo).toBe("방사형 G펜 집중선");
    expect(report.keepOutIntrusionCount).toBe(0);
    expect(report.reducedMotionSafe).toBe(true);
    expect(report.headlineKo).toContain("침범 0건");
    expect(report.summaryParagraphKo).toContain("침범 0건");
    expect(report.summaryParagraphKo).toContain("저모션 안전 모드");
    expect(report.checklistKo.length).toBeGreaterThanOrEqual(6);

    const fullText = `${report.headlineKo} ${report.summaryParagraphKo} ${report.checklistKo.join(" ")}`;
    expect(fullText).not.toContain("하는 것을 가능하게 합니다");
    expect(fullText).not.toContain("직관적인 경험을 제공합니다");
    expect(fullText).not.toContain("원활한 워크플로우를 보장합니다");
  });
});
