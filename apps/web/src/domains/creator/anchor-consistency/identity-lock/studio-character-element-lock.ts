/**
 * Higgsfield Soul-ID / Kling / Dashtoon / Runway Act-One형 멀티앵글 캐릭터 페이스·엘리먼트 락 보관함
 * 및 표정 퍼포먼스 전이 매핑 엔진.
 *
 * - 6방향 턴테이블 각도(정면·좌/우 3/4·좌/우 측면·후면) + 전신/표정 시트 + 좌우 비대칭 소품/흉터(Chirality)
 *   + OKLCH 알베도 팔레트 락 + 회차별 부상·의상 연속성 원장을 단일 버전드 엘리먼트로 직렬화한다.
 * - 실존 인물 초상 무단 사용을 차단하는 권리·동의 게이트를 강제하며,
 *   표정 퍼포먼스 전이 매핑은 원본 영상을 저장하지 않는 로컬 전용 파라미터 변환으로 수행한다.
 */

import {
  ANCHOR_ANGLE_IDS,
  ANCHOR_MIRROR_PAIRS,
  type AnchorAngleId,
} from "../anchor-capture-spec";

export type ElementAngleSlot = AnchorAngleId | "full-body" | "expression-sheet";

export type ElementBodySide = "character-left" | "character-right" | "center";

export type AsymmetricFeatureKind =
  | "scar"
  | "mole"
  | "accessory"
  | "hair-part"
  | "eye-color"
  | "tattoo";

export type AlbedoSlotKind =
  | "skin"
  | "hair"
  | "eyes"
  | "outfit-primary"
  | "outfit-accent";

export type LikenessConsentKind =
  | "virtual-character-owned"
  | "explicit-likeness-signed";

export interface ElementOklchSwatch {
  readonly slot: AlbedoSlotKind;
  readonly l: number;
  readonly c: number;
  readonly h: number;
  /** OKLab 공간 허용 오차 (기본 0.08). */
  readonly tolerance: number;
}

export interface ElementAngleReference {
  readonly slot: ElementAngleSlot;
  readonly assetId: string;
  readonly contentSha256: string;
  readonly width: number;
  readonly height: number;
  readonly capturedFrom3dStage: boolean;
}

export interface AsymmetricFeatureMark {
  readonly id: string;
  readonly label: string;
  readonly kind: AsymmetricFeatureKind;
  readonly bodySide: ElementBodySide;
  readonly requiredAngles: readonly AnchorAngleId[];
}

export interface CharacterContinuityRecord {
  readonly episodeId: string;
  readonly cutId: string;
  readonly outfitStateId: string;
  readonly activeInjuries: readonly string[];
  readonly activeProps: readonly string[];
  readonly note: string;
}

export interface CharacterElementRightsAttestation {
  readonly consentKind: LikenessConsentKind;
  readonly confirmed: true;
  readonly attestedAtIso: string;
  readonly holderNote: string;
}

export interface CharacterElementLockV1 {
  readonly schema: "toonstudio.character-element-lock";
  readonly schemaVersion: 1;
  readonly elementId: string;
  readonly characterId: string;
  readonly displayName: string;
  readonly mentionAliases: readonly string[];
  readonly angleRefs: readonly ElementAngleReference[];
  readonly asymmetricMarks: readonly AsymmetricFeatureMark[];
  readonly albedoLocks: readonly ElementOklchSwatch[];
  readonly continuityLedger: readonly CharacterContinuityRecord[];
  readonly rights: CharacterElementRightsAttestation;
}

export interface ElementLockAuditReport {
  readonly complete: boolean;
  readonly coverageScore01: number;
  readonly missingCoreAngles: readonly AnchorAngleId[];
  readonly brokenMirrorPairs: readonly (readonly [AnchorAngleId, AnchorAngleId])[];
  readonly missingAlbedoSlots: readonly AlbedoSlotKind[];
  readonly warnings: readonly string[];
}

