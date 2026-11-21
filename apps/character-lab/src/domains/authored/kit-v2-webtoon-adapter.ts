/**
 * 온디스크 5아키타입 웹툰 키트 v2(`toonstudio-kit-v2/kit.json`, `WebtoonKitV2Manifest`)를
 * 런타임 공통 정규화 매니페스트(`NormalizedKitManifestV2`)로 변환하는 순수 어댑터.
 *
 * - `bases` 5종(`female-romance`/`male-webtoon`/`male-action`/`youth-academy`/`sd-chibi`)을
 *   `baseAliases`로 `female`/`male`에 투영하면서 5종 원본을 `webtoonV2.archetypeBases`에 모두 보존한다.
 * - `parts`의 `garments` 슬롯·`variants.shared`·`layerVariants`·`hasUv1`·`physics.mode: "vrm-spring-bone-1.0"`을
 *   기존 `KitManifestV2` 및 `buildKitPlanV2Detailed`와 완전 호환되게 정규화한다.
 */
import {
  ACCESSORY_ANCHORS,
  DEFAULT_RECIPE_COLORS,
  KIT_DEFAULT_SLOTS,
  KIT_V2_ARCHETYPE_IDS,
  KIT_V2_BUDGET,
  KIT_V2_WEBTOON_ID,
  PART_ROLES,
  isChannelKey,
} from "../../contracts";

import { deriveKitCapabilities } from "./kit-capability";

import type {
  AccessoryAnchor,
  ChannelKey,
  KitBaseId,
  KitManifestV2,
  KitPartSlot,
  KitV2ArchetypeId,
  KitV2Base,
  KitV2Material,
  KitV2Mesh,
  KitV2Part,
  KitV2PartVariant,
  PartRole,
  WardrobeLayer,
  WebtoonKitV2Manifest,
} from "../../contracts";

export interface WebtoonKitV2RuntimeMeta {
  readonly archetypeBases: Readonly<Record<KitV2ArchetypeId, KitV2Base>>;
  readonly baseAliases: Readonly<Record<KitBaseId, KitV2ArchetypeId>>;
  readonly defaultArchetypeId: KitV2ArchetypeId;
  readonly physicsMode: "vrm-spring-bone-1.0";
  readonly minHitRadiusGt: number;
  /** `garments/<slug>` 원본 ID → 정규화된 `KitV2Part` 매핑(직접 선택 및 층/슬롯 조회용) */
  readonly garmentByRawId: Readonly<Record<string, KitV2Part>>;
}

export interface NormalizedKitManifestV2 extends KitManifestV2 {
  readonly webtoonV2?: WebtoonKitV2RuntimeMeta;
}

const PART_ROLE_SET: ReadonlySet<string> = new Set(PART_ROLES);
const ANCHOR_SET: ReadonlySet<string> = new Set(ACCESSORY_ANCHORS);

/** 온디스크 `toonstudio-kit-v2/kit.json` 형태인지 판별한다(기존 `KitManifestV2`와 구분). */
export function isWebtoonKitV2Json(json: unknown): boolean {
  if (typeof json !== "object" || json === null) return false;
  const candidate = json as Record<string, unknown>;
  return candidate.kitId === KIT_V2_WEBTOON_ID || ("baseAliases" in candidate && "heroVrmAvatars" in candidate);
}

function inferRoleFromMaterialName(name: string, rawRole: string): PartRole {
  if (PART_ROLE_SET.has(rawRole)) return rawRole as PartRole;
  if (name.startsWith("ts_outer_")) return "outer";
  if (name.startsWith("ts_inner_")) return "inner";
  if (name.startsWith("ts_legwear_")) return "legwear";
  if (name.startsWith("ts_bottom_")) return "bottom";
  if (name.startsWith("ts_shoes_")) return "shoes";
  if (name.startsWith("ts_accessory_")) return "accessory";
  if (name.startsWith("ts_hair_accent_") || name.startsWith("ts_hair_accessory_")) return "hair-accessory";
  if (name.startsWith("ts_hair_")) return "hair";
  return "top";
}

function defaultChannelForRole(role: PartRole): ChannelKey | undefined {
  switch (role) {
    case "skin":
    case "head":
      return "skin";
    case "eyeball":
      return "sclera";
    case "iris":
    case "pupil":
      return "iris";
    case "hair":
      return "hair";
    case "brow":
    case "lash":
      return "brow";
    case "top":
      return "top";
    case "bottom":
      return "bottom";
    case "shoes":
      return "shoes";
    case "accessory":
      return "accessory";
    case "inner":
      return "inner";
    case "outer":
      return "outer";
    case "legwear":
      return "legwear";
    case "hair-accessory":
      return "hair-accessory";
    default:
      return undefined;
  }
}

