/**
 * ToonStudio 실전 기술 발표 덱(16장) · 8대 AI 보조 기술 카탈로그 · 쉬운 용어집(22선) 정본 데이터.
 *
 * - 모든 항목은 실제 저장소 파일 경로(`repoPaths`)와 실존 스프라이트(`spritePath`)에 근거한다.
 * - 현재 구현(`current`)과 점진 확장(`expanding`), 웹 표준 경로와 네이티브 브리지를 정직하게 구분한다.
 * - 미실측 FPS·과장 배수·가짜 설문 수치를 금지하며, ToonStudio 고유 브랜드 체계 중심으로 표기한다.
 */

import type { BilingualText } from "./competitor-benchmark-data";

export type TechDeckStatus = "current" | "expanding";
export type TechDiagramTone = "accent" | "cool" | "good" | "warn";
export type TechGlossaryCategory =
  | "rendering"
  | "hardware"
  | "ai"
  | "storage-sync"
  | "ux-web"
  | "trust-security";
export type TechAiExecutionMode = "on-device" | "zero-bill-api" | "hybrid";

export interface TechDiagramNode {
  readonly stage: string;
  readonly label: BilingualText;
  readonly metric: BilingualText;
  readonly tone: TechDiagramTone;
}

export interface TechPresentationSlide {
  readonly id: string;
  readonly slideNumber: number;
  readonly sectionTag: BilingualText;
  readonly brandSystem: string;
  readonly status: TechDeckStatus;
  readonly title: BilingualText;
  readonly summary: BilingualText;
  readonly spritePath: string;
  readonly spriteAlt: BilingualText;
  readonly diagramTitle: BilingualText;
  readonly diagramNodes: readonly TechDiagramNode[];
  readonly whyChosen: BilingualText;
  readonly whereUsed: BilingualText;
  readonly reusePlaybook: BilingualText;
  readonly plainBackground: BilingualText;
  readonly tradeoff: BilingualText;
  readonly speakerNotes: BilingualText;
  readonly repoPaths: readonly string[];
}

export interface TechAiShowcaseModule {
  readonly id: string;
  readonly code: string;
  readonly brandTag: string;
  readonly status: TechDeckStatus;
  readonly executionMode: TechAiExecutionMode;
  readonly title: BilingualText;
  readonly whatItSolves: BilingualText;
  readonly howItWorks: BilingualText;
  readonly whereUsed: BilingualText;
  readonly reuseCase: BilingualText;
  readonly repoPaths: readonly string[];
}

export interface TechPlainGlossaryEntry {
  readonly id: string;
  readonly category: TechGlossaryCategory;
  readonly term: BilingualText;
  readonly oneLineAnalogy: BilingualText;
  readonly technicalMeaning: BilingualText;
  readonly usedInSlideNumbers: readonly number[];
}

const bi = (ko: string, en: string): BilingualText => ({ ko, en });

const dn = (
  stage: string,
  labelKo: string,
  labelEn: string,
  metricKo: string,
  metricEn: string,
  tone: TechDiagramTone,
): TechDiagramNode => ({ stage, label: bi(labelKo, labelEn), metric: bi(metricKo, metricEn), tone });

export const TECH_GLOSSARY_CATEGORIES: readonly {
  readonly id: "all" | TechGlossaryCategory;
  readonly label: BilingualText;
}[] = [
  { id: "all", label: bi("전체 22개", "All 22 Terms") },
  { id: "rendering", label: bi("렌더링 · 브러시", "Rendering & Brush") },
  { id: "hardware", label: bi("실리콘 · 입력", "Silicon & Input") },
  { id: "ai", label: bi("AI 보조", "AI Assist") },
  { id: "storage-sync", label: bi("저장 · 협업", "Storage & Sync") },
  { id: "ux-web", label: bi("디자인 · 웹 API", "Design & Web API") },
  { id: "trust-security", label: bi("신뢰 · 보안", "Trust & Security") },
];

