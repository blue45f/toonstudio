/**
 * 캐릭터 레시피(zod 4). 저장·불러오기·undo의 단일 상태이며 strict 스키마다.
 *
 * 버전: 현재 v3(화풍·커스터마이즈, 2026-10-23 CORE-1). v2(키트 소스 추가, 2026-10-08)·v1 파일은 명시 마이그레이션 사슬
 * `migrateRecipeV1ToV2` → `migrateRecipeV2ToV3`로만 열리고 `parseRecipe`가 원래 버전을 `migratedFrom`으로 알린다.
 * 지원하지 않는 버전은 "지원하지 않는 레시피 버전" 한글 사유로 거부한다(무음 마이그레이션 금지). v3 이전 앱은 v3 파일을 같은 사유로 거부한다.
 *
 * v3에서 더한 것(설계 §2.2):
 * - `colors`: 27채널 맵(기본 8키 필수, 나머지는 상속 — color-channels.ts). v2의 8키를 그대로 옮기면 그림이 같다.
 * - `shading.look`: 화풍 값(필수, 기본 `LOOK_V2_IDENTITY` = v2 엔진 상수).
 * - `style`: 마지막으로 적용한 화풍 팩(출처·되돌리기 기준일 뿐 — 값은 레시피에 복사돼 있다)·비례 목표·중립 표정.
 * - `wardrobe`: inner·outer·legwear 층과 추가 소품(≤ 11, 앵커 14). `partParams`: 파츠 형태 값. `surfaces`: 채널별 재질·패턴. `hairColor`: 헤어 색 흐름.
 */
import { z } from "zod";

import { fnv1a64Hex } from "../shared/hash";
import { stableStringify } from "../shared/stable-json";

import { ART_STYLE_IDS, proportionSchema } from "./art-style";
import { HUMANOID_BONE_NAMES } from "./bones";
import { KIT_BASE_IDS, KIT_CURRENT_VERSION, KIT_DEFAULT_BASE_ID, KIT_DEFAULT_ID, KIT_DEFAULT_SLOTS } from "./character-kit";
import { channelColorsSchema } from "./color-channels";
import { createDefaultHairColor, createDefaultWardrobe, hairColorSchema, isAccessoryInstanceId, partParamsSchema, surfacesSchema, wardrobeSchema } from "./customization";
import { failVisible } from "./errors";
import { FACS_UNITS } from "./expression";
import { PART_ROLES, RECIPE_COLOR_KEYS } from "./mesh-data";
import { BODY_PARAM_KEYS, FACE_PARAM_KEYS } from "./params";
import { PHYSICS_PROVIDER_IDS } from "./physics";
import { DEFAULT_SHADING, shadingProfileSchema, shadingProfileSchemaV2, upgradeShadingV2 } from "./shading";
import { CHARACTER_SLOT_KINDS, isPresetId } from "./slots";

import type { KitBaseId } from "./character-kit";
import type { LabFailure } from "./errors";
import type { ShadingProfile } from "./shading";
import type { PresetId } from "./slots";

/** 현재 레시피 버전. 직렬화는 항상 이 버전으로 쓴다. */
export const RECIPE_VERSION = 3 as const;
/** 읽을 수 있는 가장 오래된 버전(v1·v2는 명시 마이그레이션 사슬로 변환) */
export const RECIPE_MIN_SUPPORTED_VERSION = 1 as const;
export const RECIPE_SUPPORTED_VERSIONS = [1, 2, 3] as const;

/** v3에서 새로 생긴 최상위 필드(v2 → v3 마이그레이션이 기본값으로 채운다) */
export const RECIPE_V3_ONLY_FIELDS = ["style", "wardrobe", "partParams", "surfaces", "hairColor"] as const;

export const HEX_COLOR = /^#[0-9a-f]{6}$/u;
export const CHARACTER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,62}$/u;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export const hexColorSchema = z.string().regex(HEX_COLOR, "색은 소문자 #rrggbb 형식이어야 합니다.");

export const presetIdSchema = z.custom<PresetId>((value) => isPresetId(value), {
  message: "프리셋 id는 <슬롯>/<이름> 형식이어야 합니다.",
});

/** 기본 8키 색(v1·v2 레시피 `colors`, 프리셋 patch 색). v3 레시피 `colors`는 `channelColorsSchema`(27채널)다. */
export const recipeColorsSchema = z
  .object({
    skin: hexColorSchema,
    iris: hexColorSchema,
    hair: hexColorSchema,
    brow: hexColorSchema,
    top: hexColorSchema,
    bottom: hexColorSchema,
    shoes: hexColorSchema,
    accessory: hexColorSchema,
  })
  .strict();

