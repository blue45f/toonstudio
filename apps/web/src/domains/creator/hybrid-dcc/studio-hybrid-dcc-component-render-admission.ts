/** 표시와 동일한 surface 계약으로 좌표 편집의 새 표시 손실만 커밋 전에 거부한다. */
import { STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET } from "../mesh-surface/studio-mesh-surface-interactive-budget";
import { validateStudioMeshSurfaceFloat32Triangles } from "../mesh-surface/studio-mesh-surface-float32";
import { planStudioMeshSurface, type StudioMeshSurfaceBudget } from "../mesh-surface/studio-mesh-surface-plan";
import { prepareFaceWithMeter } from "../mesh-surface/studio-mesh-surface-triangulation";
import { StudioMeshSurfaceWorkMeter } from "../mesh-surface/studio-mesh-surface-work";

import { readStudioHybridDccComponentSurfacePlan } from "./studio-hybrid-dcc-component-surface-pick";

import type { StudioEditableMesh, StudioEditableVertex } from "../studio-editable-half-edge-mesh";

export function validateStudioHybridDccComponentRenderAdmission(
  source: StudioEditableMesh,
  result: StudioEditableMesh,
  budget: StudioMeshSurfaceBudget = STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET,
): void {
  if (source.faces !== result.faces || source.halfEdges !== result.halfEdges
    || source.vertices.length !== result.vertices.length) {
    throw new Error("요소 변형의 원본 면·모서리 연결이 바뀌었습니다.");
  }
  const original = budget === STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET
    ? readStudioHybridDccComponentSurfacePlan(source) : planStudioMeshSurface(source, budget, { allowCreaseMetadata: true, topologyPolicy: "editable" });
  if (original.ok) {
    const next = planStudioMeshSurface(result, budget, { allowCreaseMetadata: true, topologyPolicy: "editable" });
    if (!next.ok) {
      const faceId = next.issue.faceIds?.[0];
      throw new Error(`${faceId === undefined ? "공유 표면이" : `면 ${faceId}가`} 변형 후 화면에 표시될 수 없습니다. ${next.issue.detail}`);
    }
    return;
  }

  // 기존 미지원·예산 초과 면이 다른 정상 면의 새 손실을 가리지 않도록 변경한 면을 각각 대조한다.
  const beforeById = new Map(source.vertices.map((vertex) => [vertex.id, vertex]));
  const afterById = new Map(result.vertices.map((vertex) => [vertex.id, vertex]));
  const beforeMeter = new StudioMeshSurfaceWorkMeter(budget), afterMeter = new StudioMeshSurfaceWorkMeter(budget);
  const admit = (face: StudioEditableMesh["faces"][number], edges: readonly number[], ids: readonly number[],
    vertices: ReadonlyMap<number, StudioEditableVertex>, meter: StudioMeshSurfaceWorkMeter) => {
    meter.charge("linear", ids.length); meter.charge("polygonPairs", ids.length * ids.length);
    const prepared = prepareFaceWithMeter(face, edges, ids, vertices, Boolean(source.uvLayer), meter);
    if (!prepared.ok) return prepared;
    meter.charge("triangles", prepared.value.face.triangles.length);
    const precision = validateStudioMeshSurfaceFloat32Triangles(prepared.value.face.triangles, vertices, face.id);
    return precision.ok ? prepared : precision;
  };
  try {
    for (const face of source.faces) {
      const ids: number[] = [], edges: number[] = []; let current = face.he, changed = false;
      do {
        const edge = source.halfEdges[current]; const origin = edge ? source.halfEdges[edge.prev]?.vertex : undefined;
        const before = origin === undefined ? undefined : beforeById.get(origin), after = origin === undefined ? undefined : afterById.get(origin);
        if (!edge || !before || !after) throw new Error(`면 ${face.id}의 변형 전후 정점을 확인하지 못했습니다.`);
        ids.push(before.id); edges.push(edge.id);
        changed ||= before.position.x !== after.position.x || before.position.y !== after.position.y || before.position.z !== after.position.z;
        current = edge.next;
        // 위상이 같아 source부터 동일 face-corner 예산을 넘었던 면은 이번 편집의 새 표시 손실이 아니다.
        if (ids.length > beforeMeter.budget.maxFaceCorners) break;
      } while (current !== face.he);
      if (!changed || ids.length > beforeMeter.budget.maxFaceCorners) continue;
      const before = admit(face, edges, ids, beforeById, beforeMeter);
      const after = admit(face, edges, ids, afterById, afterMeter);
      if (before.ok && !after.ok) throw new Error(`면 ${face.id}가 변형 후 화면에 표시될 수 없습니다. ${after.issue.detail}`);
    }
  } catch (error) {
    throw new Error(`요소 변형의 공유 표면 검증을 완료하지 못했습니다. ${error instanceof Error ? error.message : "표면 작업 예산을 확인하세요."}`, { cause: error });
  }
}
