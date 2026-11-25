// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATLAS_GRID_COLS,
  ATLAS_GRID_ROWS,
  GIGA_CANVAS_PRESETS,
  HARD_WATERMARK_PCT,
  MAX_MIP_LEVEL,
  MEMORY_BUDGET_PROFILES,
  SOFT_WATERMARK_PCT,
  StudioGigaCanvasSwapPanel,
  VIRTUAL_TILE_SIZE,
  compressTileRleDelta,
  computeFnv1a32,
  computeMipPyramid,
  createInMemorySwapSlotPool,
  decodeMorton2D,
  decompressTileRleDelta,
  encodeMorton2D,
  evaluateGigaCanvasSwapState,
  exportGigaCanvasSwapJson,
  formatFnv1aHex,
  generateSyntheticTileBuffer,
  getGigaCanvasPreset,
  getMemoryBudgetProfile,
  selectMipLevelForZoom,
  verifyTileSwapRoundTrip,
  type GigaCanvasPresetId,
  type MemoryBudgetGb,
} from "./index";

afterEach(cleanup);

const ALL_PRESET_IDS: readonly GigaCanvasPresetId[] = [
  "webtoon-100cut-scroll",
  "ultra-16k-illustration",
  "hdr-32k-cover",
  "print-4k-60layers",
];

const ALL_BUDGETS: readonly MemoryBudgetGb[] = [1.5, 4, 8, 16];

