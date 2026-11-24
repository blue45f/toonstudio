/**
 * 웹툰 전 컷 자동 연속성 감시관(Webtoon Continuity Guard) 도메인 타입 및 기본 정책 상수.
 */

import type { OklchColor } from "./continuity-color-math";

/** 연속성 감시 대상 캐릭터 착용 소품 6종. */
export type ContinuityPropKind = "glasses" | "beret" | "earrings" | "watch" | "scar" | "bag";

/** 소품 부착 측면 또는 좌우 방향성. */
export type AttachmentSide = "left" | "right" | "center" | "both";

/** 비대칭 신체·착용 특징의 좌우 방향성. */
export type AsymmetricSide = "left" | "right" | "center";

/** 컷 단위 씬 태그 (야간·회상 색감 예외, 거울 반사 예외 등). */
export type CutSceneTag =
  | "day"
  | "indoor"
  | "sunset"
  | "night"
  | "flashback"
  | "dream"
  | "monochrome"
  | "costume-change"
  | "mirror-reflection"
  | "lighting-shift-intentional";

/** 4대 연속성 오류 분류. */
export type ContinuityIssueCategory =
  | "prop-continuity"
  | "left-right-flip"
  | "color-shift"
  | "lighting-direction";

/** 세부 오류 유형. */
export type ContinuityIssueSubtype =
  | "prop-vanished"
  | "prop-sudden-appearance"
  | "scar-flip"
  | "hair-part-flip"
  | "hat-tilt-flip"
  | "watch-flip"
  | "prop-side-flip"
  | "outfit-color-shift"
  | "hair-color-shift"
  | "key-light-azimuth-jump";

/** 연속성 오류 심각도. */
export type ContinuitySeverity = "critical" | "warning" | "minor";

/** 전체 스캔 게이트 상태. */
export type ContinuityGateStatus = "pass" | "warn" | "fail";

/** 캐릭터가 해당 컷에서 착용/보유 중인 소품 스냅샷. */
export interface CharacterPropSnapshot {
  readonly id: string;
  readonly kind: ContinuityPropKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly side?: AttachmentSide;
}

/** 가르마·모자 기울기 등 캐릭터 고유 비대칭 외형 특징. */
export interface CharacterAsymmetricTraits {
  readonly hairPartSide?: AsymmetricSide;
  readonly hatTiltSide?: AsymmetricSide;
}

/** 특정 컷 내 캐릭터 1인의 연속성 스냅샷. */
export interface CharacterCutSnapshot {
  readonly characterId: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly outfitColor: OklchColor;
  readonly hairColor: OklchColor;
  readonly props: readonly CharacterPropSnapshot[];
  readonly asymmetricTraits?: CharacterAsymmetricTraits;
}

/** 컷의 주광원 방향(방위각 0~360°, 고도 -90~90°). */
export interface KeyLightSnapshot {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
}

/** 연출상 의도된 소품 착탈 이벤트(오탐 방지). */
export interface IntentionalPropEvent {
  readonly characterId: string;
  readonly propKind: ContinuityPropKind;
  readonly action: "added" | "removed";
}

/** 웹툰 단일 컷(1컷~60컷+)의 타임라인 스냅샷. */
export interface WebtoonCutSnapshot {
  readonly cutNumber: number;
  readonly sceneId: string;
  readonly sceneNameKo: string;
  readonly sceneNameEn: string;
  readonly sceneTags: readonly CutSceneTag[];
  readonly keyLight: KeyLightSnapshot;
  readonly characters: readonly CharacterCutSnapshot[];
  readonly intentionalPropEvents?: readonly IntentionalPropEvent[];
}

/** 에피소드 전체 컷 타임라인. */
export interface WebtoonEpisodeTimeline {
  readonly episodeId: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly cuts: readonly WebtoonCutSnapshot[];
}

/** 연속성 감시 임계치 및 예외 정책 설정. */
export interface ContinuityGuardConfig {
  readonly outfitDeltaE00Threshold: number;
  readonly outfitCriticalDeltaE00: number;
  readonly hairDeltaE00Threshold: number;
  readonly hairCriticalDeltaE00: number;
  readonly maxLightAzimuthJumpDeg: number;
  readonly criticalLightAzimuthJumpDeg: number;
  readonly colorShiftExemptSceneTags: readonly CutSceneTag[];
  readonly crossScenePermanentProps: readonly ContinuityPropKind[];
}

