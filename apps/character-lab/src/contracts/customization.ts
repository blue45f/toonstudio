/**
 * 커스터마이즈 계약(레시피 v3, 2026-10-23 CORE-1): 겹쳐 입기 층·소품 인스턴스·앵커·파츠 형태 값·표면(재질·패턴)·헤어 색 흐름.
 * 사용자 요구 "많이 만들기보다 다양하게 커스텀"의 구성 공간을 레시피에 저장하는 모양이다(설계 §2.2·§2.3, 결정 K7·K8).
 *
 * - 층: 같은 슬롯 프리셋(top/* 또는 bottom/*)을 inner·outer·legwear 층에 **추가로** 입힌다(SlotKind는 그대로 15개).
 *   로더는 층에 입힌 파츠의 역할을 층 이름(inner·outer·legwear)으로, 채널을 `LAYER_CHANNEL_MAP`으로 바꾼다.
 * - 소품: `slots.accessory` 1개 + `wardrobe.accessories` 최대 11개 = 12개. 인스턴스마다 앵커 14곳 중 하나와 미세 오프셋을 가진다.
 * - 형태: 파츠 범위(`PartScope`)별 `{ 형태 이름: −1..1 }`. 플래너가 `shape:<이름>:±` morph 가중치로 바꿔 그 범위 메시에만 준다.
 * - 표면: 채널별 재질 프리셋과 패턴(두 번째 색 = 다른 채널). 패턴 UV는 키트 v2 UV1(밀도 메타)을 쓴다.
 * - 헤어 색 흐름: 헤어 UV1.v(뿌리 0 → 끝 1) 그라데이션 구간·끝 색 섞기·포인트 위치.
 */
import { z } from "zod";

import { CHANNEL_KEYS } from "./color-channels";
import { FACS_UNITS } from "./expression";
import { MATERIAL_PRESET_IDS } from "./mesh-data";
import { SHAPE_NAME_MAX_LENGTH, isShapeName } from "./morph-names";
import { FACE_PARAM_KEYS } from "./params";
import { isPresetId, presetSlot } from "./slots";

import type { HumanoidBoneName } from "./bones";
import type { ChannelKey } from "./color-channels";
import type { PartRole } from "./mesh-data";
import type { PresetId } from "./slots";

// ---------------------------------------------------------------- 겹쳐 입기 층

export const WARDROBE_LAYERS = ["inner", "outer", "legwear"] as const;
export type WardrobeLayer = (typeof WARDROBE_LAYERS)[number];

export const WARDROBE_LAYER_LABELS_KO: Readonly<Record<WardrobeLayer, string>> = { inner: "이너", outer: "아우터", legwear: "레그웨어" };

/** 층에 입힐 수 있는 프리셋 슬롯 */
export const WARDROBE_LAYER_SLOT: Readonly<Record<WardrobeLayer, "top" | "bottom">> = { inner: "top", outer: "top", legwear: "bottom" };

/** 층에 입힌 파츠의 역할(로더가 바꾼다) */
export const WARDROBE_LAYER_ROLE: Readonly<Record<WardrobeLayer, PartRole>> = { inner: "inner", outer: "outer", legwear: "legwear" };

/**
 * 층에 입힐 때의 채널 이름 바꾸기(키트 v2 재질 `channel`·절차 의상 하위 파츠 공통).
 * inner에는 포인트 채널이 없어 상의 포인트(`top-accent`)를 같이 쓰고, legwear는 단 채널이 없어 본체 채널로 합친다.
 */
export const LAYER_CHANNEL_MAP: Readonly<Record<WardrobeLayer, Readonly<Partial<Record<ChannelKey, ChannelKey>>>>> = {
  inner: { top: "inner", "top-trim": "inner-trim", "top-accent": "top-accent" },
  outer: { top: "outer", "top-trim": "outer-trim", "top-accent": "outer-accent" },
  legwear: { bottom: "legwear", "bottom-trim": "legwear" },
};

/** 층에 입힌 파츠의 채널. 표에 없는 채널(그 슬롯 계열이 아닌 채널)은 그대로 둔다. */
export function layerChannel(layer: WardrobeLayer, channel: ChannelKey): ChannelKey {
  return LAYER_CHANNEL_MAP[layer][channel] ?? channel;
}

/** 프리셋 id가 그 층에 입힐 수 있는 슬롯인지 */
export function isLayerPreset(layer: WardrobeLayer, presetId: unknown): presetId is PresetId {
  return isPresetId(presetId) && presetSlot(presetId) === WARDROBE_LAYER_SLOT[layer];
}

