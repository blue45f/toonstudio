/**
 * 키트 커스터마이즈 적용 시점 판정(순수, 레시피 v3 — 2026-10-23 A-1). 지금 레시피의 층·추가 소품·형태 값·채널 색·표면(무늬)·헤어 색·비례 목표를
 * 키트 계획(올린 파일)과 대조해 그리지 못하는 것을 한글 사유로 낸다(계약 `UnsupportedCustomization`, 대체 없음).
 *
 * 왜 계획에 넣지 않고 따로 판정하나: 계획은 지오메트리 키가 바뀔 때만 다시 만들어진다. 형태 값·표면·헤어 색·비례 목표는 슬라이더처럼 자주 바뀌는
 * 적용 시점 값이라 계획에 넣으면 낡는다. 그래서 계획에는 판정 근거(범위별 형태 키와 값 범위·채널·채널별 무늬 UV1·헤어 흐름 UV1·올리지 못한 층과 소품)만 싣고,
 * 이 함수가 현재 레시피로 대조한다.
 *
 * 계약 `CustomCapabilities`(state 플래너 `planCustomization`이 쓰는 값)보다 세밀한 것: 반쪽 형태 키(+만 있는 키에 −값), 채널별 무늬 UV1,
 * 스킨 소품·예산 때문에 못 올린 소품 인스턴스, 계획보다 새 옷장(층·소품이 아직 올라가지 않음). 순서는 state 플래너와 같다:
 * 층 → 소품 → 형태(범위 이름순) → 채널(계약 순서) → 표면(계약 순서) → 헤어 색 → 비례. 입지 않은 파츠의 형태 값·무늬는 보관값이라 알리지 않는다(state 플래너와 같다).
 */
import {
  ACCESSORY_ANCHOR_LABELS_KO,
  CHANNEL_FAMILY,
  CHANNEL_KEYS,
  CHANNEL_LABELS_KO,
  WARDROBE_LAYERS,
  WARDROBE_LAYER_LABELS_KO,
  customReasonKey,
  hairColorIsActive,
  isBaseChannelKey,
} from "../../contracts";

import { shapeDisplayKo } from "./custom-labels";
import { kitFileLabelKo, kitV1CustomCapabilities } from "./kit-custom-capability";
import { listFew } from "./kit-plan-common";
import { isKitPlanV2 } from "./kit-plan-v2-types";
import { meshChannels, sortChannels } from "./kit-v2-mesh-info";

import type { KitPlanCustom, KitPlanFile, KitPlanV2 } from "./kit-plan-v2-types";
import type { ChannelKey, CharacterRecipe, CustomCapabilities, KitPlan, PartScope, UnsupportedCustomization } from "../../contracts";

/** 판정에 쓰는 레시피 부분 */
export type KitCustomizationRecipe = Pick<CharacterRecipe, "slots" | "colors" | "wardrobe" | "partParams" | "surfaces" | "hairColor" | "style">;

type Push = (kind: UnsupportedCustomization["kind"], key: string, reasonKo: string) => void;

function reasonOf(capabilities: CustomCapabilities, key: string, fallbackKo: string): string {
  const reason = capabilities.reasonsKo[key];
  return typeof reason === "string" && reason.trim() !== "" ? reason : fallbackKo;
}

/** 범위 파일이 지금 레시피의 프리셋과 같은지(옷장이 바뀌고 계획이 아직 그대로면 다르다) */
function currentPreset(recipe: KitCustomizationRecipe, file: KitPlanFile): boolean {
  if (file.kind === "layer" && file.layer !== null) return recipe.wardrobe[file.layer] === file.presetId;
  if (file.kind === "accessory") return recipe.wardrobe.accessories.some((instance) => instance.id === file.instanceId && instance.presetId === file.presetId);
  return file.slot !== null && recipe.slots[file.slot] === file.presetId;
}

