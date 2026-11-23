/**
 * 붉은펜 수정 전/후 픽셀 자동 재검수 엔진 + 2D 캐릭터 ↔ 3D 배경 시각 이질감 진단 엔진.
 *
 * 1. `reverifyRedlinePinsByPixelDiff`: PD 붉은펜 핀 반경 내 수정 전/후 RGBA 버퍼를 RGB·휘도·알파 차분으로 비교해
 *    수정 완료(`verified-fixed`), 부분 수정(`partial-change`), 수정 누락(`missed-unchanged`)과 2차 재검수 통계를 산출한다.
 * 2. `diagnose2d3dVisualCohesion`: 2D 캐릭터(광원각·외곽선 두께·OKLCH 채도)와 3D 배경(태양각·라인 두께·채도)의 편차를
 *    단조 감점 모델로 평가해 조화 점수(0..100), 경고 목록, 추천 조명 프리셋, 추천 3D 외곽선 두께를 반환한다.
 */

import { computeRelativeLuminance } from "./pinhole-bleed-scanner";

export interface RedlinePinTarget {
  readonly id: string;
  readonly xPx: number;
  readonly yPx: number;
  readonly radiusPx: number;
  readonly label: string;
  readonly labelEn?: string;
}

export type RedlineReverifyVerdict =
  | "verified-fixed"
  | "partial-change"
  | "missed-unchanged";

export interface RedlineReverifyOptions {
  /** 픽셀 변경 판정 최소 RGB 유클리드 차분 (기본: 12) */
  readonly rgbDiffThreshold?: number;
  /** 픽셀 변경 판정 최소 상대 휘도 차분 (기본: 0.04) */
  readonly luminanceDiffThreshold?: number;
  /** 픽셀 변경 판정 최소 알파 차분 (기본: 12) */
  readonly alphaDiffThreshold?: number;
  /** verified-fixed 최소 변화 비율 (기본: 0.08 = 8%) */
  readonly verifiedRatioThreshold?: number;
  /** partial-change 최소 변화 비율 (기본: 0.015 = 1.5%) */
  readonly partialRatioThreshold?: number;
  /** verified-fixed 최소 변경 픽셀 하한 (기본: 4) */
  readonly minVerifiedPixels?: number;
}

export interface RedlinePinReverifyItem {
  readonly id: string;
  readonly xPx: number;
  readonly yPx: number;
  readonly radiusPx: number;
  readonly label: string;
  readonly labelEn: string;
  readonly sampledPixelCount: number;
  readonly changedPixelCount: number;
  readonly changedRatio: number;
  readonly meanRgbDelta: number;
  readonly meanLuminanceDelta: number;
  readonly maxRgbDelta: number;
  readonly verdict: RedlineReverifyVerdict;
}

export interface RedlineReverifySummary {
  readonly totalPins: number;
  readonly verifiedFixedCount: number;
  readonly partialChangeCount: number;
  readonly missedUnchangedCount: number;
  readonly completionRate: number;
  readonly averageChangedRatio: number;
  readonly readyForApproval: boolean;
  readonly missedPinIds: readonly string[];
}

export interface RedlineReverifyReport {
  readonly width: number;
  readonly height: number;
  readonly results: readonly RedlinePinReverifyItem[];
  /** 수정 누락(missed-unchanged) → 부분 수정(partial-change) → 수정 완료(verified-fixed) 순으로 정렬된 뷰 */
  readonly prioritizedResults: readonly RedlinePinReverifyItem[];
  readonly summary: RedlineReverifySummary;
}

export interface DemoRedlineReverifyFixture {
  readonly width: number;
  readonly height: number;
  readonly beforeRgba: Uint8ClampedArray;
  readonly afterRgba: Uint8ClampedArray;
  readonly pins: readonly RedlinePinTarget[];
}

export interface Cut2dVisualMetrics {
  /** 2D 캐릭터 주광원 방위각 (0..360도) */
  readonly lightAngleDeg: number;
  /** 2D 캐릭터 외곽선 두께 (px) */
  readonly outlinePx: number;
  /** 2D 캐릭터 대표 OKLCH 채도 C (0..0.40) */
  readonly oklchChroma: number;
}

