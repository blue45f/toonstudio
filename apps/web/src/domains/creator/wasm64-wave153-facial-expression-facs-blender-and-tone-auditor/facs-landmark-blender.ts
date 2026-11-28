/**
 * Wave 153 — 비파괴 다중 감정 가중 블렌더, Duchenne 미소 정량 판별기,
 * 및 FACS 18-AU 기반 결정론적 2D 정규화 얼굴 랜드마크 합성기.
 */

import {
  FACS_ACTION_UNIT_IDS,
  FACS_MUTUAL_EXCLUSION_RULES,
  WEBTOON_EMOTION_PRESETS,
  clampAsymmetry,
  clampAuValue,
  createNeutralAuVector,
  detectAnatomicalAuConflicts,
  sanitizeAuVector,
  sanitizeComicEmotionFxFlags,
  type AnatomicalAuConflict,
  type ComicEmotionFxFlags,
  type FacsActionUnitId,
  type FacsActionUnitVector,
  type WebtoonEmotionPresetId,
} from "./facs-expression-types-and-presets";

export interface ExpressionBlendLayer {
  readonly presetId?: WebtoonEmotionPresetId;
  readonly customAu?: Partial<Record<FacsActionUnitId, number>>;
  readonly customFx?: Partial<ComicEmotionFxFlags>;
  readonly weight: number;
  readonly asymmetry?: number;
  readonly labelKo?: string;
}

export interface ExpressionBlendOptions {
  /** 감정 강도 배율 [0, 1.5] (1.0 초과는 만화 과장 스케일) */
  readonly intensity?: number;
  /** 좌우 비대칭 보정 [-1, 1] (양수: 우측 입꼬리·눈썹 강조) */
  readonly asymmetry?: number;
  /** 해부학적 상충 AU 자동 해소 여부 (기본값 true) */
  readonly resolveConflicts?: boolean;
  /** 이모션 마커 명시 덮어쓰기 */
  readonly fxOverrides?: Partial<ComicEmotionFxFlags>;
}

export interface ResolvedAuConflictAdjustment {
  readonly ruleId: string;
  readonly keptAu: FacsActionUnitId;
  readonly attenuatedAu: FacsActionUnitId;
  readonly beforeValue: number;
  readonly afterValue: number;
}

export type SmileClassification =
  | "duchenne-genuine"
  | "non-duchenne-social-or-cold"
  | "smirk-asymmetric"
  | "subtle-warm"
  | "non-smiling";

export interface SmileAuthenticityAnalysis {
  readonly classification: SmileClassification;
  readonly isDuchenneSmile: boolean;
  readonly isInsincereOrColdSmile: boolean;
  readonly isAsymmetricSmirk: boolean;
  readonly cheekRaiserAu06: number;
  readonly lipCornerPullerAu12: number;
  readonly asymmetry: number;
  readonly duchenneScore: number;
  readonly summaryKo: string;
}

export interface BlendedFacialExpressionResult {
  readonly au: FacsActionUnitVector;
  readonly appliedIntensity: number;
  readonly rawUnclampedPeak: number;
  readonly asymmetry: number;
  readonly fx: ComicEmotionFxFlags;
  readonly resolvedConflicts: ReadonlyArray<ResolvedAuConflictAdjustment>;
  readonly remainingConflicts: ReadonlyArray<AnatomicalAuConflict>;
  readonly smileAnalysis: SmileAuthenticityAnalysis;
  readonly normalizedWeights: ReadonlyArray<{ readonly labelKo: string; readonly weight: number }>;
  readonly blendLabelKo: string;
}

export interface NormalizedPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface EyeLandmarkGeometry {
  readonly upperLid: readonly [NormalizedPoint2D, NormalizedPoint2D, NormalizedPoint2D];
  readonly lowerLid: readonly [NormalizedPoint2D, NormalizedPoint2D, NormalizedPoint2D];
  readonly center: NormalizedPoint2D;
  readonly openHeight: number;
  readonly pupilRadius: number;
}

