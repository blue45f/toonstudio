/**
 * Wave 83 작가 팔레트 보존형 OKLCH 최소 변형(ΔE 최소) 자동 보정 솔버 & 컷 가독성 감사 엔진.
 *
 * - 말풍선 대사(`>= 4.5:1` 일반 / `>= 3.0:1` 대형·볼드 / 야외 글레어 하 `>= 4.5:1` / 360px `>= 12px`) 감사
 * - 캐릭터 실루엣 vs 배경 색각이상 분리도(`protanopia`/`deuteranopia`/`tritanopia` 모두 `ΔE >= 14`) 감사
 * - 360px 모바일 화면 `< 0.75px` 소실 헤어라인 선화/말풍선 테두리 검출
 * - OKLCH `(L, C, H)` 공간에서 명도(L) 우선 분리와 `|ΔH| <= 18°` 제약으로 작가 색감을 보존하면서
 *   단순 흑백 강제 치환보다 현저히 작은 ΔE로 가독성을 복구한다.
 */

import {
  DEFAULT_MOBILE_VIEWPORT_WIDTH_PX,
  DEFAULT_OUTDOOR_GLARE_VEIL,
  MAX_OUTDOOR_GLARE_VEIL,
  MIN_OLED_DIM_FACTOR,
  applyMobileOpticalEnvironmentLinear,
  clampFinite,
  computeApcaContrastLc,
  computeCvdOklchDeltaE,
  computeHueDistanceDeg,
  computeOklchDeltaE,
  computeWcagContrastFromLuminance,
  computeWcagContrastRatio,
  normalizeHueDeg,
  normalizeRgbColor,
  oklchToSrgbGamutMapped,
  rgbToOklch,
  srgbToLinearRgb,
  type CvdType,
  type OklchColor,
  type RgbColor,
} from "./cvd-machado-brettel-simulator";

export const CORE_CVD_AUDIT_TYPES: readonly CvdType[] = ["protanopia", "deuteranopia", "tritanopia"];
export const ALL_CVD_SCORECARD_TYPES: readonly CvdType[] = [
  "protanopia", "deuteranopia", "tritanopia", "achromatopsia",
];

export interface ReadabilityAuditThresholds {
  readonly wcagNormalMin: number;
  readonly wcagLargeMin: number;
  readonly wcagOutdoorNormalMin: number;
  readonly wcagOutdoorLargeMin: number;
  readonly apcaNormalMinAbsLc: number;
  readonly apcaLargeMinAbsLc: number;
  readonly cvdMinDeltaE: number;
  readonly minEffectiveFontSizePx: number;
  readonly minEffectiveStrokeWidthPx: number;
  readonly maxHueShiftDeg: number;
}

export const DEFAULT_READABILITY_THRESHOLDS: ReadabilityAuditThresholds = {
  wcagNormalMin: 4.5,
  wcagLargeMin: 3.0,
  wcagOutdoorNormalMin: 4.5,
  wcagOutdoorLargeMin: 3.0,
  apcaNormalMinAbsLc: 60,
  apcaLargeMinAbsLc: 45,
  cvdMinDeltaE: 14.0,
  minEffectiveFontSizePx: 12.0,
  minEffectiveStrokeWidthPx: 0.75,
  maxHueShiftDeg: 18.0,
};

export interface CvdSeparationSnapshot {
  readonly normal: number;
  readonly protanopia: number;
  readonly deuteranopia: number;
  readonly tritanopia: number;
  readonly achromatopsia: number;
  readonly worstCoreCvdDeltaE: number;
  readonly worstCoreCvdType: CvdType;
}

export interface MinimalOklchSolveRequest {
  readonly foreground: RgbColor;
  readonly background: RgbColor;
  readonly minWcagRatio?: number;
  readonly minOutdoorWcagRatio?: number;
  readonly outdoorGlareVeil?: number;
  readonly oledDimFactor?: number;
  readonly minCvdDeltaE?: number;
  readonly cvdTypes?: readonly CvdType[];
  readonly maxHueShiftDeg?: number;
  readonly allowBackgroundAdjustment?: boolean;
}

export interface MinimalOklchSolveResult {
  readonly feasible: boolean;
  readonly needsAdjustment: boolean;
  readonly originalForeground: RgbColor;
  readonly originalBackground: RgbColor;
  readonly adjustedForeground: RgbColor;
  readonly adjustedBackground: RgbColor;
  readonly originalForegroundOklch: OklchColor;
  readonly adjustedForegroundOklch: OklchColor;
  readonly originalBackgroundOklch: OklchColor;
  readonly adjustedBackgroundOklch: OklchColor;
  readonly deltaEFromOriginal: number;
  readonly backgroundDeltaEFromOriginal: number;
  readonly totalPerceptualDrift: number;
  readonly hueShiftDeg: number;
  readonly backgroundHueShiftDeg: number;
  readonly naiveBaselineColor: RgbColor;
  readonly naiveBaselineDeltaE: number;
  readonly beforeWcagRatio: number;
  readonly afterWcagRatio: number;
  readonly beforeOutdoorWcagRatio: number;
  readonly afterOutdoorWcagRatio: number;
  readonly beforeApcaLc: number;
  readonly afterApcaLc: number;
  readonly beforeCvd: CvdSeparationSnapshot;
  readonly afterCvd: CvdSeparationSnapshot;
}

