/**
 * Wave 55A — 초거대 캔버스 Morton(Z-Order) 희소 타일링 및 3계층 OPFS 가상 메모리 스와핑 엔진.
 *
 * - 4종 초거대 캔버스 프리셋(웹툰 100컷 · 16K 일러스트 · 32K HDR 표지 · 인쇄 4K 60레이어)
 * - 256×256px 희소 타일 × MIP 0..6 페이지 테이블과 0-byte Copy-on-Write 빈 타일 센티널
 * - 기기 예산(1.5/4/8/16GiB) 기반 3계층(VRAM Hot / RAM Warm / OPFS Cold) LRU-K + 2프레임 선행 프리페치
 * - 실제 Uint8ClampedArray 대상 무손실 RLE-Delta 압축·인메모리 스왑 슬롯 복원·FNV-1a 0-diff 실측 커널
 */

import { compressTileRleDelta, decompressTileRleDelta } from "./giga-canvas-tile-codec";
import { MAX_TILE_RAW_BYTES, MAX_TILE_ENCODED_BYTES, MAX_SWAP_POOL_BYTES, MAX_SWAP_SLOTS, normalizedSampleTileSize, requireTileBytes, requireSwapInteger, requireSwapSlotKey, requireMipPreset } from "./giga-canvas-input-contract";

export { compressTileRleDelta, decompressTileRleDelta } from "./giga-canvas-tile-codec";

export type GigaCanvasPresetId = "webtoon-100cut-scroll" | "ultra-16k-illustration" | "hdr-32k-cover" | "print-4k-60layers";
export type MemoryBudgetGb = 1.5 | 4 | 8 | 16;
export type MipLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type VirtualTileTier = "vram-hot" | "ram-warm" | "opfs-cold" | "sparse-empty";
export type WatermarkState = "nominal" | "soft-evicting" | "hard-fail-closed";
export type EvidenceProvenance = "measured-in-memory" | "architecture-budget-model";

export interface GigaCanvasPresetSpec {
  readonly id: GigaCanvasPresetId; readonly order: 1 | 2 | 3 | 4;
  readonly titleKo: string; readonly titleEn: string; readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly specLabelKo: string; readonly specLabelEn: string;
  readonly widthPx: number; readonly heightPx: number; readonly layerCount: number;
  readonly bitDepth: 8 | 16; readonly bitDepthLabel: string; readonly bytesPerPixel: 4 | 8;
  readonly colorSpace: string; readonly dpi: number;
  readonly defaultActiveDensityPct: number; readonly defaultZoomPct: number;
  readonly defaultScrollPct: number; readonly defaultScrollVelocityPxPerSec: number;
  readonly scrollOrientation: "vertical" | "planar-2d";
  readonly useCaseKo: string; readonly useCaseEn: string;
}

export interface MemoryBudgetProfileSpec {
  readonly budgetGb: MemoryBudgetGb; readonly id: string;
  readonly labelKo: string; readonly labelEn: string; readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly totalBudgetMiB: number; readonly vramCapMiB: number; readonly ramCapMiB: number; readonly opfsQuotaMiB: number;
  readonly softWatermarkPct: number; readonly hardWatermarkPct: number; readonly noteKo: string; readonly noteEn: string;
}

export interface MipLevelSummary {
  readonly mipLevel: MipLevel; readonly scaleFactor: number; readonly widthPx: number; readonly heightPx: number;
  readonly tilesX: number; readonly tilesY: number; readonly tilesPerLayer: number;
}

export interface VirtualTilePageEntry {
  readonly tileKey: string; readonly tileX: number; readonly tileY: number;
  readonly atlasCol: number; readonly atlasRow: number; readonly mortonCode: number; readonly mortonHex: string;
  readonly mipLevel: MipLevel; readonly tier: VirtualTileTier; readonly pinned: boolean;
  readonly inViewport: boolean; readonly inPrefetchRing: boolean; readonly dirty: boolean;
  readonly lruKScore: number; readonly residentBytes: number; readonly compressedBytes: number;
}

export interface OpfsColdSwapBatch {
  readonly accessApi: "FileSystemSyncAccessHandle"; readonly evictionPolicy: "LRU-K (K=2) + Viewport Pin Guard";
  readonly coldTileCount: number; readonly batchTileKeys: readonly string[]; readonly syncHandleStripes: number;
  readonly uncompressedSpillMiB: number; readonly estimatedCompressedSpillMiB: number;
  readonly estimatedWriteLatencyMs: number; readonly provenance: "architecture-budget-model";
}

export interface GigaCanvasSwapInput {
  readonly presetId: GigaCanvasPresetId; readonly memoryBudgetGb: MemoryBudgetGb;
  readonly scrollPositionPct: number; readonly zoomPct: number; readonly activeDensityPct: number;
  readonly scrollVelocityPxPerSec?: number; readonly lookaheadFrames?: number;
}

export interface GigaCanvasSwapEvaluation {
  readonly opfsAccessVerified: false; readonly opfsPersistenceVerified: false; readonly gpuExecutionVerified: false;
  readonly allocationFeasible: boolean; readonly opfsQuotaExceeded: boolean;
  readonly accountingScope: "mip0-payload-estimate"; readonly pageTableScope: "representative-atlas-cells";
  readonly preset: GigaCanvasPresetSpec; readonly memoryBudget: MemoryBudgetProfileSpec;
  readonly scrollPositionPct: number; readonly zoomPct: number; readonly activeDensityPct: number;
  readonly scrollVelocityPxPerSec: number; readonly lookaheadFrames: number;
  readonly selectedMipLevel: MipLevel; readonly mipPyramid: readonly MipLevelSummary[];
  readonly tileBytesAtMip0: number; readonly totalVirtualTiles: number;
  readonly sparseEmptyTiles: number; readonly activeAllocatedTiles: number;
  readonly vramHotTiles: number; readonly ramWarmTiles: number; readonly opfsColdTiles: number;
  readonly pinnedViewportTiles: number; readonly prefetchRingTiles: number; readonly evictedViewportTileCount: number;
  readonly naiveUncompressedMiB: number; readonly cowSentinelSavedMiB: number; readonly activeUncompressedMiB: number;
  readonly vramUsedMiB: number; readonly vramCapMiB: number; readonly vramUtilizationPct: number;
  readonly ramUsedMiB: number; readonly ramCapMiB: number; readonly ramUtilizationPct: number;
  readonly opfsColdSpillMiB: number; readonly softWatermarkMiB: number; readonly hardWatermarkMiB: number;
  readonly watermarkState: WatermarkState; readonly failClosedGuardActive: boolean;
  readonly atlasCols: number; readonly atlasRows: number;
  readonly pageTable: readonly VirtualTilePageEntry[]; readonly opfsColdBatch: OpfsColdSwapBatch;
  readonly budgetModelProvenance: "architecture-budget-model";
  readonly honestyDisclosureKo: string; readonly honestyDisclosureEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
}

export interface InMemoryTileSwapSlot {
  readonly slotKey: string; readonly byteLength: number; readonly storedAtStep: number; readonly payload: Uint8Array;
}

