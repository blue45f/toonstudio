/**
 * 캐릭터 랩의 "내 룩" payload(레시피 v3 조각)·추출·적용(2026-10-23 CORE-1). 봉투는 `character-look.ts`(look/1, 렌더러 중립)다.
 *
 * 범위(scope)별 구역과 구역 안 키 범위(domain):
 * - full: 외형 12슬롯·몸·얼굴·27채널 색·화풍·look·툰 3필드·옷장·형태 값 전부·표면 전부·헤어 색 흐름
 * - outfit: 상의·하의·신발·액세서리 슬롯, 옷장(층·소품), 의상 채널 색·표면, 헤어를 뺀 형태 값
 * - colors: 27채널 색, 헤어 색 흐름
 * - face: 얼굴 6슬롯(얼굴형·눈·눈동자·코·입·귀), 얼굴 파라미터
 * - style: 화풍(style)·look·툰 3필드(램프 단수·림·외곽선)
 *
 * 적용 규칙(`applyCharacterLook`, 결정적·순수): payload에 있는 구역만 바꾸고, 구역 안에서는 **범위 안 키를 payload로 교체**한다.
 * 범위 안인데 payload에 없는 상속 채널·표면·형태 범위는 지운다(=상속·기본으로 돌아간다). 기본 8채널과 슬롯은 payload에 없으면 그대로 둔다.
 * 프리셋 카탈로그 patch는 적용하지 않는다 — 룩에 저장된 값이 곧 결과다(K-04: 프리셋이 사용자 값을 덮어쓰는 문제를 만들지 않는다).
 */
import { z } from "zod";

import { CHARACTER_LOOK_FORMAT, characterLookSchemaFor } from "./character-look";
import { CHANNEL_KEYS, isBaseChannelKey } from "./color-channels";
import { hairColorSchema, isAccessoryInstanceId, partShapeValuesSchema, partScopeSchema, surfaceSchema, wardrobeSchema } from "./customization";
import { failVisible } from "./errors";
import { normalizeParamValues } from "./params";
import { bodyParamsSchema, characterRecipeSchema, describeRecipeIssues, faceParamsSchema, hexColorSchema, presetIdSchema, recipeStyleSchema } from "./recipe";
import { recipeLookSchema } from "./shading";
import { APPEARANCE_SLOT_KINDS, CHARACTER_SLOT_KINDS, SLOT_GROUPS, presetSlot } from "./slots";

import type { CharacterLookEnvelope, LookLockGroup, LookScope } from "./character-look";
import type { ChannelKey } from "./color-channels";
import type { PartScope } from "./customization";
import type { LabFailure } from "./errors";
import type { CharacterRecipe } from "./recipe";
import type { SlotKind } from "./slots";

// ---------------------------------------------------------------- 범위별 키 범위

const OUTFIT_SLOTS: readonly SlotKind[] = ["top", "bottom", "shoes", "accessory"];

/** 범위별 슬롯 키 범위 */
export const LOOK_SLOT_DOMAIN: Readonly<Record<LookScope, readonly SlotKind[]>> = {
  full: APPEARANCE_SLOT_KINDS,
  outfit: OUTFIT_SLOTS,
  colors: [],
  face: SLOT_GROUPS.identity,
  style: [],
};

/** 의상 채널(상의·이너·아우터·하의·레그웨어·신발·액세서리 계열) */
export const OUTFIT_CHANNEL_KEYS: readonly ChannelKey[] = [
  "top",
  "top-trim",
  "top-accent",
  "inner",
  "inner-trim",
  "outer",
  "outer-trim",
  "outer-accent",
  "bottom",
  "bottom-trim",
  "legwear",
  "shoes",
  "shoes-sole",
  "shoes-lace",
  "accessory",
  "accessory-accent",
];

/** 범위별 색·표면 채널 키 범위 */
export const LOOK_CHANNEL_DOMAIN: Readonly<Record<LookScope, readonly ChannelKey[]>> = {
  full: CHANNEL_KEYS,
  outfit: OUTFIT_CHANNEL_KEYS,
  colors: CHANNEL_KEYS,
  face: [],
  style: [],
};