export interface SpeechBalloonAuditSpec {
  readonly id: string;
  readonly label: string;
  readonly textColor: RgbColor;
  readonly fillColor: RgbColor;
  readonly borderColor?: RgbColor;
  readonly sourceFontSizePx: number;
  readonly sourceBorderStrokeWidthPx?: number;
  readonly isLargeOrBold?: boolean;
}

export interface SfxBadgeAuditSpec {
  readonly id: string;
  readonly label: string;
  readonly textColor: RgbColor;
  readonly backgroundColor: RgbColor;
  readonly sourceFontSizePx: number;
  readonly sourceStrokeWidthPx?: number;
  readonly isLargeOrBold?: boolean;
}

export interface CharacterBackgroundPairSpec {
  readonly id: string;
  readonly label: string;
  readonly characterColor: RgbColor;
  readonly backgroundColor: RgbColor;
  readonly lineartWidthPx?: number;
  readonly lineartColor?: RgbColor;
}

export interface WebtoonCutReadabilityInput {
  readonly cutId: string;
  readonly cutTitle?: string;
  readonly sourcePanelWidthPx: number;
  readonly mobileViewportWidthPx?: number;
  readonly outdoorGlareVeil?: number;
  readonly oledDimFactor?: number;
  readonly speechBalloons: readonly SpeechBalloonAuditSpec[];
  readonly sfxBadges?: readonly SfxBadgeAuditSpec[];
  readonly silhouettePairs: readonly CharacterBackgroundPairSpec[];
  readonly thresholds?: Partial<ReadabilityAuditThresholds>;
}

export type ReadabilityIssueSeverity = "critical" | "warning";
export type ReadabilityIssueCode =
  | "wcag-contrast-low"
  | "outdoor-glare-contrast-low"
  | "cvd-separation-collapsed"
  | "mobile-font-too-small"
  | "mobile-hairline-vanishing";

export interface ReadabilityIssue {
  readonly code: ReadabilityIssueCode;
  readonly severity: ReadabilityIssueSeverity;
  readonly targetId: string;
  readonly targetKind: "speech-balloon" | "sfx-badge" | "character-silhouette";
  readonly targetLabel: string;
  readonly measuredValue: number;
  readonly requiredValue: number;
  readonly messageKo: string;
}

export interface BalloonAuditFinding {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
  readonly effectiveFontSizePx: number;
  readonly recommendedSourceFontSizePx: number | null;
  readonly effectiveBorderStrokeWidthPx: number | null;
  readonly recommendedSourceBorderStrokeWidthPx: number | null;
  readonly remediation: MinimalOklchSolveResult;
  readonly issues: readonly ReadabilityIssue[];
}

export interface SfxAuditFinding {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
  readonly effectiveFontSizePx: number;
  readonly recommendedSourceFontSizePx: number | null;
  readonly effectiveStrokeWidthPx: number | null;
  readonly recommendedSourceStrokeWidthPx: number | null;
  readonly remediation: MinimalOklchSolveResult;
  readonly issues: readonly ReadabilityIssue[];
}

export interface SilhouetteAuditFinding {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
  readonly effectiveLineartWidthPx: number | null;
  readonly recommendedSourceLineartWidthPx: number | null;
  readonly remediation: MinimalOklchSolveResult;
  readonly issues: readonly ReadabilityIssue[];
}

export interface CutReadabilityAuditResult {
  readonly cutId: string;
  readonly cutTitle: string;
  readonly sourcePanelWidthPx: number;
  readonly mobileViewportWidthPx: number;
  readonly downsampleScale: number;
  readonly outdoorGlareVeil: number;
  readonly oledDimFactor: number;
  readonly thresholds: ReadabilityAuditThresholds;
  readonly passed: boolean;
  readonly balloons: readonly BalloonAuditFinding[];
  readonly sfxBadges: readonly SfxAuditFinding[];
  readonly silhouettes: readonly SilhouetteAuditFinding[];
  readonly issues: readonly ReadabilityIssue[];
}

const ACHROMATIC_CHROMA_THRESHOLD = 0.015;
const PURE_BLACK: RgbColor = { r: 0, g: 0, b: 0 };
const PURE_WHITE: RgbColor = { r: 255, g: 255, b: 255 };

