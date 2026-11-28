/**
 * Wave 80 — 실시간 컷 작화 연속성 감사기 (`auditCutContinuityGuardrail`).
 *
 * 로컬 `OnDeviceSeriesCanonIndex`와 현재 컷 관측치(`CutContinuityObservation`)를
 * 100% 온디바이스에서 대조해 웹툰 연재의 6대 작화 연속성 오류를 검출한다.
 * (좌우 반전·거울 반사 / 영구 특징 누락·측면 가림 / 조명 적응형 OKLCH·CIEDE2000 색차 /
 *  작가 과거 회차 기반 비례 z-score·상대 신장 / 장면 내 소품 회귀 / 장면 내 의상 불일치)
 */

import {
  computeCiede2000,
  formatOklchCss,
  oklchToCieLab,
  resolveTraitLifecycleAt,
  type AnatomicalSide,
  type BodyRegion,
  type CanonicalCharacterTrait,
  type CieLabColor,
  type EpisodeCutRef,
  type OklchColor,
  type OnDevicePrivacyContract,
  type OnDeviceSeriesCanonIndex,
  type PaletteSlotKey,
  type PropIntegrityState,
  type ProportionMetricKey,
  type SceneLightingMood,
} from "./local-episode-canon-index";

// 1. 컷 관측 입력 및 감사 결과 계약
export type CameraFacingDirection =
  | "front" | "back" | "left-profile" | "right-profile" | "three-quarter-left" | "three-quarter-right";

export interface NormalizedCanvasPoint { readonly x: number; readonly y: number }

export interface ObservedCharacterTrait {
  readonly traitId: string;
  readonly present: boolean;
  /** 2D 캔버스 화면 기준 좌/우/중앙 위치(거울 반사 보정의 기준 입력). */
  readonly observedScreenSide?: AnatomicalSide;
  /** 캐릭터 해부학 기준 좌/우/중앙 위치(`observedScreenSide` 미지정 시 사용). */
  readonly observedAnatomicalSide?: AnatomicalSide;
  readonly anchor?: NormalizedCanvasPoint;
}

export interface ObservedPaletteSample {
  readonly slot: PaletteSlotKey;
  readonly oklch: OklchColor;
  readonly anchor?: NormalizedCanvasPoint;
}

export interface ObservedProportions {
  readonly headToShoulderRatio?: number;
  readonly eyeSpacingRatio?: number;
  readonly jawRatio?: number;
  readonly neckLengthRatio?: number;
  readonly screenHeightRatio?: number;
  readonly depthLayer?: number;
  readonly perspectiveOverride?: boolean;
  readonly anchor?: NormalizedCanvasPoint;
}

export interface ObservedCostumeInCut {
  readonly outfitId: string;
  readonly outfitLabel: string;
  readonly equippedAccessories: readonly string[];
  readonly accessoryLabels?: Readonly<Record<string, string>>;
  readonly intentionalCostumeChange?: boolean;
  readonly anchor?: NormalizedCanvasPoint;
}

export interface ObservedCharacterInCut {
  readonly characterId: string;
  readonly facingDirection: CameraFacingDirection;
  readonly isMirrorReflection?: boolean;
  readonly occludedRegions?: readonly BodyRegion[];
  readonly occludedTraitIds?: readonly string[];
  readonly observedTraits?: readonly ObservedCharacterTrait[];
  readonly observedPalette?: readonly ObservedPaletteSample[];
  readonly observedProportions?: ObservedProportions;
  readonly observedCostume?: ObservedCostumeInCut;
  readonly defaultAnchor?: NormalizedCanvasPoint;
}

export interface ObservedPropInCut {
  readonly propId: string;
  readonly label: string;
  readonly ownerCharacterId?: string;
  readonly state: PropIntegrityState;
  readonly repaired?: boolean;
  readonly anchor?: NormalizedCanvasPoint;
}

export interface CutContinuityObservation {
  readonly episodeNumber: number;
  readonly cutNumber: number;
  readonly sceneId: string;
  readonly lightingMood: SceneLightingMood;
  readonly characters: readonly ObservedCharacterInCut[];
  readonly props?: readonly ObservedPropInCut[];
}

export type ContinuityBlunderKind =
  | "chirality-flip" | "missing-canonical-trait" | "palette-color-drift"
  | "proportion-style-drift" | "prop-state-regression" | "costume-scene-mismatch";

export type ContinuitySeverity = "info" | "warning" | "blocker";

export type SuggestedFixActionKind =
  | "flip-trait-horizontal" | "restore-canonical-trait" | "apply-canonical-palette"
  | "guide-proportion-overlay" | "sync-prop-state" | "restore-scene-costume";

