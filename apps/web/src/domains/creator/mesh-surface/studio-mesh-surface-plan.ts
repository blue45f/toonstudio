/** 컨테이너·렌더러 없이 동일한 원본 표면을 검증하고 계획한다. */
import { validateStudioMeshUvLayer } from "../mesh-uv/studio-mesh-uv-authority";

import { surfaceIssue, surfaceStop, surfacePass, type StudioMeshSurfaceBudget, type StudioMeshSurfaceOptions, type StudioMeshSurfacePlan, type StudioMeshSurfaceResult, type StudioMeshSurfaceTriangle, type StudioMeshSurfaceValidated } from "./studio-mesh-surface-contracts";
import { buildStudioMeshSurfaceGeometry } from "./studio-mesh-surface-geometry";
import { validateStudioMeshSurface as validateSurface } from "./studio-mesh-surface-topology";
import { StudioMeshSurfaceWorkMeter, surfaceBudgetFailure } from "./studio-mesh-surface-work";
import { validateStudioMeshSurfaceFloat32Triangles } from "./studio-mesh-surface-float32";

import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";

export type { StudioMeshSurfacePlan, StudioMeshSurfaceBudget, StudioMeshSurfaceOptions, StudioMeshSurfaceResult, StudioMeshSurfaceValidated, StudioMeshSurfaceTriangle, StudioMeshSurfaceGeometry, StudioMeshSurfaceWork } from "./studio-mesh-surface-contracts";

const successCache = new WeakMap<StudioEditableMesh, Map<string, StudioMeshSurfacePlan>>();
function policyKey(options?: StudioMeshSurfaceOptions): string { return JSON.stringify([options?.allowCreaseMetadata === true, options?.topologyPolicy ?? "strict"]); }
function validatedPolicyKey(validated: StudioMeshSurfaceValidated): string { return JSON.stringify([validated.allowCreaseMetadata, validated.topologyPolicy]); }
/** 성공한 immutable mesh만 공유한다. 소비자별 예산 실패는 다음 큰 예산의 요청을 막지 않는다. */
function admit(validated: StudioMeshSurfaceValidated, budget?: StudioMeshSurfaceBudget) {
  const meter = new StudioMeshSurfaceWorkMeter(budget); meter.checkFaces(validated.faces.length);
  meter.checkFaceCorners(validated.maxFaceCorners);
  for (const key of ["linear", "polygonPairs", "earTests", "triangles"] as const) meter.charge(key, validated.work[key]);
  return meter.snapshot();
}
export function validateStudioMeshSurface(mesh: StudioEditableMesh, budget?: StudioMeshSurfaceBudget, options?: StudioMeshSurfaceOptions): StudioMeshSurfaceResult<StudioMeshSurfaceValidated> {
  const cached = successCache.get(mesh)?.get(policyKey(options));
  if (!cached) return validateSurface(mesh, budget, options);
  try { admit(cached.validated, budget); return surfacePass(cached.validated); }
  catch (error) { return surfaceBudgetFailure(error); }
}

/** GLB는 validate→UV 검증→sourceHash 대조 뒤 이 단계를 호출하여 기존 오류 우선순위를 유지한다. */
export function buildStudioMeshSurface(validated: StudioMeshSurfaceValidated, budget?: StudioMeshSurfaceBudget, options?: StudioMeshSurfaceOptions): StudioMeshSurfaceResult<StudioMeshSurfacePlan> {
  try {
    if ((options !== undefined && (options.allowCreaseMetadata === true) !== validated.allowCreaseMetadata)
      || (options?.topologyPolicy ?? "strict") !== validated.topologyPolicy) {
      const changed = validateStudioMeshSurface(validated.sourceMesh, budget, options ?? { allowCreaseMetadata: validated.allowCreaseMetadata });
      if (!changed.ok) return changed;
      validated = changed.value;
    }
    const work = admit(validated, budget);
    const cached = successCache.get(validated.sourceMesh)?.get(validatedPolicyKey(validated));
    if (cached) return surfacePass(cached);
    const invalidUv = validateStudioMeshUvLayer(validated.sourceMesh);
    if (invalidUv) return surfaceStop(surfaceIssue("error", "uv-coordinate-invalid", invalidUv));
    const geometry = buildStudioMeshSurfaceGeometry(validated, validated.sourceMesh.uvLayer);
    if (!geometry.ok) return geometry;
    for (const entry of validated.faces) {
      const converted = validateStudioMeshSurfaceFloat32Triangles(entry.triangles, validated.vertexById, entry.face.id);
      if (!converted.ok) return converted;
    }
    const triangles: StudioMeshSurfaceTriangle[] = [];
    for (const entry of validated.faces) {
      const corners = new Map(entry.vertexIds.map((id, index) => [id, entry.halfEdgeIds[index]]));
      for (const [triangleIndexWithinFace, vertexIds] of entry.triangles.entries()) {
        const halfEdge = (id: number) => { const value = corners.get(id); if (value === undefined) throw new Error("표면 삼각형의 원본 UV 코너가 없습니다."); return value; };
        triangles.push({ faceId: entry.face.id, triangleIndexWithinFace, vertexIds,
          cornerHalfEdgeIds: [halfEdge(vertexIds[0]), halfEdge(vertexIds[1]), halfEdge(vertexIds[2])], materialSlot: entry.face.materialSlot });
      }
    }
    if (triangles.length * 3 !== geometry.value.indices.length) throw new Error("표면 triangle table과 geometry 코너 수가 다릅니다.");
    for (const [index, triangle] of triangles.entries()) {
      if (triangle.faceId !== geometry.value.triangleSourceFaceIds[index]) throw new Error("표면 triangle table과 원본 면 대응이 다릅니다.");
      for (let corner = 0; corner < 3; corner += 1) {
        const output = geometry.value.indices[index * 3 + corner];
        if (output === undefined || geometry.value.outputSourceVertexIds[output] !== triangle.vertexIds[corner]) throw new Error("표면 triangle table과 원본 정점 대응이 다릅니다.");
      }
    }
    const plan = { validated, geometry: geometry.value, triangles, work };
    const byPolicy = successCache.get(validated.sourceMesh) ?? new Map<string, StudioMeshSurfacePlan>();
    byPolicy.set(validatedPolicyKey(validated), plan); successCache.set(validated.sourceMesh, byPolicy);
    return surfacePass(plan);
  } catch (error) { return surfaceBudgetFailure(error); }
}
export function planStudioMeshSurface(mesh: StudioEditableMesh, budget?: StudioMeshSurfaceBudget, options?: StudioMeshSurfaceOptions): StudioMeshSurfaceResult<StudioMeshSurfacePlan> {
  const cached = successCache.get(mesh)?.get(policyKey(options));
  if (cached) { try { admit(cached.validated, budget); return surfacePass(cached); } catch (error) { return surfaceBudgetFailure(error); } }
  const validated = validateStudioMeshSurface(mesh, budget, options);
  return validated.ok ? buildStudioMeshSurface(validated.value, budget, options) : validated;
}
