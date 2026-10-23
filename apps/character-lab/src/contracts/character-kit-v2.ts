/**
 * 모듈식 키트 매니페스트 v2(`toonstudio.character-kit/2`) 스키마·타입(레시피 v3, 2026-10-23 CORE-1).
 * **스키마·타입·정합성 규칙만** 둔다 — 로더(`render/babylon/kit-loader-v2`)·계획기(`domains/authored/kit-plan`)·엔진 반영은 후속 WP(A-1·R-3b)다.
 * v1 매니페스트(`toonstudio.character-kit/1`)는 `character-kit.ts`의 파서가 그대로 읽고, `parseAnyKitManifest`가 `schema` 문자열로 고른다.
 *
 * v2에서 바뀌는 것(설계 §2.3·§2.4·§3.3):
 * 1. 재질 = { role, channel?, tint: recolor | fixed(hex), doubleSided }. 칠할 채널이 있는 역할(`PART_ROLE_CHANNELS`)은 recolor + channel,
 *    없는 역할(눈 하이라이트·치아·혀·속옷)은 fixed + channel 없음. 규칙 "(파츠, 역할)당 재질 1"(v1)을 **"(파일, 역할, 채널)당 재질 1"**로 바꾼다.
 *    채널 경계는 프리미티브(면) 경계라 마스크 텍스처가 필요 없다. 안구(eyeball)는 고정색이 아니라 `sclera` 채널 recolor다.
 * 2. 파츠 변형 `shapes`(이름 ≤ 8): 메시 morph에 선언한 이름의 `shape:<이름>:±`를 둘 수 있다(체형 18 + 형태 16 ≤ 96).
 * 3. 층 변형 `layerVariants`: top/* → inner·outer, bottom/* → legwear. 층 변형 메시의 역할은 층 이름이고 채널도 층 채널이다(`LAYER_CHANNEL_MAP`).
 * 4. 강체 소품: 액세서리 변형 메시가 `skinned: false`면 변형 `anchor`(기본 앵커)가 필요하다. 헤어 부속은 역할 `hair-accessory`(액세서리 슬롯).
 * 5. 메시 `uv1`: 패턴용 월드 밀도(`pattern`, UV 1단위 = `cmPerUnit` cm) 또는 헤어 흐름(`hair-flow`, V = 뿌리 0 → 끝 1).
 * 6. 베이스 `headHeightM`(두신 계산)·`anchors`(앵커 14 → joint + 오프셋)·`headRegionMask`(입술·볼 홍조 영역 PNG와 채널 대응).
 * 예산은 v1과 같다(O3: 층·소품·화풍 베이스로 activeWorst·총량 초과 위험 — 상향은 소유자 결정).
 */
import { z } from "zod";

import { stableStringify } from "../shared/stable-json";

import {
  KIT_BASE_IDS,
  KIT_BASE_MESH_SPECS,
  KIT_BODY_NODE,
  KIT_BUDGET,
  KIT_DEFAULT_BASE_ID,
  KIT_HIDEABLE_REGION_IDS,
  KIT_MORPH_COVERAGE,
  KIT_PART_SLOTS,
  KIT_REQUIRED_PRESETS,
  KIT_SCHEMA_ID,
  kitBaseSchema,
  kitFileSchema,
  kitManifestObjectSchema,
  kitMeshSchema,
  parseKitManifest,
} from "./character-kit";
import { CHANNEL_KEYS, REGION_CHANNEL_KEYS } from "./color-channels";
import { ACCESSORY_ANCHORS, WARDROBE_LAYERS, WARDROBE_LAYER_ROLE, WARDROBE_LAYER_SLOT, shapeNameSchema } from "./customization";
import { failVisible } from "./errors";
import { kitProvenanceIssues } from "./kit-provenance";
import { kitJointOffsetIssues, kitSkeletonIssues, listFew } from "./kit-skeleton";
import { PART_ROLES, PART_ROLE_CHANNELS } from "./mesh-data";
import { parseExtendedMorphName } from "./morph-names";
import { AUTHORED_HAIR_MESH_PATTERN, OUTLINE_MESH_SUFFIX } from "./package-manifest";
import { SLOT_PRESET_IDS } from "./preset-vocabulary";

import type { KitBaseId, KitManifest, KitPartSlot } from "./character-kit";
import type { WardrobeLayer } from "./customization";
import type { LabFailure } from "./errors";
import type { KitIssue } from "./kit-skeleton";
import type { PartRole } from "./mesh-data";