export const TECH_PRESENTATION_SLIDES: readonly TechPresentationSlide[] = [
  {
    id: "zero-copy-overview", slideNumber: 1, status: "current",
    sectionTag: bi("01 · 전체 아키텍처", "01 · System Architecture"),
    brandSystem: "ToonCore · SpectrumCompute · LoomSync",
    title: bi("전체 Zero-Copy 아키텍처 한눈에 보기", "End-to-End Zero-Copy Architecture at a Glance"),
    summary: bi("펜 입력부터 ToonCore(Rust/WASM64), SpectrumCompute(WebGPU), PrismRender(WebCodecs), LoomSync(OPFS/CRDT)까지 불필요한 메모리 복사를 줄여 브라우저 한 탭에서 스튜디오 파이프라인을 잇습니다.", "Connects stylus input through ToonCore (Rust/WASM64), SpectrumCompute (WebGPU), PrismRender (WebCodecs), and LoomSync (OPFS/CRDT) while minimizing redundant copies inside a single browser tab."),
    spritePath: "/assets/studio/vibrant-sprites/wow-hero-atelier-stage.webp",
    spriteAlt: bi("ToonStudio 전체 스튜디오 파이프라인 아틀리에 스테이지", "ToonStudio full studio pipeline atelier stage"),
    diagramTitle: bi("입력 → 연산 → GPU 합성 → 인코딩 → 로컬/협업 저장 흐름", "Input -> Compute -> GPU Composite -> Encode -> Local/CRDT Flow"),
    diagramNodes: [
      dn("STAGE 1", "스타일러스 · WebHID", "Stylus & WebHID", "16K 필압 · 예측 입력", "16K pressure & prediction", "accent"),
      dn("STAGE 2", "ToonCore WASM64", "ToonCore WASM64", "47.99 KiB 안전 커널", "47.99 KiB safe kernel", "cool"),
      dn("STAGE 3", "SpectrumCompute GPU", "SpectrumCompute GPU", "타일 링버퍼 · WGSL", "Tile ring buffer & WGSL", "good"),
      dn("STAGE 4", "LoomSync · PrismRender", "LoomSync & PrismRender", "OPFS · CRDT · WebCodecs", "OPFS, CRDT & WebCodecs", "warn"),
    ],
    whyChosen: bi("일반 웹 드로잉 앱은 JS 배열, Canvas2D, IndexedDB 사이에서 픽셀 버퍼를 매번 직렬화·복사해 대용량 웹툰 원고에서 병목이 생깁니다. 단계별 소유 버퍼와 타일 링 계약을 묶어 메모리 압박을 낮췄습니다.", "Typical web drawing apps serialize and copy pixel buffers repeatedly across JS arrays, Canvas2D, and IndexedDB. Sharing structured tile rings across stages cuts memory churn on large comic canvases."),
    whereUsed: bi("스튜디오 메인 캔버스 드로잉 루프, 자동 저장 저널, 3D 배경 합성, 숏폼 영상 내보내기 전체의 뼈대로 동작합니다.", "Forms the backbone of the live studio drawing loop, local autosave journal, 3D stage compositing, and video export flows."),
    reusePlaybook: bi("웹 CAD 뷰어, 의료 DICOM 대용량 슬라이스 편집기, 브라우저 영상 NLE, 실시간 화이트보드 SaaS에 동일 4계층 파이프라인을 그대로 이식할 수 있습니다.", "Reusable as a 4-stage blueprint for web CAD viewers, DICOM medical slice editors, browser NLE video tools, and collaborative whiteboards."),
    plainBackground: bi("택배 상자를 창고마다 다시 포장하면 시간이 다 갑니다. Zero-Copy는 처음 담은 팔레트 그대로 컨베이어 벨트에 태워 다음 공정으로 넘기는 설계입니다.", "Repacking a box at every warehouse wastes time. Zero-copy keeps data on one shared pallet as it moves from input to screen and disk."),
    tradeoff: bi("현재 구현은 CPU 참조 타일 링·WASM 핫패스·OPFS 저장 경계가 검증돼 있으며, 실기 브라우저 WebGPU Storage Buffer 직결 경로는 기기 지원에 따라 점진 활성화됩니다.", "CPU reference tile rings, WASM hotpaths, and OPFS persistence are active today; direct GPU storage-buffer handoff scales progressively where browsers expose WebGPU."),
    speakerNotes: bi("첫 장에서는 툰스튜디오가 왜 설치 없는 브라우저에서 데스크톱급 구조를 노릴 수 있는지 한눈에 보여줍니다. 핵심은 네 단계 사이의 데이터 복사를 줄이고, 브라우저가 미지원이어도 안전 폴백이 즉시 작동한다는 점입니다.", "This opening slide shows how ToonStudio runs a desktop-class pipeline in one tab: minimize buffer copies across four stages while keeping deterministic fallbacks everywhere."),
    repoPaths: ["apps/web/src/domains/creator/webgpu-zero-copy-studio/webgpu-vello-zerocopy-pipeline.ts", "apps/web/src/domains/creator/wasm64-runtime-bridge/wasm64-hotpath-loader.ts", "apps/web/src/domains/creator/studio-opfs-filesystem.ts"],
  },
  {
    id: "rust-wasm64-core", slideNumber: 2, status: "current",
    sectionTag: bi("02 · 연산 코어 & 메모리 안전", "02 · Compute Core & Safety"),
    brandSystem: "ToonCore",
    title: bi("ToonCore: Rust/WASM64 연산 코어 & unsafe 0 메모리 안전 경계", "ToonCore: Rust/WASM64 Compute Kernel & Zero-Unsafe Boundary"),
    summary: bi("외부 크레이트 의존성 0개의 순수 Rust 코어(`crates/studio-wasm64-drawing-core`)로 47.99 KiB 기본 바이너리 계약과 112+ cargo 테스트를 유지하며 `extended-3d`·`virtual-3d-physics` 피처를 모듈 분리합니다.", "Pure-Rust crate (`crates/studio-wasm64-drawing-core`) with zero external crates, preserving a 47.99 KiB core binary budget, 112+ cargo tests, and modular `extended-3d` / `virtual-3d-physics` features."),
    spritePath: "/assets/studio/vibrant-sprites/emblem-tech-lab.webp",
    spriteAlt: bi("ToonCore Rust WASM64 기술 연구실 엠블럼", "ToonCore Rust WASM64 engineering emblem"),
    diagramTitle: bi("크레이트 전역 #![deny(unsafe_code)] → 최소 FFI 게이트 → 기능 피처 분리", "Crate-Wide #![deny(unsafe_code)] -> Minimal FFI Gate -> Feature Split"),
    diagramNodes: [
      dn("CORE", "안전 Rust 커널", "Safe Rust Kernels", "unsafe 0 · std 전용", "0 unsafe · std only", "good"),
      dn("BUDGET", "기본 WASM 코어", "Base WASM Core", "47.99 KiB · panic=abort", "47.99 KiB · panic=abort", "accent"),
      dn("EXT-3D", "extended-3d SIMD128", "extended-3d SIMD128", "VRM·BVH·LT 선택 빌드", "Optional VRM/BVH/LT", "cool"),
      dn("VERIFY", "결정론적 검증", "Deterministic Tests", "112+ cargo 테스트", "112+ cargo tests", "warn"),
    ],
    whyChosen: bi("C/C++ 네이티브 포팅은 메모리 경계 오류와 공급망 빌드 복잡도가 큽니다. 순수 `std` Rust에 `#![deny(unsafe_code)]`와 `Result` 오류 모델을 강제해 크래시 없는 결정론적 픽셀 연산과 초경량 다운로드를 동시에 얻었습니다.", "Porting C/C++ increases memory bugs and supply-chain friction. Pure-`std` Rust with `#![deny(unsafe_code)]` and typed `Result` errors delivers deterministic pixel math inside a tiny binary."),
    whereUsed: bi("브러시 분광 혼색, 종이 높이장, 256×256 타일 합성, XOR 델타 압축, 가우시안/언샤프 필터, PSD 헤더 스트리밍, 3D 스키닝·BVH 핫패스에서 실행됩니다.", "Powers spectral pigment mixing, paper heightfields, 256x256 tile compositing, XOR delta codecs, blur/unsharp filters, streaming PSD headers, and 3D skinning/BVH."),
    reusePlaybook: bi("핀테크 암호화/정산 엔진, 브라우저 이미지·오디오 코덱, 오프라인 GIS 타일 파서처럼 보안·바이너리 크기·재현성이 중요한 모든 웹 제품에 바로 적용할 수 있습니다.", "Ideal blueprint for browser codecs, offline GIS tile parsers, or fintech calculation engines requiring strict memory safety and tiny bundle footprints."),
    plainBackground: bi("WASM은 브라우저 안에서 실행되는 초고속 기계어 카트리지입니다. 특히 Rust는 문법 단계에서 메모리 누수와 잘못된 주소 접근을 막아 주어 장시간 작업해도 탭이 뻗지 않게 지켜 줍니다.", "WebAssembly is a fast bytecode cartridge inside the browser. Rust blocks out-of-bounds memory bugs at compile time so long sessions stay stable."),
    tradeoff: bi("선형 메모리 C-ABI 포인터 경계만 `wasm_ffi.rs`에 최소 격리했고, 브라우저 memory64 미지원 환경에서는 32비트 WASM 또는 TS 결정론 폴백으로 자동 전환합니다.", "Linear-memory C-ABI pointer marshaling stays isolated in `wasm_ffi.rs`, and browsers without memory64 gracefully fall back to wasm32 or typed JS kernels."),
    speakerNotes: bi("많은 웹 앱이 수십 메가바이트 런타임을 내려받지만, ToonCore 기본 코어는 외부 크레이트 0개, 47.99 KiB 계약 안에 핵심 드로잉 커널을 담았습니다. 필요할 때만 3D와 물리 피처를 얹는 모듈형 설계입니다.", "Instead of shipping a multi-megabyte runtime, ToonCore packs its zero-dependency Rust drawing kernels under 48 KiB and layers 3D and physics via opt-in features."),
    repoPaths: ["crates/studio-wasm64-drawing-core/Cargo.toml", "crates/studio-wasm64-drawing-core/src/lib.rs", "crates/studio-wasm64-drawing-core/src/wasm_ffi.rs", "crates/studio-wasm64-drawing-core/tests/drawing_core_integration.rs"],
  },
  {
    id: "atelier-ink-tactile", slideNumber: 3, status: "current",
    sectionTag: bi("03 · 물리 브러시 & 절차적 질감", "03 · Physical Brush & Textures"),
    brandSystem: "AtelierInk · InkRaster · AtelierSolid",
    title: bi("AtelierInk: 연속 리본 · KM 분광 혼색 · 한지/임파스토 · 절차적 시드 DAG", "AtelierInk: Ribbon Tessellation, KM Spectral Mixing, Hanji Impasto & Procedural DAG"),
    summary: bi("원형 스탬프 비딩을 없앤 연속 리본 테셀레이션, 이중 주파수 한지·종이 높이맵, 24모 강모 안료 소진, 쿠벨카-뭉크 7/16-밴드 분광 혼색, 45° Sobel 임파스토, 수채화 Backrun, 16-bit Linear HDR 타일, 결정론 시드 DAG 및 `.abr/.sut/.brushset` 게이트웨이를 통합합니다.", "Unifies bead-free ribbon tessellation, dual-frequency Hanji/paper heightmaps, 24-bristle depletion, 7/16-band Kubelka-Munk mixing, 45-deg Sobel impasto, watercolor backruns, 16-bit linear HDR tiles, deterministic procedural seed DAGs, and `.abr/.sut/.brushset` import."),
    spritePath: "/assets/studio/vibrant-sprites/brush-watercolor.webp",
    spriteAlt: bi("AtelierInk 수채화 및 분광 물리 브러시 아이콘", "AtelierInk watercolor and spectral physical brush icon"),
    diagramTitle: bi("리본/24모 강모 → KM 7/16-밴드 광학 → 45° Sobel 부조 · 모세관 → 16-bit HDR & 포맷 호환", "Ribbon/24 Bristles -> KM 7/16-Band -> 45-deg Sobel & Backrun -> 16-bit HDR & Gateways"),
    diagramNodes: [
      dn("STROKE", "연속 리본 · 24모 강모", "Ribbon & 24 Bristles", "비딩 0 · 안료 소진", "Zero beading · depletion", "accent"),
      dn("OPTICS", "KM 7/16-밴드 분광", "KM 7/16-Band Optics", "파랑+노랑 → 선명한 초록", "Blue + Yellow -> Vivid Green", "good"),
      dn("SURFACE", "한지 요철 · 45° 임파스토", "Hanji & 45-deg Impasto", "4계층 습윤 · Backrun", "4-stage wet · backrun", "cool"),
      dn("ASSET", "시드 DAG · 포맷 게이트", "Seed DAG & Format Gate", "수밀 0-non-manifold · .abr/.sut", "Manifold DAG · .abr/.sut", "warn"),
    ],
    whyChosen: bi("일반 RGB 알파 블렌딩은 파랑과 노랑을 섞으면 탁한 회색이 되고, 원형 도장 반복은 빠른 획에서 구슬처럼 끊깁니다. 실제 회화 안료 광학(KM), 물리 종이 요철, 연속 리본, 시드 기반 절차적 자산 생성을 한 파이프라인으로 묶었습니다.", "Naive RGB mixing turns blue + yellow muddy gray, while circular stamps bead on fast strokes. Combining KM pigment physics, dual-frequency paper tooth, continuous ribbons, and seed DAGs solves both fidelity and migration."),
    whereUsed: bi("스튜디오 펜선·수채·유화·한지 채색 브러시, 절차적 배경 소품(한옥 기와·고딕 아치·심리스 석재) 생성기, 기존 작가 브러시(`.abr`/`.sut`/`.brushset`) 불러오기에서 바로 쓰입니다.", "Drives studio ink, watercolor, oil impasto, and Hanji brushes, procedural comic props/PBR textures, and creator `.abr`/`.sut`/`.brushset` brush migration."),
    reusePlaybook: bi("디지털 화방 시뮬레이터, 게임 텍스처 페인팅 툴, 건축·패션 원단 질감 미리보기, 절차적 맵/프롭 생성 파이프라인에 그대로 응용할 수 있습니다.", "Directly adaptable to game texture painters, fabric/material swatch simulators, digital calligraphy apps, and deterministic procedural prop pipelines."),
    plainBackground: bi("쿠벨카-뭉크 이론은 빛이 물감층을 통과하며 흡수되고 반사되는 물리 공식입니다. 여기에 도화지의 미세한 골짜기(높이맵)와 물감이 마르며 가장자리로 몰리는 현상(Backrun)을 더해 진짜 종이 위 손맛을 만듭니다.", "Kubelka-Munk models how real pigments absorb and scatter light wavelengths. Pairing it with microscopic paper valleys and capillary water drying recreates authentic paint behavior."),
    tradeoff: bi("16-밴드 분광과 4계층 임파스토는 일반 RGB보다 연산량이 크므로, 256×256 더티 타일 격리와 120Hz/60Hz 프레임 예산 가드로 정밀도를 자동 조절합니다. 브라우저 절차적 시드 DAG 출력은 현재 SVG/설계 DAG 정본이며 3D 메쉬 수밀 검증은 Blender 파이프라인과 연계합니다.", "16-band optics and 4-stage impasto cost more than RGB alpha, so 256x256 dirty-tile isolation and frame-budget guards scale quality down on modest devices. Browser procedural synth outputs deterministic SVG/DAG specs paired with manifold mesh gates."),
    speakerNotes: bi("작가가 도구를 바꿀 때 가장 먼저 보는 건 첫 획의 손맛과 기존 브러시 호환성입니다. AtelierInk는 연속 리본과 24모 강모, 7/16-밴드 쿠벨카-뭉크, 한지 높이맵, 그리고 .abr/.sut/.brushset 게이트웨이까지 한 번에 풀었습니다.", "Artists judge a studio by the very first stroke and brush compatibility. AtelierInk unifies continuous ribbons, 24-bristle depletion, KM spectral optics, Hanji paper relief, and `.abr/.sut/.brushset` import."),
    repoPaths: ["crates/studio-wasm64-drawing-core/src/spectral_km_kernel.rs", "apps/web/src/domains/creator/brush/studio-calligraphy-ribbon.ts", "apps/web/src/domains/creator/brush-physics-pro/wet-soak-impasto-wax-resist.ts", "apps/web/src/domains/creator/tactile-brush-texture-studio/tactile-brush-texture-engine.ts", "apps/web/src/domains/creator/procedural-asset-synthesizer/procedural-asset-synth-engine.ts", "packages/studio-format-gateway/src/abr.ts", "packages/studio-format-gateway/src/csp-sut.ts", "packages/studio-format-gateway/src/procreate-brushset.ts"],
  },
  {
    id: "webgpu-subgroups-prewarm", slideNumber: 4, status: "expanding",
    sectionTag: bi("04 · 차세대 WebGPU 컴퓨트", "04 · Next-Gen WebGPU Compute"),
    brandSystem: "SpectrumCompute · PrismRender",
    title: bi("SpectrumCompute: WebGPU Subgroups · shader-f16 · Sparse Strips · 3-Wave WGSL 프리컴파일", "SpectrumCompute: WebGPU Subgroups, shader-f16, Sparse Strips & 3-Wave WGSL Prewarm"),
    summary: bi("WebGPU `subgroups` 배리어 축소(13→1), `shader-f16` 분광 대역폭 절반 절감(16B→8B), Sparse Strips 벡터 래스터, 12종 WGSL 3-Wave 비동기 사전 컴파일 설계로 첫 획 멈춤(Stutter)을 줄입니다.", "Combines WebGPU `subgroups` barrier reduction (13->1), `shader-f16` spectral half-bandwidth (16B->8B), Sparse Strips vector rasterization, and 3-Wave WGSL precompile scheduling to tame first-stroke stutter."),
    spritePath: "/assets/studio/vibrant-sprites/tech-webgpu.webp",
    spriteAlt: bi("SpectrumCompute WebGPU 셰이더 파이프라인 그래픽", "SpectrumCompute WebGPU shader pipeline graphic"),
    diagramTitle: bi("기능 협상 → Subgroup/f16 셰이더 선택 → 3-Wave 비동기 프리컴파일 → 안전 폴백", "Capability Negotiation -> Subgroup/f16 Select -> 3-Wave Async Prewarm -> Fallback"),
    diagramNodes: [
      dn("PROBE", "확장 기능 협상", "Feature Negotiation", "subgroups · shader-f16", "subgroups & shader-f16", "cool"),
      dn("COMPUTE", "Subgroup 프리픽스 합", "Subgroup Prefix Sum", "워크그룹 배리어 13→1", "Workgroup barriers 13->1", "accent"),
      dn("BANDWIDTH", "f16 분광 + Sparse Strips", "f16 Spectral & Strips", "픽셀당 8B · 4/8px 스트립", "8B/px · 4/8px strips", "good"),
      dn("PREWARM", "3-Wave WGSL 캐시", "3-Wave WGSL Prewarm", "12종 파이프라인 분산 예약", "12 pipelines wave-staged", "warn"),
    ],
    whyChosen: bi("브라우저 GPU 앱의 가장 큰 불만은 첫 브러시를 긋는 순간 셰이더 컴파일 때문에 화면이 뚝 끊기는 콜드 스타트 스터터입니다. 최신 WebGPU 확장과 단계별 프리컴파일 스케줄러를 함께 설계해 대역폭과 초기 지연을 동시에 겨냥했습니다.", "Cold-start shader compilation causes jarring first-stroke freezes in GPU web apps. Pairing modern WebGPU extensions with 3-Wave precompile scheduling targets both memory bandwidth and first-stroke responsiveness."),
    whereUsed: bi("SpectrumCompute 극한 셰이더 브리지, KM7 분광 브러시 파이프라인 선택기, 12종 핵심 셰이더 3-Wave 프리컴파일 플래너에 적용돼 있습니다.", "Used in the SpectrumCompute shader bridge, KM7 precision selector, and the 12-pipeline 3-Wave WGSL prewarm planner."),
    reusePlaybook: bi("웹 기반 3D 엔진, 실시간 이미지 필터 편집기, 대용량 벡터 지도 렌더러, 브라우저 게임의 셰이더 스터터 제거 설계에 그대로 재사용할 수 있습니다.", "Directly reusable in browser 3D engines, real-time photo editors, vector map renderers, and web games fighting shader-compile stutter."),
    plainBackground: bi("Subgroups는 GPU 안의 인접 작업자들이 중앙 창고(공유 메모리)를 거치지 않고 바로 옆 사람과 숫자를 주고받는 고속 통신이고, f16은 화질을 지키며 데이터 부피를 절반으로 줄이는 압축 숫자 형식입니다.", "Subgroups let neighboring GPU lanes exchange values directly without slow shared-memory barriers, while f16 halves memory traffic without visibly degrading pigment math."),
    tradeoff: bi("현재 구현은 WGSL 셰이더 소스, 4단 기능 협상, CPU 정밀도 패리티 검증, 3-Wave 메타데이터·예산 플래너까지 검증돼 있으며, 실기 브라우저 `createComputePipelineAsync` 캐시 직결 및 GPU 타임스탬프 실측은 점진 확장 트랙입니다.", "Current scope verifies WGSL sources, 4-tier capability negotiation, CPU precision parity, and 3-Wave scheduling models; live browser `createComputePipelineAsync` GPU cache dispatch is an active expanding track."),
    speakerNotes: bi("여기서는 솔직하게 현재 구현과 확장 경계를 구분합니다. WGSL 셰이더와 f16 정밀도 패리티, 3-Wave 프리컴파일 스케줄러는 이미 코드와 테스트로 고정돼 있고, 실기 브라우저 GPU 캐시 직결은 하드웨어 지원 확대에 맞춰 안전하게 확장 중입니다.", "Here we draw an honest line between Current and Expanding: WGSL sources, f16 parity checks, and the 3-Wave scheduler are tested in repo today, while live async GPU pipeline caching expands alongside browser support."),
    repoPaths: ["apps/web/src/domains/creator/render/webgpu-extreme-subgroups/extreme-webgpu-runtime-bridge.ts", "apps/web/src/domains/creator/render/webgpu-extreme-subgroups/extreme-webgpu-wgsl-shaders.ts", "apps/web/src/domains/creator/shader-prewarm-webcodecs/shader-prewarm-webcodecs-engine.ts"],
  },
  {
    id: "prism-radiance-lighting", slideNumber: 5, status: "expanding",
    sectionTag: bi("05 · 실시간 전역 조명 & 컬링", "05 · Real-Time GI & Culling"),
    brandSystem: "PrismLight",
    title: bi("PrismLight: 2D/2.5D Radiance Cascades 전역 조명 · JFA SDF 그림자 · Hi-Z & VRS 설계", "PrismLight: 2D/2.5D Radiance Cascades GI, JFA SDF Shadows & Hi-Z/VRS Design"),
    summary: bi("Jump Flooding(JFA) 거리장(SDF)과 다중 해상도 Radiance Cascades 3패스 컴퓨트 셰이더로 웹툰 컷에 부드러운 역광·림라이트를 계산하고, Hi-Z 오클루전 컬링과 VRS 가변 셰이딩으로 불필요한 픽셀 연산을 줄이는 구조입니다.", "Computes soft 2D/2.5D webtoon rim lighting and shadows via Jump Flooding SDF plus 3-pass Radiance Cascades shaders, paired with Hi-Z occlusion culling and Variable Rate Shading budgets."),
    spritePath: "/assets/studio/vibrant-sprites/innov-live-palette.webp",
    spriteAlt: bi("PrismLight 실시간 전역 조명 및 동적 팔레트 비주얼", "PrismLight real-time global illumination visual"),
    diagramTitle: bi("JFA SDF 거리장 → Cascade 프로브 → 병합·셀 림라이트 → Hi-Z/VRS 예산 가드", "JFA SDF Field -> Cascade Probes -> Merge & Cel Rim -> Hi-Z/VRS Budget"),
    diagramNodes: [
      dn("PASS 1", "JFA SDF 거리장", "JFA SDF Distance", "@workgroup_size(8,8)", "@workgroup_size(8,8)", "cool"),
      dn("PASS 2", "Radiance 프로브", "Radiance Probes", "3~6단 캐스케이드", "3-6 cascade levels", "accent"),
      dn("PASS 3", "병합 & 셀 림라이트", "Merge & Cel Rim", "96B 정렬 Uniform", "96B aligned uniforms", "good"),
      dn("CULLING", "Hi-Z · VRS 설계", "Hi-Z & VRS Budget", "가려진 타일 스킵", "Skip occluded tiles", "warn"),
    ],
    whyChosen: bi("웹툰 채색에서 컷마다 일일이 역광과 반사광을 수작업으로 칠하면 마감 시간이 급증합니다. 레이트레이싱 노이즈 없이 2D 컷에서 매끄러운 빛 번짐을 내는 Radiance Cascades를 선택했습니다.", "Hand-painting bounce and rim light on every comic panel eats deadline hours. Radiance Cascades delivers noise-free 2D global illumination far cheaper than Monte Carlo path tracing."),
    whereUsed: bi("PrismLight 웹툰 컷 조명 미리보기, 2.5D 역광/네온 간판 분위기 연출, 캐릭터 림라이트 가이드 레이어에 적용됩니다.", "Powers PrismLight panel lighting previews, 2.5D backlight/neon mood staging, and character rim-light guide layers."),
    reusePlaybook: bi("2D 인디 게임 동적 조명, 건축 평면도 채광 시뮬레이터, 무대 조명 프리비즈, 인터랙티브 일러스트 뷰어에 그대로 응용할 수 있습니다.", "Reusable in 2D indie game lighting, architectural floorplan daylight tools, stage lighting pre-vis, and interactive illustration viewers."),
    plainBackground: bi("가까운 빛은 촘촘히, 먼 빛은 듬성듬성 계산해 합치는 원리입니다. 눈앞 글씨는 자세히 보고 멀리 있는 가로등은 대략적인 밝기만 파악하는 사람 시각과 비슷해 계산량을 크게 줄입니다.", "Nearby light is sampled densely while distant light is sampled coarsely and merged—mirroring human vision to cut computation dramatically."),
    tradeoff: bi("현재 구현은 3종 WGSL 컴퓨트 셰이더 소스, 16B 정렬 Uniform 패커, 결정론적 CPU 2D SDF/GI 패리티 시뮬레이터까지 완비돼 있으며, 실기 WebGPU Storage Texture 실시간 캔버스 합성과 VRS 하드웨어 배율 연동은 점진 확장 영역입니다.", "Three WGSL compute shaders, 16B-aligned uniform packers, and a deterministic CPU 2D SDF/GI parity simulator are implemented now; live WebGPU Storage Texture compositing and hardware VRS scaling remain on the expanding track."),
    speakerNotes: bi("만화·웹툰에서 빛 연출은 곧 몰입감입니다. PrismLight는 2D 레이어 정보만으로 JFA 거리장과 Radiance Cascades 전역 조명을 계산해, 작가가 조명 위치만 옮겨도 림라이트와 부드러운 그림자를 미리 검증할 수 있게 설계했습니다.", "Lighting makes or breaks comic mood. PrismLight derives JFA distance fields and Radiance Cascades from 2D layers so artists can move a light source and preview rim lighting before committing paint."),
    repoPaths: ["apps/web/src/domains/creator/webgpu-radiance-cascades/radiance-cascades-engine.ts", "apps/web/src/domains/creator/webgpu-radiance-cascades/radiance-cpu-geometry.ts", "apps/web/src/domains/creator/render/webgpu-tactile-pipeline/webgpu-tactile-compositor-bridge.ts"],
  },
  {
    id: "toonsilicon-npu-thermal", slideNumber: 6, status: "expanding",
    sectionTag: bi("06 · 이기종 실리콘 & 열 제어", "06 · Heterogeneous Silicon & Thermal"),
    brandSystem: "ToonSilicon",
    title: bi("ToonSilicon: 8대 현대 실리콘 · WebNN/LiteRT-Web MLTensor · PID 열 제어", "ToonSilicon: 8 Modern Silicon Profiles, WebNN/LiteRT-Web MLTensor & PID Thermal Control"),
    summary: bi("Apple M-Series(ANE), Intel Core Ultra, AMD Ryzen AI(XDNA2), Qualcomm Hexagon, Samsung Exynos NPU, 외장 GPU(NVIDIA/AMD/Intel), Google Tensor TPU까지 8대 실리콘의 웹 표준 경로(WebNN/WebGPU/WASM SIMD)와 OS 네이티브 브리지를 명확히 분리해 오케스트레이션합니다.", "Orchestrates 8 modern silicon targets—Apple M-Series, Intel Core Ultra, AMD Ryzen AI, Qualcomm Hexagon, Samsung Exynos, discrete GPUs, and Google Tensor TPU—separating Web Standard paths from OS native bridges."),
    spritePath: "/assets/studio/vibrant-sprites/device-watch.webp",
    spriteAlt: bi("ToonSilicon 이기종 하드웨어 및 열 제어 텔레메트리", "ToonSilicon heterogeneous hardware and thermal telemetry"),
    diagramTitle: bi("3레인 작업 배분(NPU · WebGPU f16 · WASM SIMD) + Compute Pressure PID 열 제어", "3-Lane Dispatch (NPU / WebGPU f16 / WASM SIMD) + Compute Pressure PID Control"),
    diagramNodes: [
      dn("LANE A", "WebNN NPU / LiteRT", "WebNN NPU / LiteRT", "INT4/INT8/FP16 · MLTensor", "INT4/INT8/FP16 · MLTensor", "accent"),
      dn("LANE B", "WebGPU f16 GPU", "WebGPU f16 GPU", "캔버스 브러시 무간섭", "Uncontended brush lane", "good"),
      dn("LANE C", "WASM Relaxed-SIMD", "WASM Relaxed-SIMD", "CPU 워커 · 안전 폴백", "CPU worker & fallback", "cool"),
      dn("THERMAL", "Anti-Windup PID", "Anti-Windup PID", "4단 그레이스풀 강등", "4-tier graceful degrade", "warn"),
    ],
    whyChosen: bi("AI 보조 추론과 캔버스 드로잉이 GPU 한 레인에서 충돌하면 펜 반응이 뚝뚝 끊깁니다. AI 추론은 NPU/TPU 레인으로 분리하고, Compute Pressure 상태에 맞춰 PID 제어기가 4단계로 부하를 부드럽게 낮춰 모바일 발열 쓰로틀링을 막습니다.", "Running AI assist and brush rendering on the same GPU queue causes pen stutters. Offloading inference to NPU/TPU lanes and smoothing thermals with a 4-tier PID controller keeps pen input fluid."),
    whereUsed: bi("이기종 NPU 분산 스케줄러, ONNX Runtime Web EP 설정 생성기, 장시간 30분 드로잉 발열 예측·강등 플래너에 쓰입니다.", "Drives the heterogeneous NPU scheduler, ONNX Runtime Web EP config builder, and 30-minute sustained thermal degradation planner."),
    reusePlaybook: bi("웹 화상회의 실시간 배경 분리/음성 잡음 제거, 온디바이스 문서 OCR, 모바일 웹 AR 필터, 로컬 LLM 어시스턴트 스케줄링에 바로 적용할 수 있습니다.", "Applicable to browser video-call denoising, on-device OCR, mobile WebAR filters, and local LLM background scheduling."),
    plainBackground: bi("주방에서 요리사(GPU)가 메인 요리를 굽는 동안 재료 손질(AI 보조)은 전담 보조(NPU/TPU)에게 맡기고, 화력이 과열되기 전에 가스 불을 미리 1단계씩 줄여 요리가 타지 않게 유지하는 구조입니다.", "Letting the NPU prep ingredients while the GPU cooks the main canvas—and dialing heat down early before thermal throttling—keeps performance steady."),
    tradeoff: bi("브라우저가 직접 접근할 수 있는 영역은 WebNN `MLTensor` · WebGPU · WASM SIMD · Compute Pressure API 표준 경로뿐이며, CoreML·DirectML·QNN·Google Tensor NNAPI/LiteRT-Web 가속은 브라우저/OS 네이티브 브리지를 통해 간접 매핑됩니다. 현재 저장소 엔진은 허위 TOPS·온도 실측 없는 결정론적 아키텍처 계획·PID 시뮬레이션 모델입니다.", "Browsers only access Web Standard APIs (WebNN `MLTensor`, WebGPU, WASM SIMD, Compute Pressure); CoreML, DirectML, QNN, and Google Tensor NNAPI/LiteRT-Web are OS-mediated bridges. Current modules are deterministic analytical planning & PID models with zero fabricated hardware benchmarks."),
    speakerNotes: bi("8대 실리콘을 다룰 때 가장 중요한 원칙은 정직함입니다. 웹앱이 OS 전용 SDK를 직접 호출하는 것처럼 과장하지 않고, 웹 표준 API가 어디까지 직접 제어하고 어디부터 브라우저의 네이티브 브리지에 위임하는지 명확히 구분해 설계했습니다.", "Honesty matters most on heterogeneous silicon: we clearly distinguish what Web Standard APIs control directly versus where CoreML, DirectML, QNN, or Google Tensor backends operate behind the browser bridge."),
    repoPaths: ["apps/web/src/domains/creator/heterogeneous-npu-runtime/heterogeneous-npu-engine.ts", "apps/web/src/domains/creator/webnn-npu-thermal-compiler/webnn-npu-thermal-engine.ts", "apps/web/src/domains/creator/kernel/chrome-nextgen-platform-accelerator.ts"],
  },
  {
    id: "ultra-low-latency-stylus-hid", slideNumber: 7, status: "current",
    sectionTag: bi("07 · 초저지연 입력 & 주변기기", "07 · Ultra-Low-Latency Input"),
    brandSystem: "AtelierInk · ToonSilicon",
    title: bi("초저지연 입력: 16K PCHIP 필압 · One-Euro + Micro-MLP 예측 · WebHID/MIDI/워치 햅틱", "Ultra-Low-Latency Input: 16K PCHIP, One-Euro + Micro-MLP & WebHID/MIDI/Watch Haptics"),
    summary: bi("16,384단계(14-bit) PCHIP 단조 필압 곡선, One-Euro 적응형 필터 + 75파라미터 결정론적 Micro-MLP 궤적 예측, USB HID Usage Page `0x0D` 클린룸 디지타이저와 왼손 다이얼·MIDI 페달·워치 햅틱을 연결합니다.", "Combines 16,384-level (14-bit) monotonic PCHIP pressure curves, One-Euro + 75-parameter deterministic Micro-MLP lookahead, clean-room USB HID `0x0D` digitizer parsing, and dial/MIDI/watch haptics."),
    spritePath: "/assets/studio/vibrant-sprites/device-digitizer.webp",
    spriteAlt: bi("프로 디지타이저 및 초저지연 스타일러스 입력 장치", "Pro digitizer and ultra-low-latency stylus input device"),
    diagramTitle: bi("240Hz+ 원시 샘플 → 16K PCHIP 필압 → One-Euro + Micro-MLP → 왼손 WebHID/햅틱", "240Hz+ Raw Samples -> 16K PCHIP -> One-Euro + Micro-MLP -> WebHID & Haptics"),
    diagramNodes: [
      dn("CAPTURE", "PointerEvent · HID 0x0D", "PointerEvent & HID 0x0D", "14-bit 16,384 필압", "14-bit 16,384 levels", "accent"),
      dn("CURVE", "PCHIP 단조 곡선", "Monotonic PCHIP Curve", "오버슈트 0% 필압", "Zero-overshoot curve", "good"),
      dn("PREDICT", "One-Euro + Micro-MLP", "One-Euro + Micro-MLP", "75-param · <=16ms 예측", "75-param · <=16ms ahead", "cool"),
      dn("COMPANION", "다이얼 · MIDI · 워치", "Dial, MIDI & Watch", "드라이버 설치 0건", "Zero driver installs", "warn"),
    ],
    whyChosen: bi("일반 스플라인 보간은 필압 곡선이 튀는 오버슈트를 만들고, 단순 이동평균 필터는 빠른 붓질에서 펜끝이 뒤처집니다. 단조 PCHIP과 속도 적응형 One-Euro + 경량 Micro-MLP로 떨림 제거와 즉답성을 함께 잡았습니다.", "Ordinary cubic splines overshoot pressure curves and naive moving averages lag fast flicks. Monotonic PCHIP plus velocity-adaptive One-Euro and a tiny Micro-MLP suppress jitter without lag."),
    whereUsed: bi("프로 디지타이저 보정기, 펜촉 필압 5종 프리셋(G펜·연필·손목보호), 왼손 단축 다이얼(WebHID), MIDI 발판/노브, 애플·갤럭시 워치 연동에서 사용됩니다.", "Powers the pro digitizer calibrator, 5 pressure presets (G-Pen, pencil, wrist-care), WebHID left-hand dials, MIDI foot pedals, and companion watch haptics."),
    reusePlaybook: bi("전자서명·필기 노트 앱, 웹 음악 DAW(WebMIDI), 원격 로봇·드론 웹 조종기, 의료 초음파·수술 트레이닝 시뮬레이터의 저지연 입력층으로 바로 활용할 수 있습니다.", "Directly transferable to handwriting/signature apps, browser DAWs (WebMIDI), teleoperation UIs, and precision touch/pen training simulators."),
    plainBackground: bi("손이 천천히 움직일 때는 미세한 떨림을 부드럽게 다듬어 주고, 빠르게 선을 그을 때는 0.01초 앞 펜 위치를 예측해 종이 위에 즉시 선이 따라오게 만드는 전자 손떨림 보정 기술입니다.", "It smooths micro-tremors when drawing slowly and predicts pen motion milliseconds ahead during fast sweeps so ink feels glued to the nib."),
    tradeoff: bi("WebHID·WebMIDI 권한은 사용자 제스처 동의가 필요하며 Safari 등 미지원 브라우저에서는 표준 PointerEvent + 키보드 단축키로 100% 동일 조작을 유지합니다.", "WebHID and WebMIDI require explicit user permission and Chromium support; Safari and fallback browsers keep 100% parity through PointerEvents and keyboard shortcuts."),
    speakerNotes: bi("펜이 화면을 따라오지 못하면 어떤 고급 기능도 소용없습니다. 14비트 16,384단계 PCHIP 필압과 75파라미터 Micro-MLP 예측, 그리고 별도 드라이버 없이 왼손 다이얼을 붙이는 WebHID가 웹 스튜디오의 손맛을 완성합니다.", "Nothing matters if ink lags behind the stylus. 14-bit PCHIP curves, a 75-parameter deterministic Micro-MLP, and driverless WebHID dials close the gap between web and native."),
    repoPaths: ["apps/web/src/domains/creator/stylus-neural-compensation/stylus-neural-compensation-engine.ts", "apps/web/src/domains/creator/pro-digitizer-hid-engine/pro-digitizer-engine.ts", "apps/web/src/domains/creator/drawing/studio-webhid-left-hand-device.ts", "apps/web/src/domains/creator/apple-galaxy-hardware/apple-galaxy-ecosystem-engine.ts"],
  },
  {
    id: "atelier-cast-stage-3d-cad-audio", slideNumber: 8, status: "current",
    sectionTag: bi("08 · 3D 캐릭터 · CAD · 공간 오디오", "08 · 3D VRM, CAD & Spatial Audio"),
    brandSystem: "AtelierCast · AtelierStage · AtelierSolid",
    title: bi("AtelierCast/Stage/Solid: VRM 듀얼 쿼터니언 · 15관절 FABRIK IK · Verlet · 3D LT 선화 · 솔리드 CAD · HRTF 오디오", "AtelierCast/Stage/Solid: VRM Dual-Quaternion, 15-Joint FABRIK IK, Verlet, 3D LT, CAD & HRTF Audio"),
    summary: bi("Rust SIMD128 4본 스키닝·Morton BVH, 15관절 손·팔 FABRIK IK, 머리카락/옷감 Verlet 물리, G-Buffer 3D LT 선화 추출, 파라메트릭 솔리드 CAD, 3D HRTF 바이노럴 공간 오디오 DSP를 한 웹 워크스페이스에 통합했습니다.", "Integrates Rust SIMD128 4-bone skinning and Morton BVH, 15-joint FABRIK IK, Verlet hair/cloth physics, G-Buffer 3D LT line extraction, parametric solid CAD, and 3D HRTF binaural audio DSP."),
    spritePath: "/assets/studio/vibrant-sprites/emblem-bg3d-stage.webp",
    spriteAlt: bi("AtelierStage 3D 배경 및 VRM 캐릭터 스테이지 엠블럼", "AtelierStage 3D background and VRM character emblem"),
    diagramTitle: bi("VRM 리깅/IK/Verlet → Morton BVH & 솔리드 CAD → 3D LT 선화 → HRTF 공간 오디오", "VRM Rig/IK/Verlet -> Morton BVH & Solid CAD -> 3D LT Lines -> HRTF Audio"),
    diagramNodes: [
      dn("CAST", "VRM 스키닝 · FABRIK IK", "VRM Skin & FABRIK IK", "듀얼 쿼터니언 · 15관절", "Dual-quat · 15 joints", "accent"),
      dn("PHYSICS", "Verlet · Morton BVH", "Verlet & Morton BVH", "옷감 충돌 · 고속 가속구조", "Cloth sim & fast BVH", "cool"),
      dn("STAGE", "3D LT 선화 · 솔리드 CAD", "3D LT & Solid CAD", "능선/법선/깊이 선화", "Ridge/normal/depth ink", "good"),
      dn("AUDIO", "HRTF 바이노럴 DSP", "HRTF Binaural DSP", "3D 공간 폴리 음향", "3D spatial foley", "warn"),
    ],
    whyChosen: bi("웹툰 작가가 포즈·배경·소품·효과음을 위해 3~4개 유료 3D/CAD/오디오 앱을 오가면 파일 변환만으로 반나절이 사라집니다. 핵심 3D 기하와 LT 선화를 브라우저 코어에 내재화해 컷 연출 속도를 높였습니다.", "Jumping across 3-4 paid 3D, CAD, and audio apps drains production hours on exports. Embedding core rigging, CAD, LT line extraction, and spatial foley directly inside the studio removes context switches."),
    whereUsed: bi("캐릭터 VRM 포저(손가락·전신 IK), 3D 배경 스테이지 LT 선화 추출, 건축·소품 파라메트릭 CAD 워크벤치, 가상 작업실·무빙툰 HRTF 공간 사운드에서 작동합니다.", "Runs in the VRM character poser, 3D background LT lineart extractor, parametric prop CAD workbench, and virtual studio/animatic HRTF soundstage."),
    reusePlaybook: bi("웹 기반 제품 컨피규레이터, 버추얼 유튜버/아바타 스튜디오, 온라인 건축/인테리어 뷰어, 메타버스 공간 음향 회의실로 확장할 수 있습니다.", "Reusable for web product configurators, VTuber/avatar studios, browser interior/CAD viewers, and spatial-audio virtual venues."),
    plainBackground: bi("듀얼 쿼터니언은 관절을 꺾어도 팔꿈치나 손목이 캔디 포장지처럼 찌그러지지 않게 지키는 회전 수학이고, FABRIK은 손끝 위치만 끌면 어깨와 팔꿈치가 자연스럽게 따라오게 풀어 주는 역기구학 알고리즘입니다.", "Dual-quaternion skinning stops joints from collapsing like twisted candy wrappers, while FABRIK lets you drag a fingertip and automatically bends the wrist, elbow, and shoulder naturally."),
    tradeoff: bi("복잡한 대규모 3D 씬 전체를 메인 번들에 넣으면 첫 화면이 느려지므로, 3D·VRM·CAD 모듈은 진입 그래프 게이트(`check:studio-eager-graph`)로 지연 로딩을 강제하고 무거운 모델링은 Blender GLB/VRM 왕복 경로와 공존합니다.", "Loading heavy 3D upfront would bloat initial startup, so `check:studio-eager-graph` enforces lazy loading for 3D/VRM/CAD modules while maintaining GLB/VRM round-trips with Blender."),
    speakerNotes: bi("웹툰 실무에서는 캐릭터 포즈와 건물 투시가 매주 발목을 잡습니다. 15관절 FABRIK IK, 3D LT 선화 추출, 솔리드 CAD, 그리고 공간 오디오까지 지연 로딩 경계 뒤에 깔끔하게 격리해 필요할 때만 즉시 꺼내 씁니다.", "Poses and architectural perspective are weekly bottlenecks. We keep FABRIK IK, 3D LT line extraction, solid CAD, and HRTF audio cleanly lazy-loaded so startup stays light while power is one click away."),
    repoPaths: ["crates/studio-wasm64-drawing-core/src/simd_bvh_skinning_kernel.rs", "crates/studio-wasm64-drawing-core/src/virtual_3d_physics_kernel/fabrik.rs", "crates/studio-wasm64-drawing-core/src/virtual_3d_physics_kernel/verlet.rs", "apps/web/src/domains/creator/bg3d/studio-bg3d-lt-line-ridge.ts", "apps/web/src/domains/creator/shapr3d-parametric-cad/shapr3d-cad-engine.ts", "apps/web/src/domains/creator/virtual-space-spatial/spatial-binaural-graph.ts"],
  },
  {
    id: "giga-canvas-opfs-webcodecs", slideNumber: 9, status: "current",
    sectionTag: bi("09 · 기가 캔버스 & 4K 로컬 인코딩", "09 · Giga-Canvas & 4K Encoding"),
    brandSystem: "LoomSync · PrismRender",
    title: bi("LoomSync/PrismRender: Morton 가상 타일링 · OPFS 3단 스왑 · 무손실 RLE-Delta · WebCodecs 4K 60fps", "LoomSync/PrismRender: Morton Virtual Tiling, 3-Tier OPFS Swap, Lossless RLE-Delta & WebCodecs 4K"),
    summary: bi("세로 100컷 웹툰과 16K~32K 일러스트를 256×256 Morton(Z-Order) 희소 타일과 3계층(VRAM Hot · RAM Warm · OPFS Cold) 가상 메모리로 스와핑하고, 무손실 RLE-Delta(FNV-1a 0-diff) 압축과 브라우저 로컬 WebCodecs 4K 60fps 인코딩을 연결합니다.", "Swaps 100-panel vertical comics and 16K-32K illustrations across VRAM/RAM/OPFS using 256x256 Morton sparse tiles, lossless RLE-Delta compression (FNV-1a 0-diff), and local WebCodecs 4K 60fps export."),
    spritePath: "/assets/studio/vibrant-sprites/tech-remotion.webp",
    spriteAlt: bi("PrismRender WebCodecs 및 Remotion 영상 파이프라인 그래픽", "PrismRender WebCodecs and Remotion video pipeline graphic"),
    diagramTitle: bi("256×256 Morton 희소 타일 → 3계층 VRAM/RAM/OPFS LRU-K → 무손실 RLE-Delta → WebCodecs MP4", "256x256 Morton Tiles -> 3-Tier VRAM/RAM/OPFS LRU-K -> Lossless RLE-Delta -> WebCodecs MP4"),
    diagramNodes: [
      dn("INDEX", "Morton Z-Order 타일", "Morton Z-Order Tiles", "MIP 0..6 · 0B 빈 타일", "MIP 0..6 · 0B empty CoW", "cool"),
      dn("SWAP", "3단 가상 메모리 스왑", "3-Tier Virtual Swap", "VRAM / RAM / OPFS Cold", "VRAM / RAM / OPFS Cold", "accent"),
      dn("CODEC", "무손실 RLE-Delta", "Lossless RLE-Delta", "FNV-1a 0-diff 검증", "FNV-1a 0-diff verified", "good"),
      dn("EXPORT", "WebCodecs · Remotion", "WebCodecs & Remotion", "AV1/HEVC/H.264 로컬 출력", "AV1/HEVC/H.264 local", "warn"),
    ],
    whyChosen: bi("세로 800×80,000px 웹툰 원고 한 편을 단일 텍스처로 올리면 브라우저 탭이 즉시 OOM으로 종료됩니다. 빈 영역은 0바이트 센티널로 두고 화면 밖 타일은 OPFS 디스크로 자동 퇴거하며, 숏폼 영상도 서버 렌더비 없이 사용자 기기에서 직접 인코딩합니다.", "Allocating an 800x80,000px webtoon as one bitmap crashes tabs with OOM. Keeping blank tiles at 0 bytes, swapping cold tiles to OPFS, and encoding reels locally via WebCodecs eliminates both OOM crashes and cloud render bills."),
    whereUsed: bi("100컷 세로 스크롤 웹툰 편집기, 16K/32K 표지 캔버스, 타임랩스·무빙툰 릴스/쇼츠 내보내기, OPFS 로컬 자동 저장 엔진에서 동작합니다.", "Runs inside the 100-panel webtoon editor, 16K/32K cover canvases, timelapse/moving-toon reels exporter, and OPFS autosave."),
    reusePlaybook: bi("초고해상도 위성·병리 슬라이드 뷰어, 웹 포토/영상 편집기, 대용량 타임랩스 생성기, 브라우저 로컬 녹화·편집 SaaS에 그대로 활용할 수 있습니다.", "Ideal for gigapixel pathology or satellite viewers, browser photo/video suites, timelapse generators, and zero-server-cost media SaaS."),
    plainBackground: bi("도서관 책 수만 권을 책상 위에 다 펼치지 않고 지금 읽는 페이지만 손에 들고, 방금 본 책은 옆 선반(RAM)에, 안 보는 책은 서고(OPFS)에 압축 보관하는 가상 책상 기술입니다.", "Instead of piling ten thousand books on one desk, you hold only the active page in VRAM, recent pages in RAM, and archive the rest compressed in OPFS storage."),
    tradeoff: bi("실제 `Uint8ClampedArray` RLE-Delta 압축·복원 0-diff와 OPFS 파일시스템 어댑터는 검증 완료됐으며, WebCodecs 하드웨어 AV1/HEVC 가속은 기기 코덱 지원에 따라 H.264 또는 WebM 폴백 체인으로 안전 강등합니다.", "In-memory lossless RLE-Delta 0-diff verification and OPFS adapters are verified today; WebCodecs hardware AV1/HEVC automatically cascades to H.264 or WebM fallbacks based on device codecs."),
    speakerNotes: bi("기가 캔버스와 로컬 4K 인코딩은 툰스튜디오 단위경제의 핵심입니다. 대용량 원고 스왑과 릴스 영상 인코딩을 사용자 기기의 OPFS와 WebCodecs로 처리하면, 서버 GPU 비용 없이도 ₩0 베타를 지속할 수 있습니다.", "Giga-canvas swapping and local WebCodecs export are the backbone of our unit economics: offloading tile storage and video encoding to OPFS and local hardware avoids server GPU bills."),
    repoPaths: ["apps/web/src/domains/creator/giga-canvas-virtual-swap/giga-canvas-swap-engine.ts", "apps/web/src/domains/creator/giga-canvas-virtual-swap/giga-canvas-tile-codec.ts", "apps/web/src/domains/creator/webcodecs-opfs-engine/webcodecs-reels-encoder.ts", "apps/web/src/domains/creator/studio-opfs-filesystem.ts"],
  },
  {
    id: "distributed-hlc-crdt-sqlite", slideNumber: 10, status: "expanding",
    sectionTag: bi("10 · 분산 CRDT & 오프라인 무결성", "10 · Distributed CRDT & Offline"),
    brandSystem: "LoomSync",
    title: bi("LoomSync: 분산 HLC CRDT 타일 병합 · 24-순열 수렴 검증 · SQLite WASM+OPFS 크래시 복구", "LoomSync: Distributed HLC CRDT Tile Merge, 24-Permutation Convergence & SQLite WASM+OPFS Recovery"),
    summary: bi("하이브리드 논리 시계(HLC) 전순서와 256×256 타일 단위 CRDT Op-Log로 4인 협업(메인·선화·채색·식자) 시 4!=24가지 네트워크 도착 순열에서도 동일 상태로 수렴하는 것을 검증하고, SQLite WASM+OPFS 자가치유 저널로 오프라인 크래시를 복구합니다.", "Orders concurrent strokes across 4 studio roles via Hybrid Logical Clocks (HLC) and 256x256 tile CRDT op-logs—verifying identical convergence across all 4!=24 arrival permutations—backed by crash-resilient SQLite WASM+OPFS journals."),
    spritePath: "/assets/studio/vibrant-sprites/emblem-community.webp",
    spriteAlt: bi("LoomSync 실시간 팀 협업 및 오프라인 동기화 엠블럼", "LoomSync team collaboration and offline sync emblem"),
    diagramTitle: bi("로컬 SQLite+OPFS 저널 → HLC 타임스탬프 부여 → 256×256 타일 CRDT 병합 → 24-순열 동일 해시", "Local SQLite+OPFS Journal -> HLC Stamp -> 256x256 Tile CRDT Merge -> 24-Perm Parity"),
    diagramNodes: [
      dn("LOCAL DB", "SQLite WASM + OPFS", "SQLite WASM + OPFS", "크래시 자가치유 복구", "Self-heal crash recovery", "good"),
      dn("CLOCK", "HLC 하이브리드 시계", "Hybrid Logical Clock", "물리시간+논리+노드 전순서", "Physical+Logical+Node", "cool"),
      dn("MERGE", "타일 LWW/Op-Log CRDT", "Tile LWW/Op-Log CRDT", "24-순열 해시 일치", "24-perm hash equality", "accent"),
      dn("SYNC", "오프라인 큐 · P2P", "Offline Queue & P2P", "재접속 델타 재동기화", "Reconnect delta sync", "warn"),
    ],
    whyChosen: bi("웹툰 팀 작업에서 파일 덮어쓰기('최종_진짜최종_수정2.clip') 사고는 가장 뼈아픈 손실입니다. 중앙 잠금 없이도 오프라인에서 각자 그린 뒤 합칠 때 충돌을 결정론적으로 수렴시키는 HLC+CRDT와 로컬 SQLite 정본을 선택했습니다.", "Overwriting shared files ('final_v2_real.clip') costs teams hours of rework. Combining local SQLite+OPFS authority with HLC tile CRDTs eliminates file locks and guarantees deterministic offline merges."),
    whereUsed: bi("메인 작가·어시스턴트·채색·식자 동시 작업, 오프라인 편집 후 재접속 충돌 해결기, 스튜디오 크래시 복구·OPFS 중복 제거 자가치유 엔진에 적용됩니다.", "Powers multi-role studio collaboration, offline conflict resolution panels, and OPFS self-healing crash recovery."),
    reusePlaybook: bi("오프라인 우선 현장 점검 앱, 다중 사용자 디자인·문서 협업 툴, 분산 화이트보드, 저대역폭 모바일 팀 메모장에 동일 HLC+OPFS 구조를 그대로 재사용할 수 있습니다.", "Reusable in offline-first field inspection apps, multi-user design/document editors, and low-bandwidth collaborative mobile tools."),
    plainBackground: bi("네 사람이 각자 다른 순서로 포스트잇 메모를 받아도, 모든 메모에 정확한 순번 규칙(HLC)이 찍혀 있어서 결국 네 사람 책상에 똑같은 결과물이 완성되는 합의 수학입니다.", "Even when four teammates receive sticky notes in different orders, deterministic HLC stamps ensure everyone ends up with the exact same board."),
    tradeoff: bi("현재 구현은 HLC 전순서·타일 CRDT 24-순열 수렴 검증·OPFS 자가치유·Yjs 컴팩션 테스트까지 완비돼 있으며, 대규모 실전 WebRTC P2P 다중 룸 중계는 Cloudflare Durable Objects와 함께 점진 확장 중입니다.", "HLC total ordering, 24-permutation tile CRDT convergence checks, OPFS self-heal, and Yjs compaction tests are verified now; scaled live WebRTC P2P relay expands alongside Cloudflare Durable Objects."),
    speakerNotes: bi("협업에서 제일 무서운 건 네트워크가 끊겼을 때 작업이 날아가는 상황입니다. LoomSync는 로컬 SQLite WASM+OPFS를 정본으로 삼고, 재접속 시 HLC 기반 타일 CRDT가 도착 순서와 무관하게 24가지 순열을 동일 해시로 수렴시킵니다.", "The scariest collaboration failure is losing hours when Wi-Fi drops. LoomSync keeps SQLite WASM+OPFS as local authority and merges reconnected tile deltas identically across all 24 arrival orders."),
    repoPaths: ["apps/web/src/domains/creator/distributed-crdt-tile-sync/crdt-tile-sync-engine.ts", "apps/web/src/domains/creator/offline-conflict-crdt/hlc-vector-clock.ts", "apps/web/src/domains/creator/storage/studio-opfs-self-heal-engine.ts", "apps/web/src/domains/creator/sync-timemachine-os/delta-sync-offline-engine.ts"],
  },
  {
    id: "ai-assist-part1-director-guard", slideNumber: 11, status: "current",
    sectionTag: bi("11 · AI 보조·어시스턴트 ①", "11 · AI Assist & Director (1/2)"),
    brandSystem: "AtelierStage · KilnExport",
    title: bi("AI 보조 ①: ₩0 Fail-Closed AI 라우터 · 웹툰 콘티 디렉터 · 연속성 & 작화 붕괴 가드", "AI Assist 1: Zero-Bill Fail-Closed Router, Comic Director, Continuity & Drift Guard"),
    summary: bi("유료 모델 호출을 네트워크 전에 차단하는 ₩0 Fail-Closed 다중 무료 AI 라우터, 웹툰 콘티·연출 디렉터, 1~60컷 소품/반전/ΔE00/광원 연속성 감시관, 화차 간 설정집 비율 흔들림 교정 코치로 작가의 반복 검수 노동을 줄입니다.", "Cuts repetitive comic QA with a Fail-Closed KRW 0 free-AI cascade router, webtoon storyboard director, 1-60 panel continuity guard (props/flip/DeltaE00/lighting), and cross-cut model-sheet drift coach."),
    spritePath: "/assets/studio/vibrant-sprites/tool-ai-compass.webp",
    spriteAlt: bi("AI 콘티 디렉터 및 원고 연속성 감시 나침반 아이콘", "AI comic director and continuity guard compass icon"),
    diagramTitle: bi("₩0 화이트리스트 라우터 → 콘티/컷 디렉터 → 4대 연속성 감사 → Top-3 비파괴 교정", "Zero-Bill Whitelist Router -> Comic Director -> 4-Axis Audit -> Top-3 Non-Destructive Fix"),
    diagramNodes: [
      dn("COST GUARD", "Zero-Bill ₩0 라우터", "Zero-Bill Router", "90% 안전선 · UTC 컷오프", "90% cap · UTC cutoff", "good"),
      dn("DIRECTOR", "웹툰 콘티 디렉터", "Comic Director", "컷 리듬 · 대사 연출", "Panel pacing & beats", "accent"),
      dn("QA GUARD", "4대 연속성 감시관", "4-Axis Continuity", "소품·반전·ΔE00·광원", "Props/Flip/dE00/Light", "cool"),
      dn("DRIFT", "설정집 비율 코치", "Model Sheet Drift", "등신·눈간격 Top-3 교정", "Ratio/eyes Top-3 fix", "warn"),
    ],
    whyChosen: bi("AI가 작가 대신 그림을 덮어쓰는 방식은 창작 주권을 해치고 API 과금 폭탄 위험을 낳습니다. ₩0 상한을 코드로 잠그고, 작가가 가장 피곤해하는 60컷 연속성·작화 붕괴 검수만 비파괴 제안으로 돕는 방향을 택했습니다.", "Overwriting an artist's drawing with opaque AI hurts creative ownership and risks runaway API bills. We lock costs at KRW 0 fail-closed and focus AI on exhausting 60-panel continuity and model-sheet QA."),
    whereUsed: bi("API 무료 AI 캐스케이드 라우터, 스튜디오 AI 콘티 디렉터 패널, 1~60컷 원고 자동 연속성 감시관, 화차 간 설정집 작화 흔들림 코치에 구현돼 있습니다.", "Implemented in the API zero-bill router, studio AI comic director, 1-60 panel continuity guard, and cross-cut model-sheet drift coach."),
    reusePlaybook: bi("SaaS 무료 티어 LLM 비용 폭주 차단 게이트웨이, 영상/게임 스토리보드 검수기, 브랜드 디자인 QA 자동 감시, 전자상거래 상품 이미지 일관성 검사에 바로 적용할 수 있습니다.", "Directly reusable as a fail-closed LLM cost firewall, animation/game storyboard QA linter, or e-commerce visual consistency checker."),
    plainBackground: bi("예산 상한을 넘길 것 같으면 자동으로 지갑을 닫아 버리는 '안전금고형 AI 배차반'과, 이전 컷에 있던 안경이 사라지거나 옷 색깔이 바뀐 실수를 짚어 주는 '꼼꼼한 편집부 교정 어시스턴트'입니다.", "Think of a fail-safe dispatcher that locks the wallet before any paid call fires, paired with a sharp copy-editor catching missing glasses or shifted jacket colors across 60 panels."),
    tradeoff: bi("무료 공급자 쿼터가 모두 소진되면 유료 전환 대신 정직하게 차단(Fail-Closed)하고 온디바이스 결정론 검수 모드로 동작합니다. 교정 패치는 항상 작가가 미리보기 후 승인해야 반영됩니다.", "When free provider quotas exhaust, the router fails closed instead of silently billing and falls back to local deterministic checks. Every fix requires explicit creator preview and approval."),
    speakerNotes: bi("AI 어시스턴트의 첫 번째 자랑거리는 '비용 통제와 작가 주권'입니다. 유료 모델은 네트워크 호출 전에 막고, 60컷에서 안경이 사라지거나 가르마가 뒤집힌 실수를 CIEDE2000 색차와 설정집 비율 수식으로 찾아내 비파괴 교정안을 제안합니다.", "Our first AI highlight is cost safety plus artist sovereignty: paid models are blocked before any request leaves the server, while deterministic continuity and drift guards spot missing props and proportion shifts non-destructively."),
    repoPaths: ["apps/api/src/modules/studio-ai/studio-free-ai-zero-bill-router.ts", "apps/api/src/modules/studio-ai/studio-ai-comic-director.service.ts", "apps/web/src/domains/creator/webtoon-continuity-guard/webtoon-continuity-guard.ts", "apps/web/src/domains/creator/crosscut-modelsheet-drift-coach/modelsheet-drift-engine.ts"],
  },
  {
    id: "ai-assist-part2-ondevice-coach", slideNumber: 12, status: "current",
    sectionTag: bi("12 · AI 보조·어시스턴트 ②", "12 · AI Assist & On-Device Coach (2/2)"),
    brandSystem: "AtelierCast · AtelierInk · ToonSilicon",
    title: bi("AI 보조 ②: 로컬 NPU 안료 디렉터 · 음성→말풍선 · 포즈/표정/카메라 180° 코치 · 스타일 DNA", "AI Assist 2: On-Device Pigment Director, Voice-to-Balloon, Pose/Expression/180-deg Coach & Style DNA"),
    summary: bi("외부 API 없이 온디바이스로 동작하는 8-밴드 KM 안료 디렉터, 0-겹침 14~18자 음성→말풍선 조판기, 한글 중성 분해 VRM 비젬·표정/포즈 어드바이저, 180° 액션 축 카메라 코치, 17³ 3D LUT 스타일 DNA 잠재 스토리보드를 한 세트로 제공합니다.", "Ships a zero-API on-device suite: 8-band KM pigment director, zero-overlap 14-18 char voice-to-balloon typesetter, Hangul-vowel VRM viseme/pose advisor, 180-deg action-axis camera coach, and 17^3 3D LUT Style DNA harmonizer."),
    spritePath: "/assets/studio/vibrant-sprites/innov-neural-memory.webp",
    spriteAlt: bi("온디바이스 AI 안료·표정·카메라·스타일 DNA 코치 그래픽", "On-device AI pigment, expression, camera and Style DNA graphic"),
    diagramTitle: bi("로컬 안료·색조 DNA → 음성 운율 말풍선 → 포즈/한글 비젬 표정 → 180° 카메라 앵글", "Local Pigment & Style DNA -> Voice Balloon -> Pose & Viseme -> 180-deg Camera"),
    diagramNodes: [
      dn("COLOR", "안료 & 스타일 DNA", "Pigment & Style DNA", "8-밴드 KM · 17³ 3D LUT", "8-band KM · 17^3 3D LUT", "accent"),
      dn("VOICE", "음성 → 말풍선 조판", "Voice-to-Balloon", "0-겹침 · 14~18자 keep-all", "0-overlap · 14-18 chars", "good"),
      dn("ACTING", "포즈 · 한글 비젬 표정", "Pose & Hangul Viseme", "8감정 · VRM 11블렌드", "8 emotions · 11 VRM shapes", "cool"),
      dn("CAMERA", "180° 카메라 코치", "180-deg Camera Coach", "액션 축 월선 자동 경고", "Action-axis cross guard", "warn"),
    ],
    whyChosen: bi("외부 클라우드 AI에 매 컷 원고를 올리면 보안 우려와 지연이 커집니다. 말풍선 배치, 한글 입모양 비젬, 180° 카메라 법칙, 3D LUT 화풍 일치화처럼 수학·규칙과 경량 추론으로 풀 수 있는 영역을 100% 온디바이스 결정론 엔진으로 내재화했습니다.", "Uploading unpublished episodes to cloud AI creates privacy risk and latency. Solving balloon layout, Hangul visemes, the 180-deg camera rule, and 3D LUT style matching deterministically on-device gives instant, private feedback."),
    whereUsed: bi("채색 안료 추천 패널, 대사→말풍선 자동 조판, AI 포즈·표정 어드바이저, 180° 카메라 프레이밍 코치, 화풍 DNA 3D LUT 보정기에서 작동합니다.", "Active in the pigment director, voice-to-balloon typesetter, pose/expression advisor, 180-deg framing coach, and latent Style DNA harmonizer."),
    reusePlaybook: bi("한국어 자막·카드뉴스 자동 조판, 3D 아바타 실시간 립싱크, 영화/영상 콘티 180° 편집 검수기, 사진·영상 3D LUT 컬러 그레이딩 웹앱에 그대로 이식할 수 있습니다.", "Reusable in Korean caption/social-card auto-layout, 3D avatar lip-sync, film storyboard 180-deg checkers, and browser 3D LUT color graders."),
    plainBackground: bi("대사를 읽으면 한글 모음('아·이·우·에·오')을 분해해 캐릭터 입모양을 맞추고, 두 인물이 대화할 때 카메라가 선을 넘어 방향이 헷갈리지 않게(180° 법칙) 고스트 가이드로 짚어 주는 온디바이스 조감독입니다.", "It acts like a local assistant director—splitting Korean vowels to match mouth shapes, spacing speech bubbles without overlap, and warning when a camera cut crosses the 180-degree sightline."),
    tradeoff: bi("결정론적 규칙·색공간 연산 기반 모듈은 오프라인에서 즉시 0원으로 작동하며, 외부 생성형 포즈 렌더링(`ai-pose-guide` ControlNet 어댑터)은 계약 모델만 로컬에 두고 외부 추론 연동 시 별도 명시 동의를 받습니다.", "Local math and rule engines run instantly offline at zero cost, whereas optional external ControlNet pose rendering (`ai-pose-guide`) stays strictly separated behind explicit typed contracts."),
    speakerNotes: bi("두 번째 AI 자랑거리는 '서버 호출 0건 온디바이스 어시스턴트'입니다. 한글 음절 중성 분해로 VRM 입모양을 추론하고, 17³ 3D LUT로 기준 컷의 화풍 DNA를 추출해 ΔE00 색차를 줄이는 전 과정이 브라우저 안에서 결정론적으로 돌아갑니다.", "Our second AI highlight runs completely on-device with zero external API calls: Hangul vowel decomposition drives VRM visemes, voice prosody lays out zero-overlap bubbles, and 17^3 3D LUTs harmonize style DNA locally."),
    repoPaths: ["apps/web/src/domains/creator/webnn-pigment-director/kubelka-munk-optics.ts", "apps/web/src/domains/creator/voice-to-balloon-layout/voice-to-balloon-engine.ts", "apps/web/src/domains/creator/ai-pose-guide/ai-pose-guide-model.ts", "apps/web/src/domains/creator/char-expression-pose-advisor/char-expression-pose-engine.ts", "apps/web/src/domains/creator/camera-framing-continuity-coach/camera-framing-coach-engine.ts", "apps/web/src/domains/creator/ai-latent-storyboard/latent-style-harmonizer.ts"],
  },
  {
    id: "human-trust-provenance-security", slideNumber: 13, status: "current",
    sectionTag: bi("13 · 인간 창작 신뢰 & 다층 보안", "13 · Provenance & Security"),
    brandSystem: "KilnExport",
    title: bi("KilnExport: 인간 작화 머클 원장 · Rights BOM 차단 · AI 학습 동의 · CodeQL/Secretlint/SHA 검증", "KilnExport: Human-Ink Merkle Ledger, Rights BOM Gate, AI Consent & CodeQL/Secretlint/SHA Gates"),
    summary: bi("1바이트·1ms 변조를 즉각 탐지하는 FNV-1a 64-bit 이진 머클 원장, 비상업·미확인 소재 1건만 섞여도 납품을 멈추는 Fail-Closed Rights BOM, AI 학습 동의 가드, CodeQL·Secretlint·승인 SHA 배포 검증까지 창작 신뢰와 보안을 다층으로 잠급니다.", "Protects creator trust end-to-end with a 1-byte/1ms tamper-detecting FNV-1a 64-bit Merkle ledger, Fail-Closed Rights BOM commercial gate, AI training consent badges, plus CodeQL, Secretlint, and SHA-locked deploy verification."),
    spritePath: "/assets/studio/vibrant-sprites/innov-rights-ledger.webp",
    spriteAlt: bi("KilnExport 인간 작화 머클 원장 및 Rights BOM 신뢰 인장", "KilnExport human-ink Merkle ledger and Rights BOM seal"),
    diagramTitle: bi("작화 스트로크 머클 트리 → Rights BOM 라이선스 검증 → AI 학습 동의 → CodeQL·Secretlint·SHA 배포", "Stroke Merkle Tree -> Rights BOM Gate -> AI Training Consent -> CodeQL/Secretlint/SHA"),
    diagramNodes: [
      dn("MERKLE", "인간 작화 머클 원장", "Human-Ink Merkle", "1B/1ms 변조 즉시 탐지", "1B/1ms tamper detect", "accent"),
      dn("RIGHTS", "Fail-Closed Rights BOM", "Fail-Closed Rights BOM", "오염 소재 1건 시 출고 차단", "Blocks any tainted asset", "good"),
      dn("CONSENT", "AI 학습 동의 가드", "AI Training Consent", "작품별 명시 Opt-Out", "Explicit per-work opt-out", "cool"),
      dn("DEVSEC", "CodeQL · Secretlint · SHA", "CodeQL / Secretlint / SHA", "40자 SHA 일치 배포 검증", "40-char SHA deploy gate", "warn"),
    ],
    whyChosen: bi("AI 생성물 논란과 유료 폰트·브러시 라이선스 분쟁은 작가와 연재 플랫폼 모두에게 치명적입니다. 출고 직전에 라이선스 오염을 자동 차단하고, 작품 제작 이력과 코드 배포 무결성을 기계 검증으로 남기도록 설계했습니다.", "Unverified AI claims and font/brush license disputes put both creators and publishers at legal risk. Automating pre-export Rights BOM checks, provenance logs, and SHA-verified deploys prevents surprises before release."),
    whereUsed: bi("상업 납품 패키지 생성 전 Rights BOM 검증기, 인간 작화 머클 원장 패널, 작품 공개 시 AI 학습 동의 배지, GitHub Actions CodeQL·Secretlint·배포 프리플라이트 게이트에서 실행됩니다.", "Enforced in pre-export Rights BOM validation, the human-ink ledger panel, publication AI-consent badges, and CI CodeQL/Secretlint/deploy preflight gates."),
    reusePlaybook: bi("출판·광고 에이전시 에셋 라이선스 검수 시스템, 보도 사진 진위 이력 원장, 음원/영상 저작권 정산 BOM, 엔터프라이즈 CI/CD 공급망 보안 파이프라인에 그대로 적용할 수 있습니다.", "Adaptable to agency asset-licensing gates, photojournalism provenance ledgers, music/video royalty BOMs, and hardened CI/CD release pipelines."),
    plainBackground: bi("식품 원재료 표기(BOM)처럼 웹툰 한 화에 들어간 글꼴·브러시·3D 배경의 상업 사용 허가증을 출고 전에 전수 확인하고, 지문 체인(머클 트리)으로 중간 수정 여부를 바로 잡아내는 안전 검역소입니다.", "Like food ingredient labels, Rights BOM audits every font, brush, and 3D prop before commercial export while a Merkle fingerprint chain spots any single-byte edit immediately."),
    tradeoff: bi("현재 `human-ink-ledger-engine.ts`는 자가 신고 표본의 로컬 결정론적 FNV-1a 64-bit 머클 미리보기 원장이며, 외부 공인 X.509 인증서 기반 정식 C2PA 암호 서명과 플랫폼 연동은 점진 확장 로드맵임을 문서와 UI에 정직하게 명시합니다.", "Currently `human-ink-ledger-engine.ts` provides a local deterministic FNV-1a 64-bit Merkle integrity preview; full external X.509 C2PA cryptographic signing is explicitly marked on the expanding roadmap."),
    speakerNotes: bi("창작 도구에서 신뢰는 기능 그 자체입니다. Rights BOM이 비상업 소재 1건만 섞여도 출고를 막아 주고, 머클 원장은 1바이트 변조를 즉시 적발합니다. 로컬 머클 미리보기와 외부 C2PA 정식 서명 경계도 과장 없이 분리했습니다.", "Trust is a core feature. Fail-closed Rights BOM blocks tainted commercial exports, our Merkle preview flags 1-byte tampering instantly, and we stay transparent about local preview versus external X.509 C2PA signing."),
    repoPaths: ["apps/web/src/domains/creator/human-ink-provenance-ledger/human-ink-ledger-engine.ts", "apps/web/src/domains/creator/delivery-pack/rights-bom-validator.ts", "apps/web/src/domains/creator/ai-training-consent/creator-ai-training-copy.ts", ".github/workflows/codeql.yml", "scripts/secretlint-files.mjs", "scripts/deployment-preflight.mjs"],
  },
  {
    id: "calm-chrome-ux-engineering", slideNumber: 14, status: "expanding",
    sectionTag: bi("14 · 디자인·UI/UX 엔지니어링", "14 · Design & UX Engineering"),
    brandSystem: "CalmChrome",
    title: bi("CalmChrome: 인지 부하 압축(6-핀 · 0-용어 검색) · 96% 풀블리드 크롬 · OKLCH/APCA · 촉각 HUD", "CalmChrome: 6-Pin Cognitive Compression, 96% Full-Bleed Chrome, OKLCH/APCA & Tactile HUD"),
    summary: bi("복잡한 전문 기능을 Calm 6-핀 + 0-용어 검색 + `<details>` 서랍 + 7번째 자동-핀으로 압축하고, 작업 단계별 적응형 크롬, 오비탈 휠, OKLCH→WCAG 2.2/APCA W3 Lc 대비 수학, 동심원 곡률 0px 오차, 풀블리드 페이드-어웨이 크롬을 설계합니다.", "Compresses complex pro tools via Calm 6-pins, zero-jargon search, `<details>` drawers, and 7th auto-pin, paired with phase-aware chrome, orbital radial wheels, OKLCH->WCAG 2.2/APCA contrast math, and concentric geometry."),
    spritePath: "/assets/studio/vibrant-sprites/emblem-studio.webp",
    spriteAlt: bi("CalmChrome 촉각 캔버스 및 인지 부하 압축 UI 엠블럼", "CalmChrome tactile canvas and calm UI emblem"),
    diagramTitle: bi("Calm 6-핀 + 0-용어 검색 → 단계별 5~7개 적응 크롬 → 오비탈 휠/5종 HUD → 82~96% 캔버스 면적", "Calm 6-Pin + Search -> Phase-Aware 5-7 Controls -> Orbital Wheel/HUD -> 82-96% Canvas"),
    diagramNodes: [
      dn("COMPRESS", "Calm 6-핀 · 서랍", "Calm 6-Pin & Drawer", "0-용어 검색 · 7번째 자동-핀", "0-jargon · 7th auto-pin", "accent"),
      dn("OPTICS", "OKLCH · APCA W3 Lc", "OKLCH & APCA W3 Lc", "바이올렛 0% · 동심원 0px", "0% violet · 0px radius gap", "good"),
      dn("DIRECT", "오비탈 휠 · 기즈모 HUD", "Orbital Wheel & HUD", "44px 터치 · 필름스트립", "44px touch · filmstrip", "cool"),
      dn("STAGE", "단계 적응 · 풀블리드", "Phase-Aware Full-Bleed", "현재 >=82% → 96% 확장", "Current >=82% -> 96%", "warn"),
    ],
    whyChosen: bi("기존 프로 드로잉 앱은 수십 개 패널이 캔버스를 가려 입문자를 압도합니다. Hick-Hyman 법칙과 Fitts의 법칙에 따라 화면당 핵심 컨트롤을 5~7개로 압축하고, 색각 이상과 고대비 환경까지 수식으로 검증하는 CalmChrome 원칙을 세웠습니다.", "Legacy creative apps bury the canvas under dozens of toolbars. Grounded in Hick-Hyman and Fitts's laws, CalmChrome trims visible controls to 5-7 per stage while verifying contrast mathematically."),
    whereUsed: bi("스튜디오 5대 프로 허브 Calm 내비게이터, 캔버스 오비탈 휠·엄지존 도크, 단계별 컨텍스트 단순화 오케스트레이터, Display-P3/APCA 말풍선 대비 검사기, `DESIGN.md` 9개 테마 토큰에 적용됩니다.", "Used across pro-hub Calm navigators, canvas orbital wheels and thumb-arc docks, phase-aware UI simplifiers, APCA balloon contrast checkers, and `DESIGN.md` themes."),
    reusePlaybook: bi("복잡한 B2B 어드민·ERP 대시보드, 금융 트레이딩 단말, 의료 기기 터치 UI, 모바일 콘텐츠 제작 앱의 '전문 기능 유지 + 인지 부하 60% 감축' 리디자인 패턴으로 재사용할 수 있습니다.", "High-leverage redesign pattern for complex B2B admin consoles, trading terminals, medical touch UIs, and mobile creation apps cutting cognitive load without removing power."),
    plainBackground: bi("비행기 조종석 버튼 100개를 한 번에 띄우지 않고 이륙·순항·착륙 단계에 꼭 필요한 6개만 꺼내 두고, 찾고 싶은 기능은 쉬운 말로 검색하면 바로 손에 잡히게 만드는 인터페이스 공학입니다.", "Instead of flashing 100 cockpit switches at once, the workspace surfaces only the 6 controls needed for sketching, inking, or coloring—with plain-language search for the rest."),
    tradeoff: bi("현재 구현은 캔버스 `>=82%` 점유, Calm 6-핀·0-용어 검색, 오비탈 휠, APCA 대비 엔진, 단계별 5~7개 컨트롤 압축까지 검증돼 있으며, 96% 풀블리드 페이드-어웨이 크롬·5종 촉각 시각 HUD·독자 폰뷰 PiP·공간 인식 햅틱 전면 통합은 고도화 로드맵으로 정직하게 구분합니다.", "Canvas >=82% viewport, Calm 6-pin search, orbital wheels, APCA math, and 5-7 control phase compression are live today; 96% fade-away chrome, 5 tactile HUDs, reader phone PiP, and spatial haptics are tracked on the active refinement roadmap."),
    speakerNotes: bi("기술이 아무리 좋아도 화면이 어지러우면 작가가 떠납니다. CalmChrome은 6-핀 압축, 0-용어 검색, OKLCH/APCA 대비 수학, 오비탈 휠을 현재 구현으로 검증하고, 96% 페이드-어웨이 크롬과 촉각 HUD 로드맵까지 단계별로 설계했습니다.", "Great engines fail if cluttered UI pushes creators away. CalmChrome proves 6-pin compression, zero-jargon search, APCA contrast math, and orbital wheels today while charting 96% fade-away chrome next."),
    repoPaths: ["apps/web/src/domains/creator/calm-intent-ux-orchestrator/calm-intent-ux-engine.ts", "apps/web/src/domains/creator/adaptive-calm-stack-guard/adaptive-calm-stack-engine.ts", "apps/web/src/domains/creator/canvas-orbital-ux/orbital-wheel-engine.ts", "apps/web/src/domains/creator/p3-color-dynamic-lighting/p3-color-gamut-engine.ts", "DESIGN.md"],
  },
  {
    id: "web-design-ui-platform-apis", slideNumber: 15, status: "current",
    sectionTag: bi("15 · 신규 웹 디자인·UI API", "15 · Modern Web Design APIs"),
    brandSystem: "CalmChrome",
    title: bi("신규 웹 디자인·UI 플랫폼 API: OKLCH/APCA · View Transitions · Speculation · Scroll-Driven · Anchor/Popover · @container · EyeDropper · 폴더블 · OffscreenCanvas", "Modern Web Design & UI APIs: OKLCH/APCA, View Transitions, Speculation, Scroll-Driven, Anchor/Popover, @container, EyeDropper, Foldable & OffscreenCanvas"),
    summary: bi("OKLCH 지각 색공간과 WCAG 2.2/APCA 대비 수학 위에 View Transitions, Speculation Rules, Scroll-Driven CSS, Popover+Anchor Positioning, `@container`/`@starting-style`, EyeDropper, 폴더블 Viewport Segments, OffscreenCanvas Worker Pool을 폴백과 함께 얹었습니다.", "Layers View Transitions, Speculation Rules, Scroll-Driven CSS, Popover + Anchor Positioning, `@container`/`@starting-style`, EyeDropper, foldable Viewport Segments, and OffscreenCanvas Worker Pools over OKLCH/APCA tokens with zero-break fallbacks."),
    spritePath: "/assets/studio/vibrant-sprites/emblem-guide-map.webp",
    spriteAlt: bi("차세대 웹 디자인 플랫폼 API 구성 지도", "Modern web design platform API map"),
    diagramTitle: bi("OKLCH/APCA 토큰 → 컴포지터 전환/스크롤 → Top-Layer Anchor/폴더블 → OffscreenCanvas 워커", "OKLCH/APCA Tokens -> Compositor Motion -> Top-Layer Anchor & Foldables -> OffscreenCanvas"),
    diagramNodes: [
      dn("COLOR", "OKLCH · WCAG/APCA", "OKLCH & WCAG/APCA", "9테마 · 원시색 0건", "9 themes · 0 raw colors", "good"),
      dn("MOTION", "View Transitions · Scroll", "View Transitions & Scroll", "180ms · reduced-motion 가드", "180ms · motion-safe", "accent"),
      dn("LAYOUT", "@container · Popover · 폴드", "@container, Popover & Fold", "Anchor · @starting-style", "Anchor & @starting-style", "cool"),
      dn("WORKER", "EyeDropper · OffscreenCanvas", "EyeDropper & Offscreen", "화면 밖 채집 · 워커 풀", "OS-wide pick · Worker pool", "warn"),
    ],
    whyChosen: bi("무거운 JS 애니메이션 라이브러리와 z-index 싸움 대신 브라우저가 GPU 컴포지터에서 직접 처리하는 최신 CSS/HTML 표준을 쓰면 번들 크기가 줄고 모션 감소·고대비 접근성도 일관되게 지켜집니다.", "Replacing heavy JS motion libraries and z-index hacks with native compositor CSS/HTML standards shrinks bundle size and guarantees consistent reduced-motion and high-contrast behavior."),
    whereUsed: bi("`/tech`·`/compare/studio` 탭 크로스페이드와 Speculation 프리페치, 스튜디오 Top-Layer 팝오버 툴바, 폴더블/모바일 반응형 셸, 브라우저 밖 레퍼런스 스포이드, 백그라운드 썸네일 OffscreenCanvas 워커에 적용돼 있습니다.", "Powers `/tech` and `/compare/studio` cross-fades and prefetching, top-layer studio popovers, foldable/responsive shells, OS-wide EyeDropper sampling, and OffscreenCanvas worker pools."),
    reusePlaybook: bi("마케팅 랜딩·이커머스·문서 포털·대시보드 등 어떤 현대 웹앱에도 `@supports` 점진 향상과 안전 폴백 패턴 그대로 도입해 체감 속도와 디자인 완성도를 높일 수 있습니다.", "Every modern SaaS, commerce site, or docs portal can adopt these `@supports` progressive-enhancement patterns to boost perceived speed without breaking older browsers."),
    plainBackground: bi("자바스크립트가 매 프레임 화면을 흔드는 대신 브라우저 기본 엔진에 전환·스크롤·팝업 위치 계산을 맡겨, 배터리와 CPU를 아끼면서 앱처럼 부드러운 화면을 구현합니다.", "Letting the browser's native compositor handle transitions, scroll reveals, and popover flipping delivers app-like fluidity while saving battery and CPU."),
    tradeoff: bi("최신 크롬 전용 기능(`anchor-name`, `speculationrules`, `EyeDropper`, `viewport.segments`)은 반드시 기능 감지(`CSS.supports`·`HTMLScriptElement.supports`)와 `prefers-reduced-motion` 가드를 거쳐 Safari·Firefox에서도 깨짐 없이 동작합니다.", "Chrome-leading APIs (`anchor-name`, `speculationrules`, `EyeDropper`, `viewport.segments`) always sit behind runtime feature detection and `prefers-reduced-motion` guards so Safari and Firefox stay 100% functional."),
    speakerNotes: bi("디자인 시스템도 엔지니어링입니다. 원시 hex 0건 OKLCH 토큰과 APCA 대비 수학을 ESLint로 강제하고, View Transitions·Scroll-Driven·Anchor Popover·@container·EyeDropper·OffscreenCanvas까지 전부 안전 폴백과 함께 실전 배치했습니다.", "Design systems are engineering too: ESLint enforces zero raw hex over OKLCH/APCA tokens, while View Transitions, Scroll-Driven CSS, Anchor Popovers, `@container`, EyeDropper, and OffscreenCanvas ship with zero-break fallbacks."),
    repoPaths: ["apps/web/src/domains/showcase/nextgen-web-platform-enhancer.ts", "apps/web/src/domains/showcase/showcase-nextgen-motion.css", "apps/web/src/app/styles/atelier-motion.css", "apps/web/src/app/styles/mobile-first-shell.css", "apps/web/src/domains/creator/p3-color-dynamic-lighting/p3-color-gamut-engine.ts"],
  },
  {
    id: "nextgen-web-runtime-apis", slideNumber: 16, status: "current",
    sectionTag: bi("16 · 차세대 웹 런타임 API 총망라", "16 · 10 Next-Gen Web Runtime APIs"),
    brandSystem: "ToonCore · SpectrumCompute · LoomSync",
    title: bi("차세대 웹 표준 런타임 API 10선 총망라: 설치 없는 네이티브급 브라우저 OS", "10 Next-Gen Web Platform APIs: A Zero-Install Browser Creative OS"),
    summary: bi("WebGPU · WebNN · OPFS · WebCodecs · Compute Pressure · WebHID · AudioWorklet · SharedArrayBuffer · View Transitions · Speculation Rules 10대 웹 표준을 단일 점진 향상 매트릭스로 묶어 설치 파일 없이 크로스플랫폼 제작 환경을 완성합니다.", "Synthesizes 10 modern standards—WebGPU, WebNN, OPFS, WebCodecs, Compute Pressure, WebHID, AudioWorklet, SharedArrayBuffer, View Transitions, and Speculation Rules—into one progressive zero-install creative platform."),
    spritePath: "/assets/studio/vibrant-sprites/emblem-benchmark.webp",
    spriteAlt: bi("차세대 웹 표준 플랫폼 10선 통합 엠블럼", "10 next-gen web platform standards emblem"),
    diagramTitle: bi("연산(WebGPU·WebNN·SAB) + I/O(OPFS·WebCodecs·WebHID·AudioWorklet) + 체감(Pressure·VT·Speculation)", "Compute (WebGPU/WebNN/SAB) + I/O (OPFS/WebCodecs/HID/Audio) + UX (Pressure/VT/Speculation)"),
    diagramNodes: [
      dn("COMPUTE", "WebGPU · WebNN · SAB", "WebGPU, WebNN & SAB", "GPU·NPU·멀티스레드", "GPU, NPU & threads", "accent"),
      dn("MEDIA/IO", "OPFS · WebCodecs · HID", "OPFS, WebCodecs & HID", "로컬 DB·4K·외부장치", "Local DB, 4K & HID", "good"),
      dn("AUDIO/THR", "AudioWorklet · Pressure", "AudioWorklet & Pressure", "실시간 폴리·열 거버너", "Realtime foley & thermal", "cool"),
      dn("FLOW", "View Transitions · Speculation", "View Transitions & Speculation", "즉각 전환·폴백 100%", "Instant nav & fallback", "warn"),
    ],
    whyChosen: bi("운영체제별 네이티브 설치 앱을 4개 플랫폼(macOS·Windows·iPadOS·Android)으로 따로 유지하면 개발 속도와 배포 주기가 급격히 느려집니다. 최신 W3C/WHATWG 웹 표준 10선을 계층화해 URL 한 줄로 전 기기에 즉시 배포합니다.", "Maintaining four separate native binaries slows shipping to a crawl. Layering 10 W3C/WHATWG web standards delivers instant cross-platform updates via a single URL."),
    whereUsed: bi("`/tech` 차세대 크롬 API 라이브 프로브, 스튜디오 capability probe 및 터보 프로파일 빌더, 크로스-리얼름 Memory64 워커, 전 페이지 프리페치·전환 시스템에 통합돼 있습니다.", "Integrated into the `/tech` live API probe, studio capability/turbo profile builder, cross-realm Memory64 workers, and sitewide prefetch/transitions."),
    reusePlaybook: bi("차세대 브라우저 IDE, 오디오/영상 제작 웹앱, 3D 협업 설계 도구, 오프라인 AI 워크스페이스의 표준 기술 선정 체크리스트와 폴백 매트릭스로 바로 채택할 수 있습니다.", "Serves directly as a production capability-and-fallback checklist for browser IDEs, web DAWs/NLEs, 3D collab tools, and offline AI workspaces."),
    plainBackground: bi("예전 웹 브라우저는 문서 뷰어였지만, 이제는 그래픽카드·AI 칩·하드디스크·영상 인코더·외부 조종기까지 안전하게 연결하는 미니 운영체제입니다. ToonStudio는 이 10개 표준을 빠짐없이 엮어 냅니다.", "Modern browsers are no longer passive document viewers—they are sandboxed mini-operating systems with safe access to GPUs, NPUs, private storage, video codecs, and hardware dials."),
    tradeoff: bi("SharedArrayBuffer는 COOP/COEP 교차 출처 격리 헤더가 필요하고, WebGPU·WebNN·WebHID는 브라우저별 성숙도가 다릅니다. 따라서 ToonStudio는 10개 API 전부에 대해 미지원 시 즉시 동작하는 결정론 폴백 계약을 테스트로 잠갔습니다.", "SharedArrayBuffer requires COOP/COEP isolation headers, and WebGPU/WebNN/WebHID maturity differs across browsers. Every single one of the 10 APIs is therefore test-locked with an automatic deterministic fallback."),
    speakerNotes: bi("마지막 16장은 오늘 발표의 결론입니다. 10대 차세대 웹 표준 API를 점진 향상과 안전 폴백으로 엮었기 때문에, 창작자는 설치 파일 없이 링크 하나만 열어도 자신의 기기가 허락하는 최고 성능의 스튜디오를 바로 만날 수 있습니다.", "Slide 16 brings everything together: by weaving 10 modern web standards with deterministic fallbacks, any creator opens one URL and automatically receives the highest tier their hardware supports."),
    repoPaths: ["apps/web/src/domains/creator/kernel/chrome-nextgen-platform-accelerator.ts", "apps/web/src/domains/showcase/nextgen-tech-showcase-data.ts", "apps/web/src/domains/creator/webcodecs-opfs-engine/webcodecs-reels-encoder.ts", "apps/web/src/domains/creator/kernel/Memory64CrossRealmWorker.ts"],
  },
];