function normalizeMaterial(name: string, raw: WebtoonKitV2Manifest["materials"][string]): KitV2Material {
  const role = inferRoleFromMaterialName(name, raw.role);
  if (raw.tint.mode === "fixed") {
    return { role, tint: raw.tint, doubleSided: raw.doubleSided };
  }
  const channel = raw.channel && isChannelKey(raw.channel) ? raw.channel : defaultChannelForRole(role);
  return {
    role,
    ...(channel !== undefined ? { channel } : {}),
    tint: raw.tint,
    doubleSided: raw.doubleSided,
  };
}

function normalizeMesh(
  rawMesh: WebtoonKitV2Manifest["bases"]["female-romance"]["meshes"][number],
  materials: Readonly<Record<string, KitV2Material>>,
): KitV2Mesh {
  const primaryMat = rawMesh.material ? materials[rawMesh.material] : undefined;
  const primMats = rawMesh.primitiveMaterials?.map((name) => materials[name]);
  const role: PartRole | undefined = rawMesh.material ? (primaryMat?.role ?? "top") : undefined;
  const primitiveRoles: PartRole[] | undefined = primMats ? primMats.map((m) => m?.role ?? "top") : undefined;
  const effectiveRole = role ?? primitiveRoles?.[0] ?? "top";
  const uv1 = rawMesh.hasUv1
    ? effectiveRole === "hair" || effectiveRole === "hair-accessory"
      ? ({ purpose: "hair-flow" } as const)
      : ({ purpose: "pattern", cmPerUnit: 25 } as const)
    : undefined;
  return {
    node: rawMesh.node,
    ...(role !== undefined ? { role } : {}),
    ...(primitiveRoles !== undefined ? { primitiveRoles } : {}),
    ...(rawMesh.material !== undefined ? { material: rawMesh.material } : {}),
    ...(rawMesh.primitiveMaterials !== undefined ? { primitiveMaterials: rawMesh.primitiveMaterials } : {}),
    skinned: rawMesh.skinned,
    triangles: rawMesh.triangles,
    vertices: rawMesh.vertices,
    morphs: rawMesh.morphs,
    ...(uv1 !== undefined ? { uv1 } : {}),
  };
}

function normalizeBase(
  rawBase: WebtoonKitV2Manifest["bases"][KitV2ArchetypeId],
  materials: Readonly<Record<string, KitV2Material>>,
): KitV2Base {
  const anchors: Partial<Record<AccessoryAnchor, { readonly joint: string; readonly offsetM: [number, number, number] }>> = {};
  for (const [key, value] of Object.entries(rawBase.anchors)) {
    if (ANCHOR_SET.has(key)) anchors[key as AccessoryAnchor] = { joint: value.joint, offsetM: [...value.offsetM] as [number, number, number] };
  }
  return {
    file: rawBase.file,
    heightM: rawBase.heightM,
    headHeightM: rawBase.headHeightM,
    boundsM: rawBase.boundsM,
    meshes: rawBase.meshes.map((mesh) => normalizeMesh(mesh, materials)),
    bodyRegions: rawBase.bodyRegions,
    anchors,
  };
}

function slotAndLayerForPart(
  rawPart: WebtoonKitV2Manifest["parts"][number],
  meshes: readonly KitV2Mesh[],
): { readonly slot: KitPartSlot; readonly layer: WardrobeLayer | null } {
  if (rawPart.slot === "hair" || rawPart.slot === "top" || rawPart.slot === "bottom" || rawPart.slot === "shoes" || rawPart.slot === "accessory" || rawPart.slot === "irises") {
    return { slot: rawPart.slot, layer: null };
  }
  const firstRole = meshes[0]?.role ?? meshes[0]?.primitiveRoles?.[0] ?? "top";
  if (firstRole === "outer") return { slot: "top", layer: "outer" };
  if (firstRole === "inner") return { slot: "top", layer: "inner" };
  if (firstRole === "legwear") return { slot: "bottom", layer: "legwear" };
  if (firstRole === "bottom") return { slot: "bottom", layer: null };
  if (firstRole === "shoes") return { slot: "shoes", layer: null };
  if (firstRole === "accessory" || firstRole === "hair-accessory") return { slot: "accessory", layer: null };
  return { slot: "top", layer: null };
}

function toV2Variant(
  rawVariant: WebtoonKitV2Manifest["parts"][number]["variants"][string],
  materials: Readonly<Record<string, KitV2Material>>,
  defaultAnchor?: AccessoryAnchor,
): KitV2PartVariant {
  const meshes = rawVariant.meshes.map((mesh) => normalizeMesh(mesh, materials));
  const hasRigid = meshes.some((mesh) => mesh.skinned === false);
  return {
    file: rawVariant.file,
    meshes,
    hides: [],
    shapes: rawVariant.shapes,
    ...(hasRigid ? { anchor: defaultAnchor ?? "neck" } : {}),
  };
}

