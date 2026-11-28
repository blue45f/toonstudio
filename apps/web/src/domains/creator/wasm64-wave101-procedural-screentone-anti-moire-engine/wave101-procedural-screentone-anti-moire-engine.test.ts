import { describe, expect, it } from "vitest";
import {
  BAND_LIMIT_END_CYC_PER_PX,
  BAND_LIMIT_START_CYC_PER_PX,
  NYQUIST_LIMIT_CYC_PER_PX,
  analyzeScreentoneMoireRisk,
  analyzeStackedToneAngleMoire,
  applyPaperDotGain,
  auditMultiViewportToneSafety,
  buildAntiMoireScreentoneWgsl,
  compareNaiveVsAntiMoireDownscale,
  computeDotGainCompensatedDensity,
  computeNearestIntegerBeatDistance,
  getDeterministicBlueNoiseMatrix,
  normalizeScreentoneSpec,
  renderScreentoneMoireAuditSvg,
  summarizeScreentoneAuditKo,
  synthesizeAntiMoireScreentoneTile,
  validateAntiMoireWgsl,
  type ScreentonePatternKind,
  type ScreentonePatternSpec,
} from "./index";

const ALL_PATTERN_KINDS: readonly ScreentonePatternKind[] = [
  "circle-dot",
  "diamond-dot",
  "line-hatch",
  "cross-hatch",
  "blue-noise-stipple",
  "radial-speed-tone",
];

function makeBaseSpec(overrides?: Partial<ScreentonePatternSpec>): ScreentonePatternSpec {
  return {
    kind: "circle-dot",
    lpi: 60,
    sourceDpi: 600,
    angleDeg: 45,
    density: 0.5,
    dotGainPercent: 0,
    seed: 101,
    ...overrides,
  };
}

