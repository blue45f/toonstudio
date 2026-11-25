/**
 * Wave 51C — Konva 탈피 · Rust WASM32/64 듀얼 타깃 + WebGPU 네이티브 전환 아키텍처 엔진.
 *
 * - Konva 4계층 분리 로드맵(픽셀 핫패스 · 256px 희소 타일 합성 · 벡터/바이너리 코덱 · React/TS 경량 어댑터)
 * - 브라우저 런타임 기능 탐지 및 자동 티어 선택(WASM32-SIMD128 · WASM64 4GB+ 자동 승격 · WebGPU WGSL)
 * - 256×256 RGBA8(256KB) / RGBA16F(512KB) 제로카피 링버퍼 & 타일 아레나 · 4,096MB 64비트 경보 · OPFS LRU 스필 설계
 * - 모든 수치는 256×256 타일 바이트 기반의 결정론적 산술 공식만 사용하며 허위 FPS 배수를 추정하지 않는다.
 */

export type NativeTargetRuntimeKind = "rust-wasm-webgpu-wgsl" | "rust-wasm-webgpu-compute" | "rust-wasm-dual-target" | "typescript-thin-adapter";
export type MigrationLayerStatus = "native-kernel-ready" | "adapter-retained";
export type KonvaMigrationLayerId = "pixel-brush-hotpath" | "sparse-tile-compositor" | "vector-warp-binary-codecs" | "ui-ime-gizmo-bridge";
export type TilePixelFormat = "rgba8" | "rgba16f";
export type NativeMigrationScenarioId = "webtoon-long-strip" | "illust-8k-120layer" | "ipad-safari-4k" | "entry-mobile-4gb";
export type NativeExecutionTierId = "webgpu-wasm64-hybrid" | "webgpu-wasm32-simd" | "wasm64-memory64-cpu" | "wasm32-simd128" | "wasm32-scalar-safe";
export type WasmTargetAbi = "wasm64-memory64" | "wasm32-simd128" | "wasm32-scalar";
export type GpuAccelerationPath = "webgpu-wgsl" | "cpu-wasm-fallback";
export type RingTransferMode = "sab-zero-copy-ring" | "transferable-arraybuffer-ring";
export type IosWebKitGuardStatus = "inactive" | "active-safe" | "active-strict-spill";
export type GuardSeverity = "info" | "warn" | "critical";
export type ArenaSegmentId = "resident-tiles" | "ring-buffer" | "undo-delta" | "opfs-spill";
export type RuntimeGuardWarningCode =
  | "WASM64_THRESHOLD_ACTIVE"
  | "WASM64_THRESHOLD_DENSE"
  | "WASM64_UNAVAILABLE_SPILL_REQUIRED"
  | "IOS_WEBKIT_JETSAM_GUARD"
  | "SAB_UNAVAILABLE_TRANSFER_FALLBACK"
  | "WEBGPU_UNAVAILABLE_CPU_PATH"
  | "LOW_DEVICE_MEMORY_BUDGET";

export interface KonvaMigrationLayerSpec {
  readonly id: KonvaMigrationLayerId;
  readonly order: 1 | 2 | 3 | 4;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly legacyKonvaSurfaceKo: string;
  readonly legacyKonvaSurfaceEn: string;
  readonly targetRuntime: NativeTargetRuntimeKind;
  readonly targetRuntimeLabelKo: string;
  readonly targetRuntimeLabelEn: string;
  readonly nativePromotionPct: number;
  readonly tsAdapterSharePct: number;
  readonly targetKonvaDependencyPct: number;
  readonly status: MigrationLayerStatus;
  readonly currentStateKo: string;
  readonly currentStateEn: string;
  readonly targetStateKo: string;
  readonly targetStateEn: string;
  readonly repoModules: readonly string[];
  readonly responsibilitiesKo: readonly string[];
  readonly responsibilitiesEn: readonly string[];
}

export interface KonvaRoadmapSummary {
  readonly totalLayers: number;
  readonly fullyNativeLayers: number;
  readonly retainedAdapterLayers: number;
  readonly nativeCoreSharePct: number;
  readonly tsAdapterSharePct: number;
  readonly tsAdapterTargetBandPct: readonly [number, number];
  readonly targetKonvaRuntimePct: number;
}

export interface RuntimeNativeCapabilityInput {
  readonly webgpuAvailable: boolean;
  readonly wasmMemory64Available: boolean;
  readonly wasmSimd128Available: boolean;
  readonly sharedArrayBufferAvailable: boolean;
  readonly deviceMemoryGb: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly layerCount: number;
  readonly pixelFormat?: TilePixelFormat;
  readonly sparseOccupancyRatio?: number;
  readonly isIosSafariWebKit?: boolean;
  readonly undoHistorySnapshots?: number;
}

export type NormalizedRuntimeCapabilityInput = Required<RuntimeNativeCapabilityInput>;

export interface NativeMigrationScenarioPreset {
  readonly id: NativeMigrationScenarioId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly badgeKo: string;
  readonly badgeEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly input: NormalizedRuntimeCapabilityInput;
}

export interface IosSafariWebKitGuardReport {
  readonly status: IosWebKitGuardStatus;
  readonly jetsamRiskLevel: "low" | "elevated" | "high";
  readonly enforcedMaxResidentMb: number;
  readonly webGpuBufferCapMb: number;
  readonly reasonKo: string;
  readonly reasonEn: string;
  readonly mitigationsKo: readonly string[];
  readonly mitigationsEn: readonly string[];
}

export interface RuntimeGuardWarning {
  readonly code: RuntimeGuardWarningCode;
  readonly severity: GuardSeverity;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
}

export interface RuntimeNativeCapabilityEvaluation {
  readonly normalizedInput: NormalizedRuntimeCapabilityInput;
  readonly selectedTier: NativeExecutionTierId;
  readonly tierLabelKo: string;
  readonly tierLabelEn: string;
  readonly tierRationaleKo: string;
  readonly tierRationaleEn: string;
  readonly selectedWasmTarget: WasmTargetAbi;
  readonly gpuPath: GpuAccelerationPath;
  readonly ringTransferMode: RingTransferMode;
  readonly wasm64AutoPromoted: boolean;
  readonly wasm64BlockedByRuntime: boolean;
  readonly tileDimensionPx: number;
  readonly tileSizeKb: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly tilesPerLayer: number;
  readonly denseTotalTiles: number;
  readonly sparseActiveTiles: number;
  readonly denseTileRamMb: number;
  readonly sparseActiveTileRamMb: number;
  readonly ringBufferRamMb: number;
  readonly undoDeltaRamMb: number;
  readonly estimatedTileRamMb: number;
  readonly totalAddressablePeakMb: number;
  readonly safeRamBudgetMb: number;
  readonly inRamResidentRamMb: number;
  readonly opfsSpillRequiredMb: number;
  readonly opfsDenseWorstCaseSpillMb: number;
  readonly exceeds4096MbActive: boolean;
  readonly exceeds4096MbDense: boolean;
  readonly iosSafariWebKitGuard: IosSafariWebKitGuardReport;
  readonly warnings: readonly RuntimeGuardWarning[];
  readonly formulaDisclosureKo: string;
  readonly formulaDisclosureEn: string;
}

