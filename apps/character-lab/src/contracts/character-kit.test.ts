import { describe, expect, it } from "vitest";

import { HUMANOID_BONE_NAMES, HUMANOID_BONE_PARENTS } from "./bones";
import {
  KIT_ALLOWED_EXTENSIONS,
  KIT_ASSET_ROOT,
  KIT_BASE_MESH_SPECS,
  KIT_BONE_MAP,
  KIT_BUDGET,
  KIT_DEFAULT_ID,
  KIT_DEFAULT_SLOTS,
  KIT_END_BONES,
  KIT_FAILURE_CODES,
  KIT_FORBIDDEN_EXTENSIONS,
  KIT_HIDEABLE_REGION_IDS,
  KIT_JOINT_COUNT,
  KIT_MORPH_COVERAGE,
  KIT_MORPH_NAMES,
  KIT_PART_SLOTS,
  KIT_PART_SLOT_ROLES,
  KIT_REGION_IDS,
  KIT_REGION_TO_BODY_REGION,
  KIT_REQUIRED_JOINT_OFFSET_MORPHS,
  KIT_REQUIRED_PRESETS,
  KIT_SKELETON_JOINTS,
  KIT_SKELETON_PARENTS,
  KIT_SLOT_AXES,
  kitGeometryKey,
  kitManifestSchema,
  parseKitManifest,
} from "./character-kit";
import { FACS_UNITS } from "./expression";
import { PART_ROLES } from "./mesh-data";
import { isMorphTargetName } from "./morph-names";
import { BODY_REGIONS } from "./outfit-port";
import { BODY_PARAM_KEYS, FACE_PARAM_KEYS } from "./params";
import { SLOT_PRESET_IDS } from "./preset-vocabulary";
import { createDefaultRecipe, createKitDefaultRecipe } from "./recipe";
import { DEFAULT_SHADING } from "./shading";
import { ALL_AVAILABLE_CAPABILITIES } from "./slots";

import type { KitBaseId, KitManifest, KitMesh, KitPartSlot } from "./character-kit";
import type { PartRole } from "./mesh-data";
import type { MorphTargetName } from "./morph-names";

// ---------------------------------------------------------------- 합성 manifest(유효본)

const FILLER_SHA = "a".repeat(64);
const BODY_TRIANGLES = KIT_HIDEABLE_REGION_IDS.length * 10;

function morphsFor(roles: readonly PartRole[]): MorphTargetName[] {
  const names = new Set<MorphTargetName>();
  for (const role of roles) for (const name of KIT_MORPH_COVERAGE[role]) names.add(name);
  return [...names];
}

function baseMeshes(): KitMesh[] {
  return KIT_BASE_MESH_SPECS.map((spec) => {
    const roles = spec.role === undefined ? (spec.primitiveRoles ?? []) : [spec.role];
    return {
      node: spec.node,
      ...(spec.role === undefined ? {} : { role: spec.role }),
      ...(spec.material === undefined ? {} : { material: spec.material }),
      ...(spec.primitiveRoles === undefined ? {} : { primitiveRoles: [...spec.primitiveRoles] }),
      ...(spec.primitiveMaterials === undefined ? {} : { primitiveMaterials: [...spec.primitiveMaterials] }),
      triangles: spec.node === "TS_Body" ? BODY_TRIANGLES : 100,
      vertices: 60,
      skinned: true,
      morphs: morphsFor(roles),
    } satisfies KitMesh;
  });
}

function fileRef(path: string): { path: string; bytes: number; sha256: string } {
  return { path, bytes: 1000, sha256: FILLER_SHA };
}

function partMeshes(slot: KitPartSlot, name: string): KitMesh[] {
  const common = { triangles: 100, vertices: 60, skinned: true } as const;
  switch (slot) {
    case "hair":
      return [0, 1, 2].map((lod) => ({
        node: `TS_AuthoredHair_${name}_LOD${lod}`,
        role: "hair" as const,
        material: `ts_hair_${name}`,
        lod,
        ...common,
        morphs: morphsFor(["hair"]),
      }));
    case "irises": {
      const side = (prefix: string, role: PartRole, material: string): KitMesh[] =>
        ["L", "R"].map((s) => ({ node: `${prefix}_${s}`, role, material, ...common, morphs: morphsFor([role]) }));
      return [...side("TS_Iris", "iris", "ts_iris"), ...side("TS_Highlight", "eye-highlight", "ts_highlight")];
    }
    default: {
      const prefix = { top: "TS_Top", bottom: "TS_Bottom", shoes: "TS_Shoes", accessory: "TS_Accessory" }[slot];
      return [{ node: `${prefix}_${name}`, role: slot, material: `ts_${slot}_${name}`, ...common, morphs: morphsFor([slot]) }];
    }
  }
}