export interface InMemorySwapSlotPool {
  readonly write: (slotKey: string, compressed: Uint8Array) => InMemoryTileSwapSlot;
  readonly read: (slotKey: string) => Uint8Array | null;
  readonly remove: (slotKey: string) => boolean;
  readonly listKeys: () => readonly string[];
  readonly totalStoredBytes: () => number;
}

export interface TileSwapRoundTripInput {
  readonly presetId: GigaCanvasPresetId; readonly tileKey?: string;
  readonly tileX?: number; readonly tileY?: number; readonly tileSize?: number;
  readonly pixels?: Uint8ClampedArray; readonly pool?: InMemorySwapSlotPool;
}

export interface TileSwapRoundTripResult {
  readonly sampleFormat: "rgba8"; readonly opfsPersistenceVerified: false;
  readonly sampleSource: "generated-example" | "caller-buffer";
  readonly provenance: "measured-in-memory"; readonly codec: "ts-rle-delta-v1"; readonly storageBackend: "in-memory-slab-slot";
  readonly presetId: GigaCanvasPresetId; readonly tileKey: string; readonly tileWidth: number; readonly tileHeight: number;
  readonly rawBytes: number; readonly compressedBytes: number; readonly compressionRatio: number; readonly spaceSavingPct: number;
  readonly originalFnv1a: number; readonly restoredFnv1a: number; readonly originalFnv1aHex: string; readonly restoredFnv1aHex: string;
  readonly diffByteCount: number; readonly firstDiffOffset: number | null; readonly isBitExact: boolean;
  readonly slotPoolBytesAfterSwap: number; readonly elapsedMs: number; readonly summaryKo: string; readonly summaryEn: string;
}

export interface GigaCanvasSwapManifest {
  readonly opfsAccessVerified: false; readonly opfsPersistenceVerified: false; readonly gpuExecutionVerified: false;
  readonly schemaVersion: "toonstudio.giga-canvas-virtual-swap.v1";
  readonly preset: GigaCanvasPresetSpec; readonly memoryBudget: MemoryBudgetProfileSpec;
  readonly viewportState: {
    readonly scrollPositionPct: number; readonly zoomPct: number; readonly activeDensityPct: number;
    readonly scrollVelocityPxPerSec: number; readonly lookaheadFrames: number; readonly selectedMipLevel: MipLevel;
  };
  readonly memoryAllocation: {
    readonly provenance: "architecture-budget-model";
    readonly allocationFeasible: boolean; readonly opfsQuotaExceeded: boolean;
    readonly accountingScope: "mip0-payload-estimate";
    readonly naiveUncompressedMiB: number; readonly cowSentinelSavedMiB: number;
    readonly vramUsedMiB: number; readonly vramCapMiB: number; readonly vramUtilizationPct: number;
    readonly ramUsedMiB: number; readonly ramCapMiB: number; readonly ramUtilizationPct: number;
    readonly opfsColdSpillMiB: number; readonly watermarkState: WatermarkState;
    readonly failClosedGuardActive: boolean; readonly evictedViewportTileCount: number;
  };
  readonly tileCounts: {
    readonly totalVirtualTiles: number; readonly sparseEmptyTiles: number; readonly activeAllocatedTiles: number;
    readonly vramHotTiles: number; readonly ramWarmTiles: number; readonly opfsColdTiles: number;
    readonly pinnedViewportTiles: number; readonly prefetchRingTiles: number;
  };
  readonly opfsColdBatch: OpfsColdSwapBatch;
  readonly roundTripVerification: TileSwapRoundTripResult | null;
  readonly honestyDisclosureKo: string; readonly honestyDisclosureEn: string;
}

export const VIRTUAL_TILE_SIZE = 256 as const;
export const MAX_MIP_LEVEL: MipLevel = 6;
export const SOFT_WATERMARK_PCT = 78 as const;
export const HARD_WATERMARK_PCT = 90 as const;
export const ATLAS_GRID_COLS = 12 as const;
export const ATLAS_GRID_ROWS = 8 as const;

const BYTES_PER_MIB = 1024 * 1024;
const ESTIMATED_OPFS_COMPRESSION_FACTOR = 0.24;
const ESTIMATED_OPFS_BANDWIDTH_MIB_PER_SEC = 420;
const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;

const DEFAULT_PRESET: GigaCanvasPresetSpec = {
  id: "webtoon-100cut-scroll", order: 1, titleKo: "웹툰 100컷 초장폭 스크롤", titleEn: "Webtoon 100-Cut Long Scroll",
  shortLabelKo: "웹툰 100컷", shortLabelEn: "Webtoon 100-Cut", specLabelKo: "800×120,000px · 12레이어 · 8-bit/16-bit",
  specLabelEn: "800×120,000px · 12 layers · 8-bit/16-bit", widthPx: 800, heightPx: 120000, layerCount: 12,
  bitDepth: 8, bitDepthLabel: "8-bit/16-bit", bytesPerPixel: 4, colorSpace: "sRGB", dpi: 72,
  defaultActiveDensityPct: 38, defaultZoomPct: 100, defaultScrollPct: 24, defaultScrollVelocityPxPerSec: 1440,
  scrollOrientation: "vertical",
  useCaseKo: "컷 간 여백을 0-byte CoW 센티널로 비우고 스크롤 방향 2프레임 앞 타일을 선행 고정한다.",
  useCaseEn: "Keeps panel gutters as 0-byte CoW sentinels while pinning 2 frames ahead along vertical scroll.",
};

