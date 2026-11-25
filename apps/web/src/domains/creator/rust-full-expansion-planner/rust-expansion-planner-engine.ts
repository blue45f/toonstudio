/**
 * Wave 52D — ToonStudio 760K+ LOC 전면 Rust/WASM64 · WebGPU · NPU 전환 아키텍처 플래너 엔진.
 *
 * - 2026-11-25 저장소 실측 데이터(9대 서브시스템 2,411파일 · 818,866 LOC, 현행 Rust 3크레이트 9,345 LOC) 기준.
 * - 현재 실측(Current)과 단계별 전환 목표(Phase 1~4)를 엄격히 분리하며, iOS Safari Memory64 미지원 ·
 *   한글 IME DOM 경계 · WebNN 플래그 가용성을 정직하게 모델링한다(임의 FPS 배수 배제).
 */

export const MEASUREMENT_DATE = "2026-11-25" as const;
export const EXPANSION_PLAN_SCHEMA_VERSION = "toonstudio.rust-full-expansion-plan.v1" as const;

export type ExpansionSubsystemId =
  | "bg3d" | "brush" | "vrm" | "render" | "hybrid-dcc" | "export" | "lettering" | "filter" | "canvas";
export type ExpansionWavePhase = 1 | 2 | 3 | 4;
export type ExpansionTargetPlatformId =
  | "chrome-desktop" | "apple-silicon-safari" | "galaxy-android" | "all-platform-safe";
export type ExpansionRiskCode =
  | "ios-safari-memory64" | "korean-ime-dom-boundary" | "webnn-flag-availability"
  | "wasm-bundle-eager-bloat" | "webgpu-subgroups-f16-compat" | "dual-abi-maintenance";
export type ExpansionRiskSeverity = "critical" | "high" | "medium";
export type WasmLoadStrategy = "eager-boot" | "lazy-on-intent";
export type AddressSpaceMode =
  | "wasm32-simd128" | "wasm32-opfs-spill-guarded" | "wasm64-dual-target" | "wasm64-mobile-guarded";

