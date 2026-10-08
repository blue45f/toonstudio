import { describe, expect, it } from "vitest";

import { chooseLodForTriangleBudget, classifyMeshName, classifyMeshRoles, mapMeshRoles, selectHairLod } from "./mesh-role-mapping";

describe("authored/mesh-role-mapping", () => {
  it("TS_AuthoredHair_<style>_LOD<n> 규약과 _Outline·_primitive 접미를 해석한다", () => {
    expect(classifyMeshName("TS_AuthoredHair_short-layered_LOD1")).toMatchObject({ role: "hair", lod: 1, hairStyle: "short-layered", outline: false });
    expect(classifyMeshName("TS_AuthoredHair_soft-bob_LOD0_Outline")).toMatchObject({ role: "hair", lod: 0, outline: true, baseName: "TS_AuthoredHair_soft-bob_LOD0" });
    expect(classifyMeshName("Avatar_Orion_Body_primitive1")).toMatchObject({ role: "skin", baseName: "Avatar_Orion_Body" });
    expect(classifyMeshName("TS_Orion_Brow_L")).toMatchObject({ role: "brow" });
    expect(classifyMeshName("TS_Orion_EyePanel_L")).toMatchObject({ role: "eyeball" });
    expect(classifyMeshName("TS_Orion_Pupil_R")).toMatchObject({ role: "pupil" });
    expect(classifyMeshName("TS_ReferenceHead")).toMatchObject({ role: "head" });
    expect(classifyMeshName("TS_ReferenceNeck")).toMatchObject({ role: "skin" });
  });

  it("규약 밖 이름은 unknown과 한글 사유, override는 역할을 강제한다", () => {
    const unknown = classifyMeshName("Cube.001");
    expect(unknown.role).toBeNull();
    expect(unknown.reasonKo).toMatch(/이름 규약/u);
    expect(classifyMeshName("Cube.001", { "Cube.001": "accessory" }).role).toBe("accessory");
    const bad = classifyMeshName("Cube.001", { "Cube.001": "nope" });
    expect(bad.role).toBeNull();
    expect(bad.reasonKo).toMatch(/어휘 밖/u);
    const result = classifyMeshRoles(["TS_AuthoredHair_soft-bob_LOD0", "TS_AuthoredHair_soft-bob_LOD0_Outline", "Thing"], { Extra: "top" });
    expect(result.roles).toEqual({ Extra: "top", "TS_AuthoredHair_soft-bob_LOD0": "hair", "TS_AuthoredHair_soft-bob_LOD0_Outline": "hair" });
    expect(result.outlines).toEqual(["TS_AuthoredHair_soft-bob_LOD0_Outline"]);
    expect(result.unknown.map((entry) => entry.name)).toEqual(["Thing"]);
    expect(mapMeshRoles(["Body"])).toEqual({ Body: "skin" });
  });

  it("키트 접두 규칙이 키워드보다 먼저 역할을 정한다(TS_Accessory_headphones가 head로 잡히지 않는다)", () => {
    // 계약 12.1 N7·N8: 키워드만으로는 headphones가 /head|face/ 규칙에 먼저 걸려 head가 된다
    expect(classifyMeshName("TS_Accessory_headphones")).toMatchObject({ role: "accessory" });
    expect(classifyMeshName("TS_Accessory_headphones_primitive0")).toMatchObject({ role: "accessory", baseName: "TS_Accessory_headphones" });
    for (const style of ["glasses", "ribbon", "cap", "earrings", "choker"]) {
      expect(classifyMeshName(`TS_Accessory_${style}`)).toMatchObject({ role: "accessory" });
    }
    for (const name of ["tee", "hoodie", "shirt", "blazer", "sailor"]) expect(classifyMeshName(`TS_Top_${name}`)).toMatchObject({ role: "top" });
    for (const name of ["jeans", "shorts", "pleated-skirt", "long-skirt", "slacks"]) expect(classifyMeshName(`TS_Bottom_${name}`)).toMatchObject({ role: "bottom" });
    for (const name of ["sneakers", "loafers", "boots", "sandals"]) expect(classifyMeshName(`TS_Shoes_${name}`)).toMatchObject({ role: "shoes" });
    expect(classifyMeshName("TS_Top_tee_Outline")).toMatchObject({ role: "top", outline: true });
    expect(classifyMeshName("TS_Underwear")).toMatchObject({ role: "underwear" });
    expect(classifyMeshName("TS_Iris_L")).toMatchObject({ role: "iris" });
    expect(classifyMeshName("TS_Iris_R")).toMatchObject({ role: "iris" });
    // override는 접두 규칙보다도 앞선다
    expect(classifyMeshName("TS_Accessory_headphones", { TS_Accessory_headphones: "head" }).role).toBe("head");
  });

  it("키트 전체 메시 이름 표(계약 3.4·3.5)가 올바른 역할로 분류된다", () => {
    const expected: Record<string, string> = {
      TS_Body: "skin",
      TS_Head: "head",
      TS_Eye_L: "eyeball",
      TS_Eye_R: "eyeball",
      TS_Iris_L: "iris",
      TS_Iris_R: "iris",
      TS_Pupil_L: "pupil",
      TS_Highlight_L: "eye-highlight",
      TS_Highlight_R: "eye-highlight",
      TS_Mouth_primitive0: "teeth",
      TS_Mouth_primitive1: "tongue",
      TS_Lashes: "lash",
      TS_Brow_L: "brow",
      TS_Brow_R: "brow",
      TS_Underwear: "underwear",
      "TS_AuthoredHair_twin-tail_LOD2": "hair",
    };
    for (const [name, role] of Object.entries(expected)) expect(classifyMeshName(name).role, name).toBe(role);
    expect(mapMeshRoles(Object.keys(expected))).toEqual(expected);
  });

  it("TS_Mouth는 프리미티브 번호로만 역할이 갈리고 쪼개지지 않은 입은 한글 사유와 함께 unknown이다", () => {
    expect(classifyMeshName("TS_Mouth_primitive0")).toMatchObject({ role: "teeth", baseName: "TS_Mouth" });
    expect(classifyMeshName("TS_Mouth_primitive1")).toMatchObject({ role: "tongue", baseName: "TS_Mouth" });
    expect(classifyMeshName("TS_Mouth_teeth").role).toBe("teeth");
    expect(classifyMeshName("TS_Mouth_tongue").role).toBe("tongue");
    const whole = classifyMeshName("TS_Mouth");
    expect(whole.role).toBeNull();
    expect(whole.reasonKo).toMatch(/primitiveRoles/u);
    const third = classifyMeshName("TS_Mouth_primitive2");
    expect(third.role).toBeNull();
    expect(third.reasonKo).toMatch(/프리미티브별 역할/u);
    // kit.json이 명시한 override는 항상 이긴다
    expect(classifyMeshName("TS_Mouth", { TS_Mouth: "teeth" }).role).toBe("teeth");
    const result = classifyMeshRoles(["TS_Mouth"]);
    expect(result.unknown.map((entry) => entry.name)).toEqual(["TS_Mouth"]);
  });

  it("헤어 LOD 선택: 선호 LOD 이하 중 가장 가까운 것, 없으면 가장 상세한 것, 외곽선은 본체를 따른다", () => {
    const names = ["TS_AuthoredHair_hime-cut_LOD0", "TS_AuthoredHair_hime-cut_LOD1", "TS_AuthoredHair_hime-cut_LOD2", "TS_AuthoredHair_hime-cut_LOD1_Outline", "Body"];
    const lod1 = selectHairLod(names, 1);
    expect(lod1.chosen).toBe(1);
    expect(lod1.visible).toEqual(["TS_AuthoredHair_hime-cut_LOD1", "TS_AuthoredHair_hime-cut_LOD1_Outline"]);
    expect(lod1.hidden).toEqual(["TS_AuthoredHair_hime-cut_LOD0", "TS_AuthoredHair_hime-cut_LOD2"]);
    expect(lod1.style).toBe("hime-cut");
    expect(selectHairLod(names, 5).chosen).toBe(2);
    expect(selectHairLod(["TS_AuthoredHair_hime-cut_LOD2"], 0).chosen).toBe(2);
    expect(selectHairLod(["Body"]).chosen).toBeNull();
    expect(selectHairLod(names).lods).toEqual([0, 1, 2]);
  });

  it("삼각형 예산으로 LOD를 고른다", () => {
    expect(chooseLodForTriangleBudget([3752, 1788, 960], 2000)).toBe(1);
    expect(chooseLodForTriangleBudget([3752, 1788, 960], 10000)).toBe(0);
    expect(chooseLodForTriangleBudget([3752, 1788, 960], 100)).toBe(2);
    expect(chooseLodForTriangleBudget([], 100)).toBe(0);
  });
});