export interface ResolvedCharacterMentionBinding {
  readonly elementId: string;
  readonly characterId: string;
  readonly displayName: string;
  readonly matchedHandle: string;
  readonly referenceAssetIds: readonly string[];
  readonly chiralityGuardsKo: readonly string[];
  readonly lockedAlbedoTokens: readonly string[];
  readonly activeContinuity: CharacterContinuityRecord | null;
}

export interface IdentityDriftCandidateInput {
  readonly sampledAlbedo: readonly {
    readonly slot: AlbedoSlotKind;
    readonly l: number;
    readonly c: number;
    readonly h: number;
  }[];
  /** 실루엣 구조 유사도 (0..1). */
  readonly silhouetteSimilarity01: number;
  /** 안면 비율 일관성 지표 (0..1). */
  readonly proportionSimilarity01: number;
  /** 검출된 비대칭 표식 위치 맵 (`markId -> 관측된 위치`). */
  readonly observedMarkSides?: Readonly<Record<string, ElementBodySide | "missing">>;
}

export interface IdentityDriftScoreReport {
  readonly overallScore: number;
  readonly paletteScore: number;
  readonly silhouetteScore: number;
  readonly proportionScore: number;
  readonly chiralityScore: number;
  readonly chiralityViolations: readonly string[];
  readonly paletteDrifts: readonly {
    readonly slot: AlbedoSlotKind;
    readonly delta: number;
    readonly exceeded: boolean;
  }[];
  readonly recommendation: "accept" | "adjust-palette" | "regenerate";
}

export interface FacialPerformanceFrameInput {
  readonly jawOpen: number;
  readonly smileLeft: number;
  readonly smileRight: number;
  readonly browRaiseInner: number;
  readonly browFurrow: number;
  readonly eyeBlinkLeft: number;
  readonly eyeBlinkRight: number;
  readonly lipPucker: number;
  readonly headYawDeg: number;
  readonly headPitchDeg: number;
  readonly headRollDeg: number;
  readonly audioEnergy01: number;
}

export interface PerformanceTransferMappingConfig {
  readonly deadzone: number;
  readonly sensitivity: number;
  /** 비선형 감마 곡선 (0.5..2.0, 1이면 선형). */
  readonly responseGamma: number;
  /** 이전 프레임 대비 지수 스무딩 계수 (0..0.9). */
  readonly smoothingAlpha: number;
}

export interface MappedExpressionBlendshapes {
  readonly happy: number;
  readonly angry: number;
  readonly sad: number;
  readonly surprised: number;
  readonly aa: number;
  readonly ee: number;
  readonly ih: number;
  readonly oh: number;
  readonly ou: number;
  readonly blinkLeft: number;
  readonly blinkRight: number;
  readonly smileAsymmetry: number;
  readonly headYawDeg: number;
  readonly headPitchDeg: number;
  readonly headRollDeg: number;
  readonly rawVideoRetained: false;
}

const CORE_ALBEDO_SLOTS: readonly AlbedoSlotKind[] = Object.freeze([
  "skin",
  "hair",
  "eyes",
  "outfit-primary",
]);

export const DEFAULT_PERFORMANCE_TRANSFER_CONFIG: PerformanceTransferMappingConfig = Object.freeze({
  deadzone: 0.04,
  sensitivity: 1.1,
  responseGamma: 1.15,
  smoothingAlpha: 0.25,
});

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function oklabDistance(
  a: { readonly l: number; readonly c: number; readonly h: number },
  b: { readonly l: number; readonly c: number; readonly h: number },
): number {
  const radA = (a.h * Math.PI) / 180;
  const radB = (b.h * Math.PI) / 180;
  const dl = a.l - b.l;
  const da = a.c * Math.cos(radA) - b.c * Math.cos(radB);
  const db = a.c * Math.sin(radA) - b.c * Math.sin(radB);
  return Math.sqrt(dl * dl + da * da + db * db);
}

function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/u, "").toLocaleLowerCase();
}