export interface TileArenaSegment {
  readonly id: ArenaSegmentId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly mb: number;
  readonly shareOfWorkingSetPct: number;
}

export interface OpfsLruSpillPolicy {
  readonly enabled: boolean;
  readonly storageBackend: "opfs-sync-access-handle-256px";
  readonly maxResidentTiles: number;
  readonly spilledColdTiles: number;
  readonly evictionHighWatermarkPct: number;
  readonly evictionLowWatermarkPct: number;
  readonly spillWriteBatchTiles: number;
  readonly estimatedOpfsDiskMb: number;
  readonly policySummaryKo: string;
  readonly policySummaryEn: string;
}

export interface ZeroCopyRingBufferSpec {
  readonly slotCount: number;
  readonly storageAlignmentBytes: number;
  readonly viewportTileWindow: number;
  readonly bytesPerSlot: number;
  readonly totalRingBytes: number;
  readonly totalRingMb: number;
  readonly backingMemoryKind: "SharedArrayBuffer" | "TransferableArrayBuffer";
  readonly zeroCopyEligible: boolean;
}

export interface ZeroCopyTileArenaPlan {
  readonly pixelFormat: TilePixelFormat;
  readonly tileDimensionPx: number;
  readonly bytesPerTile: number;
  readonly tileSizeKb: number;
  readonly wasm64ThresholdMb: number;
  readonly offsetAddressMode: "u64-memory64" | "u32-linear-guarded";
  readonly thresholdAlertLevel: "safe" | "approaching" | "exceeded";
  readonly exceeds4096MbThreshold: boolean;
  readonly alertMessageKo: string;
  readonly alertMessageEn: string;
  readonly ringBuffer: ZeroCopyRingBufferSpec;
  readonly opfsLruPolicy: OpfsLruSpillPolicy;
  readonly segments: readonly TileArenaSegment[];
  readonly estimatedWorkingSetMb: number;
  readonly safeRamBudgetMb: number;
}

export interface NativeMigrationManifest {
  readonly schemaVersion: "toonstudio.native-wasm-migration-manifest.v1";
  readonly scenarioId: NativeMigrationScenarioId | "custom";
  readonly scenarioNameKo: string;
  readonly scenarioNameEn: string;
  readonly runtimeInput: NormalizedRuntimeCapabilityInput;
  readonly capabilityEvaluation: RuntimeNativeCapabilityEvaluation;
  readonly tileArenaPlan: ZeroCopyTileArenaPlan;
  readonly konvaMigrationLayers: readonly KonvaMigrationLayerSpec[];
  readonly roadmapSummary: KonvaRoadmapSummary;
  readonly honestyNoteKo: string;
  readonly honestyNoteEn: string;
}

export const TILE_DIMENSION_PX = 256 as const;
export const TILE_RGBA8_BYTES = 256 * 256 * 4;
export const TILE_RGBA16F_BYTES = 256 * 256 * 8;
export const BYTES_PER_MIB = 1024 * 1024;
export const WASM64_OFFSET_THRESHOLD_MB = 4096 as const;
export const WASM32_APPROACHING_THRESHOLD_MB = 3072 as const;
export const ZERO_COPY_RING_SLOTS = 3 as const;
export const WEBGPU_STORAGE_ALIGNMENT_BYTES = 256 as const;
export const MAX_VIEWPORT_RING_TILES = 96 as const;