export const KIT_V2_SCHEMA_ID = "toonstudio.character-kit/2" as const;

/** v2 예산 = v1 예산 + 형태 이름 상한(파츠 변형당 8). 매니페스트 `budgets`는 이 상수의 사본이어야 한다. */
export const KIT_V2_BUDGET = Object.freeze({ ...KIT_BUDGET, maxShapesPerVariant: 8 });

/** 슬롯별 허용 역할(v2): 액세서리 슬롯이 헤어 부속(`hair-accessory`)을 더 받는다. */
export const KIT_V2_PART_SLOT_ROLES: Readonly<Record<KitPartSlot, readonly PartRole[]>> = {
  hair: ["hair"],
  top: ["top"],
  bottom: ["bottom"],
  shoes: ["shoes"],
  accessory: ["accessory", "hair-accessory"],
  irises: ["iris", "eye-highlight", "pupil"],
};

/** 슬롯별 층(top → inner·outer, bottom → legwear) */
export const KIT_V2_SLOT_LAYERS: Readonly<Partial<Record<KitPartSlot, readonly WardrobeLayer[]>>> = {
  top: WARDROBE_LAYERS.filter((layer) => WARDROBE_LAYER_SLOT[layer] === "top"),
  bottom: WARDROBE_LAYERS.filter((layer) => WARDROBE_LAYER_SLOT[layer] === "bottom"),
};

/** 메시 노드 접두(슬롯·층·헤어 부속). 접두 뒤는 `_<프리셋 이름>`, 그 뒤에 채널 메시 접미(`_Trim`·`_Accent` 등)를 붙일 수 있다. */
const NODE_PREFIX = {
  top: "TS_Top",
  bottom: "TS_Bottom",
  shoes: "TS_Shoes",
  accessory: "TS_Accessory",
  "hair-accessory": "TS_HairAccessory",
  inner: "TS_Inner",
  outer: "TS_Outer",
  legwear: "TS_Legwear",
} as const;
const NODE_SUFFIX = /^(?:_[A-Z][A-Za-z0-9]*)?$/u;
const HEX = /^#[0-9a-f]{6}$/u;
const HANGUL = /[가-힣]/u;

// ---------------------------------------------------------------- 스키마

const morphNameV2Schema = z.string().refine((name) => parseExtendedMorphName(name) !== null, {
  message: "morph 이름이 계약 어휘(param:<키>:±, facs:<유닛>, shape:<이름>:±)에 없습니다.",
});

export const kitV2Uv1Schema = z.discriminatedUnion("purpose", [
  z.object({ purpose: z.literal("pattern"), cmPerUnit: z.number().positive().max(1000) }).strict(),
  z.object({ purpose: z.literal("hair-flow") }).strict(),
]);
export type KitV2Uv1 = z.infer<typeof kitV2Uv1Schema>;

/** v2 메시: v1 메시 + 강체 허용(`skinned: false`) + 형태 morph + UV1 메타 */
export const kitV2MeshSchema = kitMeshSchema.extend({
  skinned: z.boolean().optional(),
  morphs: z.array(morphNameV2Schema).max(KIT_BUDGET.maxMorphTargetsPerMesh),
  uv1: kitV2Uv1Schema.optional(),
});
export type KitV2Mesh = z.infer<typeof kitV2MeshSchema>;

export const kitV2TintSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("recolor") }).strict(),
  z.object({ mode: z.literal("fixed"), hex: z.string().regex(HEX, "색은 소문자 #rrggbb 형식이어야 합니다.") }).strict(),
]);

export const kitV2MaterialSchema = z
  .object({
    role: z.enum(PART_ROLES),
    channel: z.enum(CHANNEL_KEYS).optional(),
    tint: kitV2TintSchema,
    doubleSided: z.boolean(),
  })
  .strict();
export type KitV2Material = z.infer<typeof kitV2MaterialSchema>;

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const kitV2AnchorSchema = z
  .object({
    /** 앵커가 붙는 키트 joint(스켈레톤 joint 이름) */
    joint: z.string().min(1),
    /** joint 로컬 오프셋(m) */
    offsetM: vec3Schema,
  })
  .strict();

