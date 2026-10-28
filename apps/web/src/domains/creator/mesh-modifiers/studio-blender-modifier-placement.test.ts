import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import observations from "../../../../../../tests/corpus/blender-modifiers/array-solidify-5.2.json";
import { createStudioEditableMeshFromPolygons, hashStudioEditableMesh, studioEditableMeshToTriangleSoup,
  type StudioEditableMesh, type StudioMeshVec3 } from "../studio-editable-half-edge-mesh";
import { createStudioMeshModifierStack, deserializeStudioMeshModifierStack, evaluateStudioMeshModifierStack,
  hashStudioMeshModifierStack, serializeStudioMeshModifierStack, type StudioMeshModifier } from "../studio-mesh-modifier-stack";

interface Observation {
  readonly id: string;
  readonly mesh: string;
  readonly input: {
    readonly relativeOffset?: readonly number[];
    readonly constantOffset?: readonly number[];
    readonly count?: number;
    readonly relative?: boolean;
    readonly constant?: boolean;
    readonly scale?: readonly number[];
    readonly applyScale?: boolean;
    readonly mirrorAxis?: string;
    readonly thickness?: number;
    readonly solidifyOffset?: number;
    readonly offset?: number;
    readonly evenThickness?: boolean;
    readonly rim?: boolean;
  };
  readonly expected: {
    readonly vertexGroups: readonly { readonly start: number; readonly vertices: readonly (readonly number[])[] }[];
    readonly localBounds: readonly (readonly number[])[];
    readonly counts: { readonly vertices: number };
  };
}
const cases: readonly Observation[] = observations.cases;
function vector(value: readonly number[] = [0, 0, 0]): StudioMeshVec3 { return { x: value[0]!, y: value[1]!, z: value[2]! }; }
function sourceOf(test: Observation): StudioEditableMesh {
  const definition = test.mesh === "quadXY" ? observations.meshes.quadXY
    : test.mesh === "reversedQuadXY" ? observations.meshes.reversedQuadXY : observations.meshes.mirrorHalfQuad;
  const scale = test.input.applyScale ? test.input.scale : undefined;
  return createStudioEditableMeshFromPolygons(definition.vertices.map((point) => vector(point.map((n, axis) => n * (scale?.[axis] ?? 1)))), definition.faces);
}
function modifiersOf(test: Observation): StudioMeshModifier[] {
  const input = test.input;
  const array: StudioMeshModifier = { kind: "array", id: "array", enabled: true, count: input.count ?? 1,
    offset: vector(input.constantOffset), mode: "linear", realizeInstances: true,
    useConstantOffset: input.constant ?? true, useRelativeOffset: input.relative ?? true,
    relativeOffset: vector(input.relativeOffset) };
  const solidify: StudioMeshModifier = { kind: "solidify", id: "solidify", enabled: true,
    thickness: input.thickness ?? 0.2, offset: input.offset ?? input.solidifyOffset ?? 0,
    evenThickness: input.evenThickness ?? false, rim: input.rim ?? true };
  if (test.id === "mirror_then_array") return [{ kind: "mirror", id: "mirror", enabled: true, axis: "x", merge: false, mergeThreshold: 0.001, bisect: false, clip: false }, array];
  if (test.id === "solidify_then_array") return [solidify, array];
  if (test.id === "array_then_solidify") return [array, solidify];
  return test.id.startsWith("array_") ? [array] : [solidify];
}
function sortedPoints(points: readonly (readonly number[])[]): string[] {
  return points.map((point) => point.map((coordinate) => Math.round(coordinate * 1e5) / 1e5).join(",")).sort();
}
function signedVolume(mesh: StudioEditableMesh): number {
  const soup = studioEditableMeshToTriangleSoup(mesh);
  let volume = 0;
  for (let index = 0; index < soup.indices.length; index += 3) {
    const a = soup.indices[index]! * 3; const b = soup.indices[index + 1]! * 3; const c = soup.indices[index + 2]! * 3;
    volume += (soup.positions[a]! * (soup.positions[b + 1]! * soup.positions[c + 2]! - soup.positions[b + 2]! * soup.positions[c + 1]!)
      + soup.positions[a + 1]! * (soup.positions[b + 2]! * soup.positions[c]! - soup.positions[b]! * soup.positions[c + 2]!)
      + soup.positions[a + 2]! * (soup.positions[b]! * soup.positions[c + 1]! - soup.positions[b + 1]! * soup.positions[c]!)) / 6;
  }
  return volume;
}