export const KONVA_MIGRATION_LAYERS: readonly KonvaMigrationLayerSpec[] = [
  {
    id: "pixel-brush-hotpath", order: 1,
    titleKo: "1계층 · 픽셀 브러시 · 요철 · 임파스토 핫패스",
    titleEn: "Layer 1 · Pixel Brush · Paper Relief · Impasto Hotpath",
    legacyKonvaSurfaceKo: "Konva 2D 캔버스 스트로크 재드로우 및 JS 픽셀 루프",
    legacyKonvaSurfaceEn: "Konva 2D canvas stroke redraw & JS main-thread pixel loop",
    targetRuntime: "rust-wasm-webgpu-wgsl",
    targetRuntimeLabelKo: "Rust WASM + WebGPU WGSL",
    targetRuntimeLabelEn: "Rust WASM + WebGPU WGSL",
    nativePromotionPct: 100, tsAdapterSharePct: 0, targetKonvaDependencyPct: 0,
    status: "native-kernel-ready",
    currentStateKo: "현재: Rust 커널(임파스토·KM16·블러) 및 WGSL 셰이더 구축, 일부 라이브 스트로크는 Konva 브리지 병행",
    currentStateEn: "Current: Rust kernels & WGSL shaders built; selected live strokes still bridge via Konva",
    targetStateKo: "목표: 포인터 샘플을 제로카피 링버퍼로 직송해 100% Rust/WGSL 핫패스로 승격",
    targetStateEn: "Target: Stream pointer samples over zero-copy ring buffer into 100% Rust/WGSL hotpath",
    repoModules: ["crates/studio-wasm64-drawing-core", "packages/studio-hokusai-wasm", "apps/web/src/domains/creator/webgpu-zero-copy-studio"],
    responsibilitiesKo: ["필압·기울기 스탬프 보간 및 16파장 Kubelka-Munk 감산 혼색", "3×3 Sobel 2.5D 임파스토 높이장 및 월드 좌표 종이 요철 샘플링"],
    responsibilitiesEn: ["Pressure/tilt stamp interpolation & 16-band Kubelka-Munk subtractive mixing", "3×3 Sobel 2.5D impasto height-field lighting & world-space paper tooth sampling"],
  },
  {
    id: "sparse-tile-compositor", order: 2,
    titleKo: "2계층 · 멀티 레이어 256px 희소 타일 합성 · 블렌드",
    titleEn: "Layer 2 · Multi-Layer 256px Sparse Tile Compositor & Blend",
    legacyKonvaSurfaceKo: "Konva Stage/Layer 오프스크린 전체 재합성 및 2D 블렌드",
    legacyKonvaSurfaceEn: "Konva Stage/Layer full offscreen recomposite & 2D blend",
    targetRuntime: "rust-wasm-webgpu-compute",
    targetRuntimeLabelKo: "Rust WASM + WebGPU Compute",
    targetRuntimeLabelEn: "Rust WASM + WebGPU Compute",
    nativePromotionPct: 100, tsAdapterSharePct: 0, targetKonvaDependencyPct: 0,
    status: "native-kernel-ready",
    currentStateKo: "현재: WebGPU Compute 합성 셰이더·OPFS v2 타일 저장소 검증 완료, 단계적 스테이지 치환 중",
    currentStateEn: "Current: WebGPU Compute compositor & OPFS v2 tile store verified; staged Konva swap underway",
    targetStateKo: "목표: 256×256 더티 타일만 부분 합성하고 비활성 타일은 OPFS LRU로 스필해 100% 네이티브화",
    targetStateEn: "Target: Composite dirty 256×256 sparse tiles only with OPFS LRU cold spill at 100% native",
    repoModules: ["crates/studio-engine-vello", "apps/web/src/domains/creator/webgpu-zero-copy-studio", "apps/web/src/domains/creator/webcodecs-opfs-engine"],
    responsibilitiesKo: ["256×256 희소 타일 더티 리전 합성 · 클리핑 마스크 · 16비트 선형 블렌드", "타일 아레나 메모리 상한 감시 및 OPFS SyncAccessHandle LRU 스필/복원"],
    responsibilitiesEn: ["256×256 sparse dirty-tile compositing, clipping masks & 16-bit linear blending", "Tile arena memory governor & OPFS SyncAccessHandle LRU spill/restore"],
  },
  {
    id: "vector-warp-binary-codecs", order: 3,
    titleKo: "3계층 · 벡터 잉크 · 퍼펫 워프 · .psd/.clip/.glb 바이너리 파서",
    titleEn: "Layer 3 · Vector Ink · Puppet Warp · .psd/.clip/.glb Binary Codecs",
    legacyKonvaSurfaceKo: "JS ArrayBuffer 파싱 · 메인 스레드 메시 변형 · Konva 벡터 래스터화",
    legacyKonvaSurfaceEn: "JS ArrayBuffer parsing, main-thread mesh warp & Konva vector draw",
    targetRuntime: "rust-wasm-dual-target",
    targetRuntimeLabelKo: "Rust WASM32/64 듀얼 타깃",
    targetRuntimeLabelEn: "Rust WASM32/64 Dual-Target",
    nativePromotionPct: 100, tsAdapterSharePct: 0, targetKonvaDependencyPct: 0,
    status: "native-kernel-ready",
    currentStateKo: "현재: ThorVG/Vello 벡터 엔진 및 WASM64 XOR 타일 델타·ARAP 솔버 기반 확보",
    currentStateEn: "Current: ThorVG/Vello vector engines, WASM64 XOR tile delta & ARAP solver foundations ready",
    targetStateKo: "목표: 대용량 .psd/.clip/.glb 스트리밍 파싱과 퍼펫 워프·벡터 잉크를 Rust WASM32/64로 100% 승격",
    targetStateEn: "Target: Promote streaming .psd/.clip/.glb codecs, puppet warp & vector ink 100% to Rust WASM32/64",
    repoModules: ["packages/studio-engine-thorvg", "packages/studio-format-gateway", "crates/studio-wasm64-drawing-core"],
    responsibilitiesKo: ["벡터 잉크 테셀레이션 · ARAP/MLS 퍼펫 워프 · 타일 XOR 증분 히스토리", ".psd · .clip · .glb 바이너리 청크 스트리밍 파서(4GB+ 파일은 WASM64 승격)"],
    responsibilitiesEn: ["Vector ink tessellation, ARAP/MLS puppet warp & XOR incremental tile history", "Streaming .psd / .clip / .glb binary codecs (auto-promote to WASM64 above 4GB)"],
  },
  {
    id: "ui-ime-gizmo-bridge", order: 4,
    titleKo: "4계층 · React 접근성 UI · 한글 IME · 선택 기즈모/포인터 브리지",
    titleEn: "Layer 4 · React A11y UI · Korean IME · Selection Gizmo & Pointer Bridge",
    legacyKonvaSurfaceKo: "Konva Transformer/텍스트 오버레이에 결합된 UI 이벤트 처리",
    legacyKonvaSurfaceEn: "UI input & text overlay tightly coupled to Konva Transformer",
    targetRuntime: "typescript-thin-adapter",
    targetRuntimeLabelKo: "TypeScript 경량 어댑터 유지 (약 18%)",
    targetRuntimeLabelEn: "Thin TypeScript Adapter Retained (~18%)",
    nativePromotionPct: 0, tsAdapterSharePct: 18, targetKonvaDependencyPct: 0,
    status: "adapter-retained",
    currentStateKo: "현재: 캔버스 툴바·속성 패널은 React 기반, 선택 기즈모 일부가 Konva 노드에 의존",
    currentStateEn: "Current: Toolbars & inspectors run in React; selected transform gizmos still use Konva nodes",
    targetStateKo: "목표: DOM 접근성·한글 IME 조합·포인터 수집·경량 기즈모만 얇은 TypeScript 어댑터(15~20%)로 유지",
    targetStateEn: "Target: Keep DOM a11y, Korean IME composition, pointer capture & lightweight gizmo in thin TS adapter (15-20%)",
    repoModules: ["apps/web/src/domains/creator/studio-cuttoon-editor", "apps/web/src/domains/creator/wasm64-runtime-bridge"],
    responsibilitiesKo: ["WCAG 키보드 포커스 · 스크린 리더 · 한글 IME 조합 이벤트(compositionstart/end) 보존", "PointerEvent 배치 수집 · 변형 핸들 히트테스트 · 링버퍼 쓰기 브리지"],
    responsibilitiesEn: ["Preserve WCAG keyboard focus, screen readers & Korean IME composition events", "Coalesced PointerEvent capture, gizmo hit-testing & ring-buffer submission bridge"],
  },
];