export const kitV2HeadRegionMaskSchema = z
  .object({
    file: kitFileSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** 영역 채널 → 마스크 PNG 색 성분 */
    channels: z.partialRecord(z.enum(REGION_CHANNEL_KEYS), z.enum(["r", "g", "b", "a"])),
  })
  .strict();

export const kitV2BaseSchema = kitBaseSchema.extend({
  meshes: z.array(kitV2MeshSchema).min(1),
  /** 머리 높이(m, 정수리~턱). 두신 = heightM / headHeightM */
  headHeightM: z.number().min(0.1).max(0.5),
  anchors: z.partialRecord(z.enum(ACCESSORY_ANCHORS), kitV2AnchorSchema),
  headRegionMask: kitV2HeadRegionMaskSchema.optional(),
});
export type KitV2Base = z.infer<typeof kitV2BaseSchema>;

export const kitV2PartVariantSchema = z
  .object({
    file: kitFileSchema,
    meshes: z.array(kitV2MeshSchema).min(1),
    hides: z.array(z.enum(KIT_HIDEABLE_REGION_IDS)),
    /** 형태 키 이름(각 이름은 `shape:<이름>:+`/`-` morph, 최대 8개) */
    shapes: z.array(shapeNameSchema).max(KIT_V2_BUDGET.maxShapesPerVariant),
    /** 강체 소품의 기본 앵커(액세서리 슬롯 전용) */
    anchor: z.enum(ACCESSORY_ANCHORS).optional(),
  })
  .strict();
export type KitV2PartVariant = z.infer<typeof kitV2PartVariantSchema>;

const baseKeyed = <T extends z.ZodType>(schema: T) => z.object({ female: schema.optional(), male: schema.optional() }).strict();

export const kitV2PartSchema = z
  .object({
    id: z.string(),
    slot: z.enum(KIT_PART_SLOTS),
    variants: baseKeyed(kitV2PartVariantSchema),
    /** 층에 입힐 때의 변형(없으면 그 층에 입을 수 없다 — 소스 능력 사유) */
    layerVariants: baseKeyed(z.partialRecord(z.enum(WARDROBE_LAYERS), kitV2PartVariantSchema)).optional(),
    unavailable: baseKeyed(z.string()),
  })
  .strict();
export type KitV2Part = z.infer<typeof kitV2PartSchema>;

const budgetsV2Schema = z.custom<typeof KIT_V2_BUDGET>((value) => stableStringify(value) === stableStringify(KIT_V2_BUDGET), {
  message: "budgets는 계약 상수 KIT_V2_BUDGET의 사본과 같아야 합니다.",
});

export const kitManifestV2ObjectSchema = z
  .object({
    ...kitManifestObjectSchema.shape,
    schema: z.literal(KIT_V2_SCHEMA_ID),
    materials: z.record(z.string().regex(/^ts_[a-z0-9_-]+$/u, "재질 이름은 ts_ 로 시작하는 소문자 식별자여야 합니다."), kitV2MaterialSchema),
    bases: z.object({ female: kitV2BaseSchema.optional(), male: kitV2BaseSchema.optional() }).strict(),
    parts: z.array(kitV2PartSchema),
    budgets: budgetsV2Schema,
  })
  .strict();
type ManifestV2Shape = z.infer<typeof kitManifestV2ObjectSchema>;

// ---------------------------------------------------------------- 정합성 규칙

function meshRoles(mesh: KitV2Mesh): readonly PartRole[] {
  return mesh.role !== undefined ? [mesh.role] : (mesh.primitiveRoles ?? []);
}

function meshMaterials(mesh: KitV2Mesh): readonly string[] {
  return mesh.material !== undefined ? [mesh.material] : (mesh.primitiveMaterials ?? []);
}

/** 재질 틴트·채널: 채널이 있는 역할은 recolor + 허용 채널, 없는 역할은 fixed + 채널 없음 */
function materialIssues(materials: ManifestV2Shape["materials"]): KitIssue[] {
  const issues: KitIssue[] = [];
  for (const [name, material] of Object.entries(materials)) {
    const allowed = PART_ROLE_CHANNELS[material.role];
    const path = ["materials", name];
    if (allowed.length === 0) {
      if (material.tint.mode !== "fixed" || material.channel !== undefined) issues.push({ path, message: `재질 ${name}(역할 ${material.role})은 고정색(fixed)이고 채널이 없어야 합니다.` });
    } else if (material.tint.mode !== "recolor" || material.channel === undefined || !allowed.includes(material.channel)) {
      issues.push({ path, message: `재질 ${name}(역할 ${material.role})은 recolor이고 채널이 ${allowed.join("·")} 중 하나여야 합니다.` });
    }
  }
  return issues;
}

