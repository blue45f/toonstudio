import { describe, expect, it, vi } from "vitest";

import { createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, hashStudioEditableMesh, serializeStudioEditableMesh, studioEditableMeshToTriangleSoup, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { createStudioMeshModifierStack, evaluateStudioMeshModifierStack, type StudioMeshModifier } from "../studio-mesh-modifier-stack";

import { studioModifierTriangleUvs, studioModifierUvBudget } from "./studio-mesh-modifier-uv";
import { hashStudioMeshUvTopology } from "./studio-mesh-uv-authority";

const array = { id: "array", kind: "array", enabled: true, count: 2, mode: "linear", offset: { x: 2, y: 0, z: 0 }, realizeInstances: true } as const;
const mirror = { id: "mirror", kind: "mirror", enabled: true, axis: "x", merge: false, mergeThreshold: 0.0001, bisect: false, clip: false } as const;
const solidify = { id: "shell", kind: "solidify", enabled: true, thickness: 0.2, offset: 0, evenThickness: true, rim: true } as const;

function withUvs(mesh: StudioEditableMesh): StudioEditableMesh {
  return { ...mesh, uvLayer: { revision: 1, topologyHash: hashStudioMeshUvTopology(mesh),
    corners: mesh.halfEdges.map(({ id }) => ({ halfEdgeId: id, u: id / 32, v: -id / 16 })),
  } };
}
function cube() { return withUvs(createStudioUnitCubeMesh()); }
function uvIds(mesh: StudioEditableMesh): readonly number[] { return mesh.uvLayer!.corners.map(({ u }) => u * 32); }
const cubeFanIds = Array.from({ length: 6 }, (_, face) => [0, 1, 2, 0, 2, 3].map((id) => face * 4 + id)).flat();

async function evaluated(mesh: StudioEditableMesh, modifiers: readonly StudioMeshModifier[]) {
  const result = await evaluateStudioMeshModifierStack(createStudioMeshModifierStack(mesh, modifiers));
  expect(result.ok, result.ok ? undefined : result.detail).toBe(true);
  if (!result.ok) throw new Error(result.detail);
  return result.value.mesh;
}

describe("모디파이어의 정확한 코너 UV 전파", () => {
  it.each(["linear", "radial"] as const)("Array %s는 각 인스턴스의 원본 fan 코너를 복제하며 source를 변경하지 않는다", async (mode) => {
    const source = cube();
    const before = serializeStudioEditableMesh(source);
    const hash = hashStudioEditableMesh(source);
    const output = await evaluated(source, [{ ...array, mode }]);
    expect(uvIds(output)).toEqual([...cubeFanIds, ...cubeFanIds]);
    expect(output.uvLayer!.topologyHash).toBe(hashStudioMeshUvTopology(output));
    expect(output.uvLayer!.topologyHash).not.toBe(source.uvLayer!.topologyHash);
    expect(serializeStudioEditableMesh(source)).toEqual(before);
    expect(hashStudioEditableMesh(source)).toBe(hash);
    expect(output.vertices).toHaveLength(source.vertices.length * 2);
  });

  it("Mirror는 반사된 삼각형 winding과 함께 UV 코너 순서도 반전한다", async () => {
    const source = cube();
    const output = await evaluated(source, [mirror]);
    const reversed: number[] = [];
    for (let index = 0; index < cubeFanIds.length; index += 3) reversed.push(cubeFanIds[index]!, cubeFanIds[index + 2]!, cubeFanIds[index + 1]!);
    expect(uvIds(output)).toEqual([...cubeFanIds, ...reversed]);
    // 같은 3D 정점을 공유해도 서로 다른 면의 코너 UV를 평균하거나 합치지 않는다.
    const pointUv = new Map<string, Set<number>>();
    for (const edge of output.halfEdges) {
      const p = output.vertices[output.halfEdges[edge.prev]!.vertex]!.position;
      const key = `${p.x},${p.y},${p.z}`;
      const values = pointUv.get(key) ?? new Set<number>();
      values.add(output.uvLayer!.corners[edge.id]!.u); pointUv.set(key, values);
    }
    expect([...pointUv.values()].some((values) => values.size >= 3)).toBe(true);
  });

  it("Mirror merge/clip은 중심 정점을 공유하면서 양쪽 면 UV 대응은 보존한다", async () => {
    const source = withUvs(createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2]]));
    const output = await evaluated(source, [{ ...mirror, merge: true, clip: true }]);
    expect(output.vertices).toHaveLength(4);
    expect(uvIds(output)).toEqual([0, 1, 2, 0, 2, 1]);
  });

  it("Mirror bisect의 새 교차 코너는 실제 원본 변의 절단 t로 UV를 보간한다", async () => {
    const base = createStudioEditableMeshFromPolygons([
      { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2]]);
    const source = { ...base, uvLayer: { revision: 1 as const, topologyHash: hashStudioMeshUvTopology(base), corners: [
      { halfEdgeId: 0, u: 0, v: 0 }, { halfEdgeId: 1, u: 1, v: 0 }, { halfEdgeId: 2, u: 0, v: 1 },
    ] } };
    const output = await evaluated(source, [{ ...mirror, merge: true, bisect: true }]);
    expect(output.uvLayer!.corners.map(({ u, v }) => [u, v])).toEqual([[0, 1], [0.5, 0], [1, 0], [0, 1], [1, 0], [0.5, 0]]);
    expect(output.vertices.some(({ position }) => position.x === 0 && position.y === 0)).toBe(true);
    expect(source.uvLayer.corners).toHaveLength(3);
  });

  it.each(["twist", "taper", "stretch"] as const)("SimpleDeform %s는 각 원본 fan 코너 UV를 그대로 유지한다", async (mode) => {
    const source = cube();
    const output = await evaluated(source, [{ id: "deform", kind: "simple-deform", enabled: true, mode, axis: "z", angleRad: Math.PI / 4, factor: 1.5 }]);
    expect(uvIds(output)).toEqual(cubeFanIds);
    expect(output.vertices.some((vertex, index) => JSON.stringify(vertex.position) !== JSON.stringify(source.vertices[index]?.position))).toBe(true);
    expect(output.uvLayer!.topologyHash).toBe(hashStudioMeshUvTopology(output));
  });

  it.each([true, false])("Solidify rim=%s는 front/back winding과 boundary edge 코너를 정확히 복제한다", async (rim) => {
    const source = withUvs(createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2, 3]]));
    const output = await evaluated(source, [{ ...solidify, rim }]);
    const shells = [0, 1, 2, 0, 2, 1, 0, 2, 3, 0, 3, 2];
    const sides = [[0, 1], [1, 2], [2, 3], [3, 0]].flatMap(([a, b]) => [a!, a!, b!, a!, b!, b!]);
    expect(uvIds(output)).toEqual(rim ? [...shells, ...sides] : shells);
    expect(output.uvLayer!.topologyHash).toBe(hashStudioMeshUvTopology(output));
    expect(output.faces).toHaveLength(rim ? 12 : 4);
  });

  it("Array→Mirror→SimpleDeform이 연속되어도 각 단계의 corner provenance를 이어간다", async () => {
    const source = cube();
    const output = await evaluated(source, [array, mirror, { id: "deform", kind: "simple-deform", enabled: true, mode: "stretch", axis: "y", angleRad: 0, factor: 2 }]);
    const first = [...cubeFanIds, ...cubeFanIds];
    const reversed: number[] = [];
    for (let index = 0; index < first.length; index += 3) reversed.push(first[index]!, first[index + 2]!, first[index + 1]!);
    expect(uvIds(output)).toEqual([...first, ...reversed]);
  });

  it("지원하지 않는 enabled UV 연산은 원본·Boolean backend 실행 전에 명시적으로 거부한다", async () => {
    const source = cube();
    const original = serializeStudioEditableMesh(source);
    const boolean = vi.fn(async () => { throw new Error("UV 검증 전에 backend가 실행되면 안 됩니다."); });
    const modifiers: readonly StudioMeshModifier[] = [
      { id: "bevel", kind: "bevel", enabled: true, amount: 0.1, segments: 1, angleLimitRad: 0, weightInfluence: 0 },
      { id: "subdiv", kind: "subdivision", enabled: true, levels: 1, smooth: true },
      { id: "weld", kind: "weld", enabled: true, quantum: 0.00001 },
      { id: "decimate", kind: "decimate", enabled: true, ratio: 0.5 },
      { id: "boolean", kind: "boolean", enabled: true, operation: "union", operand: studioEditableMeshToTriangleSoup(createStudioUnitCubeMesh()) },
    ];
    for (const modifier of modifiers) {
      const result = await evaluateStudioMeshModifierStack(createStudioMeshModifierStack(source, [modifier]), { booleanBackend: { boolean } });
      expect(result).toMatchObject({ ok: false, code: "invalid-stack", detail: expect.stringContaining("UV 코너 전파") });
      expect(serializeStudioEditableMesh(source)).toEqual(original);
    }
    expect(boolean).not.toHaveBeenCalled();
  });

  it("disabled 미지원 연산과 실제 no-op은 UV 메시를 그대로 반환한다", async () => {
    const source = cube();
    const modifiers: readonly StudioMeshModifier[] = [
      { id: "weld", kind: "weld", enabled: false, quantum: 0.00001 },
      { id: "bevel", kind: "bevel", enabled: true, amount: 0, segments: 1, angleLimitRad: 0, weightInfluence: 0 },
      { ...solidify, thickness: 0 },
    ];
    expect(await evaluated(source, modifiers)).toBe(source);
  });

  it("동일 길이의 다른 인덱스 순서·손상된 UV·코너 예산 초과를 거부한다", async () => {
    const source = cube();
    const soup = studioEditableMeshToTriangleSoup(source);
    const wrong = soup.indices.slice(); wrong[0] = wrong[1]!;
    expect(() => studioModifierTriangleUvs(source, wrong)).toThrow(/인덱스/u);
    expect(() => studioModifierUvBudget(source, 300_000, array)).toThrow(/예산/u);
    const forged = { ...source, uvLayer: { ...source.uvLayer!, topologyHash: "foreign" } };
    const result = await evaluateStudioMeshModifierStack(createStudioMeshModifierStack(forged));
    expect(result).toMatchObject({ ok: false, code: "invalid-stack", detail: expect.stringContaining("UV 레이어") });
  });
});
