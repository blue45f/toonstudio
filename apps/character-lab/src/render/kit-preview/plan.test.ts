import { describe, expect, it } from "vitest";

import { DEFAULT_RECIPE_COLORS, parseCharacterPackageManifest } from "../../contracts";

import { buildFixtureGlb } from "./glb-test-fixture";
import { KIT_JOINT_NAMES } from "./kit-roles";
import { PREVIEW_GLB_URL, buildApplyPlan, buildKitApplyPlan, buildPackagePlan, expandMorphAssignments } from "./plan";
import { prepareKitGlbs } from "./prepare";
import { resolveTintColors } from "./tint";

import type { MaterialPresetId } from "../../contracts";
import type { RigInspection } from "../rig-inspection";

const AVAILABLE = ["param:height:+", "param:height:-", "param:waist:+", "param:waist:-", "facs:jawOpen", "facs:eyeBlinkLeft", "blendShape1.vrc_v_aa"];

function prepared() {
  const bytes = buildFixtureGlb({
    joints: KIT_JOINT_NAMES,
    meshes: [
      { node: "TS_Body", materials: ["ts_skin_body"], baseColorFactor: [1, 1, 1, 1] },
      { node: "TS_Eye_L", materials: ["ts_eye"] },
      { node: "Mystery" },
    ],
  });
  return prepareKitGlbs([{ label: "base.glb", bytes }], { colors: resolveTintColors({}), roleOverrides: {} });
}

describe("buildPackagePlan", () => {
  it("역할·본 매핑·헤어 LOD 정책을 그대로 싣고 manifest는 계약 스키마를 통과한다", () => {
    const result = prepared();
    const sha = "ab".repeat(32);
    const plan = buildPackagePlan(result, 2, "미리보기", sha);
    expect(plan.glbUrl).toBe(PREVIEW_GLB_URL);
    expect(plan.glbSha256).toBe(sha);
    expect(plan.glbBytes).toBe(result.bytes.byteLength);
    expect(plan.meshRoles).toBe(result.meshRoles);
    expect(plan.boneMap).toBe(result.boneMap);
    expect(plan.hairLodPolicy).toEqual({ preferredLod: 2 });
    expect(plan.shapeKeyMap).toEqual({});
    expect(Object.keys(plan.capabilities)).toHaveLength(15);
    const parsed = parseCharacterPackageManifest(JSON.parse(JSON.stringify(plan.manifest)));
    expect(parsed.ok).toBe(true);
  });
});

describe("expandMorphAssignments", () => {
  it("존재하는 이름은 그대로, 가중치는 [0,1]로 클램프한다", () => {
    const result = expandMorphAssignments([{ name: "facs:jawOpen", value: 0.75 }, { name: "blendShape1.vrc_v_aa", value: 1 }], AVAILABLE);
    expect(result.weights).toEqual({ "facs:jawOpen": 0.75, "blendShape1.vrc_v_aa": 1 });
    expect(result.unknown).toEqual([]);
    expect(expandMorphAssignments([{ name: "facs:jawOpen", value: 3 }], AVAILABLE).weights["facs:jawOpen"]).toBe(1);
  });

  it("부호 약식 param:<키>는 :+ / :- 로 나누고 반대편은 0으로 둔다", () => {
    const positive = expandMorphAssignments([{ name: "param:height", value: 0.5 }], AVAILABLE);
    expect(positive.weights).toEqual({ "param:height:+": 0.5, "param:height:-": 0 });
    expect(positive.expanded).toHaveLength(1);
    const negative = expandMorphAssignments([{ name: "param:waist", value: -0.25 }], AVAILABLE);
    expect(negative.weights).toEqual({ "param:waist:-": 0.25, "param:waist:+": 0 });
  });

  it("없는 이름은 버리지 않고 비슷한 후보와 함께 unknown으로 돌려준다", () => {
    const result = expandMorphAssignments([{ name: "facs:jawOpenWide", value: 1 }, { name: "param:chestDepth", value: 0.4 }, { name: "facs:blink", value: 1 }], AVAILABLE);
    expect(result.weights).toEqual({});
    expect(result.unknown.map((entry) => entry.name)).toEqual(["facs:jawOpenWide", "param:chestDepth", "facs:blink"]);
    expect(result.unknown[0]?.candidates).toEqual([]);
    expect(expandMorphAssignments([{ name: "jaw", value: 1 }], AVAILABLE).unknown[0]?.candidates).toEqual(["facs:jawOpen"]);
  });

  it("부호 약식인데 한쪽 이름만 없으면 있는 쪽만 적용하고 없는 쪽은 unknown", () => {
    const only = expandMorphAssignments([{ name: "param:height", value: -0.5 }], ["param:height:+"]);
    expect(only.weights).toEqual({ "param:height:+": 0 });
    expect(only.unknown.map((entry) => entry.name)).toEqual(["param:height:-"]);
  });
});