export const GIGA_CANVAS_PRESETS: readonly GigaCanvasPresetSpec[] = [
  DEFAULT_PRESET,
  {
    id: "ultra-16k-illustration", order: 2, titleKo: "16K 초고해상도 일러스트", titleEn: "16K Ultra Illustration",
    shortLabelKo: "16K 일러스트", shortLabelEn: "16K Ultra", specLabelKo: "16,384×16,384px · 24레이어 · Display-P3",
    specLabelEn: "16,384×16,384px · 24 layers · Display-P3", widthPx: 16384, heightPx: 16384, layerCount: 24,
    bitDepth: 8, bitDepthLabel: "Display-P3", bytesPerPixel: 4, colorSpace: "Display-P3", dpi: 300,
    defaultActiveDensityPct: 54, defaultZoomPct: 50, defaultScrollPct: 44, defaultScrollVelocityPxPerSec: 960,
    scrollOrientation: "planar-2d",
    useCaseKo: "24GiB급 원본 캔버스를 MIP 0..6 피라미드와 3계층 LRU-K로 분할해 줌·팬 끊김을 억제한다.",
    useCaseEn: "Partitions a 24 GiB canvas via MIP 0..6 and 3-tier LRU-K to keep pan and zoom responsive.",
  },
  {
    id: "hdr-32k-cover", order: 3, titleKo: "32K HDR 16-bit 표지 마스터", titleEn: "32K HDR 16-bit Cover Master",
    shortLabelKo: "32K HDR 표지", shortLabelEn: "32K HDR Cover", specLabelKo: "32,768×32,768px · 8레이어 · 16-bit RGBA",
    specLabelEn: "32,768×32,768px · 8 layers · 16-bit RGBA", widthPx: 32768, heightPx: 32768, layerCount: 8,
    bitDepth: 16, bitDepthLabel: "16-bit RGBA", bytesPerPixel: 8, colorSpace: "HDR-16bit-RGBA", dpi: 300,
    defaultActiveDensityPct: 46, defaultZoomPct: 25, defaultScrollPct: 50, defaultScrollVelocityPxPerSec: 1200,
    scrollOrientation: "planar-2d",
    useCaseKo: "64GiB급 16-bit RGBA 캔버스에서 비가시 타일을 OPFS Cold로 스필하고 뷰포트 타일만 VRAM에 보존한다.",
    useCaseEn: "Spills non-visible tiles of a 64 GiB 16-bit RGBA canvas to OPFS Cold while pinning active viewport tiles.",
  },
  {
    id: "print-4k-60layers", order: 4, titleKo: "인쇄용 4K 60레이어 단행본", titleEn: "Print 4K 60-Layer Edition",
    shortLabelKo: "4K 60레이어", shortLabelEn: "Print 4K 60L", specLabelKo: "4,096×6,144px · 60레이어 · CMYK/RGB 300DPI",
    specLabelEn: "4,096×6,144px · 60 layers · CMYK/RGB 300DPI", widthPx: 4096, heightPx: 6144, layerCount: 60,
    bitDepth: 8, bitDepthLabel: "CMYK/RGB 300DPI", bytesPerPixel: 4, colorSpace: "CMYK/RGB-300DPI", dpi: 300,
    defaultActiveDensityPct: 62, defaultZoomPct: 100, defaultScrollPct: 35, defaultScrollVelocityPxPerSec: 720,
    scrollOrientation: "planar-2d",
    useCaseKo: "60개 채색·식자·효과 레이어의 빈 타일 영역을 CoW로 공유하고 비활성 레이어 스택을 RAM/OPFS로 내린다.",
    useCaseEn: "Shares empty tiles across 60 ink, color, and lettering layers via CoW and spills inactive stacks to RAM/OPFS.",
  },
];

const DEFAULT_BUDGET_PROFILE: MemoryBudgetProfileSpec = {
  budgetGb: 4, id: "laptop-4gb", labelKo: "4GiB 노트북", labelEn: "4GiB Laptop", shortLabelKo: "4GiB 노트북", shortLabelEn: "4GiB Laptop",
  totalBudgetMiB: 4096, vramCapMiB: 1024, ramCapMiB: 2048, opfsQuotaMiB: 12288, softWatermarkPct: SOFT_WATERMARK_PCT, hardWatermarkPct: HARD_WATERMARK_PCT,
  noteKo: "내장 GPU 공유 메모리 환경의 균형 스와핑 예산", noteEn: "Balanced shared-memory swapping budget for integrated-GPU laptops",
};

export const MEMORY_BUDGET_PROFILES: readonly MemoryBudgetProfileSpec[] = [
  {
    budgetGb: 1.5, id: "ipad-safari-1.5gb", labelKo: "1.5GiB iPad Safari", labelEn: "1.5GiB iPad Safari", shortLabelKo: "1.5GiB iPad", shortLabelEn: "1.5GiB iPad",
    totalBudgetMiB: 1536, vramCapMiB: 384, ramCapMiB: 768, opfsQuotaMiB: 4096, softWatermarkPct: SOFT_WATERMARK_PCT, hardWatermarkPct: HARD_WATERMARK_PCT,
    noteKo: "iPadOS WebKit Jetsam 한도를 고려한 초긴축 VRAM/RAM 예산", noteEn: "Tight VRAM/RAM envelope respecting iPadOS WebKit Jetsam limits",
  },
  DEFAULT_BUDGET_PROFILE,
  {
    budgetGb: 8, id: "creator-8gb", labelKo: "8GiB 크리에이터", labelEn: "8GiB Creator", shortLabelKo: "8GiB 크리에이터", shortLabelEn: "8GiB Creator",
    totalBudgetMiB: 8192, vramCapMiB: 2048, ramCapMiB: 4096, opfsQuotaMiB: 24576, softWatermarkPct: SOFT_WATERMARK_PCT, hardWatermarkPct: HARD_WATERMARK_PCT,
    noteKo: "중대형 웹툰·16K 일러스트 실시간 편집용 표준 예산", noteEn: "Standard creator budget for long webtoons and 16K illustrations",
  },
  {
    budgetGb: 16, id: "workstation-16gb", labelKo: "16GiB 워크스테이션", labelEn: "16GiB Workstation", shortLabelKo: "16GiB 워크스테이션", shortLabelEn: "16GiB Workstation",
    totalBudgetMiB: 16384, vramCapMiB: 4096, ramCapMiB: 8192, opfsQuotaMiB: 65536, softWatermarkPct: SOFT_WATERMARK_PCT, hardWatermarkPct: HARD_WATERMARK_PCT,
    noteKo: "32K HDR 표지 및 60레이어 마스터 작업용 대용량 예산", noteEn: "High-headroom budget for 32K HDR covers and 60-layer print masters",
  },
];

function clamp(v: number, min: number, max: number): number { return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min; }
function round1(v: number): number { return Math.round(v * 10) / 10; }
function round2(v: number): number { return Math.round(v * 100) / 100; }

function splitBy1(coord: number): number {
  let x = clamp(Math.floor(coord), 0, 65535) & 0xffff;
  x = (x | (x << 8)) & 0x00ff00ff; x = (x | (x << 4)) & 0x0f0f0f0f;
  x = (x | (x << 2)) & 0x33333333; x = (x | (x << 1)) & 0x55555555;
  return x >>> 0;
}
function compactBy1(bits: number): number {
  let x = (bits >>> 0) & 0x55555555;
  x = (x | (x >>> 1)) & 0x33333333; x = (x | (x >>> 2)) & 0x0f0f0f0f;
  x = (x | (x >>> 4)) & 0x00ff00ff; x = (x | (x >>> 8)) & 0x0000ffff;
  return x >>> 0;
}

