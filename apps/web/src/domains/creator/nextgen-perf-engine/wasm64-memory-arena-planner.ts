/**
 * Wasm64(Memory64) 실시간 기능 감지 · 32비트 안전 폴백 · 8K 다중 레이어/고밀도 3D 메시
 * 타일 메모리 예산 계산 및 스왑리스 64비트 아레나 vs 32비트 LRU 타일 페이징 전략 플래너.
 *
 * - 브라우저 런타임에서 실제 `WebAssembly.Memory({ initial, maximum, address: "i64" })`를
 *   안전하게 프로브하고, 미지원 환경에서는 32비트 선형 힙 상한 + OPFS LRU 페이징으로 자동 전환한다.
 * - 브라우저 저장소 전역 API를 직접 호출하지 않는 순수 판별·계획 계층이다.
 */

export const WASM_PAGE_SIZE_BYTES = 65_536;
export const BYTES_PER_MIB = 1_048_576;
export const WASM32_THEORETICAL_MAX_GIB = 4;
export const WASM32_SAFE_PRACTICAL_MIB = 1_792;
export const WASM64_PRACTICAL_BROWSER_MAX_GIB = 16;
export const DEFAULT_TILE_SIZE_PX = 256;
export const EIGHT_K_WIDTH_PX = 7_680;
export const EIGHT_K_HEIGHT_PX = 4_320;

export type WasmAddressMode = "i64" | "i32" | "unavailable";

export type CanvasPixelBitDepth = "rgba8" | "rgba16f";

export type MemoryArenaStrategyId =
  | "wasm64-swapless-arena"
  | "wasm64-tiered-opfs-overflow"
  | "wasm32-resident-compact"
  | "wasm32-lru-tile-paging";

export type MemoryHealthTone = "good" | "warn" | "bad";

export interface WasmMemoryDescriptorLike {
  readonly initial: number | bigint;
  readonly maximum?: number | bigint;
  readonly shared?: boolean;
  readonly address?: "i32" | "i64";
}

export interface WasmMemoryInstanceLike {
  readonly buffer: ArrayBufferLike;
  readonly grow?: (delta: number | bigint) => number | bigint;
}

export type WasmMemoryConstructorLike = new (
  descriptor: WasmMemoryDescriptorLike,
) => WasmMemoryInstanceLike;

export interface Wasm64RuntimeProbe {
  readonly memoryConstructor?: WasmMemoryConstructorLike | null;
  readonly bigIntFactory?: ((value: number) => bigint) | null;
  readonly deviceMemoryGiB?: number;
  readonly sharedArrayBufferAvailable?: boolean;
  readonly crossOriginIsolated?: boolean;
  readonly nowMs?: number;
}

export interface Wasm64CapabilityReport {
  readonly supported: boolean;
  readonly addressMode: WasmAddressMode;
  readonly wasmAvailable: boolean;
  readonly maxLinearMemoryGiB: number;
  readonly safeArenaCeilingMiB: number;
  readonly deviceMemoryGiB: number;
  readonly sharedMemorySupported: boolean;
  readonly probedPageBytes: number;
  readonly fallbackReason: string | null;
  readonly probedAtMs: number;
}

export interface CanvasMemoryWorkloadPreset {
  readonly id: "8k-32l" | "8k-64l" | "8k-128l" | "8k-3d-mesh";
  readonly labelKo: string;
  readonly badgeKo: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly layerCount: number;
  readonly bitDepth: CanvasPixelBitDepth;
  readonly activeSparseFillRatio: number;
  readonly meshTriangleCount: number;
  readonly undoHistoryDepth: number;
}

