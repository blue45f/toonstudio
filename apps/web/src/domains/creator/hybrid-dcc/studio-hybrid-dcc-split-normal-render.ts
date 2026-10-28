/** flat/smooth 면의 공유 표면 법선을 실제 triangle corner 순서로 재사용한다. */
import { STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET } from "../mesh-surface/studio-mesh-surface-interactive-budget";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "../mesh-surface/studio-mesh-surface-render";

import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";

export function deriveStudioHybridDccSplitCornerNormals(mesh: StudioEditableMesh): Float32Array {
  const plan = planStudioMeshSurface(mesh, STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET, { allowCreaseMetadata: true, topologyPolicy: "editable" });
  if (!plan.ok) throw new Error(plan.issue.detail);
  if (mesh.faces.some(({ smooth }) => smooth) && (
    mesh.vertices.some(({ crease }) => crease !== 0) || mesh.halfEdges.some(({ crease }) => crease !== 0)
  )) throw new Error("crease 음영은 별도 smoothing-island 계약이 필요합니다.");
  return projectStudioMeshSurfaceForRender(mesh, plan.value).cornerNormals;
}