export function createCharacterElementLock(input: {
  readonly elementId: string;
  readonly characterId: string;
  readonly displayName: string;
  readonly mentionAliases?: readonly string[];
  readonly angleRefs?: readonly ElementAngleReference[];
  readonly asymmetricMarks?: readonly AsymmetricFeatureMark[];
  readonly albedoLocks?: readonly ElementOklchSwatch[];
  readonly continuityLedger?: readonly CharacterContinuityRecord[];
  readonly rights: {
    readonly consentKind: LikenessConsentKind;
    readonly confirmed: boolean;
    readonly attestedAtIso: string;
    readonly holderNote?: string;
  };
}): CharacterElementLockV1 {
  if (input.rights.confirmed !== true) {
    throw new Error("캐릭터 엘리먼트 락을 생성하려면 권리 또는 초상 동의 확인이 필요합니다.");
  }
  if (Number.isNaN(Date.parse(input.rights.attestedAtIso))) {
    throw new Error("권리 확인 시각 형식이 올바르지 않습니다.");
  }
  const displayName = input.displayName.trim();
  if (!displayName) {
    throw new Error("캐릭터 표시 이름을 입력해야 합니다.");
  }
  const uniqueAliases = Array.from(
    new Set((input.mentionAliases ?? []).map((a) => a.trim()).filter(Boolean)),
  );
  return Object.freeze({
    schema: "toonstudio.character-element-lock",
    schemaVersion: 1,
    elementId: input.elementId.trim() || `elem-${input.characterId}`,
    characterId: input.characterId.trim(),
    displayName,
    mentionAliases: Object.freeze(uniqueAliases),
    angleRefs: Object.freeze([...(input.angleRefs ?? [])]),
    asymmetricMarks: Object.freeze([...(input.asymmetricMarks ?? [])]),
    albedoLocks: Object.freeze(
      (input.albedoLocks ?? []).map((s) =>
        Object.freeze({
          slot: s.slot,
          l: round3(clamp(s.l, 0, 1)),
          c: round3(clamp(s.c, 0, 0.4)),
          h: round3(((s.h % 360) + 360) % 360),
          tolerance: round3(clamp(s.tolerance, 0.01, 0.35)),
        }),
      ),
    ),
    continuityLedger: Object.freeze([...(input.continuityLedger ?? [])]),
    rights: Object.freeze({
      consentKind: input.rights.consentKind,
      confirmed: true,
      attestedAtIso: new Date(input.rights.attestedAtIso).toISOString(),
      holderNote: (input.rights.holderNote ?? "").trim(),
    }),
  });
}

export function upsertAngleReference(
  lock: CharacterElementLockV1,
  ref: ElementAngleReference,
): CharacterElementLockV1 {
  const filtered = lock.angleRefs.filter((existing) => existing.slot !== ref.slot);
  return Object.freeze({
    ...lock,
    angleRefs: Object.freeze([...filtered, Object.freeze({ ...ref })]),
  });
}

export function recordContinuityState(
  lock: CharacterElementLockV1,
  record: CharacterContinuityRecord,
): CharacterElementLockV1 {
  const filtered = lock.continuityLedger.filter(
    (item) => !(item.episodeId === record.episodeId && item.cutId === record.cutId),
  );
  return Object.freeze({
    ...lock,
    continuityLedger: Object.freeze([
      ...filtered,
      Object.freeze({
        ...record,
        activeInjuries: Object.freeze([...record.activeInjuries]),
        activeProps: Object.freeze([...record.activeProps]),
      }),
    ]),
  });
}