interface FileContext {
  readonly path: ReadonlyArray<string | number>;
  readonly materials: ManifestV2Shape["materials"];
  /** 선언한 형태 이름(베이스는 빈 배열) */
  readonly shapes: readonly string[];
  /** 강체 메시 허용(액세서리 슬롯) */
  readonly rigidAllowed: boolean;
}

/** 한 GLB의 메시들: 선언 형태·외곽선 셸·morph 어휘·필수 커버리지·형태 선언·재질 존재·(역할, 채널)당 재질 1·강체 규칙 */
function fileIssues(meshes: readonly KitV2Mesh[], context: FileContext): KitIssue[] {
  const issues: KitIssue[] = [];
  const nodes = new Set<string>();
  const materialOfSlot = new Map<string, string>();
  const shapesSeen = new Set<string>();
  meshes.forEach((mesh, index) => {
    const path = [...context.path, index];
    const single = mesh.role !== undefined || mesh.material !== undefined;
    const primitive = mesh.primitiveRoles !== undefined || mesh.primitiveMaterials !== undefined;
    const roles = meshRoles(mesh);
    const mats = meshMaterials(mesh);
    if (single === primitive || roles.length === 0 || roles.length !== mats.length) {
      issues.push({ path, message: `${mesh.node}: role+material 또는 같은 길이의 primitiveRoles+primitiveMaterials 중 정확히 하나를 선언해야 합니다.` });
      return;
    }
    if (nodes.has(mesh.node)) issues.push({ path, message: `${mesh.node}: 메시 노드 이름이 중복되었습니다.` });
    nodes.add(mesh.node);
    if (mesh.node.endsWith(OUTLINE_MESH_SUFFIX)) issues.push({ path, message: `${mesh.node}: _Outline 셸 메시는 키트에서 금지입니다(kit-outline-shell-forbidden).` });
    if (mesh.skinned === false && !context.rigidAllowed) issues.push({ path, message: `${mesh.node}: 강체(skinned: false) 메시는 액세서리 슬롯 변형에만 둘 수 있습니다.` });
    if (new Set(mesh.morphs).size !== mesh.morphs.length) issues.push({ path: [...path, "morphs"], message: `${mesh.node}: morph 이름이 중복되었습니다.` });
    const have = new Set(mesh.morphs);
    if (mesh.skinned !== false) {
      const missing = new Set<string>();
      for (const role of roles) for (const name of KIT_MORPH_COVERAGE[role]) if (!have.has(name)) missing.add(name);
      if (missing.size > 0) issues.push({ path: [...path, "morphs"], message: `${mesh.node}: 필수 morph ${missing.size}개가 없습니다(역할 ${roles.join("/")}): ${listFew([...missing])}` });
    }
    for (const name of mesh.morphs) {
      const parsed = parseExtendedMorphName(name);
      if (parsed?.kind !== "shape") continue;
      if (!context.shapes.includes(parsed.name)) issues.push({ path: [...path, "morphs"], message: `${mesh.node}: 형태 morph ${name}의 이름이 변형 shapes에 선언되지 않았습니다.` });
      shapesSeen.add(parsed.name);
    }
    roles.forEach((role, i) => {
      const materialName = mats[i] ?? "";
      const declared = context.materials[materialName];
      if (declared === undefined) {
        issues.push({ path, message: `${mesh.node}: 재질 '${materialName}'이 materials에 선언되지 않았습니다.` });
        return;
      }
      if (declared.role !== role) issues.push({ path, message: `${mesh.node}: 재질 '${materialName}'의 역할(${declared.role})이 메시 역할(${role})과 다릅니다.` });
      const slotKey = `${role}|${declared.channel ?? "-"}`;
      const previous = materialOfSlot.get(slotKey);
      if (previous !== undefined && previous !== materialName) {
        issues.push({ path, message: `${mesh.node}: 역할 ${role}·채널 ${declared.channel ?? "없음"}에 재질이 둘 이상입니다('${previous}', '${materialName}', kit-material-multiple).` });
      }
      materialOfSlot.set(slotKey, materialName);
    });
  });
  for (const name of context.shapes) {
    if (!shapesSeen.has(name)) issues.push({ path: context.path, message: `형태 ${name}을 선언했지만 shape:${name}:± morph를 가진 메시가 없습니다.` });
  }
  if (new Set(context.shapes).size !== context.shapes.length) issues.push({ path: context.path, message: "shapes에 같은 이름이 두 번 있습니다." });
  return issues;
}

