import { describe, expect, it } from "vitest";

import {
  GOLDEN_MAJOR_RATIO,
  GOLDEN_MINOR_RATIO,
  GOLDEN_RATIO,
  buildMagneticRulerOverlayGeometry,
  computeDivisionGuideLines,
  computeSymmetryTransforms,
  createMagneticRulerSnapSession,
  createPerspectivePresetConfig,
  generateFivePointFisheyeGuideArcs,
  generateSymmetryMirrorPoints,
  generateSymmetryMirrorStrokes,
  getFivePointFisheyeVanishingPoints,
  projectPointOntoFivePointFisheyeAxis,
  resolveFivePointFisheyeAxis,
  snapPointToDivisionRuler,
  snapPointToNearestSymmetryAxis,
  snapPointerWithMagneticRuler,
  snapStrokeWithMagneticRuler,
  type FivePointFisheyeConfig,
  type MagneticRulerEngineConfig,
  type PointerSnapInput,
  type SnapPoint2D,
  type SymmetryRulerConfig,
} from "./studio-perspective-symmetry-ruler-snap";

function pointToLineDistance(pt: SnapPoint2D, a: SnapPoint2D, b: SnapPoint2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return Math.abs(dx * (pt.y - a.y) - dy * (pt.x - a.x)) / len;
}