export function auditElementLockCompleteness(
  lock: CharacterElementLockV1,
): ElementLockAuditReport {
  const presentSlots = new Set(lock.angleRefs.map((r) => r.slot));
  const missingCoreAngles = ANCHOR_ANGLE_IDS.filter((angleId) => !presentSlots.has(angleId));
  const brokenMirrorPairs: (readonly [AnchorAngleId, AnchorAngleId])[] = [];
  const warnings: string[] = [];

  for (const pair of ANCHOR_MIRROR_PAIRS) {
    const hasA = presentSlots.has(pair[0]);
    const hasB = presentSlots.has(pair[1]);
    if (hasA !== hasB) {
      brokenMirrorPairs.push(pair);
      warnings.push(
        `좌우 반측 쌍(${pair[0]} / ${pair[1]}) 중 한쪽만 등록되어 비대칭 편향이 생길 수 있습니다.`,
      );
    }
  }

  for (const mark of lock.asymmetricMarks) {
    for (const reqAngle of mark.requiredAngles) {
      if (!presentSlots.has(reqAngle)) {
        warnings.push(
          `비대칭 특징 '${mark.label}' 검증에 필요한 ${reqAngle} 각도 시트가 비어 있습니다.`,
        );
      }
    }
  }

  const albedoSlotSet = new Set(lock.albedoLocks.map((s) => s.slot));
  const missingAlbedoSlots = CORE_ALBEDO_SLOTS.filter((slot) => !albedoSlotSet.has(slot));
  if (missingAlbedoSlots.length > 0) {
    warnings.push(`핵심 고유색 잠금 슬롯이 비어 있습니다: ${missingAlbedoSlots.join(", ")}`);
  }

  const angleCoverage = (ANCHOR_ANGLE_IDS.length - missingCoreAngles.length) / ANCHOR_ANGLE_IDS.length;
  const albedoCoverage = (CORE_ALBEDO_SLOTS.length - missingAlbedoSlots.length) / CORE_ALBEDO_SLOTS.length;
  const pairPenalty = brokenMirrorPairs.length * 0.1;
  const coverageScore01 = round3(clamp(angleCoverage * 0.7 + albedoCoverage * 0.3 - pairPenalty, 0, 1));

  return Object.freeze({
    complete:
      presentSlots.has("front") &&
      brokenMirrorPairs.length === 0 &&
      missingAlbedoSlots.length === 0 &&
      angleCoverage >= 0.5,
    coverageScore01,
    missingCoreAngles: Object.freeze(missingCoreAngles),
    brokenMirrorPairs: Object.freeze(brokenMirrorPairs),
    missingAlbedoSlots: Object.freeze(missingAlbedoSlots),
    warnings: Object.freeze(warnings),
  });
}

/**
 * `@캐릭터명` 또는 별칭 멘션을 보관함에서 찾아 생성/콘티용 불변 바인딩 묶음으로 해석한다.
 */
export function resolveCharacterMentionBinding(
  vault: readonly CharacterElementLockV1[],
  mentionHandle: string,
  episodeId?: string,
): ResolvedCharacterMentionBinding | null {
  const needle = normalizeHandle(mentionHandle);
  if (!needle) return null;

  const matched = vault.find((lock) => {
    if (normalizeHandle(lock.displayName) === needle) return true;
    return lock.mentionAliases.some((alias) => normalizeHandle(alias) === needle);
  });
  if (!matched) return null;

  const sideLabelKo = (side: ElementBodySide): string => {
    if (side === "character-left") return "캐릭터 왼쪽";
    if (side === "character-right") return "캐릭터 오른쪽";
    return "중앙";
  };

  const chiralityGuardsKo = matched.asymmetricMarks.map(
    (mark) => `${mark.label}은(는) 반드시 ${sideLabelKo(mark.bodySide)} 위치 유지(좌우 반전 금지)`,
  );
  const lockedAlbedoTokens = matched.albedoLocks.map(
    (s) => `${s.slot}:oklch(${s.l} ${s.c} ${s.h})`,
  );

  const continuityPool = episodeId
    ? matched.continuityLedger.filter((r) => r.episodeId === episodeId)
    : matched.continuityLedger;
  const activeContinuity: CharacterContinuityRecord | null =
    continuityPool[continuityPool.length - 1] ?? null;

  return Object.freeze({
    elementId: matched.elementId,
    characterId: matched.characterId,
    displayName: matched.displayName,
    matchedHandle: mentionHandle.trim(),
    referenceAssetIds: Object.freeze(matched.angleRefs.map((r) => r.assetId)),
    chiralityGuardsKo: Object.freeze(chiralityGuardsKo),
    lockedAlbedoTokens: Object.freeze(lockedAlbedoTokens),
    activeContinuity,
  });
}

