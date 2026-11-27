/**
 * 웹툰 캐릭터 키트 v2(`toonstudio-kit-v2`) 5대 아키타입·실계약 매니페스트 스키마·카탈로그 요약 헬퍼.
 *
 * - 기존 `toonstudio-kit-v1`(`KIT_BASE_IDS = ["female", "male"]`)과 이론 v2(`character-kit-v2.ts`)를
 *   건드리지 않고, 온디스크 `public/assets/characters/toonstudio-kit-v2/kit.json`을 엄격히 검증한다.
 * - 순수 TS + zod 모듈(`src/architecture.test.ts` PURE_DIRS 규칙 준수).
 */
import { z } from "zod";

import { kitFileSchema, kitRegionRangeSchema } from "./character-kit";
import { kitV2AnchorSchema, kitV2TintSchema } from "./character-kit-v2";
import { failVisible } from "./errors";
import { kitSourceSchema } from "./kit-provenance";
import { kitSkeletonSchema } from "./kit-skeleton";
import { clampParam } from "./params";

import type { KitBaseId } from "./character-kit";
import type { LabFailure } from "./errors";
import type { BodyParamKey, ParamValues } from "./params";

export const KIT_V2_WEBTOON_ID = "toonstudio-kit-v2" as const;
export const KIT_V2_WEBTOON_SCHEMA_ID = "toonstudio.character-kit/2" as const;

export const KIT_V2_ARCHETYPE_IDS = ["female-romance", "male-webtoon", "male-action", "youth-academy", "sd-chibi"] as const;
export type KitV2ArchetypeId = (typeof KIT_V2_ARCHETYPE_IDS)[number];

const KIT_V2_ARCHETYPE_SET: ReadonlySet<string> = new Set(KIT_V2_ARCHETYPE_IDS);

export function isKitV2ArchetypeId(value: unknown): value is KitV2ArchetypeId {
  return typeof value === "string" && KIT_V2_ARCHETYPE_SET.has(value);
}

/** v2 키트 단독 허용 glTF 확장(`KHR_mesh_quantization`) */
export const KIT_V2_ALLOWED_EXTENSIONS = ["KHR_mesh_quantization"] as const;

/** v2 키트 금지 glTF 확장(Draco·meshopt·WebP·KTX2/BasisU 차단) */
export const KIT_V2_FORBIDDEN_EXTENSIONS = [
  "EXT_meshopt_compression",
  "EXT_texture_webp",
  "KHR_draco_mesh_compression",
  "KHR_texture_basisu",
] as const;

export const KIT_V2_HAND_POSE_IDS = [
  "relax", "fist", "open-palm", "point",
  "peace-v", "hold-pen", "hold-phone", "hold-cup",
  "hold-sword", "hold-gun", "pray", "chin-rest",
  "finger-heart", "grab-collar", "beckon", "thumbs-up",
] as const;
export type KitV2HandPoseId = (typeof KIT_V2_HAND_POSE_IDS)[number];

export const KIT_V2_HAND_POSE_LABELS_KO: Readonly<Record<KitV2HandPoseId, string>> = Object.freeze({
  relax: "자연 이완", fist: "쥔 주먹", "open-palm": "손바닥 펼침", point: "검지 가리키기",
  "peace-v": "V 사인", "hold-pen": "펜/붓 쥐기", "hold-phone": "스마트폰 파지", "hold-cup": "찻잔/머그 쥐기",
  "hold-sword": "검/무기 파지", "hold-gun": "권총 그립", pray: "기도/모은 손", "chin-rest": "턱 괴기",
  "finger-heart": "손하트", "grab-collar": "멱살/천 잡기", beckon: "손짓/부르기", "thumbs-up": "엄지척",
});

export interface KitV2GarmentGenreSummary {
  readonly id: string;
  readonly labelKo: string;
  readonly count: number;
}

/** 6대 웹툰 장르 의상 카탈로그 요약(총 34종) */
export const KIT_V2_GARMENT_GENRES: readonly KitV2GarmentGenreSummary[] = Object.freeze([
  { id: "korean-academy", labelKo: "한국 학원 교복", count: 6 },
  { id: "modern-casual", labelKo: "현대 데일리·캐주얼", count: 6 },
  { id: "office-suit", labelKo: "오피스·수트", count: 6 },
  { id: "rofan-imperial", labelKo: "로판·제국 귀족", count: 6 },
  { id: "action-techwear", labelKo: "액션·테크웨어", count: 5 },
  { id: "murim-fantasy", labelKo: "무협·동양 판타지", count: 5 },
]);

