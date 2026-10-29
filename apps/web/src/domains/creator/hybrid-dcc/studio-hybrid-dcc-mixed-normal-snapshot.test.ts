// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { createStudioUnitCubeMesh, hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";

import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { workspaceAddActiveModifier } from "./studio-hybrid-dcc-modifier-workspace";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority } from "./studio-hybrid-dcc-workspace";
import { deriveStudioHybridDccViewportSnapshot } from "./StudioHybridDccViewportCore";

function mixedWorkspace(allSmooth = false) {
  const original = createStudioHybridDccWorkspace("mixed-import");
  const cube = createStudioUnitCubeMesh();
  const mesh = { ...cube, faces: cube.faces.map((face) => ({ ...face, smooth: allSmooth || face.id < 3 })) };
  const session = hybridDccRegisterAsset(original.session, "mixed", mesh, { source: "mixed.obj", creator: "import", license: "unknown", useScope: "editorial", derivative: "imported" });
  return { ...synchronizeWorkspaceGeometryAuthority(original, session), activeAssetId: "mixed" };
}

describe("혼합 음영의 원본·캐시 표시 경계", () => {
  it.each([false, true])("전체 smooth=%s 원본의 fan 순서·실제 코너 법선·권위 해시를 유지한다", (allSmooth) => {
    const workspace = mixedWorkspace(allSmooth);
    const source = workspace.session.state.geometry.records.mixed?.mesh;
    if (!source) throw new Error("혼합 음영 원본이 없습니다.");
    const snapshot = deriveStudioHybridDccViewportSnapshot(workspace);
    expect(snapshot.errors).toEqual([]); expect(snapshot.warnings).toEqual([]);
    const asset = snapshot.assets[0];
    expect(asset).toMatchObject({ normalMode: allSmooth ? "smooth" : "split", renderSource: "authority-source", triangleCount: 12 });
    expect(asset?.cornerNormals).toHaveLength(108);
    expect(asset?.renderHash).toBe(hashStudioEditableMesh(source));
    expect(asset?.mesh).toBe(source);
  });

  it("코너 법선이 없는 수정자 캐시를 혼합 음영 원본에 잘못 붙이지 않고 명시적으로 원본을 표시한다", async () => {
    const workspace = await workspaceAddActiveModifier(mixedWorkspace(), "array");
    const record = workspace.session.state.geometry.records.mixed;
    expect(record?.renderCache?.indices.length).toBeGreaterThan(36);
    const snapshot = deriveStudioHybridDccViewportSnapshot(workspace);
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.assets[0]).toMatchObject({ normalMode: "split", renderSource: "authority-cache-fallback", triangleCount: 12 });
    expect(snapshot.assets[0]?.cornerNormals).toHaveLength(108);
    expect(snapshot.warnings).toContainEqual({ assetId: "mixed", message: expect.stringContaining("코너 법선") });
    expect(workspace.session.state.geometry.records.mixed).toBe(record);
    const cage = deriveStudioHybridDccViewportSnapshot(workspace, "face");
    expect(cage.assets[0]?.renderSource).toBe("authority-edit-cage"); expect(cage.warnings).toEqual([]);
  });
});