export interface SynthesizedFaceLandmarks {
  /** 정규화 좌표계 [0, 1] x [0, 1] 내 좌측(화면 왼쪽) 눈썹 3점: 안쪽, 중앙, 바깥 */
  readonly leftBrow: readonly [NormalizedPoint2D, NormalizedPoint2D, NormalizedPoint2D];
  /** 정규화 좌표계 [0, 1] x [0, 1] 내 우측(화면 오른쪽) 눈썹 3점: 안쪽, 중앙, 바깥 */
  readonly rightBrow: readonly [NormalizedPoint2D, NormalizedPoint2D, NormalizedPoint2D];
  readonly leftEye: EyeLandmarkGeometry;
  readonly rightEye: EyeLandmarkGeometry;
  readonly averageEyeOpenHeight: number;
  readonly noseTip: NormalizedPoint2D;
  readonly noseWrinkleStrength: number;
  /** 입술 외곽 6점 시계방향: 좌꼬리, 상좌, 상우, 우꼬리, 하우, 하좌 */
  readonly mouthOuter: readonly [
    NormalizedPoint2D,
    NormalizedPoint2D,
    NormalizedPoint2D,
    NormalizedPoint2D,
    NormalizedPoint2D,
    NormalizedPoint2D,
  ];
  readonly mouthInnerOpeningHeight: number;
  readonly mouthOpenArea: number;
  /** 좌우 입꼬리 높이 차 (leftCorner.y - rightCorner.y; 양수면 우측 입꼬리가 더 높음) */
  readonly mouthCornerLiftDelta: number;
  readonly asymmetry: number;
}

function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clampIntensity(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  if (value <= 0) return 0;
  if (value >= 1.5) return 1.5;
  return round4(value);
}

/**
 * 해부학적으로 상충하는 AU 쌍을 결정론적으로 해소한다.
 * 활성도가 더 높은 주 AU를 보존하고 상충 부 AU를 허용 상한 아래로 감쇠한다.
 */
export function resolveAnatomicalAuConflicts(
  au: FacsActionUnitVector,
): {
  readonly au: FacsActionUnitVector;
  readonly adjustments: ReadonlyArray<ResolvedAuConflictAdjustment>;
} {
  const working: Record<FacsActionUnitId, number> = { ...sanitizeAuVector(au) };
  const adjustments: ResolvedAuConflictAdjustment[] = [];

  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (let i = 0; i < FACS_MUTUAL_EXCLUSION_RULES.length; i += 1) {
      const rule = FACS_MUTUAL_EXCLUSION_RULES[i];
      if (rule === undefined) continue;
      const valA = clampAuValue(working[rule.auA]);
      const valB = clampAuValue(working[rule.auB]);
      if (valA >= rule.bothMinThreshold && valB >= rule.bothMinThreshold && valA + valB > rule.sumMax) {
        let keptAu: FacsActionUnitId;
        let attenuatedAu: FacsActionUnitId;
        let keptVal: number;
        let attenuatedVal: number;

        if (valA > valB) {
          keptAu = rule.auA;
          attenuatedAu = rule.auB;
          keptVal = valA;
          attenuatedVal = valB;
        } else if (valB > valA) {
          keptAu = rule.auB;
          attenuatedAu = rule.auA;
          keptVal = valB;
          attenuatedVal = valA;
        } else {
          keptAu = rule.tieBreakWinner;
          attenuatedAu = rule.tieBreakWinner === rule.auA ? rule.auB : rule.auA;
          keptVal = keptAu === rule.auA ? valA : valB;
          attenuatedVal = attenuatedAu === rule.auA ? valA : valB;
        }

        const safeCeiling = Math.max(
          0,
          Math.min(rule.bothMinThreshold - 0.05, rule.sumMax - keptVal - 0.05),
        );
        const nextVal = clampAuValue(safeCeiling);
        working[attenuatedAu] = nextVal;
        adjustments.push({
          ruleId: rule.id,
          keptAu,
          attenuatedAu,
          beforeValue: attenuatedVal,
          afterValue: nextVal,
        });
        changed = true;
      }
    }
    if (!changed) break;
  }

  return {
    au: sanitizeAuVector(working),
    adjustments,
  };
}