export const NATIVE_MIGRATION_SCENARIOS: readonly NativeMigrationScenarioPreset[] = [
  {
    id: "webtoon-long-strip",
    nameKo: "웹툰 세로 스크롤 (800×24,000px · 60레이어)",
    nameEn: "Webtoon Long Strip (800×24,000px · 60 Layers)",
    badgeKo: "웹툰 60L", badgeEn: "Webtoon 60L",
    summaryKo: "연재 표준 세로 스크롤 원고. 희소 타일 기준 2.8GB대 워킹셋이나 전체 밀집 시 5.6GB로 4GB 경계를 넘어 WASM64+WebGPU 조합이 안정적이다.",
    summaryEn: "Standard vertical webtoon episode. Sparse working set sits near 2.8GB while dense peak crosses 5.6GB, suited for WASM64 + WebGPU.",
    input: {
      webgpuAvailable: true, wasmMemory64Available: true, wasmSimd128Available: true, sharedArrayBufferAvailable: true,
      deviceMemoryGb: 16, canvasWidthPx: 800, canvasHeightPx: 24000, layerCount: 60,
      pixelFormat: "rgba8", sparseOccupancyRatio: 0.45, isIosSafariWebKit: false, undoHistorySnapshots: 12,
    },
  },
  {
    id: "illust-8k-120layer",
    nameKo: "일러스트 8K (7,680×4,320px · 120레이어)",
    nameEn: "8K Illustration (7,680×4,320px · 120 Layers)",
    badgeKo: "8K 120L", badgeEn: "8K 120L",
    summaryKo: "16비트 선형(RGBA16F) 120레이어 일러스트. 활성 희소 타일만 13GB 이상이라 4,096MB 64비트 경보가 켜지며 WASM64 승격과 OPFS LRU 스필이 필수다.",
    summaryEn: "RGBA16F 120-layer illustration. Active sparse tiles exceed 13GB, triggering the 4,096MB alert, WASM64 promotion & OPFS LRU spill.",
    input: {
      webgpuAvailable: true, wasmMemory64Available: true, wasmSimd128Available: true, sharedArrayBufferAvailable: true,
      deviceMemoryGb: 32, canvasWidthPx: 7680, canvasHeightPx: 4320, layerCount: 120,
      pixelFormat: "rgba16f", sparseOccupancyRatio: 0.45, isIosSafariWebKit: false, undoHistorySnapshots: 12,
    },
  },
  {
    id: "ipad-safari-4k",
    nameKo: "iPad Safari 4K (3,840×2,160px · 40레이어)",
    nameEn: "iPad Safari 4K (3,840×2,160px · 40 Layers)",
    badgeKo: "iPad Safari", badgeEn: "iPad Safari",
    summaryKo: "iOS/iPadOS WebKit 환경. Jetsam 탭 종료 방어를 위해 상주 타일 RAM을 1,024MB 이내로 잠그고 WASM32-SIMD128 + WebGPU 버퍼 캡 + 조기 OPFS 스필을 강제한다.",
    summaryEn: "iOS/iPadOS WebKit target. Caps resident tiles at 1,024MB against Jetsam kills using WASM32-SIMD128, bounded WebGPU buffers & proactive OPFS spill.",
    input: {
      webgpuAvailable: true, wasmMemory64Available: false, wasmSimd128Available: true, sharedArrayBufferAvailable: false,
      deviceMemoryGb: 8, canvasWidthPx: 3840, canvasHeightPx: 2160, layerCount: 40,
      pixelFormat: "rgba8", sparseOccupancyRatio: 0.48, isIosSafariWebKit: true, undoHistorySnapshots: 10,
    },
  },
  {
    id: "entry-mobile-4gb",
    nameKo: "보급형 모바일 4GB (2,048×2,048px · 24레이어)",
    nameEn: "Entry Mobile 4GB (2,048×2,048px · 24 Layers)",
    badgeKo: "모바일 4GB", badgeEn: "Mobile 4GB",
    summaryKo: "WebGPU·WASM64 미지원 보급형 4GB 단말. WASM32-SIMD128 기본 고속 경로와 Transferable 링버퍼로 동작하며 655MB 안전 예산 초과 시 OPFS로 스필한다.",
    summaryEn: "Entry 4GB mobile device without WebGPU/WASM64. Runs on WASM32-SIMD128 fast path with Transferable ring buffer and 655MB OPFS spill ceiling.",
    input: {
      webgpuAvailable: false, wasmMemory64Available: false, wasmSimd128Available: true, sharedArrayBufferAvailable: false,
      deviceMemoryGb: 4, canvasWidthPx: 2048, canvasHeightPx: 2048, layerCount: 24,
      pixelFormat: "rgba8", sparseOccupancyRatio: 0.5, isIosSafariWebKit: false, undoHistorySnapshots: 8,
    },
  },
];

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
function alignUp(bytes: number, alignment: number): number {
  return Math.ceil(bytes / alignment) * alignment;
}

export function getMigrationScenarioPreset(presetId: NativeMigrationScenarioId): NativeMigrationScenarioPreset {
  const matched = NATIVE_MIGRATION_SCENARIOS.find((preset) => preset.id === presetId);
  if (matched) return matched;
  const fallback = NATIVE_MIGRATION_SCENARIOS[0];
  if (fallback) return fallback;
  throw new Error("NATIVE_MIGRATION_SCENARIOS must contain at least one preset.");
}

export function summarizeKonvaMigrationRoadmap(
  layers: readonly KonvaMigrationLayerSpec[] = KONVA_MIGRATION_LAYERS,
): KonvaRoadmapSummary {
  const fullyNativeLayers = layers.filter((layer) => layer.nativePromotionPct === 100).length;
  const retainedAdapterLayers = layers.filter((layer) => layer.targetRuntime === "typescript-thin-adapter").length;
  const tsAdapterSharePct = Math.min(100, Math.max(0, layers.reduce((sum, l) => sum + l.tsAdapterSharePct, 0)));
  const targetKonvaRuntimePct = layers.reduce((maxVal, l) => Math.max(maxVal, l.targetKonvaDependencyPct), 0);
  return {
    totalLayers: layers.length,
    fullyNativeLayers,
    retainedAdapterLayers,
    nativeCoreSharePct: 100 - tsAdapterSharePct,
    tsAdapterSharePct,
    tsAdapterTargetBandPct: [15, 20],
    targetKonvaRuntimePct,
  };
}

export function normalizeRuntimeCapabilityInput(raw: RuntimeNativeCapabilityInput): NormalizedRuntimeCapabilityInput {
  return {
    webgpuAvailable: Boolean(raw.webgpuAvailable),
    wasmMemory64Available: Boolean(raw.wasmMemory64Available),
    wasmSimd128Available: Boolean(raw.wasmSimd128Available),
    sharedArrayBufferAvailable: Boolean(raw.sharedArrayBufferAvailable),
    deviceMemoryGb: round1(clampNumber(raw.deviceMemoryGb, 1, 128, 8)),
    canvasWidthPx: Math.round(clampNumber(raw.canvasWidthPx, 256, 32768, 2048)),
    canvasHeightPx: Math.round(clampNumber(raw.canvasHeightPx, 256, 65536, 2048)),
    layerCount: Math.round(clampNumber(raw.layerCount, 1, 512, 24)),
    pixelFormat: raw.pixelFormat === "rgba16f" ? "rgba16f" : "rgba8",
    sparseOccupancyRatio: round2(clampNumber(raw.sparseOccupancyRatio ?? 0.45, 0.05, 1, 0.45)),
    isIosSafariWebKit: Boolean(raw.isIosSafariWebKit),
    undoHistorySnapshots: Math.round(clampNumber(raw.undoHistorySnapshots ?? 12, 1, 100, 12)),
  };
}

function computeSafeRamBudgetMb(input: NormalizedRuntimeCapabilityInput): number {
  const deviceRamMb = input.deviceMemoryGb * 1024;
  if (input.isIosSafariWebKit) return Math.round(Math.min(deviceRamMb * 0.14, 1024));
  if (input.deviceMemoryGb <= 4) return Math.round(Math.min(deviceRamMb * 0.16, 655));
  if (input.wasmMemory64Available) return Math.round(Math.min(deviceRamMb * 0.3, 6144));
  return Math.round(Math.min(deviceRamMb * 0.25, 3072));
}