describe("1. 초거대 캔버스 프리셋 · 기기 메모리 예산 · MIP 0..6 피라미드", () => {
  it("4종 초거대 프리셋이 요구 ID·해상도·레이어·비트심도·색공간을 정확히 정의한다", () => {
    expect(GIGA_CANVAS_PRESETS).toHaveLength(4);
    expect(GIGA_CANVAS_PRESETS.map((p) => p.id)).toEqual(ALL_PRESET_IDS);
    expect(getGigaCanvasPreset("webtoon-100cut-scroll")).toMatchObject({ widthPx: 800, heightPx: 120000, layerCount: 12 });
    expect(getGigaCanvasPreset("ultra-16k-illustration")).toMatchObject({ widthPx: 16384, heightPx: 16384, layerCount: 24, colorSpace: "Display-P3" });
    expect(getGigaCanvasPreset("hdr-32k-cover")).toMatchObject({ widthPx: 32768, heightPx: 32768, layerCount: 8, bitDepth: 16, bytesPerPixel: 8 });
    expect(getGigaCanvasPreset("print-4k-60layers")).toMatchObject({ widthPx: 4096, heightPx: 6144, layerCount: 60, dpi: 300 });
  });

  it("4종 기기 메모리 예산(1.5/4/8/16GiB)과 78% Soft / 90% Hard 워터마크가 정확히 설정된다", () => {
    expect(MEMORY_BUDGET_PROFILES.map((b) => b.budgetGb)).toEqual(ALL_BUDGETS);
    expect(SOFT_WATERMARK_PCT).toBe(78);
    expect(HARD_WATERMARK_PCT).toBe(90);
    for (const profile of MEMORY_BUDGET_PROFILES) {
      expect(profile.softWatermarkPct).toBe(78);
      expect(profile.hardWatermarkPct).toBe(90);
      expect(profile.vramCapMiB).toBeGreaterThan(0);
      expect(profile.ramCapMiB).toBeGreaterThan(profile.vramCapMiB);
    }
    expect(getMemoryBudgetProfile(1.5).labelKo).toContain("1.5GiB iPad Safari");
  });

  it("getGigaCanvasPreset과 getMemoryBudgetProfile이 모든 유효 ID·예산을 조회한다", () => {
    for (const id of ALL_PRESET_IDS) expect(getGigaCanvasPreset(id).id).toBe(id);
    for (const gb of ALL_BUDGETS) expect(getMemoryBudgetProfile(gb).budgetGb).toBe(gb);
  });

  it("selectMipLevelForZoom이 5~1600% 줌 구간에서 MIP 0..6 전 레벨을 단조 매핑한다", () => {
    expect(selectMipLevelForZoom(1600)).toBe(0);
    expect(selectMipLevelForZoom(100)).toBe(0);
    expect(selectMipLevelForZoom(50)).toBe(1);
    expect(selectMipLevelForZoom(25)).toBe(2);
    expect(selectMipLevelForZoom(13)).toBe(3);
    expect(selectMipLevelForZoom(8)).toBe(4);
    expect(selectMipLevelForZoom(6)).toBe(5);
    expect(selectMipLevelForZoom(5)).toBe(6);
  });

  it("selectMipLevelForZoom이 비유한·범위 밖 입력을 안전하게 클램프한다", () => {
    expect(selectMipLevelForZoom(Number.NaN)).toBe(MAX_MIP_LEVEL);
    expect(selectMipLevelForZoom(Number.NEGATIVE_INFINITY)).toBe(MAX_MIP_LEVEL);
    expect(selectMipLevelForZoom(-50)).toBe(MAX_MIP_LEVEL);
    expect(selectMipLevelForZoom(99999)).toBe(0);
  });

  it("computeMipPyramid가 모든 프리셋에서 256px 타일 기반 MIP 0..6 7단 격자를 계산한다", () => {
    expect(VIRTUAL_TILE_SIZE).toBe(256);
    for (const preset of GIGA_CANVAS_PRESETS) {
      const pyramid = computeMipPyramid(preset);
      expect(pyramid).toHaveLength(7);
      expect(pyramid.map((m) => m.mipLevel)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(pyramid[0]?.scaleFactor).toBe(1);
      expect(pyramid[6]?.scaleFactor).toBe(64);
      for (let i = 1; i < pyramid.length; i += 1) {
        expect(pyramid[i]!.tilesPerLayer).toBeLessThanOrEqual(pyramid[i - 1]!.tilesPerLayer);
      }
    }
  });

  it("32K HDR 표지(64GiB)와 16K 일러스트(24GiB)의 비압축 원본 크기를 정확히 산출한다", () => {
    const hdr = evaluateGigaCanvasSwapState({ presetId: "hdr-32k-cover", memoryBudgetGb: 16, scrollPositionPct: 50, zoomPct: 25, activeDensityPct: 50 });
    const ultra = evaluateGigaCanvasSwapState({ presetId: "ultra-16k-illustration", memoryBudgetGb: 8, scrollPositionPct: 50, zoomPct: 50, activeDensityPct: 50 });
    expect(hdr.naiveUncompressedMiB).toBe(65536);
    expect(ultra.naiveUncompressedMiB).toBe(24576);
  });
});

describe("2. Morton(Z-Order) 2D 인터리빙 & FNV-1a 32-bit 체크섬", () => {
  it("encodeMorton2D와 decodeMorton2D가 16비트 전 범위 좌표에서 완전 가역이다", () => {
    const pairs: readonly (readonly [number, number])[] = [
      [0, 0], [1, 0], [0, 1], [1, 1], [3, 468], [63, 63], [127, 127], [1023, 2047], [65535, 65535],
    ];
    for (const [x, y] of pairs) {
      const code = encodeMorton2D(x, y);
      expect(code).toBeGreaterThanOrEqual(0);
      expect(code).toBeLessThanOrEqual(0xffffffff);
      expect(decodeMorton2D(code)).toEqual({ tileX: x, tileY: y });
    }
  });

  it("Morton Z-Order 곡선이 2×2 공간 블록을 0, 1, 2, 3 연속 코드로 배치한다", () => {
    expect(encodeMorton2D(0, 0)).toBe(0);
    expect(encodeMorton2D(1, 0)).toBe(1);
    expect(encodeMorton2D(0, 1)).toBe(2);
    expect(encodeMorton2D(1, 1)).toBe(3);
    expect(encodeMorton2D(2, 0)).toBe(4);
  });

  it("encodeMorton2D가 음수·비유한·상한 초과 좌표를 안전하게 클램프한다", () => {
    expect(decodeMorton2D(encodeMorton2D(-5, -10))).toEqual({ tileX: 0, tileY: 0 });
    expect(decodeMorton2D(encodeMorton2D(Number.NaN, 5))).toEqual({ tileX: 0, tileY: 5 });
    expect(decodeMorton2D(encodeMorton2D(999999, 70000))).toEqual({ tileX: 65535, tileY: 65535 });
  });

  it("computeFnv1a32가 표준 FNV-1a 32-bit 벡터와 1비트 변경 민감도를 만족한다", () => {
    expect(formatFnv1aHex(computeFnv1a32(new Uint8Array(0)))).toBe("811c9dc5");
    const foobar = new TextEncoder().encode("foobar");
    expect(formatFnv1aHex(computeFnv1a32(foobar))).toBe("bf9cf968");
    const mutated = new Uint8Array(foobar);
    mutated[5] = (mutated[5] ?? 0) ^ 1;
    expect(computeFnv1a32(mutated)).not.toBe(computeFnv1a32(foobar));
  });

  it("평가된 페이지 테이블의 모든 타일 mortonCode가 (tileX, tileY) 인터리빙 값과 정확히 일치한다", () => {
    const plan = evaluateGigaCanvasSwapState({ presetId: "ultra-16k-illustration", memoryBudgetGb: 4, scrollPositionPct: 30, zoomPct: 50, activeDensityPct: 60 });
    expect(plan.pageTable).toHaveLength(ATLAS_GRID_COLS * ATLAS_GRID_ROWS);
    for (const tile of plan.pageTable) {
      expect(tile.mortonCode).toBe(encodeMorton2D(tile.tileX, tile.tileY));
      expect(tile.mortonHex).toBe(tile.mortonCode.toString(16).padStart(8, "0"));
    }
  });
});

describe("3. 3계층 LRU-K 스와핑 · 워터마크 · 뷰포트 Pin 불변식 · 2프레임 프리페치", () => {
  it("sparse-empty 타일은 항상 0-byte Copy-on-Write 센티널 불변식을 유지한다", () => {
    const plan = evaluateGigaCanvasSwapState({ presetId: "webtoon-100cut-scroll", memoryBudgetGb: 4, scrollPositionPct: 24, zoomPct: 100, activeDensityPct: 35 });
    const sparseTiles = plan.pageTable.filter((t) => t.tier === "sparse-empty");
    expect(sparseTiles.length).toBeGreaterThan(0);
    for (const tile of sparseTiles) {
      expect(tile.residentBytes).toBe(0);
      expect(tile.compressedBytes).toBe(0);
      expect(tile.dirty).toBe(false);
      expect(tile.pinned).toBe(false);
    }
  });

  it("핵심 불변식: 모든 프리셋 × 모든 기기 예산 조합에서 뷰포트 타일은 절대 방출되지 않는다", () => {
    for (const presetId of ALL_PRESET_IDS) {
      for (const memoryBudgetGb of ALL_BUDGETS) {
        const plan = evaluateGigaCanvasSwapState({ presetId, memoryBudgetGb, scrollPositionPct: 40, zoomPct: 100, activeDensityPct: 80 });
        expect(plan.evictedViewportTileCount).toBe(0);
        const vpActiveTiles = plan.pageTable.filter((t) => t.inViewport && t.tier !== "sparse-empty");
        expect(vpActiveTiles.length).toBeGreaterThan(0);
        for (const vpTile of vpActiveTiles) {
          expect(vpTile.tier).toBe("vram-hot");
          expect(vpTile.pinned).toBe(true);
        }
      }
    }
  });

  it("메모리 예산이 줄어들수록 OPFS Cold 스필이 늘고 워터마크 상태가 nominal→soft→hard로 전이한다", () => {
    const ws16 = evaluateGigaCanvasSwapState({ presetId: "webtoon-100cut-scroll", memoryBudgetGb: 16, scrollPositionPct: 24, zoomPct: 100, activeDensityPct: 38 });
    const lap4 = evaluateGigaCanvasSwapState({ presetId: "webtoon-100cut-scroll", memoryBudgetGb: 4, scrollPositionPct: 24, zoomPct: 100, activeDensityPct: 38 });
    const ipad = evaluateGigaCanvasSwapState({ presetId: "webtoon-100cut-scroll", memoryBudgetGb: 1.5, scrollPositionPct: 24, zoomPct: 100, activeDensityPct: 38 });
    expect(ws16.watermarkState).toBe("nominal");
    expect(ws16.opfsColdTiles).toBe(0);
    expect(lap4.watermarkState).toBe("soft-evicting");
    expect(lap4.opfsColdTiles).toBeGreaterThan(0);
    expect(ipad.watermarkState).toBe("hard-fail-closed");
    expect(ipad.failClosedGuardActive).toBe(true);
    expect(ipad.opfsColdTiles).toBeGreaterThan(lap4.opfsColdTiles);
  });

  it("기본 웹툰 100컷 + 4GiB 구성에서 4가지 타일 상태(Hot/Warm/Cold/Sparse)가 공존한다", () => {
    const plan = evaluateGigaCanvasSwapState({ presetId: "webtoon-100cut-scroll", memoryBudgetGb: 4, scrollPositionPct: 24, zoomPct: 100, activeDensityPct: 38 });
    const tiers = new Set(plan.pageTable.map((t) => t.tier));
    expect(tiers.has("vram-hot")).toBe(true);
    expect(tiers.has("ram-warm")).toBe(true);
    expect(tiers.has("opfs-cold")).toBe(true);
    expect(tiers.has("sparse-empty")).toBe(true);
    expect(plan.cowSentinelSavedMiB).toBeGreaterThan(3000);
  });

  it("스크롤 위치(0% → 100%) 이동 시 뷰포트 Pin 행 범위가 상단에서 하단으로 이동한다", () => {
    const topPlan = evaluateGigaCanvasSwapState({ presetId: "webtoon-100cut-scroll", memoryBudgetGb: 4, scrollPositionPct: 0, zoomPct: 100, activeDensityPct: 50 });
    const bottomPlan = evaluateGigaCanvasSwapState({ presetId: "webtoon-100cut-scroll", memoryBudgetGb: 4, scrollPositionPct: 100, zoomPct: 100, activeDensityPct: 50 });
    const topMinRow = Math.min(...topPlan.pageTable.filter((t) => t.inViewport).map((t) => t.atlasRow));
    const bottomMaxRow = Math.max(...bottomPlan.pageTable.filter((t) => t.inViewport).map((t) => t.atlasRow));
    expect(topMinRow).toBe(0);
    expect(bottomMaxRow).toBe(ATLAS_GRID_ROWS - 1);
  });

  it("줌 배율 변경 시 선택 MIP 레벨과 페이지 테이블의 mipLevel이 동기화된다", () => {
    const zoom100 = evaluateGigaCanvasSwapState({ presetId: "ultra-16k-illustration", memoryBudgetGb: 8, scrollPositionPct: 40, zoomPct: 100, activeDensityPct: 50 });
    const zoom5 = evaluateGigaCanvasSwapState({ presetId: "ultra-16k-illustration", memoryBudgetGb: 8, scrollPositionPct: 40, zoomPct: 5, activeDensityPct: 50 });
    expect(zoom100.selectedMipLevel).toBe(0);
    expect(zoom5.selectedMipLevel).toBe(6);
    expect(zoom5.pageTable.every((t) => t.mipLevel === 6)).toBe(true);
  });

  it("스크롤 속도 벡터 방향(정지·하향·고속·상향)에 따라 2프레임 선행 프리페치 링이 확장된다", () => {
    const idle = evaluateGigaCanvasSwapState({ presetId: "webtoon-100cut-scroll", memoryBudgetGb: 8, scrollPositionPct: 50, zoomPct: 100, activeDensityPct: 60, scrollVelocityPxPerSec: 0 });
    const fastDown = evaluateGigaCanvasSwapState({ presetId: "webtoon-100cut-scroll", memoryBudgetGb: 8, scrollPositionPct: 50, zoomPct: 100, activeDensityPct: 60, scrollVelocityPxPerSec: 3600 });
    const fastUp = evaluateGigaCanvasSwapState({ presetId: "webtoon-100cut-scroll", memoryBudgetGb: 8, scrollPositionPct: 50, zoomPct: 100, activeDensityPct: 60, scrollVelocityPxPerSec: -3600 });
    expect(fastDown.prefetchRingTiles).toBeGreaterThan(idle.prefetchRingTiles);
    const downMaxRow = Math.max(...fastDown.pageTable.filter((t) => t.inPrefetchRing).map((t) => t.atlasRow));
    const upMinRow = Math.min(...fastUp.pageTable.filter((t) => t.inPrefetchRing).map((t) => t.atlasRow));
    expect(downMaxRow).toBeGreaterThan(upMinRow);
  });

  it("활성 드로잉 밀도가 높아질수록 CoW 빈 타일 절감이 줄고 활성 할당 타일이 단조 증가한다", () => {
    const sparse = evaluateGigaCanvasSwapState({ presetId: "print-4k-60layers", memoryBudgetGb: 8, scrollPositionPct: 35, zoomPct: 100, activeDensityPct: 15 });
    const dense = evaluateGigaCanvasSwapState({ presetId: "print-4k-60layers", memoryBudgetGb: 8, scrollPositionPct: 35, zoomPct: 100, activeDensityPct: 90 });
    expect(dense.activeAllocatedTiles).toBeGreaterThan(sparse.activeAllocatedTiles);
    expect(dense.cowSentinelSavedMiB).toBeLessThan(sparse.cowSentinelSavedMiB);
  });

  it("OPFS Cold 배치와 정직 구분 출처(architecture-budget-model)가 명시적으로 제공된다", () => {
    const plan = evaluateGigaCanvasSwapState({ presetId: "hdr-32k-cover", memoryBudgetGb: 4, scrollPositionPct: 50, zoomPct: 25, activeDensityPct: 60 });
    expect(plan.budgetModelProvenance).toBe("architecture-budget-model");
    expect(plan.opfsColdBatch.accessApi).toBe("FileSystemSyncAccessHandle");
    expect(plan.opfsColdBatch.evictionPolicy).toContain("LRU-K");
    expect(plan.opfsColdBatch.provenance).toBe("architecture-budget-model");
    expect(plan.opfsColdBatch.batchTileKeys.length).toBeGreaterThan(0);
    expect(plan.honestyDisclosureKo).toContain("architecture-budget-model");
    expect(plan.honestyDisclosureKo).toContain("measured-in-memory");
  });
});

describe("4. 실물 무손실 RLE-Delta 타일 코덱 · 인메모리 스왑 슬롯 · 라운드트립 실측", () => {
  it("4종 프리셋의 256×256 실물 타일 버퍼(262,144B)가 RLE-Delta 압축 후 0-diff 무손실 복원되고 2배 이상 압축된다", () => {
    for (const presetId of ALL_PRESET_IDS) {
      const raw = generateSyntheticTileBuffer(presetId, 3, 7, 256);
      expect(raw.byteLength).toBe(256 * 256 * 4);
      const compressed = compressTileRleDelta(raw);
      const restored = decompressTileRleDelta(compressed);
      expect(restored.length).toBe(raw.length);
      expect(computeFnv1a32(restored)).toBe(computeFnv1a32(raw));
      expect(raw.byteLength / compressed.byteLength).toBeGreaterThan(2);
    }
  });

  it("단색 투명·백색 버퍼에서 100배 이상 초고압축과 0-diff 복원을 달성한다", () => {
    const flatWhite = new Uint8ClampedArray(256 * 256 * 4).fill(255);
    const compressed = compressTileRleDelta(flatWhite);
    const restored = decompressTileRleDelta(compressed);
    expect(flatWhite.byteLength / compressed.byteLength).toBeGreaterThan(100);
    expect(computeFnv1a32(restored)).toBe(computeFnv1a32(flatWhite));
  });

  it("선형 수평 그라데이션 버퍼가 평면 델타+RLE로 고압축되고 비트 동등하게 복원된다", () => {
    const grad = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i += 1) {
      grad[i * 4] = i & 0xff; grad[i * 4 + 1] = (i * 2) & 0xff; grad[i * 4 + 2] = 128; grad[i * 4 + 3] = 255;
    }
    const compressed = compressTileRleDelta(grad);
    const restored = decompressTileRleDelta(compressed);
    expect(compressed.byteLength).toBeLessThan(grad.byteLength * 0.25);
    expect(restored).toEqual(grad);
  });

  it("비압축성 의사난수 버퍼에서도 2% 미만 오버헤드로 100% 무손실 복원한다", () => {
    const noisy = new Uint8ClampedArray(4096);
    let s = 0x12345678;
    for (let i = 0; i < noisy.length; i += 1) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; noisy[i] = (s >>> 24) & 0xff; }
    const compressed = compressTileRleDelta(noisy);
    const restored = decompressTileRleDelta(compressed);
    expect(compressed.byteLength).toBeLessThan(noisy.byteLength * 1.02);
    expect(restored).toEqual(noisy);
  });

  it("경계 길이 버퍼(0·1·2·3·5·17B, 비4배수 선형 경로 포함)를 모두 0-diff로 복원한다", () => {
    for (const len of [0, 1, 2, 3, 5, 17, 131]) {
      const buf = new Uint8ClampedArray(len);
      for (let i = 0; i < len; i += 1) buf[i] = (i * 53 + 11) & 0xff;
      const restored = decompressTileRleDelta(compressTileRleDelta(buf));
      expect(restored).toEqual(buf);
    }
  });

  it("손상된 압축 바이너리(헤더 절단·매직 불일치·잘못된 flags·조기 EOF)에 Fail-Closed 예외를 던진다", () => {
    expect(() => decompressTileRleDelta(new Uint8Array([1, 2, 3]))).toThrow(/header truncated/i);
    expect(() => decompressTileRleDelta(new Uint8Array([0, 0, 0, 0, 1, 4, 0, 0, 0, 0]))).toThrow(/magic mismatch/i);
    expect(() => decompressTileRleDelta(new Uint8Array([0x54, 0x53, 0x52, 0x44, 9, 4, 0, 0, 0]))).toThrow(/unsupported flags/i);
    expect(() => decompressTileRleDelta(new Uint8Array([0x54, 0x53, 0x52, 0x44, 0, 16, 0, 0, 0]))).toThrow(/unexpected EOF/i);
  });

  it("createInMemorySwapSlotPool이 방어적 복사로 슬롯을 격리 보관하고 삭제·바이트 집계를 정확히 수행한다", () => {
    const pool = createInMemorySwapSlotPool();
    const payload = new Uint8Array([10, 20, 30, 40]);
    pool.write("slot-a", payload);
    payload[0] = 99; // 원본 변경이 슬롯 내부에 영향을 주면 안 됨
    const readBack = pool.read("slot-a");
    expect(readBack).toEqual(new Uint8Array([10, 20, 30, 40]));
    expect(pool.listKeys()).toEqual(["slot-a"]);
    expect(pool.totalStoredBytes()).toBe(4);
    expect(pool.remove("slot-a")).toBe(true);
    expect(pool.read("slot-a")).toBeNull();
    expect(pool.totalStoredBytes()).toBe(0);
  });

  it("verifyTileSwapRoundTrip이 4종 프리셋에서 measured-in-memory 0-diff와 FNV-1a 일치를 실측한다", () => {
    for (const presetId of ALL_PRESET_IDS) {
      const result = verifyTileSwapRoundTrip({ presetId });
      expect(result.provenance).toBe("measured-in-memory");
      expect(result.storageBackend).toBe("in-memory-slab-slot");
      expect(result.rawBytes).toBe(262144);
      expect(result.compressedBytes).toBeLessThan(result.rawBytes);
      expect(result.diffByteCount).toBe(0);
      expect(result.firstDiffOffset).toBeNull();
      expect(result.isBitExact).toBe(true);
      expect(result.originalFnv1aHex).toBe(result.restoredFnv1aHex);
      expect(result.slotPoolBytesAfterSwap).toBe(result.compressedBytes);
    }
  });

  it("verifyTileSwapRoundTrip이 외부에서 주입한 Uint8ClampedArray도 정확히 실측 검증한다", () => {
    const custom = new Uint8ClampedArray([12, 34, 56, 255, 12, 34, 56, 255, 99, 100, 101, 255, 0, 0, 0, 0]);
    const result = verifyTileSwapRoundTrip({ presetId: "webtoon-100cut-scroll", tileKey: "custom-k1", pixels: custom });
    expect(result.tileKey).toBe("custom-k1");
    expect(result.rawBytes).toBe(16);
    expect(result.diffByteCount).toBe(0);
    expect(result.isBitExact).toBe(true);
    expect(result.originalFnv1a).toBe(computeFnv1a32(custom));
  });
});

