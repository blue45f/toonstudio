/**
 * Wave 37: 에피소드 전 컷 캐릭터 설정집(Model Sheet) 및 비대칭 특징 일관성 가드.
 *
 * 컷 간 일관성 검증 항목:
 * 1. 비대칭 표식 위치(`left`/`right` 점·흉터·안대·가르마 등): 카메라 수평 회전각(`cameraYawDeg`)에 따른
 *    정면 반구(`|yaw| < 90°`)·후면 반구(`|yaw| > 90°`) 투영 전환과 측면 차폐, 실수로 적용된 좌우 반전(`mirror-flip`) 감지
 * 2. 의상 대표 색상 OKLab 지각 색차(`deltaE`) 편차 상한 검증
 * 3. 필수 착용 소품(안경·머리핀·무기집 등) 누락 검증(후면 시점 자연 차폐 예외 지원)
 * 4. 캐릭터 두신비(`headHeightPx / bodyHeightPx`) 상·하한 범위 검증
 */

/** 의상 부위별 허용 기본 OKLab 지각 색차 상한(`0.045`). */
export const DEFAULT_MAX_OUTFIT_OKLAB_DELTA_E = 0.045 as const;
/** 후면 시점 소품 자연 차폐를 인정하는 최소 카메라 절대 회전각(`120°`). */
export const REAR_VIEW_OCCLUSION_YAW_DEG = 120 as const;
/** 측면 프로필에서 반대편 뺨·눈 비대칭 표식이 가려지는 임계 회전각(`75°`). */
export const PROFILE_OPPOSITE_CHEEK_OCCLUSION_YAW_DEG = 75 as const;

/** 캐릭터 신체 기준 해부학적 좌우(`"left"`=캐릭터의 왼편, `"right"`=캐릭터의 오른편). */
export type AnatomicalSide = "left" | "right";
/** 렌더링된 컷 화면 기준 좌우(`"left"`=화면 왼쪽 `-X`, `"right"`=화면 오른쪽 `+X`). */
export type ScreenHorizontalSide = "left" | "right";

export type AsymmetricFeatureKind =
  | "mole"
  | "scar"
  | "eyepatch"
  | "hair-parting"
  | "earring"
  | "tattoo";

export type ModelSheetViolationKind =
  | "asymmetric-mark-side-mismatch"
  | "asymmetric-mark-occluded-in-profile"
  | "outfit-color-drift"
  | "missing-required-accessory"
  | "proportion-out-of-bounds";

export interface ModelSheetSrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface OklabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface CanonicalAsymmetricFeature {
  readonly featureId: string;
  readonly kind: AsymmetricFeatureKind;
  readonly labelKo: string;
  readonly anatomicalSide: AnatomicalSide;
  /** 정수리 가르마·전신 실루엣처럼 측면 프로필에서도 가려지지 않는 특징이면 `false`. 기본값 `true`(얼굴·뺨 측면 차폐 적용). */
  readonly occludedOnOppositeProfile?: boolean;
}

export interface CanonicalOutfitColorSlot {
  readonly slotId: string;
  readonly labelKo: string;
  readonly canonicalSrgb: ModelSheetSrgbColor;
  readonly maxOklabDeltaE?: number;
}

export interface CanonicalAccessorySpec {
  readonly accessoryId: string;
  readonly labelKo: string;
  /** `true`면 `|cameraYawDeg| >= 120°` 후면 컷에서 보이지 않아도 정상으로 인정한다. */
  readonly allowRearViewOcclusion?: boolean;
}

export interface HeadToBodyProportionBounds {
  readonly minHeadToBodyRatio: number;
  readonly maxHeadToBodyRatio: number;
}

export interface CharacterModelSheetSpec {
  readonly characterId: string;
  readonly nameKo: string;
  readonly asymmetricFeatures: readonly CanonicalAsymmetricFeature[];
  readonly outfitColorSlots: readonly CanonicalOutfitColorSlot[];
  readonly requiredAccessories: readonly CanonicalAccessorySpec[];
  readonly proportionBounds: HeadToBodyProportionBounds;
}

export interface ObservedAsymmetricFeature {
  readonly featureId: string;
  readonly observedScreenSide: ScreenHorizontalSide;
}

