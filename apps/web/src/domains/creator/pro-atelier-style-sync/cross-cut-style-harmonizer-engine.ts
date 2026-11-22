/**
 * 컷-대-컷 실시간 화풍 일체화 엔진 (Cross-Cut Art-Style Harmonizer).
 *
 * 원작자 기준 컷(Master Cut DNA: 평균 선폭 · 선화 잉크 OKLCH · 피부/헤어/의상 대표 OKLCH ·
 * 명암 대비비 · 하이라이트 채도)과 다수의 어시스턴트·외주 제출 컷을 실시간 비교해
 * 0~100 이질감 점수를 산출하고, 1클릭 보정 파라미터(선폭 보정 계수 · OKLCH 시프트 ·
 * 17노트 명암 커브 LUT · 하이라이트 채도 계수)를 적용해 전 컷 색차 ΔE <= 2.0,
 * 선폭 오차 <= 0.15px 수렴을 검증한다.
 */

import {
  build3dSixPassStyleSync,
  extractArtistLineLayerProfile,
  type ArtistLineLayerProfile,
  type CharacterLineLayerSample,
  type CutLightingPresetId,
  type FocalDepthBlurInput,
  type ThreeDSixPassSyncPlan,
} from "./artist-style-6pass-sync";
import {
  formatOklchCss,
  oklchToOklab,
  type OklchColor,
} from "./pro-drawing-8-tools-engine";

export const STYLE_SYNC_DELTA_E_TARGET = 2.0;
export const STYLE_SYNC_STROKE_ERROR_TARGET_PX = 0.15;

export type StyleDriftGrade = "matched" | "minor-drift" | "major-drift";

export interface CutArtStyleDna {
  readonly cutId: string;
  readonly cutLabel: string;
  readonly contributorName: string;
  readonly roleLabel: string;
  readonly averageStrokeWidthPx: number;
  readonly lineInkOklch: OklchColor;
  readonly skinOklch: OklchColor;
  readonly hairOklch: OklchColor;
  readonly outfitOklch: OklchColor;
  readonly contrastRatio: number;
  readonly highlightChroma: number;
}

export interface OklchShiftVector {
  readonly deltaL: number;
  readonly deltaC: number;
  readonly deltaH: number;
}

export interface CutStyleDriftMetrics {
  readonly cutId: string;
  readonly strokeWidthErrorPx: number;
  readonly lineInkDeltaE: number;
  readonly skinDeltaE: number;
  readonly hairDeltaE: number;
  readonly outfitDeltaE: number;
  readonly maxColorDeltaE: number;
  readonly meanColorDeltaE: number;
  readonly contrastDiff: number;
  readonly highlightChromaDiff: number;
  readonly inconsistencyScore: number;
  readonly grade: StyleDriftGrade;
  readonly meetsDeltaETarget: boolean;
  readonly meetsStrokeTarget: boolean;
}

export interface CutHarmonizationCorrection {
  readonly cutId: string;
  readonly strength: number;
  readonly strokeWidthMultiplier: number;
  readonly lineInkShift: OklchShiftVector;
  readonly skinShift: OklchShiftVector;
  readonly hairShift: OklchShiftVector;
  readonly outfitShift: OklchShiftVector;
  readonly meanOklchShift: OklchShiftVector;
  readonly contrastGamma: number;
  readonly contrastCurveLut: readonly number[];
  readonly highlightChromaMultiplier: number;
}

export interface HarmonizedCutEntry {
  readonly originalCut: CutArtStyleDna;
  readonly harmonizedCut: CutArtStyleDna;
  readonly before: CutStyleDriftMetrics;
  readonly after: CutStyleDriftMetrics;
  readonly correction: CutHarmonizationCorrection;
  readonly inconsistencyReduction: number;
}

export interface CrossCutHarmonizationReport {
  readonly master: CutArtStyleDna;
  readonly strength: number;
  readonly cutCount: number;
  readonly results: readonly HarmonizedCutEntry[];
  readonly beforeMaxDeltaE: number;
  readonly afterMaxDeltaE: number;
  readonly beforeMaxStrokeErrorPx: number;
  readonly afterMaxStrokeErrorPx: number;
  readonly beforeAverageInconsistency: number;
  readonly afterAverageInconsistency: number;
  readonly allCutsWithinDeltaETarget: boolean;
  readonly allCutsWithinStrokeTarget: boolean;
  readonly convergencePassed: boolean;
}

