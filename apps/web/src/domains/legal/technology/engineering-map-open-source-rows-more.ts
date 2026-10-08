import { AS_OF, same, t } from "./engineering-map-open-source-kit";

import type { EngineeringMapRow } from "./engineering-map-types";

/**
 * 기술 지도 · open-source 의 행 — AI·비전, 출력, 고쳐 쓴 것과 자체 제작.
 * 한 파일이 1,000줄을 넘지 않도록 engineering-map-open-source-rows.ts 에서 나눴고, 그쪽에서 이 배열을 이어 붙인다.
 * 작성 기준은 engineering-map-open-source-kit.ts 머리말을 따른다.
 */

/** AI·비전 */
const AI_VISION_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "onnxruntime-web",
    name: "ONNX Runtime Web",
    status: "live",
    link: { title: "ONNX Runtime Web", url: "https://onnxruntime.ai/docs/tutorials/web/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "AI 모델을 서버 없이 내 기기에서 실행하는 엔진. 배경 제거(U-2-Netp), 선화 채색(Tag2Pix), 업스케일(Real-ESRGAN), 윤곽 추출(TEED), 애니풍 변환(AnimeGANv2)에 쓴다.",
        "An engine that runs AI models on your own device without a server: background removal (U-2-Netp), line-art colorizing (Tag2Pix), upscaling (Real-ESRGAN), edge extraction (TEED) and anime-style conversion (AnimeGANv2).",
      ),
      license: t("MIT (모델은 파일별)", "MIT (models: per file)"),
      mode: t("WASM·WebGPU · 지연 로드", "WASM and WebGPU · lazy"),
      note: t(
        "모델 파일 6개(합계 119,438,571B)가 저장소 안에 있고, 바이트 길이와 SHA-256을 확인한 뒤 실행한다. 모델별 원본·라이선스·학습 데이터는 *.LICENSE.md에 기록했다. WebGPU 또는 WASM(CPU)으로 돌고 결과에 어느 쪽인지 남긴다.",
        "Six model files (119,438,571 bytes in total) live in the repository and run only after their byte length and SHA-256 are checked. Each model's origin, license and training data are recorded in a *.LICENSE.md. It runs on WebGPU or WASM (CPU) and the result records which one.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/studio-onnx-runtime-assets.ts",
      "apps/web/src/domains/creator/studio-onnx-inference-provider.ts",
      "apps/web/src/domains/creator/assets/u2netp.LICENSE.md",
      "apps/web/src/domains/creator/assets/tag2pix.LICENSE.md",
    ],
  },
  {
    id: "transformers-js",
    name: "Transformers.js",
    status: "configured",
    link: { title: "Transformers.js", url: "https://github.com/huggingface/transformers.js" },
    asOf: AS_OF,
    cells: {
      role: t(
        "한글 검색어를 영어로 번역하는 작은 언어 모델(OPUS-MT)을 브라우저에서 돌린다. 해외 소재 검색의 '모델 단계'이고, 모델이 없으면 사전과 원문으로 대신한다.",
        "Runs a small translation model (OPUS-MT) in the browser to turn Korean search words into English. It is the model step of the overseas-asset search, and without the model the search falls back to a dictionary and the original text.",
      ),
      license: same("Apache-2.0"),
      mode: t("WASM · 지연 로드 · 자체 호스팅", "WASM · lazy · self-hosted"),
      note: t(
        "모델 약 123MB는 저장소에 없고 배포할 때 dist/models/Xenova/opus-mt-ko-en/에 두어야 켜진다. 배치 스크립트를 저장소에서 찾지 못해, 실제 배포에서 켜져 있는지는 확인하지 못했다.",
        "The model (about 123 MB) is not in the repository and only turns on when placed under dist/models/Xenova/opus-mt-ko-en/ at deploy time. We found no placement script, so whether it is on in the real deployment is unverified.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator-resources/research-query-mt.ts",
      "apps/web/src/domains/creator-resources/research-query-translation.ts",
      "package.json",
    ],
  },
  {
    id: "mediapipe",
    name: "MediaPipe Tasks Vision",
    status: "live",
    link: { title: "MediaPipe", url: "https://developers.google.com/edge/mediapipe/solutions/guide" },
    asOf: AS_OF,
    cells: {
      role: t(
        "웹캠으로 얼굴·손·자세를 읽어 VRM 마네킹을 움직이고, 사진에서 배경을 분리하고(selfie segmenter), 아바타 참고 이미지를 숫자 벡터(임베딩)로 바꿔 비슷한 것을 찾는다.",
        "Reads face, hands and pose from a webcam to drive a VRM mannequin, separates backgrounds in photos (selfie segmenter), and turns avatar reference images into number vectors (embeddings) to find similar ones.",
      ),
      license: same("Apache-2.0"),
      mode: t("WASM · 지연 로드 · 모델 다운로드", "WASM · lazy · model download"),
      note: t(
        "WASM은 같은 출처의 해시 자산이지만 모델 파일은 Google 스토리지에서 런타임에 내려받는다. SHA-256으로 고정된 것은 임베더 1개뿐이고 배경 분리 모델은 latest 리비전이라, '전부 로컬'이라고 말할 수 없다.",
        "The WASM is a same-origin hashed asset, but model files are downloaded from Google storage at runtime. Only the embedder is pinned by SHA-256, and the background-segmentation model uses the latest revision, so we cannot say everything is local.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/studio-mediapipe-vision-assets.ts",
      "apps/web/src/domains/creator/studio-bg-remove.ts",
      "apps/web/src/domains/creator/vrm/studio-vrm-webcam-tracking.ts",
    ],
  },
  {
    id: "opencv-js",
    name: "OpenCV.js",
    status: "live",
    link: { title: "OpenCV.js", url: "https://github.com/TechStark/opencv-js" },
    asOf: AS_OF,
    cells: {
      role: t(
        "널리 쓰이는 컴퓨터 비전 도구 OpenCV를 WASM으로 옮긴 것. 마스크에서 윤곽선을 찾아 경로(벡터)로 바꾸는 이미지→벡터 변환에 쓴다.",
        "The widely used computer-vision toolkit OpenCV compiled to WASM. It finds contours in a mask and converts them into vector paths for image-to-vector conversion.",
      ),
      license: same("Apache-2.0"),
      mode: t("WASM · 지연 로드", "WASM · lazy"),
      note: t(
        "OpenCV 객체(Embind 핸들)를 만든 역순으로 모두 지워 메모리 누수를 막고, 입력은 가로세로 8,192px로 제한한다. 스마트 선택용 Worker 경로는 제품 화면에 연결되지 않았다. 설치본 opencv.js는 약 13.3MB.",
        "Every OpenCV object (Embind handle) is deleted in reverse creation order to prevent memory leaks, and input is capped at 8,192 px per side. The Worker path for smart selection is not wired into a product screen. The installed opencv.js is about 13.3 MB.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/studio-opencv-selection.ts",
      "apps/web/src/domains/creator/studio-image-trace.ts",
      "apps/web/src/domains/creator/StudioRasterVectorizeButton.tsx",
    ],
  },
];

/** 출력·변환 */
const OUTPUT_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "wasm-vips",
    name: "wasm-vips",
    status: "live",
    link: { title: "wasm-vips", url: "https://github.com/kleisauke/wasm-vips" },
    asOf: AS_OF,
    cells: {
      role: t(
        "libvips(이미지 처리 라이브러리)를 WASM으로 옮긴 것. 한 변이 8192px를 넘고 16,384² 화소 이내인 초대형 페이지를 최종 내보낼 때 Lanczos3 방식으로 줄이는 데 쓴다.",
        "libvips (an image-processing library) compiled to WASM. It downsizes very large pages, over 8192 px on a side and within 16,384² pixels, with the Lanczos3 kernel during final export.",
      ),
      license: t("MIT (내장 libvips는 LGPL)", "MIT (bundled libvips: LGPL)"),
      mode: t("WASM · 지연 로드 · 내보내기", "WASM · lazy · export"),
      note: t(
        "래퍼는 MIT지만 내장 libvips·libheif 등은 LGPL이다. 고지 생성기는 THIRD-PARTY-NOTICES.md를 수집하지 않아 생성 고지에는 MIT로만 나온다. 레지스트리는 'LGPL 격리 필수·dev-only 후보'인데 코드상 내보내기에서 도달한다.",
        "The wrapper is MIT, but the bundled libvips, libheif and others are LGPL. The notice generator does not collect THIRD-PARTY-NOTICES.md, so the generated notice shows MIT only. The registry says LGPL isolation is required and it is a dev-only candidate, yet export code can reach it.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/export/studio-vips-export.ts",
      "apps/web/src/domains/creator/render/studio-raster-export-orchestration-runtime.ts",
      "packages/studio-engine-registry/src/filter-providers.ts",
      "scripts/generate-third-party-notices.mjs",
    ],
  },
  {
    id: "psd-pdf-formats",
    name: "ag-psd · pdf-lib · pdf.js",
    status: "live",
    link: { title: "ag-psd", url: "https://github.com/Agamnentzar/ag-psd" },
    asOf: AS_OF,
    cells: {
      role: t(
        "다른 프로그램과 주고받는 파일: Photoshop PSD 레이어 내보내기·가져오기와 ABR 브러시 가져오기(ag-psd), PDF 조립·편집(pdf-lib), PDF 보기·썸네일(pdf.js).",
        "Files exchanged with other programs: Photoshop PSD layer export and import plus ABR brush import (ag-psd), PDF assembly and editing (pdf-lib), and PDF viewing and thumbnails (pdf.js).",
      ),
      license: same("MIT · Apache-2.0"),
      mode: t("런타임 · 지연 로드", "Runtime · lazy"),
      note: t(
        "ag-psd는 pnpm 패치 1개로 ABR 오류 경로의 Node 전용 require('util')를 걷어냈다(브라우저 호환). 이 패치의 전용 회귀 테스트는 찾지 못했다.",
        "One pnpm patch removes a Node-only require('util') from ag-psd's ABR error path (browser compatibility). We found no dedicated regression test for that patch.",
      ),
    },
    evidence: [
      "patches/ag-psd@31.0.1.patch",
      "apps/web/src/domains/creator/export/studio-psd-export.ts",
      "apps/web/src/domains/creator/studio-abr-import.ts",
      "apps/web/src/domains/creator/pdf-workbench/pdf-workbench-engine.ts",
    ],
  },
  {
    id: "remotion",
    name: "Remotion",
    status: "live",
    link: { title: "Remotion", url: "https://www.remotion.dev/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "React로 영상을 만드는 도구. 공개 '제품 투어' 영상을 웹에서 재생하고(@remotion/player), 홍보·브랜드 영상을 렌더하는 별도 도구에도 쓴다.",
        "A tool for making video with React. It plays the public product-tour video on the web (@remotion/player) and also powers a separate tool that renders promo and brand films.",
      ),
      license: t("Remotion License(SPDX 아님)", "Remotion License (not an SPDX ID)"),
      mode: t("런타임 · 마케팅 페이지", "Runtime · marketing page"),
      note: t(
        "자격 조건에 따라 무료 사용 또는 Company License가 필요한 자체 라이선스다. 저장소는 패키지·버전·라이선스 문구 해시를 고정해 감시하지만, 배포 법인이 대상인지는 저장소로 확인할 수 없다.",
        "A custom license: free use depending on eligibility, otherwise a Company License. The repository pins the package, version and license-text hash and audits them, but whether the distributing entity qualifies cannot be verified from the repository.",
      ),
    },
    evidence: [
      "THIRD_PARTY_NOTICES.md",
      "apps/web/src/domains/marketing/ProductTourPlayer.tsx",
      "scripts/generate-third-party-notices.mjs",
    ],
  },
  {
    id: "resvg-harfbuzz",
    name: "resvg · HarfBuzz",
    status: "experimental",
    link: { title: "resvg", url: "https://github.com/linebender/resvg" },
    asOf: AS_OF,
    cells: {
      role: t(
        "SVG 그림을 픽셀로 바꾸는 엔진(resvg)과 한글·세로쓰기 글자 모양을 잡는 엔진(HarfBuzz). 각각을 감싸는 provider 모듈과 테스트까지 만들었다.",
        "An engine that turns SVG drawings into pixels (resvg) and one that shapes Korean and vertical-writing glyphs (HarfBuzz). Each has a wrapping provider module and tests.",
      ),
      license: same("MPL-2.0 · MIT"),
      mode: t("WASM · 제품 미연결", "WASM · not wired in"),
      note: t(
        "제품 코드가 이 provider들을 import하지 않는다(2026-10-07 스캔). SVG는 Vello 또는 ThorVG를 사전 계획으로 고르고, resvg는 시각 비교용 QA 기준일 뿐이다. HarfBuzz는 나중에 따로 고를 수 있는 후보로 주석에 적혀 있다.",
        "Product code does not import these providers (scan of 2026-10-07). An SVG is planned onto Vello or ThorVG beforehand, and resvg is only a QA reference for visual comparison. A code comment lists HarfBuzz as a candidate that could be selected separately later.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/studio-resvg-svg-provider.ts",
      "apps/web/src/domains/creator/studio-harfbuzz-shaping-provider.ts",
      "apps/web/src/domains/creator/studio-interchange-capabilities.ts",
      "apps/web/src/domains/creator/render/studio-canvaskit-quality-engine.ts",
    ],
  },
];

/** 패치·포크·자체 기여 */
const PATCH_FORK_OWN_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "pnpm-patches-overrides",
    name: "pnpm patches · overrides",
    status: "live",
    link: { title: "pnpm patch", url: "https://pnpm.io/cli/patch" },
    asOf: AS_OF,
    cells: {
      role: t(
        "설치된 라이브러리를 정확한 버전에 묶어 고쳐 쓴 기록(패치 8개)과, 하위 의존성의 버전을 강제로 정한 규칙(override 50개 — 대부분 보안 권고 대응, 일부는 도구 버전 통일). 설치할 때 pnpm이 자동으로 적용한다.",
        "Records of installed libraries edited at exact versions (8 patches) and rules that force sub-dependency versions (50 overrides, mostly answering security advisories and some aligning tool versions). pnpm applies both automatically at install time.",
      ),
      license: t("원본 라이선스를 따름", "Follows each original"),
      mode: t("설치 단계(pnpm)", "Install step (pnpm)"),
      note: t(
        "패치 8개: 운영 CSP 호환 3(glTF Transform·manifold-3d·ktx2-encoder), 브라우저 호환 1(ag-psd), R3F 1, 결정성 1(p5.brush), 보안 호환 2(braces·minimatch). 상류에 낸 PR은 저장소에서 찾지 못했다.",
        "The 8 patches: production-CSP compatibility 3 (glTF Transform, manifold-3d, ktx2-encoder), browser compatibility 1 (ag-psd), R3F 1, determinism 1 (p5.brush) and security compatibility 2 (braces, minimatch). We found no upstream PR in the repository.",
      ),
    },
    evidence: [
      "pnpm-workspace.yaml",
      "patches/@react-three__fiber@9.6.1.patch",
      "patches/minimatch@3.1.5.patch",
      "scripts/minimatch-security-compat.test.mjs",
    ],
  },
  {
    id: "wgpu-toon",
    name: "wgpu-toon",
    status: "configured",
    link: { title: "wgpu", url: "https://github.com/gfx-rs/wgpu" },
    asOf: AS_OF,
    cells: {
      role: t(
        "Rust 그래픽 라이브러리 wgpu 29.0.4에 패치 1개를 얹은 벤더 포크. 페이지가 이미 가진 GPU 장치를 wgpu가 넘겨받게 해, 그림 데이터를 CPU로 되읽지 않고 같은 장치 안에서 쓴다.",
        "A vendored fork of the Rust graphics library wgpu 29.0.4 with one patch. It lets wgpu adopt the GPU device the page already owns, so image data is used on the same device instead of being read back to the CPU.",
      ),
      license: same("MIT OR Apache-2.0"),
      mode: t("Rust · 벤더 포크 · 피처 뒤", "Rust · vendored fork · behind a feature"),
      note: t(
        "변경은 모두 toon-fabric 피처 뒤에 있다. 실측(2026-08-08, Chromium 140 headless): 교환 비용 1.89~2.43배 개선, 읽은 바이트는 기존 경로와 일치. 상류 PR 후보로만 기록했고 실제 제출 근거는 못 찾았다.",
        "Every change sits behind the toon-fabric feature. Measured on 2026-08-08 in Chromium 140 headless: exchange cost improved 1.89x to 2.43x and the bytes read matched the old path. It is recorded only as an upstream PR candidate; we found no evidence it was submitted.",
      ),
    },
    evidence: [
      "crates/vendor/wgpu-toon/PATCHES/0001-webgpu-handle-adoption.patch",
      "crates/vendor/wgpu-toon/UPSTREAM.sha256",
      "docs/engines/vello-baseline.md",
      "tests/benchmarks/results/toon-vello-fork.json",
      "crates/studio-engine-vello/tests/vendor_patch_parity.rs",
    ],
  },
  {
    id: "own-wasm-builds",
    name: "Emscripten · wasm-pack builds",
    status: "live",
    link: { title: "Emscripten", url: "https://emscripten.org/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "직접 컴파일한 WASM들. Google Ink·libmypaint는 C++를 Emscripten으로, Hokusai 래퍼·Vello 어댑터는 Rust를 wasm-pack으로 빌드했고, ThorVG는 npm의 wasm을 바이트 그대로 복사했다.",
        "WASM binaries we compile ourselves: Google Ink and libmypaint from C++ with Emscripten, and the Hokusai wrapper and Vello adapter from Rust with wasm-pack, while ThorVG's wasm is a byte-for-byte copy from npm.",
      ),
      license: t("원본 따름(Apache-2.0·ISC·MIT 등)", "Per upstream (Apache-2.0, ISC, MIT, ...)"),
      mode: t("빌드 · 해시 고정", "Build · hash-pinned"),
      note: t(
        "산출물마다 INTEGRITY.sha256를 두고 verify-studio-engine.mjs가 검증하며, Hokusai는 --rebuild로 바이트가 같은지까지 확인한다. 다만 Ink 재빌드는 저장소 밖 ~/toolchains/ink가 있어야 해 저장소만으로는 재현되지 않는다.",
        "Each artifact has an INTEGRITY.sha256 checked by verify-studio-engine.mjs, and Hokusai is also rebuilt with --rebuild to confirm identical bytes. The Ink rebuild, however, needs ~/toolchains/ink outside the repository, so it is not reproducible from the repo alone.",
      ),
    },
    evidence: [
      "packages/studio-hokusai-wasm/pkg/INTEGRITY.sha256",
      "packages/studio-engine-thorvg/wasm/INTEGRITY.sha256",
      "scripts/verify-studio-engine.mjs",
      "scripts/verify-studio-hokusai-wasm.mjs",
      "packages/studio-brush-platform/src/ink-mesh/README.md",
    ],
  },
  {
    id: "hand-ported-code",
    name: "dli/paint · croquis.js · Klecks · open-km",
    status: "live",
    link: { title: "dli/paint", url: "https://github.com/dli/paint" },
    asOf: AS_OF,
    cells: {
      role: t(
        "MIT 오픈소스의 알고리즘을 우리 환경(TypeScript·WGSL)에 맞게 손으로 옮기거나 다시 구현한 코드: 물감 셰이더, 캡슐 펜, 필터 커널, 혼색 수학. 원문 라이선스는 고지에 그대로 내장한다.",
        "Code where we hand-ported or reimplemented algorithms from MIT-licensed open source for our own environment (TypeScript and WGSL): paint shaders, a capsule pen, filter kernels and color-mixing math. The original license texts are embedded in the notices.",
      ),
      license: t("MIT (원문 내장)", "MIT (text embedded)"),
      mode: t("자체 코드 · 고지 내장", "In-house code · notice embedded"),
      note: t(
        "Krita 분무 수식은 'math only, no code copy'로 GPL 코드를 가져오지 않았다. inkwash는 소유자 허락만 있고 근거 기록은 TODO라 '이식 안 함, 연구만'으로 적혀 있다. WebGL-Fluid-Simulation 원문은 third_party에 있으나 고지 내장 목록에는 없다.",
        "The Krita spray formula is 'math only, no code copy', so no GPL code was taken. For inkwash only the owner's permission exists and the evidence record is a TODO, so it is listed as research only, nothing ported. The WebGL-Fluid-Simulation license text sits in third_party but not in the embedded notice list.",
      ),
    },
    evidence: [
      "third_party/dli-paint/LICENSE",
      "scripts/generate-third-party-notices.mjs",
      "apps/web/src/domains/creator/studio-oss-brush-kernels.ts",
      "third_party/inkwash/README.md",
      "third_party/webgl-fluid-simulation/LICENSE",
    ],
  },
  {
    id: "toonbridge",
    name: "Local ToonBridge",
    status: "configured",
    asOf: AS_OF,
    cells: {
      role: t(
        "G'MIC·GEGL·Blender·Inkscape·FFmpeg 같은 외부 프로그램 25종을 서비스에 넣지 않고, 사용자가 자기 PC에 설치한 것을 로컬 브리지로만 호출하는 연결 장치.",
        "A connector that never ships 25 external programs such as G'MIC, GEGL, Blender, Inkscape and FFmpeg; it only calls the copies users installed on their own PC through a local bridge.",
      ),
      license: t("혼합(GPL·AGPL·LGPL 등)", "Mixed (GPL, AGPL, LGPL, ...)"),
      mode: t("별도 프로세스 · 로컬 브리지", "Separate process · local bridge"),
      note: t(
        "설치·재배포하지 않고 shell:false와 허용된 작업 목록으로만 실행한다. 문서는 이것이 '기술적 격리 경계이지 법적 결론이 아님'이라 밝힌다. 사용자가 프로그램을 설치해야 동작한다.",
        "Nothing is installed or redistributed; programs run only with shell:false and an allowlist of operations. The docs say this is a technical isolation boundary, not a legal conclusion. It works only if the user installs the programs.",
      ),
    },
    evidence: ["tools/toonbridge/README.md", "config/studio-production-toolchain.json", "docs/studio/production-toolchain.md"],
  },
  {
    id: "notice-generator",
    name: "generate-third-party-notices",
    status: "live",
    link: { title: "SPDX License List", url: "https://spdx.org/licenses/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "빌드할 때 모든 의존성의 라이선스 고지를 자동으로 만들고 검사하는 우리 스크립트. 허용 목록에 없는 라이선스가 들어오면 감사가 실패하고, 앱 안 도움말의 라이선스 화면이 이 결과를 보여 준다.",
        "Our script that generates and checks license notices for every dependency at build time. A license outside the allowlist fails the audit, and the license screen in the in-app help shows its output.",
      ),
      license: same("—"),
      mode: t("빌드 · postbuild", "Build · postbuild"),
      note: t(
        "이번 점검에서 감사는 통과했다(pnpm 584건, Vello CPU 85·GPU 137 crate, 불투명 WASM 3종). 다만 THIRD-PARTY-NOTICES.md 같은 이름의 파일은 수집하지 않아 wasm-vips가 MIT로만 나온다.",
        "The audit passed in this review (584 pnpm entries, 85 Vello CPU and 137 GPU crates, 3 opaque WASM inventories). But files named like THIRD-PARTY-NOTICES.md are not collected, so wasm-vips shows up as MIT only.",
      ),
    },
    evidence: [
      "scripts/generate-third-party-notices.mjs",
      "THIRD_PARTY_NOTICES.md",
      "apps/web/src/domains/creator/studio-third-party-notices.ts",
      "apps/web/src/domains/creator/StudioHelpCenterDialog.tsx",
    ],
  },
];

export const OPEN_SOURCE_ROWS_MORE: readonly EngineeringMapRow[] = [
  ...AI_VISION_ROWS,
  ...OUTPUT_ROWS,
  ...PATCH_FORK_OWN_ROWS,
];