/**
 * Duchenne 진짜 미소(AU06+AU12) vs 가식·냉소 미소(AU12 단독, AU06 < 0.2) 및 비대칭 비웃음을 정량 판별한다.
 */
export function classifySmileAuthenticity(
  au: FacsActionUnitVector,
  asymmetry = 0,
): SmileAuthenticityAnalysis {
  const safeAu = sanitizeAuVector(au);
  const au06 = safeAu.AU06_cheekRaiser;
  const au12 = safeAu.AU12_lipCornerPuller;
  const au15 = safeAu.AU15_lipCornerDepressor;
  const clampedAsym = clampAsymmetry(asymmetry);
  const absAsym = Math.abs(clampedAsym);

  const duchenneScore =
    au12 >= 0.2
      ? round4(Math.min(au06, au12) * (1 - absAsym * 0.45) * (1 - au15 * 0.5))
      : 0;

  if (au12 >= 0.3 && absAsym >= 0.35) {
    return {
      classification: "smirk-asymmetric",
      isDuchenneSmile: false,
      isInsincereOrColdSmile: au06 < 0.2,
      isAsymmetricSmirk: true,
      cheekRaiserAu06: au06,
      lipCornerPullerAu12: au12,
      asymmetry: clampedAsym,
      duchenneScore,
      summaryKo: "한쪽 입꼬리가 강조된 비대칭 비웃음·능글 미소",
    };
  }

  if (au12 >= 0.35 && au06 >= 0.35 && au15 < 0.35) {
    return {
      classification: "duchenne-genuine",
      isDuchenneSmile: true,
      isInsincereOrColdSmile: false,
      isAsymmetricSmirk: false,
      cheekRaiserAu06: au06,
      lipCornerPullerAu12: au12,
      asymmetry: clampedAsym,
      duchenneScore,
      summaryKo: "눈가 광대(AU06)와 입꼬리(AU12)가 함께 활성화된 진정성 있는 Duchenne 미소",
    };
  }

  if (au12 >= 0.35 && au06 < 0.2) {
    return {
      classification: "non-duchenne-social-or-cold",
      isDuchenneSmile: false,
      isInsincereOrColdSmile: true,
      isAsymmetricSmirk: false,
      cheekRaiserAu06: au06,
      lipCornerPullerAu12: au12,
      asymmetry: clampedAsym,
      duchenneScore,
      summaryKo: "눈가 활성(AU06)이 부족해 입꼬리만 당긴 가식·냉소적 미소",
    };
  }

  if (au12 >= 0.2 && au06 >= 0.2) {
    return {
      classification: "subtle-warm",
      isDuchenneSmile: false,
      isInsincereOrColdSmile: false,
      isAsymmetricSmirk: false,
      cheekRaiserAu06: au06,
      lipCornerPullerAu12: au12,
      asymmetry: clampedAsym,
      duchenneScore,
      summaryKo: "절제된 온화한 미소",
    };
  }

  return {
    classification: "non-smiling",
    isDuchenneSmile: false,
    isInsincereOrColdSmile: false,
    isAsymmetricSmirk: false,
    cheekRaiserAu06: au06,
    lipCornerPullerAu12: au12,
    asymmetry: clampedAsym,
    duchenneScore: 0,
    summaryKo: "미소 비활성 표정",
  };
}

/**
 * 다중 웹툰 감정 프리셋·커스텀 AU 레이어를 비파괴적으로 가중 혼합하고 강도(0..1.5)를 적용한다.
 */
