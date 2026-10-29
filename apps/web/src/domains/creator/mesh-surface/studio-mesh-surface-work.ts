/** 기하 입력 한도와 실제 삼각화 작업 한도를 분리한다. */
import { STUDIO_EDITABLE_MESH_LIMITS } from "../studio-editable-half-edge-mesh";

import { surfaceIssue, surfaceStop, type StudioMeshSurfaceBudget, type StudioMeshSurfaceResult, type StudioMeshSurfaceWork } from "./studio-mesh-surface-contracts";

export const STUDIO_MESH_SURFACE_DEFAULT_BUDGET: Required<StudioMeshSurfaceBudget> = Object.freeze({
  maxFaces: STUDIO_EDITABLE_MESH_LIMITS.maxFaces, maxFaceCorners: 256,
  maxLinearWork: STUDIO_EDITABLE_MESH_LIMITS.maxVertices + STUDIO_EDITABLE_MESH_LIMITS.maxFaces + STUDIO_EDITABLE_MESH_LIMITS.maxEdges * 4,
  // 새 CPU 작업 상한이며 원본 정점·면·코너 한도를 올리지 않는다.
  maxPolygonPairs: 16_000_000, maxEarTests: 16_000_000, maxTriangles: STUDIO_EDITABLE_MESH_LIMITS.maxEdges * 2,
});
class SurfaceBudgetError extends Error {}
export class StudioMeshSurfaceWorkMeter {
  readonly budget: Required<StudioMeshSurfaceBudget>;
  private readonly work = { linear: 0, polygonPairs: 0, earTests: 0, triangles: 0 };
  constructor(budget?: StudioMeshSurfaceBudget) {
    this.budget = { ...STUDIO_MESH_SURFACE_DEFAULT_BUDGET, ...budget };
    if (Object.values(this.budget).some((value) => !Number.isSafeInteger(value) || value < 0) || this.budget.maxFaceCorners > 256) {
      throw new SurfaceBudgetError("표면 작업 예산은 유한한 정수이며 원본 256 코너 한도를 넘을 수 없습니다.");
    }
  }
  checkFaces(count: number): void { if (count > this.budget.maxFaces) throw new SurfaceBudgetError("표면 면 수가 작업 예산을 넘었습니다."); }
  checkFaceCorners(count: number): void { if (count > this.budget.maxFaceCorners) throw new SurfaceBudgetError("표면 원본 코너 수가 작업 예산을 넘었습니다."); }
  charge(key: keyof StudioMeshSurfaceWork, count: number): void {
    const limits = { linear: this.budget.maxLinearWork, polygonPairs: this.budget.maxPolygonPairs, earTests: this.budget.maxEarTests, triangles: this.budget.maxTriangles };
    if (!Number.isSafeInteger(count) || count < 0 || count > limits[key] - this.work[key]) throw new SurfaceBudgetError(`표면 ${key} 작업이 예산을 넘었습니다.`);
    this.work[key] += count;
  }
  snapshot(): StudioMeshSurfaceWork { return { ...this.work }; }
}
export function surfaceBudgetFailure(error: unknown): StudioMeshSurfaceResult<never> {
  return surfaceStop(surfaceIssue("error", error instanceof SurfaceBudgetError ? "surface-budget-exceeded" : "invalid-input",
    error instanceof SurfaceBudgetError ? error.message : "Editable mesh export failed before a complete GLB could be produced"));
}
