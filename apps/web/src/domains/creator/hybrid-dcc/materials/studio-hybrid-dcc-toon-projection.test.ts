// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { hashStudioEditableMesh } from "../../studio-editable-half-edge-mesh";
import { deriveStudioHybridDccViewportSnapshot } from "../StudioHybridDccViewportCore";
import { createStudioHybridDccGeometryResource } from "../studio-hybrid-dcc-geometry-resource";
import { workspaceAddActiveModifier } from "../studio-hybrid-dcc-modifier-workspace";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceAddUnitCube } from "../studio-hybrid-dcc-workspace";
import { createStudioHybridDccDefaultToonMaterial } from "./studio-hybrid-dcc-toon-material";
import { deriveStudioHybridDccMaterialGroups, deriveStudioHybridDccTriangleMaterialSlots } from "./studio-hybrid-dcc-toon-projection";
import { workspaceSetStudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-workspace";
import { hybridDccCommitGeometry } from "../studio-hybrid-dcc-document";

function source() {
  const workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("toon-projection"), "cube");
  const mesh = workspace.session.state.geometry.records.cube!.mesh;
  const next = { ...mesh, faces: mesh.faces.map((face) => ({ ...face, materialSlot: face.id % 2 })) };
  return synchronizeWorkspaceGeometryAuthority(workspace, hybridDccCommitGeometry(workspace.session, "cube", next));
}
const toon = createStudioHybridDccDefaultToonMaterial();