describe("Wave 101: 실시간 스크린톤 물리 합성 & 나이퀴스트 모아레 제거 엔진", () => {
  describe("1. 2D 푸리에 / 나이퀴스트 모아레 주파수 해석", () => {
    it("60 LPI @ 600 DPI 1:1 인쇄 배율은 0.10 cyc/px로 safe 판정을 내린다", () => {
      const result = analyzeScreentoneMoireRisk(makeBaseSpec(), {
        id: "print-1to1",
        sourceWidthPx: 2400,
        targetWidthPx: 2400,
      });

      expect(result.cyclesPerPixel).toBeCloseTo(0.1, 6);
      expect(result.nyquistRatio).toBeCloseTo(0.2, 6);
      expect(result.bandLimitAlpha).toBe(0);
      expect(result.riskLevel).toBe("safe");
      expect(result.moireRiskScore).toBeLessThan(20);
    });

    it("60 LPI @ 600 DPI를 모바일 4배 축소하면 0.40 cyc/px 이상으로 severe-moire를 경보한다", () => {
      const result = analyzeScreentoneMoireRisk(makeBaseSpec(), {
        id: "mobile-4x",
        sourceWidthPx: 1440,
        targetWidthPx: 360,
      });

      expect(result.downscaleFactor).toBeCloseTo(4, 6);
      expect(result.cyclesPerPixel).toBeCloseTo(0.4, 6);
      expect(result.riskLevel).toBe("severe-moire");
      expect(result.moireRiskScore).toBeGreaterThanOrEqual(65);
      expect(result.bandLimitAlpha).toBeGreaterThan(0.5);
    });

    it("회전각(0°, 45°, 75°)에 따라 2D 기본 격자 파수 벡터 (kx, ky)를 정확히 산출한다", () => {
      const r0 = analyzeScreentoneMoireRisk(makeBaseSpec({ angleDeg: 0 }), {
        sourceWidthPx: 2000,
        targetWidthPx: 1000,
      });
      const r45 = analyzeScreentoneMoireRisk(makeBaseSpec({ angleDeg: 45 }), {
        sourceWidthPx: 2000,
        targetWidthPx: 1000,
      });
      const r75 = analyzeScreentoneMoireRisk(makeBaseSpec({ angleDeg: 75 }), {
        sourceWidthPx: 2000,
        targetWidthPx: 1000,
      });

      expect(r0.wavevectorPrimary.kx).toBeCloseTo(0.2, 6);
      expect(r0.wavevectorPrimary.ky).toBeCloseTo(0, 6);

      expect(r45.wavevectorPrimary.kx).toBeCloseTo(0.2 * Math.SQRT1_2, 6);
      expect(r45.wavevectorPrimary.ky).toBeCloseTo(0.2 * Math.SQRT1_2, 6);
      expect(r45.wavevectorSecondary).not.toBeNull();

      const rad75 = (75 * Math.PI) / 180;
      expect(r75.wavevectorPrimary.kx).toBeCloseTo(0.2 * Math.cos(rad75), 6);
      expect(r75.wavevectorPrimary.ky).toBeCloseTo(0.2 * Math.sin(rad75), 6);
    });

    it("1D 사선 해칭은 직교 2차 격자 벡터를 null로 반환한다", () => {
      const result = analyzeScreentoneMoireRisk(makeBaseSpec({ kind: "line-hatch" }), {
        sourceWidthPx: 1000,
        targetWidthPx: 1000,
      });
      expect(result.wavevectorSecondary).toBeNull();
    });

    it("정수 격자 폴딩 맥놀이 거리 min(|k - n|)을 정확히 계산하고 1.0 cyc/px 공명에서도 severe-moire를 유지한다", () => {
      expect(computeNearestIntegerBeatDistance(0.1)).toBeCloseTo(0.1, 6);
      expect(computeNearestIntegerBeatDistance(0.48)).toBeCloseTo(0.48, 6);
      expect(computeNearestIntegerBeatDistance(0.5)).toBeCloseTo(0.5, 6);
      expect(computeNearestIntegerBeatDistance(0.98)).toBeCloseTo(0.02, 6);
      expect(computeNearestIntegerBeatDistance(1.0)).toBeCloseTo(0, 6);

      const resonance = analyzeScreentoneMoireRisk(makeBaseSpec({ lpi: 60, sourceDpi: 600 }), {
        sourceWidthPx: 3600,
        targetWidthPx: 360,
      });
      expect(resonance.cyclesPerPixel).toBeCloseTo(1.0, 6);
      expect(resonance.fundamentalBeatDistance).toBeCloseTo(0, 6);
      expect(resonance.riskLevel).toBe("severe-moire");
      expect(resonance.moireRiskScore).toBeGreaterThanOrEqual(90);
    });

    it("동일 고축소 주파수에서 블루노이즈 모래톤은 주기적 원형 망점보다 모아레 위험이 현저히 낮다", () => {
      const vp = { sourceWidthPx: 1440, targetWidthPx: 360 };
      const dotRisk = analyzeScreentoneMoireRisk(makeBaseSpec({ kind: "circle-dot" }), vp);
      const stippleRisk = analyzeScreentoneMoireRisk(
        makeBaseSpec({ kind: "blue-noise-stipple" }),
        vp,
      );

      expect(dotRisk.riskLevel).toBe("severe-moire");
      expect(stippleRisk.moireRiskScore).toBeLessThan(dotRisk.moireRiskScore * 0.5);
      expect(stippleRisk.riskLevel).not.toBe("severe-moire");
    });

    it("완전 백지(density=0)와 베타 흑색(density=1)은 무변조이므로 모아레 위험이 0이다", () => {
      const vp = { sourceWidthPx: 1440, targetWidthPx: 360 };
      const blank = analyzeScreentoneMoireRisk(makeBaseSpec({ density: 0 }), vp);
      const solid = analyzeScreentoneMoireRisk(makeBaseSpec({ density: 1 }), vp);

      expect(blank.moireRiskScore).toBe(0);
      expect(blank.riskLevel).toBe("safe");
      expect(solid.moireRiskScore).toBe(0);
      expect(solid.riskLevel).toBe("safe");
    });

    it("중간 축소 구간(0.25~0.34 cyc/px)에서는 caution 등급을 반환한다", () => {
      const mid = analyzeScreentoneMoireRisk(makeBaseSpec({ lpi: 60, sourceDpi: 600 }), {
        sourceWidthPx: 2800,
        targetWidthPx: 1000,
      });
      expect(mid.cyclesPerPixel).toBeCloseTo(0.28, 6);
      expect(mid.riskLevel).toBe("caution");
      expect(mid.moireRiskScore).toBeGreaterThanOrEqual(32);
      expect(mid.moireRiskScore).toBeLessThan(65);
    });
  });

  describe("2. 2레이어 오버프린트 겹침 각도 모아레 & 멀티 뷰포트 감사", () => {
    it("45° + 48°(3° 충돌) 겹침은 severe-moire를 판정하고 30° 이상 분리된 75°를 제안한다", () => {
      const analysis = analyzeStackedToneAngleMoire(
        makeBaseSpec({ angleDeg: 45 }),
        makeBaseSpec({ angleDeg: 48 }),
      );

      expect(analysis.effectiveAngleSeparationDeg).toBeCloseTo(3, 3);
      expect(analysis.patternClassification).toBe("angle-clash-moire");
      expect(analysis.riskLevel).toBe("severe-moire");
      expect(analysis.beatPeriodMm).toBeGreaterThan(5);
      expect(analysis.recommendedLayerBAngleDeg).toBe(75);
      expect(analysis.alternateLayerBAngleDeg).toBe(15);
    });

    it("45° + 75°(30° 클래식 로제트) 겹침은 안전하게 통과한다", () => {
      const analysis = analyzeStackedToneAngleMoire(
        makeBaseSpec({ angleDeg: 45 }),
        makeBaseSpec({ angleDeg: 75 }),
      );

      expect(analysis.effectiveAngleSeparationDeg).toBeCloseTo(30, 3);
      expect(analysis.patternClassification).toBe("classic-rosette");
      expect(analysis.riskLevel).toBe("safe");
      expect(analysis.moireRiskScore).toBeLessThan(25);
    });

    it("90° 격자 대칭성을 반영해 45° + 138° 원형 망점 겹침도 3° 충돌로 탐지한다", () => {
      const analysis = analyzeStackedToneAngleMoire(
        makeBaseSpec({ kind: "circle-dot", angleDeg: 45 }),
        makeBaseSpec({ kind: "circle-dot", angleDeg: 138 }),
      );

      expect(analysis.effectiveAngleSeparationDeg).toBeCloseTo(3, 3);
      expect(analysis.riskLevel).toBe("severe-moire");
      expect(analysis.patternClassification).toBe("angle-clash-moire");
    });

    it("1D 평행 사선 해칭 두 레이어의 45° + 135° 직교 겹침은 90° 분리로 안전하다", () => {
      const analysis = analyzeStackedToneAngleMoire(
        makeBaseSpec({ kind: "line-hatch", angleDeg: 45 }),
        makeBaseSpec({ kind: "line-hatch", angleDeg: 135 }),
      );

      expect(analysis.effectiveAngleSeparationDeg).toBeCloseTo(90, 3);
      expect(analysis.riskLevel).toBe("safe");
    });

    it("블루노이즈 모래톤을 오버레이로 겹치면 주기 충돌이 없어 stochastic-safe로 판정한다", () => {
      const analysis = analyzeStackedToneAngleMoire(
        makeBaseSpec({ kind: "circle-dot", angleDeg: 45 }),
        makeBaseSpec({ kind: "blue-noise-stipple", angleDeg: 46 }),
      );

      expect(analysis.patternClassification).toBe("stochastic-safe");
      expect(analysis.riskLevel).toBe("safe");
    });

    it("표준 멀티 뷰포트 감사(600dpi B5 / 1440px / 800px / 360px)가 각 해상도 위험을 정확히 분류한다", () => {
      const audit = auditMultiViewportToneSafety(makeBaseSpec({ lpi: 60, sourceDpi: 600 }), {
        overlaySpec: makeBaseSpec({ angleDeg: 75 }),
      });

      expect(audit.viewports).toHaveLength(4);
      const printVp = audit.viewports.find((v) => v.viewportId === "print-b5-600dpi");
      const webtoonVp = audit.viewports.find((v) => v.viewportId === "webtoon-800px");
      const mobileVp = audit.viewports.find((v) => v.viewportId === "mobile-360px");

      expect(printVp?.riskLevel).toBe("safe");
      expect(printVp?.cyclesPerPixel).toBeCloseTo(0.1, 4);
      expect(webtoonVp?.riskLevel).toBe("severe-moire");
      expect(mobileVp?.riskLevel).toBe("severe-moire");
      expect(audit.stackedAngleAnalysis?.riskLevel).toBe("safe");
      expect(audit.recommendedPrintProfile).toBe("print-1bit-halftone");
      expect(audit.recommendedWebProfile).toBe("anti-moire-blue-noise-web");
    });
  });

  describe("3. 용지 도트 게인(Dot Gain) 물리 번짐 및 역보정", () => {
    it("dotGainPercent 증가에 따라 중간톤 실질 잉크 농도가 단조 증가하고 0/1 경계를 유지한다", () => {
      const gains = [0, 5, 10, 15, 20, 25];
      const effectiveValues = gains.map((g) => applyPaperDotGain(0.5, g));

      for (let i = 1; i < effectiveValues.length; i += 1) {
        expect(effectiveValues[i]).toBeGreaterThan(effectiveValues[i - 1]);
      }
      expect(effectiveValues[0]).toBeCloseTo(0.5, 9);
      expect(effectiveValues[effectiveValues.length - 1]).toBeCloseTo(0.75, 9);
      expect(applyPaperDotGain(0, 20)).toBe(0);
      expect(applyPaperDotGain(1, 20)).toBe(1);
    });

    it("역보정 함수 computeDotGainCompensatedDensity는 applyPaperDotGain과 왕복 일치한다", () => {
      const targets = [0.1, 0.25, 0.5, 0.75, 0.9];
      const gains = [0, 6, 12, 18, 25];

      for (const target of targets) {
        for (const gain of gains) {
          const pre = computeDotGainCompensatedDensity(target, gain);
          const printed = applyPaperDotGain(pre, gain);
          expect(printed).toBeCloseTo(target, 9);
        }
      }
    });

    it("타일 합성에서도 도트 게인 증가 시 평균 명도가 단조 감소하고 역보정으로 원 목표 명도를 복원한다", () => {
      const t0 = synthesizeAntiMoireScreentoneTile(
        makeBaseSpec({ density: 0.5, dotGainPercent: 0 }),
        { cyclesPerPixel: 0.12 },
      );
      const t15 = synthesizeAntiMoireScreentoneTile(
        makeBaseSpec({ density: 0.5, dotGainPercent: 15 }),
        { cyclesPerPixel: 0.12 },
      );
      const preCompDensity = computeDotGainCompensatedDensity(0.5, 15);
      const tCompensated = synthesizeAntiMoireScreentoneTile(
        makeBaseSpec({ density: preCompDensity, dotGainPercent: 15 }),
        { cyclesPerPixel: 0.12 },
      );

      expect(t15.measuredDensity).toBeGreaterThan(t0.measuredDensity + 0.1);
      expect(t15.measuredLuminance).toBeLessThan(t0.measuredLuminance - 0.1);
      expect(Math.abs(tCompensated.measuredDensity - 0.5)).toBeLessThanOrEqual(0.025);
    });
  });

  describe("4. 대역제한 안티모아레 스크린톤 합성 및 명도 보존", () => {
    it("6종 전체 패턴과 농도(0.2, 0.5, 0.8)에서 합성 평균 잉크 면적률이 목표 농도를 ±0.03 이내로 보존한다", () => {
      const densities = [0.2, 0.5, 0.8];

      for (const kind of ALL_PATTERN_KINDS) {
        for (const density of densities) {
          const tile = synthesizeAntiMoireScreentoneTile(
            makeBaseSpec({ kind, density, angleDeg: 45 }),
            { width: 64, height: 64, cyclesPerPixel: 0.12 },
          );
          expect(tile.nonFinitePixelCount).toBe(0);
          expect(Math.abs(tile.measuredDensity - density)).toBeLessThanOrEqual(0.03);
        }
      }
    });

    it("전체 뷰포트 축소 배율(0.10 -> 0.35 -> 0.48 -> 0.75 cyc/px)에 걸쳐 지각 명도 오차가 2.5% 이내다", () => {
      const frequencies = [0.1, 0.25, 0.35, 0.48, 0.75];

      for (const freq of frequencies) {
        const tile = synthesizeAntiMoireScreentoneTile(
          makeBaseSpec({ kind: "circle-dot", density: 0.45, angleDeg: 45 }),
          { width: 64, height: 64, cyclesPerPixel: freq },
        );
        expect(tile.nonFinitePixelCount).toBe(0);
        expect(tile.luminanceDrift).toBeLessThanOrEqual(0.025);
      }
    });

    it("동일 입력으로 합성하면 비트 단위로 완전히 동일한 결정론적 버퍼를 생성한다", () => {
      const spec = makeBaseSpec({ kind: "cross-hatch", density: 0.4, seed: 777 });
      const tileA = synthesizeAntiMoireScreentoneTile(spec, { cyclesPerPixel: 0.33 });
      const tileB = synthesizeAntiMoireScreentoneTile(spec, { cyclesPerPixel: 0.33 });

      expect(tileA.luminanceBuffer.length).toBe(64 * 64);
      expect(Array.from(tileA.luminanceBuffer)).toEqual(Array.from(tileB.luminanceBuffer));
    });

    it("인쇄 배율(0.10 cyc/px)에서는 bandLimitAlpha=0으로 선명한 고대비 망점 분산을 유지한다", () => {
      const tile = synthesizeAntiMoireScreentoneTile(
        makeBaseSpec({ kind: "circle-dot", density: 0.5 }),
        { cyclesPerPixel: 0.1 },
      );

      expect(tile.bandLimitAlpha).toBe(0);
      expect(tile.pixelVariance).toBeGreaterThan(0.14);
      expect(tile.luminanceDrift).toBeLessThanOrEqual(0.02);
    });

    it("방사형 집중선 톤은 중심 허브에서 자동 국소 대역제한을 적용하고 전체 농도를 보존한다", () => {
      const tile = synthesizeAntiMoireScreentoneTile(
        makeBaseSpec({ kind: "radial-speed-tone", density: 0.5 }),
        { width: 64, height: 64, cyclesPerPixel: 0.15 },
      );

      expect(tile.nonFinitePixelCount).toBe(0);
      expect(Math.abs(tile.measuredDensity - 0.5)).toBeLessThanOrEqual(0.03);
      // 중심 픽셀(32, 32)은 국소 주파수 과밀로 인해 연속 명도(0.5 부근)로 부드럽게 수렴
      const centerLuma = tile.luminanceBuffer[32 * 64 + 32];
      expect(Math.abs(centerLuma - 0.5)).toBeLessThan(0.1);
    });

    it("16x16 Void-and-Cluster 블루노이즈 행렬은 정확히 0.5 평균과 균일 분포를 만족한다", () => {
      const matrix = getDeterministicBlueNoiseMatrix();
      expect(matrix.length).toBe(256);

      let sum = 0;
      let minVal = 1;
      let maxVal = 0;
      for (let i = 0; i < matrix.length; i += 1) {
        sum += matrix[i];
        if (matrix[i] < minVal) minVal = matrix[i];
        if (matrix[i] > maxVal) maxVal = matrix[i];
      }
      expect(sum / matrix.length).toBeCloseTo(0.5, 5);
      expect(minVal).toBeCloseTo(0.5 / 256, 5);
      expect(maxVal).toBeCloseTo(255.5 / 256, 5);
    });
  });

  describe("5. 단순 점샘플링 vs Wave 101 안티모아레 실제 맥놀이 분산 저감 검증", () => {
    it("심각한 나이퀴스트 에일리어싱(0.48 cyc/px, 45° 원형 망점)에서 맥놀이 분산을 60% 이상 감쇠한다", () => {
      const cmp = compareNaiveVsAntiMoireDownscale(
        makeBaseSpec({ kind: "circle-dot", angleDeg: 45, density: 0.5 }),
        { tileSize: 64, cyclesPerPixel: 0.48 },
      );

      expect(cmp.naiveTile.nonFinitePixelCount).toBe(0);
      expect(cmp.antiMoireTile.nonFinitePixelCount).toBe(0);
      expect(cmp.naiveBeatVariance).toBeGreaterThan(0.005);
      expect(cmp.antiMoireBeatVariance).toBeLessThan(cmp.naiveBeatVariance * 0.4);
      expect(cmp.beatVarianceReductionRatio).toBeGreaterThanOrEqual(0.6);
      expect(cmp.toneConservationPassed).toBe(true);
    });

    it("0° 및 15° 평행 해칭·크로스해칭(0.48 cyc/px)에서도 맥놀이 분산을 60% 이상 감쇠하고 명도를 보존한다", () => {
      const cases: readonly ScreentonePatternSpec[] = [
        makeBaseSpec({ kind: "line-hatch", angleDeg: 0, density: 0.5 }),
        makeBaseSpec({ kind: "line-hatch", angleDeg: 15, density: 0.45 }),
        makeBaseSpec({ kind: "cross-hatch", angleDeg: 15, density: 0.5 }),
      ];

      for (const spec of cases) {
        const cmp = compareNaiveVsAntiMoireDownscale(spec, {
          tileSize: 64,
          cyclesPerPixel: 0.48,
        });
        expect(cmp.naiveBeatVariance).toBeGreaterThan(0.005);
        expect(cmp.beatVarianceReductionRatio).toBeGreaterThanOrEqual(0.6);
        expect(cmp.antiMoireLuminanceDrift).toBeLessThanOrEqual(0.025);
        expect(cmp.toneConservationPassed).toBe(true);
      }
    });

    it("마름모 망점(0.47 cyc/px) 축소에서도 맥놀이 분산 저감률 >= 60% 및 0 NaN을 보장한다", () => {
      const cmp = compareNaiveVsAntiMoireDownscale(
        makeBaseSpec({ kind: "diamond-dot", angleDeg: 30, density: 0.5 }),
        { tileSize: 64, cyclesPerPixel: 0.47 },
      );

      expect(cmp.antiMoireTile.nonFinitePixelCount).toBe(0);
      expect(cmp.beatVarianceReductionRatio).toBeGreaterThanOrEqual(0.6);
      expect(cmp.toneConservationPassed).toBe(true);
    });
  });

  describe("6. WebGPU WGSL fwidth 안티모아레 셰이더 생성 및 구조 검증", () => {
    it("6종 전체 패턴 모드에 대해 유효한 WGSL fwidth/dpdx/dpdy 셰이더를 생성하고 검증을 통과한다", () => {
      for (const kind of ALL_PATTERN_KINDS) {
        const artifact = buildAntiMoireScreentoneWgsl(kind);
        const report = validateAntiMoireWgsl(artifact);

        expect(report.valid).toBe(true);
        expect(report.errors).toEqual([]);
        expect(artifact.uniformBufferByteLength).toBe(64);
        expect(artifact.usesScreenSpaceDerivatives).toBe(true);
        expect(artifact.wgsl).toContain("fwidth(");
        expect(artifact.wgsl).toContain("dpdx(");
        expect(artifact.wgsl).toContain("dpdy(");
        expect(artifact.wgsl).toContain("smoothstep(");
      }
    });

    it("결함이 있는 WGSL(fwidth 누락, 괄호 불균형, GLSL 키워드, NaN)을 정확히 거부한다", () => {
      const broken = validateAntiMoireWgsl(`
        @group(0) @binding(0) var<uniform> u: vec4<f32>;
        @fragment fn fs() -> @location(0) vec4<f32> {
          let x = NaN;
          gl_FragColor = vec4(1.0);
          return vec4<f32>(x);
      `);

      expect(broken.valid).toBe(false);
      expect(broken.errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("7. OKLCH 감사 SVG, XML 이스케이프, 자연스러운 한국어 리포트 & 입력 안전성", () => {
    it("감사 SVG는 순수 OKLCH 색상만 사용하고 raw hex/rgb 및 NaN/Infinity가 전혀 없다", () => {
      const spec = makeBaseSpec({ lpi: 60, sourceDpi: 600, angleDeg: 45, density: 0.5 });
      const audit = auditMultiViewportToneSafety(spec, {
        overlaySpec: makeBaseSpec({ angleDeg: 48 }),
      });
      const cmp = compareNaiveVsAntiMoireDownscale(spec, { cyclesPerPixel: 0.48 });

      const lightSvg = renderScreentoneMoireAuditSvg(audit, cmp, { theme: "light" });
      const darkSvg = renderScreentoneMoireAuditSvg(audit, cmp, { theme: "dark" });

      for (const svg of [lightSvg, darkSvg]) {
        expect(svg.startsWith("<svg ")).toBe(true);
        expect(svg.endsWith("</svg>")).toBe(true);
        expect(svg).toContain("oklch(");
        expect(svg).toContain("0.50 Nyquist");
        expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(svg).not.toMatch(/\brgba?\s*\(/i);
        expect(svg).not.toMatch(/\bhsla?\s*\(/i);
        expect(svg).not.toContain("NaN");
        expect(svg).not.toContain("Infinity");
      }
    });

    it("SVG 제목과 뷰포트 라벨의 악성 XML/스크립트 문자를 안전하게 이스케이프한다", () => {
      const spec = makeBaseSpec();
      const audit = auditMultiViewportToneSafety(spec, {
        customViewports: [
          {
            id: "xss-vp",
            labelKo: `<script>alert("x")</script> & 'test'`,
            sourceWidthPx: 1440,
            targetWidthPx: 360,
          },
        ],
      });
      const cmp = compareNaiveVsAntiMoireDownscale(spec, { cyclesPerPixel: 0.48 });
      const svg = renderScreentoneMoireAuditSvg(audit, cmp, {
        title: `테스트 <tag> & "quote"`,
      });

      expect(svg).not.toContain("<script>");
      expect(svg).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
      expect(svg).toContain("&lt;tag&gt; &amp; &quot;quote&quot;");
    });

    it("한국어 스튜디오 QA 리포트는 핵심 수치·권장 프로파일을 담고 번역투 금지 표현을 배제한다", () => {
      const spec = makeBaseSpec({ lpi: 60, sourceDpi: 600, angleDeg: 45, density: 0.5 });
      const audit = auditMultiViewportToneSafety(spec, {
        overlaySpec: makeBaseSpec({ angleDeg: 48 }),
      });
      const cmp = compareNaiveVsAntiMoireDownscale(spec, { cyclesPerPixel: 0.48 });
      const report = summarizeScreentoneAuditKo(audit, cmp);

      expect(report.patternLabelKo).toBe("원형 망점");
      expect(report.fullTextKo).toContain("60 LPI");
      expect(report.fullTextKo).toContain("360px 모바일");
      expect(report.fullTextKo).toContain("800px 웹툰");
      expect(report.fullTextKo).toContain("75°");
      expect(report.fullTextKo).toContain("지각 명도 보존율");
      expect(report.bulletLinesKo).toHaveLength(6);

      // 번역투 금지 문구 검사
      expect(report.fullTextKo).not.toContain("가능하게 합니다");
      expect(report.fullTextKo).not.toContain("직관적인 경험을 제공합니다");
      expect(report.fullTextKo).not.toContain("원활한 워크플로우를 보장합니다");
    });

    it("비정상/NaN 입력값도 예외나 NaN 없이 안전한 경계값으로 정규화한다", () => {
      const normalized = normalizeScreentoneSpec({
        kind: "circle-dot",
        lpi: Number.NaN,
        sourceDpi: -100,
        angleDeg: -45,
        density: 2.5,
        dotGainPercent: 99,
      });

      expect(normalized.lpi).toBe(1);
      expect(normalized.sourceDpi).toBe(36);
      expect(normalized.angleDeg).toBe(135);
      expect(normalized.density).toBe(1);
      expect(normalized.dotGainPercent).toBe(25);
      expect(NYQUIST_LIMIT_CYC_PER_PX).toBe(0.5);
      expect(BAND_LIMIT_START_CYC_PER_PX).toBe(0.25);
      expect(BAND_LIMIT_END_CYC_PER_PX).toBe(0.5);

      const safeRisk = analyzeScreentoneMoireRisk(normalized, {
        sourceWidthPx: Number.NaN,
        targetWidthPx: 0,
      });
      expect(Number.isFinite(safeRisk.cyclesPerPixel)).toBe(true);
      expect(Number.isFinite(safeRisk.moireRiskScore)).toBe(true);
    });
  });
});