// ---------------------------------------------------------------- 소품 앵커·인스턴스

export const ACCESSORY_ANCHORS = [
  "head-top",
  "hair",
  "face",
  "ear-l",
  "ear-r",
  "neck",
  "wrist-l",
  "wrist-r",
  "waist",
  "back",
  "hand-l",
  "hand-r",
  "foot-l",
  "foot-r",
] as const;
export type AccessoryAnchor = (typeof ACCESSORY_ANCHORS)[number];

export const ACCESSORY_ANCHOR_LABELS_KO: Readonly<Record<AccessoryAnchor, string>> = {
  "head-top": "정수리",
  hair: "머리카락",
  face: "얼굴",
  "ear-l": "왼쪽 귀",
  "ear-r": "오른쪽 귀",
  neck: "목",
  "wrist-l": "왼쪽 손목",
  "wrist-r": "오른쪽 손목",
  waist: "허리",
  back: "등",
  "hand-l": "왼손",
  "hand-r": "오른손",
  "foot-l": "왼발",
  "foot-r": "오른발",
};

/**
 * 앵커가 따라가는 휴머노이드 본(강체 소품을 이 본의 자식으로 붙인다). 손목은 손 굽힘에 같이 돌지 않도록 아래팔에 붙이고
 * 손목 위치까지의 오프셋은 소스 앵커 표(키트 v2 `anchors`)가 준다.
 */
export const ACCESSORY_ANCHOR_BONES: Readonly<Record<AccessoryAnchor, HumanoidBoneName>> = {
  "head-top": "head",
  hair: "head",
  face: "head",
  "ear-l": "head",
  "ear-r": "head",
  neck: "neck",
  "wrist-l": "leftLowerArm",
  "wrist-r": "rightLowerArm",
  waist: "hips",
  back: "upperChest",
  "hand-l": "leftHand",
  "hand-r": "rightHand",
  "foot-l": "leftFoot",
  "foot-r": "rightFoot",
};

/** `slots.accessory` 외에 더 얹을 수 있는 소품 수(합계 12) */
export const MAX_EXTRA_ACCESSORIES = 11;
/** 인스턴스 id `acc-<1..99>` */
export const ACCESSORY_INSTANCE_ID_PATTERN = /^acc-[1-9][0-9]?$/u;
export type AccessoryInstanceId = `acc-${number}`;

export function isAccessoryInstanceId(value: unknown): value is AccessoryInstanceId {
  return typeof value === "string" && ACCESSORY_INSTANCE_ID_PATTERN.test(value);
}

/** 가장 작은 빈 인스턴스 id(acc-1부터). 99개를 다 쓰면 null. */
export function nextAccessoryInstanceId(used: readonly string[]): AccessoryInstanceId | null {
  const taken = new Set(used);
  for (let n = 1; n <= 99; n += 1) {
    const id: AccessoryInstanceId = `acc-${n}`;
    if (!taken.has(id)) return id;
  }
  return null;
}

const tMm = z.number().min(-60).max(60);
const rDeg = z.number().min(-180).max(180);

/** 앵커 기준 오프셋: 평행이동(mm, 앵커 본 로컬)·회전(XYZ 오일러, 도)·균일 배율 */
export const accessoryOffsetSchema = z
  .object({
    tMm: z.tuple([tMm, tMm, tMm]),
    rDeg: z.tuple([rDeg, rDeg, rDeg]),
    scale: z.number().min(0.5).max(1.5),
  })
  .strict();
export type AccessoryOffset = z.infer<typeof accessoryOffsetSchema>;

export const DEFAULT_ACCESSORY_OFFSET: AccessoryOffset = Object.freeze({ tMm: [0, 0, 0], rDeg: [0, 0, 0], scale: 1 }) as AccessoryOffset;

const accessoryPresetIdSchema = z.custom<PresetId>((value) => isPresetId(value) && presetSlot(value) === "accessory", {
  message: "소품 프리셋 id는 accessory/<이름> 형식이어야 합니다.",
});

export const accessoryInstanceIdSchema = z.custom<AccessoryInstanceId>((value) => isAccessoryInstanceId(value), {
  message: "소품 인스턴스 id는 acc-<1~99> 형식이어야 합니다.",
});

