import { describe, expect, it } from "vitest";

import { createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, hashStudioEditableMesh, serializeStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { createStudioMeshModifierStack, evaluateStudioMeshModifierStack, type StudioMeshModifier } from "../studio-mesh-modifier-stack";
import { hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";

import { planStudioMeshSurface } from "./studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "./studio-mesh-surface-render";

const array = { id: "array", kind: "array", enabled: true, count: 2, mode: "linear", offset: { x: 2, y: 0, z: 0 }, realizeInstances: true } as const;
const mirror = { id: "mirror", kind: "mirror", enabled: true, axis: "x", merge: false, mergeThreshold: 0.0001, bisect: false, clip: false } as const;
const deform = { id: "deform", kind: "simple-deform", enabled: true, mode: "stretch", axis: "y", angleRad: 0, factor: 2 } as const;
const solidify = { id: "shell", kind: "solidify", enabled: true, thickness: 0.2, offset: 0, evenThickness: true, rim: true } as const;
function withUvs(mesh: StudioEditableMesh): StudioEditableMesh {
  return { ...mesh, uvLayer: { revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners: mesh.halfEdges.map(({ id }) => ({ halfEdgeId: id, u: id / 32, v: -id / 16 })) } };
}
async function evaluate(mesh: StudioEditableMesh, modifier: StudioMeshModifier) {
  const result = await evaluateStudioMeshModifierStack(createStudioMeshModifierStack(mesh, [modifier]));
  if (!result.ok) throw new Error(result.detail);
  return result.value.mesh;
}
function quad(): StudioEditableMesh {
  const mesh = createStudioEditableMeshFromPolygons([
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
  ], [[0, 1, 2, 3]]);
  return { ...mesh, faces: mesh.faces.map((face) => ({ ...face, materialSlot: 7, smooth: true })),
    uvLayer: { revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners: [[0, 0], [2, 0], [1, 1], [0, 1]].map(([u, v], halfEdgeId) => ({ halfEdgeId, u: u ?? NaN, v: v ?? NaN })) } };
}

function sampleUv(positions: ArrayLike<number>, indices: ArrayLike<number>, uvs: ArrayLike<number>, perCorner: boolean): readonly [number, number] {
  for (let write = 0; write < indices.length; write += 3) {
    const ids = [indices[write] ?? -1, indices[write + 1] ?? -1, indices[write + 2] ?? -1];
    const [a, b, c] = ids.map((id) => [positions[id * 3] ?? NaN, positions[id * 3 + 1] ?? NaN] as const);
    if (!a || !b || !c) throw new Error("샘플 삼각형이 없습니다.");
    const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(denominator) < 1e-12) continue;
    const wa = ((b[1] - c[1]) * (.6 - c[0]) + (c[0] - b[0]) * (.3 - c[1])) / denominator;
    const wb = ((c[1] - a[1]) * (.6 - c[0]) + (a[0] - c[0]) * (.3 - c[1])) / denominator;
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
  const projection = projectStudioMeshSurfaceForRender(mesh, plan.value);
  if (!projection.cornerUvs) throw new Error("표시 UV가 없습니다.");
  return sampleUv(projection.positions, projection.indices, projection.cornerUvs, true);
}
function glbUv(mesh: StudioEditableMesh) {
  const result = exportStudioHybridDccMeshGlb({ assetId: "quad", mesh, sourceRevision: 1, sourceHash: hashStudioEditableMesh(mesh) });
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
    const width = accessor.componentType === 5123 ? 2 : 4, components = accessor.type === "VEC3" ? 3 : accessor.type === "VEC2" ? 2 : 1;
    return Array.from({ length: accessor.count * components }, (_, index) => accessor.componentType === 5126 ? data.getFloat32(start + index * width, true)
      : width === 2 ? data.getUint16(start + index * width, true) : data.getUint32(start + index * width, true));
  };
  const [u, flippedV] = sampleUv(read(primitive.attributes.POSITION), read(primitive.indices), read(primitive.attributes.TEXCOORD_0), false);
  return [u, 1 - flippedV];
}

describe("modifier의 polygon·면·코너 속성 보존", () => {
  it.each([false, true])("UV=%s Array·Mirror·SimpleDeform은 원본 polygon/slot/smooth를 복제하고 UV 보간을 유지한다", async (uv) => {
    const base = createStudioUnitCubeMesh();
    const mesh = { ...base, faces: base.faces.map((face) => ({ ...face, smooth: face.id !== 0, materialSlot: 2 ** 40 + face.id })) };
    const source = uv ? withUvs(mesh) : mesh, before = serializeStudioEditableMesh(source);
    for (const modifier of [array, mirror, deform]) {
      const output = await evaluate(source, modifier), copies = modifier.kind === "simple-deform" ? 1 : 2;
      expect(output.faces).toHaveLength(source.faces.length * copies);
      expect(output.halfEdges).toHaveLength(source.halfEdges.length * copies);
      for (const [index, face] of output.faces.entries()) expect([face.materialSlot, face.smooth]).toEqual([source.faces[index % source.faces.length]?.materialSlot, source.faces[index % source.faces.length]?.smooth]);
      expect(output.uvLayer?.corners.length).toBe(uv ? source.halfEdges.length * copies : undefined);
      expect(serializeStudioEditableMesh(source)).toEqual(before);
    }
  });

  it("비선형 UV quad의 (.6,.3)은 원본·Array 첫 복사본·각 GLB에서 모두 (1.2,.3)이다", async () => {
    const source = quad(), output = await evaluate(source, array);
    expect(output.faces).toHaveLength(2); expect(output.halfEdges).toHaveLength(8);
    for (const uv of [displayUv(source), displayUv(output), glbUv(source), glbUv(output)]) {
      expect(uv[0]).toBeCloseTo(1.2, 6); expect(uv[1]).toBeCloseTo(.3, 6);
    }
    const mirrored = await evaluate(source, mirror);
    expect(displayUv(mirrored)[0]).toBeCloseTo(1.2, 6);
  });

  it.each([false, true])("UV=%s Solidify shell·rim과 Mirror bisect는 원본 면의 slot/smooth를 상속한다", async (uv) => {
    const source = uv ? quad() : { ...quad(), uvLayer: undefined };
    const shell = await evaluate(source, solidify);
    expect(shell.faces).toHaveLength(12);
    expect(shell.faces.every((face) => face.materialSlot === 7 && face.smooth)).toBe(true);
    const clipped = await evaluate(source, { ...mirror, bisect: true, merge: true });
    expect(clipped.faces.every((face) => face.materialSlot === 7 && face.smooth)).toBe(true);
    expect(clipped.uvLayer?.corners.length).toBe(uv ? clipped.halfEdges.length : undefined);
  });

  it("실제 대칭 절단과 두께 shell도 원본 공통 삼각형의 비선형 UV 보간을 유지한다", async () => {
    const source = quad(); const shell = await evaluate(source, solidify);
    for (const uv of [displayUv(shell), glbUv(shell)]) { expect(uv[0]).toBeCloseTo(1.2, 6); expect(uv[1]).toBeCloseTo(.3, 6); }
    const crossing = { ...source, vertices: source.vertices.map((vertex) => ({ ...vertex, position: { ...vertex.position, x: vertex.position.x * 2 - 1 } })) };
    const clipped = await evaluate(crossing, { ...mirror, merge: true, bisect: true });
    for (const uv of [displayUv(crossing), displayUv(clipped), glbUv(clipped)]) { expect(uv[0]).toBeCloseTo(1.5, 6); expect(uv[1]).toBeCloseTo(.3, 6); }
  });

  it("원본 vertex/edge crease는 복제·위치 변환·두께 shell에 보존하고 새 대각선/수직 edge는 0이다", async () => {
    const base = quad();
    const mesh = { ...base, faces: base.faces.map((face) => ({ ...face, smooth: false })),
      vertices: base.vertices.map((vertex) => ({ ...vertex, crease: .25 })), halfEdges: base.halfEdges.map((edge) => ({ ...edge, crease: .5 })) };
    for (const modifier of [array, mirror, deform, solidify]) {
      const output = await evaluate(mesh, modifier);
      expect(output.vertices.every((vertex) => vertex.crease === .25)).toBe(true);
      expect(output.halfEdges.some((edge) => edge.crease === .5)).toBe(true);
      expect(output.halfEdges.every((edge) => edge.crease === .5 || edge.crease === 0)).toBe(true);
      if (modifier.kind !== "solidify") expect(output.halfEdges.every((edge) => edge.crease === .5)).toBe(true);
    }
  });

  it("서로 다른 crease는 반사 winding의 정확한 원본 변으로 옮기고 두께의 새 대각선에 복제하지 않는다", async () => {
    const base = quad(), vertexCreases = [.1, .2, .3, .4], edgeCreases = [.11, .22, .33, .44];
    const source = { ...base, faces: base.faces.map((face) => ({ ...face, smooth: false })),
      vertices: base.vertices.map((vertex) => ({ ...vertex, crease: vertexCreases[vertex.id] ?? 0 })),
      halfEdges: base.halfEdges.map((edge) => ({ ...edge, crease: edgeCreases[edge.id] ?? 0 })) };
    const mirrored = await evaluate(source, mirror);
    expect(mirrored.halfEdges.slice(4).map((edge) => edge.crease)).toEqual([.44, .33, .22, .11]);
    expect(mirrored.vertices.map((vertex) => vertex.crease)).toEqual([...vertexCreases, ...vertexCreases]);
    const shell = await evaluate(source, solidify);
    expect(shell.halfEdges.slice(0, 6).map((edge) => edge.crease)).toEqual([.44, .11, 0, 0, .11, .44]);
    expect(shell.vertices.map((vertex) => vertex.crease)).toEqual([...vertexCreases, ...vertexCreases]);
    expect(new Set(shell.halfEdges.map((edge) => edge.crease))).toEqual(new Set([0, ...edgeCreases]));
  });
});
