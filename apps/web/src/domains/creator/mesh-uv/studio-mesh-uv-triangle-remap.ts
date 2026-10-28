/** 원본 face.he fan의 코너 순서만 이용해 삼각형 soup에 UV와 면·crease 속성을 옮긴다. */
import { STUDIO_EDITABLE_MESH_LIMITS, validateStudioEditableMeshSerializableAuthority } from "../studio-editable-half-edge-mesh";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology, type StudioMeshUvCorner } from "./studio-mesh-uv-authority";

import type { StudioEditableFace, StudioEditableMesh } from "../studio-editable-half-edge-mesh";

/** 위치나 UV 최근접 검색을 하지 않고 source fan·soup index·새 origin의 대응을 모두 검사한다. */
export function remapStudioMeshUvTriangleSoup(
  source: StudioEditableMesh,
  result: StudioEditableMesh,
  indices: Uint32Array,
): StudioEditableMesh {
  if (source.uvLayer === undefined) return result;
  const sourceValid = validateStudioEditableMeshSerializableAuthority(source);
  const resultValid = validateStudioEditableMeshSerializableAuthority(result);
  if (!sourceValid.ok || !resultValid.ok) throw new Error("삼각화 UV의 원본 또는 결과 메시 정본이 올바르지 않습니다.");
  if (indices.length % 3 !== 0 || indices.length > STUDIO_EDITABLE_MESH_LIMITS.maxEdges
    || result.vertices.length !== source.vertices.length || result.halfEdges.length !== indices.length
    || result.faces.length * 3 !== indices.length) throw new Error("삼각화 UV의 정점·삼각형·코너 수가 일치하지 않습니다.");
  const layer = decodeStudioMeshUvLayer(source.uvLayer, source);
  const vertexIndex = new Map(source.vertices.map(({ id }, index) => [id, index]));
  const corners: StudioMeshUvCorner[] = [];
  const faces: StudioEditableFace[] = [];
  const creases: number[] = [];
  for (const face of source.faces) {
    const loop: number[] = [];
    let id = face.he;
    do {
      const edge = source.halfEdges[id];
      if (!edge || edge.id !== id || edge.face !== face.id || loop.length >= source.halfEdges.length) {
        throw new Error("삼각화 UV 원본 면의 코너 순환이 올바르지 않습니다.");
      }
      loop.push(id); id = edge.next;
    } while (id !== face.he);
    for (let index = 1; index + 1 < loop.length; index += 1) {
      const sourceIds = [loop[0], loop[index], loop[index + 1]];
      const triangleIndex = faces.length;
      const targetFace = result.faces[triangleIndex];
      if (!targetFace || targetFace.id !== triangleIndex || targetFace.he !== corners.length) {
        throw new Error("삼각화 UV의 원본 면과 결과 삼각형 순서가 일치하지 않습니다.");
      }
      faces.push({ ...targetFace, materialSlot: face.materialSlot, smooth: face.smooth });
      for (let cornerIndex = 0; cornerIndex < 3; cornerIndex += 1) {
        const sourceId = sourceIds[cornerIndex];
        const nextSourceId = sourceIds[(cornerIndex + 1) % 3];
        const edge = sourceId === undefined ? undefined : source.halfEdges[sourceId];
        const uv = sourceId === undefined ? undefined : layer.corners[sourceId];
        const origin = edge ? source.halfEdges[edge.prev]?.vertex : undefined;
        const offset = corners.length;
        const targetEdge = result.halfEdges[offset];
        const expectedNext = triangleIndex * 3 + (cornerIndex + 1) % 3;
        if (!edge || !uv || uv.halfEdgeId !== sourceId || origin === undefined
          || vertexIndex.get(origin) !== indices[offset] || !targetEdge || targetEdge.id !== offset
          || targetEdge.face !== triangleIndex || targetEdge.next !== expectedNext
          || result.halfEdges[targetEdge.prev]?.vertex !== indices[offset]) {
          throw new Error("삼각화 UV의 원본 fan·정점 인덱스·결과 origin 대응이 일치하지 않습니다.");
        }
        corners.push({ halfEdgeId: offset, u: uv.u, v: uv.v });
        // 원본 polygon 경계만 crease를 전달하고 새 fan 대각선은 crease 0으로 둔다.
        creases.push(edge.next === nextSourceId ? edge.crease : 0);
      }
    }
  }
  if (corners.length !== indices.length || faces.length !== result.faces.length) {
    throw new Error("삼각화 UV의 원본 면·코너 대응이 누락됐습니다.");
  }
  const attributed: StudioEditableMesh = {
    ...result,
    vertices: result.vertices.map((vertex, index) => {
      const original = source.vertices[index];
      if (!original || vertex.id !== index || vertexIndex.get(original.id) !== index) {
        throw new Error("삼각화 UV의 정점 인덱스 순서가 다릅니다.");
      }
      return { ...vertex, crease: original.crease };
    }),
    halfEdges: result.halfEdges.map((edge, index) => ({ ...edge, crease: creases[index] ?? 0 })),
    faces,
  };
  return { ...attributed, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(attributed), corners }, attributed) };
}