export interface EngineAllocationPct {
  readonly rustWasm32SimdPct: number; readonly rustWasm64Pct: number; readonly webgpuSubgroupsF16Pct: number;
  readonly webnnNpuPct: number; readonly tsUiImeRetainedPct: number;
}
export interface StackAllocationPct extends EngineAllocationPct { readonly deferredTsPct: number; }
export interface EngineAllocationLoc {
  readonly rustWasm32SimdLoc: number; readonly rustWasm64Loc: number; readonly webgpuSubgroupsF16Loc: number;
  readonly webnnNpuLoc: number; readonly tsUiImeRetainedLoc: number; readonly deferredTsLoc: number;
}
export interface CurrentRustCrateBaseline {
  readonly crateName: string; readonly repoPath: string; readonly measuredLoc: number;
  readonly roleKo: string; readonly roleEn: string; readonly primarySubsystems: readonly ExpansionSubsystemId[];
}
export interface SubsystemExpansionSpec {
  readonly id: ExpansionSubsystemId; readonly nameKo: string; readonly nameEn: string;
  readonly measuredFileCount: number; readonly measuredLoc: number; readonly targetWavePhase: ExpansionWavePhase;
  readonly recommendedNativeTargetPct: number; readonly idealAllocation: EngineAllocationPct;
  readonly chunkId: string; readonly loadStrategy: WasmLoadStrategy;
  readonly wasm32GzipCapKb: number; readonly wasm64GzipCapKb: number; readonly requires64BitLinearArena: boolean;
  readonly triggerIntentKo: string; readonly triggerIntentEn: string;
  readonly currentStateKo: string; readonly currentStateEn: string;
  readonly targetStateKo: string; readonly targetStateEn: string;
  readonly tsBoundaryReasonKo: string; readonly tsBoundaryReasonEn: string;
  readonly riskCodes: readonly ExpansionRiskCode[];
}
export interface ExpansionPhaseSpec {
  readonly phase: ExpansionWavePhase; readonly badgeKo: string; readonly badgeEn: string;
  readonly titleKo: string; readonly titleEn: string; readonly objectiveKo: string; readonly objectiveEn: string;
  readonly addedSubsystems: readonly ExpansionSubsystemId[];
}
export interface ExpansionPlatformProfile {
  readonly id: ExpansionTargetPlatformId; readonly labelKo: string; readonly labelEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly supportsWasmSimd128: boolean; readonly supportsWasmMemory64: boolean;
  readonly supportsWebGpuSubgroupsF16: boolean; readonly supportsWebNnNpu: boolean;
  readonly maxSafeResidentRamMb: number; readonly eagerBootBudgetCapKb: number; readonly maxSingleChunkCapKb: number;
  readonly notesKo: string; readonly notesEn: string;
}
export interface ExpansionRiskCatalogEntry {
  readonly code: ExpansionRiskCode; readonly defaultSeverity: ExpansionRiskSeverity;
  readonly titleKo: string; readonly titleEn: string; readonly detailKo: string; readonly detailEn: string;
  readonly mitigationKo: string; readonly mitigationEn: string;
}
export interface WasmBundleChunkPlan {
  readonly chunkId: string; readonly subsystemId: ExpansionSubsystemId; readonly loadStrategy: WasmLoadStrategy;
  readonly activeAbi: "wasm32-simd128" | "wasm64-memory64";
  readonly wasm32GzipCapKb: number; readonly wasm64GzipCapKb: number; readonly activeGzipCapKb: number;
  readonly triggerIntentKo: string; readonly triggerIntentEn: string;
}
export interface SubsystemSimulationResult {
  readonly spec: SubsystemExpansionSpec; readonly includedInPhase: boolean; readonly effectiveNativePct: number;
  readonly stackPct: StackAllocationPct; readonly effectiveLoc: EngineAllocationLoc;
  readonly migratedNativeLoc: number; readonly retainedTsShellLoc: number; readonly deferredTsLoc: number;
  readonly fallbackReassignedLoc: number; readonly activeWasmChunk: WasmBundleChunkPlan | null;
  readonly activeRiskCodes: readonly ExpansionRiskCode[];
}
export interface AddressSpaceRequirement {
  readonly requiredBits: 32 | 64; readonly effectiveBits: 32 | 64; readonly mode: AddressSpaceMode;
  readonly memory64FallbackActive: boolean; readonly opfsSpillRequired: boolean; readonly safeResidentRamMb: number;
  readonly subsystemsRequiring64Bit: readonly ExpansionSubsystemId[];
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface ActiveExpansionRisk {
  readonly code: ExpansionRiskCode; readonly severity: ExpansionRiskSeverity; readonly triggeredByPlatform: boolean;
  readonly affectedSubsystems: readonly ExpansionSubsystemId[];
  readonly titleKo: string; readonly titleEn: string; readonly detailKo: string; readonly detailEn: string;
  readonly mitigationKo: string; readonly mitigationEn: string;
}
export interface ExpansionRoadmapSimulation {
  readonly measurementDate: typeof MEASUREMENT_DATE; readonly targetPhase: ExpansionWavePhase;
  readonly phaseSpec: ExpansionPhaseSpec; readonly platform: ExpansionPlatformProfile;
  readonly baseline: {
    readonly totalMeasuredFiles: number; readonly totalMeasuredLoc: number; readonly currentRustCrateCount: number;
    readonly currentRustLoc: number; readonly currentRustShareOfCombinedPct: number;
    readonly crates: readonly CurrentRustCrateBaseline[];
  };
  readonly totals: {
    readonly includedSubsystemCount: number; readonly deferredSubsystemCount: number;
    readonly migratedNativeLoc: number; readonly migratedNativePct: number;
    readonly retainedTsShellLoc: number; readonly retainedTsShellPct: number;
    readonly deferredTsLoc: number; readonly deferredTsPct: number;
    readonly totalRemainingTsLoc: number; readonly totalRemainingTsPct: number;
    readonly fallbackReassignedLoc: number; readonly engineLoc: EngineAllocationLoc; readonly engineSharePct: StackAllocationPct;
  };
  readonly bundlePlan: {
    readonly chunks: readonly WasmBundleChunkPlan[]; readonly eagerBootChunks: readonly WasmBundleChunkPlan[];
    readonly lazyOnIntentChunks: readonly WasmBundleChunkPlan[];
    readonly eagerBootGzipCapKb: number; readonly lazyOnIntentGzipCapKb: number;
    readonly totalActiveGzipCapKb: number; readonly maxSingleChunkCapKb: number;
    readonly eagerWithinBudget: boolean; readonly eagerGraphSafe: boolean;
  };
  readonly addressSpace: AddressSpaceRequirement; readonly subsystems: readonly SubsystemSimulationResult[];
  readonly risks: readonly ActiveExpansionRisk[];
  readonly honestyDisclosureKo: string; readonly honestyDisclosureEn: string;
}
export interface SimulateExpansionRoadmapInput {
  readonly targetPhase?: number; readonly platformId?: ExpansionTargetPlatformId;
}
export interface RustExpansionPlanExportPayload {
  readonly schemaVersion: typeof EXPANSION_PLAN_SCHEMA_VERSION; readonly measurementDate: typeof MEASUREMENT_DATE;
  readonly targetPhase: ExpansionWavePhase; readonly platformId: ExpansionTargetPlatformId;
  readonly baseline: ExpansionRoadmapSimulation["baseline"]; readonly totals: ExpansionRoadmapSimulation["totals"];
  readonly addressSpace: AddressSpaceRequirement; readonly bundlePlan: ExpansionRoadmapSimulation["bundlePlan"];
  readonly subsystems: readonly {
    readonly id: ExpansionSubsystemId; readonly measuredFileCount: number; readonly measuredLoc: number;
    readonly targetWavePhase: ExpansionWavePhase; readonly includedInPhase: boolean;
    readonly recommendedNativeTargetPct: number; readonly effectiveNativePct: number; readonly stackPct: StackAllocationPct;
    readonly migratedNativeLoc: number; readonly retainedTsShellLoc: number; readonly deferredTsLoc: number;
    readonly activeChunkId: string | null; readonly activeChunkGzipCapKb: number;
    readonly loadStrategy: WasmLoadStrategy; readonly riskCodes: readonly ExpansionRiskCode[];
  }[];
  readonly risks: readonly ActiveExpansionRisk[];
  readonly honestyDisclosureKo: string; readonly honestyDisclosureEn: string;
}

/** 2026-11-25 실측 현행 Rust 3대 크레이트 기준선 (총 9,345 LOC). */
export const CURRENT_RUST_CRATE_BASELINES: readonly CurrentRustCrateBaseline[] = [
  {
    crateName: "studio-wasm64-drawing-core", repoPath: "crates/studio-wasm64-drawing-core/src", measuredLoc: 4757,
    roleKo: "종이 요철·갈필·임파스토 브러시, 12종 희소 타일 합성, KM 분광 혼색, 필터/워프·XOR 델타 FFI",
    roleEn: "Tactile paper/bristle/impasto brush, 12-mode sparse tile compositor, KM spectral mix & XOR delta FFI",
    primarySubsystems: ["brush", "filter", "canvas", "render"],
  },
  {
    crateName: "studio-engine-vello", repoPath: "crates/studio-engine-vello/src", measuredLoc: 3913,
    roleKo: "Vello GPU/CPU 벡터 씬·SVG·Lottie·세로쓰기 텍스트 레이아웃 코어",
    roleEn: "Vello GPU/CPU vector scene, SVG, Lottie & vertical text layout core",
    primarySubsystems: ["render", "lettering", "export"],
  },
  {
    crateName: "studio-hokusai-wasm", repoPath: "packages/studio-hokusai-wasm/src", measuredLoc: 675,
    roleKo: "자연 매체 안료·수채 번짐·종이 흡수 물리 시뮬레이션 WASM 모듈",
    roleEn: "Natural media pigment diffusion & paper absorption physics WASM module",
    primarySubsystems: ["brush"],
  },
];

/** 2026-11-25 실측 9대 크리에이터 서브시스템 전환 아키텍처 스펙 (총 2,411파일 · 818,866 LOC). */
export const SUBSYSTEM_EXPANSION_SPECS: readonly SubsystemExpansionSpec[] = [
  {
    id: "bg3d", nameKo: "3D 배경 (bg3d)", nameEn: "3D Background (bg3d)",
    measuredFileCount: 817, measuredLoc: 229870, targetWavePhase: 3, recommendedNativeTargetPct: 76,
    idealAllocation: { rustWasm32SimdPct: 26, rustWasm64Pct: 18, webgpuSubgroupsF16Pct: 28, webnnNpuPct: 4, tsUiImeRetainedPct: 24 },
    chunkId: "chunk-bg3d-geometry", loadStrategy: "lazy-on-intent", wasm32GzipCapKb: 380, wasm64GzipCapKb: 420, requires64BitLinearArena: true,
    triggerIntentKo: "3D 배경 워크스페이스 열기 또는 SKP/GLB 임포트 시 지연 로드",
    triggerIntentEn: "Lazy-loaded on opening 3D background workspace or SKP/GLB import",
    currentStateKo: "현재: TS 817파일(229,870 LOC)로 OpenSKP·GLB 파싱, CSG, NPR 셰이딩, 아웃라이너 UI 운영",
    currentStateEn: "Current: 817 TS files (229,870 LOC) covering OpenSKP/GLB parsing, CSG, NPR shading & outliner UI",
    targetStateKo: "목표: 메시/BVH·SKP/GLB 파서는 Rust WASM32/64, NPR·그림자는 WebGPU f16, 깊이 보조는 WebNN으로 이전",
    targetStateEn: "Target: Move mesh/BVH & SKP/GLB parsers to Rust WASM32/64, NPR/shadows to WebGPU f16, depth assist to WebNN",
    tsBoundaryReasonKo: "씬 아웃라이너·재질 폼·기즈모·에셋 브라우저 24%는 React/TS 유지",
    tsBoundaryReasonEn: "Retain 24% in React/TS for scene outliner, material forms, gizmos & asset browser",
    riskCodes: ["ios-safari-memory64", "wasm-bundle-eager-bloat", "webgpu-subgroups-f16-compat", "webnn-flag-availability"],
  },
  {
    id: "brush", nameKo: "브러시 엔진 (brush)", nameEn: "Brush Engine (brush)",
    measuredFileCount: 388, measuredLoc: 144816, targetWavePhase: 1, recommendedNativeTargetPct: 82,
    idealAllocation: { rustWasm32SimdPct: 34, rustWasm64Pct: 14, webgpuSubgroupsF16Pct: 30, webnnNpuPct: 4, tsUiImeRetainedPct: 18 },
    chunkId: "chunk-brush-core", loadStrategy: "eager-boot", wasm32GzipCapKb: 195, wasm64GzipCapKb: 220, requires64BitLinearArena: true,
    triggerIntentKo: "스튜디오 드로잉 캔버스 최초 진입 시 경량 코어 우선 로드",
    triggerIntentEn: "Eager-loaded lightweight core when entering the drawing canvas",
    currentStateKo: "현재: TS 388파일(144,816 LOC) + Rust `studio-wasm64-drawing-core`(4,757)·`studio-hokusai-wasm`(675) 병행",
    currentStateEn: "Current: 388 TS files (144,816 LOC) alongside Rust studio-wasm64-drawing-core (4,757) & studio-hokusai-wasm (675)",
    targetStateKo: "목표: 스트로크 보간·갈필·종이 요철·임파스토·KM 분광 혼색 82%를 Rust SIMD/64 + WebGPU f16으로 통합",
    targetStateEn: "Target: Consolidate 82% of stroke interpolation, bristle, paper relief, impasto & KM mixing into Rust + WebGPU f16",
    tsBoundaryReasonKo: "브러시 프리셋 탐색기·필압 커브 UI·접근성 단축키 18%는 React/TS 유지",
    tsBoundaryReasonEn: "Retain 18% in React/TS for preset browser, pressure curve sliders & a11y shortcuts",
    riskCodes: ["ios-safari-memory64", "webgpu-subgroups-f16-compat", "webnn-flag-availability", "dual-abi-maintenance"],
  },
  {
    id: "vrm", nameKo: "VRM 아바타 (vrm)", nameEn: "VRM Avatar (vrm)",
    measuredFileCount: 305, measuredLoc: 124815, targetWavePhase: 3, recommendedNativeTargetPct: 79,
    idealAllocation: { rustWasm32SimdPct: 34, rustWasm64Pct: 8, webgpuSubgroupsF16Pct: 25, webnnNpuPct: 12, tsUiImeRetainedPct: 21 },
    chunkId: "chunk-vrm-rig-physics", loadStrategy: "lazy-on-intent", wasm32GzipCapKb: 280, wasm64GzipCapKb: 310, requires64BitLinearArena: false,
    triggerIntentKo: "VRM 캐릭터 패널 열기 또는 포즈·표정 리깅 진입 시 지연 로드",
    triggerIntentEn: "Lazy-loaded when opening VRM avatar panel or entering pose/expression rig mode",
    currentStateKo: "현재: TS 305파일(124,815 LOC)로 VRM 1.0 파서, IK, SpringBone, MToon 셰이더, 포즈 UI 운영",
    currentStateEn: "Current: 305 TS files (124,815 LOC) for VRM 1.0 loader, IK, SpringBone, MToon shaders & pose UI",
    targetStateKo: "목표: Dual-Quaternion 스키닝·IK·SpringBone은 Rust SIMD, MToon은 WebGPU f16, 포즈 추론은 WebNN NPU로 분담",
    targetStateEn: "Target: Dual-Quaternion skinning/IK/SpringBone in Rust SIMD, MToon in WebGPU f16, pose inference in WebNN NPU",
    tsBoundaryReasonKo: "포즈 라이브러리·본 선택 트리·VRM 권리/라이선스 검증 UI 21%는 React/TS 유지",
    tsBoundaryReasonEn: "Retain 21% in React/TS for pose library, bone tree & VRM license verification UI",
    riskCodes: ["webnn-flag-availability", "wasm-bundle-eager-bloat", "webgpu-subgroups-f16-compat"],
  },
  {
    id: "render", nameKo: "렌더 파이프라인 (render)", nameEn: "Render Pipeline (render)",
    measuredFileCount: 237, measuredLoc: 116469, targetWavePhase: 2, recommendedNativeTargetPct: 86,
    idealAllocation: { rustWasm32SimdPct: 24, rustWasm64Pct: 16, webgpuSubgroupsF16Pct: 46, webnnNpuPct: 0, tsUiImeRetainedPct: 14 },
    chunkId: "chunk-render-vello-bvh", loadStrategy: "lazy-on-intent", wasm32GzipCapKb: 290, wasm64GzipCapKb: 320, requires64BitLinearArena: true,
    triggerIntentKo: "WebGPU/Vello 고성능 합성기 활성화 또는 다중 레이어 씬 로드 시 지연 로드",
    triggerIntentEn: "Lazy-loaded when activating WebGPU/Vello compositor or multi-layer scenes",
    currentStateKo: "현재: TS 237파일(116,469 LOC) + WGSL 5종 + `studio-engine-vello`(3,913 LOC) 기반 Konva 탈피 진행 중",
    currentStateEn: "Current: 237 TS files (116,469 LOC) + 5 WGSL shaders + studio-engine-vello (3,913 LOC) decoupling Konva",
    targetStateKo: "목표: Flat-BVH·1만 인스턴스 컬링·희소 타일 합성·Vello 인코딩 86%를 Rust + WebGPU Subgroups/f16으로 실행",
    targetStateEn: "Target: Run 86% of Flat-BVH, 10k instanced culling, sparse tile compositing & Vello encoding in Rust + WebGPU",
    tsBoundaryReasonKo: "GPUDevice 수명주기·Context Lost 복구·렌더 진단 HUD 14%는 TS 어댑터로 유지",
    tsBoundaryReasonEn: "Retain 14% in TS adapter for GPUDevice lifecycle, context-lost recovery & render HUD",
    riskCodes: ["ios-safari-memory64", "webgpu-subgroups-f16-compat", "dual-abi-maintenance"],
  },
  {
    id: "hybrid-dcc", nameKo: "하이브리드 DCC 브리지 (hybrid-dcc)", nameEn: "Hybrid DCC Bridge (hybrid-dcc)",
    measuredFileCount: 221, measuredLoc: 54213, targetWavePhase: 4, recommendedNativeTargetPct: 66,
    idealAllocation: { rustWasm32SimdPct: 32, rustWasm64Pct: 14, webgpuSubgroupsF16Pct: 12, webnnNpuPct: 8, tsUiImeRetainedPct: 34 },
    chunkId: "chunk-hybrid-dcc-bridge", loadStrategy: "lazy-on-intent", wasm32GzipCapKb: 235, wasm64GzipCapKb: 260, requires64BitLinearArena: true,
    triggerIntentKo: "외부 Blender/Godot 브리지 세션 연결 또는 리메시·베이크 실행 시 지연 로드",
    triggerIntentEn: "Lazy-loaded on external Blender/Godot bridge connect or remesh/bake action",
    currentStateKo: "현재: TS 221파일(54,213 LOC)로 로컬 DCC 브리지 프로토콜, 메시 변환, 동기화 상태 UI 처리",
    currentStateEn: "Current: 221 TS files (54,213 LOC) handling DCC bridge protocol, mesh conversion & sync UI",
    targetStateKo: "목표: GLTF/바이너리 Diff·해시·리메시는 Rust WASM32/64, 베이크는 WebGPU, 에셋 태깅은 WebNN으로 이전",
    targetStateEn: "Target: Move GLTF/binary diff & remesh to Rust WASM32/64, bake to WebGPU, asset tagging to WebNN",
    tsBoundaryReasonKo: "브리지 연결 인증·WebSocket 재시도·권한 확인 모달 34%는 TS 유지",
    tsBoundaryReasonEn: "Retain 34% in TS for bridge auth, WebSocket retries & permission confirmation dialogs",
    riskCodes: ["ios-safari-memory64", "webnn-flag-availability", "wasm-bundle-eager-bloat"],
  },
  {
    id: "export", nameKo: "원고 내보내기 · 코덱 (export)", nameEn: "Export & Binary Codecs (export)",
    measuredFileCount: 154, measuredLoc: 43640, targetWavePhase: 2, recommendedNativeTargetPct: 78,
    idealAllocation: { rustWasm32SimdPct: 52, rustWasm64Pct: 18, webgpuSubgroupsF16Pct: 8, webnnNpuPct: 0, tsUiImeRetainedPct: 22 },
    chunkId: "chunk-export-codecs", loadStrategy: "lazy-on-intent", wasm32GzipCapKb: 215, wasm64GzipCapKb: 240, requires64BitLinearArena: true,
    triggerIntentKo: "내보내기 다이얼로그 실행 또는 PSD/PDF/GLB 패키징 시작 시 지연 로드",
    triggerIntentEn: "Lazy-loaded on opening export dialog or starting PSD/PDF/GLB packaging",
    currentStateKo: "현재: TS 154파일(43,640 LOC)로 PSD/PNG/PDF 슬라이싱, Rights BOM 검증, 다운로드 파이프라인 운영",
    currentStateEn: "Current: 154 TS files (43,640 LOC) for PSD/PNG/PDF slicing, Rights BOM checks & download flow",
    targetStateKo: "목표: PSD/PNG/Zstd/PDF 바이너리 인코딩·SIMD 색변환 78%를 Rust WASM32/64 + WebGPU 다운샘플로 이전",
    targetStateEn: "Target: Move 78% of PSD/PNG/Zstd/PDF binary encoding & SIMD color conversion to Rust WASM32/64 + WebGPU",
    tsBoundaryReasonKo: "File System Access API·Rights BOM 라이선스 게이트·내보내기 옵션 UI 22%는 TS 유지",
    tsBoundaryReasonEn: "Retain 22% in TS for File System Access API, Rights BOM license gate & export option UI",
    riskCodes: ["ios-safari-memory64", "wasm-bundle-eager-bloat", "dual-abi-maintenance"],
  },
  {
    id: "lettering", nameKo: "식자 · 말풍선 · SFX (lettering)", nameEn: "Lettering, Balloons & SFX (lettering)",
    measuredFileCount: 108, measuredLoc: 41366, targetWavePhase: 3, recommendedNativeTargetPct: 54,
    idealAllocation: { rustWasm32SimdPct: 34, rustWasm64Pct: 0, webgpuSubgroupsF16Pct: 16, webnnNpuPct: 4, tsUiImeRetainedPct: 46 },
    chunkId: "chunk-lettering-shaper", loadStrategy: "lazy-on-intent", wasm32GzipCapKb: 190, wasm64GzipCapKb: 0, requires64BitLinearArena: false,
    triggerIntentKo: "말풍선·세로쓰기·효과음 워프 도구 선택 시 지연 로드",
    triggerIntentEn: "Lazy-loaded when selecting balloon, vertical text, or SFX warp tools",
    currentStateKo: "현재: TS 108파일(41,366 LOC) + `studio-engine-vello` 세로쓰기 모듈로 한글 식자·말풍선·SFX 편집 운영",
    currentStateEn: "Current: 108 TS files (41,366 LOC) + studio-engine-vello vertical text for balloons & SFX",
    targetStateKo: "목표: 글리프 셰이핑·말풍선 SDF·SFX 베지에 워프 54%만 Rust WASM32 + MSDF WebGPU로 이전(64비트 불필요)",
    targetStateEn: "Target: Move 54% (glyph shaping, balloon SDF, SFX warp) to Rust WASM32 + MSDF WebGPU (no 64-bit needed)",
    tsBoundaryReasonKo: "한글 IME 자소 조합(compositionstart/update/end)·커서·스크린리더 DOM 경계 46%는 TS 필수 유지",
    tsBoundaryReasonEn: "Must retain 46% in TS/DOM for Korean IME composition events, caret & screen-reader boundaries",
    riskCodes: ["korean-ime-dom-boundary", "webnn-flag-availability"],
  },
  {
    id: "filter", nameKo: "이미지 필터 · 보정 (filter)", nameEn: "Image Filters & Tone (filter)",
    measuredFileCount: 93, measuredLoc: 40034, targetWavePhase: 1, recommendedNativeTargetPct: 88,
    idealAllocation: { rustWasm32SimdPct: 38, rustWasm64Pct: 12, webgpuSubgroupsF16Pct: 34, webnnNpuPct: 4, tsUiImeRetainedPct: 12 },
    chunkId: "chunk-filter-kernels", loadStrategy: "lazy-on-intent", wasm32GzipCapKb: 125, wasm64GzipCapKb: 140, requires64BitLinearArena: false,
    triggerIntentKo: "필터 메뉴·색보정 패널·실시간 언샤프/블러 적용 시 지연 로드",
    triggerIntentEn: "Lazy-loaded when opening filter menu, tone curve panel, or blur/unsharp pass",
    currentStateKo: "현재: TS 93파일(40,034 LOC) 중 가우시안·언샤프·임파스토 핵심 핫패스를 Rust 코어와 이중 검증 중",
    currentStateEn: "Current: 93 TS files (40,034 LOC) with core Gaussian/unsharp/impasto hotpaths byte-verified against Rust",
    targetStateKo: "목표: 분리형 컨볼루션·모폴로지·그라데이션 맵·톤맵 88%를 WebGPU Subgroups/f16 + Rust SIMD로 실행",
    targetStateEn: "Target: Run 88% of separable convolutions, morphology & tone maps in WebGPU Subgroups/f16 + Rust SIMD",
    tsBoundaryReasonKo: "필터 다이얼로그·히스토그램 UI·실행취소 커맨드 바인딩 12%만 TS 유지",
    tsBoundaryReasonEn: "Retain only 12% in TS for filter dialogs, histogram UI & undo command bindings",
    riskCodes: ["webgpu-subgroups-f16-compat", "webnn-flag-availability", "dual-abi-maintenance"],
  },
  {
    id: "canvas", nameKo: "캔버스 · 타일 아레나 (canvas)", nameEn: "Canvas & Tile Arena (canvas)",
    measuredFileCount: 88, measuredLoc: 23643, targetWavePhase: 1, recommendedNativeTargetPct: 68,
    idealAllocation: { rustWasm32SimdPct: 32, rustWasm64Pct: 24, webgpuSubgroupsF16Pct: 12, webnnNpuPct: 0, tsUiImeRetainedPct: 32 },
    chunkId: "chunk-canvas-arena", loadStrategy: "eager-boot", wasm32GzipCapKb: 140, wasm64GzipCapKb: 160, requires64BitLinearArena: true,
    triggerIntentKo: "스튜디오 캔버스 부트 시 256px 희소 타일 아레나 코어 즉시 로드",
    triggerIntentEn: "Eager-loaded at Studio canvas boot for 256px sparse tile arena core",
    currentStateKo: "현재: TS 88파일(23,643 LOC)로 뷰포트 패닝/줌, 선택 마스크, 포인터 캡처, OPFS 스필 조율",
    currentStateEn: "Current: 88 TS files (23,643 LOC) managing viewport camera, selection masks, pointer capture & OPFS spill",
    targetStateKo: "목표: 256px 희소 타일 LRU·선택 RLE·XOR 히스토리 델타 68%를 Rust WASM32/64 아레나로 승격",
    targetStateEn: "Target: Promote 68% (256px sparse tile LRU, selection RLE, XOR history delta) to Rust WASM32/64 arena",
    tsBoundaryReasonKo: "DOM PointerEvents 수집·WCAG 키보드 포커스·캔버스 기즈모 오버레이 32%는 TS/DOM 필수 유지",
    tsBoundaryReasonEn: "Must retain 32% in TS/DOM for coalesced PointerEvents, WCAG focus & canvas gizmo overlays",
    riskCodes: ["ios-safari-memory64", "korean-ime-dom-boundary", "dual-abi-maintenance"],
  },
];

/** 4단계 전환 웨이브 메타데이터. */
export const EXPANSION_WAVE_PHASES: readonly ExpansionPhaseSpec[] = [
  {
    phase: 1, badgeKo: "Phase 1 · 드로잉 핫패스", badgeEn: "Phase 1 · Drawing Hotpath",
    titleKo: "Phase 1 — 브러시 · 필터 · 희소 타일 캔버스 코어", titleEn: "Phase 1 — Brush, Filter & Sparse Tile Canvas Core",
    objectiveKo: "매 프레임 지연이 체감되는 드로잉·필터·타일 아레나 3대 영역을 우선 전환해 초기 번들 380KB 이하를 유지한다.",
    objectiveEn: "Migrate latency-critical brush, filter & sparse tile arena first while keeping eager boot under 380 KB.",
    addedSubsystems: ["brush", "filter", "canvas"],
  },
  {
    phase: 2, badgeKo: "Phase 2 · 렌더 · 코덱", badgeEn: "Phase 2 · Render & Codecs",
    titleKo: "Phase 2 — Konva 탈피 렌더 파이프라인 · 바이너리 내보내기 코덱", titleEn: "Phase 2 — Konva-Decoupled Render Pipeline & Binary Export Codecs",
    objectiveKo: "1만 인스턴스 Flat-BVH·Vello 합성기와 PSD/PDF/Zstd 바이너리 인코더를 Lazy 청크로 편입한다.",
    objectiveEn: "Add 10k-instance Flat-BVH/Vello compositor and PSD/PDF/Zstd binary encoders as lazy-loaded chunks.",
    addedSubsystems: ["render", "export"],
  },
  {
    phase: 3, badgeKo: "Phase 3 · 3D · VRM · 식자", badgeEn: "Phase 3 · 3D, VRM & Lettering",
    titleKo: "Phase 3 — 3D 배경 · VRM 리깅/물리 · 말풍선/SFX 셰이핑", titleEn: "Phase 3 — 3D Background, VRM Rig/Physics & Lettering Shaper",
    objectiveKo: "대규모 3D/VRM 연산을 의도 시점 지연 로드 청크로 분리하고, 식자는 한글 IME DOM 46% 경계를 보존한다.",
    objectiveEn: "Isolate heavy 3D/VRM compute into lazy chunks while preserving the 46% Korean IME DOM boundary in lettering.",
    addedSubsystems: ["bg3d", "vrm", "lettering"],
  },
  {
    phase: 4, badgeKo: "Phase 4 · DCC · 전면 완성", badgeEn: "Phase 4 · Full DCC & NPU",
    titleKo: "Phase 4 — 하이브리드 DCC 브리지 · 전 9대 서브시스템 통합", titleEn: "Phase 4 — Hybrid DCC Bridge & All 9 Subsystems",
    objectiveKo: "외부 DCC 바이너리 Diff·베이크·온디바이스 NPU 보조 추론까지 완료하되 TS UI·IME 경계(~22%)는 정직하게 남긴다.",
    objectiveEn: "Complete external DCC binary diff/bake and on-device NPU assist while keeping ~22% TS UI/IME shell intact.",
    addedSubsystems: ["hybrid-dcc"],
  },
];

/** 4대 대상 플랫폼 호환성 프로필. */
export const EXPANSION_PLATFORM_PROFILES: readonly ExpansionPlatformProfile[] = [
  {
    id: "chrome-desktop", labelKo: "Chrome Desktop (Chromium)", labelEn: "Chrome Desktop (Chromium)",
    shortLabelKo: "Chrome 데스크톱", shortLabelEn: "Chrome Desktop",
    supportsWasmSimd128: true, supportsWasmMemory64: true, supportsWebGpuSubgroupsF16: true, supportsWebNnNpu: true,
    maxSafeResidentRamMb: 8192, eagerBootBudgetCapKb: 400, maxSingleChunkCapKb: 450,
    notesKo: "WASM64 · WebGPU Subgroups/f16 · 실험적 WebNN NPU까지 전체 4종 네이티브 경로를 모두 가동한다.",
    notesEn: "Activates all 4 native paths: WASM32-SIMD, WASM64, WebGPU Subgroups/f16, and experimental WebNN NPU.",
  },
  {
    id: "apple-silicon-safari", labelKo: "Apple Silicon Safari (macOS / iPadOS WebKit)", labelEn: "Apple Silicon Safari (macOS / iPadOS WebKit)",
    shortLabelKo: "Apple Safari", shortLabelEn: "Apple Safari",
    supportsWasmSimd128: true, supportsWasmMemory64: false, supportsWebGpuSubgroupsF16: true, supportsWebNnNpu: false,
    maxSafeResidentRamMb: 1536, eagerBootBudgetCapKb: 380, maxSingleChunkCapKb: 420,
    notesKo: "iOS/iPadOS WebKit Memory64 미지원 및 Jetsam 제약으로 WASM64는 32비트+OPFS 스필, WebNN은 Metal WebGPU f16으로 우회한다.",
    notesEn: "Reroutes WASM64 to 32-bit + OPFS spill due to WebKit Memory64/Jetsam limits and WebNN to Metal WebGPU f16.",
  },
  {
    id: "galaxy-android", labelKo: "Galaxy Android (Chrome ARM64)", labelEn: "Galaxy Android (Chrome ARM64)",
    shortLabelKo: "Galaxy Android", shortLabelEn: "Galaxy Android",
    supportsWasmSimd128: true, supportsWasmMemory64: true, supportsWebGpuSubgroupsF16: true, supportsWebNnNpu: true,
    maxSafeResidentRamMb: 2048, eagerBootBudgetCapKb: 380, maxSingleChunkCapKb: 450,
    notesKo: "ARM64 Chrome에서 WASM64·Vulkan WebGPU·NNAPI WebNN을 지원하되, LMKD 2GB 메모리 상한과 발열 가드를 병행한다.",
    notesEn: "Supports WASM64, Vulkan WebGPU & flag-gated NNAPI WebNN on ARM64 Chrome with a 2 GB LMKD memory guard.",
  },
  {
    id: "all-platform-safe", labelKo: "All-Platform Safe (전 기기 무플래그 기준)", labelEn: "All-Platform Safe (Zero-Flag Baseline)",
    shortLabelKo: "전 플랫폼 안전 기준", shortLabelEn: "All-Platform Safe",
    supportsWasmSimd128: true, supportsWasmMemory64: false, supportsWebGpuSubgroupsF16: false, supportsWebNnNpu: false,
    maxSafeResidentRamMb: 1024, eagerBootBudgetCapKb: 360, maxSingleChunkCapKb: 400,
    notesKo: "실험적 플래그·Memory64·WebGPU Subgroups 없이 전 브라우저에서 바이트 동등하게 동작하는 WASM32-SIMD 최소 공통 기준이다.",
    notesEn: "Zero-flag cross-browser baseline running byte-exact WASM32-SIMD without Memory64, WebGPU Subgroups, or WebNN.",
  },
];

/** 핵심 아키텍처 리스크 카탈로그 (정직한 한계·완화 전략 명시). */
export const EXPANSION_RISK_CATALOG: readonly ExpansionRiskCatalogEntry[] = [
  {
    code: "ios-safari-memory64", defaultSeverity: "high",
    titleKo: "iOS Safari / WebKit Memory64 미지원 및 Jetsam 상한", titleEn: "iOS Safari / WebKit Lack of Memory64 & Jetsam Cap",
    detailKo: "iOS·iPadOS WebKit은 WASM64(memory64)를 지원하지 않으며 탭 메모리 1~1.5GB 초과 시 Jetsam 강제 종료가 발생한다.",
    detailEn: "iOS/iPadOS WebKit lacks WASM64 (memory64) and triggers Jetsam tab termination above 1-1.5 GB resident RAM.",
    mitigationKo: "wasm32-simd128 듀얼 타깃 동시 배포 + 256px 희소 타일 OPFS LRU 스필(워터마크 70%/52%) 강제 적용.",
    mitigationEn: "Ship dual wasm32-simd128 artifacts and enforce 256px sparse tile OPFS LRU spill (70%/52% watermarks).",
  },
  {
    code: "korean-ime-dom-boundary", defaultSeverity: "high",
    titleKo: "한글 IME 자소 조합 및 DOM 접근성 경계", titleEn: "Korean IME Composition & DOM Accessibility Boundary",
    detailKo: "한글 자소 조합(compositionstart/update/end), 스크린리더 포커스, 시스템 클립보드는 WASM 캔버스 내부에서 대체할 수 없다.",
    detailEn: "Korean Hangul IME composition events, screen-reader focus & OS clipboard cannot be replaced inside a WASM canvas.",
    mitigationKo: "식자(lettering 46%)·캔버스(canvas 32%)의 입력·접근성·기즈모 껍데기는 React/TS DOM 경계에 영구 유지한다.",
    mitigationEn: "Permanently retain React/TS DOM boundaries for lettering (46%) and canvas input/a11y/gizmo shell (32%).",
  },
  {
    code: "webnn-flag-availability", defaultSeverity: "medium",
    titleKo: "WebNN NPU 브라우저 플래그·OS 런타임 가용성 편차", titleEn: "WebNN NPU Flag & OS Runtime Availability Variance",
    detailKo: "WebNN은 브라우저별 실험 플래그·OS 드라이버(DirectML·CoreML·NNAPI) 지원 편차가 커 기본 의존성으로 삼을 수 없다.",
    detailEn: "WebNN availability varies across browser flags and OS runtimes (DirectML/CoreML/NNAPI) and cannot be mandatory.",
    mitigationKo: "WebNN을 선택 가속 티어로 격리하고 미지원 시 WebGPU f16 → Rust WASM32-SIMD 2단 자동 폴백을 강제한다.",
    mitigationEn: "Isolate WebNN as an optional accelerator with automatic WebGPU f16 -> Rust WASM32-SIMD fallback.",
  },
  {
    code: "wasm-bundle-eager-bloat", defaultSeverity: "medium",
    titleKo: "초기 진입 WASM 번들 비대화 및 Eager Graph 오염 위험", titleEn: "Initial WASM Bundle Bloat & Eager Graph Pollution Risk",
    detailKo: "9대 서브시스템을 단일 모놀리식 .wasm으로 묶으면 초기 진입이 수 MB로 폭증해 Studio 진입 경계를 위반한다.",
    detailEn: "Bundling all 9 subsystems into one monolithic .wasm bloats initial load to multi-MB and violates eager-graph gates.",
    mitigationKo: "초기 부트는 brush·canvas 경량 코어(<=380KB gzip)만 허용하고 bg3d·vrm·export·hybrid-dcc는 사용자 의도 시 지연 로드한다.",
    mitigationEn: "Allow only brush/canvas core (<=380 KB gzip) at boot; lazy-load bg3d, vrm, export & hybrid-dcc on user intent.",
  },
  {
    code: "webgpu-subgroups-f16-compat", defaultSeverity: "medium",
    titleKo: "WebGPU Subgroups · shader-f16 어댑터 기능 편차", titleEn: "WebGPU Subgroups & shader-f16 Adapter Feature Variance",
    detailKo: "보급형 GPU·구형 드라이버는 subgroups 또는 shader-f16 기능 비트를 노출하지 않아 셰이더 컴파일 실패가 발생할 수 있다.",
    detailEn: "Entry-level GPUs and older drivers may omit subgroups or shader-f16 features, causing WGSL pipeline compile failures.",
    mitigationKo: "adapter.features 런타임 조회 후 f32 표준 WGSL 또는 바이트 동등 Rust WASM32-SIMD 커널로 무중단 강등한다.",
    mitigationEn: "Probe adapter.features at runtime and seamlessly downgrade to standard f32 WGSL or byte-exact Rust WASM32-SIMD.",
  },
  {
    code: "dual-abi-maintenance", defaultSeverity: "medium",
    titleKo: "WASM32/64 듀얼 타깃 ABI 드리프트 및 회귀 검증 비용", titleEn: "WASM32/64 Dual-Target ABI Drift & Regression Cost",
    detailKo: "32비트·64비트 포인터 폭이 다른 두 아티팩트를 수동 관리하면 FFI 오프셋 불일치와 픽셀 오차가 생긴다.",
    detailEn: "Manually maintaining separate 32-bit and 64-bit artifacts risks FFI pointer-width mismatches and pixel drift.",
    mitigationKo: "단일 Rust 워크스페이스에서 u64 논리 오프셋 계약과 바이트 동등 골든 테스트(WASM32 vs WASM64 vs JS)를 CI에 고정한다.",
    mitigationEn: "Share one Rust workspace with u64 logical offset contracts and CI byte-exact golden tests across targets.",
  },
];

const EAGER_FORBIDDEN_DOMAINS: readonly ExpansionSubsystemId[] = ["bg3d", "vrm", "export", "hybrid-dcc"];
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;

export function normalizeExpansionPhase(phase?: number): ExpansionWavePhase {
  if (typeof phase !== "number" || !Number.isFinite(phase)) return 4;
  const floored = Math.floor(phase);
  if (floored <= 1) return 1;
  if (floored === 2) return 2;
  return floored === 3 ? 3 : 4;
}

export function getExpansionPlatformProfile(platformId: ExpansionTargetPlatformId): ExpansionPlatformProfile {
  return EXPANSION_PLATFORM_PROFILES.find((item) => item.id === platformId) ?? EXPANSION_PLATFORM_PROFILES[0];
}

export function getExpansionPhaseSpec(phase: ExpansionWavePhase): ExpansionPhaseSpec {
  return EXPANSION_WAVE_PHASES.find((item) => item.phase === phase) ?? EXPANSION_WAVE_PHASES[3];
}

export function getSubsystemExpansionSpec(id: ExpansionSubsystemId): SubsystemExpansionSpec {
  const found = SUBSYSTEM_EXPANSION_SPECS.find((item) => item.id === id);
  if (!found) throw new Error(`알 수 없는 서브시스템 ID: ${String(id)}`);
  return found;
}

function resolveEffectiveAllocation(
  ideal: EngineAllocationPct,
  platform: ExpansionPlatformProfile,
): { readonly pct: EngineAllocationPct; readonly fallbackReassignedPct: number } {
  let { rustWasm32SimdPct: w32, rustWasm64Pct: w64, webgpuSubgroupsF16Pct: gpu, webnnNpuPct: nn, tsUiImeRetainedPct: ts } = ideal;
  let reassigned = 0;
  if (!platform.supportsWasmMemory64 && w64 > 0) { w32 += w64; reassigned += w64; w64 = 0; }
  if (!platform.supportsWebNnNpu && nn > 0) {
    if (platform.supportsWebGpuSubgroupsF16) gpu += nn; else w32 += nn;
    reassigned += nn; nn = 0;
  }
  if (!platform.supportsWebGpuSubgroupsF16 && gpu > 0) {
    const gpuToCpu = Math.floor(gpu * 0.65);
    w32 += gpuToCpu; ts += gpu - gpuToCpu; reassigned += gpu; gpu = 0;
  }
  return {
    pct: { rustWasm32SimdPct: w32, rustWasm64Pct: w64, webgpuSubgroupsF16Pct: gpu, webnnNpuPct: nn, tsUiImeRetainedPct: ts },
    fallbackReassignedPct: reassigned,
  };
}

function buildSubsystemResult(spec: SubsystemExpansionSpec, targetPhase: ExpansionWavePhase, platform: ExpansionPlatformProfile): SubsystemSimulationResult {
  if (spec.targetWavePhase > targetPhase) {
    return {
      spec, includedInPhase: false, effectiveNativePct: 0,
      stackPct: { rustWasm32SimdPct: 0, rustWasm64Pct: 0, webgpuSubgroupsF16Pct: 0, webnnNpuPct: 0, tsUiImeRetainedPct: 0, deferredTsPct: 100 },
      effectiveLoc: { rustWasm32SimdLoc: 0, rustWasm64Loc: 0, webgpuSubgroupsF16Loc: 0, webnnNpuLoc: 0, tsUiImeRetainedLoc: 0, deferredTsLoc: spec.measuredLoc },
      migratedNativeLoc: 0, retainedTsShellLoc: 0, deferredTsLoc: spec.measuredLoc, fallbackReassignedLoc: 0,
      activeWasmChunk: null, activeRiskCodes: [],
    };
  }
  const { pct, fallbackReassignedPct } = resolveEffectiveAllocation(spec.idealAllocation, platform);
  const w32Loc = Math.round((spec.measuredLoc * pct.rustWasm32SimdPct) / 100);
  const w64Loc = Math.round((spec.measuredLoc * pct.rustWasm64Pct) / 100);
  const gpuLoc = Math.round((spec.measuredLoc * pct.webgpuSubgroupsF16Pct) / 100);
  const nnLoc = Math.round((spec.measuredLoc * pct.webnnNpuPct) / 100);
  const tsLoc = spec.measuredLoc - (w32Loc + w64Loc + gpuLoc + nnLoc);
  const useWasm64Chunk = platform.supportsWasmMemory64 && spec.requires64BitLinearArena && spec.wasm64GzipCapKb > 0;
  return {
    spec, includedInPhase: true, effectiveNativePct: 100 - pct.tsUiImeRetainedPct,
    stackPct: { ...pct, deferredTsPct: 0 },
    effectiveLoc: { rustWasm32SimdLoc: w32Loc, rustWasm64Loc: w64Loc, webgpuSubgroupsF16Loc: gpuLoc, webnnNpuLoc: nnLoc, tsUiImeRetainedLoc: tsLoc, deferredTsLoc: 0 },
    migratedNativeLoc: w32Loc + w64Loc + gpuLoc + nnLoc, retainedTsShellLoc: tsLoc, deferredTsLoc: 0,
    fallbackReassignedLoc: Math.round((spec.measuredLoc * fallbackReassignedPct) / 100),
    activeWasmChunk: {
      chunkId: spec.chunkId, subsystemId: spec.id, loadStrategy: spec.loadStrategy,
      activeAbi: useWasm64Chunk ? "wasm64-memory64" : "wasm32-simd128",
      wasm32GzipCapKb: spec.wasm32GzipCapKb, wasm64GzipCapKb: spec.wasm64GzipCapKb,
      activeGzipCapKb: useWasm64Chunk ? spec.wasm64GzipCapKb : spec.wasm32GzipCapKb,
      triggerIntentKo: spec.triggerIntentKo, triggerIntentEn: spec.triggerIntentEn,
    },
    activeRiskCodes: spec.riskCodes,
  };
}

function buildAddressSpaceRequirement(subsystems: readonly SubsystemSimulationResult[], platform: ExpansionPlatformProfile): AddressSpaceRequirement {
  const subsystemsRequiring64Bit = subsystems.filter((i) => i.includedInPhase && i.spec.requires64BitLinearArena).map((i) => i.spec.id);
  const requiredBits: 32 | 64 = subsystemsRequiring64Bit.length > 0 ? 64 : 32;
  const effectiveBits: 32 | 64 = requiredBits === 64 && platform.supportsWasmMemory64 ? 64 : 32;
  const memory64FallbackActive = requiredBits === 64 && effectiveBits === 32;
  const opfsSpillRequired = memory64FallbackActive || platform.maxSafeResidentRamMb <= 2048;
  const mode: AddressSpaceMode =
    effectiveBits === 64
      ? platform.maxSafeResidentRamMb <= 2048 ? "wasm64-mobile-guarded" : "wasm64-dual-target"
      : opfsSpillRequired ? "wasm32-opfs-spill-guarded" : "wasm32-simd128";
  const ramLabel = platform.maxSafeResidentRamMb.toLocaleString("en-US");
  const n64 = subsystemsRequiring64Bit.length;
  const summaryKo =
    effectiveBits === 64
      ? platform.maxSafeResidentRamMb <= 2048
        ? `64비트 선형 아레나(${n64}개 영역) 활성화 + 모바일 LMKD ${ramLabel}MB 상한 및 OPFS 스필 병행.`
        : `64비트 선형 아레나(${n64}개 영역) 활성화 — 4GB+ 대형 원고·3D 씬 u64 직접 주소 지정, 32비트 폴백 동시 유지.`
      : memory64FallbackActive
        ? `대상 플랫폼(${platform.shortLabelKo})의 Memory64 미지원으로 32비트 선형 공간 고정 — ${n64}개 대용량 영역은 OPFS LRU 스필(${ramLabel}MB 상한)로 방어한다.`
        : "선택 범위에 64비트 필수 영역이 없어 32비트 SIMD128 단일 선형 공간으로 안전 운용한다.";
  const summaryEn =
    effectiveBits === 64
      ? platform.maxSafeResidentRamMb <= 2048
        ? `64-bit linear arena active (${n64} subsystems) with ${ramLabel} MB mobile LMKD cap and OPFS spill.`
        : `64-bit linear arena active (${n64} subsystems) for 4 GB+ scenes while shipping dual 32-bit fallbacks.`
      : memory64FallbackActive
        ? `Memory64 unavailable on ${platform.shortLabelEn}; pinned to 32-bit addressing with OPFS LRU spill (${ramLabel} MB cap) across ${n64} large-arena subsystems.`
        : "No 64-bit mandatory subsystem in scope; running cleanly in 32-bit SIMD128 linear memory.";
  return {
    requiredBits, effectiveBits, mode, memory64FallbackActive, opfsSpillRequired,
    safeResidentRamMb: platform.maxSafeResidentRamMb, subsystemsRequiring64Bit, summaryKo, summaryEn,
  };
}

function buildActiveRisks(
  subsystems: readonly SubsystemSimulationResult[], platform: ExpansionPlatformProfile, addressSpace: AddressSpaceRequirement,
): readonly ActiveExpansionRisk[] {
  const included = subsystems.filter((item) => item.includedInPhase);
  const risks: ActiveExpansionRisk[] = [];
  for (const entry of EXPANSION_RISK_CATALOG) {
    const affectedSubsystems = included.filter((i) => i.activeRiskCodes.includes(entry.code)).map((i) => i.spec.id);
    if (affectedSubsystems.length === 0) continue;
    let severity: ExpansionRiskSeverity = entry.defaultSeverity;
    let triggeredByPlatform = false;
    if (entry.code === "ios-safari-memory64" && addressSpace.memory64FallbackActive) {
      severity = platform.id === "apple-silicon-safari" ? "critical" : "high"; triggeredByPlatform = true;
    } else if (entry.code === "webnn-flag-availability") {
      triggeredByPlatform = true; severity = platform.supportsWebNnNpu ? "high" : "medium";
    } else if (entry.code === "webgpu-subgroups-f16-compat" && !platform.supportsWebGpuSubgroupsF16) {
      triggeredByPlatform = true; severity = "high";
    } else if (entry.code === "korean-ime-dom-boundary") {
      triggeredByPlatform = true;
    }
    risks.push({
      code: entry.code, severity, triggeredByPlatform, affectedSubsystems,
      titleKo: entry.titleKo, titleEn: entry.titleEn, detailKo: entry.detailKo, detailEn: entry.detailEn,
      mitigationKo: entry.mitigationKo, mitigationEn: entry.mitigationEn,
    });
  }
  const order: Record<ExpansionRiskSeverity, number> = { critical: 0, high: 1, medium: 2 };
  return risks.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** 9대 서브시스템 2026-11-25 실측 LOC 기반 Rust/WASM64·WebGPU·NPU 전환 로드맵 시뮬레이터. */
export function simulateExpansionRoadmap(input?: SimulateExpansionRoadmapInput): ExpansionRoadmapSimulation {
  const targetPhase = normalizeExpansionPhase(input?.targetPhase);
  const platform = getExpansionPlatformProfile(input?.platformId ?? "chrome-desktop");
  const phaseSpec = getExpansionPhaseSpec(targetPhase);
  const totalMeasuredFiles = SUBSYSTEM_EXPANSION_SPECS.reduce((acc, s) => acc + s.measuredFileCount, 0);
  const totalMeasuredLoc = SUBSYSTEM_EXPANSION_SPECS.reduce((acc, s) => acc + s.measuredLoc, 0);
  const currentRustLoc = CURRENT_RUST_CRATE_BASELINES.reduce((acc, c) => acc + c.measuredLoc, 0);
  const currentRustShareOfCombinedPct = round2((currentRustLoc / (totalMeasuredLoc + currentRustLoc)) * 100);
  const subsystems = SUBSYSTEM_EXPANSION_SPECS.map((spec) => buildSubsystemResult(spec, targetPhase, platform));
  const engineLoc = subsystems.reduce<EngineAllocationLoc>(
    (acc, { effectiveLoc: e }) => ({
      rustWasm32SimdLoc: acc.rustWasm32SimdLoc + e.rustWasm32SimdLoc, rustWasm64Loc: acc.rustWasm64Loc + e.rustWasm64Loc,
      webgpuSubgroupsF16Loc: acc.webgpuSubgroupsF16Loc + e.webgpuSubgroupsF16Loc, webnnNpuLoc: acc.webnnNpuLoc + e.webnnNpuLoc,
      tsUiImeRetainedLoc: acc.tsUiImeRetainedLoc + e.tsUiImeRetainedLoc, deferredTsLoc: acc.deferredTsLoc + e.deferredTsLoc,
    }),
    { rustWasm32SimdLoc: 0, rustWasm64Loc: 0, webgpuSubgroupsF16Loc: 0, webnnNpuLoc: 0, tsUiImeRetainedLoc: 0, deferredTsLoc: 0 },
  );
  const migratedNativeLoc = engineLoc.rustWasm32SimdLoc + engineLoc.rustWasm64Loc + engineLoc.webgpuSubgroupsF16Loc + engineLoc.webnnNpuLoc;
  const retainedTsShellLoc = engineLoc.tsUiImeRetainedLoc;
  const deferredTsLoc = engineLoc.deferredTsLoc;
  const totalRemainingTsLoc = retainedTsShellLoc + deferredTsLoc;
  const fallbackReassignedLoc = subsystems.reduce((acc, item) => acc + item.fallbackReassignedLoc, 0);
  const pctOfTotal = (loc: number): number => round1((loc / totalMeasuredLoc) * 100);
  const chunks = subsystems.map((i) => i.activeWasmChunk).filter((c): c is WasmBundleChunkPlan => c !== null);
  const eagerBootChunks = chunks.filter((c) => c.loadStrategy === "eager-boot");
  const lazyOnIntentChunks = chunks.filter((c) => c.loadStrategy === "lazy-on-intent");
  const eagerBootGzipCapKb = eagerBootChunks.reduce((acc, c) => acc + c.activeGzipCapKb, 0);
  const lazyOnIntentGzipCapKb = lazyOnIntentChunks.reduce((acc, c) => acc + c.activeGzipCapKb, 0);
  const addressSpace = buildAddressSpaceRequirement(subsystems, platform);
  const risks = buildActiveRisks(subsystems, platform, addressSpace);
  const includedSubsystemCount = subsystems.filter((i) => i.includedInPhase).length;
  return {
    measurementDate: MEASUREMENT_DATE, targetPhase, phaseSpec, platform,
    baseline: { totalMeasuredFiles, totalMeasuredLoc, currentRustCrateCount: CURRENT_RUST_CRATE_BASELINES.length, currentRustLoc, currentRustShareOfCombinedPct, crates: CURRENT_RUST_CRATE_BASELINES },
    totals: {
      includedSubsystemCount, deferredSubsystemCount: subsystems.length - includedSubsystemCount,
      migratedNativeLoc, migratedNativePct: pctOfTotal(migratedNativeLoc),
      retainedTsShellLoc, retainedTsShellPct: pctOfTotal(retainedTsShellLoc),
      deferredTsLoc, deferredTsPct: pctOfTotal(deferredTsLoc),
      totalRemainingTsLoc, totalRemainingTsPct: pctOfTotal(totalRemainingTsLoc),
      fallbackReassignedLoc, engineLoc,
      engineSharePct: {
        rustWasm32SimdPct: pctOfTotal(engineLoc.rustWasm32SimdLoc), rustWasm64Pct: pctOfTotal(engineLoc.rustWasm64Loc),
        webgpuSubgroupsF16Pct: pctOfTotal(engineLoc.webgpuSubgroupsF16Loc), webnnNpuPct: pctOfTotal(engineLoc.webnnNpuLoc),
        tsUiImeRetainedPct: pctOfTotal(retainedTsShellLoc), deferredTsPct: pctOfTotal(deferredTsLoc),
      },
    },
    bundlePlan: {
      chunks, eagerBootChunks, lazyOnIntentChunks, eagerBootGzipCapKb, lazyOnIntentGzipCapKb,
      totalActiveGzipCapKb: eagerBootGzipCapKb + lazyOnIntentGzipCapKb,
      maxSingleChunkCapKb: chunks.reduce((max, c) => Math.max(max, c.activeGzipCapKb), 0),
      eagerWithinBudget: eagerBootGzipCapKb <= platform.eagerBootBudgetCapKb,
      eagerGraphSafe: eagerBootChunks.every((c) => !EAGER_FORBIDDEN_DOMAINS.includes(c.subsystemId)),
    },
    addressSpace, subsystems, risks,
    honestyDisclosureKo: "실측 기준(2026-11-25): 9대 서브시스템 TS 818,866 LOC · 현행 Rust 3크레이트 9,345 LOC(1.13%). 전환 비중·청크 KB 상한은 단계별 목표 계획치이며 임의 FPS·성능 배수는 포함하지 않는다.",
    honestyDisclosureEn: "Measured baseline (2026-11-25): 818,866 TS LOC across 9 subsystems vs 9,345 current Rust LOC (1.13%). Migration shares and chunk KB caps are phased targets; no fabricated FPS multipliers are included.",
  };
}

function resolveSimulation(planOrInput?: ExpansionRoadmapSimulation | SimulateExpansionRoadmapInput): ExpansionRoadmapSimulation {
  return planOrInput && "baseline" in planOrInput && "bundlePlan" in planOrInput ? planOrInput : simulateExpansionRoadmap(planOrInput);
}

/** 내보내기용 정규 JSON 페이로드 객체 구성. */
export function buildRustExpansionExportPayload(planOrInput?: ExpansionRoadmapSimulation | SimulateExpansionRoadmapInput): RustExpansionPlanExportPayload {
  const plan = resolveSimulation(planOrInput);
  return {
    schemaVersion: EXPANSION_PLAN_SCHEMA_VERSION, measurementDate: plan.measurementDate,
    targetPhase: plan.targetPhase, platformId: plan.platform.id,
    baseline: plan.baseline, totals: plan.totals, addressSpace: plan.addressSpace, bundlePlan: plan.bundlePlan,
    subsystems: plan.subsystems.map((i) => ({
      id: i.spec.id, measuredFileCount: i.spec.measuredFileCount, measuredLoc: i.spec.measuredLoc,
      targetWavePhase: i.spec.targetWavePhase, includedInPhase: i.includedInPhase,
      recommendedNativeTargetPct: i.spec.recommendedNativeTargetPct, effectiveNativePct: i.effectiveNativePct,
      stackPct: i.stackPct, migratedNativeLoc: i.migratedNativeLoc, retainedTsShellLoc: i.retainedTsShellLoc, deferredTsLoc: i.deferredTsLoc,
      activeChunkId: i.activeWasmChunk?.chunkId ?? null, activeChunkGzipCapKb: i.activeWasmChunk?.activeGzipCapKb ?? 0,
      loadStrategy: i.spec.loadStrategy, riskCodes: i.spec.riskCodes,
    })),
    risks: plan.risks, honestyDisclosureKo: plan.honestyDisclosureKo, honestyDisclosureEn: plan.honestyDisclosureEn,
  };
}

/** 시뮬레이션 결과를 Architecture Decision Record (ADR) Markdown 문서로 직렬화한다. */
export function exportRustExpansionAdrMarkdown(
  planOrInput?: ExpansionRoadmapSimulation | SimulateExpansionRoadmapInput,
  options?: { readonly locale?: "ko" | "en" },
): string {
  const plan = resolveSimulation(planOrInput);
  const isEn = options?.locale === "en";
  const t = (ko: string, en: string): string => (isEn ? en : ko);
  const fmt = (n: number): string => n.toLocaleString("en-US");
  return [
    t(`# ADR: ToonStudio 9대 서브시스템 Rust/WASM64 · WebGPU · NPU 전환 아키텍처 (Phase ${plan.targetPhase} · ${plan.platform.shortLabelKo})`, `# ADR: ToonStudio 9-Subsystem Rust/WASM64, WebGPU & NPU Expansion Plan (Phase ${plan.targetPhase} · ${plan.platform.labelEn})`),
    "",
    `- **${t("실측 기준일", "Measurement Date")}**: ${plan.measurementDate}`,
    `- **${t("상태", "Status")}**: ${t("제안(Proposed) — 현재 실측과 단계별 목표를 분리 기재", "Proposed (Measured Baseline vs Phased Target Separated)")}`,
    `- **${t("선택 전환 단계", "Target Phase")}**: ${isEn ? plan.phaseSpec.titleEn : plan.phaseSpec.titleKo}`,
    `- **${t("대상 플랫폼", "Target Platform")}**: ${isEn ? plan.platform.labelEn : plan.platform.labelKo}`,
    "",
    t("## 1. 2026-11-25 저장소 실측 기준선", "## 1. Measured Repository Baseline (2026-11-25)"),
    `- **${t("9대 핵심 서브시스템 합계", "9 Core Creator Subsystems")}**: ${fmt(plan.baseline.totalMeasuredFiles)}${t("파일", " files")} · ${fmt(plan.baseline.totalMeasuredLoc)} LOC`,
    `- **${t(`현행 Rust 크레이트 (${plan.baseline.currentRustCrateCount}종)`, `Current Rust Crates (${plan.baseline.currentRustCrateCount})`)}**: ${fmt(plan.baseline.currentRustLoc)} LOC (${t("합산 대비", "of combined")} ${plan.baseline.currentRustShareOfCombinedPct}%)`,
    ...plan.baseline.crates.map((c) => `  - \`${c.crateName}\`: ${fmt(c.measuredLoc)} LOC (\`${c.repoPath}\`) — ${isEn ? c.roleEn : c.roleKo}`),
    "",
    t("## 2. 시뮬레이션 요약", "## 2. Simulation Summary"),
    `- **${t("전환 대상 네이티브 LOC", "Target Native Migration LOC")}**: ${fmt(plan.totals.migratedNativeLoc)} LOC (${plan.totals.migratedNativePct}%, ${plan.totals.includedSubsystemCount}/9)`,
    `- **${t("유지 TS UI·IME 껍데기", "Retained TS UI/IME Shell")}**: ${fmt(plan.totals.retainedTsShellLoc)} LOC (${plan.totals.retainedTsShellPct}%)`,
    `- **${t("후속 단계 대기 TS", "Deferred Later-Phase TS")}**: ${fmt(plan.totals.deferredTsLoc)} LOC (${plan.totals.deferredTsPct}%)`,
    `- **${t("메모리 주소공간", "Memory Address Space")}**: ${t(`활성 ${plan.addressSpace.effectiveBits}비트 (요구 ${plan.addressSpace.requiredBits}비트 · 모드 \`${plan.addressSpace.mode}\` · 안전 상한 ${fmt(plan.addressSpace.safeResidentRamMb)} MB)`, `${plan.addressSpace.effectiveBits}-bit active (required ${plan.addressSpace.requiredBits}-bit, mode \`${plan.addressSpace.mode}\`, RAM cap ${fmt(plan.addressSpace.safeResidentRamMb)} MB)`)}`,
    `- **${t("WASM 청크 분할 상한 (gzip)", "WASM Bundle Cap (gzip)")}**: ${t("초기 부트", "Eager boot")} ${fmt(plan.bundlePlan.eagerBootGzipCapKb)} KB + ${t("지연 로드", "Lazy on-intent")} ${fmt(plan.bundlePlan.lazyOnIntentGzipCapKb)} KB = ${fmt(plan.bundlePlan.totalActiveGzipCapKb)} KB (${t("최대 청크", "max chunk")} ${fmt(plan.bundlePlan.maxSingleChunkCapKb)} KB)`,
    "",
    t("## 3. 9대 서브시스템 전환 매트릭스", "## 3. 9-Subsystem Migration Matrix"),
    t("| 서브시스템 | 파일 | 실측 LOC | 단계 | 포함 | 네이티브 | WASM32 | WASM64 | WebGPU f16 | WebNN | TS 유지 | 청크 상한 (KB) |", "| Subsystem | Files | LOC | Phase | Status | Native % | WASM32 | WASM64 | WebGPU f16 | WebNN | TS Shell | Chunk Cap (KB) |"),
    "| --- | ---: | ---: | :---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...plan.subsystems.map((i) => `| ${i.spec.id} | ${fmt(i.spec.measuredFileCount)} | ${fmt(i.spec.measuredLoc)} | P${i.spec.targetWavePhase} | ${i.includedInPhase ? t("포함", "In Scope") : t("대기", "Deferred")} | ${i.effectiveNativePct}% | ${i.stackPct.rustWasm32SimdPct}% | ${i.stackPct.rustWasm64Pct}% | ${i.stackPct.webgpuSubgroupsF16Pct}% | ${i.stackPct.webnnNpuPct}% | ${i.stackPct.tsUiImeRetainedPct}% | ${i.activeWasmChunk ? `${i.activeWasmChunk.activeGzipCapKb} (${i.activeWasmChunk.loadStrategy})` : "—"} |`),
    "",
    t("## 4. 핵심 리스크 및 완화 전략", "## 4. Key Architectural Risks & Mitigations"),
    ...plan.risks.flatMap((r) => [
      `- **[${r.severity.toUpperCase()}] ${isEn ? r.titleEn : r.titleKo}** (${r.affectedSubsystems.join(", ")})`,
      `  - ${t("위험", "Risk")}: ${isEn ? r.detailEn : r.detailKo}`,
      `  - ${t("완화", "Mitigation")}: ${isEn ? r.mitigationEn : r.mitigationKo}`,
    ]),
    "",
    t("## 5. 정직 공시", "## 5. Honesty Disclosure"),
    isEn ? plan.honestyDisclosureEn : plan.honestyDisclosureKo,
  ].join("\n");
}

/** 시뮬레이션 결과를 스키마 버전 포함 JSON 문자열로 직렬화한다. */
export function exportRustExpansionJson(planOrInput?: ExpansionRoadmapSimulation | SimulateExpansionRoadmapInput): string {
  return JSON.stringify(buildRustExpansionExportPayload(planOrInput), null, 2);
}
