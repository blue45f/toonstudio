import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as Barrel from "./index";
import {
  CULL_COMPUTE_WORKGROUP_SIZE_X,
  CULL_UNIFORM_BYTES,
  DRAW_INDEXED_INDIRECT_U32_COUNT,
  DRAW_INDIRECT_U32_COUNT,
  FLAT_BVH_NO_PARENT,
  FLAT_BVH_NODE_BOUNDS_FLOATS,
  FLAT_BVH_NODE_TOPO_U32S,
  FLAT_BVH_NODE_TOTAL_BYTES,
  GPU_FRUSTUM_CULL_INDIRECT_WGSL,
  GRAPHICS_PAPER_PIPELINE_SPECS,
  INSTANCED_LOOP_BLINN_OBJECT_WGSL,
  INSTANCED_OBJECT_STRIDE_BYTES,
  INSTANCED_OBJECT_STRIDE_FLOATS,
  RENDER_VIEW_UNIFORM_BYTES,
  SCENE_OBJECT_ALL_KINDS_MASK,
  SCENE_OBJECT_FLAG_IMPASTO_RELIEF,
  SCENE_OBJECT_FLAG_LOCKED,
  SCENE_OBJECT_FLAG_LOOP_BLINN_CURVE,
  SCENE_OBJECT_FLAG_VISIBLE,
  SCENE_OBJECT_KIND_BILLBOARD_3D,
  SCENE_OBJECT_KIND_BRUSH_STAMP,
  SCENE_OBJECT_KIND_PANEL_FRAME,
  SCENE_OBJECT_KIND_SCREENTONE_PATCH,
  SCENE_OBJECT_KIND_SPEECH_BUBBLE,
  SCENE_OBJECT_KIND_VECTOR_STROKE,
  WASM32_SAFE_ARENA_CEILING_BYTES,
  buildFlatBvh2d,
  computeSceneArenaByteLayout,
  createSceneObjectArena,
  emulateGpuFrustumCullPass,
  estimatePipelineMemoryFootprint,
  getGraphicsPaperPipelineSpec,
  hitTestPointBvh,
  packAllSceneInstancesForGpuCull,
  packCullUniforms,
  packInstanceMaterialMeta,
  packInstancedDrawBuffer,
  packRenderViewportUniforms,
  packRgba8U32,
  pushSceneObject,
  queryViewportVisibleIndices,
  unpackRgba8U32,
  updateSceneObjectBounds,
  validateInstancedWgslBundle,
  type FlatBvh2d,
  type SceneObjectArenaSoA,
  type SceneObjectKindCode,
  type ViewportBounds2d,
} from "./index";

/** 결정론적 LCG 의사난수 생성기 (재현 가능한 1만 오브젝트 씬 구성용). */
function createDeterministicRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** 10,000+ 이종 2D/2.5D 스튜디오 오브젝트(말풍선·컷·스크린톤·벡터·빌보드·스탬프) 아레나를 생성한다. */
function buildSyntheticStudioScene(count: number, seed = 20261125): SceneObjectArenaSoA {
  const rng = createDeterministicRng(seed);
  const arena = createSceneObjectArena(count);
  const kinds: readonly SceneObjectKindCode[] = [
    SCENE_OBJECT_KIND_SPEECH_BUBBLE,
    SCENE_OBJECT_KIND_PANEL_FRAME,
    SCENE_OBJECT_KIND_SCREENTONE_PATCH,
    SCENE_OBJECT_KIND_VECTOR_STROKE,
    SCENE_OBJECT_KIND_BILLBOARD_3D,
    SCENE_OBJECT_KIND_BRUSH_STAMP,
  ];
  for (let i = 0; i < count; i += 1) {
    const cx = rng() * 20000 - 10000;
    const cy = rng() * 20000 - 10000;
    const w = 12 + rng() * 140;
    const h = 10 + rng() * 110;
    const kindCode = kinds[i % kinds.length] ?? SCENE_OBJECT_KIND_SPEECH_BUBBLE;
    const visibleFlag = i % 29 === 0 ? 0 : SCENE_OBJECT_FLAG_VISIBLE;
    const extraFlag =
      kindCode === SCENE_OBJECT_KIND_VECTOR_STROKE
        ? SCENE_OBJECT_FLAG_LOOP_BLINN_CURVE
        : kindCode === SCENE_OBJECT_KIND_BRUSH_STAMP
          ? SCENE_OBJECT_FLAG_IMPASTO_RELIEF
          : 0;
    pushSceneObject(arena, {
      objectId: 100000 + i,
      minX: cx - w * 0.5,
      minY: cy - h * 0.5,
      maxX: cx + w * 0.5,
      maxY: cy + h * 0.5,
      kindCode,
      rotationRad: 0,
      zOrder: (i * 17) % count,
      curveBias: (i % 10) * 0.1,
      colorPackedRgba8: packRgba8U32((i * 37) & 255, (i * 73) & 255, (i * 109) & 255, 240),
      textureMaterialId: i % 512,
      flags: visibleFlag | extraFlag,
    });
  }
  return arena;
}

