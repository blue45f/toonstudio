import { describe, expect, it } from "vitest";

import { createStudioEditableMeshFromPolygons, hashStudioEditableMesh, type StudioEditableVertex } from "../studio-editable-half-edge-mesh";
import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";

import { validateStudioMeshSurfaceFloat32Triangles } from "./studio-mesh-surface-float32";
import { planStudioMeshSurface } from "./studio-mesh-surface-plan";

type Point = readonly [number, number, number];
function vertices(points: readonly Point[]): ReadonlyMap<number, StudioEditableVertex> {
  return new Map(points.map(([x, y, z], id) => [id, { id, position: { x, y, z }, crease: 0, he: 0 }]));
}
describe("원본 표면의 실제 Float32 표현 경계", () => {
  it.each([
    ["edge", [[999999, 0, 0], [999999.00000001, 0, 0], [999999, 1, 0]]],
    ["area", [[999999, 0, 0], [999999.01, 1, 0], [999999.025, 3, 0]]],
    ["orientation", [[999999, 0, 0], [999999.03, 1, 0], [999999.04, 2, 0]]],
  ] as const)("새 %s 소실은 공용 helper·plan·GLB 모두 같은 명시 오류로 거부한다", (_kind, points) => {
    const byId = vertices(points); const result = validateStudioMeshSurfaceFloat32Triangles([[0, 1, 2]], byId, 7);
    expect(result.ok).toBe(false); if (!result.ok) { expect(result.issue.code).toBe("position-float32-collapse"); expect(result.issue.faceIds).toEqual([7]); }
    const mesh = createStudioEditableMeshFromPolygons(points.map(([x, y, z]) => ({ x, y, z })), [[0, 1, 2]]);
    const plan = planStudioMeshSurface(mesh); expect(plan.ok).toBe(false); if (!plan.ok) expect(plan.issue.code).toBe("position-float32-collapse");
    const glb = exportStudioHybridDccMeshGlb({ assetId: "float32", mesh, sourceRevision: 1, sourceHash: hashStudioEditableMesh(mesh) });
    expect(glb.ok).toBe(false); if (!glb.ok) expect(glb.report.errors.map(({ code }) => code)).toEqual(["position-float32-collapse"]);
    const actual = new Float32Array(points.flatMap((point) => [...point])); expect(actual[0]).toBe(999999);
    if (_kind === "edge") expect(Array.from(actual.slice(0, 3))).toEqual(Array.from(actual.slice(3, 6)));
    if (_kind === "area") expect([actual[0], actual[3], actual[6]]).toEqual([999999, 999999, 999999]);
    if (_kind === "orientation") expect([actual[0], actual[3], actual[6]]).toEqual([999999, 999999, 999999.0625]);
  });

  it("표현 가능한 원본과 기존 퇴화·overflow를 구분해 commit의 before/after 비교에 쓸 수 있다", () => {
    expect(validateStudioMeshSurfaceFloat32Triangles([[0, 1, 2]], vertices([[999999, 0, 0], [1000000, 0, 0], [999999, 1, 0]])).ok).toBe(true);
    const degenerate = validateStudioMeshSurfaceFloat32Triangles([[0, 1, 2]], vertices([[0, 0, 0], [0, 0, 0], [0, 1, 0]]));
    expect(degenerate.ok).toBe(false); if (!degenerate.ok) expect(degenerate.issue.code).toBe("face-zero-area");
    const overflow = validateStudioMeshSurfaceFloat32Triangles([[0, 1, 2]], vertices([[1e40, 0, 0], [0, 1e40, 0], [0, 0, 1e40]]));
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.issue).toEqual({ severity: "error", code: "position-float32-overflow", message: "A source position cannot be represented as float32", detail: "A source position cannot be represented as float32" });
  });
});
