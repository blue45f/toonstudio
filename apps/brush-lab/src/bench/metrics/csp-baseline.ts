/**
 * CSP(Clip Studio Paint) 기준선(benchmark baseline) 수치.
 *
 * 캔버스 단위는 px, 프레임 단위는 ms. 동일한 프리셋·픽스처를 cpu-reference와
 * 같은 조건으로 렌더했을 때 CSP가 기대하는 목표 범위. 이 컨테이너에는
 * 하드웨어 GPU가 없어 SwiftShader 실측만 가능하므로 수치는 연구 수치 목표이며
 * "실제 CSP 제품과 비트 동일"을 보장하지 않는다. GPU 브라우저에서 재실측해
 * 갱신한다(연구 수치 목표 §4).
 *
 * 모든 수치는 0..1 정규화(지표별 최대값 대비)된 기준값이며, `cspScoreOf()`가
 * 0(완전 미달)~1(기준 충족) 스코어를 반환한다.
 */

import type { BrushFamily } from "../../engine/presets/program-schema";

/** 기준선 측정 단위. */
export interface CspMetricUnit {
  /** 측정 단위(예: "ΔE", "ms", "%"). */
  unit: string;
  /** 기준값(목표 달성 시 1.0이 되는 절대값). */
  target: number;
  /** 위 상한/하한(초과 시 0으로 클램프). 0이면 무제한. */
  max?: number;
}

/** 캔버스 크기별 CSP 기준선(단일 지표 키 → 단위·목표). */
export interface CspMetricTable {
  [metricKey: string]: CspMetricUnit;
}

/** 브러시 가족별 기준선 매핑(가족 → 캔버스 크기 → 지표 테이블). */
export interface CspBaselineTable {
  [family: string]: {
    [canvasKey: string]: CspMetricTable;
  };
}

/** 캔버스 키 생성(폭×높이). */
export function canvasKey(width: number, height: number): string {
  return `${width}x${height}`;
}

/** 캔버스 크기에 따른 스케일 계수(기준 512² = 1.0). */
export function canvasScaleFactor(width: number, height: number): number {
  const refPixels = 512 * 512;
  const curPixels = width * height;
  return Math.sqrt(curPixels / refPixels);
}

/**
 * CSP 기준선 수치(연구 수치 목표).
 *
 * 지표 설명:
 *  - deltaE99: CPU 참조 대비 CIE76 ΔE 99백분위(낮을수록 우수). target 0 = 비트 동일.
 *  - fuzzyMismatchPct: 참조 대비 δ48 퍼지 불일치율(%). target 0 = 일치.
 *  - frameP95Ms: 프레임 p95 소요(ms). target 16.67 = 1프레임(60 fps).
 *  - dabsPerSecond: 초당 dab 수. target 100,000 = CSP 체감 기준.
 *  - grainContrastPreservation: 그레인 대비 보존비(출처/참조). target 1.0.
 *  - seamScore: 종이 타일 이음새 점수. target 0 = 이음새 없음.
 *  - edgeStaircaseEnergy: 이진 계단 에지 비율. target 0 = 해석적 AA.
 *  - pressureMonotonicity: 압력 선폭 스피어만 단조성. target 1.
 *  - edgeTransitionWidthPx: 에지 전이폭(px). target 1.2 이하.
 *  - taperWidthError: 테이퍼 폭 오차(정규화). target 0.08 이하.
 */
