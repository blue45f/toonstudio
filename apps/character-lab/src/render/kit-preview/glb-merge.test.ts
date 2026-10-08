import { describe, expect, it } from "vitest";

import { isLabFailure } from "../../contracts";

import { inspectGlb } from "./glb-inspect";
import { accessorLayout, arrayField, asNumber, dataViewOf, isJsonObject, objectAt, parseGlb, readAccessorValue, writeGlb } from "./glb-io";
import { mergeGlbs, remapJointAccessors, splitMultiPrimitiveNodes } from "./glb-merge";
import { buildFixtureGlb, fixtureJointNames } from "./glb-test-fixture";
import { KIT_PRIMITIVE_SPLITS } from "./kit-roles";

import type { GlbSummary } from "./glb-inspect";
import type { GlbDocument, JsonObject } from "./glb-io";
import type { MergeInput } from "./glb-merge";
import type { FixtureOptions } from "./glb-test-fixture";

function input(label: string, options: FixtureOptions): MergeInput {
  const bytes = buildFixtureGlb(options);
  const doc = parseGlb(bytes, label);
  return { label, doc, summary: inspectGlb(doc, label, bytes.byteLength) };
}

function failureOf(run: () => unknown): { code: string; reasonKo: string } {
  try {
    run();
  } catch (error) {
    if (isLabFailure(error)) return { code: error.code, reasonKo: error.reasonKo };
    throw error;
  }
  throw new Error("실패해야 하는 호출이었습니다.");
}

function reinspect(doc: GlbDocument): GlbSummary {
  // 병합 결과를 GLB로 쓰고 다시 읽어 검사한다(직렬화·재파싱까지 포함해 유효성을 본다).
  const bytes = writeGlb(doc);
  return inspectGlb(parseGlb(bytes, "merged"), "merged", bytes.byteLength);
}

function jointsOf(doc: GlbDocument, meshNodeName: string): number[] {
  const nodes = arrayField(doc.json, "nodes");
  const node = nodes.map((value) => (isJsonObject(value) ? value : null)).find((value) => value?.name === meshNodeName);
  const mesh = node ? objectAt(arrayField(doc.json, "meshes"), asNumber(node.mesh) ?? -1) : null;
  const primitive = mesh ? objectAt(arrayField(mesh, "primitives"), 0) : null;
  const accessor = primitive && isJsonObject(primitive.attributes) ? asNumber(primitive.attributes.JOINTS_0) : null;
  const layout = accessor === null ? null : accessorLayout(doc.json, accessor);
  if (!layout) throw new Error(`${meshNodeName}의 JOINTS_0을 찾지 못했습니다.`);
  const view = dataViewOf(doc.bin);
  return [0, 1, 2].map((vertex) => readAccessorValue(view, layout, vertex, 0));
}

const JOINTS = fixtureJointNames(4); // j0..j3 (j0 루트, 나머지는 j0의 자식)

