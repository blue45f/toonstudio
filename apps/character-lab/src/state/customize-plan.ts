/**
 * 레시피 v3 플랜 필드 계산(2026-10-23 CORE-1): 형태 morph 가중치·비례·채널 유효색·표면·헤어 색 흐름·추가 소품·커스터마이즈 미지원 사유.
 * `apply-plan.ts`가 부른다. 모두 **선택 필드**라 모르는 엔진은 무시한다 — v2 레시피를 올린 레시피(커스터마이즈 없음)에서는
 * 형태·소품·표면이 비고 채널은 상속값이라 그림이 v2와 같다.
 *
 * 미지원 사유(`unsupportedCustom`, 대체 없음):
 * - 플래너가 언제나 아는 것: 층의 바탕 슬롯(상의·하의)·액세서리 슬롯 능력이 unavailable, 카탈로그에 없는 소품 프리셋, 제작 패키지 소스의 비례 목표.
 * - 소스 커스터마이즈 능력(`CustomCapabilities`, 엔진 `SourceCapabilities.custom`)이 주어지면 더하는 것: 직접 지정한 상속 채널·
 *   패턴(UV1)·헤어 흐름(UV1)·층·앵커·형태 이름·비례의 미지원. 능력이 없으면(v2 엔진) 이 부분은 만들지 않는다.
 */
import {
  ACCESSORY_ANCHOR_LABELS_KO,
  CHANNEL_KEYS,
  CHANNEL_LABELS_KO,
  FACS_UNITS,
  SLOT_LABELS_KO,
  WARDROBE_LAYERS,
  WARDROBE_LAYER_LABELS_KO,
  WARDROBE_LAYER_SLOT,
  customReasonKey,
  hairColorIsActive,
  isAccessoryInstanceId,
  isBaseChannelKey,
  resolveChannelColors,
  shapeToMorphWeights,
} from "../contracts";

import type {
  ApplyPlanAccessory,
  ChannelKey,
  CharacterRecipe,
  CustomCapabilities,
  ExpressionWeights,
  MaterialPresetId,
  PartRole,
  PartScope,
  PresetCatalog,
  PresetId,
  Proportion,
  SlotCapability,
  SlotCapabilityMap,
  SlotKind,
  Surface,
  UnsupportedCustomization,
  WardrobeLayer,
} from "../contracts";

/** 층 역할 → 옷장 층 */
export const LAYER_OF_ROLE: Readonly<Partial<Record<PartRole, WardrobeLayer>>> = { inner: "inner", outer: "outer", legwear: "legwear" };

/** 표정 + 화풍 중립 표정(같은 유닛은 더하고 1로 자른다) */
export function addNeutralFacs(expression: ExpressionWeights, neutral: ExpressionWeights): ExpressionWeights {
  const result: ExpressionWeights = {};
  for (const unit of FACS_UNITS) {
    const value = (expression[unit] ?? 0) + (neutral[unit] ?? 0);
    if (value > 0) result[unit] = Math.min(1, value);
  }
  return result;
}

export interface CustomizePlanInput {
  readonly recipe: CharacterRecipe;
  readonly capabilities: SlotCapabilityMap;
  readonly catalog: PresetCatalog;
  /** 슬롯 플래너가 미지원으로 판정한 슬롯 */
  readonly unsupportedSlots: ReadonlySet<SlotKind>;
  /** 프리셋 단위 미제공 사유(`presetUnavailableReasonKo`, 슬롯 플래너와 같은 판정) */
  readonly presetUnavailableReason: (capability: SlotCapability, presetId: PresetId) => string | null;
  readonly materialPresetFor: (role: PartRole, presetId: PresetId | null) => MaterialPresetId;
  readonly custom?: CustomCapabilities;
}