describe("재질 슬롯의 실제 렌더 투영", () => {
  it("서로 다른 슬롯의 공통 표면·UV·normal·index 순서를 바꾸지 않고 실제 Three draw group에 반영한다", () => {
    const before = source(); const baseline = deriveStudioHybridDccViewportSnapshot(before).assets[0]!;
    const after = workspaceSetStudioHybridDccToonMaterial(before, "cube", [1], toon);
    const projected = deriveStudioHybridDccViewportSnapshot(after);
    expect(projected.errors).toEqual([]);
    const asset = projected.assets[0]!;
    expect(asset.meshHash).toBe(baseline.meshHash);
    expect(asset.indices).toEqual(baseline.indices); expect(asset.positions).toEqual(baseline.positions);
    expect(asset.cornerNormals).toEqual(baseline.cornerNormals); expect(asset.cornerUvs).toEqual(baseline.cornerUvs);
    expect(asset.triangleMaterialSlots).toEqual(Float64Array.from([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]));
    const resource = createStudioHybridDccGeometryResource(asset);
    try { expect(resource.materialSlots).toEqual([0, 1]); expect(resource.geometry.groups).toEqual([0, 1, 0, 1, 0, 1].map((materialIndex, face) => ({ start: face * 6, count: 6, materialIndex }))); }
    finally { resource.dispose(); }
    expect(hashStudioEditableMesh(after.session.state.geometry.records.cube!.mesh)).toBe(baseline.meshHash);
    expect(projected.signature).not.toBe(deriveStudioHybridDccViewportSnapshot(before).signature);
  });
  it("동일한 style은 슬롯이 달라도 단일 draw material로 묶고 색만 바꾸면 geometry 슬롯 스트림을 재사용한다", () => {
    const a = workspaceSetStudioHybridDccToonMaterial(source(), "cube", [0, 1], toon);
    const first = deriveStudioHybridDccViewportSnapshot(a).assets[0]!;
    expect([...new Set(first.triangleMaterialSlots)]).toEqual([0]);
    const b = workspaceSetStudioHybridDccToonMaterial(a, "cube", [0, 1], { ...toon, baseColorSrgb: "#123456" });
    const next = deriveStudioHybridDccViewportSnapshot(b).assets[0]!;
    expect(next.triangleMaterialSlots).toBe(first.triangleMaterialSlots);
    const resource = createStudioHybridDccGeometryResource(next);
    try { expect(resource.materialSlots).toEqual([0]); expect(resource.geometry.groups).toEqual([{ start: 0, count: 36, materialIndex: 0 }]); }
    finally { resource.dispose(); }
  });
  it("수정자 캐시의 실제 슬롯 대응으로 uniform toon과 서로 다른 재질을 모두 표시한다", async () => {
    const uniform = await workspaceAddActiveModifier(workspaceSetStudioHybridDccToonMaterial(source(), "cube", [0, 1], toon), "array");
    const same = deriveStudioHybridDccViewportSnapshot(uniform);
    expect(same.errors).toEqual([]); expect(same.warnings).toEqual([]);
    expect(same.assets[0]?.renderSource).toBe("modifier-cache"); expect(same.assets[0]?.triangleCount).toBeGreaterThan(12);
    expect(same.assets[0]?.triangleMaterialSlots).toHaveLength(same.assets[0]?.triangleCount ?? 0);
    const mixed = workspaceSetStudioHybridDccToonMaterial(uniform, "cube", [1], { ...toon, baseColorSrgb: "#112233" });
    const evaluated = deriveStudioHybridDccViewportSnapshot(mixed);
    const cache = mixed.session.state.geometry.records.cube!.renderCache!;
    expect(evaluated.errors).toEqual([]); expect(evaluated.warnings).toEqual([]);
    const asset = evaluated.assets[0]!;
    expect(asset.renderSource).toBe("modifier-cache");
    expect(asset.triangleCount).toBe(same.assets[0]!.triangleCount);
    expect(asset.triangleMaterialSlots).toBe(cache.surface!.triangleMaterialSlots);
    expect([...new Set(asset.triangleMaterialSlots)]).toEqual([0, 1]);
    const resource = createStudioHybridDccGeometryResource(asset);
    try {
      expect(resource.materialSlots).toEqual([0, 1]);
      expect(resource.geometry.groups.reduce((sum, group) => sum + group.count, 0)).toBe(asset.indices.length);
    } finally { resource.dispose(); }
  });
  it("stale source·state·asset preview는 렌더와 signature를 바꾸지 않는다", () => {
    const workspace = source(); const expected = deriveStudioHybridDccViewportSnapshot(workspace);
    const sourceHash = workspace.session.state.geometry.records.cube!.meshHash;
    const preview = { assetId: "cube", sourceMeshHash: sourceHash, sourceStateHash: workspace.session.state.stateHash, slots: [0, 1], material: toon };
    for (const stale of [{ ...preview, assetId: "missing" }, { ...preview, sourceMeshHash: "stale" }, { ...preview, sourceStateHash: "stale" }]) {
      expect(deriveStudioHybridDccViewportSnapshot(workspace, "object", false, stale)).toEqual(expected);
    }
    const current = deriveStudioHybridDccViewportSnapshot(workspace, "object", false, preview);
    expect(current.assets[0]?.toonMaterials?.["0"]).toEqual(toon);
    expect(current.signature).not.toBe(expected.signature); expect(workspace.session.state.materials).toBeUndefined();
  });
  it("슬롯 스트림의 불일치는 geometry 생성 전에 거부하고 공통 표면 대응을 유지한다", () => {
    const workspace = source(); const mesh = workspace.session.state.geometry.records.cube!.mesh;
    expect(deriveStudioHybridDccTriangleMaterialSlots(mesh)).toHaveLength(12);
    expect(() => deriveStudioHybridDccMaterialGroups(new Float64Array(11), 36)).toThrow();
    expect(() => deriveStudioHybridDccMaterialGroups(Float64Array.from([-1]), 3)).toThrow();
    expect(() => deriveStudioHybridDccMaterialGroups(Float64Array.from([Number.MAX_SAFE_INTEGER + 1]), 3)).toThrow();
  });
  it("정본의 safe integer 슬롯을 32bit로 자르거나 임의 65535 상한으로 거부하지 않는다", () => {
    const workspace = source(), mesh = workspace.session.state.geometry.records.cube!.mesh;
    const large = Number.MAX_SAFE_INTEGER;
    const modified = { ...mesh, faces: mesh.faces.map((face) => ({ ...face, materialSlot: face.id === 1 ? large : face.materialSlot })) };
    const bound = synchronizeWorkspaceGeometryAuthority(workspace, hybridDccCommitGeometry(workspace.session, "cube", modified));
    const snapshot = deriveStudioHybridDccViewportSnapshot(workspaceSetStudioHybridDccToonMaterial(bound, "cube", [large], toon));
    expect(snapshot.errors).toEqual([]); expect(snapshot.assets[0]?.triangleMaterialSlots).toContain(large);
    const resource = createStudioHybridDccGeometryResource(snapshot.assets[0]!);
    try { expect(resource.materialSlots).toEqual([0, large]); }
    finally { resource.dispose(); }
  });
});