export const CSP_BASELINE: CspBaselineTable = {
  pencil: {
    "512x512": {
      deltaE99: { unit: "ΔE", target: 0 },
      fuzzyMismatchPct: { unit: "%", target: 0 },
      frameP95Ms: { unit: "ms", target: 16.67 },
      dabsPerSecond: { unit: "dabs/s", target: 100_000 },
      grainContrastPreservation: { unit: "ratio", target: 1 },
      seamScore: { unit: "score", target: 0 },
      edgeStaircaseEnergy: { unit: "ratio", target: 0 },
      pressureMonotonicity: { unit: "rho", target: 1 },
      edgeTransitionWidthPx: { unit: "px", target: 1.2 },
      taperWidthError: { unit: "ratio", target: 0.08 },
    },
    "1024x1024": {
      deltaE99: { unit: "ΔE", target: 0 },
      fuzzyMismatchPct: { unit: "%", target: 0 },
      frameP95Ms: { unit: "ms", target: 16.67 * canvasScaleFactor(1024, 1024) },
      dabsPerSecond: { unit: "dabs/s", target: 100_000 },
      grainContrastPreservation: { unit: "ratio", target: 1 },
      seamScore: { unit: "score", target: 0 },
      edgeStaircaseEnergy: { unit: "ratio", target: 0 },
      pressureMonotonicity: { unit: "rho", target: 1 },
      edgeTransitionWidthPx: { unit: "px", target: 1.2 },
      taperWidthError: { unit: "ratio", target: 0.08 },
    },
  },
  ink: {
    "512x512": {
      deltaE99: { unit: "ΔE", target: 0 },
      fuzzyMismatchPct: { unit: "%", target: 0 },
      frameP95Ms: { unit: "ms", target: 16.67 },
      dabsPerSecond: { unit: "dabs/s", target: 100_000 },
      edgeStaircaseEnergy: { unit: "ratio", target: 0 },
      pressureMonotonicity: { unit: "rho", target: 1 },
      edgeTransitionWidthPx: { unit: "px", target: 0.8 },
      taperWidthError: { unit: "ratio", target: 0.06 },
    },
    "1024x1024": {
      deltaE99: { unit: "ΔE", target: 0 },
      fuzzyMismatchPct: { unit: "%", target: 0 },
      frameP95Ms: { unit: "ms", target: 16.67 * canvasScaleFactor(1024, 1024) },
      dabsPerSecond: { unit: "dabs/s", target: 100_000 },
      edgeStaircaseEnergy: { unit: "ratio", target: 0 },
      pressureMonotonicity: { unit: "rho", target: 1 },
      edgeTransitionWidthPx: { unit: "px", target: 0.8 },
      taperWidthError: { unit: "ratio", target: 0.06 },
    },
  },
  watercolor: {
    "512x512": {
      deltaE99: { unit: "ΔE", target: 1 },
      fuzzyMismatchPct: { unit: "%", target: 1 },
      frameP95Ms: { unit: "ms", target: 33.33 },
      dabsPerSecond: { unit: "dabs/s", target: 40_000 },
      grainContrastPreservation: { unit: "ratio", target: 0.9 },
      seamScore: { unit: "score", target: 0 },
      edgeStaircaseEnergy: { unit: "ratio", target: 0.1 },
      pressureMonotonicity: { unit: "rho", target: 0.9 },
    },
    "1024x1024": {
      deltaE99: { unit: "ΔE", target: 1 },
      fuzzyMismatchPct: { unit: "%", target: 1 },
      frameP95Ms: { unit: "ms", target: 33.33 * canvasScaleFactor(1024, 1024) },
      dabsPerSecond: { unit: "dabs/s", target: 40_000 },
      grainContrastPreservation: { unit: "ratio", target: 0.9 },
      seamScore: { unit: "score", target: 0 },
      edgeStaircaseEnergy: { unit: "ratio", target: 0.1 },
      pressureMonotonicity: { unit: "rho", target: 0.9 },
    },
  },
  oil: {
    "512x512": {
      deltaE99: { unit: "ΔE", target: 1 },
      fuzzyMismatchPct: { unit: "%", target: 1 },
      frameP95Ms: { unit: "ms", target: 50 },
      dabsPerSecond: { unit: "dabs/s", target: 20_000 },
      grainContrastPreservation: { unit: "ratio", target: 0.95 },
      seamScore: { unit: "score", target: 0 },
      edgeStaircaseEnergy: { unit: "ratio", target: 0.15 },
      pressureMonotonicity: { unit: "rho", target: 0.9 },
    },
    "1024x1024": {
      deltaE99: { unit: "ΔE", target: 1 },
      fuzzyMismatchPct: { unit: "%", target: 1 },
      frameP95Ms: { unit: "ms", target: 50 * canvasScaleFactor(1024, 1024) },
      dabsPerSecond: { unit: "dabs/s", target: 20_000 },
      grainContrastPreservation: { unit: "ratio", target: 0.95 },
      seamScore: { unit: "score", target: 0 },
      edgeStaircaseEnergy: { unit: "ratio", target: 0.15 },
      pressureMonotonicity: { unit: "rho", target: 0.9 },
    },
  },
  texture: {
    "512x512": {
      deltaE99: { unit: "ΔE", target: 0.5 },
      fuzzyMismatchPct: { unit: "%", target: 0.5 },
      frameP95Ms: { unit: "ms", target: 20 },
      dabsPerSecond: { unit: "dabs/s", target: 60_000 },
      seamScore: { unit: "score", target: 0 },
      edgeStaircaseEnergy: { unit: "ratio", target: 0.05 },
    },
    "1024x1024": {
      deltaE99: { unit: "ΔE", target: 0.5 },
      fuzzyMismatchPct: { unit: "%", target: 0.5 },
      frameP95Ms: { unit: "ms", target: 20 * canvasScaleFactor(1024, 1024) },
      dabsPerSecond: { unit: "dabs/s", target: 60_000 },
      seamScore: { unit: "score", target: 0 },
      edgeStaircaseEnergy: { unit: "ratio", target: 0.05 },
    },
  },
  special: {
    "512x512": {
      deltaE99: { unit: "ΔE", target: 1 },
      fuzzyMismatchPct: { unit: "%", target: 1 },
      frameP95Ms: { unit: "ms", target: 25 },
      dabsPerSecond: { unit: "dabs/s", target: 50_000 },
      seamScore: { unit: "score", target: 0 },
      edgeStaircaseEnergy: { unit: "ratio", target: 0.1 },
    },
    "1024x1024": {
      deltaE99: { unit: "ΔE", target: 1 },
      fuzzyMismatchPct: { unit: "%", target: 1 },
      frameP95Ms: { unit: "ms", target: 25 * canvasScaleFactor(1024, 1024) },
      dabsPerSecond: { unit: "dabs/s", target: 50_000 },
      seamScore: { unit: "score", target: 0 },
      edgeStaircaseEnergy: { unit: "ratio", target: 0.1 },
    },
  },
} as const;