export interface CustomizePlanFields {
  readonly partMorphWeights: Readonly<Partial<Record<PartScope, Readonly<Record<string, number>>>>>;
  readonly proportion: Proportion | null;
  readonly channels: Readonly<Record<ChannelKey, string>>;
  readonly surfaces: Readonly<Partial<Record<ChannelKey, Surface>>>;
  readonly hairColor: CharacterRecipe["hairColor"];
  readonly accessories: readonly ApplyPlanAccessory[];
  readonly unsupportedCustom: readonly UnsupportedCustomization[];
}

function reasonOf(custom: CustomCapabilities, key: string, fallbackKo: string): string {
  const reason = custom.reasonsKo[key];
  return typeof reason === "string" && reason.trim() !== "" ? reason : fallbackKo;
}

/** 층이 이 소스에서 그려지는지(바탕 슬롯 능력·소스 커스터마이즈 능력). 그려지지 않으면 한글 사유. */
export function layerUnavailableReasonKo(layer: WardrobeLayer, capabilities: SlotCapabilityMap, custom?: CustomCapabilities): string | null {
  const slot = WARDROBE_LAYER_SLOT[layer];
  if (capabilities[slot].status === "unavailable") return capabilities[slot].reasonKo ?? `${SLOT_LABELS_KO[slot]} 슬롯을 소스가 지원하지 않아 ${WARDROBE_LAYER_LABELS_KO[layer]} 층도 입힐 수 없습니다.`;
  if (custom && !custom.layers.includes(layer)) return reasonOf(custom, customReasonKey("layer", layer), `이 소스는 ${WARDROBE_LAYER_LABELS_KO[layer]} 층을 지원하지 않습니다.`);
  return null;
}

function planAccessories(input: CustomizePlanInput, push: (item: UnsupportedCustomization) => void): ApplyPlanAccessory[] {
  const { recipe, capabilities, catalog, custom } = input;
  const slotCapability = capabilities.accessory;
  return recipe.wardrobe.accessories.map((instance) => {
    let reason: string | null;
    if (slotCapability.status === "unavailable") reason = slotCapability.reasonKo ?? `${SLOT_LABELS_KO.accessory} 슬롯을 소스가 지원하지 않습니다.`;
    else if (!catalog.get(instance.presetId)) reason = `카탈로그에 없는 프리셋입니다: ${instance.presetId}`;
    else reason = input.presetUnavailableReason(slotCapability, instance.presetId);
    if (reason === null && custom && !custom.anchors.includes(instance.anchor)) {
      reason = reasonOf(custom, customReasonKey("anchor", instance.anchor), `이 소스는 ${ACCESSORY_ANCHOR_LABELS_KO[instance.anchor]} 앵커에 소품을 붙일 수 없습니다.`);
    }
    if (reason !== null) push({ kind: "accessory", key: instance.id, reasonKo: reason });
    return {
      id: instance.id,
      presetId: instance.presetId,
      anchor: instance.anchor,
      offset: instance.offset,
      materialPreset: input.materialPresetFor("accessory", instance.presetId),
      visible: reason === null,
    };
  });
}

/** 형태 범위가 지금 입고 있는(그려지는) 파츠인지 */
function scopeActive(scope: PartScope, input: CustomizePlanInput, visibleInstances: ReadonlySet<string>): boolean {
  const { recipe, unsupportedSlots, capabilities, custom } = input;
  if (isAccessoryInstanceId(scope)) return visibleInstances.has(scope);
  if ((WARDROBE_LAYERS as readonly string[]).includes(scope)) {
    const layer = scope as WardrobeLayer;
    return recipe.wardrobe[layer] !== null && layerUnavailableReasonKo(layer, capabilities, custom) === null;
  }
  const slot = scope as SlotKind;
  return recipe.slots[slot] !== null && !unsupportedSlots.has(slot);
}

