/**
 * 적용 플랜: 레시피·능력·카탈로그에서 플래너(state/apply-plan.ts)가 계산하고 엔진이 그대로 적용한다.
 * 엔진은 플랜을 해석하지 않는다(morph 이름·본 이름·partId만 본다).
 *
 * v3 필드(레시피 v3, 2026-10-23 CORE-1)는 전부 **선택**이다 — 모르는 엔진은 무시하고 v2와 같은 그림을 그린다(v2 레시피를 올린 플랜의
 * v2 필드는 v2 플래너 결과와 같다: `state/apply-plan.test.ts` 골든). 아는 엔진만 형태 가중치·채널 색·표면·헤어 흐름·소품·비례를 쓴다.
 */
import type { Proportion, ProportionKey } from "./art-style";
import type { ChannelKey } from "./color-channels";
import type { AccessoryAnchor, AccessoryInstanceId, AccessoryOffset, HairColor, PartScope, Surface } from "./customization";
import type { MaterialPresetId } from "./mesh-data";
import type { PhysicsProviderId } from "./physics";
import type { Pose } from "./pose";
import type { RecipeColors } from "./recipe";
import type { PresetId, SlotKind } from "./slots";

export interface ApplyPlanPart {
  readonly partId: number;
  readonly visible: boolean;
  readonly materialPreset: MaterialPresetId;
  /** 소문자 #rrggbb */
  readonly color?: string;
}

export interface UnsupportedSlot {
  readonly slot: SlotKind;
  readonly presetId: PresetId;
  readonly reasonKo: string;
}

/** 추가 소품 인스턴스(레시피 `wardrobe.accessories`). `slots.accessory`의 소품은 v2처럼 `parts`(역할 accessory)로 간다. */
export interface ApplyPlanAccessory {
  readonly id: AccessoryInstanceId;
  readonly presetId: PresetId;
  readonly anchor: AccessoryAnchor;
  readonly offset: AccessoryOffset;
  readonly materialPreset: MaterialPresetId;
  /** 카탈로그에 없거나 소스가 앵커·소품을 지원하지 않으면 false(사유는 `unsupportedCustom`) */
  readonly visible: boolean;
}

export const CUSTOMIZATION_KINDS = ["channel", "surface", "shape", "layer", "accessory", "proportion", "hair-color"] as const;
export type CustomizationKind = (typeof CUSTOMIZATION_KINDS)[number];

/** 소스가 지원하지 않아 적용하지 않은(또는 대신 부모 색으로 그려지는) 커스터마이즈와 한글 사유(대체 없음) */
export interface UnsupportedCustomization {
  readonly kind: CustomizationKind;
  /** 채널 키·`<범위>/<형태 이름>`·층·소품 id·`proportion`·`hairColor` */
  readonly key: string;
  readonly reasonKo: string;
}

export interface ApplyPlan {
  /** 레시피 revision(history와 동일 단조 증가) */
  readonly revision: number;
  /** morph 이름 → 가중치 [0,1] */
  readonly morphWeights: Readonly<Record<string, number>>;
  /** 본 이름 → 로컬 회전(정규화됨) */
  readonly boneRotations: Pose;
  readonly parts: ReadonlyArray<ApplyPlanPart>;
  /** 기본 8채널 색(v2와 같은 키) */
  readonly colors: RecipeColors;
  readonly physics: { readonly provider: PhysicsProviderId; readonly settleSteps: number };
  /** 미지원이라 적용하지 않은 슬롯과 사유(대체 없음) */
  readonly unsupported: ReadonlyArray<UnsupportedSlot>;

  // ---- v3 선택 필드 ----
  /** 파츠 범위 → `shape:<이름>:±` → 가중치 [0,1]. 그 범위 파츠 메시에만 적용한다(체형 morph와 더한다). */
  readonly partMorphWeights?: Readonly<Partial<Record<PartScope, Readonly<Record<string, number>>>>>;
  /** 비례 목표(키트 소스 전용 — 절차 소스는 지오메트리 재생성으로 반영하므로 null). 없거나 null이면 소스 고유 비례. */
  readonly proportion?: Proportion | null;
  /** 27채널 유효색(상속 해석 결과) */
  readonly channels?: Readonly<Record<ChannelKey, string>>;
  /** 채널별 재질·패턴(재질은 `parts[].materialPreset`에도 반영돼 있다) */
  readonly surfaces?: Readonly<Partial<Record<ChannelKey, Surface>>>;
  readonly hairColor?: HairColor;
  readonly accessories?: ReadonlyArray<ApplyPlanAccessory>;
  /** 소스 능력(`SourceCapabilities.custom`)이 주어졌을 때만 채운다 */
  readonly unsupportedCustom?: ReadonlyArray<UnsupportedCustomization>;
}

/** 비례 적용 결과(키트 근사): 목표·실제·범위 때문에 잘린 축 */
export interface ProportionReceipt {
  readonly target: Proportion;
  readonly achieved: Proportion;
  readonly clamped: readonly ProportionKey[];
}

export interface ApplyReceipt {
  readonly revision: number;
  readonly appliedMorphs: number;
  readonly appliedBones: number;
  /** 소스에 없어 건너뛴 morph 이름 */
  readonly skippedMorphs: readonly string[];
  readonly skippedBones: readonly string[];
  /** v3 선택: 비례를 적용했으면 그 결과 */
  readonly proportion?: ProportionReceipt;
  /** v3 선택: 범위 메시에 없어 건너뛴 형태 morph(`<범위>/shape:<이름>:±`) */
  readonly skippedShapes?: readonly string[];
}
