/**
 * 흑백/모노톤 출판용 스크린톤 각도 모와레 경고 검사기 및
 * 120%·150% 분수 DPR(fractional DPR) 하프톤 도트 계단 모와레 방지 디바이스 픽셀 정수 스냅 엔진.
 *
 * - `#019`: 겹톤(다중 스크린톤) 각도 차(90°/180° 대칭 접힘), 유사 선 수(LPI) 비트 주파수,
 *   픽셀 격자 직교 정렬(0°/90°) 및 나이퀴스트 미달(셀 < 3px)을 검사해 구체적인 권장 각도와 경고를 산출한다.
 * - `#020`: 120%(1.2×)·125%(1.25×)·150%(1.5×)·175%(1.75×) 등 분수 DPR 환경에서 논리 망점 셀 크기가
 *   물리 디바이스 픽셀의 비정수 배수가 되어 생기는 도트 계단 모와레(주기적 명암 띠)를 막기 위해
 *   망점 주기와 위상 원점을 물리 디바이스 픽셀 정수 그리드에 정확히 스냅한다.
 */

import type { ScreentoneLayer, ScreentoneToneKind } from "./screentone-layer";

export const SCREENTONE_CELL_BASE_REFERENCE_PX = 300;

/** 인쇄·출판 하프톤 표준 안전 각도 분리 기준(도). */
export const SCREENTONE_ROSETTE_IDEAL_DELTA_DEG = 30;
export const SCREENTONE_MOIRE_HIGH_RISK_DELTA_DEG = 15;
export const SCREENTONE_MOIRE_MEDIUM_RISK_DELTA_DEG = 25;

export type ScreentoneMoireSeverity = "none" | "medium" | "high";

export type ScreentoneMoireWarningCode =
  | "stacked-angle-collision"
  | "frequency-harmonic-beat"
  | "orthogonal-grid-aliasing"
  | "nyquist-undersampling"
  | "fractional-dpr-staircase";

export interface ScreentoneMoireWarning {
  readonly code: ScreentoneMoireWarningCode;
  readonly severity: Exclude<ScreentoneMoireSeverity, "none">;
  readonly messageKo: string;
  readonly measuredAngleDeltaDeg?: number;
  readonly recommendedAngleDeg?: number;
}

export interface ScreentoneMoireInspectionReport {
  readonly hasWarning: boolean;
  readonly severity: ScreentoneMoireSeverity;
  readonly warnings: readonly ScreentoneMoireWarning[];
  readonly minAngleSeparationDeg: number | null;
  readonly recommendedAngleDeg: number;
  readonly isPrintSafeMonochrome: boolean;
}

export interface ScreentoneDevicePixelSnapInput {
  readonly lines: number;
  /** 화면 배율 DPR (예: 1, 1.2, 1.25, 1.5, 2). 기본 1. */
  readonly dpr?: number;
  /** 뷰포트 줌 배율 (예: 1, 0.75, 1.25). 기본 1. */
  readonly zoomScale?: number;
  /** 망점 위상 원점 오프셋(CSS px). 기본 [0, 0]. */
  readonly originCssPx?: readonly [number, number];
  /** 셀 기준 픽셀(기본 300). */
  readonly cellBasePx?: number;
  /** 망점 종류(도트·격자 등). */
  readonly kind?: ScreentoneToneKind;
}

export interface ScreentoneDevicePixelSnapPlan {
  readonly dpr: number;
  readonly zoomScale: number;
  readonly effectiveScale: number;
  readonly isFractionalDpr: boolean;
  readonly rawCssCellPx: number;
  readonly rawDeviceCellPx: number;
  /** 물리 디바이스 픽셀 기준 정확히 정수로 스냅된 망점 셀 한 변 길이(≥ 2). */
  readonly snappedDeviceCellPx: number;
  /** CSS 논리 좌표계에서 정수 디바이스 픽셀 격자에 일치하는 셀 길이. */
  readonly snappedCssCellPx: number;
  readonly pitchDriftDevicePx: number;
  readonly snappedOriginCssPx: readonly [number, number];
  readonly snappedOriginDevicePx: readonly [number, number];
  readonly eliminatesBeatMoire: boolean;
}