export function planCustomization(input: CustomizePlanInput): CustomizePlanFields {
  const { recipe, capabilities, custom } = input;
  const unsupportedCustom: UnsupportedCustomization[] = [];
  const push = (item: UnsupportedCustomization): void => {
    unsupportedCustom.push(item);
  };

  // 층: 입힌 층만 판정한다
  for (const layer of WARDROBE_LAYERS) {
    if (recipe.wardrobe[layer] === null) continue;
    const reason = layerUnavailableReasonKo(layer, capabilities, custom);
    if (reason !== null) push({ kind: "layer", key: layer, reasonKo: reason });
  }

  const accessories = planAccessories(input, push);
  const visibleInstances = new Set(accessories.filter((item) => item.visible).map((item) => item.id));

  // 형태: 그려지는 범위만, 능력이 있으면 선언된 이름만
  const partMorphWeights: Partial<Record<PartScope, Readonly<Record<string, number>>>> = {};
  for (const scope of Object.keys(recipe.partParams).sort() as PartScope[]) {
    const values = recipe.partParams[scope];
    if (values === undefined || !scopeActive(scope, input, visibleInstances)) continue;
    let kept: Readonly<Record<string, number>> = values;
    if (custom) {
      // 소품 인스턴스(acc-<n>)는 프리셋마다 형태 키가 달라 소스가 인스턴스 범위로 따로 보고한다.
      const declared = new Set(custom.shapes[scope] ?? []);
      const filtered: Record<string, number> = {};
      for (const [name, value] of Object.entries(values)) {
        if (declared.has(name)) filtered[name] = value;
        else push({ kind: "shape", key: `${scope}/${name}`, reasonKo: reasonOf(custom, customReasonKey("shape", scope), `이 파츠(${scope})에는 형태 키 ${name}이(가) 없습니다.`) });
      }
      kept = filtered;
    }
    const weights = shapeToMorphWeights(kept);
    if (Object.keys(weights).length > 0) partMorphWeights[scope] = weights;
  }

  // 채널: 유효색은 언제나 내고, 능력이 있으면 직접 지정한 상속 채널 중 따로 못 칠하는 것을 알린다.
  // 순서는 계약 순서(CHANNEL_KEYS)다 — 레시피 객체의 키 삽입 순서(편집 이력·파일 정렬)에 따라 플랜이 달라지지 않게 한다.
  const channels = resolveChannelColors(recipe.colors);
  if (custom) {
    for (const key of CHANNEL_KEYS) {
      if (recipe.colors[key] === undefined || isBaseChannelKey(key) || custom.channels.includes(key)) continue;
      push({ kind: "channel", key, reasonKo: reasonOf(custom, customReasonKey("channel", key), `이 소스는 ${CHANNEL_LABELS_KO[key]} 채널을 따로 칠할 수 없습니다.`) });
    }
    for (const channel of CHANNEL_KEYS) {
      if (recipe.surfaces[channel]?.pattern && !custom.patternUv) push({ kind: "surface", key: channel, reasonKo: reasonOf(custom, customReasonKey("patternUv"), "이 소스는 패턴용 UV가 없어 무늬를 그릴 수 없습니다.") });
    }
    if (hairColorIsActive(recipe.hairColor) && !custom.hairFlow) {
      push({ kind: "hair-color", key: "hairColor", reasonKo: reasonOf(custom, customReasonKey("hairFlow"), "이 소스의 헤어는 끝 색·포인트를 그릴 수 없습니다.") });
    }
  }

  // 비례: 키트만 플랜으로 근사한다(절차 소스는 지오메트리 재생성으로 반영, 제작 패키지는 미지원)
  const target = recipe.style.proportion;
  let proportion: Proportion | null = null;
  if (target !== null) {
    if (recipe.source.kind === "package") {
      push({ kind: "proportion", key: "proportion", reasonKo: "제작 패키지 소스는 비례 목표를 지원하지 않습니다." });
    } else if (recipe.source.kind === "kit") {
      if (custom && custom.proportion === "unavailable") push({ kind: "proportion", key: "proportion", reasonKo: reasonOf(custom, customReasonKey("proportion"), "이 소스는 비례 목표를 지원하지 않습니다.") });
      else proportion = target;
    }
  }

  return {
    partMorphWeights,
    proportion,
    channels,
    surfaces: recipe.surfaces,
    hairColor: recipe.hairColor,
    accessories,
    unsupportedCustom,
  };
}
