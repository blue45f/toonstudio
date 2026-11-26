/**
 * 모듈식 캐릭터 키트 Zod 스키마 계약 — @toonstudio/studio-project-model/character-kit.
 */
import { z } from "zod";

import { stableStringify } from "../shared/stable-json";

import {
  DATE_PATTERN,
  HEX_COLOR_PATTERN,
  KIT_BASE_IDS,
  KIT_BASE_MESH_SPECS,
  KIT_BODY_NODE,
  KIT_BUDGET,
  KIT_DEFAULT_BASE_ID,
  KIT_HIDEABLE_REGION_IDS,
  KIT_ID_PATTERN,
  KIT_MORPH_COVERAGE,
  KIT_PART_SLOT_REQUIRED_ROLES,
  KIT_PART_SLOT_ROLES,
  KIT_PART_SLOTS,
  KIT_REQUIRED_PRESETS,
  KIT_ROLE_TINT_RULES,
  KIT_SCHEMA_ID,
  MATERIAL_NAME_PATTERN,
  NODE_NAME_PATTERN,
  SHA256_HEX,
} from "./character-kit-constants";
import { failVisible } from "./errors";
import { kitProvenanceIssues, kitSourceSchema } from "./kit-provenance";
import { kitJointOffsetIssues, kitJointOffsetsSchema, kitSkeletonIssues, kitSkeletonSchema, listFew } from "./kit-skeleton";
import { PART_ROLES, RECIPE_COLOR_KEYS } from "./mesh-data";
import { isMorphTargetName } from "./morph-names";
import { AUTHORED_HAIR_MESH_PATTERN, OUTLINE_MESH_SUFFIX, slotCapabilityMapSchema } from "./package-manifest";
import { SLOT_PRESET_IDS } from "./preset-vocabulary";
import { CHARACTER_SLOT_KINDS, isPresetId } from "./slots";

import type { KitBaseId, KitHideableRegionId, KitPartSlot } from "./character-kit-constants";
import type { LabFailure } from "./errors";
import type { KitIssue, KitJointOffsets, KitSkeleton } from "./kit-skeleton";
import type { PartRole } from "./mesh-data";
import type { CharacterRecipe } from "./recipe";
import type { SlotCapabilityMap } from "./slots";

const HANGUL = /[가-힣]/u;

export * from "./character-kit-constants";

// ---------------------------------------------------------------- zod: 기본 조각

function isSafeRelativePath(value: string): boolean {
  if (value.length === 0 || value.startsWith("/") || value.includes("\\") || value.includes(":")) return false;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

const sha256Schema = z.string().regex(SHA256_HEX, "sha256은 64자리 소문자 hex여야 합니다.");
const hexSchema = z.string().regex(HEX_COLOR_PATTERN, "색은 소문자 #rrggbb 형식이어야 합니다.");

export const kitFileSchema = z
  .object({
    path: z.string().refine(isSafeRelativePath, { message: "파일 경로는 키트 루트 기준 상대 경로여야 합니다(절대·`..`·역슬래시 금지)." }),
    bytes: z.number().int().positive(),
    sha256: sha256Schema,
  })
  .strict();

const morphNameSchema = z
  .string()
  .refine((name) => isMorphTargetName(name), { message: "morph 이름이 계약 어휘(param:<키>:±, facs:<유닛>)에 없습니다(`ext:*`는 v1 금지)." });

const materialNameSchema = z.string().regex(MATERIAL_NAME_PATTERN, "재질 이름은 ts_ 로 시작하는 소문자 식별자여야 합니다.");
const partRoleSchema = z.enum(PART_ROLES);

export const kitMeshSchema = z
  .object({
    node: z.string().regex(NODE_NAME_PATTERN, "메시 노드 이름에 허용되지 않는 문자가 있습니다."),
    role: partRoleSchema.optional(),
    material: materialNameSchema.optional(),
    /** 다중 프리미티브 메시(`TS_Mouth`)의 프리미티브 번호별 역할·재질 */
    primitiveRoles: z.array(partRoleSchema).min(2).optional(),
    primitiveMaterials: z.array(materialNameSchema).min(2).optional(),
    lod: z.number().int().nonnegative().optional(),
    triangles: z.number().int().positive(),
    vertices: z.number().int().positive(),
    /** 모든 키트 메시는 스키닝이다. 선언하면 true여야 한다. */
    skinned: z.literal(true).optional(),
    morphs: z.array(morphNameSchema).max(KIT_BUDGET.maxMorphTargetsPerMesh),
  })
  .strict();

export type KitMesh = z.infer<typeof kitMeshSchema>;

const kitTintSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("recolor"), colorKey: z.enum(RECIPE_COLOR_KEYS) }).strict(),
  z.object({ mode: z.literal("fixed"), hex: hexSchema }).strict(),
]);