/** 두 색상의 정상 시각 및 4대 색각이상 시뮬레이션 ΔE 스냅샷을 계산한다. */
export function computeCvdSeparationSnapshot(foreground: RgbColor, background: RgbColor): CvdSeparationSnapshot {
  const normal = computeOklchDeltaE(foreground, background);
  const protanopia = computeCvdOklchDeltaE(foreground, background, "protanopia", 1);
  const deuteranopia = computeCvdOklchDeltaE(foreground, background, "deuteranopia", 1);
  const tritanopia = computeCvdOklchDeltaE(foreground, background, "tritanopia", 1);
  const achromatopsia = computeCvdOklchDeltaE(foreground, background, "achromatopsia", 1);

  let worstCoreCvdDeltaE = protanopia;
  let worstCoreCvdType: CvdType = "protanopia";
  if (deuteranopia < worstCoreCvdDeltaE) { worstCoreCvdDeltaE = deuteranopia; worstCoreCvdType = "deuteranopia"; }
  if (tritanopia < worstCoreCvdDeltaE) { worstCoreCvdDeltaE = tritanopia; worstCoreCvdType = "tritanopia"; }
  return { normal, protanopia, deuteranopia, tritanopia, achromatopsia, worstCoreCvdDeltaE, worstCoreCvdType };
}

/** 야외 베일 글레어와 저휘도 OLED 딤 모드가 적용된 실효 WCAG 명암비를 계산한다. */
export function computeOutdoorWcagRatio(
  foreground: RgbColor, background: RgbColor, outdoorGlareVeil: number, oledDimFactor: number,
): number {
  const fgLin = applyMobileOpticalEnvironmentLinear(srgbToLinearRgb(foreground), outdoorGlareVeil, oledDimFactor);
  const bgLin = applyMobileOpticalEnvironmentLinear(srgbToLinearRgb(background), outdoorGlareVeil, oledDimFactor);
  return computeWcagContrastFromLuminance(
    0.2126 * fgLin.r + 0.7152 * fgLin.g + 0.0722 * fgLin.b,
    0.2126 * bgLin.r + 0.7152 * bgLin.g + 0.0722 * bgLin.b,
  );
}

function measureEffectiveHueShiftDeg(original: OklchColor, candidate: OklchColor): number {
  if (original.C < ACHROMATIC_CHROMA_THRESHOLD || candidate.C < ACHROMATIC_CHROMA_THRESHOLD) return 0;
  return computeHueDistanceDeg(original.H, candidate.H);
}

interface CandidateEvaluation {
  readonly feasible: boolean;
  readonly fg: RgbColor;
  readonly bg: RgbColor;
  readonly fgLch: OklchColor;
  readonly bgLch: OklchColor;
  readonly deltaEFg: number;
  readonly deltaEBg: number;
  readonly hueShiftFg: number;
  readonly hueShiftBg: number;
  readonly score: number;
  readonly violationSum: number;
}

interface NormalizedSolveConstraints {
  readonly minWcagRatio: number;
  readonly minOutdoorWcagRatio: number;
  readonly outdoorGlareVeil: number;
  readonly oledDimFactor: number;
  readonly minCvdDeltaE: number;
  readonly cvdTypes: readonly CvdType[];
  readonly maxHueShiftDeg: number;
}

function evaluatePairCandidate(
  origFg: RgbColor, origFgLch: OklchColor, origBg: RgbColor, origBgLch: OklchColor,
  candFg: RgbColor, candBg: RgbColor, c: NormalizedSolveConstraints,
): CandidateEvaluation {
  const fgLch = rgbToOklch(candFg);
  const bgLch = rgbToOklch(candBg);
  const hueShiftFg = measureEffectiveHueShiftDeg(origFgLch, fgLch);
  const hueShiftBg = measureEffectiveHueShiftDeg(origBgLch, bgLch);

  let violationSum = 0;
  if (hueShiftFg > c.maxHueShiftDeg + 1e-6) violationSum += (hueShiftFg - c.maxHueShiftDeg) * 4;
  if (hueShiftBg > c.maxHueShiftDeg + 1e-6) violationSum += (hueShiftBg - c.maxHueShiftDeg) * 4;
  if (c.minWcagRatio > 1) {
    const wcag = computeWcagContrastRatio(candFg, candBg);
    if (wcag < c.minWcagRatio) violationSum += (c.minWcagRatio - wcag) * 20;
  }
  if (c.minOutdoorWcagRatio > 1) {
    const outdoor = computeOutdoorWcagRatio(candFg, candBg, c.outdoorGlareVeil, c.oledDimFactor);
    if (outdoor < c.minOutdoorWcagRatio) violationSum += (c.minOutdoorWcagRatio - outdoor) * 24;
  }
  if (c.minCvdDeltaE > 0) {
    for (let i = 0; i < c.cvdTypes.length; i += 1) {
      const cvdDe = computeCvdOklchDeltaE(candFg, candBg, c.cvdTypes[i], 1);
      if (cvdDe < c.minCvdDeltaE) violationSum += (c.minCvdDeltaE - cvdDe) * 5;
    }
  }

  const deltaEFg = computeOklchDeltaE(origFg, candFg);
  const deltaEBg = computeOklchDeltaE(origBg, candBg);
  const score =
    deltaEFg + deltaEBg * 1.15 + hueShiftFg * 0.25 + hueShiftBg * 0.35 + Math.abs(fgLch.C - origFgLch.C) * 10;

  return {
    feasible: violationSum === 0, fg: candFg, bg: candBg, fgLch, bgLch,
    deltaEFg, deltaEBg, hueShiftFg, hueShiftBg, score, violationSum,
  };
}