export interface SuggestedContinuityFix {
  readonly actionKind: SuggestedFixActionKind;
  readonly labelKo: string;
  readonly targetValue?: string;
}

export interface ContinuityAuditFinding {
  readonly findingKey: string;
  readonly suppressionScopeKey: string;
  readonly kind: ContinuityBlunderKind;
  readonly severity: ContinuitySeverity;
  readonly episodeNumber: number;
  readonly cutNumber: number;
  readonly sceneId: string;
  readonly characterId?: string;
  readonly propId?: string;
  readonly titleKo: string;
  readonly messageKo: string;
  readonly referenceCut?: EpisodeCutRef;
  readonly citationKo: string;
  readonly anchor: NormalizedCanvasPoint;
  readonly suggestedFix: SuggestedContinuityFix;
  readonly dismissActionLabelKo: "의도적 연출로 무시";
  readonly metrics?: Readonly<Record<string, number | string | boolean>>;
}

export interface ContinuityAuditOptions {
  readonly minProportionSamples?: number;
  readonly maxProportionZScore?: number;
  readonly minProportionRelativeDrift?: number;
  readonly minCoStarHeightGapCm?: number;
}

export interface CutContinuityAuditResult {
  readonly seriesId: string;
  readonly episodeNumber: number;
  readonly cutNumber: number;
  readonly sceneId: string;
  readonly lightingMood: SceneLightingMood;
  readonly privacyContract: OnDevicePrivacyContract;
  readonly findings: readonly ContinuityAuditFinding[];
  readonly suppressedFindings: readonly ContinuityAuditFinding[];
  readonly checkedRuleCount: number;
}

// 2. 자연스러운 한국어 조사·라벨 맵
const SIDE_KO: Readonly<Record<AnatomicalSide, string>> = { left: "왼쪽", right: "오른쪽", center: "중앙" };
const REGION_KO: Readonly<Record<BodyRegion, string>> = {
  cheek: "볼", forehead: "이마", eye: "눈가", ear: "귀", neck: "목",
  shoulder: "어깨", arm: "팔", hand: "손", torso: "상체", back: "등", leg: "다리",
};
const PROP_STATE_KO: Readonly<Record<PropIntegrityState, string>> = {
  intact: "온전함", cracked: "금 감", torn: "찢어짐", missing: "분실",
};
const PROP_DAMAGE_RANK: Readonly<Record<PropIntegrityState, number>> = {
  intact: 0, cracked: 1, torn: 2, missing: 3,
};
const METRIC_KO: Readonly<Record<ProportionMetricKey, string>> = {
  headToShoulderRatio: "머리-어깨 비율",
  eyeSpacingRatio: "눈 간격 비율",
  jawRatio: "턱선 비율",
  neckLengthRatio: "목 길이 비율",
};

function josa(word: string, consonantForm: string, vowelForm: string): string {
  const trimmed = word.trim();
  const code = trimmed ? trimmed.charCodeAt(trimmed.length - 1) : 0;
  const hasBatchim = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return `${word}${hasBatchim ? consonantForm : vowelForm}`;
}

function josaEuro(word: string): string {
  const trimmed = word.trim();
  const code = trimmed ? trimmed.charCodeAt(trimmed.length - 1) : 0;
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return `${word}${jong === 0 || jong === 8 ? "로" : "으로"}`;
  }
  return `${word}으로`;
}

// 3. 카메라 방향·거울 반사 키랄성 및 가림 기하학
function flipSide(side: AnatomicalSide): AnatomicalSide {
  return side === "left" ? "right" : side === "right" ? "left" : "center";
}

/** 해부학적 측면이 현재 카메라 방향과 거울 반사 조건에서 2D 화면 어느 쪽에 보여야 하는지 반환한다. */
export function resolveExpectedScreenSide(
  anatomicalSide: AnatomicalSide,
  facingDirection: CameraFacingDirection,
  isMirrorReflection = false,
): AnatomicalSide {
  if (anatomicalSide === "center" || facingDirection === "left-profile" || facingDirection === "right-profile") {
    return "center";
  }
  const baseScreenSide = facingDirection === "back" ? anatomicalSide : flipSide(anatomicalSide);
  return isMirrorReflection ? flipSide(baseScreenSide) : baseScreenSide;
}

/** 2D 화면 좌/우 관측치를 카메라 방향과 거울 반사 여부에 따라 해부학적 측면으로 역산한다. */
export function inferAnatomicalSideFromScreen(
  screenSide: AnatomicalSide,
  facingDirection: CameraFacingDirection,
  isMirrorReflection = false,
): AnatomicalSide {
  if (screenSide === "center") return "center";
  if (facingDirection === "left-profile") return "left";
  if (facingDirection === "right-profile") return "right";
  const unmirrored = isMirrorReflection ? flipSide(screenSide) : screenSide;
  return facingDirection === "back" ? unmirrored : flipSide(unmirrored);
}