export interface ObservedOutfitColorSample {
  readonly slotId: string;
  readonly observedSrgb: ModelSheetSrgbColor;
}

export interface CharacterCutAppearance {
  readonly cutId: string;
  readonly cutOrder: number;
  readonly characterId: string;
  /**
   * 캐릭터 정면 기준 카메라 수평 회전각(`0°`=정면, `+90°`=캐릭터 왼뺨 정측면, `-90°`=캐릭터 오른뺨 정측면, `±180°`=정후면).
   */
  readonly cameraYawDeg: number;
  /** 레이어 좌우 반전(`scaleX = -1`)이 적용된 상태인지 여부. */
  readonly horizontalMirrorApplied?: boolean;
  readonly observedAsymmetricFeatures: readonly ObservedAsymmetricFeature[];
  readonly observedOutfitColors: readonly ObservedOutfitColorSample[];
  readonly presentAccessoryIds: readonly string[];
  readonly headHeightPx?: number;
  readonly bodyHeightPx?: number;
  /** 클로즈업·바스트샷처럼 전신 비율 측정 대상이 아닌 컷이면 `false`. 기본값 `true`. */
  readonly fullBodyFramed?: boolean;
}

export interface EpisodeModelSheetAuditInput {
  readonly modelSheets: readonly CharacterModelSheetSpec[];
  readonly cutAppearances: readonly CharacterCutAppearance[];
  readonly defaultMaxOutfitOklabDeltaE?: number;
}

export interface ProjectedTraitVisibility {
  readonly expectedScreenSide: ScreenHorizontalSide;
  readonly occludedByOppositeProfile: boolean;
  readonly isRearHemisphere: boolean;
}

export interface ModelSheetConsistencyViolation {
  readonly violationId: string;
  readonly cutId: string;
  readonly cutOrder: number;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly kind: ModelSheetViolationKind;
  readonly targetId: string;
  readonly suspectedMirrorFlip: boolean;
  readonly summaryKo: string;
  readonly observedMetric?: number;
  readonly limitMetric?: number;
}

export interface CharacterConsistencySummary {
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly appearanceCount: number;
  readonly violationCount: number;
  readonly mirrorFlipAlertCount: number;
  readonly maxObservedOutfitDeltaE: number;
}