function isBetterEvaluation(next: CandidateEvaluation, curr: CandidateEvaluation): boolean {
  if (next.feasible !== curr.feasible) return next.feasible;
  if (next.feasible) return next.score < curr.score;
  if (Math.abs(next.violationSum - curr.violationSum) > 1e-6) return next.violationSum < curr.violationSum;
  return next.score < curr.score;
}

/** 3단계(순수 명도 스캔 → 3D OKLCH 격자 → 국소 좌표 정밀화)로 고정 배경 위 전경의 최소 ΔE 보정색을 탐색한다. */
function searchForegroundForFixedBackground(
  origFg: RgbColor, origFgLch: OklchColor, origBg: RgbColor, origBgLch: OklchColor,
  fixedBg: RgbColor, c: NormalizedSolveConstraints,
): CandidateEvaluation {
  let best = evaluatePairCandidate(origFg, origFgLch, origBg, origBgLch, origFg, fixedBg, c);

  const testLch = (L: number, C: number, H: number): void => {
    const candRgb = oklchToSrgbGamutMapped({
      L: clampFinite(L, 0.02, 0.99, origFgLch.L),
      C: clampFinite(C, 0, 0.37, origFgLch.C),
      H: normalizeHueDeg(H),
    });
    const ev = evaluatePairCandidate(origFg, origFgLch, origBg, origBgLch, candRgb, fixedBg, c);
    if (isBetterEvaluation(ev, best)) best = ev;
  };

  // 1단계: ΔH = 0° 순수 명도(L) 우선 스캔.
  const baseC = origFgLch.C;
  const chromatic = baseC >= ACHROMATIC_CHROMA_THRESHOLD;
  const stage1Scales = chromatic ? [1.0, 0.88, 1.12, 0.7] : [0];
  for (let li = 2; li <= 99; li += 1) {
    for (let ci = 0; ci < stage1Scales.length; ci += 1) testLch(li * 0.01, baseC * stage1Scales[ci], origFgLch.H);
  }

  // 2단계: |ΔH| <= maxHueShiftDeg 범위의 3D OKLCH 격자 탐색.
  if (chromatic && c.maxHueShiftDeg > 0) {
    const offsets: number[] = [];
    const step = Math.max(2, Math.floor(c.maxHueShiftDeg / 4));
    for (let h = -c.maxHueShiftDeg; h <= c.maxHueShiftDeg; h += step) {
      if (Math.abs(h) > 1e-6) offsets.push(h);
    }
    if (offsets[offsets.length - 1] !== c.maxHueShiftDeg) offsets.push(-c.maxHueShiftDeg, c.maxHueShiftDeg);

    const stage2Scales = [1.0, 0.85, 1.15];
    for (let hi = 0; hi < offsets.length; hi += 1) {
      const candH = normalizeHueDeg(origFgLch.H + offsets[hi]);
      for (let li = 4; li <= 96; li += 4) {
        for (let ci = 0; ci < stage2Scales.length; ci += 1) testLch(li * 0.01, baseC * stage2Scales[ci], candH);
      }
    }
  }

  // 3단계: 최적 후보 주변 좌표 정밀화(점진 축소 보폭).
  const refineSteps: readonly [number, number, number][] = [[0.02, 0.02, 2.5], [0.008, 0.008, 1.0], [0.003, 0.003, 0.4]];
  for (let s = 0; s < refineSteps.length; s += 1) {
    const [dL, dC, dH] = refineSteps[s];
    const centerL = best.fgLch.L;
    const centerC = best.fgLch.C;
    const centerH = chromatic ? best.fgLch.H : origFgLch.H;
    const hDeltas = chromatic && c.maxHueShiftDeg > 0 ? [-dH, 0, dH] : [0];
    const cDeltas = chromatic ? [-dC, 0, dC] : [0];
    const lDeltas = [-dL, 0, dL];

    for (let li = 0; li < lDeltas.length; li += 1) {
      for (let ci = 0; ci < cDeltas.length; ci += 1) {
        for (let hi = 0; hi < hDeltas.length; hi += 1) {
          const nextH = normalizeHueDeg(centerH + hDeltas[hi]);
          if (chromatic && computeHueDistanceDeg(origFgLch.H, nextH) > c.maxHueShiftDeg) continue;
          testLch(centerL + lDeltas[li], Math.max(0, centerC + cDeltas[ci]), nextH);
        }
      }
    }
  }
  return best;
}