/** 브루트포스 선형 스캔 뷰포트 컬링 참조 구현 (BVH 100% 일치 검증용). */
function bruteForceViewportQuery(
  arena: SceneObjectArenaSoA,
  vp: ViewportBounds2d,
  margin = 0,
  includeHidden = false,
  kindMask: number = SCENE_OBJECT_ALL_KINDS_MASK,
): number[] {
  const qMinX = Math.min(vp.minX, vp.maxX) - margin;
  const qMaxX = Math.max(vp.minX, vp.maxX) + margin;
  const qMinY = Math.min(vp.minY, vp.maxY) - margin;
  const qMaxY = Math.max(vp.minY, vp.maxY) + margin;
  const out: number[] = [];
  for (let i = 0; i < arena.count; i += 1) {
    if (!includeHidden && ((arena.flags[i] ?? 0) & SCENE_OBJECT_FLAG_VISIBLE) === 0) continue;
    if (((1 << ((arena.kindCode[i] ?? 0) & 0x0f)) & kindMask) === 0) continue;
    if (
      (arena.maxX[i] ?? -Infinity) >= qMinX &&
      (arena.minX[i] ?? Infinity) <= qMaxX &&
      (arena.maxY[i] ?? -Infinity) >= qMinY &&
      (arena.minY[i] ?? Infinity) <= qMaxY
    ) {
      out.push(i);
    }
  }
  return out;
}

/** Flat-BVH 트리 구조 불변량 전체 검증기(부모 포인터·리프 합계·중복 없음·AABB 포함 관계). */
function assertValidFlatBvhInvariants(bvh: FlatBvh2d, arena: SceneObjectArenaSoA): void {
  expect(bvh.objectCount).toBe(arena.count);
  expect(bvh.stats.bvhMemoryBytes).toBe(bvh.nodeCount * FLAT_BVH_NODE_TOTAL_BYTES + bvh.objectCount * 4);
  if (bvh.objectCount === 0) {
    expect(bvh.nodeCount).toBe(0);
    return;
  }
  expect(bvh.nodeTopology[3]).toBe(FLAT_BVH_NO_PARENT);
  const seenPrims = new Uint8Array(bvh.objectCount);
  let leafPrimTotal = 0;

  for (let n = 0; n < bvh.nodeCount; n += 1) {
    const bBase = n * FLAT_BVH_NODE_BOUNDS_FLOATS;
    const tBase = n * FLAT_BVH_NODE_TOPO_U32S;
    const minX = bvh.nodeBounds[bBase] ?? 0;
    const minY = bvh.nodeBounds[bBase + 1] ?? 0;
    const maxX = bvh.nodeBounds[bBase + 2] ?? 0;
    const maxY = bvh.nodeBounds[bBase + 3] ?? 0;
    expect(minX).toBeLessThanOrEqual(maxX);
    expect(minY).toBeLessThanOrEqual(maxY);

    const isLeaf = ((bvh.nodeTopology[tBase + 2] ?? 0) & 1) === 1;
    if (isLeaf) {
      const first = bvh.nodeTopology[tBase] ?? 0;
      const count = bvh.nodeTopology[tBase + 1] ?? 0;
      expect(count).toBeGreaterThan(0);
      leafPrimTotal += count;
      for (let i = first; i < first + count; i += 1) {
        const p = bvh.primIndices[i] ?? -1;
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(bvh.objectCount);
        seenPrims[p] = (seenPrims[p] ?? 0) + 1;
        expect(arena.minX[p]).toBeGreaterThanOrEqual(minX - 1e-4);
        expect(arena.minY[p]).toBeGreaterThanOrEqual(minY - 1e-4);
        expect(arena.maxX[p]).toBeLessThanOrEqual(maxX + 1e-4);
        expect(arena.maxY[p]).toBeLessThanOrEqual(maxY + 1e-4);
      }
    } else {
      const left = bvh.nodeTopology[tBase] ?? 0;
      const right = bvh.nodeTopology[tBase + 1] ?? 0;
      expect(bvh.nodeTopology[left * FLAT_BVH_NODE_TOPO_U32S + 3]).toBe(n);
      expect(bvh.nodeTopology[right * FLAT_BVH_NODE_TOPO_U32S + 3]).toBe(n);
      for (const child of [left, right]) {
        const cb = child * FLAT_BVH_NODE_BOUNDS_FLOATS;
        expect(bvh.nodeBounds[cb]).toBeGreaterThanOrEqual(minX - 1e-4);
        expect(bvh.nodeBounds[cb + 1]).toBeGreaterThanOrEqual(minY - 1e-4);
        expect(bvh.nodeBounds[cb + 2]).toBeLessThanOrEqual(maxX + 1e-4);
        expect(bvh.nodeBounds[cb + 3]).toBeLessThanOrEqual(maxY + 1e-4);
      }
    }
  }
  expect(leafPrimTotal).toBe(bvh.objectCount);
  for (let i = 0; i < bvh.objectCount; i += 1) {
    expect(seenPrims[i]).toBe(1);
  }
}

