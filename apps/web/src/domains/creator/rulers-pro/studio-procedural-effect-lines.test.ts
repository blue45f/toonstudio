import { describe, expect, it } from "vitest";

import {
  PROCEDURAL_EFFECT_LINE_PRESETS,
  clipPolygonToCutFrame,
  clipSegmentToCutFrame,
  createDeterministicPrng,
  evaluateCubicBezierPoint,
  evaluateCubicBezierTangent,
  generateBurstEffectLines,
  generateConcentrationEffectLines,
  generateFlowEffectLines,
  generateProceduralEffectLines,
  generateSpeedEffectLines,
  isPointInsideCutFrame,
  normalizeEffectSeed,
  proceduralEffectToStudioElementPatch,
  renderProceduralEffectLinesToSvg,
  type CubicBezierControlPoints,
  type CutFrameClip,
} from "./studio-procedural-effect-lines";

describe("studio-procedural-effect-lines", () => {
  describe("결정적 시드(PRNG) 및 재현성", () => {
    it("동일 시드 입력은 모든 효과선 유형에서 바이트 단위로 동일한 SVG·폴리곤을 생성한다", () => {
      for (const preset of PROCEDURAL_EFFECT_LINE_PRESETS) {
        const first = generateProceduralEffectLines(preset.config);
        const second = generateProceduralEffectLines(preset.config);
        expect(first.combinedSvgPath).toBe(second.combinedSvgPath);
        expect(first.strips).toEqual(second.strips);
        expect(first.stats).toEqual(second.stats);
        expect(first.strips.length).toBeGreaterThan(0);
      }
    });

    it("시드가 다르면 서로 다른 효과선 배치를 생성하며 비정상 시드도 안전하게 정규화한다", () => {
      const base = PROCEDURAL_EFFECT_LINE_PRESETS[0]!.config;
      const a = generateProceduralEffectLines({ ...base, seed: 101 });
      const b = generateProceduralEffectLines({ ...base, seed: 102 });
      expect(a.combinedSvgPath).not.toBe(b.combinedSvgPath);

      expect(normalizeEffectSeed(0)).toBeGreaterThan(0);
      expect(normalizeEffectSeed(Number.NaN)).toBeGreaterThan(0);
      expect(normalizeEffectSeed(-42)).toBeGreaterThan(0);

      const rngA = createDeterministicPrng(777);
      const rngB = createDeterministicPrng(777);
      for (let i = 0; i < 20; i += 1) {
        const vA = rngA();
        const vB = rngB();
        expect(vA).toBe(vB);
        expect(vA).toBeGreaterThanOrEqual(0);
        expect(vA).toBeLessThan(1);
      }
    });
  });

  describe("집중선 (타원 중심·밀도·지터·불균일 간격·양끝 테이퍼·컷 클리핑)", () => {
    it("지터가 0일 때 모든 시작점이 지정 타원 경계 위에 위치하고 회전 각도를 반영한다", () => {
      const rx = 80;
      const ry = 40;
      const cx = 200;
      const cy = 150;
      const rotDeg = 30;
      const rotRad = (-rotDeg * Math.PI) / 180;
      const res = generateConcentrationEffectLines({
        seed: 42,
        center: { x: cx, y: cy },
        innerRadiusX: rx,
        innerRadiusY: ry,
        ellipseRotationDeg: rotDeg,
        outerRadius: 260,
        lineCount: 36,
        baseWidth: 3,
        widthJitter: 0,
        angleJitterDeg: 0,
        innerRadiusJitter: 0,
        lengthJitter: 0,
        unevenSpacing: 0,
        taperMode: "inward",
      });

      expect(res.strips).toHaveLength(36);
      for (const strip of res.strips) {
        const p0 = strip.centerline[0]!;
        const dx = p0.x - cx;
        const dy = p0.y - cy;
        const lx = dx * Math.cos(rotRad) - dy * Math.sin(rotRad);
        const ly = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);
        const ellipseVal = (lx / rx) ** 2 + (ly / ry) ** 2;
        expect(ellipseVal).toBeCloseTo(1, 5);
      }
    });

    it("불균일 간격(unevenSpacing)을 높이면 각도 간격 편차가 균등 배치보다 뚜렷하게 커진다", () => {
      const measureAngleSpread = (unevenSpacing: number): number => {
        const res = generateConcentrationEffectLines({
          seed: 999,
          center: { x: 150, y: 150 },
          innerRadiusX: 40,
          innerRadiusY: 40,
          outerRadius: 200,
          lineCount: 48,
          baseWidth: 2,
          angleJitterDeg: 0,
          innerRadiusJitter: 0,
          lengthJitter: 0,
          unevenSpacing,
          clusterCount: 4,
        });
        const angles = res.strips
          .map((s) => Math.atan2(s.centerline[0]!.y - 150, s.centerline[0]!.x - 150))
          .sort((a, b) => a - b);
        const diffs: number[] = [];
        for (let i = 1; i < angles.length; i += 1) {
          diffs.push(angles[i]! - angles[i - 1]!);
        }
        const mean = diffs.reduce((acc, v) => acc + v, 0) / diffs.length;
        return diffs.reduce((acc, v) => acc + (v - mean) ** 2, 0) / diffs.length;
      };

      expect(measureAngleSpread(0)).toBeLessThan(1e-10);
      expect(measureAngleSpread(0.85)).toBeGreaterThan(0.0005);
    });

    it("테이퍼 모드(inward / outward / both / none)별로 의도된 정점 기하를 생성한다", () => {
      const common = {
        seed: 7,
        center: { x: 100, y: 100 },
        innerRadiusX: 30,
        innerRadiusY: 30,
        outerRadius: 140,
        lineCount: 4,
        baseWidth: 6,
        widthJitter: 0,
        angleJitterDeg: 0,
        innerRadiusJitter: 0,
        lengthJitter: 0,
        unevenSpacing: 0,
      };
      const inward = generateConcentrationEffectLines({ ...common, taperMode: "inward" });
      const outward = generateConcentrationEffectLines({ ...common, taperMode: "outward" });
      const both = generateConcentrationEffectLines({ ...common, taperMode: "both" });
      const none = generateConcentrationEffectLines({ ...common, taperMode: "none" });

      // inward/outward는 뾰족 삼각형(3정점), both는 중앙이 굵고 양끝이 뾰족한 마름모(4정점), none은 사각형(4정점)
      expect(inward.strips[0]!.points).toHaveLength(3);
      expect(outward.strips[0]!.points).toHaveLength(3);
      expect(both.strips[0]!.points).toHaveLength(4);
      expect(none.strips[0]!.points).toHaveLength(4);

      // both 모드의 시작/끝 정점은 중심선 양끝점과 정확히 일치한다
      const bStrip = both.strips[0]!;
      expect(bStrip.points[0]!.x).toBeCloseTo(bStrip.centerline[0]!.x, 5);
      expect(bStrip.points[0]!.y).toBeCloseTo(bStrip.centerline[0]!.y, 5);
      expect(bStrip.points[2]!.x).toBeCloseTo(bStrip.centerline[1]!.x, 5);
      expect(bStrip.points[2]!.y).toBeCloseTo(bStrip.centerline[1]!.y, 5);
    });

    it("사각형 및 사선 다각형 컷 프레임 클리핑 시 단 하나의 정점도 컷 경계를 벗어나지 않는다", () => {
      const rectClip: CutFrameClip = { kind: "rect", x: 30, y: 20, width: 220, height: 160 };
      const rectRes = generateConcentrationEffectLines({
        seed: 2026,
        center: { x: 140, y: 100 },
        innerRadiusX: 30,
        innerRadiusY: 25,
        outerRadius: 320,
        lineCount: 64,
        baseWidth: 3.5,
        taperMode: "inward",
        clipFrame: rectClip,
      });
      expect(rectRes.stats.clippedStripCount).toBeGreaterThan(0);
      for (const strip of rectRes.strips) {
        for (const pt of strip.points) {
          expect(isPointInsideCutFrame(pt, rectClip, 1e-4)).toBe(true);
        }
      }

      const diagonalClip: CutFrameClip = {
        kind: "polygon",
        vertices: [
          { x: 40, y: 20 },
          { x: 260, y: 50 },
          { x: 230, y: 190 },
          { x: 20, y: 170 },
        ],
      };
      const polyRes = generateConcentrationEffectLines({
        seed: 2027,
        center: { x: 140, y: 105 },
        innerRadiusX: 25,
        innerRadiusY: 25,
        outerRadius: 300,
        lineCount: 48,
        baseWidth: 3,
        clipFrame: diagonalClip,
      });
      expect(polyRes.stats.clippedStripCount).toBeGreaterThan(0);
      for (const strip of polyRes.strips) {
        for (const pt of strip.points) {
          expect(isPointInsideCutFrame(pt, diagonalClip, 1e-4)).toBe(true);
        }
      }
    });
  });

  describe("스피드선 (임의 각도·가변 굵기·파선 분할)", () => {
    it("임의 각도(37°)와 가변 굵기 범위를 정확히 지키고 파선 모드에서 다중 세그먼트로 분할된다", () => {
      const angleDeg = 37;
      const expectedDirX = Math.cos((angleDeg * Math.PI) / 180);
      const expectedDirY = Math.sin((angleDeg * Math.PI) / 180);

      const solid = generateSpeedEffectLines({
        seed: 55,
        center: { x: 200, y: 150 },
        angleDeg,
        spanWidth: 200,
        length: 300,
        lineCount: 16,
        minWidth: 1.0,
        maxWidth: 4.5,
        dashEnabled: false,
      });
      expect(solid.strips).toHaveLength(16);
      for (const strip of solid.strips) {
        expect(strip.width).toBeGreaterThanOrEqual(1.0);
        expect(strip.width).toBeLessThanOrEqual(4.5);
        const dx = strip.centerline[1]!.x - strip.centerline[0]!.x;
        const dy = strip.centerline[1]!.y - strip.centerline[0]!.y;
        const len = Math.hypot(dx, dy);
        const dot = (dx / len) * expectedDirX + (dy / len) * expectedDirY;
        expect(Math.abs(dot)).toBeCloseTo(1, 5);
      }

      const dashed = generateSpeedEffectLines({
        seed: 55,
        center: { x: 200, y: 150 },
        angleDeg,
        spanWidth: 200,
        length: 320,
        lineCount: 16,
        minWidth: 1.0,
        maxWidth: 4.5,
        dashEnabled: true,
        dashLength: 45,
        gapLength: 20,
      });
      expect(dashed.strips.length).toBeGreaterThan(16 * 2);
    });
  });

  describe("유선 (3차 베지어 곡선 추적 흐름선)", () => {
    it("생성된 각 유선이 기준 3차 베지어 곡선의 법선 오프셋 궤적을 정확히 추적한다", () => {
      const curve: CubicBezierControlPoints = [
        { x: 20, y: 200 },
        { x: 100, y: 30 },
        { x: 240, y: 210 },
        { x: 340, y: 40 },
      ];
      const res = generateFlowEffectLines({
        seed: 314,
        curve,
        lineCount: 9,
        bandWidth: 64,
        minWidth: 1.2,
        maxWidth: 2.8,
        samplesPerLine: 16,
        unevenSpacing: 0,
        offsetJitter: 0,
        trimJitter: 0,
        taperMode: "both",
      });

      expect(res.strips).toHaveLength(9);
      // 중앙선(index 4, u = 0)은 기준 베지어 곡선과 0px 오차로 일치한다
      const middle = res.strips[4]!;
      expect(middle.centerline).toHaveLength(17);
      middle.centerline.forEach((pt, idx) => {
        const expected = evaluateCubicBezierPoint(curve, idx / 16);
        expect(pt.x).toBeCloseTo(expected.x, 5);
        expect(pt.y).toBeCloseTo(expected.y, 5);
      });

      // 최외곽 유선(index 8, u = +1)은 기준 곡선 + 법선*(bandWidth/2)와 일치한다
      const outer = res.strips[8]!;
      const tMid = 0.5;
      const baseMid = evaluateCubicBezierPoint(curve, tMid);
      const tanMid = evaluateCubicBezierTangent(curve, tMid);
      const expectedOuterMid = { x: baseMid.x - tanMid.y * 32, y: baseMid.y + tanMid.x * 32 };
      expect(outer.centerline[8]!.x).toBeCloseTo(expectedOuterMid.x, 4);
      expect(outer.centerline[8]!.y).toBeCloseTo(expectedOuterMid.y, 4);
    });

    it("파선 유선 및 컷 클리핑 조합에서도 모든 정점이 컷 프레임 내부로 제한된다", () => {
      const frame: CutFrameClip = { kind: "rect", x: 50, y: 40, width: 240, height: 150 };
      const res = generateFlowEffectLines({
        seed: 88,
        curve: [
          { x: 0, y: 210 },
          { x: 110, y: 0 },
          { x: 250, y: 230 },
          { x: 360, y: 20 },
        ],
        lineCount: 10,
        bandWidth: 80,
        minWidth: 1,
        maxWidth: 3,
        dashEnabled: true,
        dashLength: 42,
        gapLength: 18,
        clipFrame: frame,
      });
      expect(res.strips.length).toBeGreaterThan(10);
      expect(res.stats.clippedStripCount).toBeGreaterThan(0);
      for (const strip of res.strips) {
        for (const pt of strip.points) {
          expect(isPointInsideCutFrame(pt, frame, 1e-4)).toBe(true);
        }
      }
    });
  });

  describe("폭발선 (별형 충격파 + 외곽 컷 프레임 클리핑)", () => {
    it("별형 충격파·스파이크 웨지·보조 파열선이 외곽 컷 프레임 경계로 정밀 클리핑된다", () => {
      const cutFrame: CutFrameClip = { kind: "rect", x: 40, y: 30, width: 200, height: 150 };
      for (const burstStyle of ["star-shockwave", "spike-wedges", "star-plus-rays"] as const) {
        const res = generateBurstEffectLines({
          seed: 707,
          center: { x: 140, y: 105 },
          innerRadiusX: 36,
          innerRadiusY: 28,
          outerRadius: 210,
          spikeCount: 16,
          spikeJitter: 0.25,
          burstStyle,
          baseWidth: 3,
          secondaryRayCount: 20,
          clipFrame: cutFrame,
        });
        expect(res.strips.length).toBeGreaterThan(0);
        expect(res.stats.clippedStripCount).toBeGreaterThan(0);
        for (const strip of res.strips) {
          for (const pt of strip.points) {
            expect(isPointInsideCutFrame(pt, cutFrame, 1e-4)).toBe(true);
          }
        }
      }
    });
  });

  describe("클리핑 헬퍼 · SVG 직렬화 · 스튜디오 요소 패치 브리지", () => {
    it("폴리곤/선분 클리핑 및 SVG 직렬화(색상 살균 포함)와 요소 패치 브리지가 안전하게 동작한다", () => {
      const frame: CutFrameClip = { kind: "rect", x: 0, y: 0, width: 100, height: 100 };
      const clippedPoly = clipPolygonToCutFrame(
        [
          { x: -50, y: 20 },
          { x: 150, y: 20 },
          { x: 150, y: 80 },
          { x: -50, y: 80 },
        ],
        frame,
      );
      expect(clippedPoly.clipped).toBe(true);
      expect(clippedPoly.points).toHaveLength(4);
      for (const pt of clippedPoly.points) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(100);
      }

      const clippedSeg = clipSegmentToCutFrame({ x: -20, y: 50 }, { x: 140, y: 50 }, frame);
      expect(clippedSeg).not.toBeNull();
      expect(clippedSeg![0].x).toBeCloseTo(0, 6);
      expect(clippedSeg![1].x).toBeCloseTo(100, 6);

      const res = generateProceduralEffectLines(PROCEDURAL_EFFECT_LINE_PRESETS[0]!.config);
      const svg = renderProceduralEffectLinesToSvg(res, {
        width: 360,
        height: 240,
        fill: "\" onload=\"alert(1)",
        background: "#ffffff",
      });
      expect(svg).toContain('fill="currentColor"');
      expect(svg).not.toContain("alert(1)");
      expect(svg).toContain('fill="#ffffff"');

      const focusPatch = proceduralEffectToStudioElementPatch(
        PROCEDURAL_EFFECT_LINE_PRESETS[0]!.config,
        "focusLines",
      );
      expect(focusPatch).toMatchObject({ lineCount: 54 });

      const speedPatch = proceduralEffectToStudioElementPatch(
        PROCEDURAL_EFFECT_LINE_PRESETS[1]!.config,
        "speedLines",
      );
      expect(speedPatch).toMatchObject({ lineCount: 28, direction: "horizontal" });
    });
  });
});