/**
 * 생성·작업된 컷 후보의 캐릭터 일관성 드리프트(색상·실루엣·비율·좌우 반전)를 자동 채점한다.
 */
export function evaluateIdentityDriftScore(
  lock: CharacterElementLockV1,
  candidate: IdentityDriftCandidateInput,
): IdentityDriftScoreReport {
  const paletteDrifts: {
    readonly slot: AlbedoSlotKind;
    readonly delta: number;
    readonly exceeded: boolean;
  }[] = [];

  let paletteScoreSum = 0;
  let paletteCompared = 0;
  for (const lockedSwatch of lock.albedoLocks) {
    const sample = candidate.sampledAlbedo.find((s) => s.slot === lockedSwatch.slot);
    if (!sample) continue;
    paletteCompared += 1;
    const delta = round3(oklabDistance(lockedSwatch, sample));
    const exceeded = delta > lockedSwatch.tolerance;
    paletteDrifts.push({ slot: lockedSwatch.slot, delta, exceeded });
    const slotScore = clamp(1 - delta / Math.max(0.05, lockedSwatch.tolerance * 2.5), 0, 1) * 100;
    paletteScoreSum += slotScore;
  }
  const paletteScore = paletteCompared > 0 ? round3(paletteScoreSum / paletteCompared) : 100;

  const silhouetteScore = round3(clamp(candidate.silhouetteSimilarity01, 0, 1) * 100);
  const proportionScore = round3(clamp(candidate.proportionSimilarity01, 0, 1) * 100);

  const chiralityViolations: string[] = [];
  if (lock.asymmetricMarks.length > 0 && candidate.observedMarkSides) {
    for (const mark of lock.asymmetricMarks) {
      const observed = candidate.observedMarkSides[mark.id];
      if (!observed) continue;
      if (observed === "missing") {
        chiralityViolations.push(`비대칭 표식 '${mark.label}'이(가) 누락되었습니다.`);
      } else if (observed !== mark.bodySide) {
        chiralityViolations.push(
          `비대칭 표식 '${mark.label}'의 좌우가 반전되었습니다(기준: ${mark.bodySide}, 관측: ${observed}).`,
        );
      }
    }
  }
  const chiralityScore =
    lock.asymmetricMarks.length === 0
      ? 100
      : round3(
          clamp(
            ((lock.asymmetricMarks.length - chiralityViolations.length) / lock.asymmetricMarks.length) *
              100,
            0,
            100,
          ),
        );

  const overallScore = round3(
    paletteScore * 0.25 +
      silhouetteScore * 0.3 +
      proportionScore * 0.3 +
      chiralityScore * 0.15,
  );

  let recommendation: IdentityDriftScoreReport["recommendation"] = "accept";
  if (chiralityViolations.length > 0 || overallScore < 72 || proportionScore < 65) {
    recommendation = "regenerate";
  } else if (paletteDrifts.some((d) => d.exceeded) || overallScore < 85) {
    recommendation = "adjust-palette";
  }

  return Object.freeze({
    overallScore,
    paletteScore,
    silhouetteScore,
    proportionScore,
    chiralityScore,
    chiralityViolations: Object.freeze(chiralityViolations),
    paletteDrifts: Object.freeze(paletteDrifts),
    recommendation,
  });
}

function shapeChannel(
  raw: number,
  config: PerformanceTransferMappingConfig,
): number {
  const v = clamp(raw, 0, 1);
  if (v <= config.deadzone) return 0;
  const rescaled = clamp((v - config.deadzone) / Math.max(0.01, 1 - config.deadzone), 0, 1);
  const curved = Math.pow(rescaled, clamp(config.responseGamma, 0.4, 2.5));
  return round3(clamp(curved * clamp(config.sensitivity, 0.2, 2.5), 0, 1));
}