export const TECH_AI_SHOWCASE_MODULES: readonly TechAiShowcaseModule[] = [
  {
    id: "zero-bill-ai-router", code: "AI-01", brandTag: "KilnExport · API", status: "current", executionMode: "zero-bill-api",
    title: bi("₩0 Fail-Closed 다중 무료 AI 캐스케이드 라우터", "KRW 0 Fail-Closed Multi-Provider Free AI Router"),
    whatItSolves: bi("유료 모델 오호출이나 일일 무료 쿼터 초과로 인한 서버 AI 과금 폭주를 구조적으로 원천 차단합니다.", "Structurally prevents surprise AI bills from paid-model slips or free-tier quota overruns."),
    howItWorks: bi("네트워크 호출 전 무료 화이트리스트를 검증하고, 90% 안전선·402/429 감지 시 다음 UTC 자정까지 자동 차단 후 다음 무료 공급자로 페일오버합니다.", "Verifies a free-model whitelist before network calls, locks providers at 90% safety cutoff or 402/429 until UTC midnight, and cascades to the next free tier."),
    whereUsed: bi("백엔드 스튜디오 AI 어시스턴트 API 전 엔드포인트의 비용 방화벽", "Cost firewall across backend studio AI assistant endpoints"),
    reuseCase: bi("스타트업 무료 티어 LLM SaaS, 교육용 AI 실습 플랫폼의 과금 안전장치", "Zero-surprise LLM gateway for freemium SaaS and classroom AI labs"),
    repoPaths: ["apps/api/src/modules/studio-ai/studio-free-ai-zero-bill-router.ts"],
  },
  {
    id: "ai-comic-director", code: "AI-02", brandTag: "AtelierStage · AI", status: "current", executionMode: "hybrid",
    title: bi("웹툰 콘티 · 컷 리듬 & 연출 디렉터", "Webtoon Storyboard & Panel-Pacing Director"),
    whatItSolves: bi("대본에서 세로 스크롤 웹툰 컷 분할·대사 호흡·장면 전환 초안을 잡는 초반 백지 부담을 덜어 줍니다.", "Eliminates blank-page friction when turning scripts into vertical-scroll panel beats and pacing."),
    howItWorks: bi("스키마 프리플라이트 검증을 거친 구조화 연출 세션으로 컷별 구도·대사·감정 리듬을 생성하고 작가의 캔버스 핸드오프로 연결합니다.", "Produces schema-validated shot lists, dialogue beats, and pacing guides with clean non-destructive handoff into the canvas."),
    whereUsed: bi("스튜디오 AI 콘티 디렉터 패널 및 회차 연출 워크플로", "Studio AI Comic Director panel and episode planning flow"),
    reuseCase: bi("영상 광고 스토리보드 기획 툴, 인터랙티브 비주얼노벨 씬 플래너", "Commercial video storyboarders and visual-novel scene planners"),
    repoPaths: ["apps/api/src/modules/studio-ai/studio-ai-comic-director.service.ts", "apps/web/src/domains/creator/ai/studio-ai-comic-director.ts"],
  },
  {
    id: "webtoon-continuity-guard", code: "AI-03", brandTag: "AtelierStage · QA", status: "current", executionMode: "on-device",
    title: bi("1~60컷 원고 자동 연속성 감시관", "1-60 Panel Webtoon Continuity Guard"),
    whatItSolves: bi("마감 직전 빈번한 안경/시계 소품 증발, 흉터·가르마 좌우 반전, 의상 색감 급변, 조명 방향 모순을 자동 적발합니다.", "Catches missing props, flipped scars/hair parts, sudden outfit color shifts, and lighting contradictions across an episode."),
    howItWorks: bi("OKLCH→CIE Lab→CIEDE2000(ΔE00) 색차 계산, 야간/회상 씬 예외 처리, 방위각 75° 광원 검사를 온디바이스로 실행해 원클릭 불변 패치를 제안합니다.", "Runs local CIEDE2000 color-delta checks (with night/flashback exemptions) and 75-deg light-angle audits to propose immutable one-click patches."),
    whereUsed: bi("에피소드 출고 전 자동 QA 검수 패널", "Pre-publication episode continuity QA inspector"),
    reuseCase: bi("애니메이션 작화 검수, 브랜드 캠페인 비주얼 일관성 감사기", "Animation frame QA and brand visual-consistency linters"),
    repoPaths: ["apps/web/src/domains/creator/webtoon-continuity-guard/webtoon-continuity-guard.ts"],
  },
  {
    id: "modelsheet-drift-coach", code: "AI-04", brandTag: "AtelierCast · QA", status: "current", executionMode: "on-device",
    title: bi("화차 간 작화·비율 흔들림 교정 코치", "Cross-Cut Model-Sheet Drift Coach"),
    whatItSolves: bi("연재가 길어질수록 캐릭터 등신, 눈 간격, 턱선 폭이 설정집에서 서서히 무너지는 작화 붕괴를 조기에 잡아냅니다.", "Detects gradual proportion drift—head-to-body ratio, eye spacing, jaw width—before character designs break across episodes."),
    howItWorks: bi("설정집 기준 프리셋과 1~60컷을 대조해 편차(%)와 회차 일관성 점수를 계산하고 최소 보정·정밀 정합·소품 복구 Top-3 비파괴 후보를 제시합니다.", "Audits cuts against reference model-sheet ratios, scores episode consistency, and proposes Top-3 non-destructive revertible fixes."),
    whereUsed: bi("화차 간 캐릭터 설정집 대조 감사 및 검수 리포트 내보내기", "Cross-cut model-sheet audit and Markdown/JSON QA exports"),
    reuseCase: bi("IP 캐릭터 라이선싱 감수, 게임 일러스트 시트 품질 관리", "IP character licensing review and game art-sheet QA"),
    repoPaths: ["apps/web/src/domains/creator/crosscut-modelsheet-drift-coach/modelsheet-drift-engine.ts"],
  },
  {
    id: "webnn-pigment-director", code: "AI-05", brandTag: "AtelierInk · ToonSilicon", status: "current", executionMode: "on-device",
    title: bi("로컬 NPU 8-밴드 안료·채색 디렉터", "On-Device NPU 8-Band Pigment & Cut Director"),
    whatItSolves: bi("분위기에 맞는 자연스러운 그림자·보색 안료 조합과 선화 안정화를 외부 서버 전송 없이 기기 안에서 즉시 추천합니다.", "Suggests natural spectral shadow/complement mixes and lineart stabilization locally with zero server round-trips."),
    howItWorks: bi("가시광선 8개 파장(415~665nm) 쿠벨카-뭉크 반사율 적분과 WASM SIMD/WebNN 추론 예산을 결합해 컷별 안료 팔레트를 계산합니다.", "Integrates 8 visible wavelengths (415-665nm) via Kubelka-Munk optics alongside WASM SIMD/WebNN lineart budgets."),
    whereUsed: bi("스튜디오 분광 팔레트 추천 및 온디바이스 컷 채색 어시스턴트", "Studio spectral palette advisor and on-device color assist"),
    reuseCase: bi("페인트/코스메틱 디지털 조색 시뮬레이터, 인쇄 색보정 보조 도구", "Digital paint/cosmetic shade matching and print color proofing"),
    repoPaths: ["apps/web/src/domains/creator/webnn-pigment-director/kubelka-munk-optics.ts", "apps/web/src/domains/creator/webnn-pigment-director/ondevice-cut-director.ts"],
  },
  {
    id: "voice-to-balloon-layout", code: "AI-06", brandTag: "CalmChrome · Lettering", status: "current", executionMode: "on-device",
    title: bi("음성 운율→0-겹침 말풍선 자동 조판", "Voice-Prosody to Zero-Overlap Speech Balloon Layout"),
    whatItSolves: bi("모바일 세로 800px 웹툰에서 말풍선이 서로 겹치거나 어절이 어색하게 잘리는 식자 노동을 자동화합니다.", "Automates tedious lettering layout so balloons never overlap or break Korean phrases awkwardly on 800px mobile strips."),
    howItWorks: bi("외부 API 없이 음성 리듬과 화자 좌우 정렬을 분석해 한 줄 14~18자(`keep-all`), 0-겹침 수직 간격, 동적 효과음(SFX) 콜아웃을 결정론적으로 배치합니다.", "Deterministically spaces 14-18 char `keep-all` Korean lines, speaker tails, and kinetic SFX callouts with zero vertical collisions."),
    whereUsed: bi("스튜디오 식자·말풍선 자동 배치 및 대사 초안 조판기", "Studio lettering auto-layout and dialogue drafting workbench"),
    reuseCase: bi("숏폼 영상 자막 자동 줄바꿈, 모바일 카드뉴스 타이포그래피 엔진", "Short-form video caption pacing and mobile editorial typography"),
    repoPaths: ["apps/web/src/domains/creator/voice-to-balloon-layout/voice-to-balloon-engine.ts"],
  },
  {
    id: "pose-expression-camera-coach", code: "AI-07", brandTag: "AtelierCast · AtelierStage", status: "current", executionMode: "hybrid",
    title: bi("AI 포즈 · 한글 비젬 표정 · 180° 카메라 트리오 코치", "AI Pose, Hangul-Viseme Expression & 180-deg Camera Trio"),
    whatItSolves: bi("대사 감정에 어긋나는 표정·포즈와 컷 전환 시 독자가 좌우 방향을 잃는 180° 액션 축 월선 오류를 미리 바로잡습니다.", "Fixes mismatched acting poses/expressions and prevents disorienting 180-degree camera axis crossings between panels."),
    howItWorks: bi("한국어 대사 감정 8종 + 한글 중성 분해 VRM 비젬 11종, 180° 반구 월선 감지, ControlNet 선화 준수도 계약을 비파괴 Top-3 고스트 가이드로 제공합니다.", "Combines 8-emotion Korean intent + Hangul vowel VRM visemes, 180-deg hemisphere auditing, and ControlNet adherence contracts as revertible ghost guides."),
    whereUsed: bi("캐릭터 표정·포즈 어드바이저, 카메라 프레이밍 코치, 포즈 가이드 패널", "Expression/pose advisor, camera framing coach, and pose guide"),
    reuseCase: bi("3D 버추얼 휴먼 연기 디렉팅, 게임 컷신 카메라 자동 검수기", "Virtual-human acting tools and game cutscene camera linters"),
    repoPaths: ["apps/web/src/domains/creator/ai-pose-guide/ai-pose-guide-model.ts", "apps/web/src/domains/creator/char-expression-pose-advisor/char-expression-pose-engine.ts", "apps/web/src/domains/creator/camera-framing-continuity-coach/camera-framing-coach-engine.ts"],
  },
  {
    id: "style-dna-latent-storyboard", code: "AI-08", brandTag: "AtelierInk · Style DNA", status: "current", executionMode: "on-device",
    title: bi("온디바이스 스타일 DNA (17³ 3D LUT) & 잠재 스토리보드", "On-Device Style DNA (17^3 3D LUT) & Latent Storyboard"),
    whatItSolves: bi("팀원 여러 명이 나눠 채색하거나 컷 간 색온도가 흔들릴 때 작가 고유의 그림체 색감과 선화 느낌을 일정하게 맞춥니다.", "Keeps team-colored episodes visually cohesive with the lead artist's signature palette, color temperature, and line weight."),
    howItWorks: bi("기준 컷 RGBA 버퍼에서 OKLCH 그림자 색조·색온도(K)·선화 굵기·스크린톤 피치를 추출해 17×17×17 3D LUT 삼선형 보간을 적용하고 ΔE00 색차 감소를 실측합니다.", "Extracts OKLCH shadow hue, Kelvin temperature, line width, and screentone pitch locally, applies a 17x17x17 3D LUT, and measures DeltaE00 reduction."),
    whereUsed: bi("화풍 DNA 추출·일치화 파이프라인 및 대본→잠재 스토리보드 파서", "Style DNA color harmonizer and script-to-conti latent storyboarder"),
    reuseCase: bi("사진/영상 브랜드 룩(LUT) 자동 통일, 팀 기반 일러스트 아트 디렉션", "Automated brand LUT matching and multi-artist illustration pipelines"),
    repoPaths: ["apps/web/src/domains/creator/ai-latent-storyboard/latent-style-harmonizer.ts", "apps/web/src/domains/creator/auto-style-dna-pipeline/auto-style-dna-color-extract.ts"],
  },
];

