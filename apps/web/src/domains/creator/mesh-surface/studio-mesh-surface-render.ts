/** 공유 surface의 삼각형·법선·원본 UV를 실제 표시 stream으로 옮긴다. JSON/GLB 재파싱은 하지 않는다. */
import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import type { StudioMeshSurfacePlan } from "./studio-mesh-surface-contracts";

export interface StudioMeshSurfaceRenderProjection {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly cornerNormals: Float32Array;
  readonly cornerUvs?: Float32Array;
  readonly triangleMaterialSlots: Float64Array;
}
const cached = new WeakMap<StudioEditableMesh, { readonly plan: StudioMeshSurfacePlan; readonly projection: StudioMeshSurfaceRenderProjection }>();

export function projectStudioMeshSurfaceForRender(mesh: StudioEditableMesh, plan: StudioMeshSurfacePlan): StudioMeshSurfaceRenderProjection {
  const previous = cached.get(mesh);
  if (previous?.plan === plan) return previous.projection;
  if (plan.validated.sourceMesh !== mesh || plan.geometry.indices.length !== plan.triangles.length * 3) throw new Error("표시 surface의 원본 또는 삼각형 대응이 일치하지 않습니다.");
  const byId = new Map<number, number>();
  const positions = new Float32Array(mesh.vertices.length * 3);
  for (const [index, vertex] of mesh.vertices.entries()) {
    if (byId.has(vertex.id)) throw new Error("표시 surface의 원본 정점 ID가 중복됩니다.");
    byId.set(vertex.id, index);
    positions.set([vertex.position.x, vertex.position.y, vertex.position.z], index * 3);
  }
  if (positions.some((value) => !Number.isFinite(value))) throw new Error("표시 surface의 정점이 유한 Float32 범위를 벗어났습니다.");
  const cornerCount = plan.triangles.length * 3;
  const indices = new Uint32Array(cornerCount), cornerNormals = new Float32Array(cornerCount * 3);
  const cornerUvs = mesh.uvLayer ? new Float32Array(cornerCount * 2) : undefined;
  const triangleMaterialSlots = new Float64Array(plan.triangles.length);
  const uvById = mesh.uvLayer ? new Map(mesh.uvLayer.corners.map((corner) => [corner.halfEdgeId, corner] as const)) : undefined;
  for (const [triangleIndex, triangle] of plan.triangles.entries()) {
    if (!Number.isSafeInteger(triangle.materialSlot) || triangle.materialSlot < 0) throw new Error("표시 surface의 재질 슬롯이 올바르지 않습니다.");
    triangleMaterialSlots[triangleIndex] = triangle.materialSlot;
    for (let corner = 0; corner < 3; corner += 1) {
      const write = triangleIndex * 3 + corner, vertexId = triangle.vertexIds[corner], halfEdgeId = triangle.cornerHalfEdgeIds[corner];
      const dense = vertexId === undefined ? undefined : byId.get(vertexId), output = plan.geometry.indices[write];
      if (dense === undefined || output === undefined || plan.geometry.outputSourceVertexIds[output] !== vertexId
        || plan.geometry.triangleSourceFaceIds[triangleIndex] !== triangle.faceId) throw new Error("표시 surface의 원본 정점·코너·면 provenance가 일치하지 않습니다.");
      for (let axis = 0; axis < 3; axis += 1) {
        const coordinate = plan.geometry.positions[output * 3 + axis];
        if (coordinate === undefined || Math.fround(coordinate) !== positions[dense * 3 + axis]) throw new Error("표시 surface와 내보내기의 실제 정점 좌표가 다릅니다.");
      }
      indices[write] = dense;
      const x = plan.geometry.normals[output * 3], y = plan.geometry.normals[output * 3 + 1], z = plan.geometry.normals[output * 3 + 2];
      if (x === undefined || y === undefined || z === undefined || ![x, y, z].every(Number.isFinite)) throw new Error("표시 surface의 코너 법선이 없습니다.");
      cornerNormals.set([x, y, z], write * 3);
      if (cornerUvs) {
        const uv = halfEdgeId === undefined ? undefined : uvById?.get(halfEdgeId);
        if (!uv) throw new Error("표시 surface의 원본 UV 코너가 없습니다.");
        cornerUvs.set([uv.u, uv.v], write * 2);
      }
    }
  }
  const projection = { positions, indices, cornerNormals, ...(cornerUvs ? { cornerUvs } : {}), triangleMaterialSlots };
  cached.set(mesh, { plan, projection }); return projection;
}
