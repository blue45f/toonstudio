import { describe, expect, it } from "vitest";

import { inspectCharacterLabMeshTopologyAndUvSeams } from "./rig-inspection";

describe("render/rig-inspection — inspectCharacterLabMeshTopologyAndUvSeams", () => {
  it("공간 해시 정점 용접과 엣지 해시를 통해 UV 심(seam) 선분과 쿼드/트라이앵글 와이어프레임 인덱스 수를 정확히 계산한다", () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 1, 0, 0, 0, -1, 0,
    ]);
    const uvsWithSeam = new Float32Array([
      0, 0, 1, 0, 0, 1,
      0, 0.5, 1, 0.5, 0, 0.9,
    ]);

    const quadReport = inspectCharacterLabMeshTopologyAndUvSeams({
      positions,
      uvs: uvsWithSeam,
      faceTopology: "quad",
    });

    expect(quadReport.vertexCount).toBe(6);
    expect(quadReport.triangleCount).toBe(2);
    expect(quadReport.weldedSpatialVertexCount).toBe(4);
    expect(quadReport.uvSeamEdgeCount).toBe(1);
    expect(Array.from(quadReport.uvSeamLineIndices)).toEqual([0, 1]);
    expect(quadReport.wireframeLineIndexCount).toBe(8);

    const triReport = inspectCharacterLabMeshTopologyAndUvSeams({
      positions,
      uvs: uvsWithSeam,
      faceTopology: "triangle",
    });
    expect(triReport.wireframeLineIndexCount).toBe(12);
  });
});