function buildIosSafariWebKitGuard(
  input: NormalizedRuntimeCapabilityInput,
  estimatedTileRamMb: number,
  safeRamBudgetMb: number,
  opfsSpillRequiredMb: number,
): IosSafariWebKitGuardReport {
  if (!input.isIosSafariWebKit) {
    return {
      status: "inactive", jetsamRiskLevel: "low",
      enforcedMaxResidentMb: safeRamBudgetMb,
      webGpuBufferCapMb: input.webgpuAvailable ? Math.min(512, Math.round(safeRamBudgetMb * 0.35)) : 0,
      reasonKo: "데스크톱 또는 비-WebKit 런타임으로 분류되어 일반 메모리 거버너를 적용한다.",
      reasonEn: "Non-WebKit runtime detected; standard tab memory governor applies.",
      mitigationsKo: ["표준 OPFS LRU 하이 워터마크(80%) 유지"],
      mitigationsEn: ["Keep standard 80% OPFS LRU high watermark"],
    };
  }
  const ratio = safeRamBudgetMb > 0 ? estimatedTileRamMb / safeRamBudgetMb : 1;
  const strictSpill = opfsSpillRequiredMb > 0 || ratio >= 0.85;
  const jetsamRiskLevel: "low" | "elevated" | "high" = ratio >= 1.5 ? "high" : ratio >= 0.75 ? "elevated" : "low";
  const webGpuBufferCapMb = input.webgpuAvailable ? Math.min(256, Math.round(safeRamBudgetMb * 0.25)) : 0;
  return {
    status: strictSpill ? "active-strict-spill" : "active-safe",
    jetsamRiskLevel,
    enforcedMaxResidentMb: safeRamBudgetMb,
    webGpuBufferCapMb,
    reasonKo: strictSpill
      ? `iOS Safari/WebKit Jetsam 방어 가동: 예상 타일 RAM(${estimatedTileRamMb}MB)이 안전 상한(${safeRamBudgetMb}MB)에 근접·초과해 ${opfsSpillRequiredMb}MB를 선제 OPFS 스필한다.`
      : `iOS Safari/WebKit 안전 가드 활성: 상주 타일을 ${safeRamBudgetMb}MB 이하, WebGPU 버퍼를 ${webGpuBufferCapMb}MB 이하로 제한한다.`,
    reasonEn: strictSpill
      ? `iOS Safari/WebKit Jetsam guard active: working set (${estimatedTileRamMb}MB) approaches/exceeds ${safeRamBudgetMb}MB cap; spilling ${opfsSpillRequiredMb}MB to OPFS.`
      : `iOS Safari/WebKit guard active: capping resident tiles at ${safeRamBudgetMb}MB and WebGPU buffers at ${webGpuBufferCapMb}MB.`,
    mitigationsKo: [
      "WASM32-SIMD128 고정(WebKit memory64 미지원 환경 호환)",
      `OPFS LRU 조기 방출 워터마크 70%/52% 적용 및 WebGPU 버퍼 상한 ${webGpuBufferCapMb}MB 고정`,
      input.sharedArrayBufferAvailable
        ? "COOP/COEP 활성 확인: SAB 링버퍼 유지"
        : "SharedArrayBuffer 비활성 시 Transferable ArrayBuffer 링버퍼로 무중단 폴백",
    ],
    mitigationsEn: [
      "Pin WASM32-SIMD128 for WebKit compatibility where memory64 is unavailable",
      `Enforce early OPFS LRU watermarks (70%/52%) and ${webGpuBufferCapMb}MB WebGPU buffer cap`,
      input.sharedArrayBufferAvailable
        ? "COOP/COEP active: keep SAB ring buffer"
        : "Fallback cleanly to Transferable ArrayBuffer ring when SAB is unavailable",
    ],
  };
}