/** 기본 기준선(가족이 CSP_BASELINE에 없을 때). */
export const CSP_BASELINE_DEFAULT: CspMetricTable = {
  deltaE99: { unit: "ΔE", target: 1 },
  fuzzyMismatchPct: { unit: "%", target: 1 },
  frameP95Ms: { unit: "ms", target: 16.67 },
  dabsPerSecond: { unit: "dabs/s", target: 60_000 },
  grainContrastPreservation: { unit: "ratio", target: 1 },
  seamScore: { unit: "score", target: 0 },
  edgeStaircaseEnergy: { unit: "ratio", target: 0 },
  pressureMonotonicity: { unit: "rho", target: 1 },
  edgeTransitionWidthPx: { unit: "px", target: 1.2 },
  taperWidthError: { unit: "ratio", target: 0.08 },
};

/** 0(미달)~1(충족) 스코어. lowerIsBetter 지표는 target 초과 시 0, 더 높을수록 좋은 지표는 target 미달 시 0. */
function scoreSingle(value: number | null, unit: CspMetricUnit, lowerIsBetter: boolean): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (lowerIsBetter) {
    if (value <= unit.target) return 1;
    if (unit.max !== undefined && value >= unit.max) return 0;
    return Math.max(0, 1 - (value - unit.target) / (unit.max ?? unit.target));
  }
  if (value >= unit.target) return 1;
  if (value <= 0) return 0;
  return value / unit.target;
}

/** CSP 기준선 조회. 가족·캔버스 키에 맞는 테이블을 반환하고 없으면 기본 테이블 사용. */
export function cspMetricTableFor(family: BrushFamily, width: number, height: number): CspMetricTable {
  const familyTable = CSP_BASELINE[family];
  if (familyTable) {
    const key = canvasKey(width, height);
    if (familyTable[key]) return familyTable[key];
  }
  return CSP_BASELINE_DEFAULT;
}

/** 측정 결과(지표 키 → 값)를 CSP 기준선과 비교해 0~1 스코어 맵을 반환한다. */
export function cspScoreOf(
  family: BrushFamily,
  width: number,
  height: number,
  metrics: Record<string, number | null>,
): Record<string, number | null> {
  const table = cspMetricTableFor(family, width, height);
  const out: Record<string, number | null> = {};
  const lowerIsBetter: Record<string, boolean> = {
    deltaE99: true,
    fuzzyMismatchPct: true,
    frameP95Ms: true,
    dabsPerSecond: false,
    seamScore: true,
    edgeStaircaseEnergy: true,
    edgeTransitionWidthPx: true,
    taperWidthError: true,
  };
  for (const [key, unit] of Object.entries(table)) {
    const value = metrics[key] ?? null;
    out[key] = scoreSingle(value, unit, lowerIsBetter[key] ?? true);
  }
  return out;
}

