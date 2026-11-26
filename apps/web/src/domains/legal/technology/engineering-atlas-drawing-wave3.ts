import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · drawing · Wave 2–3 Pure-Safe Rust(#![deny(unsafe_code)]) 62 C-ABI 확장 WASM64 + Apple Silicon 네이티브 .dylib 심층 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_DRAWING_WAVE3: readonly EngineeringAtlasEntry[] = [
  {
    id: "rust-wave23-native-wasm64-kernels",
    category: "drawing",
    name: "Wave 2–3 Rust 62 C-ABI & Apple Silicon .dylib",
    title: t("Wave 2–3 안전 Rust 7대 커널과 62 C-ABI · NEON .dylib", "Wave 2–3 safe Rust 7 kernels, 62 C-ABI WASM64 & NEON .dylib"),
    status: "experimental",
    tagline: t(
      "PSB·SAH BVH·IK·오디오 DSP·벡터·슬라이서·CMYK 7대 커널을 301.37 KiB WASM 과 542.72 KiB .dylib 로 검증했습니다.",
      "Seven pure-safe Rust kernels compile to a 301.37 KiB 62-export WASM and a 542.72 KiB Apple Silicon .dylib.",
    ),
    background: [
      t(
        "드로잉 필터를 넘어 실제 웹툰 출판·3D 포징·오디오툰 제작까지 브라우저와 데스크톱에서 같은 결과로 돌리려면 핵심 알고리즘을 순수 안전 Rust(#![deny(unsafe_code)], 외부 크레이트 0개) 한 벌로 통합해야 합니다. Wave 2 에서는 4 GiB 초과 대용량 문서용 PSB 코덱(psd_psb_codec_kernel.rs), 32B 정렬 12-버킷 SAH BVH 레이캐스트(bvh3d_sah_raycast_kernel.rs), 전신 2-Bone+CCD IK(humanoid_body_ik_kernel.rs)를 추가했습니다.",
        "Running publishing, 3D posing and AudioToon pipelines identically across browser and desktop requires one pure-safe Rust core (#![deny(unsafe_code)], zero external crates). Wave 2 added a 4 GiB+ PSB codec (psd_psb_codec_kernel.rs), a 32-byte-aligned 12-bucket SAH BVH raycaster (bvh3d_sah_raycast_kernel.rs) and full-body 2-Bone+CCD IK (humanoid_body_ik_kernel.rs).",
      ),
      t(
        "Wave 3 에서는 오디오 DSP 믹서·ITU-R BS.1770 LUFS 음량 측정·슈뢰더 리버브(audio_dsp_mixer_kernel.rs), 가변 굵기 벡터 캘리그라피 확장(vector_path_kernel.rs), 웹툰 스마트 자동 슬라이서 & 64비트 FNV-1a 타일 중복제거(webtoon_slicer_dedup_kernel.rs), 인쇄용 CMYK(UCR/GCR TAC 300%)·OKLCH·16색 Median-Cut 팔레트(color_cmyk_oklch_kernel.rs) 4대 커널을 더해 총 62개 C-ABI export 를 완성했습니다.",
        "Wave 3 added four more kernels: an Audio DSP mixer with ITU-R BS.1770 LUFS metering and Schroeder reverb (audio_dsp_mixer_kernel.rs), variable-width vector calligraphy expansion (vector_path_kernel.rs), a webtoon smart auto-slicer with 64-bit FNV-1a tile deduplication (webtoon_slicer_dedup_kernel.rs), and print CMYK (UCR/GCR TAC 300%), OKLCH and 16-color Median-Cut palettes (color_cmyk_oklch_kernel.rs), reaching 62 C-ABI exports.",
      ),
      t(
        "빌드·벤치마크 실측치(2026-11-26): 확장 WASM 바이너리는 301.37 KiB(308,600 B, 62 exports, SIMD 명령 4,145개), Apple Silicon ARM64 네이티브 .dylib 는 542.72 KiB(61 symbols, NEON 명령 6,332개)입니다. Apple M2 Max 0-diff 파리티 실측에서 타일 중복제거 Native 24.52× / WASM 19.82×, 벡터 캘리그라피 Native 15.32× / WASM 6.96×, 256×256 블러 Native 7.98× / WASM 4.07×, 오디오 DSP Native 2.41× 를 기록했습니다.",
        "Verified build and benchmark results (2026-11-26): the extended WASM is 301.37 KiB (308,600 B, 62 exports, 4,145 SIMD ops) and the Apple Silicon ARM64 native .dylib is 542.72 KiB (61 symbols, 6,332 NEON ops). On Apple M2 Max with 0-diff parity: tile dedup 24.52x Native / 19.82x WASM, vector calligraphy 15.32x Native / 6.96x WASM, 256x256 blur 7.98x Native / 4.07x WASM, and Audio DSP 2.41x Native.",
      ),
      t(
        "현재 구현(Current)과 확장 로드맵(Target): 7대 커널·62 C-ABI 확장 WASM·Apple Silicon .dylib·데스크톱 브리지(native-rust-wave3-bridge.ts)·브라우저 지연 로더(wasm64-native-wave3/index.ts, 초기 번들 0B)·JS 0-diff 폴백은 모두 구현 및 테스트 검증을 마쳤습니다. 스튜디오 전체 내보내기·오디오툰 UI 의 기본 실행 전환은 단계별 통합 대상입니다.",
        "Current vs Roadmap: all seven kernels, the 62-export WASM, Apple Silicon .dylib, desktop bridge (native-rust-wave3-bridge.ts), lazy browser loader (wasm64-native-wave3/index.ts, 0 B eager impact) and 0-diff JS fallback pass tests. Switching every studio export and AudioToon panel to run on them by default is phased.",
      ),
    ],
    keyPoints: [
      t("확장 WASM 301.37 KiB(62 exports · SIMD 4,145개) 검증", "Extended WASM: 301.37 KiB, 62 exports, 4,145 SIMD ops"),
      t("Apple Silicon .dylib 542.72 KiB(61 심볼 · NEON 6,332개)", "Apple Silicon .dylib: 542.72 KiB, 61 symbols, 6,332 NEON"),
      t("M2 Max 0-diff: 중복제거 24.52×/19.82× · 벡터 15.32×/6.96×", "M2 Max 0-diff: dedup 24.52x/19.82x, vector 15.32x/6.96x"),
      t("PSB·SAH BVH·IK·DSP·벡터·슬라이서·CMYK 단일 Rust 소스", "One safe Rust core for PSB, BVH, IK, DSP, vector, slice, CMYK"),
    ],
    diagram: {
      id: "rust-wave23-native-wasm64-kernels-diagram",
      kind: "graph",
      title: t("Wave 2–3 안전 Rust 7대 커널과 이중 실행 레인", "Wave 2–3 safe Rust 7 kernels across dual execution lanes"),
      caption: t(
        "외부 크레이트 0개 안전 Rust 코어가 브라우저 62-export WASM 과 데스크톱 NEON .dylib 로 0-diff 실행됩니다.",
        "Zero-crate safe Rust runs with 0-diff parity across 62-export browser WASM and desktop NEON .dylib.",
      ),
      alt: t(
        "왼쪽에 Wave 2 커널(4GiB+ PSB·32B SAH BVH·2-Bone+CCD IK)과 Wave 3 커널(오디오 DSP·벡터 캘리그라피·스마트 슬라이서·CMYK/OKLCH)이 있고, 가운데 안전 Rust 코어가 브라우저용 301.37 KiB 62-export WASM64 와 데스크톱용 542.72 KiB 61-symbol NEON dylib 로 컴파일됩니다. 오른쪽에서는 120Hz 로드 밸런서와 JS 0-diff 폴백이 실행을 조율합니다.",
        "Wave 2 kernels (4 GiB+ PSB, 32B SAH BVH, 2-Bone+CCD IK) and Wave 3 kernels (Audio DSP, vector calligraphy, smart slicer, CMYK/OKLCH) sit inside one safe Rust core compiling to 301.37 KiB 62-export WASM64 and 542.72 KiB 61-symbol NEON .dylib, coordinated by the 120 Hz load balancer and 0-diff JS fallback.",
      ),
      nodes: [
        { id: "w2", label: t("Wave 2 커널 3종", "Wave 2 (3 kernels)"), sub: t("4GiB PSB · SAH BVH · IK", "4 GiB PSB, SAH BVH, IK"), tone: "local", at: [0, 0] },
        { id: "w3", label: t("Wave 3 커널 4종", "Wave 3 (4 kernels)"), sub: t("DSP · 벡터 · 슬라이서 · CMYK", "DSP, vector, slicer, CMYK"), tone: "local", at: [0, 1] },
        { id: "core", label: t("안전 Rust 코어", "Safe Rust core"), sub: t("deny(unsafe) · 0 crates", "deny(unsafe), 0 crates"), tone: "good", at: [1, 0] },
        { id: "wasm", label: t("WASM64 확장", "WASM64 suite"), sub: t("301.37 KiB · 62 exports", "301.37 KiB, 62 exports"), tone: "good", at: [2, 0] },
        { id: "dylib", label: t("ARM64 .dylib", "ARM64 .dylib"), sub: t("542.72 KiB · NEON 6,332", "542.72 KiB, 6,332 NEON"), tone: "good", at: [2, 1] },
        { id: "browser", label: t("브라우저 로더", "Browser loader"), sub: t("0B eager · JS 0-diff 폴백", "0 B eager, JS 0-diff"), tone: "local", shape: "pill", at: [3, 0] },
        { id: "desktop", label: t("데스크톱 브리지", "Desktop bridge"), sub: t("M2 Max 24.52x 실측", "M2 Max 24.52x measured"), tone: "local", shape: "pill", at: [3, 1] },
      ],
      edges: [
        { from: "w2", to: "core" },
        { from: "w3", to: "core" },
        { from: "core", to: "wasm", label: t("SIMD 4,145", "4,145 SIMD") },
        { from: "core", to: "dylib", label: t("61 심볼", "61 symbols") },
        { from: "wasm", to: "browser" },
        { from: "dylib", to: "desktop" },
      ],
      groups: [
        { id: "rust", label: t("단일 Pure-Safe Rust 소스", "Single Pure-Safe Rust source"), tone: "neutral", nodeIds: ["w2", "w3", "core"] },
        { id: "lanes", label: t("이중 실행 산출물", "Dual build outputs"), tone: "local", nodeIds: ["wasm", "dylib", "browser", "desktop"] },
      ],
    },
    usage: [
      {
        feature: t("Wave 2 코어: 4 GiB+ PSB · 32B SAH BVH · 전신 IK", "Wave 2 core: 4 GiB+ PSB, 32B SAH BVH & full-body IK"),
        role: t(
          "초대형 PSB 입출력, 32바이트 정렬 12-버킷 SAH BVH 레이캐스트, 2-Bone+CCD 전신 IK 를 순수 안전 Rust 로 처리합니다.",
          "Handles large PSB I/O, 32-byte-aligned 12-bucket SAH BVH raycasts and 2-Bone+CCD full-body IK in pure safe Rust.",
        ),
        paths: [
          "crates/studio-wasm64-drawing-core/src/psd_psb_codec_kernel.rs",
          "crates/studio-wasm64-drawing-core/src/bvh3d_sah_raycast_kernel.rs",
          "crates/studio-wasm64-drawing-core/src/humanoid_body_ik_kernel.rs",
        ],
      },
      {
        feature: t("Wave 3 코어: 오디오 DSP · 벡터 · 슬라이서 · CMYK", "Wave 3 core: Audio DSP, vector, slicer & CMYK"),
        role: t(
          "BS.1770 LUFS·슈뢰더 리버브, 가변폭 캘리그라피, FNV-1a 64비트 타일 중복제거, UCR/GCR TAC 300% CMYK·OKLCH·16색 Median-Cut 을 수행합니다.",
          "Runs BS.1770 LUFS and Schroeder reverb, variable-width calligraphy, FNV-1a 64-bit tile dedup, and TAC 300% CMYK/OKLCH/16-color Median-Cut.",
        ),
        paths: [
          "crates/studio-wasm64-drawing-core/src/audio_dsp_mixer_kernel.rs",
          "crates/studio-wasm64-drawing-core/src/vector_path_kernel.rs",
          "crates/studio-wasm64-drawing-core/src/webtoon_slicer_dedup_kernel.rs",
          "crates/studio-wasm64-drawing-core/src/color_cmyk_oklch_kernel.rs",
        ],
      },
      {
        feature: t("브라우저 Wave-3 지연 로더 & 데스크톱 네이티브 브리지", "Lazy browser Wave-3 loader & desktop native bridge"),
        role: t(
          "브라우저에서는 필요 시점에만 301.37 KiB WASM 을 로드하고, 데스크톱에서는 ARM64 .dylib 와 JS 0-diff 폴백을 자동 선택합니다.",
          "Lazy-loads the 301.37 KiB WASM on demand in browsers and dispatches ARM64 .dylib with 0-diff JS fallback on desktop.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-native-wave3/index.ts",
          "apps/web/src/domains/creator/wasm64-native-wave3/wave3-wasm-runtime.ts",
          "apps/desktop-sync/src/native-rust-wave3-bridge.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("Apple M2 Max 벤치마크 & 120Hz 적응형 밸런서", "Apple M2 Max benchmark & 120 Hz adaptive balancer"),
        role: t(
          "Native .dylib·WASM·JS 의 0-diff 파리티와 가속 배수를 재현 가능하게 측정하고, 프레임 예산에 따라 실행 티어를 분배합니다.",
          "Reproducibly measures 0-diff parity and Native/WASM/JS speedups while steering frame budgets across execution tiers.",
        ),
        paths: [
          "scripts/benchmark-wasm64-wave3.mjs",
          "crates/studio-wasm64-drawing-core/examples/bench_wave3_apple_silicon.rs",
          "apps/web/src/domains/creator/wasm64-runtime-bridge/wasm64-adaptive-load-balancer.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("인쇄용 CMYK 총잉크량(TAC 300%) 클램프 계약", "Print CMYK Total Area Coverage (TAC 300%) clamp"),
        language: "ts",
        ...sampleSource([
          ["export interface CmykColor { readonly c: number; readonly m: number; readonly y: number; readonly k: number; }"],
          [""],
          ["export function clampCmykTac300(color: CmykColor, maxTac = 3.0): CmykColor {"],
          ["  const sum = color.c + color.m + color.y + color.k;", "정규화 합계 3.0 = TAC 300%", "normalized sum 3.0 equals TAC 300%"],
          ["  if (sum <= maxTac || sum <= 0) return color;"],
          ["  const scale = maxTac / sum;", "색상 비율을 유지하며 총잉크량 제한", "scales channels to respect press ink limit"],
          ["  return { c: color.c * scale, m: color.m * scale, y: color.y * scale, k: color.k * scale };"],
          ["}"],
        ]),
        explain: t(
          "실제 Rust 커널(color_cmyk_oklch_kernel.rs)은 UCR/GCR 블랙 생성과 Display-P3·OKLCH 변환, 16색 Median-Cut 팔레트 추출까지 단일 선형 메모리 패스로 수행합니다.",
          "The Rust kernel (color_cmyk_oklch_kernel.rs) performs UCR/GCR black generation, Display-P3/OKLCH conversion and 16-color Median-Cut in linear memory.",
        ),
        source: "crates/studio-wasm64-drawing-core/src/color_cmyk_oklch_kernel.rs",
        verify: "types",
      },
    ],
    links: [
      {
        title: "ITU-R BS.1770 · Loudness Measurement Standard",
        url: "https://www.itu.int/rec/R-REC-BS.1770/en",
        kind: "spec",
        note: t("오디오툰 믹서 LUFS 음량 정규화 국제 표준", "International LUFS loudness metering standard for AudioToon"),
      },
      {
        title: "Adobe Photoshop File Formats Specification (PSD/PSB)",
        url: "https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/",
        kind: "spec",
        note: t("4 GiB 초과 대용량 문서(PSB, version 2) 바이너리 포맷 명세", "Binary specification for 4 GiB+ PSB version 2 documents"),
      },
      {
        title: "Rustonomicon · FFI & C-ABI Safety Boundary",
        url: "https://doc.rust-lang.org/nomicon/ffi.html",
        kind: "docs",
        note: t("안전 커널과 최소 C-ABI 경계 분리 설계 참고", "Reference for isolating minimal C-ABI boundaries around safe kernels"),
      },
    ],
    chapterIds: ["wasm-fixed-simd", "performance", "sound-generation"],
    talk: {
      pitch: t(
        "외부 크레이트 0개·safe Rust 한 벌로 PSB·SAH BVH·전신 IK·오디오 DSP·벡터 캘리그라피·웹툰 슬라이서·CMYK 7대 커널을 구현해 301.37 KiB 62-export WASM 과 542.72 KiB ARM64 .dylib 로 검증했습니다. M2 Max 0-diff 실측에서 타일 중복제거 24.52×·벡터 15.32×·블러 7.98×·오디오 DSP 2.41× 를 확인했습니다.",
        "One zero-crate safe Rust crate delivers seven kernels—PSB, SAH BVH, IK, Audio DSP, vector calligraphy, smart slicer and CMYK—compiling to a 301.37 KiB 62-export WASM and a 542.72 KiB ARM64 .dylib with M2 Max 0-diff speedups up to 24.52x.",
      ),
      analogy: t(
        "인쇄소(CMYK), 녹음실(LUFS), 제본기(스마트 슬라이서), 목각 인형 관절(IK) 설계도를 한 권의 안전 매뉴얼(Rust)로 묶어 웹과 맥에서 오차 0으로 똑같이 돌려 쓰는 구조입니다.",
        "Like uniting printshop (CMYK), studio (LUFS), cutter (smart slicer) and puppetry (IK) into one safe Rust manual that outputs zero-diff results on both web and macOS.",
      ),
      questions: [
        {
          question: t("왜 WASM 과 네이티브 .dylib 를 둘 다 유지하나요?", "Why maintain both WASM and native .dylib?"),
          answer: t(
            "웹 브라우저에서는 설치 없이 301.37 KiB WASM 으로 즉시 실행하고, 데스크톱 동기화 앱에서는 NEON 6,332개 명령이 살아 있는 542.72 KiB .dylib 로 2.4×~24.5× 네이티브 성능을 꺼내 쓰면서도 0-diff 결과를 보장하기 위해서입니다.",
            "Browsers run the 301.37 KiB WASM with zero install, while the desktop companion taps the 542.72 KiB NEON .dylib for 2.4x–24.5x speed with identical 0-diff outputs.",
          ),
        },
        {
          question: t("웹툰 스마트 자동 슬라이서와 FNV-1a 중복제거는 어디에 쓰이나요?", "Where are the smart slicer and FNV-1a dedup used?"),
          answer: t(
            "세로로 긴 웹툰 원고를 말풍선·선화를 자르지 않는 여백(gutter) 기준으로 안전하게 분할하고, 반복되는 단색·배경 256×256 타일을 64비트 FNV-1a 해시로 묶어 내보내기 용량과 처리 시간을 크게 줄입니다.",
            "It splits long vertical webtoons along ink-free gutters without slicing balloons or lineart, then deduplicates repeated 256x256 tiles via 64-bit FNV-1a hashes.",
          ),
        },
      ],
      pitfall: t(
        "M2 Max 가속 배수(24.52×·15.32×·7.98×·2.41×)는 Apple Silicon ARM64 기준 커널 벤치마크이며, x86·모바일 기기나 전체 UI 종단 작업 시간과는 다를 수 있습니다.",
        "The M2 Max speedups (24.52x, 15.32x, 7.98x, 2.41x) are Apple Silicon ARM64 kernel benchmarks and will vary on x86, mobile devices and full end-to-end UI flows.",
      ),
    },
    technologies: ["Rust / WASM", "WebAssembly", "Relaxed-SIMD", "Apple Silicon"],
    facts: [
      {
        value: "301.37 KiB (62 exports)",
        label: t("확장 WASM64 스위트 크기 · SIMD 명령 4,145개", "Extended WASM64 suite size with 4,145 SIMD ops"),
        source: "apps/web/public/wasm/studio-wasm64-extended-suite.wasm",
      },
      {
        value: "542.72 KiB (61 symbols)",
        label: t("Apple Silicon ARM64 네이티브 .dylib · NEON 6,332개", "Apple Silicon ARM64 native .dylib with 6,332 NEON ops"),
        source: "crates/studio-wasm64-drawing-core/examples/bench_wave3_apple_silicon.rs",
      },
      {
        value: "24.52× / 19.82×",
        label: t("M2 Max 64비트 FNV-1a 타일 중복제거 Native / WASM(0-diff)", "M2 Max 64-bit FNV-1a tile dedup Native / WASM (0-diff)"),
        source: "crates/studio-wasm64-drawing-core/src/webtoon_slicer_dedup_kernel.rs",
      },
      {
        value: "15.32× / 7.98× / 2.41×",
        label: t("M2 Max Native 벡터(WASM 6.96×) · 블러(4.07×) · 오디오 DSP", "M2 Max Native vector (WASM 6.96x), blur (4.07x) & Audio DSP"),
        source: "scripts/benchmark-wasm64-wave3.mjs",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