export interface KitV2ArchetypePreset {
  readonly id: KitV2ArchetypeId;
  readonly labelKo: string;
  readonly genreKo: string;
  readonly headToBodyRatio: number;
  readonly heightM: number;
  readonly baseId: KitBaseId;
  readonly height: number;
  readonly headSize: number;
  readonly shoulderWidth: number;
  readonly legLength: number;
  readonly waistWidth: number;
}

/** 5대 웹툰 아키타입 체형 비율 프리셋(레시피 `body` 파라미터 [-1, 1] 및 `female`/`male` 베이스 매핑) */
export const KIT_V2_ARCHETYPE_PRESETS: Readonly<Record<KitV2ArchetypeId, KitV2ArchetypePreset>> = Object.freeze({
  "female-romance": {
    id: "female-romance", labelKo: "여성 로맨스", genreKo: "로맨스 · 로판 · 학원",
    headToBodyRatio: 7.8, heightM: 1.65, baseId: "female",
    height: 0.08, headSize: -0.18, shoulderWidth: -0.16, legLength: 0.24, waistWidth: -0.22,
  },
  "male-webtoon": {
    id: "male-webtoon", labelKo: "웹툰 미남", genreKo: "현대 · 로판 공작 · 오피스",
    headToBodyRatio: 8.6, heightM: 1.82, baseId: "male",
    height: 0.56, headSize: -0.34, shoulderWidth: 0.36, legLength: 0.48, waistWidth: -0.12,
  },
  "male-action": {
    id: "male-action", labelKo: "액션 헌터", genreKo: "액션 · 헌터 · 무협",
    headToBodyRatio: 8.4, heightM: 1.86, baseId: "male",
    height: 0.68, headSize: -0.28, shoulderWidth: 0.62, legLength: 0.44, waistWidth: 0.14,
  },
  "youth-academy": {
    id: "youth-academy", labelKo: "학원 유스", genreKo: "소년 · 일상 · 학원",
    headToBodyRatio: 7.0, heightM: 1.56, baseId: "female",
    height: -0.24, headSize: 0.14, shoulderWidth: -0.18, legLength: -0.12, waistWidth: -0.06,
  },
  "sd-chibi": {
    id: "sd-chibi", labelKo: "SD 치비", genreKo: "개그 · 코미디 · 이모티콘",
    headToBodyRatio: 3.1, heightM: 1.05, baseId: "female",
    height: -0.92, headSize: 0.96, shoulderWidth: -0.45, legLength: -0.82, waistWidth: 0.18,
  },
});

export const KIT_V2_ARCHETYPE_PRESET_LIST: readonly KitV2ArchetypePreset[] = Object.freeze(
  KIT_V2_ARCHETYPE_IDS.map((id) => KIT_V2_ARCHETYPE_PRESETS[id]),
);

/** 아키타입 프리셋을 캐릭터 레시피 `body` 파라미터 맵으로 변환한다(`waistWidth` -> `waist`). */
export function archetypePresetToBodyParams(preset: KitV2ArchetypePreset): ParamValues<BodyParamKey> {
  return {
    height: clampParam(preset.height),
    headSize: clampParam(preset.headSize),
    shoulderWidth: clampParam(preset.shoulderWidth),
    legLength: clampParam(preset.legLength),
    waist: clampParam(preset.waistWidth),
  };
}

// ---------------------------------------------------------------- 온디스크 kit.json Zod 스키마

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MATERIAL_NAME_PATTERN = /^ts_[a-z0-9_-]+$/u;
const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

const webtoonKitV2MeshSchema = z.object({
  node: z.string().min(1),
  triangles: z.number().int().positive(),
  vertices: z.number().int().positive(),
  skinned: z.boolean(),
  morphs: z.array(z.string().min(1)).max(96),
  material: z.string().regex(MATERIAL_NAME_PATTERN).optional(),
  primitiveMaterials: z.array(z.string().regex(MATERIAL_NAME_PATTERN)).min(1).optional(),
  hasUv1: z.boolean().optional(),
}).strict();

