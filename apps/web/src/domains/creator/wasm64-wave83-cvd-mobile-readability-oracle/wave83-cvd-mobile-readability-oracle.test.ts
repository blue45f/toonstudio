import { describe, expect, it } from "vitest";
import {
  auditAndSuggestMinimalReadabilityFixes,
  buildReadabilityOracleScorecard,
  computeApcaContrastLc,
  computeCiede2000DeltaE,
  computeCvdOklchDeltaE,
  computeCvdSeparationSnapshot,
  computeHueDistanceDeg,
  computeOklchDeltaE,
  computeOutdoorWcagRatio,
  computeRelativeLuminance,
  computeWcagContrastRatio,
  formatOklchCss,
  getMachadoCvdMatrix,
  hexToRgb,
  linearChannelToSrgb,
  oklchToSrgbGamutMapped,
  rgbToHex,
  rgbToOklch,
  simulateCvdRgb,
  simulateCvdRgbaBuffer,
  simulateMobileViewingEnvironment,
  solveMinimalOklchColorAdjustment,
  srgbChannelToLinear,
  type CvdType,
  type RgbColor,
} from "./index";

const ALL_CVD_TYPES: readonly CvdType[] = [
  "protanopia", "protanomaly", "deuteranopia", "deuteranomaly",
  "tritanopia", "tritanomaly", "achromatopsia",
];
const BLACK: RgbColor = { r: 0, g: 0, b: 0 };
const WHITE: RgbColor = { r: 255, g: 255, b: 255 };
const HERO_RED: RgbColor = { r: 210, g: 48, b: 42 };
const FOREST_GREEN: RgbColor = { r: 56, g: 152, b: 58 };

function maxDiff(a: RgbColor, b: RgbColor): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

