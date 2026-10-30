/** 실제 표시 표면의 triangle 표만 faceIndex로 읽는다. 원본 boundary와 표시 대각선은 별개다. */
import { STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET } from "../mesh-surface/studio-mesh-surface-interactive-budget";
import { planStudioMeshSurface, type StudioMeshSurfacePlan, type StudioMeshSurfaceResult } from "../mesh-surface/studio-mesh-surface-plan";

import type { StudioEditableFace, StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import type { StudioHybridDccRayEdgeCandidate, StudioHybridDccRayHitMapping, StudioHybridDccSelectionProvenance } from "./studio-hybrid-dcc-component-selection";

interface PickFace {
  readonly face: StudioEditableFace;
  readonly vertexIds: readonly number[];
  readonly edges: readonly StudioHybridDccRayEdgeCandidate[];
}
const plans = new WeakMap<StudioEditableMesh, StudioMeshSurfaceResult<StudioMeshSurfacePlan>>();

/** 불변 원본의 파생 검증만 memoize하며 plan을 선택·문서 권위로 승격하지 않는다. */
export function readStudioHybridDccComponentSurfacePlan(mesh: StudioEditableMesh): StudioMeshSurfaceResult<StudioMeshSurfacePlan> {
  const previous = plans.get(mesh); if (previous) return previous;
  const result = planStudioMeshSurface(mesh, STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET, { allowCreaseMetadata: true, topologyPolicy: "editable" }); plans.set(mesh, result); return result;
}

export function pickStudioHybridDccSurfaceTriangle(mesh: StudioEditableMesh, faceIndex: number,
  faces: ReadonlyMap<number, PickFace>, provenance: StudioHybridDccSelectionProvenance): StudioHybridDccRayHitMapping | null {
  const plan = readStudioHybridDccComponentSurfacePlan(mesh);
  if (!plan.ok) throw new Error(`공유 표면을 선택할 수 없습니다: ${plan.issue.detail}`);
  const triangle = plan.value.triangles[faceIndex]; if (!triangle) return null;
  const face = faces.get(triangle.faceId); if (!face) throw new Error("표시 삼각형에 대응하는 원본 면이 없습니다.");
  const edgeByEndpoints = new Map(face.edges.map((edge) => [`${edge.vertexIds[0]}:${edge.vertexIds[1]}`, edge.id]));
  const boundary = (a: number, b: number) => edgeByEndpoints.get(`${Math.min(a, b)}:${Math.max(a, b)}`) ?? null;
  const [a, b, c] = triangle.vertexIds;
  return Object.freeze({ faceIndex, faceId: triangle.faceId, triangleIndexWithinFace: triangle.triangleIndexWithinFace,
    faceVertexIds: face.vertexIds, triangleVertexIds: Object.freeze([a, b, c] as const),
    triangleCornerHalfEdgeIds: Object.freeze([...triangle.cornerHalfEdgeIds] as const),
    triangleBoundaryEdgeIds: Object.freeze([boundary(a, b), boundary(b, c), boundary(c, a)] as const),
    materialSlot: triangle.materialSlot,
    // 생략된 collinear 코너도 원본 face의 화면 거리 후보로 남긴다. 위치로 ID를 합치지 않는다.
    vertexCandidateIds: Object.freeze([...face.vertexIds].sort((left, right) => left - right)),
    edgeCandidates: Object.freeze([...face.edges]), provenance });
}