/** 2차원 타일 좌표(tileX, tileY)를 32비트 무부호 Morton(Z-Order) 코드로 인터리빙한다. */
export function encodeMorton2D(tileX: number, tileY: number): number { return (splitBy1(tileX) | (splitBy1(tileY) << 1)) >>> 0; }
/** 32비트 Morton(Z-Order) 코드를 원래 타일 좌표(tileX, tileY)로 복원한다. */
export function decodeMorton2D(mortonCode: number): { readonly tileX: number; readonly tileY: number } {
  requireSwapInteger(mortonCode, 0, 4294967295, "Morton code");
  const code = mortonCode >>> 0;
  return { tileX: compactBy1(code), tileY: compactBy1(code >>> 1) };
}
/** FNV-1a 32-bit 결정론적 바이트 체크섬을 계산한다(BigInt 미사용). */
export function computeFnv1a32(bytes: Uint8Array | Uint8ClampedArray): number {
  let hash = FNV1A_OFFSET_BASIS;
  for (let i = 0; i < bytes.length; i += 1) { hash ^= bytes[i] ?? 0; hash = Math.imul(hash, FNV1A_PRIME); }
  return hash >>> 0;
}
/** FNV-1a 32-bit 해시를 8자리 소문자 16진 문자열로 포맷한다. */
export function formatFnv1aHex(hash: number): string { return (hash >>> 0).toString(16).padStart(8, "0"); }
/** 프리셋 ID로 초거대 캔버스 사양을 조회한다. */
export function getGigaCanvasPreset(presetId: GigaCanvasPresetId): GigaCanvasPresetSpec { return GIGA_CANVAS_PRESETS.find((item) => item.id === presetId) ?? DEFAULT_PRESET; }
/** 기기 메모리 예산(GiB)으로 예산 프로파일을 조회한다. */
export function getMemoryBudgetProfile(budgetGb: MemoryBudgetGb): MemoryBudgetProfileSpec { return MEMORY_BUDGET_PROFILES.find((item) => item.budgetGb === budgetGb) ?? DEFAULT_BUDGET_PROFILE; }
/** 줌 배율(5~1600%)에 대응하는 MIP 피라미드 레벨(0..6)을 결정한다. */
export function selectMipLevelForZoom(zoomPct: number): MipLevel {
  const z = clamp(zoomPct, 5, 1600);
  if (z >= 100) return 0; if (z >= 50) return 1; if (z >= 25) return 2;
  if (z >= 13) return 3; if (z >= 8) return 4; if (z >= 6) return 5;
  return 6;
}
/** 프리셋의 MIP 0..6 피라미드 타일 격자 구성을 계산한다. */
export function computeMipPyramid(preset: GigaCanvasPresetSpec): readonly MipLevelSummary[] {
  requireMipPreset(preset);
  return ([0, 1, 2, 3, 4, 5, 6] as const).map((mipLevel) => {
    const scaleFactor = 2 ** mipLevel;
    const widthPx = Math.max(1, Math.ceil(preset.widthPx / scaleFactor));
    const heightPx = Math.max(1, Math.ceil(preset.heightPx / scaleFactor));
    const tilesX = Math.max(1, Math.ceil(widthPx / VIRTUAL_TILE_SIZE));
    const tilesY = Math.max(1, Math.ceil(heightPx / VIRTUAL_TILE_SIZE));
    return { mipLevel, scaleFactor, widthPx, heightPx, tilesX, tilesY, tilesPerLayer: tilesX * tilesY };
  });
}
function deterministicUnitNoise(seed: number): number {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 0xffffffff;
}

/**
 * 초거대 캔버스의 3계층(VRAM Hot / RAM Warm / OPFS Cold) 가상 메모리 스와핑 상태를 평가한다.
 * 뷰포트 활성 타일은 항상 `pinned: true`·`vram-hot`으로 보호(방출 0건 불변식)하며,
 * 스크롤 속도 벡터 기반 2프레임 선행 프리페치 링과 OPFS Cold 배치 계획을 함께 산출한다.
 */