function validManifest(): Record<string, unknown> {
  const materials: Record<string, unknown> = {
    ts_skin_body: { role: "skin", tint: { mode: "recolor", colorKey: "skin" }, doubleSided: false },
    ts_skin_head: { role: "head", tint: { mode: "recolor", colorKey: "skin" }, doubleSided: false },
    ts_eye: { role: "eyeball", tint: { mode: "fixed", hex: "#f4f4f6" }, doubleSided: false },
    ts_teeth: { role: "teeth", tint: { mode: "fixed", hex: "#f2efe6" }, doubleSided: false },
    ts_tongue: { role: "tongue", tint: { mode: "fixed", hex: "#c46a6a" }, doubleSided: false },
    ts_lashes: { role: "lash", tint: { mode: "recolor", colorKey: "brow" }, doubleSided: true },
    ts_brow: { role: "brow", tint: { mode: "recolor", colorKey: "brow" }, doubleSided: true },
    ts_underwear: { role: "underwear", tint: { mode: "fixed", hex: "#e8e2da" }, doubleSided: false },
    ts_iris: { role: "iris", tint: { mode: "recolor", colorKey: "iris" }, doubleSided: false },
    ts_highlight: { role: "eye-highlight", tint: { mode: "fixed", hex: "#ffffff" }, doubleSided: false },
  };
  const parts: unknown[] = [];
  for (const slot of KIT_PART_SLOTS) {
    for (const name of SLOT_PRESET_IDS[slot]) {
      const colorKey = slot === "irises" ? "iris" : slot;
      if (slot === "hair") materials[`ts_hair_${name}`] = { role: "hair", tint: { mode: "recolor", colorKey: "hair" }, doubleSided: true };
      else if (slot !== "irises") materials[`ts_${slot}_${name}`] = { role: slot, tint: { mode: "recolor", colorKey }, doubleSided: false };
      parts.push({
        id: `${slot}/${name}`,
        slot,
        variants: {
          female: { file: fileRef(`parts/female/${slot}/${name}.glb`), meshes: partMeshes(slot, name), hides: slot === "top" ? ["torso"] : [] },
        },
        unavailable: { male: "남성 핏 미제작" },
      });
    }
  }
  const regionRanges = KIT_HIDEABLE_REGION_IDS.map((id, index) => ({ id, mesh: "TS_Body", indexStart: index * 30, indexCount: 30 }));
  return {
    schema: "toonstudio.character-kit/1",
    kitId: KIT_DEFAULT_ID,
    kitVersion: 1,
    displayName: "ToonStudio 키트 v1(테스트)",
    generatedAt: "2026-10-08",
    generator: { tool: "tools/blender/character_kit", blender: "5.2.1", command: ["build_character_kit.py", "--stage", "export-kit"] },
    coordinateSystem: { up: "+Y", forward: "+Z", unit: "m", handedness: "right", rest: "T-pose", rootScale: 1 },
    provenance: {
      summaryKo: "테스트용 합성 manifest",
      noticeFile: "NOTICE.md",
      sources: [
        {
          id: "hbm-1.4.1",
          name: "Blender Foundation Human Base Meshes Bundle",
          version: "1.4.1",
          url: "https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip",
          zipSha256: "811f43accbb31a88266d932f8f5563b2d13586fca0ba2693aad1f5fe582b3515",
          license: "CC0-1.0",
          derivative: true,
          changesKo: "멀티레스 레벨 1 적용, 목에서 몸/머리 분할.",
        },
        { id: "toonstudio-original", name: "ToonStudio 원본 디자인", license: "original", derivative: false, changesKo: "절차 생성한 원본 디자인." },
      ],
    },
    skeleton: {
      root: "Armature",
      joints: [...KIT_SKELETON_JOINTS],
      parents: { ...KIT_SKELETON_PARENTS },
      boneMap: { ...KIT_BONE_MAP },
      endBones: [...KIT_END_BONES],
    },
    materials,
    jointOffsets: { "param:height:+": { "mixamorig:Head": [0, 0.05, 0] } },
    bases: {
      female: {
        file: fileRef("bases/female.glb"),
        heightM: 1.64,
        boundsM: { min: [-0.86, 0, -0.12], max: [0.86, 1.64, 0.13] },
        meshes: baseMeshes(),
        bodyRegions: regionRanges,
      },
    },
    parts,
    defaults: {
      base: "female",
      slots: { ...KIT_DEFAULT_SLOTS },
      colors: { skin: "#f3d3bd", iris: "#5a3a2a", hair: "#2b1d16", brow: "#2b1d16", top: "#e8e8ee", bottom: "#3b4a6b", shoes: "#f5f5f5", accessory: "#c94f6b" },
    },
    slotCapabilities: { female: ALL_AVAILABLE_CAPABILITIES },
    physics: { mode: "static", chains: [], colliders: [] },
    budgets: structuredClone(KIT_BUDGET),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("객체가 아닙니다.");
  return value as Record<string, unknown>;
}

/** manifest를 복제해 mutate한 뒤 파싱 사유 전체를 돌려준다. */
function reasonsAfter(mutate: (manifest: Record<string, unknown>) => void): string {
  const manifest = validManifest();
  mutate(manifest);
  const result = kitManifestSchema.safeParse(manifest);
  return result.success ? "" : result.error.issues.map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`).join("\n");
}

function partOf(manifest: Record<string, unknown>, id: string): Record<string, unknown> {
  const parts = manifest.parts as Array<Record<string, unknown>>;
  const found = parts.find((part) => part.id === id);
  if (!found) throw new Error(`${id}가 없습니다.`);
  return found;
}

function femaleVariant(manifest: Record<string, unknown>, id: string): Record<string, unknown> {
  return asRecord(asRecord(partOf(manifest, id).variants).female);
}

// ---------------------------------------------------------------- 테스트

describe("contracts/character-kit 상수", () => {
  it("joint 68개는 고유하고 Mixamo 65 + TS_Jaw + TS_Eye.L/R이다", () => {
    expect(KIT_SKELETON_JOINTS).toHaveLength(KIT_JOINT_COUNT);
    expect(new Set(KIT_SKELETON_JOINTS).size).toBe(68);
    expect(KIT_SKELETON_JOINTS.filter((name) => name.startsWith("mixamorig:"))).toHaveLength(65);
    expect(KIT_SKELETON_JOINTS.slice(-3)).toEqual(["TS_Jaw", "TS_Eye.L", "TS_Eye.R"]);
    expect(KIT_SKELETON_JOINTS).toContain("mixamorig:LeftHandPinky4");
    expect(KIT_SKELETON_JOINTS).toContain("mixamorig:RightToe_End");
  });

  it("끝 본 13개와 매핑 55개가 68개를 정확히 나눈다", () => {
    expect(KIT_END_BONES).toHaveLength(13);
    expect(Object.keys(KIT_BONE_MAP)).toHaveLength(55);
    expect([...KIT_END_BONES, ...Object.keys(KIT_BONE_MAP)].sort()).toEqual([...KIT_SKELETON_JOINTS].sort());
    expect(KIT_END_BONES).toContain("mixamorig:HeadTop_End");
    expect(KIT_END_BONES.filter((name) => /Hand\w+4$/u.test(name))).toHaveLength(10);
  });

  it("boneMap은 계약 어휘 55본을 정확히 한 번씩 덮고 대표 매핑이 계약과 같다", () => {
    expect([...Object.values(KIT_BONE_MAP)].sort()).toEqual([...HUMANOID_BONE_NAMES].sort());
    expect(KIT_BONE_MAP["TS_Jaw"]).toBe("jaw");
    expect(KIT_BONE_MAP["TS_Eye.L"]).toBe("leftEye");
    expect(KIT_BONE_MAP["TS_Eye.R"]).toBe("rightEye");
    expect(KIT_BONE_MAP["mixamorig:Spine1"]).toBe("chest");
    expect(KIT_BONE_MAP["mixamorig:Spine2"]).toBe("upperChest");
    expect(KIT_BONE_MAP["mixamorig:LeftHandThumb1"]).toBe("leftThumbMetacarpal");
    expect(KIT_BONE_MAP["mixamorig:RightHandPinky3"]).toBe("rightLittleDistal");
    expect(KIT_BONE_MAP["mixamorig:LeftToeBase"]).toBe("leftToes");
  });

  it("부모 관계가 VRM 계약 부모와 일치하고 루트는 Hips 하나다", () => {
    const roots = KIT_SKELETON_JOINTS.filter((name) => KIT_SKELETON_PARENTS[name] === null);
    expect(roots).toEqual(["mixamorig:Hips"]);
    for (const [joint, vrm] of Object.entries(KIT_BONE_MAP)) {
      const parent = KIT_SKELETON_PARENTS[joint];
      if (parent === null || parent === undefined) {
        expect(HUMANOID_BONE_PARENTS[vrm]).toBeNull();
        continue;
      }
      const mapped = KIT_BONE_MAP[parent];
      expect(mapped, `${joint}의 부모 ${parent}는 매핑되어야 한다`).toBeDefined();
      expect(HUMANOID_BONE_PARENTS[vrm], joint).toBe(mapped);
    }
    // 끝 본의 부모는 항상 같은 계열의 매핑된 본이다
    for (const end of KIT_END_BONES) expect(KIT_SKELETON_PARENTS[end]).toBeTruthy();
    expect(KIT_SKELETON_PARENTS["TS_Jaw"]).toBe("mixamorig:Head");
    expect(KIT_SKELETON_PARENTS["mixamorig:HeadTop_End"]).toBe("mixamorig:Head");
  });

  it("morph 어휘는 64개이고 모두 계약 이름이다", () => {
    expect(KIT_MORPH_NAMES).toHaveLength(64);
    expect(new Set(KIT_MORPH_NAMES).size).toBe(64);
    expect(KIT_MORPH_NAMES.every((name) => isMorphTargetName(name))).toBe(true);
    expect(KIT_MORPH_NAMES.filter((name) => name.startsWith("param:"))).toHaveLength((BODY_PARAM_KEYS.length + FACE_PARAM_KEYS.length) * 2);
    expect(KIT_MORPH_NAMES.filter((name) => name.startsWith("facs:"))).toHaveLength(FACS_UNITS.length);
    expect(isMorphTargetName("ext:mouthRollUpper")).toBe(false);
  });

  it("역할별 필수 morph 커버리지가 계약 표와 같다", () => {
    for (const role of PART_ROLES) {
      expect(KIT_MORPH_COVERAGE[role].length, role).toBeGreaterThan(0);
      for (const name of KIT_MORPH_COVERAGE[role]) expect(KIT_MORPH_NAMES, `${role}:${name}`).toContain(name);
    }
    for (const role of ["skin", "underwear", "top", "bottom", "shoes"] as const) expect(KIT_MORPH_COVERAGE[role]).toHaveLength(18);
    expect(KIT_MORPH_COVERAGE.head).toHaveLength(54);
    expect(KIT_MORPH_COVERAGE.hair).toEqual(["param:height:+", "param:height:-", "param:legLength:+", "param:legLength:-", "param:neckLength:+", "param:neckLength:-", "param:headSize:+", "param:headSize:-"]);
    expect(KIT_MORPH_COVERAGE.accessory).toEqual(KIT_MORPH_COVERAGE.hair);
    expect(KIT_MORPH_COVERAGE.iris).toHaveLength(16);
    expect(KIT_MORPH_COVERAGE["eye-highlight"]).toEqual(KIT_MORPH_COVERAGE.iris);
    expect(KIT_MORPH_COVERAGE.lash).toContain("facs:eyeBlinkLeft");
    expect(KIT_MORPH_COVERAGE.teeth).toContain("facs:jawOpen");
    expect(KIT_MORPH_COVERAGE.tongue).toContain("facs:tongueOut");
  });

  it("정체성 슬롯 축은 얼굴 15축을 한 번씩 덮는다", () => {
    const axes = Object.values(KIT_SLOT_AXES).flat();
    expect([...axes].sort()).toEqual([...FACE_PARAM_KEYS].sort());
    expect(KIT_REQUIRED_JOINT_OFFSET_MORPHS).toHaveLength(14);
  });

  it("영역: 16개, 숨김 15개(head 제외), BODY_REGIONS 12개로 매핑된다", () => {
    expect(KIT_REGION_IDS).toHaveLength(16);
    expect(KIT_HIDEABLE_REGION_IDS).toHaveLength(15);
    expect([...KIT_HIDEABLE_REGION_IDS].sort()).toEqual(KIT_REGION_IDS.filter((id) => id !== "head").sort());
    expect(Object.keys(KIT_REGION_TO_BODY_REGION).sort()).toEqual([...KIT_REGION_IDS].sort());
    expect(new Set(Object.values(KIT_REGION_TO_BODY_REGION))).toEqual(new Set(BODY_REGIONS));
    expect(KIT_REGION_TO_BODY_REGION["pelvis"]).toBe("hips");
    expect(KIT_REGION_TO_BODY_REGION["forearm.L"]).toBe("leftArm");
  });

  it("irises 슬롯 허용 역할은 리드 결정 A-1(iris, eye-highlight, 선택 pupil)이다", () => {
    expect(KIT_PART_SLOT_ROLES.irises).toEqual(["iris", "eye-highlight", "pupil"]);
    expect(KIT_PART_SLOT_ROLES.hair).toEqual(["hair"]);
  });

  it("필수 파츠 집합은 리드 결정과 같고 모두 어휘 안이다", () => {
    expect(KIT_REQUIRED_PRESETS).toEqual(["hair/soft-bob", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"]);
    for (const id of KIT_REQUIRED_PRESETS) {
      const [slot, name] = id.split("/") as [KitPartSlot, string];
      expect(KIT_PART_SLOTS).toContain(slot);
      expect(SLOT_PRESET_IDS[slot] as readonly string[]).toContain(name);
    }
  });

  it("기본 슬롯은 createDefaultRecipe와 같고 키트 기본 레시피는 소스와 툰 셰이딩(램프 2단·림 끔, A-10)만 다르다", () => {
    expect(createDefaultRecipe().slots).toEqual(KIT_DEFAULT_SLOTS);
    const kit = createKitDefaultRecipe();
    expect(kit.source).toEqual({ kind: "kit", kitId: KIT_DEFAULT_ID, baseId: "female", kitVersion: 1 });
    const procedural = createDefaultRecipe();
    expect({ ...kit, source: null, shading: null }).toEqual({ ...procedural, source: null, shading: null });
    expect(kit.shading).toEqual({ ...procedural.shading, toon: { ...procedural.shading.toon, rampSteps: 2, rim: false } });
    // 절차 소스 기본 셰이딩은 그대로다
    expect(procedural.shading.toon).toMatchObject({ rampSteps: DEFAULT_SHADING.toon.rampSteps, rim: DEFAULT_SHADING.toon.rim });
    expect(createKitDefaultRecipe("male").source).toMatchObject({ baseId: "male" });
  });

  it("예산·확장 목록·실패 코드 상수", () => {
    expect(KIT_BUDGET.baseGlbMaxBytes).toBe(16 * 1024 * 1024);
    expect(KIT_BUDGET.partGlbMaxBytes).toBe(1.5 * 1024 * 1024);
    expect(KIT_BUDGET.totalMaxBytes).toBe(64 * 1024 * 1024);
    expect(KIT_BUDGET.maxMorphTargetsPerMesh).toBe(96);
    expect(KIT_ALLOWED_EXTENSIONS.some((name) => (KIT_FORBIDDEN_EXTENSIONS as readonly string[]).includes(name))).toBe(false);
    expect(KIT_ASSET_ROOT).toBe("/assets/characters/toonstudio-kit-v1");
    expect(new Set(KIT_FAILURE_CODES).size).toBe(KIT_FAILURE_CODES.length);
    expect(KIT_FAILURE_CODES.every((code) => code.startsWith("kit-"))).toBe(true);
  });

  it("kitGeometryKey는 베이스와 6개 파츠 슬롯만 반영한다", () => {
    const recipe = createKitDefaultRecipe();
    const key = kitGeometryKey(recipe);
    expect(key).toBe("base=female;hair=hair/soft-bob;top=top/tee;bottom=bottom/jeans;shoes=shoes/sneakers;accessory=-;irises=irises/round-large");
    expect(kitGeometryKey({ ...recipe, colors: { ...recipe.colors, hair: "#010203" }, body: { height: 0.4 }, expression: { jawOpen: 0.3 } } as typeof recipe)).toBe(key);
    expect(kitGeometryKey({ ...recipe, slots: { ...recipe.slots, expression: "expression/joy", pose: "pose/idle", eyes: "eyes/round" } })).toBe(key);
    expect(kitGeometryKey({ ...recipe, slots: { ...recipe.slots, hair: "hair/hime-cut" } })).not.toBe(key);
    expect(kitGeometryKey({ ...recipe, slots: { ...recipe.slots, accessory: "accessory/glasses" } })).not.toBe(key);
    expect(kitGeometryKey({ ...recipe, slots: { ...recipe.slots, irises: "irises/cat" } })).not.toBe(key);
    expect(kitGeometryKey(createKitDefaultRecipe("male"))).not.toBe(key);
    expect(kitGeometryKey(createDefaultRecipe()).startsWith("base=-;")).toBe(true);
  });
});

describe("contracts/character-kit manifest 스키마", () => {
  it("유효한 합성 manifest를 통과시킨다", () => {
    const result = parseKitManifest(validManifest());
    if (!result.ok) throw new Error(result.failure.reasonKo);
    expect(result.manifest.parts).toHaveLength(32);
    expect(result.manifest.bases.female?.bodyRegions).toHaveLength(15);
    expect(result.manifest.bases.male).toBeUndefined();
  });

  it("남성 베이스를 선언하면 필수 파츠 변형이 필요하다", () => {
    const reasons = reasonsAfter((manifest) => {
      const bases = asRecord(manifest.bases);
      bases.male = structuredClone(bases.female);
      asRecord(manifest.slotCapabilities).male = ALL_AVAILABLE_CAPABILITIES;
    });
    expect(reasons).toContain("필수 파츠 hair/soft-bob의 male 변형이 없습니다");
    expect(reasons).toContain("필수 파츠 irises/round-large의 male 변형이 없습니다");
  });

  it("알 수 없는 키·잘못된 상수는 거부한다(strict)", () => {
    expect(reasonsAfter((manifest) => void (manifest.extra = 1))).toContain("extra");
    expect(reasonsAfter((manifest) => void (manifest.schema = "toonstudio.character-kit/2"))).toContain("schema");
    expect(reasonsAfter((manifest) => void (manifest.kitId = "Bad Id"))).toContain("kitId");
    expect(reasonsAfter((manifest) => void (manifest.generatedAt = "2026/10/08"))).toContain("generatedAt");
    expect(reasonsAfter((manifest) => void (asRecord(manifest.coordinateSystem).rest = "A-pose"))).toContain("coordinateSystem");
  });

  it("joint·부모·boneMap이 계약 상수와 다르면 거부한다", () => {
    expect(reasonsAfter((manifest) => void (asRecord(manifest.skeleton).joints as string[]).pop())).toContain("정확히 68개");
    expect(
      reasonsAfter((manifest) => {
        const joints = asRecord(manifest.skeleton).joints as string[];
        joints[joints.length - 1] = "TS_Eye.X";
      }),
    ).toContain("joint 이름 집합이 계약과 다릅니다");
    expect(reasonsAfter((manifest) => void delete asRecord(asRecord(manifest.skeleton).boneMap)["TS_Jaw"])).toContain("boneMap이 계약");
    expect(reasonsAfter((manifest) => void (asRecord(asRecord(manifest.skeleton).parents)["TS_Jaw"] = "mixamorig:Hips"))).toContain("부모 관계가 계약");
    expect(reasonsAfter((manifest) => void (asRecord(manifest.skeleton).endBones as string[]).pop())).toContain("endBones");
  });

  it("필수 morph 커버리지가 모자라면 누락 목록과 함께 거부한다", () => {
    const reasons = reasonsAfter((manifest) => {
      const head = (asRecord(asRecord(manifest.bases).female).meshes as KitMesh[]).find((mesh) => mesh.node === "TS_Head");
      if (!head) throw new Error("TS_Head");
      head.morphs = head.morphs.filter((name) => name !== "param:neckLength:+" && name !== "facs:jawOpen");
    });
    expect(reasons).toContain("TS_Head: 필수 morph 2개가 없습니다");
    expect(reasons).toContain("param:neckLength:+");
    expect(reasonsAfter((manifest) => {
      const hair = femaleVariant(manifest, "hair/soft-bob").meshes as KitMesh[];
      const lod2 = hair[2];
      if (!lod2) throw new Error("LOD2");
      lod2.morphs = lod2.morphs.filter((name) => name !== "param:headSize:-");
    })).toContain("TS_AuthoredHair_soft-bob_LOD2: 필수 morph 1개가 없습니다");
  });

  it("ext:* 등 어휘 밖 morph와 중복 morph는 거부한다", () => {
    expect(
      reasonsAfter((manifest) => {
        const body = (asRecord(asRecord(manifest.bases).female).meshes as KitMesh[])[0];
        (body?.morphs as string[] | undefined)?.push("ext:mouthRollUpper");
      }),
    ).toContain("계약 어휘");
    expect(
      reasonsAfter((manifest) => {
        const body = (asRecord(asRecord(manifest.bases).female).meshes as KitMesh[])[0];
        body?.morphs.push("param:height:+");
      }),
    ).toContain("중복");
  });

  it("_Outline 셸과 비스키닝 선언을 거부한다", () => {
    const reasons = reasonsAfter((manifest) => {
      const meshes = femaleVariant(manifest, "top/tee").meshes as KitMesh[];
      const first = meshes[0];
      if (!first) throw new Error("mesh");
      first.node = "TS_Top_tee_Outline";
    });
    expect(reasons).toContain("_Outline");
    expect(
      reasonsAfter((manifest) => {
        const first = (femaleVariant(manifest, "top/tee").meshes as Array<Record<string, unknown>>)[0];
        if (first) first.skinned = false;
      }),
    ).toContain("skinned");
  });

  it("irises 파츠: 허용 역할 밖은 거부하고 eye-highlight는 필수, pupil은 선택이다", () => {
    expect(
      reasonsAfter((manifest) => {
        const meshes = femaleVariant(manifest, "irises/cat").meshes as KitMesh[];
        const first = meshes[0];
        if (first) {
          first.role = "hair";
          first.material = "ts_hair_soft-bob";
        }
      }),
    ).toContain("허용되지 않는 역할 hair");
    expect(
      reasonsAfter((manifest) => {
        const variant = femaleVariant(manifest, "irises/cat");
        variant.meshes = (variant.meshes as KitMesh[]).filter((mesh) => mesh.role !== "eye-highlight");
      }),
    ).toContain("필수 역할 eye-highlight");
    // pupil(선택) 추가는 통과
    expect(
      reasonsAfter((manifest) => {
        (manifest.materials as Record<string, unknown>).ts_pupil = { role: "pupil", tint: { mode: "fixed", hex: "#101010" }, doubleSided: false };
        const variant = femaleVariant(manifest, "irises/round-small");
        const pupils = ["L", "R"].map((side) => ({
          node: `TS_Pupil_${side}`,
          role: "pupil",
          material: "ts_pupil",
          triangles: 20,
          vertices: 12,
          skinned: true,
          morphs: morphsFor(["pupil"]),
        }));
        (variant.meshes as unknown[]).push(...pupils);
      }),
    ).toBe("");
    // 홍채 메시는 좌/우 쌍이어야 한다
    expect(
      reasonsAfter((manifest) => {
        const variant = femaleVariant(manifest, "irises/cat");
        variant.meshes = (variant.meshes as KitMesh[]).filter((mesh) => mesh.node !== "TS_Iris_R");
      }),
    ).toContain("좌/우 메시 2개");
  });

  it("헤어: 이름의 style·LOD가 id·lod 필드와 같아야 하고 LOD0이 필요하다", () => {
    expect(
      reasonsAfter((manifest) => {
        const first = (femaleVariant(manifest, "hair/hime-cut").meshes as KitMesh[])[0];
        if (first) first.node = "TS_AuthoredHair_soft-bob_LOD0";
      }),
    ).toContain("TS_AuthoredHair_hime-cut_LOD<n>");
    expect(
      reasonsAfter((manifest) => {
        const meshes = femaleVariant(manifest, "hair/hime-cut").meshes as KitMesh[];
        const second = meshes[1];
        if (second) second.lod = 2;
      }),
    ).toContain("lod 필드");
    expect(
      reasonsAfter((manifest) => {
        const variant = femaleVariant(manifest, "hair/hime-cut");
        variant.meshes = (variant.meshes as KitMesh[]).filter((mesh) => mesh.lod !== 0);
      }),
    ).toContain("LOD0 메시가 없습니다");
  });

  it("상의·하의 등 메시 이름은 TS_<슬롯>_<이름> 규칙(TS_Accessory_ 포함)을 따른다", () => {
    const reasons = reasonsAfter((manifest) => {
      const first = (femaleVariant(manifest, "accessory/ribbon").meshes as KitMesh[])[0];
      if (first) first.node = "TS_Acc_ribbon";
    });
    expect(reasons).toContain("TS_Accessory_ribbon");
  });

  it("어휘 밖 파츠 id·누락 프리셋·중복 id·필수 파츠 누락을 거부한다", () => {
    expect(reasonsAfter((manifest) => void (partOf(manifest, "hair/twin-tail").id = "hair/mullet"))).toContain("SLOT_PRESET_IDS.hair");
    expect(reasonsAfter((manifest) => void (manifest.parts as unknown[]).pop())).toContain("parts에 없습니다");
    expect(reasonsAfter((manifest) => void (partOf(manifest, "hair/twin-tail").id = "hair/soft-bob"))).toContain("파츠 id가 중복");
    const required = reasonsAfter((manifest) => {
      const part = partOf(manifest, "shoes/sneakers");
      part.variants = {};
      part.unavailable = { female: "미제작", male: "미제작" };
    });
    expect(required).toContain("필수 파츠 shoes/sneakers의 female 변형이 없습니다");
  });

  it("변형이 없는 베이스는 한글 unavailable 사유가 필요하다", () => {
    const withoutVariant = (reason: string | undefined) => (manifest: Record<string, unknown>): void => {
      const part = partOf(manifest, "hair/twin-tail");
      part.variants = {};
      part.unavailable = reason === undefined ? {} : { female: reason };
    };
    expect(reasonsAfter(withoutVariant(undefined))).toContain("hair/twin-tail: female 변형이 없으면 unavailable.female에 한글 사유가 필요합니다");
    expect(reasonsAfter(withoutVariant(""))).toContain("한글 사유");
    expect(reasonsAfter(withoutVariant("not available"))).toContain("한글 사유");
    expect(reasonsAfter(withoutVariant("트윈테일 미제작"))).toBe("");
    // 변형이 있으면서 사유도 있으면 모순
    expect(reasonsAfter((manifest) => void (asRecord(partOf(manifest, "hair/twin-tail").unavailable).female = "미제작"))).toContain("미제공 사유도 선언");
    // bases에 없는 베이스(male)에 대한 변형은 거부
    expect(
      reasonsAfter((manifest) => {
        const part = partOf(manifest, "hair/twin-tail");
        asRecord(part.variants).male = structuredClone(asRecord(part.variants).female);
      }),
    ).toContain("bases에 없는 베이스(male)");
  });

  it("몸 영역 범위는 TS_Body 인덱스 버퍼를 빈틈·겹침 없이 분할해야 한다", () => {
    const gap = reasonsAfter((manifest) => {
      const regions = asRecord(asRecord(manifest.bases).female).bodyRegions as Array<Record<string, number>>;
      const second = regions[1];
      if (second) second.indexStart = 31;
    });
    expect(gap).toContain("kit-region-range-invalid");
    const short = reasonsAfter((manifest) => {
      const regions = asRecord(asRecord(manifest.bases).female).bodyRegions as Array<Record<string, number>>;
      const last = regions[regions.length - 1];
      if (last) last.indexCount = 27;
    });
    expect(short).toContain("kit-region-range-invalid");
    expect(reasonsAfter((manifest) => void (asRecord(asRecord(manifest.bases).female).bodyRegions as unknown[]).pop())).toContain("정확히 한 번씩");
    // 숨김은 head를 허용하지 않는다
    expect(reasonsAfter((manifest) => void ((femaleVariant(manifest, "top/tee").hides as string[]).push("head")))).toContain("hides");
    expect(reasonsAfter((manifest) => void (femaleVariant(manifest, "hair/soft-bob").hides = ["torso"]))).toContain("몸 영역을 숨길 수 없습니다");
  });

  it("베이스 메시는 계약의 9개 이름·역할·재질과 같아야 한다", () => {
    expect(reasonsAfter((manifest) => void (asRecord(asRecord(manifest.bases).female).meshes as unknown[]).pop())).toContain("TS_Underwear가 선언되지 않았습니다");
    expect(
      reasonsAfter((manifest) => {
        const eye = (asRecord(asRecord(manifest.bases).female).meshes as KitMesh[]).find((mesh) => mesh.node === "TS_Eye_L");
        if (eye) eye.material = "ts_eye_l";
      }),
    ).toContain("TS_Eye_L: 역할·재질이 계약");
    expect(
      reasonsAfter((manifest) => {
        const meshes = asRecord(asRecord(manifest.bases).female).meshes as KitMesh[];
        meshes.push({ ...structuredClone(meshes[0] as KitMesh), node: "TS_Extra" });
      }),
    ).toContain("계약에 없는 베이스 메시");
  });

  it("재질 선언: 없는 재질·역할 불일치·역할별 틴트 규칙 위반을 거부한다", () => {
    expect(reasonsAfter((manifest) => void delete (manifest.materials as Record<string, unknown>).ts_underwear)).toContain("materials에 선언되지 않았습니다");
    expect(reasonsAfter((manifest) => void ((manifest.materials as Record<string, Record<string, unknown>>).ts_skin_body!.role = "head"))).toContain("재질 'ts_skin_body'의 역할");
    expect(
      reasonsAfter((manifest) => void ((manifest.materials as Record<string, Record<string, unknown>>).ts_eye!.tint = { mode: "recolor", colorKey: "skin" })),
    ).toContain("fixed여야 합니다");
    expect(
      reasonsAfter((manifest) => void ((manifest.materials as Record<string, Record<string, unknown>>).ts_skin_body!.tint = { mode: "recolor", colorKey: "hair" })),
    ).toContain("recolor/skin");
    expect(reasonsAfter((manifest) => void ((manifest.materials as Record<string, Record<string, unknown>>).ts_iris!.tint = { mode: "fixed", hex: "#ABCDEF" }))).toContain("hex");
  });

  it("한 역할에 재질이 둘 이상이면 거부한다", () => {
    const reasons = reasonsAfter((manifest) => {
      (manifest.materials as Record<string, unknown>).ts_iris_alt = { role: "iris", tint: { mode: "recolor", colorKey: "iris" }, doubleSided: false };
      const meshes = femaleVariant(manifest, "irises/cat").meshes as KitMesh[];
      const right = meshes.find((mesh) => mesh.node === "TS_Iris_R");
      if (right) right.material = "ts_iris_alt";
    });
    expect(reasons).toContain("kit-material-multiple");
  });

  it("provenance: 허용 라이선스·https·zipSha256·한글 변경 내용", () => {
    const sources = (manifest: Record<string, unknown>): Array<Record<string, unknown>> => asRecord(manifest.provenance).sources as Array<Record<string, unknown>>;
    expect(reasonsAfter((manifest) => void (sources(manifest)[0]!.license = "MIT"))).toContain("license");
    expect(reasonsAfter((manifest) => void (sources(manifest)[0]!.url = "http://example.com/x.zip"))).toContain("https URL");
    expect(reasonsAfter((manifest) => void delete sources(manifest)[0]!.zipSha256)).toContain("zipSha256이 필요");
    expect(reasonsAfter((manifest) => void (sources(manifest)[1]!.changesKo = "procedural"))).toContain("한글 변경 내용");
    expect(reasonsAfter((manifest) => void (asRecord(manifest.provenance).sources = []))).toContain("provenance.sources");
  });

  it("관절 오프셋: 어휘 밖 키·없는 본·과대 크기를 거부한다", () => {
    expect(reasonsAfter((manifest) => void (asRecord(manifest.jointOffsets)["param:bogus:+"] = {}))).toContain("morph 어휘에 없습니다");
    expect(reasonsAfter((manifest) => void (asRecord(asRecord(manifest.jointOffsets)["param:height:+"])["mixamorig:Nope"] = [0, 0, 0]))).toContain("skeleton.joints에 없습니다");
    expect(reasonsAfter((manifest) => void (asRecord(asRecord(manifest.jointOffsets)["param:height:+"])["mixamorig:Head"] = [0, 0.4, 0]))).toContain("0.3 m");
  });

  it("physics는 정적(빈 체인·콜라이더)이어야 하고 budgets는 상수 사본이어야 한다", () => {
    expect(reasonsAfter((manifest) => void (asRecord(manifest.physics).chains = [{}]))).toContain("physics");
    expect(reasonsAfter((manifest) => void (asRecord(manifest.physics).mode = "pbd"))).toContain("physics");
    expect(reasonsAfter((manifest) => void (asRecord(manifest.budgets).totalMaxBytes = 1))).toContain("KIT_BUDGET");
  });

  it("파일: 경로 이탈·용량 초과·대소문자 중복을 거부한다", () => {
    expect(reasonsAfter((manifest) => void (asRecord(asRecord(asRecord(manifest.bases).female).file).path = "../female.glb"))).toContain("상대 경로");
    expect(reasonsAfter((manifest) => void (asRecord(asRecord(asRecord(manifest.bases).female).file).path = "/abs/female.glb"))).toContain("상대 경로");
    expect(reasonsAfter((manifest) => void (asRecord(asRecord(asRecord(manifest.bases).female).file).path = "bases\\female.glb"))).toContain("상대 경로");
    expect(reasonsAfter((manifest) => void (asRecord(asRecord(asRecord(manifest.bases).female).file).bytes = KIT_BUDGET.baseGlbMaxBytes + 1))).toContain("베이스 GLB");
    expect(reasonsAfter((manifest) => void (femaleVariant(manifest, "top/tee").file = { path: "parts/female/top/tee.glb", bytes: KIT_BUDGET.partGlbMaxBytes + 1, sha256: FILLER_SHA }))).toContain("파츠 GLB");
    expect(reasonsAfter((manifest) => void (asRecord(asRecord(asRecord(manifest.bases).female).file).sha256 = "XYZ"))).toContain("sha256");
    expect(
      reasonsAfter((manifest) => {
        femaleVariant(manifest, "top/hoodie").file = { path: "parts/female/top/TEE.glb", bytes: 1000, sha256: FILLER_SHA };
      }),
    ).toContain("대소문자만 다른");
    // 총합 64 MiB 초과(각 파일은 한도 안): 두 베이스(서로 다른 경로)와 모든 파츠 변형을 각자의 한도까지 채운다
    expect(
      reasonsAfter((manifest) => {
        const bases = asRecord(manifest.bases);
        bases.male = structuredClone(bases.female);
        asRecord(asRecord(bases.male).file).path = "bases/male.glb";
        for (const base of Object.values(bases)) asRecord(asRecord(base).file).bytes = KIT_BUDGET.baseGlbMaxBytes;
        for (const part of manifest.parts as Array<Record<string, unknown>>) {
          for (const variant of Object.values(asRecord(part.variants))) asRecord(asRecord(variant).file).bytes = KIT_BUDGET.partGlbMaxBytes;
        }
      }),
    ).toContain("키트 고유 파일 합계");
  });

  it("여성 베이스 필수·기본 베이스·slotCapabilities 정합", () => {
    expect(reasonsAfter((manifest) => void delete asRecord(manifest.bases).female)).toContain("여성 베이스(female)는 필수");
    expect(reasonsAfter((manifest) => void (asRecord(manifest.defaults).base = "male"))).toContain("defaults.base");
    expect(reasonsAfter((manifest) => void delete asRecord(manifest.slotCapabilities).female)).toContain("slotCapabilities.female 선언이 없습니다");
    expect(reasonsAfter((manifest) => void (asRecord(manifest.slotCapabilities).male = ALL_AVAILABLE_CAPABILITIES))).toContain("bases에 없는 베이스(male)");
  });

  it("slotCapabilities의 unavailablePresets를 수용한다", () => {
    const manifest = validManifest();
    asRecord(manifest.slotCapabilities).female = {
      ...ALL_AVAILABLE_CAPABILITIES,
      hair: { status: "partial", reasonKo: "제공 6/7종, 미제공: twin-tail", unavailablePresets: { "hair/twin-tail": "트윈테일 미제작" } },
    };
    expect(kitManifestSchema.safeParse(manifest).success).toBe(true);
    asRecord(asRecord(manifest.slotCapabilities).female).hair = { status: "partial", unavailablePresets: { "not-a-preset": "x" } };
    expect(kitManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("parseKitManifest 실패는 kit-manifest-invalid와 한글 사유(최대 5개 이슈)다", () => {
    const result = parseKitManifest({ ...validManifest(), kitVersion: 0, kitId: "X", displayName: "" }, 11);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("kit-manifest-invalid");
    expect(result.failure.reasonKo).toMatch(/키트 manifest 형식이 올바르지 않습니다/u);
    expect(result.failure.at).toBe(11);
    expect(parseKitManifest(null).ok).toBe(false);
    expect(parseKitManifest([]).ok).toBe(false);
  });

  it("KitManifest 타입은 파싱 결과와 호환된다", () => {
    const result = parseKitManifest(validManifest());
    if (!result.ok) throw new Error(result.failure.reasonKo);
    const manifest: KitManifest = result.manifest;
    const baseId: KitBaseId = manifest.defaults.base;
    expect(baseId).toBe("female");
  });
});
