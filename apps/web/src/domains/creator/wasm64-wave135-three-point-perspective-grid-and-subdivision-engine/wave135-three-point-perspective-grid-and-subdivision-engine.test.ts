import { describe, expect, it } from "vitest";
import {
  PERSPECTIVE_GRID_UNIFORM_ALIGNMENT,
  PERSPECTIVE_GRID_UNIFORM_BYTE_SIZE,
  applyHomography,
  buildPerspectiveGridWgsl,
  buildPerspectiveStaircase,
  computeCollinearCrossRatio2D,
  computeCrossRatio1D,
  computeHomographyNormalizedDlt,
  computePerspectiveRigFingerprint,
  computeSegmentToVpAngleErrorDeg,
  escapePerspectiveXml,
  estimateVanishingPointsFromGuides,
  invertHomography3x3,
  isConvexNonDegenerateQuad,
  packPerspectiveGridUniforms,
  projectWorldPointToCanvas,
  renderThreePointPerspectiveSvg,
  sha256PerspectiveHex,
  snapStrokeToPerspectiveRuler,
  solveThreePointPerspectiveRig,
  subdividePerspectiveQuad,
  summarizeThreePointPerspectiveKo,
  validatePerspectiveGridWgsl,
  verifyOrthocenterPrincipalPoint,
  type BrushStrokePoint,
  type GuideSegment2D,
  type PerspectiveAxisId,
  type PerspectiveQuad2D,
  type ThreePointPerspectiveRig,
  type VanishingPoint2D,
  type Vec2D,
} from "./index";

function makeRaysTowardVp(
  vp: VanishingPoint2D,
  seeds: readonly Vec2D[],
  lengthPx: number,
  angleNoiseDegFn: (idx: number) => number,
  prefix: string,
  axisHint?: PerspectiveAxisId | "auto",
): GuideSegment2D[] {
  return seeds.map((p, i) => {
    const baseDx = vp.isFinite ? vp.x - p.x : vp.direction2d.x;
    const baseDy = vp.isFinite ? vp.y - p.y : vp.direction2d.y;
    const angle = Math.atan2(baseDy, baseDx) + (angleNoiseDegFn(i) * Math.PI) / 180;
    const half = lengthPx * 0.5;
    return {
      id: `${prefix}-${String(i)}`,
      x1: p.x - Math.cos(angle) * half,
      y1: p.y - Math.sin(angle) * half,
      x2: p.x + Math.cos(angle) * half,
      y2: p.y + Math.sin(angle) * half,
      ...(axisHint !== undefined ? { axisHint } : {}),
    };
  });
}

function projectFacadeQuad(rig: ThreePointPerspectiveRig): PerspectiveQuad2D {
  const tl = projectWorldPointToCanvas(rig, { x: -1.8, y: 2.2, z: 5.5 });
  const tr = projectWorldPointToCanvas(rig, { x: 1.4, y: 2.2, z: 5.5 });
  const br = projectWorldPointToCanvas(rig, { x: 1.4, y: -1.4, z: 5.5 });
  const bl = projectWorldPointToCanvas(rig, { x: -1.8, y: -1.4, z: 5.5 });
  return {
    tl: { x: tl.x, y: tl.y },
    tr: { x: tr.x, y: tr.y },
    br: { x: br.x, y: br.y },
    bl: { x: bl.x, y: bl.y },
  };
}