const webtoonKitV2BaseSchema = z.object({
  archetypeId: z.enum(KIT_V2_ARCHETYPE_IDS),
  labelKo: z.string().min(1),
  genre: z.string().min(1),
  file: kitFileSchema,
  heightM: z.number().min(0.5).max(3),
  headHeightM: z.number().min(0.1).max(0.5),
  headToBodyRatio: z.number().positive().max(12),
  boundsM: z.object({ min: vec3Schema, max: vec3Schema }).strict(),
  extensions: z.array(z.string().min(1)),
  meshes: z.array(webtoonKitV2MeshSchema).min(1),
  bodyRegions: z.array(kitRegionRangeSchema).length(15),
  anchors: z.record(z.string().min(1), kitV2AnchorSchema),
  eyeVertexCounts: z.record(z.string().min(1), z.number().int().positive()),
  neckSeamVertexPairs: z.number().int().nonnegative(),
}).strict();

const webtoonKitV2PartVariantSchema = z.object({
  file: kitFileSchema,
  extensions: z.array(z.string().min(1)),
  meshes: z.array(webtoonKitV2MeshSchema).min(1),
  shapes: z.array(z.string().min(1)).max(8),
}).strict();

const webtoonKitV2PartSchema = z.object({
  id: z.string().min(1),
  slot: z.enum(["hair", "garments", "top", "bottom", "shoes", "accessory", "irises"]),
  variants: z.record(z.string().min(1), webtoonKitV2PartVariantSchema),
  layerVariants: z.record(z.string().min(1), z.record(z.string().min(1), webtoonKitV2PartVariantSchema)).optional(),
}).strict();

const webtoonKitV2MaterialSchema = z.object({
  role: z.string().min(1),
  channel: z.string().min(1).optional(),
  tint: kitV2TintSchema,
  doubleSided: z.boolean(),
}).strict();

const webtoonKitV2HeroVrmSchema = z.object({
  id: z.string().min(1),
  nameKo: z.string().min(1),
  baseArchetype: z.enum(KIT_V2_ARCHETYPE_IDS),
  genre: z.string().min(1),
  publicUrl: z.string().startsWith("/vrm/"),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(SHA256_PATTERN),
  humanoidBones: z.literal(55),
  presetExpressions: z.literal(18),
  mtoonOutlineWidthMode: z.literal("screenCoordinates"),
  springCount: z.number().int().positive(),
  minHitRadius: z.number().positive(),
}).strict();

const webtoonKitV2ManifestObjectSchema = z.object({
  schema: z.literal(KIT_V2_WEBTOON_SCHEMA_ID),
  kitId: z.literal(KIT_V2_WEBTOON_ID),
  kitVersion: z.literal(2),
  displayName: z.string().min(1),
  generatedAt: z.string().regex(DATE_PATTERN),
  generator: z.object({ tool: z.string().min(1), blender: z.string().min(1), command: z.array(z.string().min(1)).min(1) }).strict(),
  coordinateSystem: z.object({
    up: z.literal("+Y"),
    forward: z.literal("+Z"),
    unit: z.literal("m"),
    handedness: z.literal("right"),
    rest: z.literal("T-pose"),
    rootScale: z.literal(1),
  }).strict(),
  codecPolicy: z.object({ allowedExtensions: z.array(z.string().min(1)).min(1), forbiddenExtensions: z.array(z.string().min(1)).min(4) }).strict(),
  provenance: z.object({ noticeFile: z.string().min(1), summaryKo: z.string().min(1), sources: z.array(kitSourceSchema).min(1) }).strict(),
  skeleton: kitSkeletonSchema,
  materials: z.record(z.string().regex(MATERIAL_NAME_PATTERN), webtoonKitV2MaterialSchema),
  jointOffsets: z.record(z.string().min(1), z.record(z.string().min(1), vec3Schema)),
  baseAliases: z.object({ female: z.enum(KIT_V2_ARCHETYPE_IDS), male: z.enum(KIT_V2_ARCHETYPE_IDS) }).strict(),
  bases: z.object({
    "female-romance": webtoonKitV2BaseSchema,
    "male-webtoon": webtoonKitV2BaseSchema,
    "male-action": webtoonKitV2BaseSchema,
    "youth-academy": webtoonKitV2BaseSchema,
    "sd-chibi": webtoonKitV2BaseSchema,
  }).strict(),
  parts: z.array(webtoonKitV2PartSchema),
  expressions: z.object({
    file: kitFileSchema,
    morphCount: z.number().int().positive(),
    webtoonEmotionPresets: z.array(z.string().min(1)).min(1),
    vrm1Presets: z.array(z.string().min(1)).min(1),
  }).strict(),
  handPoses: z.object({
    file: kitFileSchema,
    count: z.literal(16),
    poseIds: z.array(z.enum(KIT_V2_HAND_POSE_IDS)).length(16),
    vrmaCount: z.literal(16),
    contactSheet: z.string().min(1).optional(),
  }).strict(),
  heroVrmAvatars: z.array(webtoonKitV2HeroVrmSchema).length(8),
  defaults: z.object({ base: z.enum(KIT_V2_ARCHETYPE_IDS), handPose: z.string().min(1), expression: z.string().min(1) }).strict(),
  physics: z.object({ mode: z.literal("vrm-spring-bone-1.0"), minHitRadiusGt: z.number().nonnegative() }).strict(),
  budgets: z.object({
    baseGlbMaxBytes: z.number().int().positive(),
    partGlbMaxBytes: z.number().int().positive(),
    totalMaxBytes: z.number().int().positive(),
    jointCount: z.literal(68),
    maxInfluencesPerVertex: z.literal(4),
    weightSumTolerance: z.number().positive(),
    maxMorphTargetsPerMesh: z.literal(96),
    maxShapesPerVariant: z.literal(8),
  }).strict(),
}).strict();