export function evaluateGigaCanvasSwapState(input: GigaCanvasSwapInput): GigaCanvasSwapEvaluation {
  const preset = getGigaCanvasPreset(input.presetId);
  const memoryBudget = getMemoryBudgetProfile(input.memoryBudgetGb);
  const scrollPositionPct = round1(clamp(input.scrollPositionPct, 0, 100));
  const zoomPct = Math.round(clamp(input.zoomPct, 5, 1600));
  const activeDensityPct = Math.round(clamp(input.activeDensityPct, 5, 100));
  const scrollVelocityPxPerSec = Math.round(clamp(input.scrollVelocityPxPerSec ?? preset.defaultScrollVelocityPxPerSec, -7200, 7200));
  const lookaheadFrames = Math.round(clamp(input.lookaheadFrames ?? 2, 1, 6));

  const selectedMipLevel = selectMipLevelForZoom(zoomPct);
  const mipPyramid = computeMipPyramid(preset);
  const fbX = Math.max(1, Math.ceil(preset.widthPx / VIRTUAL_TILE_SIZE));
  const fbY = Math.max(1, Math.ceil(preset.heightPx / VIRTUAL_TILE_SIZE));
  const mip0 = mipPyramid[0] ?? { mipLevel: 0, scaleFactor: 1, widthPx: preset.widthPx, heightPx: preset.heightPx, tilesX: fbX, tilesY: fbY, tilesPerLayer: fbX * fbY };
  const activeMip = mipPyramid[selectedMipLevel] ?? mip0;

  const tileBytesAtMip0 = VIRTUAL_TILE_SIZE * VIRTUAL_TILE_SIZE * preset.bytesPerPixel;
  const tileMiB = tileBytesAtMip0 / BYTES_PER_MIB;
  const totalVirtualTiles = mip0.tilesPerLayer * preset.layerCount;
  const activeAllocatedTiles = Math.max(1, Math.round((totalVirtualTiles * activeDensityPct) / 100));
  const sparseEmptyTiles = Math.max(0, totalVirtualTiles - activeAllocatedTiles);
  const naiveUncompressedMiB = round1(totalVirtualTiles * tileMiB);
  const activeUncompressedMiB = round1(activeAllocatedTiles * tileMiB);
  const cowSentinelSavedMiB = round1(sparseEmptyTiles * tileMiB);

  const viewportTilesW = Math.max(1, Math.min(activeMip.tilesX, Math.ceil((1920 / (zoomPct / 100)) / (VIRTUAL_TILE_SIZE * activeMip.scaleFactor))));
  const viewportTilesH = Math.max(1, Math.min(activeMip.tilesY, Math.ceil((1080 / (zoomPct / 100)) / (VIRTUAL_TILE_SIZE * activeMip.scaleFactor))));
  const visibleLayersActive = Math.max(1, Math.min(preset.layerCount, Math.ceil(preset.layerCount * Math.max(0.35, activeDensityPct / 100))));
  const pinnedViewportTiles = Math.max(1, Math.min(activeAllocatedTiles, viewportTilesW * viewportTilesH * visibleLayersActive));

  const lookaheadTileSteps = Math.min(4, Math.ceil((Math.abs(scrollVelocityPxPerSec) * (lookaheadFrames / 60)) / (VIRTUAL_TILE_SIZE * activeMip.scaleFactor)));
  const prefetchHaloTiles = (viewportTilesW + 2) * (viewportTilesH + 2 + lookaheadTileSteps) - viewportTilesW * viewportTilesH;
  const rawPrefetchTiles = Math.min(
    Math.max(0, activeAllocatedTiles - pinnedViewportTiles),
    Math.max(2, prefetchHaloTiles * Math.max(1, Math.ceil(visibleLayersActive * 0.65))),
  );

  const softVramMiB = round1((memoryBudget.vramCapMiB * memoryBudget.softWatermarkPct) / 100);
  const hardVramMiB = round1((memoryBudget.vramCapMiB * memoryBudget.hardWatermarkPct) / 100);
  const vramSoftTileCap = Math.max(1, Math.floor(softVramMiB / tileMiB));
  const vramHardTileCap = Math.max(vramSoftTileCap, Math.floor(hardVramMiB / tileMiB));
  const ramWarmTargetCap = Math.max(1, Math.floor((memoryBudget.ramCapMiB * 0.55) / tileMiB));
  const ramHardTileCap = Math.max(ramWarmTargetCap, Math.floor(((memoryBudget.ramCapMiB * memoryBudget.hardWatermarkPct) / 100) / tileMiB));

  // 불변식: 뷰포트 핀 타일은 어떤 메모리 압박에서도 절대 방출하지 않는다(evictedViewportTileCount === 0).
  const failClosedByViewport = pinnedViewportTiles > vramHardTileCap;
  const prefetchAllowedInVram = failClosedByViewport ? 0 : Math.min(rawPrefetchTiles, Math.max(0, vramHardTileCap - pinnedViewportTiles));
  const pinnedVramTotal = pinnedViewportTiles + prefetchAllowedInVram;
  const extraHotVramTiles = Math.min(Math.max(0, activeAllocatedTiles - pinnedVramTotal), Math.max(0, vramSoftTileCap - pinnedVramTotal));
  const vramHotTiles = pinnedVramTotal + extraHotVramTiles;
  const overflowAfterVram = Math.max(0, activeAllocatedTiles - vramHotTiles);

  const exceedsHardRam = overflowAfterVram > ramHardTileCap;
  const ramWarmTiles = exceedsHardRam ? ramHardTileCap : Math.min(overflowAfterVram, ramWarmTargetCap);
  const opfsColdTiles = Math.max(0, overflowAfterVram - ramWarmTiles);

  const vramUsedMiB = round1(vramHotTiles * tileMiB);
  const ramUsedMiB = round1(ramWarmTiles * tileMiB);
  const opfsUncompressedMiB = round1(opfsColdTiles * tileMiB);
  const opfsColdSpillMiB = round1(opfsUncompressedMiB * ESTIMATED_OPFS_COMPRESSION_FACTOR);
  const vramUtilizationPct = round1((vramUsedMiB / memoryBudget.vramCapMiB) * 100);
  const ramUtilizationPct = round1((ramUsedMiB / memoryBudget.ramCapMiB) * 100);
  const maxTierUtilPct = Math.max(vramUtilizationPct, ramUtilizationPct);
  const opfsQuotaExceeded = opfsColdSpillMiB > memoryBudget.opfsQuotaMiB;

  let watermarkState: WatermarkState = "nominal";
  if (failClosedByViewport || exceedsHardRam || opfsQuotaExceeded || maxTierUtilPct >= memoryBudget.hardWatermarkPct) watermarkState = "hard-fail-closed";
  else if (maxTierUtilPct >= memoryBudget.softWatermarkPct || opfsColdTiles > 0) watermarkState = "soft-evicting";

  // 대표 아틀라스 가상 타일 페이지 테이블(12×8 = 96셀) + Morton(Z-Order) 색인
  const vpSpanCols = Math.max(2, Math.min(6, Math.round(6 - (Math.log2(zoomPct / 5) / Math.log2(320)) * 3.8)));
  const vpSpanRows = Math.max(2, Math.min(4, Math.round(4 - (Math.log2(zoomPct / 5) / Math.log2(320)) * 2.1)));
  const vpColStart = preset.scrollOrientation === "vertical"
    ? Math.floor((ATLAS_GRID_COLS - vpSpanCols) / 2)
    : Math.round(((ATLAS_GRID_COLS - vpSpanCols) * scrollPositionPct) / 100);
  const vpRowStart = preset.scrollOrientation === "vertical"
    ? Math.round(((ATLAS_GRID_ROWS - vpSpanRows) * scrollPositionPct) / 100)
    : Math.round(((ATLAS_GRID_ROWS - vpSpanRows) * ((scrollPositionPct * 0.72 + 14) % 100)) / 100);
  const vpColEnd = vpColStart + vpSpanCols - 1;
  const vpRowEnd = vpRowStart + vpSpanRows - 1;

  const velDir = scrollVelocityPxPerSec === 0 ? 0 : scrollVelocityPxPerSec > 0 ? 1 : -1;
  const leadShift = velDir === 0 ? 0 : Math.min(2, Math.max(1, Math.round(Math.abs(scrollVelocityPxPerSec) / 1800)));
  const prefColMin = Math.max(0, vpColStart - 1 + (preset.scrollOrientation === "planar-2d" && velDir < 0 ? -leadShift : 0));
  const prefColMax = Math.min(ATLAS_GRID_COLS - 1, vpColEnd + 1 + (preset.scrollOrientation === "planar-2d" && velDir > 0 ? leadShift : 0));
  const prefRowMin = Math.max(0, vpRowStart - 1 + (velDir < 0 ? -leadShift : 0));
  const prefRowMax = Math.min(ATLAS_GRID_ROWS - 1, vpRowEnd + 1 + (velDir > 0 ? leadShift : 0));
  const vpCenterCol = (vpColStart + vpColEnd) / 2;
  const vpCenterRow = (vpRowStart + vpRowEnd) / 2;
  const activeThreshold = activeDensityPct / 100;

  interface DraftTile {
    tileKey: string; tileX: number; tileY: number; atlasCol: number; atlasRow: number;
    mortonCode: number; mortonHex: string; inViewport: boolean; inPrefetchRing: boolean;
    isSparse: boolean; dirty: boolean; lruKScore: number;
  }

  const drafts: DraftTile[] = [];
  const nonPinnedCandidates: Array<{ index: number; lruKScore: number }> = [];
  for (let row = 0; row < ATLAS_GRID_ROWS; row += 1) {
    for (let col = 0; col < ATLAS_GRID_COLS; col += 1) {
      const tileX = Math.min(activeMip.tilesX - 1, Math.floor((col / ATLAS_GRID_COLS) * activeMip.tilesX));
      const tileY = Math.min(activeMip.tilesY - 1, Math.floor((row / ATLAS_GRID_ROWS) * activeMip.tilesY));
      const mortonCode = encodeMorton2D(tileX, tileY);
      const mortonHex = mortonCode.toString(16).padStart(8, "0");
      const inViewport = col >= vpColStart && col <= vpColEnd && row >= vpRowStart && row <= vpRowEnd;
      const inPrefetchRing = !inViewport && col >= prefColMin && col <= prefColMax && row >= prefRowMin && row <= prefRowMax;
      const dist = Math.hypot(col - vpCenterCol, row - vpCenterRow);
      const noise = deterministicUnitNoise(preset.order * 10007 + row * 131 + col * 17);
      const isCenterAnchor = Math.abs(col - vpCenterCol) <= 0.6 && Math.abs(row - vpCenterRow) <= 0.6;
      const isSparse = !isCenterAnchor && noise > activeThreshold;
      const lruKScore = round2(Math.max(0.05, (inViewport ? 10 : inPrefetchRing ? 6.5 : 3.2) - dist * 0.34 + (1 - noise) * 1.4));
      const idx = drafts.length;
      drafts.push({
        tileKey: `m${selectedMipLevel}-z${mortonHex}-c${col}r${row}`,
        tileX, tileY, atlasCol: col, atlasRow: row, mortonCode, mortonHex,
        inViewport, inPrefetchRing, isSparse, dirty: !isSparse && inViewport && noise < activeThreshold * 0.45, lruKScore,
      });
      if (!isSparse && !inViewport && !inPrefetchRing) nonPinnedCandidates.push({ index: idx, lruKScore });
    }
  }

  nonPinnedCandidates.sort((a, b) => b.lruKScore - a.lruKScore);
  const nonPinnedTotal = Math.max(1, extraHotVramTiles + ramWarmTiles + opfsColdTiles);
  const atlasExtraHotQuota = Math.round((nonPinnedCandidates.length * extraHotVramTiles) / nonPinnedTotal);
  const atlasRamQuota = Math.round((nonPinnedCandidates.length * ramWarmTiles) / nonPinnedTotal);
  const assignedTierByIndex: Record<number, VirtualTileTier> = {};
  for (const [rank, item] of nonPinnedCandidates.entries()) {
    if (rank < atlasExtraHotQuota) assignedTierByIndex[item.index] = "vram-hot";
    else if (rank < atlasExtraHotQuota + atlasRamQuota) assignedTierByIndex[item.index] = "ram-warm";
    else assignedTierByIndex[item.index] = opfsColdTiles > 0 ? "opfs-cold" : "ram-warm";
  }

  const pageTable: VirtualTilePageEntry[] = drafts.map((draft, idx) => {
    if (draft.isSparse) {
      return {
        tileKey: draft.tileKey, tileX: draft.tileX, tileY: draft.tileY, atlasCol: draft.atlasCol, atlasRow: draft.atlasRow,
        mortonCode: draft.mortonCode, mortonHex: draft.mortonHex, mipLevel: selectedMipLevel, tier: "sparse-empty",
        pinned: false, inViewport: draft.inViewport, inPrefetchRing: draft.inPrefetchRing, dirty: false,
        lruKScore: 0, residentBytes: 0, compressedBytes: 0,
      };
    }
    const tier: VirtualTileTier = draft.inViewport
      ? "vram-hot"
      : draft.inPrefetchRing
        ? (failClosedByViewport ? "ram-warm" : "vram-hot")
        : (assignedTierByIndex[idx] ?? "ram-warm");
    const pinned = draft.inViewport || (draft.inPrefetchRing && !failClosedByViewport);
    const compressedBytes = Math.round(tileBytesAtMip0 * ESTIMATED_OPFS_COMPRESSION_FACTOR);
    return {
      tileKey: draft.tileKey, tileX: draft.tileX, tileY: draft.tileY, atlasCol: draft.atlasCol, atlasRow: draft.atlasRow,
      mortonCode: draft.mortonCode, mortonHex: draft.mortonHex, mipLevel: selectedMipLevel, tier, pinned,
      inViewport: draft.inViewport, inPrefetchRing: draft.inPrefetchRing, dirty: draft.dirty,
      lruKScore: draft.lruKScore, residentBytes: tier === "opfs-cold" ? compressedBytes : tileBytesAtMip0, compressedBytes,
    };
  });

  const coldSamples = pageTable
    .filter((entry) => entry.tier === "opfs-cold")
    .sort((a, b) => a.mortonCode - b.mortonCode)
    .slice(0, 12)
    .map((entry) => entry.tileKey);

  const opfsColdBatch: OpfsColdSwapBatch = {
    accessApi: "FileSystemSyncAccessHandle", evictionPolicy: "LRU-K (K=2) + Viewport Pin Guard",
    coldTileCount: opfsColdTiles, batchTileKeys: coldSamples,
    syncHandleStripes: memoryBudget.budgetGb <= 1.5 ? 2 : 4,
    uncompressedSpillMiB: opfsUncompressedMiB, estimatedCompressedSpillMiB: opfsColdSpillMiB,
    estimatedWriteLatencyMs: opfsColdTiles === 0 ? 0 : round1(1.4 + (opfsColdSpillMiB / ESTIMATED_OPFS_BANDWIDTH_MIB_PER_SEC) * 1000 * 0.08),
    provenance: "architecture-budget-model",
  };

  return {
    opfsAccessVerified: false, opfsPersistenceVerified: false, gpuExecutionVerified: false,
    allocationFeasible: vramUsedMiB <= memoryBudget.vramCapMiB && ramUsedMiB <= memoryBudget.ramCapMiB && !opfsQuotaExceeded,
    opfsQuotaExceeded, accountingScope: "mip0-payload-estimate", pageTableScope: "representative-atlas-cells",
    preset, memoryBudget, scrollPositionPct, zoomPct, activeDensityPct, scrollVelocityPxPerSec, lookaheadFrames,
    selectedMipLevel, mipPyramid, tileBytesAtMip0, totalVirtualTiles, sparseEmptyTiles, activeAllocatedTiles,
    vramHotTiles, ramWarmTiles, opfsColdTiles, pinnedViewportTiles, prefetchRingTiles: rawPrefetchTiles,
    evictedViewportTileCount: 0, naiveUncompressedMiB, cowSentinelSavedMiB, activeUncompressedMiB,
    vramUsedMiB, vramCapMiB: memoryBudget.vramCapMiB, vramUtilizationPct,
    ramUsedMiB, ramCapMiB: memoryBudget.ramCapMiB, ramUtilizationPct,
    opfsColdSpillMiB, softWatermarkMiB: softVramMiB, hardWatermarkMiB: hardVramMiB,
    watermarkState, failClosedGuardActive: watermarkState === "hard-fail-closed",
    atlasCols: ATLAS_GRID_COLS, atlasRows: ATLAS_GRID_ROWS, pageTable, opfsColdBatch,
    budgetModelProvenance: "architecture-budget-model",
    honestyDisclosureKo: "정직 구분: VRAM·RAM·OPFS는 MIP0 payload 예산 추정(architecture-budget-model)이며 권한·실제 할당·저장·디스크 계측은 미검증이다. MIP 추가 저장·페이지 메타데이터 비용은 제외하고 96셀은 대표 도해다. 하단 measured-in-memory 검증은 실제 원고·16-bit HDR이 아닌 합성 RGBA8 예제 또는 전달된 RGBA8 버퍼의 코덱 왕복이다.",
    honestyDisclosureEn: "Honesty Disclosure: architecture-budget-model covers MIP0 payload estimates; permission, allocation, storage, and disk telemetry are unverified. Extra MIPs and metadata are excluded; 96 cells are representative. measured-in-memory verifies an RGBA8 example or supplied RGBA8 buffer, not a manuscript or 16-bit HDR storage.",
    summaryKo: `${preset.shortLabelKo} · ${memoryBudget.shortLabelKo} · MIP ${selectedMipLevel} · VRAM ${vramUsedMiB}/${memoryBudget.vramCapMiB}MiB(${vramUtilizationPct}%) · OPFS 스필 ${opfsColdTiles.toLocaleString("en-US")}타일 · 뷰포트 방출 0건`,
    summaryEn: `${preset.shortLabelEn} · ${memoryBudget.shortLabelEn} · MIP ${selectedMipLevel} · VRAM ${vramUsedMiB}/${memoryBudget.vramCapMiB}MiB (${vramUtilizationPct}%) · OPFS spill ${opfsColdTiles.toLocaleString("en-US")} tiles · 0 viewport evictions`,
  };
}

