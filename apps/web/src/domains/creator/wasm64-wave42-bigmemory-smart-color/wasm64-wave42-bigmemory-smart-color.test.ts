import { describe, expect, it } from "vitest";

import {
  advanceHybridVectorClock,
  alignUp64BigInt,
  compareHybridVectorClocks,
  computeDeltaEOk,
  computeKelvinLinearTint,
  computeMerkleTileDiff,
  computeOklchFromSrgb,
  computeSrgbFromOklch,
  createInitialHybridVectorClock,
  DEFAULT_MIN_ADJACENT_DELTA_E_OK,
  dequantizeVectorSq8,
  EdgeStateCoordinatorNode,
  LocalHnswSq8AssetIndex,
  MAX_SKIN_HUE_SHIFT_DEG,
  mergeHybridVectorClocks,
  packPageDescriptor64B,
  quantizeVectorSq8,
  reconcileEdgeReplicaPair,
  solveSmartColoringGraph,
  unpackPageDescriptor64B,
  WASM32_LEGACY_CEILING_BYTES,
  WASM64_MAX_VIRTUAL_ADDRESS_BYTES,
  WASM64_SIMD_ALIGNMENT_BYTES,
  WASM64_SIMD_DESCRIPTOR_BYTES,
  Wasm64BigMemoryScenePager,
  Wasm64PagerError,
  type HnswAssetDocument,
  type SceneLightingEnvironment,
  type Wasm64OpfsBackingStore,
} from "./index";

const NEUTRAL_LIGHT: SceneLightingEnvironment = {
  ambientKelvin: 6500,
  keyKelvin: 6500,
  rimKelvin: 6500,
  keyAzimuthDeg: 45,
  keyElevationDeg: 45,
};

function makeSyntheticVector(seed: number, dim: number): Float32Array {
  const vec = new Float32Array(dim);
  let state = (seed * 2654435761) >>> 0;
  for (let i = 0; i < dim; i += 1) {
    state = (Math.imul(state ^ (i + 17), 1664525) + 1013904223) >>> 0;
    vec[i] = ((state & 0xffff) / 32767.5) - 1;
  }
  return vec;
}

function l2NormalizedDistance(a: Float32Array, b: Float32Array): number {
  const norm = (v: Float32Array) => {
    let s = 0;
    for (let i = 0; i < v.length; i += 1) s += v[i] * v[i];
    const inv = s > 0 ? 1 / Math.sqrt(s) : 1;
    return v.map((x) => x * inv);
  };
  const na = norm(a);
  const nb = norm(b);
  let sum = 0;
  for (let i = 0; i < na.length; i += 1) sum += (na[i] - nb[i]) ** 2;
  return sum;
}