function round4(value: number): number {
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeAngleDeg(angle: number): number {
  if (!Number.isFinite(angle)) return 45;
  return ((angle % 180) + 180) % 180;
}

function symmetryPeriodDeg(kind: ScreentoneToneKind): number {
  if (kind === "dot" || kind === "cross") return 90;
  if (kind === "line") return 180;
  return 0;
}

/**
 * 두 망점 패턴의 대칭 주기를 반영한 최소 각도 차(도)를 계산한다.
 * - 도트/격자: 90° 회전 대칭 → 결과 범위 0° ~ 45°
 * - 사선: 180° 회전 대칭 → 결과 범위 0° ~ 90°
 * - 모래망점(sand): 비주기 확률 입자이므로 null 반환
 */
export function computeScreentoneAngleSeparationDeg(
  angleA: number,
  angleB: number,
  kindA: ScreentoneToneKind,
  kindB: ScreentoneToneKind,
): number | null {
  if (kindA === "sand" || kindB === "sand") return null;
  const period = kindA === "line" && kindB === "line" ? 180 : 90;
  const a = normalizeAngleDeg(angleA);
  const b = normalizeAngleDeg(angleB);
  const rawDiff = Math.abs(a - b) % period;
  return round4(Math.min(rawDiff, period - rawDiff));
}

function isLayerActive(layer: ScreentoneLayer): boolean {
  if (layer.density > 0) return true;
  if (layer.gradient.kind === "none") return false;
  return layer.gradient.fromDensity > 0 || layer.gradient.toDensity > 0;
}

/**
 * 기존 겹톤 각도들과의 최소 간섭을 피하면서 30° 로제트 안전 각도(우선 45° · 15° · 75°)를 추천한다.
 */
export function recommendSafeScreentoneAngle(
  kind: ScreentoneToneKind,
  companionLayers: readonly ScreentoneLayer[] = [],
): number {
  if (kind === "sand") return 45;
  const activeCompanions = companionLayers.filter((layer) => layer.kind !== "sand" && isLayerActive(layer));
  if (activeCompanions.length === 0) return 45;

  const candidates = [45, 15, 75, 30, 60, 105, 135, 165];
  let bestAngle = 45;
  let bestMinSep = -1;

  for (const candidate of candidates) {
    let minSep = 90;
    for (const comp of activeCompanions) {
      const sep = computeScreentoneAngleSeparationDeg(candidate, comp.angle, kind, comp.kind);
      if (sep !== null && sep < minSep) {
        minSep = sep;
      }
    }
    if (minSep > bestMinSep) {
      bestMinSep = minSep;
      bestAngle = candidate;
    }
  }
  return bestAngle;
}

/**
 * 120%(1.2×)·150%(1.5×) 등 분수 DPR 환경에서 하프톤 도트 계단 모와레를 막는
 * 물리 디바이스 픽셀 정수 스냅 계획을 계산한다.
 */
export function snapScreentoneToDevicePixels(
  input: ScreentoneDevicePixelSnapInput,
): ScreentoneDevicePixelSnapPlan {
  const safeLines = typeof input.lines === "number" && Number.isFinite(input.lines) && input.lines > 0
    ? input.lines
    : 30;
  const basePx = typeof input.cellBasePx === "number" && Number.isFinite(input.cellBasePx) && input.cellBasePx > 0
    ? input.cellBasePx
    : SCREENTONE_CELL_BASE_REFERENCE_PX;
  const dpr = typeof input.dpr === "number" && Number.isFinite(input.dpr) && input.dpr > 0
    ? input.dpr
    : 1;
  const zoomScale = typeof input.zoomScale === "number" && Number.isFinite(input.zoomScale) && input.zoomScale > 0
    ? input.zoomScale
    : 1;
  const effectiveScale = round4(dpr * zoomScale);
  const isFractionalDpr = Math.abs(effectiveScale - Math.round(effectiveScale)) > 1e-4;

  const rawCssCellPx = Math.max(2, Math.round(basePx / safeLines));
  const rawDeviceCellPx = round4(rawCssCellPx * effectiveScale);
  const snappedDeviceCellPx = Math.max(2, Math.round(rawDeviceCellPx));
  const snappedCssCellPx = round4(snappedDeviceCellPx / effectiveScale);
  const pitchDriftDevicePx = round4(Math.abs(rawDeviceCellPx - snappedDeviceCellPx));

  const rawOriginX = typeof input.originCssPx?.[0] === "number" && Number.isFinite(input.originCssPx[0])
    ? input.originCssPx[0]
    : 0;
  const rawOriginY = typeof input.originCssPx?.[1] === "number" && Number.isFinite(input.originCssPx[1])
    ? input.originCssPx[1]
    : 0;
  const snappedOriginDeviceX = Math.round(rawOriginX * effectiveScale);
  const snappedOriginDeviceY = Math.round(rawOriginY * effectiveScale);
  const snappedOriginCssX = round4(snappedOriginDeviceX / effectiveScale);
  const snappedOriginCssY = round4(snappedOriginDeviceY / effectiveScale);

  return {
    dpr: round4(dpr),
    zoomScale: round4(zoomScale),
    effectiveScale,
    isFractionalDpr,
    rawCssCellPx,
    rawDeviceCellPx,
    snappedDeviceCellPx,
    snappedCssCellPx,
    pitchDriftDevicePx,
    snappedOriginCssPx: [snappedOriginCssX, snappedOriginCssY],
    snappedOriginDevicePx: [snappedOriginDeviceX, snappedOriginDeviceY],
    eliminatesBeatMoire: Math.abs(snappedDeviceCellPx - Math.round(snappedDeviceCellPx)) < 1e-9,
  };
}

/**
 * 흑백/모노톤 출판 원고용 스크린톤 각도·선 수·분수 DPR 모와레 위험을 진단한다.
 */
export function inspectScreentoneMoireRisk(
  target: ScreentoneLayer,
  options?: {
    readonly companionLayers?: readonly ScreentoneLayer[];
    readonly dpr?: number;
    readonly zoomScale?: number;
    readonly snapEnabled?: boolean;
  },
): ScreentoneMoireInspectionReport {
  const companionLayers = options?.companionLayers ?? [];
  const recommendedAngleDeg = recommendSafeScreentoneAngle(target.kind, companionLayers);
  const warnings: ScreentoneMoireWarning[] = [];

  if (!isLayerActive(target) || target.kind === "sand") {
    return {
      hasWarning: false,
      severity: "none",
      warnings,
      minAngleSeparationDeg: null,
      recommendedAngleDeg,
      isPrintSafeMonochrome: true,
    };
  }

  const snapPlan = snapScreentoneToDevicePixels({
    lines: target.lines,
    dpr: options?.dpr ?? 1,
    zoomScale: options?.zoomScale ?? 1,
    kind: target.kind,
  });

  // 1) 나이퀴스트 미달(물리 셀 < 3px) 검사
  if (snapPlan.snappedDeviceCellPx < 3) {
    warnings.push({
      code: "nyquist-undersampling",
      severity: "high",
      messageKo: `망점 셀 크기(${snapPlan.snappedDeviceCellPx}px)가 나이퀴스트 한계(3px) 미만이어서 축소·인쇄 시 모와레가 발생합니다.`,
      recommendedAngleDeg,
    });
  }

  // 2) 분수 DPR(120%·150% 등) 비정수 픽셀 계단 모와레 검사
  if (snapPlan.isFractionalDpr && options?.snapEnabled === false && snapPlan.pitchDriftDevicePx > 0.05) {
    warnings.push({
      code: "fractional-dpr-staircase",
      severity: "high",
      messageKo: `분수 배율(${Math.round(snapPlan.effectiveScale * 100)}%)에서 망점 주기(${snapPlan.rawDeviceCellPx}px)가 비정수여서 계단 모와레가 생깁니다. 디바이스 픽셀 정수 스냅을 켜세요.`,
      recommendedAngleDeg,
    });
  }

  // 3) 픽셀 격자 직교 정렬(0°/90°) 앨리어싱 경고 (도트/격자 전용)
  const period = symmetryPeriodDeg(target.kind);
  if (period === 90) {
    const folded = normalizeAngleDeg(target.angle) % 90;
    const distFromOrtho = Math.min(folded, 90 - folded);
    if (distFromOrtho <= 3 && snapPlan.rawCssCellPx <= 10) {
      warnings.push({
        code: "orthogonal-grid-aliasing",
        severity: "medium",
        messageKo: `도트·격자 각도(${target.angle}°)가 픽셀 격자(0°/90°)와 겹쳐 계단 간섭이 돋보일 수 있습니다. 45°를 권장합니다.`,
        recommendedAngleDeg,
      });
    }
  }

  // 4) 다중 겹톤 각도 충돌 및 유사 LPI 비트 주파수 검사
  let minAngleSeparationDeg: number | null = null;
  for (const companion of companionLayers) {
    if (!isLayerActive(companion) || companion.kind === "sand") continue;
    const sep = computeScreentoneAngleSeparationDeg(target.angle, companion.angle, target.kind, companion.kind);
    if (sep === null) continue;
    if (minAngleSeparationDeg === null || sep < minAngleSeparationDeg) {
      minAngleSeparationDeg = sep;
    }

    const maxLines = Math.max(target.lines, companion.lines, 1);
    const freqRatioDiff = Math.abs(target.lines - companion.lines) / maxLines;

    if (sep < SCREENTONE_MOIRE_HIGH_RISK_DELTA_DEG) {
      warnings.push({
        code: "stacked-angle-collision",
        severity: "high",
        messageKo: `겹톤 각도 차가 ${sep.toFixed(1)}°(위험 기준 ${SCREENTONE_MOIRE_HIGH_RISK_DELTA_DEG}° 미만)로 강한 모와레 무늬가 발생합니다. ${recommendedAngleDeg}°로 30° 이상 분리하세요.`,
        measuredAngleDeltaDeg: sep,
        recommendedAngleDeg,
      });
    } else if (sep < SCREENTONE_MOIRE_MEDIUM_RISK_DELTA_DEG) {
      warnings.push({
        code: "stacked-angle-collision",
        severity: "medium",
        messageKo: `겹톤 각도 차가 ${sep.toFixed(1)}°로 30° 로제트 안전 각도보다 좁습니다. ${recommendedAngleDeg}° 조정을 권장합니다.`,
        measuredAngleDeltaDeg: sep,
        recommendedAngleDeg,
      });
    } else if (freqRatioDiff > 0 && freqRatioDiff <= 0.12 && sep < SCREENTONE_ROSETTE_IDEAL_DELTA_DEG) {
      warnings.push({
        code: "frequency-harmonic-beat",
        severity: "medium",
        messageKo: `유사 선 수(${target.lines}선 vs ${companion.lines}선) 간섭으로 저주파 비트 모와레가 생길 수 있습니다. 각도를 ${recommendedAngleDeg}°로 조정하거나 선 수 차이를 넓히세요.`,
        measuredAngleDeltaDeg: sep,
        recommendedAngleDeg,
      });
    }
  }

  const severity: ScreentoneMoireSeverity = warnings.some((w) => w.severity === "high")
    ? "high"
    : warnings.length > 0
      ? "medium"
      : "none";

  return {
    hasWarning: warnings.length > 0,
    severity,
    warnings,
    minAngleSeparationDeg,
    recommendedAngleDeg,
    isPrintSafeMonochrome: severity !== "high",
  };
}

/**
 * 전체 스크린톤 레이어 스택의 쌍별 모와레 위험을 일괄 점검한다.
 */
export function inspectScreentoneStackMoire(
  layers: readonly ScreentoneLayer[],
  options?: { readonly dpr?: number; readonly zoomScale?: number; readonly snapEnabled?: boolean },
): ScreentoneMoireInspectionReport {
  const warnings: ScreentoneMoireWarning[] = [];
  let minAngleSeparationDeg: number | null = null;
  let recommendedAngleDeg = 45;

  for (let i = 0; i < layers.length; i += 1) {
    const current = layers[i]!;
    const peers = layers.slice(0, i);
    const report = inspectScreentoneMoireRisk(current, {
      companionLayers: peers,
      dpr: options?.dpr,
      zoomScale: options?.zoomScale,
      snapEnabled: options?.snapEnabled,
    });
    if (report.minAngleSeparationDeg !== null) {
      minAngleSeparationDeg = minAngleSeparationDeg === null
        ? report.minAngleSeparationDeg
        : Math.min(minAngleSeparationDeg, report.minAngleSeparationDeg);
    }
    if (report.hasWarning) {
      warnings.push(...report.warnings);
      recommendedAngleDeg = report.recommendedAngleDeg;
    }
  }

  const severity: ScreentoneMoireSeverity = warnings.some((w) => w.severity === "high")
    ? "high"
    : warnings.length > 0
      ? "medium"
      : "none";

  return {
    hasWarning: warnings.length > 0,
    severity,
    warnings,
    minAngleSeparationDeg,
    recommendedAngleDeg,
    isPrintSafeMonochrome: severity !== "high",
  };
}

/**
 * 렌더된 스크린톤 RGBA 버퍼에서 연속된 망점 셀 간 잉크 커버리지(면적) 편차를 측정한다.
 * 분수 DPR 계단 모와레 발생 시 인접 셀의 알파 합이 주기적으로 흔들려 편차가 크게 나타난다.
 */
export function measureHalftoneCellCoverageSpread(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  cellSizePx: number,
): { readonly cellCount: number; readonly meanCoverage: number; readonly maxSpread: number; readonly stdDev: number } {
  const step = Math.max(2, Math.round(cellSizePx));
  const cols = Math.floor(width / step);
  const rows = Math.floor(height / step);
  if (cols < 2 || rows < 2) {
    return { cellCount: 0, meanCoverage: 0, maxSpread: 0, stdDev: 0 };
  }

  const coverages: number[] = [];
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      let alphaSum = 0;
      for (let dy = 0; dy < step; dy += 1) {
        const y = cy * step + dy;
        for (let dx = 0; dx < step; dx += 1) {
          const x = cx * step + dx;
          alphaSum += (rgba[(y * width + x) * 4 + 3] ?? 0) / 255;
        }
      }
      coverages.push(alphaSum / (step * step));
    }
  }

  const mean = coverages.reduce((acc, v) => acc + v, 0) / coverages.length;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  let variance = 0;
  for (const v of coverages) {
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    const diff = v - mean;
    variance += diff * diff;
  }

  return {
    cellCount: coverages.length,
    meanCoverage: round4(mean),
    maxSpread: round4(maxV - minV),
    stdDev: round4(Math.sqrt(variance / coverages.length)),
  };
}
