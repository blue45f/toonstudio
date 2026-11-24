/**
 * Wave 37G — 표정-헤어 간섭 회피 솔버 · 포즈 공간 의상 주름맵 매퍼 · 1클릭 3면 캐릭터 설정집 생성기.
 *
 * 1. 표정 블렌드셰이프(놀람·화남·윙크·미소·슬픔)에 연동해 앞머리·눈썹 Z축 관통을 자동 회피한다.
 * 2. 팔꿈치·무릎·어깨 관절 굴곡 각도와 원단 물성에서 의상 주름 노멀·웹툰 선화 강도를 단조 산출한다.
 * 3. 정면·측면·후면 3면 뷰 + 12종 표정 슬롯 + OKLCH 공식 컬러 칩 + 미터법 신장 눈금자 시트(SVG/JSON)를 생성한다.
 */

export type VrmExpressionPresetId = "neutral" | "surprised" | "angry" | "winkLeft" | "winkRight" | "happy" | "sad";

export interface ExpressionBlendshapeWeights {
  readonly surprised?: number;
  readonly angry?: number;
  readonly winkLeft?: number;
  readonly winkRight?: number;
  readonly happy?: number;
  readonly sad?: number;
}

export type BangsZoneId = "leftOuter" | "leftBrow" | "centerGlabella" | "rightBrow" | "rightOuter";

export interface HairExpressionAvoidanceInput {
  readonly weights: ExpressionBlendshapeWeights;
  readonly baseClearanceMm?: number;
  readonly browProtrusionScale?: number;
  readonly bangsDensity?: number;
  readonly avoidanceStrength?: number;
}

export interface BangsZoneAvoidance {
  readonly zoneId: BangsZoneId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly browLiftMm: number;
  readonly browForwardMm: number;
  readonly rawPenetrationMm: number;
  readonly zOffsetMm: number;
  readonly xPartingOffsetMm: number;
  readonly residualClearanceMm: number;
  readonly collisionResolved: boolean;
}