export const CANVAS_MEMORY_WORKLOAD_PRESETS: readonly CanvasMemoryWorkloadPreset[] = Object.freeze([
  Object.freeze({
    id: "8k-32l",
    labelKo: "8K · 32레이어",
    badgeKo: "표준 연재 마스터",
    widthPx: EIGHT_K_WIDTH_PX,
    heightPx: EIGHT_K_HEIGHT_PX,
    layerCount: 32,
    bitDepth: "rgba8",
    activeSparseFillRatio: 0.45,
    meshTriangleCount: 0,
    undoHistoryDepth: 24,
  }),
  Object.freeze({
    id: "8k-64l",
    labelKo: "8K · 64레이어",
    badgeKo: "풀컬러 연출 원고",
    widthPx: EIGHT_K_WIDTH_PX,
    heightPx: EIGHT_K_HEIGHT_PX,
    layerCount: 64,
    bitDepth: "rgba8",
    activeSparseFillRatio: 0.48,
    meshTriangleCount: 250_000,
    undoHistoryDepth: 32,
  }),
  Object.freeze({
    id: "8k-128l",
    labelKo: "8K · 128레이어",
    badgeKo: "극장판·복합 이펙트",
    widthPx: EIGHT_K_WIDTH_PX,
    heightPx: EIGHT_K_HEIGHT_PX,
    layerCount: 128,
    bitDepth: "rgba8",
    activeSparseFillRatio: 0.46,
    meshTriangleCount: 500_000,
    undoHistoryDepth: 36,
  }),
  Object.freeze({
    id: "8k-3d-mesh",
    labelKo: "8K + 고밀도 3D",
    badgeKo: "3.2M 트라이앵글 배경",
    widthPx: EIGHT_K_WIDTH_PX,
    heightPx: EIGHT_K_HEIGHT_PX,
    layerCount: 64,
    bitDepth: "rgba16f",
    activeSparseFillRatio: 0.42,
    meshTriangleCount: 3_200_000,
    undoHistoryDepth: 24,
  }),
]);

export interface CanvasMemoryStrategyInput {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly layerCount: number;
  readonly bitDepth?: CanvasPixelBitDepth;
  readonly tileSizePx?: number;
  readonly activeSparseFillRatio?: number;
  readonly meshTriangleCount?: number;
  readonly undoHistoryDepth?: number;
  readonly deviceMemoryGiB?: number;
  readonly wasm64?: Wasm64CapabilityReport;
  readonly opfsAvailable?: boolean;
}

export interface CanvasMemoryBudgetBreakdown {
  readonly bytesPerPixel: number;
  readonly bytesPerTile: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly tilesPerLayer: number;
  readonly activeTilesTotal: number;
  readonly denseLayersMiB: number;
  readonly activeLayersMiB: number;
  readonly meshGeometryMiB: number;
  readonly compositorScratchMiB: number;
  readonly undoDeltaRingMiB: number;
  readonly totalRequiredMiB: number;
}

export interface CanvasMemoryStrategyPlan {
  readonly strategy: MemoryArenaStrategyId;
  readonly addressMode: WasmAddressMode;
  readonly swapless: boolean;
  readonly usesLruTilePaging: boolean;
  readonly pagingBackingStore: "none" | "opfs-async-tier" | "compressed-memory-ring";
  readonly breakdown: CanvasMemoryBudgetBreakdown;
  readonly arenaCeilingMiB: number;
  readonly residentArenaMiB: number;
  readonly opfsSpillMiB: number;
  readonly residentTileLimit: number;
  readonly evictedTileCount: number;
  readonly wasmPageCount64KiB: number;
  readonly estimatedSwapStallMsPerPan: number;
  readonly budgetUtilizationRatio: number;
  readonly healthTone: MemoryHealthTone;
  readonly strategyLabelKo: string;
  readonly summaryKo: string;
  readonly recommendationKo: string;
}