describe("Wave 51D — Flat SoA Arena & WASM32/WASM64 Zero-Copy Layout", () => {
  it("모든 SoA 컬럼 오프셋이 다양한 용량에서 16-byte 정렬을 보장한다", () => {
    for (const cap of [1, 3, 13, 257, 10000]) {
      const layout = computeSceneArenaByteLayout(cap);
      expect(layout.alignedColumnBytes % 16).toBe(0);
      expect(layout.totalBytes % 16).toBe(0);
      expect(layout.minXOffset % 16).toBe(0);
      expect(layout.maxYOffset % 16).toBe(0);
      expect(layout.flagsOffset % 16).toBe(0);
      expect(layout.totalBytes).toBe(layout.alignedColumnBytes * 12);
    }
  });

  it("외부 WASM 선형 ArrayBuffer와 비-0 16-byte 오프셋에서 Zero-Copy로 공유된다", () => {
    const layout = computeSceneArenaByteLayout(64);
    const wasmLinearMem = new ArrayBuffer(256 + layout.totalBytes);
    const arenaA = createSceneObjectArena(64, wasmLinearMem, 128);
    const arenaB = createSceneObjectArena(64, wasmLinearMem, 128);

    const idx = pushSceneObject(arenaA, {
      objectId: 9001,
      minX: 12.5,
      minY: 24.5,
      maxX: 112.5,
      maxY: 84.5,
      kindCode: SCENE_OBJECT_KIND_SPEECH_BUBBLE,
    });
    expect(idx).toBe(0);
    expect(arenaA.buffer).toBe(wasmLinearMem);
    expect(arenaB.minX[0]).toBe(12.5);
    expect(arenaB.objectId[0]).toBe(9001);
  });

  it("정렬 위반 오프셋·과소 외부 버퍼·용량 초과 시 명확한 RangeError를 던진다", () => {
    expect(() => createSceneObjectArena(8, new ArrayBuffer(4096), 8)).toThrow(RangeError);
    expect(() => createSceneObjectArena(100, new ArrayBuffer(64), 0)).toThrow(RangeError);
    const tiny = createSceneObjectArena(1);
    pushSceneObject(tiny, { objectId: 1, minX: 0, minY: 0, maxX: 10, maxY: 10, kindCode: 0 });
    expect(() =>
      pushSceneObject(tiny, { objectId: 2, minX: 0, minY: 0, maxX: 10, maxY: 10, kindCode: 0 }),
    ).toThrow(RangeError);
  });

  it("역전된 AABB 좌표를 자동 정규화하고 updateSceneObjectBounds로 제자리 갱신한다", () => {
    const arena = createSceneObjectArena(4);
    const idx = pushSceneObject(arena, {
      objectId: 42,
      minX: 100,
      minY: 80,
      maxX: 20,
      maxY: -10,
      kindCode: SCENE_OBJECT_KIND_PANEL_FRAME,
    });
    expect(arena.minX[idx]).toBe(20);
    expect(arena.maxX[idx]).toBe(100);
    expect(arena.minY[idx]).toBe(-10);
    expect(arena.maxY[idx]).toBe(80);

    updateSceneObjectBounds(arena, idx, 50, 60, 10, 5);
    expect(arena.minX[idx]).toBe(10);
    expect(arena.maxX[idx]).toBe(50);
    expect(arena.minY[idx]).toBe(5);
    expect(arena.maxY[idx]).toBe(60);
    expect(() => updateSceneObjectBounds(arena, 9, 0, 0, 1, 1)).toThrow(RangeError);
  });

  it("packRgba8U32/unpackRgba8U32가 클램핑과 비트 무손실 왕복을 보장한다", () => {
    const packed = packRgba8U32(18, 128, 240, 200);
    expect(unpackRgba8U32(packed)).toEqual([18, 128, 240, 200]);
    const clamped = packRgba8U32(-12, 300, Number.NaN, 255.4);
    expect(unpackRgba8U32(clamped)).toEqual([0, 255, 0, 255]);
  });
});

describe("Wave 51D — SAH Flat-BVH 구축 (10,000+ 오브젝트 포함)", () => {
  it("빈 아레나(0개)와 단일 오브젝트(1개)를 안전하게 처리한다", () => {
    const empty = createSceneObjectArena(4);
    const emptyBvh = buildFlatBvh2d(empty);
    assertValidFlatBvhInvariants(emptyBvh, empty);
    expect(emptyBvh.stats.leafCount).toBe(0);

    const single = createSceneObjectArena(4);
    pushSceneObject(single, { objectId: 7, minX: 10, minY: 20, maxX: 50, maxY: 80, kindCode: 1 });
    const singleBvh = buildFlatBvh2d(single);
    assertValidFlatBvhInvariants(singleBvh, single);
    expect(singleBvh.nodeCount).toBe(1);
    expect(singleBvh.stats.leafCount).toBe(1);
    expect(singleBvh.stats.rootHalfPerimeter).toBe(100);
  });

  it("10,000개 이종 스튜디오 오브젝트에 대해 유효한 로그 깊이 SAH Flat-BVH를 구축한다", () => {
    const arena = buildSyntheticStudioScene(10000, 101);
    const bvh = buildFlatBvh2d(arena);
    assertValidFlatBvhInvariants(bvh, arena);
    expect(bvh.stats.leafCount).toBeGreaterThan(500);
    expect(bvh.stats.internalCount).toBe(bvh.stats.leafCount - 1);
    expect(bvh.stats.maxDepth).toBeLessThanOrEqual(28);
    expect(bvh.stats.averageLeafSize).toBeLessThanOrEqual(16);
  });

  it("동일 좌표에 2,000개 오브젝트가 완전 중첩된 퇴화 입력에서도 스택 오버플로 없이 구축된다", () => {
    const arena = createSceneObjectArena(2000);
    for (let i = 0; i < 2000; i += 1) {
      pushSceneObject(arena, {
        objectId: i + 1,
        minX: 500,
        minY: 500,
        maxX: 540,
        maxY: 540,
        kindCode: SCENE_OBJECT_KIND_BRUSH_STAMP,
      });
    }
    const bvh = buildFlatBvh2d(arena, { maxLeafSize: 8 });
    assertValidFlatBvhInvariants(bvh, arena);
    expect(bvh.stats.maxDepth).toBeLessThanOrEqual(20);
  });

  it("사용자 지정 maxLeafSize와 sahBins 옵션이 리프 입도와 결정론적 재현성을 보장한다", () => {
    const arena = buildSyntheticStudioScene(1200, 777);
    const fineA = buildFlatBvh2d(arena, { maxLeafSize: 4, sahBins: 16 });
    const fineB = buildFlatBvh2d(arena, { maxLeafSize: 4, sahBins: 16 });
    const coarse = buildFlatBvh2d(arena, { maxLeafSize: 32, sahBins: 8 });

    assertValidFlatBvhInvariants(fineA, arena);
    assertValidFlatBvhInvariants(coarse, arena);
    expect(fineA.stats.leafCount).toBeGreaterThan(coarse.stats.leafCount);
    expect(Array.from(fineA.nodeTopology)).toEqual(Array.from(fineB.nodeTopology));
    expect(Array.from(fineA.nodeBounds)).toEqual(Array.from(fineB.nodeBounds));
  });
});