describe("Wave 42 — WASM64 빅메모리 가상 장면 페이저", () => {
  it("1. 4 GiB 한계를 넘어서는 64비트 가상 주소(정점·타일·히스토리)를 64B 정렬로 매핑한다", () => {
    const pager = new Wasm64BigMemoryScenePager({ maxResidentBytes: 512 * 1024, pageSizeBytes: 4096 });
    const vDesc = pager.inspectPage(pager.allocatePage({ segment: "vertex-slab", byteLength: 4096 }));
    const tDesc = pager.inspectPage(pager.allocatePage({ segment: "tile-atlas", byteLength: 8192 }));
    const sDesc = pager.inspectPage(pager.allocatePage({ segment: "history-snapshot", byteLength: 4096 }));
    const eDesc = pager.inspectPage(
      pager.allocatePage({ segment: "history-snapshot", byteLength: 4096, explicitVirtualOffset: BigInt("0xf80000013") }),
    );
    expect(vDesc.virtualOffset > WASM32_LEGACY_CEILING_BYTES).toBe(true);
    expect(tDesc.virtualOffset >= BigInt("0x400000000")).toBe(true);
    expect(sDesc.virtualOffset >= BigInt("0xc00000000")).toBe(true);
    expect(eDesc.virtualOffset % WASM64_SIMD_ALIGNMENT_BYTES).toBe(BigInt(0));
    expect(eDesc.virtualOffset < WASM64_MAX_VIRTUAL_ADDRESS_BYTES).toBe(true);
  });

  it("2. 64B SIMD 이진 페이지 디스크립터를 무손실 직렬화·역직렬화하고 비트 변조를 검출한다", () => {
    const packed = packPageDescriptor64B({
      virtualOffset: alignUp64BigInt(BigInt("0x900000000")),
      physicalOffset: BigInt(12_288),
      byteLength: 4096,
      handleId: 7,
      pinCount: 2,
      resident: true,
      dirty: true,
      hotLru2: true,
      clockRef: false,
      segment: "tile-atlas",
      penultimateAccessTick: BigInt(14),
      lastAccessTick: BigInt(21),
      dirtyStartByte: 128,
      dirtyEndByte: 1024,
    });
    expect(packed.byteLength).toBe(WASM64_SIMD_DESCRIPTOR_BYTES);
    const unpacked = unpackPageDescriptor64B(packed);
    expect(unpacked.virtualOffset).toBe(BigInt("0x900000000"));
    expect(unpacked.handleId).toBe(7);
    expect(unpacked.pinCount).toBe(2);
    expect(unpacked.dirtyEndByte).toBe(1024);

    const corrupted = packed.slice();
    corrupted[12] ^= 0x40;
    expect(() => unpackPageDescriptor64B(corrupted)).toThrowError(Wasm64PagerError);
  });

  it("3. 활성 스트로크 핀(pinCount > 0) 페이지를 퇴출에서 보호하고 전원 핀 잠금 시 명시적 오류를 던진다", () => {
    const pager = new Wasm64BigMemoryScenePager({ maxResidentBytes: 8192, pageSizeBytes: 4096 });
    const strokePage = pager.allocatePage({
      segment: "tile-atlas",
      byteLength: 4096,
      pinForActiveStroke: true,
      initialPayload: new Uint8Array([9, 8, 7, 6]),
    });
    const scratchPage = pager.allocatePage({ segment: "tile-atlas", byteLength: 4096 });
    const extraPage = pager.allocatePage({ segment: "tile-atlas", byteLength: 4096 });

    expect(pager.inspectPage(strokePage).resident).toBe(true);
    expect(pager.inspectPage(scratchPage).resident).toBe(false);
    expect(Array.from(pager.readSlice(strokePage, 0, 4))).toEqual([9, 8, 7, 6]);

    pager.pinPage(extraPage);
    expect(() => pager.allocatePage({ segment: "tile-atlas", byteLength: 4096 })).toThrowError(Wasm64PagerError);
    pager.unpinPage(strokePage);
    pager.unpinPage(extraPage);
  });

  it("4. LRU-2 / Clock-Pro 교체기로 순차 스캔 오염으로부터 반복 참조(Hot) 작업 세트를 보호한다", () => {
    const pager = new Wasm64BigMemoryScenePager({ maxResidentBytes: 4 * 4096, pageSizeBytes: 4096, reuseWindowTicks: 12 });
    const hotA = pager.allocatePage({ segment: "vertex-slab", initialPayload: new Uint8Array([11]) });
    const hotB = pager.allocatePage({ segment: "vertex-slab", initialPayload: new Uint8Array([22]) });
    pager.readSlice(hotA, 0, 1);
    pager.readSlice(hotB, 0, 1);
    expect(pager.inspectPage(hotA).hotLru2).toBe(true);

    for (let i = 0; i < 12; i += 1) {
      pager.allocatePage({ segment: "tile-atlas", initialPayload: new Uint8Array([i & 0xff]) });
    }
    expect(pager.inspectPage(hotA).resident).toBe(true);
    expect(pager.inspectPage(hotB).resident).toBe(true);
    expect(pager.readSlice(hotA, 0, 1)[0]).toBe(11);
    expect(pager.readSlice(hotB, 0, 1)[0]).toBe(22);
  });

  it("5. Clock-Pro 고스트 히스토리 링에 기록된 비거주 페이지가 재참조되면 즉시 Hot으로 승격한다", () => {
    const pager = new Wasm64BigMemoryScenePager({ maxResidentBytes: 2 * 4096, pageSizeBytes: 4096 });
    const coldVictim = pager.allocatePage({ segment: "tile-atlas", initialPayload: new Uint8Array([77]) });
    pager.allocatePage({ segment: "tile-atlas" });
    pager.allocatePage({ segment: "tile-atlas" });

    expect(pager.inspectPage(coldVictim).resident).toBe(false);
    expect(pager.getStats().ghostEntryCount).toBeGreaterThanOrEqual(1);
    expect(pager.readSlice(coldVictim, 0, 1)[0]).toBe(77);
    expect(pager.inspectPage(coldVictim).hotLru2).toBe(true);
    expect(pager.getStats().ghostPromotionCount).toBe(1);
  });

  it("6. 인접·연속 페이지의 서브페이지 더티 범위를 단일 OPFS 쓰기 배치로 병합하고 비동기 플러시한다", async () => {
    const writes: { offset: bigint; bytes: Uint8Array }[] = [];
    const mockOpfs: Wasm64OpfsBackingStore = {
      async writeRange(offset, payload) { writes.push({ offset, bytes: payload.slice() }); },
      async readRange(_offset, len) { return new Uint8Array(len); },
    };
    const pager = new Wasm64BigMemoryScenePager({ maxResidentBytes: 65536, pageSizeBytes: 1024, coalesceGapBytes: 128, backingStore: mockOpfs });
    const p1 = pager.allocatePage({ segment: "tile-atlas", byteLength: 1024 });
    const p2 = pager.allocatePage({ segment: "tile-atlas", byteLength: 1024 });
    pager.writeSlice(p1, 960, new Uint8Array(64).fill(0xaa));
    pager.writeSlice(p2, 0, new Uint8Array(64).fill(0xbb));

    const flushed = await pager.flushDirtyBatchesToOpfs();
    expect(flushed).toHaveLength(1);
    expect(flushed[0].byteLength).toBe(128);
    expect(writes).toHaveLength(1);
    expect(writes[0].bytes[0]).toBe(0xaa);
    expect(writes[0].bytes[64]).toBe(0xbb);
    expect(pager.inspectPage(p1).dirty).toBe(false);
  });

  it("7. 온라인 물리 파편화 압축 수행 시 파편화율을 0으로 낮추며 모든 간접 핸들과 페이로드를 100% 보존한다", () => {
    const pager = new Wasm64BigMemoryScenePager({ maxResidentBytes: 65536, pageSizeBytes: 4096 });
    const h0 = pager.allocatePage({ segment: "vertex-slab", initialPayload: new Uint8Array([1, 2, 3]) });
    const h1 = pager.allocatePage({ segment: "vertex-slab", initialPayload: new Uint8Array([4, 5, 6]) });
    const h2 = pager.allocatePage({ segment: "vertex-slab", initialPayload: new Uint8Array([7, 8, 9]) });
    const h3 = pager.allocatePage({ segment: "vertex-slab", initialPayload: new Uint8Array([10, 11, 12]) });

    pager.freePage(h0);
    pager.freePage(h2);
    expect(pager.getStats().fragmentationRatio).toBeGreaterThan(0.4);

    const report = pager.compactPhysicalArena();
    expect(report.movedPageCount).toBe(2);
    expect(report.fragmentationRatioAfter).toBe(0);
    expect(Array.from(pager.readSlice(h1, 0, 3))).toEqual([4, 5, 6]);
    expect(Array.from(pager.readSlice(h3, 0, 3))).toEqual([10, 11, 12]);
  });

  it("8. 64 GiB 초과 주소 매핑과 해제된 핸들(Use-After-Free) 접근을 즉시 거부한다", () => {
    const pager = new Wasm64BigMemoryScenePager({ maxResidentBytes: 32768, pageSizeBytes: 4096 });
    expect(() => pager.allocatePage({ segment: "history-snapshot", explicitVirtualOffset: WASM64_MAX_VIRTUAL_ADDRESS_BYTES })).toThrowError(Wasm64PagerError);
    const temp = pager.allocatePage({ segment: "vertex-slab" });
    pager.freePage(temp);
    expect(() => pager.readSlice(temp, 0, 4)).toThrowError(Wasm64PagerError);
  });
});