describe("mergeGlbs: 베이스 + 파츠", () => {
  it("관절이 같으면 파츠 메시를 베이스 스킨에 붙이고 재질·텍스처·morph를 가져온다", () => {
    const base = input("base.glb", { joints: JOINTS, meshes: [{ node: "TS_Body", materials: ["ts_skin_body"], texture: { width: 64, height: 64 } }] });
    const part = input("hair.glb", {
      joints: JOINTS,
      meshes: [{ node: "TS_AuthoredHair_soft-bob_LOD0", materials: ["ts_hair_soft-bob"], texture: { width: 32, height: 32, alpha: true }, morphTargets: ["param:headSize:+", "param:headSize:-"], jointIndices: [3, 3, 2] }],
    });
    const { doc, report } = mergeGlbs([base, part], KIT_PRIMITIVE_SPLITS);
    expect(report.changed).toBe(true);
    expect(report.parts).toEqual([{ label: "hair.glb", meshNodes: ["TS_AuthoredHair_soft-bob_LOD0"], jointOrder: "same", skinnedNodes: 1, unskinnedNodes: 0 }]);
    const merged = reinspect(doc);
    expect(merged.meshNodes.map((mesh) => mesh.node)).toEqual(["TS_Body", "TS_AuthoredHair_soft-bob_LOD0"]);
    expect(merged.skins).toHaveLength(1);
    expect(merged.meshNodes.every((mesh) => mesh.skinned && mesh.skinIndex === 0)).toBe(true);
    expect(merged.materials.map((material) => material.name)).toEqual(["ts_skin_body", "ts_hair_soft-bob"]);
    expect(merged.images).toHaveLength(2);
    expect(merged.images[1]).toMatchObject({ width: 32, height: 32, hasAlpha: true });
    expect(merged.materials[1]?.textures).toEqual({ baseColor: 1 });
    expect(merged.morphTargetNames).toEqual(["param:headSize:+", "param:headSize:-"]);
    expect(merged.warnings.filter((warning) => warning.severity === "error")).toEqual([]);
    expect(jointsOf(doc, "TS_AuthoredHair_soft-bob_LOD0")).toEqual([3, 3, 2]);
    // 파츠는 Armature 아래(베이스 스킨 메시와 같은 부모)에 붙는다
    expect(merged.meshNodes[1]?.parent).toBe("Armature");
  });

  it("입력 문서를 고치지 않는다", () => {
    const base = input("base.glb", { joints: JOINTS, meshes: [{ node: "TS_Body" }] });
    const part = input("top.glb", { joints: JOINTS, meshes: [{ node: "TS_Top_tee" }] });
    const before = JSON.stringify([base.doc.json, part.doc.json]);
    const baseBin = Array.from(base.doc.bin.subarray(0, 64));
    mergeGlbs([base, part], KIT_PRIMITIVE_SPLITS);
    expect(JSON.stringify([base.doc.json, part.doc.json])).toBe(before);
    expect(Array.from(base.doc.bin.subarray(0, 64))).toEqual(baseBin);
  });

  it("관절 순서만 다르면 JOINTS_0을 베이스 인덱스로 재매핑하고 경고한다", () => {
    const base = input("base.glb", { joints: JOINTS, meshes: [{ node: "TS_Body" }] });
    // 파츠 순서: j3, j2, j1, j0 → 파츠의 joint 0 = j3 = 베이스 3
    const reversed = [...JOINTS].reverse();
    const part = input("top.glb", { joints: reversed, parents: [0, 0, 0, -1].map((value, index) => (index === 3 ? -1 : 3)), meshes: [{ node: "TS_Top_tee", jointIndices: [0, 1, 3] }] });
    const { doc, report } = mergeGlbs([base, part], KIT_PRIMITIVE_SPLITS);
    expect(report.parts[0]?.jointOrder).toBe("reordered");
    expect(report.warnings.some((warning) => warning.code === "kit-joint-order")).toBe(true);
    // 파츠 인덱스 0,1,3 → 이름 j3,j2,j0 → 베이스 3,2,0
    expect(jointsOf(doc, "TS_Top_tee")).toEqual([3, 2, 0]);
    expect(reinspect(doc).warnings.filter((warning) => warning.severity === "error")).toEqual([]);
  });

  it("관절이 모자라거나 남으면 kit-joint-mismatch로 실패하고 어긋난 이름을 알려 준다", () => {
    const base = input("base.glb", { joints: JOINTS, meshes: [{ node: "TS_Body" }] });
    const missing = input("hair.glb", { joints: JOINTS.slice(0, 3), meshes: [{ node: "TS_AuthoredHair_a_LOD0" }] });
    const failure = failureOf(() => mergeGlbs([base, missing], KIT_PRIMITIVE_SPLITS));
    expect(failure.code).toBe("kit-joint-mismatch");
    expect(failure.reasonKo).toContain("j3");
    expect(failure.reasonKo).toContain("hair.glb");
    const extra = input("top.glb", { joints: [...JOINTS, "extra"], meshes: [{ node: "TS_Top_tee" }] });
    const extraFailure = failureOf(() => mergeGlbs([base, extra], KIT_PRIMITIVE_SPLITS));
    expect(extraFailure.code).toBe("kit-joint-mismatch");
    expect(extraFailure.reasonKo).toContain("extra");
    const renamed = input("bottom.glb", { joints: ["j0", "j1", "j2", "mixamorig:Other"], meshes: [{ node: "TS_Bottom_jeans" }] });
    expect(failureOf(() => mergeGlbs([base, renamed], KIT_PRIMITIVE_SPLITS)).reasonKo).toContain("mixamorig:Other");
  });

  it("관절 부모가 다르면 kit-joint-mismatch", () => {
    const base = input("base.glb", { joints: JOINTS, meshes: [{ node: "TS_Body" }] });
    const chain = input("top.glb", { joints: JOINTS, parents: [-1, 0, 1, 2], meshes: [{ node: "TS_Top_tee" }] });
    const failure = failureOf(() => mergeGlbs([base, chain], KIT_PRIMITIVE_SPLITS));
    expect(failure.code).toBe("kit-joint-mismatch");
    expect(failure.reasonKo).toContain("부모");
  });

  it("레스트 포즈(IBM)가 다르면 경고만 한다", () => {
    const base = input("base.glb", { joints: JOINTS, meshes: [{ node: "TS_Body" }] });
    const shifted = input("top.glb", { joints: JOINTS, ibmShift: 0.25, meshes: [{ node: "TS_Top_tee" }] });
    const { report } = mergeGlbs([base, shifted], KIT_PRIMITIVE_SPLITS);
    const warning = report.warnings.find((entry) => entry.code === "kit-rest-mismatch");
    expect(warning?.source).toBe("top.glb");
    expect(warning?.messageKo).toContain("4개");
    const noIbm = input("shoes.glb", { joints: JOINTS, omitIbm: true, meshes: [{ node: "TS_Shoes_sneakers" }] });
    expect(mergeGlbs([base, noIbm], KIT_PRIMITIVE_SPLITS).report.warnings.some((entry) => entry.code === "kit-rest-unchecked")).toBe(true);
  });

  it("베이스에 스킨이 없는데 스킨 파츠를 올리면 실패한다", () => {
    const base = input("base.glb", { meshes: [{ node: "Prop" }] });
    const part = input("hair.glb", { joints: JOINTS, meshes: [{ node: "TS_AuthoredHair_a_LOD0" }] });
    expect(failureOf(() => mergeGlbs([base, part], KIT_PRIMITIVE_SPLITS)).code).toBe("kit-joint-mismatch");
  });

  it("메시 노드 이름이 겹치면 kit-mesh-duplicate로 실패한다", () => {
    const base = input("base.glb", { joints: JOINTS, meshes: [{ node: "TS_Iris_L" }] });
    const part = input("irises.glb", { joints: JOINTS, meshes: [{ node: "TS_Iris_L" }] });
    const failure = failureOf(() => mergeGlbs([base, part], KIT_PRIMITIVE_SPLITS));
    expect(failure.code).toBe("kit-mesh-duplicate");
    expect(failure.reasonKo).toContain("TS_Iris_L");
  });

  it("스킨이 아닌 파츠 메시는 오류 경고를 내고 월드 변환을 구워 장면 루트에 둔다", () => {
    const base = input("base.glb", { joints: JOINTS, meshes: [{ node: "TS_Body" }] });
    const part = input("prop.glb", { meshes: [{ node: "TS_Accessory_hat", translation: [0, 1.5, 0] }] });
    const { doc, report } = mergeGlbs([base, part], KIT_PRIMITIVE_SPLITS);
    expect(report.parts[0]).toMatchObject({ skinnedNodes: 0, unskinnedNodes: 1, jointOrder: "none" });
    expect(report.warnings.find((warning) => warning.code === "kit-skin-invalid")?.severity).toBe("error");
    const merged = reinspect(doc);
    const hat = merged.meshNodes.find((mesh) => mesh.node === "TS_Accessory_hat");
    expect(hat?.skinned).toBe(false);
    expect(hat?.parent).toBeNull();
    const hatNode = arrayField(doc.json, "nodes").map((value) => (isJsonObject(value) ? value : null)).find((value) => value?.name === "TS_Accessory_hat");
    const matrix = hatNode?.matrix;
    expect(Array.isArray(matrix) && matrix[13]).toBeCloseTo(1.5, 5);
  });

  it("희소(sparse) accessor의 bufferView도 새 인덱스로 옮긴다", () => {
    const base = input("base.glb", { joints: JOINTS, meshes: [{ node: "TS_Body" }] });
    const partBytes = buildFixtureGlb({ joints: JOINTS, meshes: [{ node: "TS_Top_tee", morphTargets: ["param:waist:+"] }] });
    const partDoc = parseGlb(partBytes);
    // 첫 morph accessor를 희소 형식으로 바꾼다(indices/values가 기존 bufferView를 쓴다)
    const accessors = arrayField(partDoc.json, "accessors");
    const morphAccessor = accessors.map((value) => (isJsonObject(value) ? value : null)).find((value) => value?.min && Array.isArray(value.min) && value.min[1] === 0.1);
    expect(morphAccessor).toBeTruthy();
    if (!morphAccessor) return;
    const sparseView = asNumber(morphAccessor.bufferView) ?? 0;
    delete morphAccessor.bufferView;
    morphAccessor.sparse = { count: 1, indices: { bufferView: sparseView, componentType: 5123 }, values: { bufferView: sparseView } };
    const part: MergeInput = { label: "top.glb", doc: partDoc, summary: inspectGlb(partDoc, "top.glb", partBytes.byteLength) };
    const { doc } = mergeGlbs([base, part], KIT_PRIMITIVE_SPLITS);
    const merged = doc.json;
    const copied = arrayField(merged, "accessors").map((value) => (isJsonObject(value) ? value : null)).find((value) => value?.sparse !== undefined);
    expect(copied).toBeTruthy();
    const sparse = copied?.sparse;
    const bufferViews = arrayField(merged, "bufferViews");
    if (isJsonObject(sparse) && isJsonObject(sparse.indices) && isJsonObject(sparse.values)) {
      expect(asNumber(sparse.indices.bufferView)).toBeLessThan(bufferViews.length);
      expect(sparse.indices.bufferView).toBe(sparse.values.bufferView);
    } else {
      throw new Error("sparse가 객체가 아닙니다.");
    }
    expect(copied?.bufferView).toBeUndefined();
  });

  it("확장 목록은 합집합이다", () => {
    const base = input("base.glb", { joints: JOINTS, extensionsUsed: ["KHR_materials_clearcoat"], meshes: [{ node: "TS_Body" }] });
    const part = input("top.glb", { joints: JOINTS, extensionsUsed: ["KHR_materials_clearcoat", "KHR_materials_sheen"], meshes: [{ node: "TS_Top_tee" }] });
    const { doc } = mergeGlbs([base, part], KIT_PRIMITIVE_SPLITS);
    expect(doc.json.extensionsUsed).toEqual(["KHR_materials_clearcoat", "KHR_materials_sheen"]);
  });

  it("파츠가 없고 분할할 것도 없으면 changed=false다", () => {
    const base = input("base.glb", { joints: JOINTS, meshes: [{ node: "TS_Body" }] });
    const { report, doc } = mergeGlbs([base], KIT_PRIMITIVE_SPLITS);
    expect(report.changed).toBe(false);
    expect(reinspect(doc).totals.triangles).toBe(base.summary.totals.triangles);
  });

  it("베이스가 없으면 실패한다", () => {
    expect(failureOf(() => mergeGlbs([], KIT_PRIMITIVE_SPLITS)).code).toBe("kit-no-base");
  });
});

