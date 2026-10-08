import { describe, expect, it } from "vitest";

import { buildFixtureGlb } from "./glb-test-fixture";
import { KIT_JOINT_NAMES } from "./kit-roles";
import { prepareKitGlbs } from "./prepare";
import { KIT_PREVIEW_REPORT_SCHEMA, buildMeshRows, buildStaticReport } from "./summary";
import { resolveTintColors } from "./tint";

function prepare() {
  const base = buildFixtureGlb({
    joints: KIT_JOINT_NAMES,
    meshes: [
      { node: "TS_Body", materials: ["ts_skin_body"], morphTargets: ["param:height:+"], attributes: { color0: true }, texture: { width: 64, height: 64 }, baseColorFactor: [1, 1, 1, 1] },
      { node: "TS_Mouth", primitives: 2, materials: ["ts_teeth", "ts_tongue"], attributes: { uv: false } },
    ],
  });
  const hair = buildFixtureGlb({ joints: KIT_JOINT_NAMES, meshes: [{ node: "TS_AuthoredHair_a_LOD0", materials: ["ts_hair_a"], attributes: { tangent: true } }] });
  return prepareKitGlbs(
    [
      { label: "base.glb", bytes: base },
      { label: "hair.glb", bytes: hair },
    ],
    { colors: resolveTintColors({}), roleOverrides: {} },
  );
}

describe("buildMeshRows", () => {
  it("분할 뒤 메시마다 이름·출처·역할·삼각형·정점·재질과 속성 유무를 담는다", () => {
    const rows = buildMeshRows(prepare());
    // 분할로 생긴 노드는 노드 배열 끝에 붙으므로 이름순으로 정렬해 비교한다.
    expect(rows.map((row) => row.name).sort()).toEqual(["TS_AuthoredHair_a_LOD0", "TS_Body", "TS_Mouth_teeth", "TS_Mouth_tongue"]);
    const byName = new Map(rows.map((row) => [row.name, row] as const));
    const body = byName.get("TS_Body");
    expect(body).toMatchObject({ origin: "base.glb", role: "skin", roleSource: "kit-name", tint: "recolor", triangles: 1, vertices: 3, primitives: 1, materials: ["ts_skin_body"], skinned: true, hasUv: true, hasNormal: true, hasTangent: false, hasColor0: true, hasColor1: false, hasWeights: true, morphTargets: 1, parent: "Armature" });
    expect(byName.get("TS_Mouth_teeth")).toMatchObject({ origin: "base.glb", role: "teeth", tint: "fixed", hasUv: false, materials: ["ts_teeth"] });
    expect(byName.get("TS_Mouth_tongue")).toMatchObject({ role: "tongue", materials: ["ts_tongue"] });
    expect(byName.get("TS_AuthoredHair_a_LOD0")).toMatchObject({ origin: "hair.glb", role: "hair", hasTangent: true });
  });
});

describe("buildStaticReport", () => {
  it("입력·메시·morph·본·병합·경고를 한 구조로 낸다", () => {
    const report = buildStaticReport(prepare());
    expect(report.schema).toBe(KIT_PREVIEW_REPORT_SCHEMA);
    expect(report.inputs.map((input) => input.label)).toEqual(["base.glb", "hair.glb"]);
    expect(report.inputs[0]).toMatchObject({ meshNodes: 2, jointCount: 68, morphTargetNames: 1 });
    expect(report.totals).toEqual({ meshes: 4, triangles: 4, vertices: 12 });
    expect(report.morphTargetNames).toEqual(["param:height:+"]);
    expect(report.boneNames).toHaveLength(68);
    expect(report.skeleton).toMatchObject({ jointCount: 68, mappedHumanoidBones: 55, matchesKit68: true, missingKitJoints: [], extraJoints: [] });
    expect(report.skeleton?.unmapped).toHaveLength(13);
    expect(report.merge.passthrough).toBe(false);
    expect(report.merge.splits).toEqual([{ node: "TS_Mouth", into: ["TS_Mouth_teeth", "TS_Mouth_tongue"] }]);
    expect(report.merge.parts.map((part) => part.label)).toEqual(["hair.glb"]);
    expect(report.merge.mergedBytes).toBeGreaterThan(0);
    expect(report.warnings.some((warning) => warning.code === "glb-no-uv")).toBe(true);
    // JSON으로 직렬화해도 손실 없이 왕복한다(CLI가 그대로 출력한다)
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