describe("Wave 42 — 다차원 OKLCH 벡터 스마트 컬러링 솔버", () => {
  it("9. sRGB <-> OKLCH 왕복 변환 정확도와 Ottosson DeltaE_OK 지각 거리를 검증한다", () => {
    for (const s of [{ r: 235, g: 192, b: 170 }, { r: 42, g: 88, b: 164 }, { r: 210, g: 64, b: 82 }]) {
      expect(computeDeltaEOk(s, computeSrgbFromOklch(computeOklchFromSrgb(s)))).toBeLessThan(0.01);
    }
    expect(computeDeltaEOk({ r: 20, g: 20, b: 20 }, { r: 240, g: 240, b: 240 })).toBeGreaterThan(0.7);
  });

  it("10. 시드 밑색은 고정한 채 인접 동종 폐영역으로 자연스럽게 색상을 전파한다", () => {
    const solution = solveSmartColoringGraph({
      regions: [
        { regionId: "seed", areaPx: 2400, centroid: { x: 40, y: 80 }, material: { category: "fabric", roughness: 0.75, metallic: 0 }, seedColorSrgb: { r: 48, g: 92, b: 168 }, semanticFeatureVector: [0.9, 0.2, 0.1] },
        { regionId: "sleeve", areaPx: 1800, centroid: { x: 75, y: 85 }, material: { category: "fabric", roughness: 0.72, metallic: 0 }, semanticFeatureVector: [0.88, 0.22, 0.12] },
      ],
      edges: [{ regionA: "seed", regionB: "sleeve", sharedBoundaryPx: 90, lineClosureStrength: 0.3 }],
      lighting: NEUTRAL_LIGHT,
    });
    const seedRes = solution.regions[0];
    const sleeveRes = solution.regions[1];
    expect(seedRes.seedLocked).toBe(true);
    expect(seedRes.flatBaseSrgb).toEqual({ r: 48, g: 92, b: 168 });
    expect(computeDeltaEOk(seedRes.flatBaseSrgb, sleeveRes.flatBaseSrgb)).toBeLessThan(0.03);
  });

  it("11. 캐릭터 모델시트 팔레트 앵커를 매칭하여 미채색 부위의 고유 배색을 유지한다", () => {
    const solution = solveSmartColoringGraph({
      regions: [
        { regionId: "hair", areaPx: 1500, centroid: { x: 50, y: 20 }, material: { category: "hair", roughness: 0.45, metallic: 0.05 }, semanticFeatureVector: [0.1, 0.95, 0.3] },
        { regionId: "face", areaPx: 1600, centroid: { x: 50, y: 45 }, material: { category: "skin", roughness: 0.6, metallic: 0, subsurfaceScatter: 0.75 }, paletteAnchorId: "anchor-skin" },
      ],
      edges: [{ regionA: "hair", regionB: "face", sharedBoundaryPx: 60, lineClosureStrength: 0.85 }],
      paletteAnchors: [
        { anchorId: "anchor-hair", roleNameKo: "버건디 헤어", category: "hair", baseSrgb: { r: 122, g: 38, b: 56 }, featurePrototype: [0.12, 0.93, 0.28] },
        { anchorId: "anchor-skin", roleNameKo: "기본 피부", category: "skin", baseSrgb: { r: 242, g: 206, b: 186 } },
      ],
      lighting: NEUTRAL_LIGHT,
    });
    expect(solution.regions[0].matchedAnchorId).toBe("anchor-hair");
    expect(solution.regions[1].matchedAnchorId).toBe("anchor-skin");
    expect(computeDeltaEOk(solution.regions[0].flatBaseSrgb, { r: 122, g: 38, b: 56 })).toBeLessThan(0.05);
  });

  it("12. 인접한 이종 영역의 색차가 임계값 미만일 때 DeltaE_OK >= 최소 기준 이상으로 자동 대비 보정한다", () => {
    const nearIdentical = { r: 128, g: 130, b: 134 };
    const solution = solveSmartColoringGraph({
      regions: [
        { regionId: "prop", areaPx: 900, centroid: { x: 20, y: 20 }, material: { category: "prop", roughness: 0.5, metallic: 0.1 }, seedColorSrgb: nearIdentical },
        { regionId: "bg", areaPx: 3000, centroid: { x: 60, y: 20 }, material: { category: "background", roughness: 0.9, metallic: 0 }, paletteAnchorId: "bg-low" },
      ],
      edges: [{ regionA: "prop", regionB: "bg", sharedBoundaryPx: 110, lineClosureStrength: 0.8 }],
      paletteAnchors: [{ anchorId: "bg-low", roleNameKo: "저대비 벽", category: "background", baseSrgb: { r: 130, g: 132, b: 136 } }],
      minAdjacentDeltaEOk: 0.08,
      lighting: NEUTRAL_LIGHT,
    });
    expect(solution.regions[0].flatBaseSrgb).toEqual(nearIdentical);
    expect(solution.remediatedContrastEdgeCount).toBeGreaterThanOrEqual(1);
    expect(computeDeltaEOk(solution.regions[0].flatBaseSrgb, solution.regions[1].flatBaseSrgb)).toBeGreaterThanOrEqual(0.08);
    expect(solution.minObservedDistinctAdjacentDeltaEOk).toBeGreaterThanOrEqual(DEFAULT_MIN_ADJACENT_DELTA_E_OK);
  });

  it("13. 노을광(2800K)과 달빛(9500K) 색온도 변화가 Ambient/Key/Rim 음영 스와치에 물리적으로 반영된다", () => {
    expect(computeKelvinLinearTint(2800).r).toBeGreaterThan(computeKelvinLinearTint(2800).b);
    expect(computeKelvinLinearTint(9500).b).toBeGreaterThan(computeKelvinLinearTint(9500).r);
    const region = { regionId: "wall", areaPx: 2000, centroid: { x: 50, y: 50 }, material: { category: "background" as const, roughness: 0.7, metallic: 0 }, seedColorSrgb: { r: 190, g: 190, b: 190 } };
    const sunset = solveSmartColoringGraph({ regions: [region], edges: [], lighting: { ambientKelvin: 3200, keyKelvin: 2800, rimKelvin: 2600, keyAzimuthDeg: 0, keyElevationDeg: 35 } }).regions[0];
    const moonlight = solveSmartColoringGraph({ regions: [region], edges: [], lighting: { ambientKelvin: 9500, keyKelvin: 9000, rimKelvin: 10000, keyAzimuthDeg: 0, keyElevationDeg: 35 } }).regions[0];
    expect(sunset.keyLitSrgb.r).toBeGreaterThan(moonlight.keyLitSrgb.r);
    expect(moonlight.ambientShadowSrgb.b).toBeGreaterThan(sunset.ambientShadowSrgb.b);
  });

  it("14. 극단적 노을광·청색광 아래에서도 피부(skin) 영역의 명부 색상각 편차를 4도 이하로 억제한다", () => {
    const solution = solveSmartColoringGraph({
      regions: [{ regionId: "cheek", areaPx: 1200, centroid: { x: 30, y: 30 }, material: { category: "skin", roughness: 0.55, metallic: 0, subsurfaceScatter: 0.8 }, seedColorSrgb: { r: 238, g: 196, b: 175 } }],
      edges: [],
      lighting: { ambientKelvin: 12000, keyKelvin: 2200, rimKelvin: 10000, keyAzimuthDeg: 20, keyElevationDeg: 40, keyIntensity: 0.9 },
    });
    expect(solution.regions[0].skinHueDriftDeg).toBeLessThanOrEqual(MAX_SKIN_HUE_SHIFT_DEG);
  });

  it("15. 금속(metallic=1, 낮은 roughness) 재질은 천(fabric) 재질보다 강한 정반사 명부·림라이트 상승을 보인다", () => {
    const seed = { r: 135, g: 140, b: 150 };
    const solution = solveSmartColoringGraph({
      regions: [
        { regionId: "armor", areaPx: 1000, centroid: { x: 20, y: 40 }, material: { category: "metal", roughness: 0.12, metallic: 1.0 }, seedColorSrgb: seed },
        { regionId: "cloth", areaPx: 1000, centroid: { x: 80, y: 40 }, material: { category: "fabric", roughness: 0.92, metallic: 0.0 }, seedColorSrgb: seed },
      ],
      edges: [],
      lighting: NEUTRAL_LIGHT,
    });
    expect(computeOklchFromSrgb(solution.regions[0].keyLitSrgb).l).toBeGreaterThan(computeOklchFromSrgb(solution.regions[1].keyLitSrgb).l);
    expect(computeOklchFromSrgb(solution.regions[0].rimHighlightSrgb).l).toBeGreaterThan(computeOklchFromSrgb(solution.regions[1].rimHighlightSrgb).l);
  });

  it("16. 다차원 에너지 최소화 루프가 초기 미전파 상태 대비 그래프 에너지를 단조 감소시킨다", () => {
    const solution = solveSmartColoringGraph({
      regions: [
        { regionId: "n0", areaPx: 1000, centroid: { x: 10, y: 10 }, material: { category: "fabric", roughness: 0.6, metallic: 0 }, seedColorSrgb: { r: 35, g: 120, b: 95 } },
        { regionId: "n1", areaPx: 1000, centroid: { x: 30, y: 10 }, material: { category: "fabric", roughness: 0.6, metallic: 0 } },
        { regionId: "n2", areaPx: 1000, centroid: { x: 50, y: 10 }, material: { category: "fabric", roughness: 0.6, metallic: 0 } },
      ],
      edges: [
        { regionA: "n0", regionB: "n1", sharedBoundaryPx: 80, lineClosureStrength: 0.2 },
        { regionA: "n1", regionB: "n2", sharedBoundaryPx: 80, lineClosureStrength: 0.2 },
      ],
      lighting: NEUTRAL_LIGHT,
    });
    expect(solution.finalEnergy).toBeLessThan(solution.initialEnergy);
    expect(solution.convergedIterations).toBeGreaterThanOrEqual(1);
  });
});

