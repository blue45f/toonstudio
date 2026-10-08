/**
 * 합성 키트 fixture(셸·조립 테스트용). 유효한 `kit.json`(JSON 객체)을 만든다.
 *
 * `testing/`은 순수 TS라 `domains/authored`의 `deriveKitCapabilities`를 import할 수 없다(architecture.test.ts). 그래서 선언 능력
 * (`slotCapabilities`)은 이 파일 안의 작은 규칙(파츠 슬롯 = 어휘 대비 변형 수, 나머지 슬롯 = 모든 morph를 채웠으므로 available)으로 채운다.
 * 이 선언이 실제 규칙 판정과 일치하는지는 `app/shell/kit-plan-registry.test.ts`가 실제 `loadKitManifestFlow`(능력 대조 포함)로 통과시켜 검증한다.
 * 테스트가 실제 `kit.json`을 대신하는 합성 데이터이며 제품 코드는 이 파일을 import하지 않는다.
 */
import {
  CHARACTER_SLOT_KINDS,
  DEFAULT_RECIPE_COLORS,
  KIT_BASE_MESH_SPECS,
  KIT_BONE_MAP,
  KIT_BUDGET,
  KIT_DEFAULT_ID,
  KIT_DEFAULT_SLOTS,
  KIT_END_BONES,
  KIT_HIDEABLE_REGION_IDS,
  KIT_MORPH_COVERAGE,
  KIT_PART_SLOTS,
  KIT_REQUIRED_JOINT_OFFSET_MORPHS,
  KIT_REQUIRED_PRESETS,
  KIT_ROLE_TINT_RULES,
  KIT_ROOT_JOINT,
  KIT_SCHEMA_ID,
  KIT_SKELETON_JOINTS,
  KIT_SKELETON_PARENTS,
  SLOT_LABELS_KO,
  SLOT_PRESET_IDS,
  parseKitManifest,
} from "../contracts";

import type { KitBaseId, KitManifest, KitPartSlot, PartRole, SlotKind } from "../contracts";

type Json = Record<string, unknown>;

export interface KitFixtureOptions {
  readonly kitVersion?: number;
  /** 여성 베이스에 변형이 없는 프리셋 id(필수 파츠는 뺄 수 없다) */
  readonly omitFemale?: readonly string[];
  /** 남성 베이스를 제공할지(기본 true) */
  readonly male?: boolean;
  /** 남성 베이스에 변형이 있는 프리셋 id. 기본은 필수 파츠만 */
  readonly malePresets?: readonly string[];
}

const GARMENT_HIDES: Readonly<Partial<Record<KitPartSlot, readonly string[]>>> = {
  top: ["torso", "upperArm.L", "upperArm.R"],
  bottom: ["pelvis", "thigh.L", "thigh.R"],
  shoes: ["foot.L", "foot.R"],
};

const BODY_TRIANGLES = KIT_HIDEABLE_REGION_IDS.length * 40;

function sha(seed: number): string {
  return seed.toString(16).padStart(64, "0");
}

function morphsFor(roles: readonly PartRole[]): string[] {
  const names = new Set<string>();
  for (const role of roles) for (const name of KIT_MORPH_COVERAGE[role]) names.add(name);
  return [...names];
}

function mesh(node: string, role: PartRole, material: string, extra: Json = {}): Json {
  return { node, role, material, triangles: 100, vertices: 60, skinned: true, morphs: morphsFor([role]), ...extra };
}

function baseMeshes(): Json[] {
  return KIT_BASE_MESH_SPECS.map((spec) => {
    const roles = spec.role === undefined ? (spec.primitiveRoles ?? []) : [spec.role];
    const common = { node: spec.node, triangles: spec.node === "TS_Body" ? BODY_TRIANGLES : 100, vertices: 60, skinned: true, morphs: morphsFor(roles) };
    return spec.role === undefined
      ? { ...common, primitiveRoles: spec.primitiveRoles, primitiveMaterials: spec.primitiveMaterials }
      : { ...common, role: spec.role, material: spec.material };
  });
}

function bodyRegions(): Json[] {
  return KIT_HIDEABLE_REGION_IDS.map((id, index) => ({ id, mesh: "TS_Body", indexStart: index * 120, indexCount: 120 }));
}

