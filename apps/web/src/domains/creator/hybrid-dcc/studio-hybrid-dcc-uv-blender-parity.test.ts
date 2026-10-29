import { describe, expect, it } from "vitest";

import observed from "../../../../../../tests/corpus/blender-uv/uv-transform-5.2.json";
import { createStudioEditableMeshFromPolygons } from "../studio-editable-half-edge-mesh";
import { hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { createStudioHybridDccUvSelection, deriveStudioHybridDccUvEditorModel, workspaceTransformUvIslands } from "./studio-hybrid-dcc-uv-edit";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority } from "./studio-hybrid-dcc-workspace";

function source() {
  const geometry = createStudioEditableMeshFromPolygons([
    { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
  ], [[0, 1, 2], [0, 2, 3]]);
  const mesh = { ...geometry, uvLayer: { revision: 1 as const, topologyHash: hashStudioMeshUvTopology(geometry),
    corners: observed.inputUVs.map((uv, halfEdgeId) => {
      const [u, v] = uv;
      if (u === undefined || v === undefined) throw new Error("Blender 관측 UV가 없습니다.");
      return { halfEdgeId, u, v };
    }),
  } };
  const workspace = createStudioHybridDccWorkspace("blender-uv-parity");
  return synchronizeWorkspaceGeometryAuthority({ ...workspace, activeAssetId: "native-input" }, hybridDccRegisterAsset(workspace.session, "native-input", mesh, {
    source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
  }));
}

describe("실제 Blender 5.2 관측과 웹 UV 변환 대조", () => {
  it.each(["rotatePi", "scaleZero"] as const)("%s의 모든 코너가 원본 관측과 Float32 오차 안에서 일치한다", (kind) => {
    const workspace = source();
    const selection = createStudioHybridDccUvSelection(workspace, [], observed.inputUVs.map((_, id) => id));
    const request = kind === "rotatePi" ? { kind: "rotate" as const, angleRad: Math.PI }
      : { kind: "scale" as const, value: { x: 0, y: 0 } };
    const result = workspaceTransformUvIslands(workspace, selection, request);
    const model = deriveStudioHybridDccUvEditorModel(result.workspace);
    if (!model) throw new Error("웹 UV 변환 결과가 없습니다.");
    expect(observed.observed[kind].operatorStatus).toEqual(["FINISHED"]);
    expect(model.corners).toHaveLength(observed.observed[kind].uvs.length);
    model.corners.forEach((corner, index) => {
      const expected = observed.observed[kind].uvs[index];
      if (!expected || expected[0] === undefined || expected[1] === undefined) throw new Error("원본 관측 코너가 없습니다.");
      expect(Math.abs(corner.u - expected[0])).toBeLessThan(1e-6);
      expect(Math.abs(corner.v - expected[1])).toBeLessThan(1e-6);
    });
  });
});