function baseV2Issues(baseId: KitBaseId, base: KitV2Base, manifest: ManifestV2Shape): KitIssue[] {
  const path: Array<string | number> = ["bases", baseId];
  const issues = fileIssues(base.meshes, { path: [...path, "meshes"], materials: manifest.materials, shapes: [], rigidAllowed: false });
  if (base.file.bytes > KIT_BUDGET.baseGlbMaxBytes) issues.push({ path: [...path, "file", "bytes"], message: `베이스 GLB(${base.file.bytes} B)가 한도 ${KIT_BUDGET.baseGlbMaxBytes} B를 넘습니다.` });
  const byNode = new Map(base.meshes.map((mesh) => [mesh.node, mesh] as const));
  for (const spec of KIT_BASE_MESH_SPECS) {
    const mesh = byNode.get(spec.node);
    if (mesh === undefined) issues.push({ path: [...path, "meshes"], message: `베이스 메시 ${spec.node}가 선언되지 않았습니다(kit-mesh-missing).` });
    else if (stableStringify([mesh.role, mesh.primitiveRoles]) !== stableStringify([spec.role, spec.primitiveRoles])) {
      issues.push({ path: [...path, "meshes"], message: `${spec.node}: 역할이 계약(${stableStringify(spec.role ?? spec.primitiveRoles)})과 다릅니다.` });
    }
  }
  const specNodes = new Set(KIT_BASE_MESH_SPECS.map((spec) => spec.node));
  for (const mesh of base.meshes) if (!specNodes.has(mesh.node)) issues.push({ path: [...path, "meshes"], message: `${mesh.node}: 계약에 없는 베이스 메시입니다(kit-mesh-undeclared).` });
  // 영역 범위: TS_Body 인덱스 버퍼를 빈틈·겹침 없이 분할하는 15개(v1과 같은 규칙)
  const ids = base.bodyRegions.map((range) => range.id);
  if (new Set(ids).size !== ids.length || ids.length !== KIT_HIDEABLE_REGION_IDS.length) {
    issues.push({ path: [...path, "bodyRegions"], message: `bodyRegions는 숨길 수 있는 영역 ${KIT_HIDEABLE_REGION_IDS.length}개를 정확히 한 번씩 담아야 합니다(현재 ${ids.length}개).` });
  }
  let cursor = 0;
  base.bodyRegions.forEach((range, index) => {
    if (range.mesh !== KIT_BODY_NODE || range.indexStart !== cursor || range.indexCount % 3 !== 0) {
      issues.push({ path: [...path, "bodyRegions", index], message: `영역 ${range.id}의 범위가 ${KIT_BODY_NODE} 인덱스를 빈틈·겹침 없이 잇는 3의 배수가 아닙니다(kit-region-range-invalid).` });
    }
    cursor = range.indexStart + range.indexCount;
  });
  const body = byNode.get(KIT_BODY_NODE);
  if (body !== undefined && base.bodyRegions.length > 0 && cursor !== body.triangles * 3) {
    issues.push({ path: [...path, "bodyRegions"], message: `영역 범위의 합(${cursor})이 ${KIT_BODY_NODE} 인덱스 수(${body.triangles * 3})와 다릅니다(kit-region-range-invalid).` });
  }
  const joints = new Set(manifest.skeleton.joints);
  for (const [anchor, spec] of Object.entries(base.anchors)) {
    if (spec !== undefined && !joints.has(spec.joint)) issues.push({ path: [...path, "anchors", anchor], message: `앵커 ${anchor}의 joint ${spec.joint}가 skeleton.joints에 없습니다.` });
  }
  return issues;
}

