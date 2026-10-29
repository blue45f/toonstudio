import { describe, expect, it } from "vitest";

import {
  createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, extrudeStudioEditableMeshFaces,
  extrudeStudioEditableMeshFacesWithReceipt, hashStudioEditableMesh, isIssuedStudioEditableMeshExtrudeRegionReceipt,
  serializeStudioEditableMesh, validateStudioEditableMeshSerializableAuthority, weldStudioEditableMesh,
  type StudioEditableMesh, type StudioEditableMeshResult,
} from "../studio-editable-half-edge-mesh";

import { decodeStudioMeshUvLayer, hashStudioMeshUvLayer, hashStudioMeshUvTopology } from "./studio-mesh-uv-authority";
import { preserveStudioMeshUvForUnchangedTopology, remapStudioMeshUvExtrudeRegion } from "./studio-mesh-uv-topology-remap";

function value<T>(result: StudioEditableMeshResult<T>): T {
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return result.value;
}
/** 같은 3D 정점의 코너에도 다른 UV를 넣어 위치·정점 ID에 의한 잘못된 통합을 검출한다. */
function withUv(mesh = createStudioUnitCubeMesh()): StudioEditableMesh {
  return { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners: mesh.halfEdges.map(({ id }) => ({ halfEdgeId: id, u: Math.fround(id * 0.125 - 2), v: Math.fround(10 + id * 0.25) })) }, mesh) };
}
function faceUvs(mesh: StudioEditableMesh, faceId: number): ReadonlyArray<readonly [number, number]> {
  const face = mesh.faces[faceId]; if (!face || !mesh.uvLayer) throw new Error("UV 면이 없습니다.");
  const points: Array<readonly [number, number]> = []; let id = face.he;
  do {
    const edge = mesh.halfEdges[id]; const corner = mesh.uvLayer.corners[id];
    if (!edge || !corner) throw new Error("UV 코너가 없습니다.");
    points.push([corner.u, corner.v]); id = edge.next;
  } while (id !== face.he);
  return points;
}
function cornerUv(mesh: StudioEditableMesh, id: number): readonly [number, number] {
  const uv = mesh.uvLayer?.corners[id]; if (!uv) throw new Error("원본 UV 코너가 없습니다."); return [uv.u, uv.v];
}