describe("Wave 51D — O(log N) 뷰포트 프러스텀 컬링 & 브루트포스 100% 일치", () => {
  const scene10k = buildSyntheticStudioScene(10000, 2026);
  const bvh10k = buildFlatBvh2d(scene10k);

  it("10,000개 오브젝트 5종 뷰포트 컬링이 브루트포스 선형 스캔과 100% 정확히 일치한다", () => {
    const viewports: readonly ViewportBounds2d[] = [
      { minX: -800, minY: -600, maxX: 800, maxY: 600 },
      { minX: -9900, minY: -9900, maxX: -8500, maxY: -8500 },
      { minX: 4000, minY: -200, maxX: 9500, maxY: 200 },
      { minX: -3000, minY: -3000, maxX: 3000, maxY: 3000 },
      { minX: 25000, minY: 25000, maxX: 26000, maxY: 26000 },
    ];
    for (const vp of viewports) {
      const bvhRes = queryViewportVisibleIndices(bvh10k, scene10k, vp, { sortMode: "index-asc" });
      const expected = bruteForceViewportQuery(scene10k, vp);
      expect(Array.from(bvhRes.visibleIndices)).toEqual(expected);
      expect(bvhRes.visibleCount).toBe(expected.length);
    }
  });

  it("10,000개 중 좁은 뷰포트 조회 시 BVH 서브트리 프루닝으로 전체 노드·프리미티브의 5% 미만만 검사한다", () => {
    const tightVp: ViewportBounds2d = { minX: 100, minY: 100, maxX: 700, maxY: 700 };
    const res = queryViewportVisibleIndices(bvh10k, scene10k, tightVp);
    expect(res.culledSubtreeCount).toBeGreaterThan(0);
    expect(res.visitedNodes).toBeLessThan(bvh10k.nodeCount * 0.05);
    expect(res.testedPrimitives).toBeLessThan(10000 * 0.05);
    expect(res.cullRatio).toBeGreaterThan(0.95);
  });

  it("margin 확장과 역전 뷰포트 입력이 브루트포스와 100% 일치한다", () => {
    const reversedVp: ViewportBounds2d = { minX: 900, minY: 800, maxX: 200, maxY: 100 };
    const bvhRes = queryViewportVisibleIndices(bvh10k, scene10k, reversedVp, {
      margin: 120,
      sortMode: "index-asc",
    });
    const expected = bruteForceViewportQuery(scene10k, reversedVp, 120);
    expect(Array.from(bvhRes.visibleIndices)).toEqual(expected);
  });

  it("kindMask와 includeHidden 필터가 브루트포스 참조 결과와 정확히 일치한다", () => {
    const vp: ViewportBounds2d = { minX: -2500, minY: -2500, maxX: 2500, maxY: 2500 };
    const mask = (1 << SCENE_OBJECT_KIND_VECTOR_STROKE) | (1 << SCENE_OBJECT_KIND_SCREENTONE_PATCH);
    const hiddenExcluded = queryViewportVisibleIndices(bvh10k, scene10k, vp, {
      kindMask: mask,
      includeHidden: false,
      sortMode: "index-asc",
    });
    const hiddenIncluded = queryViewportVisibleIndices(bvh10k, scene10k, vp, {
      kindMask: mask,
      includeHidden: true,
      sortMode: "index-asc",
    });
    expect(Array.from(hiddenExcluded.visibleIndices)).toEqual(bruteForceViewportQuery(scene10k, vp, 0, false, mask));
    expect(Array.from(hiddenIncluded.visibleIndices)).toEqual(bruteForceViewportQuery(scene10k, vp, 0, true, mask));
    expect(hiddenIncluded.visibleCount).toBeGreaterThan(hiddenExcluded.visibleCount);
  });

  it("z-order-asc 정렬 모드가 페인터 순서(비감소 zOrder)를 보장한다", () => {
    const vp: ViewportBounds2d = { minX: -2000, minY: -2000, maxX: 2000, maxY: 2000 };
    const res = queryViewportVisibleIndices(bvh10k, scene10k, vp, { sortMode: "z-order-asc" });
    expect(res.visibleCount).toBeGreaterThan(100);
    for (let i = 1; i < res.visibleCount; i += 1) {
      const prevIdx = res.visibleIndices[i - 1] ?? 0;
      const currIdx = res.visibleIndices[i] ?? 0;
      expect(scene10k.zOrder[prevIdx] ?? 0).toBeLessThanOrEqual(scene10k.zOrder[currIdx] ?? 0);
    }
  });

  it("사전 할당 outIndices와 traversalStack을 재사용해도 프레임 간 결과 오염이 없다", () => {
    const outIndices = new Uint32Array(10000);
    const stack = new Int32Array(128);
    const first = queryViewportVisibleIndices(
      bvh10k, scene10k, { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 },
      { outIndices, traversalStack: stack, sortMode: "index-asc" },
    );
    const firstSnapshot = Array.from(first.visibleIndices);
    expect(first.reusedOutputBuffer).toBe(true);
    expect(first.visibleIndices.buffer).toBe(outIndices.buffer);

    const second = queryViewportVisibleIndices(
      bvh10k, scene10k, { minX: 4000, minY: 4000, maxX: 4600, maxY: 4600 },
      { outIndices, traversalStack: stack, sortMode: "index-asc" },
    );
    expect(second.reusedOutputBuffer).toBe(true);
    expect(Array.from(second.visibleIndices)).toEqual(
      bruteForceViewportQuery(scene10k, { minX: 4000, minY: 4000, maxX: 4600, maxY: 4600 }),
    );
    expect(firstSnapshot.length).toBeGreaterThan(second.visibleCount);
  });
});