/** 노드 이름 규칙: 헤어는 v1과 같고, 의상·액세서리·층은 `<접두>_<이름>` + 선택 채널 접미 */
function nodeNameIssues(slot: KitPartSlot, layer: WardrobeLayer | null, name: string, meshes: readonly KitV2Mesh[], path: ReadonlyArray<string | number>): KitIssue[] {
  const issues: KitIssue[] = [];
  for (const mesh of meshes) {
    if (slot === "hair") {
      const match = AUTHORED_HAIR_MESH_PATTERN.exec(mesh.node);
      if (match?.groups?.style !== name || match.groups.lod === undefined || mesh.lod !== Number.parseInt(match.groups.lod, 10)) {
        issues.push({ path, message: `${mesh.node}: 헤어 메시 이름은 TS_AuthoredHair_${name}_LOD<n>이고 lod 필드와 같아야 합니다.` });
      }
      continue;
    }
    if (slot === "irises") {
      const prefix = mesh.role === "iris" ? "TS_Iris" : mesh.role === "eye-highlight" ? "TS_Highlight" : mesh.role === "pupil" ? "TS_Pupil" : null;
      if (prefix === null || (mesh.node !== `${prefix}_L` && mesh.node !== `${prefix}_R`)) issues.push({ path, message: `${mesh.node}: 홍채 파츠 메시 이름은 TS_Iris/TS_Highlight/TS_Pupil_L·R이어야 합니다.` });
      continue;
    }
    const prefixKey = layer ?? (slot === "accessory" && meshRoles(mesh).includes("hair-accessory") ? "hair-accessory" : slot);
    const head = `${NODE_PREFIX[prefixKey]}_${name}`;
    if (!mesh.node.startsWith(head) || !NODE_SUFFIX.test(mesh.node.slice(head.length))) issues.push({ path, message: `${mesh.node}: 메시 이름은 ${head}(+선택 채널 접미 _Trim 등) 형식이어야 합니다.` });
  }
  return issues;
}

function variantIssues(part: KitV2Part, variant: KitV2PartVariant, layer: WardrobeLayer | null, path: ReadonlyArray<string | number>, materials: ManifestV2Shape["materials"]): KitIssue[] {
  const name = part.id.slice(part.id.indexOf("/") + 1);
  const rigidAllowed = part.slot === "accessory";
  const issues = fileIssues(variant.meshes, { path: [...path, "meshes"], materials, shapes: variant.shapes, rigidAllowed });
  issues.push(...nodeNameIssues(part.slot, layer, name, variant.meshes, [...path, "meshes"]));
  if (variant.file.bytes > KIT_BUDGET.partGlbMaxBytes) issues.push({ path: [...path, "file", "bytes"], message: `${part.id}: 파츠 GLB(${variant.file.bytes} B)가 한도 ${KIT_BUDGET.partGlbMaxBytes} B를 넘습니다.` });
  const allowed: readonly PartRole[] = layer === null ? KIT_V2_PART_SLOT_ROLES[part.slot] : [WARDROBE_LAYER_ROLE[layer]];
  const present = new Set(variant.meshes.flatMap((mesh) => meshRoles(mesh)));
  for (const role of present) if (!allowed.includes(role)) issues.push({ path: [...path, "meshes"], message: `${part.id}: ${layer ?? part.slot}에 허용되지 않는 역할 ${role}입니다(허용: ${allowed.join(", ")}).` });
  const required: readonly PartRole[] = part.slot === "irises" ? ["iris", "eye-highlight"] : part.slot === "accessory" && layer === null ? [] : allowed;
  for (const role of required) if (!present.has(role)) issues.push({ path: [...path, "meshes"], message: `${part.id}: 필수 역할 ${role} 메시가 없습니다.` });
  if (part.slot === "accessory" && layer === null && !present.has("accessory") && !present.has("hair-accessory")) {
    issues.push({ path: [...path, "meshes"], message: `${part.id}: 액세서리 변형에는 accessory 또는 hair-accessory 역할 메시가 있어야 합니다.` });
  }
  const rigid = variant.meshes.some((mesh) => mesh.skinned === false);
  if (rigid && variant.anchor === undefined) issues.push({ path: [...path, "anchor"], message: `${part.id}: 강체 소품 변형에는 기본 앵커(anchor)가 필요합니다.` });
  if (variant.anchor !== undefined && !rigidAllowed) issues.push({ path: [...path, "anchor"], message: `${part.id}: anchor는 액세서리 슬롯 변형에만 둘 수 있습니다.` });
  if ((part.slot === "hair" || part.slot === "irises") && variant.hides.length > 0) issues.push({ path: [...path, "hides"], message: `${part.id}: 슬롯 ${part.slot}은 몸 영역을 숨길 수 없습니다.` });
  if (new Set(variant.hides).size !== variant.hides.length) issues.push({ path: [...path, "hides"], message: `${part.id}: hides가 중복되었습니다.` });
  return issues;
}