function partMeshes(slot: KitPartSlot, name: string): Json[] {
  switch (slot) {
    case "hair":
      return [0, 1, 2].map((lod) => mesh(`TS_AuthoredHair_${name}_LOD${lod}`, "hair", `ts_hair_${name}`, { lod, triangles: 1000 - lod * 300 }));
    case "top":
      return [mesh(`TS_Top_${name}`, "top", `ts_top_${name}`)];
    case "bottom":
      return [mesh(`TS_Bottom_${name}`, "bottom", `ts_bottom_${name}`)];
    case "shoes":
      return [mesh(`TS_Shoes_${name}`, "shoes", `ts_shoes_${name}`)];
    case "accessory":
      return [mesh(`TS_Accessory_${name}`, "accessory", `ts_accessory_${name}`)];
    case "irises":
      return [
        mesh("TS_Iris_L", "iris", "ts_iris"),
        mesh("TS_Iris_R", "iris", "ts_iris"),
        mesh("TS_Highlight_L", "eye-highlight", "ts_highlight"),
        mesh("TS_Highlight_R", "eye-highlight", "ts_highlight"),
      ];
  }
}

function materials(): Record<string, Json> {
  const result: Record<string, Json> = {};
  const add = (name: string, role: PartRole): void => {
    const rule = KIT_ROLE_TINT_RULES[role];
    const tint = rule === undefined || rule.mode === "fixed" ? { mode: "fixed", hex: "#f4f4f6" } : { mode: "recolor", colorKey: rule.colorKey };
    result[name] = { role, tint, doubleSided: false };
  };
  for (const spec of KIT_BASE_MESH_SPECS) {
    const roles = spec.role === undefined ? (spec.primitiveRoles ?? []) : [spec.role];
    const names = spec.material === undefined ? (spec.primitiveMaterials ?? []) : [spec.material];
    roles.forEach((role, index) => add(names[index] ?? "ts_missing", role));
  }
  add("ts_iris", "iris");
  add("ts_highlight", "eye-highlight");
  for (const name of SLOT_PRESET_IDS.hair) add(`ts_hair_${name}`, "hair");
  for (const name of SLOT_PRESET_IDS.top) add(`ts_top_${name}`, "top");
  for (const name of SLOT_PRESET_IDS.bottom) add(`ts_bottom_${name}`, "bottom");
  for (const name of SLOT_PRESET_IDS.shoes) add(`ts_shoes_${name}`, "shoes");
  for (const name of SLOT_PRESET_IDS.accessory) add(`ts_accessory_${name}`, "accessory");
  return result;
}

function jointOffsets(): Json {
  const result: Record<string, Json> = {};
  KIT_REQUIRED_JOINT_OFFSET_MORPHS.forEach((morph, index) => {
    result[morph] = { "mixamorig:Hips": [0, 0.001 * (index + 1), 0], "mixamorig:Head": [0, 0.002, 0] };
  });
  return result;
}

/** 선언 능력: 파츠 슬롯은 어휘 대비 변형 수로, 나머지 슬롯은 모든 필수 morph·본이 채워져 있으므로 available로 선언한다. */
function declaredCapabilities(provided: ReadonlySet<string>, unavailableReasons: Readonly<Record<string, string>>): Json {
  const result: Record<string, Json> = {};
  const partSlots: ReadonlySet<SlotKind> = new Set(KIT_PART_SLOTS);
  for (const slot of CHARACTER_SLOT_KINDS) {
    if (!partSlots.has(slot)) {
      result[slot] = { status: "available" };
      continue;
    }
    const names: readonly string[] = SLOT_PRESET_IDS[slot as KitPartSlot];
    const missing = names.filter((name) => !provided.has(`${slot}/${name}`));
    if (missing.length === 0) result[slot] = { status: "available" };
    else if (missing.length === names.length) result[slot] = { status: "unavailable", reasonKo: `키트가 ${SLOT_LABELS_KO[slot]} 파츠를 제공하지 않습니다.` };
    else {
      const unavailablePresets: Record<string, string> = {};
      for (const name of missing) unavailablePresets[`${slot}/${name}`] = unavailableReasons[`${slot}/${name}`] ?? "미제작";
      result[slot] = { status: "partial", reasonKo: `제공 ${names.length - missing.length}/${names.length}종, 미제공: ${missing.join(", ")}`, unavailablePresets };
    }
  }
  return result;
}

