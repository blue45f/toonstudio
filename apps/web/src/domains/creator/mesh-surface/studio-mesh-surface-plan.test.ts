import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createStudioEditableMeshFromPolygons, hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";

import * as geometry from "./studio-mesh-surface-geometry";
import { buildStudioMeshSurface, planStudioMeshSurface, validateStudioMeshSurface, type StudioMeshSurfacePlan } from "./studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "./studio-mesh-surface-render";
import { surfaceRegressionInputs, surfaceTestQuad } from "./studio-mesh-surface-test-fixtures";

interface JsonGlb {
  readonly accessors: readonly { readonly bufferView: number; readonly byteOffset?: number; readonly count: number; readonly type: string }[];
  readonly bufferViews: readonly { readonly byteOffset?: number }[];
  readonly meshes: readonly { readonly primitives: readonly { readonly attributes: Readonly<Record<string, number>>; readonly indices: number }[] }[];
}
function planned(mesh = surfaceTestQuad()): StudioMeshSurfacePlan {
  const result = planStudioMeshSurface(mesh); if (!result.ok) throw new Error(result.issue.detail); return result.value;
}
function glbStreams(mesh: Parameters<typeof planned>[0]) {
  if (!mesh) throw new Error("원본 메시가 없습니다.");
  const exported = exportStudioHybridDccMeshGlb({ assetId: "surface", mesh, sourceRevision: 1, sourceHash: hashStudioEditableMesh(mesh) });
  if (!exported.ok) throw new Error(JSON.stringify(exported.report));
  const bytes = exported.bytes, view = new DataView(bytes.buffer), jsonLength = view.getUint32(12, true);
  const json: JsonGlb = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const primitive = json.meshes[0]?.primitives[0]; if (!primitive) throw new Error("GLB primitive가 없습니다.");
  const read = (id: number | undefined, integer = false) => {
    const accessor = id === undefined ? undefined : json.accessors[id]; if (!accessor) throw new Error("GLB accessor가 없습니다.");
    const count = accessor.type === "VEC3" ? 3 : accessor.type === "VEC2" ? 2 : 1;
    const offset = 28 + jsonLength + (json.bufferViews[accessor.bufferView]?.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count * count }, (_, index) => integer ? view.getUint32(offset + index * 4, true) : view.getFloat32(offset + index * 4, true));
  };
  return { positions: read(primitive.attributes.POSITION), normals: read(primitive.attributes.NORMAL), uvs: read(primitive.attributes.TEXCOORD_0), indices: read(primitive.indices, true) };
}
function interpolate(positions: readonly number[], indices: readonly number[], cornerUvs: readonly number[]) {
  const hits: Array<{ readonly weights: readonly number[]; readonly uv: readonly number[] }> = [];
  for (let triangle = 0; triangle < indices.length / 3; triangle += 1) {
    const ids = indices.slice(triangle * 3, triangle * 3 + 3); const a = ids[0], b = ids[1], c = ids[2];
    if (a === undefined || b === undefined || c === undefined) throw new Error("삼각형이 없습니다.");
    const ax = positions[a * 3] ?? NaN, ay = positions[a * 3 + 1] ?? NaN, bx = positions[b * 3] ?? NaN, by = positions[b * 3 + 1] ?? NaN, cx = positions[c * 3] ?? NaN, cy = positions[c * 3 + 1] ?? NaN;
    const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    const wa = ((by - cy) * (.6 - cx) + (cx - bx) * (.3 - cy)) / denominator;
    const wb = ((cy - ay) * (.6 - cx) + (ax - cx) * (.3 - cy)) / denominator; const weights = [wa, wb, 1 - wa - wb];
    if (weights.some((weight) => weight < -1e-12 || weight > 1 + 1e-12)) continue;
    hits.push({ weights, uv: [0, 1].map((axis) => weights.reduce((sum, weight, corner) => sum + weight * (cornerUvs[(triangle * 3 + corner) * 2 + axis] ?? NaN), 0)) });
  }
  expect(hits).toHaveLength(1); return hits[0];
}