export interface Bg3dVisualMetrics {
  /** 3D 배경 태양/주광 방위각 (0..360도) */
  readonly sunAngleDeg: number;
  /** 3D 배경 NPR 추출 라인 두께 (px) */
  readonly linePx: number;
  /** 3D 배경 평균 OKLCH 채도 C (0..0.40) */
  readonly oklchChroma: number;
}

export type CohesionWarningAxis = "lighting" | "outline" | "chroma";
export type CohesionWarningSeverity = "high" | "medium";
export type CohesionGrade = "harmonious" | "needs-tuning" | "clashing";

export interface CohesionDiagnosticWarning {
  readonly axis: CohesionWarningAxis;
  readonly severity: CohesionWarningSeverity;
  readonly deltaLabel: string;
  readonly messageKo: string;
  readonly messageEn: string;
  readonly actionKo: string;
  readonly actionEn: string;
}

export type LightingPresetId =
  | "front-right-key"
  | "top-noon-key"
  | "front-left-key"
  | "rim-backlight-cool";

export interface RecommendedLightingPreset {
  readonly id: LightingPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly targetSunAngleDeg: number;
  readonly shadowSoftness: number;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface VisualCohesionDiagnosis {
  /** 0..100 정수 조화 점수 (편차가 커질수록 단조 감소) */
  readonly cohesionScore: number;
  /** 반올림 전 정밀 점수 (0..100) */
  readonly rawCohesionScore: number;
  readonly grade: CohesionGrade;
  readonly deltas: {
    readonly lightAngleDiffDeg: number;
    readonly outlineDiffPx: number;
    readonly chromaDiff: number;
  };
  readonly penalties: {
    readonly lighting: number;
    readonly outline: number;
    readonly chroma: number;
  };
  readonly warnings: readonly CohesionDiagnosticWarning[];
  readonly recommendedLightingPreset: RecommendedLightingPreset;
  readonly recommendedOutlinePx: number;
  readonly recommendedBgChroma: number;
}

export interface CohesionScenarioPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly cut2d: Cut2dVisualMetrics;
  readonly bg3d: Bg3dVisualMetrics;
}

const DEFAULT_REVERIFY_OPTIONS = Object.freeze({
  rgbDiffThreshold: 12,
  luminanceDiffThreshold: 0.04,
  alphaDiffThreshold: 12,
  verifiedRatioThreshold: 0.08,
  partialRatioThreshold: 0.015,
  minVerifiedPixels: 4,
});

const VERDICT_PRIORITY: Readonly<Record<RedlineReverifyVerdict, number>> = Object.freeze({
  "missed-unchanged": 0,
  "partial-change": 1,
  "verified-fixed": 2,
});