/** 범위에 드는 형태 값 범위인지(의상 범위는 헤어를 뺀 전부, 소품 인스턴스 포함) */
export function lookPartScopeInDomain(scope: LookScope, partScope: PartScope): boolean {
  if (scope === "full") return true;
  if (scope === "outfit") return partScope !== "hair";
  return false;
}

// ---------------------------------------------------------------- payload 스키마

const toonSubsetSchema = z
  .object({
    rampSteps: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    rim: z.boolean(),
    outline: z.enum(["none", "hull", "edge"]),
  })
  .partial()
  .strict();

export const characterLookPayloadSchema = z
  .object({
    // 키 범위(외형 슬롯 중 범위에 드는 것)는 아래 superRefine이 검사한다.
    slots: z.partialRecord(z.enum(CHARACTER_SLOT_KINDS), presetIdSchema.nullable()).optional(),
    body: bodyParamsSchema.optional(),
    face: faceParamsSchema.optional(),
    colors: z.partialRecord(z.enum(CHANNEL_KEYS), hexColorSchema).optional(),
    style: recipeStyleSchema.optional(),
    look: recipeLookSchema.optional(),
    toon: toonSubsetSchema.optional(),
    wardrobe: wardrobeSchema.optional(),
    partParams: z.partialRecord(partScopeSchema, partShapeValuesSchema).optional(),
    surfaces: z.partialRecord(z.enum(CHANNEL_KEYS), surfaceSchema).optional(),
    hairColor: hairColorSchema.optional(),
  })
  .strict();
export type CharacterLookPayload = z.infer<typeof characterLookPayloadSchema>;

/** look/1 문서(캐릭터 랩 payload). 범위 밖 키·슬롯 불일치 프리셋을 한글 사유로 거부한다. */
export const characterLookSchema = characterLookSchemaFor(characterLookPayloadSchema).superRefine((look, ctx) => {
  const payload = look.payload;
  const slotDomain: readonly string[] = LOOK_SLOT_DOMAIN[look.scope];
  for (const [kind, presetId] of Object.entries(payload.slots ?? {})) {
    if (!slotDomain.includes(kind)) ctx.addIssue({ code: "custom", message: `범위 ${look.scope}에는 슬롯 ${kind}을 담을 수 없습니다.`, path: ["payload", "slots", kind] });
    else if (presetId !== null && presetId !== undefined && presetSlot(presetId) !== kind) {
      ctx.addIssue({ code: "custom", message: `슬롯 ${kind}에 다른 슬롯 프리셋(${presetId})을 담았습니다.`, path: ["payload", "slots", kind] });
    }
  }
  const channelDomain: readonly string[] = LOOK_CHANNEL_DOMAIN[look.scope];
  for (const section of ["colors", "surfaces"] as const) {
    for (const key of Object.keys(payload[section] ?? {})) {
      if (!channelDomain.includes(key)) ctx.addIssue({ code: "custom", message: `범위 ${look.scope}에는 채널 ${key}의 ${section === "colors" ? "색" : "표면"}을 담을 수 없습니다.`, path: ["payload", section, key] });
    }
  }
  for (const [channel, surface] of Object.entries(payload.surfaces ?? {})) {
    if (surface?.pattern && surface.pattern.inkChannel === channel) {
      ctx.addIssue({ code: "custom", message: `패턴의 두 번째 색 채널(${channel})이 바탕 채널과 같습니다.`, path: ["payload", "surfaces", channel] });
    }
  }
  for (const partScope of Object.keys(payload.partParams ?? {}) as PartScope[]) {
    if (!lookPartScopeInDomain(look.scope, partScope)) ctx.addIssue({ code: "custom", message: `범위 ${look.scope}에는 형태 범위 ${partScope}를 담을 수 없습니다.`, path: ["payload", "partParams", partScope] });
  }
});