function diagnoseWardrobe(custom: KitPlanCustom, recipe: KitCustomizationRecipe, push: Push): void {
  const { files, skipped, capabilities } = custom;
  for (const layer of WARDROBE_LAYERS) {
    const presetId = recipe.wardrobe[layer];
    if (presetId === null) continue;
    if (files.some((file) => file.kind === "layer" && file.layer === layer && file.presetId === presetId)) continue;
    const skip = skipped.find((entry) => entry.kind === "layer" && entry.key === layer && entry.presetId === presetId);
    push("layer", layer, skip?.reasonKo ?? `${WARDROBE_LAYER_LABELS_KO[layer]} 층(${presetId})이 아직 올라가지 않았습니다(옷장이 바뀐 뒤 키트 계획을 다시 만들어야 합니다).`);
  }
  for (const instance of recipe.wardrobe.accessories) {
    if (files.some((file) => file.kind === "accessory" && file.instanceId === instance.id && file.presetId === instance.presetId)) {
      if (!capabilities.anchors.includes(instance.anchor)) {
        push("accessory", instance.id, reasonOf(capabilities, customReasonKey("anchor", instance.anchor), `이 소스는 ${ACCESSORY_ANCHOR_LABELS_KO[instance.anchor]} 앵커에 소품을 붙일 수 없습니다.`));
      }
      continue;
    }
    const skip = skipped.find((entry) => entry.kind === "accessory" && entry.key === instance.id && entry.presetId === instance.presetId);
    push("accessory", instance.id, skip?.reasonKo ?? `소품 ${instance.id}(${instance.presetId})이 아직 올라가지 않았습니다(옷장이 바뀐 뒤 키트 계획을 다시 만들어야 합니다).`);
  }
}

function diagnoseShapes(custom: KitPlanCustom, recipe: KitCustomizationRecipe, push: Push): void {
  for (const scope of Object.keys(recipe.partParams).sort() as PartScope[]) {
    const values = recipe.partParams[scope];
    const file = custom.files.find((candidate) => candidate.scope === scope);
    // 입지 않았거나(보관값) 계획이 옛 옷장이면 판정하지 않는다 — 옛 옷장은 층·소품 사유가 따로 알린다.
    if (values === undefined || file === undefined || !currentPreset(recipe, file)) continue;
    const target = kitFileLabelKo(file);
    for (const [name, value] of Object.entries(values)) {
      if (value === 0) continue;
      const shape = file.shapes.find((candidate) => candidate.name === name);
      const key = `${scope}/${name}`;
      if (shape === undefined) push("shape", key, `지금 고른 ${target}에는 형태 키 ${shapeDisplayKo(name)}이(가) 없습니다.`);
      else if (value < 0 && shape.min === 0) push("shape", key, `${target}의 ${shapeDisplayKo(name)}은(는) + 방향만 있어 ${value.toFixed(2)}을(를) 그릴 수 없습니다.`);
      else if (value > 0 && shape.max === 0) push("shape", key, `${target}의 ${shapeDisplayKo(name)}은(는) − 방향만 있어 +${value.toFixed(2)}을(를) 그릴 수 없습니다.`);
    }
  }
}

function diagnoseSurfaces(custom: KitPlanCustom, recipe: KitCustomizationRecipe, push: Push): void {
  for (const channel of CHANNEL_KEYS) {
    if (!recipe.surfaces[channel]?.pattern) continue;
    const painting = custom.files.filter((file) => file.channels.includes(channel));
    if (painting.length === 0 || custom.patternChannels.includes(channel)) continue;
    const lacking = painting.filter((file) => file.meshes.some((mesh) => meshChannels(mesh, custom.materials).includes(channel) && mesh.uv1?.purpose !== "pattern")).map(kitFileLabelKo);
    push("surface", channel, `${CHANNEL_LABELS_KO[channel]} 채널을 칠하는 메시에 패턴용 UV1이 없는 파츠가 있어 무늬를 그릴 수 없습니다: ${listFew(lacking)}.`);
  }
}

function diagnoseV2(plan: KitPlanV2, recipe: KitCustomizationRecipe, push: Push): void {
  const { custom } = plan;
  const capabilities = custom.capabilities;
  diagnoseWardrobe(custom, recipe, push);
  diagnoseShapes(custom, recipe, push);
  for (const key of CHANNEL_KEYS) {
    if (recipe.colors[key] === undefined || isBaseChannelKey(key) || capabilities.channels.includes(key)) continue;
    push("channel", key, reasonOf(capabilities, customReasonKey("channel", key), `이 소스는 ${CHANNEL_LABELS_KO[key]} 채널을 따로 칠할 수 없습니다.`));
  }
  diagnoseSurfaces(custom, recipe, push);
  const hairWorn = custom.files.some((file) => file.kind === "part" && file.slot === "hair");
  if (hairWorn && hairColorIsActive(recipe.hairColor) && !capabilities.hairFlow) {
    push("hair-color", "hairColor", reasonOf(capabilities, customReasonKey("hairFlow"), "이 소스의 헤어는 끝 색·포인트를 그릴 수 없습니다."));
  }
  // 비례: v2 베이스는 머리 높이로 본 균일 배율 근사(partial)라 미지원 항목이 아니다(근사 결과는 적용 영수증 `proportion`).
}