export const kitMaterialSchema = z
  .object({
    role: partRoleSchema,
    tint: kitTintSchema,
    doubleSided: z.boolean(),
  })
  .strict();
export type KitMaterial = z.infer<typeof kitMaterialSchema>;

const hideableRegionSchema = z.enum(KIT_HIDEABLE_REGION_IDS);

export const kitRegionRangeSchema = z
  .object({
    id: hideableRegionSchema,
    mesh: z.string(),
    indexStart: z.number().int().nonnegative(),
    indexCount: z.number().int().positive(),
  })
  .strict();
export type KitRegionRange = z.infer<typeof kitRegionRangeSchema>;

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const kitBaseSchema = z
  .object({
    file: kitFileSchema,
    heightM: z.number().min(0.5).max(3),
    boundsM: z.object({ min: vec3Schema, max: vec3Schema }).strict(),
    meshes: z.array(kitMeshSchema).min(1),
    bodyRegions: z.array(kitRegionRangeSchema),
  })
  .strict();
export type KitBase = z.infer<typeof kitBaseSchema>;

export const kitPartVariantSchema = z
  .object({
    file: kitFileSchema,
    meshes: z.array(kitMeshSchema).min(1),
    /** 몸에서 숨길 영역(그 영역을 전부 덮을 때만 선언) */
    hides: z.array(hideableRegionSchema),
  })
  .strict();
export type KitPartVariant = z.infer<typeof kitPartVariantSchema>;

const kitBaseKeyedSchema = <T extends z.ZodType>(schema: T) => z.object({ female: schema.optional(), male: schema.optional() }).strict();

export const kitPartSchema = z
  .object({
    id: z.string().refine((id) => isPresetId(id), { message: "파츠 id는 <슬롯>/<이름> 프리셋 id여야 합니다." }),
    slot: z.enum(KIT_PART_SLOTS),
    variants: kitBaseKeyedSchema(kitPartVariantSchema),
    /** 베이스별 미제공 사유(비어 있지 않은 한글) */
    unavailable: kitBaseKeyedSchema(z.string()),
  })
  .strict();
export type KitPart = z.infer<typeof kitPartSchema>;



const budgetsSchema = z.custom<typeof KIT_BUDGET>((value) => stableStringify(value) === stableStringify(KIT_BUDGET), {
  message: "budgets는 계약 상수 KIT_BUDGET의 사본과 같아야 합니다.",
});

const kitCapabilityDeclarationSchema = z.object({ female: slotCapabilityMapSchema.optional(), male: slotCapabilityMapSchema.optional() }).strict();

