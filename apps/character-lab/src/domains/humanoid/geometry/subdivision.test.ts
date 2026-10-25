import { describe, expect, it } from "vitest";

import { NO_REGION, QuadMeshBuilder, quadMeshEdgeStats, type QuadMesh } from "./quad-mesh";
import {
  adaptPartSeamOffsets,
  buildSubdivisionPlan,
  catmullClark,
  computeSeamCentroids3Zone,
  expandWelded,
  findCoincidentVertexGroups,
  liftAttribute,
  liftRegions,
  lockCoincidentSeamVertices,
  matchNeckSeamVertices,
  predictVertexCount,
  subdividedToTriMesh,
  weldNeckSeamPositionsAndNormals,
} from "./subdivision";
import { triMeshIsWatertight } from "./tri-mesh";

import type { Vec3 } from "../../../shared/math";

/** [-1,1]³ 큐브(정점 8·면 6). 면마다 독립 UV 섬(UV 정점 24) — 솔기가 있는 케이지의 최소 예. */
function cubeCage(regionOf: (p: Vec3) => number = () => NO_REGION): QuadMesh {
  const builder = new QuadMeshBuilder();
  const corners: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([x, y, z]);
  const ids = corners.map((corner) => builder.addVertex(corner, regionOf(corner)));
  const at = (x: number, y: number, z: number): number => ids[((x + 1) / 2) * 4 + ((y + 1) / 2) * 2 + (z + 1) / 2];
  const faces: Array<[number, number, number, number]> = [
    [at(1, -1, -1), at(1, 1, -1), at(1, 1, 1), at(1, -1, 1)],
    [at(-1, -1, 1), at(-1, 1, 1), at(-1, 1, -1), at(-1, -1, -1)],
    [at(-1, 1, -1), at(-1, 1, 1), at(1, 1, 1), at(1, 1, -1)],
    [at(-1, -1, 1), at(-1, -1, -1), at(1, -1, -1), at(1, -1, 1)],
    [at(-1, -1, 1), at(1, -1, 1), at(1, 1, 1), at(-1, 1, 1)],
    [at(1, -1, -1), at(-1, -1, -1), at(-1, 1, -1), at(1, 1, -1)],
  ];
  faces.forEach((face, f) => {
    const col = f % 3;
    const row = Math.floor(f / 3);
    const uv = [builder.addUv(col / 3, row / 2), builder.addUv((col + 0.9) / 3, row / 2), builder.addUv((col + 0.9) / 3, (row + 0.9) / 2), builder.addUv(col / 3, (row + 0.9) / 2)] as const;
    builder.addQuad(face, uv);
  });
  return builder.build();
}

function hasVertex(positions: Float32Array, target: Vec3, eps = 1e-6): boolean {
  for (let i = 0; i < positions.length; i += 3) {
    if (Math.abs(positions[i] - target[0]) < eps && Math.abs(positions[i + 1] - target[1]) < eps && Math.abs(positions[i + 2] - target[2]) < eps) return true;
  }
  return false;
}