function smoothBlend(prev: number | undefined, next: number, alpha: number): number {
  if (prev === undefined) return round3(next);
  const a = clamp(alpha, 0, 0.9);
  return round3(prev * a + next * (1 - a));
}

/**
 * 로컬 연기/표정 입력 신호를 VRM/2D 표정 블렌드셰이프로 매핑한다(원본 영상 미보관).
 */
export function mapFacialPerformanceToBlendshapes(
  frame: FacialPerformanceFrameInput,
  config: PerformanceTransferMappingConfig = DEFAULT_PERFORMANCE_TRANSFER_CONFIG,
  previous?: MappedExpressionBlendshapes,
): MappedExpressionBlendshapes {
  const jaw = shapeChannel(frame.jawOpen, config);
  const smileL = shapeChannel(frame.smileLeft, config);
  const smileR = shapeChannel(frame.smileRight, config);
  const smileAvg = (smileL + smileR) / 2;
  const browRaise = shapeChannel(frame.browRaiseInner, config);
  const browFurrow = shapeChannel(frame.browFurrow, config);
  const pucker = shapeChannel(frame.lipPucker, config);
  const energy = shapeChannel(frame.audioEnergy01, config);

  const happyRaw = clamp(smileAvg * 0.95 - browFurrow * 0.25, 0, 1);
  const angryRaw = clamp(browFurrow * 0.9 - smileAvg * 0.35, 0, 1);
  const sadRaw = clamp(browRaise * 0.75 * (1 - smileAvg) * (1 - jaw * 0.4), 0, 1);
  const surprisedRaw = clamp(browRaise * 0.55 + jaw * 0.55, 0, 1);

  const aaRaw = clamp(jaw * (1 - pucker * 0.6) * (0.65 + energy * 0.35), 0, 1);
  const eeRaw = clamp(smileAvg * (0.45 + jaw * 0.45) * (1 - pucker), 0, 1);
  const ihRaw = clamp(smileAvg * 0.65 * (1 - jaw * 0.5) * (1 - pucker), 0, 1);
  const ohRaw = clamp(jaw * 0.65 * pucker, 0, 1);
  const ouRaw = clamp(pucker * (1 - jaw * 0.45), 0, 1);

  const blinkLeftRaw = shapeChannel(frame.eyeBlinkLeft, config);
  const blinkRightRaw = shapeChannel(frame.eyeBlinkRight, config);
  const alpha = config.smoothingAlpha;

  return Object.freeze({
    happy: smoothBlend(previous?.happy, happyRaw, alpha),
    angry: smoothBlend(previous?.angry, angryRaw, alpha),
    sad: smoothBlend(previous?.sad, sadRaw, alpha),
    surprised: smoothBlend(previous?.surprised, surprisedRaw, alpha),
    aa: smoothBlend(previous?.aa, aaRaw, alpha),
    ee: smoothBlend(previous?.ee, eeRaw, alpha),
    ih: smoothBlend(previous?.ih, ihRaw, alpha),
    oh: smoothBlend(previous?.oh, ohRaw, alpha),
    ou: smoothBlend(previous?.ou, ouRaw, alpha),
    blinkLeft: smoothBlend(previous?.blinkLeft, blinkLeftRaw, alpha),
    blinkRight: smoothBlend(previous?.blinkRight, blinkRightRaw, alpha),
    smileAsymmetry: round3(clamp(smileR - smileL, -1, 1)),
    headYawDeg: smoothBlend(previous?.headYawDeg, clamp(frame.headYawDeg, -65, 65), alpha),
    headPitchDeg: smoothBlend(previous?.headPitchDeg, clamp(frame.headPitchDeg, -45, 45), alpha),
    headRollDeg: smoothBlend(previous?.headRollDeg, clamp(frame.headRollDeg, -40, 40), alpha),
    rawVideoRetained: false,
  });
}
