import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · drawing · Rust WASM64 드로잉 코어 4단계 바이너리·확장 스위트·Skyline 아틀라스·네이티브 스택 검증 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_DRAWING_WASM64: readonly EngineeringAtlasEntry[] = [
  {
    id: "wasm64-drawing-core-extended-suite",
    category: "drawing",
    name: "WASM64 Drawing Core & Extended Suite",
    title: t("무의존 안전 Rust WASM 4종과 드로우 배칭", "Zero-dependency safe Rust WASM tiers & draw batching"),
    status: "experimental",
    tagline: t(
      "외부 크레이트 0개·safe Rust 로 4단계 .wasm 과 네이티브 .dylib 를 빌드해 핵심 연산을 분리했습니다.",
      "Zero external crates and safe Rust produce four .wasm tiers and a native .dylib for core drawing math.",
    ),
    background: [
      t(
        "브라우저 웹툰 편집기의 필터·타일 합성·혼색·3D 컬링을 자바스크립트만으로 돌리면 프레임 예산이 쉽게 무너집니다. ToonStudio 는 외부 크레이트 0개·#![deny(unsafe_code)] 안전 Rust 크레이트(crates/studio-wasm64-drawing-core)를 작성해 기본 코어(47.91 KiB·16 exports), SIMD128(53.03 KiB·282 v128), Relaxed-SIMD(53.03 KiB·282 v128 + 2 relaxed-simd), 확장 스위트(215.93 KiB·2,651 v128 + 116 relaxed-simd·40 C-ABI exports) 4종 .wasm 을 apps/web/public/wasm/ 에 컴파일해 검증했습니다.",
        "Running webtoon filters, tile compositing, pigment mixing and 3D culling in plain JavaScript quickly exhausts frame budgets. ToonStudio builds a zero-external-crate, #![deny(unsafe_code)] Rust crate (crates/studio-wasm64-drawing-core) into four verified .wasm binaries under apps/web/public/wasm/: core (47.91 KiB, 16 exports), SIMD128 (53.03 KiB, 282 v128), Relaxed-SIMD (53.03 KiB, 282 v128 + 2 relaxed-simd) and the extended suite (215.93 KiB, 2,651 v128 + 116 relaxed-simd, 40 C-ABI exports).",
      ),
      t(
        "2026-11-26 기준 Cargo 테스트 169/169 통과와 V8 실측(Relaxed-SIMD 기준 블러 1.89×·언샤프 1.97×)을 확인했고, 같은 Rust 소스로 Apple Silicon 네이티브 동적 라이브러리(libstudio_wasm64_drawing_core.dylib, 412 KB, 39개 C-ABI 심볼) 빌드도 검증했습니다. 함께 굴러가는 네이티브·런타임 스택도 studio-engine-vello(60/60 + glifo 텍스트 캐시 3,931.8×), studio-hokusai-wasm(12/12), desktop-sync(70/70 + 릴리스 6/6) 테스트가 통과했습니다.",
        "As of 2026-11-26, 169/169 Cargo tests pass and V8 measurements record 1.89x blur and 1.97x unsharp speedups on Relaxed-SIMD, while the same Rust codebase builds a native Apple Silicon library (libstudio_wasm64_drawing_core.dylib, 412 KB, 39 C-ABI symbols). Companion stacks also pass verification: studio-engine-vello (60/60 plus glifo 3,931.8x text cache), studio-hokusai-wasm (12/12) and desktop-sync (70/70 plus 6/6 release).",
      ),
      t(
        "렌더 제출 단계에서는 Skyline Bottom-Left 동적 텍스처 아틀라스 패커(1px 거터·LRU 퇴거·더티 영역 부분 업로드)와 64B 고정 스트라이드 드로우 콜 병합기가 브러시 스탬프·글리프·말풍선을 묶어 GPU 호출을 줄입니다. 동시에 Konva 직접 결합을 끊는 Phase 0 중립 핸들(studio-stage-handle-types.ts, 36개 이상 파일 분리)과 Wave 1 중복 JS 8개 패키지 분리(18.88 MiB 축소 여지 확보)를 마쳤습니다.",
        "On the submission side, a Skyline Bottom-Left dynamic texture atlas packer (1 px gutter, LRU eviction, dirty-rect uploads) and a 64-byte fixed-stride draw-call coalescer batch brush stamps, glyph runs and balloons. Alongside them, Konva Phase 0 neutral handles (studio-stage-handle-types.ts, 36+ files decoupled) and Wave 1 redundant JS decoupling (18.88 MiB unlocked across 8 packages) prepare the migration path.",
      ),
      t(
        "현재 구현(Current)과 향후 목표(Target)를 분명히 나눕니다. 4종 .wasm 빌드·런타임 브리지·배처·네이티브 테스트와 중립 핸들 분리는 2026-11-26 시점에 검증된 사실입니다. 반면 편집기 전체 캔버스의 Konva 완전 교체와 모든 브러시 경로의 기본 실행 전환은 실브라우저 회귀 검증을 거쳐 단계적으로 진행할 목표입니다.",
        "Current state and target roadmap are kept separate. The four .wasm binaries, runtime bridges, batcher, native tests and neutral handle decoupling are verified as of 2026-11-26. Full Konva runtime replacement across the entire canvas and making every brush path default to this lane remain phased targets pending real-browser regression checks.",
      ),
    ],
    keyPoints: [
      t("외부 크레이트 0개·safe Rust 로 4종 .wasm 빌드 검증", "Four .wasm tiers built from zero-crate safe Rust"),
      t("V8 실측 Relaxed-SIMD 블러 1.89× · 언샤프 1.97×", "Measured V8 Relaxed-SIMD: 1.89x blur, 1.97x unsharp"),
      t("Skyline 아틀라스·64B 드로우 콜 병합으로 GPU 제출 절감", "Skyline atlas & 64B draw-call coalescing cut GPU calls"),
      t("Konva 중립 핸들 36+파일 분리 완료, 전면 전환은 단계 목표", "36+ files decoupled from Konva; full cutover is phased"),
    ],
    diagram: {
      id: "wasm64-drawing-core-extended-suite-diagram",
      kind: "graph",
      title: t("안전 Rust 코어에서 브라우저·네이티브 실행까지", "From safe Rust core to browser and native lanes"),
      caption: t(
        "단일 safe Rust 소스가 CPU 역량별 4종 .wasm 과 네이티브 .dylib 로 분기합니다.",
        "One safe Rust core compiles into four capability-tiered .wasm builds and a native .dylib.",
      ),
      alt: t(
        "외부 크레이트가 없는 안전 Rust 크레이트가 기본·SIMD128·Relaxed-SIMD·확장 스위트 4개 WASM 바이너리와 Apple Silicon 네이티브 dylib 로 빌드됩니다. 브라우저는 런타임 브리지로 CPU 단계를 탐지해 알맞은 바이너리를 고르고, Skyline 아틀라스와 드로우 콜 병합기로 렌더 제출을 묶습니다.",
        "A zero-crate safe Rust crate compiles into four WASM binaries (core, SIMD128, Relaxed-SIMD, extended suite) and a native Apple Silicon dylib. The browser runtime bridge probes CPU features to select the matching tier, while the Skyline atlas and draw-call coalescer batch render submissions.",
      ),
      nodes: [
        { id: "rust", label: t("안전 Rust 코어", "Safe Rust core"), sub: t("0 crates · 169/169 PASS", "0 crates, 169/169 PASS"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "tiers", label: t("4종 .wasm 티어", "4 .wasm tiers"), sub: t("47.9KiB ~ 215.9KiB", "47.9 KiB to 215.9 KiB"), tone: "local", at: [1, 0] },
        { id: "probe", label: t("CPU 역량 탐지", "CPU tier probe"), sub: t("SIMD 단계", "SIMD tier"), tone: "neutral", shape: "diamond", at: [2, 0] },
        { id: "bridge", label: t("WASM64 브리지", "WASM64 bridge"), sub: t("16 / 40 C-ABI exports", "16 / 40 C-ABI exports"), tone: "good", at: [3, 0] },
        { id: "batch", label: t("Skyline · 배처", "Skyline & batcher"), sub: t("2048px 아틀라스 · 64B 병합", "2048px atlas, 64B batch"), tone: "good", shape: "pill", at: [4, 0] },
        { id: "dylib", label: t("네이티브 .dylib", "Native .dylib"), sub: t("412KB · 39 C-ABI 심볼", "412 KB, 39 C-ABI symbols"), tone: "local", at: [1, 1] },
        { id: "js", label: t("JS 참조 폴백", "JS fallback"), sub: t("미지원·실패 시 안전 유지", "safe fallback on failure"), tone: "warn", at: [2, 1] },
      ],
      edges: [
        { from: "rust", to: "tiers", label: t("wasm32", "wasm32") },
        { from: "rust", to: "dylib", label: t("Apple ARM", "Apple ARM") },
        { from: "tiers", to: "probe" },
        { from: "probe", to: "bridge", label: t("일치 티어", "matched") },
        { from: "probe", to: "js", label: t("폴백", "fallback"), style: "dashed" },
        { from: "bridge", to: "batch" },
      ],
      groups: [
        { id: "build", label: t("빌드 산출물 (검증됨)", "Verified build outputs"), tone: "neutral", nodeIds: ["rust", "tiers", "dylib"] },
        { id: "runtime", label: t("브라우저 실행 경로", "Browser runtime path"), tone: "local", nodeIds: ["probe", "bridge", "batch", "js"] },
      ],
    },
    usage: [
      {
        feature: t("4단계 Rust WASM 바이너리와 빌드 스크립트", "Four-tier Rust WASM binaries & build scripts"),
        role: t(
          "코어·SIMD128·Relaxed-SIMD(48~53 KiB)와 확장 스위트(215.93 KiB, 40 exports)를 컴파일하고 크기 예산과 export 서명을 검증합니다.",
          "Compiles core, SIMD128, Relaxed-SIMD (48–53 KiB) and the extended suite (215.93 KiB, 40 exports), checking byte budgets and export signatures.",
        ),
        paths: [
          "crates/studio-wasm64-drawing-core/src/lib.rs",
          "apps/web/public/wasm/studio-wasm64-drawing-core-relaxed-simd.wasm",
          "apps/web/public/wasm/studio-wasm64-extended-suite.wasm",
          "scripts/build-wasm64-extended-suite.mjs",
        ],
        route: "/studio",
      },
      {
        feature: t("런타임 브리지 · CPU 단계 선택기", "Runtime bridge & CPU tier loader"),
        role: t(
          "브라우저의 Relaxed-SIMD·SIMD128 지원을 검증해 최적 바이너리를 선택하고, 미지원 시 JS 참조 구현으로 내려앉습니다.",
          "Probes browser Relaxed-SIMD and SIMD128 support to pick the matching binary, falling back to the JS reference path when unavailable.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-runtime-bridge/wasm64-hotpath-loader.ts",
          "apps/web/src/domains/creator/wasm64-runtime-bridge/wasm64-extended-suite-loader.ts",
        ],
      },
      {
        feature: t("Skyline 동적 텍스처 아틀라스 & 드로우 콜 병합", "Skyline texture atlas & draw-call coalescing"),
        role: t(
          "2048×2048 아틀라스에 최소 1px 거터로 스탬프·글리프를 패킹하고, 64B 고정 버퍼로 비겹침 드로우 콜을 병합합니다.",
          "Packs stamps and glyphs into a 2048x2048 atlas with a 1 px gutter and coalesces non-overlapping draw calls in a 64-byte buffer.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-render-batcher/wasm64-texture-atlas-packer.ts",
          "apps/web/src/domains/creator/wasm64-render-batcher/wasm64-draw-call-coalescer.ts",
        ],
      },
      {
        feature: t("Konva Phase 0 중립 핸들 분리", "Konva Phase 0 neutral handle decoupling"),
        role: t(
          "36개 이상 스튜디오 파일이 Konva 구체 타입 대신 중립 스테이지·레이어·포인터 계약을 참조하도록 경계를 분리했습니다.",
          "Decouples 36+ studio files onto neutral stage, layer and pointer contracts instead of concrete Konva runtime types.",
        ),
        paths: ["apps/web/src/domains/creator/canvas/studio-stage-handle-types.ts"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("CPU 역량별 WASM 바이너리 선택", "Selecting the WASM binary by CPU capability"),
        language: "ts",
        ...sampleSource([
          ['type CpuTier = "relaxed-simd" | "simd128" | "scalar";'],
          ["const BINARY_URL: Readonly<Record<CpuTier, string>> = {"],
          ['  "relaxed-simd": "/wasm/studio-wasm64-drawing-core-relaxed-simd.wasm",'],
          ['  simd128: "/wasm/studio-wasm64-drawing-core-simd.wasm",'],
          ['  scalar: "/wasm/studio-wasm64-drawing-core.wasm",'],
          ["};"],
          [""],
          ["export function selectDrawingCoreUrl(hasRelaxed: boolean, hasSimd: boolean): string {"],
          ['  if (hasRelaxed) return BINARY_URL["relaxed-simd"];', "V8 실측 블러 1.89x · 언샤프 1.97x", "measured on V8: 1.89x blur, 1.97x unsharp"],
          ["  if (hasSimd) return BINARY_URL.simd128;", "고정폭 128비트 벡터 282개 v128", "fixed-width 128-bit SIMD, 282 v128 ops"],
          ["  return BINARY_URL.scalar;", "47.91 KiB 기본 스칼라 코어", "47.91 KiB scalar baseline core"],
          ["}"],
        ]),
        explain: t(
          "브라우저가 지원하는 가장 높은 SIMD 단계를 실행 시점에 한 번 골라 알맞은 .wasm URL 을 선택합니다. 실패하면 JS 참조 경로가 이어받습니다.",
          "Picks the highest supported SIMD tier once at runtime to fetch the matching .wasm URL; failures fall back to the JS reference path.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("64바이트 고정 스트라이드 드로우 키 비교", "Comparing draw-call batch keys in a fixed layout"),
        language: "ts",
        ...sampleSource([
          ["export interface DrawBatchKey {"],
          ["  readonly layerOrder: number;"],
          ["  readonly pipelineId: number;"],
          ["  readonly blendMode: number;"],
          ["  readonly textureAtlasId: number;"],
          ["}"],
          [""],
          ["export function canCoalesceBatch(a: DrawBatchKey, b: DrawBatchKey): boolean {"],
          ["  return ("],
          ["    a.layerOrder === b.layerOrder &&", "페인터 순서를 바꾸지 않는다", "preserves strict painter's order"],
          ["    a.pipelineId === b.pipelineId &&"],
          ["    a.blendMode === b.blendMode &&"],
          ["    a.textureAtlasId === b.textureAtlasId", "같은 Skyline 아틀라스 슬롯만 병합", "merges only within the same Skyline atlas"],
          ["  );"],
          ["}"],
        ]),
        explain: t(
          "실제 병합기(wasm64-draw-call-coalescer.ts)는 객체 생성 없이 사전 할당 ArrayBuffer(64B/프리미티브)와 AABB 비겹침 검사를 함께 써서 드로우 콜을 묶습니다.",
          "The production coalescer (wasm64-draw-call-coalescer.ts) writes into a preallocated 64-byte-stride ArrayBuffer and checks AABB non-overlap to merge calls without allocations.",
        ),
        source: "apps/web/src/domains/creator/wasm64-render-batcher/wasm64-draw-call-coalescer.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "WebAssembly · Relaxed SIMD proposal",
        url: "https://github.com/WebAssembly/relaxed-simd",
        kind: "repo",
        note: t("CPU 네이티브 FMA·벡터 명령을 여는 Relaxed-SIMD 표준", "Relaxed-SIMD spec exposing native FMA and vector ops"),
      },
      {
        title: "Rust Reference · Unsafe code & #![deny(unsafe_code)]",
        url: "https://doc.rust-lang.org/reference/unsafe-keyword.html",
        kind: "docs",
        note: t("unsafe 블록을 컴파일 단계에서 금지하는 안전 Rust 계약", "Compile-time guarantee forbidding unsafe blocks"),
      },
      {
        title: "WebAssembly · Feature status",
        url: "https://webassembly.org/features/",
        kind: "guide",
      },
    ],
    chapterIds: ["wasm-fixed-simd", "brush-engine", "performance"],
    talk: {
      pitch: t(
        "외부 크레이트가 하나도 없는 safe Rust 코드로 48KiB 기본 코어부터 216KiB 40-export 확장 스위트까지 4단계 WASM 과 412KB Apple Silicon 네이티브 라이브러리까지 한 번에 빌드했습니다. Relaxed-SIMD 는 V8 실측에서 블러 1.89배·언샤프 1.97배를 확인했고, 캔버스 전면 교체는 회귀 검증을 거쳐 단계적으로 진행합니다.",
        "One zero-dependency safe Rust codebase builds four WASM tiers—from a 48 KiB core to a 216 KiB 40-export suite—plus a 412 KB Apple Silicon native library. V8 benchmarks show 1.89x blur and 1.97x unsharp speedups on Relaxed-SIMD, while full canvas cutover proceeds in verified phases.",
      ),
      analogy: t(
        "한 권의 설계도로 경차·고속열차·현지 전용 엔진을 함께 뽑아 내고, 도로 사정에 맞는 차량을 자동 배차하는 공장 구조입니다.",
        "Like building a compact car, express train and native engine from one blueprint, then dispatching whichever matches the road.",
      ),
      questions: [
        {
          question: t("왜 외부 크레이트를 0개로 제한했나요?", "Why cap external crates at zero?"),
          answer: t(
            "공급망 감사·라이선스 고지 부담과 바이너리 팽창을 동시에 막아 48KiB 미만 코어와 256KiB 미만 확장 스위트 예산을 지키기 위해서입니다.",
            "To eliminate supply-chain and license bloat while keeping the core under 48 KiB and the extended suite under 256 KiB.",
          ),
        },
        {
          question: t("이미 편집기 전체가 Konva 없이 돌아가나요?", "Does the whole editor already run without Konva?"),
          answer: t(
            "아직 아닙니다. 36개 이상 파일의 중립 핸들 분리(Phase 0)와 4종 WASM·네이티브·배처 검증이 끝난 상태이며, 캔버스 전면 전환은 후속 단계 목표입니다.",
            "Not yet. Phase 0 neutral handle decoupling across 36+ files and the four WASM tiers, native build and batcher are verified; full canvas cutover is a phased target.",
          ),
        },
      ],
      pitfall: t(
        "V8 실측 1.89×·1.97× 는 Relaxed-SIMD 필터 커널 수치이며 모든 브러시 작업의 체감 배수로 일반화하면 안 됩니다. Konva 전면 제거도 현재 완료가 아니라 Phase 0 분리 완료 상태입니다.",
        "The 1.89x and 1.97x figures are V8 filter-kernel measurements on Relaxed-SIMD, not a universal brush speedup, and Konva removal is at Phase 0 decoupling rather than full cutover.",
      ),
    },
    technologies: ["Rust / WASM", "WebAssembly", "Relaxed-SIMD", "Vello", "Hokusai"],
    facts: [
      {
        value: "47.91 KiB / 215.93 KiB",
        label: t("기본 코어(16 exports) / 확장 스위트(40 exports, 2,651 v128)", "Core (16 exports) / Extended suite (40 exports, 2,651 v128)"),
        source: "apps/web/public/wasm/studio-wasm64-extended-suite.wasm",
      },
      {
        value: "1.89× / 1.97×",
        label: t("V8 실측 Relaxed-SIMD 블러 / 언샤프 마스크 가속", "Measured V8 Relaxed-SIMD blur / unsharp mask speedup"),
        source: "apps/web/public/wasm/studio-wasm64-drawing-core-relaxed-simd.wasm",
      },
      {
        value: "169 / 169 PASS",
        label: t("safe Rust(#![deny(unsafe_code)], 0 crate) Cargo 테스트", "Safe Rust (#![deny(unsafe_code)], 0 crates) Cargo tests"),
        source: "crates/studio-wasm64-drawing-core/Cargo.toml",
      },
      {
        value: "412 KB (39 symbols)",
        label: t("Apple Silicon 네이티브 .dylib 검증 결과", "Verified Apple Silicon native .dylib output"),
        source: "crates/studio-wasm64-drawing-core/src/lib.rs",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