/** 원클릭 자동 교정 패치 연산(불변 적용). */
export type ContinuityPatchOperation =
  | {
      readonly type: "restore-prop";
      readonly characterId: string;
      readonly prop: CharacterPropSnapshot;
    }
  | {
      readonly type: "remove-prop";
      readonly characterId: string;
      readonly propKind: ContinuityPropKind;
      readonly propId?: string;
    }
  | {
      readonly type: "restore-prop-side";
      readonly characterId: string;
      readonly propKind: ContinuityPropKind;
      readonly propId?: string;
      readonly expectedSide: AttachmentSide;
    }
  | {
      readonly type: "restore-trait-side";
      readonly characterId: string;
      readonly trait: "hairPartSide" | "hatTiltSide";
      readonly expectedSide: AsymmetricSide;
    }
  | {
      readonly type: "restore-color";
      readonly characterId: string;
      readonly slot: "outfit" | "hair";
      readonly expectedColor: OklchColor;
    }
  | {
      readonly type: "restore-key-light";
      readonly expectedAzimuthDeg: number;
      readonly expectedElevationDeg: number;
    };

/** 오류 카드에 1:1 바인딩되는 원클릭 자동 교정 패치. */
export interface ContinuityPatch {
  readonly issueId: string;
  readonly cutNumber: number;
  readonly category: ContinuityIssueCategory;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly operation: ContinuityPatchOperation;
}

/** 오류별 수치/비교 근거 메타데이터. */
export interface ContinuityIssueMetrics {
  readonly propKind?: ContinuityPropKind;
  readonly propLabelKo?: string;
  readonly propLabelEn?: string;
  readonly previousSide?: AttachmentSide;
  readonly currentSide?: AttachmentSide;
  readonly colorSlot?: "outfit" | "hair";
  readonly previousColor?: OklchColor;
  readonly currentColor?: OklchColor;
  readonly deltaE00?: number;
  readonly thresholdDeltaE00?: number;
  readonly previousAzimuthDeg?: number;
  readonly currentAzimuthDeg?: number;
  readonly azimuthDeltaDeg?: number;
  readonly previousElevationDeg?: number;
  readonly currentElevationDeg?: number;
  readonly elevationDeltaDeg?: number;
}

/** 자동 적발된 단일 연속성 오류 항목. */
export interface ContinuityIssue {
  readonly id: string;
  readonly cutNumber: number;
  readonly previousCutNumber: number;
  readonly sceneId: string;
  readonly sceneNameKo: string;
  readonly sceneNameEn: string;
  readonly category: ContinuityIssueCategory;
  readonly subtype: ContinuityIssueSubtype;
  readonly severity: ContinuitySeverity;
  readonly characterId?: string;
  readonly characterNameKo?: string;
  readonly characterNameEn?: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly metrics: ContinuityIssueMetrics;
  readonly fixPatch: ContinuityPatch;
}

/** 야간·회상 등 씬 태그로 정상 예외 처리된 색감 변화 기록. */
export interface ContinuityExemptTransition {
  readonly cutNumber: number;
  readonly referenceCutNumber: number;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly characterNameEn: string;
  readonly matchedTags: readonly CutSceneTag[];
  readonly outfitDeltaE00: number;
  readonly hairDeltaE00: number;
}

/** 분류별 오류 건수 집계. */
export interface ContinuityCategoryCounts {
  readonly "prop-continuity": number;
  readonly "left-right-flip": number;
  readonly "color-shift": number;
  readonly "lighting-direction": number;
}

/** 심각도별 오류 건수 집계. */
export interface ContinuitySeverityCounts {
  readonly critical: number;
  readonly warning: number;
  readonly minor: number;
}

/** 전 에피소드 연속성 스캔 리포트. */
export interface ContinuityScanReport {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly episodeTitleEn: string;
  readonly totalCuts: number;
  readonly scannedCutRange: readonly [number, number];
  readonly score: number;
  readonly status: ContinuityGateStatus;
  readonly issues: readonly ContinuityIssue[];
  readonly countsByCategory: ContinuityCategoryCounts;
  readonly countsBySeverity: ContinuitySeverityCounts;
  readonly exemptedColorTransitions: readonly ContinuityExemptTransition[];
  readonly issuesByCut: Readonly<Record<number, readonly ContinuityIssue[]>>;
}