describe("buildApplyPlan", () => {
  function inspected(id: string, partId: number, materialPreset: MaterialPresetId): RigInspection["parts"][number] {
    return {
      id,
      partId,
      materialId: 0,
      role: "skin",
      materialPreset,
      colorHex: "#000000",
      visible: true,
      forceHidden: false,
      forceHiddenReasonKo: null,
      meshNames: [],
      outlineMeshNames: [],
      vertexCount: 0,
      triangleCount: 0,
      morphTargetCount: 0,
      morphTargetCountsByMesh: [],
      activeMorphTargetsByMesh: [],
      hasAlbedoTexture: false,
      meshMetadataPartIds: [],
      outlineMetadataPartIds: [],
      skinned: true,
      sideOrientations: [],
      materialClass: "PBRMaterial",
      hasToonMaterial: false,
      renderOutline: false,
      edgesRendering: false,
      outlineShellVisible: false,
    };
  }
  const parts: RigInspection["parts"] = [inspected("TS_Body", 7, "skin-sss"), inspected("TS_Eye_L", 3, "eye-wet"), inspected("Mystery", 9, "plastic")];

  it("리그가 알려 준 partId를 쓰고 키트 파츠에만 색 override를 준다", () => {
    const result = prepared();
    const plan = buildApplyPlan({ parts, meshes: result.meshes, colors: resolveTintColors({}), morphWeights: { "facs:jawOpen": 1 }, pose: { head: [0, 0, 0, 1] } });
    expect(plan.parts.map((part) => part.partId)).toEqual([7, 3, 9]);
    expect(plan.parts[0]).toEqual({ partId: 7, visible: true, materialPreset: "skin-sss", color: DEFAULT_RECIPE_COLORS.skin });
    expect(plan.parts[1]).toEqual({ partId: 3, visible: true, materialPreset: "eye-wet", color: "#ffffff" });
    // 레거시/추정 메시는 색을 건드리지 않는다(앱 기본 해석)
    expect(plan.parts[2]).toEqual({ partId: 9, visible: true, materialPreset: "plastic" });
    expect(plan.morphWeights).toEqual({ "facs:jawOpen": 1 });
    expect(plan.boneRotations).toEqual({ head: [0, 0, 0, 1] });
    expect(plan.colors).toEqual(DEFAULT_RECIPE_COLORS);
    expect(plan.physics).toEqual({ provider: "builtin-pbd", settleSteps: 0 });
    expect(plan.unsupported).toEqual([]);
  });

  it("buildKitApplyPlan: 키트 파츠는 틴트를 엔진이 정하므로 파츠 색 override 없이 partId·프리셋·레시피 색만 준다", () => {
    const plan = buildKitApplyPlan({ parts, colors: resolveTintColors({ hair: "#112233" }), morphWeights: { "facs:jawOpen": 0.5 }, pose: {} });
    expect(plan.parts).toEqual([
      { partId: 7, visible: true, materialPreset: "skin-sss" },
      { partId: 3, visible: true, materialPreset: "eye-wet" },
      { partId: 9, visible: true, materialPreset: "plastic" },
    ]);
    expect(plan.colors.hair).toBe("#112233");
    expect(plan.morphWeights).toEqual({ "facs:jawOpen": 0.5 });
    expect(plan.revision).toBe(1);
  });
});