export const kitManifestObjectSchema = z
  .object({
    schema: z.literal(KIT_SCHEMA_ID),
    kitId: z.string().regex(KIT_ID_PATTERN, "kitId 형식이 올바르지 않습니다."),
    kitVersion: z.number().int().positive(),
    displayName: z.string().min(1),
    generatedAt: z.string().regex(DATE_PATTERN, "generatedAt은 YYYY-MM-DD여야 합니다."),
    generator: z
      .object({ tool: z.string().min(1), blender: z.string().min(1), command: z.array(z.string()), commit: z.string().optional() })
      .strict(),
    coordinateSystem: z
      .object({
        up: z.literal("+Y"),
        forward: z.literal("+Z"),
        unit: z.literal("m"),
        handedness: z.literal("right"),
        rest: z.literal("T-pose"),
        rootScale: z.literal(1),
      })
      .strict(),
    provenance: z
      .object({
        sources: z.array(kitSourceSchema).min(1),
        noticeFile: z.string().refine(isSafeRelativePath, { message: "noticeFile은 상대 경로여야 합니다." }),
        summaryKo: z.string(),
      })
      .strict(),
    skeleton: kitSkeletonSchema,
    materials: z.record(materialNameSchema, kitMaterialSchema),
    jointOffsets: kitJointOffsetsSchema,
    bases: z.object({ female: kitBaseSchema.optional(), male: kitBaseSchema.optional() }).strict(),
    parts: z.array(kitPartSchema),
    defaults: z
      .object({
        base: z.enum(KIT_BASE_IDS),
        slots: z.record(
          z.enum(CHARACTER_SLOT_KINDS),
          z.string().refine((id) => isPresetId(id), { message: "프리셋 id는 <슬롯>/<이름> 형식이어야 합니다." }).nullable(),
        ),
        colors: z.record(z.enum(RECIPE_COLOR_KEYS), hexSchema),
      })
      .strict(),
    slotCapabilities: kitCapabilityDeclarationSchema,
    physics: z.object({ mode: z.literal("static"), chains: z.tuple([]), colliders: z.tuple([]) }).strict(),
    budgets: budgetsSchema,
  })
  .strict();

// ---------------------------------------------------------------- 교차 검증


type ManifestShape = z.infer<typeof kitManifestObjectSchema>;

function meshRoles(mesh: KitMesh): readonly PartRole[] {
  if (mesh.role !== undefined) return [mesh.role];
  return mesh.primitiveRoles ?? [];
}

function meshMaterials(mesh: KitMesh): readonly string[] {
  if (mesh.material !== undefined) return [mesh.material];
  return mesh.primitiveMaterials ?? [];
}


/** 메시 하나의 단독 규칙: 역할/재질 선언 형태, 외곽선 셸 금지, morph 중복·필수 커버리지 */
function singleMeshIssues(mesh: KitMesh, path: ReadonlyArray<string | number>): KitIssue[] {
  const issues: KitIssue[] = [];
  const hasSingle = mesh.role !== undefined || mesh.material !== undefined;
  const hasPrimitive = mesh.primitiveRoles !== undefined || mesh.primitiveMaterials !== undefined;
  if (hasSingle === hasPrimitive) {
    issues.push({ path, message: `${mesh.node}: role+material 또는 primitiveRoles+primitiveMaterials 중 정확히 하나를 선언해야 합니다.` });
    return issues;
  }
  if (hasSingle && (mesh.role === undefined || mesh.material === undefined)) {
    issues.push({ path, message: `${mesh.node}: role과 material은 함께 선언해야 합니다.` });
    return issues;
  }
  if (hasPrimitive && (mesh.primitiveRoles === undefined || mesh.primitiveMaterials === undefined || mesh.primitiveRoles.length !== mesh.primitiveMaterials.length)) {
    issues.push({ path, message: `${mesh.node}: primitiveRoles와 primitiveMaterials는 같은 길이로 함께 선언해야 합니다.` });
    return issues;
  }
  if (mesh.node.endsWith(OUTLINE_MESH_SUFFIX)) {
    issues.push({ path: [...path, "node"], message: `${mesh.node}: _Outline 셸 메시는 키트 v1에서 금지입니다(엔진 hull 외곽선과 이중 렌더, kit-outline-shell-forbidden).` });
  }
  if (new Set(mesh.morphs).size !== mesh.morphs.length) {
    issues.push({ path: [...path, "morphs"], message: `${mesh.node}: morph 이름이 중복되었습니다.` });
  }
  const have = new Set(mesh.morphs);
  const missing = new Set<string>();
  for (const role of meshRoles(mesh)) {
    for (const name of KIT_MORPH_COVERAGE[role]) if (!have.has(name)) missing.add(name);
  }
  if (missing.size > 0) {
    issues.push({
      path: [...path, "morphs"],
      message: `${mesh.node}: 필수 morph ${missing.size}개가 없습니다(역할 ${meshRoles(mesh).join("/")}): ${listFew([...missing])}`,
    });
  }
  return issues;
}

