import { describe, expect, it } from "vitest";

import { HUMANOID_BONE_NAMES, HUMANOID_BONE_PARENTS, PART_ROLES } from "../../contracts";

import { KIT_BONE_MAP, KIT_END_BONE_NAMES, KIT_JOINT_NAMES, KIT_PRIMITIVE_SPLITS, UNDERWEAR_IS_SUBSTITUTED, UNDERWEAR_ROLE, buildBoneMap, canonicalJointName, compareSkeletonToKit, isKitMeshName, isOutlineShellName, resolveMeshRole, stripMeshSuffix } from "./kit-roles";

describe("키트 스켈레톤 표", () => {
  it("관절은 68개, 끝 본은 13개, 매핑은 정확히 55개이고 서로 겹치지 않는다", () => {
    expect(KIT_JOINT_NAMES).toHaveLength(68);
    expect(new Set(KIT_JOINT_NAMES).size).toBe(68);
    expect(KIT_END_BONE_NAMES).toHaveLength(13);
    expect(Object.keys(KIT_BONE_MAP)).toHaveLength(55);
    for (const end of KIT_END_BONE_NAMES) expect(KIT_BONE_MAP[end]).toBeUndefined();
  });

  it("계약의 휴머노이드 본 55개를 각각 정확히 한 번씩 쓴다", () => {
    const values = Object.values(KIT_BONE_MAP);
    expect(new Set(values).size).toBe(55);
    expect([...values].sort()).toEqual([...HUMANOID_BONE_NAMES].sort());
  });

  it("계약 예시: Spine1→chest, Spine2→upperChest, LeftHandThumb1→leftThumbMetacarpal, LeftToeBase→leftToes, TS_Jaw→jaw", () => {
    expect(KIT_BONE_MAP["mixamorig:Spine1"]).toBe("chest");
    expect(KIT_BONE_MAP["mixamorig:Spine2"]).toBe("upperChest");
    expect(KIT_BONE_MAP["mixamorig:LeftHandThumb1"]).toBe("leftThumbMetacarpal");
    expect(KIT_BONE_MAP["mixamorig:RightHandPinky3"]).toBe("rightLittleDistal");
    expect(KIT_BONE_MAP["mixamorig:LeftToeBase"]).toBe("leftToes");
    expect(KIT_BONE_MAP["TS_Jaw"]).toBe("jaw");
    expect(KIT_BONE_MAP["TS_Eye.L"]).toBe("leftEye");
    expect(KIT_BONE_MAP["TS_Eye.R"]).toBe("rightEye");
  });

  it("매핑된 본의 부모 관계가 계약 HUMANOID_BONE_PARENTS와 모순되지 않게 이름 체계가 대칭이다", () => {
    // 이름 체계 점검: 왼쪽 본은 모두 left*, 오른쪽은 right*
    for (const [joint, bone] of Object.entries(KIT_BONE_MAP)) {
      if (joint.includes("Left")) expect(bone.startsWith("left")).toBe(true);
      if (joint.includes("Right")) expect(bone.startsWith("right")).toBe(true);
      expect(HUMANOID_BONE_PARENTS[bone] !== undefined).toBe(true);
    }
  });

  it("buildBoneMap: 키트 68관절 중 55개 매핑·13개 미매핑, Orion 눈 별칭, mixamorig1 접두 변형", () => {
    const result = buildBoneMap(KIT_JOINT_NAMES);
    expect(Object.keys(result.boneMap)).toHaveLength(55);
    expect([...result.unmapped].sort()).toEqual([...KIT_END_BONE_NAMES].sort());
    expect(result.duplicates).toEqual([]);
    const legacy = buildBoneMap(["mixamorig:Hips", "TS_OrionEye.L", "TS_OrionEye.R", "mixamorig1:Head", "Armature_extra"]);
    expect(legacy.boneMap).toEqual({ "mixamorig:Hips": "hips", "TS_OrionEye.L": "leftEye", "TS_OrionEye.R": "rightEye", "mixamorig1:Head": "head" });
    expect(legacy.unmapped).toEqual(["Armature_extra"]);
    expect(canonicalJointName("mixamorig12:Spine")).toBe("mixamorig:Spine");
  });

  it("같은 휴머노이드 본으로 가는 이름이 둘이면 첫 번째만 쓰고 중복을 알린다", () => {
    const result = buildBoneMap(["mixamorig:Head", "mixamorig1:Head"]);
    expect(Object.keys(result.boneMap)).toEqual(["mixamorig:Head"]);
    expect(result.duplicates).toEqual(["mixamorig1:Head"]);
  });

  it("compareSkeletonToKit: 정확히 같음 / 누락·여분 / 레거시(Orion 67관절)", () => {
    expect(compareSkeletonToKit(KIT_JOINT_NAMES)).toMatchObject({ exact: true, missing: [], extra: [], looksLikeKit: true });
    const withoutJaw = KIT_JOINT_NAMES.filter((name) => name !== "TS_Jaw");
    expect(compareSkeletonToKit(withoutJaw)).toMatchObject({ exact: false, missing: ["TS_Jaw"], extra: [] });
    const orion = [...KIT_JOINT_NAMES.filter((name) => !name.startsWith("TS_")), "TS_OrionEye.L", "TS_OrionEye.R"];
    const comparison = compareSkeletonToKit(orion);
    expect(comparison.exact).toBe(false);
    expect([...comparison.missing].sort()).toEqual(["TS_Eye.L", "TS_Eye.R", "TS_Jaw"].sort());
    expect(comparison.extra).toEqual(["TS_OrionEye.L", "TS_OrionEye.R"]);
    expect(compareSkeletonToKit(["a", "b"]).looksLikeKit).toBe(false);
  });
});