export const accessoryInstanceSchema = z
  .object({
    id: accessoryInstanceIdSchema,
    presetId: accessoryPresetIdSchema,
    anchor: z.enum(ACCESSORY_ANCHORS),
    offset: accessoryOffsetSchema,
  })
  .strict();
export type AccessoryInstance = z.infer<typeof accessoryInstanceSchema>;

const layerPresetSchema = (layer: WardrobeLayer) =>
  z.custom<PresetId>((value) => isLayerPreset(layer, value), { message: `${WARDROBE_LAYER_LABELS_KO[layer]} 층에는 ${WARDROBE_LAYER_SLOT[layer]}/<이름> 프리셋만 입힐 수 있습니다.` });

export const wardrobeSchema = z
  .object({
    inner: layerPresetSchema("inner").nullable(),
    outer: layerPresetSchema("outer").nullable(),
    legwear: layerPresetSchema("legwear").nullable(),
    accessories: z.array(accessoryInstanceSchema).max(MAX_EXTRA_ACCESSORIES, `추가 소품은 최대 ${MAX_EXTRA_ACCESSORIES}개입니다(슬롯 1개 포함 12개).`),
  })
  .strict()
  .superRefine((wardrobe, ctx) => {
    const seen = new Set<string>();
    wardrobe.accessories.forEach((instance, index) => {
      if (seen.has(instance.id)) ctx.addIssue({ code: "custom", message: `소품 인스턴스 id가 중복되었습니다: ${instance.id}`, path: ["accessories", index, "id"] });
      seen.add(instance.id);
    });
  });
export type Wardrobe = z.infer<typeof wardrobeSchema>;

export function createDefaultWardrobe(): Wardrobe {
  return { inner: null, outer: null, legwear: null, accessories: [] };
}

// ---------------------------------------------------------------- 파츠 형태 값

/** 고정 파츠 범위(소품 인스턴스는 `acc-<n>`) */
export const PART_SCOPES = ["hair", "top", "inner", "outer", "bottom", "legwear", "shoes", "accessory"] as const;
export type FixedPartScope = (typeof PART_SCOPES)[number];
export type PartScope = FixedPartScope | AccessoryInstanceId;

const PART_SCOPE_SET: ReadonlySet<string> = new Set(PART_SCOPES);

export function isPartScope(value: unknown): value is PartScope {
  return typeof value === "string" && (PART_SCOPE_SET.has(value) || isAccessoryInstanceId(value));
}

/** 범위 하나에 둘 수 있는 형태 이름 수(키트 v2 파츠 `shapes` ≤ 8과 같다) */
export const MAX_SHAPES_PER_SCOPE = 8;

export const partScopeSchema = z.custom<PartScope>((value) => isPartScope(value), {
  message: "파츠 범위는 hair·top·inner·outer·bottom·legwear·shoes·accessory·acc-<n> 중 하나여야 합니다.",
});
export const shapeNameSchema = z.custom<string>((value) => isShapeName(value), {
  message: `형태 이름은 소문자로 시작하는 ${SHAPE_NAME_MAX_LENGTH}자 이하 식별자여야 합니다.`,
});

export const partShapeValuesSchema = z
  .record(shapeNameSchema, z.number().min(-1).max(1))
  .refine((values) => Object.keys(values).length <= MAX_SHAPES_PER_SCOPE, { message: `파츠 범위 하나의 형태 값은 최대 ${MAX_SHAPES_PER_SCOPE}개입니다.` });
export type PartShapeValues = z.infer<typeof partShapeValuesSchema>;

/** 레시피 `partParams`: 범위 → { 형태 이름 → −1..1 }. 0 값과 빈 범위는 저장하지 않는다(정규형, reducer가 지킨다). */
export const partParamsSchema = z.partialRecord(partScopeSchema, partShapeValuesSchema);
export type PartParams = z.infer<typeof partParamsSchema>;

// ---------------------------------------------------------------- 표면(재질·패턴)

export const PATTERN_KINDS = ["stripe", "check", "gingham", "dot", "plaid", "flower"] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];

export const PATTERN_LABELS_KO: Readonly<Record<PatternKind, string>> = {
  stripe: "줄무늬",
  check: "체크",
  gingham: "깅엄",
  dot: "도트",
  plaid: "타탄",
  flower: "꽃무늬",
};

