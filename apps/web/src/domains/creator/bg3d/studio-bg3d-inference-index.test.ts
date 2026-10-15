import { describe, expect, it } from "vitest";

import {
  clampStudioBg3dInferenceCellSize,
  createStudioBg3dInferenceIndex,
  traverseStudioBg3dInferenceCells,
} from "./studio-bg3d-inference-index";
import { buildStudioBg3dInferenceSourceSet } from "./studio-bg3d-inference-sources";

import type { StudioBg3dInferenceSceneEntity } from "./studio-bg3d-inference-sources";

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function collectCells(a: readonly [number, number, number], b: readonly [number, number, number], size: number) {
  const cells: string[] = [];
  traverseStudioBg3dInferenceCells(a, b, size, 10_000, (x, y, z) => {
    cells.push(`${x},${y},${z}`);
    return true;
  });
  return cells;
}

function boxAt(id: string, x: number, y: number, z: number, scale = 1): StudioBg3dInferenceSceneEntity {
  return {
    id,
    kind: "box",
    position: [x, y, z],
    rotation: [0, 0, 0],
    scale: [scale, scale, scale],
  };
}

describe("studio-bg3d-inference-index 격자 순회(DDA)", () => {
  it("축 정렬 선분이 지나는 셀을 한 번씩 순서대로 방문한다", () => {
    expect(collectCells([0.5, 0.5, 0.5], [3.5, 0.5, 0.5], 1)).toEqual(["0,0,0", "1,0,0", "2,0,0", "3,0,0"]);
    expect(collectCells([0.5, 0.5, 0.5], [0.5, -2.5, 0.5], 1)).toEqual(["0,0,0", "0,-1,0", "0,-2,0", "0,-3,0"]);
  });

  it("점(길이 0 선분)은 셀 하나만 방문한다", () => {
    expect(collectCells([1.2, 3.4, -0.1], [1.2, 3.4, -0.1], 2)).toEqual(["0,1,-1"]);
  });

  it("임의 선분 위의 모든 표본점이 방문한 셀 안에 있다 (누락 없음)", () => {
    const random = lcg(1234);
    for (let trial = 0; trial < 200; trial += 1) {
      const a: [number, number, number] = [(random() - 0.5) * 60, (random() - 0.5) * 60, (random() - 0.5) * 60];
      const b: [number, number, number] = [(random() - 0.5) * 60, (random() - 0.5) * 60, (random() - 0.5) * 60];
      const size = [0.5, 1, 2, 3.7][trial % 4] ?? 2;
      const cells = new Set(collectCells(a, b, size));
      for (let step = 0; step <= 400; step += 1) {
        const t = step / 400;
        const x = Math.floor((a[0] + (b[0] - a[0]) * t) / size);
        const y = Math.floor((a[1] + (b[1] - a[1]) * t) / size);
        const z = Math.floor((a[2] + (b[2] - a[2]) * t) / size);
        expect(cells.has(`${x},${y},${z}`), `trial ${trial} t=${t}`).toBe(true);
      }
    }
  });

  it("방문 상한(maxSteps)에서 멈추고 truncated를 알린다", () => {
    let visits = 0;
    const result = traverseStudioBg3dInferenceCells([0, 0, 0], [100, 0, 0], 1, 10, () => {
      visits += 1;
      return true;
    });
    expect(visits).toBe(10);
    expect(result.truncated).toBe(true);
    const exact = traverseStudioBg3dInferenceCells([0, 0, 0], [9.5, 0, 0], 1, 10, () => true);
    expect(exact.truncated).toBe(false);
    expect(exact.steps).toBe(10);
  });

  it("방문 함수가 false를 돌려주면 즉시 멈춘다", () => {
    let visits = 0;
    traverseStudioBg3dInferenceCells([0, 0, 0], [50, 0, 0], 1, 1_000, () => {
      visits += 1;
      return visits < 3;
    });
    expect(visits).toBe(3);
  });

  it("셀 크기는 허용 범위로 고정된다", () => {
    expect(clampStudioBg3dInferenceCellSize(undefined)).toBe(2);
    expect(clampStudioBg3dInferenceCellSize(0.01)).toBe(0.25);
    expect(clampStudioBg3dInferenceCellSize(1_000)).toBe(16);
    expect(clampStudioBg3dInferenceCellSize(Number.NaN)).toBe(2);
    expect(clampStudioBg3dInferenceCellSize(3)).toBe(3);
  });
});