/** WCAG·야외 글레어·색각이상 분리도를 동시에 만족하는 최소 ΔE OKLCH 보정 색상을 산출한다. */
export function solveMinimalOklchColorAdjustment(request: MinimalOklchSolveRequest): MinimalOklchSolveResult {
  const origFg = normalizeRgbColor(request.foreground);
  const origBg = normalizeRgbColor(request.background);
  const origFgLch = rgbToOklch(origFg);
  const origBgLch = rgbToOklch(origBg);

  const constraints: NormalizedSolveConstraints = {
    minWcagRatio: clampFinite(request.minWcagRatio ?? 1, 1, 21, 1),
    minOutdoorWcagRatio: clampFinite(request.minOutdoorWcagRatio ?? 1, 1, 21, 1),
    outdoorGlareVeil: clampFinite(request.outdoorGlareVeil ?? DEFAULT_OUTDOOR_GLARE_VEIL, 0, MAX_OUTDOOR_GLARE_VEIL, DEFAULT_OUTDOOR_GLARE_VEIL),
    oledDimFactor: clampFinite(request.oledDimFactor ?? 1.0, MIN_OLED_DIM_FACTOR, 1.0, 1.0),
    minCvdDeltaE: clampFinite(request.minCvdDeltaE ?? 0, 0, 80, 0),
    cvdTypes: request.cvdTypes && request.cvdTypes.length > 0 ? request.cvdTypes : CORE_CVD_AUDIT_TYPES,
    maxHueShiftDeg: clampFinite(request.maxHueShiftDeg ?? DEFAULT_READABILITY_THRESHOLDS.maxHueShiftDeg, 0, 45, DEFAULT_READABILITY_THRESHOLDS.maxHueShiftDeg),
  };

  const beforeWcagRatio = computeWcagContrastRatio(origFg, origBg);
  const beforeOutdoorWcagRatio = computeOutdoorWcagRatio(origFg, origBg, constraints.outdoorGlareVeil, constraints.oledDimFactor);
  const beforeApcaLc = computeApcaContrastLc(origFg, origBg);
  const beforeCvd = computeCvdSeparationSnapshot(origFg, origBg);

  const naiveBaselineColor =
    computeWcagContrastRatio(PURE_BLACK, origBg) >= computeWcagContrastRatio(PURE_WHITE, origBg)
      ? PURE_BLACK
      : PURE_WHITE;
  const naiveBaselineDeltaE = computeOklchDeltaE(origFg, naiveBaselineColor);

  const initialEval = evaluatePairCandidate(origFg, origFgLch, origBg, origBgLch, origFg, origBg, constraints);
  if (initialEval.feasible) {
    return {
      feasible: true, needsAdjustment: false,
      originalForeground: origFg, originalBackground: origBg,
      adjustedForeground: origFg, adjustedBackground: origBg,
      originalForegroundOklch: origFgLch, adjustedForegroundOklch: origFgLch,
      originalBackgroundOklch: origBgLch, adjustedBackgroundOklch: origBgLch,
      deltaEFromOriginal: 0, backgroundDeltaEFromOriginal: 0, totalPerceptualDrift: 0,
      hueShiftDeg: 0, backgroundHueShiftDeg: 0, naiveBaselineColor, naiveBaselineDeltaE,
      beforeWcagRatio, afterWcagRatio: beforeWcagRatio,
      beforeOutdoorWcagRatio, afterOutdoorWcagRatio: beforeOutdoorWcagRatio,
      beforeApcaLc, afterApcaLc: beforeApcaLc, beforeCvd, afterCvd: beforeCvd,
    };
  }

  let bestEval = searchForegroundForFixedBackground(origFg, origFgLch, origBg, origBgLch, origBg, constraints);
  if (!bestEval.feasible && request.allowBackgroundAdjustment) {
    const bgShifts = [0.06, -0.06, 0.12, -0.12, 0.2, -0.2, 0.3, -0.3, 0.42, -0.42];
    for (let i = 0; i < bgShifts.length; i += 1) {
      const candBg = oklchToSrgbGamutMapped({ L: clampFinite(origBgLch.L + bgShifts[i], 0.04, 0.99, origBgLch.L), C: origBgLch.C, H: origBgLch.H });
      const joint = searchForegroundForFixedBackground(origFg, origFgLch, origBg, origBgLch, candBg, constraints);
      if (isBetterEvaluation(joint, bestEval)) bestEval = joint;
    }
  }

  return {
    feasible: bestEval.feasible,
    needsAdjustment: true,
    originalForeground: origFg,
    originalBackground: origBg,
    adjustedForeground: bestEval.fg,
    adjustedBackground: bestEval.bg,
    originalForegroundOklch: origFgLch,
    adjustedForegroundOklch: bestEval.fgLch,
    originalBackgroundOklch: origBgLch,
    adjustedBackgroundOklch: bestEval.bgLch,
    deltaEFromOriginal: bestEval.deltaEFg,
    backgroundDeltaEFromOriginal: bestEval.deltaEBg,
    totalPerceptualDrift: bestEval.deltaEFg + bestEval.deltaEBg,
    hueShiftDeg: bestEval.hueShiftFg,
    backgroundHueShiftDeg: bestEval.hueShiftBg,
    naiveBaselineColor,
    naiveBaselineDeltaE,
    beforeWcagRatio,
    afterWcagRatio: computeWcagContrastRatio(bestEval.fg, bestEval.bg),
    beforeOutdoorWcagRatio,
    afterOutdoorWcagRatio: computeOutdoorWcagRatio(bestEval.fg, bestEval.bg, constraints.outdoorGlareVeil, constraints.oledDimFactor),
    beforeApcaLc,
    afterApcaLc: computeApcaContrastLc(bestEval.fg, bestEval.bg),
    beforeCvd,
    afterCvd: computeCvdSeparationSnapshot(bestEval.fg, bestEval.bg),
  };
}

