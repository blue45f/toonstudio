// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, hashStudioEditableMesh, serializeStudioEditableMesh, validateStudioEditableMeshSerializableAuthority, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { deriveStudioHybridDccViewportSnapshot } from "../hybrid-dcc/StudioHybridDccViewportCore";
import { hybridDccRegisterAsset } from "../hybrid-dcc/studio-hybrid-dcc-document";
import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import { createStudioMeshModifierStack, evaluateStudioMeshModifierStack } from "../studio-mesh-modifier-stack";

import { deriveStudioModifierSurfaceInput } from "./studio-mesh-modifier-surface-input";
import { buildStudioMeshSurface, planStudioMeshSurface, validateStudioMeshSurface } from "./studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "./studio-mesh-surface-render";

const editable = { topologyPolicy: "editable" } as const;
const cases = [
  { name: "isolated", points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [2, 2, 2]], faces: [[0, 1, 2]], code: "isolated-vertex", triangles: 1 },
  { name: "bowtie", points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, 0, 1]], faces: [[0, 1, 2], [0, 3, 4]], code: "bow-tie-vertex", triangles: 2 },
  { name: "nonmanifold", points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1]], faces: [[0, 1, 2], [1, 0, 3], [0, 1, 4]], code: "non-manifold-edge", triangles: 3 },
] as const;
function fixture(input: typeof cases[number], smooth = false): StudioEditableMesh {
  const mesh = createStudioEditableMeshFromPolygons(input.points.map(([x, y, z]) => ({ x, y, z })), input.faces);
  return { ...mesh, faces: mesh.faces.map((face) => ({ ...face, smooth })) };
}
function workspace(mesh: StudioEditableMesh) {
  const source = createStudioHybridDccWorkspace("editable-topology");
  return synchronizeWorkspaceGeometryAuthority(source, hybridDccRegisterAsset(source.session, "mesh", mesh, {
    source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
  }));
}