describe("Wave 42 — 로컬 HNSW+SQ8 에셋 벡터 DB 및 엣지 상태 조율기", () => {
  it("17. 8비트 스칼라 양자화(SQ8)가 ~4배에 가까운 압축률과 낮은 복원 RMSE를 달성한다", () => {
    const original = makeSyntheticVector(42, 64);
    const sq8 = quantizeVectorSq8(original);
    const restored = dequantizeVectorSq8(sq8);
    expect(sq8.codes.byteLength).toBe(64);
    let mse = 0;
    for (let i = 0; i < original.length; i += 1) mse += (original[i] - restored[i]) ** 2;
    expect(Math.sqrt(mse / original.length)).toBeLessThan(0.01);
  });

  it("18. 결정론적 다계층 HNSW+SQ8 인덱스가 높은 상위-K 재현율(Recall >= 0.9)을 달성한다", () => {
    const dim = 64;
    const index = new LocalHnswSq8AssetIndex({ dimension: dim, maxConnectionsM: 12, efConstruction: 48 });
    const docs: { doc: HnswAssetDocument; raw: Float32Array }[] = [];
    const kinds = ["brush", "proxy-texture", "style-preset"] as const;
    for (let i = 0; i < 90; i += 1) {
      const raw = makeSyntheticVector(1000 + i, dim);
      const doc: HnswAssetDocument = {
        assetId: `asset-${i.toString().padStart(3, "0")}`,
        titleKo: `스튜디오 프리셋 ${i}`,
        kind: kinds[i % kinds.length],
        tags: i % 2 === 0 ? ["ink", "crisp"] : ["watercolor", "soft"],
        vector: raw,
      };
      docs.push({ doc, raw });
      index.upsertAsset(doc);
    }

    const query = makeSyntheticVector(1024, dim);
    const exactTop5 = [...docs]
      .sort((a, b) => l2NormalizedDistance(query, a.raw) - l2NormalizedDistance(query, b.raw))
      .slice(0, 5)
      .map((item) => item.doc.assetId);

    const report = index.searchTopK(query, 5, { efSearch: 40 });
    const hitIds = new Set(report.hits.map((h) => h.assetId));
    expect(exactTop5.filter((id) => hitIds.has(id)).length / 5).toBeGreaterThanOrEqual(0.9);
    expect(report.memoryCompressionRatio).toBeGreaterThan(3.4);
    expect(report.maxLayerIndex).toBeGreaterThanOrEqual(0);
  });

  it("19. HNSW 검색 시 에셋 종류(kind)와 필수 태그(requiredTags) 조건 필터링을 정확히 수행한다", () => {
    const dim = 16;
    const index = new LocalHnswSq8AssetIndex({ dimension: dim });
    for (let i = 0; i < 30; i += 1) {
      index.upsertAsset({
        assetId: `item-${i}`,
        titleKo: `항목 ${i}`,
        kind: i % 3 === 0 ? "brush" : "proxy-texture",
        tags: i % 6 === 0 ? ["g-pen", "monochrome"] : ["halftone"],
        vector: makeSyntheticVector(500 + i, dim),
      });
    }
    const report = index.searchTopK(makeSyntheticVector(506, dim), 4, { filterKind: "brush", requiredTags: ["g-pen", "monochrome"] });
    expect(report.hits.length).toBeGreaterThan(0);
    for (const hit of report.hits) {
      expect(hit.kind).toBe("brush");
      expect(hit.tags).toContain("g-pen");
    }
  });

  it("20. 하이브리드 논리·벡터 클럭(HLVC)이 인과 선후(before/after)와 동시성(concurrent)을 구분한다", () => {
    const a1 = advanceHybridVectorClock(createInitialHybridVectorClock("edge-seoul", 10), 12);
    const b1 = advanceHybridVectorClock(createInitialHybridVectorClock("edge-busan", 10), 12);
    expect(compareHybridVectorClocks(a1, b1)).toBe("concurrent");
    const bMerged = mergeHybridVectorClocks(b1, a1, 15);
    expect(compareHybridVectorClocks(a1, bMerged)).toBe("before");
    expect(compareHybridVectorClocks(bMerged, a1)).toBe("after");
    expect(compareHybridVectorClocks(bMerged, bMerged)).toBe("equal");
  });

  it("21. 2단계 버킷 머클 다이제스트 차분이 변경 없는 버킷은 건너뛰고 불일치 타일만 정확히 검출한다", () => {
    const nodeA = new EdgeStateCoordinatorNode("peer-a", 100);
    const nodeB = new EdgeStateCoordinatorNode("peer-b", 100);
    for (let t = 0; t < 12; t += 1) {
      nodeA.mutateTileEntity({ tileKey: `cut1:tile-${t}`, entityId: "ink-layer", payloadBytes: new Uint8Array([t, t + 1]), observedWallTick: 100 + t });
    }
    nodeB.mergeRemoteSnapshot(nodeA.exportOperationsForTiles());
    expect(computeMerkleTileDiff(nodeA.exportMerkleSummary(), nodeB.exportMerkleSummary()).inSync).toBe(true);

    nodeB.mutateTileEntity({ tileKey: "cut1:tile-7", entityId: "tone-overlay", payloadBytes: new Uint8Array([0xfe, 0xed]), observedWallTick: 200 });
    const diff = computeMerkleTileDiff(nodeA.exportMerkleSummary(), nodeB.exportMerkleSummary());
    expect(diff.inSync).toBe(false);
    expect(diff.divergentTileKeys).toEqual(["cut1:tile-7"]);
    expect(diff.mismatchedBucketIndices).toHaveLength(1);
  });

  it("22. 3개 엣지 노드가 네트워크 단절 상태에서 동일 타일 내 서로 다른 엔티티를 편집해도 무손실 수렴한다", () => {
    const seoul = new EdgeStateCoordinatorNode("seoul", 10);
    const tokyo = new EdgeStateCoordinatorNode("tokyo", 10);
    const jeju = new EdgeStateCoordinatorNode("jeju", 10);
    seoul.mutateTileEntity({ tileKey: "cut2:tx1:ty1", entityId: "stroke-1", payloadBytes: new Uint8Array([1, 1]), observedWallTick: 20 });
    tokyo.mutateTileEntity({ tileKey: "cut2:tx1:ty1", entityId: "stroke-2", payloadBytes: new Uint8Array([2, 2]), observedWallTick: 21 });
    jeju.mutateTileEntity({ tileKey: "cut2:tx2:ty4", entityId: "balloon-1", payloadBytes: new Uint8Array([3, 3]), observedWallTick: 22 });

    reconcileEdgeReplicaPair(seoul, tokyo);
    reconcileEdgeReplicaPair(tokyo, jeju);
    reconcileEdgeReplicaPair(seoul, jeju);

    const rootS = seoul.exportMerkleSummary().rootDigest;
    expect(tokyo.exportMerkleSummary().rootDigest).toBe(rootS);
    expect(jeju.exportMerkleSummary().rootDigest).toBe(rootS);
    expect(Array.from(seoul.readLiveTileEntity("cut2:tx1:ty1", "stroke-1")!)).toEqual([1, 1]);
    expect(Array.from(seoul.readLiveTileEntity("cut2:tx1:ty1", "stroke-2")!)).toEqual([2, 2]);
    expect(Array.from(seoul.readLiveTileEntity("cut2:tx2:ty4", "balloon-1")!)).toEqual([3, 3]);
  });

  it("23. 동일 (tileKey, entityId)에 대한 동시 충돌 쓰기가 병합 순서(교환·멱등성)와 무관하게 동일 값으로 수렴한다", () => {
    const originA = new EdgeStateCoordinatorNode("alpha", 50);
    const originB = new EdgeStateCoordinatorNode("beta", 50);
    originA.mutateTileEntity({ tileKey: "cut3:tx0:ty0", entityId: "color-fill", payloadBytes: new Uint8Array([0x10]), observedWallTick: 60 });
    originB.mutateTileEntity({ tileKey: "cut3:tx0:ty0", entityId: "color-fill", payloadBytes: new Uint8Array([0x20]), observedWallTick: 60 });

    const snapA = originA.exportOperationsForTiles();
    const snapB = originB.exportOperationsForTiles();
    const orderAB = new EdgeStateCoordinatorNode("verifier-1", 50);
    orderAB.mergeRemoteSnapshot(snapA);
    orderAB.mergeRemoteSnapshot(snapB);
    orderAB.mergeRemoteSnapshot(snapA);

    const orderBA = new EdgeStateCoordinatorNode("verifier-2", 50);
    orderBA.mergeRemoteSnapshot(snapB);
    orderBA.mergeRemoteSnapshot(snapA);

    expect(orderAB.exportMerkleSummary().rootDigest).toBe(orderBA.exportMerkleSummary().rootDigest);
    expect(orderAB.readLiveTileEntity("cut3:tx0:ty0", "color-fill")).toEqual(orderBA.readLiveTileEntity("cut3:tx0:ty0", "color-fill"));
  });

  it("24. 인과 툼스톤(deleted=true)이 네트워크 복구 후 구버전 상태로부터 삭제 엔티티의 부활을 차단한다", () => {
    const author = new EdgeStateCoordinatorNode("author", 10);
    const stalePeer = new EdgeStateCoordinatorNode("stale-peer", 10);
    author.mutateTileEntity({ tileKey: "cut4:tx0:ty0", entityId: "temp-guide", payloadBytes: new Uint8Array([99]), observedWallTick: 15 });
    reconcileEdgeReplicaPair(author, stalePeer);
    expect(stalePeer.readLiveTileEntity("cut4:tx0:ty0", "temp-guide")).not.toBeNull();

    author.mutateTileEntity({ tileKey: "cut4:tx0:ty0", entityId: "temp-guide", payloadBytes: new Uint8Array(0), observedWallTick: 30, deleted: true });
    reconcileEdgeReplicaPair(stalePeer, author);
    expect(author.readLiveTileEntity("cut4:tx0:ty0", "temp-guide")).toBeNull();
    expect(stalePeer.readLiveTileEntity("cut4:tx0:ty0", "temp-guide")).toBeNull();
    expect(author.exportMerkleSummary().rootDigest).toBe(stalePeer.exportMerkleSummary().rootDigest);
  });
});