/** v1 계획이 칠하는 기본 채널(재질 colorKey) */
function v1PaintedChannels(plan: KitPlan): ReadonlySet<ChannelKey> {
  const keys: ChannelKey[] = [];
  for (const material of Object.values(plan.materials)) if (material.tint.mode === "recolor") keys.push(material.tint.colorKey);
  return new Set(sortChannels(keys));
}

function diagnoseV1(plan: KitPlan, recipe: KitCustomizationRecipe, push: Push): void {
  const capabilities = kitV1CustomCapabilities();
  for (const layer of WARDROBE_LAYERS) {
    if (recipe.wardrobe[layer] !== null) push("layer", layer, reasonOf(capabilities, customReasonKey("layer", layer), `${WARDROBE_LAYER_LABELS_KO[layer]} 층을 입힐 수 없습니다.`));
  }
  for (const instance of recipe.wardrobe.accessories) {
    push("accessory", instance.id, reasonOf(capabilities, customReasonKey("anchor", instance.anchor), `${ACCESSORY_ANCHOR_LABELS_KO[instance.anchor]} 앵커에 소품을 붙일 수 없습니다.`));
  }
  const wornSlots = new Set(plan.parts.flatMap((part) => (part.slot === null ? [] : [part.slot])));
  for (const scope of Object.keys(recipe.partParams).sort() as PartScope[]) {
    const values = recipe.partParams[scope];
    if (values === undefined || !(wornSlots as ReadonlySet<string>).has(scope)) continue;
    for (const [name, value] of Object.entries(values)) {
      if (value !== 0) push("shape", `${scope}/${name}`, reasonOf(capabilities, customReasonKey("shape", scope), "키트 v1 manifest에는 형태 키가 없습니다."));
    }
  }
  for (const key of CHANNEL_KEYS) {
    if (recipe.colors[key] !== undefined && !isBaseChannelKey(key)) push("channel", key, reasonOf(capabilities, customReasonKey("channel", key), `${CHANNEL_LABELS_KO[key]} 채널을 따로 칠할 수 없습니다.`));
  }
  const painted = v1PaintedChannels(plan);
  for (const channel of CHANNEL_KEYS) {
    const family = CHANNEL_FAMILY[channel];
    if (recipe.surfaces[channel]?.pattern && family !== null && painted.has(family)) push("surface", channel, reasonOf(capabilities, customReasonKey("patternUv"), "무늬를 그릴 수 없습니다."));
  }
  if (hairColorIsActive(recipe.hairColor) && wornSlots.has("hair")) push("hair-color", "hairColor", reasonOf(capabilities, customReasonKey("hairFlow"), "끝 색·포인트를 그릴 수 없습니다."));
  if (recipe.style.proportion !== null) push("proportion", "proportion", reasonOf(capabilities, customReasonKey("proportion"), "비례 목표를 근사할 수 없습니다."));
}

/**
 * 키트 계획과 현재 레시피를 대조한다. v2 계획(`custom` 있음)은 올린 파일로, v1 계획은 키트 v1 사유로 판정한다.
 * 결과가 비면 이 소스는 레시피의 커스터마이즈를 모두 그린다(비례는 v2에서 근사).
 */
export function diagnoseKitCustomization(plan: KitPlan, recipe: KitCustomizationRecipe): UnsupportedCustomization[] {
  const result: UnsupportedCustomization[] = [];
  const push: Push = (kind, key, reasonKo) => {
    result.push({ kind, key, reasonKo });
  };
  if (isKitPlanV2(plan)) diagnoseV2(plan, recipe, push);
  else diagnoseV1(plan, recipe, push);
  return result;
}