function partV2Issues(part: KitV2Part, index: number, baseIds: readonly KitBaseId[], materials: ManifestV2Shape["materials"]): KitIssue[] {
  const path: Array<string | number> = ["parts", index];
  const issues: KitIssue[] = [];
  const slash = part.id.indexOf("/");
  const name = part.id.slice(slash + 1);
  if (part.id.slice(0, slash) !== part.slot) issues.push({ path: [...path, "id"], message: `파츠 id(${part.id})의 슬롯이 slot(${part.slot})과 다릅니다.` });
  if (!(SLOT_PRESET_IDS[part.slot] as readonly string[]).includes(name)) issues.push({ path: [...path, "id"], message: `파츠 id(${part.id})가 프리셋 어휘 SLOT_PRESET_IDS.${part.slot} 안에 없습니다.` });
  const layers = KIT_V2_SLOT_LAYERS[part.slot] ?? [];
  for (const baseId of KIT_BASE_IDS) {
    const variant = part.variants[baseId];
    const reason = part.unavailable[baseId];
    const layered = part.layerVariants?.[baseId];
    if (!baseIds.includes(baseId)) {
      if (variant !== undefined || layered !== undefined) issues.push({ path: [...path, "variants", baseId], message: `${part.id}: bases에 없는 베이스(${baseId})의 변형입니다.` });
      continue;
    }
    if (variant !== undefined && reason !== undefined) issues.push({ path: [...path, "unavailable", baseId], message: `${part.id}: ${baseId} 변형이 있으면서 미제공 사유도 선언되었습니다.` });
    if (variant === undefined && (reason === undefined || !HANGUL.test(reason))) issues.push({ path: [...path, "variants", baseId], message: `${part.id}: ${baseId} 변형이 없으면 unavailable.${baseId}에 한글 사유가 필요합니다.` });
    if (variant !== undefined) issues.push(...variantIssues(part, variant, null, [...path, "variants", baseId], materials));
    for (const [layer, layerVariant] of Object.entries(layered ?? {}) as Array<[WardrobeLayer, KitV2PartVariant | undefined]>) {
      if (layerVariant === undefined) continue;
      const layerPath = [...path, "layerVariants", baseId, layer];
      if (!layers.includes(layer)) {
        issues.push({ path: layerPath, message: `${part.id}: 슬롯 ${part.slot}은 ${layer} 층에 입을 수 없습니다(허용: ${layers.join(", ") || "없음"}).` });
        continue;
      }
      issues.push(...variantIssues(part, layerVariant, layer, layerPath, materials));
    }
  }
  return issues;
}

