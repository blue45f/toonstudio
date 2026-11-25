/**
 * 의존성 기록을 바탕으로 Rust·WASM64 전환 단계를 비교하는 예제.
 *
 * - 의존성 표는 2026-11-25에 작성한 기록을 사용한다. 원본 파일별 스캔 결과는 이 모듈에 포함하지 않는다.
 * - 루트 package.json 의존성 개수와 공개 WASM 파일 크기는 저장소의 실제 파일로 검사한다.
 * - 미실측 경계: 실제 Vite 청크 바이트·브라우저 프레임 지연은 별도 `vite build` 및 실기기 프로파일링 필요
 */

export const AUDIT_SCOPE_KIND = "repo-static-import-audit-2026-11-25" as const;
export const AUDIT_MEASURED_AT = "2026-11-25" as const;
export const AUDIT_MANIFEST_PATH = "package.json" as const;
export const AUDIT_SCANNED_DIRECTORY = "apps/web/src" as const;
export const AUDIT_SCANNED_FILE_COUNT = 20069 as const;
export const AUDIT_ROOT_RUNTIME_DEP_COUNT = 106 as const;
export const RUST_CORE_WASM_ARTIFACT_PATH = "apps/web/public/wasm/studio-wasm64-drawing-core.wasm" as const;
export const RUST_CORE_WASM_MEASURED_BYTES = 49063 as const;

export type DependencyAuditCategory =
  | "2d-canvas-renderer"
  | "stroke-geometry"
  | "color-physics"
  | "3d-cad-engine"
  | "image-vision";

export type DependencyCategoryFilter = "all" | DependencyAuditCategory;

export type DependencyCutoverVerdict =
  | "replace-with-rust-wasm64"
  | "consolidate-single-lib"
  | "lazy-isolate-chunk"
  | "keep-platform-core";

export type DependencyCutoverWave = 1 | 2 | 3 | 4;

export type DependencyOverlapGroupId =
  | "2d-renderer-5-overlap"
  | "procedural-brush-sketch-2-overlap"
  | "curve-stroke-5-overlap"
  | "spatial-boolean-2-overlap"
  | "color-space-4-overlap"
  | "3d-cad-4-overlap"
  | "raster-filter-vision-overlap";

export type RustTargetLane =
  | "studio-wasm64-drawing-core"
  | "studio-engine-vello"
  | "webgpu-wgsl"
  | "lazy-chunk-isolated"
  | "platform-retained";

export type SafariCompatibilityMode = "dual-wasm64-wasm32-safe" | "wasm64-primary-only";

export interface DependencyAuditEntry {
  readonly packageName: string;
  readonly version: string;
  readonly measuredAt: typeof AUDIT_MEASURED_AT;
  readonly importFileCount: number;
  readonly prodImportFileCount: number;
  readonly testImportFileCount: number;
  readonly sampleImportPaths: readonly string[];
  readonly category: DependencyAuditCategory;
  readonly overlapGroupId: DependencyOverlapGroupId;
  readonly overlapGroupLabelKo: string;
  readonly overlapGroupLabelEn: string;
  readonly verdict: DependencyCutoverVerdict;
  readonly rustTargetLane: RustTargetLane;
  readonly rustTargetModule: string;
  readonly cutoverWave: DependencyCutoverWave;
  readonly safariWasm32GuardKo: string;
  readonly safariWasm32GuardEn: string;
  readonly zeroDiffGateKo: string;
  readonly zeroDiffGateEn: string;
  readonly rationaleKo: string;
  readonly rationaleEn: string;
}

export interface DependencyOverlapGroupMeta {
  readonly id: DependencyOverlapGroupId;
  readonly category: DependencyAuditCategory;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly stackCount: number;
  readonly targetArchitectureKo: string;
  readonly targetArchitectureEn: string;
  readonly resolvedByWave: DependencyCutoverWave;
}