describe("resolveMeshRole", () => {
  it("키트 이름 규칙(계약 §3.4~3.5)", () => {
    const cases: Array<[string, string, string]> = [
      ["TS_Body", "skin", "recolor"],
      ["TS_Head", "head", "recolor"],
      ["TS_Eye_L", "eyeball", "fixed"],
      ["TS_Eye_R", "eyeball", "fixed"],
      ["TS_Iris_L", "iris", "recolor"],
      ["TS_Pupil_R", "pupil", "recolor"],
      ["TS_Highlight_L", "eye-highlight", "fixed"],
      ["TS_Highlight_R", "eye-highlight", "fixed"],
      ["TS_Mouth_teeth", "teeth", "fixed"],
      ["TS_Mouth_tongue", "tongue", "fixed"],
      ["TS_Mouth", "teeth", "fixed"],
      ["TS_Lashes", "lash", "recolor"],
      ["TS_Brow_L", "brow", "recolor"],
      ["TS_AuthoredHair_soft-bob_LOD0", "hair", "recolor"],
      ["TS_AuthoredHair_twin-tail_LOD2", "hair", "recolor"],
      ["TS_Top_tee", "top", "recolor"],
      ["TS_Bottom_jeans", "bottom", "recolor"],
      ["TS_Shoes_sneakers", "shoes", "recolor"],
      ["TS_Accessory_headphones", "accessory", "recolor"],
    ];
    for (const [name, role, tint] of cases) {
      expect(resolveMeshRole(name), name).toEqual({ role, source: "kit-name", tint });
    }
  });

  it("TS_Acc_ 약어와 TS_Accessory_headphones가 head로 잘못 잡히지 않는다(키트 규칙이 먼저)", () => {
    expect(resolveMeshRole("TS_Accessory_headphones").role).toBe("accessory");
    expect(resolveMeshRole("TS_Acc_headphones").source).toBe("legacy-name");
  });

  it("underwear는 계약 역할(underwear)을 고정색으로 쓰고 다른 역할로 대신하지 않는다", () => {
    const resolved = resolveMeshRole("TS_Underwear");
    expect(resolved.tint).toBe("fixed");
    expect(resolved.role).toBe("underwear");
    expect(UNDERWEAR_ROLE).toBe("underwear");
    expect(UNDERWEAR_IS_SUBSTITUTED).toBe(false);
    expect(PART_ROLES.includes(UNDERWEAR_ROLE)).toBe(true);
  });

  it("분할 접미(_primitive<i>)와 _Outline 접미는 떼고 판단한다", () => {
    expect(resolveMeshRole("TS_Mouth_primitive0").role).toBe("teeth");
    expect(stripMeshSuffix("TS_Top_tee_Outline")).toBe("TS_Top_tee");
    expect(stripMeshSuffix("TS_Mouth_primitive1")).toBe("TS_Mouth");
    expect(isOutlineShellName("TS_Top_tee_Outline")).toBe(true);
    expect(isOutlineShellName("TS_Top_tee")).toBe(false);
    expect(isKitMeshName("TS_Top_tee_Outline")).toBe(true);
    expect(isKitMeshName("Avatar_Orion_Body")).toBe(false);
  });

  it("레거시 이름은 부분 문자열로 추정하고 source를 legacy-name으로 표시한다", () => {
    const cases: Array<[string, string]> = [
      ["Avatar_Orion_Body", "skin"],
      ["TS_Orion_Brow_L", "brow"],
      ["TS_Orion_EyePanel_L", "eyeball"],
      ["TS_Orion_Pupil_R", "pupil"],
      ["TS_ReferenceHead", "head"],
      ["TS_ReferenceNeck", "skin"],
      ["TS_ReferenceBust", "top"],
      ["TS_ReferenceEye_L", "eyeball"],
    ];
    for (const [name, role] of cases) expect(resolveMeshRole(name), name).toEqual({ role, source: "legacy-name", tint: "legacy" });
  });

  it("추정 못 한 이름은 accessory(fallback)로 두고, --role 덮어쓰기가 가장 우선한다", () => {
    expect(resolveMeshRole("Mystery")).toEqual({ role: "accessory", source: "fallback", tint: "legacy" });
    expect(resolveMeshRole("Mystery", { Mystery: "hair" })).toEqual({ role: "hair", source: "override", tint: "legacy" });
    expect(resolveMeshRole("TS_Body", { TS_Body: "top" }).role).toBe("top");
    expect(resolveMeshRole("X_primitive0", { X: "shoes" }).role).toBe("shoes");
    expect(resolveMeshRole("U", { U: "underwear" }).role).toBe(UNDERWEAR_ROLE);
  });

  it("TS_Mouth 분할 규칙은 프리미티브 순서대로 teeth·tongue다", () => {
    expect(KIT_PRIMITIVE_SPLITS.TS_Mouth?.map((rule) => rule.suffix)).toEqual(["teeth", "tongue"]);
    for (const rule of KIT_PRIMITIVE_SPLITS.TS_Mouth ?? []) expect(resolveMeshRole(`TS_Mouth_${rule.suffix}`).source).toBe("kit-name");
  });
});
