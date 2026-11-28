/**
 * Wave 101 — 실시간 스크린톤·망점·크로스해칭 2D 푸리에/나이퀴스트 모아레 주파수 분석기.
 *
 * - 600dpi 인쇄 원고 스크린톤이 360px 모바일 / 800px 웹툰 스트립 / 1440px 데스크톱으로 축소될 때
 *   발생하는 공간 주파수(cycles/px), 2D 격자 파수 벡터(kx, ky), 나이퀴스트 폴딩 맥놀이 주파수를 해석한다.
 * - 2레이어 톤 겹침 시 로제트 vs 15° 미만 각도 충돌 모아레를 판별하고 최적 분리 각도(>= 30°)를 제안한다.
 * - 용지 도트 게인(포물선 TVI 모델) 물리 번짐과 역보정 농도를 제공한다.
 */

export type ScreentonePatternKind =
  | "circle-dot"
  | "diamond-dot"
  | "line-hatch"
  | "cross-hatch"
  | "blue-noise-stipple"
  | "radial-speed-tone";

export type MoireRiskLevel = "safe" | "caution" | "severe-moire";

export type StackedTonePatternClass =
  | "stochastic-safe"
  | "classic-rosette"
  | "coarse-rosette"
  | "angle-clash-moire";

export type RecommendedExportProfile =
  | "print-1bit-halftone"
  | "hybrid-band-limited-grayscale"
  | "anti-moire-blue-noise-web";

export interface ScreentonePatternSpec {
  readonly kind: ScreentonePatternKind;
  readonly lpi: number;
  readonly sourceDpi: number;
  readonly angleDeg: number;
  readonly density: number;
  readonly dotGainPercent: number;
  readonly seed?: number;
  readonly radialCenterX?: number;
  readonly radialCenterY?: number;
}

export interface NormalizedScreentoneSpec {
  readonly kind: ScreentonePatternKind;
  readonly lpi: number;
  readonly sourceDpi: number;
  readonly angleDeg: number;
  readonly density: number;
  readonly dotGainPercent: number;
  readonly effectiveDensity: number;
  readonly seed: number;
  readonly radialCenterX: number;
  readonly radialCenterY: number;
}

export interface Wavevector2D {
  readonly kx: number;
  readonly ky: number;
}

export interface ViewportScaleSpec {
  readonly id?: string;
  readonly labelKo?: string;
  readonly sourceWidthPx: number;
  readonly targetWidthPx: number;
  readonly targetDpi?: number;
}

export interface ScreentoneMoireRiskAnalysis {
  readonly viewportId: string;
  readonly viewportLabelKo: string;
  readonly normalizedSpec: NormalizedScreentoneSpec;
  readonly sourceWidthPx: number;
  readonly targetWidthPx: number;
  readonly downscaleFactor: number;
  readonly cyclesPerPixel: number;
  readonly nyquistRatio: number;
  readonly wavevectorPrimary: Wavevector2D;
  readonly wavevectorSecondary: Wavevector2D | null;
  readonly fundamentalBeatDistance: number;
  readonly axisBeatAlias: Wavevector2D;
  readonly dominantBeatAliasCycPerPx: number;
  readonly bandLimitAlpha: number;
  readonly moireRiskScore: number;
  readonly riskLevel: MoireRiskLevel;
}

export interface StackedToneAngleMoireAnalysis {
  readonly layerA: NormalizedScreentoneSpec;
  readonly layerB: NormalizedScreentoneSpec;
  readonly effectiveAngleSeparationDeg: number;
  readonly rawAngleDiffDeg: number;
  readonly beatFrequencyLpi: number;
  readonly beatPeriodMm: number;
  readonly patternClassification: StackedTonePatternClass;
  readonly moireRiskScore: number;
  readonly riskLevel: MoireRiskLevel;
  readonly recommendedLayerBAngleDeg: number;
  readonly alternateLayerBAngleDeg: number;
}

