import { describe, expect, it } from "vitest";

import { StudioBg3dSkpConversionError } from "./studio-bg3d-skp-contract";
import { analyzeStudioBg3dSkpMesh } from "./studio-bg3d-skp-mesh-analysis";
import {
  mergeStudioBg3dSkpPrimitivesByMaterial,
  validateStudioBg3dSkpPrimitive,
  type StudioBg3dSkpPrimitive,
} from "./studio-bg3d-skp-mesh-merge";
import { createBoxPrimitive } from "./studio-bg3d-skp.test-fixture";

const BUDGET = { orientationTriangleBudget: 1_000 } as const;

function failureOf(action: () => void): StudioBg3dSkpConversionError {
  try {
    action();
  } catch (error) {
    if (error instanceof StudioBg3dSkpConversionError) return error;
    throw error;
  }
  throw new Error("실패해야 하는 호출이 성공했습니다.");
}

/** 삼각형을 월드 좌표 문자열 집합으로 만들어, 병합 전후 형상이 같은지 비교한다. */
function triangleSignatures(primitives: readonly StudioBg3dSkpPrimitive[]): string[] {
  const signatures: string[] = [];
  for (const primitive of primitives) {
    for (let index = 0; index < primitive.indices.length; index += 3) {
      const corners = [0, 1, 2].map((corner) => {
        const vertex = primitive.indices[index + corner];
        return [0, 1, 2].map((axis) => primitive.positions[vertex * 3 + axis].toFixed(3)).join(",");
      });
      signatures.push(`${primitive.materialIndex}|${corners.join("|")}`);
    }
  }
  return signatures.sort();
}

function quad(z: number, materialIndex = 0, reversed = false): StudioBg3dSkpPrimitive {
  const positions = new Float32Array([0, 0, z, 1, 0, z, 1, 1, z, 0, 1, z]);
  const normal = reversed ? -1 : 1;
  return {
    positions,
    normals: new Float32Array([0, 0, normal, 0, 0, normal, 0, 0, normal, 0, 0, normal]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array(reversed ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]),
    materialIndex,
    geomName: "quad",
  };
}

describe("mergeStudioBg3dSkpPrimitivesByMaterial", () => {
  it("collapses many same-material primitives into one draw call without changing any triangle", () => {
    const boxes = Array.from({ length: 50 }, (_, index) => createBoxPrimitive({ origin: [index * 2, 0, 0], materialIndex: 3 }));
    const merged = mergeStudioBg3dSkpPrimitivesByMaterial(boxes);
    expect(merged).toHaveLength(1);
    expect(merged[0].materialIndex).toBe(3);
    expect(merged[0].positions.length).toBe(50 * 24 * 3);
    expect(merged[0].indices.length).toBe(50 * 36);
    expect(triangleSignatures(merged)).toEqual(triangleSignatures(boxes));
    expect(() => validateStudioBg3dSkpPrimitive(merged[0])).not.toThrow();
  });

  it("keeps different materials apart, in first-appearance order", () => {
    const merged = mergeStudioBg3dSkpPrimitivesByMaterial([
      createBoxPrimitive({ materialIndex: 5 }),
      createBoxPrimitive({ materialIndex: 2, origin: [3, 0, 0] }),
      createBoxPrimitive({ materialIndex: 5, origin: [6, 0, 0] }),
    ]);
    expect(merged.map((primitive) => primitive.materialIndex)).toEqual([5, 2]);
    expect(merged[0].positions.length).toBe(2 * 24 * 3);
    expect(merged[1].positions.length).toBe(24 * 3);
  });

  it("reuses the original object when a material has a single primitive", () => {
    const only = createBoxPrimitive({ materialIndex: 1 });
    const merged = mergeStudioBg3dSkpPrimitivesByMaterial([only, createBoxPrimitive({ materialIndex: 2 })]);
    expect(merged[0]).toBe(only);
  });

  it("rebases indices so the second primitive points at its own vertices", () => {
    const merged = mergeStudioBg3dSkpPrimitivesByMaterial([quad(0), quad(5)]);
    expect([...merged[0].indices]).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    expect(merged[0].positions[4 * 3 + 2]).toBe(5);
  });

  it("drops primitives that have no vertices or no triangles", () => {
    const empty: StudioBg3dSkpPrimitive = {
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      indices: new Uint32Array(0),
      materialIndex: 9,
      geomName: "empty",
    };
    const noTriangles: StudioBg3dSkpPrimitive = { ...quad(0, 4), indices: new Uint32Array(0) };
    expect(mergeStudioBg3dSkpPrimitivesByMaterial([empty, noTriangles])).toEqual([]);
    expect(mergeStudioBg3dSkpPrimitivesByMaterial([])).toEqual([]);
  });

  it("fails with skp-parse-failed on corrupt arrays instead of emitting a broken mesh", () => {
    const base = quad(0);
    const corrupt: StudioBg3dSkpPrimitive[] = [
      { ...base, positions: new Float32Array(10) },
      { ...base, normals: new Float32Array(9) },
      { ...base, uvs: new Float32Array(6) },
      { ...base, indices: new Uint32Array([0, 1]) },
      { ...base, indices: new Uint32Array([0, 1, 99]) },
      { ...base, materialIndex: -1 },
      { ...base, materialIndex: Number.NaN },
    ];
    for (const primitive of corrupt) {
      const error = failureOf(() => mergeStudioBg3dSkpPrimitivesByMaterial([primitive]));
      expect(error.code).toBe("skp-parse-failed");
      expect(error.reason).toBe("invalid-geometry");
    }
  });
});

