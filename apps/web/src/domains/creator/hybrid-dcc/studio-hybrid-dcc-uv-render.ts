import { STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET } from "../mesh-surface/studio-mesh-surface-interactive-budget";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "../mesh-surface/studio-mesh-surface-render";

import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";

/** 실제 공유 삼각형의 원본 origin corner UV를 읽기 전용 파생 stream으로 재사용한다. */
export function deriveStudioHybridDccTriangleCornerUvs(mesh: StudioEditableMesh): Float32Array | undefined {
  if (!mesh.uvLayer) return undefined;
  const plan = planStudioMeshSurface(mesh, STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET, { allowCreaseMetadata: true, topologyPolicy: "editable" });
  if (!plan.ok) throw new Error(plan.issue.detail);
  return projectStudioMeshSurfaceForRender(mesh, plan.value).cornerUvs;
}