function clampFinite(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/** 0..360도 각도 정규화 */
export function normalizeAngleDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

/** 원형 최단 각도 차분 (0..180도) */
export function computeShortestAngleDiffDeg(angleA: number, angleB: number): number {
  const a = normalizeAngleDeg(angleA);
  const b = normalizeAngleDeg(angleB);
  const raw = Math.abs(a - b);
  return Math.min(raw, 360 - raw);
}

/**
 * PD가 남긴 붉은펜 핀 반경 내의 수정 전/후 RGBA 버퍼를 픽셀 단위로 비교해
 * 변경 픽셀 수·변화율·판정(`verified-fixed` | `partial-change` | `missed-unchanged`)과
 * 2차 재검수 요약 통계를 산출한다.
 */
export function reverifyRedlinePinsByPixelDiff(
  beforeRgba: Uint8ClampedArray,
  afterRgba: Uint8ClampedArray,
  width: number,
  height: number,
  pins: readonly RedlinePinTarget[],
  options?: RedlineReverifyOptions,
): RedlineReverifyReport {
  const safeWidth = Number.isInteger(width) && width > 0 ? width : 0;
  const safeHeight = Number.isInteger(height) && height > 0 ? height : 0;
  const requiredBytes = safeWidth * safeHeight * 4;
  const buffersValid =
    safeWidth > 0 &&
    safeHeight > 0 &&
    beforeRgba.length >= requiredBytes &&
    afterRgba.length >= requiredBytes;

  const rgbThreshold = clampFinite(options?.rgbDiffThreshold, 1, 255, DEFAULT_REVERIFY_OPTIONS.rgbDiffThreshold);
  const lumaThreshold = clampFinite(
    options?.luminanceDiffThreshold,
    0.005,
    1,
    DEFAULT_REVERIFY_OPTIONS.luminanceDiffThreshold,
  );
  const alphaThreshold = clampFinite(
    options?.alphaDiffThreshold,
    1,
    255,
    DEFAULT_REVERIFY_OPTIONS.alphaDiffThreshold,
  );
  const partialRatioThreshold = clampFinite(
    options?.partialRatioThreshold,
    0.001,
    0.5,
    DEFAULT_REVERIFY_OPTIONS.partialRatioThreshold,
  );
  const verifiedRatioThreshold = Math.max(
    partialRatioThreshold,
    clampFinite(options?.verifiedRatioThreshold, 0.01, 1, DEFAULT_REVERIFY_OPTIONS.verifiedRatioThreshold),
  );
  const minVerifiedPixels = Math.round(
    clampFinite(options?.minVerifiedPixels, 1, 1000, DEFAULT_REVERIFY_OPTIONS.minVerifiedPixels),
  );

  const results: RedlinePinReverifyItem[] = pins.map((pin) => {
    const safeRadius = clampFinite(pin.radiusPx, 1, Math.max(safeWidth, safeHeight, 1), 6);
    const labelEn = pin.labelEn?.trim() || pin.label;

    if (!buffersValid) {
      return {
        id: pin.id,
        xPx: pin.xPx,
        yPx: pin.yPx,
        radiusPx: safeRadius,
        label: pin.label,
        labelEn,
        sampledPixelCount: 0,
        changedPixelCount: 0,
        changedRatio: 0,
        meanRgbDelta: 0,
        meanLuminanceDelta: 0,
        maxRgbDelta: 0,
        verdict: "missed-unchanged",
      };
    }

    const minX = Math.max(0, Math.floor(pin.xPx - safeRadius));
    const maxX = Math.min(safeWidth - 1, Math.ceil(pin.xPx + safeRadius));
    const minY = Math.max(0, Math.floor(pin.yPx - safeRadius));
    const maxY = Math.min(safeHeight - 1, Math.ceil(pin.yPx + safeRadius));
    const radiusSq = safeRadius * safeRadius;

    let sampledPixelCount = 0;
    let changedPixelCount = 0;
    let sumRgbDelta = 0;
    let sumLumaDelta = 0;
    let maxRgbDelta = 0;

    for (let y = minY; y <= maxY; y += 1) {
      const dy = y - pin.yPx;
      const dySq = dy * dy;
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - pin.xPx;
        if (dx * dx + dySq > radiusSq) continue;

        sampledPixelCount += 1;
        const off = (y * safeWidth + x) * 4;

        const r0 = beforeRgba[off] ?? 0;
        const g0 = beforeRgba[off + 1] ?? 0;
        const b0 = beforeRgba[off + 2] ?? 0;
        const a0 = beforeRgba[off + 3] ?? 0;

        const r1 = afterRgba[off] ?? 0;
        const g1 = afterRgba[off + 1] ?? 0;
        const b1 = afterRgba[off + 2] ?? 0;
        const a1 = afterRgba[off + 3] ?? 0;

        const rgbDelta = Math.hypot(r1 - r0, g1 - g0, b1 - b0);
        const lumaDelta = Math.abs(
          computeRelativeLuminance(r1, g1, b1) - computeRelativeLuminance(r0, g0, b0),
        );
        const alphaDelta = Math.abs(a1 - a0);

        sumRgbDelta += rgbDelta;
        sumLumaDelta += lumaDelta;
        if (rgbDelta > maxRgbDelta) maxRgbDelta = rgbDelta;

        if (
          rgbDelta >= rgbThreshold ||
          lumaDelta >= lumaThreshold ||
          alphaDelta >= alphaThreshold
        ) {
          changedPixelCount += 1;
        }
      }
    }

    const changedRatio = sampledPixelCount > 0 ? changedPixelCount / sampledPixelCount : 0;
    const minNeededForVerified = Math.min(minVerifiedPixels, Math.max(1, sampledPixelCount));

    let verdict: RedlineReverifyVerdict = "missed-unchanged";
    if (changedRatio >= verifiedRatioThreshold && changedPixelCount >= minNeededForVerified) {
      verdict = "verified-fixed";
    } else if (changedRatio >= partialRatioThreshold && changedPixelCount >= 1) {
      verdict = "partial-change";
    }

    return {
      id: pin.id,
      xPx: pin.xPx,
      yPx: pin.yPx,
      radiusPx: safeRadius,
      label: pin.label,
      labelEn,
      sampledPixelCount,
      changedPixelCount,
      changedRatio: roundTo(changedRatio, 4),
      meanRgbDelta: sampledPixelCount > 0 ? roundTo(sumRgbDelta / sampledPixelCount, 2) : 0,
      meanLuminanceDelta: sampledPixelCount > 0 ? roundTo(sumLumaDelta / sampledPixelCount, 4) : 0,
      maxRgbDelta: roundTo(maxRgbDelta, 2),
      verdict,
    };
  });

  const prioritizedResults = [...results].sort((a, b) => {
    const priorityDiff = VERDICT_PRIORITY[a.verdict] - VERDICT_PRIORITY[b.verdict];
    if (priorityDiff !== 0) return priorityDiff;
    return a.changedRatio - b.changedRatio;
  });

  let verifiedFixedCount = 0;
  let partialChangeCount = 0;
  let missedUnchangedCount = 0;
  let ratioSum = 0;
  const missedPinIds: string[] = [];

  for (const item of results) {
    ratioSum += item.changedRatio;
    if (item.verdict === "verified-fixed") {
      verifiedFixedCount += 1;
    } else if (item.verdict === "partial-change") {
      partialChangeCount += 1;
    } else {
      missedUnchangedCount += 1;
      missedPinIds.push(item.id);
    }
  }

  const totalPins = results.length;
  const summary: RedlineReverifySummary = {
    totalPins,
    verifiedFixedCount,
    partialChangeCount,
    missedUnchangedCount,
    completionRate: totalPins > 0 ? roundTo(verifiedFixedCount / totalPins, 4) : 1,
    averageChangedRatio: totalPins > 0 ? roundTo(ratioSum / totalPins, 4) : 0,
    readyForApproval: missedUnchangedCount === 0 && partialChangeCount === 0,
    missedPinIds,
  };

  return {
    width: safeWidth,
    height: safeHeight,
    results,
    prioritizedResults,
    summary,
  };
}