function manifestV2Issues(manifest: ManifestV2Shape): KitIssue[] {
  const issues: KitIssue[] = [...kitSkeletonIssues(manifest.skeleton), ...materialIssues(manifest.materials)];
  issues.push(...kitProvenanceIssues(manifest.provenance.sources));
  issues.push(...kitJointOffsetIssues(manifest.jointOffsets, KIT_BUDGET.maxJointOffsetM));
  const baseIds = KIT_BASE_IDS.filter((id) => manifest.bases[id] !== undefined);
  if (manifest.bases.female === undefined) issues.push({ path: ["bases", "female"], message: "여성 베이스(female)는 필수입니다(기본 베이스)." });
  if (manifest.defaults.base !== KIT_DEFAULT_BASE_ID || !baseIds.includes(manifest.defaults.base)) issues.push({ path: ["defaults", "base"], message: `defaults.base는 ${KIT_DEFAULT_BASE_ID}이고 bases에 있어야 합니다.` });
  for (const baseId of KIT_BASE_IDS) {
    const base = manifest.bases[baseId];
    if (base !== undefined) issues.push(...baseV2Issues(baseId, base, manifest));
    if ((base !== undefined) !== (manifest.slotCapabilities[baseId] !== undefined)) issues.push({ path: ["slotCapabilities", baseId], message: `slotCapabilities.${baseId}는 베이스가 있을 때만, 그리고 반드시 선언해야 합니다.` });
  }
  const seen = new Set<string>();
  manifest.parts.forEach((part, index) => {
    if (seen.has(part.id)) issues.push({ path: ["parts", index, "id"], message: `파츠 id가 중복되었습니다: ${part.id}` });
    seen.add(part.id);
    issues.push(...partV2Issues(part, index, baseIds, manifest.materials));
  });
  for (const slot of KIT_PART_SLOTS) {
    for (const name of SLOT_PRESET_IDS[slot]) if (!seen.has(`${slot}/${name}`)) issues.push({ path: ["parts"], message: `어휘의 프리셋 ${slot}/${name}가 parts에 없습니다(변형이 없으면 unavailable 사유로 선언).` });
  }
  for (const baseId of baseIds) {
    for (const id of KIT_REQUIRED_PRESETS) {
      if (manifest.parts.find((candidate) => candidate.id === id)?.variants[baseId] === undefined) issues.push({ path: ["parts"], message: `필수 파츠 ${id}의 ${baseId} 변형이 없습니다(kit-part-missing).` });
    }
  }
  const files = new Map<string, number>();
  for (const baseId of baseIds) {
    const base = manifest.bases[baseId];
    if (base !== undefined) files.set(base.file.path, base.file.bytes);
    if (base?.headRegionMask !== undefined) files.set(base.headRegionMask.file.path, base.headRegionMask.file.bytes);
    for (const part of manifest.parts) {
      const variant = part.variants[baseId];
      if (variant !== undefined) files.set(variant.file.path, variant.file.bytes);
      for (const layered of Object.values(part.layerVariants?.[baseId] ?? {})) if (layered !== undefined) files.set(layered.file.path, layered.file.bytes);
    }
  }
  let total = 0;
  for (const bytes of files.values()) total += bytes;
  if (total > KIT_BUDGET.totalMaxBytes) issues.push({ path: ["bases"], message: `키트 고유 파일 합계(${total} B)가 한도 ${KIT_BUDGET.totalMaxBytes} B를 넘습니다.` });
  return issues;
}

export const kitManifestV2Schema = kitManifestV2ObjectSchema.superRefine((manifest, ctx) => {
  for (const issue of manifestV2Issues(manifest)) ctx.addIssue({ code: "custom", message: issue.message, path: [...issue.path] });
});
export type KitManifestV2 = z.infer<typeof kitManifestV2Schema>;

export type ParseKitManifestV2Result = { readonly ok: true; readonly manifest: KitManifestV2 } | { readonly ok: false; readonly failure: LabFailure };

function summarize(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): string {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/** `kit.json` v2를 파싱한다. 실패는 `kit-manifest-invalid`(첫 5개 이슈를 한글 사유에 포함) */
export function parseKitManifestV2(json: unknown, now?: number): ParseKitManifestV2Result {
  const result = kitManifestV2Schema.safeParse(json);
  if (!result.success) return { ok: false, failure: failVisible("kit-manifest-invalid", `키트 v2 manifest 형식이 올바르지 않습니다: ${summarize(result.error.issues)}`, undefined, now) };
  return { ok: true, manifest: result.data };
}

export type ParseAnyKitManifestResult =
  | { readonly ok: true; readonly version: 1; readonly manifest: KitManifest }
  | { readonly ok: true; readonly version: 2; readonly manifest: KitManifestV2 }
  | { readonly ok: false; readonly failure: LabFailure };

/** `schema` 문자열로 v1·v2 파서를 고른다. 모르는 schema는 대체 없이 `kit-manifest-invalid`다. */
export function parseAnyKitManifest(json: unknown, now?: number): ParseAnyKitManifestResult {
  const schema = typeof json === "object" && json !== null ? (json as { schema?: unknown }).schema : undefined;
  if (schema === KIT_SCHEMA_ID) {
    const v1 = parseKitManifest(json, now);
    return v1.ok ? { ok: true, version: 1, manifest: v1.manifest } : v1;
  }
  if (schema === KIT_V2_SCHEMA_ID) {
    const v2 = parseKitManifestV2(json, now);
    return v2.ok ? { ok: true, version: 2, manifest: v2.manifest } : v2;
  }
  return { ok: false, failure: failVisible("kit-manifest-invalid", `지원하지 않는 키트 manifest schema입니다: ${String(schema)} (지원: ${KIT_SCHEMA_ID}, ${KIT_V2_SCHEMA_ID})`, undefined, now) };
}
