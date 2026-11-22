import { describe, expect, it, vi } from "vitest";

import {
  StudioGpuNextRuntimeHub,
  formatStudioGpuNextTelemetrySummary,
} from "../render/gpu-next/gpu-next-runtime-bridge";

import {
  WEBGPU_DIRTY_TILE_APRON_PX,
  WEBGPU_DIRTY_TILE_BYTES_PER_PIXEL_RGBA16F,
  WEBGPU_DIRTY_TILE_BYTES_PER_PIXEL_RGBA8,
  WEBGPU_DIRTY_TILE_SIZE_PX,
  WebGpuDirtyTilePyramidCache,
  WebGpuMemoryFailSafeGuard,
  computeMaxResidentTilesFromVramProfile,
  computeTileApronBounds,
  evictIdleOffscreenTiles,
  formatDirtyTileKey,
  planVisibleCutTilePrefetch,
  type DirtyTileCutBand,
  type DirtyTileRect,
  type DirtyTileRotationDegrees,
  type DirtyTileSwapDescriptor,
  type DirtyTileSwapInDescriptor,
  type TileApronBounds,
} from "./index";

const MB = 1024 * 1024;
const VERTICAL_WEBTOON_CANVAS = Object.freeze({ width: 800, height: 20_000 });
const ALL_ROTATIONS: readonly DirtyTileRotationDegrees[] = [0, 90, 180, 270];

function rectOverlapWidth(a: DirtyTileRect, b: DirtyTileRect): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
}

