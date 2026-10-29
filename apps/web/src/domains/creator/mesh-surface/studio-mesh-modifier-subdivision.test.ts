import { describe, expect, it } from "vitest";

import { createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, hashStudioEditableMesh, serializeStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import { createStudioMeshModifierStack, evaluateStudioMeshModifierStack } from "../studio-mesh-modifier-stack";
import { studioModifierUvBudget } from "../mesh-uv/studio-mesh-modifier-uv";
import { hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";

import { deriveStudioModifierSurfaceInput } from "./studio-mesh-modifier-surface-input";
import { countStudioModifierSubdivisionVertices, subdivideStudioModifierSurface } from "./studio-mesh-modifier-subdivision";
import { planStudioMeshSurface } from "./studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "./studio-mesh-surface-render";

const modifier = { id: "subdiv", kind: "subdivision", enabled: true, levels: 1, smooth: false } as const;
function attachUvs(mesh: StudioEditableMesh, coordinates?: readonly (readonly [number, number])[]): StudioEditableMesh {
  return { ...mesh, uvLayer: { revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners: mesh.halfEdges.map(({ id }) => ({ halfEdgeId: id,
    u: coordinates?.[id]?.[0] ?? id / 32, v: coordinates?.[id]?.[1] ?? -id / 16,
  })) } };
}
function quad(): StudioEditableMesh {
  return attachUvs(createStudioEditableMeshFromPolygons([
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
  ], [[0, 1, 2, 3]]), [[0, 0], [2, 0], [1, 1], [0, 1]]);
}
async function evaluate(mesh: StudioEditableMesh, levels = 1, smooth = false) {
  const result = await evaluateStudioMeshModifierStack(createStudioMeshModifierStack(mesh, [{ ...modifier, levels, smooth }]));
  if (!result.ok) throw new Error(result.detail);
  return result.value.mesh;
}

function sampleUv(positions: ArrayLike<number>, indices: ArrayLike<number>, uvs: ArrayLike<number>, perCorner: boolean): readonly [number, number] {
  for (let write = 0; write < indices.length; write += 3) {
    const ids = [indices[write] ?? -1, indices[write + 1] ?? -1, indices[write + 2] ?? -1];
    const [a, b, c] = ids.map((id) => [positions[id * 3] ?? NaN, positions[id * 3 + 1] ?? NaN] as const);
    if (!a || !b || !c) throw new Error("샘플 삼각형이 없습니다.");
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(d) < 1e-12) continue;
    const wa = ((b[1] - c[1]) * (.6 - c[0]) + (c[0] - b[0]) * (.3 - c[1])) / d;
    const wb = ((c[1] - a[1]) * (.6 - c[0]) + (a[0] - c[0]) * (.3 - c[1])) / d;
    const weights = [wa, wb, 1 - wa - wb]; if (weights.some((value) => value < -1e-6)) continue;
    const uv = [0, 0];
    for (let corner = 0; corner < 3; corner += 1) for (let channel = 0; channel < 2; channel += 1) {
      const id = perCorner ? write + corner : ids[corner] ?? -1;
      uv[channel] = (uv[channel] ?? 0) + (weights[corner] ?? NaN) * (uvs[id * 2 + channel] ?? NaN);
    }
    return [uv[0] ?? NaN, uv[1] ?? NaN];
  }
  throw new Error("샘플 점을 포함하는 실제 삼각형이 없습니다.");
}
function displayUv(mesh: StudioEditableMesh) {
  const plan = planStudioMeshSurface(mesh); if (!plan.ok) throw new Error(plan.issue.detail);
  const projection = projectStudioMeshSurfaceForRender(mesh, plan.value); if (!projection.cornerUvs) throw new Error("표시 UV가 없습니다.");
  return sampleUv(projection.positions, projection.indices, projection.cornerUvs, true);
}
function glbUv(mesh: StudioEditableMesh) {
  const result = exportStudioHybridDccMeshGlb({ assetId: "subdiv", mesh, sourceRevision: 1, sourceHash: hashStudioEditableMesh(mesh) });
  if (!result.ok) throw new Error(JSON.stringify(result.report.errors));
  interface Root {
    readonly accessors: readonly { readonly bufferView: number; readonly byteOffset?: number; readonly componentType: number; readonly count: number; readonly type: string }[];
    readonly bufferViews: readonly { readonly byteOffset?: number }[];
    readonly meshes: readonly { readonly primitives: readonly { readonly indices: number; readonly attributes: { readonly POSITION: number; readonly TEXCOORD_0: number } }[] }[];
  }
  const data = new DataView(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength), length = data.getUint32(12, true);
  const root: Root = JSON.parse(new TextDecoder().decode(result.bytes.subarray(20, 20 + length)));
  const primitive = root.meshes[0]?.primitives[0]; if (!primitive) throw new Error("GLB primitive가 없습니다.");
  const read = (id: number) => {
    const accessor = root.accessors[id]; if (!accessor) throw new Error("GLB accessor가 없습니다.");
    const start = 28 + length + (root.bufferViews[accessor.bufferView]?.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const width = accessor.componentType === 5123 ? 2 : 4, size = accessor.type === "VEC3" ? 3 : accessor.type === "VEC2" ? 2 : 1;
    return Array.from({ length: accessor.count * size }, (_, index) => accessor.componentType === 5126 ? data.getFloat32(start + index * width, true)
      : width === 2 ? data.getUint16(start + index * width, true) : data.getUint32(start + index * width, true));
  };
  const [u, v] = sampleUv(read(primitive.attributes.POSITION), read(primitive.indices), read(primitive.attributes.TEXCOORD_0), false);
  return [u, 1 - v];
}

describe("삼각 midpoint Subdivision의 parent-child 속성 receipt", () => {
  it.each([false, true])("UV=%s: 여러 단계·smooth 설정에도 원본 면 slot/smooth와 정본을 보존한다", async (uv) => {
    const cube = createStudioUnitCubeMesh();
    const mesh = { ...cube, faces: cube.faces.map((face) => ({ ...face, materialSlot: 2 ** 40 + face.id, smooth: face.id % 2 === 0 })) };
    const source = uv ? attachUvs(mesh) : mesh, before = serializeStudioEditableMesh(source), hash = hashStudioEditableMesh(source);
    for (const levels of [1, 2]) for (const smooth of [false, true]) {
      const output = await evaluate(source, levels, smooth), childrenPerFace = 2 * 4 ** levels;
      expect(output.faces).toHaveLength(source.faces.length * childrenPerFace);
      for (const [id, face] of output.faces.entries()) {
        const parent = source.faces[Math.floor(id / childrenPerFace)];
        expect([face.materialSlot, face.smooth]).toEqual([parent?.materialSlot, parent?.smooth]);
      }
      expect(output.uvLayer?.corners.length).toBe(uv ? output.halfEdges.length : undefined);
      expect(serializeStudioEditableMesh(source)).toEqual(before); expect(hashStudioEditableMesh(source)).toBe(hash);
    }
  });

  it("열린 삼각형의 고유 midpoint 세 개를 정확히 예산에 계산하고 고정 child 순서로 UV를 보간한다", async () => {
    const source = attachUvs(createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2]]), [[-1, .25], [2, -.5], [.5, 3]]);
    const input = deriveStudioModifierSurfaceInput(source), split = subdivideStudioModifierSurface(input, false);
    expect(countStudioModifierSubdivisionVertices(input)).toBe(6);
    expect(Array.from(split.indices)).toEqual([0, 3, 5, 3, 1, 4, 5, 4, 2, 3, 4, 5]);
    expect(split.uvs?.map(({ u, v }) => [u, v])).toEqual([
      [-1, .25], [.5, -.125], [-.25, 1.625], [.5, -.125], [2, -.5], [1.25, 1.25],
      [-.25, 1.625], [1.25, 1.25], [.5, 3], [.5, -.125], [1.25, 1.25], [-.25, 1.625],
    ]);
    const output = await evaluate(source); expect(output.vertices).toHaveLength(6);
    expect(output.uvLayer?.corners.map(({ u, v }) => [u, v])).toEqual(split.uvs?.map(({ u, v }) => [u, v]));
  });

  it("비선형 quad의 (.6,.3)은 원본·1/2단계 표시와 실제 GLB에서 모두 UV (1.2,.3)이다", async () => {
    const source = quad();
    for (const mesh of [source, await evaluate(source, 1), await evaluate(source, 2)]) for (const uv of [displayUv(mesh), glbUv(mesh)]) {
      expect(uv[0]).toBeCloseTo(1.2, 6); expect(uv[1]).toBeCloseTo(.3, 6);
    }
  });

  it("공유 3D edge의 midpoint를 하나로 만들면서 양쪽 face-corner UV seam을 각각 보간한다", async () => {
    const source = attachUvs(createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 },
    ], [[0, 1, 4, 3], [1, 2, 5, 4]]), [[0, 0], [2, 0], [1, 1], [0, 1], [10, 0], [12, 0], [11, 1], [10, 1]]);
    const output = await evaluate(source);
    const midpoint = output.vertices.filter(({ position }) => position.x === 1 && position.y === .5); expect(midpoint).toHaveLength(1);
    const vertex = midpoint[0]; if (!vertex) throw new Error("공유 midpoint가 없습니다.");
    const us = new Set<number>();
    for (const edge of output.halfEdges) if (output.halfEdges[edge.prev]?.vertex === vertex.id) {
      const uv = output.uvLayer?.corners[edge.id]; if (!uv) throw new Error("분할 UV 코너가 없습니다.");
      expect(uv.v).toBe(.5); us.add(uv.u);
    }
    expect(us).toEqual(new Set([1.5, 10]));
  });

  it.each([false, true])("UV=%s: 원본 vertex/분할 boundary crease를 유지하고 모든 신규 vertex·내부 edge crease는 0이다", async (uv) => {
    const base = quad(), vertexCreases = [.1, .2, .3, .4], edgeCreases = [.11, .22, .33, .44];
    const source = { ...base, ...(uv ? {} : { uvLayer: undefined }),
      vertices: base.vertices.map((vertex) => ({ ...vertex, crease: vertexCreases[vertex.id] ?? 0 })),
      halfEdges: base.halfEdges.map((edge) => ({ ...edge, crease: edgeCreases[edge.id] ?? 0 })) };
    for (const levels of [1, 2]) {
      const output = await evaluate(source, levels);
      expect(output.vertices.slice(0, 4).map((vertex) => vertex.crease)).toEqual(vertexCreases);
      expect(output.vertices.slice(4).every((vertex) => vertex.crease === 0)).toBe(true);
      for (const crease of edgeCreases) expect(output.halfEdges.filter((edge) => edge.crease === crease)).toHaveLength(2 ** levels);
      expect(output.halfEdges.filter((edge) => edge.crease !== 0)).toHaveLength(4 * 2 ** levels);
      expect(output.halfEdges.every((edge) => edge.crease === 0 || edgeCreases.includes(edge.crease))).toBe(true);
    }
  });

  it("손상된 receipt와 UV 작업 예산 초과는 입력 배열·메시를 바꾸지 않고 거부한다", () => {
    const source = quad(), before = serializeStudioEditableMesh(source), input = deriveStudioModifierSurfaceInput(source);
    const positions = input.positions.slice(), indices = input.indices.slice();
    expect(() => subdivideStudioModifierSurface({ ...input, surfaces: [] }, false)).toThrow("대응 수");
    expect(() => subdivideStudioModifierSurface({ ...input, uvs: [] }, false)).toThrow("대응 수");
    expect(() => studioModifierUvBudget(source, 300_000, { ...modifier, levels: 4 })).toThrow("예산");
    expect(input.positions).toEqual(positions); expect(input.indices).toEqual(indices); expect(serializeStudioEditableMesh(source)).toEqual(before);
  });
});