function mergeThresholds(p?: Partial<ReadabilityAuditThresholds>): ReadabilityAuditThresholds {
  const d = DEFAULT_READABILITY_THRESHOLDS;
  if (!p) return d;
  return {
    wcagNormalMin: clampFinite(p.wcagNormalMin ?? d.wcagNormalMin, 1, 21, d.wcagNormalMin),
    wcagLargeMin: clampFinite(p.wcagLargeMin ?? d.wcagLargeMin, 1, 21, d.wcagLargeMin),
    wcagOutdoorNormalMin: clampFinite(p.wcagOutdoorNormalMin ?? d.wcagOutdoorNormalMin, 1, 21, d.wcagOutdoorNormalMin),
    wcagOutdoorLargeMin: clampFinite(p.wcagOutdoorLargeMin ?? d.wcagOutdoorLargeMin, 1, 21, d.wcagOutdoorLargeMin),
    apcaNormalMinAbsLc: clampFinite(p.apcaNormalMinAbsLc ?? d.apcaNormalMinAbsLc, 15, 105, d.apcaNormalMinAbsLc),
    apcaLargeMinAbsLc: clampFinite(p.apcaLargeMinAbsLc ?? d.apcaLargeMinAbsLc, 15, 105, d.apcaLargeMinAbsLc),
    cvdMinDeltaE: clampFinite(p.cvdMinDeltaE ?? d.cvdMinDeltaE, 4, 60, d.cvdMinDeltaE),
    minEffectiveFontSizePx: clampFinite(p.minEffectiveFontSizePx ?? d.minEffectiveFontSizePx, 8, 24, d.minEffectiveFontSizePx),
    minEffectiveStrokeWidthPx: clampFinite(p.minEffectiveStrokeWidthPx ?? d.minEffectiveStrokeWidthPx, 0.25, 4, d.minEffectiveStrokeWidthPx),
    maxHueShiftDeg: clampFinite(p.maxHueShiftDeg ?? d.maxHueShiftDeg, 0, 45, d.maxHueShiftDeg),
  };
}

function round2(value: number): number { return Math.round(value * 100) / 100; }