export interface HairExpressionAvoidanceResult {
  readonly zones: readonly BangsZoneAvoidance[];
  readonly maxZOffsetMm: number;
  readonly meanZOffsetMm: number;
  readonly leftRightAsymmetryMm: number;
  readonly dominantExpression: VrmExpressionPresetId;
  readonly overlapPreventedCount: number;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export type WrinkleJointId = "leftElbow" | "rightElbow" | "leftKnee" | "rightKnee" | "leftShoulder" | "rightShoulder";
export type GarmentFabricType = "cotton" | "denim" | "silk" | "knit" | "blazer";

export interface PoseJointFlexionAngles {
  readonly leftElbowDeg?: number;
  readonly rightElbowDeg?: number;
  readonly leftKneeDeg?: number;
  readonly rightKneeDeg?: number;
  readonly leftShoulderDeg?: number;
  readonly rightShoulderDeg?: number;
}

export interface PoseSpaceWrinkleInput {
  readonly angles: PoseJointFlexionAngles;
  readonly fabricType?: GarmentFabricType;
  readonly garmentTightness?: number;
  readonly inkStylizationGain?: number;
}

export interface JointWrinkleChannel {
  readonly jointId: WrinkleJointId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly angleDeg: number;
  readonly maxAngleDeg: number;
  readonly normalizedBend: number;
  readonly normalStrength: number;
  readonly inkLineStrength: number;
  readonly compressionFoldWeight: number;
  readonly tensionCreaseWeight: number;
  readonly tangentNormal: readonly [number, number, number];
  readonly primaryCreaseAngleDeg: number;
  readonly inkLineWidthPx: number;
  readonly estimatedFoldLines: number;
}

export interface PoseWrinkleShaderUniforms {
  readonly uWrinkleElbowL: number;
  readonly uWrinkleElbowR: number;
  readonly uWrinkleKneeL: number;
  readonly uWrinkleKneeR: number;
  readonly uWrinkleShoulderL: number;
  readonly uWrinkleShoulderR: number;
  readonly uWrinkleInkGain: number;
}

export interface PoseSpaceWrinkleMapResult {
  readonly fabricType: GarmentFabricType;
  readonly fabricLabelKo: string;
  readonly fabricLabelEn: string;
  readonly joints: readonly JointWrinkleChannel[];
  readonly peakNormalStrength: number;
  readonly peakInkLineStrength: number;
  readonly totalActiveFoldLines: number;
  readonly shaderUniforms: PoseWrinkleShaderUniforms;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface OklchChipValue {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export interface CharacterColorChip {
  readonly id: string;
  readonly roleKo: string;
  readonly roleEn: string;
  readonly oklch: OklchChipValue;
  readonly oklchCss: string;
  readonly contrastVsWhite: number;
  readonly printSafe: boolean;
}

export interface MetricRulerTick {
  readonly cm: number;
  readonly normalizedY: number;
  readonly isMajor: boolean;
  readonly label: string;
}

export interface MetricHeightLandmark {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly cm: number;
  readonly normalizedY: number;
}

export interface MetricHeightRulerSpec {
  readonly heightCm: number;
  readonly headRatio: number;
  readonly headHeightCm: number;
  readonly stepCm: number;
  readonly ticks: readonly MetricRulerTick[];
  readonly landmarks: readonly MetricHeightLandmark[];
}

export interface SheetRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TurnaroundViewSlot {
  readonly id: "front" | "side" | "back";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly cameraYawDeg: number;
  readonly rect: SheetRect;
}

export interface TurnaroundExpressionSlot {
  readonly index: number;
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly weights: ExpressionBlendshapeWeights;
  readonly hairAvoidanceZMm: number;
  readonly rect: SheetRect;
}

export interface BuildTurnaroundSheetInput {
  readonly characterName?: string;
  readonly seriesTitle?: string;
  readonly characterCode?: string;
  readonly heightCm?: number;
  readonly headRatio?: number;
  readonly colorChips?: readonly Omit<CharacterColorChip, "oklchCss" | "contrastVsWhite" | "printSafe">[];
}

export interface CharacterTurnaroundSheetSpec {
  readonly schemaVersion: "toonstudio.turnaround.v1";
  readonly characterName: string;
  readonly seriesTitle: string;
  readonly characterCode: string;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly views: readonly TurnaroundViewSlot[];
  readonly expressions: readonly TurnaroundExpressionSlot[];
  readonly palette: readonly CharacterColorChip[];
  readonly ruler: MetricHeightRulerSpec;
}

export interface CharacterTurnaroundSheetBundle {
  readonly spec: CharacterTurnaroundSheetSpec;
  readonly json: string;
  readonly svg: string;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function escapeXml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** OKLCH 값을 CSS `oklch(L C H)` 문자열로 포맷한다. */
export function formatOklchToken(oklch: OklchChipValue): string {
  const l = roundTo(clamp(oklch.l, 0, 1), 3);
  const c = roundTo(clamp(oklch.c, 0, 0.4), 3);
  const h = roundTo(((oklch.h % 360) + 360) % 360, 1);
  return `oklch(${l} ${c} ${h})`;
}

/** 표정 프리셋과 강도(0~1)에서 블렌드셰이프 가중치 맵을 생성한다. */
export function createExpressionWeightsFromPreset(
  presetId: VrmExpressionPresetId,
  intensity = 1,
): ExpressionBlendshapeWeights {
  const w = roundTo(clamp(intensity, 0, 1), 3);
  if (presetId === "neutral" || w <= 0) return {};
  return { [presetId]: w };
}

interface BangsZoneProfile {
  readonly zoneId: BangsZoneId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly surprisedLift: number;
  readonly surprisedPush: number;
  readonly angryLift: number;
  readonly angryPush: number;
  readonly angryPartX: number;
  readonly winkLeftPush: number;
  readonly winkRightPush: number;
  readonly happyPush: number;
  readonly sadLift: number;
  readonly sadPush: number;
}

const BANGS_ZONE_PROFILES: readonly BangsZoneProfile[] = [
  { zoneId: "leftOuter", labelKo: "좌외측 앞머리", labelEn: "Left Outer Bangs", surprisedLift: 4.2, surprisedPush: 3.1, angryLift: 1.0, angryPush: 1.6, angryPartX: -1.1, winkLeftPush: 4.8, winkRightPush: 0.4, happyPush: 2.6, sadLift: -1.4, sadPush: 1.5 },
  { zoneId: "leftBrow", labelKo: "좌눈썹 앞머리", labelEn: "Left Brow Bangs", surprisedLift: 7.4, surprisedPush: 5.8, angryLift: -2.8, angryPush: 3.9, angryPartX: -1.8, winkLeftPush: 5.6, winkRightPush: 0.6, happyPush: 1.9, sadLift: 2.2, sadPush: 3.2 },
  { zoneId: "centerGlabella", labelKo: "미간 중앙 앞머리", labelEn: "Glabella Center", surprisedLift: 6.2, surprisedPush: 4.9, angryLift: -4.2, angryPush: 6.4, angryPartX: 2.4, winkLeftPush: 1.4, winkRightPush: 1.4, happyPush: 1.2, sadLift: 3.8, sadPush: 4.1 },
  { zoneId: "rightBrow", labelKo: "우눈썹 앞머리", labelEn: "Right Brow Bangs", surprisedLift: 7.4, surprisedPush: 5.8, angryLift: -2.8, angryPush: 3.9, angryPartX: 1.8, winkLeftPush: 0.6, winkRightPush: 5.6, happyPush: 1.9, sadLift: 2.2, sadPush: 3.2 },
  { zoneId: "rightOuter", labelKo: "우외측 앞머리", labelEn: "Right Outer Bangs", surprisedLift: 4.2, surprisedPush: 3.1, angryLift: 1.0, angryPush: 1.6, angryPartX: 1.1, winkLeftPush: 0.4, winkRightPush: 4.8, happyPush: 2.6, sadLift: -1.4, sadPush: 1.5 },
];

/** ① 표정-헤어 간섭 회피 솔버: 눈썹·미간 돌출량에 연동해 앞머리 5구역 +Z 회피량과 좌우 벌림량을 산출한다. */
export function solveHairExpressionAvoidance(input: HairExpressionAvoidanceInput): HairExpressionAvoidanceResult {
  const surprised = clamp(input.weights.surprised ?? 0, 0, 1);
  const angry = clamp(input.weights.angry ?? 0, 0, 1);
  const winkLeft = clamp(input.weights.winkLeft ?? 0, 0, 1);
  const winkRight = clamp(input.weights.winkRight ?? 0, 0, 1);
  const happy = clamp(input.weights.happy ?? 0, 0, 1);
  const sad = clamp(input.weights.sad ?? 0, 0, 1);

  const baseClearance = clamp(input.baseClearanceMm ?? 2.0, 0.5, 8.0);
  const protrusionScale = clamp(input.browProtrusionScale ?? 1.0, 0.5, 2.0);
  const densityBoost = 1 + clamp(input.bangsDensity ?? 0.55, 0, 1) * 0.45;
  const strength = clamp(input.avoidanceStrength ?? 1.0, 0, 1);

  const entries: readonly [VrmExpressionPresetId, number][] = [
    ["surprised", surprised],
    ["angry", angry],
    ["winkLeft", winkLeft],
    ["winkRight", winkRight],
    ["happy", happy],
    ["sad", sad],
  ];
  let dominantExpression: VrmExpressionPresetId = "neutral";
  let dominantWeight = 0;
  for (const [id, w] of entries) {
    if (w > dominantWeight) {
      dominantWeight = w;
      dominantExpression = id;
    }
  }

  let maxZ = 0;
  let sumZ = 0;
  let overlapPreventedCount = 0;

  const zones: BangsZoneAvoidance[] = BANGS_ZONE_PROFILES.map((p) => {
    const browLiftMm =
      surprised * p.surprisedLift +
      angry * p.angryLift +
      sad * p.sadLift -
      (p.zoneId === "leftBrow" || p.zoneId === "leftOuter" ? winkLeft * 3.4 : 0) -
      (p.zoneId === "rightBrow" || p.zoneId === "rightOuter" ? winkRight * 3.4 : 0);

    const browForwardMm =
      (surprised * p.surprisedPush +
        angry * p.angryPush +
        winkLeft * p.winkLeftPush +
        winkRight * p.winkRightPush +
        happy * p.happyPush +
        sad * p.sadPush) *
      protrusionScale;

    const rawPenetrationMm = Math.max(0, browForwardMm * densityBoost);
    const zOffsetMm = rawPenetrationMm * strength;
    const xPartingOffsetMm =
      (angry * p.angryPartX +
        (p.zoneId === "leftBrow" ? -surprised * 0.7 : 0) +
        (p.zoneId === "rightBrow" ? surprised * 0.7 : 0)) *
      strength;

    const residualClearanceMm = baseClearance + zOffsetMm - rawPenetrationMm;
    const collisionResolved = residualClearanceMm >= baseClearance - 1e-4;
    if (rawPenetrationMm > 0.05 && collisionResolved) overlapPreventedCount += 1;
    if (zOffsetMm > maxZ) maxZ = zOffsetMm;
    sumZ += zOffsetMm;

    return {
      zoneId: p.zoneId,
      labelKo: p.labelKo,
      labelEn: p.labelEn,
      browLiftMm: roundTo(browLiftMm, 2),
      browForwardMm: roundTo(browForwardMm, 2),
      rawPenetrationMm: roundTo(rawPenetrationMm, 2),
      zOffsetMm: roundTo(zOffsetMm, 2),
      xPartingOffsetMm: roundTo(xPartingOffsetMm, 2),
      residualClearanceMm: roundTo(residualClearanceMm, 2),
      collisionResolved,
    };
  });

  const leftMean = ((zones[0]?.zOffsetMm ?? 0) + (zones[1]?.zOffsetMm ?? 0)) * 0.5;
  const rightMean = ((zones[3]?.zOffsetMm ?? 0) + (zones[4]?.zOffsetMm ?? 0)) * 0.5;
  const roundedMaxZ = roundTo(maxZ, 2);

  return {
    zones,
    maxZOffsetMm: roundedMaxZ,
    meanZOffsetMm: roundTo(sumZ / zones.length, 2),
    leftRightAsymmetryMm: roundTo(Math.abs(leftMean - rightMean), 2),
    dominantExpression,
    overlapPreventedCount,
    summaryKo:
      dominantExpression === "neutral"
        ? `기본 표정: 앞머리 5구역 기본 Z 여유(${baseClearance.toFixed(1)}mm) 유지 중`
        : `주 표정(${dominantExpression}) 연동: 최대 +${roundedMaxZ.toFixed(2)}mm 전방 회피 · ${overlapPreventedCount}개 구역 눈썹 겹침 방지 완료`,
    summaryEn:
      dominantExpression === "neutral"
        ? `Neutral pose: maintaining ${baseClearance.toFixed(1)}mm base bangs Z-clearance.`
        : `${dominantExpression} rig active: max +${roundedMaxZ.toFixed(2)}mm Z-avoidance across ${overlapPreventedCount} bangs zone(s).`,
  };
}

interface FabricWrinkleProfile {
  readonly labelKo: string;
  readonly labelEn: string;
  readonly normalGain: number;
  readonly inkGain: number;
  readonly foldDensity: number;
  readonly creaseSharpness: number;
}

const FABRIC_PROFILES: Record<GarmentFabricType, FabricWrinkleProfile> = {
  cotton: { labelKo: "면(코튼) 셔츠", labelEn: "Cotton Shirt", normalGain: 0.92, inkGain: 0.9, foldDensity: 1.0, creaseSharpness: 1.0 },
  denim: { labelKo: "데님 재킷", labelEn: "Denim Jacket", normalGain: 1.15, inkGain: 1.08, foldDensity: 0.72, creaseSharpness: 1.25 },
  silk: { labelKo: "실크 블라우스", labelEn: "Silk Blouse", normalGain: 0.76, inkGain: 0.74, foldDensity: 1.48, creaseSharpness: 0.78 },
  knit: { labelKo: "니트 가디건", labelEn: "Knit Cardigan", normalGain: 0.68, inkGain: 0.66, foldDensity: 0.64, creaseSharpness: 0.7 },
  blazer: { labelKo: "테일러드 블레이저", labelEn: "Tailored Blazer", normalGain: 0.98, inkGain: 0.96, foldDensity: 0.82, creaseSharpness: 1.12 },
};

interface WrinkleJointMeta {
  readonly jointId: WrinkleJointId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly maxAngleDeg: number;
  readonly baseFoldMax: number;
  readonly baseCreaseAngleDeg: number;
  readonly normalDirX: number;
  readonly normalDirY: number;
}

const WRINKLE_JOINT_METAS: readonly WrinkleJointMeta[] = [
  { jointId: "leftElbow", labelKo: "왼쪽 팔꿈치", labelEn: "Left Elbow", maxAngleDeg: 150, baseFoldMax: 7, baseCreaseAngleDeg: -22, normalDirX: -0.78, normalDirY: 0.62 },
  { jointId: "rightElbow", labelKo: "오른쪽 팔꿈치", labelEn: "Right Elbow", maxAngleDeg: 150, baseFoldMax: 7, baseCreaseAngleDeg: 22, normalDirX: 0.78, normalDirY: 0.62 },
  { jointId: "leftKnee", labelKo: "왼쪽 무릎", labelEn: "Left Knee", maxAngleDeg: 150, baseFoldMax: 8, baseCreaseAngleDeg: -14, normalDirX: -0.52, normalDirY: -0.85 },
  { jointId: "rightKnee", labelKo: "오른쪽 무릎", labelEn: "Right Knee", maxAngleDeg: 150, baseFoldMax: 8, baseCreaseAngleDeg: 14, normalDirX: 0.52, normalDirY: -0.85 },
  { jointId: "leftShoulder", labelKo: "왼쪽 어깨·겨드랑이", labelEn: "Left Shoulder", maxAngleDeg: 180, baseFoldMax: 6, baseCreaseAngleDeg: -38, normalDirX: -0.86, normalDirY: 0.51 },
  { jointId: "rightShoulder", labelKo: "오른쪽 어깨·겨드랑이", labelEn: "Right Shoulder", maxAngleDeg: 180, baseFoldMax: 6, baseCreaseAngleDeg: 38, normalDirX: 0.86, normalDirY: 0.51 },
];

/** ② 포즈 공간 의상 주름맵 매퍼: 관절 굴곡 각도에서 엄격 단조 증가하는 주름 노멀·선화 강도를 산출한다. */
export function computePoseSpaceWrinkleMap(input: PoseSpaceWrinkleInput): PoseSpaceWrinkleMapResult {
  const fabricType: GarmentFabricType = input.fabricType ?? "cotton";
  const fabric = FABRIC_PROFILES[fabricType];
  const tightnessScale = 0.75 + clamp(input.garmentTightness ?? 0.55, 0, 1) * 0.45;
  const inkStyleGain = clamp(input.inkStylizationGain ?? 1.0, 0.5, 1.5);

  const angleLookup: Record<WrinkleJointId, number> = {
    leftElbow: clamp(input.angles.leftElbowDeg ?? 0, 0, 150),
    rightElbow: clamp(input.angles.rightElbowDeg ?? 0, 0, 150),
    leftKnee: clamp(input.angles.leftKneeDeg ?? 0, 0, 150),
    rightKnee: clamp(input.angles.rightKneeDeg ?? 0, 0, 150),
    leftShoulder: clamp(input.angles.leftShoulderDeg ?? 0, 0, 180),
    rightShoulder: clamp(input.angles.rightShoulderDeg ?? 0, 0, 180),
  };

  let peakNormal = 0;
  let peakInk = 0;
  let totalFolds = 0;

  const joints: JointWrinkleChannel[] = WRINKLE_JOINT_METAS.map((meta) => {
    const angleDeg = angleLookup[meta.jointId];
    const u = clamp(angleDeg / meta.maxAngleDeg, 0, 1);
    const bendResponse = 0.22 * u + 0.78 * (u * u * (3 - 2 * u));
    const normalStrength = clamp(bendResponse * fabric.normalGain * tightnessScale * 0.92, 0, 1);
    const inkLineStrength = clamp(bendResponse * fabric.inkGain * inkStyleGain * 0.9, 0, 1);
    const compressionFoldWeight = clamp(bendResponse * (0.72 + 0.28 * fabric.creaseSharpness), 0, 1);
    const tensionCreaseWeight = clamp(bendResponse * 0.65 * tightnessScale, 0, 1);

    const xyTilt = normalStrength * 0.62;
    const rawNx = meta.normalDirX * xyTilt;
    const rawNy = meta.normalDirY * xyTilt;
    const rawNz = Math.sqrt(Math.max(0.04, 1 - rawNx * rawNx - rawNy * rawNy));
    const normLen = Math.hypot(rawNx, rawNy, rawNz) || 1;
    const tangentNormal: readonly [number, number, number] = [
      roundTo(rawNx / normLen, 5),
      roundTo(rawNy / normLen, 5),
      roundTo(rawNz / normLen, 5),
    ];

    const estimatedFoldLines =
      angleDeg <= 0 ? 0 : Math.max(1, Math.round(bendResponse * meta.baseFoldMax * fabric.foldDensity));
    if (normalStrength > peakNormal) peakNormal = normalStrength;
    if (inkLineStrength > peakInk) peakInk = inkLineStrength;
    totalFolds += estimatedFoldLines;

    return {
      jointId: meta.jointId,
      labelKo: meta.labelKo,
      labelEn: meta.labelEn,
      angleDeg: roundTo(angleDeg, 1),
      maxAngleDeg: meta.maxAngleDeg,
      normalizedBend: roundTo(u, 4),
      normalStrength: roundTo(normalStrength, 4),
      inkLineStrength: roundTo(inkLineStrength, 4),
      compressionFoldWeight: roundTo(compressionFoldWeight, 4),
      tensionCreaseWeight: roundTo(tensionCreaseWeight, 4),
      tangentNormal,
      primaryCreaseAngleDeg: roundTo(meta.baseCreaseAngleDeg * (0.5 + 0.5 * u), 1),
      inkLineWidthPx: angleDeg <= 0 ? 0 : roundTo(0.8 + inkLineStrength * 1.9, 2),
      estimatedFoldLines,
    };
  });

  const byId = (id: WrinkleJointId): number => joints.find((j) => j.jointId === id)?.normalStrength ?? 0;

  return {
    fabricType,
    fabricLabelKo: fabric.labelKo,
    fabricLabelEn: fabric.labelEn,
    joints,
    peakNormalStrength: roundTo(peakNormal, 4),
    peakInkLineStrength: roundTo(peakInk, 4),
    totalActiveFoldLines: totalFolds,
    shaderUniforms: {
      uWrinkleElbowL: byId("leftElbow"),
      uWrinkleElbowR: byId("rightElbow"),
      uWrinkleKneeL: byId("leftKnee"),
      uWrinkleKneeR: byId("rightKnee"),
      uWrinkleShoulderL: byId("leftShoulder"),
      uWrinkleShoulderR: byId("rightShoulder"),
      uWrinkleInkGain: roundTo(inkStyleGain * fabric.inkGain, 3),
    },
    summaryKo: `${fabric.labelKo} 기준: 최대 주름 노멀 ${(peakNormal * 100).toFixed(0)}% · 선화 강도 ${(peakInk * 100).toFixed(0)}% · 활성 주름 ${totalFolds}선`,
    summaryEn: `${fabric.labelEn}: peak normal ${(peakNormal * 100).toFixed(0)}% · ink ${(peakInk * 100).toFixed(0)}% · ${totalFolds} active fold lines`,
  };
}

export const DEFAULT_CHARACTER_OKLCH_PALETTE: readonly Omit<
  CharacterColorChip,
  "oklchCss" | "contrastVsWhite" | "printSafe"
>[] = [
  { id: "skin-base", roleKo: "피부 기본", roleEn: "Skin Base", oklch: { l: 0.87, c: 0.055, h: 52 } },
  { id: "skin-shadow", roleKo: "피부 음영", roleEn: "Skin Shadow", oklch: { l: 0.74, c: 0.085, h: 36 } },
  { id: "hair-main", roleKo: "메인 헤어", roleEn: "Hair Base", oklch: { l: 0.42, c: 0.072, h: 32 } },
  { id: "hair-ring", roleKo: "헤어 엔젤링", roleEn: "Angel Ring", oklch: { l: 0.68, c: 0.068, h: 42 } },
  { id: "iris-main", roleKo: "홍채 포인트", roleEn: "Iris Accent", oklch: { l: 0.48, c: 0.145, h: 254 } },
  { id: "outfit-primary", roleKo: "의상 주조", roleEn: "Primary Outfit", oklch: { l: 0.44, c: 0.095, h: 262 } },
  { id: "outfit-accent", roleKo: "의상 포인트", roleEn: "Outfit Accent", oklch: { l: 0.64, c: 0.148, h: 28 } },
  { id: "ink-outline", roleKo: "외곽선 잉크", roleEn: "Ink Outline", oklch: { l: 0.23, c: 0.025, h: 268 } },
];

export const OFFICIAL_12_EXPRESSION_PRESETS: readonly {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly weights: ExpressionBlendshapeWeights;
}[] = [
  { id: "expr-01-neutral", labelKo: "기본", labelEn: "Neutral", weights: {} },
  { id: "expr-02-smile", labelKo: "미소", labelEn: "Smile", weights: { happy: 0.65 } },
  { id: "expr-03-laugh", labelKo: "환한 웃음", labelEn: "Big Laugh", weights: { happy: 1.0 } },
  { id: "expr-04-surprised", labelKo: "놀람", labelEn: "Surprised", weights: { surprised: 0.9 } },
  { id: "expr-05-angry", labelKo: "화남", labelEn: "Angry", weights: { angry: 0.75 } },
  { id: "expr-06-furious", labelKo: "격노", labelEn: "Furious", weights: { angry: 1.0, surprised: 0.25 } },
  { id: "expr-07-sad", labelKo: "슬픔", labelEn: "Sad", weights: { sad: 0.75 } },
  { id: "expr-08-tearful", labelKo: "눈물", labelEn: "Tearful", weights: { sad: 1.0 } },
  { id: "expr-09-wink-left", labelKo: "왼쪽 윙크", labelEn: "Wink L", weights: { winkLeft: 0.95, happy: 0.35 } },
  { id: "expr-10-wink-right", labelKo: "오른쪽 윙크", labelEn: "Wink R", weights: { winkRight: 0.95, happy: 0.35 } },
  { id: "expr-11-flustered", labelKo: "당황", labelEn: "Flustered", weights: { surprised: 0.55, sad: 0.4 } },
  { id: "expr-12-determined", labelKo: "결의", labelEn: "Determined", weights: { angry: 0.45, happy: 0.2 } },
];

function buildMetricHeightRuler(heightCm: number, headRatio: number): MetricHeightRulerSpec {
  const safeHeight = roundTo(clamp(heightCm, 110, 220), 1);
  const safeRatio = roundTo(clamp(headRatio, 5.0, 9.0), 2);
  const ticks: MetricRulerTick[] = [];
  for (let cm = 0; cm <= Math.floor(safeHeight); cm += 10) {
    ticks.push({ cm, normalizedY: roundTo(1 - cm / safeHeight, 4), isMajor: cm % 20 === 0, label: `${cm}cm` });
  }
  const last = ticks[ticks.length - 1];
  if (!last || Math.abs(last.cm - safeHeight) > 0.4) {
    ticks.push({ cm: safeHeight, normalizedY: 0, isMajor: true, label: `${safeHeight}cm` });
  }

  const landmarkDefs: readonly [string, string, string, number][] = [
    ["crown", "정수리", "Crown", 1.0],
    ["eye", "눈높이", "Eye Line", 1 - 0.5 / safeRatio],
    ["chin", "턱선", "Chin", 1 - 1.0 / safeRatio],
    ["shoulder", "어깨", "Shoulder", 0.82],
    ["waist", "허리", "Waist", 0.62],
    ["knee", "무릎", "Knee", 0.28],
    ["sole", "발바닥", "Sole", 0.0],
  ];

  return {
    heightCm: safeHeight,
    headRatio: safeRatio,
    headHeightCm: roundTo(safeHeight / safeRatio, 1),
    stepCm: 10,
    ticks,
    landmarks: landmarkDefs.map(([id, labelKo, labelEn, ratio]) => ({
      id,
      labelKo,
      labelEn,
      cm: roundTo(safeHeight * ratio, 1),
      normalizedY: roundTo(1 - ratio, 4),
    })),
  };
}

function renderTurnaroundSheetSvg(spec: CharacterTurnaroundSheetSpec): string {
  const { width, height } = spec.canvas;
  const rulerX = 64;
  const rulerTop = 148;
  const rulerSpan = 712;

  const tickSvg = spec.ruler.ticks
    .map((tick) => {
      const y = roundTo(rulerTop + tick.normalizedY * rulerSpan, 1);
      const len = tick.isMajor ? 22 : 12;
      const lbl = tick.isMajor
        ? `<text x="${rulerX - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="oklch(0.38 0.02 260)">${escapeXml(tick.label)}</text>`
        : "";
      return `<line x1="${rulerX}" y1="${y}" x2="${rulerX + len}" y2="${y}" stroke="oklch(0.42 0.02 260)" stroke-width="${tick.isMajor ? 1.5 : 1}" />${lbl}`;
    })
    .join("");

  const landmarkSvg = spec.ruler.landmarks
    .map((lm) => {
      const y = roundTo(rulerTop + lm.normalizedY * rulerSpan, 1);
      return `<line x1="${rulerX + 26}" y1="${y}" x2="1088" y2="${y}" stroke="oklch(0.76 0.015 260)" stroke-dasharray="4 4" stroke-width="1" /><text x="1096" y="${y + 4}" font-size="10" fill="oklch(0.44 0.02 260)">${escapeXml(lm.labelKo)} ${lm.cm}cm</text>`;
    })
    .join("");

  const viewsSvg = spec.views
    .map((v) => {
      const cx = v.rect.x + v.rect.width * 0.5;
      return `<g data-view="${v.id}"><rect x="${v.rect.x}" y="${v.rect.y}" width="${v.rect.width}" height="${v.rect.height}" rx="12" fill="oklch(0.985 0.004 260)" stroke="oklch(0.84 0.015 260)" stroke-width="1.5" /><line x1="${cx}" y1="${v.rect.y + 28}" x2="${cx}" y2="${v.rect.y + v.rect.height - 24}" stroke="oklch(0.88 0.015 260)" stroke-dasharray="6 4" /><circle cx="${cx}" cy="${v.rect.y + 112}" r="42" fill="oklch(0.93 0.02 52)" stroke="oklch(0.45 0.04 260)" stroke-width="1.5" /><rect x="${cx - 46}" y="${v.rect.y + 164}" width="92" height="220" rx="28" fill="oklch(0.91 0.025 262)" stroke="oklch(0.45 0.04 260)" stroke-width="1.5" /><text x="${cx}" y="${v.rect.y + v.rect.height - 12}" text-anchor="middle" font-size="14" font-weight="600" fill="oklch(0.24 0.02 260)">${escapeXml(v.labelKo)} (${v.labelEn} · ${v.cameraYawDeg}°)</text></g>`;
    })
    .join("");

  const exprSvg = spec.expressions
    .map((s) => `<g data-expression="${s.id}"><rect x="${s.rect.x}" y="${s.rect.y}" width="${s.rect.width}" height="${s.rect.height}" rx="10" fill="oklch(0.985 0.004 260)" stroke="oklch(0.85 0.014 260)" /><circle cx="${s.rect.x + s.rect.width * 0.5}" cy="${s.rect.y + 44}" r="22" fill="oklch(0.93 0.02 52)" stroke="oklch(0.48 0.03 260)" /><text x="${s.rect.x + 10}" y="${s.rect.y + s.rect.height - 24}" font-size="12" font-weight="600" fill="oklch(0.24 0.02 260)">${String(s.index).padStart(2, "0")} ${escapeXml(s.labelKo)}</text><text x="${s.rect.x + 10}" y="${s.rect.y + s.rect.height - 9}" font-size="10" fill="oklch(0.46 0.02 260)">Z +${s.hairAvoidanceZMm.toFixed(1)}mm</text></g>`)
    .join("");

  const chipsSvg = spec.palette
    .map((chip, idx) => {
      const x = 104 + idx * 224;
      return `<g data-chip="${chip.id}"><rect x="${x}" y="918" width="212" height="104" rx="10" fill="oklch(0.99 0.003 260)" stroke="oklch(0.84 0.015 260)" /><rect x="${x + 10}" y="928" width="192" height="44" rx="6" fill="${chip.oklchCss}" stroke="oklch(0.76 0.01 260)" /><text x="${x + 12}" y="990" font-size="12" font-weight="600" fill="oklch(0.22 0.02 260)">${escapeXml(chip.roleKo)}</text><text x="${x + 12}" y="1008" font-size="10" fill="oklch(0.44 0.02 260)">${escapeXml(chip.oklchCss)}</text></g>`;
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(spec.characterName)} 공식 3면 캐릭터 설정집">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="oklch(0.97 0.005 85)" />`,
    `<rect x="32" y="28" width="${width - 64}" height="88" rx="14" fill="oklch(0.995 0.003 85)" stroke="oklch(0.84 0.015 260)" />`,
    `<text x="56" y="68" font-size="24" font-weight="700" fill="oklch(0.2 0.02 260)">${escapeXml(spec.characterName)} · 공식 3면 캐릭터 설정집</text>`,
    `<text x="56" y="96" font-size="14" fill="oklch(0.44 0.02 260)">${escapeXml(spec.seriesTitle)} | 코드 ${escapeXml(spec.characterCode)} | 신장 ${spec.ruler.heightCm}cm (${spec.ruler.headRatio}등신 · 1두신 ${spec.ruler.headHeightCm}cm)</text>`,
    `<line x1="${rulerX}" y1="${rulerTop}" x2="${rulerX}" y2="${rulerTop + rulerSpan}" stroke="oklch(0.32 0.02 260)" stroke-width="2" />`,
    tickSvg,
    landmarkSvg,
    viewsSvg,
    `<text x="1192" y="138" font-size="15" font-weight="700" fill="oklch(0.24 0.02 260)">공식 표정 슬롯 12종 (앞머리 Z 회피 연동)</text>`,
    exprSvg,
    `<text x="104" y="904" font-size="15" font-weight="700" fill="oklch(0.24 0.02 260)">OKLCH 공식 컬러 팔레트</text>`,
    chipsSvg,
    `</svg>`,
  ].join("");
}

/** ③ 원클릭 웹툰 공식 3면 캐릭터 설정집(SVG·JSON)을 생성한다. */
export function buildOfficialCharacterTurnaroundSheet(
  input: BuildTurnaroundSheetInput = {},
): CharacterTurnaroundSheetBundle {
  const characterName = (input.characterName ?? "서연(아틀리에 주인공)").trim() || "서연";
  const seriesTitle = (input.seriesTitle ?? "툰스튜디오 오리지널").trim() || "툰스튜디오";
  const characterCode = (input.characterCode ?? "TS-CHAR-001").trim() || "TS-CHAR-001";
  const ruler = buildMetricHeightRuler(input.heightCm ?? 168, input.headRatio ?? 7.5);

  const views: readonly TurnaroundViewSlot[] = [
    { id: "front", labelKo: "정면", labelEn: "Front", cameraYawDeg: 0, rect: { x: 108, y: 148, width: 312, height: 712 } },
    { id: "side", labelKo: "측면", labelEn: "Side", cameraYawDeg: 90, rect: { x: 438, y: 148, width: 312, height: 712 } },
    { id: "back", labelKo: "후면", labelEn: "Back", cameraYawDeg: 180, rect: { x: 768, y: 148, width: 312, height: 712 } },
  ];

  const expressions: readonly TurnaroundExpressionSlot[] = OFFICIAL_12_EXPRESSION_PRESETS.map((preset, idx) => {
    const avoidance = solveHairExpressionAvoidance({ weights: preset.weights });
    return {
      index: idx + 1,
      id: preset.id,
      labelKo: preset.labelKo,
      labelEn: preset.labelEn,
      weights: preset.weights,
      hairAvoidanceZMm: avoidance.maxZOffsetMm,
      rect: { x: 1192 + (idx % 3) * 232, y: 152 + Math.floor(idx / 3) * 178, width: 216, height: 162 },
    };
  });

  const sourceChips = input.colorChips && input.colorChips.length > 0 ? input.colorChips : DEFAULT_CHARACTER_OKLCH_PALETTE;
  const palette: readonly CharacterColorChip[] = sourceChips.map((chip) => {
    const l = roundTo(clamp(chip.oklch.l, 0, 1), 3);
    const c = roundTo(clamp(chip.oklch.c, 0, 0.4), 3);
    const h = roundTo(((chip.oklch.h % 360) + 360) % 360, 1);
    return {
      id: chip.id,
      roleKo: chip.roleKo,
      roleEn: chip.roleEn,
      oklch: { l, c, h },
      oklchCss: formatOklchToken({ l, c, h }),
      contrastVsWhite: roundTo(1.05 / (clamp(l ** 3, 0, 1) + 0.05), 2),
      printSafe: c <= 0.18 && l >= 0.12 && l <= 0.96,
    };
  });

  const spec: CharacterTurnaroundSheetSpec = {
    schemaVersion: "toonstudio.turnaround.v1",
    characterName,
    seriesTitle,
    characterCode,
    canvas: { width: 1920, height: 1080 },
    views,
    expressions,
    palette,
    ruler,
  };

  return { spec, json: JSON.stringify(spec, null, 2), svg: renderTurnaroundSheetSvg(spec) };
}