describe("analyzeStudioBg3dSkpMesh", () => {
  it("measures a closed box: counts, bounds, size and a clean orientation check", () => {
    const stats = analyzeStudioBg3dSkpMesh([createBoxPrimitive({ size: 2 })], BUDGET);
    expect(stats.vertexCount).toBe(24);
    expect(stats.triangleCount).toBe(12);
    expect(stats.primitiveCount).toBe(1);
    expect(stats.materialCount).toBe(1);
    expect(stats.bounds).toEqual({ min: [0, 0, 0], max: [2, 2, 2] });
    expect(stats.sizeMeters).toEqual([2, 2, 2]);
    expect(stats.degenerateTriangles).toBe(0);
    // 12 모서리 + 면마다 대각선 6개 = 정확히 두 삼각형이 공유하는 경계 18개, 어긋남 없음.
    expect(stats.orientation).toEqual({ status: "checked", sharedEdges: 18, conflictingEdges: 0 });
  });

  it("counts exactly the four borders of a single reversed face as flipped", () => {
    const stats = analyzeStudioBg3dSkpMesh([createBoxPrimitive({ reversedFaces: [2] })], BUDGET);
    expect(stats.orientation.conflictingEdges).toBe(4);
    expect(stats.orientation.sharedEdges).toBe(18);
  });

  it("welds split vertices across separate primitives that touch each other", () => {
    const touching = [createBoxPrimitive({ origin: [0, 0, 0] }), createBoxPrimitive({ origin: [1, 0, 0], materialIndex: 1 })];
    const stats = analyzeStudioBg3dSkpMesh(touching, BUDGET);
    expect(stats.triangleCount).toBe(24);
    // 맞닿은 면은 두 상자의 면이 겹쳐(서로 반대 방향) 경계가 4개 삼각형에 쓰여 판단에서 빠지고, 어긋남은 없다.
    expect(stats.orientation.conflictingEdges).toBe(0);
  });

  it("treats back-to-back front and back copies of a face as consistent", () => {
    const front = quad(0);
    const back = quad(0, 0, true);
    const stats = analyzeStudioBg3dSkpMesh([front, back], BUDGET);
    expect(stats.orientation.conflictingEdges).toBe(0);
  });

  it("flags two coplanar neighbours whose fronts point opposite ways", () => {
    const left = quad(0);
    const right: StudioBg3dSkpPrimitive = {
      ...quad(0, 0, true),
      positions: new Float32Array([1, 0, 0, 2, 0, 0, 2, 1, 0, 1, 1, 0]),
    };
    const stats = analyzeStudioBg3dSkpMesh([left, right], BUDGET);
    expect(stats.orientation.sharedEdges).toBeGreaterThan(0);
    // 가운데 맞닿은 변(1,0,0)-(1,1,0)을 두 면이 같은 방향으로 지난다 → 한 개의 어긋난 경계.
    expect(stats.orientation.conflictingEdges).toBe(1);
  });

  it("ignores open borders and edges shared by three or more triangles", () => {
    const sheet = analyzeStudioBg3dSkpMesh([quad(0)], BUDGET);
    expect(sheet.orientation).toEqual({ status: "checked", sharedEdges: 1, conflictingEdges: 0 });
    const fin = analyzeStudioBg3dSkpMesh([quad(0), quad(0), quad(0)], BUDGET);
    expect(fin.orientation.conflictingEdges).toBe(0);
  });

  it("skips the orientation check, and says so, once the triangle budget is exceeded", () => {
    const stats = analyzeStudioBg3dSkpMesh([createBoxPrimitive()], { orientationTriangleBudget: 11 });
    expect(stats.orientation).toEqual({ status: "skipped", sharedEdges: 0, conflictingEdges: 0 });
    expect(stats.triangleCount).toBe(12);
    expect(analyzeStudioBg3dSkpMesh([createBoxPrimitive()], { orientationTriangleBudget: 12 }).orientation.status)
      .toBe("checked");
  });

  it("counts zero-area triangles", () => {
    const flat: StudioBg3dSkpPrimitive = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]),
      normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
      uvs: new Float32Array(6),
      indices: new Uint32Array([0, 1, 2]),
      materialIndex: 0,
      geomName: "line",
    };
    expect(analyzeStudioBg3dSkpMesh([flat], BUDGET).degenerateTriangles).toBe(1);
  });

  it("rejects non-finite coordinates", () => {
    const broken = createBoxPrimitive();
    broken.positions[4] = Number.NaN;
    const error = failureOf(() => analyzeStudioBg3dSkpMesh([broken], BUDGET));
    expect(error.code).toBe("skp-parse-failed");
    expect(error.reason).toBe("invalid-geometry");
    const infinite = createBoxPrimitive();
    infinite.positions[0] = Number.POSITIVE_INFINITY;
    expect(failureOf(() => analyzeStudioBg3dSkpMesh([infinite], BUDGET)).reason).toBe("invalid-geometry");
  });

  it("reports an empty mesh as having no bounds instead of inventing a size", () => {
    const stats = analyzeStudioBg3dSkpMesh([], BUDGET);
    expect(stats.bounds).toBeNull();
    expect(stats.sizeMeters).toBeNull();
    expect(stats.triangleCount).toBe(0);
    expect(stats.orientation.status).toBe("checked");
  });

  it("stays fast on a large mesh (budgeted query cost)", () => {
    const boxes = Array.from({ length: 4_000 }, (_, index) =>
      createBoxPrimitive({ origin: [(index % 50) * 3, Math.floor(index / 50) * 3, 0], materialIndex: index % 7 }));
    const merged = mergeStudioBg3dSkpPrimitivesByMaterial(boxes);
    const started = performance.now();
    const stats = analyzeStudioBg3dSkpMesh(merged, { orientationTriangleBudget: 150_000 });
    const elapsed = performance.now() - started;
    expect(stats.triangleCount).toBe(48_000);
    expect(stats.orientation.status).toBe("checked");
    expect(stats.orientation.conflictingEdges).toBe(0);
    expect(elapsed).toBeLessThan(5_000);
  });
});