export function blendFacialExpressions(
  layers: ReadonlyArray<ExpressionBlendLayer>,
  options?: ExpressionBlendOptions,
): BlendedFacialExpressionResult {
  const appliedIntensity = clampIntensity(options?.intensity);
  const shouldResolveConflicts = options?.resolveConflicts !== false;

  const validLayers: Array<{
    readonly au: FacsActionUnitVector;
    readonly fx: ComicEmotionFxFlags;
    readonly weight: number;
    readonly asymmetry: number;
    readonly labelKo: string;
  }> = [];

  let totalWeight = 0;
  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    if (layer === undefined) continue;
    const rawWeight = Number.isFinite(layer.weight) ? layer.weight : 0;
    if (rawWeight <= 0) continue;

    const preset = layer.presetId !== undefined ? WEBTOON_EMOTION_PRESETS[layer.presetId] : undefined;
    const mergedAuRecord: Record<FacsActionUnitId, number> = {
      ...(preset !== undefined ? preset.au : createNeutralAuVector()),
    };
    if (layer.customAu !== undefined) {
      for (let j = 0; j < FACS_ACTION_UNIT_IDS.length; j += 1) {
        const id = FACS_ACTION_UNIT_IDS[j];
        if (id === undefined) continue;
        const overrideVal = layer.customAu[id];
        if (overrideVal !== undefined) {
          mergedAuRecord[id] = clampAuValue(overrideVal);
        }
      }
    }

    const baseFx = preset !== undefined ? preset.fx : sanitizeComicEmotionFxFlags();
    const mergedFx = sanitizeComicEmotionFxFlags({
      blushIntensity: layer.customFx?.blushIntensity ?? baseFx.blushIntensity,
      sweatDrop: layer.customFx?.sweatDrop ?? baseFx.sweatDrop,
      angerVein: layer.customFx?.angerVein ?? baseFx.angerVein,
      tearPool: layer.customFx?.tearPool ?? baseFx.tearPool,
      shadowOverEyes: layer.customFx?.shadowOverEyes ?? baseFx.shadowOverEyes,
      sparkleEyes: layer.customFx?.sparkleEyes ?? baseFx.sparkleEyes,
    });

    validLayers.push({
      au: sanitizeAuVector(mergedAuRecord),
      fx: mergedFx,
      weight: rawWeight,
      asymmetry: clampAsymmetry(layer.asymmetry ?? preset?.defaultAsymmetry ?? 0),
      labelKo: layer.labelKo ?? preset?.labelKo ?? "사용자 지정 표정",
    });
    totalWeight += rawWeight;
  }

  if (validLayers.length === 0 || totalWeight <= 0) {
    const neutralAu = createNeutralAuVector();
    const fx = sanitizeComicEmotionFxFlags(options?.fxOverrides);
    const asym = clampAsymmetry(options?.asymmetry ?? 0);
    return {
      au: neutralAu,
      appliedIntensity,
      rawUnclampedPeak: 0,
      asymmetry: asym,
      fx,
      resolvedConflicts: [],
      remainingConflicts: [],
      smileAnalysis: classifySmileAuthenticity(neutralAu, asym),
      normalizedWeights: [],
      blendLabelKo: "평온·기본",
    };
  }

  const divisor = totalWeight > 1 ? totalWeight : 1;
  const blendedRecord: Record<FacsActionUnitId, number> = { ...createNeutralAuVector() };
  let rawUnclampedPeak = 0;

  let blushAccum = 0;
  let tearAccum = 0;
  let shadowAccum = 0;
  let sweatWeight = 0;
  let angerVeinWeight = 0;
  let sparkleWeight = 0;
  let asymAccum = 0;

  const normalizedWeights: Array<{ readonly labelKo: string; readonly weight: number }> = [];

  for (let i = 0; i < validLayers.length; i += 1) {
    const item = validLayers[i];
    if (item === undefined) continue;
    const normW = item.weight / divisor;
    normalizedWeights.push({
      labelKo: item.labelKo,
      weight: round4(normW),
    });

    for (let j = 0; j < FACS_ACTION_UNIT_IDS.length; j += 1) {
      const id = FACS_ACTION_UNIT_IDS[j];
      if (id === undefined) continue;
      blendedRecord[id] = (blendedRecord[id] ?? 0) + item.au[id] * normW;
    }

    blushAccum += item.fx.blushIntensity * normW;
    tearAccum += item.fx.tearPool * normW;
    shadowAccum += item.fx.shadowOverEyes * normW;
    if (item.fx.sweatDrop) sweatWeight += normW;
    if (item.fx.angerVein) angerVeinWeight += normW;
    if (item.fx.sparkleEyes) sparkleWeight += normW;
    asymAccum += item.asymmetry * normW;
  }

  for (let j = 0; j < FACS_ACTION_UNIT_IDS.length; j += 1) {
    const id = FACS_ACTION_UNIT_IDS[j];
    if (id === undefined) continue;
    const baseVal = blendedRecord[id] ?? 0;
    const scaled =
      appliedIntensity <= 1
        ? baseVal * appliedIntensity
        : baseVal * appliedIntensity * (1 + (appliedIntensity - 1) * 0.12 * (1 - baseVal));
    if (scaled > rawUnclampedPeak) {
      rawUnclampedPeak = scaled;
    }
    blendedRecord[id] = clampAuValue(scaled);
  }

  let finalAu = sanitizeAuVector(blendedRecord);
  let resolvedConflicts: ReadonlyArray<ResolvedAuConflictAdjustment> = [];

  if (shouldResolveConflicts) {
    const resolved = resolveAnatomicalAuConflicts(finalAu);
    finalAu = resolved.au;
    resolvedConflicts = resolved.adjustments;
  }

  const remainingConflicts = detectAnatomicalAuConflicts(finalAu);
  const finalAsymmetry = clampAsymmetry(
    options?.asymmetry !== undefined ? options.asymmetry : asymAccum * Math.min(appliedIntensity, 1.25),
  );

  const fxScale = appliedIntensity === 0 ? 0 : Math.min(1.25, appliedIntensity);
  const baseFx: ComicEmotionFxFlags = {
    blushIntensity: clampAuValue(blushAccum * fxScale),
    sweatDrop: appliedIntensity >= 0.25 && sweatWeight >= 0.25,
    angerVein: appliedIntensity >= 0.35 && angerVeinWeight >= 0.25,
    tearPool: clampAuValue(tearAccum * fxScale),
    shadowOverEyes: clampAuValue(shadowAccum * fxScale),
    sparkleEyes: appliedIntensity >= 0.25 && sparkleWeight >= 0.3,
  };

  const finalFx = sanitizeComicEmotionFxFlags({
    blushIntensity: options?.fxOverrides?.blushIntensity ?? baseFx.blushIntensity,
    sweatDrop: options?.fxOverrides?.sweatDrop ?? baseFx.sweatDrop,
    angerVein: options?.fxOverrides?.angerVein ?? baseFx.angerVein,
    tearPool: options?.fxOverrides?.tearPool ?? baseFx.tearPool,
    shadowOverEyes: options?.fxOverrides?.shadowOverEyes ?? baseFx.shadowOverEyes,
    sparkleEyes: options?.fxOverrides?.sparkleEyes ?? baseFx.sparkleEyes,
  });

  const labelParts: string[] = [];
  for (let i = 0; i < normalizedWeights.length; i += 1) {
    const entry = normalizedWeights[i];
    if (entry === undefined) continue;
    labelParts.push(`${entry.labelKo} ${Math.round(entry.weight * 100)}%`);
  }
  const intensityTag =
    Math.abs(appliedIntensity - 1) > 0.01 ? ` (강도 ${Math.round(appliedIntensity * 100)}%)` : "";

  return {
    au: finalAu,
    appliedIntensity,
    rawUnclampedPeak: round4(rawUnclampedPeak),
    asymmetry: finalAsymmetry,
    fx: finalFx,
    resolvedConflicts,
    remainingConflicts,
    smileAnalysis: classifySmileAuthenticity(finalAu, finalAsymmetry),
    normalizedWeights,
    blendLabelKo: `${labelParts.join(" + ")}${intensityTag}`,
  };
}