export type CharacterLook = CharacterLookEnvelope<CharacterLookPayload>;

export type ParseCharacterLookResult = { readonly ok: true; readonly look: CharacterLook } | { readonly ok: false; readonly failure: LabFailure };

/** 알 수 없는 JSON을 look/1 문서로 파싱한다. 실패는 `look-invalid`(형식 문자열이 다르면 `look-format`) 한글 사유다. */
export function parseCharacterLook(json: unknown, now?: number): ParseCharacterLookResult {
  if (typeof json !== "object" || json === null || (json as { format?: unknown }).format !== CHARACTER_LOOK_FORMAT) {
    return { ok: false, failure: failVisible("look-format", `룩 파일이 아닙니다(format이 ${CHARACTER_LOOK_FORMAT}이어야 합니다).`, undefined, now) };
  }
  const result = characterLookSchema.safeParse(json);
  if (!result.success) return { ok: false, failure: failVisible("look-invalid", `룩 형식이 올바르지 않습니다: ${describeRecipeIssues(result.error.issues)}`, undefined, now) };
  return { ok: true, look: result.data };
}

// ---------------------------------------------------------------- 추출

export interface CharacterLookMeta {
  readonly id: string;
  readonly nameKo: string;
  readonly locks?: readonly LookLockGroup[];
  readonly seed?: number;
}

function pickDomain<T>(record: Readonly<Partial<Record<string, T>>>, include: (key: string) => boolean): Partial<Record<string, T>> {
  const result: Partial<Record<string, T>> = {};
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    if (value !== undefined && include(key)) result[key] = structuredClone(value);
  }
  return result;
}

/** 레시피에서 범위의 구역을 뽑아 look/1 문서를 만든다(값은 깊은 사본). 결과는 `characterLookSchema`를 통과한다. */
export function extractCharacterLook(recipe: CharacterRecipe, scope: LookScope, meta: CharacterLookMeta): CharacterLook {
  const channelDomain: readonly string[] = LOOK_CHANNEL_DOMAIN[scope];
  const payload: Record<string, unknown> = {};
  const slotDomain = LOOK_SLOT_DOMAIN[scope];
  if (slotDomain.length > 0) payload.slots = Object.fromEntries(slotDomain.map((kind) => [kind, recipe.slots[kind]]));
  if (scope === "full") {
    payload.body = structuredClone(recipe.body);
    payload.face = structuredClone(recipe.face);
  }
  if (scope === "face") payload.face = structuredClone(recipe.face);
  if (scope === "full" || scope === "outfit" || scope === "colors") payload.colors = pickDomain(recipe.colors, (key) => channelDomain.includes(key));
  if (scope === "full" || scope === "outfit") {
    payload.wardrobe = structuredClone(recipe.wardrobe);
    payload.partParams = pickDomain(recipe.partParams, (key) => lookPartScopeInDomain(scope, key as PartScope));
    payload.surfaces = pickDomain(recipe.surfaces, (key) => channelDomain.includes(key));
  }
  if (scope === "full" || scope === "colors") payload.hairColor = structuredClone(recipe.hairColor);
  if (scope === "full" || scope === "style") {
    payload.style = structuredClone(recipe.style);
    payload.look = structuredClone(recipe.shading.look);
    payload.toon = { rampSteps: recipe.shading.toon.rampSteps, rim: recipe.shading.toon.rim, outline: recipe.shading.toon.outline };
  }
  const look = {
    format: CHARACTER_LOOK_FORMAT,
    id: meta.id,
    nameKo: meta.nameKo,
    scope,
    payload,
    locks: [...(meta.locks ?? [])],
    ...(meta.seed !== undefined ? { seed: meta.seed } : {}),
  };
  const parsed = characterLookSchema.safeParse(look);
  if (!parsed.success) throw new Error(`룩을 만들 수 없습니다: ${describeRecipeIssues(parsed.error.issues)}`);
  return parsed.data;
}

// ---------------------------------------------------------------- 적용