/** [-1, 1] 파라미터 값 맵(없는 키는 0) */
export function paramValuesSchema<const K extends readonly [string, ...string[]]>(keys: K) {
  return z.partialRecord(z.enum(keys), z.number().min(-1).max(1));
}

export const bodyParamsSchema = paramValuesSchema(BODY_PARAM_KEYS);
export const faceParamsSchema = paramValuesSchema(FACE_PARAM_KEYS);

export const quatSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]).readonly();
export const poseSchema = z.partialRecord(z.enum(HUMANOID_BONE_NAMES), quatSchema);
export const handPoseSchema = z.object({ left: poseSchema, right: poseSchema }).strict();
export const expressionWeightsSchema = z.partialRecord(z.enum(FACS_UNITS), z.number().min(0).max(1));

/** v1 소스(절차·제작 패키지). v1 파일을 읽을 때만 쓴다. */
export const recipeSourceSchemaV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("procedural") }).strict(),
  z
    .object({
      kind: z.literal("package"),
      characterId: z.string().regex(CHARACTER_ID_PATTERN, "characterId 형식이 올바르지 않습니다."),
      sha256: z.string().regex(SHA256_PATTERN, "sha256은 64자리 소문자 hex여야 합니다."),
    })
    .strict(),
]);

/** v2·v3 소스: v1 두 종류 + 모듈식 키트(`kit`). 키트 파츠 목록은 레시피에 중복 저장하지 않고 `slots`에서 읽는다. */
export const recipeSourceSchema = z.discriminatedUnion("kind", [
  ...recipeSourceSchemaV1.options,
  z
    .object({
      kind: z.literal("kit"),
      kitId: z.string().regex(CHARACTER_ID_PATTERN, "kitId 형식이 올바르지 않습니다."),
      baseId: z.enum(KIT_BASE_IDS),
      kitVersion: z.number().int().positive(),
      /** 선택: `kit.json` 바이트의 SHA-256. 있으면 로더가 대조한다(엄격 재현). 기본 레시피는 생략한다. */
      manifestSha256: z.string().regex(SHA256_PATTERN, "manifestSha256은 64자리 소문자 hex여야 합니다.").optional(),
    })
    .strict(),
]);

export const paintLayerRecordSchema = z
  .object({
    part: z.enum(PART_ROLES),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** 레이어 RGBA PNG의 base64 */
    pngBase64: z.string(),
  })
  .strict();

/** v3 `style`: 마지막으로 적용한 화풍 팩(출처)·비례 목표(없으면 소스 고유 비례)·화풍 중립 표정(플래너가 표정 가중치에 더한다) */
export const recipeStyleSchema = z
  .object({
    packId: z.enum(ART_STYLE_IDS).nullable(),
    packRevision: z.number().int().min(0),
    proportion: proportionSchema.nullable(),
    neutralFacs: expressionWeightsSchema,
  })
  .strict()
  .refine((style) => (style.packId === null) === (style.packRevision === 0), {
    message: "화풍 팩이 없으면 packRevision은 0이고, 있으면 1 이상이어야 합니다.",
    path: ["packRevision"],
  });

/** 버전·소스를 제외한 v1/v2 공통 필드 */
const recipeBodyShapeV2 = {
  slots: z.record(z.enum(CHARACTER_SLOT_KINDS), presetIdSchema.nullable()),
  body: bodyParamsSchema,
  face: faceParamsSchema,
  colors: recipeColorsSchema,
  expression: expressionWeightsSchema,
  pose: poseSchema,
  handPose: handPoseSchema,
  physics: z.object({ provider: z.enum(PHYSICS_PROVIDER_IDS) }).strict(),
  shading: shadingProfileSchemaV2,
  paint: z.object({ layers: z.array(paintLayerRecordSchema) }).strict(),
};

/** v3 필드: v2 공통 필드의 colors·shading을 넓히고 커스터마이즈 필드를 더한다 */
const recipeBodyShapeV3 = {
  ...recipeBodyShapeV2,
  colors: channelColorsSchema,
  shading: shadingProfileSchema,
  style: recipeStyleSchema,
  wardrobe: wardrobeSchema,
  partParams: partParamsSchema,
  surfaces: surfacesSchema,
  hairColor: hairColorSchema,
};

interface RecipeIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly message: string;
}