/** 한 GLB 안의 메시들: 노드 이름 유일, 재질 선언 존재·역할 일치, 한 역할에 재질 하나 */
function fileMeshIssues(
  meshes: readonly KitMesh[],
  materials: ManifestShape["materials"],
  path: ReadonlyArray<string | number>,
): KitIssue[] {
  const issues: KitIssue[] = [];
  const nodes = new Set<string>();
  const materialOfRole = new Map<PartRole, string>();
  meshes.forEach((mesh, index) => {
    const meshPath = [...path, index];
    issues.push(...singleMeshIssues(mesh, meshPath));
    if (nodes.has(mesh.node)) issues.push({ path: meshPath, message: `${mesh.node}: 메시 노드 이름이 중복되었습니다.` });
    nodes.add(mesh.node);
    const roles = meshRoles(mesh);
    const mats = meshMaterials(mesh);
    roles.forEach((role, i) => {
      const material = mats[i];
      if (material === undefined) return;
      const declared = materials[material];
      if (declared === undefined) {
        issues.push({ path: meshPath, message: `${mesh.node}: 재질 '${material}'이 materials에 선언되지 않았습니다.` });
      } else if (declared.role !== role) {
        issues.push({ path: meshPath, message: `${mesh.node}: 재질 '${material}'의 역할(${declared.role})이 메시 역할(${role})과 다릅니다.` });
      }
      const previous = materialOfRole.get(role);
      if (previous !== undefined && previous !== material) {
        issues.push({ path: meshPath, message: `${mesh.node}: 역할 ${role}에 재질이 둘 이상입니다('${previous}', '${material}', kit-material-multiple).` });
      }
      materialOfRole.set(role, material);
    });
  });
  return issues;
}

function baseIssues(baseId: KitBaseId, base: KitBase, materials: ManifestShape["materials"]): KitIssue[] {
  const path: Array<string | number> = ["bases", baseId];
  const issues = fileMeshIssues(base.meshes, materials, [...path, "meshes"]);
  if (base.file.bytes > KIT_BUDGET.baseGlbMaxBytes) {
    issues.push({ path: [...path, "file", "bytes"], message: `베이스 GLB(${base.file.bytes} B)가 한도 ${KIT_BUDGET.baseGlbMaxBytes} B를 넘습니다.` });
  }
  const byNode = new Map(base.meshes.map((mesh) => [mesh.node, mesh] as const));
  const specNodes = new Set(KIT_BASE_MESH_SPECS.map((spec) => spec.node));
  for (const spec of KIT_BASE_MESH_SPECS) {
    const mesh = byNode.get(spec.node);
    if (mesh === undefined) {
      issues.push({ path: [...path, "meshes"], message: `베이스 메시 ${spec.node}가 선언되지 않았습니다(kit-mesh-missing).` });
      continue;
    }
    if (stableStringify([mesh.role, mesh.material, mesh.primitiveRoles, mesh.primitiveMaterials]) !== stableStringify([spec.role, spec.material, spec.primitiveRoles, spec.primitiveMaterials])) {
      issues.push({ path: [...path, "meshes"], message: `${spec.node}: 역할·재질이 계약(${stableStringify([spec.role ?? spec.primitiveRoles, spec.material ?? spec.primitiveMaterials])})과 다릅니다.` });
    }
  }
  for (const mesh of base.meshes) {
    if (!specNodes.has(mesh.node)) issues.push({ path: [...path, "meshes"], message: `${mesh.node}: 계약에 없는 베이스 메시입니다(kit-mesh-undeclared).` });
  }

  // 영역 범위: TS_Body 인덱스 버퍼를 빈틈·겹침 없이 분할하는 15개
  const ranges = base.bodyRegions;
  const ids = ranges.map((range) => range.id);
  if (new Set(ids).size !== ids.length || ids.length !== KIT_HIDEABLE_REGION_IDS.length) {
    issues.push({ path: [...path, "bodyRegions"], message: `bodyRegions는 숨길 수 있는 영역 ${KIT_HIDEABLE_REGION_IDS.length}개를 정확히 한 번씩 담아야 합니다(현재 ${ids.length}개).` });
  }
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.mesh !== KIT_BODY_NODE) issues.push({ path: [...path, "bodyRegions", index, "mesh"], message: `영역 ${range.id}의 mesh는 ${KIT_BODY_NODE}여야 합니다.` });
    if (range.indexStart !== cursor || range.indexCount % 3 !== 0) {
      issues.push({
        path: [...path, "bodyRegions", index],
        message: `영역 ${range.id}의 인덱스 범위가 빈틈·겹침 없이 이어지는 3의 배수가 아닙니다(kit-region-range-invalid): 기대 시작 ${cursor}, 실제 ${range.indexStart}+${range.indexCount}.`,
      });
    }
    cursor = range.indexStart + range.indexCount;
  });
  const body = byNode.get(KIT_BODY_NODE);
  if (body !== undefined && ranges.length > 0 && cursor !== body.triangles * 3) {
    issues.push({ path: [...path, "bodyRegions"], message: `영역 범위의 합(${cursor})이 ${KIT_BODY_NODE} 인덱스 수(${body.triangles * 3})와 다릅니다(kit-region-range-invalid).` });
  }
  const [min, max] = [base.boundsM.min, base.boundsM.max];
  if (min.some((value, axis) => value > (max[axis] ?? Number.NEGATIVE_INFINITY))) {
    issues.push({ path: [...path, "boundsM"], message: "boundsM.min이 max보다 큽니다." });
  }
  return issues;
}

