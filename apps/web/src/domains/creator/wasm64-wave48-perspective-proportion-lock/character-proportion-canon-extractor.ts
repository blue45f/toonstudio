/**
 * 단일 2D 캐릭터 정면 시트 또는 등신대 프리셋으로부터 머리 높이(`headUnit`) 기준
 * 정규화 3D 캐논 랜드마크 비율·단면 링·허용 편차 테이블을 추출한다.
 *
 * 좌표계(glTF/Three.js 오른손 미터 단위): +X 캐릭터 좌측(화면 우측), +Y 위(0=발바닥), +Z 정면.
 */

export type ProportionCanonPresetId =
  | "daily-6-head"
  | "rofan-modern-7.5-head"
  | "action-8.5-head"
  | "sd-3-head";

export type CanonLandmarkId =
  | "crown" | "eyeLine" | "chin"
  | "shoulderCenter" | "shoulderLeft" | "shoulderRight"
  | "chest" | "waist"
  | "pelvisCenter" | "pelvisLeft" | "pelvisRight"
  | "kneeLeft" | "kneeRight" | "ankleLeft" | "ankleRight" | "footSole";

export type BodyProportionRegion = "head" | "shoulder" | "torso" | "pelvis" | "upperLeg" | "lowerLeg";
export type CrossSectionRingId = "head" | "ribcage" | "waist" | "pelvis";
export type ProportionMetricId =
  | "headHeight" | "shoulderWidth" | "torsoLength" | "pelvisWidth" | "lowerBodyLength" | "apparentHeadShare";

export interface Vec2 { readonly x: number; readonly y: number; }
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number; }

export interface ProportionToleranceRule {
  readonly metricId: ProportionMetricId;
  readonly labelKo: string;
  readonly warningPercent: number;
  readonly criticalPercent: number;
}

export interface CanonLandmark3D {
  readonly id: CanonLandmarkId;
  readonly labelKo: string;
  readonly region: BodyProportionRegion;
  /** 정수리(0)부터 발바닥(headCount)까지의 머리 높이 배수 */
  readonly headUnitsFromCrown: number;
  /** 발바닥(Y=0) 기준 머리 높이 단위 정규화 3D 좌표 */
  readonly positionHeadUnits: Vec3;
  /** 실세계 미터(1.0 = 1m) 단위 3D 좌표 */
  readonly positionMeters: Vec3;
}

export interface CanonCrossSectionRing3D {
  readonly id: CrossSectionRingId;
  readonly labelKo: string;
  readonly headUnitsFromCrown: number;
  readonly centerHeadUnits: Vec3;
  readonly centerMeters: Vec3;
  readonly radiusXHeadUnits: number;
  readonly radiusZHeadUnits: number;
  readonly radiusXMeters: number;
  readonly radiusZMeters: number;
  /** X축 기준 해부학적 기울기(도, 양수는 앞쪽 숙임) */
  readonly tiltXDeg: number;
}

export interface ProportionCanonPresetSpec {
  readonly id: ProportionCanonPresetId; readonly labelKo: string;
  readonly headCount: number; readonly defaultHeightMeters: number; readonly toleranceScale: number;
  readonly eyeFromCrownHeads: number;
  readonly shoulderFromCrownHeads: number; readonly shoulderWidthHeads: number;
  readonly chestFromCrownHeads: number; readonly chestWidthHeads: number; readonly chestDepthHeads: number;
  readonly waistFromCrownHeads: number; readonly waistWidthHeads: number; readonly waistDepthHeads: number;
  readonly pelvisFromCrownHeads: number; readonly pelvisWidthHeads: number; readonly pelvisDepthHeads: number;
  readonly kneeFromCrownHeads: number; readonly kneeStanceWidthHeads: number;
  readonly ankleFromCrownHeads: number; readonly ankleStanceWidthHeads: number;
}

