/**
 * 레시피 v3 커스터마이즈 명령 reducer(2026-10-23 CORE-1). 순수·불변이며 입력 레시피를 바꾸지 않는다.
 * 명령: `style/apply`·`look/set`·`proportion/set`·`channel/set`·`surface/set`·`part-param/set`·`wardrobe/set`·
 * `accessory/add|remove|set`·`hair-color/set`·`look-preset/apply`(계약 `contracts/events.ts`).
 *
 * - 잘못된 입력(어휘 밖 채널·범위 밖 값·없는 소품·슬롯이 다른 프리셋 등)은 무음으로 넘기지 않고 `RecipeCommandError`(code + 한글 사유)를 던진다.
 * - 값이 바뀌지 않는 명령은 같은 참조를 돌려줘 store가 history 단계를 만들지 않게 한다.
 * - 프리셋 카탈로그 patch(색 덮어쓰기)는 `style/apply`의 눈·눈동자 바인딩에만 쓴다. 층(`wardrobe/set`)·소품·룩 적용은 사용자 색을 덮어쓰지 않는다(K-04).
 */
import {
  CHANNEL_LABELS_KO,
  DEFAULT_ACCESSORY_OFFSET,
  MAX_EXTRA_ACCESSORIES,
  MAX_SHAPES_PER_SCOPE,
  PART_ROLE_LABELS_KO,
  STYLE_APPLY_SCOPE_LABELS_KO,
  STYLE_FIGURES,
  WARDROBE_LAYERS,
  WARDROBE_LAYER_LABELS_KO,
  WARDROBE_LAYER_SLOT,
  accessoryInstanceSchema,
  accessoryOffsetSchema,
  applyCharacterLook,
  artStylePackSchema,
  characterLookSchema,
  clampExpression,
  clampParam,
  cloneLook,
  describeRecipeIssues,
  hairColorSchema,
  isAccessoryInstanceId,
  isBaseChannelKey,
  isChannelKey,
  isLayerPreset,
  isPartScope,
  isPresetId,
  isShapeName,
  mergeLook,
  nextAccessoryInstanceId,
  normalizeParamValues,
  presetSlot,
  proportionSchema,
  recipeLookSchema,
  shadingProfileSchema,
  styleFaceBindingSchema,
  surfaceSchema,
} from "../contracts";
import { normalizeHex } from "../shared/color";
import { stableStringify } from "../shared/stable-json";

import { RecipeCommandError } from "./recipe-command-error";

import type { AccessoryInstance, ChannelKey, CharacterRecipe, PresetCatalog, PresetId, RecipeCommand, SlotKind, StyleApplyScope } from "../contracts";

export const CUSTOMIZE_COMMAND_TYPES = [
  "style/apply",
  "look/set",
  "proportion/set",
  "channel/set",
  "surface/set",
  "part-param/set",
  "wardrobe/set",
  "accessory/add",
  "accessory/remove",
  "accessory/set",
  "hair-color/set",
  "look-preset/apply",
] as const;

export type CustomizeCommandType = (typeof CUSTOMIZE_COMMAND_TYPES)[number];
export type CustomizeCommand = Extract<RecipeCommand, { readonly type: CustomizeCommandType }>;

const CUSTOMIZE_TYPE_SET: ReadonlySet<string> = new Set(CUSTOMIZE_COMMAND_TYPES);

export function isCustomizeCommand(command: RecipeCommand): command is CustomizeCommand {
  return CUSTOMIZE_TYPE_SET.has(command.type);
}

/** 슬롯 프리셋 적용(카탈로그 patch 포함) — `recipe-reducer.ts`의 `slot/apply`를 주입받는다(순환 import 방지). */
export type ApplySlotPreset = (recipe: CharacterRecipe, slot: SlotKind, presetId: PresetId) => CharacterRecipe;