/** v3 필드 사이의 교차 규칙: 소품 범위 형태 값은 그 소품 인스턴스가 있을 때만, 패턴 두 번째 색은 바탕 채널과 다른 채널 */
function recipeV3Issues(recipe: z.infer<typeof characterRecipeObjectSchema>): RecipeIssue[] {
  const issues: RecipeIssue[] = [];
  const instances = new Set(recipe.wardrobe.accessories.map((instance) => instance.id));
  for (const scope of Object.keys(recipe.partParams)) {
    if (isAccessoryInstanceId(scope) && !instances.has(scope)) {
      issues.push({ path: ["partParams", scope], message: `소품 인스턴스 ${scope}가 wardrobe.accessories에 없습니다.` });
    }
  }
  for (const [channel, surface] of Object.entries(recipe.surfaces)) {
    if (surface?.pattern && surface.pattern.inkChannel === channel) {
      issues.push({ path: ["surfaces", channel, "pattern", "inkChannel"], message: `패턴의 두 번째 색 채널(${channel})이 바탕 채널과 같습니다.` });
    }
  }
  return issues;
}

const characterRecipeObjectSchema = z
  .object({
    version: z.literal(RECIPE_VERSION),
    source: recipeSourceSchema,
    ...recipeBodyShapeV3,
  })
  .strict();

/** 현재(v3) 레시피 스키마 */
export const characterRecipeSchema = characterRecipeObjectSchema.superRefine((recipe, ctx) => {
  for (const issue of recipeV3Issues(recipe)) ctx.addIssue({ code: "custom", message: issue.message, path: [...issue.path] });
});

/** v2 레시피 스키마(읽기 전용 호환. 메모리의 레시피는 항상 v3다) */
export const characterRecipeSchemaV2 = z
  .object({
    version: z.literal(2),
    source: recipeSourceSchema,
    ...recipeBodyShapeV2,
  })
  .strict();

/** v1 레시피 스키마(v2와 소스 유니온만 다르다). 읽기 전용 호환. */
export const characterRecipeSchemaV1 = z
  .object({
    version: z.literal(1),
    source: recipeSourceSchemaV1,
    ...recipeBodyShapeV2,
  })
  .strict();

export type CharacterRecipe = z.infer<typeof characterRecipeSchema>;
export type CharacterRecipeV2 = z.infer<typeof characterRecipeSchemaV2>;
export type CharacterRecipeV1 = z.infer<typeof characterRecipeSchemaV1>;
/** 기본 8키 색(플랜 `colors`·프리셋 patch·v2 레시피). v3 레시피의 `colors` 타입은 `ChannelColors`다. */
export type RecipeColors = z.infer<typeof recipeColorsSchema>;
export type RecipeSource = z.infer<typeof recipeSourceSchema>;
export type RecipeSlots = CharacterRecipe["slots"];
export type PaintLayerRecord = z.infer<typeof paintLayerRecordSchema>;
export type RecipeStyle = z.infer<typeof recipeStyleSchema>;

/** 프리셋 patch가 바꿀 수 있는 파츠 슬롯 */
export const PATCH_PART_SLOTS = ["hair", "top", "bottom", "shoes", "accessory", "irises", "eyes"] as const;
export type PatchPartSlot = (typeof PATCH_PART_SLOTS)[number];

/** 프리셋 patch 부분 스키마(catalogInvariants가 검사). colors는 기본 8키 중 부분 지정 허용. */
export const recipePatchSchema = z
  .object({
    body: bodyParamsSchema.optional(),
    face: faceParamsSchema.optional(),
    colors: recipeColorsSchema.partial().optional(),
    expression: expressionWeightsSchema.optional(),
    pose: poseSchema.optional(),
    handPose: handPoseSchema.optional(),
    parts: z.partialRecord(z.enum(PATCH_PART_SLOTS), z.string()).optional(),
  })
  .strict();

export const DEFAULT_RECIPE_COLORS: RecipeColors = Object.freeze({
  skin: "#f3d3bd",
  iris: "#5a3a2a",
  hair: "#2b1d16",
  brow: "#2b1d16",
  top: "#e8e8ee",
  bottom: "#3b4a6b",
  shoes: "#f5f5f5",
  accessory: "#c94f6b",
});

/** 화풍을 적용한 적 없는 `style`(v2 → v3 마이그레이션 기본값) */
export function createDefaultRecipeStyle(): RecipeStyle {
  return { packId: null, packRevision: 0, proportion: null, neutralFacs: {} };
}

