/**
 * 키트 계약 문서(authored-kit-spec.md) 15절 부록의 "실행으로 확인했다"는 주장과 12.1 N2·N7을 이 저장소 코드로 다시 고정한다.
 * 문서가 코드와 어긋나면 이 테스트가 먼저 깨진다(코드가 기준).
 */
import { describe, expect, it } from "vitest";

import { FINGER_BONE_NAMES, HUMANOID_BONE_NAMES, KIT_BONE_MAP, KIT_END_BONES, KIT_SKELETON_JOINTS, REQUIRED_HUMANOID_BONES } from "../../contracts";

import { classifyBoneNames, guessHumanoidBone } from "./bone-name-mapping";
import { classifyMeshName } from "./mesh-role-mapping";

describe("authored/kit 이름 규칙 — 본 매핑(계약 C10·N2·N3·N5)", () => {
  it("추정만으로 68개 중 55개가 매핑되고 jaw도 잡힌다(TS_Jaw 토큰 tsjaw는 CENTER_TOKENS에 있다 — 계약 N2의 선택 항목 반영)", () => {
    const result = classifyBoneNames(KIT_SKELETON_JOINTS);
    expect(KIT_SKELETON_JOINTS).toHaveLength(68);
    expect(Object.keys(result.mapped)).toHaveLength(HUMANOID_BONE_NAMES.length);
    expect(result.all.missing).toEqual([]);
    expect(guessHumanoidBone("TS_Jaw")).toBe("jaw");
    // 미매핑 13개 = 끝 본 13개뿐
    expect(result.unmapped.map((entry) => entry.name).sort()).toEqual([...KIT_END_BONES].sort());
  });

  it("추정 결과가 계약 상수 KIT_BONE_MAP와 완전히 같다(눈·Spine·손가락·발끝·턱 포함)", () => {
    const guessed = classifyBoneNames(KIT_SKELETON_JOINTS).mapped;
    expect(guessed).toEqual(KIT_BONE_MAP);
    expect(guessHumanoidBone("TS_Eye.L")).toBe("leftEye");
    expect(guessHumanoidBone("TS_Eye.R")).toBe("rightEye");
    expect(guessHumanoidBone("mixamorig:Spine1")).toBe("chest");
    expect(guessHumanoidBone("mixamorig:Spine2")).toBe("upperChest");
    expect(guessHumanoidBone("mixamorig:LeftHandThumb1")).toBe("leftThumbMetacarpal");
    expect(guessHumanoidBone("mixamorig:LeftToeBase")).toBe("leftToes");
    expect(guessHumanoidBone("mixamorig:HeadTop_End")).toBeNull();
    expect(guessHumanoidBone("mixamorig:LeftHandIndex4")).toBeNull();
  });

  it("kit.json의 boneMap을 override로 주면 55본이 빠짐없이 매핑된다", () => {
    const result = classifyBoneNames(KIT_SKELETON_JOINTS, KIT_BONE_MAP);
    expect(Object.keys(result.mapped)).toHaveLength(HUMANOID_BONE_NAMES.length);
    expect(result.all.missing).toEqual([]);
    expect(result.required.missing).toEqual([]);
    expect(result.fingers.covered).toHaveLength(FINGER_BONE_NAMES.length);
    expect(result.required.covered).toHaveLength(REQUIRED_HUMANOID_BONES.length);
    expect(result.overridden).toHaveLength(55);
    expect(result.unmapped.map((entry) => entry.name).sort()).toEqual([...KIT_END_BONES].sort());
  });
});

describe("authored/kit 이름 규칙 — 메시 이름(계약 N7·N8)", () => {
  it("v0 약어 TS_Acc_headphones는 키워드 규칙에서 head로 오분류되고 TS_Accessory_ 접두가 이를 막는다", () => {
    expect(classifyMeshName("TS_Acc_headphones").role).toBe("head");
    expect(classifyMeshName("TS_Acc_glasses").role).toBe("accessory");
    expect(classifyMeshName("TS_Acc_ribbon").role).toBe("accessory");
    expect(classifyMeshName("TS_Accessory_headphones").role).toBe("accessory");
  });

  it("TS_Mouth와 TS_Underwear: 보강 전에는 null이었던 이름이 이제 역할을 얻는다", () => {
    expect(classifyMeshName("TS_Underwear").role).toBe("underwear");
    expect(classifyMeshName("TS_Mouth_primitive0").role).toBe("teeth");
    expect(classifyMeshName("TS_Mouth_primitive1").role).toBe("tongue");
    // 쪼개지지 않은 TS_Mouth는 여전히 이름만으로 정할 수 없다(kit.json의 primitiveRoles가 기준)
    expect(classifyMeshName("TS_Mouth").role).toBeNull();
  });
});
