// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATLAS_GRID_COLS,
  ATLAS_GRID_ROWS,
  ATLAS_PAGE_SIZE_PX,
  ATLAS_TOTAL_SLOTS,
  DEFAULT_WORLD_OFFSET_PX,
  FLOATING_ORIGIN_CHUNK_SIZE_PX,
  INFINITE_ZOOM_GPU_ATLAS_WGSL,
  INFINITE_ZOOM_MANIFEST_SCHEMA_VERSION,
  MAX_ZOOM_EXP,
  MAX_ZOOM_FACTOR,
  MEGA_ATLAS_DIMENSION_PX,
  MIN_ZOOM_EXP,
  MIN_ZOOM_FACTOR,
  SEMANTIC_ZOOM_BANDS,
  SEMANTIC_ZOOM_JUMP_PRESETS,
  StudioInfiniteZoomSpatialPanel,
  TRIPLE_RING_FRAME_COUNT,
  WEBGPU_BYTES_PER_ROW_ALIGNMENT,
  WEBGPU_UNIFORM_OFFSET_ALIGNMENT,
  WGSL_INDIRECTION_STRUCT_BYTES,
  WGSL_UNIFORM_STRUCT_BYTES,
  ZOOM_DECADES_SPAN,
  alignToWebGpu256,
  computeAlignedTextureBytesPerRow,
  computeFloat32Ulp,
  computeFloat64Ulp,
  evaluateFloatingOriginPrecision,
  evaluateInfiniteZoomScene,
  exportInfiniteZoomManifestJson,
  planGpuRingAndAtlasBuffers,
  validateInfiniteZoomWgsl,
  type InfiniteZoomSceneSnapshot,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("1. Floating-Origin 배정밀도 무한 줌 좌표계 (evaluateFloatingOriginPrecision)", () => {
  it("0.01×~100,000× 7 decades(10^7) 범위 및 NaN/Infinity 입력을 안전하게 정규화한다", () => {
    expect(ZOOM_DECADES_SPAN).toBe(7);
    expect(Math.round(MAX_ZOOM_FACTOR / MIN_ZOOM_FACTOR)).toBe(10_000_000);
    expect(evaluateFloatingOriginPrecision(0.0001, 250_000).zoomFactor).toBe(MIN_ZOOM_FACTOR);
    expect(evaluateFloatingOriginPrecision(999_999, 250_000).zoomFactor).toBe(MAX_ZOOM_FACTOR);
    expect(evaluateFloatingOriginPrecision(Number.NaN, Number.POSITIVE_INFINITY).zoomFactor).toBe(1);
    expect(evaluateFloatingOriginPrecision(Number.NaN, Number.POSITIVE_INFINITY).worldOffsetPx).toBe(DEFAULT_WORLD_OFFSET_PX);
  });

  it("100,000× 극접사·250,000px 오프셋에서 일반 f32는 크게 붕괴하고 Floating-Origin은 <0.001px를 유지한다", () => {
    const report = evaluateFloatingOriginPrecision(100_000, 250_000);
    expect(report.naiveF32Broken).toBe(true);
    expect(report.naiveF32JitterPx).toBeGreaterThan(500);
    expect(report.subPixelStable).toBe(true);
    expect(report.floatingOriginJitterPx).toBeLessThan(0.001);
    expect(report.precisionGainMultiplier).toBeGreaterThan(1_000_000);
  });

  it("64× 중배율·250,000px 오프셋에서도 일반 f32 지터가 발생하고 Floating-Origin이 수천 배 이상 정밀하다", () => {
    const report = evaluateFloatingOriginPrecision(64, 250_000);
    expect(report.naiveF32Broken).toBe(true);
    expect(report.naiveF32JitterPx).toBeGreaterThanOrEqual(0.5);
    expect(report.floatingOriginJitterPx).toBeLessThan(0.001);
    expect(report.precisionGainMultiplier).toBeGreaterThan(500);
  });

  it("세계 좌표 오프셋이 커질수록 일반 f32 ULP와 지터 오차가 단조 증가한다", () => {
    const offsets = [4_096, 65_536, 250_000, 1_000_000];
    const reports = offsets.map((offset) => evaluateFloatingOriginPrecision(1_000, offset));
    for (let i = 1; i < reports.length; i += 1) {
      expect(reports[i]!.f32WorldUlpPx).toBeGreaterThan(reports[i - 1]!.f32WorldUlpPx);
      expect(reports[i]!.theoreticalNaiveUlpJitterPx).toBeGreaterThan(reports[i - 1]!.theoreticalNaiveUlpJitterPx);
      expect(reports[i]!.subPixelStable).toBe(true);
    }
  });

  it("타일 청크 분해 불변식(chunkIndex * 4096 + cameraLocalOffsetPx === worldOffsetPx)이 양수·음수 모두 성립한다", () => {
    for (const offset of [-987_654.25, -4096, -12.5, 0, 123.75, 250_000, 1_048_577.5]) {
      const report = evaluateFloatingOriginPrecision(500, offset);
      expect(report.chunkOriginWorldPx + report.cameraLocalOffsetPx).toBeCloseTo(offset, 6);
      expect(report.cameraLocalOffsetPx).toBeGreaterThanOrEqual(0);
      expect(report.cameraLocalOffsetPx).toBeLessThan(FLOATING_ORIGIN_CHUNK_SIZE_PX);
    }
  });

  it("원점(worldOffsetPx=0)에서는 과장 없이 gainMultiplier>=1과 유한한 실측값을 반환한다", () => {
    const origin = evaluateFloatingOriginPrecision(10_000, 0);
    expect(origin.chunkIndex).toBe(0);
    expect(origin.theoreticalNaiveUlpJitterPx).toBe(0);
    expect(origin.precisionGainMultiplier).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(origin.precisionGainMultiplier)).toBe(true);
    expect(origin.subPixelStable).toBe(true);
  });

  it("IEEE-754 f64 ULP가 f32 ULP보다 2^29배 작음을 실측 검증한다", () => {
    const u32 = computeFloat32Ulp(250_000);
    const u64 = computeFloat64Ulp(250_000);
    expect(u32 / u64).toBeCloseTo(Math.pow(2, 29), 0);
    expect(computeFloat32Ulp(0)).toBeGreaterThan(0);
    expect(computeFloat64Ulp(0)).toBeGreaterThan(0);
  });

  it("모든 정밀도 프로브 샘플이 유한하며 음수가 아닌 화면 오차를 기록한다", () => {
    const report = evaluateFloatingOriginPrecision(50_000, 250_000);
    expect(report.probeSamples.length).toBe(8);
    for (const sample of report.probeSamples) {
      expect(Number.isFinite(sample.naiveF32ScreenPx)).toBe(true);
      expect(Number.isFinite(sample.floatingOriginScreenPx)).toBe(true);
      expect(sample.naiveF32ErrorPx).toBeGreaterThanOrEqual(0);
      expect(sample.floatingOriginErrorPx).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("2. 4단계 시맨틱 줌 · 중첩 포털 레이어링 & 2.5D 시차 (SEMANTIC_ZOOM_BANDS, evaluateInfiniteZoomScene)", () => {
  it("SEMANTIC_ZOOM_BANDS가 0.01~0.25~4~64~100,000× 경계를 빈틈없이 연속 커버한다", () => {
    expect(SEMANTIC_ZOOM_BANDS).toHaveLength(4);
    expect(SEMANTIC_ZOOM_BANDS[0].minZoom).toBe(0.01);
    expect(SEMANTIC_ZOOM_BANDS[0].maxZoom).toBe(0.25);
    expect(SEMANTIC_ZOOM_BANDS[1].minZoom).toBe(0.25);
    expect(SEMANTIC_ZOOM_BANDS[1].maxZoom).toBe(4);
    expect(SEMANTIC_ZOOM_BANDS[2].minZoom).toBe(4);
    expect(SEMANTIC_ZOOM_BANDS[2].maxZoom).toBe(64);
    expect(SEMANTIC_ZOOM_BANDS[3].minZoom).toBe(64);
    expect(SEMANTIC_ZOOM_BANDS[3].maxZoom).toBe(100_000);
    expect(SEMANTIC_ZOOM_JUMP_PRESETS).toHaveLength(5);
  });

  it("각 배율 구간에서 정확한 시맨틱 줌 대역 ID를 판정한다", () => {
    expect(evaluateInfiniteZoomScene({ zoomExp: -1.5 }).activeBandId).toBe("storyboard-overview");
    expect(evaluateInfiniteZoomScene({ zoomExp: 0 }).activeBandId).toBe("manuscript-parallax");
    expect(evaluateInfiniteZoomScene({ zoomExp: 1.2 }).activeBandId).toBe("vector-ink-screentone");
    expect(evaluateInfiniteZoomScene({ zoomExp: 4.5 }).activeBandId).toBe("micro-fiber-portal");
  });

  it("전체 7 decades(-2.0~+5.0) 25지점 스윕에서 교차 페이드 가중치 합이 항상 1.0이다", () => {
    for (let i = 0; i <= 24; i += 1) {
      const exp = MIN_ZOOM_EXP + ((MAX_ZOOM_EXP - MIN_ZOOM_EXP) * i) / 24;
      const scene = evaluateInfiniteZoomScene({ zoomExp: exp });
      const sum = Object.values(scene.bandWeights).reduce((acc, v) => acc + v, 0);
      expect(sum).toBeCloseTo(1, 2);
      for (const w of Object.values(scene.bandWeights)) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });

  it("경계 배율(0.25×, 4×, 64×)에서 인접 두 시맨틱 대역이 약 50:50으로 부드럽게 교차 페이드한다", () => {
    const atQuarter = evaluateInfiniteZoomScene({ zoomExp: Math.log10(0.25) });
    expect(atQuarter.bandWeights["storyboard-overview"]).toBeCloseTo(0.5, 1);
    expect(atQuarter.bandWeights["manuscript-parallax"]).toBeCloseTo(0.5, 1);

    const atFour = evaluateInfiniteZoomScene({ zoomExp: Math.log10(4) });
    expect(atFour.bandWeights["manuscript-parallax"]).toBeCloseTo(0.5, 1);
    expect(atFour.bandWeights["vector-ink-screentone"]).toBeCloseTo(0.5, 1);

    const atSixtyFour = evaluateInfiniteZoomScene({ zoomExp: Math.log10(64) });
    expect(atSixtyFour.bandWeights["vector-ink-screentone"]).toBeCloseTo(0.5, 1);
    expect(atSixtyFour.bandWeights["micro-fiber-portal"]).toBeCloseTo(0.5, 1);
  });

  it("4단 중첩 포털 프레임이 극접사 이동 시 상위 포털을 overscaled-parent로, 조감도 시 하위를 culled-too-small로 전환한다", () => {
    const overview = evaluateInfiniteZoomScene({ zoomExp: -1.9 });
    expect(overview.nestedPortals).toHaveLength(4);
    expect(overview.nestedPortals[0]?.cullState).toBe("active");
    expect(overview.nestedPortals[3]?.cullState).toBe("culled-too-small");

    const macro = evaluateInfiniteZoomScene({ zoomExp: 4.8 });
    expect(macro.nestedPortals[0]?.cullState).toBe("overscaled-parent");
    expect(macro.nestedPortals[3]?.cullState).toBe("active");
    expect(macro.nestedPortals[3]?.opacity).toBeGreaterThan(0.9);
  });

  it("2.5D 시차 깊이가 0이면 모든 평면 변위가 0이고, 깊이가 1이면 원경/근경이 반대 부호로 이동한다", () => {
    const flat = evaluateInfiniteZoomScene({ zoomExp: 0, parallaxDepth: 0 });
    for (const layer of flat.parallaxLayers) {
      expect(Math.abs(layer.effectiveShiftXPx)).toBe(0);
      expect(Math.abs(layer.effectiveShiftYPx)).toBe(0);
      expect(layer.perspectiveScale).toBe(1);
    }

    const deep = evaluateInfiniteZoomScene({ zoomExp: 0, parallaxDepth: 1 });
    const far = deep.parallaxLayers[0];
    const focal = deep.parallaxLayers[2];
    const near = deep.parallaxLayers[3];
    expect(far?.effectiveShiftXPx).toBeLessThan(0);
    expect(Math.abs(focal?.effectiveShiftXPx ?? 1)).toBe(0);
    expect(near?.effectiveShiftXPx).toBeGreaterThan(0);
    expect(near?.perspectiveScale).toBeGreaterThan(far?.perspectiveScale ?? 1);
  });

  it("범위 밖 zoomExp와 parallaxDepth 입력을 안전하게 클램핑한다", () => {
    const low = evaluateInfiniteZoomScene({ zoomExp: -99, parallaxDepth: -5 });
    expect(low.zoomExp).toBe(MIN_ZOOM_EXP);
    expect(low.parallaxDepth).toBe(0);

    const high = evaluateInfiniteZoomScene({ zoomExp: 99, parallaxDepth: 99 });
    expect(high.zoomExp).toBe(MAX_ZOOM_EXP);
    expect(high.parallaxDepth).toBe(1);
  });

  it("동일 입력에 대해 완전 결정론적 스냅샷과 정직한 실측/추정 경계 문구를 제공한다", () => {
    const a = evaluateInfiniteZoomScene({ zoomExp: 1.5, parallaxDepth: 0.6, frameIndex: 2 });
    const b = evaluateInfiniteZoomScene({ zoomExp: 1.5, parallaxDepth: 0.6, frameIndex: 2 });
    expect(a).toEqual(b);
    expect(a.honestScope.measuredMathKo).toContain("실측");
    expect(a.honestScope.runtimeBoundaryKo).toContain("추정");
  });
});

describe("3. WebGPU Triple-Buffered Staging Ring & 4096×4096 Sparse Mega-Atlas (planGpuRingAndAtlasBuffers)", () => {
  it("256B minUniformBufferOffsetAlignment와 bytesPerRow 정렬 함수가 모든 경계값에서 256의 배수를 보장한다", () => {
    for (const raw of [1, 16, 112, 255, 256, 257, 768, 800, 1024]) {
      const aligned = alignToWebGpu256(raw);
      expect(aligned % WEBGPU_UNIFORM_OFFSET_ALIGNMENT).toBe(0);
      expect(aligned).toBeGreaterThanOrEqual(raw);
    }
    expect(computeAlignedTextureBytesPerRow(200, 4)).toBe(1024);
    expect(computeAlignedTextureBytesPerRow(256, 4)).toBe(1024);
    expect(computeAlignedTextureBytesPerRow(256, 8)).toBe(2048);
    expect(computeAlignedTextureBytesPerRow(192, 4) % WEBGPU_BYTES_PER_ROW_ALIGNMENT).toBe(0);
  });

  it("Triple-Ring 3-Frame Fence가 프레임 0→1→2→3 진행 시 스톨 0으로 기록·GPU·해제 슬롯을 순환한다", () => {
    for (let f = 0; f < 6; f += 1) {
      const plan = planGpuRingAndAtlasBuffers({ strategy: "triple-ring-mega-atlas", frameIndex: f });
      expect(plan.stagingRing.ringDepth).toBe(TRIPLE_RING_FRAME_COUNT);
      expect(plan.stagingRing.activeWriteSlot).toBe(f % 3);
      expect(plan.stagingRing.gpuReadingSlot).toBe((f + 2) % 3);
      expect(plan.stagingRing.fenceRetiringSlot).toBe((f + 1) % 3);
      expect(plan.stagingRing.pipelineStallCount).toBe(0);
      expect(plan.stagingRing.estimatedCpuWaitMs).toBe(0);
      expect(plan.stagingRing.slots.map((s) => s.uniformOffsetBytes)).toEqual([0, 256, 512]);
      expect(new Set(plan.stagingRing.slots.map((s) => s.state)).size).toBe(3);
    }
  });

  it("Uniform/Tile 정렬 감사 결과가 256B 규칙을 엄격히 충족한다", () => {
    const plan = planGpuRingAndAtlasBuffers({ tileSizePx: 200, bytesPerPixel: 4 });
    expect(plan.alignment.allAlignmentsValid).toBe(true);
    expect(plan.alignment.uniformStructRawBytes).toBe(WGSL_UNIFORM_STRUCT_BYTES);
    expect(plan.alignment.uniformSlotAlignedBytes).toBe(256);
    expect(plan.alignment.uniformPaddingBytes).toBe(144);
    expect(plan.alignment.tileRowRawBytes).toBe(800);
    expect(plan.alignment.tileBytesPerRowAligned).toBe(1024);
    expect(plan.alignment.tileRowPaddingBytes).toBe(224);
  });

  it("4096×4096 Sparse Mega-Atlas가 16×16=256 물리 슬롯(64MiB RGBA8)과 외부 단편화 0%를 유지한다", () => {
    const plan = planGpuRingAndAtlasBuffers({ strategy: "triple-ring-mega-atlas" });
    expect(plan.megaAtlas.atlasWidthPx).toBe(MEGA_ATLAS_DIMENSION_PX);
    expect(plan.megaAtlas.atlasHeightPx).toBe(MEGA_ATLAS_DIMENSION_PX);
    expect(plan.megaAtlas.pageSizePx).toBe(ATLAS_PAGE_SIZE_PX);
    expect(plan.megaAtlas.gridCols).toBe(ATLAS_GRID_COLS);
    expect(plan.megaAtlas.gridRows).toBe(ATLAS_GRID_ROWS);
    expect(plan.megaAtlas.totalSlots).toBe(ATLAS_TOTAL_SLOTS);
    expect(plan.megaAtlas.atlasTextureBytes).toBe(64 * 1024 * 1024);
    expect(plan.megaAtlas.externalFragmentationPct).toBe(0);
    expect(plan.megaAtlas.slotStates).toHaveLength(ATLAS_TOTAL_SLOTS);
    expect(plan.megaAtlas.hotSlots + plan.megaAtlas.warmSlots + plan.megaAtlas.lruEvictableSlots + plan.megaAtlas.freeSlots).toBe(ATLAS_TOTAL_SLOTS);
  });

  it("고부하 레이어·더티 타일 워크로드에서 Sparse Mega-Atlas LRU 재활용이 발동하고 256 상한을 넘지 않는다", () => {
    const heavy = planGpuRingAndAtlasBuffers({
      strategy: "triple-ring-mega-atlas",
      activeLayerCount: 48,
      dirtyTileCount: 180,
      zoomFactor: 50_000,
    });
    expect(heavy.megaAtlas.allocatedSlots).toBeLessThanOrEqual(ATLAS_TOTAL_SLOTS);
    expect(heavy.megaAtlas.lruRecycledSlots).toBeGreaterThan(0);
    expect(heavy.megaAtlas.drawCallsPerFrame).toBe(2);
  });

  it("단일 Staging 비교 모드는 링 깊이 1, 매 프레임 스톨 1, 높은 단편화와 다중 드로우콜을 정직하게 노출한다", () => {
    const triple = planGpuRingAndAtlasBuffers({ strategy: "triple-ring-mega-atlas", activeLayerCount: 16, dirtyTileCount: 64 });
    const single = planGpuRingAndAtlasBuffers({ strategy: "single-staging-naive", activeLayerCount: 16, dirtyTileCount: 64 });

    expect(single.stagingRing.ringDepth).toBe(1);
    expect(single.stagingRing.pipelineStallCount).toBe(1);
    expect(single.stagingRing.estimatedCpuWaitMs).toBeGreaterThan(2);
    expect(single.stagingRing.slots[0]?.state).toBe("stalled-awaiting-mapAsync");
    expect(single.megaAtlas.externalFragmentationPct).toBeGreaterThan(15);
    expect(single.megaAtlas.lruRecycledSlots).toBe(0);
    expect(single.megaAtlas.drawCallsPerFrame).toBeGreaterThan(triple.megaAtlas.drawCallsPerFrame);
    expect(single.estimatedGpuFrameMs).toBeGreaterThan(triple.estimatedGpuFrameMs);
  });

  it("전략 비교 요약이 Triple-Ring 프레임 단축, 드로우콜 절감률, 단편화 절감률을 정확히 계산한다", () => {
    const plan = planGpuRingAndAtlasBuffers({ activeLayerCount: 20, dirtyTileCount: 64 });
    expect(plan.comparison.tripleRingFrameMs).toBeLessThan(plan.comparison.singleStagingFrameMs);
    expect(plan.comparison.stallEliminatedMs).toBeGreaterThan(0);
    expect(plan.comparison.drawCallReductionPct).toBeGreaterThan(80);
    expect(plan.comparison.fragmentationReductionPct).toBeGreaterThan(80);
  });

  it("음수·NaN GPU 플래너 입력이 안전하게 클램핑되어 유효한 버퍼 계획을 반환한다", () => {
    const plan = planGpuRingAndAtlasBuffers({
      frameIndex: -10,
      activeLayerCount: -5,
      dirtyTileCount: 9999,
      viewportWidthPx: Number.NaN,
    });
    expect(plan.stagingRing.frameIndex).toBe(0);
    expect(plan.activeLayerCount).toBe(1);
    expect(plan.dirtyTileCount).toBe(ATLAS_TOTAL_SLOTS);
    expect(plan.alignment.allAlignmentsValid).toBe(true);
  });
});

describe("4. WGSL 셰이더 정적 계약 검증 & JSON 매니페스트 (validateInfiniteZoomWgsl, exportInfiniteZoomManifestJson)", () => {
  it("기본 INFINITE_ZOOM_GPU_ATLAS_WGSL이 모든 정적 계약을 통과하고 예약어 충돌이 0건이다", () => {
    const report = validateInfiniteZoomWgsl(INFINITE_ZOOM_GPU_ATLAS_WGSL);
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.reservedKeywordHits).toEqual([]);
    expect(report.entryPoint).toBe("main_infinite_zoom_atlas");
    expect(report.workgroupSize).toEqual([16, 16, 1]);
    expect(report.uniformStructBytes).toBe(WGSL_UNIFORM_STRUCT_BYTES);
    expect(report.uniformStructBytes % 16).toBe(0);
    expect(report.uniformAlignedStrideBytes).toBe(256);
    expect(report.indirectionStructBytes).toBe(WGSL_INDIRECTION_STRUCT_BYTES);
    expect(report.bindingCount).toBe(5);
  });

  it("WGSL 셰이더가 컴퓨트 전용 textureSampleLevel과 인다이렉션 page_table을 사용하고 금지된 textureSample을 쓰지 않는다", () => {
    expect(INFINITE_ZOOM_GPU_ATLAS_WGSL).toContain("textureSampleLevel(");
    expect(INFINITE_ZOOM_GPU_ATLAS_WGSL).toContain("textureStore(");
    expect(INFINITE_ZOOM_GPU_ATLAS_WGSL).toContain("page_table");
    expect(INFINITE_ZOOM_GPU_ATLAS_WGSL).not.toMatch(/\btextureSample\s*\(/u);
  });

  it("정적 검증기가 WGSL 예약어 식별자 충돌(target/type/mod)을 정확히 적발한다", () => {
    const brokenWgsl = `${INFINITE_ZOOM_GPU_ATLAS_WGSL}\nfn bad_helper(target: f32) -> f32 { let mod = target; return mod; }`;
    const report = validateInfiniteZoomWgsl(brokenWgsl);
    expect(report.valid).toBe(false);
    expect(report.reservedKeywordHits).toContain("target");
    expect(report.reservedKeywordHits).toContain("mod");
    expect(report.errors.some((e) => e.includes("reserved-keywords-clean"))).toBe(true);
  });

  it("정적 검증기가 괄호 불균형·엔트리포인트 누락·구조체 정렬 위반을 실패로 판정한다", () => {
    const broken = "struct InfiniteZoomUniforms { bad_scalar: f32, } fn noop() {";
    const report = validateInfiniteZoomWgsl(broken);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes("delimiters-balanced"))).toBe(true);
    expect(report.errors.some((e) => e.includes("compute-entrypoint"))).toBe(true);
    expect(report.errors.some((e) => e.includes("struct-16b-alignment"))).toBe(true);
  });

  it("exportInfiniteZoomManifestJson이 유효한 JSON과 WGSL 소스를 함께 반환한다", () => {
    const exported = exportInfiniteZoomManifestJson({ zoomExp: 4.5, gpuStrategy: "triple-ring-mega-atlas", frameIndex: 2 });
    const parsed = JSON.parse(exported.json) as {
      schemaVersion: string;
      zoomExp: number;
      activeBandId: string;
      floatingOriginPrecision: { subPixelStable: boolean; precisionGainMultiplier: number };
      gpuBufferPlan: { stagingRing: { activeWriteSlot: number; pipelineStallCount: number } };
      wgslContract: { valid: boolean; uniformStructBytes: number };
    };
    expect(parsed.schemaVersion).toBe(INFINITE_ZOOM_MANIFEST_SCHEMA_VERSION);
    expect(parsed.zoomExp).toBe(4.5);
    expect(parsed.activeBandId).toBe("micro-fiber-portal");
    expect(parsed.floatingOriginPrecision.subPixelStable).toBe(true);
    expect(parsed.floatingOriginPrecision.precisionGainMultiplier).toBeGreaterThan(100_000);
    expect(parsed.gpuBufferPlan.stagingRing.activeWriteSlot).toBe(2);
    expect(parsed.gpuBufferPlan.stagingRing.pipelineStallCount).toBe(0);
    expect(parsed.wgslContract.valid).toBe(true);
    expect(parsed.wgslContract.uniformStructBytes).toBe(112);
    expect(exported.wgsl).toContain("main_infinite_zoom_atlas");
  });

  it("단일 Staging 입력 시 내보낸 매니페스트에도 스톨 1과 비교 지표가 반영된다", () => {
    const exported = exportInfiniteZoomManifestJson({ gpuStrategy: "single-staging-naive" });
    expect(exported.json).toContain("single-staging-naive");
    expect(exported.scene.gpuPlan.stagingRing.pipelineStallCount).toBe(1);
  });
});

describe("5. 스튜디오 제어판 UI 인터랙션 & 순수 시맨틱 2단 SVG (StudioInfiniteZoomSpatialPanel)", () => {
  it("props 없이 기본 마운트되며 좌/우 순수 시맨틱 SVG 2종과 256개 아틀라스 슬롯을 렌더한다", () => {
    render(<StudioInfiniteZoomSpatialPanel />);
    const portalSvg = screen.getByTestId("infinite-zoom-portal-svg");
    const gpuSvg = screen.getByTestId("gpu-ring-atlas-svg");
    expect(portalSvg.getAttribute("data-active-band")).toBe("manuscript-parallax");
    expect(portalSvg.getAttribute("data-subpixel-stable")).toBe("true");
    expect(gpuSvg.getAttribute("data-gpu-strategy")).toBe("triple-ring-mega-atlas");
    expect(gpuSvg.getAttribute("data-pipeline-stalls")).toBe("0");
    expect(screen.getByTestId("mega-atlas-slot-grid").querySelectorAll("rect")).toHaveLength(ATLAS_TOTAL_SLOTS);
  });

  it("로그 스케일 무한 줌 슬라이더 조작 시 0.01×~100,000× 전역으로 대역이 전환되고 onSceneChange가 호출된다", () => {
    const onSceneChange = vi.fn<(scene: InfiniteZoomSceneSnapshot) => void>();
    render(<StudioInfiniteZoomSpatialPanel onSceneChange={onSceneChange} />);

    const slider = screen.getByTestId("infinite-zoom-slider");
    fireEvent.change(slider, { target: { value: "5" } });
    expect(screen.getByTestId("infinite-zoom-portal-svg").getAttribute("data-active-band")).toBe("micro-fiber-portal");
    expect(screen.getByTestId("kpi-active-zoom").textContent).toContain("100,000×");

    fireEvent.change(slider, { target: { value: "-2" } });
    expect(screen.getByTestId("infinite-zoom-portal-svg").getAttribute("data-active-band")).toBe("storyboard-overview");
    expect(screen.getByTestId("kpi-active-zoom").textContent).toContain("0.01×");
    expect(onSceneChange).toHaveBeenCalledTimes(2);
  });

  it("5종 시맨틱 점프 버튼이 각각의 목표 줌 대역으로 정확히 이동한다", () => {
    render(<StudioInfiniteZoomSpatialPanel />);
    for (const preset of SEMANTIC_ZOOM_JUMP_PRESETS) {
      fireEvent.click(screen.getByTestId(`semantic-jump-${preset.id}`));
      expect(screen.getByTestId("infinite-zoom-portal-svg").getAttribute("data-active-band")).toBe(preset.bandId);
    }
  });

  it("2.5D 시차 깊이 슬라이더와 세계 오프셋 프리셋 버튼이 실시간으로 SVG와 지표를 갱신한다", () => {
    render(<StudioInfiniteZoomSpatialPanel />);
    fireEvent.change(screen.getByTestId("parallax-depth-slider"), { target: { value: "0.9" } });
    expect(screen.getByTestId("infinite-zoom-portal-svg").getAttribute("data-parallax")).toBe("0.90");

    fireEvent.click(screen.getByTestId("world-offset-1000000"));
    expect(screen.getByTestId("infinite-zoom-portal-svg").textContent).toContain("1,000,000px");
  });

  it("GPU 버퍼 전략 토글과 프레임 +1 Fence 순환 버튼이 3-Frame Ring과 단일 Staging 비교를 전환한다", () => {
    render(<StudioInfiniteZoomSpatialPanel />);
    const gpuSvg = screen.getByTestId("gpu-ring-atlas-svg");
    expect(gpuSvg.getAttribute("data-active-slot")).toBe("0");

    fireEvent.click(screen.getByTestId("advance-ring-frame-btn"));
    expect(gpuSvg.getAttribute("data-active-slot")).toBe("1");
    fireEvent.click(screen.getByTestId("advance-ring-frame-btn"));
    expect(gpuSvg.getAttribute("data-active-slot")).toBe("2");
    fireEvent.click(screen.getByTestId("advance-ring-frame-btn"));
    expect(gpuSvg.getAttribute("data-active-slot")).toBe("0");

    fireEvent.click(screen.getByTestId("strategy-single-staging-btn"));
    expect(gpuSvg.getAttribute("data-gpu-strategy")).toBe("single-staging-naive");
    expect(gpuSvg.getAttribute("data-pipeline-stalls")).toBe("1");
    expect(screen.getByTestId("kpi-ring-stall").textContent).toContain("스톨 1");

    fireEvent.click(screen.getByTestId("strategy-triple-ring-btn"));
    expect(gpuSvg.getAttribute("data-pipeline-stalls")).toBe("0");
  });

  it("WGSL·JSON 복사 및 미리보기 토글이 동작하고 onExportJson 콜백을 전달한다", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const onExportJson = vi.fn<(json: string, scene: InfiniteZoomSceneSnapshot) => void>();
    render(<StudioInfiniteZoomSpatialPanel onExportJson={onExportJson} />);

    fireEvent.click(screen.getByTestId("copy-wgsl-btn"));
    expect(screen.getByTestId("wgsl-shader-preview").textContent).toContain("main_infinite_zoom_atlas");

    await waitFor(() => expect(screen.getByTestId("infinite-zoom-copy-state").getAttribute("data-copy-state")).toBe("copied"));
    fireEvent.click(screen.getByTestId("copy-manifest-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("manifest-json-preview").textContent).toContain(INFINITE_ZOOM_MANIFEST_SCHEMA_VERSION);

    fireEvent.click(screen.getByTestId("toggle-json-preview-btn"));
    expect(screen.queryByTestId("manifest-json-preview")).toBeNull();
  });

  it("초기화(Reset) 버튼과 영문 로케일(locale='en')이 일관되게 동작한다", () => {
    const { unmount } = render(<StudioInfiniteZoomSpatialPanel initialZoomExp={1.2} initialParallaxDepth={0.7} />);
    fireEvent.click(screen.getByTestId("semantic-jump-jump-deep-portal"));
    fireEvent.click(screen.getByTestId("strategy-single-staging-btn"));
    fireEvent.click(screen.getByTestId("reset-infinite-zoom-btn"));

    const portalSvg = screen.getByTestId("infinite-zoom-portal-svg");
    expect(portalSvg.getAttribute("data-active-band")).toBe("vector-ink-screentone");
    expect(portalSvg.getAttribute("data-parallax")).toBe("0.70");
    expect(screen.getByTestId("gpu-ring-atlas-svg").getAttribute("data-gpu-strategy")).toBe("triple-ring-mega-atlas");
    unmount();

    render(<StudioInfiniteZoomSpatialPanel locale="en" initialZoomExp={4.7} />);
    expect(screen.getByTestId("infinite-zoom-portal-svg").textContent).toContain("4-TIER NESTED INFINITE ZOOM PORTAL");
    expect(screen.getByTestId("gpu-ring-atlas-svg").textContent).toContain("WEBGPU 3-FRAME RING FENCE");
  });
});

describe("6. 코드 위생 · 탈-바이올렛 OKLCH · Calm Atelier 하네스 계약 자가 검증", () => {
  it("소유 파일의 줄 수 상한(engine<=750, panel<=680, 전체<=800)과 금지 패턴 0건을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "infinite-zoom-spatial-engine.ts",
      "StudioInfiniteZoomSpatialPanel.tsx",
      "index.ts",
      "infinite-zoom-spatial.test.tsx", "infinite-zoom-boundaries.test.tsx", "infinite-zoom-wgsl-contract.ts",
      "use-infinite-zoom-controller.ts", "use-infinite-zoom-copy.ts", "use-infinite-zoom-notification.ts",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }
    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.sort()).toEqual([...required].sort());

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "infinite-zoom-spatial-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioInfiniteZoomSpatialPanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "infinite-zoom-spatial.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("Sparkles");
        expect(src).not.toContain("하는 것을 가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공합니다");
        expect(src).not.toContain("원활한 워크플로우를 보장합니다");
      }

      if (file === "StudioInfiniteZoomSpatialPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("패널 내 모든 oklch() 색상이 바이올렛 휴 대역(270~320도)을 0% 배제한다", () => {
    const panelSrc = readFileSync(
      path.resolve(import.meta.dirname, "StudioInfiniteZoomSpatialPanel.tsx"),
      "utf8",
    );
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(6);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("렌더된 제어판의 모든 버튼이 min-h-11 접근성 터치 타깃을 충족한다", () => {
    const { container } = render(<StudioInfiniteZoomSpatialPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(14);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
  });

  it("WGSL 구조체와 256B Uniform 스트라이드가 호환되며 패널이 오류 없이 JSON·WGSL을 동시 생성한다", () => {
    const exported = exportInfiniteZoomManifestJson({ zoomExp: 2.7, parallaxDepth: 0.5 });
    expect(exported.scene.wgslValidation.uniformAlignedStrideBytes).toBe(
      exported.scene.gpuPlan.alignment.uniformSlotAlignedBytes,
    );
    expect(exported.scene.wgslValidation.valid).toBe(true);
  });
});