/**
 * 기본 레시피: 절차 소스, 표준 체형, 중립 표정·A 포즈. 슬롯 기본값은 키트 계약 상수 `KIT_DEFAULT_SLOTS`와 같은 값이다(단일 기준).
 * 앱 부팅의 기본 소스는 `app/composition.ts`의 `DEFAULT_BOOT_SOURCE`가 정한다(키트 에셋이 안착한 2026-10-11부터 `kit`이고
 * 그때는 `createKitDefaultRecipe()`로 부팅한다). 이 팩토리는 절차 소스 부팅과 절차 소스가 필요한 테스트용이다.
 * v3 필드는 마이그레이션 기본값과 같다 — 그래서 v2 기본 레시피를 올린 결과와 이 레시피가 같다(시험이 확인).
 */
export function createDefaultRecipe(): CharacterRecipe {
  return {
    version: RECIPE_VERSION,
    source: { kind: "procedural" },
    slots: { ...KIT_DEFAULT_SLOTS },
    body: {},
    face: {},
    colors: { ...DEFAULT_RECIPE_COLORS },
    expression: {},
    pose: {},
    handPose: { left: {}, right: {} },
    physics: { provider: "builtin-pbd" },
    shading: structuredClone(DEFAULT_SHADING),
    paint: { layers: [] },
    style: createDefaultRecipeStyle(),
    wardrobe: createDefaultWardrobe(),
    partParams: {},
    surfaces: {},
    hairColor: createDefaultHairColor(),
  };
}

/**
 * 키트 소스의 툰 기본값(리드 결정 A-10): 램프 2단, 림 끔.
 * 실사 비례 몸에서 3단 램프는 큰 불규칙 두 톤 패치를 만들고 2단은 형태를 따르는 경계 하나만 남기며, 기본 림 임계값은 실루엣에 흰 점선을 만든다.
 * 절차 소스의 기본값(`DEFAULT_SHADING.toon`)은 바꾸지 않는다.
 */
export const KIT_DEFAULT_TOON: Pick<ShadingProfile["toon"], "rampSteps" | "rim"> = Object.freeze({ rampSteps: 2, rim: false });

/**
 * 셰이딩의 툰 값 중 아직 절차 소스 기본값(`DEFAULT_SHADING.toon`)인 것만 키트 기본값(`KIT_DEFAULT_TOON`)으로 바꾼다.
 * 사용자가 이미 바꾼 값(램프 단수·림)은 그대로 둔다. 바꿀 것이 없으면 같은 참조를 돌려준다.
 */
export function applyKitToonDefaults(shading: ShadingProfile): ShadingProfile {
  const rampSteps = shading.toon.rampSteps === DEFAULT_SHADING.toon.rampSteps ? KIT_DEFAULT_TOON.rampSteps : shading.toon.rampSteps;
  const rim = shading.toon.rim === DEFAULT_SHADING.toon.rim ? KIT_DEFAULT_TOON.rim : shading.toon.rim;
  if (rampSteps === shading.toon.rampSteps && rim === shading.toon.rim) return shading;
  return { ...shading, toon: { ...shading.toon, rampSteps, rim } };
}

/**
 * 키트 기본 레시피: `createDefaultRecipe()`에서 소스를 키트로 바꾸고 툰 셰이딩을 키트 기본값(램프 2단·림 끔, A-10)으로 둔 것(기본 소스 전환, 계약 6절).
 * `DEFAULT_SHADING`과 절차 소스 기본 레시피는 그대로다.
 */
export function createKitDefaultRecipe(baseId: KitBaseId = KIT_DEFAULT_BASE_ID): CharacterRecipe {
  const base = createDefaultRecipe();
  return {
    ...base,
    source: { kind: "kit", kitId: KIT_DEFAULT_ID, baseId, kitVersion: KIT_CURRENT_VERSION },
    shading: applyKitToonDefaults(base.shading),
  };
}

/** v1 → v2 명시 마이그레이션: 필드는 그대로이고 버전 번호만 올린다(v1 소스 종류는 v2의 부분집합이라 의미가 같다). */
export function migrateRecipeV1ToV2(recipe: CharacterRecipeV1): CharacterRecipeV2 {
  return { ...recipe, version: 2 };
}

/**
 * v2 → v3 명시 마이그레이션(시각 항등): 8키 색은 그대로 옮기고(나머지 채널은 상속), 셰이딩에 v2 항등 look을 넣고,
 * 새 필드는 "없음"으로 채운다 — 화풍 없음·층 없음·소품 추가 없음·형태 값 없음·표면 지정 없음·헤어 끝 색 섞기 0.
 */
