import { describe, expect, it } from "vitest";

import { FORBIDDEN_GLTF_EXTENSIONS, inspectGlb, probeImage, sampleIndices } from "./glb-inspect";
import { parseGlb } from "./glb-io";
import { buildFixtureGlb, fixtureJointNames, fixtureJpeg, fixturePng } from "./glb-test-fixture";

import type { FixtureOptions } from "./glb-test-fixture";

function inspect(options: FixtureOptions, label = "test.glb") {
  const bytes = buildFixtureGlb(options);
  return inspectGlb(parseGlb(bytes), label, bytes.byteLength);
}

function codes(summary: ReturnType<typeof inspect>): string[] {
  return summary.warnings.map((warning) => warning.code);
}

describe("probeImage", () => {
  it("PNG 헤더에서 크기와 알파 여부를 읽는다", () => {
    expect(probeImage(fixturePng(2048, 1024, true))).toEqual({ width: 2048, height: 1024, mimeType: "image/png", hasAlpha: true });
    expect(probeImage(fixturePng(16, 16, false))?.hasAlpha).toBe(false);
  });

  it("JPEG SOF 마커에서 크기를 읽고 알 수 없는 형식은 null", () => {
    expect(probeImage(fixtureJpeg(512, 256))).toEqual({ width: 512, height: 256, mimeType: "image/jpeg", hasAlpha: false });
    expect(probeImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]))).toBeNull();
    expect(probeImage(new Uint8Array(0))).toBeNull();
  });
});

describe("sampleIndices", () => {
  it("작으면 전부, 크면 균등 추출한다", () => {
    expect(sampleIndices(3)).toEqual([0, 1, 2]);
    const sample = sampleIndices(10_000, 100);
    expect(sample).toHaveLength(100);
    expect(sample[0]).toBe(0);
    expect(sample[99]).toBeLessThan(10_000);
  });
});