function buildRecommendedLightingPreset(cut2dLightAngleDeg: number): RecommendedLightingPreset {
  const angle = Math.round(normalizeAngleDeg(cut2dLightAngleDeg));
  if (angle >= 45 && angle < 135) {
    return {
      id: "top-noon-key",
      labelKo: "상단 자연광 프리셋",
      labelEn: "Overhead Daylight Preset",
      targetSunAngleDeg: angle,
      shadowSoftness: 0.45,
      summaryKo: `3D 태양각을 ${angle}° 상단 광원으로 맞춰 2D 캐릭터 그림자 방향과 일치시킵니다.`,
      summaryEn: `Align 3D sun azimuth to ${angle}° overhead light to match 2D character cast shadows.`,
    };
  }
  if (angle >= 135 && angle < 225) {
    return {
      id: "front-left-key",
      labelKo: "좌측 사광 프리셋",
      labelEn: "Left Key Light Preset",
      targetSunAngleDeg: angle,
      shadowSoftness: 0.55,
      summaryKo: `3D 주광원을 좌측 ${angle}°로 회전해 캐릭터 좌측 하이라이트와 통일합니다.`,
      summaryEn: `Rotate 3D key light to ${angle}° left side to match character rim and highlight side.`,
    };
  }
  if (angle >= 225 && angle < 315) {
    return {
      id: "rim-backlight-cool",
      labelKo: "역광·림라이트 프리셋",
      labelEn: "Backlight & Rim Preset",
      targetSunAngleDeg: angle,
      shadowSoftness: 0.65,
      summaryKo: `3D 배경 광원을 ${angle}° 역광 축으로 맞추고 환경광 대비를 부드럽게 낮춥니다.`,
      summaryEn: `Set 3D scene backlight to ${angle}° and soften ambient bounce to remove flat CG contrast.`,
    };
  }
  return {
    id: "front-right-key",
    labelKo: "우측 사광 프리셋",
    labelEn: "Right Key Light Preset",
    targetSunAngleDeg: angle,
    shadowSoftness: 0.5,
    summaryKo: `3D 주광원을 우측 ${angle}°로 맞춰 2D 캐릭터 우측 주광과 자연스럽게 이어 줍니다.`,
    summaryEn: `Align 3D key light to ${angle}° right side to match the 2D character's primary illumination.`,
  };
}