/** 합성 `kit.json` JSON. 기본은 여성 베이스에 어휘 전부, 남성 베이스에 필수 파츠만 있다. */
export function kitManifestJson(options: KitFixtureOptions = {}): Json {
  const malePresets = new Set(options.malePresets ?? KIT_REQUIRED_PRESETS);
  const omitFemale = new Set(options.omitFemale ?? []);
  const withMale = options.male !== false;
  let counter = 1;

  const parts: Json[] = [];
  const providedBy: Record<KitBaseId, Set<string>> = { female: new Set(), male: new Set() };
  const reasonsBy: Record<KitBaseId, Record<string, string>> = { female: {}, male: {} };
  for (const slot of KIT_PART_SLOTS) {
    for (const name of SLOT_PRESET_IDS[slot]) {
      const id = `${slot}/${name}`;
      const variantOf = (baseId: KitBaseId): Json => ({
        file: { path: `parts/${baseId}/${slot}/${name}.glb`, bytes: 100_000 + counter, sha256: sha((counter += 1)) },
        meshes: partMeshes(slot, name),
        hides: GARMENT_HIDES[slot] ?? [],
      });
      const variants: Json = {};
      const unavailable: Json = {};
      if (omitFemale.has(id)) {
        unavailable.female = "여성 핏 미제작";
        reasonsBy.female[id] = "여성 핏 미제작";
      } else {
        variants.female = variantOf("female");
        providedBy.female.add(id);
      }
      if (withMale) {
        if (malePresets.has(id)) {
          variants.male = variantOf("male");
          providedBy.male.add(id);
        } else {
          unavailable.male = "남성 핏 미제작";
          reasonsBy.male[id] = "남성 핏 미제작";
        }
      }
      parts.push({ id, slot, variants, unavailable });
    }
  }

  const baseOf = (baseId: KitBaseId): Json => ({
    file: { path: `bases/${baseId}.glb`, bytes: 5_000_000 + counter, sha256: sha(1000 + (counter += 1)) },
    heightM: baseId === "female" ? 1.64 : 1.69,
    boundsM: { min: [-0.86, 0, -0.12], max: [0.86, 1.64, 0.13] },
    meshes: baseMeshes(),
    bodyRegions: bodyRegions(),
  });

  const declared: Json = { female: declaredCapabilities(providedBy.female, reasonsBy.female) };
  if (withMale) declared.male = declaredCapabilities(providedBy.male, reasonsBy.male);

  return {
    schema: KIT_SCHEMA_ID,
    kitId: KIT_DEFAULT_ID,
    kitVersion: options.kitVersion ?? 1,
    displayName: "합성 테스트 키트",
    generatedAt: "2026-10-08",
    generator: { tool: "tools/blender/character_kit", blender: "5.2.1", command: ["--stage", "export-kit"] },
    coordinateSystem: { up: "+Y", forward: "+Z", unit: "m", handedness: "right", rest: "T-pose", rootScale: 1 },
    provenance: {
      sources: [
        {
          id: "hbm-1.4.1",
          name: "Blender Foundation Human Base Meshes Bundle",
          version: "1.4.1",
          url: "https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip",
          zipSha256: "811f43accbb31a88266d932f8f5563b2d13586fca0ba2693aad1f5fe582b3515",
          license: "CC0-1.0",
          derivative: true,
          changesKo: "멀티레스 레벨 1 적용, 목에서 몸/머리 분할, T-포즈 변환, 리깅.",
        },
        { id: "toonstudio-original", name: "ToonStudio 원본 디자인", license: "original", derivative: false, changesKo: "절차 생성한 원본 디자인." },
      ],
      noticeFile: "NOTICE.md",
      summaryKo: "Blender Foundation Human Base Meshes Bundle v1.4.1(CC0) 파생물과 원본 디자인.",
    },
    skeleton: { root: KIT_ROOT_JOINT, joints: [...KIT_SKELETON_JOINTS], parents: { ...KIT_SKELETON_PARENTS }, boneMap: { ...KIT_BONE_MAP }, endBones: [...KIT_END_BONES] },
    materials: materials(),
    jointOffsets: jointOffsets(),
    bases: { female: baseOf("female"), ...(withMale ? { male: baseOf("male") } : {}) },
    parts,
    defaults: { base: "female", slots: { ...KIT_DEFAULT_SLOTS }, colors: { ...DEFAULT_RECIPE_COLORS } },
    slotCapabilities: declared,
    physics: { mode: "static", chains: [], colliders: [] },
    budgets: JSON.parse(JSON.stringify(KIT_BUDGET)) as unknown,
  };
}

/** 파싱된 합성 manifest. 유효하지 않으면 던진다(테스트 설정 오류). */
export function kitManifestFixture(options: KitFixtureOptions = {}): KitManifest {
  const parsed = parseKitManifest(kitManifestJson(options));
  if (!parsed.ok) throw new Error(`합성 kit.json이 유효하지 않습니다: ${parsed.failure.reasonKo}`);
  return parsed.manifest;
}