function sameJson(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function firstIssue(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): string {
  return describeRecipeIssues(issues.slice(0, 1));
}

function requireCatalogPreset(catalog: PresetCatalog, presetId: PresetId): void {
  if (!catalog.get(presetId)) throw new RecipeCommandError("command-preset-unknown", `카탈로그에 없는 프리셋입니다: ${presetId}`);
}

// ---------------------------------------------------------------- 색·표면·형태

function reduceChannelSet(recipe: CharacterRecipe, command: Extract<CustomizeCommand, { type: "channel/set" }>): CharacterRecipe {
  const { key, value } = command;
  if (!isChannelKey(key)) throw new RecipeCommandError("command-channel-key", `색 채널이 아닙니다: ${String(key)}`);
  const colors: Partial<Record<ChannelKey, string>> = { ...recipe.colors };
  if (value === null) {
    if (isBaseChannelKey(key)) throw new RecipeCommandError("command-channel-required", `기본 색 채널 ${CHANNEL_LABELS_KO[key]}(${key})은 비울 수 없습니다.`);
    if (colors[key] === undefined) return recipe;
    delete colors[key];
    return { ...recipe, colors: colors as CharacterRecipe["colors"] };
  }
  const hex = normalizeHex(value);
  if (!hex) throw new RecipeCommandError("command-color-invalid", `색은 #rrggbb 형식이어야 합니다: ${value}`);
  if (colors[key] === hex) return recipe;
  colors[key] = hex;
  return { ...recipe, colors: colors as CharacterRecipe["colors"] };
}

function reduceSurfaceSet(recipe: CharacterRecipe, command: Extract<CustomizeCommand, { type: "surface/set" }>): CharacterRecipe {
  const { channel, surface } = command;
  if (!isChannelKey(channel)) throw new RecipeCommandError("command-channel-key", `색 채널이 아닙니다: ${String(channel)}`);
  const surfaces: Record<string, unknown> = { ...recipe.surfaces };
  if (surface === null) {
    if (surfaces[channel] === undefined) return recipe;
    delete surfaces[channel];
    return { ...recipe, surfaces: surfaces as CharacterRecipe["surfaces"] };
  }
  const parsed = surfaceSchema.safeParse(surface);
  if (!parsed.success) throw new RecipeCommandError("command-surface-invalid", `표면 지정이 올바르지 않습니다: ${firstIssue(parsed.error.issues)}`);
  if (parsed.data.pattern?.inkChannel === channel) {
    throw new RecipeCommandError("command-surface-ink", `패턴의 두 번째 색 채널은 바탕 채널(${CHANNEL_LABELS_KO[channel]})과 달라야 합니다.`);
  }
  if (sameJson(parsed.data, recipe.surfaces[channel])) return recipe;
  surfaces[channel] = parsed.data;
  return { ...recipe, surfaces: surfaces as CharacterRecipe["surfaces"] };
}

function reducePartParamSet(recipe: CharacterRecipe, command: Extract<CustomizeCommand, { type: "part-param/set" }>): CharacterRecipe {
  const { scope, shape, value } = command;
  if (!isPartScope(scope)) throw new RecipeCommandError("command-part-scope", `파츠 범위가 아닙니다: ${String(scope)}`);
  if (isAccessoryInstanceId(scope) && !recipe.wardrobe.accessories.some((instance) => instance.id === scope)) {
    throw new RecipeCommandError("command-accessory-unknown", `없는 소품 인스턴스입니다: ${scope}`);
  }
  if (!isShapeName(shape)) throw new RecipeCommandError("command-shape-name", `형태 이름이 규약(소문자로 시작하는 24자 이하 식별자)에 맞지 않습니다: ${String(shape)}`);
  if (!Number.isFinite(value)) throw new RecipeCommandError("command-param-value", `형태 ${shape} 값이 숫자가 아닙니다.`);
  const clamped = clampParam(value);
  const current = recipe.partParams[scope] ?? {};
  if ((current[shape] ?? 0) === clamped) return recipe;
  const nextScope: Record<string, number> = { ...current };
  if (clamped === 0) delete nextScope[shape];
  else nextScope[shape] = clamped;
  if (Object.keys(nextScope).length > MAX_SHAPES_PER_SCOPE) {
    throw new RecipeCommandError("command-part-param-limit", `파츠 범위 ${scope}의 형태 값은 최대 ${MAX_SHAPES_PER_SCOPE}개입니다.`);
  }
  const partParams: Record<string, Readonly<Record<string, number>>> = { ...recipe.partParams } as Record<string, Readonly<Record<string, number>>>;
  if (Object.keys(nextScope).length === 0) delete partParams[scope];
  else partParams[scope] = nextScope;
  return { ...recipe, partParams: partParams as CharacterRecipe["partParams"] };
}

function reduceHairColorSet(recipe: CharacterRecipe, command: Extract<CustomizeCommand, { type: "hair-color/set" }>): CharacterRecipe {
  const parsed = hairColorSchema.safeParse({ ...recipe.hairColor, ...command.patch });
  if (!parsed.success) throw new RecipeCommandError("command-hair-color-invalid", `헤어 색 흐름이 올바르지 않습니다: ${firstIssue(parsed.error.issues)}`);
  if (sameJson(parsed.data, recipe.hairColor)) return recipe;
  return { ...recipe, hairColor: parsed.data };
}

// ---------------------------------------------------------------- 옷장(층·소품)

function reduceWardrobeSet(recipe: CharacterRecipe, command: Extract<CustomizeCommand, { type: "wardrobe/set" }>, catalog: PresetCatalog): CharacterRecipe {
  const { layer, presetId } = command;
  if (!(WARDROBE_LAYERS as readonly string[]).includes(layer)) throw new RecipeCommandError("command-wardrobe-layer", `겹쳐 입기 층이 아닙니다: ${String(layer)}`);
  if (presetId === null) {
    if (recipe.wardrobe[layer] === null) return recipe;
    return { ...recipe, wardrobe: { ...recipe.wardrobe, [layer]: null } };
  }
  if (!isLayerPreset(layer, presetId)) {
    throw new RecipeCommandError("command-slot-mismatch", `${WARDROBE_LAYER_LABELS_KO[layer]} 층에는 ${WARDROBE_LAYER_SLOT[layer]}/<이름> 프리셋만 입힐 수 있습니다: ${String(presetId)}`);
  }
  requireCatalogPreset(catalog, presetId);
  if (recipe.wardrobe[layer] === presetId) return recipe;
  return { ...recipe, wardrobe: { ...recipe.wardrobe, [layer]: presetId } };
}

function requireAccessoryPreset(presetId: unknown, catalog: PresetCatalog): PresetId {
  if (!isPresetId(presetId) || presetSlot(presetId) !== "accessory") throw new RecipeCommandError("command-slot-mismatch", `소품에는 accessory/<이름> 프리셋만 쓸 수 있습니다: ${String(presetId)}`);
  requireCatalogPreset(catalog, presetId);
  return presetId;
}

function checkedInstance(candidate: unknown): AccessoryInstance {
  const parsed = accessoryInstanceSchema.safeParse(candidate);
  if (!parsed.success) throw new RecipeCommandError("command-accessory-invalid", `소품 지정이 올바르지 않습니다: ${firstIssue(parsed.error.issues)}`);
  return parsed.data;
}

function reduceAccessoryAdd(recipe: CharacterRecipe, command: Extract<CustomizeCommand, { type: "accessory/add" }>, catalog: PresetCatalog): CharacterRecipe {
  const presetId = requireAccessoryPreset(command.presetId, catalog);
  const accessories = recipe.wardrobe.accessories;
  if (accessories.length >= MAX_EXTRA_ACCESSORIES) {
    throw new RecipeCommandError("command-accessory-limit", `추가 소품은 최대 ${MAX_EXTRA_ACCESSORIES}개입니다(슬롯 1개 포함 12개).`);
  }
  const id = nextAccessoryInstanceId(accessories.map((instance) => instance.id));
  if (id === null) throw new RecipeCommandError("command-accessory-limit", "소품 인스턴스 id를 더 만들 수 없습니다.");
  const offset = accessoryOffsetSchema.safeParse(command.offset ?? DEFAULT_ACCESSORY_OFFSET);
  if (!offset.success) throw new RecipeCommandError("command-accessory-invalid", `소품 오프셋이 올바르지 않습니다: ${firstIssue(offset.error.issues)}`);
  const instance = checkedInstance({ id, presetId, anchor: command.anchor, offset: offset.data });
  return { ...recipe, wardrobe: { ...recipe.wardrobe, accessories: [...accessories, instance] } };
}

function reduceAccessoryRemove(recipe: CharacterRecipe, command: Extract<CustomizeCommand, { type: "accessory/remove" }>): CharacterRecipe {
  const accessories = recipe.wardrobe.accessories;
  if (!accessories.some((instance) => instance.id === command.id)) throw new RecipeCommandError("command-accessory-unknown", `없는 소품 인스턴스입니다: ${String(command.id)}`);
  const partParams: Record<string, unknown> = { ...recipe.partParams };
  delete partParams[command.id];
  return {
    ...recipe,
    wardrobe: { ...recipe.wardrobe, accessories: accessories.filter((instance) => instance.id !== command.id) },
    partParams: partParams as CharacterRecipe["partParams"],
  };
}

function reduceAccessorySet(recipe: CharacterRecipe, command: Extract<CustomizeCommand, { type: "accessory/set" }>, catalog: PresetCatalog): CharacterRecipe {
  const accessories = recipe.wardrobe.accessories;
  const index = accessories.findIndex((instance) => instance.id === command.id);
  const current = accessories[index];
  if (current === undefined) throw new RecipeCommandError("command-accessory-unknown", `없는 소품 인스턴스입니다: ${String(command.id)}`);
  const presetId = command.presetId === undefined ? current.presetId : requireAccessoryPreset(command.presetId, catalog);
  const next = checkedInstance({ ...current, presetId, anchor: command.anchor ?? current.anchor, offset: { ...current.offset, ...command.offset } });
  if (sameJson(next, current)) return recipe;
  const updated = [...accessories];
  updated[index] = next;
  return { ...recipe, wardrobe: { ...recipe.wardrobe, accessories: updated } };
}

// ---------------------------------------------------------------- 화풍·look·비례·룩

function reduceLookSet(recipe: CharacterRecipe, command: Extract<CustomizeCommand, { type: "look/set" }>): CharacterRecipe {
  const parsed = recipeLookSchema.safeParse(mergeLook(recipe.shading.look, command.patch));
  if (!parsed.success) throw new RecipeCommandError("command-look-invalid", `화풍 값이 올바르지 않습니다: ${firstIssue(parsed.error.issues)}`);
  if (sameJson(parsed.data, recipe.shading.look)) return recipe;
  return { ...recipe, shading: { ...recipe.shading, look: parsed.data } };
}

function reduceProportionSet(recipe: CharacterRecipe, command: Extract<CustomizeCommand, { type: "proportion/set" }>): CharacterRecipe {
  const current = recipe.style.proportion;
  if (command.proportion === null) {
    if (current === null) return recipe;
    return { ...recipe, style: { ...recipe.style, proportion: null } };
  }
  const parsed = proportionSchema.safeParse(current === null ? command.proportion : { ...current, ...command.proportion });
  if (!parsed.success) {
    if (current === null) throw new RecipeCommandError("command-proportion-incomplete", "비례를 처음 정할 때는 6축(두신·다리·팔·어깨·머리 너비·손)을 모두 범위 안 값으로 줘야 합니다.");
    throw new RecipeCommandError("command-proportion-invalid", `비례 값이 올바르지 않습니다: ${firstIssue(parsed.error.issues)}`);
  }
  if (sameJson(parsed.data, current)) return recipe;
  return { ...recipe, style: { ...recipe.style, proportion: parsed.data } };
}

function scopeEmpty(scope: StyleApplyScope): boolean {
  return !scope.look && !scope.proportion && !scope.face && !scope.palette;
}

function reduceStyleApply(recipe: CharacterRecipe, command: Extract<CustomizeCommand, { type: "style/apply" }>, applySlot: ApplySlotPreset): CharacterRecipe {
  const packResult = artStylePackSchema.safeParse(command.pack);
  if (!packResult.success) throw new RecipeCommandError("command-style-pack-invalid", `화풍 팩 형식이 올바르지 않습니다: ${firstIssue(packResult.error.issues)}`);
  const pack = packResult.data;
  const { scope } = command;
  if (scopeEmpty(scope)) throw new RecipeCommandError("command-style-scope-empty", "화풍 적용 범위(룩·비례·얼굴·팔레트)를 하나 이상 골라야 합니다.");
  if (!(STYLE_FIGURES as readonly string[]).includes(command.figure)) throw new RecipeCommandError("command-style-figure", `체형 계열이 아닙니다: ${String(command.figure)}`);
  let next = recipe;
  const style = { ...recipe.style };

  if (scope.look) {
    const shading = shadingProfileSchema.safeParse({
      ...next.shading,
      mode: "toon",
      toon: { ...next.shading.toon, rampSteps: pack.toon.rampSteps, rim: pack.toon.rim, outline: pack.toon.outline },
      look: cloneLook(pack.look),
    });
    if (!shading.success) throw new RecipeCommandError("command-style-look-invalid", `화풍 팩의 룩을 적용할 수 없습니다: ${firstIssue(shading.error.issues)}`);
    next = { ...next, shading: shading.data };
  }
  if (scope.proportion) style.proportion = { ...pack.proportion[command.figure] };
  if (scope.face) {
    if (command.face === undefined) throw new RecipeCommandError("command-style-face-binding", "얼굴 범위를 적용하려면 소스별 얼굴 바인딩(face)이 필요합니다.");
    const binding = styleFaceBindingSchema.safeParse(command.face);
    if (!binding.success) throw new RecipeCommandError("command-style-face-binding", `화풍 얼굴 바인딩이 올바르지 않습니다: ${firstIssue(binding.error.issues)}`);
    if (binding.data.slots.eyes) next = applySlot(next, "eyes", binding.data.slots.eyes);
    if (binding.data.slots.irises) next = applySlot(next, "irises", binding.data.slots.irises);
    next = { ...next, face: normalizeParamValues({ ...next.face, ...binding.data.face }) };
    style.neutralFacs = clampExpression(binding.data.neutralFacs);
  }
  if (scope.palette) {
    const skinIndex = command.paletteIndex?.skin ?? 0;
    const skin = pack.palette.skin[skinIndex];
    if (skin === undefined) throw new RecipeCommandError("command-style-palette-index", `화풍 팩 피부 팔레트에 ${skinIndex}번 색이 없습니다(${pack.palette.skin.length}색).`);
    const colors = { ...next.colors, skin };
    const hairIndex = command.paletteIndex?.hair;
    if (pack.palette.hair.length > 0) {
      const hair = pack.palette.hair[hairIndex ?? 0];
      if (hair === undefined) throw new RecipeCommandError("command-style-palette-index", `화풍 팩 헤어 팔레트에 ${hairIndex ?? 0}번 색이 없습니다(${pack.palette.hair.length}색).`);
      colors.hair = hair;
      colors.brow = hair;
    } else if (hairIndex !== undefined) {
      throw new RecipeCommandError("command-style-palette-index", "화풍 팩에 헤어 팔레트가 없습니다.");
    }
    next = { ...next, colors };
  }
  style.packId = pack.id;
  style.packRevision = pack.revision;
  return { ...next, style };
}

function reduceLookPresetApply(recipe: CharacterRecipe, command: Extract<CustomizeCommand, { type: "look-preset/apply" }>): CharacterRecipe {
  const parsed = characterLookSchema.safeParse(command.look);
  if (!parsed.success) throw new RecipeCommandError("command-look-invalid", `룩 형식이 올바르지 않습니다: ${firstIssue(parsed.error.issues)}`);
  const applied = applyCharacterLook(recipe, parsed.data);
  if (!applied.ok) throw new RecipeCommandError(applied.failure.code, applied.failure.reasonKo);
  return applied.recipe;
}

// ---------------------------------------------------------------- 진입점

/** v3 커스터마이즈 명령 하나를 적용한 새 레시피(변경이 없으면 같은 참조) */
export function reduceCustomizeCommand(recipe: CharacterRecipe, command: CustomizeCommand, catalog: PresetCatalog, applySlot: ApplySlotPreset): CharacterRecipe {
  switch (command.type) {
    case "style/apply":
      return reduceStyleApply(recipe, command, applySlot);
    case "look/set":
      return reduceLookSet(recipe, command);
    case "proportion/set":
      return reduceProportionSet(recipe, command);
    case "channel/set":
      return reduceChannelSet(recipe, command);
    case "surface/set":
      return reduceSurfaceSet(recipe, command);
    case "part-param/set":
      return reducePartParamSet(recipe, command);
    case "wardrobe/set":
      return reduceWardrobeSet(recipe, command, catalog);
    case "accessory/add":
      return reduceAccessoryAdd(recipe, command, catalog);
    case "accessory/remove":
      return reduceAccessoryRemove(recipe, command);
    case "accessory/set":
      return reduceAccessorySet(recipe, command, catalog);
    case "hair-color/set":
      return reduceHairColorSet(recipe, command);
    case "look-preset/apply":
      return reduceLookPresetApply(recipe, command);
    default: {
      const exhaustive: never = command;
      throw new RecipeCommandError("command-unknown", `알 수 없는 명령입니다: ${String((exhaustive as { type?: unknown }).type)}`);
    }
  }
}

function presetLabel(presetId: PresetId | null | undefined, catalog?: PresetCatalog): string {
  if (presetId === null || presetId === undefined) return "없음";
  return catalog?.get(presetId)?.labelKo ?? presetId;
}

/** history 라벨(한글) */
export function describeCustomizeCommandKo(command: CustomizeCommand, catalog?: PresetCatalog): string {
  switch (command.type) {
    case "style/apply": {
      const parts = (Object.keys(STYLE_APPLY_SCOPE_LABELS_KO) as Array<keyof StyleApplyScope>).filter((key) => command.scope[key]).map((key) => STYLE_APPLY_SCOPE_LABELS_KO[key]);
      return `화풍 적용: ${command.pack.labelKo}(${parts.join("·") || "범위 없음"})`;
    }
    case "look/set":
      return "화풍 값 조정";
    case "proportion/set":
      return command.proportion === null ? "비례: 소스 기본으로" : "비례 조정";
    case "channel/set": {
      const label = isChannelKey(command.key) ? CHANNEL_LABELS_KO[command.key] : String(command.key);
      return command.value === null ? `색 ${label}: 상속으로` : `색 ${label}`;
    }
    case "surface/set": {
      const label = isChannelKey(command.channel) ? CHANNEL_LABELS_KO[command.channel] : String(command.channel);
      return command.surface === null ? `표면 ${label}: 기본으로` : `표면 ${label}`;
    }
    case "part-param/set": {
      const scope = String(command.scope);
      const label = scope in PART_ROLE_LABELS_KO ? PART_ROLE_LABELS_KO[scope as keyof typeof PART_ROLE_LABELS_KO] : scope;
      return `형태 ${label} ${command.shape}`;
    }
    case "wardrobe/set":
      return `${WARDROBE_LAYER_LABELS_KO[command.layer] ?? command.layer}: ${presetLabel(command.presetId, catalog)}`;
    case "accessory/add":
      return `소품 추가: ${presetLabel(command.presetId, catalog)}`;
    case "accessory/remove":
      return `소품 제거: ${command.id}`;
    case "accessory/set":
      return `소품 조정: ${command.id}`;
    case "hair-color/set":
      return "헤어 색 흐름";
    case "look-preset/apply":
      return `룩 적용: ${command.look.nameKo}`;
    default: {
      const exhaustive: never = command;
      return String((exhaustive as { type?: unknown }).type);
    }
  }
}