export interface MultiViewportToneSafetyAudit {
  readonly spec: NormalizedScreentoneSpec;
  readonly sourceCanvasWidthPx: number;
  readonly viewports: readonly ScreentoneMoireRiskAnalysis[];
  readonly stackedAngleAnalysis: StackedToneAngleMoireAnalysis | null;
  readonly worstRiskLevel: MoireRiskLevel;
  readonly worstMoireRiskScore: number;
  readonly safeViewportCount: number;
  readonly cautionViewportCount: number;
  readonly severeViewportCount: number;
  readonly recommendedPrintProfile: RecommendedExportProfile;
  readonly recommendedWebProfile: RecommendedExportProfile;
}

export interface MultiViewportAuditOptions {
  readonly sourceCanvasWidthPx?: number;
  readonly overlaySpec?: ScreentonePatternSpec;
  readonly customViewports?: readonly ViewportScaleSpec[];
}

export const NYQUIST_LIMIT_CYC_PER_PX = 0.5;
export const BAND_LIMIT_START_CYC_PER_PX = 0.25;
export const BAND_LIMIT_END_CYC_PER_PX = 0.5;
export const B5_PRINT_WIDTH_MM = 182;

const DEG_TO_RAD = Math.PI / 180;
const MM_PER_INCH = 25.4;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(edge0) || !Number.isFinite(edge1)) return 0;
  if (Math.abs(edge1 - edge0) < 1e-12) return x >= edge1 ? 1 : 0;
  const t = clampNumber((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function normalizeAngle180(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) return 0;
  const mod = ((angleDeg % 180) + 180) % 180;
  return mod >= 180 ? 0 : mod;
}

/**
 * 용지 잉크 번짐(포물선 TVI 도트 게인)을 적용한 실질 인쇄 잉크 농도를 계산한다.
 */
export function applyPaperDotGain(nominalDensity: number, dotGainPercent: number): number {
  const d = clampNumber(nominalDensity, 0, 1);
  const g = clampNumber(dotGainPercent, 0, 25) / 100;
  return clampNumber(d + 4 * g * d * (1 - d), 0, 1);
}

/**
 * 목표 최종 인쇄 농도를 얻기 위해 도트 게인을 역보정한 원고 농도를 계산한다.
 */
export function computeDotGainCompensatedDensity(
  targetEffectiveDensity: number,
  dotGainPercent: number,
): number {
  const y = clampNumber(targetEffectiveDensity, 0, 1);
  const g = clampNumber(dotGainPercent, 0, 25) / 100;
  if (g <= 1e-9 || y <= 0 || y >= 1) return y;
  const linearTerm = 1 + 4 * g;
  const discriminant = Math.max(0, linearTerm * linearTerm - 16 * g * y);
  return clampNumber((linearTerm - Math.sqrt(discriminant)) / (8 * g), 0, 1);
}

export function normalizeScreentoneSpec(spec: ScreentonePatternSpec): NormalizedScreentoneSpec {
  const lpi = clampNumber(spec.lpi, 1, 600);
  const sourceDpi = clampNumber(spec.sourceDpi, 36, 2400);
  const angleDeg = normalizeAngle180(spec.angleDeg);
  const density = clampNumber(spec.density, 0, 1);
  const dotGainPercent = clampNumber(spec.dotGainPercent, 0, 25);
  return {
    kind: spec.kind,
    lpi,
    sourceDpi,
    angleDeg,
    density,
    dotGainPercent,
    effectiveDensity: applyPaperDotGain(density, dotGainPercent),
    seed: Number.isFinite(spec.seed) ? Math.trunc(spec.seed as number) : 101,
    radialCenterX: clampNumber(spec.radialCenterX ?? 0.5, 0.05, 0.95),
    radialCenterY: clampNumber(spec.radialCenterY ?? 0.5, 0.05, 0.95),
  };
}

/**
 * 스칼라 공간 주파수 k의 정수 샘플링 격자까지의 최소 거리 min(|k - n|)을 계산한다.
 */
export function computeNearestIntegerBeatDistance(frequencyCycPerPx: number): number {
  if (!Number.isFinite(frequencyCycPerPx)) return 0;
  return Math.abs(frequencyCycPerPx - Math.round(frequencyCycPerPx));
}

function hasOrthogonalLattice(kind: ScreentonePatternKind): boolean {
  return kind === "circle-dot" || kind === "diamond-dot" || kind === "cross-hatch";
}

function computeDominantSuperNyquistBeatAlias(
  kind: ScreentonePatternKind,
  k1: Wavevector2D,
  k2: Wavevector2D | null,
  cyclesPerPixel: number,
): number {
  if (kind === "blue-noise-stipple") {
    return cyclesPerPixel > NYQUIST_LIMIT_CYC_PER_PX
      ? computeNearestIntegerBeatDistance(cyclesPerPixel)
      : 0;
  }
  const harmonics: readonly (readonly [number, number])[] =
    k2 !== null
      ? [
          [1, 0],
          [0, 1],
          [1, 1],
          [1, -1],
          [2, 0],
          [0, 2],
        ]
      : [
          [1, 0],
          [2, 0],
        ];
  let lowestVisibleBeat = Number.POSITIVE_INFINITY;
  for (const [m, l] of harmonics) {
    const hx = m * k1.kx + (k2 !== null ? l * k2.kx : 0);
    const hy = m * k1.ky + (k2 !== null ? l * k2.ky : 0);
    if (
      Math.hypot(hx, hy) > NYQUIST_LIMIT_CYC_PER_PX ||
      Math.max(Math.abs(hx), Math.abs(hy)) > NYQUIST_LIMIT_CYC_PER_PX
    ) {
      const folded = Math.hypot(hx - Math.round(hx), hy - Math.round(hy));
      if (folded < lowestVisibleBeat) lowestVisibleBeat = folded;
    }
  }
  return Number.isFinite(lowestVisibleBeat) ? lowestVisibleBeat : 0;
}

function classifyMoireRiskLevel(score: number): MoireRiskLevel {
  return score >= 65 ? "severe-moire" : score >= 32 ? "caution" : "safe";
}

function riskLevelRank(level: MoireRiskLevel): number {
  return level === "severe-moire" ? 2 : level === "caution" ? 1 : 0;
}

/**
 * 단일 뷰포트 축소 배율에서 스크린톤의 2D 푸리에/나이퀴스트 모아레 위험을 해석적으로 분석한다.
 */
export function analyzeScreentoneMoireRisk(
  spec: ScreentonePatternSpec,
  viewport: ViewportScaleSpec,
): ScreentoneMoireRiskAnalysis {
  const normalizedSpec = normalizeScreentoneSpec(spec);
  const sourceWidthPx = Math.max(1, Number.isFinite(viewport.sourceWidthPx) ? viewport.sourceWidthPx : 1);
  const targetWidthPx = Math.max(1, Number.isFinite(viewport.targetWidthPx) ? viewport.targetWidthPx : 1);
  const downscaleFactor = sourceWidthPx / targetWidthPx;
  const cyclesPerPixel = (normalizedSpec.lpi / normalizedSpec.sourceDpi) * downscaleFactor;
  const nyquistRatio = cyclesPerPixel / NYQUIST_LIMIT_CYC_PER_PX;

  const theta = normalizedSpec.angleDeg * DEG_TO_RAD;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const wavevectorPrimary: Wavevector2D = { kx: cyclesPerPixel * cosT, ky: cyclesPerPixel * sinT };
  const wavevectorSecondary: Wavevector2D | null = hasOrthogonalLattice(normalizedSpec.kind)
    ? { kx: -cyclesPerPixel * sinT, ky: cyclesPerPixel * cosT }
    : null;

  const fundamentalBeatDistance = computeNearestIntegerBeatDistance(cyclesPerPixel);
  const axisBeatAlias: Wavevector2D = {
    kx: computeNearestIntegerBeatDistance(wavevectorPrimary.kx),
    ky: computeNearestIntegerBeatDistance(wavevectorPrimary.ky),
  };
  const dominantBeatAliasCycPerPx = computeDominantSuperNyquistBeatAlias(
    normalizedSpec.kind,
    wavevectorPrimary,
    wavevectorSecondary,
    cyclesPerPixel,
  );
  const bandLimitAlpha = smoothstep(
    BAND_LIMIT_START_CYC_PER_PX,
    BAND_LIMIT_END_CYC_PER_PX,
    cyclesPerPixel,
  );

  const viewportId = viewport.id ?? `${Math.round(targetWidthPx)}px`;
  const viewportLabelKo = viewport.labelKo ?? `${Math.round(targetWidthPx)}px 뷰포트`;
  const eff = normalizedSpec.effectiveDensity;
  if (eff <= 0.005 || eff >= 0.995) {
    return {
      viewportId,
      viewportLabelKo,
      normalizedSpec,
      sourceWidthPx,
      targetWidthPx,
      downscaleFactor,
      cyclesPerPixel,
      nyquistRatio,
      wavevectorPrimary,
      wavevectorSecondary,
      fundamentalBeatDistance,
      axisBeatAlias,
      dominantBeatAliasCycPerPx,
      bandLimitAlpha,
      moireRiskScore: 0,
      riskLevel: "safe",
    };
  }

  let baseFreqRisk: number;
  if (cyclesPerPixel <= 0.22) {
    baseFreqRisk = (cyclesPerPixel / 0.22) * 24;
  } else if (cyclesPerPixel < 0.36) {
    baseFreqRisk = 28 + ((cyclesPerPixel - 0.22) / 0.14) * 34;
  } else if (cyclesPerPixel < 0.5) {
    baseFreqRisk = 68 + ((cyclesPerPixel - 0.36) / 0.14) * 24;
  } else {
    baseFreqRisk = 86 + Math.min(8, (cyclesPerPixel - 0.5) * 8);
  }

  let resonanceBoost = 0;
  if (cyclesPerPixel >= 0.36) {
    const distToHalfOrInt = computeNearestIntegerBeatDistance(cyclesPerPixel * 2) * 0.5;
    resonanceBoost = (1 - clampNumber(distToHalfOrInt / 0.25, 0, 1)) * 12;
  }

  const modulationContrast = 0.78 + 0.22 * Math.sin(Math.PI * eff);
  const patternFactor =
    normalizedSpec.kind === "blue-noise-stipple"
      ? 0.38
      : normalizedSpec.kind === "diamond-dot" || normalizedSpec.kind === "cross-hatch"
        ? 1.04
        : normalizedSpec.kind === "radial-speed-tone"
          ? 1.02
          : 1.0;

  const moireRiskScore =
    Math.round(clampNumber((baseFreqRisk + resonanceBoost) * modulationContrast * patternFactor, 0, 100) * 10) /
    10;

  return {
    viewportId,
    viewportLabelKo,
    normalizedSpec,
    sourceWidthPx,
    targetWidthPx,
    downscaleFactor,
    cyclesPerPixel,
    nyquistRatio,
    wavevectorPrimary,
    wavevectorSecondary,
    fundamentalBeatDistance,
    axisBeatAlias,
    dominantBeatAliasCycPerPx,
    bandLimitAlpha,
    moireRiskScore,
    riskLevel: classifyMoireRiskLevel(moireRiskScore),
  };
}

/**
 * 두 스크린톤을 겹칠 때 발생하는 각도 충돌 모아레(Overprint Angle Moiré)를 분석하고 최적 오프셋(>= 30°)을 제안한다.
 */
export function analyzeStackedToneAngleMoire(
  layerASpec: ScreentonePatternSpec,
  layerBSpec: ScreentonePatternSpec,
): StackedToneAngleMoireAnalysis {
  const layerA = normalizeScreentoneSpec(layerASpec);
  const layerB = normalizeScreentoneSpec(layerBSpec);
  const rawDiff = Math.abs(layerA.angleDeg - layerB.angleDeg) % 180;
  const rawAngleDiffDeg = Math.min(rawDiff, 180 - rawDiff);
  const recommendedLayerBAngleDeg = normalizeAngle180(layerA.angleDeg + 30);
  const alternateLayerBAngleDeg = normalizeAngle180(layerA.angleDeg - 30);

  if (layerA.kind === "blue-noise-stipple" || layerB.kind === "blue-noise-stipple") {
    const maxLpi = Math.max(layerA.lpi, layerB.lpi);
    return {
      layerA,
      layerB,
      effectiveAngleSeparationDeg: rawAngleDiffDeg,
      rawAngleDiffDeg,
      beatFrequencyLpi: maxLpi,
      beatPeriodMm: MM_PER_INCH / maxLpi,
      patternClassification: "stochastic-safe",
      moireRiskScore: 10,
      riskLevel: "safe",
      recommendedLayerBAngleDeg,
      alternateLayerBAngleDeg,
    };
  }

  const use90Symmetry = hasOrthogonalLattice(layerA.kind) || hasOrthogonalLattice(layerB.kind);
  const effectiveAngleSeparationDeg = use90Symmetry
    ? Math.min(rawAngleDiffDeg % 90, 90 - (rawAngleDiffDeg % 90))
    : rawAngleDiffDeg;

  const deltaRad = effectiveAngleSeparationDeg * DEG_TO_RAD;
  const f1 = layerA.lpi;
  const f2 = layerB.lpi;
  const beatFrequencyLpi = Math.sqrt(Math.max(0, f1 * f1 + f2 * f2 - 2 * f1 * f2 * Math.cos(deltaRad)));
  const beatPeriodMm = beatFrequencyLpi > 1e-4 ? MM_PER_INCH / beatFrequencyLpi : 999;
  const lpiRatioMin = Math.min(f1, f2) / Math.max(f1, f2);

  let patternClassification: StackedTonePatternClass;
  let moireRiskScore: number;
  if (effectiveAngleSeparationDeg < 15) {
    patternClassification = "angle-clash-moire";
    moireRiskScore = 72 + (1 - effectiveAngleSeparationDeg / 15) * 18 + lpiRatioMin * 8;
  } else if (effectiveAngleSeparationDeg < 25) {
    patternClassification = "coarse-rosette";
    moireRiskScore = 36 + ((25 - effectiveAngleSeparationDeg) / 10) * 24;
  } else {
    patternClassification = "classic-rosette";
    moireRiskScore = 10 + Math.min(12, Math.abs(effectiveAngleSeparationDeg - 30) * 0.4);
  }

  const roundedScore = Math.round(clampNumber(moireRiskScore, 0, 100) * 10) / 10;
  return {
    layerA,
    layerB,
    effectiveAngleSeparationDeg: Math.round(effectiveAngleSeparationDeg * 1000) / 1000,
    rawAngleDiffDeg: Math.round(rawAngleDiffDeg * 1000) / 1000,
    beatFrequencyLpi: Math.round(beatFrequencyLpi * 1000) / 1000,
    beatPeriodMm: Math.round(beatPeriodMm * 1000) / 1000,
    patternClassification,
    moireRiskScore: roundedScore,
    riskLevel: classifyMoireRiskLevel(roundedScore),
    recommendedLayerBAngleDeg,
    alternateLayerBAngleDeg,
  };
}

export function createStandardMultiViewportPresets(
  sourceCanvasWidthPx: number,
  sourceDpi: number,
): readonly ViewportScaleSpec[] {
  const safeSourceWidth = Math.max(1, Math.round(sourceCanvasWidthPx));
  return [
    {
      id: "print-b5-600dpi",
      labelKo: `${Math.round(sourceDpi)}dpi B5 인쇄 원고 (1:1)`,
      sourceWidthPx: safeSourceWidth,
      targetWidthPx: safeSourceWidth,
      targetDpi: sourceDpi,
    },
    {
      id: "desktop-1440px",
      labelKo: "1440px 데스크톱 뷰어",
      sourceWidthPx: safeSourceWidth,
      targetWidthPx: 1440,
      targetDpi: 144,
    },
    {
      id: "webtoon-800px",
      labelKo: "800px 웹툰 표준 원고",
      sourceWidthPx: safeSourceWidth,
      targetWidthPx: 800,
      targetDpi: 96,
    },
    {
      id: "mobile-360px",
      labelKo: "360px 모바일 화면",
      sourceWidthPx: safeSourceWidth,
      targetWidthPx: 360,
      targetDpi: 96,
    },
  ];
}

/**
 * 표준 다중 디바이스·인쇄 해상도 매트릭스 전체에 걸쳐 스크린톤 모아레 안전성을 감사한다.
 */
export function auditMultiViewportToneSafety(
  spec: ScreentonePatternSpec,
  options?: MultiViewportAuditOptions,
): MultiViewportToneSafetyAudit {
  const normalizedSpec = normalizeScreentoneSpec(spec);
  const defaultB5WidthPx = Math.round((B5_PRINT_WIDTH_MM / MM_PER_INCH) * normalizedSpec.sourceDpi);
  const sourceCanvasWidthPx =
    options?.sourceCanvasWidthPx !== undefined && Number.isFinite(options.sourceCanvasWidthPx)
      ? Math.max(64, Math.round(options.sourceCanvasWidthPx))
      : defaultB5WidthPx;

  const viewportDefs =
    options?.customViewports && options.customViewports.length > 0
      ? options.customViewports
      : createStandardMultiViewportPresets(sourceCanvasWidthPx, normalizedSpec.sourceDpi);

  const viewports = viewportDefs.map((vp) => analyzeScreentoneMoireRisk(normalizedSpec, vp));
  const stackedAngleAnalysis =
    options?.overlaySpec !== undefined
      ? analyzeStackedToneAngleMoire(normalizedSpec, options.overlaySpec)
      : null;

  let worstRiskLevel: MoireRiskLevel = "safe";
  let worstMoireRiskScore = 0;
  let safeViewportCount = 0;
  let cautionViewportCount = 0;
  let severeViewportCount = 0;

  for (const vp of viewports) {
    if (vp.riskLevel === "safe") safeViewportCount += 1;
    else if (vp.riskLevel === "caution") cautionViewportCount += 1;
    else severeViewportCount += 1;
    if (vp.moireRiskScore > worstMoireRiskScore) worstMoireRiskScore = vp.moireRiskScore;
    if (riskLevelRank(vp.riskLevel) > riskLevelRank(worstRiskLevel)) worstRiskLevel = vp.riskLevel;
  }

  if (stackedAngleAnalysis !== null) {
    if (stackedAngleAnalysis.moireRiskScore > worstMoireRiskScore) {
      worstMoireRiskScore = stackedAngleAnalysis.moireRiskScore;
    }
    if (riskLevelRank(stackedAngleAnalysis.riskLevel) > riskLevelRank(worstRiskLevel)) {
      worstRiskLevel = stackedAngleAnalysis.riskLevel;
    }
  }

  return {
    spec: normalizedSpec,
    sourceCanvasWidthPx,
    viewports,
    stackedAngleAnalysis,
    worstRiskLevel,
    worstMoireRiskScore,
    safeViewportCount,
    cautionViewportCount,
    severeViewportCount,
    recommendedPrintProfile:
      stackedAngleAnalysis?.riskLevel === "severe-moire"
        ? "anti-moire-blue-noise-web"
        : "print-1bit-halftone",
    recommendedWebProfile:
      severeViewportCount > 0
        ? "anti-moire-blue-noise-web"
        : cautionViewportCount > 0
          ? "hybrid-band-limited-grayscale"
          : "print-1bit-halftone",
  };
}