/** 런타임 기능과 캔버스 작업량으로 최적 네이티브 티어·타일 RAM·OPFS 스필량·WebKit 가드를 산출한다. */
export function evaluateRuntimeNativeCapability(
  rawInput: RuntimeNativeCapabilityInput,
): RuntimeNativeCapabilityEvaluation {
  const input = normalizeRuntimeCapabilityInput(rawInput);
  const bytesPerTile = input.pixelFormat === "rgba16f" ? TILE_RGBA16F_BYTES : TILE_RGBA8_BYTES;
  const tileSizeKb = bytesPerTile / 1024;
  const tilesX = Math.ceil(input.canvasWidthPx / TILE_DIMENSION_PX);
  const tilesY = Math.ceil(input.canvasHeightPx / TILE_DIMENSION_PX);
  const tilesPerLayer = tilesX * tilesY;
  const denseTotalTiles = tilesPerLayer * input.layerCount;
  const sparseActiveTiles = Math.max(tilesPerLayer, Math.ceil(denseTotalTiles * input.sparseOccupancyRatio));
  const ringBufferTiles = Math.min(tilesPerLayer, MAX_VIEWPORT_RING_TILES) * ZERO_COPY_RING_SLOTS;

  const denseTileRamMb = round1((denseTotalTiles * bytesPerTile) / BYTES_PER_MIB);
  const sparseActiveTileRamMb = round1((sparseActiveTiles * bytesPerTile) / BYTES_PER_MIB);
  const ringBufferRamMb = round1((ringBufferTiles * bytesPerTile) / BYTES_PER_MIB);
  const undoDeltaRamMb = round1(sparseActiveTileRamMb * 0.08 * (input.undoHistorySnapshots / 12));
  const estimatedTileRamMb = round1(sparseActiveTileRamMb + ringBufferRamMb + undoDeltaRamMb);
  const totalAddressablePeakMb = round1(denseTileRamMb + ringBufferRamMb + undoDeltaRamMb);
  const safeRamBudgetMb = computeSafeRamBudgetMb(input);
  const inRamResidentRamMb = round1(Math.min(estimatedTileRamMb, safeRamBudgetMb));
  const opfsSpillRequiredMb = round1(Math.max(0, estimatedTileRamMb - safeRamBudgetMb));
  const opfsDenseWorstCaseSpillMb = round1(Math.max(0, totalAddressablePeakMb - safeRamBudgetMb));

  const exceeds4096MbActive = estimatedTileRamMb >= WASM64_OFFSET_THRESHOLD_MB;
  const exceeds4096MbDense = denseTileRamMb >= WASM64_OFFSET_THRESHOLD_MB;
  const needsWasm64AddressSpace = exceeds4096MbActive || exceeds4096MbDense;
  const wasm64AutoPromoted = needsWasm64AddressSpace && input.wasmMemory64Available && !input.isIosSafariWebKit;
  const wasm64BlockedByRuntime = needsWasm64AddressSpace && (!input.wasmMemory64Available || input.isIosSafariWebKit);

  const selectedWasmTarget: WasmTargetAbi = wasm64AutoPromoted
    ? "wasm64-memory64"
    : input.wasmSimd128Available ? "wasm32-simd128" : "wasm32-scalar";
  const gpuPath: GpuAccelerationPath = input.webgpuAvailable ? "webgpu-wgsl" : "cpu-wasm-fallback";
  const ringTransferMode: RingTransferMode = input.sharedArrayBufferAvailable
    ? "sab-zero-copy-ring" : "transferable-arraybuffer-ring";

  let selectedTier: NativeExecutionTierId;
  let tierLabelKo: string;
  let tierLabelEn: string;
  let tierRationaleKo: string;
  let tierRationaleEn: string;

  if (input.webgpuAvailable && wasm64AutoPromoted) {
    selectedTier = "webgpu-wasm64-hybrid";
    tierLabelKo = "WebGPU WGSL + Rust WASM64 (4GB+ 자동 승격)";
    tierLabelEn = "WebGPU WGSL + Rust WASM64 (4GB+ Auto-Promoted)";
    tierRationaleKo = `밀집/활성 타일 주소 공간이 4,096MB 경계(활성 ${estimatedTileRamMb}MB · 밀집 ${denseTileRamMb}MB)를 넘어 WASM64(memory64)와 WebGPU WGSL Compute 경로로 자동 승격했다.`;
    tierRationaleEn = `Tile address demand crosses 4,096MB (active ${estimatedTileRamMb}MB, dense ${denseTileRamMb}MB); auto-promoted to WASM64 (memory64) + WebGPU WGSL Compute.`;
  } else if (input.webgpuAvailable) {
    selectedTier = "webgpu-wasm32-simd";
    tierLabelKo = selectedWasmTarget === "wasm32-simd128" ? "WebGPU WGSL + Rust WASM32-SIMD128 기본 고속" : "WebGPU WGSL + Rust WASM32 스칼라";
    tierLabelEn = selectedWasmTarget === "wasm32-simd128" ? "WebGPU WGSL + Rust WASM32-SIMD128 Default Fast Path" : "WebGPU WGSL + Rust WASM32 Scalar";
    tierRationaleKo = wasm64BlockedByRuntime
      ? `작업량이 4GB 주소 공간을 요구하지만 현재 런타임은 memory64를 쓸 수 없어 WASM32 + WebGPU 경로를 유지하고 ${opfsSpillRequiredMb}MB를 OPFS LRU로 스필한다.`
      : "포인터 오버헤드가 작은 WASM32 기본 고속 경로와 WebGPU WGSL 셰이더를 결합해 256px 희소 타일을 처리한다.";
    tierRationaleEn = wasm64BlockedByRuntime
      ? `Workload exceeds 4GB address demand without memory64 support; staying on WASM32 + WebGPU with ${opfsSpillRequiredMb}MB OPFS LRU spill.`
      : "Combines low-overhead WASM32 default fast path with WebGPU WGSL shaders for 256px sparse tiles.";
  } else if (wasm64AutoPromoted) {
    selectedTier = "wasm64-memory64-cpu";
    tierLabelKo = "Rust WASM64 (memory64) CPU/SIMD 경로";
    tierLabelEn = "Rust WASM64 (memory64) CPU/SIMD Path";
    tierRationaleKo = "WebGPU는 꺼져 있으나 memory64가 지원되어 4GB+ 타일 아레나를 64비트 선형 오프셋으로 직접 다루며 CPU 컴퓨트 폴백을 실행한다.";
    tierRationaleEn = "WebGPU unavailable, but memory64 is supported; addressing 4GB+ tile arena via 64-bit offsets with deterministic CPU fallback.";
  } else if (input.wasmSimd128Available) {
    selectedTier = "wasm32-simd128";
    tierLabelKo = "Rust WASM32-SIMD128 기본 고속 경로";
    tierLabelEn = "Rust WASM32-SIMD128 Default Fast Path";
    tierRationaleKo = "WebGPU 미지원 환경에서 128비트 SIMD 벡터 명령과 256px 희소 타일 아레나로 안정적인 CPU 네이티브 경로를 유지한다.";
    tierRationaleEn = "Without WebGPU, runs native CPU hotpaths on 128-bit SIMD with 256px sparse tile arena.";
  } else {
    selectedTier = "wasm32-scalar-safe";
    tierLabelKo = "Rust WASM32 스칼라 안전 호환 경로";
    tierLabelEn = "Rust WASM32 Scalar Compatibility Path";
    tierRationaleKo = "WebGPU·SIMD128이 모두 비활성인 보수적 환경에서 결정론적 스칼라 Rust WASM32 코어와 OPFS 타일 스필로 안전 동작한다.";
    tierRationaleEn = "Conservative fallback without WebGPU or SIMD128; runs deterministic scalar Rust WASM32 core with OPFS spill.";
  }

  const iosSafariWebKitGuard = buildIosSafariWebKitGuard(input, estimatedTileRamMb, safeRamBudgetMb, opfsSpillRequiredMb);
  const warnings: RuntimeGuardWarning[] = [];
  const pushWarn = (
    code: RuntimeGuardWarningCode, severity: GuardSeverity,
    titleKo: string, titleEn: string, detailKo: string, detailEn: string,
  ): void => {
    warnings.push({ code, severity, titleKo, titleEn, detailKo, detailEn });
  };

  if (exceeds4096MbActive) {
    pushWarn(
      "WASM64_THRESHOLD_ACTIVE", "critical",
      "활성 타일 워킹셋 4,096MB 초과 — 64비트 오프셋 필수", "Active Tile Working Set > 4,096MB — 64-bit Offset Required",
      `예상 활성 타일 RAM이 ${estimatedTileRamMb}MB로 WASM32 32비트 주소 상한(4,096MB)을 초과한다. WASM64 승격과 OPFS LRU 스필(${opfsSpillRequiredMb}MB)을 함께 적용해야 한다.`,
      `Estimated active tile RAM (${estimatedTileRamMb}MB) exceeds the 4,096MB WASM32 ceiling. Pair WASM64 promotion with ${opfsSpillRequiredMb}MB OPFS LRU spill.`,
    );
  } else if (exceeds4096MbDense) {
    pushWarn(
      "WASM64_THRESHOLD_DENSE", "warn",
      "전체 레이어 밀집 시 4,096MB 초과 가능 — WASM64 사전 대비", "Dense Peak > 4,096MB — WASM64 Headroom Recommended",
      `현재 희소 점유율(${Math.round(input.sparseOccupancyRatio * 100)}%) 기준 ${estimatedTileRamMb}MB이나 전체 채색 시 ${denseTileRamMb}MB까지 증가한다.`,
      `At ${Math.round(input.sparseOccupancyRatio * 100)}% sparse occupancy RAM is ${estimatedTileRamMb}MB, but 100% dense layers reach ${denseTileRamMb}MB.`,
    );
  }
  if (wasm64BlockedByRuntime) {
    pushWarn(
      "WASM64_UNAVAILABLE_SPILL_REQUIRED", "warn",
      "memory64 미지원 런타임 — OPFS 타일 스필 강제", "memory64 Unavailable — OPFS Tile Eviction Enforced",
      `브라우저가 WASM64를 지원하지 않거나 WebKit 가드가 켜져 있어 32비트 주소 공간(${safeRamBudgetMb}MB) 안으로 강제 페이징한다.`,
      `Runtime lacks memory64 or WebKit guard is active; enforcing 32-bit paging within ${safeRamBudgetMb}MB resident budget.`,
    );
  }
  if (input.isIosSafariWebKit) {
    pushWarn(
      "IOS_WEBKIT_JETSAM_GUARD", iosSafariWebKitGuard.jetsamRiskLevel === "high" ? "critical" : "warn",
      "iOS Safari / WebKit Jetsam 메모리 가드 활성", "iOS Safari / WebKit Jetsam Memory Guard Active",
      iosSafariWebKitGuard.reasonKo, iosSafariWebKitGuard.reasonEn,
    );
  }
  if (!input.sharedArrayBufferAvailable) {
    pushWarn(
      "SAB_UNAVAILABLE_TRANSFER_FALLBACK", "info",
      "SharedArrayBuffer 비활성 — Transferable 링버퍼 폴백", "SharedArrayBuffer Off — Transferable Ring Buffer Fallback",
      "COOP/COEP 격리 헤더가 없거나 브라우저가 제한해 ArrayBuffer 소유권 이전(postMessage transfer) 링으로 대체한다.",
      "Without COOP/COEP cross-origin isolation, switches to zero-allocation ArrayBuffer ownership transfer ring.",
    );
  }
  if (!input.webgpuAvailable) {
    pushWarn(
      "WEBGPU_UNAVAILABLE_CPU_PATH", "info",
      "WebGPU 비활성 — Rust WASM CPU 컴퓨트 폴백", "WebGPU Unavailable — Rust WASM CPU Compute Fallback",
      "WGSL 컴퓨트 대신 바이트 동등 Rust WASM CPU 커널로 블렌드·임파스토·요철을 실행한다.",
      "Executes byte-equivalent Rust WASM CPU kernels for blend, impasto & paper relief instead of WGSL.",
    );
  }
  if (input.deviceMemoryGb <= 4) {
    pushWarn(
      "LOW_DEVICE_MEMORY_BUDGET", "warn",
      "저용량 메모리 단말(<= 4GB) — 보수적 타일 예산 적용", "Low-Memory Device (<= 4GB) — Conservative Tile Budget",
      `단말 RAM ${input.deviceMemoryGb}GB 기준 상주 타일 상한을 ${safeRamBudgetMb}MB로 제한해 OOM 크래시를 예방한다.`,
      `Caps resident tile arena at ${safeRamBudgetMb}MB on ${input.deviceMemoryGb}GB device to prevent OOM crashes.`,
    );
  }

  return {
    normalizedInput: input, selectedTier, tierLabelKo, tierLabelEn, tierRationaleKo, tierRationaleEn,
    selectedWasmTarget, gpuPath, ringTransferMode, wasm64AutoPromoted, wasm64BlockedByRuntime,
    tileDimensionPx: TILE_DIMENSION_PX, tileSizeKb, tilesX, tilesY, tilesPerLayer,
    denseTotalTiles, sparseActiveTiles, denseTileRamMb, sparseActiveTileRamMb,
    ringBufferRamMb, undoDeltaRamMb, estimatedTileRamMb, totalAddressablePeakMb,
    safeRamBudgetMb, inRamResidentRamMb, opfsSpillRequiredMb, opfsDenseWorstCaseSpillMb,
    exceeds4096MbActive, exceeds4096MbDense, iosSafariWebKitGuard, warnings,
    formulaDisclosureKo: `산출 근거: 256×256 타일(${tileSizeKb}KB) × 희소 활성 타일(${sparseActiveTiles.toLocaleString("en-US")}개) + 3슬롯 링버퍼(${ringBufferRamMb}MB) + XOR 델타(${undoDeltaRamMb}MB). 실측 없는 임의 FPS 배수는 배제했다.`,
    formulaDisclosureEn: `Formula: 256×256 tiles (${tileSizeKb}KB) × ${sparseActiveTiles.toLocaleString("en-US")} sparse active tiles + 3-slot ring (${ringBufferRamMb}MB) + XOR delta (${undoDeltaRamMb}MB). No fabricated FPS multipliers.`,
  };
}