describe("REA·Blender 5.2 실측과 웹 모디파이어 좌표 대조", () => {
  for (const test of cases) {
    it(test.id, async () => {
      const source = sourceOf(test);
      const before = hashStudioEditableMesh(source);
      const result = await evaluateStudioMeshModifierStack(createStudioMeshModifierStack(source, modifiersOf(test)));
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.detail);
      expect(hashStudioEditableMesh(source)).toBe(before);
      const actual = result.value.mesh.vertices.map(({ position }) => [position.x, position.y, position.z]);
      if (test.input.thickness === 0 && test.id.startsWith("solidify_")) {
        // 0 두께는 브라우저의 기존 원본 반환 계약을 유지한다. Blender의 중복 위상을 주장하지 않는다.
        expect(hashStudioEditableMesh(result.value.mesh)).toBe(before);
      } else {
        expect(actual).toHaveLength(test.expected.counts.vertices);
        expect(sortedPoints(actual)).toEqual(sortedPoints(test.expected.vertexGroups.flatMap(({ vertices }) => vertices)));
      }
      if (test.id.startsWith("solidify_") && test.input.thickness !== 0 && test.input.rim !== false) {
        expect(signedVolume(result.value.mesh)).toBeCloseTo(2 * Math.abs(test.input.thickness ?? 0) * (test.input.count ?? 1), 5);
      }
    });
  }

  it("기존 문서의 필드·직렬화 순서·해시와 두께 배치를 바꾸지 않는다", async () => {
    const source = sourceOf(cases[0]!);
    const snapshot = { revision: 1, modifiers: [
      { kind: "array", id: "legacy-array", enabled: true, count: 2, offset: { x: 3, y: 0, z: 0 }, mode: "linear", realizeInstances: true },
      { kind: "solidify", id: "legacy-solidify", enabled: true, thickness: 0.2, evenThickness: false, rim: true },
    ] };
    const restored = deserializeStudioMeshModifierStack(snapshot, source);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error(restored.detail);
    expect(JSON.stringify(serializeStudioMeshModifierStack(restored.value))).toBe(JSON.stringify(snapshot));
    const canonical = JSON.stringify({ sourceHash: hashStudioEditableMesh(source), ...snapshot });
    expect(hashStudioMeshModifierStack(restored.value)).toBe(`modifier-stack:sha256:${createHash("sha256").update(canonical).digest("hex")}`);
    const result = await evaluateStudioMeshModifierStack(restored.value);
    if (!result.ok) throw new Error(result.detail);
    expect(Math.min(...result.value.mesh.vertices.map(({ position }) => position.z))).toBe(0);
    expect(Math.max(...result.value.mesh.vertices.map(({ position }) => position.z))).toBeCloseTo(0.2);
  });

  it("새 옵션은 JSON 왕복·해시에 포함되고 상대 벡터는 복사한다", () => {
    const source = sourceOf(cases[0]!);
    const relative = { x: 1, y: 2, z: 0 };
    const stack = createStudioMeshModifierStack(source, [{ kind: "array", id: "new", enabled: true,
      count: 3, offset: { x: 0.5, y: 0, z: 0 }, mode: "linear", realizeInstances: true,
      useConstantOffset: true, useRelativeOffset: true, relativeOffset: relative }]);
    const hash = hashStudioMeshModifierStack(stack);
    relative.x = 99;
    expect(hashStudioMeshModifierStack(stack)).toBe(hash);
    const restored = deserializeStudioMeshModifierStack(JSON.parse(JSON.stringify(serializeStudioMeshModifierStack(stack))), source);
    if (!restored.ok) throw new Error(restored.detail);
    expect(hashStudioMeshModifierStack(restored.value)).toBe(hash);
    const modifier = stack.modifiers[0];
    if (modifier?.kind !== "array") throw new Error("Array 테스트 계약이 아닙니다.");
    expect(hashStudioMeshModifierStack(createStudioMeshModifierStack(source, [{ ...modifier, useRelativeOffset: false }]))).not.toBe(hash);
  });

  it("잘못된 새 옵션과 원형 배열의 상대 모드를 거부한다", () => {
    const source = sourceOf(cases[0]!);
    const base = serializeStudioMeshModifierStack(createStudioMeshModifierStack(source, modifiersOf(cases[0]!)));
    for (const patch of [{ useRelativeOffset: "true" }, { useConstantOffset: 1 }, { relativeOffset: { x: Infinity, y: 0, z: 0 } }, { mode: "radial", useRelativeOffset: true }]) {
      expect(deserializeStudioMeshModifierStack({ ...base, modifiers: [{ ...base.modifiers[0], ...patch }] }, source).ok).toBe(false);
    }
    expect(deserializeStudioMeshModifierStack({ revision: 1, modifiers: [{ kind: "solidify", id: "bad", enabled: true, thickness: 0.2, evenThickness: false, rim: true, offset: Number.NaN }] }, source).ok).toBe(false);
  });
});