/** 현재 카메라 방향과 가림 목록에서 캐릭터 특징이 화면에 보여야 하는지 판정한다. */
export function isTraitVisibleFromCamera(
  trait: CanonicalCharacterTrait,
  facingDirection: CameraFacingDirection,
  occludedRegions?: readonly BodyRegion[],
  occludedTraitIds?: readonly string[],
): boolean {
  if (occludedTraitIds?.includes(trait.traitId) || occludedRegions?.includes(trait.region)) return false;
  if (facingDirection === "front") return trait.region !== "back";
  if (facingDirection === "back") {
    return trait.region !== "cheek" && trait.region !== "forehead" && trait.region !== "eye" && trait.region !== "torso";
  }
  if (facingDirection === "left-profile") return trait.anatomicalSide !== "right" && trait.region !== "back";
  if (facingDirection === "right-profile") return trait.anatomicalSide !== "left" && trait.region !== "back";
  if (facingDirection === "three-quarter-left") {
    return trait.region !== "back" && !(trait.anatomicalSide === "right" && trait.region === "ear");
  }
  return trait.region !== "back" && !(trait.anatomicalSide === "left" && trait.region === "ear");
}

// 4. 장면 조명 광원 투영 보정 OKLCH / CIEDE2000 색차 판정
interface LabShiftVector { readonly dL: number; readonly da: number; readonly db: number }
interface LightingAdaptationProfile {
  readonly thresholdMultiplier: number;
  readonly illuminantVectors: readonly LabShiftVector[];
  readonly monochromeLuminanceOnly: boolean;
}

const DEFAULT_SLOT_DELTA_E: Readonly<Record<PaletteSlotKey, number>> = {
  skin: 6.0, eye: 7.5, hair: 8.0, "outfit-primary": 9.0, "outfit-secondary": 10.0, accent: 10.0,
};

const SCENE_LIGHTING_PROFILES: Readonly<Record<SceneLightingMood, LightingAdaptationProfile>> = {
  "neutral-daylight": { thresholdMultiplier: 1.0, illuminantVectors: [], monochromeLuminanceOnly: false },
  "indoor-soft": { thresholdMultiplier: 1.15, illuminantVectors: [{ dL: 4, da: 3, db: 6 }], monochromeLuminanceOnly: false },
  "golden-sunset": {
    thresholdMultiplier: 1.75,
    illuminantVectors: [{ dL: 14, da: 20, db: 34 }, { dL: -6, da: 16, db: 26 }],
    monochromeLuminanceOnly: false,
  },
  "night-neon": {
    thresholdMultiplier: 1.9,
    illuminantVectors: [{ dL: -16, da: -16, db: -28 }, { dL: -12, da: 28, db: -22 }, { dL: -18, da: 4, db: -24 }],
    monochromeLuminanceOnly: false,
  },
  "rainy-night-neon": {
    thresholdMultiplier: 2.0,
    illuminantVectors: [{ dL: -18, da: -18, db: -30 }, { dL: -14, da: 30, db: -24 }, { dL: -20, da: 2, db: -22 }],
    monochromeLuminanceOnly: false,
  },
  "dramatic-rim": {
    thresholdMultiplier: 1.55,
    illuminantVectors: [{ dL: 16, da: 4, db: 6 }, { dL: -18, da: -2, db: -6 }],
    monochromeLuminanceOnly: false,
  },
  "monochrome-flashback": { thresholdMultiplier: 1.75, illuminantVectors: [], monochromeLuminanceOnly: true },
};

/** 장면 조명 광원 벡터 투영 보정을 적용해 기준 색과 관측 색의 유효 ΔE00을 계산한다. */
export function evaluateLightingAdaptedPaletteDeltaE(
  canonical: OklchColor,
  observed: OklchColor,
  lightingMood: SceneLightingMood,
  baseThreshold: number,
): { readonly rawDeltaE00: number; readonly effectiveDeltaE00: number; readonly effectiveThreshold: number } {
  const canonLab = oklchToCieLab(canonical);
  const obsLab = oklchToCieLab(observed);
  const rawDeltaE00 = computeCiede2000(canonLab, obsLab);
  const profile = SCENE_LIGHTING_PROFILES[lightingMood];
  const effectiveThreshold = baseThreshold * profile.thresholdMultiplier;

  if (profile.monochromeLuminanceOnly) {
    return { rawDeltaE00, effectiveDeltaE00: Math.min(rawDeltaE00, Math.abs(obsLab.l - canonLab.l)), effectiveThreshold };
  }

  let bestDelta = rawDeltaE00;
  const dL = obsLab.l - canonLab.l;
  const dA = obsLab.a - canonLab.a;
  const dB = obsLab.b - canonLab.b;
  for (let i = 0; i < profile.illuminantVectors.length; i += 1) {
    const v = profile.illuminantVectors[i];
    if (!v) continue;
    const denom = v.dL * v.dL + v.da * v.da + v.db * v.db;
    if (denom <= 0) continue;
    const rawT = (dL * v.dL + dA * v.da + dB * v.db) / denom;
    const t = rawT < 0 ? 0 : rawT > 1 ? 1 : rawT;
    const adapted: CieLabColor = { l: canonLab.l + t * v.dL, a: canonLab.a + t * v.da, b: canonLab.b + t * v.db };
    const delta = computeCiede2000(adapted, obsLab);
    if (delta < bestDelta) bestDelta = delta;
  }
  return { rawDeltaE00, effectiveDeltaE00: bestDelta, effectiveThreshold };
}

