/**
 * Wave 112 — 화선지(Hanji) 모세관 수묵 물리 솔버 공용 타입 및 기법 프리셋 정의.
 */

export type HanjiSizingGrade = "saengji-raw" | "ban-sukji-semi" | "sukji-sized";
export type KoreanInkTechniquePreset = "balmuk-wet-bloom" | "pamuk-wet-on-wet" | "galpil-dry-bristle";

export interface HanjiSubstrateOptions {
  readonly sizingGrade?: HanjiSizingGrade;
  readonly fiberAnisotropy?: number;
  readonly fiberAngleRad?: number;
  readonly basePermX?: number;
  readonly basePermY?: number;
  readonly fiberRoughness?: number;
  readonly absorbencyMean?: number;
  readonly strandCount?: number;
}

export interface HanjiPaperSubstrate {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly sizingGrade: HanjiSizingGrade;
  readonly fiberAngleRad: number;
  readonly fiberAnisotropy: number;
  readonly paperHeight: Float32Array;
  readonly fiberPermX: Float32Array;
  readonly fiberPermY: Float32Array;
  readonly absorbency: Float32Array;
  readonly meanPermX: number;
  readonly meanPermY: number;
  readonly meanPaperHeight: number;
  readonly meanAbsorbency: number;
}

export interface KoreanInkTechniqueConfig {
  readonly preset: KoreanInkTechniquePreset;
  readonly labelKo: string;
  readonly waterCapillaryDiffusivity: number;
  readonly carbonAdvectionCoupling: number;
  readonly carbonBrownianDiffusivity: number;
  readonly flocculationRate: number;
  readonly hydrationPinningSuppression: number;
  readonly evaporationRate: number;
  readonly capillaryThreshold: number;
  readonly wetMobilityBoost: number;
  readonly cflSafetyFactor: number;
  readonly defaultDt: number;
  readonly defaultMoisture: number;
}

export interface SumiInkDropSpec {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly waterAmount: number;
  readonly carbonAmount: number;
  readonly profile?: "gaussian" | "flat-disc";
}

export interface SumiInkDropRecord {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly addedWaterMass: number;
  readonly addedCarbonMass: number;
  readonly affectedCells: number;
}

export interface HanjiInkCanvas {
  readonly substrate: HanjiPaperSubstrate;
  readonly preset: KoreanInkTechniquePreset;
  readonly config: KoreanInkTechniqueConfig;
  readonly waterField: Float32Array;
  readonly carbonSuspensionField: Float32Array;
  readonly depositedCarbonField: Float32Array;
  readonly fluxWaterX: Float32Array;
  readonly fluxCarbonX: Float32Array;
  readonly fluxWaterY: Float32Array;
  readonly fluxCarbonY: Float32Array;
  readonly outflowWater: Float32Array;
  readonly outflowCarbon: Float32Array;
  readonly scaleWater: Float32Array;
  readonly scaleCarbon: Float32Array;
  readonly dropHistory: SumiInkDropRecord[];
  stepCount: number;
  elapsedTime: number;
  depositedCarbonMassTotal: number;
  initialWaterMassTotal: number;
  lastCflNumber: number;
  maxCflNumber: number;
  cflClampCount: number;
}

export interface HanjiStepSummary {
  readonly stepsExecuted: number;
  readonly lastCflNumber: number;
  readonly maxCflNumber: number;
  readonly cflClampedSteps: number;
  readonly elapsedTime: number;
}

export interface SumiCarbonMassConservationReport {
  readonly expectedTotalCarbonMass: number;
  readonly actualMobileCarbonMass: number;
  readonly actualDepositedCarbonMass: number;
  readonly actualTotalCarbonMass: number;
  readonly absoluteError: number;
  readonly relativeErrorPercent: number;
  readonly nonFiniteCellCount: number;
  readonly negativeCellCount: number;
  readonly conserved: boolean;
}

export interface HanjiRadialProfileSample {
  readonly radiusCells: number;
  readonly meanWater: number;
  readonly meanMobileCarbon: number;
  readonly meanDepositedCarbon: number;
  readonly meanTotalCarbon: number;
}

export interface HanjiInkSimulationAudit {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly preset: KoreanInkTechniquePreset;
  readonly presetLabelKo: string;
  readonly sizingGrade: HanjiSizingGrade;
  readonly stepCount: number;
  readonly elapsedTime: number;
  readonly cflNumber: number;
  readonly maxCflNumber: number;
  readonly cflStable: boolean;
  readonly cflClampCount: number;
  readonly massConservation: SumiCarbonMassConservationReport;
  readonly initialDropRadius: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly waterSpreadRadius: number;
  readonly carbonSpreadRadius: number;
  readonly chromatographicHaloWidth: number;
  readonly xSpreadRadius: number;
  readonly ySpreadRadius: number;
  readonly anisotropySpreadRatio: number;
  readonly maxCarbonDensity: number;
  readonly maxWaterDensity: number;
  readonly radialProfile: readonly HanjiRadialProfileSample[];
  readonly carbonDensityGrid: Float32Array;
  readonly waterDensityGrid: Float32Array;
}

export const SIZING_ABSORBENCY_DEFAULTS: Record<HanjiSizingGrade, number> = {
  "saengji-raw": 0.78,
  "ban-sukji-semi": 0.56,
  "sukji-sized": 0.30,
};

const TECHNIQUE_PRESETS: Record<KoreanInkTechniquePreset, KoreanInkTechniqueConfig> = {
  "balmuk-wet-bloom": {
    preset: "balmuk-wet-bloom",
    labelKo: "발묵(潑墨) 습윤 번짐",
    waterCapillaryDiffusivity: 0.92,
    carbonAdvectionCoupling: 0.36,
    carbonBrownianDiffusivity: 0.055,
    flocculationRate: 0.052,
    hydrationPinningSuppression: 1.4,
    evaporationRate: 0.005,
    capillaryThreshold: 0.012,
    wetMobilityBoost: 0.55,
    cflSafetyFactor: 0.22,
    defaultDt: 0.24,
    defaultMoisture: 0.78,
  },
  "pamuk-wet-on-wet": {
    preset: "pamuk-wet-on-wet",
    labelKo: "파묵(破墨) 습윤 겹침",
    waterCapillaryDiffusivity: 0.74,
    carbonAdvectionCoupling: 0.26,
    carbonBrownianDiffusivity: 0.28,
    flocculationRate: 0.14,
    hydrationPinningSuppression: 4.2,
    evaporationRate: 0.004,
    capillaryThreshold: 0.02,
    wetMobilityBoost: 2.8,
    cflSafetyFactor: 0.22,
    defaultDt: 0.22,
    defaultMoisture: 0.85,
  },
  "galpil-dry-bristle": {
    preset: "galpil-dry-bristle",
    labelKo: "갈필(渴筆) 건조 붓결",
    waterCapillaryDiffusivity: 0.18,
    carbonAdvectionCoupling: 0.16,
    carbonBrownianDiffusivity: 0.02,
    flocculationRate: 0.24,
    hydrationPinningSuppression: 0.8,
    evaporationRate: 0.028,
    capillaryThreshold: 0.055,
    wetMobilityBoost: 0.35,
    cflSafetyFactor: 0.22,
    defaultDt: 0.16,
    defaultMoisture: 0.24,
  },
};

/** 한국화 수묵 기법 프리셋 설정을 반환한다. */
export function getKoreanInkTechniqueConfig(preset: KoreanInkTechniquePreset): KoreanInkTechniqueConfig {
  return TECHNIQUE_PRESETS[preset];
}
