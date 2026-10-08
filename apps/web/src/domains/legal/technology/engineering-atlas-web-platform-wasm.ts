import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/** 기술 도감 · web-platform · WebAssembly 두 장(자체 빌드·SIMD, Memory64). 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다. */
export const ENGINEERING_ATLAS_WEB_PLATFORM_WASM: readonly EngineeringAtlasEntry[] = [
  {
    id: "wasm-self-built-fixed-simd",
    category: "web-platform",
    name: "WebAssembly",
    title: t("직접 빌드한 WASM 8개와 SIMD", "Eight in-house WASM binaries with SIMD"),
    status: "live",
    tagline: t(
      "커밋된 자체 .wasm 8개 중 6개 레인을 SIMD128 단일 바이너리로 빌드합니다.",
      "Six lanes among the eight committed .wasm files are built as single SIMD128 binaries.",
    ),
    background: [
      t(
        "WebAssembly(WASM)는 C++·Rust 같은 언어로 짠 계산 코드를 미리 컴파일해 브라우저 안에서 빠르게 돌리는 규격입니다. 자바스크립트로는 오래 걸리는 붓 시뮬레이션, 벡터 렌더링, 마스크 연산을 작은 바이너리에 맡기는 셈입니다. 이 저장소에는 직접 빌드해 커밋한 .wasm 이 8개 있고, 크기는 33,946바이트(먹물 커널)부터 7,871,358바이트(Vello GPU 레인)까지 다양합니다.",
        "WebAssembly (WASM) is a format for running compute code written in languages like C++ or Rust, precompiled, fast inside the browser. It hands brush simulation, vector rendering and mask math, which take long in JavaScript, to small binaries. The repository has eight .wasm files that were built in-house and committed, from 33,946 bytes (the sumi kernel) to 7,871,358 bytes (the Vello GPU lane).",
      ),
      t(
        "SIMD128은 한 명령으로 128비트 묶음(숫자 4개 안팎)을 한꺼번에 계산하는 벡터 명령입니다. 그런데 Rust 의 wasm32 기본 설정에는 simd128 이 꺼져 있어, 플래그를 주지 않으면 벡터로 풀 수 있는 커널도 하나씩 계산하는 코드로만 만들어집니다. 그래서 빌드에 -C target-feature=+simd128(Rust)과 -msimd128(C++)을 명시했습니다. 내려받을 때는 instantiateStreaming 으로 다운로드와 컴파일을 겹치고, 서버가 application/wasm 을 보내지 않으면 느린 일반 instantiate 로 물러납니다.",
        "SIMD128 is a vector instruction that computes a 128-bit bundle, about four numbers, at once. But the default wasm32 target in Rust has simd128 switched off, so without a flag even kernels that could be vectorized compile to one-at-a-time code. The build therefore states -C target-feature=+simd128 for Rust and -msimd128 for C++. At load time instantiateStreaming overlaps download and compilation, and if the server does not send application/wasm it falls back to the slower plain instantiate.",
      ),
      t(
        "SIMD 용과 비 SIMD 용을 따로 만들어 고르는 이중 빌드도 가능하지만, 고정 폭 SIMD 는 주요 브라우저가 지원하는 것으로 알려져 있어 단일 바이너리로 배포합니다(지원 시점은 webassembly.org/features 로 재확인). 대가는 SIMD 를 지원하지 않는 환경에서 그 레인이 아예 올라오지 않는다는 점입니다. 이 프로젝트는 Vite 8 의 기본 빌드 타깃(Chrome 111, Firefox 114, Safari 16.4 이상)을 그대로 쓰므로 이 가정과 어긋나지 않습니다.",
        "A dual build, with and without SIMD, is possible, but fixed-width SIMD is known to be supported by the major browsers, so a single binary ships (recheck the dates at webassembly.org/features). The cost is that in an environment without SIMD that lane does not load at all. The project keeps Vite 8's default build target (Chrome 111, Firefox 114, Safari 16.4 or newer), which fits that assumption.",
      ),
      t(
        "한계: SIMD 로 실제 속도가 얼마나 올랐는지는 아직 측정하지 않았습니다. 확인된 것은 산출물에 벡터 명령이 들어갔다는 사실뿐입니다. 기존 챕터의 '자체 Wasm 다섯 레인'은 Hokusai 까지 합쳐 여섯 레인이 맞습니다. 커밋된 8개 중 ThorVG 와 libmypaint 는 SIMD 빌드 기록을 찾지 못했습니다.",
        "Limits: how much faster SIMD made things has not been measured yet. All that is confirmed is that the artifacts contain vector instructions. The earlier chapter's five in-house lanes are really six once Hokusai is counted. Of the eight committed files, no SIMD build record was found for ThorVG and libmypaint.",
      ),
    ],
    keyPoints: [
      t("자체 .wasm 8개, 그중 6개 레인이 SIMD128", "Eight in-house .wasm files, six lanes with SIMD128"),
      t("단일 바이너리: SIMD 없는 환경은 그 레인 미로드", "One binary: no SIMD means that lane never loads"),
      t("스트리밍 컴파일, MIME 이 틀리면 느린 폴백", "Streaming compile; wrong MIME falls back slowly"),
      t("속도 향상은 아직 측정하지 않았다", "The speedup has not been measured yet"),
    ],
    diagram: {
      id: "wasm-self-built-fixed-simd-diagram",
      kind: "graph",
      title: t("소스에서 실행까지 WASM이 가는 길", "The WASM path from source to execution"),
      caption: t(
        "빌드 때 SIMD 를 명시하고, 실행 때는 내려받으며 컴파일합니다.",
        "SIMD is stated at build time, and the browser compiles while it downloads.",
      ),
      alt: t(
        "Rust 와 C++ 소스를 SIMD128 플래그로 빌드해 .wasm 파일로 커밋하고, Cloudflare 가 application/wasm 으로 내려주면 브라우저가 instantiateStreaming 으로 컴파일하며 워커에서 실행합니다. MIME 이 맞지 않으면 일반 instantiate 로 느리게 물러납니다.",
        "Rust and C++ sources are built with SIMD128 flags into committed .wasm files. Cloudflare serves them as application/wasm, and the browser compiles with instantiateStreaming and runs them in a Worker. A wrong MIME type falls back slowly to plain instantiate.",
      ),
      nodes: [
        { id: "src", label: t("Rust · C++ 소스", "Rust and C++ source"), tone: "neutral", shape: "pill", at: [0, 0] },
        {
          id: "build",
          label: t("SIMD128 빌드", "SIMD128 build"),
          sub: t("+simd128 · -msimd128", "+simd128 and -msimd128"),
          tone: "neutral",
          at: [1, 0],
        },
        {
          id: "wasm",
          label: t(".wasm 8개 커밋", "Eight .wasm committed"),
          sub: t("레인별 무결성 해시", "per-lane integrity hash"),
          tone: "neutral",
          shape: "cylinder",
          at: [2, 0],
        },
        {
          id: "edge",
          label: t("Cloudflare 서빙", "Cloudflare serving"),
          sub: t("application/wasm", "application/wasm"),
          tone: "edge",
          at: [3, 0],
        },
        {
          id: "stream",
          label: t("스트리밍 컴파일", "Streaming compile"),
          sub: t("다운로드와 컴파일 겹침", "download overlaps compile"),
          tone: "local",
          at: [4, 0],
        },
        { id: "worker", label: t("워커에서 실행", "Runs in a Worker"), tone: "good", shape: "pill", at: [5, 0] },
        {
          id: "slow",
          label: t("느린 폴백", "Slow fallback"),
          sub: t("instantiate(arrayBuffer)", "instantiate(arrayBuffer)"),
          tone: "warn",
          at: [4, 1],
        },
      ],
      edges: [
        { from: "src", to: "build" },
        { from: "build", to: "wasm" },
        { from: "wasm", to: "edge", label: t("배포", "ship") },
        { from: "edge", to: "stream", label: t("내려받기", "download") },
        { from: "stream", to: "worker" },
        { from: "stream", to: "slow", style: "dashed", label: t("MIME 불일치", "MIME mismatch") },
      ],
      groups: [
        { id: "dev", label: t("개발 PC · CI", "Dev machine and CI"), tone: "neutral", nodeIds: ["src", "build", "wasm"] },
        { id: "device", label: t("사용자 기기", "User's device"), tone: "local", nodeIds: ["stream", "worker", "slow"] },
      ],
    },
    usage: [
      {
        feature: t("자연매체 브러시 (Hokusai)", "Natural-media brush (Hokusai)"),
        role: t(
          "수채·자연매체 붓 계산을 전용 워커 안의 WASM 으로 돌립니다. 시작할 때 워커·WebAssembly·OffscreenCanvas·Web Crypto 가 있는지 확인하고, 없으면 실패를 알리고 끝냅니다.",
          "Runs watercolor and natural-media brush math as WASM inside a dedicated Worker. At start it checks for Worker, WebAssembly, OffscreenCanvas and Web Crypto and reports failure if any is missing.",
        ),
        paths: [
          "apps/web/src/domains/creator/render/studio-hokusai-live-brush.worker.ts",
          "packages/studio-hokusai-wasm/pkg/studio_hokusai_wasm.js",
          "scripts/verify-studio-hokusai-wasm.mjs",
        ],
        route: "/studio",
      },
      {
        feature: t("벡터 렌더러 (Vello)", "Vector renderer (Vello)"),
        role: t(
          "CPU 용 pkg 와 GPU 용 pkg-gpu 두 가지를 같은 SIMD 플래그로 빌드합니다.",
          "Builds the CPU pkg and the GPU pkg-gpu with the same SIMD flag.",
        ),
        paths: ["docs/engines/vello-baseline.md", "crates/studio-engine-vello/pkg-gpu/studio_engine_vello_bg.wasm"],
      },
      {
        feature: t("잉크 보정 (잉크 메시·잉크 모델러)", "Ink correction (ink-mesh and ink-modeler)"),
        role: t(
          "C++ 로 짠 획 보정 커널을 Emscripten 으로 빌드하며 모든 컴파일·링크 단계에 -msimd128 을 줍니다.",
          "C++ stroke-correction kernels are built with Emscripten and get -msimd128 at every compile and link step.",
        ),
        paths: [
          "packages/studio-brush-platform/src/ink-mesh/README.md",
          "packages/studio-brush-platform/src/ink-modeler/README.md",
        ],
      },
      {
        feature: t("보안 헤더: WASM 허용", "Security headers: allowing WASM"),
        role: t(
          "CSP script-src 에 'wasm-unsafe-eval' 이 있어 WASM 컴파일이 허용됩니다. 자바스크립트 eval 은 별도로 허용하지 않습니다.",
          "CSP script-src carries 'wasm-unsafe-eval' so WASM compiles; JavaScript eval is not allowed by it.",
        ),
        paths: ["config/http-response-headers.json", "apps/web/vite.config.ts"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("SIMD 지원 확인과 스트리밍 컴파일", "Detecting SIMD and compiling as a stream"),
        language: "ts",
        ...sampleSource([
          ["", "(module (func (result v128) v128.const i32x4 0 0 0 0)): 검증만으로 SIMD 지원을 안다", "(module (func (result v128) v128.const i32x4 0 0 0 0)): validating it alone tells whether SIMD works"],
          ["const SIMD_PROBE = new Uint8Array(["],
          ["  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,"],
          ["  10, 22, 1, 20, 0, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11,"],
          ["]);"],
          ['export const hasWasmSimd = (): boolean => typeof WebAssembly === "object" && WebAssembly.validate(SIMD_PROBE);'],
          [""],
          ["export async function loadWasm(url: string, imports: WebAssembly.Imports) {"],
          ["  const res = await fetch(url);"],
          ["  try {"],
          ["    return await WebAssembly.instantiateStreaming(res.clone(), imports);", "application/wasm 이면 다운로드와 컴파일이 겹친다", "with application/wasm, download and compile overlap"],
          ["  } catch {"],
          ["    return WebAssembly.instantiate(await res.arrayBuffer(), imports);", "느리지만 안전한 폴백", "slower but safe fallback"],
          ["  }"],
          ["}"],
        ]),
        explain: t(
          "첫 줄은 SIMD 명령 하나만 든 아주 작은 모듈입니다. 브라우저가 이 모듈을 검증(validate)하면 SIMD 를 이해한다는 뜻입니다. res.clone() 은 스트리밍이 실패해도 본문이 남아 폴백에서 다시 읽을 수 있게 해 둔 것입니다.",
          "The first lines are a tiny module holding a single SIMD instruction; if the browser validates it, the browser understands SIMD. res.clone() keeps the body readable for the fallback if streaming fails.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("빌드 플래그 (Rust · C++)", "Build flags (Rust and C++)"),
        language: "bash",
        ...sampleSource(
          [
            ["", "Rust: wasm32 기본 타깃에는 simd128 이 없어 명시한다", "Rust: the default wasm32 target lacks simd128, so state it"],
            ['RUSTFLAGS="-C target-feature=+simd128" \\'],
            ["  wasm-pack build --target web --release --out-dir pkg"],
            [""],
            ["", "C++ (Emscripten): 모든 컴파일·링크 단계에 같은 플래그를 준다", "C++ (Emscripten): pass the same flag at every compile and link step"],
            ["em++ -O3 -std=c++20 -msimd128 -c bridge.cc -o bridge.o"],
          ],
          "#",
        ),
        explain: t(
          "docs/engines/vello-baseline.md 의 Rust 빌드 명령과 잉크 메시 README 의 Emscripten 플래그를 합쳐 줄였습니다. 파일 이름은 설명용입니다.",
          "Condensed from the Rust build command in docs/engines/vello-baseline.md and the Emscripten flag in the ink-mesh README. The file names are illustrative.",
        ),
        source: "docs/engines/vello-baseline.md",
      },
    ],
    links: [
      {
        title: "WebAssembly · Feature status",
        url: "https://webassembly.org/features/",
        kind: "guide",
        note: t("SIMD 등 기능별 브라우저 지원 표(발표 직전 재확인)", "Per-feature browser support such as SIMD (recheck before presenting)"),
      },
      {
        title: "WebAssembly · fixed-width SIMD proposal",
        url: "https://github.com/WebAssembly/simd",
        kind: "repo",
      },
      {
        title: "MDN · WebAssembly.instantiateStreaming()",
        url: "https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static",
        kind: "docs",
        note: t("application/wasm MIME 요구와 사용법", "The application/wasm MIME requirement and usage"),
      },
      {
        title: "WebAssembly Core Specification",
        url: "https://webassembly.github.io/spec/core/",
        kind: "spec",
      },
    ],
    chapterIds: ["wasm-fixed-simd", "browser-local-compute"],
    talk: {
      pitch: t(
        "무거운 계산은 미리 컴파일한 작은 프로그램, 즉 WASM 에 맡깁니다. 직접 빌드한 .wasm 이 8개이고, 그중 6개 레인은 한 번에 여러 숫자를 계산하는 SIMD 옵션을 켜고 다시 빌드했습니다. 다만 실제로 몇 배 빨라졌는지는 아직 측정하지 않았다는 점을 먼저 말씀드립니다.",
        "Heavy math goes to small precompiled programs, that is, WASM. There are eight in-house .wasm files, and six lanes were rebuilt with the SIMD option that computes several numbers at once. I should say up front that how many times faster this made things has not been measured yet.",
      ),
      analogy: t(
        "계산기로 숫자를 하나씩 두드리는 것과, 한 번에 네 칸을 채워 주는 계산 틀을 쓰는 것의 차이입니다. 다만 틀을 쓴다고 항상 네 배 빨라지지는 않습니다.",
        "It is like tapping numbers into a calculator one at a time versus using a template that fills four cells at once. The template does not always make things four times faster.",
      ),
      questions: [
        {
          question: t("SIMD 를 지원하지 않는 브라우저는요?", "What about browsers without SIMD?"),
          answer: t(
            "단일 바이너리라 그 레인은 올라오지 않습니다. 이 프로젝트는 Vite 8 의 기본 빌드 타깃(Safari 16.4 이상 등)을 그대로 쓰므로 SIMD 지원 환경을 전제로 합니다. 지원 현황은 webassembly.org/features 에서 확인하세요.",
            "With a single binary that lane does not load. The project keeps Vite 8's default build target (Safari 16.4 or newer and so on), so it assumes a SIMD-capable environment. Check webassembly.org/features for the current status.",
          ),
        },
        {
          question: t("왜 자바스크립트가 아니라 WASM 인가요?", "Why WASM instead of JavaScript?"),
          answer: t(
            "붓 시뮬레이션이나 마스크 연산은 숫자 반복이 많아, 미리 컴파일된 코드가 속도를 예측하기 쉽습니다. 자바스크립트로 충분한 일은 그대로 자바스크립트로 둡니다.",
            "Brush simulation and mask math loop over many numbers, and precompiled code gives more predictable speed. Work that JavaScript handles fine stays in JavaScript.",
          ),
        },
        {
          question: t("보안은요? WASM 을 허용하면 위험하지 않나요?", "Is allowing WASM a security risk?"),
          answer: t(
            "CSP 에 'wasm-unsafe-eval' 만 열어 WASM 컴파일을 허용하고 자바스크립트 eval 은 허용하지 않습니다. 산출물은 무결성 해시로 고정합니다.",
            "The CSP opens only 'wasm-unsafe-eval' for WASM compilation and does not allow JavaScript eval. Artifacts are pinned by integrity hashes.",
          ),
        },
      ],
      pitfall: t(
        "'SIMD 로 빨라졌다'는 말은 아직 근거가 없습니다(실험 상태, 미측정). 기존 챕터의 '다섯 레인'은 여섯 레인이며, 먹물 커널은 별도 앱(brush-lab) 소속입니다. ThorVG·libmypaint 는 SIMD 빌드 기록을 확인하지 못했습니다.",
        "Saying SIMD made it faster has no evidence yet (experimental, unmeasured). The earlier chapter's five lanes are really six, and the sumi kernel belongs to a separate app (brush-lab). No SIMD build record was confirmed for ThorVG and libmypaint.",
      ),
    },
    technologies: ["WebAssembly", "Rust / WASM", "C++ / Emscripten", "fixed SIMD128", "CSP wasm-unsafe-eval"],
    facts: [
      {
        value: "8",
        label: t("저장소에 커밋된 자체 .wasm 파일 수", "In-house .wasm files committed in the repository"),
        source: "crates/studio-engine-vello/pkg-gpu/studio_engine_vello_bg.wasm",
      },
      {
        value: "7,871,358 B",
        label: t("가장 큰 .wasm (Vello GPU 레인)", "Largest .wasm (Vello GPU lane)"),
        source: "crates/studio-engine-vello/pkg-gpu/studio_engine_vello_bg.wasm",
      },
      {
        value: "33,946 B",
        label: t("가장 작은 .wasm (먹물 커널)", "Smallest .wasm (sumi kernel)"),
        source: "apps/brush-lab/wasm/sumi-kernel/pkg/sumi_kernel.wasm",
      },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "wasm-memory64-zip-crc",
    category: "web-platform",
    name: "WebAssembly Memory64",
    title: t("4GiB 벽을 넘는 주소, 지금은 ZIP 검산에만", "Addresses past the 4 GiB wall, used today only for ZIP checksums"),
    status: "live",
    tagline: t(
      "Memory64 는 1 MiB 이상 ZIP 항목의 CRC32 검산에서만 실제로 쓰입니다.",
      "Memory64 is used for real only when checksumming ZIP entries of 1 MiB or more.",
    ),
    background: [
      t(
        "일반 WebAssembly 메모리는 주소를 32비트로 세기 때문에 한 메모리가 최대 4GiB입니다. Memory64는 주소를 64비트로 세어 이 벽을 없애는 확장입니다. 아주 큰 문서를 통째로 올릴 때 필요할 수 있지만, 주소가 넓어졌다고 실제 RAM이 늘어나는 것은 아니고 웹에서는 메모리 하나가 16GiB로 제한됩니다. 코드 주석(2026-07-27 확인)도 '주소 공간은 확보 가능한 RAM이 아니다'라고 적고 있습니다.",
        "A regular WebAssembly memory counts addresses in 32 bits, so one memory tops out at 4 GiB. Memory64 counts addresses in 64 bits and removes that wall. It can matter when a very large document is loaded whole, but wider addresses do not create more RAM, and on the web one memory is capped at 16 GiB. A code comment (checked 2026-07-27) also says address space is not obtainable RAM.",
      ),
      t(
        "현재 제품에서 Memory64를 실제로 쓰는 곳은 한 군데입니다. 프로젝트 ZIP·OpenRaster·게시 패키지를 만들 때 각 항목의 CRC32(오류 검사 숫자)를 워커에서 계산하는데, 입력이 1MiB 이상이면 Memory64 WASM 커널이 맡습니다. 능력 확인은 증거를 쌓습니다. 작은 모듈이 검증을 통과하는지, 인스턴스가 만들어지는지, 64KiB 한 페이지를 grow(BigInt)로 실제로 늘릴 수 있는지를 차례로 봅니다.",
        "Exactly one place in the product really uses Memory64. When building project ZIPs, OpenRaster files and publish packages, the CRC32 (an error-check number) of each entry is computed in a Worker, and for inputs of 1 MiB or more the Memory64 WASM kernel takes over. Capability is proven by stacking evidence: a tiny module validates, an instance is created, and one 64 KiB page can really be grown with grow(BigInt).",
      ),
      t(
        "여기에 정직하게 말해야 할 긴장이 있습니다. 승인된 ADR-0021(2026-09-02)은 기본은 wasm32이고, Memory64는 4GiB 논리 오프셋이 실제로 필요할 때만 쓰며, Memory64가 없다고 기능을 자르지 않는다고 정했습니다. 그런데 CRC32 입력 상한은 256MB라 4GiB가 필요 없고, 이 경로는 Memory64가 없으면 JS로 다시 계산하지 않고 실패로 끝내도록 설계돼 있습니다. 같은 바이트를 다른 계산기로 몰래 다시 돌리지 않는 선택 고정 원칙 때문입니다.",
        "There is a tension worth stating honestly. The accepted ADR-0021 (2026-09-02) says the default is wasm32, Memory64 is used only when a 4 GiB logical offset is really needed, and a missing Memory64 must not cut features. Yet the CRC32 input cap is 256 MB, so 4 GiB is not needed, and this path is built to end in failure without Memory64 rather than recompute in JS, following the fixed-choice rule of never silently rerunning the same bytes on another calculator.",
      ),
      t(
        "그래서 코드 경로만 보면, Memory64를 지원하지 않는 브라우저에서 1MiB 이상 항목이 든 ZIP 내보내기가 실패할 수 있습니다. 이를 잡아 다른 모드로 바꾸는 상위 코드는 찾지 못했고, 실제 브라우저에서 재현해 보지는 못했습니다. 발표에서는 'Memory64는 대형 문서를 위한 보조 가속 장치'라고만 말하는 것이 안전합니다.",
        "So by the code path alone, a ZIP export containing an entry of 1 MiB or more can fail in a browser without Memory64. No upper-level code that catches this and switches mode was found, and it was not reproduced in a real browser. In a talk, the safe wording is that Memory64 is an auxiliary accelerator for large documents.",
      ),
    ],
    keyPoints: [
      t("Memory64 는 4GiB 를 넘는 64비트 주소", "Memory64 means 64-bit addresses past 4 GiB"),
      t("실제 사용처는 1MiB 이상 ZIP 항목의 CRC32", "Real use: CRC32 of ZIP entries of 1 MiB or more"),
      t("ADR-0021: wasm32 가 기본, 부재가 기능을 자르면 안 됨", "ADR-0021: wasm32 is default; absence must not cut features"),
      t("미지원이면 종단 실패 가능, 실브라우저 미재현", "May end in failure if unsupported; not reproduced"),
    ],
    diagram: {
      id: "wasm-memory64-zip-crc-diagram",
      kind: "graph",
      title: t("CRC32 계산기를 고르는 길", "How the CRC32 calculator is chosen"),
      caption: t(
        "입력이 1MiB 이상이면 Memory64 커널로 가고, 미지원이면 다시 계산하지 않고 실패합니다.",
        "Inputs of 1 MiB or more go to the Memory64 kernel, and without support the job fails instead of recomputing.",
      ),
      alt: t(
        "ZIP 항목의 CRC32 계산이 시작되면 입력 크기를 먼저 봅니다. 1MiB 보다 작으면 JS 참조 커널이 계산하고, 1MiB 이상이면 Memory64 지원을 확인해 지원하면 WASM 커널이, 지원하지 않으면 JS 로 재계산하지 않고 실패로 끝납니다.",
        "A ZIP entry's CRC32 job first looks at the input size. Under 1 MiB, the JS reference kernel computes it; at 1 MiB or more, Memory64 support is checked, and the WASM kernel runs if supported, otherwise the job ends in failure without recomputing in JS.",
      ),
      nodes: [
        { id: "start", label: t("ZIP 항목 CRC32", "ZIP entry CRC32"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "size", label: t("1 MiB 이상?", "1 MiB or more?"), tone: "neutral", shape: "diamond", at: [1, 0] },
        {
          id: "js",
          label: t("JS 참조 커널", "JS reference kernel"),
          sub: t("작은 입력은 JS 로 계산", "small inputs stay in JS"),
          tone: "local",
          at: [2, 0],
        },
        { id: "done", label: t("CRC32 → ZIP 헤더", "CRC32 into ZIP header"), tone: "good", shape: "pill", at: [3, 0] },
        { id: "m64", label: t("Memory64 지원?", "Memory64 supported?"), tone: "neutral", shape: "diamond", at: [1, 1] },
        {
          id: "kernel",
          label: t("Memory64 커널", "Memory64 kernel"),
          sub: t("WASM, 메모리 최대 약 244 MiB", "WASM, up to ~244 MiB"),
          tone: "good",
          at: [2, 1],
        },
        {
          id: "fail",
          label: t("종단 실패", "Terminal failure"),
          sub: t("JS 로 재계산하지 않음", "no recompute in JS"),
          tone: "warn",
          at: [1, 2],
        },
      ],
      edges: [
        { from: "start", to: "size" },
        { from: "size", to: "js", label: t("아니오", "no") },
        { from: "js", to: "done" },
        { from: "size", to: "m64", label: t("예", "yes") },
        { from: "m64", to: "kernel", label: t("지원", "yes") },
        { from: "kernel", to: "done" },
        { from: "m64", to: "fail", label: t("미지원", "no"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("프로젝트 ZIP·OpenRaster·게시 패키지 내보내기", "Project ZIP, OpenRaster and publish-package export"),
        role: t(
          "항목마다 CRC32 를 워커에서 계산하고, 1MiB 이상이면 Memory64 커널이 맡습니다. 내보내기 코드는 기본 실행 모드를 worker 로 둡니다.",
          "Each entry's CRC32 is computed in a Worker, and the Memory64 kernel handles entries of 1 MiB or more. Export code defaults the execution mode to worker.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-package-archive.ts",
          "apps/web/src/domains/creator/studio-crc32-worker-client.ts",
          "apps/web/src/domains/creator/studio-crc32.worker.ts",
          "apps/web/src/domains/creator/render/studio-wasm-crc32-kernel.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("능력 확인과 메모리 창 관리", "Capability probe and memory windows"),
        role: t(
          "검증 → 인스턴스 → 한 페이지 grow 의 3단계 증거를 보고, 기본 창은 64MiB, 단일 뷰는 256MiB 까지로 제한합니다.",
          "Reads three stages of evidence (validate, instantiate, grow one page) and limits the default window to 64 MiB and a single view to 256 MiB.",
        ),
        paths: ["apps/web/src/domains/creator/studio-wasm64-memory-governor.ts"],
      },
      {
        feature: t("정책 근거 (ADR-0021)", "Policy basis (ADR-0021)"),
        role: t(
          "기본은 wasm32 + OPFS 창이고, Memory64 는 4GiB 오프셋이 실제로 필요한 대형 문서에서만 켭니다.",
          "The default is wasm32 plus OPFS windows; Memory64 is enabled only for large documents that truly need a 4 GiB offset.",
        ),
        paths: ["docs/adr/0021-stroke-budget-myb-disposition-execution-profiles.md"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("Memory64 를 실제로 확인하는 프로브", "A probe that really checks Memory64"),
        language: "ts",
        ...sampleSource([
          ["", '(module (memory (export "memory") i64 1 2)): 한계 플래그 0x05 = 최대값(0x01) | 64비트 주소(0x04)', '(module (memory (export "memory") i64 1 2)): limits flag 0x05 = has-maximum (0x01) | 64-bit address (0x04)'],
          ["const MEM64_PROBE = new Uint8Array(["],
          ["  0, 97, 115, 109, 1, 0, 0, 0,"],
          ["  5, 4, 1, 5, 1, 2,"],
          ["  7, 10, 1, 6, 109, 101, 109, 111, 114, 121, 2, 0,"],
          ["]);"],
          [""],
          ["export function hasMemory64(): boolean {"],
          ['  if (typeof WebAssembly !== "object" || !WebAssembly.validate(MEM64_PROBE)) return false;'],
          ["  try {"],
          ["    const { exports } = new WebAssembly.Instance(new WebAssembly.Module(MEM64_PROBE));"],
          ["    return (exports.memory as WebAssembly.Memory).buffer.byteLength === 65536;", "한 페이지(64KiB)를 실제로 확보했는가", "was one 64 KiB page really obtained?"],
          ["  } catch {"],
          ["    return false;", "기능 탐지는 절대 던지지 않는다", "feature detection never throws"],
          ["  }"],
          ["}"],
        ]),
        explain: t(
          "'검증을 통과했다'와 '실제로 메모리를 얻었다'는 다른 증거입니다. 실제 코드는 여기에 grow(BigInt) 로 한 페이지를 늘려 보는 단계까지 확인합니다.",
          "Passing validation and actually obtaining memory are different evidence. The real code goes one step further and grows one page with grow(BigInt).",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("실패하면 다른 계산기로 몰래 바꾸지 않는 실행기", "An executor that never silently switches calculator"),
        language: "ts",
        ...sampleSource([
          ["type Crc32 = (bytes: Uint8Array) => number;"],
          ["class Crc32UnavailableError extends Error {}"],
          [""],
          ["export function makeExecutor(jsCrc: Crc32, createKernel: () => Crc32 | null, minimumWasmBytes = 1024 * 1024): Crc32 {"],
          ["  let kernel: Crc32 | null | undefined;"],
          ["  let unavailable: Crc32UnavailableError | null = null;"],
          ["  return (bytes) => {"],
          ["    if (bytes.byteLength < minimumWasmBytes) return jsCrc(bytes);", "작은 입력은 JS 로", "small inputs stay in JS"],
          ["    if (unavailable) throw unavailable;", "한 번 실패하면 계속 실패", "once failed, keep failing"],
          ["    if (kernel === undefined) kernel = createKernel();"],
          ["    if (kernel === null) {"],
          ['      unavailable = new Crc32UnavailableError("Memory64 unavailable");'],
          ["      throw unavailable;", "JS 로 같은 바이트를 다시 계산하지 않는다", "never recompute the same bytes in JS"],
          ["    }"],
          ["    return kernel(bytes);"],
          ["  };"],
          ["}"],
        ]),
        explain: t(
          "입력 크기로 계산기를 먼저 정하고, 큰 입력에서 Memory64 커널을 못 얻으면 오류를 던져 끝냅니다. 이것이 '선택 고정'이며, 동시에 Memory64 가 없는 환경을 자를 수 있는 지점이기도 합니다.",
          "The calculator is fixed by input size first, and if a large input cannot get the Memory64 kernel the executor throws and stops. That is the fixed-choice rule, and also the exact point where an environment without Memory64 can be cut off.",
        ),
        source: "apps/web/src/domains/creator/render/studio-wasm-crc32-kernel.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "WebAssembly 3.0 Completed",
        url: "https://webassembly.org/news/2025-09-17-wasm-3.0/",
        kind: "article",
        note: t("Memory64 가 표준에 들어간 공식 발표", "The official announcement that Memory64 entered the standard"),
      },
      {
        title: "WebAssembly · Feature status",
        url: "https://webassembly.org/features/",
        kind: "guide",
        note: t("브라우저별 Memory64 지원 표(발표 직전 재확인)", "Per-browser Memory64 support (recheck before presenting)"),
      },
      {
        title: "WebAssembly JS API · Memories",
        url: "https://webassembly.github.io/spec/js-api/#memories",
        kind: "spec",
      },
      {
        title: "WebAssembly · memory64 proposal",
        url: "https://github.com/WebAssembly/memory64",
        kind: "repo",
      },
    ],
    chapterIds: ["browser-local-compute", "worker-architecture"],
    talk: {
      pitch: t(
        "WebAssembly 의 기본 메모리는 4GiB 가 한계인데, Memory64 는 그 벽을 넘는 확장입니다. 큰 문서를 위한 기반을 만들어 두었지만 지금 제품이 실제로 쓰는 곳은 ZIP 내보내기의 CRC32 검산 한 군데입니다. 그리고 이 경로가 우리 ADR 의 방침과 어긋날 수 있다는 점을 숨기지 않고 점검 대상으로 올려 두었습니다.",
        "WebAssembly's default memory tops out at 4 GiB, and Memory64 is the extension that goes past that wall. Groundwork for large documents exists, but the one place the product really uses it today is the CRC32 check in ZIP export. And rather than hide it, we list the possibility that this path conflicts with our own ADR as something to review.",
      ),
      analogy: t(
        "주소가 넓어지는 것은 도시의 번지수 자릿수를 늘리는 것과 같습니다. 번지수 자릿수를 늘렸다고 집(RAM)이 저절로 생기지는 않습니다.",
        "Wider addresses are like adding digits to a city's street numbers. More digits do not build more houses (RAM).",
      ),
      questions: [
        {
          question: t("Memory64 가 있으면 더 빠른가요?", "Is Memory64 faster?"),
          answer: t(
            "아닙니다. ADR-0021 도 Memory64 는 더 빠른 기능이 아니라 4GiB 주소 공간이 필요할 때 쓰는 기능이며 워크로드에 따라 느려질 수 있다고 적었습니다.",
            "No. ADR-0021 also says Memory64 is not a faster feature but one for when a 4 GiB address space is needed, and it can be slower depending on the workload.",
          ),
        },
        {
          question: t("지원하지 않는 브라우저에서도 ZIP 내보내기가 되나요?", "Does ZIP export work in browsers without it?"),
          answer: t(
            "코드 경로만 보면 1MiB 이상 항목이 있을 때 실패할 수 있습니다. 실제 브라우저에서 재현하지 못했고, 기본을 wasm32 로 맞추는 안이 점검 후보입니다.",
            "By the code path alone it can fail when an entry is 1 MiB or more. It was not reproduced in a real browser, and making wasm32 the default is a candidate fix to review.",
          ),
        },
        {
          question: t("왜 실패하면 JS 로 다시 계산하지 않나요?", "Why not recompute in JS on failure?"),
          answer: t(
            "선택 고정 원칙입니다. 같은 바이트를 다른 계산기로 몰래 다시 돌리면 중복 실행과 불투명한 오류가 생깁니다. 다만 이 원칙이 미지원 환경을 자를 수 있다는 점이 지금의 쟁점입니다.",
            "It is the fixed-choice rule: silently rerunning the same bytes elsewhere causes duplicate work and opaque errors. The open issue is that this rule can cut off unsupported environments.",
          ),
        },
      ],
      pitfall: t(
        "'제품이 Memory64 위에서 돈다'고 말하지 마세요. 실사용은 CRC32 한 곳이며, 대형 문서용 Memory64 코디네이터와 런타임은 구현·테스트만 있고 호출처가 없습니다. 미지원 환경의 ZIP 내보내기 실패는 실브라우저로 재현하지 못한 추정이고, 브라우저별 지원(코드 주석 기준 Safari 미지원)은 재확인이 필요합니다.",
        "Do not say the product runs on Memory64. Real use is the one CRC32 path; the large-document Memory64 coordinator and runtime have implementation and tests but no callers. The ZIP-export failure in unsupported environments is an inference not reproduced in a real browser, and per-browser support (Safari unsupported per a code comment) needs rechecking.",
      ),
    },
    technologies: ["WebAssembly", "Memory64", "Dedicated Worker", "CRC32", "ZIP"],
    facts: [
      {
        value: "1 MiB",
        label: t("Memory64 CRC32 커널을 쓰는 최소 입력 크기", "Minimum input size that uses the Memory64 CRC32 kernel"),
        source: "apps/web/src/domains/creator/render/studio-wasm-crc32-kernel.ts",
      },
      {
        value: "256,000,000 B",
        label: t("CRC32 워커 입력 상한(4GiB 보다 훨씬 작다)", "CRC32 Worker input cap (far below 4 GiB)"),
        source: "apps/web/src/domains/creator/studio-crc32-worker-protocol.ts",
      },
      {
        value: "16 GiB",
        label: t("웹에서 메모리 하나의 주소 한계(코드 주석)", "Per-memory address limit on the web (code comment)"),
        source: "apps/web/src/domains/creator/studio-wasm64-memory-governor.ts",
      },
    ],
    reviewedAt: "2026-10-07",
  },
];