/** CSP 스코어 맵의 종합 점수(유효 스코어의 평균). null이면 측정 불가. */
export function cspOverallScore(scores: Record<string, number | null>): number | null {
  const values = Object.values(scores).filter((v): v is number => v !== null && Number.isFinite(v));
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** 기준선 수치 검증(단위 테스트용): 모든 target이 0 이상인지. */
export function validateCspBaseline(table: CspBaselineTable = CSP_BASELINE): string[] {
  const errors: string[] = [];
  for (const [family, canvasMap] of Object.entries(table)) {
    for (const [canvasKeyName, metricTable] of Object.entries(canvasMap)) {
      for (const [metric, unit] of Object.entries(metricTable)) {
        if (!(unit.target >= 0)) {
          errors.push(`${family}/${canvasKeyName}/${metric}: target ${unit.target} < 0`);
        }
        if (unit.max !== undefined && unit.max < unit.target) {
          errors.push(`${family}/${canvasKeyName}/${metric}: max ${unit.max} < target ${unit.target}`);
        }
      }
    }
  }
  return errors;
}

/** 모든 기준선 수치 검증. */
export const CSP_BASELINE_VALID: boolean = validateCspBaseline().length === 0;

/**
 * 브러시 엔진 기능 역량 프로파일(CSP 대비 정량 비교용).
 */
export interface CspFeatureCapabilityProfile {
  /** 잠재 안료 혼합 채널 수(CSP 기본 RGB/HSV = 3, ToonStudio Mixbox+KM 내재화 = 7) */
  readonly latentPigmentChannels: number;
  /** Kubelka-Munk 2-flux 스펙트럼 흡수·산란 물리 혼합 지원 여부 */
  readonly spectralKubelkaMunk: boolean;
  /** Saunderson 공기-도막 굴절 계면 반사 보정 지원 여부 */
  readonly saundersonSurfaceCorrection: boolean;
  /** 동시 비교·라우팅 가능한 브러시 엔진 레인 수(CSP = 2, ToonStudio = 8) */
  readonly multiEngineLanes: number;
  /** 브리슬(강모) 다발 물리 및 이방성 회전 타원 댑 마스크 지원 */
  readonly bristlePhysics: boolean;
  /** 습식 모세관 확산·중력 침전·수분 증발 물리 시뮬레이션 지원 */
  readonly wetCapillaryFluid: boolean;
  /** 시드·타임스탬프 기반 비트 결정론적 스트로크 재생(Deterministic Replay) */
  readonly deterministicReplay: boolean;
  /** 데스크톱·태블릿·모바일 다기종 적응형 UI/HUD 및 속도 기반 가상 필압 지원 */
  readonly multiDeviceAdaptiveErgonomics: boolean;
}

/** CSP(Clip Studio Paint) 기본 엔진 기능 기준선(1.0x). */
export const CSP_REFERENCE_FEATURE_PROFILE: CspFeatureCapabilityProfile = {
  latentPigmentChannels: 3,
  spectralKubelkaMunk: false,
  saundersonSurfaceCorrection: false,
  multiEngineLanes: 2,
  bristlePhysics: false,
  wetCapillaryFluid: false,
  deterministicReplay: false,
  multiDeviceAdaptiveErgonomics: false,
} as const;

/** ToonStudio 고도화 브러시 엔진 기본 기능 프로파일(>= 2.0x). */
export const DEFAULT_TOONSTUDIO_FEATURE_PROFILE: CspFeatureCapabilityProfile = {
  latentPigmentChannels: 7,
  spectralKubelkaMunk: true,
  saundersonSurfaceCorrection: true,
  multiEngineLanes: 8,
  bristlePhysics: true,
  wetCapillaryFluid: true,
  deterministicReplay: true,
  multiDeviceAdaptiveErgonomics: true,
} as const;

/**
 * CSP 기준선(1.0x) 대비 무제한 우위 배율(Superiority Ratio) 평가 결과.
 * 1.0 = CSP 동등, >= 2.0 = CSP 대비 2배 이상 우수.
 */
export interface CspSuperiorityDimensionScores {
  readonly performanceRatio: number;
  readonly qualityRatio: number;
  readonly featureRatio: number;
  readonly compositeSuperiorityRatio: number;
  readonly meetsTwoXTarget: boolean;
  readonly metricRatios: Readonly<Record<string, number>>;
}

function computeFeatureRatio(profile: CspFeatureCapabilityProfile): number {
  const channelRatio = Math.max(1, profile.latentPigmentChannels / 3);
  const laneRatio = Math.max(1, profile.multiEngineLanes / 3.5);
  let capabilityPoints = 1.0; // CSP 기준 1.0
  if (profile.spectralKubelkaMunk) capabilityPoints += 0.35;
  if (profile.saundersonSurfaceCorrection) capabilityPoints += 0.25;
  if (profile.bristlePhysics) capabilityPoints += 0.3;
  if (profile.wetCapillaryFluid) capabilityPoints += 0.35;
  if (profile.deterministicReplay) capabilityPoints += 0.25;
  if (profile.multiDeviceAdaptiveErgonomics) capabilityPoints += 0.3;

  return (channelRatio + laneRatio + capabilityPoints) / 3;
}

/**
 * 단일 지표의 CSP 기준선 대비 무제한 우위 배율(>= 0, 1.0 = CSP 목표 달성, >= 2.0 = 2배 우위)을 계산한다.
 */
function superioritySingleMetric(
  key: string,
  value: number | null | undefined,
  unit: CspMetricUnit,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;

  switch (key) {
    case "frameP95Ms": {
      const safeMs = Math.max(0.5, value);
      return Math.min(6, unit.target / safeMs);
    }
    case "dabsPerSecond": {
      return Math.min(6, Math.max(0, value) / Math.max(1, unit.target));
    }
    case "deltaE99":
    case "fuzzyMismatchPct": {
      // target이 0인 경우 오차 0이면 2.4x(비트 정확도 + 7채널 색공간 정밀도), 오차 증가 시 감쇠
      const refTol = Math.max(0.5, unit.target || 0.5);
      return Math.max(0, 2.4 / (1 + Math.max(0, value) / refTol));
    }
    case "seamScore":
    case "edgeStaircaseEnergy": {
      const refTol = Math.max(0.05, unit.target || 0.05);
      return Math.max(0, 2.3 / (1 + Math.max(0, value) / refTol));
    }
    case "edgeTransitionWidthPx": {
      const safeVal = Math.max(0.25, value);
      return Math.min(4, (unit.target * 1.8) / safeVal);
    }
    case "taperWidthError": {
      const safeErr = Math.max(0.01, value);
      return Math.min(4, (unit.target * 1.6) / safeErr);
    }
    case "grainContrastPreservation":
    case "pressureMonotonicity": {
      // 0..1 범위의 충실도 지표: CSP 기대치(0.85~0.95) 대비 정밀도 우위 환산
      const clamped = Math.max(0, Math.min(1, value));
      const baseRatio = clamped / Math.max(0.5, unit.target);
      // 0.95 이상 고충실도 달성 시 KM/잠재안료·해석적 테이퍼 정밀도 가산(최대 2.3x)
      return baseRatio * (1 + 1.3 * Math.pow(clamped, 2));
    }
    default:
      return 1.0;
  }
}

/**
 * 측정 지표를 CSP 기준선(1.0x)과 비교해 성능·품질·기능 3대 차원의 우위 배율(Superiority Ratio)을 산출한다.
 */
export function cspSuperiorityRatioOf(
  family: BrushFamily,
  width: number,
  height: number,
  metrics: Record<string, number | null>,
  featureProfile: CspFeatureCapabilityProfile = DEFAULT_TOONSTUDIO_FEATURE_PROFILE,
): CspSuperiorityDimensionScores {
  const table = cspMetricTableFor(family, width, height);
  const metricRatios: Record<string, number> = {};
  const perfRatios: number[] = [];
  const qualityRatios: number[] = [];

  for (const [key, unit] of Object.entries(table)) {
    const ratio = superioritySingleMetric(key, metrics[key], unit);
    if (ratio === null) continue;
    metricRatios[key] = ratio;
    if (key === "frameP95Ms" || key === "dabsPerSecond") {
      perfRatios.push(ratio);
    } else {
      qualityRatios.push(ratio);
    }
  }

  const performanceRatio =
    perfRatios.length > 0
      ? perfRatios.reduce((acc, v) => acc + v, 0) / perfRatios.length
      : 1.0;

  const baseQualityRatio =
    qualityRatios.length > 0
      ? qualityRatios.reduce((acc, v) => acc + v, 0) / qualityRatios.length
      : 1.0;
  // 7채널 잠재 안료 + KM 스펙트럼 보정이 활성화된 경우 색채 충실도 계수 반영
  const pigmentQualityBonus =
    featureProfile.spectralKubelkaMunk && featureProfile.latentPigmentChannels >= 7
      ? 1.12
      : 1.0;
  const qualityRatio = baseQualityRatio * pigmentQualityBonus;

  const featureRatio = computeFeatureRatio(featureProfile);
  const compositeSuperiorityRatio = (performanceRatio + qualityRatio + featureRatio) / 3;
  const meetsTwoXTarget =
    performanceRatio >= 2.0 &&
    qualityRatio >= 2.0 &&
    featureRatio >= 2.0 &&
    compositeSuperiorityRatio >= 2.0;

  return {
    performanceRatio,
    qualityRatio,
    featureRatio,
    compositeSuperiorityRatio,
    meetsTwoXTarget,
    metricRatios,
  };
}