const GARMENT_NODE_PREFIX = { top: "TS_Top", bottom: "TS_Bottom", shoes: "TS_Shoes", accessory: "TS_Accessory" } as const;

/** 슬롯·이름에 따른 파츠 메시 노드 이름 규칙 */
function expectedNodeIssues(slot: KitPartSlot, name: string, meshes: readonly KitMesh[], path: ReadonlyArray<string | number>): KitIssue[] {
  const issues: KitIssue[] = [];
  const bad = (mesh: KitMesh, expected: string): void => {
    issues.push({ path, message: `${mesh.node}: 메시 이름은 ${expected} 형식이어야 합니다(슬롯 ${slot}, 프리셋 ${name}).` });
  };
  switch (slot) {
    case "hair": {
      for (const mesh of meshes) {
        const match = AUTHORED_HAIR_MESH_PATTERN.exec(mesh.node);
        const style = match?.groups?.style;
        const lod = match?.groups?.lod;
        if (style !== name || lod === undefined) {
          bad(mesh, `TS_AuthoredHair_${name}_LOD<n>`);
        } else if (mesh.lod !== Number.parseInt(lod, 10)) {
          issues.push({ path, message: `${mesh.node}: lod 필드(${String(mesh.lod)})가 이름의 LOD(${lod})와 다릅니다.` });
        }
      }
      const lods = new Set(meshes.map((mesh) => mesh.lod));
      if (!lods.has(0)) issues.push({ path, message: `헤어 ${name}: LOD0 메시가 없습니다.` });
      break;
    }
    case "top":
    case "bottom":
    case "shoes":
    case "accessory": {
      const expected = `${GARMENT_NODE_PREFIX[slot]}_${name}`;
      for (const mesh of meshes) if (mesh.node !== expected) bad(mesh, expected);
      break;
    }
    case "irises": {
      const pattern: Readonly<Record<string, string>> = { iris: "TS_Iris", "eye-highlight": "TS_Highlight", pupil: "TS_Pupil" };
      for (const mesh of meshes) {
        const prefix = mesh.role === undefined ? undefined : pattern[mesh.role];
        if (prefix === undefined || (mesh.node !== `${prefix}_L` && mesh.node !== `${prefix}_R`)) bad(mesh, "TS_Iris_L/R(iris), TS_Highlight_L/R(eye-highlight), TS_Pupil_L/R(pupil)");
      }
      for (const role of KIT_PART_SLOT_ROLES.irises) {
        const nodes = meshes.filter((mesh) => mesh.role === role).map((mesh) => mesh.node);
        if (nodes.length !== 0 && nodes.length !== 2) issues.push({ path, message: `홍채 파츠 ${name}: 역할 ${role}는 좌/우 메시 2개여야 합니다(현재 ${nodes.length}개).` });
      }
      break;
    }
  }
  return issues;
}