export interface FrontCharacterSheetInput {
  readonly characterName?: string; readonly basePresetId?: ProportionCanonPresetId; readonly targetHeightMeters?: number;
  /** 2D 캔버스 기준(Y 아래로 증가) 정수리~발바닥 Y 및 좌우 폭 좌표 */
  readonly crownY: number; readonly eyeY?: number; readonly chinY: number;
  readonly shoulderY: number; readonly shoulderWidthPx?: number; readonly shoulderLeft?: Vec2; readonly shoulderRight?: Vec2;
  readonly chestY?: number; readonly chestWidthPx?: number;
  readonly waistY?: number; readonly waistWidthPx?: number;
  readonly pelvisY: number; readonly pelvisWidthPx?: number; readonly pelvisLeft?: Vec2; readonly pelvisRight?: Vec2;
  readonly kneeY?: number; readonly kneeStanceWidthPx?: number;
  readonly ankleY: number; readonly ankleStanceWidthPx?: number; readonly footSoleY?: number;
}

export interface CharacterProportionCanon {
  readonly source: "preset" | "front-sheet";
  readonly presetId: ProportionCanonPresetId; readonly labelKo: string; readonly characterName: string;
  readonly headCount: number; readonly totalHeightMeters: number;
  readonly headUnitMeters: number; readonly sheetHeadUnitPx: number | null;
  readonly ratiosInHeadUnits: {
    readonly eyeFromCrown: number; readonly chinFromCrown: number;
    readonly shoulderFromCrown: number; readonly shoulderWidth: number;
    readonly chestFromCrown: number; readonly chestWidth: number;
    readonly waistFromCrown: number; readonly waistWidth: number;
    readonly pelvisFromCrown: number; readonly pelvisWidth: number;
    readonly kneeFromCrown: number; readonly ankleFromCrown: number; readonly footSoleFromCrown: number;
  };
  readonly landmarks: readonly CanonLandmark3D[];
  readonly landmarkMap: Readonly<Record<CanonLandmarkId, CanonLandmark3D>>;
  readonly crossSectionRings: readonly CanonCrossSectionRing3D[];
  readonly toleranceTable: Readonly<Record<ProportionMetricId, ProportionToleranceRule>>;
}

export interface CanonInvariantReport {
  readonly valid: boolean;
  readonly violations: readonly string[];
}

export const PROPORTION_CANON_PRESETS: Readonly<Record<ProportionCanonPresetId, ProportionCanonPresetSpec>> = {
  "daily-6-head": {
    id: "daily-6-head", labelKo: "6등신 일상", headCount: 6.0, defaultHeightMeters: 1.62,
    eyeFromCrownHeads: 0.52, shoulderFromCrownHeads: 1.32, shoulderWidthHeads: 1.65,
    chestFromCrownHeads: 1.82, chestWidthHeads: 1.24, chestDepthHeads: 0.8,
    waistFromCrownHeads: 2.45, waistWidthHeads: 0.96, waistDepthHeads: 0.68,
    pelvisFromCrownHeads: 2.95, pelvisWidthHeads: 1.26, pelvisDepthHeads: 0.78,
    kneeFromCrownHeads: 4.42, kneeStanceWidthHeads: 0.64,
    ankleFromCrownHeads: 5.72, ankleStanceWidthHeads: 0.56, toleranceScale: 1.0,
  },
  "rofan-modern-7.5-head": {
    id: "rofan-modern-7.5-head", labelKo: "7.5등신 로판·현대극", headCount: 7.5, defaultHeightMeters: 1.74,
    eyeFromCrownHeads: 0.5, shoulderFromCrownHeads: 1.35, shoulderWidthHeads: 1.85,
    chestFromCrownHeads: 1.95, chestWidthHeads: 1.32, chestDepthHeads: 0.84,
    waistFromCrownHeads: 2.7, waistWidthHeads: 0.98, waistDepthHeads: 0.68,
    pelvisFromCrownHeads: 3.45, pelvisWidthHeads: 1.38, pelvisDepthHeads: 0.84,
    kneeFromCrownHeads: 5.45, kneeStanceWidthHeads: 0.68,
    ankleFromCrownHeads: 7.18, ankleStanceWidthHeads: 0.6, toleranceScale: 0.92,
  },
  "action-8.5-head": {
    id: "action-8.5-head", labelKo: "8.5등신 액션", headCount: 8.5, defaultHeightMeters: 1.87,
    eyeFromCrownHeads: 0.48, shoulderFromCrownHeads: 1.42, shoulderWidthHeads: 2.25,
    chestFromCrownHeads: 2.12, chestWidthHeads: 1.62, chestDepthHeads: 0.96,
    waistFromCrownHeads: 2.98, waistWidthHeads: 1.18, waistDepthHeads: 0.76,
    pelvisFromCrownHeads: 3.82, pelvisWidthHeads: 1.48, pelvisDepthHeads: 0.88,
    kneeFromCrownHeads: 6.15, kneeStanceWidthHeads: 0.78,
    ankleFromCrownHeads: 8.16, ankleStanceWidthHeads: 0.7, toleranceScale: 1.05,
  },
  "sd-3-head": {
    id: "sd-3-head", labelKo: "3등신 SD", headCount: 3.0, defaultHeightMeters: 0.9,
    eyeFromCrownHeads: 0.58, shoulderFromCrownHeads: 1.14, shoulderWidthHeads: 0.94,
    chestFromCrownHeads: 1.38, chestWidthHeads: 0.78, chestDepthHeads: 0.58,
    waistFromCrownHeads: 1.66, waistWidthHeads: 0.68, waistDepthHeads: 0.54,
    pelvisFromCrownHeads: 1.92, pelvisWidthHeads: 0.78, pelvisDepthHeads: 0.58,
    kneeFromCrownHeads: 2.46, kneeStanceWidthHeads: 0.42,
    ankleFromCrownHeads: 2.86, ankleStanceWidthHeads: 0.38, toleranceScale: 1.15,
  },
};