function computePolygonArea(points: ReadonlyArray<NormalizedPoint2D>): number {
  let sum = 0;
  const count = points.length;
  for (let i = 0; i < count; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % count];
    if (current === undefined || next === undefined) continue;
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) * 0.5;
}

function makePoint(x: number, y: number): NormalizedPoint2D {
  return { x: round4(x), y: round4(y) };
}

/**
 * 18-AU 벡터로부터 결정론적 2D 정규화([0, 1]) 얼굴 랜드마크를 합성한다.
 * - AU26(턱 떨어뜨림) 증가 → 입 벌림 높이 및 6점 입술 외곽 개구 면적이 단조 증가한다.
 * - AU43(눈 감음) 증가 → 상·하 눈꺼풀 개방 높이(openHeight)가 단조 감소한다.
 * - asymmetry([-1, 1]) → 좌우 눈썹과 입꼬리의 비대칭 기울기를 반영한다.
 */
export function synthesizeFaceLandmarksFromAu(
  au: FacsActionUnitVector,
  options?: { readonly asymmetry?: number; readonly fx?: Partial<ComicEmotionFxFlags> },
): SynthesizedFaceLandmarks {
  const safe = sanitizeAuVector(au);
  const asym = clampAsymmetry(options?.asymmetry ?? 0);
  const fx = sanitizeComicEmotionFxFlags(options?.fx);

  // asym > 0: 화면 오른쪽(right side) 입꼬리/바깥눈썹 강조, 왼쪽(left side) 완화
  const leftGain = clampAuValue(1 - Math.max(0, asym) * 0.55 + Math.max(0, -asym) * 0.35);
  const rightGain = clampAuValue(1 - Math.max(0, -asym) * 0.55 + Math.max(0, asym) * 0.35);

  const au01 = safe.AU01_innerBrowRaise;
  const au02L = clampAuValue(safe.AU02_outerBrowRaise * leftGain);
  const au02R = clampAuValue(safe.AU02_outerBrowRaise * rightGain);
  const au04 = safe.AU04_browLowerer;
  const au05 = safe.AU05_upperLidRaiser;
  const au06 = safe.AU06_cheekRaiser;
  const au07 = safe.AU07_lidTightener;
  const au09 = safe.AU09_noseWrinkler;
  const au10 = safe.AU10_upperLipRaiser;
  const au12L = clampAuValue(safe.AU12_lipCornerPuller * leftGain);
  const au12R = clampAuValue(safe.AU12_lipCornerPuller * rightGain);
  const au14 = safe.AU14_dimpler;
  const au15 = safe.AU15_lipCornerDepressor;
  const au17 = safe.AU17_chinRaiser;
  const au20 = safe.AU20_lipStretcher;
  const au23 = safe.AU23_lipTightener;
  const au25 = safe.AU25_lipsPart;
  const au26 = safe.AU26_jawDrop;
  const au27 = safe.AU27_mouthStretch;
  const au43 = safe.AU43_eyesClosed;

  // 눈썹 3점 (inner, mid, outer)
  const browBaseY = 0.33;
  const innerPinch = 0.022 * au04;
  const leftBrow: readonly [NormalizedPoint2D, NormalizedPoint2D, NormalizedPoint2D] = [
    makePoint(0.415 + innerPinch, browBaseY - 0.048 * au01 + 0.045 * au04),
    makePoint(0.34, browBaseY - 0.015 - 0.03 * au01 - 0.032 * au02L + 0.034 * au04),
    makePoint(0.265, browBaseY + 0.004 - 0.048 * au02L + 0.014 * au04),
  ];
  const rightBrow: readonly [NormalizedPoint2D, NormalizedPoint2D, NormalizedPoint2D] = [
    makePoint(0.585 - innerPinch, browBaseY - 0.048 * au01 + 0.045 * au04),
    makePoint(0.66, browBaseY - 0.015 - 0.03 * au01 - 0.032 * au02R + 0.034 * au04),
    makePoint(0.735, browBaseY + 0.004 - 0.048 * au02R + 0.014 * au04),
  ];

  // 눈 개방 높이: AU05에 단조 증가, AU43에 엄격 단조 감소
  const baseEyeOpen = 0.068 + 0.036 * au05 - 0.012 * au06 - 0.018 * au07;
  const openRatio = Math.max(0.05, 1 - 0.94 * au43);
  const leftEyeOpen = round4(Math.max(0.003, baseEyeOpen * openRatio));
  const rightEyeOpen = round4(Math.max(0.003, baseEyeOpen * openRatio));

  const shockShrink = au05 * 0.012 + au20 * 0.008;
  const sparkleBoost = fx.sparkleEyes ? 0.006 : 0;
  const pupilRadius = round4(Math.max(0.012, Math.min(0.04, 0.028 - shockShrink + sparkleBoost)));

  const buildEye = (centerX: number, openH: number): EyeLandmarkGeometry => {
    const centerY = 0.435;
    const halfW = 0.068;
    const upperMidY = centerY - openH * 0.56;
    const lowerMidY = centerY + openH * 0.44 - 0.01 * au06;
    return {
      upperLid: [
        makePoint(centerX - halfW, centerY + 0.004),
        makePoint(centerX, upperMidY),
        makePoint(centerX + halfW, centerY + 0.004),
      ],
      lowerLid: [
        makePoint(centerX - halfW, centerY + 0.004),
        makePoint(centerX, Math.max(upperMidY + 0.002, lowerMidY)),
        makePoint(centerX + halfW, centerY + 0.004),
      ],
      center: makePoint(centerX, centerY),
      openHeight: openH,
      pupilRadius,
    };
  };

  const leftEye = buildEye(0.35, leftEyeOpen);
  const rightEye = buildEye(0.65, rightEyeOpen);

  // 코 랜드마크
  const noseTip = makePoint(0.5, 0.565 - 0.016 * au09);

  // 입술 외곽 6점 & 개구 면적 (AU26 증가에 엄격 단조 증가)
  const mouthCenterY = 0.705;
  const halfMouthWidth = Math.max(
    0.065,
    0.115 + 0.036 * ((au12L + au12R) * 0.5) + 0.042 * au20 - 0.014 * au14 - 0.028 * au23,
  );
  const tightenFactor = 1 - 0.48 * au23;
  const rawAperture = 0.006 + 0.028 * au25 + 0.068 * au26 + 0.056 * au27;
  const mouthInnerOpeningHeight = round4(Math.max(0.003, rawAperture * tightenFactor));

  const upperLipY = mouthCenterY - mouthInnerOpeningHeight * 0.42 - 0.014 * au10;
  const lowerLipY = mouthCenterY + mouthInnerOpeningHeight * 0.58 + 0.012 * au26 - 0.008 * au17;
  const leftCornerY = mouthCenterY - 0.038 * au12L + 0.032 * au15;
  const rightCornerY = mouthCenterY - 0.038 * au12R + 0.032 * au15;

  const mouthOuter: readonly [
    NormalizedPoint2D,
    NormalizedPoint2D,
    NormalizedPoint2D,
    NormalizedPoint2D,
    NormalizedPoint2D,
    NormalizedPoint2D,
  ] = [
    makePoint(0.5 - halfMouthWidth, leftCornerY),
    makePoint(0.5 - halfMouthWidth * 0.48, upperLipY),
    makePoint(0.5 + halfMouthWidth * 0.48, upperLipY),
    makePoint(0.5 + halfMouthWidth, rightCornerY),
    makePoint(0.5 + halfMouthWidth * 0.48, lowerLipY),
    makePoint(0.5 - halfMouthWidth * 0.48, lowerLipY),
  ];

  const mouthOpenArea = round4(computePolygonArea(mouthOuter));
  const mouthCornerLiftDelta = round4(leftCornerY - rightCornerY);

  return {
    leftBrow,
    rightBrow,
    leftEye,
    rightEye,
    averageEyeOpenHeight: round4((leftEyeOpen + rightEyeOpen) * 0.5),
    noseTip,
    noseWrinkleStrength: round4(au09),
    mouthOuter,
    mouthInnerOpeningHeight,
    mouthOpenArea,
    mouthCornerLiftDelta,
    asymmetry: asym,
  };
}