describe("Wave 51D — O(log N) 포인터 히트 테스트", () => {
  it("10,000개 오브젝트에서 임의 프로브 포인트 히트가 브루트포스 최상위 zOrder와 100% 일치한다", () => {
    const arena = buildSyntheticStudioScene(10000, 4040);
    const bvh = buildFlatBvh2d(arena);

    for (let probeIdx = 0; probeIdx < 20; probeIdx += 1) {
      const target = probeIdx * 473;
      const px = ((arena.minX[target] ?? 0) + (arena.maxX[target] ?? 0)) * 0.5;
      const py = ((arena.minY[target] ?? 0) + (arena.maxY[target] ?? 0)) * 0.5;

      const hit = hitTestPointBvh(bvh, arena, px, py, { maxHits: 64 });
      const bfHits = bruteForceViewportQuery(arena, { minX: px, minY: py, maxX: px, maxY: py });
      bfHits.sort((a, b) => ((arena.zOrder[b] ?? 0) - (arena.zOrder[a] ?? 0)) || b - a);

      expect(Array.from(hit.hitIndices)).toEqual(bfHits.slice(0, 64));
      expect(hit.topHitIndex).toBe(bfHits[0] ?? -1);
      if (bfHits[0] !== undefined) {
        expect(hit.topObjectId).toBe(arena.objectId[bfHits[0]]);
      }
      expect(hit.visitedNodes).toBeLessThan(bvh.nodeCount * 0.03);
    }
  });

  it("중첩 스택에서 zOrder 내림차순 및 동률 시 후순위 인덱스 우선 규칙을 준수한다", () => {
    const arena = createSceneObjectArena(8);
    pushSceneObject(arena, { objectId: 10, minX: 0, minY: 0, maxX: 100, maxY: 100, kindCode: 0, zOrder: 1 });
    pushSceneObject(arena, { objectId: 20, minX: 0, minY: 0, maxX: 100, maxY: 100, kindCode: 1, zOrder: 5 });
    pushSceneObject(arena, { objectId: 30, minX: 0, minY: 0, maxX: 100, maxY: 100, kindCode: 2, zOrder: 5 });
    pushSceneObject(arena, { objectId: 40, minX: 0, minY: 0, maxX: 100, maxY: 100, kindCode: 3, zOrder: 3 });

    const bvh = buildFlatBvh2d(arena);
    const hit = hitTestPointBvh(bvh, arena, 50, 50);
    expect(hit.topHitIndex).toBe(2);
    expect(hit.topObjectId).toBe(30);
    expect(Array.from(hit.hitIndices)).toEqual([2, 1, 3, 0]);
  });

  it("radius 허용 반경 히트와 빈 영역 미스(-1) 및 잠금 제외 옵션을 정확히 처리한다", () => {
    const arena = createSceneObjectArena(4);
    pushSceneObject(arena, {
      objectId: 501, minX: 100, minY: 100, maxX: 110, maxY: 110,
      kindCode: SCENE_OBJECT_KIND_VECTOR_STROKE, zOrder: 1, flags: SCENE_OBJECT_FLAG_VISIBLE,
    });
    pushSceneObject(arena, {
      objectId: 502, minX: 100, minY: 100, maxX: 110, maxY: 110,
      kindCode: SCENE_OBJECT_KIND_PANEL_FRAME, zOrder: 10,
      flags: SCENE_OBJECT_FLAG_VISIBLE | SCENE_OBJECT_FLAG_LOCKED,
    });
    const bvh = buildFlatBvh2d(arena);

    expect(hitTestPointBvh(bvh, arena, 114, 105, { radius: 0 }).topHitIndex).toBe(-1);
    const radiusHit = hitTestPointBvh(bvh, arena, 114, 105, { radius: 5 });
    expect(radiusHit.topObjectId).toBe(502);

    const unlockedOnly = hitTestPointBvh(bvh, arena, 105, 105, { includeLocked: false });
    expect(unlockedOnly.topObjectId).toBe(501);
    expect(unlockedOnly.hitCount).toBe(1);
  });

  it("빈 BVH에 대한 히트 테스트는 예외 없이 미스를 반환한다", () => {
    const empty = createSceneObjectArena(2);
    const bvh = buildFlatBvh2d(empty);
    const hit = hitTestPointBvh(bvh, empty, 0, 0);
    expect(hit.topHitIndex).toBe(-1);
    expect(hit.topObjectId).toBe(0);
    expect(hit.hitCount).toBe(0);
  });
});