export const TECH_PLAIN_GLOSSARY: readonly TechPlainGlossaryEntry[] = [
  {
    id: "zero-copy", category: "hardware", usedInSlideNumbers: [1, 6, 9],
    term: bi("Zero-Copy (제로 카피)", "Zero-Copy"),
    oneLineAnalogy: bi("상자를 창고마다 다시 포장하지 않고 같은 팔레트 채로 다음 공정에 넘기는 방식", "Moving one pallet straight down the line without repacking boxes at every station"),
    technicalMeaning: bi("입력·WASM·GPU·저장소 사이에서 불필요한 버퍼 복제와 직렬화를 줄여 지연과 메모리 피크를 낮추는 아키텍처입니다.", "Minimizes redundant buffer cloning and serialization across input, WASM, GPU, and storage stages to cut latency and memory peaks."),
  },
  {
    id: "wasm64-unsafe-zero", category: "hardware", usedInSlideNumbers: [1, 2],
    term: bi("Rust/WASM64 & unsafe 0 경계", "Rust/WASM64 & Zero-Unsafe Boundary"),
    oneLineAnalogy: bi("브라우저에 꽂는 초소형 48KB 고속 칩이되, 메모리 사고를 원천 봉쇄한 안전 설계", "A tiny 48KB high-speed cartridge plugged into the browser with compile-time memory safety"),
    technicalMeaning: bi("`#![deny(unsafe_code)]`로 핵심 연산 커널을 100% 안전 Rust로 유지하고, 4GB 한계를 넘는 64비트 메모리 주소 공간 확장을 대비한 모듈입니다.", "Enforces `#![deny(unsafe_code)]` across core Rust kernels while preparing 64-bit linear addressing beyond the 4GB wasm32 ceiling."),
  },
  {
    id: "kubelka-munk", category: "rendering", usedInSlideNumbers: [3, 12],
    term: bi("쿠벨카-뭉크(KM) 7/16-밴드 분광 혼색", "Kubelka-Munk 7/16-Band Spectral Mixing"),
    oneLineAnalogy: bi("컴퓨터 화면에서 파란 물감과 노란 물감을 섞었을 때 회색이 아니라 진짜 초록이 나오게 하는 광학 공식", "Optical physics that makes blue + yellow paint mix into vivid green instead of muddy gray"),
    technicalMeaning: bi("가시광선을 7~16개 파장 대역으로 나눠 흡수(K)와 산란(S) 계수로 물감층 반사율을 계산하는 물리 모델입니다.", "Splits visible light into 7-16 wavelength bands using absorption (K) and scattering (S) coefficients to simulate real pigment layers."),
  },
  {
    id: "ribbon-tessellation", category: "rendering", usedInSlideNumbers: [3],
    term: bi("연속 리본 테셀레이션 & 24모 강모 물리", "Continuous Ribbon Tessellation & 24-Bristle Physics"),
    oneLineAnalogy: bi("동그란 도장을 다다다 찍는 대신 진짜 붓털 24가닥이 리본처럼 이어지며 물감이 점점 마르는 표현", "Sweeping 24 live paint bristles in one smooth ribbon instead of stamping disconnected circles"),
    technicalMeaning: bi("스트로크 궤적을 삼각형 메쉬 리본으로 생성해 빠른 필획의 구슬 현상(Beading)을 없애고 강모별 안료 소진을 추적합니다.", "Tessellates strokes into continuous triangle ribbons to eliminate stamp beading while simulating per-bristle pigment depletion."),
  },
  {
    id: "impasto-backrun", category: "rendering", usedInSlideNumbers: [3],
    term: bi("45° Sobel 임파스토 & 수채화 Backrun", "45-deg Sobel Impasto & Watercolor Backrun"),
    oneLineAnalogy: bi("유화 물감이 도톰하게 쌓여 빛을 받는 질감과, 수채화 물이 마르며 테두리에 번지는 물얼룩 효과", "Thick oil ridges catching directional light and watercolor pigment pooling cleanly at drying edges"),
    technicalMeaning: bi("높이장 기울기를 Sobel 필터로 법선화해 45° 입체 조명을 입히고, 모세관 확산 모델로 습윤→건조 4계층 물얼룩을 합성합니다.", "Computes surface normals via Sobel gradients for 45-deg relief lighting alongside capillary wet-to-dry pigment diffusion."),
  },
  {
    id: "procedural-seed-dag", category: "rendering", usedInSlideNumbers: [3, 8],
    term: bi("결정론적 절차적 시드 DAG & 수밀(Manifold) 메쉬", "Deterministic Procedural Seed DAG & Watertight Mesh"),
    oneLineAnalogy: bi("숫자 시드 하나만 넣으면 똑같은 한옥 기와나 창틀을 구멍 없이(수밀) 다시 만들어 내는 레시피 그래프", "A recipe graph where one seed number always regenerates the exact same gap-free architectural asset"),
    technicalMeaning: bi("비순환 그래프(DAG)와 Mulberry32 난수로 배경·질감을 재현 가능하게 생성하고, 비다양체(non-manifold) 구멍 0건을 검증합니다.", "Uses acyclic stage graphs and seeded PRNG to synthesize reproducible textures/props gated against non-manifold geometry defects."),
  },
  {
    id: "webgpu-subgroups-f16", category: "rendering", usedInSlideNumbers: [4],
    term: bi("WebGPU Subgroups · shader-f16 · Sparse Strips", "WebGPU Subgroups, shader-f16 & Sparse Strips"),
    oneLineAnalogy: bi("GPU 옆자리 작업자끼리 직접 숫자를 주고받고, 데이터 부피는 반으로 줄이며 그려진 띠만 골라 칠하는 고속화", "Direct lane-to-lane GPU whispers, half-size floats, and rasterizing only active vector strips"),
    technicalMeaning: bi("Subgroup 연산으로 워크그룹 동기화 배리어를 줄이고, 16비트 부동소수점(`f16`)으로 대역폭을 절감하며, 빈 공간 연산을 건너뛰는 Sparse Strips를 결합합니다.", "Cuts workgroup barriers via subgroup intrinsics, halves spectral storage with `f16`, and skips empty areas with sparse strips."),
  },
  {
    id: "radiance-cascades-jfa", category: "rendering", usedInSlideNumbers: [5],
    term: bi("Radiance Cascades GI & JFA SDF 그림자", "Radiance Cascades GI & JFA SDF Shadows"),
    oneLineAnalogy: bi("가까운 빛은 촘촘히, 먼 빛은 넓게 계산해 합쳐서 2D 그림에 입체 역광을 입히는 차세대 조명 기법", "Multi-scale light probes that paint smooth 2D bounce and rim lighting without ray-tracing noise"),
    technicalMeaning: bi("Jump Flooding 알고리즘으로 픽셀별 최근접 장애물 거리(SDF)를 구한 뒤 다중 해상도 각도 프로브를 병합해 전역 조명을 산출합니다.", "Builds a signed distance field via Jump Flooding then merges multi-resolution angular light cascades for noise-free 2D GI."),
  },
  {
    id: "webnn-mltensor-pid", category: "hardware", usedInSlideNumbers: [6, 16],
    term: bi("WebNN MLTensor & Anti-Windup PID 열 제어", "WebNN MLTensor & Anti-Windup PID Thermal Control"),
    oneLineAnalogy: bi("AI 전용 칩(NPU/TPU)에 데이터를 복사 없이 넘기고, 기기가 뜨거워지기 전에 스스로 속도를 조절하는 자동 온도조절기", "Zero-copy NPU tensor sharing paired with a smart thermostat that prevents overheating before throttling hits"),
    technicalMeaning: bi("WebNN 표준 `MLTensor`를 통해 GPU↔NPU 간 데이터 공유 경로를 설계하고, Compute Pressure 신호에 PID 제어 루프를 걸어 4단계 안전 강등을 수행합니다.", "Pairs WebNN `MLTensor` sharing with a discrete PID + anti-windup thermal loop driven by Compute Pressure states."),
  },
  {
    id: "pchip-one-euro-mlp", category: "hardware", usedInSlideNumbers: [7],
    term: bi("16K PCHIP · One-Euro · Micro-MLP 예측", "16K PCHIP, One-Euro & Micro-MLP Prediction"),
    oneLineAnalogy: bi("16,384단계 미세 필압을 튀지 않게 다듬고, 빠른 붓질에서는 0.01초 앞 펜끝을 예측하는 손떨림·지연 보정", "Smooth 16,384-level pressure curves plus millisecond lookahead so ink stays locked to the pen tip"),
    technicalMeaning: bi("단조 3차 보간(PCHIP)으로 필압 오버슈트를 막고, 속도 적응형 One-Euro 필터와 75파라미터 Micro-MLP로 궤적 지연을 보정합니다.", "Eliminates curve overshoot via monotonic PCHIP and combines velocity-adaptive One-Euro filtering with a 75-parameter Micro-MLP."),
  },
  {
    id: "dq-skinning-fabrik-verlet", category: "rendering", usedInSlideNumbers: [8],
    term: bi("듀얼 쿼터니언 · FABRIK IK · Verlet 물리", "Dual-Quaternion, FABRIK IK & Verlet Physics"),
    oneLineAnalogy: bi("관절이 찌그러지지 않게 구부리고, 손끝만 끌면 팔이 따라오며, 머리카락과 옷자락이 자연스럽게 흩날리게 하는 3D 물리", "Pinch-free joint bends, drag-the-hand inverse kinematics, and flowing hair/cloth physics"),
    technicalMeaning: bi("Dual-Quaternion 스키닝으로 부피 붕괴를 방지하고, 15관절 FABRIK 역기구학과 위치 기반 Verlet 제약으로 3D 캐릭터를 실시간 조작합니다.", "Prevents joint collapse with dual-quaternion skinning while solving 15-joint arm/hand IK via FABRIK and cloth via Verlet constraints."),
  },
  {
    id: "morton-zorder-bvh", category: "storage-sync", usedInSlideNumbers: [8, 9],
    term: bi("Morton Z-Order 가상 타일 & BVH", "Morton Z-Order Tiles & BVH"),
    oneLineAnalogy: bi("넓은 캔버스를 Z자 지그재그 번호로 묶어 인접한 그림 조각을 메모리 가까이 모아 두는 초고속 주소 정리법", "Numbering 2D canvas tiles in a Z-curve so nearby pixels stay side by side in CPU/GPU caches"),
    technicalMeaning: bi("2D/3D 좌표를 비트 인터리빙(Morton code)해 공간 지역성을 극대화하고, BVH 경계 상자 트리로 충돌·선화 탐색을 가속합니다.", "Bit-interleaves 2D/3D coordinates for cache locality in sparse tile tables and accelerates hit-testing via bounding-volume hierarchies."),
  },
  {
    id: "opfs-sqlite-rle", category: "storage-sync", usedInSlideNumbers: [1, 9, 10],
    term: bi("OPFS 3단 스왑 · SQLite WASM · RLE-Delta", "OPFS 3-Tier Swap, SQLite WASM & RLE-Delta"),
    oneLineAnalogy: bi("브라우저 전용 고속 금고(OPFS)에 DB와 바뀐 픽셀 차이만 무손실 압축 저장해 창이 닫혀도 원고를 살리는 구조", "A private high-speed browser vault saving only lossless pixel diffs so work survives crashes"),
    technicalMeaning: bi("Origin Private File System 위에 SQLite 저널과 VRAM/RAM/OPFS LRU-K 스와퍼, FNV-1a 0-diff 검증 RLE-Delta 코덱을 결합합니다.", "Combines OPFS private storage, SQLite journals, 3-tier LRU-K tile swapping, and FNV-1a verified lossless RLE-Delta compression."),
  },
  {
    id: "hlc-crdt", category: "storage-sync", usedInSlideNumbers: [10],
    term: bi("HLC 하이브리드 논리 시계 & CRDT 타일 병합", "HLC Hybrid Logical Clock & CRDT Tile Merge"),
    oneLineAnalogy: bi("시계가 조금 다른 네 컴퓨터가 오프라인으로 각자 그려도, 다시 만났을 때 싸움 없이 똑같이 합쳐지는 약속", "A timestamp and merge rule so four offline teammates always converge to the exact same artwork"),
    technicalMeaning: bi("물리 시각과 논리 카운터·노드 ID를 결합한 HLC로 전순서를 보장하고, 256×256 타일 Op-Log를 교환·결합·멱등 규칙으로 수렴시킵니다.", "Pairs physical clocks with logical counters and node IDs for total order, converging tile op-logs regardless of arrival order."),
  },
  {
    id: "zero-bill-fail-closed", category: "ai", usedInSlideNumbers: [11],
    term: bi("Zero-Bill Fail-Closed AI 라우터", "Zero-Bill Fail-Closed AI Router"),
    oneLineAnalogy: bi("무료 쿠폰이 떨어지면 자동으로 지갑을 잠가 유료 결제가 절대 나가지 않게 지키는 안전 차단기", "A circuit breaker that locks the wallet the moment free AI quotas run out so surprise bills never happen"),
    technicalMeaning: bi("비화이트리스트 유료 모델을 네트워크 전 단계에서 거부하고 90% 안전선 또는 402/429 오류 시 UTC 자정까지 자동 차단합니다.", "Rejects paid models pre-flight and locks exhausted free providers at 90% budget or HTTP 402/429 until UTC midnight."),
  },
  {
    id: "ciede2000-style-dna", category: "ai", usedInSlideNumbers: [11, 12],
    term: bi("CIEDE2000 (ΔE00) 색차 & 17³ 3D LUT 스타일 DNA", "CIEDE2000 DeltaE00 & 17^3 3D LUT Style DNA"),
    oneLineAnalogy: bi("사람 눈이 '색이 달라졌다'고 느끼는 정도를 정확히 재서, 작가 고유 색감 필름(LUT)으로 한 번에 맞춰 주는 기술", "Measuring perceptual color drift like the human eye and applying a custom 3D color film to unify episodes"),
    technicalMeaning: bi("CIE 표준 ΔE00 지각 색차 수식으로 컷 간 색감 이탈을 판정하고, 17×17×17 3D LUT 삼선형 보간으로 화풍 색조를 일치화합니다.", "Quantifies perceptual color error with CIEDE2000 and aligns cross-panel palettes via trilinear 17x17x17 3D LUT interpolation."),
  },
  {
    id: "action-axis-180", category: "ai", usedInSlideNumbers: [12],
    term: bi("180° 액션 축 법칙 & 한글 비젬 추론", "180-deg Action Axis & Hangul Viseme Inference"),
    oneLineAnalogy: bi("대화하는 두 인물 사이 보이지 않는 선을 카메라가 넘지 않게 지키고, 한글 대사 모음으로 입모양을 맞추는 연출 규칙", "Keeping cameras on one side of a conversation while mapping Korean vowels to exact mouth shapes"),
    technicalMeaning: bi("직전 컷 시선·방위각으로 반구 월선을 감지하고, 한글 유니코드 중성 분해로 VRM 11종 표정·입모양 블렌드셰이프를 추론합니다.", "Detects camera hemisphere crossings from prior gaze/azimuth and decomposes Hangul vowels into VRM viseme blendshapes."),
  },
  {
    id: "c2pa-merkle-rights-bom", category: "trust-security", usedInSlideNumbers: [13],
    term: bi("C2PA 머클 원장 & Fail-Closed Rights BOM", "C2PA Merkle Ledger & Fail-Closed Rights BOM"),
    oneLineAnalogy: bi("작품에 쓰인 소재 허가증 전수 목록표와, 단 1바이트만 고쳐도 바로 들통나는 디지털 봉인 도장", "An audited license manifest for every asset plus a tamper-evident fingerprint tree"),
    technicalMeaning: bi("FNV-1a 64-bit 이진 머클 트리로 작화 이력 변조를 탐지하고, 상업 불가·미확인 라이선스 소재가 1건이라도 있으면 납품을 차단합니다.", "Uses binary Merkle trees to spot 1-byte log edits and fail-closes commercial exports whenever any asset lacks verified rights."),
  },
  {
    id: "oklch-apca", category: "ux-web", usedInSlideNumbers: [14, 15],
    term: bi("OKLCH 지각 색공간 & WCAG 2.2 / APCA W3 Lc", "OKLCH Perceptual Color & WCAG 2.2 / APCA W3 Lc"),
    oneLineAnalogy: bi("밝기 숫자가 같으면 사람 눈에도 똑같이 밝아 보이는 정직한 색상표와, 글자가 또렷이 읽히는지 재는 가독성 자", "A perceptually uniform color ruler paired with modern readability math for crisp text on any theme"),
    technicalMeaning: bi("원시 hex 없이 OKLCH 토큰으로 9개 테마를 통일하고, WCAG 2.2 대비비와 APCA W3 Lc 지각 명암으로 말풍선·UI 가독성을 검증합니다.", "Unifies 9 themes via raw-hex-free OKLCH tokens while validating text legibility with WCAG 2.2 ratios and APCA W3 Lc lightness contrast."),
  },
  {
    id: "view-transitions-speculation", category: "ux-web", usedInSlideNumbers: [15, 16],
    term: bi("View Transitions & Speculation Rules API", "View Transitions & Speculation Rules API"),
    oneLineAnalogy: bi("다음에 누를 페이지를 몰래 미리 준비해 두고, 화면이 바뀔 때 부드럽게 겹쳐 넘겨 주는 브라우저 기본 마법", "Preloading likely next pages quietly and cross-fading views natively at 60fps"),
    technicalMeaning: bi("DOM 스냅샷 간 180ms 네이티브 크로스페이드와 moderate 프리페치를 제공하며, 미지원·모션감소 환경에서는 즉시 안전 폴백합니다.", "Delivers 180ms native DOM cross-fades and moderate route prefetching with instant fallbacks on unsupported or reduced-motion devices."),
  },
  {
    id: "scroll-anchor-container", category: "ux-web", usedInSlideNumbers: [15],
    term: bi("Scroll-Driven · Anchor+Popover · @container/@starting-style", "Scroll-Driven, Anchor+Popover & @container/@starting-style"),
    oneLineAnalogy: bi("자바스크립트 없이 스크롤·팝업 겹침 회피·카드 크기별 레이아웃을 브라우저 CSS가 스스로 계산하는 현대 표준", "Pure CSS standards that drive scroll motion, collision-free popovers, and component-aware layouts without JS"),
    technicalMeaning: bi("GPU 컴포지터 스크롤 리빌, Top-Layer 팝오버 자동 경계 회피, 컨테이너 쿼리·진입 트랜지션을 `@supports` 가드로 점진 적용합니다.", "Applies compositor scroll timelines, top-layer anchored popovers, container queries, and entry transitions behind `@supports` guards."),
  },
  {
    id: "calm-chrome-cognitive", category: "ux-web", usedInSlideNumbers: [14],
    term: bi("CalmChrome 6-핀 압축 & Phase-Aware 크롬", "CalmChrome 6-Pin Compression & Phase-Aware Chrome"),
    oneLineAnalogy: bi("100개 메뉴 중 지금 그리는 단계에 꼭 필요한 6개만 꺼내 두고 나머지는 쉬운 검색 서랍에 정리하는 집중 UI", "Surfacing only the 6 essential tools for your current drawing phase while keeping the rest searchable in a drawer"),
    technicalMeaning: bi("Hick-Hyman 법칙 기반 6-핀 상단 바, 0-용어 실시간 검색, `<details>` 서랍, 7번째 자동-핀과 캔버스 `>=82%` 면적 계약을 강제합니다.", "Enforces a 6-pin bar, zero-jargon search, `<details>` drawer, 7th auto-pin, and >=82% canvas viewport contract."),
  },
];

export function filterGlossaryEntries(
  entries: readonly TechPlainGlossaryEntry[],
  category: "all" | TechGlossaryCategory,
  query: string,
): readonly TechPlainGlossaryEntry[] {
  const tokens = query.trim().toLowerCase().split(/\s+/u).filter((token) => token.length > 0);
  return entries.filter((entry) => {
    if (category !== "all" && entry.category !== category) return false;
    if (tokens.length === 0) return true;
    const haystack = [
      entry.term.ko, entry.term.en, entry.oneLineAnalogy.ko, entry.oneLineAnalogy.en,
      entry.technicalMeaning.ko, entry.technicalMeaning.en,
    ].join(" ").toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}