export type ApplyCharacterLookResult = { readonly ok: true; readonly recipe: CharacterRecipe } | { readonly ok: false; readonly failure: LabFailure };

/** 범위 안 키를 payload로 교체한다(범위 밖은 그대로). 결과를 v3 스키마로 다시 검사한다. */
export function applyCharacterLook(recipe: CharacterRecipe, look: CharacterLook, now?: number): ApplyCharacterLookResult {
  const payload = look.payload;
  const scope = look.scope;
  const channelDomain: readonly ChannelKey[] = LOOK_CHANNEL_DOMAIN[scope];
  let next: CharacterRecipe = recipe;

  if (payload.slots) {
    const slots = { ...next.slots };
    for (const kind of LOOK_SLOT_DOMAIN[scope]) {
      const value = payload.slots[kind];
      if (value !== undefined) slots[kind] = value;
    }
    next = { ...next, slots };
  }
  if (payload.body) next = { ...next, body: normalizeParamValues(payload.body) };
  if (payload.face) next = { ...next, face: normalizeParamValues(payload.face) };
  if (payload.colors) {
    const colors: Record<string, string | undefined> = { ...next.colors };
    for (const key of channelDomain) {
      const value = payload.colors[key];
      if (value !== undefined) colors[key] = value;
      else if (!isBaseChannelKey(key)) delete colors[key];
    }
    next = { ...next, colors: colors as CharacterRecipe["colors"] };
  }
  if (payload.style) next = { ...next, style: structuredClone(payload.style) };
  if (payload.look || payload.toon) {
    next = {
      ...next,
      shading: {
        ...next.shading,
        toon: { ...next.shading.toon, ...payload.toon },
        look: payload.look ? structuredClone(payload.look) : next.shading.look,
      },
    };
  }
  if (payload.wardrobe) next = { ...next, wardrobe: structuredClone(payload.wardrobe) };
  if (payload.partParams) {
    const partParams: Record<string, Readonly<Record<string, number>> | undefined> = {};
    for (const [key, values] of Object.entries(next.partParams)) if (!lookPartScopeInDomain(scope, key as PartScope)) partParams[key] = values;
    for (const [key, values] of Object.entries(payload.partParams)) {
      const normalized = Object.fromEntries(Object.entries(values ?? {}).filter(([, value]) => value !== 0));
      if (Object.keys(normalized).length > 0) partParams[key] = normalized;
    }
    next = { ...next, partParams: partParams as CharacterRecipe["partParams"] };
  }
  if (payload.surfaces) {
    const surfaces: Record<string, unknown> = { ...next.surfaces };
    for (const key of channelDomain) {
      const value = payload.surfaces[key];
      if (value !== undefined) surfaces[key] = structuredClone(value);
      else delete surfaces[key];
    }
    next = { ...next, surfaces: surfaces as CharacterRecipe["surfaces"] };
  }
  if (payload.hairColor) next = { ...next, hairColor: structuredClone(payload.hairColor) };

  // 소품 인스턴스가 사라진 형태 값(acc-<n>)은 함께 지운다(옷장을 바꾼 룩이 남긴 고아 값).
  const instances = new Set(next.wardrobe.accessories.map((instance) => instance.id));
  const orphan = Object.keys(next.partParams).filter((key) => isAccessoryInstanceId(key) && !instances.has(key));
  if (orphan.length > 0) {
    const partParams: Record<string, unknown> = { ...next.partParams };
    for (const key of orphan) delete partParams[key];
    next = { ...next, partParams: partParams as CharacterRecipe["partParams"] };
  }

  const checked = characterRecipeSchema.safeParse(next);
  if (!checked.success) {
    return { ok: false, failure: failVisible("look-apply-invalid", `룩 "${look.nameKo}"을 적용한 결과가 레시피 형식에 맞지 않습니다: ${describeRecipeIssues(checked.error.issues)}`, undefined, now) };
  }
  return { ok: true, recipe: checked.data };
}