function rectOverlapHeight(a: DirtyTileRect, b: DirtyTileRect): number {
  return Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function assertDisplaySeamSealed(a: TileApronBounds, b: TileApronBounds): void {
  const coreA = a.transformedCoreRect;
  const coreB = b.transformedCoreRect;
  const apronA = a.transformedApronRect;
  const apronB = b.transformedApronRect;

  // 본체(core) 영역은 표시 공간에서 겹침 없이 정확히 한 변이 맞닿아야 한다.
  expect(rectOverlapWidth(coreA, coreB) * rectOverlapHeight(coreA, coreB)).toBe(0);

  const aLeftOfB = coreA.x + coreA.width === coreB.x && coreA.y === coreB.y && coreA.height === coreB.height;
  const bLeftOfA = coreB.x + coreB.width === coreA.x && coreA.y === coreB.y && coreA.height === coreB.height;
  const aAboveB = coreA.y + coreA.height === coreB.y && coreA.x === coreB.x && coreA.width === coreB.width;
  const bAboveA = coreB.y + coreB.height === coreA.y && coreA.x === coreB.x && coreA.width === coreB.width;

  expect(aLeftOfB || bLeftOfA || aAboveB || bAboveA).toBe(true);

  if (aLeftOfB) {
    expect(a.transformedInsets.right).toBe(1);
    expect(b.transformedInsets.left).toBe(1);
    expect(rectOverlapWidth(apronA, apronB)).toBe(2);
  } else if (bLeftOfA) {
    expect(b.transformedInsets.right).toBe(1);
    expect(a.transformedInsets.left).toBe(1);
    expect(rectOverlapWidth(apronA, apronB)).toBe(2);
  } else if (aAboveB) {
    expect(a.transformedInsets.bottom).toBe(1);
    expect(b.transformedInsets.top).toBe(1);
    expect(rectOverlapHeight(apronA, apronB)).toBe(2);
  } else if (bAboveA) {
    expect(b.transformedInsets.bottom).toBe(1);
    expect(a.transformedInsets.top).toBe(1);
    expect(rectOverlapHeight(apronA, apronB)).toBe(2);
  }
}

function buildTenCutWebtoonBands(): readonly DirtyTileCutBand[] {
  return Array.from({ length: 10 }, (_, index) => ({
    cutId: `cut-${index}`,
    y: index * 2000,
    height: 2000,
  }));
}

describe("WebGPU 256×256px Dirty-Tile Pyramid LRU 캐시 & 1px Overlap Apron 봉합 엔진", () => {
  it("1px Overlap Apron이 0°/90°/180°/270° 회전 및 좌우/상하 반전 16조합 전체에서 타일 경계 솔기를 봉합한다", () => {
    expect(WEBGPU_DIRTY_TILE_SIZE_PX).toBe(256);
    expect(WEBGPU_DIRTY_TILE_APRON_PX).toBe(1);

    // 800×20,000px 비정수배 타일 격자(4열×79행, 끝열 32px · 끝행 32px) 검증
    const adjacentPairs: readonly [readonly [number, number], readonly [number, number]][] = [
      [[0, 0], [1, 0]], // 상단 외곽 + 내부 수평 경계
      [[1, 10], [2, 10]], // 완전 내부 수평 경계
      [[2, 78], [3, 78]], // 하단 끝행(32px) + 우측 끝열(32px) 수평 경계
      [[1, 0], [1, 1]], // 상단 외곽 + 내부 수직 경계
      [[1, 77], [1, 78]], // 하단 끝행(32px) 수직 경계
      [[3, 77], [3, 78]], // 우측 끝열(32px) + 하단 끝행(32px) 수직 경계
    ];

    for (const rotationDegrees of ALL_ROTATIONS) {
      for (const flipX of [false, true]) {
        for (const flipY of [false, true]) {
          const transform = { rotationDegrees, flipX, flipY };
          for (const [[c1, r1], [c2, r2]] of adjacentPairs) {
            const tileA = computeTileApronBounds({
              col: c1,
              row: r1,
              canvasWidth: VERTICAL_WEBTOON_CANVAS.width,
              canvasHeight: VERTICAL_WEBTOON_CANVAS.height,
              transform,
            });
            const tileB = computeTileApronBounds({
              col: c2,
              row: r2,
              canvasWidth: VERTICAL_WEBTOON_CANVAS.width,
              canvasHeight: VERTICAL_WEBTOON_CANVAS.height,
              transform,
            });

            expect(tileA.isEmpty).toBe(false);
            expect(tileB.isEmpty).toBe(false);
            assertDisplaySeamSealed(tileA, tileB);

            for (const tile of [tileA, tileB]) {
              // 면적 보존 및 변환 캔버스 범위 클램프 검증
              expect(tile.transformedCoreRect.width * tile.transformedCoreRect.height).toBe(
                tile.coreRect.width * tile.coreRect.height,
              );
              expect(tile.transformedApronRect.width * tile.transformedApronRect.height).toBe(
                tile.apronRect.width * tile.apronRect.height,
              );
              expect(tile.transformedApronRect.x).toBeGreaterThanOrEqual(0);
              expect(tile.transformedApronRect.y).toBeGreaterThanOrEqual(0);
              expect(tile.transformedApronRect.x + tile.transformedApronRect.width).toBeLessThanOrEqual(
                tile.transformedCanvasWidth,
              );
              expect(tile.transformedApronRect.y + tile.transformedApronRect.height).toBeLessThanOrEqual(
                tile.transformedCanvasHeight,
              );

              // 표시 외곽 경계에서는 apron이 0으로 클램프되어야 한다.
              if (tile.transformedCoreRect.x === 0) expect(tile.transformedInsets.left).toBe(0);
              if (tile.transformedCoreRect.y === 0) expect(tile.transformedInsets.top).toBe(0);
              if (tile.transformedCoreRect.x + tile.transformedCoreRect.width === tile.transformedCanvasWidth) {
                expect(tile.transformedInsets.right).toBe(0);
              }
              if (tile.transformedCoreRect.y + tile.transformedCoreRect.height === tile.transformedCanvasHeight) {
                expect(tile.transformedInsets.bottom).toBe(0);
              }

              // 쿼드 네 꼭짓점 UV가 본체 {u0, u1}×{v0, v1} 네 꼭짓점에 1:1 매핑되어야 한다.
              const corners = [
                tile.uvCorners.topLeft,
                tile.uvCorners.topRight,
                tile.uvCorners.bottomRight,
                tile.uvCorners.bottomLeft,
              ];
              const distinctKeys = new Set(corners.map((pt) => `${pt.u.toFixed(6)},${pt.v.toFixed(6)}`));
              expect(distinctKeys.size).toBe(4);
              for (const pt of corners) {
                expect(pt.u).toBeGreaterThanOrEqual(0);
                expect(pt.u).toBeLessThanOrEqual(1);
                expect(pt.v).toBeGreaterThanOrEqual(0);
                expect(pt.v).toBeLessThanOrEqual(1);
              }
              expect(tile.sampleClampUv.minU).toBeLessThanOrEqual(tile.sampleClampUv.maxU);
              expect(tile.sampleClampUv.minV).toBeLessThanOrEqual(tile.sampleClampUv.maxV);
            }
          }
        }
      }
    }

    // 범위 밖 좌표 및 1×1 초소형 캔버스 경계 방어 검증
    expect(
      computeTileApronBounds({ col: -1, row: 0, canvasWidth: 800, canvasHeight: 20_000 }).isEmpty,
    ).toBe(true);
    expect(
      computeTileApronBounds({ col: 4, row: 0, canvasWidth: 800, canvasHeight: 20_000 }).isEmpty,
    ).toBe(true);
    const tiny = computeTileApronBounds({ col: 0, row: 0, canvasWidth: 1, canvasHeight: 1 });
    expect(tiny.isEmpty).toBe(false);
    expect(tiny.sampleClampUv.minU).toBe(0.5);
    expect(tiny.sampleClampUv.maxU).toBe(0.5);
  });

  it("dirtyRect 부분 마킹·부분 커밋과 경계 1px 인접 apron 동기 무효화가 정확히 동작한다", () => {
    let clockMs = 1_000;
    const cache = new WebGpuDirtyTilePyramidCache({
      canvas: VERTICAL_WEBTOON_CANVAS,
      maxMipLevels: 4,
      now: () => clockMs,
    });

    // 1) 타일 내부 작은 브러시 스트로크 → mip 0에서는 (0, 19) 단 1개 타일만 마킹(316개 중 1개)
    const innerMark = cache.markDirtyRect({
      rect: { x: 40, y: 19 * 256 + 30, width: 32, height: 24 },
      includeMipLevels: [0],
    });
    expect(innerMark.affectedTileKeys).toEqual([
      formatDirtyTileKey({ layerId: "base", mipLevel: 0, col: 0, row: 19 }),
    ]);

    const firstCommit = cache.commitDirtyTiles({ mipLevels: [0] });
    expect(firstCommit.committedTiles).toHaveLength(1);
    expect(firstCommit.committedTiles[0].uploadSubRect.width).toBe(32);
    expect(firstCommit.committedTiles[0].uploadSubRect.height).toBe(24);
    expect(firstCommit.committedBytes).toBe(32 * 24 * WEBGPU_DIRTY_TILE_BYTES_PER_PIXEL_RGBA8);
    expect(firstCommit.committedBytes).toBeLessThan(firstCommit.committedTiles[0].tileByteSize / 40);

    // 추가 수정 없이 재커밋 시 clean 타일은 건너뛴다.
    const cleanCommit = cache.commitDirtyTiles({ mipLevels: [0] });
    expect(cleanCommit.committedTiles).toHaveLength(0);
    expect(cleanCommit.skippedCleanTileCount).toBe(1);

    // 2) 타일 경계 x=255에 1px 스트로크 → 본체 (0,0)과 인접 apron (1,0)이 모두 무효화된다.
    clockMs += 50;
    const seamMark = cache.markDirtyRect({
      rect: { x: 255, y: 100, width: 1, height: 16 },
      includeMipLevels: [0],
    });
    expect(seamMark.affectedTileKeys).toEqual([
      formatDirtyTileKey({ layerId: "base", mipLevel: 0, col: 0, row: 0 }),
      formatDirtyTileKey({ layerId: "base", mipLevel: 0, col: 1, row: 0 }),
    ]);

    const seamCommit = cache.commitDirtyTiles({
      mipLevels: [0],
      transform: { rotationDegrees: 90, flipX: false, flipY: false },
    });
    expect(seamCommit.committedTiles).toHaveLength(2);
    // 인접 타일 (1,0)의 업로드 서브렉트는 좌측 apron(localX=0, width=1)만 부분 갱신한다.
    const rightTileCommit = seamCommit.committedTiles.find((entry) => entry.coord.col === 1);
    expect(rightTileCommit?.uploadSubRect.localX).toBe(0);
    expect(rightTileCommit?.uploadSubRect.width).toBe(1);
    expect(rightTileCommit?.apronBounds.transformedInsets.top).toBe(1);

    // 3) 피라미드 전체 mip(0..3) 전파 검증
    const pyramidMark = cache.markDirtyRect({
      rect: { x: 100, y: 500, width: 20, height: 20 },
      includeMipLevels: true,
    });
    expect(pyramidMark.mipLevelsTouched).toEqual([0, 1, 2, 3]);
    cache.dispose();
  });

  it("WebGpuMemoryFailSafeGuard VRAM 프로필과 maxResidentTiles 상한·압박 퇴거가 연동된다", () => {
    const nominalCap = computeMaxResidentTilesFromVramProfile({
      budgetBytes: 64 * MB,
      tier: "nominal",
      bytesPerPixel: WEBGPU_DIRTY_TILE_BYTES_PER_PIXEL_RGBA8,
    });
    const warningCap = computeMaxResidentTilesFromVramProfile({
      budgetBytes: 64 * MB,
      tier: "warning-scale-down",
      bytesPerPixel: WEBGPU_DIRTY_TILE_BYTES_PER_PIXEL_RGBA8,
    });
    const hdrCap = computeMaxResidentTilesFromVramProfile({
      budgetBytes: 64 * MB,
      tier: "nominal",
      bytesPerPixel: WEBGPU_DIRTY_TILE_BYTES_PER_PIXEL_RGBA16F,
    });
    expect(warningCap).toBe(Math.floor(nominalCap * 0.5));
    expect(hdrCap).toBeLessThan(nominalCap);

    let clockMs = 10_000;
    const swappedOut: DirtyTileSwapDescriptor[] = [];
    const guard = new WebGpuMemoryFailSafeGuard({
      budgetBytes: 20 * MB,
      now: () => clockMs,
    });
    const cache = new WebGpuDirtyTilePyramidCache({
      canvas: VERTICAL_WEBTOON_CANVAS,
      vramGuard: guard,
      maxResidentTiles: 24,
      now: () => clockMs,
      swapAdapter: {
        onSwapOut: (desc) => swappedOut.push(desc),
      },
    });

    expect(cache.getEffectiveMaxResidentTiles()).toBe(24);

    // 5행 내부 영역(y=0..1278, row 5의 상단 1px apron 미침범) → 5행×4열 = 20개 타일 커밋
    cache.markDirtyRect({
      rect: { x: 0, y: 0, width: 800, height: 256 * 5 - 2 },
      includeMipLevels: [0],
    });
    const batch = cache.commitDirtyTiles({ mipLevels: [0] });
    expect(batch.residentTileCount).toBe(20);
    expect(guard.getSnapshot().textureBytes).toBe(batch.residentBytes);

    // 외부 고정 버퍼 18MB 할당 → VRAM 90%(warning-scale-down) 도달 → 상한이 절반(12)으로 축소되고 자동 정합화 퇴거
    clockMs += 1_000;
    guard.trackAllocation({ id: "external-pinned-buffer", kind: "buffer", bytes: 18 * MB, pinned: true });
    expect(guard.getSnapshot().tier).toBe("warning-scale-down");
    expect(cache.getEffectiveMaxResidentTiles()).toBe(12);
    expect(cache.getSnapshot().residentTileCount).toBeLessThanOrEqual(12);
    expect(swappedOut.length).toBeGreaterThanOrEqual(8);

    // dispose 시 캐시 타일 VRAM 할당이 누수 없이 0으로 해제된다.
    cache.dispose();
    expect(guard.getSnapshot().textureBytes).toBe(0);
    guard.dispose();
  });

  it("800×20,000px 세로 원고에서 가시 컷 ±1컷 프리페치 우선순위와 비가시 유휴 OPFS/슬립 스왑이 동작한다", () => {
    const cuts = buildTenCutWebtoonBands();
    const downPlan = planVisibleCutTilePrefetch({
      canvas: VERTICAL_WEBTOON_CANVAS,
      viewport: { x: 0, y: 8_200, width: 800, height: 1_000 }, // cut-4 내부
      cuts,
      cutMargin: 1,
      scrollVelocityY: 24,
    });

    expect(downPlan.visibleCutIds).toEqual(["cut-4"]);
    expect(downPlan.prefetchCutIds).toEqual(["cut-3", "cut-5"]);
    expect(downPlan.visibleTiles.length).toBeGreaterThan(0);
    expect(downPlan.prefetchTiles.length).toBeGreaterThan(0);
    // visibleTiles와 prefetchTiles 간 중복 키가 없어야 하며, 하향 스크롤 시 cut-5(+1컷)가 cut-3(-1컷)보다 먼저 온다.
    const visibleKeys = new Set(downPlan.visibleTiles.map((t) => t.key));
    expect(downPlan.prefetchTiles.every((t) => !visibleKeys.has(t.key))).toBe(true);
    expect(downPlan.prefetchTiles[0].cutId).toBe("cut-5");

    const upPlan = planVisibleCutTilePrefetch({
      canvas: VERTICAL_WEBTOON_CANVAS,
      viewport: { x: 0, y: 8_200, width: 800, height: 1_000 },
      cuts,
      cutMargin: 1,
      scrollVelocityY: -24,
    });
    expect(upPlan.prefetchTiles[0].cutId).toBe("cut-3");

    // 비가시 유휴 퇴거 순수 함수 검증: 보호(±1컷)·pinned 보호, 미저장 타일은 opfs-cold-store, 저장 완료 타일은 sleep-discard-clean
    const swapOutLog: DirtyTileSwapDescriptor[] = [];
    const swapInLog: DirtyTileSwapInDescriptor[] = [];
    let clockMs = 1_000;
    const cache = new WebGpuDirtyTilePyramidCache({
      canvas: VERTICAL_WEBTOON_CANVAS,
      maxResidentTiles: 128,
      defaultIdleEvictMs: 5_000,
      now: () => clockMs,
      swapAdapter: {
        onSwapOut: (desc) => swapOutLog.push(desc),
        onSwapIn: (desc) => swapInLog.push(desc),
      },
    });

    // cut-0 (y: 0..512)와 cut-4 (y: 8000..9000)에 타일 커밋
    cache.markDirtyRect({ rect: { x: 0, y: 0, width: 800, height: 512 }, includeMipLevels: [0] });
    const cut0Batch = cache.commitDirtyTiles({ mipLevels: [0] });
    // cut-0 첫 타일만 이미 OPFS 저장 완료로 표시
    const persistedKey = cut0Batch.committedTiles[0].tileKey;
    cache.markTilePersisted(persistedKey);

    clockMs += 10_000;
    cache.markDirtyRect({ rect: { x: 0, y: 8_200, width: 800, height: 1_000 }, includeMipLevels: [0] });
    cache.commitDirtyTiles({ mipLevels: [0] });

    // cut-4 뷰포트 프리페치 동기화 → cut-0 비가시 유휴 타일(경과 10초 >= 5초)은 퇴거, cut-4 타일은 히트 보호
    const syncAtCut4 = cache.applyVisibleCutPrefetch(
      { viewport: { x: 0, y: 8_200, width: 800, height: 1_000 }, cuts, cutMargin: 1 },
      { idleThresholdMs: 5_000 },
    );
    expect(syncAtCut4.residentHitKeys.length).toBeGreaterThan(0);
    expect(syncAtCut4.evictedDescriptors.length).toBe(cut0Batch.committedTiles.length);
    const persistedDesc = syncAtCut4.evictedDescriptors.find((d) => d.tileKey === persistedKey);
    const unpersistedDesc = syncAtCut4.evictedDescriptors.find((d) => d.tileKey !== persistedKey);
    expect(persistedDesc?.target).toBe("sleep-discard-clean");
    expect(persistedDesc?.requiresPersist).toBe(false);
    expect(unpersistedDesc?.target).toBe("opfs-cold-store");
    expect(unpersistedDesc?.requiresPersist).toBe(true);
    expect(unpersistedDesc?.opfsPath).toMatch(/^tiles\/base\/m0\/\d+_\d+_r\d+\.tile$/u);
    expect(swapOutLog.length).toBe(syncAtCut4.evictedDescriptors.length);

    // 다시 cut-0으로 스크롤 복귀 → OPFS에 스왑아웃되었던 타일들이 swap-in 디스크립터로 복원된다.
    clockMs += 1_000;
    const syncBackCut0 = cache.applyVisibleCutPrefetch(
      { viewport: { x: 0, y: 0, width: 800, height: 512 }, cuts, cutMargin: 1 },
      { evictOffscreen: false },
    );
    expect(syncBackCut0.swapInDescriptors.length).toBe(cut0Batch.committedTiles.length - 1);
    expect(swapInLog.length).toBe(syncBackCut0.swapInDescriptors.length);

    // 순수 함수 evictIdleOffscreenTiles 직접 호출 시 pinned 보호 검증
    const directEvict = evictIdleOffscreenTiles({
      tiles: [
        {
          tileKey: "base@m0:0,0",
          coord: { layerId: "base", mipLevel: 0, col: 0, row: 0 },
          coreRect: { x: 0, y: 0, width: 256, height: 256 },
          apronRect: { x: 0, y: 0, width: 257, height: 257 },
          byteSize: 257 * 257 * 4,
          revision: 2,
          persistedRevision: 1,
          dirty: false,
          pinned: true,
          lastUsedAtMs: 0,
        },
      ],
      protectedTileKeys: new Set(),
      nowMs: 60_000,
      idleThresholdMs: 1_000,
    });
    expect(directEvict).toHaveLength(0);
    cache.dispose();
  });

  it("100타일 벤치마크: 800×20,000px 세로 캔버스 160타일 부분 갱신·LRU 퇴거 및 런타임 허브 통합을 검증한다", () => {
    let clockMs = 1_000;
    const swapOutSpy = vi.fn();
    const hub = new StudioGpuNextRuntimeHub({
      device: null,
      autoStartWarmup: false,
      vramFailSafe: { budgetBytes: 128 * MB, now: () => clockMs },
      dirtyTilePyramid: {
        canvas: VERTICAL_WEBTOON_CANVAS,
        maxResidentTiles: 64,
        now: () => clockMs,
        swapAdapter: { onSwapOut: swapOutSpy },
      },
    });

    const cuts = buildTenCutWebtoonBands();
    const startMs = performance.now();

    // 40개 세로 행 × 4열 = 160개(>= 100타일) mip-0 타일을 순차 스크롤·드로잉하며 부분 갱신한다.
    let totalCommitted = 0;
    let totalEvicted = 0;
    for (let row = 0; row < 40; row += 1) {
      clockMs += 16;
      const y = row * WEBGPU_DIRTY_TILE_SIZE_PX + 12;
      hub.markCanvasDirtyRect({
        rect: { x: 8, y, width: 784, height: 32 },
        includeMipLevels: [0],
      });
      const batch = hub.commitDirtyTiles({
        mipLevels: [0],
        transform: { rotationDegrees: 270, flipX: true, flipY: false },
      });
      totalCommitted += batch.committedTiles.length;
      totalEvicted += batch.evictedDescriptors.length;
      // 상주 타일 수는 항상 maxResidentTiles(64) 이하로 엄격히 제한된다.
      expect(batch.residentTileCount).toBeLessThanOrEqual(64);
    }

    const elapsedMs = performance.now() - startMs;
    expect(totalCommitted).toBe(160);
    expect(totalEvicted).toBe(96);
    expect(swapOutSpy).toHaveBeenCalledTimes(96);
    expect(elapsedMs).toBeLessThan(2_000);

    // 가장 오래된 초반 행(row 0)은 스왑아웃되고, 최근 행(row 39)은 상주 상태여야 한다.
    const oldestTile = hub.dirtyTilePyramid.getTileState(
      formatDirtyTileKey({ layerId: "base", mipLevel: 0, col: 0, row: 0 }),
    );
    const newestTile = hub.dirtyTilePyramid.getTileState(
      formatDirtyTileKey({ layerId: "base", mipLevel: 0, col: 0, row: 39 }),
    );
    expect(oldestTile?.residency).toBe("swapped-out");
    expect(newestTile?.residency).toBe("resident");

    // 런타임 허브 프리페치·apron·유휴 퇴거·텔레메트리 스냅샷 통합 검증
    const nearPlan = hub.planVisibleCutPrefetch({
      viewport: { x: 0, y: 9_600, width: 800, height: 800 }, // cut-4 (±1컷: cut-3..cut-5 = y 6000..12000)
      cuts,
    });
    expect(nearPlan.visibleCutIds).toContain("cut-4");
    const apron = hub.computeTileApron({
      col: 1,
      row: 39,
      canvasWidth: 800,
      canvasHeight: 20_000,
      transform: { rotationDegrees: 180, flipY: true },
    });
    expect(apron.transformedInsets).toEqual({ left: 1, top: 1, right: 1, bottom: 1 });

    // 상주 64타일(row 24..39, y 6144..10240)은 cut-3..cut-5 보호 영역 안이므로 0건 퇴거
    clockMs += 30_000;
    const protectedCheck = hub.evictIdlePyramidTiles(nearPlan.protectedTileKeys, {
      nowMs: clockMs,
      idleThresholdMs: 15_000,
    });
    expect(protectedCheck).toHaveLength(0);

    // cut-0으로 스크롤 이동(보호 영역 cut-0..cut-1 = y 0..4000) → 비가시 유휴 64타일 전원 OPFS 스왑 퇴거
    const farPlan = hub.planVisibleCutPrefetch({
      viewport: { x: 0, y: 0, width: 800, height: 800 },
      cuts,
    });
    const idleEvicted = hub.evictIdlePyramidTiles(farPlan.protectedTileKeys, {
      nowMs: clockMs,
      idleThresholdMs: 15_000,
    });
    expect(idleEvicted).toHaveLength(64);

    const diagSnap = hub.getDiagnosticsSnapshot();
    expect(diagSnap.dirtyTilePyramid.totalCommittedTiles).toBe(160);
    expect(diagSnap.dirtyTilePyramid.totalEvictedTiles).toBe(96 + 64);
    const summary = formatStudioGpuNextTelemetrySummary(diagSnap);
    expect(summary).toContain("rgba16float");
    expect(summary).toContain("타일 ");

    hub.dispose();
    expect(hub.vramGuard.getSnapshot().usedBytes).toBe(0);
  });
});