/** Web Storage 대신 순수 인메모리 슬랩 객체로 압축 타일을 보관하는 스왑 슬롯 풀을 생성한다. */
export function createInMemorySwapSlotPool(): InMemorySwapSlotPool {
  const slots: Record<string, InMemoryTileSwapSlot> = Object.create(null) as Record<string, InMemoryTileSwapSlot>;
  let writeSeq = 0;
  return {
    write(slotKey, compressed) {
      requireSwapSlotKey(slotKey); requireTileBytes(compressed, "Uint8Array", MAX_TILE_ENCODED_BYTES);
      const currentBytes = Object.values(slots).reduce((sum, item) => sum + item.byteLength, 0);
      if ((!slots[slotKey] && Object.keys(slots).length >= MAX_SWAP_SLOTS) || currentBytes - (slots[slotKey]?.byteLength ?? 0) + compressed.byteLength > MAX_SWAP_POOL_BYTES) throw new RangeError("인메모리 예제 슬롯 풀 상한을 초과했습니다.");
      writeSeq += 1;
      const payload = new Uint8Array(compressed);
      const entry: InMemoryTileSwapSlot = { slotKey, byteLength: payload.byteLength, storedAtStep: writeSeq, payload };
      slots[slotKey] = entry;
      return { ...entry, payload: new Uint8Array(payload) };
    },
    read(slotKey) {
      const found = slots[slotKey];
      return found ? new Uint8Array(found.payload) : null;
    },
    remove(slotKey) {
      if (!(slotKey in slots)) return false;
      delete slots[slotKey];
      return true;
    },
    listKeys: () => Object.keys(slots),
    totalStoredBytes: () => Object.values(slots).reduce((acc, item) => acc + item.byteLength, 0),
  };
}