describe("Catmull-Clark(큐브)", () => {
  const cube = cubeCage();

  it("큐브 케이지가 닫힌 쿼드 다양체다(정점 8·간선 12·면 6)", () => {
    const stats = quadMeshEdgeStats(cube);
    expect([cube.positions.length / 3, stats.edgeCount, cube.faces.length / 4]).toEqual([8, 12, 6]);
    expect(stats.nonManifoldEdges).toBe(0);
    expect(stats.inconsistentEdges).toBe(0);
  });

  it("1회 세분: 정점 26·면 24·간선 48이고 Euler 특성이 2다", () => {
    const sub = catmullClark(cube, 1);
    expect(sub.positions.length / 3).toBe(26);
    expect(sub.faces.length / 4).toBe(24);
    const stats = quadMeshEdgeStats(sub);
    expect(stats.edgeCount).toBe(48);
    expect(26 - stats.edgeCount + 24).toBe(2);
    expect(predictVertexCount(cube, 1)).toBe(26);
  });

  it("2회 세분: 정점 98·면 96이고 predictVertexCount와 일치한다", () => {
    const sub = catmullClark(cube, 2);
    expect(sub.positions.length / 3).toBe(98);
    expect(sub.faces.length / 4).toBe(96);
    expect(predictVertexCount(cube, 2)).toBe(98);
    expect(catmullClark(cube, 0).positions).toEqual(cube.positions);
  });

  it("Catmull-Clark 규칙 값: 모서리 (5/9,5/9,5/9), 면점 (±1,0,0), 간선점 (3/4,3/4,0)", () => {
    const { positions } = catmullClark(cube, 1);
    expect(hasVertex(positions, [5 / 9, 5 / 9, 5 / 9])).toBe(true);
    expect(hasVertex(positions, [-5 / 9, 5 / 9, -5 / 9])).toBe(true);
    expect(hasVertex(positions, [1, 0, 0])).toBe(true);
    expect(hasVertex(positions, [0, -1, 0])).toBe(true);
    expect(hasVertex(positions, [0.75, 0.75, 0])).toBe(true);
    expect(hasVertex(positions, [0, -0.75, 0.75])).toBe(true);
  });

  it("세분은 형상을 줄인다(수축 극한): 모든 세분 정점이 원래 큐브 경계 안이다", () => {
    const { positions } = catmullClark(cube, 2);
    for (let i = 0; i < positions.length; i += 1) expect(Math.abs(positions[i])).toBeLessThanOrEqual(1 + 1e-6);
  });

  it("선형 연산자다: lift(a + b) = lift(a) + lift(b)이고 스텐실 리프트가 세분 위치와 같다", () => {
    const plan = buildSubdivisionPlan(cube, 1);
    const a = Float32Array.from(cube.positions, (value, i) => value * 0.5 + (i % 3) * 0.1);
    const b = Float32Array.from(cube.positions, (value, i) => value * -0.25 + (i % 5) * 0.01);
    const sum = Float32Array.from(a, (value, i) => value + b[i]);
    const la = liftAttribute(plan, a, 3);
    const lb = liftAttribute(plan, b, 3);
    const ls = liftAttribute(plan, sum, 3);
    for (let i = 0; i < ls.length; i += 1) expect(Math.abs(ls[i] - (la[i] + lb[i]))).toBeLessThan(1e-5);
    const direct = catmullClark(cube, 1);
    expect(Array.from(liftAttribute(plan, cube.positions, 3))).toEqual(Array.from(direct.positions));
  });

  it("UV는 섬(솔기) 토폴로지로 따로 세분되어 [0,1] 안이고 UV 정점이 54개다(면마다 3×3)", () => {
    const sub = catmullClark(cube, 1);
    expect(sub.uvs.length / 2).toBe(54);
    for (let i = 0; i < sub.uvs.length; i += 1) {
      expect(sub.uvs[i]).toBeGreaterThanOrEqual(0);
      expect(sub.uvs[i]).toBeLessThanOrEqual(1);
    }
  });

  it("삼각 메시: (위치, UV) 쌍으로 정점을 분할하고(26 → 솔기에서 증가) 용접 법선이 단위·수밀이다", () => {
    const tri = subdividedToTriMesh(catmullClark(cube, 1));
    expect(tri.weldedVertexCount).toBe(26);
    expect(tri.positions.length / 3).toBeGreaterThan(26);
    expect(tri.indices.length / 3).toBe(48);
    expect(tri.weldedTriangles.length / 3).toBe(48);
    expect(triMeshIsWatertight(tri.positions, tri.indices)).toBe(true);
    for (let i = 0; i < tri.normals.length; i += 3) expect(Math.abs(Math.hypot(tri.normals[i], tri.normals[i + 1], tri.normals[i + 2]) - 1)).toBeLessThan(1e-4);
    // 솔기에서 갈라진 같은 위치의 법선은 같다(용접 법선)
    const expanded = expandWelded(Float32Array.from({ length: 26 * 3 }, (_, i) => i), tri.vertexSource, 3);
    expect(expanded.length).toBe(tri.positions.length);
    expect(expanded[3 * 5]).toBe(tri.vertexSource[5] * 3);
  });

  it("영역 태그는 원-핫 리프트 후 최대 영향 영역으로 정한다(+x 절반은 영역 1)", () => {
    const tagged = cubeCage((p) => (p[0] > 0 ? 1 : 0));
    const sub = catmullClark(tagged, 1);
    expect(sub.regions.length).toBe(26);
    for (let v = 0; v < 26; v += 1) {
      const x = sub.positions[v * 3];
      if (x > 0.5) expect(sub.regions[v]).toBe(1);
      if (x < -0.5) expect(sub.regions[v]).toBe(0);
    }
    expect(liftRegions(buildSubdivisionPlan(tagged, 1), tagged.regions, 16)).toEqual(sub.regions);
  });
});

