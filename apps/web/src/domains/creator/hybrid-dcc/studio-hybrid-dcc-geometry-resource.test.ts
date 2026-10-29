import { describe, expect, it, vi } from "vitest";

import { createStudioHybridDccGeometryResource } from "./studio-hybrid-dcc-geometry-resource";

const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
const indices = Uint32Array.from([0, 1, 2, 0, 3, 1]);
const cornerUvs = Float32Array.from([0, 0, 1, 0, 0, 1, 3, 2, 3, 3, 2, 2]);

describe("UV 코너 경계의 실제 Three.js geometry", () => {
  it("smooth 법선은 UV seam 전의 이웃 면으로 계산하고 UV만 삼각형별로 분리한다", () => {
    const beforePositions = positions.slice();
    const beforeIndices = indices.slice();
    const base = createStudioHybridDccGeometryResource({ positions, indices, normalMode: "smooth" });
    const split = createStudioHybridDccGeometryResource({ positions, indices, normalMode: "smooth", cornerUvs });
    try {
      expect(base.geometry.index?.count).toBe(6);
      expect(split.geometry.index).toBeNull();
      expect(split.geometry.getAttribute("position").count).toBe(6);
      expect(Array.from(split.geometry.getAttribute("uv").array)).toEqual(Array.from(cornerUvs));
      const originalNormals = base.geometry.getAttribute("normal");
      const splitNormals = split.geometry.getAttribute("normal");
      indices.forEach((sourceVertexId, corner) => {
        expect([splitNormals.getX(corner), splitNormals.getY(corner), splitNormals.getZ(corner)])
          .toEqual([originalNormals.getX(sourceVertexId), originalNormals.getY(sourceVertexId), originalNormals.getZ(sourceVertexId)]);
      });
      expect(positions).toEqual(beforePositions);
      expect(indices).toEqual(beforeIndices);
    } finally { base.dispose(); split.dispose(); }
  });

  it("flat 면의 UV seam을 만들 때에도 원래의 삼각형 법선과 면 선택 순서를 보존한다", () => {
    const base = createStudioHybridDccGeometryResource({ positions, indices, normalMode: "flat" });
    const split = createStudioHybridDccGeometryResource({ positions, indices, normalMode: "flat", cornerUvs });
    try {
      expect(split.geometry.getAttribute("position").array).toEqual(base.geometry.getAttribute("position").array);
      expect(split.geometry.getAttribute("normal").array).toEqual(base.geometry.getAttribute("normal").array);
      expect(split.geometry.boundingBox).toEqual(base.geometry.boundingBox);
      const disposeGeometry = vi.spyOn(split.geometry, "dispose");
      const disposeEdges = vi.spyOn(split.edges, "dispose");
      split.dispose();
      expect(disposeGeometry).toHaveBeenCalledOnce();
      expect(disposeEdges).toHaveBeenCalledOnce();
    } finally { base.dispose(); }
  });

  it("잘못된 UV 개수와 유한하지 않은 코너는 GPU 자원을 만들기 전에 거부한다", () => {
    expect(() => createStudioHybridDccGeometryResource({ positions, indices, normalMode: "flat", cornerUvs: new Float32Array(2) })).toThrow(/UV/u);
    expect(() => createStudioHybridDccGeometryResource({ positions, indices, normalMode: "flat", cornerUvs: Float32Array.from([...cornerUvs.slice(0, 11), Infinity]) })).toThrow(/UV/u);
  });
});