const BASE_TOLERANCE_RULES: readonly ProportionToleranceRule[] = [
  { metricId: "headHeight", labelKo: "머리 높이", warningPercent: 6, criticalPercent: 12 },
  { metricId: "shoulderWidth", labelKo: "어깨 너비", warningPercent: 8, criticalPercent: 15 },
  { metricId: "torsoLength", labelKo: "상체 길이", warningPercent: 7, criticalPercent: 14 },
  { metricId: "pelvisWidth", labelKo: "골반 너비", warningPercent: 8, criticalPercent: 15 },
  { metricId: "lowerBodyLength", labelKo: "하체 길이", warningPercent: 8, criticalPercent: 16 },
  { metricId: "apparentHeadShare", labelKo: "투영 등신 비중", warningPercent: 6, criticalPercent: 12 },
];

function assertFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} 값은 유한한 숫자여야 합니다.`);
  return value;
}

function roundTo(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function scaleVec3(v: Vec3, s: number): Vec3 {
  return { x: roundTo(v.x * s, 5), y: roundTo(v.y * s, 5), z: roundTo(v.z * s, 5) };
}

function inferClosestPresetId(headCount: number): ProportionCanonPresetId {
  let bestId: ProportionCanonPresetId = "rofan-modern-7.5-head";
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const preset of Object.values(PROPORTION_CANON_PRESETS)) {
    const delta = Math.abs(preset.headCount - headCount);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestId = preset.id;
    }
  }
  return bestId;
}

function buildToleranceTable(scale: number): Readonly<Record<ProportionMetricId, ProportionToleranceRule>> {
  return Object.fromEntries(
    BASE_TOLERANCE_RULES.map((rule) => [
      rule.metricId,
      {
        ...rule,
        warningPercent: roundTo(rule.warningPercent * scale, 2),
        criticalPercent: roundTo(rule.criticalPercent * scale, 2),
      },
    ]),
  ) as Readonly<Record<ProportionMetricId, ProportionToleranceRule>>;
}

function buildCanonFromSpec(
  source: "preset" | "front-sheet",
  spec: ProportionCanonPresetSpec,
  characterName: string,
  totalHeightMeters: number,
  sheetHeadUnitPx: number | null,
): CharacterProportionCanon {
  const headCount = assertFinite(spec.headCount, "headCount");
  if (headCount < 2.0 || headCount > 12.0) {
    throw new RangeError(`등신대(${headCount})는 2.0~12.0 범위여야 합니다.`);
  }
  if (!Number.isFinite(totalHeightMeters) || totalHeightMeters <= 0.3 || totalHeightMeters > 3.5) {
    throw new RangeError(`신장(${totalHeightMeters}m)은 0.3~3.5m 범위여야 합니다.`);
  }

  const headUnitMeters = totalHeightMeters / headCount;
  const yFromCrown = (heads: number): number => roundTo(headCount - heads, 5);
  const hs = spec.shoulderWidthHeads * 0.5;
  const hp = spec.pelvisWidthHeads * 0.5;
  const hk = spec.kneeStanceWidthHeads * 0.5;
  const ha = spec.ankleStanceWidthHeads * 0.5;

  const rawRows: ReadonlyArray<readonly [CanonLandmarkId, string, BodyProportionRegion, number, number, number]> = [
    ["crown", "정수리", "head", 0, 0, 0],
    ["eyeLine", "눈높이", "head", spec.eyeFromCrownHeads, 0, 0.32],
    ["chin", "턱 끝", "head", 1.0, 0, 0.28],
    ["shoulderCenter", "어깨 중심", "shoulder", spec.shoulderFromCrownHeads, 0, -0.02],
    ["shoulderLeft", "왼쪽 어깨", "shoulder", spec.shoulderFromCrownHeads, -hs, -0.02],
    ["shoulderRight", "오른쪽 어깨", "shoulder", spec.shoulderFromCrownHeads, hs, -0.02],
    ["chest", "가슴 중심", "torso", spec.chestFromCrownHeads, 0, 0.1],
    ["waist", "허리 중심", "torso", spec.waistFromCrownHeads, 0, 0.04],
    ["pelvisCenter", "골반 중심", "pelvis", spec.pelvisFromCrownHeads, 0, 0.02],
    ["pelvisLeft", "왼쪽 골반", "pelvis", spec.pelvisFromCrownHeads, -hp, 0.02],
    ["pelvisRight", "오른쪽 골반", "pelvis", spec.pelvisFromCrownHeads, hp, 0.02],
    ["kneeLeft", "왼쪽 무릎", "upperLeg", spec.kneeFromCrownHeads, -hk, 0.06],
    ["kneeRight", "오른쪽 무릎", "upperLeg", spec.kneeFromCrownHeads, hk, 0.06],
    ["ankleLeft", "왼쪽 발목", "lowerLeg", spec.ankleFromCrownHeads, -ha, 0],
    ["ankleRight", "오른쪽 발목", "lowerLeg", spec.ankleFromCrownHeads, ha, 0],
    ["footSole", "발바닥 기준점", "lowerLeg", headCount, 0, 0.04],
  ];

  const landmarks: CanonLandmark3D[] = rawRows.map(([id, labelKo, region, fromCrown, xH, zH]) => {
    const positionHeadUnits: Vec3 = { x: roundTo(xH, 5), y: yFromCrown(fromCrown), z: roundTo(zH, 5) };
    return {
      id, labelKo, region,
      headUnitsFromCrown: roundTo(fromCrown, 5),
      positionHeadUnits,
      positionMeters: scaleVec3(positionHeadUnits, headUnitMeters),
    };
  });
  const landmarkMap = Object.fromEntries(landmarks.map((l) => [l.id, l])) as Readonly<Record<CanonLandmarkId, CanonLandmark3D>>;

  const ringRows: ReadonlyArray<readonly [CrossSectionRingId, string, number, number, number, number, number]> = [
    ["head", "두부 단면 링", spec.eyeFromCrownHeads, 0.72, 0.84, 0.05, 0],
    ["ribcage", "흉곽 단면 링", spec.chestFromCrownHeads, spec.chestWidthHeads, spec.chestDepthHeads, 0.04, -4],
    ["waist", "허리 단면 링", spec.waistFromCrownHeads, spec.waistWidthHeads, spec.waistDepthHeads, 0.02, 0],
    ["pelvis", "골반 단면 링", spec.pelvisFromCrownHeads, spec.pelvisWidthHeads, spec.pelvisDepthHeads, 0.02, 6],
  ];
  const crossSectionRings: CanonCrossSectionRing3D[] = ringRows.map(([id, labelKo, fromCrown, wH, dH, zOff, tiltXDeg]) => {
    const centerHeadUnits: Vec3 = { x: 0, y: yFromCrown(fromCrown), z: zOff };
    const radiusXHeadUnits = roundTo(wH * 0.5, 5);
    const radiusZHeadUnits = roundTo(dH * 0.5, 5);
    return {
      id, labelKo, headUnitsFromCrown: roundTo(fromCrown, 5),
      centerHeadUnits, centerMeters: scaleVec3(centerHeadUnits, headUnitMeters),
      radiusXHeadUnits, radiusZHeadUnits,
      radiusXMeters: roundTo(radiusXHeadUnits * headUnitMeters, 5),
      radiusZMeters: roundTo(radiusZHeadUnits * headUnitMeters, 5),
      tiltXDeg,
    };
  });

  return {
    source, presetId: spec.id, labelKo: spec.labelKo, characterName,
    headCount: roundTo(headCount, 4),
    totalHeightMeters: roundTo(totalHeightMeters, 4),
    headUnitMeters: roundTo(headUnitMeters, 5),
    sheetHeadUnitPx,
    ratiosInHeadUnits: {
      eyeFromCrown: roundTo(spec.eyeFromCrownHeads, 4),
      chinFromCrown: 1.0,
      shoulderFromCrown: roundTo(spec.shoulderFromCrownHeads, 4),
      shoulderWidth: roundTo(spec.shoulderWidthHeads, 4),
      chestFromCrown: roundTo(spec.chestFromCrownHeads, 4),
      chestWidth: roundTo(spec.chestWidthHeads, 4),
      waistFromCrown: roundTo(spec.waistFromCrownHeads, 4),
      waistWidth: roundTo(spec.waistWidthHeads, 4),
      pelvisFromCrown: roundTo(spec.pelvisFromCrownHeads, 4),
      pelvisWidth: roundTo(spec.pelvisWidthHeads, 4),
      kneeFromCrown: roundTo(spec.kneeFromCrownHeads, 4),
      ankleFromCrown: roundTo(spec.ankleFromCrownHeads, 4),
      footSoleFromCrown: roundTo(headCount, 4),
    },
    landmarks, landmarkMap, crossSectionRings,
    toleranceTable: buildToleranceTable(spec.toleranceScale),
  };
}

/** 등신대 프리셋(`6등신 일상`, `7.5등신 로판·현대극`, `8.5등신 액션`, `3등신 SD`)에서 3D 캐논을 생성한다. */
export function createProportionCanonFromPreset(
  presetId: ProportionCanonPresetId,
  options: { readonly characterName?: string; readonly targetHeightMeters?: number } = {},
): CharacterProportionCanon {
  const spec = PROPORTION_CANON_PRESETS[presetId];
  return buildCanonFromSpec(
    "preset",
    spec,
    options.characterName ?? spec.labelKo,
    options.targetHeightMeters ?? spec.defaultHeightMeters,
    null,
  );
}

function resolveSpanWidthPx(explicitPx: number | undefined, left: Vec2 | undefined, right: Vec2 | undefined): number | undefined {
  if (explicitPx !== undefined) {
    if (assertFinite(explicitPx, "widthPx") <= 0) throw new RangeError("폭(px)은 0보다 커야 합니다.");
    return explicitPx;
  }
  if (left && right) {
    const dist = Math.hypot(assertFinite(right.x, "right.x") - assertFinite(left.x, "left.x"), assertFinite(right.y, "right.y") - assertFinite(left.y, "left.y"));
    if (dist <= 0) throw new RangeError("좌우 랜드마크 거리는 0보다 커야 합니다.");
    return dist;
  }
  return undefined;
}

/** 단일 2D 정면 캐릭터 시트 좌표에서 머리 높이(`headUnit`) 기준 정규화 3D 캐논을 추출한다. */
export function extractProportionCanonFromFrontSheet(sheet: FrontCharacterSheetInput): CharacterProportionCanon {
  const crownY = assertFinite(sheet.crownY, "crownY");
  const chinY = assertFinite(sheet.chinY, "chinY");
  const shoulderY = assertFinite(sheet.shoulderY, "shoulderY");
  const pelvisY = assertFinite(sheet.pelvisY, "pelvisY");
  const ankleY = assertFinite(sheet.ankleY, "ankleY");

  const headUnitPx = chinY - crownY;
  if (headUnitPx <= 0) {
    throw new RangeError("턱 Y 좌표(chinY)는 정수리 Y 좌표(crownY)보다 아래에 있어야 합니다.");
  }

  const prelimPreset = PROPORTION_CANON_PRESETS[
    sheet.basePresetId ?? inferClosestPresetId(((ankleY - crownY) / headUnitPx) / 0.955)
  ];
  const footSoleY = sheet.footSoleY !== undefined
    ? assertFinite(sheet.footSoleY, "footSoleY")
    : ankleY + (prelimPreset.headCount - prelimPreset.ankleFromCrownHeads) * headUnitPx;
  const headCount = (footSoleY - crownY) / headUnitPx;
  const prior = PROPORTION_CANON_PRESETS[sheet.basePresetId ?? inferClosestPresetId(headCount)];

  const toHeads = (y: number | undefined, fallback: number): number =>
    y !== undefined ? (assertFinite(y, "landmarkY") - crownY) / headUnitPx : fallback;

  const eyeHeads = toHeads(sheet.eyeY, prior.eyeFromCrownHeads);
  const shoulderHeads = (shoulderY - crownY) / headUnitPx;
  const pelvisHeads = (pelvisY - crownY) / headUnitPx;
  const ankleHeads = (ankleY - crownY) / headUnitPx;
  const chestHeads = toHeads(sheet.chestY, shoulderHeads + (pelvisHeads - shoulderHeads) * 0.28);
  const waistHeads = toHeads(sheet.waistY, shoulderHeads + (pelvisHeads - shoulderHeads) * 0.64);
  const kneeHeads = toHeads(sheet.kneeY, pelvisHeads + (ankleHeads - pelvisHeads) * 0.53);

  const verticalOrder = [
    ["crown", 0], ["eyeLine", eyeHeads], ["chin", 1.0], ["shoulder", shoulderHeads],
    ["chest", chestHeads], ["waist", waistHeads], ["pelvis", pelvisHeads],
    ["knee", kneeHeads], ["ankle", ankleHeads], ["footSole", headCount],
  ] as const;
  for (let i = 1; i < verticalOrder.length; i += 1) {
    const prev = verticalOrder[i - 1];
    const curr = verticalOrder[i];
    if (prev && curr && curr[1] <= prev[1]) {
      throw new RangeError(`정면 시트 세로 순서가 어긋났습니다: ${prev[0]}(${roundTo(prev[1], 3)}) < ${curr[0]}(${roundTo(curr[1], 3)})`);
    }
  }

  const shoulderPx = resolveSpanWidthPx(sheet.shoulderWidthPx, sheet.shoulderLeft, sheet.shoulderRight);
  const pelvisPx = resolveSpanWidthPx(sheet.pelvisWidthPx, sheet.pelvisLeft, sheet.pelvisRight);
  const shoulderW = shoulderPx !== undefined ? shoulderPx / headUnitPx : prior.shoulderWidthHeads;
  const pelvisW = pelvisPx !== undefined ? pelvisPx / headUnitPx : prior.pelvisWidthHeads;
  const chestW = sheet.chestWidthPx !== undefined
    ? assertFinite(sheet.chestWidthPx, "chestWidthPx") / headUnitPx
    : shoulderW * (prior.chestWidthHeads / prior.shoulderWidthHeads);
  const waistW = sheet.waistWidthPx !== undefined
    ? assertFinite(sheet.waistWidthPx, "waistWidthPx") / headUnitPx
    : pelvisW * (prior.waistWidthHeads / prior.pelvisWidthHeads);

  const extractedSpec: ProportionCanonPresetSpec = {
    ...prior,
    headCount, eyeFromCrownHeads: eyeHeads, shoulderFromCrownHeads: shoulderHeads, shoulderWidthHeads: shoulderW,
    chestFromCrownHeads: chestHeads, chestWidthHeads: chestW, chestDepthHeads: prior.chestDepthHeads * (chestW / prior.chestWidthHeads),
    waistFromCrownHeads: waistHeads, waistWidthHeads: waistW, waistDepthHeads: prior.waistDepthHeads * (waistW / prior.waistWidthHeads),
    pelvisFromCrownHeads: pelvisHeads, pelvisWidthHeads: pelvisW, pelvisDepthHeads: prior.pelvisDepthHeads * (pelvisW / prior.pelvisWidthHeads),
    kneeFromCrownHeads: kneeHeads,
    kneeStanceWidthHeads: sheet.kneeStanceWidthPx !== undefined ? assertFinite(sheet.kneeStanceWidthPx, "kneeStanceWidthPx") / headUnitPx : prior.kneeStanceWidthHeads,
    ankleFromCrownHeads: ankleHeads,
    ankleStanceWidthHeads: sheet.ankleStanceWidthPx !== undefined ? assertFinite(sheet.ankleStanceWidthPx, "ankleStanceWidthPx") / headUnitPx : prior.ankleStanceWidthHeads,
  };

  return buildCanonFromSpec(
    "front-sheet",
    extractedSpec,
    sheet.characterName ?? `${prior.labelKo} 추출 시트`,
    sheet.targetHeightMeters ?? prior.defaultHeightMeters,
    roundTo(headUnitPx, 4),
  );
}

/** 추출된 3D 캐논의 바닥 접지(Y=0)·좌우 대칭·1등신 턱·양수 단면 반경 불변량을 검증한다. */
export function verifyProportionCanonInvariants(canon: CharacterProportionCanon): CanonInvariantReport {
  const violations: string[] = [];
  if (Math.abs(canon.landmarkMap.footSole.positionMeters.y) > 1e-4) {
    violations.push("발바닥 기준점(footSole)의 Y 좌표가 바닥면(0m)에 접지되지 않았습니다.");
  }
  if (Math.abs(canon.landmarkMap.crown.positionMeters.y - canon.totalHeightMeters) > 1e-3) {
    violations.push("정수리 Y 높이가 캐릭터 전체 신장(totalHeightMeters)과 일치하지 않습니다.");
  }
  if (Math.abs(canon.landmarkMap.chin.headUnitsFromCrown - 1.0) > 1e-4) {
    violations.push("턱 끝(chin)이 정확히 1.0 headUnit 기준에 위치하지 않습니다.");
  }
  const pairs: readonly (readonly [CanonLandmarkId, CanonLandmarkId])[] = [
    ["shoulderLeft", "shoulderRight"], ["pelvisLeft", "pelvisRight"],
    ["kneeLeft", "kneeRight"], ["ankleLeft", "ankleRight"],
  ];
  for (const [lId, rId] of pairs) {
    const l = canon.landmarkMap[lId];
    const r = canon.landmarkMap[rId];
    if (Math.abs(l.positionMeters.x + r.positionMeters.x) > 1e-4) violations.push(`${lId}/${rId} 좌우 X 대칭이 어긋났습니다.`);
    if (Math.abs(l.positionMeters.y - r.positionMeters.y) > 1e-4) violations.push(`${lId}/${rId} 좌우 Y 높이가 일치하지 않습니다.`);
  }
  for (const ring of canon.crossSectionRings) {
    if (ring.radiusXMeters <= 0 || ring.radiusZMeters <= 0) violations.push(`${ring.labelKo} 반경이 0 이하입니다.`);
  }
  return { valid: violations.length === 0, violations };
}