/** 프리셋별 실제 드로잉 특성(여백·선화·그라데이션·셀 채색)을 반영한 결정론적 테스트 타일 버퍼를 생성한다. */
export function generateSyntheticTileBuffer(
  presetId: GigaCanvasPresetId, tileX = 2, tileY = 4, tileSize: number = VIRTUAL_TILE_SIZE,
): Uint8ClampedArray {
  const size = normalizedSampleTileSize(tileSize);
  const pixels = new Uint8ClampedArray(size * size * 4);
  const seedShift = (tileX * 19 + tileY * 37) & 0x3f;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const off = (y * size + x) * 4;
      if (presetId === "webtoon-100cut-scroll") {
        const isBorder = x < 6 || x >= size - 6 || y < 6 || y >= size - 6;
        const inToneBox = x >= 44 && x < size - 44 && y >= 56 && y < size - 56;
        const isInk = Math.abs(x - y + (seedShift - 32)) <= 2;
        if (isBorder || isInk) { pixels[off] = 24; pixels[off + 1] = 26; pixels[off + 2] = 32; pixels[off + 3] = 255; }
        else if (inToneBox) { pixels[off] = 226; pixels[off + 1] = 232; pixels[off + 2] = 240; pixels[off + 3] = 255; }
        else { pixels[off] = 250; pixels[off + 1] = 250; pixels[off + 2] = 248; pixels[off + 3] = 255; }
      } else if (presetId === "ultra-16k-illustration") {
        const grad = Math.floor((y * 140) / size) + 70;
        const inSil = (x - size * 0.5) ** 2 + (y - size * 0.62) ** 2 < (size * 0.24) ** 2;
        pixels[off] = inSil ? 42 : Math.min(255, 110 + ((x + seedShift) >> 2));
        pixels[off + 1] = inSil ? 64 : Math.min(255, grad);
        pixels[off + 2] = inSil ? 92 : Math.min(255, grad + 28);
        pixels[off + 3] = 255;
      } else if (presetId === "hdr-32k-cover") {
        const band = (y >> 4) % 4 === 0;
        const sheen = Math.min(255, ((x + (y >> 1) + seedShift) & 0xff));
        pixels[off] = band ? 236 : sheen; pixels[off + 1] = band ? 186 : Math.min(255, ((y + seedShift) & 0xff));
        pixels[off + 2] = band ? 96 : Math.min(255, ((x >> 1) + 48)); pixels[off + 3] = 255;
      } else {
        const inMargin = x < 24 || x >= size - 24 || y < 24 || y >= size - 24;
        if (inMargin) { pixels[off] = 0; pixels[off + 1] = 0; pixels[off + 2] = 0; pixels[off + 3] = 0; }
        else {
          const block = ((x >> 5) + (y >> 5)) & 1;
          pixels[off] = block === 0 ? 238 : 64; pixels[off + 1] = block === 0 ? 224 : 148;
          pixels[off + 2] = block === 0 ? 204 : 182; pixels[off + 3] = 255;
        }
      }
    }
  }
  return pixels;
}

