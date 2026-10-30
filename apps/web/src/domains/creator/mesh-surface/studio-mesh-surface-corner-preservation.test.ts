import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createStudioEditableMeshFromPolygons,
  hashStudioEditableMesh,
  serializeStudioEditableMesh,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";
import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";

import {
  buildStudioMeshSurface,
  planStudioMeshSurface,
  validateStudioMeshSurface,
  type StudioMeshSurfaceOptions,
  type StudioMeshSurfacePlan,
} from "./studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "./studio-mesh-surface-render";
import { surfaceRegressionInputs, withSurfaceTestUvs } from "./studio-mesh-surface-test-fixtures";

type Point = readonly [number, number, number];
const points: readonly Point[] = [[0, 0, 0], [.5, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];

function polygon(input: readonly Point[] = points, reverse = false): StudioEditableMesh {
  const loop = input.map((_, index) => index);
  if (reverse) loop.reverse();
  return createStudioEditableMeshFromPolygons(input.map(([x, y, z]) => ({ x, y, z })), [loop]);
}

function planned(mesh: StudioEditableMesh, options?: StudioMeshSurfaceOptions): StudioMeshSurfacePlan {
  const result = planStudioMeshSurface(mesh, undefined, options);
  if (!result.ok) throw new Error(result.issue.detail);
  return result.value;
}

function validated(mesh: StudioEditableMesh, options?: StudioMeshSurfaceOptions) {
  const result = validateStudioMeshSurface(mesh, undefined, options);
  if (!result.ok) throw new Error(result.issue.detail);
  return result.value;
}

function coveredCorners(plan: StudioMeshSurfacePlan): Set<number> {
  const covered = new Set<number>();
  for (const triangle of plan.triangles) for (const id of triangle.cornerHalfEdgeIds) covered.add(id);
  return covered;
}

function assertPreserved(mesh: StudioEditableMesh, plan: StudioMeshSurfacePlan): void {
  expect(plan.validated.preserveFaceCorners).toBe(true);
  expect(coveredCorners(plan)).toEqual(new Set(mesh.halfEdges.map(({ id }) => id)));
  expect(plan.validated.warnings.some(({ code }) => code === "face-collinear-corner-omitted")).toBe(false);
  for (const triangle of plan.triangles) {
    const a = mesh.vertices[triangle.vertexIds[0]]?.position;
    const b = mesh.vertices[triangle.vertexIds[1]]?.position;
    const c = mesh.vertices[triangle.vertexIds[2]]?.position;
    if (!a || !b || !c) throw new Error("코너 보존 검사의 원본 정점이 없습니다.");
    const ax = b.x - a.x, ay = b.y - a.y, az = b.z - a.z;
    const bx = c.x - a.x, by = c.y - a.y, bz = c.z - a.z;
    expect(Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx)).toBeGreaterThan(0);
    for (let corner = 0; corner < 3; corner += 1) {
      const id = triangle.cornerHalfEdgeIds[corner];
      const edge = id === undefined ? undefined : mesh.halfEdges[id];
      expect(edge?.face).toBe(triangle.faceId);
      expect(edge === undefined ? undefined : mesh.halfEdges[edge.prev]?.vertex).toBe(triangle.vertexIds[corner]);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function goldenCase(name: string) {
  const golden: unknown = JSON.parse(readFileSync("tests/corpus/mesh-surface/glb-8e445.json", "utf8"));
  if (!isRecord(golden) || !Array.isArray(golden.cases)) throw new Error("기존 GLB 기준선 형식이 다릅니다.");
  for (const entry of golden.cases) {
    if (isRecord(entry) && entry.name === name && typeof entry.reportSha256 === "string"
      && typeof entry.sha256 === "string" && typeof entry.bytes === "number" && entry.ok === true) {
      return { reportSha256: entry.reportSha256, sha256: entry.sha256, bytes: entry.bytes };
    }
  }
  throw new Error(`기존 GLB 기준선 ${name}이 없습니다.`);
}

describe("명시적인 원본 면 코너 보존 표면 정책", () => {
  it.each([false, true])("winding reverse=%s에서도 무UV collinear 코너를 실제 비퇴화 삼각형에 모두 보존한다", (reverse) => {
    const mesh = polygon(points, reverse);
    const before = serializeStudioEditableMesh(mesh), hash = hashStudioEditableMesh(mesh);
    expect(validateStudioEditableMeshSerializableAuthority(mesh).ok).toBe(true);
    const result = planned(mesh, { preserveFaceCorners: true });
    expect(result.triangles).toHaveLength(3);
    assertPreserved(mesh, result);
    expect(serializeStudioEditableMesh(mesh)).toEqual(before);
    expect(hashStudioEditableMesh(mesh)).toBe(hash);
    expect(mesh.uvLayer).toBeUndefined();
  });

  it("concave polygon의 collinear 코너도 원본 polygon과 ID를 바꾸지 않고 보존한다", () => {
    const mesh = polygon([[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 2, 0], [1, 1, 0], [0, 2, 0]]);
    const result = planned(mesh, { preserveFaceCorners: true });
    expect(result.triangles).toHaveLength(4);
    assertPreserved(mesh, result);
    expect(mesh.faces).toHaveLength(1);
    expect(mesh.halfEdges).toHaveLength(6);
  });

  it("모든 변에 중간 코너가 있는 polygon을 실제 여섯 삼각형으로 보존한다", () => {
    const mesh = polygon([[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0], [1, 2, 0], [0, 2, 0], [0, 1, 0]]);
    const result = planned(mesh, { preserveFaceCorners: true });
    expect(result.triangles).toHaveLength(6);
    assertPreserved(mesh, result);
  });

  it.each([[false, true], [true, false]])("캐시 호출 순서 %s→%s에서 true와 false 계획을 섞지 않는다", (first, second) => {
    const mesh = polygon();
    const a = planned(mesh, { preserveFaceCorners: first });
    const b = planned(mesh, { preserveFaceCorners: second });
    const ordinary = first ? b : a, preserved = first ? a : b;
    expect(ordinary).not.toBe(preserved);
    expect(ordinary.triangles).toHaveLength(2);
    expect(ordinary.validated.preserveFaceCorners).toBe(false);
    expect(ordinary.validated.warnings.some(({ code }) => code === "face-collinear-corner-omitted")).toBe(true);
    expect(coveredCorners(ordinary).size).toBe(4);
    assertPreserved(mesh, preserved);
    expect(planned(mesh)).toBe(ordinary);
    expect(planned(mesh, { preserveFaceCorners: false })).toBe(ordinary);
    expect(planned(mesh, { preserveFaceCorners: true })).toBe(preserved);
    expect(validated(mesh).preserveFaceCorners).toBe(false);
    expect(validated(mesh, { preserveFaceCorners: true })).toBe(preserved.validated);
  });

  it.each([false, true])("allowCreaseMetadata=%s의 strict/editable 정책도 flag별로 캐시를 분리한다", (allowCreaseMetadata) => {
    const mesh = polygon();
    const strictFalse = planned(mesh, { allowCreaseMetadata });
    const strictTrue = planned(mesh, { allowCreaseMetadata, preserveFaceCorners: true });
    const editableFalse = planned(mesh, { allowCreaseMetadata, topologyPolicy: "editable" });
    const editableTrue = planned(mesh, { allowCreaseMetadata, topologyPolicy: "editable", preserveFaceCorners: true });
    expect(new Set([strictFalse, strictTrue, editableFalse, editableTrue]).size).toBe(4);
    expect(strictFalse.triangles).toHaveLength(2);
    expect(editableFalse.triangles).toHaveLength(2);
    expect(strictTrue.triangles).toHaveLength(3);
    expect(editableTrue.triangles).toHaveLength(3);
    expect(editableTrue.validated.topologyPolicy).toBe("editable");
    expect(strictTrue.validated.allowCreaseMetadata).toBe(allowCreaseMetadata);
  });

  it("validate false에서 build true 명시 전환은 다시 검증해 원본 다섯 코너를 보존한다", () => {
    const mesh = polygon(), original = validated(mesh);
    const result = buildStudioMeshSurface(original, undefined, { preserveFaceCorners: true });
    if (!result.ok) throw new Error(result.issue.detail);
    expect(result.value.validated).not.toBe(original);
    expect(result.value.triangles).toHaveLength(3);
    assertPreserved(mesh, result.value);
  });

  it("build의 options 자체를 생략하면 validated true를 승계한다", () => {
    const mesh = polygon(), original = validated(mesh, { preserveFaceCorners: true });
    const result = buildStudioMeshSurface(original);
    if (!result.ok) throw new Error(result.issue.detail);
    expect(result.value.validated).toBe(original);
    assertPreserved(mesh, result.value);
  });

  it.each([{}, { preserveFaceCorners: false }, { allowCreaseMetadata: true }])("명시 options %j에서 생략·false flag는 기본 생략 정책으로 전환한다", (options) => {
    const mesh = polygon(), original = validated(mesh, { preserveFaceCorners: true });
    const result = buildStudioMeshSurface(original, undefined, options);
    if (!result.ok) throw new Error(result.issue.detail);
    expect(result.value.validated.preserveFaceCorners).toBe(false);
    expect(result.value.triangles).toHaveLength(2);
    expect(result.value.validated.warnings.some(({ code }) => code === "face-collinear-corner-omitted")).toBe(true);
  });

  it("기존 build 기본 strict 전환 중에도 true flag는 유실되지 않는다", () => {
    const mesh = polygon(), original = validated(mesh, { topologyPolicy: "editable", preserveFaceCorners: true });
    const result = buildStudioMeshSurface(original);
    if (!result.ok) throw new Error(result.issue.detail);
    expect(result.value.validated.topologyPolicy).toBe("strict");
    assertPreserved(mesh, result.value);
  });

  it("코너 보존 flag가 기존 strict의 isolated vertex 거절을 우회하지 않는다", () => {
    const mesh = createStudioEditableMeshFromPolygons([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 5, y: 5, z: 5 }], [[0, 1, 2]]);
    const original = validated(mesh, { topologyPolicy: "editable", preserveFaceCorners: true });
    expect(buildStudioMeshSurface(original)).toMatchObject({ ok: false, issue: { code: "isolated-vertex" } });
    const result = buildStudioMeshSurface(original, undefined, { topologyPolicy: "editable", preserveFaceCorners: true });
    if (!result.ok) throw new Error(result.issue.detail);
    assertPreserved(mesh, result.value);
  });

  it.each([false, true])("preserveFaceCorners=%s는 allowCreaseMetadata 거절·명시 전환을 우회하지 않는다", (preserveFaceCorners) => {
    const plain = polygon();
    const mesh = { ...plain, vertices: plain.vertices.map((vertex) => vertex.id === 1 ? { ...vertex, crease: .25 } : vertex) };
    const original = validated(mesh, { allowCreaseMetadata: true, preserveFaceCorners });
    expect(buildStudioMeshSurface(original, undefined, { preserveFaceCorners })).toMatchObject({ ok: false, issue: { code: "crease-unsupported" } });
  });

  it("UV가 있으면 false flag에서도 기존 코너 자동 보존과 동일한 UV·geometry를 유지한다", () => {
    const mesh = withSurfaceTestUvs(polygon());
    const ordinary = planned(mesh), explicitFalse = planned(mesh, { preserveFaceCorners: false });
    const explicitTrue = planned(mesh, { preserveFaceCorners: true });
    expect(ordinary).toBe(explicitFalse);
    expect(ordinary.validated.preserveFaceCorners).toBe(false);
    expect(ordinary.triangles).toHaveLength(3);
    expect(coveredCorners(ordinary)).toEqual(new Set(mesh.halfEdges.map(({ id }) => id)));
    expect(explicitTrue.geometry).toEqual(ordinary.geometry);
    expect(explicitTrue.triangles).toEqual(ordinary.triangles);
  });

  it.each(["vertex", "edge"])("%s crease가 있으면 false flag에서도 기존 자동 코너 보존을 유지한다", (kind) => {
    const plain = polygon();
    const mesh = {
      ...plain,
      vertices: plain.vertices.map((vertex) => kind === "vertex" && vertex.id === 1 ? { ...vertex, crease: .25 } : vertex),
      halfEdges: plain.halfEdges.map((edge) => kind === "edge" && edge.id === 1 ? { ...edge, crease: .5 } : edge),
    };
    const ordinary = planned(mesh, { allowCreaseMetadata: true });
    const explicitTrue = planned(mesh, { allowCreaseMetadata: true, preserveFaceCorners: true });
    expect(ordinary.validated.preserveFaceCorners).toBe(false);
    expect(ordinary.triangles).toHaveLength(3);
    expect(coveredCorners(ordinary)).toEqual(new Set(mesh.halfEdges.map(({ id }) => id)));
    expect(explicitTrue.geometry).toEqual(ordinary.geometry);
    expect(planStudioMeshSurface(mesh, undefined, { preserveFaceCorners: true })).toMatchObject({ ok: false, issue: { code: "crease-unsupported" } });
  });

  it("2 삼각형 예산에서 false 성공·true 실패 후 3 예산으로 true를 만들고 캐시별 예산을 다시 검사한다", () => {
    const mesh = polygon();
    const ordinary = planStudioMeshSurface(mesh, { maxTriangles: 2 });
    expect(ordinary.ok).toBe(true);
    expect(planStudioMeshSurface(mesh, { maxTriangles: 2 }, { preserveFaceCorners: true })).toMatchObject({ ok: false, issue: { code: "surface-budget-exceeded" } });
    const preserved = planStudioMeshSurface(mesh, { maxTriangles: 3 }, { preserveFaceCorners: true });
    if (!ordinary.ok || !preserved.ok) throw new Error("예산별 표면이 없습니다.");
    expect(preserved.value.triangles).toHaveLength(3);
    expect(planStudioMeshSurface(mesh, { maxTriangles: 2 })).toMatchObject({ ok: true, value: ordinary.value });
    expect(planStudioMeshSurface(mesh, { maxTriangles: 2 }, { preserveFaceCorners: true })).toMatchObject({ ok: false, issue: { code: "surface-budget-exceeded" } });
    expect(validateStudioMeshSurface(mesh, { maxTriangles: 2 }, { preserveFaceCorners: true })).toMatchObject({ ok: false, issue: { code: "surface-budget-exceeded" } });
    expect(buildStudioMeshSurface(preserved.value.validated, { maxTriangles: 2 })).toMatchObject({ ok: false, issue: { code: "surface-budget-exceeded" } });
    expect(planStudioMeshSurface(mesh, { maxTriangles: 3 }, { preserveFaceCorners: true })).toMatchObject({ ok: true, value: preserved.value });
  });

  it.each([false, true])("preserveFaceCorners=%s에서도 영면적·역주행 polygon·Float32 소실을 거절한다", (preserveFaceCorners) => {
    const zeroArea = polygon([[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
    const backtrack = polygon([[0, 0, 0], [1, 0, 0], [.5, 0, 0], [1, 1, 0], [0, 1, 0]]);
    const collapse = polygon([[999999, 0, 0], [999999.00000001, 0, 0], [999999, 1, 0]]);
    expect(planStudioMeshSurface(zeroArea, undefined, { preserveFaceCorners })).toMatchObject({ ok: false, issue: { code: "face-zero-area" } });
    expect(planStudioMeshSurface(backtrack, undefined, { preserveFaceCorners }).ok).toBe(false);
    expect(planStudioMeshSurface(collapse, undefined, { preserveFaceCorners })).toMatchObject({ ok: false, issue: { code: "position-float32-collapse" } });
  });

  it("기존 epsilon보다 얇은 polygon은 코너를 삭제하거나 허용 오차를 낮추지 않고 실패로 남긴다", () => {
    const mesh = polygon([[0, 0, 0], [.5, 0, 0], [1, 0, 0], [1, 1.1e-12, 0], [0, 1.1e-12, 0]]);
    const before = serializeStudioEditableMesh(mesh), hash = hashStudioEditableMesh(mesh);
    expect(planStudioMeshSurface(mesh, undefined, { preserveFaceCorners: true }).ok).toBe(false);
    expect(serializeStudioEditableMesh(mesh)).toEqual(before);
    expect(hashStudioEditableMesh(mesh)).toBe(hash);
  });

  it.each(["collinear", "collinear-uv"])("%s 기본 GLB 바이트·보고서·render stream은 true 계획을 거친 뒤에도 기준과 같다", (name) => {
    const input = surfaceRegressionInputs().find(({ assetId }) => assetId === name);
    if (!input) throw new Error("기존 collinear 기준 입력이 없습니다.");
    const expected = goldenCase(name);
    const ordinary = planned(input.mesh);
    const before = projectStudioMeshSurfaceForRender(input.mesh, ordinary);
    const preservedPlan = planned(input.mesh, { preserveFaceCorners: true });
    assertPreserved(input.mesh, preservedPlan);
    const preservedProjection = projectStudioMeshSurfaceForRender(input.mesh, preservedPlan);
    expect(before.indices).toHaveLength(name === "collinear" ? 6 : 9);
    expect(preservedProjection.indices).toHaveLength(9);
    expect(preservedProjection.cornerNormals).toHaveLength(27);
    expect(preservedProjection.triangleMaterialSlots).toHaveLength(3);
    if (name === "collinear-uv") expect(preservedProjection.cornerUvs).toHaveLength(18);
    else expect(preservedProjection.cornerUvs).toBeUndefined();
    expect(planned(input.mesh)).toBe(ordinary);
    const after = projectStudioMeshSurfaceForRender(input.mesh, ordinary);
    expect(after.positions).toEqual(before.positions);
    expect(after.indices).toEqual(before.indices);
    expect(after.cornerNormals).toEqual(before.cornerNormals);
    expect(after.cornerUvs).toEqual(before.cornerUvs);
    expect(after.triangleMaterialSlots).toEqual(before.triangleMaterialSlots);
    const result = exportStudioHybridDccMeshGlb(input);
    if (!result.ok) throw new Error(JSON.stringify(result.report));
    expect(result.bytes.length).toBe(expected.bytes);
    expect(createHash("sha256").update(result.bytes).digest("hex")).toBe(expected.sha256);
    expect(createHash("sha256").update(JSON.stringify(result.report)).digest("hex")).toBe(expected.reportSha256);
  });
});
