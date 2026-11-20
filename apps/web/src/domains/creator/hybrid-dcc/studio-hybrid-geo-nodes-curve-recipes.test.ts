import { describe, expect, it } from "vitest";

import {
  createCircleProfile,
  curveToMesh,
  deserializeCurveRecipe,
  evaluateField,
  generateWebtoonCurveRecipe,
  GEO_NODES_CURVE_RECIPES_SCHEMA_VERSION,
  resampleCurve,
  serializeCurveRecipe,
  type WebtoonCurveRecipeSpec,
} from "./studio-hybrid-geo-nodes-curve-recipes";

const ROAD_CURVE = [
  { x: 0, y: 0, z: 0 },
  { x: 4, y: 0, z: 1.5 },
  { x: 8, y: 0, z: 0 },
  { x: 12, y: 0, z: -1.5 },
] as const;

describe("studio-hybrid-geo-nodes-curve-recipes", () => {
  it("커브 리샘플링·필드 평가·수밀 단면 스윕(curveToMesh)이 비다양체 없이 닫힌 메시를 생성한다", () => {
    const samples = resampleCurve(ROAD_CURVE, "count", 10, false);
    expect(samples.length).toBe(10);
    expect(samples[0]!.factor).toBe(0);
    expect(samples[9]!.factor).toBeCloseTo(1, 5);

    const field = evaluateField(samples, {
      kind: "math",
      op: "remap",
      outMin: 0.5,
      outMax: 1.5,
      a: { kind: "seededNoise", seed: 12, frequency: 0.4 },
    });
    expect(field.length).toBe(10);
    for (let i = 0; i < field.length; i += 1) {
      expect(field[i]!).toBeGreaterThanOrEqual(0.5);
      expect(field[i]!).toBeLessThanOrEqual(1.5);
    }

    const swept = curveToMesh(samples, createCircleProfile(0.2, 6), {
      fillCaps: true,
      radiusScaleField: { kind: "constant", value: 1 },
    });
    expect(swept.positions.length / 3).toBe(10 * 6 + 2);
    expect(swept.indices.length % 3).toBe(0);

    // 닫힌 캡 포함 수밀 메시: 모든 비방향 간선이 정확히 2개 삼각형에 공유되어야 함
    const edgeUse = new Map<string, number>();
    for (let t = 0; t < swept.indices.length; t += 3) {
      const a = swept.indices[t]!;
      const b = swept.indices[t + 1]!;
      const c = swept.indices[t + 2]!;
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const) {
        const key = u < v ? `${u}:${v}` : `${v}:${u}`;
        edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
      }
    }
    const nonManifold = [...edgeUse.values()].filter((count) => count !== 2).length;
    expect(nonManifold).toBe(0);
  });

  it("펜스·전봇대(현수선 전선)·아치·계단 4대 웹툰 배경 레시피를 낮은 드로우콜로 생성한다", () => {
    const fence = generateWebtoonCurveRecipe({
      version: GEO_NODES_CURVE_RECIPES_SCHEMA_VERSION,
      kind: "fence",
      seed: 10,
      controlPoints: ROAD_CURVE,
      spacingMeters: 1.5,
      heightMeters: 1.2,
      widthMeters: 0.2,
    });
    expect(fence.sweptMesh.indices.length).toBeGreaterThan(0);
    expect(fence.drawCallCount).toBeLessThanOrEqual(4);

    const powerline = generateWebtoonCurveRecipe({
      version: GEO_NODES_CURVE_RECIPES_SCHEMA_VERSION,
      kind: "powerline",
      seed: 20,
      controlPoints: ROAD_CURVE,
      spacingMeters: 4,
      heightMeters: 8,
      widthMeters: 0.4,
      detailRatio: 0.8,
    });
    // 현수선 전선 처짐 검증: 전선 정점 중 최저 Y가 전봇대 꼭대기(8 * 0.92 = 7.36)보다 낮아야 함
    let minWireY = Infinity;
    for (let i = 1; i < powerline.sweptMesh.positions.length; i += 3) {
      if (powerline.sweptMesh.positions[i]! < minWireY) {
        minWireY = powerline.sweptMesh.positions[i]!;
      }
    }
    expect(minWireY).toBeLessThan(8 * 0.92 - 0.15);

    const arch = generateWebtoonCurveRecipe({
      version: GEO_NODES_CURVE_RECIPES_SCHEMA_VERSION,
      kind: "arch",
      seed: 30,
      controlPoints: [
        { x: -2, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ],
      spacingMeters: 0.4,
      heightMeters: 2.5,
      widthMeters: 0.5,
    });
    let maxArchY = -Infinity;
    for (let i = 1; i < arch.sweptMesh.positions.length; i += 3) {
      if (arch.sweptMesh.positions[i]! > maxArchY) maxArchY = arch.sweptMesh.positions[i]!;
    }
    expect(maxArchY).toBeGreaterThan(2.3);

    const stairs = generateWebtoonCurveRecipe({
      version: GEO_NODES_CURVE_RECIPES_SCHEMA_VERSION,
      kind: "stairs",
      seed: 40,
      controlPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 4 },
      ],
      spacingMeters: 0.35,
      heightMeters: 2.4,
      widthMeters: 1.4,
    });
    expect(stairs.instanceBatches[0]!.count).toBeGreaterThanOrEqual(10);
    // 마지막 계단 디딤판의 행렬 Y 이동값(index 13)이 목표 높이 근처여야 함
    const treadBatch = stairs.instanceBatches[0]!;
    const lastOffsetY = treadBatch.matrices[(treadBatch.count - 1) * 16 + 13]!;
    expect(lastOffsetY).toBeCloseTo(2.4, 2);
  });

  it("책장·가로수 레시피가 동일 시드에서 100% 결정적이고 JSON 직렬화 라운드트립을 보장한다", () => {
    const spec: WebtoonCurveRecipeSpec = {
      version: GEO_NODES_CURVE_RECIPES_SCHEMA_VERSION,
      kind: "bookshelf",
      seed: 999,
      controlPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 2.4, y: 0, z: 0 },
      ],
      spacingMeters: 0.2,
      heightMeters: 1.8,
      widthMeters: 0.3,
    };

    const roundTripped = deserializeCurveRecipe(serializeCurveRecipe(spec));
    const runA = generateWebtoonCurveRecipe(spec);
    const runB = generateWebtoonCurveRecipe(roundTripped);

    expect(runA.instanceBatches.length).toBe(runB.instanceBatches.length);
    for (let i = 0; i < runA.instanceBatches.length; i += 1) {
      expect(Array.from(runA.instanceBatches[i]!.matrices)).toEqual(
        Array.from(runB.instanceBatches[i]!.matrices),
      );
    }
  });
});