export function migrateRecipeV2ToV3(recipe: CharacterRecipeV2): CharacterRecipe {
  return {
    ...recipe,
    version: RECIPE_VERSION,
    colors: { ...recipe.colors },
    shading: upgradeShadingV2(recipe.shading),
    style: createDefaultRecipeStyle(),
    wardrobe: createDefaultWardrobe(),
    partParams: {},
    surfaces: {},
    hairColor: createDefaultHairColor(),
  };
}

export type ParseRecipeResult =
  | {
      readonly ok: true;
      readonly recipe: CharacterRecipe;
      /** v1·v2 파일을 v3로 변환해 연 경우 원래 버전(1 또는 2). 변환은 사용자에게 알려야 하지만 실패는 아니다. */
      readonly migratedFrom?: number;
    }
  | { readonly ok: false; readonly failure: LabFailure };

interface ZodIssueLike {
  readonly code?: string;
  readonly path: ReadonlyArray<PropertyKey>;
  readonly message: string;
  readonly issues?: ReadonlyArray<{ readonly message: string }>;
}

/** 이슈 요약(첫 5개). 레코드 키 오류(`invalid_key`)는 중첩 이슈의 한글 메시지를 쓴다. */
export function describeRecipeIssues(issues: ReadonlyArray<ZodIssueLike>): string {
  return issues
    .slice(0, 5)
    .map((issue) => {
      const nested = issue.code === "invalid_key" ? issue.issues?.[0]?.message : undefined;
      return `${issue.path.map(String).join(".") || "(root)"}: ${nested ?? issue.message}`;
    })
    .join("; ");
}

function invalid(issues: ReadonlyArray<ZodIssueLike>, now: number | undefined): ParseRecipeResult {
  return { ok: false, failure: failVisible("recipe-invalid", `레시피 형식이 올바르지 않습니다: ${describeRecipeIssues(issues)}`, undefined, now) };
}

/** 마이그레이션 결과를 현재 스키마로 다시 검사한다(변환 버그가 무음으로 새지 않게). */
function finishMigration(migrated: CharacterRecipe, from: 1 | 2, now: number | undefined): ParseRecipeResult {
  const checked = characterRecipeSchema.safeParse(migrated);
  if (!checked.success) {
    return {
      ok: false,
      failure: failVisible("recipe-migration-invalid", `레시피 v${from} → v${RECIPE_VERSION} 변환 결과가 현재 형식에 맞지 않습니다: ${describeRecipeIssues(checked.error.issues)}`, undefined, now),
    };
  }
  return { ok: true, recipe: checked.data, migratedFrom: from };
}

/**
 * 알 수 없는 JSON 값을 레시피로 파싱한다. 실패는 한글 사유를 가진 LabFailure로 돌려준다.
 */
export function parseRecipe(json: unknown, now?: number): ParseRecipeResult {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, failure: failVisible("recipe-not-object", "레시피는 JSON 객체여야 합니다.", undefined, now) };
  }
  const version = (json as { version?: unknown }).version;
  if (version !== 1 && version !== 2 && version !== RECIPE_VERSION) {
    return {
      ok: false,
      failure: failVisible(
        "recipe-unsupported-version",
        `지원하지 않는 레시피 버전입니다: ${String(version)} (지원: ${RECIPE_SUPPORTED_VERSIONS.join(", ")})`,
        undefined,
        now,
      ),
    };
  }
  if (version === 1) {
    const legacy = characterRecipeSchemaV1.safeParse(json);
    if (!legacy.success) return invalid(legacy.error.issues, now);
    return finishMigration(migrateRecipeV2ToV3(migrateRecipeV1ToV2(legacy.data)), 1, now);
  }
  if (version === 2) {
    const legacy = characterRecipeSchemaV2.safeParse(json);
    if (!legacy.success) return invalid(legacy.error.issues, now);
    return finishMigration(migrateRecipeV2ToV3(legacy.data), 2, now);
  }
  const result = characterRecipeSchema.safeParse(json);
  if (!result.success) return invalid(result.error.issues, now);
  return { ok: true, recipe: result.data };
}

/** 키 순서와 무관한 결정적 digest(fnv1a64 hex 16자리) */
export function recipeDigest(recipe: CharacterRecipe): string {
  return fnv1a64Hex(stableStringify(recipe));
}

/** 색 키 목록(RECIPE_COLOR_KEYS와 동일) — 스키마와 상수가 어긋나면 테스트가 잡는다. */
export const RECIPE_COLOR_KEY_LIST: readonly (keyof RecipeColors)[] = RECIPE_COLOR_KEYS;