describe("TS_Mouth 분할", () => {
  it("프리미티브 2개를 teeth/tongue 노드로 쪼개고 재질·스킨·morph를 보존한다", () => {
    const base = input("base.glb", {
      joints: JOINTS,
      meshes: [{ node: "TS_Mouth", primitives: 2, materials: ["ts_teeth", "ts_tongue"], morphTargets: ["facs:jawOpen", "facs:tongueOut"] }],
    });
    const { doc, report } = mergeGlbs([base], KIT_PRIMITIVE_SPLITS);
    expect(report.splits).toEqual([{ node: "TS_Mouth", into: ["TS_Mouth_teeth", "TS_Mouth_tongue"] }]);
    expect(report.changed).toBe(true);
    const merged = reinspect(doc);
    expect(merged.meshNodes.map((mesh) => mesh.node)).toEqual(["TS_Mouth_teeth", "TS_Mouth_tongue"]);
    expect(merged.meshNodes.map((mesh) => mesh.primitives.length)).toEqual([1, 1]);
    expect(merged.meshNodes.map((mesh) => mesh.primitives[0]?.material)).toEqual(["ts_teeth", "ts_tongue"]);
    expect(merged.meshNodes.every((mesh) => mesh.skinned && mesh.skinIndex === 0)).toBe(true);
    expect(merged.meshNodes.every((mesh) => mesh.parent === "Armature")).toBe(true);
    expect(merged.meshNodes.map((mesh) => mesh.morphTargetNames)).toEqual([["facs:jawOpen", "facs:tongueOut"], ["facs:jawOpen", "facs:tongueOut"]]);
    expect(merged.meshNodes.every((mesh) => mesh.primitives[0]?.morphTargets === 2)).toBe(true);
  });

  it("프리미티브가 1개거나 규칙과 수가 다르면 쪼개지 않고 경고한다", () => {
    const single = input("base.glb", { joints: JOINTS, meshes: [{ node: "TS_Mouth" }] });
    const outcome = mergeGlbs([single], KIT_PRIMITIVE_SPLITS);
    expect(outcome.report.splits).toEqual([]);
    expect(outcome.report.warnings.some((warning) => warning.code === "kit-mouth-primitives")).toBe(true);
    const triple = input("base.glb", { joints: JOINTS, meshes: [{ node: "TS_Mouth", primitives: 3 }] });
    const warnings: Parameters<typeof splitMultiPrimitiveNodes>[3] = [];
    const doc = parseGlb(buildFixtureGlb({ joints: JOINTS, meshes: [{ node: "TS_Mouth", primitives: 3 }] }));
    expect(splitMultiPrimitiveNodes(doc.json, KIT_PRIMITIVE_SPLITS, "x", warnings)).toEqual([]);
    expect(warnings[0]?.messageKo).toContain("3개");
    expect(triple.summary.meshNodes[0]?.primitives).toHaveLength(3);
  });
});

describe("remapJointAccessors", () => {
  it("같은 accessor는 한 번만 재매핑한다", () => {
    const doc = parseGlb(buildFixtureGlb({ joints: JOINTS, meshes: [{ node: "A", jointIndices: [0, 1, 2] }] }));
    const mesh = objectAt(arrayField(doc.json, "meshes"), 0) as JsonObject;
    const done = new Set<number>();
    const first = remapJointAccessors(doc.json, doc.bin, mesh, [3, 2, 1, 0], done);
    const second = remapJointAccessors(doc.json, doc.bin, mesh, [3, 2, 1, 0], done);
    expect(first).toBe(3);
    expect(second).toBe(0);
    const view = dataViewOf(doc.bin);
    const primitive = objectAt(arrayField(mesh, "primitives"), 0) as JsonObject;
    const accessor = asNumber((primitive.attributes as JsonObject).JOINTS_0) ?? 0;
    const layout = accessorLayout(doc.json, accessor);
    expect(layout && [0, 1, 2].map((vertex) => readAccessorValue(view, layout, vertex, 0))).toEqual([3, 2, 1]);
  });
});