export const webtoonKitV2ManifestSchema = webtoonKitV2ManifestObjectSchema.superRefine((manifest, ctx) => {
  const allowed = manifest.codecPolicy.allowedExtensions;
  const forbidden = new Set(manifest.codecPolicy.forbiddenExtensions);
  if (allowed.length !== 1 || allowed[0] !== KIT_V2_ALLOWED_EXTENSIONS[0]) {
    ctx.addIssue({ code: "custom", path: ["codecPolicy", "allowedExtensions"], message: `허용 코덱은 ${KIT_V2_ALLOWED_EXTENSIONS[0]} 단독이어야 합니다.` });
  }
  for (const ext of KIT_V2_FORBIDDEN_EXTENSIONS) {
    if (!forbidden.has(ext)) {
      ctx.addIssue({ code: "custom", path: ["codecPolicy", "forbiddenExtensions"], message: `금지 코덱 목록에 ${ext}가 빠져 있습니다.` });
    }
  }
  const allowedSet = new Set(allowed);
  for (const archId of KIT_V2_ARCHETYPE_IDS) {
    const base = manifest.bases[archId];
    if (base.archetypeId !== archId) {
      ctx.addIssue({ code: "custom", path: ["bases", archId, "archetypeId"], message: `베이스 키(${archId})와 archetypeId(${base.archetypeId})가 다릅니다.` });
    }
    for (const ext of base.extensions) {
      if (forbidden.has(ext) || !allowedSet.has(ext)) {
        ctx.addIssue({ code: "custom", path: ["bases", archId, "extensions"], message: `베이스 ${archId}에 허용되지 않은 확장(${ext})이 포함되었습니다.` });
      }
    }
  }
  const seenParts = new Set<string>();
  let hairCount = 0;
  let garmentCount = 0;
  manifest.parts.forEach((part, index) => {
    if (seenParts.has(part.id)) ctx.addIssue({ code: "custom", path: ["parts", index, "id"], message: `파츠 id가 중복되었습니다: ${part.id}` });
    seenParts.add(part.id);
    if (part.slot === "hair") hairCount += 1;
    if (part.slot === "garments") garmentCount += 1;
    for (const [variantKey, variant] of Object.entries(part.variants)) {
      for (const ext of variant.extensions) {
        if (forbidden.has(ext) || !allowedSet.has(ext)) {
          ctx.addIssue({ code: "custom", path: ["parts", index, "variants", variantKey, "extensions"], message: `파츠 ${part.id}에 허용되지 않은 확장(${ext})이 포함되었습니다.` });
        }
      }
    }
  });
  if (hairCount !== 12) ctx.addIssue({ code: "custom", path: ["parts"], message: `헤어 파츠는 12종이어야 합니다(현재 ${hairCount}종).` });
  if (garmentCount !== 34) ctx.addIssue({ code: "custom", path: ["parts"], message: `의상 파츠는 34종이어야 합니다(현재 ${garmentCount}종).` });
  if (new Set(manifest.handPoses.poseIds).size !== 16) ctx.addIssue({ code: "custom", path: ["handPoses", "poseIds"], message: "16종 핸드 포즈 id에 중복이 있습니다." });
});