describe("Wave 83: 색각이상(CVD)·360px 모바일 야외 가독성 오라클 및 OKLCH 최소 보정 엔진", () => {
  describe("1. sRGB ↔ 선형 RGB · OKLCH 색공간 및 지각 거리 불변식", () => {
    it("IEC 61966-2-1 sRGB ↔ 선형 RGB 변환이 0..255 전 구간에서 무손실 왕복한다", () => {
      for (let ch = 0; ch <= 255; ch += 1) {
        const lin = srgbChannelToLinear(ch);
        expect(lin).toBeGreaterThanOrEqual(0);
        expect(lin).toBeLessThanOrEqual(1);
        expect(linearChannelToSrgb(lin)).toBe(ch);
      }
      expect(srgbChannelToLinear(0)).toBe(0);
      expect(srgbChannelToLinear(255)).toBe(1);
      expect(srgbChannelToLinear(10)).toBeCloseTo(10 / 255 / 12.92, 6);
    });

    it("RGB ↔ OKLCH 왕복 변환과 색역 클램핑이 NaN 없이 원색을 복원한다", () => {
      const samples: readonly RgbColor[] = [
        BLACK, WHITE, HERO_RED, FOREST_GREEN,
        { r: 31, g: 68, b: 53 }, { r: 250, g: 248, b: 243 }, { r: 70, g: 120, b: 235 },
      ];
      for (const sample of samples) {
        const lch = rgbToOklch(sample);
        expect(maxDiff(sample, oklchToSrgbGamutMapped(lch))).toBeLessThanOrEqual(1);
        expect(formatOklchCss(lch)).toMatch(/^oklch\(\d\.\d{3} \d\.\d{3} \d+\.\d\)$/u);
      }
      const mapped = oklchToSrgbGamutMapped({ L: 0.65, C: 0.45, H: 145 });
      expect(mapped.r).toBeGreaterThanOrEqual(0);
      expect(mapped.g).toBeLessThanOrEqual(255);
      expect(Number.isFinite(mapped.b)).toBe(true);
    });

    it("rgbToHex / hexToRgb 왕복 변환이 정확히 일치한다", () => {
      const encoded = rgbToHex(HERO_RED);
      expect(encoded.length).toBe(7);
      expect(hexToRgb(encoded)).toEqual(HERO_RED);
      expect(hexToRgb(rgbToHex(BLACK))).toEqual(BLACK);
      expect(hexToRgb(rgbToHex(WHITE))).toEqual(WHITE);
    });

    it("computeOklchDeltaE는 항등성·대칭성·흑백 100·삼각부등식을 만족한다", () => {
      expect(computeOklchDeltaE(HERO_RED, HERO_RED)).toBe(0);
      expect(computeOklchDeltaE(BLACK, WHITE)).toBeCloseTo(100, 1);
      const ab = computeOklchDeltaE(HERO_RED, FOREST_GREEN);
      expect(ab).toBeCloseTo(computeOklchDeltaE(FOREST_GREEN, HERO_RED), 8);
      const mid: RgbColor = { r: 130, g: 110, b: 95 };
      expect(ab).toBeLessThanOrEqual(computeOklchDeltaE(HERO_RED, mid) + computeOklchDeltaE(mid, FOREST_GREEN) + 1e-9);
    });

    it("CIEDE2000 보조 거리도 동일색 0·대칭성·고대비 분리도를 충족한다", () => {
      expect(computeCiede2000DeltaE(HERO_RED, HERO_RED)).toBe(0);
      const ab = computeCiede2000DeltaE(HERO_RED, FOREST_GREEN);
      expect(ab).toBeCloseTo(computeCiede2000DeltaE(FOREST_GREEN, HERO_RED), 6);
      expect(ab).toBeGreaterThan(50);
    });
  });

  describe("2. Machado-Oliveira-Fernandes (2009) 색각이상 시뮬레이터", () => {
    it("심각도 0은 모든 7가지 색각이상 유형에서 원본 RGB를 오차 0(maxDiff === 0)으로 반환한다", () => {
      const palette: readonly RgbColor[] = [
        HERO_RED, FOREST_GREEN, { r: 44, g: 120, b: 220 }, { r: 235, g: 198, b: 64 }, { r: 128, g: 128, b: 128 },
      ];
      for (const cvdType of ALL_CVD_TYPES) {
        for (const color of palette) {
          expect(maxDiff(color, simulateCvdRgb(color, cvdType, 0))).toBe(0);
        }
      }
    });

    it("완전 전색맹(achromatopsia, severity = 1)은 모든 유채색을 순수 중성 회색(R === G === B)으로 변환한다", () => {
      const colors: readonly RgbColor[] = [
        HERO_RED, FOREST_GREEN, { r: 32, g: 95, b: 240 }, { r: 245, g: 205, b: 40 }, { r: 188, g: 64, b: 196 },
      ];
      for (const color of colors) {
        const gray = simulateCvdRgb(color, "achromatopsia", 1);
        expect(gray.r).toBe(gray.g);
        expect(gray.g).toBe(gray.b);
      }
    });

    it("모든 Machado 변환 행렬은 각 행 합이 1.0이며 중성 무채색 축을 보존한다", () => {
      const neutrals: readonly RgbColor[] = [BLACK, { r: 64, g: 64, b: 64 }, { r: 168, g: 168, b: 168 }, WHITE];
      for (const cvdType of ALL_CVD_TYPES) {
        const m = getMachadoCvdMatrix(cvdType, 1);
        expect(m[0] + m[1] + m[2]).toBeCloseTo(1, 4);
        expect(m[3] + m[4] + m[5]).toBeCloseTo(1, 4);
        expect(m[6] + m[7] + m[8]).toBeCloseTo(1, 4);
        for (const gray of neutrals) expect(maxDiff(gray, simulateCvdRgb(gray, cvdType, 1))).toBeLessThanOrEqual(1);
      }
    });

    it("심각도(0.0 → 0.35 → 0.7 → 1.0)가 높아질수록 유채색 왜곡 거리가 단조 증가한다", () => {
      const severities = [0, 0.35, 0.7, 1.0];
      for (const cvdType of ["protanopia", "deuteranopia", "tritanopia"] as const) {
        const drifts = severities.map((s) => computeOklchDeltaE(HERO_RED, simulateCvdRgb(HERO_RED, cvdType, s)));
        expect(drifts[0]).toBe(0);
        expect(drifts[1]).toBeGreaterThan(drifts[0]);
        expect(drifts[2]).toBeGreaterThan(drifts[1]);
        expect(drifts[3]).toBeGreaterThan(drifts[2]);
      }
    });

    it("적색(210,48,42) vs 녹색(56,152,58) 혼동 쌍은 정상 시야 ΔE > 40이지만 적·녹색맹에서 45% 미만으로 급감한다", () => {
      const normalDe = computeOklchDeltaE(HERO_RED, FOREST_GREEN);
      const protanDe = computeCvdOklchDeltaE(HERO_RED, FOREST_GREEN, "protanopia", 1);
      const deutanDe = computeCvdOklchDeltaE(HERO_RED, FOREST_GREEN, "deuteranopia", 1);
      expect(normalDe).toBeGreaterThan(40);
      expect(protanDe).toBeLessThan(normalDe * 0.45);
      expect(deutanDe).toBeLessThan(normalDe * 0.45);
      expect(deutanDe).toBeLessThan(14);
    });

    it("청황 혼동 쌍은 정상 시야에서 뚜렷하지만 청황색맹(tritanopia)에서 분리도가 크게 떨어진다", () => {
      const skyBlue: RgbColor = { r: 74, g: 148, b: 196 };
      const mintGreen: RgbColor = { r: 84, g: 158, b: 126 };
      const normalDe = computeOklchDeltaE(skyBlue, mintGreen);
      const tritanDe = computeCvdOklchDeltaE(skyBlue, mintGreen, "tritanopia", 1);
      expect(normalDe).toBeGreaterThan(15);
      expect(tritanDe).toBeLessThan(normalDe * 0.55);
    });

    it("simulateCvdRgbaBuffer는 알파 채널을 그대로 보존하며 픽셀 단위 simulateCvdRgb와 일치한다", () => {
      const rgba = new Uint8ClampedArray([
        HERO_RED.r, HERO_RED.g, HERO_RED.b, 255,
        FOREST_GREEN.r, FOREST_GREEN.g, FOREST_GREEN.b, 180,
        40, 110, 220, 64, 240, 240, 240, 0,
      ]);
      expect(Array.from(simulateCvdRgbaBuffer(rgba, 2, 2, "deuteranopia", 0))).toEqual(Array.from(rgba));
      const deutanBuf = simulateCvdRgbaBuffer(rgba, 2, 2, "deuteranopia", 1);
      const e0 = simulateCvdRgb(HERO_RED, "deuteranopia", 1);
      const e1 = simulateCvdRgb(FOREST_GREEN, "deuteranopia", 1);
      expect([deutanBuf[0], deutanBuf[1], deutanBuf[2], deutanBuf[3]]).toEqual([e0.r, e0.g, e0.b, 255]);
      expect([deutanBuf[4], deutanBuf[5], deutanBuf[6], deutanBuf[7]]).toEqual([e1.r, e1.g, e1.b, 180]);
      expect(deutanBuf[11]).toBe(64);
      expect(deutanBuf[15]).toBe(0);

      const achrom = simulateCvdRgbaBuffer(rgba, 2, 2, "achromatopsia", 1);
      for (let i = 0; i < achrom.length; i += 4) {
        expect(achrom[i]).toBe(achrom[i + 1]);
        expect(achrom[i + 1]).toBe(achrom[i + 2]);
      }
    });
  });

  describe("3. WCAG 2.1 · APCA Lc 및 360px 모바일 야외 글레어/OLED 딤 시뮬레이터", () => {
    it("WCAG 2.1 명암비가 표준 골든 값(흑백 21.0, 동일색 1.0, 대칭성)과 정확히 일치한다", () => {
      expect(computeRelativeLuminance(BLACK)).toBe(0);
      expect(computeRelativeLuminance(WHITE)).toBeCloseTo(1, 6);
      expect(computeWcagContrastRatio(BLACK, WHITE)).toBeCloseTo(21.0, 5);
      expect(computeWcagContrastRatio(WHITE, BLACK)).toBeCloseTo(21.0, 5);
      expect(computeWcagContrastRatio(HERO_RED, HERO_RED)).toBeCloseTo(1.0, 6);
      expect(computeWcagContrastRatio(HERO_RED, FOREST_GREEN)).toBeCloseTo(computeWcagContrastRatio(FOREST_GREEN, HERO_RED), 6);
    });

    it("APCA Lc는 밝은 바탕 위 어두운 글자에 양수(+106 근방), 반대 극성에 음수(-107 근방), 동일색에 0을 반환한다", () => {
      const bow = computeApcaContrastLc(BLACK, WHITE);
      const wob = computeApcaContrastLc(WHITE, BLACK);
      expect(bow).toBeGreaterThan(104);
      expect(bow).toBeLessThan(108);
      expect(wob).toBeLessThan(-105);
      expect(wob).toBeGreaterThan(-110);
      expect(computeApcaContrastLc(FOREST_GREEN, FOREST_GREEN)).toBe(0);
    });

    it("야외 직사광선 베일 글레어(0 → 0.28)가 커질수록 흑레벨이 상승하고 실효 WCAG 명암비가 단조 감소한다", () => {
      const darkText: RgbColor = { r: 28, g: 34, b: 40 };
      const balloonFill: RgbColor = { r: 248, g: 246, b: 240 };
      const levels = [0, 0.05, 0.12, 0.2, 0.28];
      const ratios: number[] = [];
      const floors: number[] = [];
      for (const veil of levels) {
        const sim = simulateMobileViewingEnvironment(
          { sourcePanelWidthPx: 800, targetViewportWidthPx: 360, ambientGlareVeil: veil },
          [{ id: "b1", label: "주 대사", foreground: darkText, background: balloonFill }],
        );
        ratios.push(sim.pairs[0].effectiveWcagRatio);
        floors.push(sim.blackFloorLuminance);
      }
      for (let i = 1; i < levels.length; i += 1) {
        expect(floors[i]).toBeGreaterThan(floors[i - 1]);
        expect(ratios[i]).toBeLessThan(ratios[i - 1]);
      }
      expect(ratios[0]).toBeCloseTo(computeWcagContrastRatio(darkText, balloonFill), 5);
    });

    it("저휘도 OLED 딤 모드(1.0 → 0.65 → 0.35)는 실효 명암비를 단조 감소시킨다", () => {
      const text: RgbColor = { r: 22, g: 24, b: 28 };
      const fill: RgbColor = { r: 245, g: 244, b: 238 };
      const rFull = computeOutdoorWcagRatio(text, fill, 0.08, 1.0);
      const rMid = computeOutdoorWcagRatio(text, fill, 0.08, 0.65);
      const rDim = computeOutdoorWcagRatio(text, fill, 0.08, 0.35);
      expect(rFull).toBeGreaterThan(rMid);
      expect(rMid).toBeGreaterThan(rDim);
    });

    it("800px 원고의 360px 축소 배율·서브픽셀 헤어라인 감쇠 및 RGBA 프리뷰 다운샘플링이 정확하다", () => {
      const buf = new Uint8ClampedArray(800 * 40 * 4);
      for (let i = 0; i < buf.length; i += 4) {
        buf[i] = 240; buf[i + 1] = 235; buf[i + 2] = 228; buf[i + 3] = 255;
      }
      const res = simulateMobileViewingEnvironment(
        { sourcePanelWidthPx: 800, targetViewportWidthPx: 360, ambientGlareVeil: 0.12 },
        [{
          id: "lineart", label: "가는 선화",
          foreground: { r: 20, g: 20, b: 25 }, background: { r: 248, g: 246, b: 242 },
          sourceFontSizePx: 28, sourceStrokeWidthPx: 1.0,
        }],
        { width: 800, height: 40, rgba: buf },
      );
      expect(res.downsampleScale).toBeCloseTo(360 / 800, 6);
      expect(res.pairs[0].effectiveFontSizePx).toBeCloseTo(12.6, 4);
      expect(res.pairs[0].effectiveStrokeWidthPx).toBeCloseTo(0.45, 4);
      expect(res.pairs[0].hairlineContrastRatio ?? 99).toBeLessThan(res.pairs[0].effectiveWcagRatio);
      expect(res.previewBuffer?.width).toBe(360);
      expect(res.previewBuffer?.height).toBe(18);
      expect(res.previewBuffer?.rgba.length).toBe(360 * 18 * 4);
    });
  });

  describe("4. 작가 팔레트 보존형 OKLCH 최소 변형(ΔE 최소) 자동 보정 솔버", () => {
    it("이미 기준을 충족하는 색상 쌍은 불필요한 변형 없이 원본을 그대로 유지한다", () => {
      const solved = solveMinimalOklchColorAdjustment({
        foreground: { r: 20, g: 32, b: 28 }, background: { r: 252, g: 250, b: 246 },
        minWcagRatio: 4.5, minOutdoorWcagRatio: 4.5, outdoorGlareVeil: 0.12, minCvdDeltaE: 14,
      });
      expect(solved.feasible).toBe(true);
      expect(solved.needsAdjustment).toBe(false);
      expect(solved.deltaEFromOriginal).toBe(0);
      expect(solved.hueShiftDeg).toBe(0);
    });

    it("적색(210,48,42) 캐릭터 vs 녹색(56,152,58) 숲 쌍을 3대 색각이상 모두 ΔE >= 14로 복구하되 |ΔH| <= 18°와 흑백 대비 최소 ΔE를 보장한다", () => {
      const solved = solveMinimalOklchColorAdjustment({
        foreground: HERO_RED, background: FOREST_GREEN, minCvdDeltaE: 14, maxHueShiftDeg: 18,
      });
      expect(solved.feasible).toBe(true);
      expect(solved.needsAdjustment).toBe(true);
      expect(solved.beforeCvd.deuteranopia).toBeLessThan(14);
      expect(solved.afterCvd.protanopia).toBeGreaterThanOrEqual(14);
      expect(solved.afterCvd.deuteranopia).toBeGreaterThanOrEqual(14);
      expect(solved.afterCvd.tritanopia).toBeGreaterThanOrEqual(14);
      expect(solved.hueShiftDeg).toBeLessThanOrEqual(18);
      expect(solved.deltaEFromOriginal).toBeLessThan(solved.naiveBaselineDeltaE * 0.5);
    });

    it("저대비 말풍선(< 4.5:1)을 실내·360px 야외 글레어·3대 색각이상 모두 통과하도록 최소 보정하며 흑백 치환보다 원색에 가깝다", () => {
      const solved = solveMinimalOklchColorAdjustment({
        foreground: { r: 108, g: 124, b: 138 }, background: { r: 248, g: 245, b: 238 },
        minWcagRatio: 4.5, minOutdoorWcagRatio: 4.5, outdoorGlareVeil: 0.12, minCvdDeltaE: 14, maxHueShiftDeg: 18,
      });
      expect(solved.beforeWcagRatio).toBeLessThan(4.5);
      expect(solved.beforeOutdoorWcagRatio).toBeLessThan(4.5);
      expect(solved.feasible).toBe(true);
      expect(solved.afterWcagRatio).toBeGreaterThanOrEqual(4.5);
      expect(solved.afterOutdoorWcagRatio).toBeGreaterThanOrEqual(4.5);
      expect(solved.afterCvd.protanopia).toBeGreaterThanOrEqual(14);
      expect(solved.afterCvd.deuteranopia).toBeGreaterThanOrEqual(14);
      expect(solved.afterCvd.tritanopia).toBeGreaterThanOrEqual(14);
      expect(solved.hueShiftDeg).toBeLessThanOrEqual(18);
      expect(solved.deltaEFromOriginal).toBeLessThan(solved.naiveBaselineDeltaE);
    });

    it("다크 톤 말풍선(어두운 남색 바탕 위 흐린 청회색 대사)은 밝은 글자 극성을 유지하며 야외·색각 기준을 복구한다", () => {
      const solved = solveMinimalOklchColorAdjustment({
        foreground: { r: 118, g: 136, b: 158 }, background: { r: 16, g: 24, b: 36 },
        minWcagRatio: 4.5, minOutdoorWcagRatio: 4.5, outdoorGlareVeil: 0.12, minCvdDeltaE: 14, maxHueShiftDeg: 18,
      });
      expect(solved.feasible).toBe(true);
      expect(solved.afterOutdoorWcagRatio).toBeGreaterThanOrEqual(4.5);
      expect(solved.afterApcaLc).toBeLessThan(0);
      expect(solved.hueShiftDeg).toBeLessThanOrEqual(18);
      expect(solved.deltaEFromOriginal).toBeLessThan(solved.naiveBaselineDeltaE);
    });

    it("전경 단독으로 야외 4.5:1이 물리적으로 불가능한 중간 회색 말풍선 바탕은 배경 명도 동시 최소 보정으로 복구한다", () => {
      const solved = solveMinimalOklchColorAdjustment({
        foreground: { r: 58, g: 64, b: 74 }, background: { r: 150, g: 152, b: 156 },
        minWcagRatio: 4.5, minOutdoorWcagRatio: 4.5, outdoorGlareVeil: 0.12, minCvdDeltaE: 14,
        maxHueShiftDeg: 18, allowBackgroundAdjustment: true,
      });
      expect(solved.feasible).toBe(true);
      expect(solved.afterOutdoorWcagRatio).toBeGreaterThanOrEqual(4.5);
      expect(solved.backgroundDeltaEFromOriginal).toBeGreaterThan(0);
      expect(solved.hueShiftDeg).toBeLessThanOrEqual(18);
    });

    it("청황색맹(tritanopia) 혼동 쌍도 허용 색상각 이동(|ΔH| <= 18°) 안에서 복구한다", () => {
      const solved = solveMinimalOklchColorAdjustment({
        foreground: { r: 74, g: 148, b: 196 }, background: { r: 84, g: 158, b: 126 },
        minCvdDeltaE: 14, maxHueShiftDeg: 18,
      });
      expect(solved.feasible).toBe(true);
      expect(solved.afterCvd.tritanopia).toBeGreaterThanOrEqual(14);
      expect(solved.afterCvd.protanopia).toBeGreaterThanOrEqual(14);
      expect(solved.afterCvd.deuteranopia).toBeGreaterThanOrEqual(14);
      expect(solved.hueShiftDeg).toBeLessThanOrEqual(18);
      expect(computeHueDistanceDeg(solved.originalForegroundOklch.H, solved.adjustedForegroundOklch.H)).toBeLessThanOrEqual(20);
    });
  });

  describe("5. 웹툰 컷 종합 감사(360px 타이포·헤어라인·SFX) 및 Calm Atelier 스코어카드 익스포터", () => {
    it("360px 화면에서 11px 미만 소형 대사와 0.75px 미만 소실 헤어라인을 정확히 검출하고 최소 원고 치수를 권고한다", () => {
      const audit = auditAndSuggestMinimalReadabilityFixes({
        cutId: "ep04-cut12", cutTitle: "4화 12컷 — 숲속 대치",
        sourcePanelWidthPx: 800, mobileViewportWidthPx: 360, outdoorGlareVeil: 0.12,
        speechBalloons: [{
          id: "b-tiny", label: "속삭임 대사",
          textColor: { r: 24, g: 28, b: 32 }, fillColor: { r: 252, g: 250, b: 246 },
          sourceFontSizePx: 20, sourceBorderStrokeWidthPx: 1.2,
        }],
        silhouettePairs: [{
          id: "hero-hairline", label: "주인공 외곽선",
          characterColor: { r: 30, g: 45, b: 95 }, backgroundColor: { r: 242, g: 235, b: 215 },
          lineartWidthPx: 1.1,
        }],
      });
      expect(audit.passed).toBe(false);
      expect(audit.balloons[0].effectiveFontSizePx).toBeCloseTo(9.0, 2);
      expect(audit.balloons[0].recommendedSourceFontSizePx).toBe(27);
      expect(audit.balloons[0].effectiveBorderStrokeWidthPx).toBeCloseTo(0.54, 2);
      expect(audit.balloons[0].recommendedSourceBorderStrokeWidthPx).toBeCloseTo(1.67, 2);
      expect(audit.issues.some((i) => i.code === "mobile-font-too-small" && i.severity === "critical")).toBe(true);
      expect(audit.issues.filter((i) => i.code === "mobile-hairline-vanishing")).toHaveLength(2);
    });

    it("대형·볼드 효과음(SFX)은 WCAG 3.0:1 기준을 적용해 정상 판정하며 저대비 효과음만 보정 제안한다", () => {
      const audit = auditAndSuggestMinimalReadabilityFixes({
        cutId: "ep04-cut15", sourcePanelWidthPx: 800, outdoorGlareVeil: 0.1,
        speechBalloons: [], silhouettePairs: [],
        sfxBadges: [
          {
            id: "sfx-ok", label: "콰광!", textColor: { r: 32, g: 38, b: 48 },
            backgroundColor: { r: 248, g: 244, b: 234 }, sourceFontSizePx: 44, sourceStrokeWidthPx: 2.4, isLargeOrBold: true,
          },
          {
            id: "sfx-low", label: "스윽", textColor: { r: 158, g: 162, b: 170 },
            backgroundColor: { r: 238, g: 236, b: 230 }, sourceFontSizePx: 40, sourceStrokeWidthPx: 2.0, isLargeOrBold: true,
          },
        ],
      });
      expect(audit.sfxBadges[0].passed).toBe(true);
      expect(audit.sfxBadges[1].passed).toBe(false);
      expect(audit.sfxBadges[1].remediation.feasible).toBe(true);
      expect(audit.sfxBadges[1].remediation.afterOutdoorWcagRatio).toBeGreaterThanOrEqual(3.0);
    });

    it("기준을 모두 충족한 컷은 감사 통과 및 스코어카드 A등급(100점)·패치 0건·NaN 0건으로 출력한다", () => {
      const audit = auditAndSuggestMinimalReadabilityFixes({
        cutId: "ep01-cut03", cutTitle: "1화 3컷 — 맑은 아침",
        sourcePanelWidthPx: 800, mobileViewportWidthPx: 360, outdoorGlareVeil: 0.12,
        speechBalloons: [{
          id: "b-clean", label: "아침 인사",
          textColor: { r: 24, g: 36, b: 32 }, fillColor: { r: 252, g: 250, b: 245 },
          sourceFontSizePx: 30, sourceBorderStrokeWidthPx: 2.2,
        }],
        silhouettePairs: [{
          id: "s-clean", label: "주인공 vs 밝은 하늘",
          characterColor: { r: 42, g: 48, b: 68 }, backgroundColor: { r: 235, g: 242, b: 248 },
          lineartWidthPx: 2.0,
        }],
      });
      expect(audit.passed).toBe(true);
      const card = buildReadabilityOracleScorecard(audit);
      expect(card.overallGrade).toBe("A");
      expect(card.overallScore).toBe(100);
      expect(card.oneClickPatchTokens).toHaveLength(0);
      expect(card.typographyAndStrokeFixes).toHaveLength(0);
      expect(card.cvdMatrix).toHaveLength(4);
      expect(card.cvdMatrix.every((row) => row.passed)).toBe(true);
      expect(card.markdownReportKo).not.toContain("NaN");
      expect(card.markdownReportKo).not.toContain("Infinity");
    });

    it("복합 결함 컷(적·녹 실루엣 붕괴 + 저대비 말풍선 + 초소형 글자)은 C등급 스코어카드와 원클릭 OKLCH 패치를 한글로 생성한다", () => {
      const audit = auditAndSuggestMinimalReadabilityFixes({
        cutId: "ep07-cut22", cutTitle: "7화 22컷 — 야간 숲 추격전",
        sourcePanelWidthPx: 1600, mobileViewportWidthPx: 360, outdoorGlareVeil: 0.12,
        speechBalloons: [{
          id: "b-warn", label: "경고 대사",
          textColor: { r: 120, g: 128, b: 136 }, fillColor: { r: 246, g: 244, b: 238 },
          sourceFontSizePx: 40, sourceBorderStrokeWidthPx: 2.4,
        }],
        silhouettePairs: [{
          id: "s-red-green", label: "붉은 망토 주인공 vs 녹색 숲",
          characterColor: HERO_RED, backgroundColor: FOREST_GREEN, lineartWidthPx: 4.0,
        }],
      });
      const card = buildReadabilityOracleScorecard(audit);
      expect(card.overallGrade).toBe("C");
      expect(card.overallScore).toBeLessThan(70);
      expect(card.criticalIssueCount).toBeGreaterThanOrEqual(3);
      expect(card.oneClickPatchTokens.length).toBeGreaterThanOrEqual(2);
      const deutanRow = card.cvdMatrix.find((r) => r.cvdType === "deuteranopia");
      expect(deutanRow?.passed).toBe(false);
      expect(deutanRow?.failingCount).toBeGreaterThanOrEqual(1);
      for (const token of card.oneClickPatchTokens) {
        expect(token.beforeOklchCss).toMatch(/^oklch\(/u);
        expect(token.afterOklchCss).toMatch(/^oklch\(/u);
        expect(token.hueShiftDeg).toBeLessThanOrEqual(18);
        expect(Number.isFinite(token.deltaEFromOriginal)).toBe(true);
        expect(token.actionLabelKo.length).toBeGreaterThan(4);
      }
      expect(card.typographyAndStrokeFixes.length).toBeGreaterThanOrEqual(2);
      expect(card.markdownReportKo).toContain("7화 22컷 — 야간 숲 추격전");
      expect(card.markdownReportKo).toContain("원클릭 OKLCH 최소 보정 패치");
      expect(card.markdownReportKo).not.toContain("NaN");
      expect(card.markdownReportKo).not.toContain("undefined");
      expect(card.markdownReportKo).not.toContain("Infinity");
    });

    it("경미한 헤어라인 경고만 있는 컷은 차분한 B등급과 비침습 한글 배지를 반환하며 스냅샷이 NaN 없이 유한하다", () => {
      const snap = computeCvdSeparationSnapshot(HERO_RED, FOREST_GREEN);
      expect(snap.worstCoreCvdType).toBe("deuteranopia");
      expect(Number.isFinite(snap.achromatopsia)).toBe(true);

      const audit = auditAndSuggestMinimalReadabilityFixes({
        cutId: "ep02-cut09", cutTitle: "2화 9컷 — 잔잔한 복도",
        sourcePanelWidthPx: 800, mobileViewportWidthPx: 360, outdoorGlareVeil: 0.12,
        speechBalloons: [{
          id: "b-fine", label: "일반 대사",
          textColor: { r: 22, g: 28, b: 30 }, fillColor: { r: 252, g: 250, b: 246 },
          sourceFontSizePx: 28, sourceBorderStrokeWidthPx: 1.4,
        }],
        silhouettePairs: [],
      });
      const card = buildReadabilityOracleScorecard(audit);
      expect(card.overallGrade).toBe("B");
      expect(card.criticalIssueCount).toBe(0);
      expect(card.warningIssueCount).toBe(1);
      expect(card.calmStatusBadgeKo).toBe("미세 보정 권장");
      expect(card.markdownReportKo).not.toContain("NaN");
    });
  });
});