/**
 * 2D 캐릭터(광원각·외곽선 두께·OKLCH 채도) vs 3D 배경(태양각·라인 두께·채도)의 편차를 분석해
 * 0..100 조화 점수, 항목별 경고, 추천 조명 프리셋, 추천 3D 외곽선 두께를 반환한다.
 *
 * 불변식(단조성): 각 편차(광원각 차분, 선폭 차분, OKLCH 채도 차분)가 증가하면 `rawCohesionScore`는
 * 반드시 엄격하게 감소하며 `cohesionScore`는 절대 증가하지 않는다.
 */
export function diagnose2d3dVisualCohesion(
  cut2dMetrics: Cut2dVisualMetrics,
  bg3dMetrics: Bg3dVisualMetrics,
): VisualCohesionDiagnosis {
  const cut2dAngle = normalizeAngleDeg(cut2dMetrics.lightAngleDeg);
  const bg3dAngle = normalizeAngleDeg(bg3dMetrics.sunAngleDeg);
  const cut2dOutline = clampFinite(cut2dMetrics.outlinePx, 0.2, 12, 2.0);
  const bg3dLine = clampFinite(bg3dMetrics.linePx, 0.1, 12, 1.0);
  const cut2dChroma = clampFinite(cut2dMetrics.oklchChroma, 0, 0.4, 0.14);
  const bg3dChroma = clampFinite(bg3dMetrics.oklchChroma, 0, 0.4, 0.12);

  const lightAngleDiffDeg = computeShortestAngleDiffDeg(cut2dAngle, bg3dAngle);
  const outlineDiffPx = Math.abs(cut2dOutline - bg3dLine);
  const chromaDiff = Math.abs(cut2dChroma - bg3dChroma);

  // 각 축의 단조 증가 감점 함수 (최대 합계 100점: 광원 45 + 선폭 30 + 채도 25)
  const lightNorm = lightAngleDiffDeg / 180;
  const lightPenalty = 45 * ((1 - Math.exp(-2.4 * lightNorm)) / (1 - Math.exp(-2.4)));
  const outlinePenalty = 30 * (1 - Math.exp(-outlineDiffPx / 1.8));
  const chromaPenalty = 25 * (1 - Math.exp(-chromaDiff / 0.08));

  const rawCohesionScore = Math.max(0, Math.min(100, 100 - lightPenalty - outlinePenalty - chromaPenalty));
  const cohesionScore = Math.max(0, Math.min(100, Math.round(rawCohesionScore)));

  const grade: CohesionGrade =
    cohesionScore >= 80 ? "harmonious" : cohesionScore >= 55 ? "needs-tuning" : "clashing";

  const recommendedLightingPreset = buildRecommendedLightingPreset(cut2dAngle);
  const recommendedOutlinePx = roundTo(Math.max(0.5, Math.min(5.0, cut2dOutline * 0.85)), 1);
  const recommendedBgChroma = roundTo(Math.max(0.02, Math.min(0.32, cut2dChroma * 0.88)), 3);

  const warnings: CohesionDiagnosticWarning[] = [];

  if (lightAngleDiffDeg >= 25) {
    const severity: CohesionWarningSeverity = lightAngleDiffDeg >= 60 ? "high" : "medium";
    const roundedDeg = Math.round(lightAngleDiffDeg);
    warnings.push({
      axis: "lighting",
      severity,
      deltaLabel: `${roundedDeg}°`,
      messageKo: `2D 캐릭터 광원과 3D 배경 태양각이 ${roundedDeg}° 어긋나 캐릭터가 배경 위에 떠 보입니다.`,
      messageEn: `2D character light and 3D sun angle diverge by ${roundedDeg}°, causing a pasted-on look.`,
      actionKo: `${recommendedLightingPreset.labelKo}(${recommendedLightingPreset.targetSunAngleDeg}°)으로 3D 태양각을 맞추세요.`,
      actionEn: `Switch 3D lighting to ${recommendedLightingPreset.labelEn} (${recommendedLightingPreset.targetSunAngleDeg}°).`,
    });
  }

  if (outlineDiffPx >= 0.7) {
    const severity: CohesionWarningSeverity = outlineDiffPx >= 1.5 ? "high" : "medium";
    const roundedPx = roundTo(outlineDiffPx, 1);
    const bgTooThin = bg3dLine < cut2dOutline;
    warnings.push({
      axis: "outline",
      severity,
      deltaLabel: `${roundedPx}px`,
      messageKo: bgTooThin
        ? `3D 배경 라인(${roundTo(bg3dLine, 1)}px)이 2D 외곽선(${roundTo(cut2dOutline, 1)}px)보다 너무 얇아 CG 이질감이 큽니다.`
        : `3D 배경 라인(${roundTo(bg3dLine, 1)}px)이 2D 외곽선(${roundTo(cut2dOutline, 1)}px)보다 두꺼워 캐릭터 시선을 빼앗습니다.`,
      messageEn: bgTooThin
        ? `3D background lines (${roundTo(bg3dLine, 1)}px) are too thin against 2D ink (${roundTo(cut2dOutline, 1)}px), looking overly CG.`
        : `3D background lines (${roundTo(bg3dLine, 1)}px) overpower the 2D character outline (${roundTo(cut2dOutline, 1)}px).`,
      actionKo: `3D NPR 라인 두께를 ${recommendedOutlinePx}px로 조정하세요.`,
      actionEn: `Set 3D NPR line thickness to ${recommendedOutlinePx}px.`,
    });
  }

  if (chromaDiff >= 0.045) {
    const severity: CohesionWarningSeverity = chromaDiff >= 0.09 ? "high" : "medium";
    const roundedChroma = roundTo(chromaDiff, 3);
    const bgOversaturated = bg3dChroma > cut2dChroma;
    warnings.push({
      axis: "chroma",
      severity,
      deltaLabel: `ΔC ${roundedChroma}`,
      messageKo: bgOversaturated
        ? `3D 배경 채도(C=${roundTo(bg3dChroma, 2)})가 캐릭터(C=${roundTo(cut2dChroma, 2)})보다 과해 전경 인물이 묻힙니다.`
        : `3D 배경 채도(C=${roundTo(bg3dChroma, 2)})가 캐릭터(C=${roundTo(cut2dChroma, 2)})보다 지나치게 낮아 색감이 따로 놉니다.`,
      messageEn: bgOversaturated
        ? `3D background chroma (C=${roundTo(bg3dChroma, 2)}) overpowers the 2D character (C=${roundTo(cut2dChroma, 2)}).`
        : `3D background chroma (C=${roundTo(bg3dChroma, 2)}) looks washed out next to the 2D character (C=${roundTo(cut2dChroma, 2)}).`,
      actionKo: `3D 배경 OKLCH 채도를 ${recommendedBgChroma} 부근으로 보정하세요.`,
      actionEn: `Tune 3D background OKLCH chroma near ${recommendedBgChroma}.`,
    });
  }

  return {
    cohesionScore,
    rawCohesionScore: roundTo(rawCohesionScore, 2),
    grade,
    deltas: {
      lightAngleDiffDeg: roundTo(lightAngleDiffDeg, 1),
      outlineDiffPx: roundTo(outlineDiffPx, 2),
      chromaDiff: roundTo(chromaDiff, 3),
    },
    penalties: {
      lighting: roundTo(lightPenalty, 2),
      outline: roundTo(outlinePenalty, 2),
      chroma: roundTo(chromaPenalty, 2),
    },
    warnings,
    recommendedLightingPreset,
    recommendedOutlinePx,
    recommendedBgChroma,
  };
}

function paintDiscRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));
  const rSq = radius * radius;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > rSq) continue;
      const off = (y * width + x) * 4;
      rgba[off] = r;
      rgba[off + 1] = g;
      rgba[off + 2] = b;
      rgba[off + 3] = a;
    }
  }
}

/**
 * 붉은펜 자동 재검수 데모용 수정 전/후 RGBA 버퍼와 4개 PD 검수 핀을 생성한다.
 * - 핀 1, 2: 수정 완료 (`verified-fixed`)
 * - 핀 3: 부분 수정 (`partial-change`)
 * - 핀 4: 수정 누락 (`missed-unchanged`, 최상단 경고 대상)
 */
export function createDemoRedlineReverifyFixture(): DemoRedlineReverifyFixture {
  const width = 96;
  const height = 96;
  const beforeRgba = new Uint8ClampedArray(width * height * 4);

  // 기본 컷 베이스 채색
  for (let i = 0; i < width * height; i += 1) {
    const off = i * 4;
    beforeRgba[off] = 224;
    beforeRgba[off + 1] = 216;
    beforeRgba[off + 2] = 206;
    beforeRgba[off + 3] = 255;
  }

  const afterRgba = new Uint8ClampedArray(beforeRgba);

  const pins: readonly RedlinePinTarget[] = [
    {
      id: "pd-pin-01",
      xPx: 26,
      yPx: 24,
      radiusPx: 8,
      label: "앞머리 음영 경계선 정리",
      labelEn: "Clean bangs shadow boundary",
    },
    {
      id: "pd-pin-02",
      xPx: 70,
      yPx: 28,
      radiusPx: 8,
      label: "우측 어깨선 밑색 삐져나옴 제거",
      labelEn: "Trim right shoulder color bleed",
    },
    {
      id: "pd-pin-03",
      xPx: 48,
      yPx: 54,
      radiusPx: 9,
      label: "오른쪽 눈 하이라이트 위치 보정",
      labelEn: "Adjust right eye highlight position",
    },
    {
      id: "pd-pin-04",
      xPx: 30,
      yPx: 74,
      radiusPx: 8,
      label: "귀걸이 금속 반사광 누락 보완",
      labelEn: "Restore missing earring metallic specular",
    },
  ];

  // 핀 1: 충분히 수정됨 (반경 5px 채색 변경 → ~40% 변화 → verified-fixed)
  paintDiscRgba(afterRgba, width, height, 26, 24, 5, 62, 78, 128, 255);
  // 핀 2: 충분히 수정됨 (반경 5px 알파/배경 정리 → ~40% 변화 → verified-fixed)
  paintDiscRgba(afterRgba, width, height, 70, 28, 5, 244, 240, 232, 255);
  // 핀 3: 소폭 부분 수정 (반경 1.4px 약 9px 변경 / ~254px ≈ 3.5% → partial-change)
  paintDiscRgba(afterRgba, width, height, 48, 54, 1.4, 140, 124, 118, 255);
  // 핀 4: 전혀 손대지 않음 (0% 변화 → missed-unchanged)

  return { width, height, beforeRgba, afterRgba, pins };
}

