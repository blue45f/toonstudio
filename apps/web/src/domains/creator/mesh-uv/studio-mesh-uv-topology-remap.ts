/** 코너의 생성 순서·발급 영수증으로만 UV를 옮긴다. 위치 검색이나 새 투영은 하지 않는다. */
import { hashStudioEditableMesh, isIssuedStudioEditableMeshExtrudeRegionReceipt } from "../studio-editable-half-edge-mesh";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology, type StudioMeshUvCorner } from "./studio-mesh-uv-authority";

import type { StudioEditableMesh, StudioEditableMeshExtrudeRegionMutation } from "../studio-editable-half-edge-mesh";

function faceCorners(mesh: StudioEditableMesh, faceId: number): readonly number[] {
  const face = mesh.faces[faceId];
  if (!face || face.id !== faceId) throw new Error("UV 대응 면이 현재 메시에 없습니다.");
  const result: number[] = [];
  let id = face.he;
  for (let count = 0; count < mesh.halfEdges.length; count += 1) {
    const edge = mesh.halfEdges[id];
    if (!edge || edge.id !== id || edge.face !== faceId) throw new Error("UV 대응 면의 코너 순환이 올바르지 않습니다.");
    result.push(id); id = edge.next;
    if (id === face.he) return result;
  }
  throw new Error("UV 대응 면의 코너 순환이 닫히지 않습니다.");
}

/** Weld가 정점·반변·면 ID와 연결을 그대로 만든 경우에만 기존 UV를 정확히 보존한다. */
export function preserveStudioMeshUvForUnchangedTopology(source: StudioEditableMesh, result: StudioEditableMesh): StudioEditableMesh {
  if (source.uvLayer === undefined) return result;
  const layer = decodeStudioMeshUvLayer(source.uvLayer, source);
  return layer.topologyHash === hashStudioMeshUvTopology(result) ? { ...result, uvLayer: layer } : result;
}

/**
 * 기존 면·cap은 sourceFace의 face.he 순서를 유지한다. side는 boundaryHalfEdge 순서로 생성되는
 * [baseOrigin, baseDestination, topDestination, topOrigin]이며 원본 edge 양끝 UV를 [a,b,b,a]로 잇는다.
 * 따라서 새 옆면 UV는 접힌 상태다. 자동 펼치기와 구분하여 원본 endpoint 대응만 보존한다.
 */
export function remapStudioMeshUvExtrudeRegion(source: StudioEditableMesh, mutation: StudioEditableMeshExtrudeRegionMutation): StudioEditableMesh {
  if (source.uvLayer === undefined) return mutation.mesh;
  const { mesh: result, receipt } = mutation;
  if (!isIssuedStudioEditableMeshExtrudeRegionReceipt(receipt)
    || receipt.sourceMeshHash !== hashStudioEditableMesh(source)
    || receipt.resultMeshHash !== hashStudioEditableMesh(result)) {
    throw new Error("발급된 영역 밀기 영수증과 UV 원본·결과가 일치하지 않습니다.");
  }
  const layer = decodeStudioMeshUvLayer(source.uvLayer, source);
  const corner = (id: number) => {
    const value = layer.corners[id];
    if (!value || value.halfEdgeId !== id) throw new Error("영역 밀기의 원본 UV 코너가 없습니다.");
    return value;
  };
  const corners: Array<StudioMeshUvCorner | undefined> = new Array(result.halfEdges.length);
  const writtenFaces = new Set<number>();
  const writeFace = (id: number, sourceCorners: readonly StudioMeshUvCorner[]) => {
    const target = faceCorners(result, id);
    if (writtenFaces.has(id) || target.length !== sourceCorners.length) throw new Error("영역 밀기의 UV 코너 수 또는 면 대응이 다릅니다.");
    writtenFaces.add(id);
    target.forEach((halfEdgeId, index) => {
      const uv = sourceCorners[index];
      if (!uv || corners[halfEdgeId]) throw new Error("영역 밀기의 UV 코너 대응이 중복되거나 누락됐습니다.");
      corners[halfEdgeId] = { halfEdgeId, u: uv.u, v: uv.v };
    });
  };
  const remap = new Map(receipt.faceRemap.entries);
  if (remap.size !== source.faces.length || receipt.sourceFaceIds.length !== receipt.capFaceIds.length
    || receipt.sideFaceIds.length !== receipt.boundaryHalfEdgeIds.length) throw new Error("영역 밀기 영수증의 UV 면·경계 대응이 다릅니다.");
  for (const face of source.faces) {
    const target = remap.get(face.id);
    if (target === undefined || target === null) throw new Error("영역 밀기 영수증에 기존 면의 UV 대응이 없습니다.");
    writeFace(target, faceCorners(source, face.id).map(corner));
  }
  const selected = new Set(receipt.sourceFaceIds);
  receipt.sourceFaceIds.forEach((id, index) => {
    if (remap.get(id) !== receipt.capFaceIds[index]) throw new Error("영역 밀기의 cap UV 대응이 다릅니다.");
  });
  receipt.boundaryHalfEdgeIds.forEach((id, index) => {
    const edge = source.halfEdges[id];
    const next = edge ? source.halfEdges[edge.next] : undefined;
    const previous = edge ? source.halfEdges[edge.prev] : undefined;
    const side = receipt.sideFaceIds[index];
    if (!edge || !next || !previous || next.face !== edge.face || previous.face !== edge.face
      || !selected.has(edge.face) || (edge.twin >= 0 && selected.has(source.halfEdges[edge.twin]?.face ?? -1))
      || source.halfEdges[next.prev]?.vertex !== edge.vertex || side === undefined) throw new Error("영역 밀기의 side UV 원본 경계 끝점이 다릅니다.");
    const a = corner(edge.id); const b = corner(next.id);
    writeFace(side, [a, b, b, a]);
  });
  const complete: StudioMeshUvCorner[] = [];
  for (let id = 0; id < corners.length; id += 1) {
    const value = corners[id];
    if (!value) throw new Error("영역 밀기의 결과 UV 코너가 누락됐습니다.");
    complete.push(value);
  }
  return { ...result, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(result), corners: complete }, result) };
}