function partIssues(part: KitPart, index: number, baseIds: readonly KitBaseId[], materials: ManifestShape["materials"]): KitIssue[] {
  const path: Array<string | number> = ["parts", index];
  const issues: KitIssue[] = [];
  const slash = part.id.indexOf("/");
  const idSlot = part.id.slice(0, slash);
  const name = part.id.slice(slash + 1);
  if (idSlot !== part.slot) issues.push({ path: [...path, "id"], message: `파츠 id(${part.id})의 슬롯이 slot(${part.slot})과 다릅니다.` });
  const vocabulary: readonly string[] = SLOT_PRESET_IDS[part.slot];
  if (!vocabulary.includes(name)) {
    issues.push({ path: [...path, "id"], message: `파츠 id(${part.id})가 프리셋 어휘 SLOT_PRESET_IDS.${part.slot} 안에 없습니다(어휘를 늘리지 않는다).` });
  }
  for (const baseId of KIT_BASE_IDS) {
    const variant = part.variants[baseId];
    const reason = part.unavailable[baseId];
    if (!baseIds.includes(baseId)) {
      if (variant !== undefined) issues.push({ path: [...path, "variants", baseId], message: `${part.id}: bases에 없는 베이스(${baseId})의 변형입니다.` });
      continue;
    }
    if (variant !== undefined && reason !== undefined) {
      issues.push({ path: [...path, "unavailable", baseId], message: `${part.id}: ${baseId} 변형이 있으면서 미제공 사유도 선언되었습니다.` });
    }
    if (variant === undefined && (reason === undefined || reason.trim().length === 0 || !HANGUL.test(reason))) {
      issues.push({ path: [...path, "variants", baseId], message: `${part.id}: ${baseId} 변형이 없으면 unavailable.${baseId}에 한글 사유가 필요합니다.` });
    }
    if (variant === undefined) continue;
    const variantPath = [...path, "variants", baseId];
    issues.push(...fileMeshIssues(variant.meshes, materials, [...variantPath, "meshes"]));
    issues.push(...expectedNodeIssues(part.slot, name, variant.meshes, [...variantPath, "meshes"]));
    if (variant.file.bytes > KIT_BUDGET.partGlbMaxBytes) {
      issues.push({ path: [...variantPath, "file", "bytes"], message: `${part.id}: 파츠 GLB(${variant.file.bytes} B)가 한도 ${KIT_BUDGET.partGlbMaxBytes} B를 넘습니다.` });
    }
    const allowed: readonly PartRole[] = KIT_PART_SLOT_ROLES[part.slot];
    const present = new Set(variant.meshes.flatMap((mesh) => meshRoles(mesh)));
    for (const role of present) {
      if (!allowed.includes(role)) issues.push({ path: [...variantPath, "meshes"], message: `${part.id}: 슬롯 ${part.slot}에 허용되지 않는 역할 ${role}입니다(허용: ${allowed.join(", ")}).` });
    }
    for (const role of KIT_PART_SLOT_REQUIRED_ROLES[part.slot]) {
      if (!present.has(role)) issues.push({ path: [...variantPath, "meshes"], message: `${part.id}: 필수 역할 ${role} 메시가 없습니다.` });
    }
    if ((part.slot === "hair" || part.slot === "irises") && variant.hides.length > 0) {
      issues.push({ path: [...variantPath, "hides"], message: `${part.id}: 슬롯 ${part.slot}은 몸 영역을 숨길 수 없습니다.` });
    }
    if (new Set(variant.hides).size !== variant.hides.length) issues.push({ path: [...variantPath, "hides"], message: `${part.id}: hides가 중복되었습니다.` });
  }
  return issues;
}