/** 온디스크 `WebtoonKitV2Manifest`를 런타임 정규화 매니페스트(`NormalizedKitManifestV2`)로 변환한다. */
export function adaptWebtoonKitV2ToKitManifestV2(raw: WebtoonKitV2Manifest): NormalizedKitManifestV2 {
  const materials: Record<string, KitV2Material> = {};
  for (const [name, mat] of Object.entries(raw.materials)) {
    materials[name] = normalizeMaterial(name, mat);
  }

  const archetypeBases = {} as Record<KitV2ArchetypeId, KitV2Base>;
  for (const archId of KIT_V2_ARCHETYPE_IDS) {
    archetypeBases[archId] = normalizeBase(raw.bases[archId], materials);
  }

  const bases: KitManifestV2["bases"] = {
    female: archetypeBases[raw.baseAliases.female],
    male: archetypeBases[raw.baseAliases.male],
  };

  const parts: KitV2Part[] = [];
  const garmentByRawId: Record<string, KitV2Part> = {};

  for (const rawPart of raw.parts) {
    const shared = rawPart.variants.shared;
    const femaleRaw = rawPart.variants.female ?? rawPart.variants[raw.baseAliases.female] ?? shared;
    const maleRaw = rawPart.variants.male ?? rawPart.variants[raw.baseAliases.male] ?? shared;
    const sample = femaleRaw ?? maleRaw;
    if (!sample) continue;
    const sampleMeshes = sample.meshes.map((mesh) => normalizeMesh(mesh, materials));
    const { slot, layer } = slotAndLayerForPart(rawPart, sampleMeshes);
    const femaleVariant = femaleRaw ? toV2Variant(femaleRaw, materials) : undefined;
    const maleVariant = maleRaw ? toV2Variant(maleRaw, materials) : undefined;

    const layerVariants: KitV2Part["layerVariants"] = {};
    if (layer !== null) {
      if (femaleVariant) layerVariants.female = { [layer]: femaleVariant };
      if (maleVariant) layerVariants.male = { [layer]: maleVariant };
    }
    if (rawPart.layerVariants) {
      for (const baseKey of ["female", "male"] as const) {
        const rawLayerMap = rawPart.layerVariants[baseKey] ?? rawPart.layerVariants.shared;
        if (!rawLayerMap) continue;
        const out: Partial<Record<WardrobeLayer, KitV2PartVariant>> = { ...(layerVariants[baseKey] ?? {}) };
        for (const layerKey of ["inner", "outer", "legwear"] as const) {
          const lv = rawLayerMap[layerKey];
          if (lv) out[layerKey] = toV2Variant(lv, materials);
        }
        if (Object.keys(out).length > 0) layerVariants[baseKey] = out;
      }
    }

    const normalizedPart: KitV2Part = {
      id: rawPart.id,
      slot,
      variants: {
        ...(femaleVariant ? { female: femaleVariant } : {}),
        ...(maleVariant ? { male: maleVariant } : {}),
      },
      ...(Object.keys(layerVariants).length > 0 ? { layerVariants } : {}),
      unavailable: {},
    };
    parts.push(normalizedPart);
    if (rawPart.slot === "garments") {
      garmentByRawId[rawPart.id] = normalizedPart;
    }
  }

  const jointOffsets: KitManifestV2["jointOffsets"] = raw.jointOffsets as KitManifestV2["jointOffsets"];
  const proto = {
    skeleton: raw.skeleton,
    jointOffsets,
    bases,
    parts,
    slotCapabilities: {},
  };
  const slotCapabilities: KitManifestV2["slotCapabilities"] = {
    female: deriveKitCapabilities(proto, "female"),
    male: deriveKitCapabilities(proto, "male"),
  };

  return {
    schema: raw.schema,
    kitId: raw.kitId,
    kitVersion: raw.kitVersion,
    displayName: raw.displayName,
    generatedAt: raw.generatedAt,
    generator: raw.generator,
    coordinateSystem: raw.coordinateSystem,
    provenance: raw.provenance,
    skeleton: raw.skeleton,
    materials,
    jointOffsets,
    bases,
    parts,
    defaults: {
      base: raw.defaults.base === raw.baseAliases.male ? "male" : "female",
      slots: { ...KIT_DEFAULT_SLOTS },
      colors: { ...DEFAULT_RECIPE_COLORS },
    },
    slotCapabilities,
    physics: {
      mode: "static",
      chains: [],
      colliders: [],
    },
    budgets: KIT_V2_BUDGET,
    webtoonV2: {
      archetypeBases,
      baseAliases: raw.baseAliases,
      defaultArchetypeId: raw.defaults.base,
      physicsMode: raw.physics.mode,
      minHitRadiusGt: raw.physics.minHitRadiusGt,
      garmentByRawId,
    },
  };
}