describe("편집 표시 topology와 GLB strict 정책의 분리", () => {
  it.each(cases)("$name: 8e445에서 표시하던 canonical flat/smooth 메시를 보존하고 strict GLB 거부는 유지한다", (input) => {
    for (const smooth of [false, true]) {
      const mesh = fixture(input, smooth), before = serializeStudioEditableMesh(mesh), hash = hashStudioEditableMesh(mesh);
      expect(validateStudioEditableMeshSerializableAuthority(mesh).ok).toBe(true);
      const planned = planStudioMeshSurface(mesh, undefined, editable);
      if (!planned.ok) throw new Error(planned.issue.detail);
      expect(planned.value.validated.topologyPolicy).toBe("editable"); expect(planned.value.validated.hasEditableTopologyExceptions).toBe(true); expect(planned.value.triangles).toHaveLength(input.triangles);
      const snapshot = deriveStudioHybridDccViewportSnapshot(workspace(mesh));
      // 8e445 Core와 같은 입력을 실제 호출한 /tmp 재현에서 assets=1/errors=[]였던 계약이다.
      expect(snapshot.assets).toHaveLength(1); expect(snapshot.errors).toEqual([]); expect(snapshot.assets[0]?.triangleCount).toBe(input.triangles);
      const strict = planStudioMeshSurface(mesh); expect(strict).toMatchObject({ ok: false, issue: { code: input.code } });
      const glb = exportStudioHybridDccMeshGlb({ assetId: "mesh", mesh, sourceRevision: 1, sourceHash: hash });
      expect(glb.ok).toBe(false); if (!glb.ok) expect(glb.report.errors[0]?.code).toBe(input.code);
      expect(serializeStudioEditableMesh(mesh)).toEqual(before); expect(hashStudioEditableMesh(mesh)).toBe(hash);
    }
  });

  it("정책별 성공 memo를 분리하고 build의 명시 전환과 기본 strict 재검증을 우회하지 않는다", () => {
    const mesh = createStudioUnitCubeMesh(), strict = planStudioMeshSurface(mesh), edit = planStudioMeshSurface(mesh, undefined, editable);
    if (!strict.ok || !edit.ok) throw new Error("정책별 계획이 없습니다.");
    expect(strict.value).not.toBe(edit.value); expect(strict.value.validated.topologyPolicy).toBe("strict");
    expect(edit.value.validated.hasEditableTopologyExceptions).toBe(false);
    expect(planStudioMeshSurface(mesh)).toEqual(strict); expect(planStudioMeshSurface(mesh, undefined, editable)).toEqual(edit);
    expect(buildStudioMeshSurface(strict.value.validated, undefined, editable)).toEqual(edit);
    expect(buildStudioMeshSurface(edit.value.validated)).toEqual(strict);
    const loose = fixture(cases[0]), validated = validateStudioMeshSurface(loose, undefined, editable);
    if (!validated.ok) throw new Error(validated.issue.detail);
    expect(buildStudioMeshSurface(validated.value)).toMatchObject({ ok: false, issue: { code: "isolated-vertex" } });
    expect(buildStudioMeshSurface(validated.value, undefined, { allowCreaseMetadata: true })).toMatchObject({ ok: false, issue: { code: "isolated-vertex" } });
    expect(buildStudioMeshSurface(validated.value, undefined, editable).ok).toBe(true);
  });

  it("canonical 근거 없는 손상 twin·참조·anchor·면 순환을 editable에서 허용하지 않는다", () => {
    const mesh = fixture(cases[2]);
    const damaged: StudioEditableMesh[] = [
      { ...mesh, halfEdges: mesh.halfEdges.map((edge) => edge.id === 0 ? { ...edge, twin: -1 } : edge) },
      { ...mesh, halfEdges: mesh.halfEdges.map((edge) => edge.id === 0 ? { ...edge, twin: mesh.halfEdges.length } : edge) },
      { ...mesh, halfEdges: mesh.halfEdges.map((edge) => edge.id === 0 ? { ...edge, next: 0 } : edge) },
      { ...mesh, vertices: mesh.vertices.map((vertex) => vertex.id === 0 ? { ...vertex, he: 3 } : vertex) },
      { ...mesh, faces: mesh.faces.map((face) => face.id === 0 ? { ...face, he: 1 } : face) },
      { ...mesh, nextHalfEdgeId: mesh.nextHalfEdgeId + 1 },
      { ...mesh, vertices: mesh.vertices.map((vertex) => vertex.id === 0 ? { ...vertex, position: { ...vertex.position, x: Infinity } } : vertex) },
      { ...mesh, faces: mesh.faces.map((face) => ({ ...face, materialSlot: NaN })) },
    ];
    const isolated = fixture(cases[0]); damaged.push({ ...isolated, vertices: isolated.vertices.map((vertex) => vertex.id === 3 ? { ...vertex, he: 0 } : vertex) });
    for (const value of damaged) {
      expect(validateStudioEditableMeshSerializableAuthority(value).ok).toBe(false);
      expect(planStudioMeshSurface(value, undefined, editable).ok).toBe(false);
    }
  });

  it("memo가 있어도 예산을 재검사하며 editable의 자기교차·Float32 소실을 허용하지 않는다", () => {
    const mesh = createStudioUnitCubeMesh(); expect(planStudioMeshSurface(mesh, undefined, editable).ok).toBe(true);
    for (const budget of [{ maxFaces: 0 }, { maxLinearWork: 0 }, { maxTriangles: 0 }, { maxFaceCorners: 3 }]) {
      expect(planStudioMeshSurface(mesh, budget, editable)).toMatchObject({ ok: false, issue: { code: "surface-budget-exceeded" } });
    }
    expect(planStudioMeshSurface(mesh, undefined, editable).ok).toBe(true);
    const crossing = createStudioEditableMeshFromPolygons([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }], [[0, 1, 2, 3]]);
    expect(planStudioMeshSurface(crossing, undefined, editable).ok).toBe(false);
    const collapsed = createStudioEditableMeshFromPolygons([{ x: 999999, y: 0, z: 0 }, { x: 999999.01, y: 1, z: 0 }, { x: 999999.025, y: 3, z: 0 }], [[0, 1, 2]]);
    expect(planStudioMeshSurface(collapsed, undefined, editable)).toMatchObject({ ok: false, issue: { code: "position-float32-collapse" } });
  });

  it("다중 edge와 bowtie의 smooth 법선은 8e445 actual canonical-twin DSU의 면·정점별 값과 같다", () => {
    for (const input of [cases[1], cases[2]]) {
      const mesh = fixture(input, true), planned = planStudioMeshSurface(mesh, undefined, editable);
      if (!planned.ok) throw new Error(planned.issue.detail);
      const projected = projectStudioMeshSurfaceForRender(mesh, planned.value);
      for (const [index, triangle] of planned.value.triangles.entries()) for (let corner = 0; corner < 3; corner += 1) {
        const vertex = triangle.vertexIds[corner];
        const expected = input.name === "bowtie" ? triangle.faceId === 0 ? [0, 0, 1] : [0, 1, 0]
          : vertex === 0 || vertex === 1 ? [0, Math.fround(-1 / Math.sqrt(5)), Math.fround(2 / Math.sqrt(5))] : triangle.faceId === 2 ? [0, -1, 0] : [0, 0, 1];
        expect(Array.from(projected.cornerNormals.subarray((index * 3 + corner) * 3, (index * 3 + corner + 1) * 3))).toEqual(expected);
      }
    }
  });

  it("일반 manifold의 생략 collinear 코너는 새 normal 기여를 만들지 않고 실제 GLB NORMAL과 일치한다", () => {
    const mesh = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
      { x: 2, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 },
    ], [[0, 1, 2, 3, 4], [1, 0, 5]]);
    const strict = planStudioMeshSurface(mesh), edit = planStudioMeshSurface(mesh, undefined, editable);
    if (!strict.ok || !edit.ok) throw new Error("일반 manifold 표면이 없습니다.");
    expect(edit.value.validated.hasEditableTopologyExceptions).toBe(false);
    expect(edit.value.geometry).toEqual(strict.value.geometry);
    expect(edit.value.validated.faces[0]?.triangulationVertexIds).not.toContain(1);
    const projection = projectStudioMeshSurfaceForRender(mesh, edit.value);
    const exported = exportStudioHybridDccMeshGlb({ assetId: "manifold", mesh, sourceRevision: 1, sourceHash: hashStudioEditableMesh(mesh) });
    if (!exported.ok) throw new Error(JSON.stringify(exported.report.errors));
    interface Json {
      readonly accessors: readonly { readonly bufferView: number; readonly byteOffset?: number; readonly count: number }[];
      readonly bufferViews: readonly { readonly byteOffset?: number }[];
      readonly meshes: readonly { readonly primitives: readonly { readonly indices: number; readonly attributes: { readonly NORMAL: number } }[] }[];
    }
    const view = new DataView(exported.bytes.buffer, exported.bytes.byteOffset, exported.bytes.byteLength), length = view.getUint32(12, true);
    const json: Json = JSON.parse(new TextDecoder().decode(exported.bytes.subarray(20, 20 + length)));
    const primitive = json.meshes[0]?.primitives[0]; if (!primitive) throw new Error("GLB primitive가 없습니다.");
    const accessor = (id: number) => { const value = json.accessors[id]; if (!value) throw new Error("GLB accessor가 없습니다."); return { value, offset: 28 + length + (json.bufferViews[value.bufferView]?.byteOffset ?? 0) + (value.byteOffset ?? 0) }; };
    const normals = accessor(primitive.attributes.NORMAL), indices = accessor(primitive.indices);
    const corners = Array.from({ length: indices.value.count }, (_, index) => {
      const vertex = view.getUint32(indices.offset + index * 4, true);
      return [0, 1, 2].map((axis) => view.getFloat32(normals.offset + (vertex * 3 + axis) * 4, true));
    }).flat();
    expect(Array.from(projection.cornerNormals)).toEqual(corners);
    const snapshot = deriveStudioHybridDccViewportSnapshot(workspace(mesh));
    expect(snapshot.errors).toEqual([]); expect(Array.from(snapshot.assets[0]?.cornerNormals ?? [])).toEqual(corners);
    const triangle = edit.value.triangles.findIndex(({ faceId }) => faceId === 1);
    const source = edit.value.triangles[triangle], corner = source?.vertexIds.indexOf(1);
    if (!source || corner === undefined || corner < 0) throw new Error("공유 원본 코너가 없습니다.");
    expect(Array.from(projection.cornerNormals.slice((triangle * 3 + corner) * 3, (triangle * 3 + corner + 1) * 3))).toEqual([0, 1, 0]);
  });

  it("무UV collinear 코너의 crease를 실제 입력·Solidify 경계에 유지하되 무metadata 생략 계약은 보존한다", async () => {
    const built = createStudioEditableMeshFromPolygons([{ x: 0, y: 0, z: 0 }, { x: .5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }], [[0, 1, 2, 3, 4]]);
    const plain = { ...built, faces: built.faces.map((face) => ({ ...face, smooth: false, materialSlot: 7 })) };
    const source = { ...plain, vertices: plain.vertices.map((vertex) => ({ ...vertex, crease: vertex.id === 1 ? .25 : 0 })), halfEdges: plain.halfEdges.map((edge) => ({ ...edge, crease: (edge.id + 1) / 10 })) };
    const ordinary = planStudioMeshSurface(plain, undefined, editable); if (!ordinary.ok) throw new Error(ordinary.issue.detail);
    expect(ordinary.value.triangles).toHaveLength(2); expect(ordinary.value.triangles.some(({ vertexIds }) => vertexIds.includes(1))).toBe(false);
    const planned = planStudioMeshSurface(source, undefined, { ...editable, allowCreaseMetadata: true }); if (!planned.ok) throw new Error(planned.issue.detail);
    expect(planned.value.triangles).toHaveLength(3); expect(planned.value.triangles.some(({ vertexIds }) => vertexIds.includes(1))).toBe(true);
    expect(planStudioMeshSurface(source)).toMatchObject({ ok: false, issue: { code: "crease-unsupported" } });
    const input = deriveStudioModifierSurfaceInput(source);
    for (const edge of source.halfEdges) {
      const origin = source.halfEdges[edge.prev]?.vertex; let found = false;
      for (let write = 0; write < input.indices.length; write += 3) for (let corner = 0; corner < 3; corner += 1) {
        if (input.indices[write + corner] === origin && input.indices[write + (corner + 1) % 3] === edge.vertex) {
          expect(input.surfaces[write / 3]?.corners[corner]?.edgeCrease).toBe(edge.crease); found = true;
        }
      }
      expect(found).toBe(true);
    }
    const result = await evaluateStudioMeshModifierStack(createStudioMeshModifierStack(source, [{ id: "shell", kind: "solidify", enabled: true, thickness: .2, offset: 0, evenThickness: true, rim: true }]));
    if (!result.ok) throw new Error(result.detail);
    expect(result.value.mesh.uvLayer).toBeUndefined(); expect(result.value.mesh.vertices[1]?.crease).toBe(.25);
    for (const edge of source.halfEdges) expect(result.value.mesh.halfEdges.filter((output) => output.crease === edge.crease).length).toBeGreaterThanOrEqual(2);
  });
});