export const surfacePatternSchema = z
  .object({
    kind: z.enum(PATTERN_KINDS),
    /** 무늬 한 주기의 실제 크기(cm, UV1 밀도 메타로 환산) */
    scaleCm: z.number().min(0.3).max(30),
    angleDeg: z.number().min(-90).max(90),
    /** 두 번째 색이 차지하는 비율 */
    ratio: z.number().min(0.05).max(0.95),
    /** 두 번째 색 채널(바탕 채널과 달라야 한다 — 레시피 교차 검증) */
    inkChannel: z.enum(CHANNEL_KEYS),
  })
  .strict();
export type SurfacePattern = z.infer<typeof surfacePatternSchema>;

export const surfaceSchema = z
  .object({
    material: z.enum(MATERIAL_PRESET_IDS),
    pattern: surfacePatternSchema.nullable(),
  })
  .strict();
export type Surface = z.infer<typeof surfaceSchema>;

export const surfacesSchema = z.partialRecord(z.enum(CHANNEL_KEYS), surfaceSchema);
export type Surfaces = z.infer<typeof surfacesSchema>;

// ---------------------------------------------------------------- 헤어 색 흐름

export const HAIR_ACCENT_MODES = ["none", "streak", "inner"] as const;
export type HairAccentMode = (typeof HAIR_ACCENT_MODES)[number];

const unit = z.number().min(0).max(1);

export const hairColorSchema = z
  .object({
    /** 끝 색(hair-tip) 그라데이션 구간: UV1.v 시작·끝(시작 ≤ 끝) */
    gradient: z.tuple([unit, unit]),
    /** 끝 색 섞는 양(0 = 끝 색 없음 → v2와 같은 그림) */
    tipMix: unit,
    /** 포인트 색(hair-accent) 위치: 없음·브릿지 줄기·안쪽 층 */
    accent: z.enum(HAIR_ACCENT_MODES),
  })
  .strict()
  .refine((hair) => hair.gradient[0] <= hair.gradient[1], { message: "헤어 그라데이션 구간은 시작 ≤ 끝이어야 합니다.", path: ["gradient"] });
export type HairColor = z.infer<typeof hairColorSchema>;

/** 기본 헤어 색 흐름(tipMix 0·포인트 없음이라 v2와 같은 그림) */
export const DEFAULT_HAIR_COLOR: HairColor = Object.freeze({ gradient: Object.freeze([0.6, 1]), tipMix: 0, accent: "none" }) as HairColor;

export function createDefaultHairColor(): HairColor {
  return { gradient: [DEFAULT_HAIR_COLOR.gradient[0], DEFAULT_HAIR_COLOR.gradient[1]], tipMix: DEFAULT_HAIR_COLOR.tipMix, accent: DEFAULT_HAIR_COLOR.accent };
}

/** 헤어 색 흐름이 v2와 다른 그림을 요구하는지(끝 색 섞기·포인트) */
export function hairColorIsActive(hair: HairColor): boolean {
  return hair.tipMix > 0 || hair.accent !== "none";
}

// ---------------------------------------------------------------- 화풍 얼굴 바인딩(style/apply)

/**
 * 화풍 팩의 얼굴 범위를 레시피 값으로 옮긴 결과(소스별 매핑은 프리셋 데이터 `presets/art-style-lab-bindings.ts`가 만든다).
 * reducer는 팩 데이터를 import할 수 없으므로(영역 경계) `style/apply` 명령이 이 값을 싣고 온다.
 */
export const styleFaceBindingSchema = z
  .object({
    /** 덮어쓸 얼굴 파라미터 값(나열한 키만, copy-on-apply) */
    face: z.partialRecord(z.enum(FACE_PARAM_KEYS), z.number().min(-1).max(1)),
    /** 눈·눈동자 프리셋(카탈로그 patch를 함께 적용한 뒤 face 값을 덮는다) */
    slots: z
      .object({
        eyes: z.custom<PresetId>((value) => isPresetId(value) && presetSlot(value) === "eyes", { message: "eyes/<이름> 프리셋이어야 합니다." }).optional(),
        irises: z.custom<PresetId>((value) => isPresetId(value) && presetSlot(value) === "irises", { message: "irises/<이름> 프리셋이어야 합니다." }).optional(),
      })
      .strict(),
    /** 화풍의 중립 표정(레시피 `style.neutralFacs`, 플래너가 표정 가중치에 더한다) */
    neutralFacs: z.partialRecord(z.enum(FACS_UNITS), z.number().min(0).max(1)),
  })
  .strict();
export type StyleFaceBinding = z.infer<typeof styleFaceBindingSchema>;