describe("Wave 135 — 3점 투시 자동 그리드·소실점 역추정 & 원근 등분할 엔진", () => {
  describe("1. 3D 핀홀 카메라 3점 투시 리깅 및 수심=주점 기하 검증", () => {
    it("앙각(+pitch) 구도에서 천정 VP3가 지평선 위쪽에 놓이고 VP1·VP2가 지평선 위에 정렬된다", () => {
      const rig = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 35, yawDeg: 36, pitchDeg: 22, rollDeg: 0,
      });
      expect(rig.mode).toBe("3-point");
      expect(rig.vp1.isFinite && rig.vp2.isFinite && rig.vp3.isFinite).toBe(true);
      expect(rig.vp1.x).toBeLessThan(rig.principalPoint.x);
      expect(rig.vp2.x).toBeGreaterThan(rig.principalPoint.x);
      expect(rig.horizonLine.yAtCenterX ?? 0).toBeGreaterThan(rig.principalPoint.y);
      expect(rig.vp3.y).toBeLessThan(rig.principalPoint.y);
      const h = rig.horizonLine;
      expect(Math.abs(h.a * rig.vp1.x + h.b * rig.vp1.y + h.c)).toBeLessThan(1e-8);
      expect(Math.abs(h.a * rig.vp2.x + h.b * rig.vp2.y + h.c)).toBeLessThan(1e-8);
    });

    it("부감(-pitch) 구도에서 지하 VP3가 지평선 아래쪽에 놓이고 지평선이 중앙 위쪽으로 올라간다", () => {
      const rig = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 45, yawDeg: 32, pitchDeg: -26,
      });
      expect(rig.mode).toBe("3-point");
      expect(rig.horizonLine.yAtCenterX ?? 9999).toBeLessThan(rig.principalPoint.y);
      expect(rig.vp3.y).toBeGreaterThan(rig.principalPoint.y);
      expect(rig.orthocenterCheck.valid).toBe(true);
      expect(rig.orthocenterCheck.errorPx).toBeLessThan(1e-7);
    });

    it("더치 롤(rollDeg=14°) 적용 시 지평선 기울기가 정확히 14°이고 VP1·VP2가 지평선에 유지된다", () => {
      const rig = solveThreePointPerspectiveRig({
        canvasWidth: 1000, canvasHeight: 750, focalLengthMm: 40, yawDeg: 40, pitchDeg: -18, rollDeg: 14,
      });
      expect(Math.abs(rig.horizonLine.tiltDeg - 14)).toBeLessThan(1e-7);
      const h = rig.horizonLine;
      expect(Math.abs(h.a * rig.vp1.x + h.b * rig.vp1.y + h.c)).toBeLessThan(1e-7);
      expect(Math.abs(h.a * rig.vp2.x + h.b * rig.vp2.y + h.c)).toBeLessThan(1e-7);
      expect(rig.orthocenterCheck.errorPx).toBeLessThan(1e-7);
    });

    it("pitch=0°인 2점 투시에서는 VP3가 무한 수직 소실점으로 처리되고 수심 검증은 비적용이다", () => {
      const rig = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 50, yawDeg: 35, pitchDeg: 0,
      });
      expect(rig.mode).toBe("2-point");
      expect(rig.vp1.isFinite && rig.vp2.isFinite).toBe(true);
      expect(rig.vp3.isFinite).toBe(false);
      expect(Math.abs(rig.vp3.direction2d.x)).toBeLessThan(1e-9);
      expect(Math.abs(Math.abs(rig.vp3.direction2d.y) - 1)).toBeLessThan(1e-9);
      expect(rig.orthocenterCheck.applicable).toBe(false);
    });

    it("yaw=0°, pitch=0°인 1점 투시에서는 정면 소실점 하나만 유한하고 주점과 일치한다", () => {
      const rig = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 35, yawDeg: 0, pitchDeg: 0,
      });
      expect(rig.mode).toBe("1-point");
      expect(rig.vp1.isFinite).toBe(false);
      expect(rig.vp2.isFinite).toBe(true);
      expect(rig.vp3.isFinite).toBe(false);
      expect(Math.hypot(rig.vp2.x - rig.principalPoint.x, rig.vp2.y - rig.principalPoint.y)).toBeLessThan(1e-8);
    });

    it("주점 오프셋을 포함한 다양한 3점 각도에서 수심=주점 및 초점거리 복원이 1e-6px 이내다", () => {
      const configs = [
        { yawDeg: 25, pitchDeg: 18, rollDeg: -6, focalLengthMm: 28, ox: 40, oy: -25 },
        { yawDeg: -42, pitchDeg: -30, rollDeg: 9, focalLengthMm: 50, ox: -55, oy: 30 },
        { yawDeg: 58, pitchDeg: 34, rollDeg: 0, focalLengthMm: 35, ox: 0, oy: 0 },
      ];
      for (let i = 0; i < configs.length; i += 1) {
        const cfg = configs[i];
        const rig = solveThreePointPerspectiveRig({
          canvasWidth: 1280, canvasHeight: 720, focalLengthMm: cfg.focalLengthMm,
          yawDeg: cfg.yawDeg, pitchDeg: cfg.pitchDeg, rollDeg: cfg.rollDeg,
          principalPointOffsetPx: { x: cfg.ox, y: cfg.oy },
        });
        expect(rig.orthocenterCheck.isAcuteTriangle && rig.orthocenterCheck.valid).toBe(true);
        expect(rig.orthocenterCheck.errorPx).toBeLessThan(1e-6);
        expect(rig.orthocenterCheck.focalLengthMismatchPx ?? 999).toBeLessThan(1e-6);
      }
    });

    it("둔각 삼각형을 이루는 물리적으로 불가능한 3점 소실점 배치는 수심 검증에서 기각된다", () => {
      const mkVp = (id: PerspectiveAxisId, x: number, y: number): VanishingPoint2D => ({
        id, worldAxis: id === "VP3" ? "Y" : id === "VP1" ? "X" : "Z", x, y,
        isFinite: true, direction2d: { x: 1, y: 0 }, homogeneous: [x, y, 1],
        distanceFromPrincipalPx: Math.hypot(x - 600, y - 400),
      });
      const check = verifyOrthocenterPrincipalPoint(
        mkVp("VP1", 100, 400), mkVp("VP2", 1100, 400), mkVp("VP3", 600, 320), { x: 600, y: 400 },
      );
      expect(check.applicable).toBe(true);
      expect(check.isAcuteTriangle).toBe(false);
      expect(check.impliedFocalLengthPx).toBeNull();
      expect(check.valid).toBe(false);
    });

    it("초광각(14mm)·급격한 앙각 구도는 CRITICAL 경보를, 균형 잡힌 55mm 구도는 SAFE를 반환한다", () => {
      const extreme = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 14, yawDeg: 45, pitchDeg: 60, rollDeg: 28,
      });
      expect(extreme.distortionSeverity).toBe("CRITICAL");
      expect(extreme.distortionAlerts.some((a) => a.code === "EXTREME_WIDE_ANGLE")).toBe(true);
      expect(extreme.distortionAlerts.some((a) => a.code === "EXTREME_PITCH")).toBe(true);
      expect(extreme.distortionAlerts.some((a) => a.code === "STEEP_ROLL")).toBe(true);

      const balanced = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 55, yawDeg: 35, pitchDeg: -16, rollDeg: 0,
      });
      expect(balanced.distortionSeverity).toBe("SAFE");
      expect(balanced.distortionAlerts).toHaveLength(0);
    });
  });

  describe("2. 가이드 선분 기반 소실점 및 지평선 역추정 (RANSAC/MSAC + IRLS)", () => {
    it("무노이즈 비라벨 3점 가이드 선분에서 VP1·VP2·VP3와 지평선 기울기를 0.01° 이내로 복원한다", () => {
      const truth = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 35, yawDeg: 38, pitchDeg: -22, rollDeg: 7,
      });
      const sA: readonly Vec2D[] = [{ x: 260, y: 200 }, { x: 420, y: 310 }, { x: 580, y: 470 }, { x: 740, y: 560 }, { x: 350, y: 600 }, { x: 850, y: 280 }];
      const sB: readonly Vec2D[] = [{ x: 300, y: 260 }, { x: 510, y: 390 }, { x: 690, y: 490 }, { x: 860, y: 350 }, { x: 440, y: 620 }, { x: 920, y: 580 }];
      const sC: readonly Vec2D[] = [{ x: 220, y: 420 }, { x: 410, y: 380 }, { x: 610, y: 440 }, { x: 810, y: 390 }, { x: 980, y: 450 }, { x: 520, y: 250 }];
      const est = estimateVanishingPointsFromGuides(
        [
          ...makeRaysTowardVp(truth.vp1, sA, 160, () => 0, "a"),
          ...makeRaysTowardVp(truth.vp2, sB, 160, () => 0, "b"),
          ...makeRaysTowardVp(truth.vp3, sC, 160, () => 0, "c"),
        ],
        { canvasWidth: 1200, canvasHeight: 800, perspectiveMode: "auto" },
      );

      expect(est.detectedMode).toBe("3-point");
      expect(est.inlierRatio).toBe(1);
      expect(est.overallMeanInlierAngleErrorDeg).toBeLessThan(0.01);
      expect(Math.hypot((est.vp1?.x ?? 0) - truth.vp1.x, (est.vp1?.y ?? 0) - truth.vp1.y)).toBeLessThan(1e-3);
      expect(Math.hypot((est.vp2?.x ?? 0) - truth.vp2.x, (est.vp2?.y ?? 0) - truth.vp2.y)).toBeLessThan(1e-3);
      expect(Math.hypot((est.vp3?.x ?? 0) - truth.vp3.x, (est.vp3?.y ?? 0) - truth.vp3.y)).toBeLessThan(1e-3);
      expect(Math.abs((est.horizonLine?.tiltDeg ?? 99) - truth.horizonLine.tiltDeg)).toBeLessThan(0.01);
    });

    it("노이즈(±0.7°)와 이상치(33%)가 섞인 스케치 선분에서도 소실점을 1.5° 미만 오차로 역추정한다", () => {
      const truth = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 35, yawDeg: 35, pitchDeg: -24, rollDeg: -4,
      });
      const mkSeeds = (ox: number, oy: number): Vec2D[] =>
        Array.from({ length: 8 }, (_, i) => ({ x: 200 + ((i * 113 + ox) % 820), y: 160 + ((i * 97 + oy) % 500) }));
      const noise = [-0.55, 0.42, -0.31, 0.65, -0.48, 0.28, 0.52, -0.36];
      const inliers: GuideSegment2D[] = [
        ...makeRaysTowardVp(truth.vp1, mkSeeds(0, 0), 170, (i) => noise[i], "vp1"),
        ...makeRaysTowardVp(truth.vp2, mkSeeds(60, 45), 170, (i) => -noise[i], "vp2"),
        ...makeRaysTowardVp(truth.vp3, mkSeeds(110, 90), 170, (i) => noise[(i + 3) % 8], "vp3"),
      ];
      const outliers: GuideSegment2D[] = Array.from({ length: 12 }, (_, i) => {
        const cx = 220 + ((i * 137) % 760);
        const cy = 180 + ((i * 89) % 440);
        const ang = (i * 0.61 + 0.77) % Math.PI;
        return {
          id: `outlier-${String(i)}`,
          x1: cx - Math.cos(ang) * 70, y1: cy - Math.sin(ang) * 70,
          x2: cx + Math.cos(ang) * 70, y2: cy + Math.sin(ang) * 70,
        };
      });

      const est = estimateVanishingPointsFromGuides([...inliers, ...outliers], {
        canvasWidth: 1200, canvasHeight: 800, perspectiveMode: "3-point", inlierAngleThresholdDeg: 2.2,
      });
      expect(est.detectedMode).toBe("3-point");
      expect(est.overallMeanInlierAngleErrorDeg).toBeLessThan(1.5);
      expect(est.totalInlierCount).toBeGreaterThanOrEqual(21);
      expect(est.outlierSegmentIds.length).toBeGreaterThanOrEqual(8);
      expect(Math.abs((est.horizonLine?.tiltDeg ?? 99) - truth.horizonLine.tiltDeg)).toBeLessThan(1.5);
    });

    it("axisHint 라벨이 주어진 선분 그룹을 각 소실점 축별로 정확히 분리해 역추정한다", () => {
      const truth = solveThreePointPerspectiveRig({
        canvasWidth: 1000, canvasHeight: 700, focalLengthMm: 42, yawDeg: 30, pitchDeg: 20,
      });
      const seeds: readonly Vec2D[] = [{ x: 250, y: 240 }, { x: 480, y: 360 }, { x: 720, y: 480 }, { x: 600, y: 220 }];
      const est = estimateVanishingPointsFromGuides(
        [
          ...makeRaysTowardVp(truth.vp1, seeds, 140, (i) => (i % 2 === 0 ? 0.2 : -0.2), "l", "VP1"),
          ...makeRaysTowardVp(truth.vp2, seeds, 140, (i) => (i % 2 === 0 ? -0.15 : 0.15), "r", "VP2"),
          ...makeRaysTowardVp(truth.vp3, seeds, 140, (i) => (i % 2 === 0 ? 0.1 : -0.1), "v", "VP3"),
        ],
        { canvasWidth: 1000, canvasHeight: 700 },
      );
      expect(est.clusters).toHaveLength(3);
      expect(est.overallMeanInlierAngleErrorDeg).toBeLessThan(0.4);
      expect(est.vp3?.y ?? 9999).toBeLessThan(350);
    });

    it("수직선이 평행한 2점 투시 스케치 선분에서 유한 VP1·VP2와 무한 수직 VP3를 복원한다", () => {
      const truth = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 40, yawDeg: 36, pitchDeg: 0,
      });
      const seeds: readonly Vec2D[] = [{ x: 250, y: 250 }, { x: 460, y: 510 }, { x: 760, y: 280 }, { x: 920, y: 560 }];
      const est = estimateVanishingPointsFromGuides(
        [
          ...makeRaysTowardVp(truth.vp1, seeds, 150, () => 0, "h1"),
          ...makeRaysTowardVp(truth.vp2, seeds, 150, () => 0, "h2"),
          ...makeRaysTowardVp(truth.vp3, seeds, 150, () => 0, "vert"),
        ],
        { canvasWidth: 1200, canvasHeight: 800, perspectiveMode: "auto" },
      );
      expect(est.detectedMode).toBe("2-point");
      expect(est.vp1?.isFinite && est.vp2?.isFinite).toBe(true);
      expect(est.vp3?.isFinite).toBe(false);
      expect(est.overallMeanInlierAngleErrorDeg).toBeLessThan(0.05);
    });

    it("1점 투시 복도 선분 집합에서 중앙 단일 소실점을 복원한다", () => {
      const vpCenter: VanishingPoint2D = {
        id: "VP1", worldAxis: "Z", x: 610, y: 390, isFinite: true,
        direction2d: { x: 1, y: 0 }, homogeneous: [610, 390, 1], distanceFromPrincipalPx: 14,
      };
      const seeds: readonly Vec2D[] = [{ x: 150, y: 120 }, { x: 1050, y: 140 }, { x: 160, y: 690 }, { x: 1040, y: 680 }, { x: 280, y: 310 }, { x: 940, y: 470 }];
      const est = estimateVanishingPointsFromGuides(
        makeRaysTowardVp(vpCenter, seeds, 140, () => 0, "corridor"),
        { canvasWidth: 1200, canvasHeight: 800, perspectiveMode: "1-point" },
      );
      expect(est.detectedMode).toBe("1-point");
      expect(Math.hypot((est.vp1?.x ?? 0) - 610, (est.vp1?.y ?? 0) - 390)).toBeLessThan(1e-3);
    });

    it("빈 입력·퇴화 선분도 NaN 없이 안전하게 처리한다", () => {
      const emptyRes = estimateVanishingPointsFromGuides(
        [
          { id: "d1", x1: 100, y1: 100, x2: 100, y2: 100 },
          { id: "d2", x1: Number.NaN, y1: 0, x2: 50, y2: 50 },
        ],
        { canvasWidth: 800, canvasHeight: 600 },
      );
      expect(emptyRes.totalValidSegments).toBe(0);
      expect(emptyRes.inlierRatio).toBe(0);
      expect(emptyRes.clusters).toHaveLength(0);
    });
  });

  describe("3. Normalized DLT Homography & 교차비(Cross-Ratio) 원근 등분할", () => {
    const sampleQuad: PerspectiveQuad2D = {
      tl: { x: 260, y: 150 }, tr: { x: 860, y: 225 }, br: { x: 785, y: 640 }, bl: { x: 215, y: 530 },
    };

    it("정규화 DLT 3×3 Homography와 역행렬이 4개 코너를 1e-9px 이내로 왕복 복원한다", () => {
      const unit: readonly Vec2D[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
      const dst: readonly Vec2D[] = [sampleQuad.tl, sampleQuad.tr, sampleQuad.br, sampleQuad.bl];
      const h = computeHomographyNormalizedDlt(unit, dst);
      const hInv = invertHomography3x3(h);
      for (let i = 0; i < 4; i += 1) {
        const mapped = applyHomography(h, unit[i]);
        expect(Math.hypot(mapped.x - dst[i].x, mapped.y - dst[i].y)).toBeLessThan(1e-9);
        const restored = applyHomography(hInv, mapped);
        expect(Math.hypot(restored.x - unit[i].x, restored.y - unit[i].y)).toBeLessThan(1e-9);
      }
    });

    it("사영 변환된 동일 직선 4점의 교차비(Cross-Ratio) 불변량 오차가 1e-6 미만이다", () => {
      const unit: readonly Vec2D[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
      const h = computeHomographyNormalizedDlt(unit, [sampleQuad.tl, sampleQuad.tr, sampleQuad.br, sampleQuad.bl]);
      const ts = [0.05, 0.28, 0.67, 0.94];
      const refCr = computeCrossRatio1D(ts[0], ts[1], ts[2], ts[3]);
      const proj = ts.map((t) => applyHomography(h, { x: t, y: 0.35 }));
      expect(Math.abs(computeCollinearCrossRatio2D(proj[0], proj[1], proj[2], proj[3]) - refCr)).toBeLessThan(1e-6);
    });

    it("5×4 건축 창문 파사드 등분할이 교차비 < 1e-6, 소실점 수렴 < 1e-6°, X-대각선 중심 일치를 충족한다", () => {
      const res = subdividePerspectiveQuad(sampleQuad, { cols: 5, rows: 4, mullionRatioU: 0.1, mullionRatioV: 0.12 });
      expect(res.cells).toHaveLength(20);
      expect(res.horizontalLines).toHaveLength(5);
      expect(res.verticalLines).toHaveLength(6);
      expect(res.cells[0].insetQuad).not.toBeNull();
      expect(res.verification.isProjectivelyValid).toBe(true);
      expect(res.verification.maxCrossRatioError).toBeLessThan(1e-6);
      expect(res.verification.maxVpConvergenceErrorDeg).toBeLessThan(1e-6);
      expect(res.verification.xDiagonalAgreementPx).toBeLessThan(1e-8);
    });

    it("원근 파사드 셀 폭이 소실점 방향으로 갈수록 단조 축소된다", () => {
      const rig = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 35, yawDeg: 38, pitchDeg: -15,
      });
      const res = subdividePerspectiveQuad(projectFacadeQuad(rig), { cols: 6, rows: 3 });
      const topRow = res.cells.filter((c) => c.row === 0);
      const diffs = topRow.slice(1).map((c, idx) => c.topEdgeLengthPx - topRow[idx].topEdgeLengthPx);
      expect(diffs.every((d) => d < 0) || diffs.every((d) => d > 0)).toBe(true);
      expect(res.verification.maxCrossRatioError).toBeLessThan(1e-6);
    });

    it("비균등 가중치(기둥·창문 교대 배치) 분할도 사영 교차비 불변량을 보존한다", () => {
      const res = subdividePerspectiveQuad(sampleQuad, { cols: 5, rows: 2, colWeights: [0.5, 2, 0.5, 2, 0.5] });
      expect(res.cells).toHaveLength(10);
      expect(res.verification.maxCrossRatioError).toBeLessThan(1e-6);
      expect(res.verification.isProjectivelyValid).toBe(true);
    });

    it("평행 변 사각형(정면 벽면·무한 소실점)도 NaN 없이 정확히 등분할한다", () => {
      const rect: PerspectiveQuad2D = {
        tl: { x: 100, y: 120 }, tr: { x: 900, y: 120 }, br: { x: 900, y: 520 }, bl: { x: 100, y: 520 },
      };
      const res = subdividePerspectiveQuad(rect, { cols: 4, rows: 4 });
      expect(res.vanishingPointU.isFinite).toBe(false);
      expect(res.vanishingPointV.isFinite).toBe(false);
      expect(res.verification.isProjectivelyValid).toBe(true);
      expect(res.verification.maxCrossRatioError).toBeLessThan(1e-6);
      expect(Math.hypot(res.xDiagonalCenter.x - 500, res.xDiagonalCenter.y - 320)).toBeLessThan(1e-8);
    });

    it("자체 교차(나비넥타이형) 퇴화 사변형은 볼록 판정에서 거부되고 예외를 발생시킨다", () => {
      const bowtie: PerspectiveQuad2D = {
        tl: { x: 100, y: 100 }, tr: { x: 400, y: 400 }, br: { x: 400, y: 100 }, bl: { x: 100, y: 400 },
      };
      expect(isConvexNonDegenerateQuad(bowtie)).toBe(false);
      expect(() => subdividePerspectiveQuad(bowtie, { cols: 3, rows: 3 })).toThrow();
    });
  });

  describe("4. 3D 원근 계단(트레드+라이저) 생성 및 원근 축소 단조성", () => {
    const stairRig = solveThreePointPerspectiveRig({
      canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 35, yawDeg: 28, pitchDeg: -22,
    });

    it("지정된 stepCount만큼 트레드·라이저 폴리곤을 생성하고 모든 꼭짓점이 유한하다", () => {
      const stairs = buildPerspectiveStaircase({
        rig: stairRig, originWorld: { x: -1.1, y: -1.4, z: 3.5 },
        stepCount: 10, stairWidthM: 2.0, treadDepthM: 0.34, riserHeightM: 0.18, directionAxis: "+Z",
      });
      expect(stairs.steps).toHaveLength(10);
      expect(stairs.leftNosingPoints).toHaveLength(10);
      expect(stairs.steps.every((s) => Number.isFinite(s.frontWidthPx) && s.frontWidthPx > 0 && s.riserHeightPx > 0)).toBe(true);
    });

    it("+Z 원근 계단은 단이 올라갈수록 앞폭(frontWidthPx)이 엄격히 단조 축소된다", () => {
      const stairs = buildPerspectiveStaircase({
        rig: stairRig, originWorld: { x: -1.0, y: -1.5, z: 3.8 },
        stepCount: 9, stairWidthM: 1.8, treadDepthM: 0.32, riserHeightM: 0.17,
      });
      expect(stairs.isForeshorteningMonotonic).toBe(true);
      for (let i = 1; i < stairs.steps.length; i += 1) {
        expect(stairs.steps[i].frontWidthPx).toBeLessThan(stairs.steps[i - 1].frontWidthPx);
      }
    });

    it("모든 계단 라이저·트레드 모서리가 VP1·VP2·VP3로 1e-4° 이내 수렴한다", () => {
      const stairs = buildPerspectiveStaircase({
        rig: stairRig, originWorld: { x: -0.9, y: -1.3, z: 4.0 },
        stepCount: 7, stairWidthM: 1.6, treadDepthM: 0.3, riserHeightM: 0.18,
      });
      expect(stairs.maxVpConvergenceErrorDeg).toBeLessThan(1e-4);
    });

    it("등간격 계단 코선(Nosing) 꼭짓점의 사영 교차비 불변량 오차가 1e-6 미만이다", () => {
      const stairs = buildPerspectiveStaircase({
        rig: stairRig, originWorld: { x: -1.2, y: -1.6, z: 4.2 },
        stepCount: 8, stairWidthM: 2.2, treadDepthM: 0.35, riserHeightM: 0.19,
      });
      expect(stairs.maxNosingCrossRatioError).toBeLessThan(1e-6);
    });
  });

  describe("5. 실시간 브러시 투시 자(Perspective Ruler) 스냅 보정기", () => {
    const rig = solveThreePointPerspectiveRig({
      canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 35, yawDeg: 35, pitchDeg: -22,
    });

    it("손떨림 스트로크를 가장 가까운 VP 광선에 자동 잠금하고 잔차 각도 < 1e-6°로 보정한다", () => {
      const anchor = { x: 420, y: 460 };
      const len = Math.hypot(rig.vp2.x - anchor.x, rig.vp2.y - anchor.y);
      const ux = (rig.vp2.x - anchor.x) / len;
      const uy = (rig.vp2.y - anchor.y) / len;
      const rawStroke: BrushStrokePoint[] = [0, 45, 95, 150, 210, 270].map((t, idx) => {
        const wobble = idx === 0 ? 0 : idx % 2 === 0 ? 11 : -14;
        return {
          x: anchor.x + ux * t - uy * wobble, y: anchor.y + uy * t + ux * wobble,
          pressure: 0.6 + idx * 0.05, timestampMs: 1000 + idx * 16,
        };
      });
      const snapped = snapStrokeToPerspectiveRuler(rawStroke, rig, { lockAxis: "auto" });
      expect(snapped.lockedAxis).toBe("VP2");
      expect(snapped.snappedPoints).toHaveLength(rawStroke.length);
      expect(snapped.maxSnapAngleResidualDeg).toBeLessThan(1e-6);
      expect(snapped.maxCorrectionDistancePx).toBeGreaterThan(10);
      expect(snapped.snappedPoints[2].pressure).toBeCloseTo(0.7, 6);
      expect(snapped.snappedPoints[2].timestampMs).toBe(1032);
    });

    it("명시적 lockAxis='VP3'로 수직 소실점 축을 강제 잠금해도 스냅 잔차가 1e-6° 미만이다", () => {
      const snapped = snapStrokeToPerspectiveRuler(
        [{ x: 540, y: 200 }, { x: 552, y: 310 }, { x: 533, y: 430 }, { x: 549, y: 550 }],
        rig,
        { lockAxis: "VP3" },
      );
      expect(snapped.lockedAxis).toBe("VP3");
      expect(snapped.maxSnapAngleResidualDeg).toBeLessThan(1e-6);
    });

    it("snapStrength=0.5 부분 스냅은 원본과 완전 스냅의 정확히 중간 위치를 산출한다", () => {
      const stroke: BrushStrokePoint[] = [{ x: 300, y: 300 }, { x: 460, y: 360 }, { x: 620, y: 410 }];
      const full = snapStrokeToPerspectiveRuler(stroke, rig, { lockAxis: "VP1", snapStrength: 1 });
      const half = snapStrokeToPerspectiveRuler(stroke, rig, { lockAxis: "VP1", snapStrength: 0.5 });
      for (let i = 0; i < stroke.length; i += 1) {
        const midX = (stroke[i].x + full.snappedPoints[i].x) * 0.5;
        const midY = (stroke[i].y + full.snappedPoints[i].y) * 0.5;
        expect(Math.hypot(half.snappedPoints[i].x - midX, half.snappedPoints[i].y - midY)).toBeLessThan(1e-9);
      }
    });

    it("2점 투시의 무한 수직 소실점(VP3) 스냅과 빈 스트로크 입력을 안전하게 처리한다", () => {
      const rig2pt = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 45, yawDeg: 35, pitchDeg: 0,
      });
      const snapped = snapStrokeToPerspectiveRuler(
        [{ x: 500, y: 150 }, { x: 518, y: 330 }, { x: 488, y: 520 }],
        rig2pt,
        { lockAxis: "VP3" },
      );
      expect(snapped.maxSnapAngleResidualDeg).toBeLessThan(1e-6);
      expect(snapped.snappedPoints.every((p) => Math.abs(p.x - 500) < 1e-9)).toBe(true);
      expect(snapStrokeToPerspectiveRuler([], rig2pt).snappedPoints).toHaveLength(0);
    });
  });

  describe("6. WebGPU WGSL 투시 격자 셰이더 생성·유니폼 패킹·정적 검증", () => {
    it("생성된 WGSL이 128B(16바이트 정렬) 유니폼·엔트리포인트·바인딩·fwidth 검증을 0에러로 통과한다", () => {
      const artifact = buildPerspectiveGridWgsl({ radialDivisions: 32, includeHomographyGrid: true });
      const val = validatePerspectiveGridWgsl(artifact.wgslSource);
      expect(artifact.uniformByteSize).toBe(PERSPECTIVE_GRID_UNIFORM_BYTE_SIZE);
      expect(artifact.uniformByteSize % PERSPECTIVE_GRID_UNIFORM_ALIGNMENT).toBe(0);
      expect(artifact.uniformLayout).toHaveLength(8);
      expect(val.valid).toBe(true);
      expect(val.errors).toHaveLength(0);
      expect(val.hasFwidthAntiAliasing && val.uniformByteSizeVerified).toBe(true);
      expect(val.forbiddenGlslTokensFound).toHaveLength(0);
      expect(val.detectedEntryPoints).toContain("vertex:vs_perspective_grid");
      expect(val.detectedEntryPoints).toContain("fragment:fs_perspective_grid");
      expect(val.detectedBindings).toContain("group(0):binding(0)");
    });

    it("packPerspectiveGridUniforms가 32개 유한 f32(128B) 버퍼에 리깅·역 Homography를 적재한다", () => {
      const rig = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 35, yawDeg: 35, pitchDeg: -20,
      });
      const sub = subdividePerspectiveQuad(projectFacadeQuad(rig), { cols: 4, rows: 3 });
      const packed = packPerspectiveGridUniforms(rig, sub, { radialDivisions: 24 });
      expect(packed.length).toBe(32);
      expect(packed.byteLength).toBe(128);
      expect(Array.from(packed).every((v) => Number.isFinite(v))).toBe(true);
      expect(packed[0]).toBe(1200);
      expect(packed[23]).toBe(4);
      expect(packed[27]).toBe(3);
    });

    it("괄호 손상·바인딩 누락·fwidth 제거된 손상 WGSL을 정확히 실패 판정한다", () => {
      const src = buildPerspectiveGridWgsl().wgslSource;
      expect(validatePerspectiveGridWgsl(`${src}\nfn broken( {`).valid).toBe(false);
      expect(validatePerspectiveGridWgsl(src.replace("@group(0) @binding(0)", "// none")).valid).toBe(false);
      const noFw = validatePerspectiveGridWgsl(src.replace(/fwidth\(/g, "abs("));
      expect(noFw.valid).toBe(false);
      expect(noFw.hasFwidthAntiAliasing).toBe(false);
    });

    it("GLSL 금지어(gl_FragCoord·sampler2D·vec4(·dFdx() 혼입 시 즉시 검출한다", () => {
      const contaminated = `${buildPerspectiveGridWgsl().wgslSource}\nlet bad = gl_FragCoord.x + dFdx(1.0); let v = vec4(1.0); uniform sampler2D tex;`;
      const val = validatePerspectiveGridWgsl(contaminated);
      expect(val.valid).toBe(false);
      expect(val.forbiddenGlslTokensFound).toContain("gl_FragCoord");
      expect(val.forbiddenGlslTokensFound).toContain("dFdx(");
      expect(val.forbiddenGlslTokensFound).toContain("vec4(");
      expect(val.forbiddenGlslTokensFound).toContain("sampler2D");
    });
  });

  describe("7. 순수 OKLCH 블루프린트 SVG, 한국어 QA 브리프 & FIPS 180-4 SHA-256", () => {
    it("순수 ES2017 동기 FIPS 180-4 SHA-256이 표준 NIST 테스트 벡터와 비트 단위로 일치한다", () => {
      expect(sha256PerspectiveHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
      expect(sha256PerspectiveHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
      expect(sha256PerspectiveHex("웹툰3점투시")).toBe(sha256PerspectiveHex("웹툰3점투시"));
      expect(sha256PerspectiveHex("웹툰3점투시")).toHaveLength(64);
    });

    it("투시 리깅 매니페스트 지문이 결정론적이며 초점거리 0.1mm 변경에도 민감하게 변한다", () => {
      const rigA = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 35, yawDeg: 35, pitchDeg: -20,
      });
      const rigB = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 35.1, yawDeg: 35, pitchDeg: -20,
      });
      const fp1 = computePerspectiveRigFingerprint(rigA);
      expect(fp1.sha256Hex).toBe(computePerspectiveRigFingerprint(rigA).sha256Hex);
      expect(fp1.sha256Hex).not.toBe(computePerspectiveRigFingerprint(rigB).sha256Hex);
      expect(fp1.version).toBe("wave135-v1");
    });

    it("블루프린트 SVG가 순수 oklch(...) 색상만 사용하고 원시 hex/rgb/hsl이 0건이다", () => {
      const rig = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 35, yawDeg: 36, pitchDeg: -20,
      });
      const sub = subdividePerspectiveQuad(projectFacadeQuad(rig), { cols: 4, rows: 3, mullionRatioU: 0.08, mullionRatioV: 0.1 });
      const stairs = buildPerspectiveStaircase({
        rig, originWorld: { x: -1.0, y: -1.4, z: 3.8 }, stepCount: 6, stairWidthM: 1.7, treadDepthM: 0.32, riserHeightM: 0.18,
      });
      const snapped = snapStrokeToPerspectiveRuler([{ x: 300, y: 400 }, { x: 520, y: 440 }], rig, { lockAxis: "VP2" });
      const svg = renderThreePointPerspectiveSvg({ rig, subdivision: sub, staircase: stairs, snappedStroke: snapped });

      expect(svg.startsWith("<svg ") && svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(svg).toContain('data-layer="projective-subdivision"');
      expect(svg).toContain('data-layer="perspective-staircase"');
      expect(svg).toContain('data-layer="snapped-stroke"');
      expect(/#[0-9a-fA-F]{3,8}\b/.test(svg)).toBe(false);
      expect(/\brgba?\s*\(/i.test(svg)).toBe(false);
      expect(/\bhsla?\s*\(/i.test(svg)).toBe(false);
      expect(/\bNaN\b|\bInfinity\b/.test(svg)).toBe(false);
    });

    it("SVG 제목에 악성 스크립트 태그가 포함되어도 XML/XSS 이스케이프되어 안전하게 출력된다", () => {
      const rig = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 40, yawDeg: 35, pitchDeg: -18,
      });
      const payload = `<script>alert("xss")</script> & 'cut'`;
      expect(escapePerspectiveXml(payload)).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;cut&apos;");
      const svg = renderThreePointPerspectiveSvg({ rig, titleKo: payload });
      expect(svg).not.toContain("<script>");
      expect(svg).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    });

    it("한국어 배경 연출 QA 브리프가 번역투 없이 핵심 계측·경보·SHA-256 지문을 요약한다", () => {
      const rig = solveThreePointPerspectiveRig({
        canvasWidth: 1200, canvasHeight: 800, focalLengthMm: 20, yawDeg: 40, pitchDeg: -24,
      });
      const sub = subdividePerspectiveQuad(projectFacadeQuad(rig), { cols: 4, rows: 3 });
      const stairs = buildPerspectiveStaircase({
        rig, originWorld: { x: -1.0, y: -1.4, z: 4.0 }, stepCount: 5, stairWidthM: 1.8, treadDepthM: 0.3, riserHeightM: 0.18,
      });
      const brief = summarizeThreePointPerspectiveKo({ rig, subdivision: sub, staircase: stairs, generatedDateIso: "2026-11-28" });
      expect(brief).toContain("웹툰 배경 3점 투시 연출 QA 브리프 (2026-11-28)");
      expect(brief).toContain("수심=주점 직교 검증");
      expect(brief).toContain("왜곡 경보 및 작화 보정 권고");
      expect(brief).toContain("교차비 불변량 최대 오차");
      expect(brief).toContain("3D 원근 계단 구조 검증");
      expect(brief).toContain("SHA-256 (FIPS 180-4):");
      expect(brief).not.toContain("하는 것을 가능하게 합니다");
      expect(brief).not.toContain("직관적인 경험을 제공합니다");
    });

    it("단일 선분 오차 헬퍼가 소실점을 정확히 지나는 선분에 대해 < 1e-10° 오차를 반환한다", () => {
      const err = computeSegmentToVpAngleErrorDeg({ x1: 100, y1: 100, x2: 300, y2: 200 }, [500, 300, 1]);
      expect(err).toBeLessThan(1e-10);
    });
  });
});
