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
        "브라우저 웹툰 편집기의 필터·타일 합성·혼색·3D 컬링을 자바스크립트만으로 돌리면 프레임 예산이 쉽게 무너집니다. ToonStudio 는 외부 크레이트 0개·#![deny(unsafe_code)] 안전 Rust 크레이트(crates/studio-wasm64-drawing-core)를 작성해 기본 코어(47.91 KiB·16 exports), SIMD128(53.03 KiB·282 v128), Relaxed-SIMD(53.03 KiB·282 v128 + 2 relaxed-simd), Wave 2–3 확장 스위트(301.37 KiB·62 C-ABI exports·SIMD 4,145개) 4종 .wasm 을 apps/web/public/wasm/ 에 컴파일해 검증했습니다.",
        "Running webtoon filters, tile compositing, pigment mixing and 3D culling in plain JavaScript quickly exhausts frame budgets. ToonStudio builds a zero-external-crate, #![deny(unsafe_code)] Rust crate (crates/studio-wasm64-drawing-core) into four verified .wasm binaries under apps/web/public/wasm/: core (47.91 KiB, 16 exports), SIMD128 (53.03 KiB, 282 v128), Relaxed-SIMD (53.03 KiB, 282 v128 + 2 relaxed-simd) and the Wave 2–3 extended suite (301.37 KiB, 62 C-ABI exports, 4,145 SIMD ops).",
      ),
      t(
        "같은 안전 Rust 소스로 Apple Silicon ARM64 네이티브 동적 라이브러리(libstudio_wasm64_drawing_core.dylib, 542.72 KiB, 61개 C-ABI 심볼, NEON 6,332개)까지 함께 빌드합니다. Apple M2 Max 실측(0-diff 파리티)에서 타일 중복제거 Native 24.52×·WASM 19.82×, 벡터 캘리그라피 Native 15.32×·WASM 6.96×, 256×256 블러 Native 7.98×·WASM 4.07×, 오디오 DSP Native 2.41× 를 확인했고, V8 Relaxed-SIMD 블러 1.89×·언샤프 1.97× 와 Vello·Hokusai·desktop-sync 스택 테스트도 통과했습니다.",
        "The same safe Rust source compiles into an Apple Silicon ARM64 native dynamic library (libstudio_wasm64_drawing_core.dylib, 542.72 KiB, 61 C-ABI symbols, 6,332 NEON ops). Apple M2 Max 0-diff benchmarks measured tile dedup at 24.52x Native / 19.82x WASM, vector calligraphy at 15.32x Native / 6.96x WASM, 256x256 blur at 7.98x Native / 4.07x WASM and Audio DSP at 2.41x Native, alongside V8 Relaxed-SIMD blur 1.89x / unsharp 1.97x.",
      ),
      t(
        "렌더 제출 단계에서는 Skyline Bottom-Left 동적 텍스처 아틀라스 패커(1px 거터·LRU 퇴거·더티 영역 부분 업로드)와 64B 고정 스트라이드 드로우 콜 병합기가 브러시 스탬프·글리프·말풍선을 묶어 GPU 호출을 줄입니다. 동시에 Konva Phase 0 중립 인터페이스 분리(59→1파일, 98.3% 분리), Phase 1-2 Vello 런타임 브리지(피처 플래그 + Konva 자동 폴백), Wave 1–2 중복 JS/WASM(18.88 MiB + opencv-js·pixi.js) 분리를 마쳤습니다.",
        "On the submission side, a Skyline Bottom-Left dynamic texture atlas packer (1 px gutter, LRU eviction, dirty-rect uploads) and a 64-byte fixed-stride draw-call coalescer batch stamps, glyphs and balloons. Alongside them, Konva Phase 0 neutral interface decoupling (59 to 1 file, 98.3%), the feature-flagged Phase 1-2 Vello bridge with automatic Konva fallback, and Wave 1–2 redundant JS/WASM decoupling (18.88 MiB plus opencv-js and pixi.js) are complete.",
      ),
      t(
        "현재 구현(Current)과 확장 로드맵(Target)을 분명히 나눕니다. 4종 .wasm(62 exports)·Apple Silicon .dylib(61 symbols)·런타임 브리지·배처·Phase 0 및 피처 플래그 기반 Phase 1-2 브리지는 2026-11-26 시점에 검증된 사실입니다. 반면 편집기 전체 캔버스의 Konva 완전 교체와 기본 실행 경로 전면 전환은 실브라우저 회귀 검증을 거쳐 단계적으로 진행할 목표입니다.",
        "Current state and expansion roadmap stay separate. The four .wasm binaries (62 exports), Apple Silicon .dylib (61 symbols), runtime bridges, batcher, Phase 0 decoupling and feature-flagged Phase 1-2 bridge are verified as of 2026-11-26. Full Konva removal across the entire canvas and making these lanes default remain phased targets pending real-browser regression checks.",
      ),
    ],
    keyPoints: [
      t("외부 크레이트 0개·safe Rust 4종 .wasm(최대 301.37 KiB·62 exports)", "4 zero-crate safe Rust .wasm tiers (up to 301.37 KiB, 62 exports)"),
      t("Apple Silicon .dylib 542.72 KiB(61 심볼·NEON 6,332개) 검증", "Apple Silicon .dylib 542.72 KiB (61 symbols, 6,332 NEON ops)"),
      t("M2 Max 0-diff 실측: 중복제거 24.52× · 벡터 15.32× · 블러 7.98×", "M2 Max 0-diff: dedup 24.52x, vector 15.32x, blur 7.98x"),
      t("Konva 59→1파일(98.3%) 분리 + Phase 1-2 Vello 브리지 검증", "Konva 59→1 file (98.3%) decoupled + Phase 1-2 Vello bridge"),
    ],
    diagram: {
      id: "wasm64-drawing-core-extended-suite-diagram",
      kind: "graph",
      title: t("안전 Rust 코어에서 브라우저·네이티브 실행까지", "From safe Rust core to browser and native lanes"),
      caption: t(
        "단일 safe Rust 소스가 CPU 역량별 4종 .wasm(62 exports)과 네이티브 .dylib(61 심볼)로 분기합니다.",
        "One safe Rust core compiles into four .wasm tiers (62 exports) and a native .dylib (61 symbols).",
      ),
      alt: t(
        "외부 크레이트가 없는 안전 Rust 크레이트가 기본·SIMD128·Relaxed-SIMD·62 export 확장 스위트 4개 WASM 바이너리와 Apple Silicon 네이티브 dylib 로 빌드됩니다. 브라우저는 런타임 브리지로 CPU 단계를 탐지해 알맞은 바이너리를 고르고, Skyline 아틀라스와 드로우 콜 병합기로 렌더 제출을 묶습니다.",
        "A zero-crate safe Rust crate compiles into four WASM binaries (core, SIMD128, Relaxed-SIMD, 62-export extended suite) and a native Apple Silicon dylib. The browser runtime bridge probes CPU features to select the matching tier, while the Skyline atlas and draw-call coalescer batch render submissions.",
      ),
      nodes: [
        { id: "rust", label: t("안전 Rust 코어", "Safe Rust core"), sub: t("0 crates · deny(unsafe)", "0 crates, deny(unsafe)"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "tiers", label: t("4종 .wasm 티어", "4 .wasm tiers"), sub: t("47.9KiB ~ 301.4KiB", "47.9 KiB to 301.4 KiB"), tone: "local", at: [1, 0] },
        { id: "probe", label: t("CPU 역량 탐지", "CPU tier probe"), sub: t("SIMD 단계", "SIMD tier"), tone: "neutral", shape: "diamond", at: [2, 0] },
        { id: "bridge", label: t("WASM64 브리지", "WASM64 bridge"), sub: t("16 / 62 C-ABI exports", "16 / 62 C-ABI exports"), tone: "good", at: [3, 0] },
        { id: "batch", label: t("Skyline · 배처", "Skyline & batcher"), sub: t("2048px 아틀라스 · 64B 병합", "2048px atlas, 64B batch"), tone: "good", shape: "pill", at: [4, 0] },
        { id: "dylib", label: t("네이티브 .dylib", "Native .dylib"), sub: t("542.7KiB · 61 심볼", "542.7 KiB, 61 symbols"), tone: "local", at: [1, 1] },
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
          "코어·SIMD128·Relaxed-SIMD(48~53 KiB)와 Wave 2–3 확장 스위트(301.37 KiB, 62 exports, SIMD 4,145개)를 컴파일하고 서명을 검증합니다.",
          "Compiles core, SIMD128, Relaxed-SIMD (48–53 KiB) and the Wave 2–3 extended suite (301.37 KiB, 62 exports, 4,145 SIMD ops).",
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
        feature: t("Konva Phase 0 중립 핸들 분리(59→1파일)", "Konva Phase 0 neutral handle decoupling (59→1 file)"),
        role: t(
          "비-JSX 런타임 파일의 Konva 구체 타입 결합을 59개에서 1개로(98.3%) 줄이고 중립 스테이지·레이어 계약으로 전환했습니다.",
          "Cut concrete Konva type coupling across non-JSX runtime files from 59 to 1 (98.3%) onto neutral stage and layer contracts.",
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
        "외부 크레이트가 하나도 없는 safe Rust 코드로 47.91 KiB 기본 코어부터 301.37 KiB 62-export 확장 스위트까지 4단계 WASM 과 542.72 KiB Apple Silicon 네이티브 라이브러리(61 심볼)까지 한 번에 빌드했습니다. M2 Max 실측에서 타일 중복제거 24.52×·벡터 15.32×·블러 7.98× 를 확인했고, 캔버스 전면 교체는 회귀 검증을 거쳐 단계적으로 진행합니다.",
        "One zero-dependency safe Rust codebase builds four WASM tiers—from a 47.91 KiB core to a 301.37 KiB 62-export suite—plus a 542.72 KiB Apple Silicon native library (61 symbols). M2 Max 0-diff benchmarks hit 24.52x tile dedup, 15.32x vector and 7.98x blur, while full canvas cutover proceeds in verified phases.",
      ),
      analogy: t(
        "한 권의 설계도로 경차·고속열차·현지 전용 엔진을 함께 뽑아 내고, 도로 사정에 맞는 차량을 자동 배차하는 공장 구조입니다.",
        "Like building a compact car, express train and native engine from one blueprint, then dispatching whichever matches the road.",
      ),
      questions: [
        {
          question: t("왜 외부 크레이트를 0개로 제한했나요?", "Why cap external crates at zero?"),
          answer: t(
            "공급망 감사·라이선스 고지 부담과 바이너리 팽창을 동시에 막아 48 KiB 미만 코어와 302 KiB 이하 62-export 확장 스위트 예산을 지키기 위해서입니다.",
            "To eliminate supply-chain and license bloat while keeping the core under 48 KiB and the 62-export extended suite near 301 KiB.",
          ),
        },
        {
          question: t("이미 편집기 전체가 Konva 없이 돌아가나요?", "Does the whole editor already run without Konva?"),
          answer: t(
            "아직 아닙니다. Phase 0 중립 인터페이스 59→1파일(98.3%) 분리와 피처 플래그 기반 Phase 1-2 Vello 브리지(장애 시 Konva 자동 폴백)까지 검증했고, 본편 캔버스 전면 교체는 단계별 목표입니다.",
            "Not yet. Phase 0 neutral decoupling (59 to 1 file, 98.3%) and the feature-flagged Phase 1-2 Vello bridge with automatic Konva fallback are verified; full canvas cutover is phased.",
          ),
        },
      ],
      pitfall: t(
        "M2 Max 실측(24.52×·15.32×·7.98×)과 V8 Relaxed-SIMD(1.89×·1.97×)는 개별 커널 측정치이며 모든 작업의 체감 배수로 일반화하면 안 됩니다. Konva 전면 제거도 현재 완료가 아니라 Phase 0·1-2 브리지 검증 단계입니다.",
        "M2 Max (24.52x, 15.32x, 7.98x) and V8 Relaxed-SIMD (1.89x, 1.97x) are kernel benchmarks, not universal UI speedups, and Konva removal is at Phase 0 plus feature-flagged Phase 1-2 bridge.",
      ),
    },
    technologies: ["Rust / WASM", "WebAssembly", "Relaxed-SIMD", "Vello", "Hokusai"],
    facts: [
      {
        value: "47.91 KiB / 301.37 KiB",
        label: t("기본 코어(16 exports) / Wave 2–3 확장 스위트(62 exports, SIMD 4,145개)", "Core (16 exports) / Wave 2–3 extended suite (62 exports, 4,145 SIMD ops)"),
        source: "apps/web/public/wasm/studio-wasm64-extended-suite.wasm",
      },
      {
        value: "24.52× / 19.82×",
        label: t("M2 Max 실측 타일 중복제거 Native / WASM 가속(0-diff)", "M2 Max measured tile-dedup Native / WASM speedup (0-diff)"),
        source: "scripts/benchmark-wasm64-wave3.mjs",
      },
      {
        value: "542.72 KiB (61 symbols)",
        label: t("Apple Silicon ARM64 네이티브 .dylib(NEON 6,332개)", "Apple Silicon ARM64 native .dylib (6,332 NEON ops)"),
        source: "crates/studio-wasm64-drawing-core/src/lib.rs",
      },
      {
        value: "59 → 1 (98.3%)",
        label: t("Konva Phase 0 중립 인터페이스 분리 + Phase 1-2 Vello 브리지", "Konva Phase 0 neutral decoupling + Phase 1-2 Vello bridge"),
        source: "apps/web/src/domains/creator/canvas/studio-vello-viewport-runtime-bridge.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