/**
 * 데모 UI에서 특정 누락/부분수정 핀 반경에 시뮬레이션 보정 픽셀을 적용한 새 `Uint8ClampedArray`를 반환한다.
 */
export function applySimulatedFixAtRedlinePin(
  afterRgba: Uint8ClampedArray,
  width: number,
  height: number,
  pin: RedlinePinTarget,
): Uint8ClampedArray {
  const next = new Uint8ClampedArray(afterRgba);
  const paintRadius = Math.max(2, Math.round(pin.radiusPx * 0.65));
  paintDiscRgba(next, width, height, pin.xPx, pin.yPx, paintRadius, 92, 118, 152, 255);
  return next;
}

export const DEFAULT_CUT_2D_METRICS: Cut2dVisualMetrics = Object.freeze({
  lightAngleDeg: 45,
  outlinePx: 2.4,
  oklchChroma: 0.15,
});

export const DEFAULT_BG_3D_METRICS: Bg3dVisualMetrics = Object.freeze({
  sunAngleDeg: 195,
  linePx: 0.6,
  oklchChroma: 0.27,
});

export const COHESION_DEMO_PRESETS: readonly CohesionScenarioPreset[] = Object.freeze([
  {
    id: "clash-cg",
    labelKo: "이질감 큼 (3D 불일치)",
    labelEn: "High Clash (Unmatched 3D)",
    cut2d: DEFAULT_CUT_2D_METRICS,
    bg3d: DEFAULT_BG_3D_METRICS,
  },
  {
    id: "sunset-rim",
    labelKo: "노을 역광 장면",
    labelEn: "Sunset Rim Scene",
    cut2d: { lightAngleDeg: 260, outlinePx: 2.0, oklchChroma: 0.17 },
    bg3d: { sunAngleDeg: 210, linePx: 1.1, oklchChroma: 0.22 },
  },
  {
    id: "balanced-studio",
    labelKo: "조화 완료 기준",
    labelEn: "Harmonized Baseline",
    cut2d: { lightAngleDeg: 45, outlinePx: 2.2, oklchChroma: 0.14 },
    bg3d: { sunAngleDeg: 45, linePx: 1.9, oklchChroma: 0.12 },
  },
]);