function auditTextSurface(params: {
  readonly id: string;
  readonly label: string;
  readonly kind: "speech-balloon" | "sfx-badge";
  readonly textColor: RgbColor;
  readonly bgColor: RgbColor;
  readonly sourceFontSizePx: number;
  readonly sourceStrokeWidthPx?: number;
  readonly isLarge: boolean;
  readonly allowBgAdjust: boolean;
  readonly downsampleScale: number;
  readonly mobileViewportWidthPx: number;
  readonly outdoorGlareVeil: number;
  readonly oledDimFactor: number;
  readonly thresholds: ReadabilityAuditThresholds;
}): {
  readonly remediation: MinimalOklchSolveResult;
  readonly effectiveFontSizePx: number;
  readonly recommendedSourceFontSizePx: number | null;
  readonly effectiveStrokeWidthPx: number | null;
  readonly recommendedSourceStrokeWidthPx: number | null;
  readonly issues: ReadabilityIssue[];
} {
  const { thresholds: th, id, label, kind } = params;
  const minWcag = params.isLarge ? th.wcagLargeMin : th.wcagNormalMin;
  const minOutdoor = params.isLarge ? th.wcagOutdoorLargeMin : th.wcagOutdoorNormalMin;
  const surfaceKo = kind === "speech-balloon" ? "말풍선" : "효과음";

  const remediation = solveMinimalOklchColorAdjustment({
    foreground: params.textColor,
    background: params.bgColor,
    minWcagRatio: minWcag,
    minOutdoorWcagRatio: minOutdoor,
    outdoorGlareVeil: params.outdoorGlareVeil,
    oledDimFactor: params.oledDimFactor,
    minCvdDeltaE: th.cvdMinDeltaE,
    cvdTypes: CORE_CVD_AUDIT_TYPES,
    maxHueShiftDeg: th.maxHueShiftDeg,
    allowBackgroundAdjustment: params.allowBgAdjust,
  });

  const issues: ReadabilityIssue[] = [];
  if (remediation.beforeWcagRatio < minWcag) {
    issues.push({
      code: "wcag-contrast-low", severity: "critical", targetId: id, targetKind: kind, targetLabel: label,
      measuredValue: round2(remediation.beforeWcagRatio), requiredValue: minWcag,
      messageKo: `${surfaceKo} '${label}' 명암비가 ${remediation.beforeWcagRatio.toFixed(2)}:1로 기준(${minWcag.toFixed(1)}:1)보다 낮습니다.`,
    });
  }
  if (remediation.beforeOutdoorWcagRatio < minOutdoor) {
    issues.push({
      code: "outdoor-glare-contrast-low",
      severity: kind === "speech-balloon" && remediation.beforeWcagRatio < minWcag ? "critical" : "warning",
      targetId: id, targetKind: kind, targetLabel: label,
      measuredValue: round2(remediation.beforeOutdoorWcagRatio), requiredValue: minOutdoor,
      messageKo: `야외 반사광 환경에서 ${surfaceKo} '${label}' 명암비가 ${remediation.beforeOutdoorWcagRatio.toFixed(2)}:1까지 떨어집니다.`,
    });
  }
  if (remediation.beforeCvd.worstCoreCvdDeltaE < th.cvdMinDeltaE) {
    issues.push({
      code: "cvd-separation-collapsed", severity: "critical", targetId: id, targetKind: kind, targetLabel: label,
      measuredValue: round2(remediation.beforeCvd.worstCoreCvdDeltaE), requiredValue: th.cvdMinDeltaE,
      messageKo: `색각이상 시야에서 ${surfaceKo} '${label}' 색차(ΔE ${remediation.beforeCvd.worstCoreCvdDeltaE.toFixed(1)})가 기준(${th.cvdMinDeltaE}) 미만입니다.`,
    });
  }

  const effFont = Math.max(0, params.sourceFontSizePx) * params.downsampleScale;
  const recFont = effFont < th.minEffectiveFontSizePx ? Math.ceil(th.minEffectiveFontSizePx / params.downsampleScale) : null;
  if (recFont !== null) {
    issues.push({
      code: "mobile-font-too-small", severity: effFont < 11 ? "critical" : "warning",
      targetId: id, targetKind: kind, targetLabel: label,
      measuredValue: round2(effFont), requiredValue: th.minEffectiveFontSizePx,
      messageKo: `${params.mobileViewportWidthPx}px 모바일에서 ${surfaceKo} '${label}' 글자가 ${effFont.toFixed(1)}px로 축소됩니다(원고 ${recFont}px 이상 권장).`,
    });
  }

  const effStroke = params.sourceStrokeWidthPx !== undefined ? Math.max(0, params.sourceStrokeWidthPx) * params.downsampleScale : null;
  const recStroke =
    effStroke !== null && effStroke < th.minEffectiveStrokeWidthPx
      ? round2(th.minEffectiveStrokeWidthPx / params.downsampleScale)
      : null;
  if (effStroke !== null && recStroke !== null) {
    issues.push({
      code: "mobile-hairline-vanishing", severity: "warning", targetId: id, targetKind: kind, targetLabel: label,
      measuredValue: round2(effStroke), requiredValue: th.minEffectiveStrokeWidthPx,
      messageKo: `${params.mobileViewportWidthPx}px 축소 시 ${surfaceKo} '${label}' 선폭이 ${effStroke.toFixed(2)}px로 흐려집니다(원고 ${recStroke}px 이상 권장).`,
    });
  }

  return {
    remediation,
    effectiveFontSizePx: round2(effFont),
    recommendedSourceFontSizePx: recFont,
    effectiveStrokeWidthPx: effStroke === null ? null : round2(effStroke),
    recommendedSourceStrokeWidthPx: recStroke,
    issues,
  };
}