describe("Catmull-Clark(열린 패치 경계 규칙)", () => {
  /** z = 0의 3×3 정점(쿼드 4개) 평면 패치 */
  function patch(): QuadMesh {
    const builder = new QuadMeshBuilder();
    const ids: number[][] = [];
    const uvs: number[][] = [];
    for (let j = 0; j < 3; j += 1) {
      ids.push([]);
      uvs.push([]);
      for (let i = 0; i < 3; i += 1) {
        ids[j].push(builder.addVertex([i, j, 0]));
        uvs[j].push(builder.addUv(i / 2, j / 2));
      }
    }
    for (let j = 0; j < 2; j += 1) {
      for (let i = 0; i < 2; i += 1) {
        builder.addQuadExact([ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]], [uvs[j][i], uvs[j][i + 1], uvs[j + 1][i + 1], uvs[j + 1][i]]);
      }
    }
    return builder.build();
  }

  it("평면 패치는 세분 후에도 평면이고 경계 정점이 경계선 위에 남는다", () => {
    const sub = catmullClark(patch(), 2);
    // 정점 9 → 25 → 81 (V' = V + E + F)
    expect(sub.positions.length / 3).toBe(81);
    for (let v = 0; v < sub.positions.length / 3; v += 1) {
      expect(Math.abs(sub.positions[v * 3 + 2])).toBeLessThan(1e-9);
      expect(sub.positions[v * 3]).toBeGreaterThanOrEqual(-1e-9);
      expect(sub.positions[v * 3]).toBeLessThanOrEqual(2 + 1e-9);
    }
    // 경계 규칙: 아래 경계(y=0)의 정점은 y가 0으로 유지된다(경계 곡선 3차 B-스플라인 규칙)
    let onBottom = 0;
    for (let v = 0; v < sub.positions.length / 3; v += 1) if (Math.abs(sub.positions[v * 3 + 1]) < 1e-9) onBottom += 1;
    expect(onBottom).toBe(9);
  });
});

