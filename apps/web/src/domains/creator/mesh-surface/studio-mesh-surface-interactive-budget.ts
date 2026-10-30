import type { StudioMeshSurfaceBudget } from "./studio-mesh-surface-contracts";

/** 기존 동기 표시 상한을 유지하고 ear 검사에도 독립적인 실행량 상한을 적용한다. */
export const STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET = Object.freeze({
  maxFaces: 120_000,
  maxFaceCorners: 128,
  maxLinearWork: 1_250_000,
  maxPolygonPairs: 2_000_000,
  maxEarTests: 2_000_000,
  maxTriangles: 120_000,
} satisfies StudioMeshSurfaceBudget);

export const STUDIO_MESH_SURFACE_INTERACTIVE_TOTAL_EAR_TESTS = 3_000_000;