describe("위상 명령의 정확한 UV 전달", () => {
  it("Weld가 위상·코너 ID를 바꾸지 않으면 UV와 이음새를 그대로 보존한다", () => {
    const source = withUv(); const snapshot = serializeStudioEditableMesh(source);
    const result = value(weldStudioEditableMesh(source, 1e-5));
    expect(hashStudioMeshUvTopology(result)).toBe(hashStudioMeshUvTopology(source));
    expect(result.uvLayer).toEqual(source.uvLayer);
    expect(source.uvLayer && result.uvLayer && hashStudioMeshUvLayer(result.uvLayer)).toBe(source.uvLayer && hashStudioMeshUvLayer(source.uvLayer));
    expect(serializeStudioEditableMesh(source)).toEqual(snapshot);
    expect(validateStudioEditableMeshSerializableAuthority(result).ok).toBe(true);
  });

  it("다른 코너 위상으로 기존 UV를 복사하지 않는다", () => {
    const source = withUv();
    const other = createStudioEditableMeshFromPolygons([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }], [[0, 1, 2]]);
    expect(preserveStudioMeshUvForUnchangedTopology(source, other)).toBe(other);
    expect(other.uvLayer).toBeUndefined();
  });

  it.each([[0], [0, 2], [0, 1]])("영역 %j의 기존 면·cap·side를 원본 코너와 경계 끝점으로 연결한다", (...ids: number[]) => {
    const source = withUv(); const before = serializeStudioEditableMesh(source);
    const { mesh, receipt } = value(extrudeStudioEditableMeshFacesWithReceipt(source, ids, 0.25));
    expect(isIssuedStudioEditableMeshExtrudeRegionReceipt(receipt)).toBe(true);
    expect(receipt.sourceMeshHash).toBe(hashStudioEditableMesh(source));
    expect(receipt.resultMeshHash).toBe(hashStudioEditableMesh(mesh));
    expect(mesh.uvLayer?.corners).toHaveLength(mesh.halfEdges.length);
    expect(mesh.uvLayer?.topologyHash).toBe(hashStudioMeshUvTopology(mesh));
    for (const [from, to] of receipt.faceRemap.entries) {
      if (to === null) throw new Error("기존 면 대응이 없습니다.");
      expect(faceUvs(mesh, to)).toEqual(faceUvs(source, from));
    }
    receipt.sourceFaceIds.forEach((from, index) => {
      const cap = receipt.capFaceIds[index]; if (cap === undefined) throw new Error("cap이 없습니다.");
      expect(faceUvs(mesh, cap)).toEqual(faceUvs(source, from));
    });
    receipt.boundaryHalfEdgeIds.forEach((id, index) => {
      const edge = source.halfEdges[id]; const side = receipt.sideFaceIds[index];
      if (!edge || side === undefined) throw new Error("side 원본이 없습니다.");
      const a = cornerUv(source, edge.id); const b = cornerUv(source, edge.next);
      expect(faceUvs(mesh, side)).toEqual([a, b, b, a]);
    });
    expect(validateStudioEditableMeshSerializableAuthority(mesh).ok).toBe(true);
    expect(serializeStudioEditableMesh(source)).toEqual(before);
  });

  it("열린 단일 면과 음수 거리도 side 생성 순서를 보존하며 legacy 경로와 같은 UV를 만든다", () => {
    const source = withUv(createStudioEditableMeshFromPolygons([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }], [[0, 1, 2, 3]]));
    const result = value(extrudeStudioEditableMeshFacesWithReceipt(source, [0], -0.2));
    expect(result.mesh.uvLayer?.corners).toHaveLength(20);
    expect(result.receipt.sideFaceIds).toHaveLength(4);
    expect(value(extrudeStudioEditableMeshFaces(source, [0], -0.2)).uvLayer).toEqual(result.mesh.uvLayer);
  });

  it("영수증의 복제품과 UV 원본·결과가 바뀐 재사용은 거부한다", () => {
    const source = withUv(); const mutation = value(extrudeStudioEditableMeshFacesWithReceipt(source, [0], 0.25));
    expect(() => remapStudioMeshUvExtrudeRegion(source, { ...mutation, receipt: { ...mutation.receipt } })).toThrow(/발급된/u);
    const layer = source.uvLayer; if (!layer) throw new Error("UV가 없습니다.");
    const changedSource = { ...source, uvLayer: { ...layer, corners: layer.corners.map((corner) => ({ ...corner, u: corner.u + 1 })) } };
    expect(() => remapStudioMeshUvExtrudeRegion(changedSource, mutation)).toThrow(/일치/u);
    const targetLayer = mutation.mesh.uvLayer; if (!targetLayer) throw new Error("결과 UV가 없습니다.");
    const changedTarget = { ...mutation.mesh, uvLayer: { ...targetLayer, corners: targetLayer.corners.map((corner) => ({ ...corner, v: corner.v + 1 })) } };
    expect(() => remapStudioMeshUvExtrudeRegion(source, { ...mutation, mesh: changedTarget })).toThrow(/일치/u);
  });

  it("UV가 없는 기존 region·Weld의 메시 해시와 레이어 부재는 변하지 않는다", () => {
    const source = createStudioUnitCubeMesh();
    const expected = [
      { ids: [0], hash: "mesh:sha256:2937414c89d41cc33eebdd41a0ec8e77f55384b95109d627052a3619839aaecb" },
      { ids: [0, 2], hash: "mesh:sha256:93809522ff816abdb76e00b21e3b38e51e6a36d5db79371c1264c095a9f0a48c" },
      { ids: [0, 1], hash: "mesh:sha256:697fcdfb290b6a9070f68ac9a1bbb5d0997b0e4e0436337ecd7bf143997eb9ce" },
    ];
    for (const { ids, hash } of expected) {
      const result = value(extrudeStudioEditableMeshFacesWithReceipt(source, ids, 0.25));
      expect(hashStudioEditableMesh(result.mesh)).toBe(hash); expect(result.receipt.resultMeshHash).toBe(hash);
      expect(result.mesh.uvLayer).toBeUndefined();
    }
    const welded = value(weldStudioEditableMesh(source, 1e-5));
    expect(hashStudioEditableMesh(welded)).toBe("mesh:sha256:382ba1b2bd4ec10545dc740c997ae7daade8f136074efb0631e755666c59b77d");
    expect(welded.uvLayer).toBeUndefined();
  });
});
