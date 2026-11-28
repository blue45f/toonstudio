/**
 * Wave 140 마일스톤 — 8K 멀티페이지 WebGPU/WASM64 타일 스트리밍 프리페치 LRU 스케줄러 &
 * 60fps/120fps 프레임 버짓 가드 결정론적 Vitest 검증 스위트 (41개 테스트).
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_UPLOAD_BUDGET_120FPS_MS,
  DEFAULT_UPLOAD_BUDGET_60FPS_MS,
  FRAME_BUDGET_120FPS_MS,
  FRAME_BUDGET_60FPS_MS,
  VramTileStreamingCache,
  buildCanvasPanZoomTrajectory,
  buildVirtualTileAtlasWgsl,
  compareNaiveVsPredictiveTileStreaming,
  computeMipGridDimensions,
  computePyramidTotals,
  computeTileByteSize,
  createMultiPage8kManuscriptSpec,
  createWebtoon8kVerticalSpec,
  encodeTileKey,
  escapeTileStreamingXml,
  getCoarseFallbackChain,
  getParentTileKey,
  getTileWorldBounds,
  parseTileKey,
  planViewportTilePrefetch,
  renderTileStreamingTelemetrySvg,
  selectTargetMipLevel,
  sha256TileStreamingHex,
  simulateCanvasPanZoomSession,
  summarizeTileStreamingSessionKo,
  validateVirtualTileAtlasWgsl,
  type ViewportCameraState,
} from "./index";

function makeViewport(overrides?: Partial<ViewportCameraState>): ViewportCameraState {
  return {
    scrollX: 160,
    scrollY: 1024,
    viewportWidthPx: 1280,
    viewportHeightPx: 720,
    zoom: 1.0,
    vxPxPerSec: 0,
    vyPxPerSec: 0,
    zoomVelocityPerSec: 0,
    ...overrides,
  };
}

describe("Wave 140 — 8K 타일 피라미드 주소 체계 및 MIP 선택기", () => {
  it("1600×64000px 8K 세로 웹툰의 MIP 0..4 타일 격자와 용량을 정확히 산출한다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const mip0 = computeMipGridDimensions(spec.pages[0], 0, spec.tileSizePx);
    const mip4 = computeMipGridDimensions(spec.pages[0], 4, spec.tileSizePx);
    const totals = computePyramidTotals(spec);

    expect(mip0.tilesX).toBe(7);
    expect(mip0.tilesY).toBe(250);
    expect(mip0.totalTiles).toBe(1750);
    expect(mip4.tilesX).toBe(1);
    expect(mip4.tilesY).toBe(16);
    expect(totals.perMipTileCounts).toEqual([1750, 500, 126, 32, 16]);
    expect(totals.mip0Bytes).toBe(1750 * 262144);
    expect(totals.coarseTopMipBytes).toBe(16 * 262144);
  });

  it("60페이지 8K 원고 멀티페이지 월드 오프셋과 총 높이를 일관되게 구성한다", () => {
    const spec = createMultiPage8kManuscriptSpec({ pageCount: 60, pageWidthPx: 4096, pageHeightPx: 5632, pageGapPx: 64 });
    expect(spec.pages).toHaveLength(60);
    expect(spec.pages[0].worldOffsetY).toBe(0);
    expect(spec.pages[1].worldOffsetY).toBe(5632 + 64);
    expect(spec.pages[59].pageIndex).toBe(59);
    expect(spec.totalWorldHeightPx).toBe(60 * 5632 + 59 * 64);
  });

  it("TileKey 직렬화·역직렬화 왕복이 정확하며 비정상 키를 거부한다", () => {
    const key = { pageIndex: 14, mipLevel: 2 as const, tx: 5, ty: 31 };
    expect(encodeTileKey(key)).toBe("p14:m2:x5:y31");
    expect(parseTileKey("p14:m2:x5:y31")).toEqual(key);
    expect(parseTileKey("p0:m5:x0:y0")).toBeNull();
    expect(parseTileKey("invalid-key")).toBeNull();
  });

  it("부모 타일 및 저해상도 폴백 조상 체인이 자식 타일 월드 영역을 완전히 포함한다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const leaf = { pageIndex: 0, mipLevel: 0 as const, tx: 5, ty: 19 };
    const leafBounds = getTileWorldBounds(spec, leaf);
    expect(getParentTileKey(leaf)).toEqual({ pageIndex: 0, mipLevel: 1, tx: 2, ty: 9 });

    const chain = getCoarseFallbackChain(leaf);
    expect(chain.map((k) => k.mipLevel)).toEqual([1, 2, 3, 4]);
    for (let i = 0; i < chain.length; i += 1) {
      const ancBounds = getTileWorldBounds(spec, chain[i]);
      expect(ancBounds.minX).toBeLessThanOrEqual(leafBounds.minX);
      expect(ancBounds.minY).toBeLessThanOrEqual(leafBounds.minY);
      expect(ancBounds.maxX).toBeGreaterThanOrEqual(leafBounds.maxX);
      expect(ancBounds.maxY).toBeGreaterThanOrEqual(leafBounds.maxY);
    }
    expect(getParentTileKey({ pageIndex: 0, mipLevel: 4, tx: 0, ty: 0 })).toBeNull();
  });

  it("줌 배율과 DPR에 따라 최적 MIP 0..4를 선택한다", () => {
    expect(selectTargetMipLevel(2.0).targetMipLevel).toBe(0);
    expect(selectTargetMipLevel(1.0).targetMipLevel).toBe(0);
    expect(selectTargetMipLevel(0.5).targetMipLevel).toBe(1);
    expect(selectTargetMipLevel(0.25).targetMipLevel).toBe(2);
    expect(selectTargetMipLevel(0.125).targetMipLevel).toBe(3);
    expect(selectTargetMipLevel(0.0625).targetMipLevel).toBe(4);
    expect(selectTargetMipLevel(0.5, { devicePixelRatio: 2.0 }).targetMipLevel).toBe(0);
  });

  it("줌 경계 히스테리시스 구간에서는 이전 MIP를 유지해 진동을 막는다", () => {
    const held = selectTargetMipLevel(0.47, { previousMipLevel: 0, hysteresisBand: 0.15 });
    expect(held.targetMipLevel).toBe(0);
    expect(held.hysteresisHeld).toBe(true);

    const switched = selectTargetMipLevel(0.41, { previousMipLevel: 0, hysteresisBand: 0.15 });
    expect(switched.targetMipLevel).toBe(1);
    expect(switched.hysteresisHeld).toBe(false);
  });

  it("mipBias 적용 및 비유한 입력(NaN/Infinity)에서도 안전하게 MIP를 산출한다", () => {
    const biased = selectTargetMipLevel(1.0, { mipBias: 2 });
    expect(biased.targetMipLevel).toBe(2);
    expect(biased.appliedMipBias).toBe(2);

    const safeNan = selectTargetMipLevel(Number.NaN, { devicePixelRatio: Number.POSITIVE_INFINITY });
    expect(Number.isFinite(safeNan.effectiveScale)).toBe(true);
    expect(safeNan.targetMipLevel).toBe(0);
  });
});

describe("Wave 140 — 뷰포트 운동학 프리페치 예측기(Look-ahead Frustum)", () => {
  it("정지 상태에서도 visible-critical → coarse-mip-fallback → predictive-prefetch 순으로 정렬한다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const plan = planViewportTilePrefetch(spec, makeViewport(), { frameIndex: 1 });
    expect(plan.visibleKeys.length).toBeGreaterThan(0);
    expect(plan.fallbackKeys.length).toBeGreaterThan(0);
    expect(plan.entries[0].priorityClass).toBe("visible-critical");
    const firstFallbackIdx = plan.entries.findIndex((e) => e.priorityClass === "coarse-mip-fallback");
    const firstPrefetchIdx = plan.entries.findIndex((e) => e.priorityClass === "predictive-prefetch");
    expect(firstFallbackIdx).toBeGreaterThan(0);
    if (firstPrefetchIdx >= 0) expect(firstFallbackIdx).toBeLessThan(firstPrefetchIdx);
  });

  it("하향 고속 플링(vy = +6000 px/s) 시 뷰포트 하단 진행 방향 타일만 선행 프리페치한다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const plan = planViewportTilePrefetch(spec, makeViewport({ scrollY: 8000, vyPxPerSec: 6000 }), { frameIndex: 5 });
    const currentCenterY = (plan.currentBoundsWorld.minY + plan.currentBoundsWorld.maxY) * 0.5;
    const prefetchEntries = plan.entries.filter((e) => e.priorityClass === "predictive-prefetch");
    expect(prefetchEntries.length).toBeGreaterThan(8);
    for (let i = 0; i < prefetchEntries.length; i += 1) {
      const bounds = prefetchEntries[i].worldBounds;
      expect((bounds.minY + bounds.maxY) * 0.5).toBeGreaterThan(currentCenterY);
      expect(prefetchEntries[i].motionAlignment).toBeGreaterThanOrEqual(-0.15);
    }
  });

  it("상향 역스크롤(vy = -4800 px/s) 시 상단 방향 타일로 프리페치 방향이 즉시 전환된다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const plan = planViewportTilePrefetch(spec, makeViewport({ scrollY: 20000, vyPxPerSec: -4800 }), { frameIndex: 9 });
    const currentCenterY = (plan.currentBoundsWorld.minY + plan.currentBoundsWorld.maxY) * 0.5;
    const prefetchEntries = plan.entries.filter((e) => e.priorityClass === "predictive-prefetch");
    expect(prefetchEntries.length).toBeGreaterThan(6);
    for (let i = 0; i < prefetchEntries.length; i += 1) {
      const bounds = prefetchEntries[i].worldBounds;
      expect((bounds.minY + bounds.maxY) * 0.5).toBeLessThan(currentCenterY);
    }
  });

  it("속도가 빨라질수록 선행 예측 시간창이 150ms에서 300ms까지 적응 확장된다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const idlePlan = planViewportTilePrefetch(spec, makeViewport({ vyPxPerSec: 0 }));
    const fastPlan = planViewportTilePrefetch(spec, makeViewport({ vyPxPerSec: 6000 }));
    expect(idlePlan.lookAheadMs).toBe(150);
    expect(fastPlan.lookAheadMs).toBe(300);
    expect(fastPlan.lookAheadMs).toBeGreaterThan(idlePlan.lookAheadMs);
  });

  it("급격한 핀치 줌아웃 시 미래 저해상도 MIP 타일을 선행 프리페치 큐에 포함한다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const plan = planViewportTilePrefetch(spec, makeViewport({ zoom: 1.0, zoomVelocityPerSec: -4.2 }));
    expect(plan.targetMipLevel).toBe(0);
    expect(plan.predictedMipLevel).toBeGreaterThan(plan.targetMipLevel);
    expect(
      plan.entries.some((e) => e.priorityClass === "predictive-prefetch" && e.key.mipLevel === plan.predictedMipLevel),
    ).toBe(true);
  });

  it("60페이지 원고 페이지 경계 부근에서 다음 페이지 타일까지 선행 프리페치한다", () => {
    const spec = createMultiPage8kManuscriptSpec({ pageCount: 60, pageWidthPx: 2048, pageHeightPx: 2560, pageGapPx: 64 });
    const plan = planViewportTilePrefetch(spec, makeViewport({ scrollX: 0, scrollY: 1850, vyPxPerSec: 4200 }));
    expect(plan.entries.some((e) => e.priorityClass === "predictive-prefetch" && e.key.pageIndex === 1)).toBe(true);
  });
});

describe("Wave 140 — VRAM 하드 캡·핀 보호 SLRU·Graceful LOD 불변량", () => {
  it("극한 2 MiB VRAM 고속 플링에서도 usedVramBytes <= vramBudgetBytes 및 OOM 0건을 지킨다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const tinyBudget = 2 * 1024 * 1024;
    const trajectory = buildCanvasPanZoomTrajectory({ spec, scenario: "high-speed-fling", targetFps: 60, frameCount: 45 });
    const result = simulateCanvasPanZoomSession({ spec, vramBudgetBytes: tinyBudget, targetFps: 60, trajectory });

    expect(result.invariants.vramHardCapRespected).toBe(true);
    expect(result.invariants.zeroOomEvents).toBe(true);
    expect(result.metrics.peakVramBytes).toBeLessThanOrEqual(tinyBudget);
    for (let i = 0; i < result.frames.length; i += 1) {
      expect(result.frames[i].usedVramBytes).toBeLessThanOrEqual(tinyBudget);
      expect(result.frames[i].oomEventCount).toBe(0);
    }
  });

  it("0바이트 및 타일 1장 미만 VRAM 예산에서도 초과 없이 무크래시 동작한다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const cache = new VramTileStreamingCache({ spec, vramBudgetBytes: 1024, targetFps: 60 });
    const frame = cache.stepFrame(makeViewport(), { frameIndex: 0 });
    expect(frame.usedVramBytes).toBe(0);
    expect(cache.auditInvariants().vramHardCapRespected).toBe(true);
  });

  it("미저장 Dirty 편집 타일은 극한 축출 압박·장거리 스크롤에서도 절대 축출되지 않는다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const cache = new VramTileStreamingCache({ spec, vramBudgetBytes: 12 * computeTileByteSize(), targetFps: 60 });
    const dirtyTargets = [
      { pageIndex: 0, mipLevel: 0 as const, tx: 1, ty: 2 },
      { pageIndex: 0, mipLevel: 0 as const, tx: 2, ty: 2 },
      { pageIndex: 0, mipLevel: 0 as const, tx: 3, ty: 2 },
    ];
    for (let i = 0; i < dirtyTargets.length; i += 1) {
      expect(cache.pinDirtyTile(dirtyTargets[i], 0).pinned).toBe(true);
    }
    for (let f = 1; f <= 35; f += 1) {
      cache.stepFrame(makeViewport({ scrollY: f * 1200, vyPxPerSec: 6000 }), { frameIndex: f });
      expect(cache.usedVramBytes).toBeLessThanOrEqual(cache.vramBudgetBytes);
      for (let i = 0; i < dirtyTargets.length; i += 1) {
        expect(cache.getEntry(encodeTileKey(dirtyTargets[i]))?.pinnedDirty).toBe(true);
      }
    }
    expect(cache.auditInvariants().zeroDirtyEvictions).toBe(true);
    expect(cache.auditInvariants().vramHardCapRespected).toBe(true);
  });

  it("저장 완료 후 unpinDirtyTile을 호출하면 해당 타일이 정상 축출 대상이 된다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const cache = new VramTileStreamingCache({ spec, vramBudgetBytes: 6 * computeTileByteSize(), targetFps: 60 });
    const key = { pageIndex: 0, mipLevel: 0 as const, tx: 0, ty: 0 };
    const keyId = encodeTileKey(key);
    expect(cache.pinDirtyTile(key, 0).pinned).toBe(true);
    expect(cache.unpinDirtyTile(keyId)).toBe(true);
    expect(cache.unpinDirtyTile(keyId)).toBe(false);

    for (let f = 1; f <= 15; f += 1) {
      cache.stepFrame(makeViewport({ scrollY: 16000 + f * 700, vyPxPerSec: 3000 }), { frameIndex: f });
    }
    expect(cache.dirtyPinnedCount).toBe(0);
    expect(cache.usedVramBytes).toBeLessThanOrEqual(cache.vramBudgetBytes);
  });

  it("모든 아틀라스 슬롯이 Dirty 핀으로 가득 찬 경우 추가 할당을 안전 보류해 기존 핀과 하드 캡을 지킨다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const cache = new VramTileStreamingCache({ spec, vramBudgetBytes: 3 * computeTileByteSize(), targetFps: 60 });
    expect(cache.pinDirtyTile({ pageIndex: 0, mipLevel: 0, tx: 0, ty: 0 }).pinned).toBe(true);
    expect(cache.pinDirtyTile({ pageIndex: 0, mipLevel: 0, tx: 1, ty: 0 }).pinned).toBe(true);
    expect(cache.pinDirtyTile({ pageIndex: 0, mipLevel: 0, tx: 2, ty: 0 }).pinned).toBe(true);

    const overflow = cache.pinDirtyTile({ pageIndex: 0, mipLevel: 0, tx: 3, ty: 0 });
    expect(overflow.pinned).toBe(false);
    expect(cache.dirtyPinnedCount).toBe(3);
    expect(cache.usedVramBytes).toBe(3 * computeTileByteSize());
    expect(cache.auditInvariants().zeroDirtyEvictions).toBe(true);
  });

  it("현재 가시 타일과 활성 폴백 조상 타일은 세션 내내 1건도 축출되지 않는다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const trajectory = buildCanvasPanZoomTrajectory({ spec, scenario: "combined-studio-stress", targetFps: 60, frameCount: 50 });
    const result = simulateCanvasPanZoomSession({ spec, vramBudgetBytes: 10 * 1024 * 1024, targetFps: 60, trajectory });
    expect(result.invariants.zeroVisibleEvictions).toBe(true);
    expect(result.invariants.zeroDirtyEvictions).toBe(true);
    expect(result.invariants.vramHardCapRespected).toBe(true);
  });

  it("과밀 VRAM 압박 시 Graceful LOD 다운그레이드(mipBias +1)가 자동 발동하고 압박 해소 후 복구한다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const cache = new VramTileStreamingCache({
      spec,
      vramBudgetBytes: 10 * computeTileByteSize(),
      targetFps: 60,
      lodRecoveryHysteresisFrames: 3,
    });
    const pressured = cache.stepFrame(makeViewport({ zoom: 1.0 }), { frameIndex: 1 });
    expect(pressured.gracefulLodDegradationTriggered).toBe(true);
    expect(pressured.effectiveMipBias).toBeGreaterThanOrEqual(1);
    expect(pressured.oomEventCount).toBe(0);
    expect(pressured.usedVramBytes).toBeLessThanOrEqual(cache.vramBudgetBytes);

    const initialBias = cache.effectiveMipBias;
    for (let f = 2; f <= 12; f += 1) {
      cache.stepFrame(makeViewport({ zoom: 2.5 }), { frameIndex: f });
    }
    expect(cache.effectiveMipBias).toBeLessThan(initialBias);
  });

  it("SLRU 스캔 저항성으로 일회성 프리페치(probation)가 반복 히트된 protected 타일보다 먼저 축출된다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const cache = new VramTileStreamingCache({ spec, vramBudgetBytes: 24 * computeTileByteSize(), targetFps: 60 });
    for (let f = 1; f <= 3; f += 1) {
      cache.stepFrame(makeViewport({ scrollY: 512, vyPxPerSec: 0 }), { frameIndex: f });
    }
    expect(cache.listResidentEntries().some((e) => e.segment === "protected" && e.key.mipLevel === 0)).toBe(true);

    cache.stepFrame(makeViewport({ scrollY: 12000, vyPxPerSec: 6000 }), { frameIndex: 4 });
    cache.stepFrame(makeViewport({ scrollY: 18000, vyPxPerSec: 6000 }), { frameIndex: 5 });
    expect(cache.listResidentEntries().some((e) => e.key.mipLevel === 4)).toBe(true);
    expect(cache.usedVramBytes).toBeLessThanOrEqual(cache.vramBudgetBytes);
  });

  it("페이지 테이블 스냅샷과 물리 아틀라스 슬롯 할당에 중복 슬롯이 0건이다", () => {
    const spec = createWebtoon8kVerticalSpec({ widthPx: 1024, heightPx: 2048 });
    const cache = new VramTileStreamingCache({ spec, vramBudgetBytes: 16 * computeTileByteSize(), targetFps: 60 });
    cache.stepFrame(makeViewport({ scrollX: 0, scrollY: 0, viewportWidthPx: 800, viewportHeightPx: 600 }), { frameIndex: 1 });
    const residents = cache.listResidentEntries();
    expect(new Set(residents.map((e) => e.atlasSlot.slotIndex)).size).toBe(residents.length);
    expect(cache.buildIndirectionTableSnapshot(0).filter((r) => r.resident).length).toBe(residents.length);
  });
});

describe("Wave 140 — 60fps/120fps 업로드 버짓 스로틀링 & 제로 블랭크 폴백", () => {
  it("60fps 고속 플링 세션에서 모든 프레임 업로드 <= 4.5ms, 프레임 타임 <= 16.67ms를 99% 이상 지킨다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const trajectory = buildCanvasPanZoomTrajectory({ spec, scenario: "high-speed-fling", targetFps: 60, frameCount: 60 });
    const result = simulateCanvasPanZoomSession({ spec, vramBudgetBytes: 96 * 1024 * 1024, targetFps: 60, trajectory });
    expect(result.metrics.maxUploadTimeMs).toBeLessThanOrEqual(DEFAULT_UPLOAD_BUDGET_60FPS_MS + 1e-6);
    expect(result.metrics.p99FrameTimeMs).toBeLessThanOrEqual(FRAME_BUDGET_60FPS_MS);
    expect(result.metrics.frameBudgetComplianceRatio).toBeGreaterThanOrEqual(0.99);
    expect(result.invariants.uploadBudgetRespected).toBe(true);
  });

  it("120fps 고속 플링 세션에서 모든 프레임 업로드 <= 2.2ms, 프레임 타임 <= 8.33ms를 99% 이상 지킨다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const trajectory = buildCanvasPanZoomTrajectory({ spec, scenario: "high-speed-fling", targetFps: 120, frameCount: 90 });
    const result = simulateCanvasPanZoomSession({ spec, vramBudgetBytes: 96 * 1024 * 1024, targetFps: 120, trajectory });
    expect(result.metrics.maxUploadTimeMs).toBeLessThanOrEqual(DEFAULT_UPLOAD_BUDGET_120FPS_MS + 1e-6);
    expect(result.metrics.p99FrameTimeMs).toBeLessThanOrEqual(FRAME_BUDGET_120FPS_MS);
    expect(result.metrics.frameBudgetComplianceRatio).toBeGreaterThanOrEqual(0.99);
    expect(result.invariants.uploadBudgetRespected).toBe(true);
  });

  it("콜드 스타트 첫 프레임부터 저해상도 MIP 폴백 체인으로 블랭크 체커보드를 0장으로 억제한다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const cache = new VramTileStreamingCache({ spec, vramBudgetBytes: 64 * 1024 * 1024, targetFps: 120 });
    const firstFrame = cache.stepFrame(makeViewport({ scrollY: 4096, vyPxPerSec: 6000 }), { frameIndex: 0 });
    expect(firstFrame.renderedBlankCount).toBe(0);
    expect(firstFrame.renderedExactCount + firstFrame.renderedFallbackCount).toBe(firstFrame.visibleTileCount);
    expect(firstFrame.uploadTimeMs).toBeLessThanOrEqual(DEFAULT_UPLOAD_BUDGET_120FPS_MS + 1e-6);
  });

  it("극소 업로드 버짓(0.85ms)에서도 상한을 엄수하며 남은 업로드를 안전하게 스로틀링한다", () => {
    const spec = createWebtoon8kVerticalSpec();
    const cache = new VramTileStreamingCache({ spec, vramBudgetBytes: 32 * 1024 * 1024, targetFps: 60, uploadBudgetMs: 0.85 });
    const frame = cache.stepFrame(makeViewport({ scrollY: 0, vyPxPerSec: 4000 }), { frameIndex: 0 });
    expect(frame.uploadTimeMs).toBeLessThanOrEqual(0.85 + 1e-6);
    expect(frame.throttledUploadCount).toBeGreaterThan(0);
    expect(frame.renderedBlankCount).toBe(0);
  });

  it("60페이지 8K 원고 장거리 스크롤에서도 VRAM 하드 캡·60fps 버짓·제로 블랭크를 동시 충족한다", () => {
    const spec = createMultiPage8kManuscriptSpec({ pageCount: 60 });
    const trajectory = buildCanvasPanZoomTrajectory({ spec, scenario: "high-speed-fling", targetFps: 60, frameCount: 50 });
    const result = simulateCanvasPanZoomSession({ spec, vramBudgetBytes: 128 * 1024 * 1024, targetFps: 60, trajectory });
    expect(result.invariants.vramHardCapRespected).toBe(true);
    expect(result.invariants.zeroOomEvents).toBe(true);
    expect(result.metrics.frameBudgetComplianceRatio).toBeGreaterThanOrEqual(0.99);
    expect(result.metrics.totalBlankTiles).toBe(0);
  });
});

describe("Wave 140 — Naive Reactive vs Wave 140 선행 프리페치 정량 대조", () => {
  it("정독 스크롤에서 Wave 140이 Naive 대비 높은 캐시 히트율과 블랭크 0을 달성한다", () => {
    const cmp = compareNaiveVsPredictiveTileStreaming({ scenario: "reading-scroll", targetFps: 60, frameCount: 45, vramBudgetBytes: 64 * 1024 * 1024 });
    expect(cmp.predictive.metrics.averageCacheHitRatio).toBeGreaterThan(cmp.naive.metrics.averageCacheHitRatio);
    expect(cmp.predictive.metrics.totalBlankTiles).toBe(0);
    expect(cmp.predictive.metrics.frameBudgetComplianceRatio).toBe(1);
  });

  it("초고속 6000px/s 플링(60fps)에서 Wave 140이 히트율·블랭크·P95/P99 모든 지표를 대폭 개선한다", () => {
    const cmp = compareNaiveVsPredictiveTileStreaming({ scenario: "high-speed-fling", targetFps: 60, frameCount: 60, vramBudgetBytes: 96 * 1024 * 1024 });
    expect(cmp.cacheHitRatioGain).toBeGreaterThan(0.05);
    expect(cmp.predictive.metrics.totalBlankTiles).toBe(0);
    expect(cmp.naive.metrics.totalBlankTiles).toBeGreaterThan(0);
    expect(cmp.p95FrameTimeImprovementMs).toBeGreaterThan(0);
    expect(cmp.p99FrameTimeImprovementMs).toBeGreaterThan(0);
    expect(cmp.predictive.metrics.frameBudgetComplianceRatio).toBeGreaterThanOrEqual(0.99);
    expect(cmp.predictiveDominatesAllMetrics).toBe(true);
  });

  it("급격한 핀치 줌(120fps)에서 Wave 140이 블랭크를 제거하고 8.33ms 버짓을 준수한다", () => {
    const cmp = compareNaiveVsPredictiveTileStreaming({ scenario: "rapid-pinch-zoom", targetFps: 120, frameCount: 72, vramBudgetBytes: 96 * 1024 * 1024 });
    expect(cmp.predictive.metrics.totalBlankTiles).toBe(0);
    expect(cmp.naive.metrics.totalBlankTiles).toBeGreaterThan(0);
    expect(cmp.predictive.metrics.p99FrameTimeMs).toBeLessThanOrEqual(FRAME_BUDGET_120FPS_MS);
    expect(cmp.predictive.metrics.frameBudgetComplianceRatio).toBeGreaterThanOrEqual(0.99);
    expect(cmp.predictiveDominatesAllMetrics).toBe(true);
  });

  it("복합 스튜디오 스트레스(플링+핀치+브러시 편집)에서 Wave 140이 전 지표 우위를 유지한다", () => {
    const cmp = compareNaiveVsPredictiveTileStreaming({ scenario: "combined-studio-stress", targetFps: 60, frameCount: 60, vramBudgetBytes: 64 * 1024 * 1024 });
    expect(cmp.predictiveDominatesAllMetrics).toBe(true);
    expect(cmp.predictive.invariants.zeroDirtyEvictions).toBe(true);
    expect(cmp.predictive.invariants.vramHardCapRespected).toBe(true);
    expect(cmp.comparisonSha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Wave 140 — WebGPU 가상 타일 페이지 테이블 WGSL 생성 및 검증", () => {
  it("기본 WGSL 아티팩트가 16B 정렬·바인딩 0..5·MIP 폴백 체인·진입점 검증을 모두 통과한다", () => {
    const artifact = buildVirtualTileAtlasWgsl();
    const validation = validateVirtualTileAtlasWgsl(artifact);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.uniformAligned16).toBe(true);
    expect(validation.bindingsFound).toEqual([0, 1, 2, 3, 4, 5]);
    expect(validation.entryPoints).toEqual(["cs_composite_virtual_tiles", "fs_composite_virtual_tiles"]);
    expect(validation.glslForbiddenHits).toEqual([]);
    expect(artifact.uniformStrideBytes % 16).toBe(0);
    expect(artifact.pageTableEntryStrideBytes).toBe(16);
  });

  it("커스텀 워크그룹·타일 크기를 반영하고 동일 옵션에 대해 결정론적 SHA-256을 반환한다", () => {
    const a = buildVirtualTileAtlasWgsl({ workgroupSizeX: 16, workgroupSizeY: 4, tileSizePx: 512 });
    const b = buildVirtualTileAtlasWgsl({ workgroupSizeX: 16, workgroupSizeY: 4, tileSizePx: 512 });
    expect(a.workgroupSize).toEqual([16, 4, 1]);
    expect(a.wgsl).toContain("@workgroup_size(16, 4, 1)");
    expect(a.wgsl).toContain("512.000000");
    expect(a.sha256Hex).toBe(b.sha256Hex);
    expect(validateVirtualTileAtlasWgsl(a).valid).toBe(true);
  });

  it("괄호 불균형 또는 NaN 비유한 수치가 주입된 WGSL을 실패로 판정한다", () => {
    const base = buildVirtualTileAtlasWgsl();
    const brokenBrace = validateVirtualTileAtlasWgsl(`${base.wgsl}\n{`);
    expect(brokenBrace.valid).toBe(false);
    expect(brokenBrace.errors.some((e) => e.includes("중괄호"))).toBe(true);

    const injectedNan = validateVirtualTileAtlasWgsl(
      base.wgsl.replace("HALF_TEXEL_INSET: f32 = 0.500000", "HALF_TEXEL_INSET: f32 = NaN"),
    );
    expect(injectedNan.valid).toBe(false);
    expect(injectedNan.errors.some((e) => e.includes("NaN"))).toBe(true);
  });

  it("16바이트 비정렬 유니폼 필드 또는 필수 바인딩 누락을 실패로 판정한다", () => {
    const base = buildVirtualTileAtlasWgsl();
    const unaligned = validateVirtualTileAtlasWgsl(base.wgsl.replace("fallback_bg_rgba: vec4<f32>,", "bad_scalar: f32,"));
    expect(unaligned.valid).toBe(false);
    expect(unaligned.uniformAligned16).toBe(false);

    const missingBinding = validateVirtualTileAtlasWgsl(
      base.wgsl.replace("@group(0) @binding(3) var t_tile_atlas: texture_2d_array<f32>;", ""),
    );
    expect(missingBinding.valid).toBe(false);
    expect(missingBinding.errors.some((e) => e.includes("@binding(3)"))).toBe(true);
  });

  it("GLSL 금지 토큰(gl_FragColor, #version, sampler2D, texture2D, bare vec4)을 정확히 차단한다", () => {
    const base = buildVirtualTileAtlasWgsl();
    const result = validateVirtualTileAtlasWgsl(`${base.wgsl}\n// #version 450\n// gl_FragColor = texture2D(sampler2D, vec4(1.0));`);
    expect(result.valid).toBe(false);
    expect(result.glslForbiddenHits).toContain("#version");
    expect(result.glslForbiddenHits).toContain("gl_FragColor");
    expect(result.glslForbiddenHits).toContain("sampler2D");
    expect(result.glslForbiddenHits).toContain("texture2D");
    expect(result.glslForbiddenHits).toContain("bare-vec-ctor");
  });
});

describe("Wave 140 — 순수 OKLCH SVG·XSS 이스케이프·한국어 QA 브리프 & SHA-256 결정론", () => {
  it("SVG 출력에 순수 oklch(...) 색상만 사용하고 원시 hex/rgb/hsl 및 NaN을 0건 유지한다", () => {
    const cmp = compareNaiveVsPredictiveTileStreaming({ scenario: "high-speed-fling", targetFps: 60, frameCount: 40, vramBudgetBytes: 64 * 1024 * 1024 });
    const svg = renderTileStreamingTelemetrySvg(cmp.predictive, { comparison: cmp });
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(/#[0-9a-fA-F]{3,8}\b/.test(svg)).toBe(false);
    expect(/\brgba?\s*\(/i.test(svg)).toBe(false);
    expect(/\bhsla?\s*\(/i.test(svg)).toBe(false);
    expect(/\b(?:NaN|Infinity|undefined)\b/.test(svg)).toBe(false);
  });

  it("SVG에 타일 히트맵, 16.67ms·8.33ms 버짓 선, VRAM 하드 캡 선, Naive 대조 패널을 모두 포함한다", () => {
    const cmp = compareNaiveVsPredictiveTileStreaming({ scenario: "rapid-pinch-zoom", targetFps: 120, frameCount: 36, vramBudgetBytes: 64 * 1024 * 1024 });
    const svg = renderTileStreamingTelemetrySvg(cmp.predictive, { comparison: cmp });
    expect(svg).toContain('id="panel-tile-heatmap"');
    expect(svg).toContain('id="panel-frame-timeline"');
    expect(svg).toContain('id="panel-vram-curve"');
    expect(svg).toContain('id="panel-naive-vs-predictive"');
    expect(svg).toContain("16.67ms");
    expect(svg).toContain("8.33ms");
    expect(svg).toContain("VRAM 하드 캡");
  });

  it("제목과 시나리오 라벨에 XSS 페이로드가 주입돼도 XML 이스케이프로 완전 차단한다", () => {
    const xssPayload = `<script>alert("xss")</script> & 'quoted'`;
    expect(escapeTileStreamingXml(xssPayload)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;quoted&apos;",
    );
    const cmp = compareNaiveVsPredictiveTileStreaming({ scenario: "reading-scroll", scenarioLabel: xssPayload, frameCount: 12 });
    const svg = renderTileStreamingTelemetrySvg(cmp.predictive, { titleOverrideKo: xssPayload, comparison: cmp });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  it("한국어 성능 엔지니어 QA 브리프가 번역투 없이 3대 불변량·비교 지표·SHA-256을 요약한다", () => {
    const cmp = compareNaiveVsPredictiveTileStreaming({ scenario: "high-speed-fling", targetFps: 60, frameCount: 40, vramBudgetBytes: 64 * 1024 * 1024 });
    const brief = summarizeTileStreamingSessionKo(cmp.predictive, { comparison: cmp, inspectedDateIso: "2026-11-28" });
    expect(brief).toContain("Wave 140 8K 타일 스트리밍 성능 QA 브리프");
    expect(brief).toContain("합격");
    expect(brief).toContain("2026-11-28");
    expect(brief).toContain("VRAM 하드 캡");
    expect(brief).toContain("Naive 반응형 로더 대비 Wave 140 개선 수치");
    expect(brief).toContain(cmp.predictive.sessionSha256Hex);
    expect(brief).not.toContain("가능하게 합니다");
    expect(brief).not.toContain("원활한 워크플로우");
  });

  it("순수 ES2017 SHA-256 NIST 표준 벡터와 세션 재실행 비트-동일 지문을 검증한다", () => {
    expect(sha256TileStreamingHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256TileStreamingHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

    const runA = compareNaiveVsPredictiveTileStreaming({ scenario: "high-speed-fling", targetFps: 60, frameCount: 30, vramBudgetBytes: 64 * 1024 * 1024 });
    const runB = compareNaiveVsPredictiveTileStreaming({ scenario: "high-speed-fling", targetFps: 60, frameCount: 30, vramBudgetBytes: 64 * 1024 * 1024 });
    expect(runA.comparisonSha256Hex).toBe(runB.comparisonSha256Hex);
    expect(runA.predictive.sessionSha256Hex).toBe(runB.predictive.sessionSha256Hex);
    expect(runA.predictive.invariants.stateSha256Hex).toBe(runB.predictive.invariants.stateSha256Hex);
  });
});