/** 256×256 RGBA8/RGBA16F 제로카피 링버퍼 · 4,096MB 64비트 경보 · OPFS LRU 스필 정책을 설계한다. */
export function planZeroCopyTileArena(
  inputOrEval: RuntimeNativeCapabilityInput | RuntimeNativeCapabilityEvaluation,
): ZeroCopyTileArenaPlan {
  const evaluation = "selectedTier" in inputOrEval ? inputOrEval : evaluateRuntimeNativeCapability(inputOrEval);
  const input = evaluation.normalizedInput;
  const bytesPerTile = input.pixelFormat === "rgba16f" ? TILE_RGBA16F_BYTES : TILE_RGBA8_BYTES;
  const tileSizeKb = bytesPerTile / 1024;

  const viewportTileWindow = Math.min(evaluation.tilesPerLayer, MAX_VIEWPORT_RING_TILES);
  const bytesPerSlot = alignUp(viewportTileWindow * bytesPerTile, WEBGPU_STORAGE_ALIGNMENT_BYTES);
  const totalRingBytes = bytesPerSlot * ZERO_COPY_RING_SLOTS;
  const totalRingMb = round1(totalRingBytes / BYTES_PER_MIB);

  const exceeds4096MbThreshold = evaluation.exceeds4096MbActive;
  const thresholdAlertLevel: "safe" | "approaching" | "exceeded" = exceeds4096MbThreshold
    ? "exceeded"
    : evaluation.estimatedTileRamMb >= WASM32_APPROACHING_THRESHOLD_MB || evaluation.exceeds4096MbDense
      ? "approaching" : "safe";
  const offsetAddressMode: "u64-memory64" | "u32-linear-guarded" =
    evaluation.selectedWasmTarget === "wasm64-memory64" ? "u64-memory64" : "u32-linear-guarded";

  const alertMessageKo = thresholdAlertLevel === "exceeded"
    ? `64비트 오프셋 경보(초과): 활성 워킹셋 ${evaluation.estimatedTileRamMb}MB >= 4,096MB 임계치. memory64(u64) 또는 강제 OPFS 스필이 필수다.`
    : thresholdAlertLevel === "approaching"
      ? `64비트 오프셋 주의(접근): 활성 ${evaluation.estimatedTileRamMb}MB · 밀집 상한 ${evaluation.denseTileRamMb}MB로 4,096MB 경계에 접근했다.`
      : `32비트 선형 주소 안전 구간: 활성 ${evaluation.estimatedTileRamMb}MB · 밀집 ${evaluation.denseTileRamMb}MB (< 4,096MB).`;
  const alertMessageEn = thresholdAlertLevel === "exceeded"
    ? `64-bit Offset Alert (Exceeded): Active set ${evaluation.estimatedTileRamMb}MB >= 4,096MB limit. Requires memory64 (u64) or mandatory OPFS spill.`
    : thresholdAlertLevel === "approaching"
      ? `64-bit Offset Caution: Active ${evaluation.estimatedTileRamMb}MB / dense peak ${evaluation.denseTileRamMb}MB approaches 4,096MB.`
      : `32-bit Linear Safe Zone: Active ${evaluation.estimatedTileRamMb}MB / dense ${evaluation.denseTileRamMb}MB (< 4,096MB).`;

  const conservativeProfile = input.isIosSafariWebKit || input.deviceMemoryGb <= 4;
  const evictionHighWatermarkPct = conservativeProfile ? 70 : 80;
  const evictionLowWatermarkPct = conservativeProfile ? 52 : 62;
  const spillWriteBatchTiles = conservativeProfile ? 16 : 32;

  const usableTileBudgetBytes = Math.max(
    bytesPerTile,
    Math.floor(Math.max(0, evaluation.safeRamBudgetMb - totalRingMb - evaluation.undoDeltaRamMb) * BYTES_PER_MIB),
  );
  const maxResidentTiles = Math.max(
    1,
    Math.min(evaluation.sparseActiveTiles, Math.floor(usableTileBudgetBytes / bytesPerTile)),
  );
  const spilledColdTiles = Math.max(0, evaluation.sparseActiveTiles - maxResidentTiles);
  const opfsEnabled = evaluation.opfsSpillRequiredMb > 0 || conservativeProfile;
  const estimatedOpfsDiskMb = round1(((spilledColdTiles * bytesPerTile) / BYTES_PER_MIB) * 1.12);

  const policySummaryKo = opfsEnabled
    ? `상주 상한 ${maxResidentTiles.toLocaleString("en-US")}타일 · 워터마크 ${evictionHighWatermarkPct}%→${evictionLowWatermarkPct}% · 냉각 ${spilledColdTiles.toLocaleString("en-US")}타일(${estimatedOpfsDiskMb}MB)을 OPFS SyncAccessHandle로 ${spillWriteBatchTiles}타일 단위 스필`
    : `전체 활성 타일(${evaluation.sparseActiveTiles.toLocaleString("en-US")}개)이 RAM 안전 예산(${evaluation.safeRamBudgetMb}MB) 내 상주 가능 · OPFS는 체크포인트 영속화 대기`;
  const policySummaryEn = opfsEnabled
    ? `Cap ${maxResidentTiles.toLocaleString("en-US")} resident tiles · watermark ${evictionHighWatermarkPct}%→${evictionLowWatermarkPct}% · spill ${spilledColdTiles.toLocaleString("en-US")} cold tiles (${estimatedOpfsDiskMb}MB) in ${spillWriteBatchTiles}-tile OPFS SyncAccessHandle batches`
    : `All ${evaluation.sparseActiveTiles.toLocaleString("en-US")} active tiles fit in ${evaluation.safeRamBudgetMb}MB safe RAM · OPFS standby for durable checkpoints`;

  const residentTilesMb = round1(Math.max(0, evaluation.sparseActiveTileRamMb - evaluation.opfsSpillRequiredMb));
  const denom = Math.max(0.1, evaluation.estimatedTileRamMb);
  const segments: readonly TileArenaSegment[] = [
    { id: "resident-tiles", labelKo: "RAM 상주 활성 타일", labelEn: "RAM-Resident Active Tiles", mb: residentTilesMb, shareOfWorkingSetPct: round1((residentTilesMb / denom) * 100) },
    { id: "ring-buffer", labelKo: "제로카피 3슬롯 링버퍼", labelEn: "Zero-Copy 3-Slot Ring Buffer", mb: totalRingMb, shareOfWorkingSetPct: round1((totalRingMb / denom) * 100) },
    { id: "undo-delta", labelKo: "XOR 증분 히스토리", labelEn: "XOR Incremental Undo Arena", mb: evaluation.undoDeltaRamMb, shareOfWorkingSetPct: round1((evaluation.undoDeltaRamMb / denom) * 100) },
    { id: "opfs-spill", labelKo: "OPFS LRU 디스크 스필", labelEn: "OPFS LRU Disk Spill", mb: evaluation.opfsSpillRequiredMb, shareOfWorkingSetPct: round1((evaluation.opfsSpillRequiredMb / denom) * 100) },
  ];

  return {
    pixelFormat: input.pixelFormat, tileDimensionPx: TILE_DIMENSION_PX, bytesPerTile, tileSizeKb,
    wasm64ThresholdMb: WASM64_OFFSET_THRESHOLD_MB, offsetAddressMode, thresholdAlertLevel, exceeds4096MbThreshold,
    alertMessageKo, alertMessageEn,
    ringBuffer: {
      slotCount: ZERO_COPY_RING_SLOTS, storageAlignmentBytes: WEBGPU_STORAGE_ALIGNMENT_BYTES,
      viewportTileWindow, bytesPerSlot, totalRingBytes, totalRingMb,
      backingMemoryKind: input.sharedArrayBufferAvailable ? "SharedArrayBuffer" : "TransferableArrayBuffer",
      zeroCopyEligible: input.sharedArrayBufferAvailable && input.webgpuAvailable,
    },
    opfsLruPolicy: {
      enabled: opfsEnabled, storageBackend: "opfs-sync-access-handle-256px",
      maxResidentTiles, spilledColdTiles, evictionHighWatermarkPct, evictionLowWatermarkPct,
      spillWriteBatchTiles, estimatedOpfsDiskMb, policySummaryKo, policySummaryEn,
    },
    segments, estimatedWorkingSetMb: evaluation.estimatedTileRamMb, safeRamBudgetMb: evaluation.safeRamBudgetMb,
  };
}