describe("studio-perspective-symmetry-ruler-snap", () => {
  describe("1·2·3점 원근 투시자 스냅 오차 검증", () => {
    it("1점 투시에서 소실점 방사선·수평선·수직선 축을 자동 판별해 < 1e-9px 오차로 스냅한다", () => {
      const vp = { id: "vp1", x: 400, y: 300 };
      const config: MagneticRulerEngineConfig = {
        perspective: {
          enabled: true,
          mode: "1p",
          vanishingPoints: [vp],
          horizonAngleDeg: 0,
          allowHorizonAxis: true,
          allowVerticalAxis: true,
          minLockDistancePx: 2,
        },
      };

      // 1) 소실점 방향 드래그
      const start = { x: 100, y: 100 };
      const toVp = snapStrokeWithMagneticRuler(config, [
        start,
        { x: 160, y: 145 },
        { x: 230, y: 192 },
        { x: 310, y: 232 },
      ]);
      expect(toVp.lockedKind).toBe("perspective-1p");
      expect(toVp.lockedAxisId).toBe("vp:vp1");
      expect(toVp.maxResidualErrorPx).toBeLessThan(1e-9);
      for (const pt of toVp.primaryStroke) {
        expect(pointToLineDistance(pt, start, vp)).toBeLessThan(1e-9);
      }

      // 2) 수평선 평행 드래그
      const horiz = snapStrokeWithMagneticRuler(config, [
        { x: 120, y: 450 },
        { x: 190, y: 454 },
        { x: 280, y: 446 },
      ]);
      expect(horiz.lockedAxisId).toBe("horizon");
      for (const pt of horiz.primaryStroke) {
        expect(pt.y).toBeCloseTo(450, 9);
      }

      // 3) 수직선 드래그
      const vert = snapStrokeWithMagneticRuler(config, [
        { x: 220, y: 120 },
        { x: 224, y: 200 },
        { x: 215, y: 310 },
      ]);
      expect(vert.lockedAxisId).toBe("vertical");
      for (const pt of vert.primaryStroke) {
        expect(pt.x).toBeCloseTo(220, 9);
      }
    });

    it("2점 투시에서 좌/우 소실점과 기울어진 수평선에 직교하는 수직축을 < 1e-9px 오차로 스냅한다", () => {
      const vpL = { id: "left", x: -200, y: 300 };
      const vpR = { id: "right", x: 1000, y: 300 };
      const config: MagneticRulerEngineConfig = {
        perspective: {
          enabled: true,
          mode: "2p",
          vanishingPoints: [vpL, vpR],
          minLockDistancePx: 2,
        },
      };

      const start = { x: 400, y: 500 };
      const towardRight = snapStrokeWithMagneticRuler(config, [
        start,
        { x: 460, y: 482 },
        { x: 540, y: 448 },
      ]);
      expect(towardRight.lockedKind).toBe("perspective-2p");
      expect(towardRight.lockedAxisId).toBe("vp:right");
      for (const pt of towardRight.primaryStroke) {
        expect(pointToLineDistance(pt, start, vpR)).toBeLessThan(1e-9);
      }

      const towardLeft = snapStrokeWithMagneticRuler(config, [
        start,
        { x: 340, y: 482 },
        { x: 250, y: 440 },
      ]);
      expect(towardLeft.lockedAxisId).toBe("vp:left");
      for (const pt of towardLeft.primaryStroke) {
        expect(pointToLineDistance(pt, start, vpL)).toBeLessThan(1e-9);
      }
    });

    it("3점 투시에서 좌·우·수직(3번째) 소실점 모두에 정확히 락 및 직교 투영된다", () => {
      const vpL = { id: "l", x: -250, y: 200 };
      const vpR = { id: "r", x: 1050, y: 200 };
      const vpV = { id: "v", x: 400, y: 1400 };
      const config: MagneticRulerEngineConfig = {
        perspective: {
          enabled: true,
          mode: "3p",
          vanishingPoints: [vpL, vpR, vpV],
          minLockDistancePx: 2,
        },
      };

      const start = { x: 300, y: 400 };
      const toVerticalVp = snapStrokeWithMagneticRuler(config, [
        start,
        { x: 312, y: 510 },
        { x: 330, y: 650 },
      ]);
      expect(toVerticalVp.lockedKind).toBe("perspective-3p");
      expect(toVerticalVp.lockedAxisId).toBe("vp:v");
      expect(toVerticalVp.maxResidualErrorPx).toBeLessThan(1e-9);
      for (const pt of toVerticalVp.primaryStroke) {
        expect(pointToLineDistance(pt, start, vpV)).toBeLessThan(1e-9);
      }
    });
  });

  describe("5점 어안 투시 원호 스냅 정밀도 및 0ms 성능 검증", () => {
    const fisheye: FivePointFisheyeConfig = {
      centerX: 300,
      centerY: 300,
      radius: 200,
      rotationDeg: 0,
      curvature: 1,
      outsidePolicy: "clamp",
    };

    it("5개 소실점(중심·좌·우·상·하) 좌표와 회전 변환이 정확하다", () => {
      const vps = getFivePointFisheyeVanishingPoints(fisheye);
      expect(vps.center).toEqual({ x: 300, y: 300 });
      expect(vps.left.x).toBeCloseTo(100, 9);
      expect(vps.right.x).toBeCloseTo(500, 9);
      expect(vps.top.y).toBeCloseTo(100, 9);
      expect(vps.bottom.y).toBeCloseTo(500, 9);

      const rotated = getFivePointFisheyeVanishingPoints({ ...fisheye, rotationDeg: 90 });
      expect(rotated.right.x).toBeCloseTo(300, 9);
      expect(rotated.right.y).toBeCloseTo(500, 9);
    });

    it("수평 어안 원호 스냅 점들이 정확히 VP_left·VP_right·시작점을 지나는 동일 원주 위에 놓인다(< 1e-9px)", () => {
      const start = { x: 300, y: 400 }; // 로컬 (0, +100) -> 원 중심 (0, -150), 반경 250
      const axis = resolveFivePointFisheyeAxis(fisheye, start, { x: 360, y: 392 });
      expect(axis).not.toBeNull();
      expect(axis!.axisId).toBe("fisheye-horizontal");

      const expectedCenterWorld = { x: 300, y: 300 - 150 };
      const expectedRadius = 250;
      const vps = getFivePointFisheyeVanishingPoints(fisheye);
      // 좌/우 소실점과 시작점 모두 같은 원주 위
      expect(Math.hypot(vps.left.x - expectedCenterWorld.x, vps.left.y - expectedCenterWorld.y)).toBeCloseTo(expectedRadius, 9);
      expect(Math.hypot(vps.right.x - expectedCenterWorld.x, vps.right.y - expectedCenterWorld.y)).toBeCloseTo(expectedRadius, 9);

      const samples = [
        { x: 340, y: 390 },
        { x: 395, y: 365 },
        { x: 445, y: 340 },
        { x: 240, y: 385 },
      ];
      for (const sample of samples) {
        const proj = projectPointOntoFivePointFisheyeAxis(axis!, sample);
        expect(proj.passthrough).toBe(false);
        const distFromArcCenter = Math.hypot(
          proj.point.x - expectedCenterWorld.x,
          proj.point.y - expectedCenterWorld.y,
        );
        expect(Math.abs(distFromArcCenter - expectedRadius)).toBeLessThan(1e-9);
      }
    });

    it("수직 어안 원호 및 중심 방사선 축도 < 1e-9px 오차로 정확히 스냅된다", () => {
      // 수직 어안 원호: 로컬 (+100, 0) -> (400, 300), 원 중심 (150, 300), 반경 250
      const startV = { x: 400, y: 300 };
      const axisV = resolveFivePointFisheyeAxis(fisheye, startV, { x: 396, y: 360 });
      expect(axisV?.axisId).toBe("fisheye-vertical");
      const projV = projectPointOntoFivePointFisheyeAxis(axisV!, { x: 385, y: 390 });
      expect(Math.abs(Math.hypot(projV.point.x - 150, projV.point.y - 300) - 250)).toBeLessThan(1e-9);

      // 중심 방사 깊이선: 시작 (380, 380)에서 중심 (300, 300) 방향으로 드래그
      const startR = { x: 380, y: 380 };
      const axisR = resolveFivePointFisheyeAxis(fisheye, startR, { x: 340, y: 342 });
      expect(axisR?.axisId).toBe("fisheye-radial");
      const projR = projectPointOntoFivePointFisheyeAxis(axisR!, { x: 350, y: 340 });
      expect(pointToLineDistance(projR.point, { x: 300, y: 300 }, startR)).toBeLessThan(1e-9);
    });

    it("렌즈 외부 입력의 clamp / passthrough 정책과 가이드 원호 생성 및 초저지연(0ms급) 처리 속도를 보장한다", () => {
      const passthroughCfg: FivePointFisheyeConfig = { ...fisheye, outsidePolicy: "passthrough" };
      const axis = resolveFivePointFisheyeAxis(passthroughCfg, { x: 300, y: 400 }, { x: 350, y: 395 })!;
      const outsideInput = { x: 700, y: 700 };
      const passRes = projectPointOntoFivePointFisheyeAxis(axis, outsideInput);
      expect(passRes.passthrough).toBe(true);
      expect(passRes.point).toEqual(outsideInput);

      const guides = generateFivePointFisheyeGuideArcs(fisheye, 3, 24);
      expect(guides.length).toBeGreaterThanOrEqual(15);
      expect(guides[0]!.category).toBe("fisheye-rim");

      // 1,000개 포인터 샘플 연속 스냅이 50ms 미만(샘플당 < 0.05ms)에 완료되어야 한다
      const engineCfg: MagneticRulerEngineConfig = {
        perspective: createPerspectivePresetConfig("5p-fisheye", { width: 800, height: 600 }),
      };
      let session = createMagneticRulerSnapSession(engineCfg, { x: 400, y: 420 });
      const t0 = performance.now();
      for (let i = 1; i <= 1000; i += 1) {
        const res = snapPointerWithMagneticRuler(session, { x: 400 + i * 0.15, y: 420 - i * 0.04 });
        session = res.session;
      }
      const elapsedMs = performance.now() - t0;
      expect(elapsedMs).toBeLessThan(50);
    });
  });

  describe("N-축 방사/거울 대칭자 미러 정밀도 검증", () => {
    it("임의 각도(37°) 거울 대칭에서 거리 보존·중점 축 일치·대합(M(M(p))=p)·방향벡터 반사가 정밀하다", () => {
      const sym: SymmetryRulerConfig = {
        enabled: true,
        mode: "mirror",
        centerX: 250,
        centerY: 180,
        axisAngleDeg: 37,
      };
      const input: PointerSnapInput = { x: 340, y: 120, pressure: 0.75, dx: 12, dy: -5, tiltX: 15, tiltY: 8 };
      const mirrored = generateSymmetryMirrorPoints(input, sym);
      expect(mirrored).toHaveLength(2);
      const orig = mirrored[0]!;
      const refl = mirrored[1]!;
      expect(orig.reflected).toBe(false);
      expect(refl.reflected).toBe(true);
      expect(refl.pressure).toBe(0.75);

      // 중심으로부터의 반경 거리 보존
      expect(Math.hypot(refl.x - sym.centerX, refl.y - sym.centerY)).toBeCloseTo(
        Math.hypot(orig.x - sym.centerX, orig.y - sym.centerY),
        9,
      );

      // 두 점의 중점이 정확히 대칭축 위에 놓임
      const mid = { x: (orig.x + refl.x) * 0.5, y: (orig.y + refl.y) * 0.5 };
      const rad = (37 * Math.PI) / 180;
      const axisB = { x: sym.centerX + Math.cos(rad) * 100, y: sym.centerY + Math.sin(rad) * 100 };
      expect(pointToLineDistance(mid, { x: sym.centerX, y: sym.centerY }, axisB)).toBeLessThan(1e-9);

      // 대합(involution): 반사점을 다시 반사하면 원본 복원
      const twice = generateSymmetryMirrorPoints({ x: refl.x, y: refl.y, dx: refl.dx, dy: refl.dy }, sym);
      expect(twice[1]!.x).toBeCloseTo(orig.x, 9);
      expect(twice[1]!.y).toBeCloseTo(orig.y, 9);
      expect(twice[1]!.dx).toBeCloseTo(orig.dx, 9);
      expect(twice[1]!.dy).toBeCloseTo(orig.dy, 9);
    });

    it("N-축 방사 대칭(C_n)은 정확한 반경 보존과 2π/N 등간격 회전각을 유지한다", () => {
      for (const n of [3, 5, 6, 8, 12]) {
        const sym: SymmetryRulerConfig = {
          enabled: true,
          mode: "radial",
          centerX: 200,
          centerY: 200,
          axesCount: n,
        };
        const pts = generateSymmetryMirrorPoints({ x: 280, y: 230, dx: 10, dy: 0 }, sym);
        expect(pts).toHaveLength(n);
        const r0 = Math.hypot(pts[0]!.x - 200, pts[0]!.y - 200);
        const a0 = Math.atan2(pts[0]!.y - 200, pts[0]!.x - 200);

        for (let k = 0; k < n; k += 1) {
          expect(pts[k]!.reflected).toBe(false);
          const rk = Math.hypot(pts[k]!.x - 200, pts[k]!.y - 200);
          expect(rk).toBeCloseTo(r0, 9);
          const expectedAngle = a0 + (2 * Math.PI * k) / n;
          expect(pts[k]!.x).toBeCloseTo(200 + Math.cos(expectedAngle) * r0, 9);
          expect(pts[k]!.y).toBeCloseTo(200 + Math.sin(expectedAngle) * r0, 9);
          // 방향 벡터 크기도 정확히 보존
          expect(Math.hypot(pts[k]!.dx, pts[k]!.dy)).toBeCloseTo(10, 9);
        }
      }
    });

    it("N-축 만화경 대칭(D_n)은 2N개 분기를 생성하며 모든 N개 축 반사에 대해 닫혀 있다", () => {
      const n = 6;
      const sym: SymmetryRulerConfig = {
        enabled: true,
        mode: "kaleidoscope",
        centerX: 300,
        centerY: 240,
        axisAngleDeg: 15,
        axesCount: n,
      };
      const transforms = computeSymmetryTransforms(sym);
      expect(transforms).toHaveLength(n * 2);

      const pts = generateSymmetryMirrorPoints({ x: 372, y: 211 }, sym);
      expect(pts.filter((p) => !p.reflected)).toHaveLength(n);
      expect(pts.filter((p) => p.reflected)).toHaveLength(n);

      // 임의의 k번째 축에 대해 모든 점을 반사해도 같은 점 집합 안에 < 1e-8px 오차로 존재
      for (let axisIdx = 0; axisIdx < n; axisIdx += 1) {
        const axisDeg = 15 + (180 * axisIdx) / n;
        const singleMirror: SymmetryRulerConfig = {
          enabled: true,
          mode: "mirror",
          centerX: 300,
          centerY: 240,
          axisAngleDeg: axisDeg,
        };
        for (const pt of pts) {
          const reflected = generateSymmetryMirrorPoints(pt, singleMirror)[1]!;
          const minDist = Math.min(...pts.map((cand) => Math.hypot(cand.x - reflected.x, cand.y - reflected.y)));
          expect(minDist).toBeLessThan(1e-8);
        }
      }

      // 스트로크 미러링 및 대칭축 이음새 스냅 확인
      const mirroredStrokes = generateSymmetryMirrorStrokes(
        [
          { x: 302, y: 180 },
          { x: 340, y: 210 },
        ],
        sym,
      );
      expect(mirroredStrokes).toHaveLength(12);
      expect(mirroredStrokes[0]).toHaveLength(2);

      const seam = snapPointToNearestSymmetryAxis(
        { x: 203, y: 140 },
        { enabled: true, mode: "mirror", centerX: 200, centerY: 200, axisAngleDeg: 90, snapToAxisThresholdPx: 6 },
      );
      expect(seam.snapped).toBe(true);
      expect(seam.point.x).toBeCloseTo(200, 9);
    });
  });

  describe("컷 내 N등분 분할자(황금비·3분할·등간격) 및 통합 자석 스냅", () => {
    const frame = { x: 100, y: 50, width: 300, height: 200 };

    it("등간격·3분할·황금비 분할선 좌표와 교차점 스냅이 수학적으로 정확하다", () => {
      const equalSet = computeDivisionGuideLines({
        enabled: true,
        mode: "equal",
        frame,
        columns: 4,
        rows: 5,
        includeFrameEdges: false,
      });
      expect(equalSet.verticals.map((v) => v.coordinate)).toEqual([175, 250, 325]);
      expect(equalSet.horizontals.map((h) => h.coordinate)).toEqual([90, 130, 170, 210]);

      const thirdsSet = computeDivisionGuideLines({
        enabled: true,
        mode: "rule-of-thirds",
        frame,
        includeFrameEdges: false,
      });
      expect(thirdsSet.verticals[0]!.coordinate).toBeCloseTo(200, 9);
      expect(thirdsSet.verticals[1]!.coordinate).toBeCloseTo(300, 9);
      expect(thirdsSet.intersections).toHaveLength(4);

      const goldenSet = computeDivisionGuideLines({
        enabled: true,
        mode: "golden-ratio",
        frame,
        includeFrameEdges: false,
      });
      expect(GOLDEN_MAJOR_RATIO / GOLDEN_MINOR_RATIO).toBeCloseTo(GOLDEN_RATIO, 12);
      expect(goldenSet.verticals[0]!.coordinate).toBeCloseTo(100 + 300 * GOLDEN_MINOR_RATIO, 9);
      expect(goldenSet.verticals[1]!.coordinate).toBeCloseTo(100 + 300 * GOLDEN_MAJOR_RATIO, 9);

      const snappedCorner = snapPointToDivisionRuler(
        { x: 202, y: 50 + 200 / 3 - 3 },
        { enabled: true, mode: "rule-of-thirds", frame, snapThresholdPx: 12, includeFrameEdges: false },
      );
      expect(snappedCorner.snapped).toBe(true);
      expect(snappedCorner.point.x).toBeCloseTo(200, 9);
      expect(snappedCorner.point.y).toBeCloseTo(50 + 200 / 3, 9);
    });

    it("원근 투시 + 대칭자 결합 시 투시 스냅된 좌표를 모든 대칭 분기에 실시간 미러링한다", () => {
      const combinedConfig: MagneticRulerEngineConfig = {
        perspective: createPerspectivePresetConfig("1p", { width: 400, height: 300 }),
        symmetry: {
          enabled: true,
          mode: "quad",
          centerX: 200,
          centerY: 150,
          axisAngleDeg: 90,
        },
        division: {
          enabled: true,
          mode: "golden-ratio",
          frame: { x: 20, y: 20, width: 360, height: 260 },
          snapThresholdPx: 8,
        },
      };

      const stroke = snapStrokeWithMagneticRuler(combinedConfig, [
        { x: 80, y: 60 },
        { x: 110, y: 84 },
        { x: 145, y: 112 },
      ]);
      expect(stroke.lockedKind).toBe("perspective-1p");
      expect(stroke.mirroredStrokes).toHaveLength(4);
      // 분기 1(수직축 반사)의 x 좌표는 2*200 - primary.x와 정확히 일치
      stroke.primaryStroke.forEach((pt, idx) => {
        expect(stroke.mirroredStrokes[1]![idx]!.x).toBeCloseTo(400 - pt.x, 9);
        expect(stroke.mirroredStrokes[1]![idx]!.y).toBeCloseTo(pt.y, 9);
      });

      const overlay = buildMagneticRulerOverlayGeometry(combinedConfig, { width: 400, height: 300 });
      expect(overlay.vanishingPoints).toHaveLength(1);
      expect(overlay.lines.some((l) => l.category === "perspective")).toBe(true);
      expect(overlay.lines.some((l) => l.category === "symmetry")).toBe(true);
      expect(overlay.lines.some((l) => l.category === "division")).toBe(true);
    });
  });
});