describe("studio-bg3d-inference-index 쿼리", () => {
  it("점 쿼리는 근처 셀의 점·모서리·면만 돌려주고 먼 상자는 훑지 않는다", () => {
    const entities = [boxAt("near", 0, 0.5, 0), boxAt("far", 100, 0.5, 100)];
    const index = createStudioBg3dInferenceIndex(buildStudioBg3dInferenceSourceSet({ entities }));
    const output = index.query({ a: [0.5, 1, 0.5], b: [0.5, 1, 0.5], radius: 0.2 });
    expect(output.points.length).toBeGreaterThan(0);
    expect(output.points.every((feature) => feature.sourceId === "near")).toBe(true);
    expect(output.edges.every((feature) => feature.sourceId === "near")).toBe(true);
    expect(output.volumes.map((volume) => volume.sourceId)).toEqual(["near"]);
    expect(output.stats.truncated).toBe(false);
    expect(output.stats.cellsVisited).toBeLessThanOrEqual(27);
  });

  it("여러 셀에 걸친 모서리·면도 한 번만 돌려준다 (중복 제거)", () => {
    const big = boxAt("big", 0, 5, 0, 10);
    const index = createStudioBg3dInferenceIndex(buildStudioBg3dInferenceSourceSet({ entities: [big] }), { cellSize: 1 });
    const output = index.query({ a: [-6, 5, 0], b: [6, 5, 0], radius: 0.5 });
    const edgeIds = output.edges.map((edge) => edge.id);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
    const volumeIds = output.volumes.map((volume) => volume.id);
    expect(volumeIds).toEqual(["big:v"]);
  });

  it("레이 쿼리는 선분 주변 셀의 특징을 찾는다", () => {
    const entities = [boxAt("target", 20, 0.5, 0), boxAt("aside", 20, 0.5, 30)];
    const index = createStudioBg3dInferenceIndex(buildStudioBg3dInferenceSourceSet({ entities }));
    const output = index.query({ a: [0, 0.5, 0], b: [40, 0.5, 0], radius: 0.3 });
    const sources = new Set(output.points.map((feature) => feature.sourceId));
    expect(sources.has("target")).toBe(true);
    expect(sources.has("aside")).toBe(false);
  });

  it("스캔 상한을 넘으면 truncated를 알리고 상한까지만 훑는다", () => {
    const entities: StudioBg3dInferenceSceneEntity[] = [];
    for (let i = 0; i < 400; i += 1) entities.push(boxAt(`dense-${i}`, 0.01 * i, 0.5, 0.01 * i, 0.1));
    const index = createStudioBg3dInferenceIndex(buildStudioBg3dInferenceSourceSet({ entities }));
    const output = index.query({ a: [1, 0.5, 1], b: [1, 0.5, 1], radius: 0.1 }, { maxFeaturesScanned: 100 });
    expect(output.stats.truncated).toBe(true);
    expect(output.stats.featuresScanned).toBe(100);
    expect(output.points.length + output.edges.length + output.volumes.length).toBeLessThanOrEqual(100);
  });

  it("셀 상한을 넘으면 truncated를 알리고 방문 셀 수가 상한을 넘지 않는다", () => {
    const index = createStudioBg3dInferenceIndex(
      buildStudioBg3dInferenceSourceSet({ entities: [boxAt("a", 0, 0, 0)] }),
      { cellSize: 0.5 },
    );
    const output = index.query({ a: [0, 0, 0], b: [300, 120, -90], radius: 0.5 }, { maxCells: 20 });
    expect(output.stats.truncated).toBe(true);
    expect(output.stats.cellsVisited).toBeLessThanOrEqual(20);
  });

  it("너무 긴 모서리·큰 면은 겹침 목록으로 옮겨져 항상 후보에 오른다", () => {
    const set = buildStudioBg3dInferenceSourceSet({
      entities: [],
      lines: [{ id: "long", a: [-4_000, 0, 0], b: [4_000, 0, 0], label: "긴 선", role: "guide" }],
    });
    const index = createStudioBg3dInferenceIndex(set, { cellSize: 1 });
    expect(index.stats.overflowEdges).toBe(1);
    const far = index.query({ a: [10, 3, 4], b: [10, 3, 4], radius: 0.1 });
    expect(far.edges.map((edge) => edge.sourceId)).toEqual(["long"]);
  });

  it("음수 좌표와 큰 좌표에서도 셀 키가 충돌하지 않는다", () => {
    const entities = [boxAt("neg", -9_000, 0.5, -9_000), boxAt("pos", 9_000, 0.5, 9_000), boxAt("zero", 0, 0.5, 0)];
    const index = createStudioBg3dInferenceIndex(buildStudioBg3dInferenceSourceSet({ entities }), { cellSize: 0.25 });
    for (const [id, x, z] of [["neg", -9_000, -9_000], ["pos", 9_000, 9_000], ["zero", 0, 0]] as const) {
      const output = index.query({ a: [x, 0.5, z], b: [x, 0.5, z], radius: 0.1 });
      expect(output.points.some((feature) => feature.sourceId === id), id).toBe(true);
      expect(output.points.every((feature) => feature.sourceId === id), id).toBe(true);
    }
  });

  it("같은 색인에 쿼리를 반복해도 결과가 같고 색인 통계가 보존된다", () => {
    const index = createStudioBg3dInferenceIndex(
      buildStudioBg3dInferenceSourceSet({ entities: [boxAt("a", 0, 0.5, 0), boxAt("b", 3, 0.5, 0)] }),
    );
    const shape = { a: [0.5, 1, 0.5] as const, b: [0.5, 1, 0.5] as const, radius: 0.3 };
    const first = index.query(shape);
    for (let i = 0; i < 50; i += 1) {
      const next = index.query(shape);
      expect(next.points.map((p) => p.id)).toEqual(first.points.map((p) => p.id));
      expect(next.edges.map((e) => e.id)).toEqual(first.edges.map((e) => e.id));
    }
    expect(index.stats.points).toBe(index.source.points.length);
    expect(index.stats.cellSize).toBe(2);
  });
});
