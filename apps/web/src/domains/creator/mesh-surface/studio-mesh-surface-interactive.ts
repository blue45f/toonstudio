/** 동기 화면의 표면 판정은 exporter와 같은 기하 계획을 사용하되 기존 표시 예산을 유지한다. */
import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import type { StudioMeshSurfacePlan } from "./studio-mesh-surface-contracts";
import { STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET } from "./studio-mesh-surface-interactive-budget";
import { planStudioMeshSurface } from "./studio-mesh-surface-plan";

export interface StudioMeshSurfaceInteractiveInspection {
  readonly faceCount: number;
  readonly triangleCount: number;
  readonly normalMode: "flat" | "smooth" | "split";
  readonly linearWork: number;
  readonly polygonPairWork: number;
  readonly earTests: number;
  readonly plan: StudioMeshSurfacePlan;
}
export type StudioMeshSurfaceInteractiveResult = { readonly ok: true; readonly value: StudioMeshSurfaceInteractiveInspection } | { readonly ok: false; readonly message: string };
const cache = new WeakMap<StudioEditableMesh, StudioMeshSurfaceInteractiveResult>();

export function inspectStudioMeshSurfaceForInteractiveProjection(mesh: StudioEditableMesh): StudioMeshSurfaceInteractiveResult {
  const previous = cache.get(mesh); if (previous) return previous;
  let result: StudioMeshSurfaceInteractiveResult;
  try {
    const hasSmooth = mesh.faces.some((face) => face.smooth), hasFlat = mesh.faces.some((face) => !face.smooth);
    if (hasSmooth && (mesh.vertices.some(({ crease }) => crease > 0) || mesh.halfEdges.some(({ crease }) => crease > 0))) {
      throw new Error("crease가 있는 smooth 메시에는 smoothing-island 렌더 경로가 필요합니다.");
    }
    const planned = planStudioMeshSurface(mesh, STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET, { allowCreaseMetadata: true, topologyPolicy: "editable" });
    if (!planned.ok) {
      const issue = planned.issue;
      const prefix = issue.code === "surface-budget-exceeded" || issue.code === "mesh-budget-exceeded" || issue.code === "face-corner-budget-exceeded"
        ? "동기 표면 검사 예산을 초과했습니다. 대용량 worker 경로가 필요합니다."
        : issue.code === "face-self-intersection" ? "자체 교차하는 면은 표시할 수 없습니다."
          : issue.code === "face-non-planar" ? "지원하지 않는 비평면 다각형입니다."
            : "원본 표면의 구조를 검증하지 못했습니다.";
      throw new Error(prefix);
    }
    const plan = planned.value;
    result = { ok: true, value: { faceCount: mesh.faces.length, triangleCount: plan.triangles.length,
      normalMode: hasSmooth && hasFlat ? "split" : hasFlat ? "flat" : "smooth",
      linearWork: plan.work.linear, polygonPairWork: plan.work.polygonPairs, earTests: plan.work.earTests, plan } };
  } catch (cause) { result = { ok: false, message: cause instanceof Error ? cause.message : "표면을 표시할 수 없습니다." }; }
  cache.set(mesh, result); return result;
}