describe("5. JSON 매니페스트 내보내기 계약", () => {
  it("exportGigaCanvasSwapJson이 유효한 스키마 버전과 추정 모델 출처를 직렬화한다", () => {
    const plan = evaluateGigaCanvasSwapState({ presetId: "ultra-16k-illustration", memoryBudgetGb: 8, scrollPositionPct: 44, zoomPct: 50, activeDensityPct: 54 });
    const { json, manifest } = exportGigaCanvasSwapJson(plan, null);
    const parsed = JSON.parse(json) as typeof manifest;
    expect(parsed).toEqual(manifest);
    expect(parsed.schemaVersion).toBe("toonstudio.giga-canvas-virtual-swap.v1");
    expect(parsed.memoryAllocation.provenance).toBe("architecture-budget-model");
    expect(parsed.memoryAllocation.evictedViewportTileCount).toBe(0);
    expect(parsed.roundTripVerification).toBeNull();
  });

  it("라운드트립 실측 결과를 함께 전달하면 measured-in-memory 필드가 매니페스트에 통합된다", () => {
    const plan = evaluateGigaCanvasSwapState({ presetId: "hdr-32k-cover", memoryBudgetGb: 1.5, scrollPositionPct: 50, zoomPct: 25, activeDensityPct: 46 });
    const rt = verifyTileSwapRoundTrip({ presetId: "hdr-32k-cover" });
    const { json } = exportGigaCanvasSwapJson(plan, rt);
    const parsed = JSON.parse(json) as { roundTripVerification: { provenance: string; diffByteCount: number; isBitExact: boolean } };
    expect(parsed.roundTripVerification.provenance).toBe("measured-in-memory");
    expect(parsed.roundTripVerification.diffByteCount).toBe(0);
    expect(parsed.roundTripVerification.isBitExact).toBe(true);
  });

  it("매니페스트의 OPFS Cold 배치와 정직 구분 문구가 누락 없이 유지된다", () => {
    const plan = evaluateGigaCanvasSwapState({ presetId: "print-4k-60layers", memoryBudgetGb: 4, scrollPositionPct: 35, zoomPct: 100, activeDensityPct: 62 });
    const { manifest } = exportGigaCanvasSwapJson(plan);
    expect(manifest.opfsColdBatch.accessApi).toBe("FileSystemSyncAccessHandle");
    expect(manifest.opfsColdBatch.provenance).toBe("architecture-budget-model");
    expect(manifest.honestyDisclosureKo).toContain("measured-in-memory");
  });
});