export interface Wasm64ComparisonSummary {
  readonly wasm64Plan: CanvasMemoryStrategyPlan;
  readonly wasm32Plan: CanvasMemoryStrategyPlan;
  readonly swapStallSavedMs: number;
  readonly avoidedOpfsSpillMiB: number;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function readNavigatorDeviceMemoryGiB(): number {
  if (typeof globalThis === "undefined") return 8;
  const nav = (globalThis as { readonly navigator?: { readonly deviceMemory?: unknown } }).navigator;
  if (!nav || typeof nav.deviceMemory !== "number" || !Number.isFinite(nav.deviceMemory)) {
    return 8;
  }
  return clampNumber(nav.deviceMemory, 1, 128);
}

function resolveDefaultMemoryConstructor(): WasmMemoryConstructorLike | null {
  if (typeof globalThis === "undefined") return null;
  const wasm = (
    globalThis as { readonly WebAssembly?: { readonly Memory?: unknown } }
  ).WebAssembly;
  if (!wasm || typeof wasm.Memory !== "function") return null;
  return wasm.Memory as WasmMemoryConstructorLike;
}

function resolveDefaultBigIntFactory(): ((value: number) => bigint) | null {
  if (typeof globalThis === "undefined") return null;
  const factory = (globalThis as { readonly BigInt?: unknown }).BigInt;
  return typeof factory === "function" ? (factory as (value: number) => bigint) : null;
}

function resolveSafeArenaCeilingMiB(addressMode: WasmAddressMode, deviceMemoryGiB: number): number {
  const ramMiB = deviceMemoryGiB * 1_024;
  if (addressMode === "i64") {
    const browserCapMiB = WASM64_PRACTICAL_BROWSER_MAX_GIB * 1_024;
    return Math.round(clampNumber(ramMiB * 0.68, 1_536, browserCapMiB));
  }
  if (addressMode === "i32") {
    return Math.round(clampNumber(ramMiB * 0.42, 512, WASM32_SAFE_PRACTICAL_MIB));
  }
  return 0;
}

/**
 * 현재 런타임의 Wasm64(Memory64) 지원 여부를 실제 `WebAssembly.Memory({ address: "i64" })`
 * 할당으로 검증하고, 미지원 환경에서는 32비트 안전 폴백 프로파일을 반환한다.
 */
export function detectWasm64Support(probe: Wasm64RuntimeProbe = {}): Wasm64CapabilityReport {
  const deviceMemoryGiB = clampNumber(
    probe.deviceMemoryGiB ?? readNavigatorDeviceMemoryGiB(),
    1,
    128,
  );
  const nowMs = probe.nowMs ?? Date.now();
  const sharedMemorySupported = Boolean(
    (probe.sharedArrayBufferAvailable ?? typeof SharedArrayBuffer !== "undefined")
      && (probe.crossOriginIsolated
        ?? Boolean(
          typeof globalThis !== "undefined"
            && (globalThis as { readonly crossOriginIsolated?: unknown }).crossOriginIsolated,
        )),
  );

  const MemoryCtor =
    probe.memoryConstructor !== undefined
      ? probe.memoryConstructor
      : resolveDefaultMemoryConstructor();

  if (!MemoryCtor) {
    return Object.freeze({
      supported: false,
      addressMode: "unavailable",
      wasmAvailable: false,
      maxLinearMemoryGiB: 0,
      safeArenaCeilingMiB: 0,
      deviceMemoryGiB,
      sharedMemorySupported,
      probedPageBytes: 0,
      fallbackReason: "WebAssembly.Memory 생성자를 찾지 못해 캔버스 JS 폴백 경로를 사용합니다.",
      probedAtMs: nowMs,
    });
  }

  const bigIntFactory =
    probe.bigIntFactory !== undefined ? probe.bigIntFactory : resolveDefaultBigIntFactory();

  let i64FailureReason: string;

  if (bigIntFactory) {
    try {
      const initialPages = bigIntFactory(1);
      const maxPages = bigIntFactory(2);
      const memory64 = new MemoryCtor({
        initial: initialPages,
        maximum: maxPages,
        address: "i64",
      });
      const byteLength = memory64?.buffer?.byteLength ?? 0;
      if (byteLength >= WASM_PAGE_SIZE_BYTES) {
        // Memory64 스펙에서 grow()는 BigInt 인자를 수용한다. grow 메서드가 있으면 0페이지 확장으로 i64 경로를 재확인한다.
        if (typeof memory64.grow === "function") {
          memory64.grow(bigIntFactory(0));
        }
        return Object.freeze({
          supported: true,
          addressMode: "i64",
          wasmAvailable: true,
          maxLinearMemoryGiB: WASM64_PRACTICAL_BROWSER_MAX_GIB,
          safeArenaCeilingMiB: resolveSafeArenaCeilingMiB("i64", deviceMemoryGiB),
          deviceMemoryGiB,
          sharedMemorySupported,
          probedPageBytes: byteLength,
          fallbackReason: null,
          probedAtMs: nowMs,
        });
      }
      i64FailureReason = "Wasm64 메모리 버퍼 크기가 1페이지(64KiB) 미만으로 검증에 실패했습니다.";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      i64FailureReason = `Memory64(i64) 미지원 런타임(${message}) — 32비트 LRU 타일 페이징으로 안전 전환`;
    }
  } else {
    i64FailureReason = "BigInt 생성자가 없어 Wasm64(i64) 주소 지정 대신 32비트 모드로 전환합니다.";
  }

  // 32비트 표준 WebAssembly.Memory 안전 폴백 프로브
  try {
    const memory32 = new MemoryCtor({ initial: 1, maximum: 2 });
    const byteLength = memory32?.buffer?.byteLength ?? 0;
    if (byteLength >= WASM_PAGE_SIZE_BYTES) {
      return Object.freeze({
        supported: false,
        addressMode: "i32",
        wasmAvailable: true,
        maxLinearMemoryGiB: WASM32_THEORETICAL_MAX_GIB,
        safeArenaCeilingMiB: resolveSafeArenaCeilingMiB("i32", deviceMemoryGiB),
        deviceMemoryGiB,
        sharedMemorySupported,
        probedPageBytes: byteLength,
        fallbackReason: i64FailureReason,
        probedAtMs: nowMs,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Object.freeze({
      supported: false,
      addressMode: "unavailable",
      wasmAvailable: false,
      maxLinearMemoryGiB: 0,
      safeArenaCeilingMiB: 0,
      deviceMemoryGiB,
      sharedMemorySupported,
      probedPageBytes: 0,
      fallbackReason: `WebAssembly 선형 메모리 초기화 실패(${message})`,
      probedAtMs: nowMs,
    });
  }

  return Object.freeze({
    supported: false,
    addressMode: "unavailable",
    wasmAvailable: false,
    maxLinearMemoryGiB: 0,
    safeArenaCeilingMiB: 0,
    deviceMemoryGiB,
    sharedMemorySupported,
    probedPageBytes: 0,
    fallbackReason: i64FailureReason ?? "32비트 WebAssembly 메모리 프로브 결과가 유효하지 않습니다.",
    probedAtMs: nowMs,
  });
}

/**
 * 8K 다중 레이어 · 고밀도 3D 메시 작업의 타일 메모리 예산을 계산하고,
 * Wasm64 스왑리스 64비트 아레나 vs 32비트 LRU 타일 페이징 전략을 자동 선택한다.
 */
export function planCanvasMemoryStrategy(
  input: CanvasMemoryStrategyInput,
): CanvasMemoryStrategyPlan {
  const widthPx = Math.round(clampNumber(input.widthPx, 256, 16_384));
  const heightPx = Math.round(clampNumber(input.heightPx, 256, 16_384));
  const layerCount = Math.round(clampNumber(input.layerCount, 1, 512));
  const bitDepth: CanvasPixelBitDepth = input.bitDepth ?? "rgba8";
  const tileSizePx = Math.round(clampNumber(input.tileSizePx ?? DEFAULT_TILE_SIZE_PX, 64, 1_024));
  const sparseFillRatio = clampNumber(input.activeSparseFillRatio ?? 0.45, 0.05, 1.0);
  const meshTriangleCount = Math.round(clampNumber(input.meshTriangleCount ?? 0, 0, 20_000_000));
  const undoHistoryDepth = Math.round(clampNumber(input.undoHistoryDepth ?? 24, 0, 200));
  const opfsAvailable = input.opfsAvailable ?? true;

  const wasm64 =
    input.wasm64
    ?? detectWasm64Support(
      input.deviceMemoryGiB !== undefined ? { deviceMemoryGiB: input.deviceMemoryGiB } : {},
    );

  const effectiveDeviceGiB = clampNumber(
    input.deviceMemoryGiB ?? wasm64.deviceMemoryGiB,
    1,
    128,
  );
  const arenaCeilingMiB =
    input.deviceMemoryGiB !== undefined
      ? resolveSafeArenaCeilingMiB(wasm64.addressMode, effectiveDeviceGiB)
      : wasm64.safeArenaCeilingMiB;

  const bytesPerPixel = bitDepth === "rgba16f" ? 8 : 4;
  const bytesPerTile = tileSizePx * tileSizePx * bytesPerPixel;
  const tilesX = Math.ceil(widthPx / tileSizePx);
  const tilesY = Math.ceil(heightPx / tileSizePx);
  const tilesPerLayer = tilesX * tilesY;
  const denseTileCount = tilesPerLayer * layerCount;
  const activeTilesTotal = Math.max(1, Math.ceil(denseTileCount * sparseFillRatio));

  const denseLayersMiB = (denseTileCount * bytesPerTile) / BYTES_PER_MIB;
  const activeLayersMiB = (activeTilesTotal * bytesPerTile) / BYTES_PER_MIB;

  // 3D 메시 메모리: 정점(pos/norm/uv/tangent ≈ 48B * 0.65 tris) + 인덱스(12B/tri) + BVH(32B/tri) + 모프/아틀라스 오버헤드(18B/tri) ≈ 93.2B/tri
  const meshBytes = meshTriangleCount * 93.2;
  const meshGeometryMiB = meshBytes / BYTES_PER_MIB;

  // 합성기 워킹셋: 밉 피라미드(1.33x 단일 레이어) + 스트로크 핑퐁 버퍼(2x) + 에이프런 작업 타일
  const compositorScratchBytes = tilesPerLayer * bytesPerTile * 3.33;
  const compositorScratchMiB = compositorScratchBytes / BYTES_PER_MIB;

  // LZ4 차분 압축 언두 링(단계당 평균 변경 타일 최대 36개 × 0.35 압축비)
  const avgDirtyTilesPerStep = Math.min(tilesPerLayer, 36);
  const undoDeltaBytes = undoHistoryDepth * avgDirtyTilesPerStep * bytesPerTile * 0.35;
  const undoDeltaRingMiB = undoDeltaBytes / BYTES_PER_MIB;

  const totalRequiredMiB =
    activeLayersMiB + meshGeometryMiB + compositorScratchMiB + undoDeltaRingMiB;

  const usableCeilingMiB = Math.max(256, arenaCeilingMiB);
  const budgetUtilizationRatio = round1((totalRequiredMiB / usableCeilingMiB) * 100) / 100;

  let strategy: MemoryArenaStrategyId;
  let swapless: boolean;
  let usesLruTilePaging: boolean;
  let pagingBackingStore: "none" | "opfs-async-tier" | "compressed-memory-ring";
  let strategyLabelKo: string;
  let summaryKo: string;
  let recommendationKo: string;
  let healthTone: MemoryHealthTone;

  if (wasm64.supported && totalRequiredMiB <= arenaCeilingMiB) {
    strategy = "wasm64-swapless-arena";
    swapless = true;
    usesLruTilePaging = false;
    pagingBackingStore = "none";
    healthTone = budgetUtilizationRatio <= 0.78 ? "good" : "warn";
    strategyLabelKo = "Wasm64 스왑리스 64비트 아레나";
    summaryKo = `${widthPx}×${heightPx} · ${layerCount}레이어 전체 활성 타일을 단일 64비트 선형 메모리에 스왑 없이 상주시킵니다.`;
    recommendationKo =
      "디스크 스왑 지연 0ms로 8K 팬·줌·레이어 스크럽과 고밀도 3D 메시 편집을 즉시 처리할 수 있습니다.";
  } else if (wasm64.supported) {
    strategy = "wasm64-tiered-opfs-overflow";
    swapless = false;
    usesLruTilePaging = true;
    pagingBackingStore = opfsAvailable ? "opfs-async-tier" : "compressed-memory-ring";
    healthTone = "warn";
    strategyLabelKo = "Wasm64 광역 아레나 + OPFS 콜드 티어링";
    summaryKo = `필요 예산(${formatMemoryMiB(totalRequiredMiB)})이 기기 안전 상한(${formatMemoryMiB(arenaCeilingMiB)})을 넘어 비활성 레이어를 비동기 OPFS 티어로 분산합니다.`;
    recommendationKo =
      "보이는 컷·최근 편집 레이어는 64비트 핫 아레나에 고정하고, 휴면 레이어만 백그라운드 스필해 끊김을 최소화합니다.";
  } else if (wasm64.addressMode === "i32" && totalRequiredMiB <= arenaCeilingMiB) {
    strategy = "wasm32-resident-compact";
    swapless = true;
    usesLruTilePaging = false;
    pagingBackingStore = "none";
    healthTone = budgetUtilizationRatio <= 0.75 ? "good" : "warn";
    strategyLabelKo = "Wasm32 상주 콤팩트 아레나";
    summaryKo = `32비트 안전 힙 상한(${formatMemoryMiB(arenaCeilingMiB)}) 안에 작업 세트가 수용되어 페이징 없이 동작합니다.`;
    recommendationKo =
      "레이어 수가 64개 이상으로 늘어나거나 RGBA16F로 전환하면 자동으로 256px LRU 타일 페이징으로 전환됩니다.";
  } else {
    strategy = "wasm32-lru-tile-paging";
    swapless = false;
    usesLruTilePaging = true;
    pagingBackingStore = opfsAvailable ? "opfs-async-tier" : "compressed-memory-ring";
    healthTone = budgetUtilizationRatio >= 2.2 ? "bad" : "warn";
    strategyLabelKo = "Wasm32 256px LRU 타일 페이징 폴백";
    summaryKo = `32비트 주소 공간 안전 상한(${formatMemoryMiB(usableCeilingMiB)}) 초과분(${formatMemoryMiB(Math.max(0, totalRequiredMiB - usableCeilingMiB))})을 256×256px LRU 타일 캐시로 페이징합니다.`;
    recommendationKo = opfsAvailable
      ? "OPFS 비동기 타일 스필로 OOM 충돌을 차단합니다. Memory64 지원 크롬 최신 버전 사용 시 스왑리스 모드로 자동 승격됩니다."
      : "OPFS 미지원 환경이므로 메모리 내 압축 차분 링으로 대체합니다. 레이어 병합 또는 RGBA8 사용을 권장합니다.";
  }

  const residentArenaMiB = swapless ? totalRequiredMiB : Math.min(totalRequiredMiB, usableCeilingMiB);
  const opfsSpillMiB = swapless ? 0 : Math.max(0, totalRequiredMiB - residentArenaMiB);
  const nonLayerOverheadMiB = meshGeometryMiB + compositorScratchMiB + undoDeltaRingMiB;
  const residentLayerBudgetBytes = Math.max(
    bytesPerTile * Math.min(activeTilesTotal, 64),
    (residentArenaMiB - Math.min(nonLayerOverheadMiB, residentArenaMiB * 0.55)) * BYTES_PER_MIB,
  );
  const residentTileLimit = swapless
    ? activeTilesTotal
    : Math.max(64, Math.min(activeTilesTotal, Math.floor(residentLayerBudgetBytes / bytesPerTile)));
  const evictedTileCount = Math.max(0, activeTilesTotal - residentTileLimit);
  const wasmPageCount64KiB = Math.ceil((residentArenaMiB * BYTES_PER_MIB) / WASM_PAGE_SIZE_BYTES);

  // 뷰포트 팬/레이어 전환 시 스왑 지연 예측(ms)
  const spillRatio = activeTilesTotal > 0 ? evictedTileCount / activeTilesTotal : 0;
  const estimatedSwapStallMsPerPan = swapless
    ? 0
    : round1(
        (pagingBackingStore === "opfs-async-tier" ? 4.2 : 11.5)
          + spillRatio * (wasm64.supported ? 9.5 : 24.0),
      );

  return Object.freeze({
    strategy,
    addressMode: wasm64.addressMode,
    swapless,
    usesLruTilePaging,
    pagingBackingStore,
    breakdown: Object.freeze({
      bytesPerPixel,
      bytesPerTile,
      tilesX,
      tilesY,
      tilesPerLayer,
      activeTilesTotal,
      denseLayersMiB: round1(denseLayersMiB),
      activeLayersMiB: round1(activeLayersMiB),
      meshGeometryMiB: round1(meshGeometryMiB),
      compositorScratchMiB: round1(compositorScratchMiB),
      undoDeltaRingMiB: round1(undoDeltaRingMiB),
      totalRequiredMiB: round1(totalRequiredMiB),
    }),
    arenaCeilingMiB: round1(usableCeilingMiB),
    residentArenaMiB: round1(residentArenaMiB),
    opfsSpillMiB: round1(opfsSpillMiB),
    residentTileLimit,
    evictedTileCount,
    wasmPageCount64KiB,
    estimatedSwapStallMsPerPan,
    budgetUtilizationRatio,
    healthTone,
    strategyLabelKo,
    summaryKo,
    recommendationKo,
  });
}

/**
 * 동일 8K 작업 부하에 대해 Wasm64(64비트)와 Wasm32(32비트) 전략을 나란히 시뮬레이션해
 * 스왑 지연 절감량과 회피한 OPFS 스필 용량을 계산한다.
 */
export function compareWasm64VsWasm32Plan(
  input: Omit<CanvasMemoryStrategyInput, "wasm64">,
  deviceMemoryGiB = 16,
): Wasm64ComparisonSummary {
  const ramGiB = clampNumber(deviceMemoryGiB, 2, 128);
  const simulatedWasm64: Wasm64CapabilityReport = Object.freeze({
    supported: true,
    addressMode: "i64",
    wasmAvailable: true,
    maxLinearMemoryGiB: WASM64_PRACTICAL_BROWSER_MAX_GIB,
    safeArenaCeilingMiB: resolveSafeArenaCeilingMiB("i64", ramGiB),
    deviceMemoryGiB: ramGiB,
    sharedMemorySupported: true,
    probedPageBytes: WASM_PAGE_SIZE_BYTES,
    fallbackReason: null,
    probedAtMs: 0,
  });
  const simulatedWasm32: Wasm64CapabilityReport = Object.freeze({
    supported: false,
    addressMode: "i32",
    wasmAvailable: true,
    maxLinearMemoryGiB: WASM32_THEORETICAL_MAX_GIB,
    safeArenaCeilingMiB: resolveSafeArenaCeilingMiB("i32", ramGiB),
    deviceMemoryGiB: ramGiB,
    sharedMemorySupported: false,
    probedPageBytes: WASM_PAGE_SIZE_BYTES,
    fallbackReason: "32비트 시뮬레이션 비교 모드",
    probedAtMs: 0,
  });

  const wasm64Plan = planCanvasMemoryStrategy({
    ...input,
    deviceMemoryGiB: ramGiB,
    wasm64: simulatedWasm64,
  });
  const wasm32Plan = planCanvasMemoryStrategy({
    ...input,
    deviceMemoryGiB: ramGiB,
    wasm64: simulatedWasm32,
  });

  return Object.freeze({
    wasm64Plan,
    wasm32Plan,
    swapStallSavedMs: round1(
      Math.max(0, wasm32Plan.estimatedSwapStallMsPerPan - wasm64Plan.estimatedSwapStallMsPerPan),
    ),
    avoidedOpfsSpillMiB: round1(Math.max(0, wasm32Plan.opfsSpillMiB - wasm64Plan.opfsSpillMiB)),
  });
}

export function formatMemoryMiB(mib: number): string {
  const safe = Number.isFinite(mib) ? Math.max(0, mib) : 0;
  if (safe >= 1_024) {
    return `${(safe / 1_024).toFixed(2)} GiB`;
  }
  return `${Math.round(safe)} MiB`;
}
