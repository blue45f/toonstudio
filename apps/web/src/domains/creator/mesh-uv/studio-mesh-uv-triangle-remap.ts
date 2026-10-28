/** 공유 surface의 원본 코너 순서만 이용해 삼각형 soup에 UV와 면·crease 속성을 옮긴다. */
import { STUDIO_EDITABLE_MESH_LIMITS, validateStudioEditableMeshSerializableAuthority } from "../studio-editable-half-edge-mesh";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology, type StudioMeshUvCorner } from "./studio-mesh-uv-authority";

import type { StudioEditableFace, StudioEditableMesh } from "../studio-editable-half-edge-mesh";

/** 위치나 UV 최근접 검색을 하지 않고 surface triangle·soup index·새 origin의 대응을 모두 검사한다. */
export function remapStudioMeshUvTriangleSoup(
  source: StudioEditableMesh,
  result: StudioEditableMesh,
  indices: Uint32Array,
): StudioEditableMesh {
  const sourceValid = validateStudioEditableMeshSerializableAuthority(source);
  const resultValid = validateStudioEditableMeshSerializableAuthority(result);
  if (!sourceValid.ok || !resultValid.ok) throw new Error("삼각화 UV의 원본 또는 결과 메시 정본이 올바르지 않습니다.");
  if (indices.length % 3 !== 0 || indices.length > STUDIO_EDITABLE_MESH_LIMITS.maxEdges
    || result.vertices.length !== source.vertices.length || result.halfEdges.length !== indices.length
    || result.faces.length * 3 !== indices.length) throw new Error("삼각화 UV의 정점·삼각형·코너 수가 일치하지 않습니다.");
  const layer = source.uvLayer === undefined ? undefined : decodeStudioMeshUvLayer(source.uvLayer, source);
  const surface = planStudioMeshSurface(source, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" });
  if (!surface.ok) throw new Error(`삼각화 UV의 원본 표면을 확인할 수 없습니다: ${surface.issue.detail}`);
  if (surface.value.triangles.length * 3 !== indices.length) throw new Error("삼각화 UV의 공통 표면과 코너 수가 일치하지 않습니다.");
  const vertexIndex = new Map(source.vertices.map(({ id }, index) => [id, index]));
  const facesById = new Map(source.faces.map((face) => [face.id, face]));
  const corners: StudioMeshUvCorner[] = [];
  const faces: StudioEditableFace[] = [];
  const creases: number[] = [];
  for (const triangle of surface.value.triangles) {
    const face = facesById.get(triangle.faceId);
    if (!face) throw new Error("삼각화 UV의 원본 면 ID가 없습니다.");
    const sourceIds = triangle.cornerHalfEdgeIds;
    const triangleIndex = faces.length;
    const targetFace = result.faces[triangleIndex];
    if (!targetFace || targetFace.id !== triangleIndex || targetFace.he !== triangleIndex * 3) {
      throw new Error("삼각화 UV의 원본 면과 결과 삼각형 순서가 일치하지 않습니다.");
    }
    faces.push({ ...targetFace, materialSlot: face.materialSlot, smooth: face.smooth });
    for (let cornerIndex = 0; cornerIndex < 3; cornerIndex += 1) {
      const sourceId = sourceIds[cornerIndex];
      const nextSourceId = sourceIds[(cornerIndex + 1) % 3];
      const edge = sourceId === undefined ? undefined : source.halfEdges[sourceId];
      const uv = sourceId === undefined ? undefined : layer?.corners[sourceId];
      const origin = edge ? source.halfEdges[edge.prev]?.vertex : undefined;
      const offset = triangleIndex * 3 + cornerIndex;
      const targetEdge = result.halfEdges[offset];
      const expectedNext = triangleIndex * 3 + (cornerIndex + 1) % 3;
      if (!edge || (layer && (!uv || uv.halfEdgeId !== sourceId)) || origin === undefined
        || origin !== triangle.vertexIds[cornerIndex] || vertexIndex.get(origin) !== indices[offset] || !targetEdge || targetEdge.id !== offset
        || targetEdge.face !== triangleIndex || targetEdge.next !== expectedNext
        || result.halfEdges[targetEdge.prev]?.vertex !== indices[offset]) {
        throw new Error("삼각화 UV의 공통 표면·정점 인덱스·결과 origin 대응이 일치하지 않습니다.");
      }
      if (uv) corners.push({ halfEdgeId: offset, u: uv.u, v: uv.v });
      // 원본 polygon 경계만 crease를 전달하고 새 내부 대각선은 crease 0으로 둔다.
      creases.push(edge.next === nextSourceId ? edge.crease : 0);
    }
  }
  if ((layer && corners.length !== indices.length) || faces.length !== result.faces.length) {
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
  return layer === undefined ? attributed : { ...attributed,
    uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(attributed), corners }, attributed) };
}