describe("6. StudioGigaCanvasSwapPanel UI · 상호작용 · SVG 아틀라스 · 로케일", () => {
  it("props 없이 기본 렌더링되며 4종 프리셋 카드·4종 예산 버튼·시맨틱 SVG 아틀라스를 표시한다", () => {
    render(<StudioGigaCanvasSwapPanel />);
    expect(screen.getByTestId("studio-giga-canvas-swap-panel")).toBeTruthy();
    for (const id of ALL_PRESET_IDS) expect(screen.getByTestId(`preset-card-${id}`)).toBeTruthy();
    for (const gb of ALL_BUDGETS) expect(screen.getByTestId(`budget-btn-${gb}`)).toBeTruthy();
    const svg = screen.getByTestId("giga-canvas-atlas-svg");
    expect(svg.getAttribute("data-preset-id")).toBe("webtoon-100cut-scroll");
    expect(svg.getAttribute("data-evicted-viewport-tiles")).toBe("0");
    expect(screen.getByTestId("svg-viewport-pin-frame")).toBeTruthy();
    expect(screen.getByTestId("svg-prefetch-ring-frame")).toBeTruthy();
  });

  it("32K HDR 표지 + 1.5GiB iPad 예산 전환 시 90% Hard Fail-Closed 경고와 onSwapPlanChange 콜백이 작동한다", () => {
    const onSwapPlanChange = vi.fn();
    render(<StudioGigaCanvasSwapPanel onSwapPlanChange={onSwapPlanChange} />);
    fireEvent.click(screen.getByTestId("preset-card-hdr-32k-cover"));
    fireEvent.click(screen.getByTestId("budget-btn-1.5"));
    expect(screen.getByTestId("hard-watermark-alert")).toBeTruthy();
    const svg = screen.getByTestId("giga-canvas-atlas-svg");
    expect(svg.getAttribute("data-preset-id")).toBe("hdr-32k-cover");
    expect(svg.getAttribute("data-memory-budget-gb")).toBe("1.5");
    expect(svg.getAttribute("data-watermark-state")).toBe("hard-fail-closed");
    expect(svg.getAttribute("data-evicted-viewport-tiles")).toBe("0");
    expect(onSwapPlanChange).toHaveBeenLastCalledWith(expect.objectContaining({ watermarkState: "hard-fail-closed", evictedViewportTileCount: 0 }));
  });

  it("스크롤 위치·줌·활성 드로잉 밀도 슬라이더 및 속도 버튼 조작 시 MIP·수치·SVG가 즉시 갱신된다", () => {
    render(<StudioGigaCanvasSwapPanel />);
    fireEvent.change(screen.getByTestId("slider-scroll-position"), { target: { value: "82" } });
    fireEvent.change(screen.getByTestId("slider-zoom"), { target: { value: "10" } });
    fireEvent.change(screen.getByTestId("slider-active-density"), { target: { value: "75" } });
    fireEvent.click(screen.getByTestId("velocity-btn-3600"));
    expect(screen.getByTestId("readout-scroll-position").textContent).toBe("82%");
    expect(screen.getByTestId("readout-zoom").textContent).toContain("10% · MIP 4");
    expect(screen.getByTestId("readout-active-density").textContent).toBe("75%");
    expect(screen.getByTestId("giga-canvas-atlas-svg").getAttribute("data-mip-level")).toBe("4");
  });

  it("무손실 스왑 라운드트립 검증 실행 버튼 클릭 시 262,144B FNV-1a 0-diff 실측 결과를 즉시 표시한다", () => {
    render(<StudioGigaCanvasSwapPanel initialPresetId="ultra-16k-illustration" />);
    expect(screen.getByTestId("roundtrip-idle-notice")).toBeTruthy();
    fireEvent.click(screen.getByTestId("run-roundtrip-btn"));
    expect(screen.getByTestId("roundtrip-result-card")).toBeTruthy();
    expect(screen.getByTestId("roundtrip-provenance").textContent).toBe("measured-in-memory");
    expect(screen.getByTestId("roundtrip-bytes").textContent).toContain("262,144B");
    expect(screen.getByTestId("roundtrip-diff").textContent).toContain("diff 0 B · BIT-EXACT");
  });

  it("JSON 복사·내보내기, 미리보기 토글 및 초기화 버튼이 정상 작동한다", () => {
    const onExportJson = vi.fn();
    render(<StudioGigaCanvasSwapPanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("run-roundtrip-btn"));
    fireEvent.click(screen.getByTestId("export-swap-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    const preview = screen.getByTestId("swap-json-preview");
    expect(preview.textContent).toContain("toonstudio.giga-canvas-virtual-swap.v1");
    expect(preview.textContent).toContain("measured-in-memory");
    fireEvent.click(screen.getByTestId("toggle-json-preview-btn"));
    expect(screen.queryByTestId("swap-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("reset-swap-panel-btn"));
    expect(screen.queryByTestId("roundtrip-result-card")).toBeNull();
  });

  it("영문 로케일(locale='en')이 UI·SVG·정직성 고지 문구를 모두 영문으로 전환한다", () => {
    render(<StudioGigaCanvasSwapPanel locale="en" initialMemoryBudgetGb={16} />);
    expect(screen.getByTestId("giga-canvas-atlas-svg").textContent).toContain("3-TIER VIRTUAL MEMORY ATLAS");
    expect(screen.getByTestId("honesty-disclosure").textContent).toContain("Honesty Disclosure:");
    expect(screen.getByTestId("watermark-state-badge").textContent).toContain("NOMINAL");
  });
});

describe("7. 코드 위생 · 탈-바이올렛 OKLCH · Calm Atelier · 줄 수 계약 자가 검증", () => {
  it("4개 소유 파일 줄 수 제한(engine<=750, panel<=680, 전체<=800)과 금지 패턴 0건을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "giga-canvas-swap-engine.ts",
      "StudioGigaCanvasSwapPanel.tsx",
      "index.ts",
      "giga-canvas-swap.test.tsx",
    ];
    for (const file of required) expect(existsSync(path.join(dir, file))).toBe(true);

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.sort()).toEqual([...required].sort());

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "giga-canvas-swap-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioGigaCanvasSwapPanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "giga-canvas-swap.test.tsx") {
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

      if (file === "StudioGigaCanvasSwapPanel.tsx") {
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
    const panelSrc = readFileSync(path.resolve(import.meta.dirname, "StudioGigaCanvasSwapPanel.tsx"), "utf8");
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(6);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("렌더된 패널의 모든 버튼이 min-h-11을 충족하고 모든 range 슬라이더에 연결된 label이 존재한다", () => {
    const { container } = render(<StudioGigaCanvasSwapPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(14);
    for (const btn of buttons) expect(btn.className).toContain("min-h-11");

    const ranges = Array.from(container.querySelectorAll('input[type="range"]'));
    expect(ranges).toHaveLength(3);
    for (const input of ranges) {
      expect(input.id.length).toBeGreaterThan(0);
      expect(container.querySelector(`label[for="${input.id}"]`)).toBeTruthy();
    }
  });
});
