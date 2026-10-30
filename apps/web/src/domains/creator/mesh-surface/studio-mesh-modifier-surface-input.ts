/** 절단·두께 생성도 표시·GLB와 같은 삼각형/원본 코너 표를 입력으로 사용한다. */
import { planStudioMeshSurface } from "./studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "./studio-mesh-surface-render";

import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import type { StudioModifierTriangleSurface } from "./studio-mesh-modifier-surface";

export function deriveStudioModifierSurfaceInput(mesh: StudioEditableMesh) {
  const planned = planStudioMeshSurface(mesh, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" });
  if (!planned.ok) throw new Error(planned.issue.detail);
  const projection = projectStudioMeshSurfaceForRender(mesh, planned.value);
  const surfaces: StudioModifierTriangleSurface[] = planned.value.triangles.map((triangle) => {
    const face = mesh.faces[triangle.faceId]; if (!face) throw new Error("변형 입력의 원본 면이 없습니다.");
    const corner = (index: number) => {
      const id = triangle.cornerHalfEdgeIds[index], next = triangle.vertexIds[(index + 1) % 3];
      const edge = id === undefined ? undefined : mesh.halfEdges[id];
      const vertex = edge ? mesh.vertices[mesh.halfEdges[edge.prev]?.vertex ?? -1] : undefined;
      if (!edge || !vertex || vertex.id !== triangle.vertexIds[index]) throw new Error("변형 입력의 원본 코너 대응이 잘못됐습니다.");
      return { vertexCrease: vertex.crease, edgeCrease: edge.vertex === next ? edge.crease : 0 };
    };
    return { materialSlot: face.materialSlot, smooth: face.smooth, corners: [corner(0), corner(1), corner(2)] };
  });
  const uvs = projection.cornerUvs ? Array.from({ length: projection.indices.length }, (_, index) => ({
    u: projection.cornerUvs?.[index * 2] ?? NaN, v: projection.cornerUvs?.[index * 2 + 1] ?? NaN,
  })) : undefined;
  return { positions: projection.positions, indices: projection.indices, surfaces, uvs };
}