export function buildNativeMigrationManifest(options: {
  readonly scenarioId?: NativeMigrationScenarioId | "custom";
  readonly scenarioNameKo?: string;
  readonly scenarioNameEn?: string;
  readonly input: RuntimeNativeCapabilityInput;
}): NativeMigrationManifest {
  const evaluation = evaluateRuntimeNativeCapability(options.input);
  const tileArenaPlan = planZeroCopyTileArena(evaluation);
  const preset = options.scenarioId && options.scenarioId !== "custom"
    ? getMigrationScenarioPreset(options.scenarioId) : null;
  return {
    schemaVersion: "toonstudio.native-wasm-migration-manifest.v1",
    scenarioId: options.scenarioId ?? "custom",
    scenarioNameKo: options.scenarioNameKo ?? preset?.nameKo ?? "사용자 정의 런타임 시나리오",
    scenarioNameEn: options.scenarioNameEn ?? preset?.nameEn ?? "Custom Runtime Scenario",
    runtimeInput: evaluation.normalizedInput,
    capabilityEvaluation: evaluation,
    tileArenaPlan,
    konvaMigrationLayers: KONVA_MIGRATION_LAYERS,
    roadmapSummary: summarizeKonvaMigrationRoadmap(KONVA_MIGRATION_LAYERS),
    honestyNoteKo: "본 매니페스트는 256×256 타일 바이트 산술과 브라우저 기능 플래그 기반의 설계·예산 산출물이며 실측 없는 임의 FPS 배수는 포함하지 않는다. 각 계층의 현재 구현과 전환 목표는 분리 기록된다.",
    honestyNoteEn: "This manifest derives deterministic memory/spill budgets from 256×256 tile byte math and runtime flags without fabricated FPS multipliers. Current state and migration target are tracked separately.",
  };
}

/** 현재 런타임 평가 · 타일 아레나 · Konva 4계층 분리 매니페스트를 JSON 문자열로 직렬화한다. */
export function exportNativeMigrationManifestJson(options: {
  readonly scenarioId?: NativeMigrationScenarioId | "custom";
  readonly scenarioNameKo?: string;
  readonly scenarioNameEn?: string;
  readonly input: RuntimeNativeCapabilityInput;
}): { readonly json: string; readonly manifest: NativeMigrationManifest } {
  const manifest = buildNativeMigrationManifest(options);
  return { json: JSON.stringify(manifest, null, 2), manifest };
}