/** 실제 Uint8ClampedArray 타일을 RLE-Delta 압축 → 인메모리 스왑 슬롯 기록 → 복원 → FNV-1a 0-diff 검증한다. */
export function verifyTileSwapRoundTrip(input: TileSwapRoundTripInput): TileSwapRoundTripResult {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const { tileX, tileY } = decodeMorton2D(encodeMorton2D(input.tileX ?? 2, input.tileY ?? 4));
  const mortonHex = encodeMorton2D(tileX, tileY).toString(16).padStart(8, "0");
  const tileKey = input.tileKey ?? `m0-z${mortonHex}-${input.presetId}`;
  requireSwapSlotKey(tileKey);
  const tileSize = normalizedSampleTileSize(input.tileSize ?? VIRTUAL_TILE_SIZE);
  if (input.pixels) {
    requireTileBytes(input.pixels, "Uint8ClampedArray", MAX_TILE_RAW_BYTES);
    if (input.pixels.length === 0 || input.pixels.length % 4 !== 0) throw new RangeError("검증 타일은 비어 있지 않은 RGBA8 픽셀 배열이어야 합니다.");
  }
  const sourcePixels = input.pixels?.slice() ?? generateSyntheticTileBuffer(input.presetId, tileX, tileY, tileSize);
  const pixelCount = Math.floor(sourcePixels.length / 4);
  const inferredSide = Math.round(Math.sqrt(pixelCount));
  const tileWidth = input.pixels ? (inferredSide * inferredSide === pixelCount && inferredSide > 0 ? inferredSide : pixelCount) : tileSize;
  const tileHeight = input.pixels ? (inferredSide * inferredSide === pixelCount && inferredSide > 0 ? inferredSide : 1) : tileSize;

  const originalFnv1a = computeFnv1a32(sourcePixels);
  const compressed = compressTileRleDelta(sourcePixels);
  const pool = input.pool ?? createInMemorySwapSlotPool();
  const previous = pool.read(tileKey)?.slice() ?? null;
  const restorePrevious = (): void => { if (previous) pool.write(tileKey, previous); else pool.remove(tileKey); };
  let restoredPixels: Uint8ClampedArray;
  try {
    pool.write(tileKey, compressed);
    const reloaded = pool.read(tileKey);
    if (!reloaded) throw new Error(`In-memory swap slot read failed for key ${tileKey}`);
    restoredPixels = decompressTileRleDelta(reloaded);
  } catch (error) {
    try { restorePrevious(); } catch (restoreError) { throw new AggregateError([error, restoreError], "예제 검증과 기존 슬롯 복원이 실패했습니다.", { cause: restoreError }); }
    throw error;
  }
  const restoredFnv1a = computeFnv1a32(restoredPixels);

  let diffByteCount = Math.abs(sourcePixels.length - restoredPixels.length);
  let firstDiffOffset: number | null = null;
  const minLen = Math.min(sourcePixels.length, restoredPixels.length);
  for (let i = 0; i < minLen; i += 1) {
    if (sourcePixels[i] !== restoredPixels[i]) { diffByteCount += 1; if (firstDiffOffset === null) firstDiffOffset = i; }
  }
  if (firstDiffOffset === null && sourcePixels.length !== restoredPixels.length) firstDiffOffset = minLen;

  const rawBytes = sourcePixels.byteLength;
  const compressedBytes = compressed.byteLength;
  const compressionRatio = compressedBytes === 0 ? 1 : round2(rawBytes / compressedBytes);
  const spaceSavingPct = rawBytes === 0 ? 0 : round1(((rawBytes - compressedBytes) / rawBytes) * 100);
  const isBitExact = diffByteCount === 0 && originalFnv1a === restoredFnv1a;
  if (!isBitExact) restorePrevious();
  const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const originalFnv1aHex = formatFnv1aHex(originalFnv1a);
  const restoredFnv1aHex = formatFnv1aHex(restoredFnv1a);

  return {
    sampleFormat: "rgba8", sampleSource: input.pixels ? "caller-buffer" : "generated-example", opfsPersistenceVerified: false,
    provenance: "measured-in-memory", codec: "ts-rle-delta-v1", storageBackend: "in-memory-slab-slot",
    presetId: input.presetId, tileKey, tileWidth, tileHeight, rawBytes, compressedBytes,
    compressionRatio, spaceSavingPct, originalFnv1a, restoredFnv1a, originalFnv1aHex, restoredFnv1aHex,
    diffByteCount, firstDiffOffset, isBitExact, slotPoolBytesAfterSwap: pool.totalStoredBytes(),
    elapsedMs: round2(Math.max(0, endedAt - startedAt)),
    summaryKo: isBitExact
      ? `실측 통과(0-diff): ${rawBytes.toLocaleString("en-US")}B → ${compressedBytes.toLocaleString("en-US")}B (${compressionRatio}배 · ${spaceSavingPct}% 절감) · FNV-1a ${originalFnv1aHex}`
      : `검증 실패: 불일치 ${diffByteCount}B (FNV-1a ${originalFnv1aHex} vs ${restoredFnv1aHex})`,
    summaryEn: isBitExact
      ? `Measured PASS (0-diff): ${rawBytes.toLocaleString("en-US")}B -> ${compressedBytes.toLocaleString("en-US")}B (${compressionRatio}x · ${spaceSavingPct}% saved) · FNV-1a ${originalFnv1aHex}`
      : `Verification FAIL: ${diffByteCount} differing bytes (FNV-1a ${originalFnv1aHex} vs ${restoredFnv1aHex})`,
  };
}

/** 현재 스와핑 평가 결과와 실측 라운드트립 결과를 JSON 매니페스트로 직렬화한다. */
export function exportGigaCanvasSwapJson(
  evaluation: GigaCanvasSwapEvaluation,
  roundTrip: TileSwapRoundTripResult | null = null,
): { readonly json: string; readonly manifest: GigaCanvasSwapManifest } {
  if (roundTrip && roundTrip.presetId !== evaluation.preset.id) throw new RangeError("다른 프리셋의 바이트 검증은 현재 계획에 첨부할 수 없습니다.");
  const manifest: GigaCanvasSwapManifest = {
    opfsAccessVerified: false, opfsPersistenceVerified: false, gpuExecutionVerified: false,
    schemaVersion: "toonstudio.giga-canvas-virtual-swap.v1",
    preset: evaluation.preset, memoryBudget: evaluation.memoryBudget,
    viewportState: {
      scrollPositionPct: evaluation.scrollPositionPct, zoomPct: evaluation.zoomPct,
      activeDensityPct: evaluation.activeDensityPct, scrollVelocityPxPerSec: evaluation.scrollVelocityPxPerSec,
      lookaheadFrames: evaluation.lookaheadFrames, selectedMipLevel: evaluation.selectedMipLevel,
    },
    memoryAllocation: {
      provenance: evaluation.budgetModelProvenance,
      allocationFeasible: evaluation.allocationFeasible, opfsQuotaExceeded: evaluation.opfsQuotaExceeded,
      accountingScope: evaluation.accountingScope,
      naiveUncompressedMiB: evaluation.naiveUncompressedMiB, cowSentinelSavedMiB: evaluation.cowSentinelSavedMiB,
      vramUsedMiB: evaluation.vramUsedMiB, vramCapMiB: evaluation.vramCapMiB, vramUtilizationPct: evaluation.vramUtilizationPct,
      ramUsedMiB: evaluation.ramUsedMiB, ramCapMiB: evaluation.ramCapMiB, ramUtilizationPct: evaluation.ramUtilizationPct,
      opfsColdSpillMiB: evaluation.opfsColdSpillMiB, watermarkState: evaluation.watermarkState,
      failClosedGuardActive: evaluation.failClosedGuardActive, evictedViewportTileCount: evaluation.evictedViewportTileCount,
    },
    tileCounts: {
      totalVirtualTiles: evaluation.totalVirtualTiles, sparseEmptyTiles: evaluation.sparseEmptyTiles,
      activeAllocatedTiles: evaluation.activeAllocatedTiles, vramHotTiles: evaluation.vramHotTiles,
      ramWarmTiles: evaluation.ramWarmTiles, opfsColdTiles: evaluation.opfsColdTiles,
      pinnedViewportTiles: evaluation.pinnedViewportTiles, prefetchRingTiles: evaluation.prefetchRingTiles,
    },
    opfsColdBatch: evaluation.opfsColdBatch, roundTripVerification: roundTrip,
    honestyDisclosureKo: evaluation.honestyDisclosureKo, honestyDisclosureEn: evaluation.honestyDisclosureEn,
  };
  return { json: JSON.stringify(manifest, null, 2), manifest };
}