function manifestIssues(manifest: ManifestShape): KitIssue[] {
  const issues: KitIssue[] = [...kitSkeletonIssues(manifest.skeleton)];

  // 재질 틴트 규칙
  for (const [name, material] of Object.entries(manifest.materials)) {
    const rule = KIT_ROLE_TINT_RULES[material.role];
    if (rule === undefined) continue;
    if (rule.mode !== material.tint.mode || (rule.mode === "recolor" && material.tint.mode === "recolor" && rule.colorKey !== material.tint.colorKey)) {
      issues.push({
        path: ["materials", name, "tint"],
        message: `재질 ${name}(역할 ${material.role})의 틴트는 ${rule.mode === "recolor" ? `recolor/${rule.colorKey}` : "fixed"}여야 합니다.`,
      });
    }
  }

  issues.push(...kitProvenanceIssues(manifest.provenance.sources));
  issues.push(...kitJointOffsetIssues(manifest.jointOffsets, KIT_BUDGET.maxJointOffsetM));

  const baseIds = KIT_BASE_IDS.filter((id) => manifest.bases[id] !== undefined);
  if (manifest.bases.female === undefined) issues.push({ path: ["bases", "female"], message: "여성 베이스(female)는 필수입니다(기본 베이스)." });
  if (manifest.defaults.base !== KIT_DEFAULT_BASE_ID || !baseIds.includes(manifest.defaults.base)) {
    issues.push({ path: ["defaults", "base"], message: `defaults.base는 ${KIT_DEFAULT_BASE_ID}이고 bases에 있어야 합니다.` });
  }
  for (const baseId of baseIds) {
    const base = manifest.bases[baseId];
    if (base !== undefined) issues.push(...baseIssues(baseId, base, manifest.materials));
    if (manifest.slotCapabilities[baseId] === undefined) issues.push({ path: ["slotCapabilities", baseId], message: `slotCapabilities.${baseId} 선언이 없습니다.` });
  }
  for (const baseId of KIT_BASE_IDS) {
    if (!baseIds.includes(baseId) && manifest.slotCapabilities[baseId] !== undefined) {
      issues.push({ path: ["slotCapabilities", baseId], message: `bases에 없는 베이스(${baseId})의 slotCapabilities입니다.` });
    }
  }

  // 파츠: 개별 규칙, id 유일, 어휘 전체 커버리지, 필수 파츠
  const seen = new Set<string>();
  manifest.parts.forEach((part, index) => {
    if (seen.has(part.id)) issues.push({ path: ["parts", index, "id"], message: `파츠 id가 중복되었습니다: ${part.id}` });
    seen.add(part.id);
    issues.push(...partIssues(part, index, baseIds, manifest.materials));
  });
  for (const slot of KIT_PART_SLOTS) {
    for (const name of SLOT_PRESET_IDS[slot]) {
      if (!seen.has(`${slot}/${name}`)) issues.push({ path: ["parts"], message: `어휘의 프리셋 ${slot}/${name}가 parts에 없습니다(변형이 없으면 unavailable 사유로 선언).` });
    }
  }
  for (const baseId of baseIds) {
    for (const id of KIT_REQUIRED_PRESETS) {
      const part = manifest.parts.find((candidate) => candidate.id === id);
      if (part?.variants[baseId] === undefined) issues.push({ path: ["parts"], message: `필수 파츠 ${id}의 ${baseId} 변형이 없습니다(kit-part-missing).` });
    }
  }

  // 파일 용량 합계(고유 파일)
  const uniqueFiles = new Map<string, number>();
  for (const baseId of baseIds) {
    const base = manifest.bases[baseId];
    if (base !== undefined) uniqueFiles.set(base.file.path, base.file.bytes);
  }
  for (const part of manifest.parts) {
    for (const baseId of baseIds) {
      const variant = part.variants[baseId];
      if (variant !== undefined) uniqueFiles.set(variant.file.path, variant.file.bytes);
    }
  }
  let total = 0;
  for (const bytes of uniqueFiles.values()) total += bytes;
  if (total > KIT_BUDGET.totalMaxBytes) issues.push({ path: ["bases"], message: `키트 고유 파일 합계(${total} B)가 한도 ${KIT_BUDGET.totalMaxBytes} B를 넘습니다.` });
  const lowerPaths = new Map<string, string>();
  for (const filePath of uniqueFiles.keys()) {
    const key = filePath.toLowerCase();
    const previous = lowerPaths.get(key);
    if (previous !== undefined) issues.push({ path: ["parts"], message: `대소문자만 다른 중복 경로입니다: ${previous}, ${filePath}` });
    lowerPaths.set(key, filePath);
  }
  return issues;
}