describe("SHAPER 준-샤프(Semi-Sharp) 세분화 및 파츠/목 심(Seam) 정합", () => {
  const cube = cubeCage();

  it("정점 샤프니스 p=0일 때 표준 Catmull-Clark과 일치하고, p=1일 때 모서리와 간선 중점이 원래 위치에 고정된다", () => {
    const zeroSharpness = new Float32Array(8).fill(0);
    const subZero = catmullClark(cube, 1, { vertexSharpness: zeroSharpness });
    const subStd = catmullClark(cube, 1);
    expect(Array.from(subZero.positions)).toEqual(Array.from(subStd.positions));

    const fullSharpness = new Float32Array(8).fill(1);
    const subSharp = catmullClark(cube, 1, { vertexSharpness: fullSharpness, cornerRule: "shaper" });
    // p=1이면 모서리 (1,1,1)이 수축하지 않고 (1,1,1)에 그대로 남고, 간선점도 선형 중점 (1,1,0)에 위치한다.
    expect(hasVertex(subSharp.positions, [1, 1, 1])).toBe(true);
    expect(hasVertex(subSharp.positions, [1, 1, 0])).toBe(true);
  });

  it("SHAPER cornerRule='shaper'에서 p=0.8 능선 정점은 표준 스무딩보다 날카로운 위치를 유지한다", () => {
    const ridgeSharpness = new Float32Array(8).fill(0.8);
    const subRidge = catmullClark(cube, 1, { vertexSharpness: ridgeSharpness, cornerRule: "shaper" });
    const subSmooth = catmullClark(cube, 1, { vertexSharpness: new Float32Array(8).fill(0), cornerRule: "shaper" });
    expect(Math.abs(subRidge.positions[0])).toBeGreaterThan(Math.abs(subSmooth.positions[0]));
  });

  it("동일 초기 위치 심(Seam) 정점 그룹을 찾아 세분 후 위치와 법선을 일치시킨다", () => {
    const initial = new Float32Array([
      -0.5, 0.2, 0.1,
      -0.50001, 0.2, 0.1,
      0.5, 0.2, 0.1,
    ]);
    const groups = findCoincidentVertexGroups(initial, 1e-3);
    expect(groups.length).toBe(1);
    expect(Array.from(groups[0])).toEqual([0, 1]);

    const deformed = new Float32Array([
      -0.48, 0.22, 0.12,
      -0.52, 0.18, 0.08,
      0.5, 0.2, 0.1,
    ]);
    const normals = new Float32Array([
      0, 1, 0,
      1, 0, 0,
      0, 0, 1,
    ]);
    lockCoincidentSeamVertices(deformed, normals, groups);
    expect(deformed[0]).toBeCloseTo(-0.5, 5);
    expect(deformed[3]).toBeCloseTo(-0.5, 5);
    expect(deformed[1]).toBeCloseTo(0.2, 5);
    expect(deformed[4]).toBeCloseTo(0.2, 5);
    expect(normals[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(normals[3]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it("3-구간 Seam 무게중심(seamPosC/L/R) 차이로 파츠 정점과 안구 피벗을 자동 보정한다", () => {
    const sourceSeamVerts = new Float32Array([
      -1.0, 0.0, 0.0,
      0.0, 0.0, 0.0,
      1.0, 0.0, 0.0,
    ]);
    const targetSeamVerts = new Float32Array([
      -1.2, 0.1, 0.05,
      0.0, 0.1, 0.05,
      1.2, 0.1, 0.05,
    ]);
    const sourceSeams = computeSeamCentroids3Zone(sourceSeamVerts, [0, 1, 2]);
    const targetSeams = computeSeamCentroids3Zone(targetSeamVerts, [0, 1, 2]);
    expect(sourceSeams.seamPosC).toEqual([0, 0, 0]);
    expect(sourceSeams.seamPosL).toEqual([-0.5, 0, 0]);
    expect(sourceSeams.seamPosR).toEqual([0.5, 0, 0]);

    const adapted = adaptPartSeamOffsets({
      partPositions: sourceSeamVerts,
      sourceSeams,
      targetSeams,
      mirrorType: "bilateral",
      eyeballPivotL: [-0.3, 1.5, 0.2],
      eyeballPivotR: [0.3, 1.5, 0.2],
    });
    expect(adapted.deltaL[0]).toBeCloseTo(-0.1, 5);
    expect(adapted.deltaR[0]).toBeCloseTo(0.1, 5);
    // 좌측 정점(x < 0)은 +deltaL 이동
    expect(adapted.adaptedPositions[0]).toBeCloseTo(-1.1, 5);
    // 우측 정점(x >= 0)은 +deltaR 이동
    expect(adapted.adaptedPositions[6]).toBeCloseTo(1.1, 5);
    // 안구 피벗 보정: (-delta.x, +delta.y, +delta.z)
    expect(adapted.adaptedEyeballPivotL?.[0]).toBeCloseTo(-0.3 - (-0.1), 5);
    expect(adapted.adaptedEyeballPivotR?.[0]).toBeCloseTo(0.3 - 0.1, 5);
  });

  it("두상-목 절단면 정점을 매칭하고 스키닝된 목 위치와 두상 법선을 용접한다", () => {
    const headPositions = new Float32Array([
      -0.2, 1.4, -0.1,
      0.2, 1.4, -0.1,
    ]);
    const neckPositions = new Float32Array([
      -0.2001, 1.395, -0.1,
      0.2001, 1.395, -0.1,
    ]);
    const headNormals = new Float32Array([
      0, 0.6, 0.8,
      0, 0.6, 0.8,
    ]);
    const neckNormals = new Float32Array([
      0, 0, 1,
      0, 0, 1,
    ]);
    const pairs = matchNeckSeamVertices(headPositions, [0, 1], neckPositions, [0, 1], 1e-2);
    expect(pairs.length).toBe(2);
    weldNeckSeamPositionsAndNormals({
      headPositions,
      headNormals,
      neckPositions,
      neckNormals,
      pairs,
      normalBlendWeight: 1.0,
    });
    expect(headPositions[1]).toBeCloseTo(1.395, 5);
    expect(neckNormals[1]).toBeCloseTo(0.6, 5);
    expect(neckNormals[2]).toBeCloseTo(0.8, 5);
  });
});