export type WebtoonKitV2Manifest = z.infer<typeof webtoonKitV2ManifestSchema>;

export type ParseWebtoonKitV2ManifestResult =
  | { readonly ok: true; readonly manifest: WebtoonKitV2Manifest }
  | { readonly ok: false; readonly failure: LabFailure };

function summarizeIssues(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): string {
  return issues.slice(0, 5).map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`).join("; ");
}

/** 온디스크 `toonstudio-kit-v2/kit.json`을 엄격히 검증한다. */
export function parseWebtoonKitV2Manifest(json: unknown, now?: number): ParseWebtoonKitV2ManifestResult {
  const parsed = webtoonKitV2ManifestSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, failure: failVisible("kit-manifest-invalid", `키트 v2 웹툰 매니페스트 형식이 올바르지 않습니다: ${summarizeIssues(parsed.error.issues)}`, undefined, now) };
  }
  return { ok: true, manifest: parsed.data };
}

export interface WebtoonKitV2CatalogSummary {
  readonly kitId: string;
  readonly baseCount: number;
  readonly hairCount: number;
  readonly garmentCount: number;
  readonly totalGlbCount: number;
  readonly handPoseCount: number;
  readonly handPoseVrmaCount: number;
  readonly heroVrmCount: number;
  readonly expressionMorphCount: number;
  readonly allowedExtensions: readonly string[];
  readonly forbiddenExtensions: readonly string[];
  readonly garmentGenres: readonly KitV2GarmentGenreSummary[];
  readonly handPoseIds: readonly KitV2HandPoseId[];
}

export const DEFAULT_KIT_V2_CATALOG_SUMMARY: WebtoonKitV2CatalogSummary = Object.freeze({
  kitId: KIT_V2_WEBTOON_ID,
  baseCount: KIT_V2_ARCHETYPE_IDS.length,
  hairCount: 12,
  garmentCount: 34,
  totalGlbCount: 51,
  handPoseCount: KIT_V2_HAND_POSE_IDS.length,
  handPoseVrmaCount: KIT_V2_HAND_POSE_IDS.length,
  heroVrmCount: 8,
  expressionMorphCount: 64,
  allowedExtensions: KIT_V2_ALLOWED_EXTENSIONS,
  forbiddenExtensions: KIT_V2_FORBIDDEN_EXTENSIONS,
  garmentGenres: KIT_V2_GARMENT_GENRES,
  handPoseIds: KIT_V2_HAND_POSE_IDS,
});

/** 검증된 `WebtoonKitV2Manifest`에서 UI·테스트용 카탈로그 요약 수치를 뽑는다. */
export function summarizeWebtoonKitV2Catalog(manifest: WebtoonKitV2Manifest): WebtoonKitV2CatalogSummary {
  const baseCount = KIT_V2_ARCHETYPE_IDS.length;
  const hairCount = manifest.parts.filter((part) => part.slot === "hair").length;
  const garmentCount = manifest.parts.filter((part) => part.slot === "garments").length;
  return {
    kitId: manifest.kitId,
    baseCount,
    hairCount,
    garmentCount,
    totalGlbCount: baseCount + hairCount + garmentCount,
    handPoseCount: manifest.handPoses.count,
    handPoseVrmaCount: manifest.handPoses.vrmaCount,
    heroVrmCount: manifest.heroVrmAvatars.length,
    expressionMorphCount: manifest.expressions.morphCount,
    allowedExtensions: [...manifest.codecPolicy.allowedExtensions],
    forbiddenExtensions: [...manifest.codecPolicy.forbiddenExtensions],
    garmentGenres: KIT_V2_GARMENT_GENRES,
    handPoseIds: [...manifest.handPoses.poseIds],
  };
}