export interface EpisodeModelSheetConsistencyReport {
  readonly consistent: boolean;
  readonly totalCutsChecked: number;
  readonly totalAppearancesChecked: number;
  readonly violations: readonly ModelSheetConsistencyViolation[];
  readonly characterSummaries: readonly CharacterConsistencySummary[];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function srgb8ToLinear(channel255: number): number {
  const normalized = clamp(channel255 / 255, 0, 1);
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

/** 임의의 수평 회전각(도)을 `(-180, 180]` 범위로 정규화한다. */
export function normalizeSignedYawDeg(yawDeg: number): number {
  if (!Number.isFinite(yawDeg)) return 0;
  let wrapped = ((yawDeg % 360) + 360) % 360;
  if (wrapped > 180) wrapped -= 360;
  return wrapped === 0 ? 0 : wrapped;
}

/** sRGB(`0..255`) 색상을 Björn Ottosson 표준 OKLab 지각 색공간으로 변환한다. */
export function srgbToOklab(color: ModelSheetSrgbColor): OklabColor {
  const r = srgb8ToLinear(color.r);
  const g = srgb8ToLinear(color.g);
  const b = srgb8ToLinear(color.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

/** 두 sRGB 색상 사이의 OKLab 유클리드 지각 색차(`deltaE`)를 계산한다. */
export function computeOklabDeltaE(
  colorA: ModelSheetSrgbColor,
  colorB: ModelSheetSrgbColor,
): number {
  const labA = srgbToOklab(colorA);
  const labB = srgbToOklab(colorB);
  return Math.hypot(labA.l - labB.l, labA.a - labB.a, labA.b - labB.b);
}

/**
 * 해부학적 좌우(`anatomicalSide`)와 카메라 수평 회전각(`cameraYawDeg`)으로부터
 * 화면상 기대 좌우 위치와 반대쪽 뺨 측면 차폐 여부를 산출한다.
 */
export function projectCanonicalScreenSide(
  anatomicalSide: AnatomicalSide,
  cameraYawDeg: number,
  occludedOnOppositeProfile = true,
): ProjectedTraitVisibility {
  const yaw = normalizeSignedYawDeg(cameraYawDeg);
  const absYaw = Math.abs(yaw);
  const isRearHemisphere = absYaw > 90;

  // 정면 반구(`|yaw| <= 90°`): 캐릭터의 왼편은 관찰자 화면 오른쪽, 오른편은 화면 왼쪽에 놓인다.
  // 후면 반구(`|yaw| > 90°`): 등을 보이므로 캐릭터의 왼편이 화면 왼쪽, 오른편이 화면 오른쪽에 놓인다.
  const expectedScreenSide: ScreenHorizontalSide = isRearHemisphere
    ? anatomicalSide
    : anatomicalSide === "left"
      ? "right"
      : "left";

  const inProfileZone =
    absYaw >= PROFILE_OPPOSITE_CHEEK_OCCLUSION_YAW_DEG
    && absYaw <= 180 - PROFILE_OPPOSITE_CHEEK_OCCLUSION_YAW_DEG;

  const oppositeSideTurnedAway =
    (yaw > 0 && anatomicalSide === "right") || (yaw < 0 && anatomicalSide === "left");

  return {
    expectedScreenSide,
    occludedByOppositeProfile: occludedOnOppositeProfile && inProfileZone && oppositeSideTurnedAway,
    isRearHemisphere,
  };
}

/**
 * 비대칭 표식을 다시 그리지 않은 채 2D 캐릭터 레이어를 좌우 반전했을 때의 컷 외형을 시뮬레이션한다.
 */
export function simulateHorizontalMirrorCutAppearance(
  appearance: CharacterCutAppearance,
): CharacterCutAppearance {
  return {
    ...appearance,
    cameraYawDeg: normalizeSignedYawDeg(-appearance.cameraYawDeg),
    horizontalMirrorApplied: true,
    observedAsymmetricFeatures: appearance.observedAsymmetricFeatures.map((feat) => ({
      ...feat,
      observedScreenSide: feat.observedScreenSide === "left" ? "right" : "left",
    })),
  };
}

/**
 * 에피소드 전 컷의 캐릭터 등장 데이터를 공식 설정집(Model Sheet)과 대조해 일관성을 검증한다.
 */
export function verifyEpisodeModelSheetConsistency(
  input: EpisodeModelSheetAuditInput,
): EpisodeModelSheetConsistencyReport {
  const defaultMaxDeltaE = input.defaultMaxOutfitOklabDeltaE ?? DEFAULT_MAX_OUTFIT_OKLAB_DELTA_E;
  const sheetMap = new Map<string, CharacterModelSheetSpec>();
  for (const sheet of input.modelSheets) {
    sheetMap.set(sheet.characterId, sheet);
  }

  const violations: ModelSheetConsistencyViolation[] = [];
  const cutIdSet = new Set<string>();
  const summaryAccum = new Map<
    string,
    {
      nameKo: string;
      appearances: number;
      violations: number;
      mirrorAlerts: number;
      maxDeltaE: number;
    }
  >();

  for (const sheet of input.modelSheets) {
    summaryAccum.set(sheet.characterId, {
      nameKo: sheet.nameKo,
      appearances: 0,
      violations: 0,
      mirrorAlerts: 0,
      maxDeltaE: 0,
    });
  }

  for (const appearance of input.cutAppearances) {
    cutIdSet.add(appearance.cutId);
    const sheet = sheetMap.get(appearance.characterId);
    if (!sheet) continue;

    const acc = summaryAccum.get(sheet.characterId);
    if (acc) acc.appearances += 1;

    const canonicalFeatureMap = new Map<string, CanonicalAsymmetricFeature>();
    for (const feat of sheet.asymmetricFeatures) {
      canonicalFeatureMap.set(feat.featureId, feat);
    }

    // 좌우 반전 의심 판정: 레이어 반전 플래그가 켜져 있거나 관찰된 비대칭 표식 다수가 기대 좌우와 정반대인 경우
    let comparableTraitCount = 0;
    let invertedTraitCount = 0;
    for (const obs of appearance.observedAsymmetricFeatures) {
      const spec = canonicalFeatureMap.get(obs.featureId);
      if (!spec) continue;
      const proj = projectCanonicalScreenSide(
        spec.anatomicalSide,
        appearance.cameraYawDeg,
        spec.occludedOnOppositeProfile ?? true,
      );
      if (!proj.occludedByOppositeProfile) {
        comparableTraitCount += 1;
        if (obs.observedScreenSide !== proj.expectedScreenSide) {
          invertedTraitCount += 1;
        }
      }
    }

    const mirrorSignatureDetected =
      appearance.horizontalMirrorApplied === true
      || (comparableTraitCount > 0 && invertedTraitCount === comparableTraitCount);

    // 1. 비대칭 표식 방향 및 측면 차폐 검사
    for (const obs of appearance.observedAsymmetricFeatures) {
      const spec = canonicalFeatureMap.get(obs.featureId);
      if (!spec) continue;
      const proj = projectCanonicalScreenSide(
        spec.anatomicalSide,
        appearance.cameraYawDeg,
        spec.occludedOnOppositeProfile ?? true,
      );

      if (proj.occludedByOppositeProfile) {
        violations.push({
          violationId: `msv-${appearance.cutId}-${sheet.characterId}-occluded-${spec.featureId}`,
          cutId: appearance.cutId,
          cutOrder: appearance.cutOrder,
          characterId: sheet.characterId,
          characterNameKo: sheet.nameKo,
          kind: "asymmetric-mark-occluded-in-profile",
          targetId: spec.featureId,
          suspectedMirrorFlip: appearance.horizontalMirrorApplied === true,
          summaryKo: `${sheet.nameKo}의 ${spec.labelKo}(신체 ${spec.anatomicalSide === "left" ? "왼쪽" : "오른쪽"})은 현재 측면 각도(${appearance.cameraYawDeg}°)에서 반대편으로 가려져 보여서는 안 됩니다.`,
        });
        if (acc) {
          acc.violations += 1;
          if (appearance.horizontalMirrorApplied === true) acc.mirrorAlerts += 1;
        }
        continue;
      }

      if (obs.observedScreenSide !== proj.expectedScreenSide) {
        violations.push({
          violationId: `msv-${appearance.cutId}-${sheet.characterId}-side-${spec.featureId}`,
          cutId: appearance.cutId,
          cutOrder: appearance.cutOrder,
          characterId: sheet.characterId,
          characterNameKo: sheet.nameKo,
          kind: "asymmetric-mark-side-mismatch",
          targetId: spec.featureId,
          suspectedMirrorFlip: mirrorSignatureDetected,
          summaryKo: `${sheet.nameKo}의 ${spec.labelKo} 위치가 반전되었습니다(기대 화면 ${proj.expectedScreenSide}, 실제 ${obs.observedScreenSide}${mirrorSignatureDetected ? " · 좌우 반전 의심" : ""}).`,
        });
        if (acc) {
          acc.violations += 1;
          if (mirrorSignatureDetected) acc.mirrorAlerts += 1;
        }
      }
    }

    // 2. 의상 OKLab 색차 검사
    const slotMap = new Map<string, CanonicalOutfitColorSlot>();
    for (const slot of sheet.outfitColorSlots) {
      slotMap.set(slot.slotId, slot);
    }

    for (const sample of appearance.observedOutfitColors) {
      const slot = slotMap.get(sample.slotId);
      if (!slot) continue;
      const deltaE = computeOklabDeltaE(slot.canonicalSrgb, sample.observedSrgb);
      const maxAllowed = slot.maxOklabDeltaE ?? defaultMaxDeltaE;
      if (acc && deltaE > acc.maxDeltaE) {
        acc.maxDeltaE = deltaE;
      }
      if (deltaE > maxAllowed) {
        violations.push({
          violationId: `msv-${appearance.cutId}-${sheet.characterId}-color-${slot.slotId}`,
          cutId: appearance.cutId,
          cutOrder: appearance.cutOrder,
          characterId: sheet.characterId,
          characterNameKo: sheet.nameKo,
          kind: "outfit-color-drift",
          targetId: slot.slotId,
          suspectedMirrorFlip: false,
          summaryKo: `${sheet.nameKo}의 의상(${slot.labelKo}) 색상이 설정집 대비 OKLab ΔE ${deltaE.toFixed(4)}만큼 이탈했습니다(허용 ${maxAllowed.toFixed(4)}).`,
          observedMetric: deltaE,
          limitMetric: maxAllowed,
        });
        if (acc) acc.violations += 1;
      }
    }

    // 3. 필수 착용 소품 누락 검사
    const presentSet = new Set(appearance.presentAccessoryIds);
    const absYaw = Math.abs(normalizeSignedYawDeg(appearance.cameraYawDeg));
    for (const reqAcc of sheet.requiredAccessories) {
      if (presentSet.has(reqAcc.accessoryId)) continue;
      if (reqAcc.allowRearViewOcclusion === true && absYaw >= REAR_VIEW_OCCLUSION_YAW_DEG) {
        continue;
      }
      violations.push({
        violationId: `msv-${appearance.cutId}-${sheet.characterId}-acc-${reqAcc.accessoryId}`,
        cutId: appearance.cutId,
        cutOrder: appearance.cutOrder,
        characterId: sheet.characterId,
        characterNameKo: sheet.nameKo,
        kind: "missing-required-accessory",
        targetId: reqAcc.accessoryId,
        suspectedMirrorFlip: false,
        summaryKo: `${sheet.nameKo}의 필수 소품(${reqAcc.labelKo})이 컷(${appearance.cutId})에서 누락되었습니다.`,
      });
      if (acc) acc.violations += 1;
    }

    // 4. 전신 두신비 범위 검사
    if (
      appearance.fullBodyFramed !== false
      && appearance.headHeightPx !== undefined
      && appearance.bodyHeightPx !== undefined
      && appearance.headHeightPx > 0
      && appearance.bodyHeightPx > 0
    ) {
      const ratio = appearance.headHeightPx / appearance.bodyHeightPx;
      const { minHeadToBodyRatio, maxHeadToBodyRatio } = sheet.proportionBounds;
      if (ratio < minHeadToBodyRatio || ratio > maxHeadToBodyRatio) {
        const headsTall = appearance.bodyHeightPx / appearance.headHeightPx;
        const breachedLimit = ratio < minHeadToBodyRatio ? minHeadToBodyRatio : maxHeadToBodyRatio;
        violations.push({
          violationId: `msv-${appearance.cutId}-${sheet.characterId}-proportion`,
          cutId: appearance.cutId,
          cutOrder: appearance.cutOrder,
          characterId: sheet.characterId,
          characterNameKo: sheet.nameKo,
          kind: "proportion-out-of-bounds",
          targetId: "head-to-body-ratio",
          suspectedMirrorFlip: false,
          summaryKo: `${sheet.nameKo}의 두신비(${ratio.toFixed(3)}, 약 ${headsTall.toFixed(1)}등신)가 설정집 허용 범위(${minHeadToBodyRatio.toFixed(3)}~${maxHeadToBodyRatio.toFixed(3)})를 벗어났습니다.`,
          observedMetric: ratio,
          limitMetric: breachedLimit,
        });
        if (acc) acc.violations += 1;
      }
    }
  }

  violations.sort((a, b) => {
    if (a.cutOrder !== b.cutOrder) return a.cutOrder - b.cutOrder;
    if (a.characterId !== b.characterId) return a.characterId.localeCompare(b.characterId);
    return a.violationId.localeCompare(b.violationId);
  });

  const characterSummaries: CharacterConsistencySummary[] = input.modelSheets.map((sheet) => {
    const acc = summaryAccum.get(sheet.characterId);
    return {
      characterId: sheet.characterId,
      characterNameKo: sheet.nameKo,
      appearanceCount: acc?.appearances ?? 0,
      violationCount: acc?.violations ?? 0,
      mirrorFlipAlertCount: acc?.mirrorAlerts ?? 0,
      maxObservedOutfitDeltaE: acc?.maxDeltaE ?? 0,
    };
  });

  return {
    consistent: violations.length === 0,
    totalCutsChecked: cutIdSet.size,
    totalAppearancesChecked: input.cutAppearances.length,
    violations,
    characterSummaries,
  };
}