// 5. 6대 연속성 오류 실시간 감사기
const PROPORTION_METRICS: readonly ProportionMetricKey[] = [
  "headToShoulderRatio", "eyeSpacingRatio", "jawRatio", "neckLengthRatio",
];

function defaultAnchorForIndex(slotIdx: number): NormalizedCanvasPoint {
  return { x: 0.22 + (slotIdx % 3) * 0.28, y: 0.24 + (Math.floor(slotIdx / 3) % 3) * 0.26 };
}

/** 단일 컷 관측치를 로컬 연재 캐논 인덱스와 대조해 6대 작화 연속성 오류를 감사한다. */
export function auditCutContinuityGuardrail(
  index: OnDeviceSeriesCanonIndex,
  observation: CutContinuityObservation,
  options: ContinuityAuditOptions = {},
): CutContinuityAuditResult {
  const minSamples = Math.max(2, options.minProportionSamples ?? 3);
  const maxZ = options.maxProportionZScore ?? 2.5;
  const minRelDrift = options.minProportionRelativeDrift ?? 0.12;
  const minHeightGapCm = options.minCoStarHeightGapCm ?? 6;
  const cutRef: EpisodeCutRef = { episodeNumber: observation.episodeNumber, cutNumber: observation.cutNumber };

  const activeFindings: ContinuityAuditFinding[] = [];
  const suppressedFindings: ContinuityAuditFinding[] = [];
  let checkedRuleCount = 0;

  type FindingInput = Omit<
    ContinuityAuditFinding,
    "episodeNumber" | "cutNumber" | "sceneId" | "dismissActionLabelKo"
  >;
  const emitFinding = (input: FindingInput): void => {
    const finding: ContinuityAuditFinding = {
      ...input,
      episodeNumber: cutRef.episodeNumber,
      cutNumber: cutRef.cutNumber,
      sceneId: observation.sceneId,
      dismissActionLabelKo: "의도적 연출로 무시",
    };
    if (index.isFindingDismissed(finding.findingKey) || index.isFindingDismissed(finding.suppressionScopeKey)) {
      suppressedFindings.push(finding);
      return;
    }
    activeFindings.push(finding);
  };

  for (let cIdx = 0; cIdx < observation.characters.length; cIdx += 1) {
    const charObs = observation.characters[cIdx];
    const canon = charObs ? index.getCharacter(charObs.characterId) : undefined;
    if (!charObs || !canon) continue;

    const charAnchor = charObs.defaultAnchor ?? defaultAnchorForIndex(cIdx);
    const isMirror = Boolean(charObs.isMirrorReflection);
    const obsTraitMap = new Map<string, ObservedCharacterTrait>();
    if (charObs.observedTraits) {
      for (let t = 0; t < charObs.observedTraits.length; t += 1) {
        const ot = charObs.observedTraits[t];
        if (ot) obsTraitMap.set(ot.traitId, ot);
      }
    }

    // [1 & 2] 키랄성 반전 + 타임라인 영구 특징 누락
    for (let tIdx = 0; tIdx < canon.traits.length; tIdx += 1) {
      const trait = canon.traits[tIdx];
      if (!trait) continue;
      checkedRuleCount += 1;
      if (resolveTraitLifecycleAt(trait, cutRef) !== "active") continue;

      const obsTrait = obsTraitMap.get(trait.traitId);
      const anchor = obsTrait?.anchor ?? charAnchor;
      const citationKo = `${trait.introducedAt.episodeNumber}화 ${trait.introducedAt.cutNumber}컷 기준`;

      if (obsTrait?.present) {
        if (trait.anatomicalSide === "center") continue;
        const observedAnatomical: AnatomicalSide | undefined = obsTrait.observedScreenSide
          ? inferAnatomicalSideFromScreen(obsTrait.observedScreenSide, charObs.facingDirection, isMirror)
          : obsTrait.observedAnatomicalSide ??
            (charObs.facingDirection === "left-profile"
              ? "left"
              : charObs.facingDirection === "right-profile"
                ? "right"
                : undefined);

        if (observedAnatomical && observedAnatomical !== trait.anatomicalSide) {
          const expectedScreen = resolveExpectedScreenSide(trait.anatomicalSide, charObs.facingDirection, isMirror);
          emitFinding({
            findingKey: `chirality-flip:ep${cutRef.episodeNumber}:c${cutRef.cutNumber}:${canon.characterId}:${trait.traitId}`,
            suppressionScopeKey: `chirality-flip:${observation.sceneId}:${canon.characterId}:${trait.traitId}`,
            kind: "chirality-flip",
            severity: trait.permanent ? "blocker" : "warning",
            characterId: canon.characterId,
            titleKo: `${canon.displayName} 특징 좌우 반전`,
            messageKo:
              `${trait.introducedAt.episodeNumber}화 ${trait.introducedAt.cutNumber}컷에서 ` +
              `${SIDE_KO[trait.anatomicalSide]} ${REGION_KO[trait.region]}에 생긴 ` +
              `${josa(trait.label, "이", "가")} 이번 컷에서는 ${josaEuro(SIDE_KO[observedAnatomical])} 반전되었습니다.`,
            referenceCut: trait.introducedAt,
            citationKo,
            anchor,
            suggestedFix: {
              actionKind: "flip-trait-horizontal",
              labelKo: `${SIDE_KO[trait.anatomicalSide]} 위치로 좌우 반전 복구`,
              targetValue: expectedScreen,
            },
            metrics: {
              expectedAnatomicalSide: trait.anatomicalSide,
              observedAnatomicalSide: observedAnatomical,
              expectedScreenSide: expectedScreen,
              isMirrorReflection: isMirror,
            },
          });
        }
      } else if (
        isTraitVisibleFromCamera(trait, charObs.facingDirection, charObs.occludedRegions, charObs.occludedTraitIds)
      ) {
        emitFinding({
          findingKey: `missing-canonical-trait:ep${cutRef.episodeNumber}:c${cutRef.cutNumber}:${canon.characterId}:${trait.traitId}`,
          suppressionScopeKey: `missing-canonical-trait:${observation.sceneId}:${canon.characterId}:${trait.traitId}`,
          kind: "missing-canonical-trait",
          severity: trait.permanent ? "blocker" : "warning",
          characterId: canon.characterId,
          titleKo: `${canon.displayName} 설정 특징 누락`,
          messageKo:
            `${trait.introducedAt.episodeNumber}화 ${trait.introducedAt.cutNumber}컷부터 유지되는 ` +
            `${josa(`'${trait.label}'`, "이", "가")}(${SIDE_KO[trait.anatomicalSide]} ${REGION_KO[trait.region]}) 이번 컷에서 빠졌습니다.`,
          referenceCut: trait.introducedAt,
          citationKo,
          anchor,
          suggestedFix: {
            actionKind: "restore-canonical-trait",
            labelKo: `'${trait.label}' 설정 레이어 복원`,
            targetValue: trait.traitId,
          },
          metrics: { facingDirection: charObs.facingDirection, anatomicalSide: trait.anatomicalSide, region: trait.region },
        });
      }
    }

    // [3] 조명 적응형 OKLCH/CIEDE2000 팔레트 색차 드리프트
    if (charObs.observedPalette && charObs.observedPalette.length > 0) {
      const canonicalPalette = index.resolvePaletteAt(canon.characterId, cutRef);
      for (let pIdx = 0; pIdx < charObs.observedPalette.length; pIdx += 1) {
        const sample = charObs.observedPalette[pIdx];
        const canonEntry = sample ? canonicalPalette.get(sample.slot) : undefined;
        if (!sample || !canonEntry) continue;
        checkedRuleCount += 1;

        const evaluated = evaluateLightingAdaptedPaletteDeltaE(
          canonEntry.oklch,
          sample.oklch,
          observation.lightingMood,
          canonEntry.maxDeltaE00 ?? DEFAULT_SLOT_DELTA_E[sample.slot],
        );
        if (evaluated.effectiveDeltaE00 > evaluated.effectiveThreshold) {
          const canonCss = formatOklchCss(canonEntry.oklch);
          emitFinding({
            findingKey: `palette-color-drift:ep${cutRef.episodeNumber}:c${cutRef.cutNumber}:${canon.characterId}:${sample.slot}`,
            suppressionScopeKey: `palette-color-drift:${observation.sceneId}:${canon.characterId}:${sample.slot}`,
            kind: "palette-color-drift",
            severity: evaluated.effectiveDeltaE00 >= evaluated.effectiveThreshold * 2.0 ? "blocker" : "warning",
            characterId: canon.characterId,
            titleKo: `${canon.displayName} ${canonEntry.label} 색감 이탈`,
            messageKo:
              `${canon.displayName}의 ${josa(canonEntry.label, "이", "가")} 기준 팔레트와 지각 색차 ` +
              `ΔE00 ${evaluated.effectiveDeltaE00.toFixed(1)}만큼 벌어졌습니다(허용치 ${evaluated.effectiveThreshold.toFixed(1)}, 기준 ${canonCss}).`,
            referenceCut: canonEntry.effectiveFrom,
            citationKo: canonEntry.effectiveFrom
              ? `${canonEntry.effectiveFrom.episodeNumber}화 ${canonEntry.effectiveFrom.cutNumber}컷 기준 팔레트`
              : `${canon.displayName} 기본 설정 팔레트`,
            anchor: sample.anchor ?? charAnchor,
            suggestedFix: {
              actionKind: "apply-canonical-palette",
              labelKo: `기준 ${canonEntry.label} 팔레트 적용`,
              targetValue: canonCss,
            },
            metrics: {
              slot: sample.slot,
              rawDeltaE00: Number(evaluated.rawDeltaE00.toFixed(2)),
              effectiveDeltaE00: Number(evaluated.effectiveDeltaE00.toFixed(2)),
              effectiveThreshold: Number(evaluated.effectiveThreshold.toFixed(2)),
              lightingMood: observation.lightingMood,
              canonicalOklch: canonCss,
              observedOklch: formatOklchCss(sample.oklch),
            },
          });
        }
      }
    }

    // [4-a] 작가 과거 회차 기준선(평균 + z-score) 인체 비례 이탈
    if (charObs.observedProportions) {
      const propAnchor = charObs.observedProportions.anchor ?? charAnchor;
      for (let mIdx = 0; mIdx < PROPORTION_METRICS.length; mIdx += 1) {
        const metricKey = PROPORTION_METRICS[mIdx];
        if (!metricKey) continue;
        const obsVal = charObs.observedProportions[metricKey];
        if (typeof obsVal !== "number" || !Number.isFinite(obsVal) || obsVal <= 0) continue;
        const baseline = index.computeProportionBaseline(canon.characterId, metricKey, cutRef);
        if (!baseline || baseline.sampleCount < minSamples) continue;
        checkedRuleCount += 1;

        const zScore = (obsVal - baseline.mean) / baseline.effectiveStdDev;
        const relDrift = Math.abs(obsVal - baseline.mean) / baseline.mean;
        if (Math.abs(zScore) > maxZ && relDrift > minRelDrift) {
          const pct = (relDrift * 100).toFixed(1);
          const metricLabel = METRIC_KO[metricKey];
          emitFinding({
            findingKey: `proportion-style-drift:ep${cutRef.episodeNumber}:c${cutRef.cutNumber}:${canon.characterId}:${metricKey}`,
            suppressionScopeKey: `proportion-style-drift:${observation.sceneId}:${canon.characterId}:${metricKey}`,
            kind: "proportion-style-drift",
            severity: Math.abs(zScore) >= maxZ * 1.6 ? "warning" : "info",
            characterId: canon.characterId,
            titleKo: `${canon.displayName} ${metricLabel} 편차`,
            messageKo:
              `${canon.displayName}의 ${metricLabel}(${obsVal.toFixed(2)})이 직전 ${baseline.sampleCount}회 표본 평균` +
              `(${baseline.mean.toFixed(2)}, z=${zScore >= 0 ? "+" : ""}${zScore.toFixed(2)}) 대비 ${pct}% 벗어났습니다.`,
            citationKo: `직전 ${baseline.sampleCount}개 컷 작가 화풍 기준선`,
            anchor: propAnchor,
            suggestedFix: {
              actionKind: "guide-proportion-overlay",
              labelKo: `작가 평균 비례(${baseline.mean.toFixed(2)}) 가이드 표시`,
              targetValue: baseline.mean.toFixed(3),
            },
            metrics: {
              metric: metricKey,
              observed: Number(obsVal.toFixed(4)),
              baselineMean: Number(baseline.mean.toFixed(4)),
              zScore: Number(zScore.toFixed(2)),
              relativeDriftPct: Number(pct),
              sampleCount: baseline.sampleCount,
            },
          });
        }
      }
    }

    // [6] 같은 장면 내 의상·액세서리 급변
    if (charObs.observedCostume && !charObs.observedCostume.intentionalCostumeChange) {
      const priorCostume = index.getLatestCostumeInScene(observation.sceneId, canon.characterId, cutRef);
      if (priorCostume) {
        checkedRuleCount += 1;
        const curr = charObs.observedCostume;
        const prev = priorCostume.costume;
        const costumeAnchor = curr.anchor ?? charAnchor;
        const refLabel = `${priorCostume.at.episodeNumber}화 ${priorCostume.at.cutNumber}컷`;

        if (curr.outfitId !== prev.outfitId) {
          emitFinding({
            findingKey: `costume-scene-mismatch:ep${cutRef.episodeNumber}:c${cutRef.cutNumber}:${canon.characterId}:outfit`,
            suppressionScopeKey: `costume-scene-mismatch:${observation.sceneId}:${canon.characterId}:outfit`,
            kind: "costume-scene-mismatch",
            severity: "blocker",
            characterId: canon.characterId,
            titleKo: `${canon.displayName} 장면 내 의상 불일치`,
            messageKo:
              `같은 장면(${observation.sceneId}) ${refLabel}의 '${prev.outfitLabel}' 의상이 ` +
              `장면 전환 없이 '${curr.outfitLabel}'(으)로 바뀌었습니다.`,
            referenceCut: priorCostume.at,
            citationKo: `동일 장면 ${refLabel} 기준`,
            anchor: costumeAnchor,
            suggestedFix: {
              actionKind: "restore-scene-costume",
              labelKo: `'${prev.outfitLabel}' 의상 상태 유지`,
              targetValue: prev.outfitId,
            },
            metrics: { expectedOutfitId: prev.outfitId, observedOutfitId: curr.outfitId },
          });
        } else {
          const prevSet = new Set(prev.equippedAccessories);
          const currSet = new Set(curr.equippedAccessories);
          const missingAcc = prev.equippedAccessories.filter((acc) => !currSet.has(acc));
          const addedAcc = curr.equippedAccessories.filter((acc) => !prevSet.has(acc));
          if (missingAcc.length > 0 || addedAcc.length > 0) {
            const labelFor = (id: string): string => prev.accessoryLabels?.[id] ?? curr.accessoryLabels?.[id] ?? id;
            const parts: string[] = [];
            if (missingAcc.length > 0) parts.push(`${missingAcc.map((id) => `'${labelFor(id)}'`).join(", ")} 착용 누락`);
            if (addedAcc.length > 0) parts.push(`${addedAcc.map((id) => `'${labelFor(id)}'`).join(", ")} 갑작스러운 추가`);
            const sig = [...missingAcc, ...addedAcc].sort().join("+");
            emitFinding({
              findingKey: `costume-scene-mismatch:ep${cutRef.episodeNumber}:c${cutRef.cutNumber}:${canon.characterId}:acc:${sig}`,
              suppressionScopeKey: `costume-scene-mismatch:${observation.sceneId}:${canon.characterId}:acc:${sig}`,
              kind: "costume-scene-mismatch",
              severity: "warning",
              characterId: canon.characterId,
              titleKo: `${canon.displayName} 장면 내 착용물 불일치`,
              messageKo: `같은 장면(${observation.sceneId}) ${refLabel} 대비 ${parts.join(" · ")} 상태가 감지되었습니다.`,
              referenceCut: priorCostume.at,
              citationKo: `동일 장면 ${refLabel} 기준`,
              anchor: costumeAnchor,
              suggestedFix: {
                actionKind: "restore-scene-costume",
                labelKo: `${refLabel} 착용 상태 복원`,
                targetValue: prev.equippedAccessories.join(","),
              },
              metrics: { missingAccessories: missingAcc.join(","), addedAccessories: addedAcc.join(",") },
            });
          }
        }
      }
    }
  }

  // [4-b] 공동 등장 캐릭터 간 동일 평면 상대 신장 순서 검사
  for (let i = 0; i < observation.characters.length; i += 1) {
    for (let j = i + 1; j < observation.characters.length; j += 1) {
      const obsA = observation.characters[i];
      const obsB = observation.characters[j];
      if (!obsA?.observedProportions || !obsB?.observedProportions) continue;
      if (obsA.observedProportions.perspectiveOverride || obsB.observedProportions.perspectiveOverride) continue;
      if ((obsA.observedProportions.depthLayer ?? 0) !== (obsB.observedProportions.depthLayer ?? 0)) continue;
      const hA = obsA.observedProportions.screenHeightRatio;
      const hB = obsB.observedProportions.screenHeightRatio;
      const canonA = index.getCharacter(obsA.characterId);
      const canonB = index.getCharacter(obsB.characterId);
      if (
        typeof hA !== "number" || typeof hB !== "number" || !canonA || !canonB ||
        typeof canonA.canonicalHeightCm !== "number" || typeof canonB.canonicalHeightCm !== "number"
      ) continue;
      if (Math.abs(canonA.canonicalHeightCm - canonB.canonicalHeightCm) < minHeightGapCm) continue;
      checkedRuleCount += 1;

      const taller = canonA.canonicalHeightCm > canonB.canonicalHeightCm ? canonA : canonB;
      const shorter = taller === canonA ? canonB : canonA;
      const tallerScreen = taller === canonA ? hA : hB;
      const shorterScreen = taller === canonA ? hB : hA;
      if (tallerScreen < shorterScreen * 0.96) {
        const pairId = [taller.characterId, shorter.characterId].sort().join("-");
        emitFinding({
          findingKey: `proportion-style-drift:ep${cutRef.episodeNumber}:c${cutRef.cutNumber}:height-rank:${pairId}`,
          suppressionScopeKey: `proportion-style-drift:${observation.sceneId}:height-rank:${pairId}`,
          kind: "proportion-style-drift",
          severity: "warning",
          characterId: taller.characterId,
          titleKo: "공동 등장 캐릭터 상대 신장 역전",
          messageKo:
            `같은 평면에 선 ${taller.displayName}(기준 ${taller.canonicalHeightCm}cm)이 ` +
            `${shorter.displayName}(기준 ${shorter.canonicalHeightCm}cm)보다 작게 그려져 상대 신장 순서가 뒤집혔습니다.`,
          citationKo: "캐릭터 설정 신장 비교",
          anchor: obsA.observedProportions.anchor ?? obsA.defaultAnchor ?? { x: 0.5, y: 0.3 },
          suggestedFix: {
            actionKind: "guide-proportion-overlay",
            labelKo: "상대 신장 수평 가이드라인 표시",
            targetValue: `${taller.canonicalHeightCm}:${shorter.canonicalHeightCm}`,
          },
          metrics: {
            tallerCharacterId: taller.characterId,
            shorterCharacterId: shorter.characterId,
            tallerScreenRatio: Number(tallerScreen.toFixed(3)),
            shorterScreenRatio: Number(shorterScreen.toFixed(3)),
          },
        });
      }
    }
  }

  // [5] 같은 장면 내 소품 손상 상태 회귀
  if (observation.props && observation.props.length > 0) {
    for (let pIdx = 0; pIdx < observation.props.length; pIdx += 1) {
      const prop = observation.props[pIdx];
      if (!prop || prop.repaired) continue;
      const priorProp = index.getLatestPropStateInScene(observation.sceneId, prop.propId, cutRef);
      if (!priorProp) continue;
      checkedRuleCount += 1;

      if (PROP_DAMAGE_RANK[prop.state] < PROP_DAMAGE_RANK[priorProp.record.state]) {
        const refLabel = `${priorProp.at.episodeNumber}화 ${priorProp.at.cutNumber}컷`;
        const severity: ContinuitySeverity =
          priorProp.record.state === "missing" || (priorProp.record.state === "torn" && prop.state === "intact")
            ? "blocker"
            : "warning";
        emitFinding({
          findingKey: `prop-state-regression:ep${cutRef.episodeNumber}:c${cutRef.cutNumber}:${prop.propId}`,
          suppressionScopeKey: `prop-state-regression:${observation.sceneId}:${prop.propId}`,
          kind: "prop-state-regression",
          severity,
          characterId: prop.ownerCharacterId,
          propId: prop.propId,
          titleKo: `'${prop.label}' 손상 상태 회귀`,
          messageKo:
            `같은 장면(${observation.sceneId}) ${refLabel}에서 ${josa(`'${prop.label}'`, "이", "가")} ` +
            `'${PROP_STATE_KO[priorProp.record.state]}' 상태였으나 수리·교체 기록 없이 ` +
            `${josaEuro(`'${PROP_STATE_KO[prop.state]}'`)} 되돌아갔습니다.`,
          referenceCut: priorProp.at,
          citationKo: `동일 장면 ${refLabel} 기준`,
          anchor: prop.anchor ?? defaultAnchorForIndex(pIdx + 3),
          suggestedFix: {
            actionKind: "sync-prop-state",
            labelKo: `소품 상태를 '${PROP_STATE_KO[priorProp.record.state]}' 상태로 맞추기`,
            targetValue: priorProp.record.state,
          },
          metrics: { previousState: priorProp.record.state, observedState: prop.state },
        });
      }
    }
  }

  return {
    seriesId: index.seriesId,
    episodeNumber: observation.episodeNumber,
    cutNumber: observation.cutNumber,
    sceneId: observation.sceneId,
    lightingMood: observation.lightingMood,
    privacyContract: index.privacyContract,
    findings: activeFindings,
    suppressedFindings,
    checkedRuleCount,
  };
}