/** 웹툰 컷의 말풍선·효과음(SFX)·캐릭터-배경 실루엣 쌍을 감사하고 OKLCH 최소 보정안을 산출한다. */
export function auditAndSuggestMinimalReadabilityFixes(input: WebtoonCutReadabilityInput): CutReadabilityAuditResult {
  const sourcePanelWidthPx = Math.max(1, clampFinite(input.sourcePanelWidthPx, 1, 16384, 800));
  const mobileViewportWidthPx = Math.max(
    120,
    clampFinite(input.mobileViewportWidthPx ?? DEFAULT_MOBILE_VIEWPORT_WIDTH_PX, 120, 4096, DEFAULT_MOBILE_VIEWPORT_WIDTH_PX),
  );
  const downsampleScale = mobileViewportWidthPx / sourcePanelWidthPx;
  const outdoorGlareVeil = clampFinite(input.outdoorGlareVeil ?? DEFAULT_OUTDOOR_GLARE_VEIL, 0, MAX_OUTDOOR_GLARE_VEIL, DEFAULT_OUTDOOR_GLARE_VEIL);
  const oledDimFactor = clampFinite(input.oledDimFactor ?? 1.0, MIN_OLED_DIM_FACTOR, 1.0, 1.0);
  const thresholds = mergeThresholds(input.thresholds);
  const allIssues: ReadabilityIssue[] = [];

  const balloons: BalloonAuditFinding[] = input.speechBalloons.map((b) => {
    const res = auditTextSurface({
      id: b.id, label: b.label, kind: "speech-balloon", textColor: b.textColor, bgColor: b.fillColor,
      sourceFontSizePx: b.sourceFontSizePx, sourceStrokeWidthPx: b.sourceBorderStrokeWidthPx,
      isLarge: Boolean(b.isLargeOrBold), allowBgAdjust: true,
      downsampleScale, mobileViewportWidthPx, outdoorGlareVeil, oledDimFactor, thresholds,
    });
    allIssues.push(...res.issues);
    return {
      id: b.id, label: b.label, passed: res.issues.length === 0,
      effectiveFontSizePx: res.effectiveFontSizePx,
      recommendedSourceFontSizePx: res.recommendedSourceFontSizePx,
      effectiveBorderStrokeWidthPx: res.effectiveStrokeWidthPx,
      recommendedSourceBorderStrokeWidthPx: res.recommendedSourceStrokeWidthPx,
      remediation: res.remediation, issues: res.issues,
    };
  });

  const sfxBadges: SfxAuditFinding[] = (input.sfxBadges ?? []).map((s) => {
    const res = auditTextSurface({
      id: s.id, label: s.label, kind: "sfx-badge", textColor: s.textColor, bgColor: s.backgroundColor,
      sourceFontSizePx: s.sourceFontSizePx, sourceStrokeWidthPx: s.sourceStrokeWidthPx,
      isLarge: s.isLargeOrBold ?? true, allowBgAdjust: false,
      downsampleScale, mobileViewportWidthPx, outdoorGlareVeil, oledDimFactor, thresholds,
    });
    allIssues.push(...res.issues);
    return {
      id: s.id, label: s.label, passed: res.issues.length === 0,
      effectiveFontSizePx: res.effectiveFontSizePx,
      recommendedSourceFontSizePx: res.recommendedSourceFontSizePx,
      effectiveStrokeWidthPx: res.effectiveStrokeWidthPx,
      recommendedSourceStrokeWidthPx: res.recommendedSourceStrokeWidthPx,
      remediation: res.remediation, issues: res.issues,
    };
  });

  const silhouettes: SilhouetteAuditFinding[] = input.silhouettePairs.map((p) => {
    const remediation = solveMinimalOklchColorAdjustment({
      foreground: p.characterColor, background: p.backgroundColor,
      minWcagRatio: 1, minOutdoorWcagRatio: 1, outdoorGlareVeil, oledDimFactor,
      minCvdDeltaE: thresholds.cvdMinDeltaE, cvdTypes: CORE_CVD_AUDIT_TYPES,
      maxHueShiftDeg: thresholds.maxHueShiftDeg, allowBackgroundAdjustment: false,
    });
    const issues: ReadabilityIssue[] = [];
    if (remediation.beforeCvd.worstCoreCvdDeltaE < thresholds.cvdMinDeltaE) {
      issues.push({
        code: "cvd-separation-collapsed", severity: "critical", targetId: p.id, targetKind: "character-silhouette", targetLabel: p.label,
        measuredValue: round2(remediation.beforeCvd.worstCoreCvdDeltaE), requiredValue: thresholds.cvdMinDeltaE,
        messageKo: `캐릭터·배경 '${p.label}' 쌍이 색각이상 시야에서 겹쳐 보입니다(최저 ΔE ${remediation.beforeCvd.worstCoreCvdDeltaE.toFixed(1)} < 기준 ${thresholds.cvdMinDeltaE}).`,
      });
    }
    const effLine = p.lineartWidthPx !== undefined ? Math.max(0, p.lineartWidthPx) * downsampleScale : null;
    const recLine =
      effLine !== null && effLine < thresholds.minEffectiveStrokeWidthPx
        ? round2(thresholds.minEffectiveStrokeWidthPx / downsampleScale)
        : null;
    if (effLine !== null && recLine !== null) {
      issues.push({
        code: "mobile-hairline-vanishing", severity: "warning", targetId: p.id, targetKind: "character-silhouette", targetLabel: p.label,
        measuredValue: round2(effLine), requiredValue: thresholds.minEffectiveStrokeWidthPx,
        messageKo: `캐릭터 '${p.label}' 선화가 ${mobileViewportWidthPx}px 축소 시 ${effLine.toFixed(2)}px로 뭉개집니다(원고 ${recLine}px 이상 권장).`,
      });
    }
    allIssues.push(...issues);
    return {
      id: p.id, label: p.label, passed: issues.length === 0,
      effectiveLineartWidthPx: effLine === null ? null : round2(effLine),
      recommendedSourceLineartWidthPx: recLine, remediation, issues,
    };
  });

  return {
    cutId: input.cutId,
    cutTitle: input.cutTitle && input.cutTitle.trim().length > 0 ? input.cutTitle : input.cutId,
    sourcePanelWidthPx, mobileViewportWidthPx, downsampleScale, outdoorGlareVeil, oledDimFactor,
    thresholds, passed: allIssues.length === 0, balloons, sfxBadges, silhouettes, issues: allIssues,
  };
}
