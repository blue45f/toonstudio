/**
 * Wave 123 — 웹툰 연재 화차 의상·소품·손상 상태 인과 연속성 감사 및
 * 캐릭터 옷장 바이블 컴파일러 핵심 타입 정의와 기본 프리셋.
 */

/** 0~255 범위의 sRGB 3채널 색상 튜플 `[r, g, b]`. */
export type SrgbTriplet = readonly [number, number, number];

/** Björn Ottosson OKLab 색공간 좌표 (`L ∈ [0, 1]`, `a`, `b`). */
export interface OklabCoords {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** OKLCH 극좌표 (`L ∈ [0, 1]`, `C >= 0`, `H ∈ [0, 360)`). */
export interface OklchCoords {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export type WardrobeSlotCategory =
  | "outerwear"
  | "top"
  | "bottom"
  | "accessory"
  | "weapon"
  | "eyewear";

export type WardrobeHandedness = "left" | "right" | "center";

export type WardrobeDamageKind = "damage-torn" | "damage-bloodstain" | "damage-wet";

export type WardrobeSlotCondition = "intact" | WardrobeDamageKind;

export type WardrobeSlotImportance = "signature" | "standard";

export type CutContinuityEventKind =
  | "damage-torn"
  | "damage-bloodstain"
  | "damage-wet"
  | "prop-acquired"
  | "prop-dropped"
  | "wardrobe-change"
  | "scene-time-skip-reset";

/** 캐릭터 의복·소품 바이블의 개별 슬롯 명세. */
export interface WardrobeSlotSpec {
  readonly slotId: string;
  readonly category: WardrobeSlotCategory;
  readonly labelKo: string;
  readonly required: boolean;
  readonly handedness?: WardrobeHandedness;
  readonly canonicalSrgb: SrgbTriplet;
  readonly maxAllowedOklabDeltaE: number;
  readonly importance?: WardrobeSlotImportance;
}

/** 특정 캐릭터의 단일 착장(옷장 프리셋) 정의. */
export interface CharacterWardrobePreset {
  readonly characterId: string;
  readonly characterNameKo?: string;
  readonly outfitId: string;
  readonly outfitLabelKo: string;
  readonly slots: readonly WardrobeSlotSpec[];
}

/** 화차 전체의 캐릭터 옷장·소품 기준 바이블 입력. */
export interface EpisodeWardrobeBible {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly presets: readonly CharacterWardrobePreset[];
  readonly defaultOutfitByCharacter?: Readonly<Record<string, string>>;
  readonly defaultLightingToleranceDeltaE?: number;
}

/** 컷 진입 시 발생하는 인과 상태 전이 이벤트. */
export interface CutContinuityEvent {
  readonly kind: CutContinuityEventKind;
  /** 대상 캐릭터 ID. `scene-time-skip-reset`에서는 `"*"`로 전체 캐릭터 일괄 초기화 가능. */
  readonly characterId: string;
  readonly slotId?: string;
  readonly nextOutfitId?: string;
  readonly noteKo?: string;
}

/** 단일 컷에서 관측된 슬롯별 작화 상태. */
export interface ObservedSlotState {
  readonly slotId: string;
  readonly present: boolean;
  readonly visibility?: "visible" | "occluded";
  readonly condition?: WardrobeSlotCondition;
  /** 복합 손상(찢김+혈흔 등)이 동시에 그려진 경우 명시적 손상 목록. */
  readonly activeDamages?: readonly WardrobeDamageKind[];
  readonly observedHandedness?: WardrobeHandedness;
  readonly observedSrgb?: SrgbTriplet;
}

/** 단일 컷의 캐릭터 의상·소품 관측 레코드. */
export interface CutWardrobeObservation {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly sceneId?: string;
  readonly cutLabelKo?: string;
  readonly characterId: string;
  readonly lightingMoodLabelKo?: string;
  /** 장면 조명 색온도 변화로 인한 OKLab ΔE 추가 허용치(기본 0). */
  readonly lightingToleranceDeltaE?: number;
  /** 프레이밍(클로즈업 등)으로 화면 밖에 가려져 검수에서 제외할 슬롯 ID 목록. */
  readonly occludedSlotIds?: readonly string[];
  readonly events?: readonly CutContinuityEvent[];
  readonly slots: readonly ObservedSlotState[];
}

export type WardrobeContinuityViolationCode =
  | "spontaneous-damage-healing"
  | "missing-signature-prop"
  | "accessory-handedness-flip"
  | "palette-color-drift"
  | "unregistered-character"
  | "unknown-outfit-change"
  | "unregistered-slot";

export type WardrobeViolationSeverity = "blocker" | "warning" | "info";

export type WardrobeAuditPassStatus = "pass" | "warn" | "block";

export type TimelineCellStatus =
  | "ok"
  | "reset-ok"
  | "damaged"
  | "healed-error"
  | "missing-error"
  | "flipped-error"
  | "color-error"
  | "dropped"
  | "occluded"
  | "unobserved";

export type TimelineBadgeText =
  | "OK"
  | "DMG"
  | "HEAL!"
  | "MISS"
  | "FLIP"
  | "COLOR"
  | "DROP"
  | "CROP"
  | "—";

/** 연속성 감사에서 적발된 개별 위반 항목. */
export interface WardrobeContinuityFinding {
  readonly findingId: string;
  readonly code: WardrobeContinuityViolationCode;
  readonly severity: WardrobeViolationSeverity;
  readonly cutId: string;
  readonly cutIndex: number;
  readonly characterId: string;
  readonly outfitId: string;
  readonly slotId?: string;
  readonly slotLabelKo?: string;
  readonly originCutId?: string;
  readonly deltaE?: number;
  readonly allowedDeltaE?: number;
  readonly expectedSummaryKo: string;
  readonly observedSummaryKo: string;
  readonly messageKo: string;
  readonly remediationKo: string;
}

/** 사전 계산된 OKLab/OKLCH 기준 색상을 포함하는 컴파일 슬롯 명세. */
export interface CompiledWardrobeSlot extends WardrobeSlotSpec {
  readonly canonicalOklab: OklabCoords;
  readonly canonicalOklch: OklchCoords;
  readonly canonicalOklchCss: string;
}

/** 컴파일된 단일 캐릭터 착장 프리셋. */
export interface CompiledOutfitPreset {
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly outfitId: string;
  readonly outfitLabelKo: string;
  readonly slots: readonly CompiledWardrobeSlot[];
  readonly presetSha256Hex: string;
}

/** 컴파일된 캐릭터별 전체 옷장 인덱스. */
export interface CompiledCharacterWardrobe {
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly defaultOutfitId: string;
  readonly outfits: readonly CompiledOutfitPreset[];
}

/** 결정론적 지문을 포함한 컴파일 완료 화차 옷장 바이블. */
export interface CompiledWardrobeBible {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly defaultLightingToleranceDeltaE: number;
  readonly characters: readonly CompiledCharacterWardrobe[];
  readonly presetCount: number;
  readonly slotCount: number;
  readonly bibleSha256Hex: string;
}

/** 타임라인 매트릭스의 단일 (컷 × 슬롯) 감사 셀. */
export interface TimelineCellAudit {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly characterId: string;
  readonly outfitId: string;
  readonly slotId: string;
  readonly slotLabelKo: string;
  readonly category: WardrobeSlotCategory;
  readonly status: TimelineCellStatus;
  readonly badgeText: TimelineBadgeText;
  readonly activeCausalDamages: readonly WardrobeDamageKind[];
  readonly observedCondition?: WardrobeSlotCondition;
  readonly expectedHandedness?: WardrobeHandedness;
  readonly observedHandedness?: WardrobeHandedness;
  readonly canonicalSrgb: SrgbTriplet;
  readonly observedSrgb?: SrgbTriplet;
  readonly canonicalOklchCss: string;
  readonly observedOklchCss?: string;
  readonly oklabDeltaE?: number;
  readonly effectiveMaxDeltaE: number;
  readonly resetApplied: boolean;
  readonly violationCodes: readonly WardrobeContinuityViolationCode[];
}

/** 컷 단위 연속성 감사 행 요약. */
export interface CutContinuityAuditRow {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly sceneId?: string;
  readonly cutLabelKo?: string;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly activeOutfitId: string;
  readonly activeOutfitLabelKo: string;
  readonly lightingMoodLabelKo?: string;
  readonly lightingToleranceDeltaE: number;
  readonly eventsApplied: readonly CutContinuityEventKind[];
  readonly cells: readonly TimelineCellAudit[];
  readonly blockerCount: number;
  readonly warningCount: number;
}

/** 화차 전체 의상·소품·손상 인과 연속성 감사 최종 보고서. */
export interface EpisodeWardrobeContinuityAudit {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly bibleSha256Hex: string;
  readonly auditSha256Hex: string;
  readonly passStatus: WardrobeAuditPassStatus;
  readonly continuityScore: number;
  readonly totalCutsAudited: number;
  readonly totalSlotChecks: number;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly countsByCode: Readonly<Record<WardrobeContinuityViolationCode, number>>;
  readonly cutRows: readonly CutContinuityAuditRow[];
  readonly findings: readonly WardrobeContinuityFinding[];
  readonly compiledBible: CompiledWardrobeBible;
}

export const ALL_WARDROBE_DAMAGE_KINDS: readonly WardrobeDamageKind[] = [
  "damage-torn",
  "damage-bloodstain",
  "damage-wet",
];

export const DAMAGE_LABEL_KO: Readonly<Record<WardrobeDamageKind, string>> = {
  "damage-torn": "찢김 손상",
  "damage-bloodstain": "혈흔 오염",
  "damage-wet": "젖음 상태",
};

export const HANDEDNESS_LABEL_KO: Readonly<Record<WardrobeHandedness, string>> = {
  left: "왼쪽",
  right: "오른쪽",
  center: "중앙",
};

export const CATEGORY_LABEL_KO: Readonly<Record<WardrobeSlotCategory, string>> = {
  outerwear: "아우터",
  top: "상의",
  bottom: "하의",
  accessory: "장신구",
  weapon: "무기",
  eyewear: "아이웨어",
};

export const EVENT_LABEL_KO: Readonly<Record<CutContinuityEventKind, string>> = {
  "damage-torn": "찢김 발생",
  "damage-bloodstain": "혈흔 발생",
  "damage-wet": "젖음 발생",
  "prop-acquired": "소품 획득",
  "prop-dropped": "소품 이탈",
  "wardrobe-change": "의상 교체",
  "scene-time-skip-reset": "시간 경과 초기화",
};

/** 실무 시나리오 및 테스트용 기본 웹툰 화차 옷장 바이블을 생성한다. */
export function createDefaultEpisodeWardrobeBible(
  overrides?: Partial<EpisodeWardrobeBible>,
): EpisodeWardrobeBible {
  const defaultPresets: readonly CharacterWardrobePreset[] = [
    {
      characterId: "seo-jin",
      characterNameKo: "서진",
      outfitId: "noir-trench-combat",
      outfitLabelKo: "느와르 트렌치 전투복",
      slots: [
        {
          slotId: "trench-coat",
          category: "outerwear",
          labelKo: "다크 네이비 트렌치코트",
          required: true,
          canonicalSrgb: [36, 48, 72],
          maxAllowedOklabDeltaE: 0.055,
          importance: "signature",
        },
        {
          slotId: "turtleneck-top",
          category: "top",
          labelKo: "차콜 터틀넥 니트",
          required: true,
          canonicalSrgb: [52, 54, 58],
          maxAllowedOklabDeltaE: 0.06,
        },
        {
          slotId: "wrist-watch",
          category: "accessory",
          labelKo: "은장 손목시계",
          required: true,
          handedness: "left",
          canonicalSrgb: [188, 194, 202],
          maxAllowedOklabDeltaE: 0.075,
          importance: "signature",
        },
        {
          slotId: "eye-patch",
          category: "eyewear",
          labelKo: "가죽 안대",
          required: true,
          handedness: "right",
          canonicalSrgb: [44, 34, 32],
          maxAllowedOklabDeltaE: 0.065,
          importance: "signature",
        },
        {
          slotId: "tactical-blade",
          category: "weapon",
          labelKo: "전술 단검",
          required: true,
          handedness: "left",
          canonicalSrgb: [120, 128, 138],
          maxAllowedOklabDeltaE: 0.08,
          importance: "signature",
        },
        {
          slotId: "evidence-pouch",
          category: "accessory",
          labelKo: "증거품 가죽 파우치",
          required: false,
          handedness: "right",
          canonicalSrgb: [112, 74, 48],
          maxAllowedOklabDeltaE: 0.07,
          importance: "standard",
        },
      ],
    },
    {
      characterId: "seo-jin",
      characterNameKo: "서진",
      outfitId: "casual-hoodie-nextday",
      outfitLabelKo: "다음 날 일상 후드 착장",
      slots: [
        {
          slotId: "ivory-hoodie",
          category: "top",
          labelKo: "아이보리 후드티",
          required: true,
          canonicalSrgb: [228, 222, 210],
          maxAllowedOklabDeltaE: 0.06,
          importance: "signature",
        },
        {
          slotId: "denim-slacks",
          category: "bottom",
          labelKo: "인디고 데님 팬츠",
          required: true,
          canonicalSrgb: [48, 66, 98],
          maxAllowedOklabDeltaE: 0.065,
        },
        {
          slotId: "wrist-watch",
          category: "accessory",
          labelKo: "은장 손목시계",
          required: true,
          handedness: "left",
          canonicalSrgb: [188, 194, 202],
          maxAllowedOklabDeltaE: 0.075,
          importance: "signature",
        },
      ],
    },
    {
      characterId: "ha-rin",
      characterNameKo: "하린",
      outfitId: "lab-coat-analyst",
      outfitLabelKo: "감식반 화이트 코트",
      slots: [
        {
          slotId: "lab-coat",
          category: "outerwear",
          labelKo: "화이트 감식 코트",
          required: true,
          canonicalSrgb: [238, 240, 242],
          maxAllowedOklabDeltaE: 0.055,
          importance: "signature",
        },
        {
          slotId: "gold-earring",
          category: "accessory",
          labelKo: "골드 드롭 귀걸이",
          required: true,
          handedness: "left",
          canonicalSrgb: [212, 174, 86],
          maxAllowedOklabDeltaE: 0.07,
          importance: "signature",
        },
        {
          slotId: "horn-glasses",
          category: "eyewear",
          labelKo: "하금테 안경",
          required: true,
          handedness: "center",
          canonicalSrgb: [64, 52, 46],
          maxAllowedOklabDeltaE: 0.07,
        },
      ],
    },
  ];

  return {
    episodeId: overrides?.episodeId ?? "EP-042",
    episodeTitleKo: overrides?.episodeTitleKo ?? "42화 빗속의 추격전",
    presets: overrides?.presets ?? defaultPresets,
    defaultOutfitByCharacter: overrides?.defaultOutfitByCharacter,
    defaultLightingToleranceDeltaE: overrides?.defaultLightingToleranceDeltaE ?? 0,
  };
}