/** 단건 자동 교정 결과. */
export interface ContinuityFixResult {
  readonly episode: WebtoonEpisodeTimeline;
  readonly applied: boolean;
  readonly issueId: string;
  readonly cutNumber: number;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly report: ContinuityScanReport;
}

/** 전체 일괄 교정 결과. */
export interface BatchContinuityFixResult {
  readonly episode: WebtoonEpisodeTimeline;
  readonly appliedPatches: readonly ContinuityPatch[];
  readonly initialIssueCount: number;
  readonly remainingIssueCount: number;
  readonly report: ContinuityScanReport;
}

/** 6종 소품의 한국어·영어 표준 명칭과 기본 심각도 메타데이터. */
export const CONTINUITY_PROP_META: Readonly<
  Record<
    ContinuityPropKind,
    {
      readonly ko: string;
      readonly en: string;
      readonly missingSeverity: ContinuitySeverity;
      readonly crossSceneFlipCheck: boolean;
    }
  >
> = {
  glasses: { ko: "안경", en: "Glasses", missingSeverity: "critical", crossSceneFlipCheck: false },
  beret: { ko: "베레모", en: "Beret", missingSeverity: "warning", crossSceneFlipCheck: true },
  earrings: { ko: "귀걸이", en: "Earrings", missingSeverity: "warning", crossSceneFlipCheck: false },
  watch: { ko: "손목시계", en: "Wristwatch", missingSeverity: "warning", crossSceneFlipCheck: true },
  scar: { ko: "상처·흉터", en: "Scar", missingSeverity: "critical", crossSceneFlipCheck: true },
  bag: { ko: "가방", en: "Bag", missingSeverity: "warning", crossSceneFlipCheck: false },
};

/** 웹툰 연속성 감시관 기본 설정. */
export const DEFAULT_CONTINUITY_GUARD_CONFIG: ContinuityGuardConfig = {
  outfitDeltaE00Threshold: 8.0,
  outfitCriticalDeltaE00: 16.0,
  hairDeltaE00Threshold: 7.0,
  hairCriticalDeltaE00: 15.0,
  maxLightAzimuthJumpDeg: 75,
  criticalLightAzimuthJumpDeg: 120,
  colorShiftExemptSceneTags: ["night", "flashback", "dream", "monochrome", "costume-change"],
  crossScenePermanentProps: ["scar"],
};

/** 부분 설정을 기본 연속성 정책과 안전하게 병합한다. */
export function mergeContinuityConfig(
  partial?: Partial<ContinuityGuardConfig>,
): ContinuityGuardConfig {
  if (!partial) return DEFAULT_CONTINUITY_GUARD_CONFIG;
  return {
    outfitDeltaE00Threshold:
      partial.outfitDeltaE00Threshold ?? DEFAULT_CONTINUITY_GUARD_CONFIG.outfitDeltaE00Threshold,
    outfitCriticalDeltaE00:
      partial.outfitCriticalDeltaE00 ?? DEFAULT_CONTINUITY_GUARD_CONFIG.outfitCriticalDeltaE00,
    hairDeltaE00Threshold:
      partial.hairDeltaE00Threshold ?? DEFAULT_CONTINUITY_GUARD_CONFIG.hairDeltaE00Threshold,
    hairCriticalDeltaE00:
      partial.hairCriticalDeltaE00 ?? DEFAULT_CONTINUITY_GUARD_CONFIG.hairCriticalDeltaE00,
    maxLightAzimuthJumpDeg:
      partial.maxLightAzimuthJumpDeg ?? DEFAULT_CONTINUITY_GUARD_CONFIG.maxLightAzimuthJumpDeg,
    criticalLightAzimuthJumpDeg:
      partial.criticalLightAzimuthJumpDeg ??
      DEFAULT_CONTINUITY_GUARD_CONFIG.criticalLightAzimuthJumpDeg,
    colorShiftExemptSceneTags:
      partial.colorShiftExemptSceneTags ?? DEFAULT_CONTINUITY_GUARD_CONFIG.colorShiftExemptSceneTags,
    crossScenePermanentProps:
      partial.crossScenePermanentProps ?? DEFAULT_CONTINUITY_GUARD_CONFIG.crossScenePermanentProps,
  };
}