export const kitManifestSchema = kitManifestObjectSchema.superRefine((manifest, ctx) => {
  for (const issue of manifestIssues(manifest)) ctx.addIssue({ code: "custom", message: issue.message, path: [...issue.path] });
});

export type KitManifest = z.infer<typeof kitManifestSchema>;

export type ParseKitManifestResult = { readonly ok: true; readonly manifest: KitManifest } | { readonly ok: false; readonly failure: LabFailure };

/** `kit.json`을 파싱한다. 실패는 `kit-manifest-invalid`(첫 5개 이슈를 한글 사유에 포함). */
export function parseKitManifest(json: unknown, now?: number): ParseKitManifestResult {
  const result = kitManifestSchema.safeParse(json);
  if (!result.success) {
    const summary = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, failure: failVisible("kit-manifest-invalid", `키트 manifest 형식이 올바르지 않습니다: ${summary}`, undefined, now) };
  }
  return { ok: true, manifest: result.data };
}

// ---------------------------------------------------------------- 런타임 계획

/** 한 GLB(베이스 또는 파츠)의 로드 계획. `plan.parts[0]`은 항상 베이스다. */
export interface KitPartPlan {
  /** 베이스는 `base/<baseId>`, 파츠는 프리셋 id */
  readonly id: string;
  readonly kind: "base" | "part";
  /** 파츠 슬롯(베이스는 null) */
  readonly slot: KitPartSlot | null;
  readonly url: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly meshes: readonly KitMesh[];
  /** 몸에서 숨길 영역(베이스는 빈 배열) */
  readonly hides: readonly KitHideableRegionId[];
}

export interface KitPlan {
  readonly kitId: string;
  readonly kitVersion: number;
  readonly baseId: KitBaseId;
  readonly skeleton: KitSkeleton;
  /** [0] = 베이스, 이후 선택된 파츠(슬롯 순서) */
  readonly parts: readonly KitPartPlan[];
  /** 엔진에 등록될 morph 이름 합집합(결정적 순서) */
  readonly morphNames: readonly string[];
  readonly jointOffsets: KitJointOffsets;
  readonly bodyRegions: readonly KitRegionRange[];
  readonly capabilities: SlotCapabilityMap;
  /** 헤어 LOD 선택 정책(썸네일 임시 리그는 1) */
  readonly hairLodPolicy: { readonly preferredLod: number };
  readonly licenseNote: string;
  readonly materials: Readonly<Record<string, KitMaterial>>;
}

/**
 * 키트 지오메트리 재생성 키. 같은 키면 같은 파츠 집합이다(색·morph·포즈는 포함하지 않는다 → 플랜 재적용만).
 * 소스가 키트가 아니면 베이스 자리는 `-`다(호출자는 키트 소스일 때만 쓴다).
 */
export function kitGeometryKey(recipe: Pick<CharacterRecipe, "source" | "slots">): string {
  const base = recipe.source.kind === "kit" ? recipe.source.baseId : "-";
  const slots = KIT_PART_SLOTS.map((slot) => `${slot}=${recipe.slots[slot] ?? "-"}`).join(";");
  return `base=${base};${slots}`;
}