describe("공유 표면 planner와 8e445 GLB 계약", () => {
  it("18개 원본·UV·toon·overflow·오류 우선순위 입력의 GLB bytes와 전체 report hash를 보존한다", () => {
    const golden: { readonly reference: string; readonly cases: readonly { readonly name: string; readonly ok: boolean; readonly reportSha256: string; readonly bytes?: number; readonly sha256?: string }[] } = JSON.parse(readFileSync("tests/corpus/mesh-surface/glb-8e445.json", "utf8"));
    expect(golden.reference).toBe("8e445a4b648e825afa35d6f5106505a6a47f71ba");
    const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
    for (const input of surfaceRegressionInputs()) {
      const expected = golden.cases.find(({ name }) => name === input.assetId); if (!expected) throw new Error("GLB 기준선이 없습니다.");
      const result = exportStudioHybridDccMeshGlb(input);
      expect(result.ok, input.assetId).toBe(expected.ok); expect(hash(JSON.stringify(result.report)), input.assetId).toBe(expected.reportSha256);
      if (result.ok) { expect(result.bytes.length).toBe(expected.bytes); expect(hash(result.bytes), input.assetId).toBe(expected.sha256); }
    }
  });

  it("257코너 기준 입력은 실행 환경의 삼각함수 없이 같은 진단 hash를 재생한다", () => {
    const sin = vi.spyOn(Math, "sin").mockImplementation(() => { throw new Error("플랫폼 삼각함수를 호출했습니다."); });
    const cos = vi.spyOn(Math, "cos").mockImplementation(() => { throw new Error("플랫폼 삼각함수를 호출했습니다."); });
    try {
      const first = surfaceRegressionInputs().find(({ assetId }) => assetId === "over-corners");
      const second = surfaceRegressionInputs().find(({ assetId }) => assetId === "over-corners");
      if (!first || !second) throw new Error("257코너 기준 입력이 없습니다.");
      expect(first.mesh.vertices).toHaveLength(257);
      expect(first.mesh.vertices[0]?.position).not.toBe(second.mesh.vertices[0]?.position);
      const result = exportStudioHybridDccMeshGlb(first);
      expect(result.ok).toBe(false);
      expect(createHash("sha256").update(JSON.stringify(result.report)).digest("hex"))
        .toBe("0cc76551f488a108a9b81544364066aae5bf1bbb197c4f05d3d4280d10cb2ade");
    } finally { sin.mockRestore(); cos.mockRestore(); }
  });

  it("원본 corner ID와 실제 GLB 삼각형 대응을 유지하여 0.3 UV 보간 차이를 없앤다", () => {
    const mesh = surfaceTestQuad(), before = hashStudioEditableMesh(mesh), plan = planned(mesh), render = projectStudioMeshSurfaceForRender(mesh, plan), glb = glbStreams(mesh);
    expect(plan.triangles.map(({ vertexIds }) => vertexIds)).toEqual([[3, 0, 1], [1, 2, 3]]);
    for (const triangle of plan.triangles) triangle.cornerHalfEdgeIds.forEach((id, corner) => expect(mesh.halfEdges[mesh.halfEdges[id]?.prev ?? -1]?.vertex).toBe(triangle.vertexIds[corner]));
    const actualGlbCornerUvs = glb.indices.flatMap((id) => [glb.uvs[id * 2] ?? NaN, 1 - (glb.uvs[id * 2 + 1] ?? NaN)]);
    const viewport = interpolate(Array.from(render.positions), Array.from(render.indices), Array.from(render.cornerUvs ?? []));
    const derivative = interpolate(glb.positions, glb.indices, actualGlbCornerUvs);
    expect(viewport?.uv[0]).toBeCloseTo(1.2, 14); expect(viewport?.uv[1]).toBeCloseTo(.3, 14);
    expect(derivative?.uv).toEqual(viewport?.uv); expect(hashStudioEditableMesh(mesh)).toBe(before);
  });

  it.each([[1e-7, [0, 1, 2, 3]], [.25, [0, 1, 2, 3]], [.25, [1, 2, 3, 0]]] as const)("높이 %s와 loop %j에서 실제 corner normal이 GLB Float32와 같다", (height, loop) => {
    const mesh = surfaceTestQuad(height, loop), plan = planned(mesh), render = projectStudioMeshSurfaceForRender(mesh, plan), glb = glbStreams(mesh);
    expect(Array.from(render.cornerNormals)).toEqual(glb.indices.flatMap((id) => glb.normals.slice(id * 3, id * 3 + 3)));
    if (height === .25) expect(plan.triangles.map(({ vertexIds }) => vertexIds)).toEqual([[loop[0], loop[1], loop[2]], [loop[0], loop[2], loop[3]]]);
  });

  it("UV가 있는 collinear 원본 코너는 보존하고 없는 경우의 생략·진단도 유지한다", () => {
    const inputs = surfaceRegressionInputs(); const plain = inputs.find(({ assetId }) => assetId === "collinear"), uv = inputs.find(({ assetId }) => assetId === "collinear-uv");
    if (!plain || !uv) throw new Error("collinear 입력이 없습니다.");
    const a = planned(plain.mesh), b = planned(uv.mesh);
    expect(a.triangles).toHaveLength(2); expect(b.triangles).toHaveLength(3);
    expect(a.validated.warnings.map(({ code }) => code)).toContain("face-collinear-corner-omitted");
    expect(b.triangles.some(({ vertexIds }) => vertexIds.includes(1))).toBe(true); expect(b.validated.warnings).toEqual([]);
  });

  it("작은 예산 실패는 공유하지 않고 성공 plan만 memoize하며 소비자마다 실제 작업량을 재검사한다", () => {
    const mesh = surfaceTestQuad(); const build = vi.spyOn(geometry, "buildStudioMeshSurfaceGeometry");
    try {
      expect(planStudioMeshSurface(mesh, { maxEarTests: 0 }).ok).toBe(false);
      const first = planned(mesh); expect(first.work.earTests).toBeGreaterThan(0);
      const failed = planStudioMeshSurface(mesh, { maxEarTests: first.work.earTests - 1 });
      expect(failed.ok).toBe(false); if (!failed.ok) expect(failed.issue.code).toBe("surface-budget-exceeded");
      expect(planned(mesh)).toBe(first); expect(validateStudioMeshSurface(mesh, { maxFaceCorners: 3 }).ok).toBe(false);
      expect(build).toHaveBeenCalledTimes(1);
    } finally { build.mockRestore(); }
  });

  it("퇴화 출력 여부와 별개로 여러 면의 실제 ear 테스트를 누적 제한한다", () => {
    const points = [0, 2].flatMap((x) => [{ x, y: 0, z: 0 }, { x: x + 1, y: 0, z: 0 }, { x: x + 1, y: 1, z: 0 }, { x, y: 1, z: 0 }]);
    const mesh = createStudioEditableMeshFromPolygons(points, [[0, 1, 2, 3], [4, 5, 6, 7]]);
    const result = planStudioMeshSurface(mesh, { maxEarTests: 3 });
    expect(result.ok).toBe(false); if (!result.ok) expect(result.issue.code).toBe("surface-budget-exceeded");
    expect(planned(mesh).work.earTests).toBe(4);
  });

  it("flat crease metadata 허용 캐시가 엄격한 GLB 정책을 우회하지 않으며 범위 검사는 항상 유지한다", () => {
    const original = surfaceTestQuad(); const mesh = { ...original, vertices: original.vertices.map((vertex, index) => index === 0 ? { ...vertex, crease: .5 } : vertex) };
    const allowed = planStudioMeshSurface(mesh, undefined, { allowCreaseMetadata: true });
    expect(allowed.ok).toBe(true); if (!allowed.ok) throw new Error(allowed.issue.detail);
    expect(allowed.value.validated.allowCreaseMetadata).toBe(true);
    expect(planStudioMeshSurface(mesh, undefined, { allowCreaseMetadata: true })).toMatchObject({ ok: true, value: allowed.value });
    const strict = planStudioMeshSurface(mesh); expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.issue.code).toBe("crease-unsupported");
    expect(buildStudioMeshSurface(allowed.value.validated, undefined, { allowCreaseMetadata: false }).ok).toBe(false);
    const invalid = { ...mesh, vertices: mesh.vertices.map((vertex, index) => index === 0 ? { ...vertex, crease: 1.1 } : vertex) };
    for (const allowCreaseMetadata of [false, true]) {
      const result = planStudioMeshSurface(invalid, undefined, { allowCreaseMetadata });
      expect(result.ok).toBe(false); if (!result.ok) expect(result.issue.code).toBe("crease-invalid");
    }
  });
});