describe("inspectGlb", () => {
  const joints = fixtureJointNames(4);

  it("메시 노드·프리미티브·속성·morph 이름·스킨 관절을 요약한다", () => {
    const summary = inspect({
      joints,
      meshes: [
        { node: "TS_Body", morphTargets: ["param:height:+", "param:height:-"], attributes: { color0: true }, materials: ["ts_skin_body"], texture: { width: 2048, height: 2048 } },
        { node: "TS_Mouth", primitives: 2, materials: ["ts_teeth", "ts_tongue"] },
      ],
    });
    expect(summary.totals.meshNodes).toBe(2);
    expect(summary.totals.triangles).toBe(3);
    expect(summary.totals.vertices).toBe(9);
    const body = summary.meshNodes.find((mesh) => mesh.node === "TS_Body");
    expect(body?.skinned).toBe(true);
    expect(body?.parent).toBe("Armature");
    expect(body?.morphTargetNames).toEqual(["param:height:+", "param:height:-"]);
    expect(body?.primitives[0]).toMatchObject({ hasUv: true, hasNormal: true, hasColor0: true, hasJoints: true, hasWeights: true, material: "ts_skin_body", triangles: 1, vertices: 3 });
    const mouth = summary.meshNodes.find((mesh) => mesh.node === "TS_Mouth");
    expect(mouth?.primitives.map((primitive) => primitive.material)).toEqual(["ts_teeth", "ts_tongue"]);
    expect(summary.skins).toHaveLength(1);
    expect(summary.skins[0]?.joints).toEqual(joints);
    expect(summary.skins[0]?.hasInverseBindMatrices).toBe(true);
    expect(summary.morphTargetNames).toEqual(["param:height:+", "param:height:-"]);
    expect(summary.images).toHaveLength(1);
    expect(summary.images[0]).toMatchObject({ width: 2048, height: 2048, mimeType: "image/png" });
    expect(summary.materials.find((material) => material.name === "ts_skin_body")?.textures).toEqual({ baseColor: 0 });
    expect(summary.materials.find((material) => material.name === "ts_skin_body")?.usedByNodes).toEqual(["TS_Body"]);
    // 정상 입력은 오류 수준 경고가 없다
    expect(summary.warnings.filter((warning) => warning.severity === "error")).toEqual([]);
  });

  it("스킨이 없는 GLB(스켈레톤 없음)도 요약한다", () => {
    const summary = inspect({ meshes: [{ node: "Prop" }] });
    expect(summary.skins).toEqual([]);
    expect(summary.meshNodes[0]?.skinned).toBe(false);
    expect(summary.meshNodes[0]?.parent).toBeNull();
  });

  it("속성 누락과 접선·COLOR_1·비회색 COLOR_0을 경고한다", () => {
    const summary = inspect({
      joints,
      meshes: [
        { node: "A", attributes: { normal: false, uv: false } },
        { node: "B", attributes: { color1: true, color0: true, color0Gray: false } },
        { node: "C", texture: { width: 64, height: 64 }, attributes: { tangent: false } },
      ],
    });
    expect(codes(summary)).toEqual(expect.arrayContaining(["glb-no-normals", "glb-no-uv", "glb-color1", "glb-color0-not-gray"]));
  });

  it("텍스처 크기·알파·금지 확장을 경고한다", () => {
    const summary = inspect({
      joints,
      extensionsUsed: ["KHR_draco_mesh_compression", "KHR_materials_clearcoat"],
      meshes: [
        { node: "Big", texture: { width: 4096, height: 4096 } },
        { node: "Odd", texture: { width: 1000, height: 512 } },
      ],
    });
    expect(codes(summary)).toEqual(expect.arrayContaining(["glb-texture-large", "glb-texture-npot", "glb-png-without-alpha", "kit-unsupported-extension"]));
    expect(summary.warnings.find((warning) => warning.code === "kit-unsupported-extension")?.severity).toBe("error");
    expect(FORBIDDEN_GLTF_EXTENSIONS).toContain("KHR_texture_basisu");
  });

  it("morph 타깃이 예산을 넘고 계약 어휘 밖이면 경고한다", () => {
    const names = Array.from({ length: 97 }, (_value, index) => `shape${index}`);
    const summary = inspect({ joints, meshes: [{ node: "Head", morphTargets: names }] });
    expect(codes(summary)).toEqual(expect.arrayContaining(["glb-morph-over-budget", "glb-morph-outside-vocabulary"]));
    expect(summary.warnings.find((warning) => warning.code === "glb-morph-outside-vocabulary")?.severity).toBe("info");
  });

  it("노드 변환·Armature 스케일을 항등 여부로 보고한다", () => {
    const summary = inspect({ joints, armatureScale: 0.01, meshes: [{ node: "Body" }, { node: "Moved", translation: [0, 1, 0] }] });
    const body = summary.meshNodes.find((mesh) => mesh.node === "Body");
    expect(body?.ownTransformIdentity).toBe(true);
    expect(body?.chainTransformIdentity).toBe(false);
    expect(summary.meshNodes.find((mesh) => mesh.node === "Moved")?.ownTransformIdentity).toBe(false);
  });

  it("IBM이 없는 스킨은 정보 경고를 남긴다", () => {
    expect(codes(inspect({ joints, omitIbm: true, meshes: [{ node: "Body" }] }))).toContain("glb-no-ibm");
  });

  it("스킨 메시인데 가중치 속성이 없으면 오류 수준 경고", () => {
    const bytes = buildFixtureGlb({ joints, meshes: [{ node: "Body" }] });
    const doc = parseGlb(bytes);
    const mesh = (doc.json.meshes as Array<{ primitives: Array<{ attributes: Record<string, number> }> }>)[0];
    delete mesh?.primitives[0]?.attributes.WEIGHTS_0;
    const summary = inspectGlb(doc, "broken.glb", bytes.byteLength);
    expect(summary.warnings.some((warning) => warning.code === "glb-skin-attributes-missing" && warning.severity === "error")).toBe(true);
  });
});
