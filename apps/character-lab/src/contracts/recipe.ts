/**
 * 캐릭터 레시피(zod 4). 저장·불러오기·undo의 단일 상태이며 strict 스키마다.
 *
 * 버전: 현재 v2(소스 종류 `kit` 추가, 2026-10-08 키트 계약 7절). v1 파일은 명시 마이그레이션(`migrateRecipeV1ToV2`)으로만 열린다.
 * 지원하지 않는 버전은 "지원하지 않는 레시피 버전" 한글 사유로 거부한다(무음 마이그레이션 금지).
 */
import { z } from "zod";

import { fnv1a64Hex } from "../shared/hash";
import { stableStringify } from "../shared/stable-json";

import { HUMANOID_BONE_NAMES } from "./bones";
import { KIT_BASE_IDS, KIT_CURRENT_VERSION, KIT_DEFAULT_BASE_ID, KIT_DEFAULT_ID, KIT_DEFAULT_SLOTS } from "./character-kit";
import { failVisible } from "./errors";
import { FACS_UNITS } from "./expression";
import { PART_ROLES, RECIPE_COLOR_KEYS } from "./mesh-data";
import { BODY_PARAM_KEYS, FACE_PARAM_KEYS } from "./params";
import { PHYSICS_PROVIDER_IDS } from "./physics";
import { DEFAULT_SHADING, shadingProfileSchema } from "./shading";
import { CHARACTER_SLOT_KINDS, isPresetId } from "./slots";

import type { KitBaseId } from "./character-kit";
import type { LabFailure } from "./errors";
import type { ShadingProfile } from "./shading";
import type { PresetId } from "./slots";

/** 현재 레시피 버전. 직렬화는 항상 이 버전으로 쓴다. */
export const RECIPE_VERSION = 2 as const;
/** 읽을 수 있는 가장 오래된 버전(v1은 `migrateRecipeV1ToV2`로 명시 변환) */
export const RECIPE_MIN_SUPPORTED_VERSION = 1 as const;
export const RECIPE_SUPPORTED_VERSIONS = [1, 2] as const;

export const HEX_COLOR = /^#[0-9a-f]{6}$/u;
export const CHARACTER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,62}$/u;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export const hexColorSchema = z.string().regex(HEX_COLOR, "색은 소문자 #rrggbb 형식이어야 합니다.");

export const presetIdSchema = z.custom<PresetId>((value) => isPresetId(value), {
  message: "프리셋 id는 <슬롯>/<이름> 형식이어야 합니다.",
});

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

/** v2 소스: v1 두 종류 + 모듈식 키트(`kit`). 키트 파츠 목록은 레시피에 중복 저장하지 않고 `slots`에서 읽는다. */
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

/** 버전·소스를 제외한 v1/v2 공통 필드 */
const recipeBodyShape = {
  slots: z.record(z.enum(CHARACTER_SLOT_KINDS), presetIdSchema.nullable()),
  body: bodyParamsSchema,
  face: faceParamsSchema,
  colors: recipeColorsSchema,
  expression: expressionWeightsSchema,
  pose: poseSchema,
  handPose: handPoseSchema,
  physics: z.object({ provider: z.enum(PHYSICS_PROVIDER_IDS) }).strict(),
  shading: shadingProfileSchema,
  paint: z.object({ layers: z.array(paintLayerRecordSchema) }).strict(),
};

export const characterRecipeSchema = z
  .object({
    version: z.literal(RECIPE_VERSION),
    source: recipeSourceSchema,
    ...recipeBodyShape,
  })
  .strict();

/** v1 레시피 스키마(현행 v2와 소스 유니온만 다르다). 읽기 전용 호환이며 메모리의 레시피는 항상 v2다. */
export const characterRecipeSchemaV1 = z
  .object({
    version: z.literal(1),
    source: recipeSourceSchemaV1,
    ...recipeBodyShape,
  })
  .strict();

export type CharacterRecipe = z.infer<typeof characterRecipeSchema>;
export type CharacterRecipeV1 = z.infer<typeof characterRecipeSchemaV1>;
export type RecipeColors = z.infer<typeof recipeColorsSchema>;
export type RecipeSource = z.infer<typeof recipeSourceSchema>;
export type RecipeSlots = CharacterRecipe["slots"];
export type PaintLayerRecord = z.infer<typeof paintLayerRecordSchema>;

/** 프리셋 patch가 바꿀 수 있는 파츠 슬롯 */
export const PATCH_PART_SLOTS = ["hair", "top", "bottom", "shoes", "accessory", "irises", "eyes"] as const;
export type PatchPartSlot = (typeof PATCH_PART_SLOTS)[number];

/** 프리셋 patch 부분 스키마(catalogInvariants가 검사). colors는 부분 지정 허용. */
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

/**
 * 기본 레시피: 절차 소스, 표준 체형, 중립 표정·A 포즈. 슬롯 기본값은 키트 계약 상수 `KIT_DEFAULT_SLOTS`와 같은 값이다(단일 기준).
 * 앱 부팅의 기본 소스는 `app/composition.ts`의 `DEFAULT_BOOT_SOURCE`가 정한다(키트 에셋 안착 전까지 `procedural`, 안착하면 `kit`로 바꾸고
 * 그때는 `createKitDefaultRecipe()`로 부팅한다). 이 팩토리는 절차 소스 부팅과 절차 소스가 필요한 테스트용이다.
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
export function migrateRecipeV1ToV2(recipe: CharacterRecipeV1): CharacterRecipe {
  return { ...recipe, version: RECIPE_VERSION };
}

export type ParseRecipeResult =
  | {
      readonly ok: true;
      readonly recipe: CharacterRecipe;
      /** v1 파일을 v2로 변환해 연 경우 원래 버전(1). 변환은 사용자에게 알려야 하지만 실패는 아니다. */
      readonly migratedFrom?: number;
    }
  | { readonly ok: false; readonly failure: LabFailure };

function describeIssues(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): string {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * 알 수 없는 JSON 값을 레시피로 파싱한다. 실패는 한글 사유를 가진 LabFailure로 돌려준다.
 */
export function parseRecipe(json: unknown, now?: number): ParseRecipeResult {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, failure: failVisible("recipe-not-object", "레시피는 JSON 객체여야 합니다.", undefined, now) };
  }
  const version = (json as { version?: unknown }).version;
  if (version !== 1 && version !== RECIPE_VERSION) {
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
    if (!legacy.success) {
      return {
        ok: false,
        failure: failVisible("recipe-invalid", `레시피 형식이 올바르지 않습니다: ${describeIssues(legacy.error.issues)}`, undefined, now),
      };
    }
    return { ok: true, recipe: migrateRecipeV1ToV2(legacy.data), migratedFrom: 1 };
  }
  const result = characterRecipeSchema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      failure: failVisible("recipe-invalid", `레시피 형식이 올바르지 않습니다: ${describeIssues(result.error.issues)}`, undefined, now),
    };
  }
  return { ok: true, recipe: result.data };
}

/** 키 순서와 무관한 결정적 digest(fnv1a64 hex 16자리) */
export function recipeDigest(recipe: CharacterRecipe): string {
  return fnv1a64Hex(stableStringify(recipe));
}

/** 색 키 목록(RECIPE_COLOR_KEYS와 동일) — 스키마와 상수가 어긋나면 테스트가 잡는다. */
export const RECIPE_COLOR_KEY_LIST: readonly (keyof RecipeColors)[] = RECIPE_COLOR_KEYS;