describe("Wave 51D — 32-Byte GPU 인스턴스 버퍼 & drawIndexedIndirect 패킹", () => {
  it("인스턴스당 32-byte(8 floats) 스트라이드에 변환·곡률·RGBA8·material_bits를 비트 정확히 패킹한다", () => {
    const arena = createSceneObjectArena(4);
    const color = packRgba8U32(25, 180, 95, 220);
    pushSceneObject(arena, {
      objectId: 77,
      minX: 10,
      minY: 20,
      maxX: 50,
      maxY: 100,
      kindCode: SCENE_OBJECT_KIND_VECTOR_STROKE,
      rotationRad: 0.5,
      curveBias: 0.75,
      colorPackedRgba8: color,
      textureMaterialId: 4099,
      flags: SCENE_OBJECT_FLAG_VISIBLE | SCENE_OBJECT_FLAG_LOOP_BLINN_CURVE,
    });

    const packed = packInstancedDrawBuffer(arena, new Uint32Array([0]));
    expect(packed.strideFloats).toBe(INSTANCED_OBJECT_STRIDE_FLOATS);
    expect(packed.strideBytes).toBe(INSTANCED_OBJECT_STRIDE_BYTES);
    expect(packed.byteLength).toBe(32);
    expect(packed.instanceFloatData[0]).toBeCloseTo(30, 5);
    expect(packed.instanceFloatData[1]).toBeCloseTo(60, 5);
    expect(packed.instanceFloatData[2]).toBeCloseTo(20, 5);
    expect(packed.instanceFloatData[3]).toBeCloseTo(40, 5);
    expect(packed.instanceFloatData[4]).toBeCloseTo(0.5, 5);
    expect(packed.instanceFloatData[5]).toBeCloseTo(0.75, 5);
    expect(packed.instanceUintData[6]).toBe(color);
    expect(packed.instanceUintData[7]).toBe(
      packInstanceMaterialMeta(
        SCENE_OBJECT_KIND_VECTOR_STROKE,
        SCENE_OBJECT_FLAG_VISIBLE | SCENE_OBJECT_FLAG_LOOP_BLINN_CURVE,
        4099,
      ),
    );
  });

  it("단일 드로우 콜용 drawIndexedIndirect(20B) 및 drawIndirect(16B) 인자를 정확히 기록한다", () => {
    const arena = buildSyntheticStudioScene(120, 99);
    const indices = new Uint32Array([0, 3, 7, 11, 15]);
    const packed = packInstancedDrawBuffer(arena, indices, undefined, 6);
    expect(packed.drawIndexedIndirectArgs.length).toBe(DRAW_INDEXED_INDIRECT_U32_COUNT);
    expect(Array.from(packed.drawIndexedIndirectArgs)).toEqual([6, 5, 0, 0, 0]);
    expect(packed.drawIndirectArgs.length).toBe(DRAW_INDIRECT_U32_COUNT);
    expect(Array.from(packed.drawIndirectArgs)).toEqual([6, 5, 0, 0]);
  });

  it("사전 할당 Float32Array 버퍼 재사용 시 reusedBuffer=true와 정확한 슬라이스 길이를 반환한다", () => {
    const arena = buildSyntheticStudioScene(200, 123);
    const scratch = new Float32Array(200 * INSTANCED_OBJECT_STRIDE_FLOATS);
    const indices = new Uint32Array([2, 4, 6, 8]);
    const packed = packInstancedDrawBuffer(arena, indices, scratch);
    expect(packed.reusedBuffer).toBe(true);
    expect(packed.instanceFloatData.buffer).toBe(scratch.buffer);
    expect(packed.instanceFloatData.length).toBe(4 * 8);
    expect(packed.byteLength).toBe(128);
  });

  it("10,000개 전체 씬 GPU 컬링 입력 버퍼 패킹(320,000B)과 빈 가시 집합(0B)을 정상 처리한다", () => {
    const arena10k = buildSyntheticStudioScene(10000, 555);
    const allPacked = packAllSceneInstancesForGpuCull(arena10k);
    expect(allPacked.instanceCount).toBe(10000);
    expect(allPacked.byteLength).toBe(10000 * 32);
    expect(allPacked.drawIndirectArgs[1]).toBe(10000);

    const emptyPacked = packInstancedDrawBuffer(arena10k, new Uint32Array(0));
    expect(emptyPacked.instanceCount).toBe(0);
    expect(emptyPacked.byteLength).toBe(0);
    expect(emptyPacked.drawIndexedIndirectArgs[1]).toBe(0);
  });
});