export const DEFAULT_MASTER_CUT_DNA: CutArtStyleDna = {
  cutId: "ep01-cut-012-master",
  cutLabel: "1화 12컷 · 원작자 기준 컷",
  contributorName: "원작자 메인",
  roleLabel: "마스터 DNA",
  averageStrokeWidthPx: 2.2,
  lineInkOklch: { l: 0.21, c: 0.032, h: 264 },
  skinOklch: { l: 0.83, c: 0.058, h: 54 },
  hairOklch: { l: 0.29, c: 0.068, h: 258 },
  outfitOklch: { l: 0.88, c: 0.026, h: 86 },
  contrastRatio: 4.8,
  highlightChroma: 0.11,
};

export const DEFAULT_ASSISTANT_SUBMISSION_CUTS: readonly CutArtStyleDna[] = [
  {
    cutId: "ep01-cut-013-assist-a",
    cutLabel: "1화 13컷 · 클로즈업 대사",
    contributorName: "어시스턴트 A",
    roleLabel: "선화·밑색",
    averageStrokeWidthPx: 3.18,
    lineInkOklch: { l: 0.14, c: 0.012, h: 240 },
    skinOklch: { l: 0.77, c: 0.088, h: 28 },
    hairOklch: { l: 0.24, c: 0.092, h: 274 },
    outfitOklch: { l: 0.84, c: 0.044, h: 72 },
    contrastRatio: 5.9,
    highlightChroma: 0.15,
  },
  {
    cutId: "ep01-cut-014-assist-b",
    cutLabel: "1화 14컷 · 복도 역광",
    contributorName: "어시스턴트 B",
    roleLabel: "채색·명암",
    averageStrokeWidthPx: 1.46,
    lineInkOklch: { l: 0.26, c: 0.048, h: 282 },
    skinOklch: { l: 0.87, c: 0.042, h: 68 },
    hairOklch: { l: 0.35, c: 0.105, h: 242 },
    outfitOklch: { l: 0.91, c: 0.052, h: 98 },
    contrastRatio: 6.5,
    highlightChroma: 0.19,
  },
  {
    cutId: "ep01-cut-015-outsource-c",
    cutLabel: "1화 15컷 · 투샷 회상",
    contributorName: "외주 스튜디오 C",
    roleLabel: "외주 납품",
    averageStrokeWidthPx: 2.74,
    lineInkOklch: { l: 0.35, c: 0.018, h: 235 },
    skinOklch: { l: 0.79, c: 0.072, h: 42 },
    hairOklch: { l: 0.37, c: 0.045, h: 250 },
    outfitOklch: { l: 0.81, c: 0.018, h: 105 },
    contrastRatio: 2.9,
    highlightChroma: 0.06,
  },
  {
    cutId: "ep01-cut-016-assist-d",
    cutLabel: "1화 16컷 · 액션 전환",
    contributorName: "어시스턴트 D",
    roleLabel: "후보정·효과",
    averageStrokeWidthPx: 1.82,
    lineInkOklch: { l: 0.19, c: 0.054, h: 295 },
    skinOklch: { l: 0.81, c: 0.082, h: 66 },
    hairOklch: { l: 0.27, c: 0.098, h: 230 },
    outfitOklch: { l: 0.84, c: 0.074, h: 95 },
    contrastRatio: 5.5,
    highlightChroma: 0.21,
  },
] as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeHue(hue: number): number {
  const wrapped = hue % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function shortestHueDeltaDeg(fromHue: number, toHue: number): number {
  const diff = normalizeHue(toHue) - normalizeHue(fromHue);
  if (diff > 180) return roundTo(diff - 360, 2);
  if (diff < -180) return roundTo(diff + 360, 2);
  return roundTo(diff, 2);
}

/**
 * OKLab 유클리드 거리를 CIE JND 등가 스케일(×100)로 환산한 지각 색차 ΔE_OK.
 * ΔE <= 2.0은 독자가 컷 전환 시 이질감을 느끼지 않는 시각적 동일성 기준선이다.
 */
export function computeOklchDeltaE(reference: OklchColor, sample: OklchColor): number {
  const labA = oklchToOklab(reference);
  const labB = oklchToOklab(sample);
  const dist = Math.hypot(labA.l - labB.l, labA.a - labB.a, labA.b - labB.b);
  return roundTo(dist * 100, 3);
}

export function analyzeCutStyleDrift(
  master: CutArtStyleDna,
  cut: CutArtStyleDna,
): CutStyleDriftMetrics {
  const strokeWidthErrorPx = roundTo(
    Math.abs(cut.averageStrokeWidthPx - master.averageStrokeWidthPx),
    3,
  );
  const lineInkDeltaE = computeOklchDeltaE(master.lineInkOklch, cut.lineInkOklch);
  const skinDeltaE = computeOklchDeltaE(master.skinOklch, cut.skinOklch);
  const hairDeltaE = computeOklchDeltaE(master.hairOklch, cut.hairOklch);
  const outfitDeltaE = computeOklchDeltaE(master.outfitOklch, cut.outfitOklch);

  const maxColorDeltaE = roundTo(
    Math.max(lineInkDeltaE, skinDeltaE, hairDeltaE, outfitDeltaE),
    3,
  );
  const meanColorDeltaE = roundTo(
    (lineInkDeltaE + skinDeltaE + hairDeltaE + outfitDeltaE) / 4,
    3,
  );
  const contrastDiff = roundTo(Math.abs(cut.contrastRatio - master.contrastRatio), 3);
  const highlightChromaDiff = roundTo(
    Math.abs(cut.highlightChroma - master.highlightChroma),
    4,
  );

  // 가중 이질감 점수 (0 = 마스터와 동일, 100 = 극심한 화풍 이탈)
  const strokePenalty = Math.min(1, strokeWidthErrorPx / 1.5) * 30;
  const colorPenalty = Math.min(1, (0.6 * maxColorDeltaE + 0.4 * meanColorDeltaE) / 14) * 45;
  const contrastPenalty = Math.min(1, contrastDiff / 3.5) * 15;
  const highlightPenalty = Math.min(1, highlightChromaDiff / 0.12) * 10;
  const inconsistencyScore = roundTo(
    clamp(strokePenalty + colorPenalty + contrastPenalty + highlightPenalty, 0, 100),
    1,
  );

  const meetsDeltaETarget = maxColorDeltaE <= STYLE_SYNC_DELTA_E_TARGET;
  const meetsStrokeTarget = strokeWidthErrorPx <= STYLE_SYNC_STROKE_ERROR_TARGET_PX;

  let grade: StyleDriftGrade = "major-drift";
  if (meetsDeltaETarget && meetsStrokeTarget && inconsistencyScore <= 12) {
    grade = "matched";
  } else if (inconsistencyScore <= 35) {
    grade = "minor-drift";
  }

  return {
    cutId: cut.cutId,
    strokeWidthErrorPx,
    lineInkDeltaE,
    skinDeltaE,
    hairDeltaE,
    outfitDeltaE,
    maxColorDeltaE,
    meanColorDeltaE,
    contrastDiff,
    highlightChromaDiff,
    inconsistencyScore,
    grade,
    meetsDeltaETarget,
    meetsStrokeTarget,
  };
}

function buildContrastCurveLut(sourceContrast: number, targetContrast: number, strength: number): {
  readonly gamma: number;
  readonly lut: readonly number[];
} {
  const safeSrc = Math.max(1.05, sourceContrast);
  const safeDst = Math.max(1.05, targetContrast);
  const rawRatio = Math.log(safeDst + 1) / Math.log(safeSrc + 1);
  const gamma = roundTo(clamp(1 + (rawRatio - 1) * strength, 0.55, 1.85), 3);
  const sCurveGain = clamp((safeDst - safeSrc) * 0.08 * strength, -0.28, 0.28);

  const knots: number[] = [];
  let prev = 0;
  for (let i = 0; i <= 16; i += 1) {
    const x = i / 16;
    if (i === 0) {
      knots.push(0);
      prev = 0;
      continue;
    }
    if (i === 16) {
      knots.push(1);
      break;
    }
    const gammaMapped = x ** (1 / gamma);
    const sShift = sCurveGain * Math.sin(Math.PI * 2 * (x - 0.5)) * 0.18;
    const candidate = clamp(gammaMapped - sShift, prev, 1);
    const rounded = roundTo(candidate, 4);
    knots.push(rounded);
    prev = rounded;
  }
  return { gamma, lut: knots };
}

function computeChannelShift(
  source: OklchColor,
  target: OklchColor,
  strength: number,
): OklchShiftVector {
  return {
    deltaL: roundTo((target.l - source.l) * strength, 4),
    deltaC: roundTo((target.c - source.c) * strength, 4),
    deltaH: roundTo(shortestHueDeltaDeg(source.h, target.h) * strength, 2),
  };
}

function applyOklchShift(source: OklchColor, shift: OklchShiftVector): OklchColor {
  return {
    l: roundTo(clamp(source.l + shift.deltaL, 0.01, 0.99), 4),
    c: roundTo(clamp(source.c + shift.deltaC, 0, 0.37), 4),
    h: roundTo(normalizeHue(source.h + shift.deltaH), 2),
  };
}

export function harmonizeSingleCutToMaster(
  master: CutArtStyleDna,
  cut: CutArtStyleDna,
  strengthInput = 1,
): HarmonizedCutEntry {
  const strength = clamp(strengthInput, 0, 1);
  const before = analyzeCutStyleDrift(master, cut);

  const safeCutStroke = Math.max(0.1, cut.averageStrokeWidthPx);
  const fullStrokeMult = master.averageStrokeWidthPx / safeCutStroke;
  const strokeWidthMultiplier = roundTo(1 + (fullStrokeMult - 1) * strength, 4);

  const lineInkShift = computeChannelShift(cut.lineInkOklch, master.lineInkOklch, strength);
  const skinShift = computeChannelShift(cut.skinOklch, master.skinOklch, strength);
  const hairShift = computeChannelShift(cut.hairOklch, master.hairOklch, strength);
  const outfitShift = computeChannelShift(cut.outfitOklch, master.outfitOklch, strength);

  const meanOklchShift: OklchShiftVector = {
    deltaL: roundTo(
      (lineInkShift.deltaL + skinShift.deltaL + hairShift.deltaL + outfitShift.deltaL) / 4,
      4,
    ),
    deltaC: roundTo(
      (lineInkShift.deltaC + skinShift.deltaC + hairShift.deltaC + outfitShift.deltaC) / 4,
      4,
    ),
    deltaH: roundTo(
      (lineInkShift.deltaH + skinShift.deltaH + hairShift.deltaH + outfitShift.deltaH) / 4,
      2,
    ),
  };

  const { gamma: contrastGamma, lut: contrastCurveLut } = buildContrastCurveLut(
    cut.contrastRatio,
    master.contrastRatio,
    strength,
  );

  const safeCutHighlight = Math.max(0.005, cut.highlightChroma);
  const fullHighlightMult = master.highlightChroma / safeCutHighlight;
  const highlightChromaMultiplier = roundTo(1 + (fullHighlightMult - 1) * strength, 4);

  const harmonizedCut: CutArtStyleDna = {
    ...cut,
    averageStrokeWidthPx: roundTo(cut.averageStrokeWidthPx * strokeWidthMultiplier, 3),
    lineInkOklch: applyOklchShift(cut.lineInkOklch, lineInkShift),
    skinOklch: applyOklchShift(cut.skinOklch, skinShift),
    hairOklch: applyOklchShift(cut.hairOklch, hairShift),
    outfitOklch: applyOklchShift(cut.outfitOklch, outfitShift),
    contrastRatio: roundTo(
      cut.contrastRatio + (master.contrastRatio - cut.contrastRatio) * strength,
      2,
    ),
    highlightChroma: roundTo(
      clamp(cut.highlightChroma * highlightChromaMultiplier, 0, 0.35),
      4,
    ),
  };

  const after = analyzeCutStyleDrift(master, harmonizedCut);
  const inconsistencyReduction = roundTo(
    Math.max(0, before.inconsistencyScore - after.inconsistencyScore),
    1,
  );

  return {
    originalCut: cut,
    harmonizedCut,
    before,
    after,
    correction: {
      cutId: cut.cutId,
      strength,
      strokeWidthMultiplier,
      lineInkShift,
      skinShift,
      hairShift,
      outfitShift,
      meanOklchShift,
      contrastGamma,
      contrastCurveLut,
      highlightChromaMultiplier,
    },
    inconsistencyReduction,
  };
}

export function harmonizeCrossCutStyles(
  master: CutArtStyleDna,
  submittedCuts: ReadonlyArray<CutArtStyleDna>,
  strengthInput = 1,
): CrossCutHarmonizationReport {
  const strength = clamp(strengthInput, 0, 1);
  const results = submittedCuts.map((cut) => harmonizeSingleCutToMaster(master, cut, strength));
  const cutCount = results.length;

  let beforeMaxDeltaE = 0;
  let afterMaxDeltaE = 0;
  let beforeMaxStrokeErrorPx = 0;
  let afterMaxStrokeErrorPx = 0;
  let beforeScoreSum = 0;
  let afterScoreSum = 0;

  for (const entry of results) {
    if (entry.before.maxColorDeltaE > beforeMaxDeltaE) {
      beforeMaxDeltaE = entry.before.maxColorDeltaE;
    }
    if (entry.after.maxColorDeltaE > afterMaxDeltaE) {
      afterMaxDeltaE = entry.after.maxColorDeltaE;
    }
    if (entry.before.strokeWidthErrorPx > beforeMaxStrokeErrorPx) {
      beforeMaxStrokeErrorPx = entry.before.strokeWidthErrorPx;
    }
    if (entry.after.strokeWidthErrorPx > afterMaxStrokeErrorPx) {
      afterMaxStrokeErrorPx = entry.after.strokeWidthErrorPx;
    }
    beforeScoreSum += entry.before.inconsistencyScore;
    afterScoreSum += entry.after.inconsistencyScore;
  }

  const allCutsWithinDeltaETarget = results.every((entry) => entry.after.meetsDeltaETarget);
  const allCutsWithinStrokeTarget = results.every((entry) => entry.after.meetsStrokeTarget);

  return {
    master,
    strength,
    cutCount,
    results,
    beforeMaxDeltaE: roundTo(beforeMaxDeltaE, 3),
    afterMaxDeltaE: roundTo(afterMaxDeltaE, 3),
    beforeMaxStrokeErrorPx: roundTo(beforeMaxStrokeErrorPx, 3),
    afterMaxStrokeErrorPx: roundTo(afterMaxStrokeErrorPx, 3),
    beforeAverageInconsistency: cutCount > 0 ? roundTo(beforeScoreSum / cutCount, 1) : 0,
    afterAverageInconsistency: cutCount > 0 ? roundTo(afterScoreSum / cutCount, 1) : 0,
    allCutsWithinDeltaETarget,
    allCutsWithinStrokeTarget,
    convergencePassed: allCutsWithinDeltaETarget && allCutsWithinStrokeTarget,
  };
}

export function formatCutSwatchCss(color: OklchColor): string {
  return formatOklchCss(color);
}

/**
 * 캐릭터 선화 레이어에서 로컬 추출한 주 선색·평균 선폭 프로파일을
 * 원작자 마스터 컷 DNA에 투영한다.
 */
export function deriveMasterCutDnaFromArtistLineProfile(
  baseMaster: CutArtStyleDna,
  profile: ArtistLineLayerProfile,
): CutArtStyleDna {
  return {
    ...baseMaster,
    averageStrokeWidthPx: profile.averageStrokeWidthPx,
    lineInkOklch: profile.dominantLineColorOklch,
  };
}

/**
 * 선화 레이어 1장 추출 → 마스터 DNA 동기화 → 3D 6패스 계획 & 전 컷 화풍 수렴을 일괄 계산한다.
 */
export function syncCrossCutMasterWith3dSixPass(options: {
  readonly baseMaster: CutArtStyleDna;
  readonly lineSample: CharacterLineLayerSample;
  readonly submittedCuts: ReadonlyArray<CutArtStyleDna>;
  readonly lightingPresetId?: CutLightingPresetId;
  readonly depthBlurInput?: Partial<FocalDepthBlurInput>;
  readonly syncStrength?: number;
}): {
  readonly extractedProfile: ArtistLineLayerProfile;
  readonly updatedMaster: CutArtStyleDna;
  readonly sixPassPlan: ThreeDSixPassSyncPlan;
  readonly harmonizationReport: CrossCutHarmonizationReport;
} {
  const extractedProfile = extractArtistLineLayerProfile(options.lineSample);
  const updatedMaster = deriveMasterCutDnaFromArtistLineProfile(
    options.baseMaster,
    extractedProfile,
  );
  const sixPassPlan = build3dSixPassStyleSync({
    profile: extractedProfile,
    lightingPresetId: options.lightingPresetId,
    depthBlurInput: options.depthBlurInput,
    syncStrength: options.syncStrength ?? 1,
  });
  const harmonizationReport = harmonizeCrossCutStyles(
    updatedMaster,
    options.submittedCuts,
    options.syncStrength ?? 1,
  );
  return {
    extractedProfile,
    updatedMaster,
    sixPassPlan,
    harmonizationReport,
  };
}