export interface DependencyCategoryMeta {
  readonly id: DependencyAuditCategory;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface DependencyWaveMeta {
  readonly wave: DependencyCutoverWave;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly focusKo: string;
  readonly focusEn: string;
}

export interface DependencyCutoverPlanInput {
  readonly targetWave?: DependencyCutoverWave;
  readonly categoryFilter?: DependencyCategoryFilter;
  readonly maintainSafariWasm32Fallback?: boolean;
}

export interface OverlapGroupResolutionStatus {
  readonly groupId: DependencyOverlapGroupId;
  readonly category: DependencyAuditCategory;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly totalPackages: number;
  readonly actionablePackages: number;
  readonly addressedActionablePackages: number;
  readonly removableOrConsolidatableCount: number;
  readonly resolutionPct: number;
  readonly isFullyResolved: boolean;
  readonly targetArchitectureKo: string;
  readonly targetArchitectureEn: string;
}

export interface WaveConvergencePoint {
  readonly wave: DependencyCutoverWave;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly wavePackageCount: number;
  readonly cumulativeAddressedCount: number;
  readonly cumulativeRemovableCount: number;
  readonly cumulativeRustWasm64Count: number;
  readonly cumulativeOverlapResolutionPct: number;
  readonly cumulativeRustCoveragePct: number;
}

export interface CutoverChecklistStep {
  readonly id: string;
  readonly wave: DependencyCutoverWave;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly targetPackages: readonly string[];
  readonly rustTargetSummary: string;
  readonly verificationGateKo: string;
  readonly verificationGateEn: string;
  readonly safariFallbackDirectiveKo: string;
  readonly safariFallbackDirectiveEn: string;
}

export interface UnmeasuredAuditBoundary {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly verificationCommand: string;
}

export interface DependencyCutoverMetrics {
  readonly totalCatalogPackages: number;
  readonly totalAuditedPackages: number;
  readonly activeWavePackageCount: number;
  readonly deferredPackageCount: number;
  readonly totalMeasuredImportFiles: number;
  readonly totalMeasuredProdImportFiles: number;
  readonly addressedImportFileCount: number;
  readonly removableOrConsolidatableCount: number;
  readonly totalRemovableOrConsolidatableInScope: number;
  readonly replaceWithRustWasm64Count: number;
  readonly totalReplaceableInScope: number;
  readonly consolidateSingleLibCount: number;
  readonly lazyIsolateChunkCount: number;
  readonly keepPlatformCoreCount: number;
  readonly overlapGroupCount: number;
  readonly resolvedOverlapGroupCount: number;
  readonly overlapResolutionPct: number;
  readonly rustWasm64CoveragePct: number;
}

export interface DependencyCutoverPlanResult {
  readonly auditScopeKind: typeof AUDIT_SCOPE_KIND;
  readonly catalogProvenance: "curated-snapshot";
  readonly currentImportScanVerified: false;
  readonly measuredAt: typeof AUDIT_MEASURED_AT;
  readonly manifestPath: typeof AUDIT_MANIFEST_PATH;
  readonly scannedDirectory: typeof AUDIT_SCANNED_DIRECTORY;
  readonly scannedSourceFileCount: typeof AUDIT_SCANNED_FILE_COUNT;
  readonly rootRuntimeDependencyCount: typeof AUDIT_ROOT_RUNTIME_DEP_COUNT;
  readonly rustCoreWasmArtifactPath: typeof RUST_CORE_WASM_ARTIFACT_PATH;
  readonly rustCoreWasmMeasuredBytes: typeof RUST_CORE_WASM_MEASURED_BYTES;
  readonly targetWave: DependencyCutoverWave;
  readonly categoryFilter: DependencyCategoryFilter;
  readonly maintainSafariWasm32Fallback: boolean;
  readonly safariCompatibilityMode: SafariCompatibilityMode;
  readonly safariMaxLinearMemoryGiB: number;
  readonly wasm64PrimaryMemoryGiB: number;
  readonly safariCompatibilityWarningKo: string | null;
  readonly safariCompatibilityWarningEn: string | null;
  readonly entries: readonly DependencyAuditEntry[];
  readonly activeWaveEntries: readonly DependencyAuditEntry[];
  readonly deferredEntries: readonly DependencyAuditEntry[];
  readonly metrics: DependencyCutoverMetrics;
  readonly overlapGroups: readonly OverlapGroupResolutionStatus[];
  readonly waveBreakdown: readonly WaveConvergencePoint[];
  readonly checklist: readonly CutoverChecklistStep[];
  readonly unmeasuredBoundaries: readonly UnmeasuredAuditBoundary[];
}

export const DEPENDENCY_AUDIT_CATEGORIES: readonly DependencyCategoryMeta[] = Object.freeze([
  { id: "2d-canvas-renderer", labelKo: "2D 캔버스 렌더러", labelEn: "2D Canvas Renderers" },
  { id: "stroke-geometry", labelKo: "스트로크·곡선 기하", labelEn: "Stroke & Curve Geometry" },
  { id: "color-physics", labelKo: "색공간·분광 혼색", labelEn: "Color & Spectral Physics" },
  { id: "3d-cad-engine", labelKo: "3D·CAD 엔진", labelEn: "3D & CAD Engines" },
  { id: "image-vision", labelKo: "래스터 필터·비전", labelEn: "Raster Vision & Filters" },
]);

export const DEPENDENCY_CUTOVER_WAVES: readonly DependencyWaveMeta[] = Object.freeze([
  { wave: 1, titleKo: "Wave 1 · 저위험 즉시 치환", titleEn: "Wave 1 · Low-Risk Quick Wins", focusKo: "임포트 1~5개 색공간·곡선·Pixi 어댑터를 Rust 커널과 culori로 통합", focusEn: "Replace 1-5 import color, curve, and Pixi adapters with Rust kernels and culori" },
  { wave: 2, titleKo: "Wave 2 · 기하·브러시·CAD 청크 격리", titleEn: "Wave 2 · Geometry, Brush & CAD Isolation", focusKo: "벡터 불리언·Morton BVH·촉각 브러시 Rust 전환 및 CAD 지연 청크 고정", focusEn: "Cut over boolean, Morton BVH, and natural brushes to Rust; lock CAD lazy chunks" },
  { wave: 3, titleKo: "Wave 3 · 대형 WASM·중복 3D 정리", titleEn: "Wave 3 · Heavy WASM & 3D Deduplication", focusKo: "CanvasKit·OpenCV를 Vello·WGSL로 치환, Babylon→Three 통합, Phaser 청크 격리", focusEn: "Replace CanvasKit/OpenCV with Vello/WGSL, merge Babylon into Three, isolate Phaser" },
  { wave: 4, titleKo: "Wave 4 · 주력 2D 스테이지 최종 전환", titleEn: "Wave 4 · Primary 2D Stage Cutover", focusKo: "Konva·React-Konva 159개 참조를 Vello 하이브리드·WASM64 타일 합성기로 전환", focusEn: "Migrate Konva & React-Konva (159 refs) onto Vello Hybrid & WASM64 tile compositor" },
]);

export const DEPENDENCY_OVERLAP_GROUPS: readonly DependencyOverlapGroupMeta[] = Object.freeze([
  { id: "2d-renderer-5-overlap", category: "2d-canvas-renderer", labelKo: "2D 렌더러 5중첩", labelEn: "5x Overlapping 2D Renderers", stackCount: 5, targetArchitectureKo: "studio-engine-vello(vello_hybrid/vello_cpu) + tile_compositor_kernel (Phaser 전용 청크 격리)", targetArchitectureEn: "studio-engine-vello (vello_hybrid/vello_cpu) + tile_compositor_kernel (Phaser lazy-isolated)", resolvedByWave: 4 },
  { id: "procedural-brush-sketch-2-overlap", category: "2d-canvas-renderer", labelKo: "절차적 브러시·스케치 2중첩", labelEn: "2x Procedural Brush & Sketch Engines", stackCount: 2, targetArchitectureKo: "studio-wasm64-drawing-core::tactile_texture_kernel + WebGPU WGSL 브러시 파이프라인", targetArchitectureEn: "studio-wasm64-drawing-core::tactile_texture_kernel + WebGPU WGSL brush pipeline", resolvedByWave: 2 },
  { id: "curve-stroke-5-overlap", category: "stroke-geometry", labelKo: "곡선·스트로크 5중첩", labelEn: "5x Overlapping Stroke & Curve Libs", stackCount: 5, targetArchitectureKo: "studio-wasm64-drawing-core::vector_psd_tile_kernel + brush_kernel 단일 Rust 파이프라인", targetArchitectureEn: "Unified studio-wasm64-drawing-core::vector_psd_tile_kernel + brush_kernel", resolvedByWave: 2 },
  { id: "spatial-boolean-2-overlap", category: "stroke-geometry", labelKo: "2D 공간·불리언 기하 2중첩", labelEn: "2x Spatial Index & 2D Boolean Geometry", stackCount: 2, targetArchitectureKo: "studio-wasm64-drawing-core::simd_bvh_skinning_kernel(MortonBvh2D) + studio-engine-vello::geometry", targetArchitectureEn: "studio-wasm64-drawing-core::simd_bvh_skinning_kernel (MortonBvh2D) + studio-engine-vello::geometry", resolvedByWave: 2 },
  { id: "color-space-4-overlap", category: "color-physics", labelKo: "색공간 4중첩", labelEn: "4x Overlapping Color & Pigment Libs", stackCount: 4, targetArchitectureKo: "studio-wasm64-drawing-core::spectral_km_kernel(KM 16파장) + 경량 UI 변환기 culori 단일 유지", targetArchitectureEn: "studio-wasm64-drawing-core::spectral_km_kernel (16-band KM) + single UI helper culori", resolvedByWave: 1 },
  { id: "3d-cad-4-overlap", category: "3d-cad-engine", labelKo: "3D·CAD 엔진 4중첩", labelEn: "4x Overlapping 3D & CAD Engines", stackCount: 4, targetArchitectureKo: "Three.js WebGPU 코어 단일화 + extended-3d Rust 스키닝 + Manifold/OCCT 동적 워커 격리", targetArchitectureEn: "Single Three.js WebGPU core + extended-3d Rust skinning + lazy Manifold/OCCT workers", resolvedByWave: 3 },
  { id: "raster-filter-vision-overlap", category: "image-vision", labelKo: "래스터 필터·선택 비전 중첩", labelEn: "Raster Filter & Selection Vision Overlap", stackCount: 2, targetArchitectureKo: "studio-wasm64-drawing-core::filter_warp_kernel + WebGPU WGSL 컴퓨트 필터", targetArchitectureEn: "studio-wasm64-drawing-core::filter_warp_kernel + WebGPU WGSL compute shaders", resolvedByWave: 3 },
]);

export const UNMEASURED_AUDIT_BOUNDARIES: readonly UnmeasuredAuditBoundary[] = Object.freeze([
  { id: "runtime-chunk-bytes", labelKo: "실제 Vite 프로덕션 청크 바이트(gzip/brotli) 및 트리셰이킹 제거율 — 별도 빌드 실측 필요", labelEn: "Actual Vite production chunk sizes (gzip/brotli) and tree-shaking ratio — requires vite build", verificationCommand: "pnpm run bundle:visualize" },
  { id: "transitive-node-modules", labelKo: "node_modules 하위 간접 의존성 및 중복 패키지 해상도 트리 — lockfile 그래프 분석 별도 수행", labelEn: "Transitive node_modules sub-dependencies and lockfile duplication tree — separate analysis", verificationCommand: "pnpm run quality:imports" },
  { id: "live-browser-frame-latency", labelKo: "실기기(Chrome memory64 vs iOS Safari wasm32) 프레임 지연·메모리 정점·WASM 초기화 시간", labelEn: "Live device (Chrome memory64 vs iOS Safari wasm32) frame latency, peak RAM, and init time", verificationCommand: "pnpm run verify:studio-engine" },
]);

type CompactAuditTuple = readonly [
  pkg: string, ver: string, prod: number, test: number, samples: readonly string[],
  group: DependencyOverlapGroupId, verdict: DependencyCutoverVerdict, lane: RustTargetLane,
  mod: string, wave: DependencyCutoverWave,
  guardKo: string, guardEn: string, gateKo: string, gateEn: string, whyKo: string, whyEn: string,
];

const OVERLAP_META_BY_ID: Readonly<Record<DependencyOverlapGroupId, DependencyOverlapGroupMeta>> = {
  "2d-renderer-5-overlap": DEPENDENCY_OVERLAP_GROUPS[0],
  "procedural-brush-sketch-2-overlap": DEPENDENCY_OVERLAP_GROUPS[1],
  "curve-stroke-5-overlap": DEPENDENCY_OVERLAP_GROUPS[2],
  "spatial-boolean-2-overlap": DEPENDENCY_OVERLAP_GROUPS[3],
  "color-space-4-overlap": DEPENDENCY_OVERLAP_GROUPS[4],
  "3d-cad-4-overlap": DEPENDENCY_OVERLAP_GROUPS[5],
  "raster-filter-vision-overlap": DEPENDENCY_OVERLAP_GROUPS[6],
};

function expandAuditTuple(row: CompactAuditTuple): DependencyAuditEntry {
  const [pkg, ver, prod, test, samples, group, verdict, lane, mod, wave, guardKo, guardEn, gateKo, gateEn, whyKo, whyEn] = row;
  const meta = OVERLAP_META_BY_ID[group];
  return Object.freeze({
    packageName: pkg, version: ver, measuredAt: AUDIT_MEASURED_AT,
    importFileCount: prod + test, prodImportFileCount: prod, testImportFileCount: test,
    sampleImportPaths: Object.freeze([...samples]),
    category: meta.category, overlapGroupId: group, overlapGroupLabelKo: meta.labelKo, overlapGroupLabelEn: meta.labelEn,
    verdict, rustTargetLane: lane, rustTargetModule: mod, cutoverWave: wave,
    safariWasm32GuardKo: guardKo, safariWasm32GuardEn: guardEn,
    zeroDiffGateKo: gateKo, zeroDiffGateEn: gateEn, rationaleKo: whyKo, rationaleEn: whyEn,
  });
}

const MEASURED_TUPLE_ROWS: readonly CompactAuditTuple[] = [
  ["konva", "^10.10.0", 87, 35, ["apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx", "apps/web/src/domains/creator/BlendIsolationGroup.tsx"], "2d-renderer-5-overlap", "replace-with-rust-wasm64", "studio-engine-vello", "studio-engine-vello::hybrid_scene + studio-wasm64-drawing-core::tile_compositor_kernel", 4,
    "iOS Safari wasm32(4GiB 상한) 타일 스와퍼 폴백 및 vello_cpu 소프트웨어 패스 유지", "Retain iOS Safari wasm32 (4GiB cap) tile swapper fallback and vello_cpu software path",
    "레이어 합성·클리핑 마스크·블렌드 모드 픽셀 차분 0-diff(verify:studio-gpu-committed-parity)", "0-diff parity on layer compositing, clip masks, and blend modes (verify:studio-gpu-committed-parity)",
    "현재 주력 2D 스테이지(운영 87파일)이므로 하위 렌더러와 동치 게이트 검증 뒤 Wave 4에서 전환", "Primary 2D stage (87 prod files); cut over in Wave 4 after smaller renderers pass parity gates"],
  ["react-konva", "^19.3.2", 37, 0, ["apps/web/src/domains/creator/BlendIsolationGroup.tsx", "apps/web/src/domains/creator/StudioAdvancedRulerOverlay.tsx"], "2d-renderer-5-overlap", "replace-with-rust-wasm64", "studio-engine-vello", "studio-engine-vello::gpu_web + WebGPU WGSL 오버레이 호스트", 4,
    "WebGPU 미지원 iOS Safari에서 Canvas2D/vello_cpu 씬 호스트 자동 폴백", "Auto-fallback to Canvas2D/vello_cpu scene host on Safari without WebGPU",
    "가이드·자·선택 오버레이 히트테스트 좌표 오차 0.5px 이내 동치 검증", "Hit-test & overlay geometry parity within 0.5px against React-Konva stage",
    "konva에 강결합된 React 바인딩(운영 37파일)으로 Wave 4에서 konva와 함께 퇴역", "Tightly coupled React wrapper for konva (37 prod files); retire atomically with konva in Wave 4"],
  ["pixi.js", "^8.23.0", 1, 1, ["apps/web/src/domains/creator/render/studio-pixi-scene-provider.ts"], "2d-renderer-5-overlap", "replace-with-rust-wasm64", "studio-engine-vello", "studio-engine-vello::gpu_web + studio-engine-vello::hybrid_scene", 1,
    "wasm32 vello_cpu 참조 렌더러 동시 빌드로 iOS Safari 오버레이 호환 유지", "Dual wasm32 vello_cpu reference build keeps Safari overlay parity intact",
    "studio-scene-provider 선택 오버레이 경계 및 히트테스트 계약 0-diff 통과", "Pass studio-scene-provider overlay bounds & hit-test contract with 0-diff",
    "운영 임포트가 단 1개 파일(studio-pixi-scene-provider.ts)뿐이라 Wave 1 우선 제거 대상", "Only 1 prod import (studio-pixi-scene-provider.ts); top Wave 1 elimination candidate"],
  ["phaser", "^4.2.1", 42, 3, ["apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas.tsx"], "2d-renderer-5-overlap", "lazy-isolate-chunk", "lazy-chunk-isolated", "virtual-space 전용 지연 청크 격리 (중장기: studio-engine-vello::hybrid_scene)", 3,
    "드로잉 셸 초기 그래프와 완전 분리 유지, Safari WebGL 컨텍스트 복구 가드 유지", "Keep detached from eager drawing shell; preserve Safari WebGL context-loss guard",
    "check:studio-eager-graph 0유입 검증 및 가상 공간 아바타 이동 회귀 0건", "Zero eager-graph leakage (check:studio-eager-graph) & zero virtual-space regression",
    "가상 공간(virtual-space) 전용 42개 파일이 사용하므로 드로잉 번들과 지연 청크 격리 고정", "Scoped to 42 virtual-space files; enforce strict dynamic-chunk isolation away from drawing shell"],
  ["paper", "0.17.0", 1, 3, ["apps/web/src/domains/creator/render/studio-engine-vector-geometry-provider.ts"], "2d-renderer-5-overlap", "replace-with-rust-wasm64", "studio-engine-vello", "studio-engine-vello::geometry + studio-wasm64-drawing-core::vector_psd_tile_kernel", 2,
    "순수 Rust 벡터 경로 커널 wasm32/wasm64 이중 빌드로 DOM Canvas 의존 제거", "Dual wasm32/wasm64 Rust path kernel removes Paper.js DOM canvas dependency",
    "벡터 보정 경로 경계 박스·제어점 오차 0.01px 이내 0-diff 검증", "Vector path bounds & control-point parity within 0.01px epsilon",
    "운영 1개 파일(studio-engine-vector-geometry-provider.ts)만 참조하며 Rust 벡터 커널로 치환", "Single prod file usage; cleanly replaceable by Rust vector geometry kernels in Wave 2"],
  ["canvaskit-wasm", "0.42.0", 3, 1, ["apps/web/src/domains/creator/render/studio-canvaskit-adapter.ts", "apps/web/src/domains/creator/render/studio-canvaskit-quality-engine.ts"], "2d-renderer-5-overlap", "replace-with-rust-wasm64", "studio-engine-vello", "studio-engine-vello::render (vello_cpu / vello_hybrid) + tile_compositor_kernel", 3,
    "vello_cpu wasm32 폴백이 Safari에서 Skia WASM을 대체해 이중 WASM 힙 점유 해소", "vello_cpu wasm32 fallback replaces Skia WASM on Safari, removing dual WASM heaps",
    "verify:studio-vello-candidate 및 품질 워커 골든 이미지 0-diff 동치 통과", "Pass verify:studio-vello-candidate and quality-worker golden image 0-diff gate",
    "운영 3파일의 외부 Skia WASM 중복 힙을 자사 Rust studio-engine-vello로 통합", "Consolidate external Skia WASM (3 prod files) into first-party studio-engine-vello"],
  ["p5.brush", "2.2.1", 2, 0, ["apps/web/src/domains/creator/brush/studio-p5-brush-standalone-runtime-adapter.ts", "apps/web/src/domains/creator/drawing/studio-natural-media-brushes.ts"], "procedural-brush-sketch-2-overlap", "replace-with-rust-wasm64", "studio-wasm64-drawing-core", "studio-wasm64-drawing-core::tactile_texture_kernel + WebGPU WGSL 브리슬 셰이더", 2,
    "tactile_texture_kernel wasm32 CPU 스탬프 폴백으로 Safari 수채·해칭 브러시 보존", "Keep Safari natural-media strokes via tactile_texture_kernel wasm32 CPU stamp fallback",
    "표준 11종 내추럴 브러시 궤적·종이 높이장 결정론적 시드 동치 검증", "Deterministic seed parity across 11 natural-media brush presets & paper grain LUT",
    "이미 구현된 Rust tactile_texture_kernel·brush_kernel이 브리슬·종이 결 스탬프를 직접 지원", "Existing Rust tactile_texture_kernel & brush_kernel already implement bristle and paper LUT stamps"],
  ["roughjs", "^4.6.6", 2, 2, ["apps/web/src/domains/creator/studio-rough-shape.ts", "apps/web/src/domains/creator/studio-rough-svg-parity.ts"], "procedural-brush-sketch-2-overlap", "replace-with-rust-wasm64", "studio-wasm64-drawing-core", "studio-wasm64-drawing-core::vector_psd_tile_kernel + studio-engine-vello::svg", 2,
    "wasm32/wasm64 동일 PRNG 시드로 Safari·Chromium 간 손그림 해칭 경로 일치", "Identical PRNG seed across wasm32/wasm64 ensures identical sketch hatching on Safari",
    "studio-rough-svg-parity 골든 SVG 경로 좌표 및 해칭 선분 수 0-diff 검증", "0-diff parity on studio-rough-svg-parity golden SVG paths & hachure segment count",
    "운영 2파일의 결정론적 손그림 해칭 생성을 Rust 벡터 패스 생성기로 통합", "2 prod files of deterministic sketch hatching absorb cleanly into Rust vector path kernels"],
  ["perfect-freehand", "1.2.3", 4, 3, ["apps/web/src/domains/creator/drawing/studio-stroke-vectorizer.ts", "apps/web/src/domains/creator/brush/studio-native-brush-probe-program.ts"], "curve-stroke-5-overlap", "replace-with-rust-wasm64", "studio-wasm64-drawing-core", "studio-wasm64-drawing-core::brush_kernel + vector_psd_tile_kernel", 2,
    "wasm32 선형 버퍼로 가변 굵기 윤곽 정점 직접 반환해 Safari GC 정지 제거", "Return variable-width outline vertices via wasm32 linear buffer, avoiding Safari GC pauses",
    "필압·테이퍼·스무딩 윤곽 폴리곤 Hausdorff 거리 < 0.05px 동치 검증", "Pressure/taper outline polygon parity within 0.05px Hausdorff distance",
    "운영 4파일의 필압 윤곽선 생성을 Rust 스트로크 코어로 옮겨 포인터 핫패스 일원화", "Move pressure-outline generation (4 prod files) into Rust stroke core to unify pointer hotpath"],
  ["lazy-brush", "^2.0.2", 2, 1, ["apps/web/src/domains/creator/studio-lazy-brush-stabilizer.ts", "apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-brush-filter-edit-runtime.ts"], "curve-stroke-5-overlap", "replace-with-rust-wasm64", "studio-wasm64-drawing-core", "studio-wasm64-drawing-core::brush_kernel (pointer stabilizer)", 1,
    "i32/i64 공통 f64 스칼라 연산이라 iOS Safari wasm32와 데스크톱 결과 동일", "Pure f64 scalar math produces identical stabilizer trails on Safari wasm32 and wasm64",
    "지연 반경 0~64px 구간 스트로크 좌표 오차 < 1e-6 0-diff 검증", "0-diff coordinate parity (< 1e-6) across 0-64px lazy radius sweeps",
    "운영 2파일의 포인터 끈 안정화 수학을 Rust 브러시 커널에 흡수해 Wave 1 즉시 제거", "Simple pointer string-pull math (2 prod files) folds directly into Rust brush_kernel in Wave 1"],
  ["simplify-js", "^1.2.4", 1, 1, ["apps/web/src/domains/creator/studio-vector-ink-geometry.ts"], "curve-stroke-5-overlap", "replace-with-rust-wasm64", "studio-wasm64-drawing-core", "studio-wasm64-drawing-core::vector_psd_tile_kernel (RDP simplification)", 1,
    "studio-wasm64-drawing-core.wasm(47.99 KiB) wasm32 빌드에 RDP 단순화 이미 포함", "RDP simplification is already compiled inside the 47.99 KiB wasm32/wasm64 core",
    "단순화 전후 시점·종점 무손실 보존 및 허용 오차 내 정점 수 동치 검증", "Exact endpoint preservation and vertex-count parity within tolerance",
    "운영 1파일 전용이며 vector_psd_tile_kernel::vectorize_stroke_to_cubic_beziers에 이미 구현됨", "1 prod file only; already implemented inside vector_psd_tile_kernel::vectorize_stroke_to_cubic_beziers"],
  ["fit-curve", "^0.2.0", 1, 1, ["apps/web/src/domains/creator/studio-vector-ink-geometry.ts"], "curve-stroke-5-overlap", "replace-with-rust-wasm64", "studio-wasm64-drawing-core", "studio-wasm64-drawing-core::vector_psd_tile_kernel (cubic Bezier fitting)", 1,
    "wasm32/wasm64 공용 Schneider 3차 베지어 피팅으로 Safari 동일 곡선 출력", "Shared wasm32/wasm64 Schneider cubic Bezier fitter keeps identical curves on Safari",
    "제어점 유한성·연속 세그먼트 접합·원본 스팬 커버리지 0-diff 게이트", "0-diff gate on finite control points, C0 continuity, and full span coverage",
    "운영 1파일 전용이며 Rust vector_psd_tile_kernel이 동일 베지어 피팅을 제공", "1 prod file only; superseded by Rust vector_psd_tile_kernel cubic Bezier fitting"],
  ["bezier-js", "^6.1.4", 1, 0, ["apps/web/src/domains/creator/studio-vector-ink-geometry.ts"], "curve-stroke-5-overlap", "replace-with-rust-wasm64", "studio-wasm64-drawing-core", "studio-wasm64-drawing-core::vector_psd_tile_kernel + studio-engine-vello::geometry", 1,
    "wasm32/wasm64 공통 호길이·극값·투영 수치 해석 커널로 브라우저 편차 0%", "Shared wasm32/wasm64 arc-length, extrema, and projection math eliminates browser drift",
    "호길이·바운딩박스·필압 투영 매개변수 t 오차 < 1e-4 동치 검증", "Arc length, bounding box, and projection t-parameter parity within 1e-4",
    "studio-vector-ink-geometry.ts 단독 사용(1파일); simplify-js·fit-curve와 함께 Wave 1 일괄 제거", "Used in 1 file only; retire together with simplify-js and fit-curve in Wave 1"],
  ["polygon-clipping", "^0.15.7", 3, 0, ["apps/web/src/domains/creator/drawing/studio-stroke-vectorizer.ts", "apps/web/src/domains/creator/studio-path-boolean.ts"], "spatial-boolean-2-overlap", "replace-with-rust-wasm64", "studio-engine-vello", "studio-engine-vello::geometry + studio-wasm64-drawing-core::vector_psd_tile_kernel", 2,
    "고정밀 정수 스냅 스위프 불리언을 wasm32/wasm64 공용 실행해 퇴화 폴리곤 방지", "Integer-snapped sweep boolean runs identically on wasm32/wasm64 without degenerate loops",
    "합집합·차집합·교집합 면적 오차 < 0.01% 및 자기교차 0건 검증", "Union/diff/intersection area parity within 0.01% and zero self-intersections",
    "운영 3파일의 2D 경로 불리언을 Rust 기하 커널로 통합해 JS 폴리곤 힙 할당 제거", "Consolidate 2D path booleans (3 prod files) into Rust geometry kernel to remove JS heap churn"],
  ["rbush", "4.0.1", 1, 2, ["apps/web/src/domains/creator/render/studio-engine-scene-spatial-index.ts"], "spatial-boolean-2-overlap", "replace-with-rust-wasm64", "studio-wasm64-drawing-core", "studio-wasm64-drawing-core::simd_bvh_skinning_kernel (MortonBvh2D)", 2,
    "외부 크레이트 0개 순수 Rust MortonBvh2D로 Safari wasm32와 데스크톱 쿼리 동일", "Zero-dependency Rust MortonBvh2D runs identically in Safari wasm32 and Chromium wasm64",
    "AABB 질의 반환 ID 집합 100% 일치(0-diff set equality) 검증", "100% exact AABB query ID set equality against rbush R-tree",
    "운영 1파일 전용이며 simd_bvh_skinning_kernel의 build_morton_bvh_2d/query_morton_bvh_aabb 구현 완료", "1 prod file only; directly superseded by existing Rust build_morton_bvh_2d & query_morton_bvh_aabb"],
  ["spectral.js", "3.0.0", 1, 1, ["apps/web/src/domains/creator/brush-lab/pigment/external-pigments.ts"], "color-space-4-overlap", "replace-with-rust-wasm64", "studio-wasm64-drawing-core", "studio-wasm64-drawing-core::spectral_km_kernel (mix_pigments_km16_strip)", 1,
    "이미 컴파일된 studio-wasm64-drawing-core.wasm의 KM 16파장 커널이 wasm32·JS 폴백 완비", "Compiled 16-band KM kernel already ships with wasm32 & byte-exact JS fallback",
    "청+황 감산 녹색 재현 및 Wasm vs JS 폴백 maxChannelDiff === 0 검증 통과", "Subtractive blue+yellow green synthesis and Wasm-vs-JS maxChannelDiff === 0",
    "운영 1파일(external-pigments.ts)만 사용하며 Rust spectral_km_kernel이 즉시 대체", "1 prod file (external-pigments.ts); directly replaced by existing Rust spectral_km_kernel"],
  ["colormix", "3.2.0", 1, 1, ["apps/web/src/domains/creator/brush-lab/pigment/external-pigments.ts"], "color-space-4-overlap", "replace-with-rust-wasm64", "studio-wasm64-drawing-core", "studio-wasm64-drawing-core::spectral_km_kernel + culori Lab/OKLCH", 1,
    "colormix/dist/index.mjs 수동 경로 우회 제거 및 전 브라우저 동일 Rust 분광 혼색 적용", "Removes brittle colormix/dist/index.mjs subpath workaround across all browsers",
    "브러시 랩 비교 스트립 DeltaE2000 허용 오차 검증 및 external-pigments 계약 통과", "Brush-lab comparison strip DeltaE2000 verification & external-pigments contract pass",
    "루트 엔트리가 깨져 subpath 우회가 필요한 비교 전용 1파일 의존성이라 Wave 1 즉시 제거", "Broken root entry requiring subpath workaround in 1 file; eliminate immediately in Wave 1"],
  ["colorjs.io", "^0.7.1", 1, 4, ["apps/web/src/domains/creator/studio-color-quality-engine.ts"], "color-space-4-overlap", "consolidate-single-lib", "platform-retained", "culori 단일 통합 (장기: studio-wasm64-drawing-core OKLCH 가멋 매핑 확장)", 1,
    "culori를 단일 변환 모듈 후보로 삼고 Safari 초기화 시간을 별도로 측정", "Use culori as the conversion candidate and measure Safari initialization separately",
    "WCAG 대비비·OKLCH/DeltaE2000 계산 결과 오차 < 0.005 동치 검증", "WCAG contrast & OKLCH/DeltaE2000 numerical parity within 0.005",
    "운영 1파일(studio-color-quality-engine.ts)과 4개 대비 테스트를 이미 공존하는 culori로 통합", "Consolidate 1 prod file + 4 contrast tests onto already-installed culori in Wave 1"],
  ["culori", "^4.0.2", 2, 1, ["apps/web/src/domains/creator/brush-lab/pigment/latent-pigment-api.ts", "apps/web/src/domains/creator/studio-color-quality-engine.ts"], "color-space-4-overlap", "keep-platform-core", "platform-retained", "경량 JS OKLCH/CSS 색공간 단일 코어 유지 (픽셀 혼색은 Rust spectral_km_kernel 담당)", 1,
    "WASM 인스턴스 없이 CSS/UI 색 변환을 즉시 처리해 Safari 초기 부트 부담 없음", "Handles UI/CSS color conversions without WASM init overhead on Safari",
    "트리셰이킹 단일 색공간 API 표면 유지 및 타 색 라이브러리 재유입 차단", "Keep single tree-shakeable color API surface and block re-introduction of duplicates",
    "색공간 4중첩 해소 후 남기는 유일한 경량 JS 색공간 변환 코어(운영 2파일 + @types/culori 보유)", "Single retained lightweight JS color-space helper after resolving 4x color overlap"],
  ["three", "0.187.0", 335, 318, ["apps/web/src/domains/creator/StudioUnifiedAssetPreviewSurface.tsx", "apps/web/src/domains/creator/bg3d/StudioBackground3DTypes.ts"], "3d-cad-4-overlap", "keep-platform-core", "platform-retained", "Three.js WebGPU 3D 플랫폼 코어 유지 + studio-wasm64-drawing-core::simd_bvh_skinning_kernel (extended-3d)", 3,
    "Three.js WebGPU→WebGL2 자동 폴백 + Rust extended-3d 스키닝 wasm32 지원 유지", "Keep Three.js WebGPU->WebGL2 fallback alongside wasm32 extended-3d Rust skinning",
    "verify:studio-3d-professional-completion 및 VRM/BG3D 골든 캡처 동치 유지", "Maintain verify:studio-3d-professional-completion & VRM/BG3D golden capture parity",
    "653개 파일(운영 335파일)과 three-vrm/R3F 생태계 기반이므로 3D 단일 플랫폼 코어로 유지", "Deeply embedded across 653 files (335 prod) with three-vrm/R3F; retain as sole 3D core"],
  ["@babylonjs/core", "9.37.1", 9, 5, ["apps/web/src/domains/creator/bg3d/studio-bg3d-babylon-artifact-capture.ts", "apps/web/src/domains/creator/bg3d/studio-bg3d-babylon-artifact-descriptors.ts"], "3d-cad-4-overlap", "consolidate-single-lib", "webgpu-wgsl", "three WebGPU 렌더러 통합 + WebGPU WGSL LT 선화 패스 (simd_bvh_skinning_kernel)", 3,
    "Three.js WebGL2 폴백과 단일 3D 컨텍스트 공유로 Safari GPU 메모리 한도 보호", "Sharing one Three.js WebGL2/WebGPU context protects Safari GPU memory limits",
    "bg3d 아티팩트 캡처 셰이더·법선 엣지 LT 출력 골든 이미지 동치 검증", "Golden parity on bg3d artifact capture shaders and normal-edge LT extraction",
    "운영 9파일의 bg3d 캡처 보조 용도 때문에 2번째 대형 3D 엔진을 유지할 실익이 없어 Three로 통합", "9 prod files for bg3d capture do not justify a second 3D engine; consolidate onto Three.js"],
  ["manifold-3d", "3.5.1", 4, 5, ["apps/web/src/domains/creator/studio-manifold-mesh-provider.ts", "apps/web/src/domains/creator/studio-solid-boolean-backend.ts"], "3d-cad-4-overlap", "lazy-isolate-chunk", "lazy-chunk-isolated", "전용 Worker 지연 청크 격리 유지 (사전 충돌·BVH는 simd_bvh_skinning_kernel 보조)", 2,
    "전용 Worker 지연 로드 및 32비트 WASM 메모리 해제(dispose) 가드로 Safari OOM 방지", "Lazy Worker isolation + explicit WASM dispose prevents Safari OOM during CSG ops",
    "매니폴드 솔리드 불리언 수밀성(nonManifoldEdgeCount === 0) 및 eager 그래프 0유입", "Watertight boolean invariant (0 non-manifold edges) and 0 eager-graph imports",
    "운영 4파일의 수밀 3D 솔리드 불리언 특화 커널이므로 지연 청크 격리를 강제하고 필요 시만 로드", "Specialized watertight 3D CSG kernel (4 prod files); enforce strict on-demand lazy chunk isolation"],
  ["opencascade.js", "1.1.1", 1, 0, ["apps/web/src/domains/creator/studio-occt-wasm-facade.ts"], "3d-cad-4-overlap", "lazy-isolate-chunk", "lazy-chunk-isolated", "LGPL-2.1 분리 WASM 동적 청크 영구 격리 (opt-in STEP/B-Rep CAD 작업 전용)", 2,
    "옵트인 CAD 워크플로에서만 동적 fetch 로드하며 Safari 저메모리 환경에서 자동 워커 격리", "Opt-in dynamic fetch isolation only; runs inside isolated worker with Safari memory guard",
    "LGPL-2.1 동적 링크 분리 준수 + check:studio-eager-graph 0유입 + STEP 볼륨 동치", "LGPL-2.1 dynamic separation compliance + 0 eager-graph imports + STEP volume parity",
    "운영 1파일(studio-occt-wasm-facade.ts)의 LGPL-2.1 B-Rep CAD 커널로 동적 분리 청크 유지 필수", "1 prod file LGPL-2.1 B-Rep CAD kernel; must stay dynamically isolated in an opt-in WASM chunk"],
  ["@techstark/opencv-js", "5.0.0-release.1", 2, 4, ["apps/web/src/domains/creator/studio-opencv-image-provider.ts", "apps/web/src/domains/creator/studio-opencv-selection.ts"], "raster-filter-vision-overlap", "replace-with-rust-wasm64", "webgpu-wgsl", "studio-wasm64-drawing-core::filter_warp_kernel + WebGPU WGSL 컴퓨트 필터", 3,
    "WebGPU 미지원 Safari는 studio-wasm64-drawing-core::filter_warp_kernel wasm32 CPU 경로 사용", "Safari without WebGPU uses studio-wasm64-drawing-core::filter_warp_kernel wasm32 CPU lane",
    "언샤프·가우시안 블러·매직완드 선택 마스크 픽셀 차분 maxChannelDiff === 0 검증", "Zero-bleed blur, unsharp mask, and magic-wand selection mask maxChannelDiff === 0",
    "운영 2파일의 선택·필터 연산을 위해 대형 Emscripten OpenCV를 로드 중; Rust+WGSL로 완전 치환", "Heavy Emscripten OpenCV serves only 2 prod files; fully replace with Rust filter_warp_kernel + WGSL"],
];

export const MEASURED_DEPENDENCY_AUDIT_CATALOG: readonly DependencyAuditEntry[] = Object.freeze(
  MEASURED_TUPLE_ROWS.map(expandAuditTuple),
);

export function getDependencyAuditEntry(packageName: string): DependencyAuditEntry | undefined {
  return MEASURED_DEPENDENCY_AUDIT_CATALOG.find((entry) => entry.packageName === packageName);
}

function clampWave(wave: DependencyCutoverWave | undefined): DependencyCutoverWave {
  return wave === 1 || wave === 2 || wave === 3 || wave === 4 ? wave : 1;
}

function normalizeCategory(category: DependencyCategoryFilter | undefined): DependencyCategoryFilter {
  if (
    category === "all" ||
    category === "2d-canvas-renderer" ||
    category === "stroke-geometry" ||
    category === "color-physics" ||
    category === "3d-cad-engine" ||
    category === "image-vision"
  ) {
    return category;
  }
  return "all";
}

function isRemovableOrConsolidatable(verdict: DependencyCutoverVerdict): boolean {
  return verdict === "replace-with-rust-wasm64" || verdict === "consolidate-single-lib";
}

function buildOverlapStatuses(
  filteredEntries: readonly DependencyAuditEntry[],
  targetWave: DependencyCutoverWave,
): readonly OverlapGroupResolutionStatus[] {
  const result: OverlapGroupResolutionStatus[] = [];
  for (const group of DEPENDENCY_OVERLAP_GROUPS) {
    const members = filteredEntries.filter((entry) => entry.overlapGroupId === group.id);
    if (members.length === 0) continue;
    const actionable = members.filter((entry) => entry.verdict !== "keep-platform-core");
    const addressed = actionable.filter((entry) => entry.cutoverWave <= targetWave);
    const removableCount = members.filter(
      (entry) => entry.cutoverWave <= targetWave && isRemovableOrConsolidatable(entry.verdict),
    ).length;
    result.push({
      groupId: group.id,
      category: group.category,
      labelKo: group.labelKo,
      labelEn: group.labelEn,
      totalPackages: members.length,
      actionablePackages: actionable.length,
      addressedActionablePackages: addressed.length,
      removableOrConsolidatableCount: removableCount,
      resolutionPct: actionable.length === 0 ? 100 : Math.round((addressed.length / actionable.length) * 100),
      isFullyResolved: addressed.length === actionable.length,
      targetArchitectureKo: group.targetArchitectureKo,
      targetArchitectureEn: group.targetArchitectureEn,
    });
  }
  return result;
}

function buildWaveBreakdown(filteredEntries: readonly DependencyAuditEntry[]): readonly WaveConvergencePoint[] {
  const totalActionable = filteredEntries.filter((e) => e.verdict !== "keep-platform-core").length;
  const totalReplaceable = filteredEntries.filter((e) => e.verdict === "replace-with-rust-wasm64").length;
  return DEPENDENCY_CUTOVER_WAVES.map((meta) => {
    const waveItems = filteredEntries.filter((e) => e.cutoverWave === meta.wave);
    const cumulative = filteredEntries.filter((e) => e.cutoverWave <= meta.wave);
    const cumulativeActionable = cumulative.filter((e) => e.verdict !== "keep-platform-core").length;
    const cumulativeRemovable = cumulative.filter((e) => isRemovableOrConsolidatable(e.verdict)).length;
    const cumulativeRust = cumulative.filter((e) => e.verdict === "replace-with-rust-wasm64").length;
    return {
      wave: meta.wave,
      titleKo: meta.titleKo,
      titleEn: meta.titleEn,
      wavePackageCount: waveItems.length,
      cumulativeAddressedCount: cumulative.length,
      cumulativeRemovableCount: cumulativeRemovable,
      cumulativeRustWasm64Count: cumulativeRust,
      cumulativeOverlapResolutionPct:
        totalActionable === 0 ? 100 : Math.round((cumulativeActionable / totalActionable) * 100),
      cumulativeRustCoveragePct:
        totalReplaceable === 0 ? 0 : Math.round((cumulativeRust / totalReplaceable) * 100),
    };
  });
}

function buildChecklist(
  activeEntries: readonly DependencyAuditEntry[],
  maintainSafariWasm32Fallback: boolean,
): readonly CutoverChecklistStep[] {
  const steps: CutoverChecklistStep[] = [];
  for (const meta of DEPENDENCY_CUTOVER_WAVES) {
    const waveActionable = activeEntries.filter(
      (e) => e.cutoverWave === meta.wave && e.verdict !== "keep-platform-core",
    );
    if (waveActionable.length === 0) continue;

    const rustCount = waveActionable.filter((e) => e.verdict === "replace-with-rust-wasm64").length;
    const consolidateCount = waveActionable.filter((e) => e.verdict === "consolidate-single-lib").length;
    const lazyCount = waveActionable.filter((e) => e.verdict === "lazy-isolate-chunk").length;
    const uniqueLanes: string[] = [];
    for (const entry of waveActionable) {
      if (!uniqueLanes.includes(entry.rustTargetLane)) uniqueLanes.push(entry.rustTargetLane);
    }

    const partsKo: string[] = [];
    const partsEn: string[] = [];
    if (rustCount > 0) {
      partsKo.push(`Rust·WASM64 치환 ${rustCount}종`);
      partsEn.push(`${rustCount} Rust/WASM64 replacement(s)`);
    }
    if (consolidateCount > 0) {
      partsKo.push(`단일 통합 ${consolidateCount}종`);
      partsEn.push(`${consolidateCount} single-lib consolidation(s)`);
    }
    if (lazyCount > 0) {
      partsKo.push(`지연 청크 격리 ${lazyCount}종`);
      partsEn.push(`${lazyCount} lazy-chunk isolation gate(s)`);
    }

    steps.push({
      id: `cutover-wave-${meta.wave}`,
      wave: meta.wave,
      titleKo: `${meta.titleKo} (${partsKo.join(" · ")})`,
      titleEn: `${meta.titleEn} (${partsEn.join(" · ")})`,
      targetPackages: waveActionable.map((e) => e.packageName),
      rustTargetSummary: uniqueLanes.join(", "),
      verificationGateKo:
        meta.wave === 4
          ? "0-diff 픽셀 회귀(verify:studio-gpu-committed-parity) + check:studio-eager-graph + E2E 통과 후 package.json 제거"
          : "단위·골든 0-diff 동치 게이트 통과 + check:studio-eager-graph 0유입 확인 후 어댑터 전환",
      verificationGateEn:
        meta.wave === 4
          ? "Pass 0-diff pixel parity (verify:studio-gpu-committed-parity) + eager-graph + E2E before npm removal"
          : "Pass unit & golden 0-diff parity gates + 0 eager-graph leakage before removing legacy adapter",
      safariFallbackDirectiveKo: maintainSafariWasm32Fallback
        ? rustCount > 0
          ? "iOS Safari wasm32(4GiB 상한) 이중 아티팩트 동시 빌드 + AddressSpaceMode 자동 폴백 검증 필수"
          : "초기 청크 분리 유지 + Safari WebGL2/워커 메모리 회수(dispose) 확인"
        : "주의: Safari wasm32 폴백 비활성 — memory64 미지원 WebKit 기기 차단 위험 명시 및 실험 플래그 격리 필요",
      safariFallbackDirectiveEn: maintainSafariWasm32Fallback
        ? rustCount > 0
          ? "Build dual wasm64+wasm32 (4GiB cap) artifacts and verify AddressSpaceMode Safari fallback"
          : "Preserve lazy-chunk isolation and verify Safari WebGL2/Worker memory disposal"
        : "Warning: Safari wasm32 fallback disabled — flag WebKit incompatibility and gate behind experimental toggle",
    });
  }
  return steps;
}

/** 기록된 표와 선택한 단계·카테고리·Safari 옵션으로 전환 계획을 계산한다. */
export function evaluateDependencyCutoverPlan(input?: DependencyCutoverPlanInput): DependencyCutoverPlanResult {
  const targetWave = clampWave(input?.targetWave);
  const categoryFilter = normalizeCategory(input?.categoryFilter);
  const maintainSafariWasm32Fallback = input?.maintainSafariWasm32Fallback ?? true;

  const entries =
    categoryFilter === "all"
      ? MEASURED_DEPENDENCY_AUDIT_CATALOG
      : MEASURED_DEPENDENCY_AUDIT_CATALOG.filter((entry) => entry.category === categoryFilter);
  const activeWaveEntries = entries.filter((entry) => entry.cutoverWave <= targetWave);
  const deferredEntries = entries.filter((entry) => entry.cutoverWave > targetWave);

  const overlapGroups = buildOverlapStatuses(entries, targetWave);
  const waveBreakdown = buildWaveBreakdown(entries);
  const checklist = buildChecklist(activeWaveEntries, maintainSafariWasm32Fallback);

  const totalActionable = entries.filter((e) => e.verdict !== "keep-platform-core").length;
  const addressedActionable = activeWaveEntries.filter((e) => e.verdict !== "keep-platform-core").length;
  const totalReplaceableInScope = entries.filter((e) => e.verdict === "replace-with-rust-wasm64").length;
  const replaceWithRustWasm64Count = activeWaveEntries.filter((e) => e.verdict === "replace-with-rust-wasm64").length;
  const consolidateSingleLibCount = activeWaveEntries.filter((e) => e.verdict === "consolidate-single-lib").length;
  const lazyIsolateChunkCount = activeWaveEntries.filter((e) => e.verdict === "lazy-isolate-chunk").length;
  const keepPlatformCoreCount = entries.filter((e) => e.verdict === "keep-platform-core").length;

  return {
    auditScopeKind: AUDIT_SCOPE_KIND,
    catalogProvenance: "curated-snapshot",
    currentImportScanVerified: false,
    measuredAt: AUDIT_MEASURED_AT,
    manifestPath: AUDIT_MANIFEST_PATH,
    scannedDirectory: AUDIT_SCANNED_DIRECTORY,
    scannedSourceFileCount: AUDIT_SCANNED_FILE_COUNT,
    rootRuntimeDependencyCount: AUDIT_ROOT_RUNTIME_DEP_COUNT,
    rustCoreWasmArtifactPath: RUST_CORE_WASM_ARTIFACT_PATH,
    rustCoreWasmMeasuredBytes: RUST_CORE_WASM_MEASURED_BYTES,
    targetWave,
    categoryFilter,
    maintainSafariWasm32Fallback,
    safariCompatibilityMode: maintainSafariWasm32Fallback ? "dual-wasm64-wasm32-safe" : "wasm64-primary-only",
    safariMaxLinearMemoryGiB: maintainSafariWasm32Fallback ? 4 : 0,
    wasm64PrimaryMemoryGiB: 16,
    safariCompatibilityWarningKo: maintainSafariWasm32Fallback
      ? null
      : "iOS Safari·WebKit은 memory64 단독 바이너리를 실행하지 못할 수 있어 운영 배포 전 wasm32 이중 폴백 활성화가 필수입니다.",
    safariCompatibilityWarningEn: maintainSafariWasm32Fallback
      ? null
      : "iOS Safari / WebKit may reject standalone memory64 binaries; re-enable dual wasm32 fallback before production release.",
    entries,
    activeWaveEntries,
    deferredEntries,
    metrics: {
      totalCatalogPackages: MEASURED_DEPENDENCY_AUDIT_CATALOG.length,
      totalAuditedPackages: entries.length,
      activeWavePackageCount: activeWaveEntries.length,
      deferredPackageCount: deferredEntries.length,
      totalMeasuredImportFiles: entries.reduce((sum, e) => sum + e.importFileCount, 0),
      totalMeasuredProdImportFiles: entries.reduce((sum, e) => sum + e.prodImportFileCount, 0),
      addressedImportFileCount: activeWaveEntries
        .filter((e) => e.verdict !== "keep-platform-core")
        .reduce((sum, e) => sum + e.importFileCount, 0),
      removableOrConsolidatableCount: replaceWithRustWasm64Count + consolidateSingleLibCount,
      totalRemovableOrConsolidatableInScope: entries.filter((e) => isRemovableOrConsolidatable(e.verdict)).length,
      replaceWithRustWasm64Count,
      totalReplaceableInScope,
      consolidateSingleLibCount,
      lazyIsolateChunkCount,
      keepPlatformCoreCount,
      overlapGroupCount: overlapGroups.length,
      resolvedOverlapGroupCount: overlapGroups.filter((g) => g.isFullyResolved).length,
      overlapResolutionPct: totalActionable === 0 ? 100 : Math.round((addressedActionable / totalActionable) * 100),
      rustWasm64CoveragePct:
        totalReplaceableInScope === 0 ? 0 : Math.round((replaceWithRustWasm64Count / totalReplaceableInScope) * 100),
    },
    overlapGroups,
    waveBreakdown,
    checklist,
    unmeasuredBoundaries: UNMEASURED_AUDIT_BOUNDARIES,
  };
}

/** 전환 계획을 ADR 호환 Markdown 보고서로 직렬화한다. */
export function exportDependencyAuditMarkdown(
  plan: DependencyCutoverPlanResult,
  locale: "ko" | "en" = "ko",
): string {
  const isEn = locale === "en";
  const lines: string[] = [
    isEn
      ? `# ADR Draft: Runtime Dependency Consolidation & Rust/WASM64 Drawing Engine Cutover (Wave 1-${plan.targetWave})`
      : `# ADR 초안: 의존성 정리와 Rust·WASM64 드로잉 엔진 전환 계획 (Wave 1~${plan.targetWave})`,
    "",
    isEn
      ? `- **Catalog**: \`${plan.auditScopeKind}\` (curated on ${plan.measuredAt}, current import scan unverified). Root ${plan.manifestPath}: ${plan.rootRuntimeDependencyCount} dependencies.`
      : `- **카탈로그**: \`${plan.auditScopeKind}\` (${plan.measuredAt} 작성 기록, 현재 임포트 재검증 전). 루트 ${plan.manifestPath} 의존성 ${plan.rootRuntimeDependencyCount}종.`,
    isEn
      ? `- **Existing Rust WASM Core**: \`${plan.rustCoreWasmArtifactPath}\` (${plan.rustCoreWasmMeasuredBytes} bytes)`
      : `- **현행 Rust WASM 코어**: \`${plan.rustCoreWasmArtifactPath}\` (${plan.rustCoreWasmMeasuredBytes} B)`,
    isEn
      ? `- **Safari WASM32 Guard**: \`${plan.safariCompatibilityMode}\` (Fallback cap: ${plan.safariMaxLinearMemoryGiB} GiB / Primary wasm64: ${plan.wasm64PrimaryMemoryGiB} GiB)`
      : `- **Safari WASM32 호환 가드**: \`${plan.safariCompatibilityMode}\` (폴백 상한 ${plan.safariMaxLinearMemoryGiB} GiB / 주력 wasm64 ${plan.wasm64PrimaryMemoryGiB} GiB)`,
    isEn
      ? `- **Summary**: Removable/Consolidatable ${plan.metrics.removableOrConsolidatableCount}/${plan.metrics.totalAuditedPackages}, Overlap Resolution ${plan.metrics.overlapResolutionPct}%, Rust/WASM64 Coverage ${plan.metrics.rustWasm64CoveragePct}%`
      : `- **선택한 단계의 계획**: 제거·통합 후보 ${plan.metrics.removableOrConsolidatableCount}/${plan.metrics.totalAuditedPackages}종, 중복군 반영 ${plan.metrics.overlapResolutionPct}%, Rust·WASM64 후보 반영 ${plan.metrics.rustWasm64CoveragePct}%`,
  ];

  if (plan.safariCompatibilityWarningKo && plan.safariCompatibilityWarningEn) {
    lines.push("", `> [!WARNING] ${isEn ? plan.safariCompatibilityWarningEn : plan.safariCompatibilityWarningKo}`);
  }

  lines.push(
    "",
    isEn ? "## 1. Dependency Planning Matrix" : "## 1. 의존성 전환 계획표",
    "",
    isEn
      ? "| Package | Version | Imports (Prod/Test) | Overlap Group | Wave | Verdict | Target Rust/WASM64 Module |"
      : "| 패키지 | 기록된 버전 | 기록된 임포트 수 (운영/테스트) | 중복군 | 웨이브 | 전환 제안 | 대응 Rust·WASM64 모듈 |",
    "| --- | --- | ---: | --- | :---: | --- | --- |",
  );

  for (const entry of plan.entries) {
    const groupLabel = isEn ? entry.overlapGroupLabelEn : entry.overlapGroupLabelKo;
    lines.push(
      `| \`${entry.packageName}\` | \`${entry.version}\` | ${entry.importFileCount} (${entry.prodImportFileCount}/${entry.testImportFileCount}) | ${groupLabel} | W${entry.cutoverWave} | \`${entry.verdict}\` | ${entry.rustTargetModule} |`,
    );
  }

  lines.push("", isEn ? "## 2. Wave Execution Checklist" : "## 2. 단계별 실행 체크리스트", "");
  for (const step of plan.checklist) {
    lines.push(`- [ ] **${isEn ? step.titleEn : step.titleKo}** — \`${step.targetPackages.join("`, `")}\``);
    lines.push(`  - ${isEn ? "Verification Gate" : "동치 게이트"}: ${isEn ? step.verificationGateEn : step.verificationGateKo}`);
    lines.push(`  - ${isEn ? "Safari Guard" : "Safari 가드"}: ${isEn ? step.safariFallbackDirectiveEn : step.safariFallbackDirectiveKo}`);
  }

  lines.push("", isEn ? "## 3. Unmeasured Runtime Scope (Honest Disclosure)" : "## 3. 미실측 항목 분리 (별도 검증 필요)", "");
  for (const boundary of plan.unmeasuredBoundaries) {
    lines.push(`- ${isEn ? boundary.labelEn : boundary.labelKo} (\`${boundary.verificationCommand}\`)`);
  }
  return `${lines.join("\n")}\n`;
}

/** 전환 계획을 기계 판독 JSON 문자열로 직렬화한다. */
export function exportDependencyAuditJson(plan: DependencyCutoverPlanResult): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}