describe("Wave 51D — GPU 프러스텀 컬링 & Loop-Blinn WGSL 셰이더 검증", () => {
  it("기본 WGSL 셰이더 2종이 구조·바인딩·정렬·uniformity·예약어 검증을 0 오류로 통과한다", () => {
    const report = validateInstancedWgslBundle();
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.hasAtomicIndirectCompaction).toBe(true);
    expect(report.hasLoopBlinnFwidthAa).toBe(true);
    expect(report.hasUniformitySafeFwidth).toBe(true);
    expect(report.reservedKeywordHits).toEqual([]);
    expect(report.computeBindings).toEqual(["g0:b0", "g0:b1", "g0:b2", "g0:b3"]);
    expect(report.renderBindings).toEqual(["g0:b0", "g0:b1"]);
  });

  it("괄호 불균형·워크그룹 누락·atomicAdd 누락·바인딩 중복을 정확히 탐지한다", () => {
    const badCull = GPU_FRUSTUM_CULL_INDIRECT_WGSL
      .replace("@workgroup_size(64, 1, 1)", "@workgroup_size(32, 1, 1)")
      .replace("atomicAdd(&indirectArgs.instanceCount, 1u)", "0u")
      .replace("@group(0) @binding(3)", "@group(0) @binding(2)") + "{";
    const report = validateInstancedWgslBundle(badCull, INSTANCED_LOOP_BLINN_OBJECT_WGSL);
    expect(report.valid).toBe(false);
    expect(report.hasAtomicIndirectCompaction).toBe(false);
    expect(report.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("fwidth의 discard 후행 uniformity 위반 및 Chromium WGSL 예약어(meta/filter)를 거부한다", () => {
    const badRender = `
      struct BadUniform { meta: u32, filter: u32, };
      @group(0) @binding(0) var<uniform> u0: BadUniform;
      @group(0) @binding(1) var<storage, read> s0: array<u32>;
      @vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> @builtin(position) vec4<f32> {
        return vec4<f32>(f32(v + i), 0.0, 0.0, 1.0);
      }
      @fragment fn fs() -> @location(0) vec4<f32> {
        discard;
        let d = fwidth(1.0) + dpdx(1.0);
        return vec4<f32>(d);
      }
    `;
    const report = validateInstancedWgslBundle(GPU_FRUSTUM_CULL_INDIRECT_WGSL, badRender);
    expect(report.valid).toBe(false);
    expect(report.hasUniformitySafeFwidth).toBe(false);
    expect(report.reservedKeywordHits).toContain("meta");
    expect(report.reservedKeywordHits).toContain("filter");
  });

  it("packCullUniforms(48B)가 16-byte 정렬 바이트 레이아웃과 64-스레드 워크그룹 디스패치 수를 정확히 기록한다", () => {
    const packed = packCullUniforms({
      viewMinX: 400,
      viewMinY: 300,
      viewMaxX: -200,
      viewMaxY: -100,
      marginX: 32,
      marginY: 16,
      objectCount: 10000,
      kindMask: 0x15,
      requiredFlags: SCENE_OBJECT_FLAG_VISIBLE,
      maxOutputInstances: 4096,
      vertexCount: 6,
    });
    expect(packed.byteLength).toBe(CULL_UNIFORM_BYTES);
    expect(packed.byteLength % 16).toBe(0);
    expect(packed.floatView[0]).toBe(-200);
    expect(packed.floatView[1]).toBe(-100);
    expect(packed.floatView[2]).toBe(400);
    expect(packed.floatView[3]).toBe(300);
    expect(packed.floatView[4]).toBe(32);
    expect(packed.floatView[5]).toBe(16);
    expect(packed.uintView[6]).toBe(10000);
    expect(packed.uintView[7]).toBe(0x15);
    expect(packed.uintView[9]).toBe(4096);
    expect(packed.uintView[10]).toBe(6);
    expect(packed.dispatchWorkgroupsX).toBe(Math.ceil(10000 / CULL_COMPUTE_WORKGROUP_SIZE_X));
  });

  it("packRenderViewportUniforms(32B)가 16-byte 정렬 중심·역반폭과 퇴화 뷰포트 안전 클램핑을 보장한다", () => {
    const normal = packRenderViewportUniforms({
      viewMinX: 100,
      viewMinY: 200,
      viewMaxX: 500,
      viewMaxY: 1000,
      pixelScale: 2,
      aaSharpness: 1.25,
    });
    expect(normal.byteLength).toBe(RENDER_VIEW_UNIFORM_BYTES);
    expect(normal.byteLength % 16).toBe(0);
    expect(normal.floatView[0]).toBeCloseTo(300, 5);
    expect(normal.floatView[1]).toBeCloseTo(600, 5);
    expect(normal.floatView[2]).toBeCloseTo(1 / 200, 6);
    expect(normal.floatView[3]).toBeCloseTo(1 / 400, 6);
    expect(normal.floatView[4]).toBe(2);
    expect(normal.floatView[5]).toBe(1.25);

    const degenerate = packRenderViewportUniforms({ viewMinX: 10, viewMinY: 10, viewMaxX: 10, viewMaxY: 10 });
    expect(Number.isFinite(degenerate.floatView[2])).toBe(true);
    expect(Number.isFinite(degenerate.floatView[3])).toBe(true);
  });

  it("10,000개 오브젝트에서 GPU 프러스텀 컬링 참조 패스가 Flat-BVH 컬링 결과와 100% 개수가 일치한다", () => {
    const arena = buildSyntheticStudioScene(10000, 9999);
    const bvh = buildFlatBvh2d(arena);
    const vp: ViewportBounds2d = { minX: -1200, minY: -900, maxX: 1500, maxY: 1100 };

    const bvhRes = queryViewportVisibleIndices(bvh, arena, vp, { margin: 24 });
    const allGpu = packAllSceneInstancesForGpuCull(arena);
    const uniforms = packCullUniforms({
      viewMinX: vp.minX,
      viewMinY: vp.minY,
      viewMaxX: vp.maxX,
      viewMaxY: vp.maxY,
      marginX: 24,
      marginY: 24,
      objectCount: arena.count,
    });
    const gpuParity = emulateGpuFrustumCullPass(allGpu.instanceFloatData, uniforms);

    expect(gpuParity.visibleCount).toBe(bvhRes.visibleCount);
    expect(gpuParity.indirectArgs[0]).toBe(6);
    expect(gpuParity.indirectArgs[1]).toBe(bvhRes.visibleCount);
    expect(gpuParity.overflowCount).toBe(0);
  });

  it("회전된(45°) 오브젝트의 보수 AABB 확장과 maxOutputInstances 상한 초과 카운팅을 검증한다", () => {
    const arena = createSceneObjectArena(4);
    // 중심 (115, 0), 반폭 10, 반높이 10 -> 비회전 시 minX=105(>100, 외부), 45° 회전 시 extX≈14.14 -> minX≈100.86;
    // 중심 (112, 0)은 비회전 시 minX=102(외부), 45° 회전 시 minX≈97.86(뷰포트 [0..100] 진입!)
    pushSceneObject(arena, {
      objectId: 1, minX: 102, minY: -10, maxX: 122, maxY: 10,
      kindCode: SCENE_OBJECT_KIND_SPEECH_BUBBLE, rotationRad: Math.PI / 4,
    });
    pushSceneObject(arena, {
      objectId: 2, minX: 10, minY: -10, maxX: 30, maxY: 10,
      kindCode: SCENE_OBJECT_KIND_PANEL_FRAME, rotationRad: 0,
    });
    const allGpu = packAllSceneInstancesForGpuCull(arena);
    const uniforms = packCullUniforms({
      viewMinX: 0, viewMinY: -50, viewMaxX: 100, viewMaxY: 50,
      objectCount: 2, maxOutputInstances: 1,
    });
    const res = emulateGpuFrustumCullPass(allGpu.instanceFloatData, uniforms);
    expect(res.visibleCount).toBe(1);
    expect(res.overflowCount).toBe(1);
    expect(res.indirectArgs[1]).toBe(1);
  });
});

describe("Wave 51D — 5대 그래픽스 논문 레퍼런스 & 품질·하네스 위생 자가 감사", () => {
  it("5대 핵심 그래픽스 논문 명세가 모두 등록되고 허위 벤치마크 FPS/ms 수치 없이 이론 복잡도만 기재한다", () => {
    expect(GRAPHICS_PAPER_PIPELINE_SPECS).toHaveLength(5);
    const ids = GRAPHICS_PAPER_PIPELINE_SPECS.map((s) => s.id);
    expect(ids).toEqual([
      "kubelka-munk-1931",
      "chu-tai-moxi-2005",
      "chen-diverdi-wetbrush-2015",
      "loop-blinn-2005",
      "levien-vello-piet-gpu-2025",
    ]);

    const fakeBenchPattern = /\b\d+(?:\.\d+)?\s*(?:fps|ms)\b/i;
    for (const spec of GRAPHICS_PAPER_PIPELINE_SPECS) {
      expect(getGraphicsPaperPipelineSpec(spec.id).title).toBe(spec.title);
      expect(spec.theoreticalComplexity.build).toContain("O(");
      expect(spec.theoreticalComplexity.perFrame).toContain("O(");
      expect(spec.theoreticalComplexity.memory).toContain("O(");
      expect(spec.bytesPerUnitFormula.bytesPerUnit).toBeGreaterThan(0);
      expect(fakeBenchPattern.test(spec.koreanSummary)).toBe(false);
      expect(fakeBenchPattern.test(spec.theoreticalComplexity.perFrame)).toBe(false);
    }
    expect(() => getGraphicsPaperPipelineSpec("unknown-paper" as never)).toThrow(RangeError);
  });

  it("estimatePipelineMemoryFootprint가 실측 바이트 계산식과 WASM32/WASM64 전환 임계값을 정확히 산출한다", () => {
    const loop10k = estimatePipelineMemoryFootprint("loop-blinn-2005", 10000);
    expect(loop10k.totalBytes).toBe(10000 * 32 + 4096);
    expect(loop10k.fitsWasm32Ceiling).toBe(true);
    expect(loop10k.recommendedArenaMode).toBe("wasm32");

    const hugeUnits = Math.ceil(WASM32_SAFE_ARENA_CEILING_BYTES / 48) + 100;
    const moxiHuge = estimatePipelineMemoryFootprint("chu-tai-moxi-2005", hugeUnits);
    expect(moxiHuge.totalBytes).toBeGreaterThan(WASM32_SAFE_ARENA_CEILING_BYTES);
    expect(moxiHuge.fitsWasm32Ceiling).toBe(false);
    expect(moxiHuge.recommendedArenaMode).toBe("wasm64");
  });

  it("index.ts 배럴이 핵심 엔진·셰이더·카탈로그 심볼을 빠짐없이 재수출한다", () => {
    expect(typeof Barrel.buildFlatBvh2d).toBe("function");
    expect(typeof Barrel.queryViewportVisibleIndices).toBe("function");
    expect(typeof Barrel.hitTestPointBvh).toBe("function");
    expect(typeof Barrel.packInstancedDrawBuffer).toBe("function");
    expect(typeof Barrel.packCullUniforms).toBe("function");
    expect(typeof Barrel.validateInstancedWgslBundle).toBe("function");
    expect(Barrel.GPU_FRUSTUM_CULL_INDIRECT_WGSL).toContain("atomicAdd");
    expect(Barrel.INSTANCED_LOOP_BLINN_OBJECT_WGSL).toContain("fwidth");
  });

  it("단독 소유 4파일이 줄 수 상한 및 하네스 위생 계약(원시 색·웹 저장소·BigInt·private Map store 0건)을 준수한다", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const budgets: readonly (readonly [string, number])[] = [
      ["instanced-bvh-spatial-engine.ts", 700],
      ["instanced-bvh-wgsl-shaders.ts", 550],
      ["index.ts", 800],
      ["instanced-bvh-spatial.test.ts", 800],
    ];
    const hexColorRegex = new RegExp("#[0-9a-f]{3,8}\\b", "i");
    const cssFuncColorRegex = new RegExp(`\\b(?:${"rg"}b|${"hs"}l)a?\\s*\\(`, "i");
    const bigIntLiteralRegex = /\b0x[0-9a-f]+n\b|\b\d+n\b/i;
    const webStoreRegex = new RegExp(`\\b${"local"}Storage\\b`);
    const privateStoreMapRegex = /private\s+store\b.*new\s+Map/;

    for (const [fileName, maxLines] of budgets) {
      const content = readFileSync(resolve(dir, fileName), "utf8");
      const lineCount = content.replace(/\r?\n$/, "").split("\n").length;
      expect(lineCount, `${fileName} 줄 수(${lineCount}) <= ${maxLines}`).toBeLessThanOrEqual(maxLines);
      expect(hexColorRegex.test(content), `${fileName} 원시 hex 0건`).toBe(false);
      expect(cssFuncColorRegex.test(content), `${fileName} 원시 색 함수 0건`).toBe(false);
      expect(bigIntLiteralRegex.test(content), `${fileName} BigInt 리터럴 0건`).toBe(false);
      expect(webStoreRegex.test(content), `${fileName} 웹 저장소 API 0건`).toBe(false);
      expect(privateStoreMapRegex.test(content), `${fileName} private Map store 0건`).toBe(false);
    }
  });
});
