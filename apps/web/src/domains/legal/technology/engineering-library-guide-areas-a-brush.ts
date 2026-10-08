import { t } from "./engineering-library-guide-kit";
import type { LibraryGuideArea } from "./engineering-library-guide-types";

/**
 * 라이브러리 해설 · 영역 1 "브러시 엔진".
 * 사실의 정본은 오픈소스 지도(engineering-map-open-source-rows.ts)·ADR-0003/0004/0005/0006/0009/0017/0018/0019·렌더러 역할 원장
 * (docs/engines/renderer-roles.md)이며, 이 파일은 그것을 "왜 이렇게 나눴고 왜 이것을 골랐나"로 풀어 쓴다. 기준일 2026-10-08.
 */

const DRAWING = "apps/web/src/domains/creator";

export const LIBRARY_AREA_BRUSH_ENGINES: LibraryGuideArea = {
  id: "brush-engines",
  number: 1,
  title: t("브러시 엔진", "Brush engines"),
  question: t("펜 한 획은 어떤 엔진을 거쳐 화면에 닿나?", "Which engines does one pen stroke pass through to reach the screen?"),
  oneLine: t(
    "획은 입력 보정 → 선 모양 → 붓 종류 → 화면 표시로 나뉘고, 일마다 맡은 엔진이 하나씩 있습니다.",
    "A stroke is split into input smoothing, line shape, brush type and display, and each job has exactly one engine in charge.",
  ),
  easy: t(
    "인쇄소의 분업과 같습니다. 밑그림을 다듬는 사람, 윤곽을 따는 사람, 잉크를 입히는 사람이 따로 있고 한 공정을 두 사람이 겹쳐 맡지 않습니다. 다음 사람에게는 완성품이 아니라 중간 결과만 넘깁니다.",
    "It works like a print shop with a division of labor: one person cleans up the sketch, one traces the outline and one applies the ink, and no step is shared by two people. Each hands the next only an intermediate result, not a finished product.",
  ),
  designWhy: [
    {
      title: t("획을 단계로 쪼개 주인을 하나씩", "Split the stroke into steps with one owner each"),
      body: t(
        "입력 보정·선 윤곽·자연 재료·합성·문서 확정·내보내기의 권위를 나눕니다. 그래서 빠른 미리보기와 다시 만들 수 있는 최종 결과가 함께 가능합니다. 대가는 어댑터와 패리티 테스트를 따로 유지해야 한다는 점입니다.",
        "Authority is split among input smoothing, line outline, natural media, compositing, document commit and export. That keeps a fast preview and a reproducible final result at the same time. The cost is that adapters and parity tests must be maintained separately.",
      ),
    },
    {
      title: t("엔진은 펜을 내릴 때 한 번만 고른다", "Pick the engine once, when the pen goes down"),
      body: t(
        "펜을 내리는 순간 8가지 레인 중 하나를 고르고 획이 끝날 때까지 바꾸지 않습니다. GPU가 중간에 사라져도 몰래 다른 엔진으로 넘기지 않고 마지막 정상 화면을 지킵니다(ADR-0018).",
        "The moment the pen goes down, one of eight lanes is chosen and kept until the stroke ends. If the GPU vanishes midway, the work is not quietly handed to another engine and the last good frame is kept (ADR-0018).",
      ),
    },
    {
      title: t("무거운 계산은 Worker와 WASM으로", "Heavy math goes to Workers and WASM"),
      body: t(
        "Hokusai와 p5.brush는 전용 Worker에서 돌려 화면이 멈추지 않게 합니다. 직접 빌드한 WASM은 INTEGRITY.sha256 해시로 봉인하고 검증 스크립트가 같은 바이트인지 확인합니다.",
        "Hokusai and p5.brush run in dedicated Workers so the screen does not freeze. WASM we build ourselves is sealed with an INTEGRITY.sha256 hash and a verify script checks that the bytes are identical.",
      ),
    },
    {
      title: t("기준선을 먼저 두고 새 엔진은 겨룬다", "Fix a baseline first, make newcomers compete"),
      body: t(
        "CanvasKit(생산 기준선)과 vello_cpu(결정적 CPU 기준선)처럼 비교할 기준을 정해 둡니다. 새 엔진은 같은 입력으로 겨루는 승격 게이트를 통과해야 기본 경로에 오릅니다(ADR-0004·0005·0006).",
        "Baselines such as CanvasKit (production) and vello_cpu (deterministic CPU) are fixed up front. A new engine reaches the default path only by passing a promotion gate that runs it on the same input (ADR-0004, 0005, 0006).",
      ),
    },
  ],
  diagram: {
    id: "brush-engines-diagram",
    kind: "graph",
    title: t("펜 한 획이 화면에 닿는 길", "How one pen stroke reaches the screen"),
    caption: t(
      "획은 펜을 내릴 때 엔진 하나를 고르고 끝까지 그 길로 가며, 비교·후보 엔진은 제품 경로 밖에 둡니다.",
      "A stroke picks one engine when the pen goes down and stays on that path; comparison and candidate engines stay off the product path.",
    ),
    alt: t(
      "왼쪽의 펜 입력이 손떨림 보정을 지나 엔진 고르기에 닿습니다. 여기서 기본 펜은 perfect-freehand 잉크 선으로, 명시 선택한 경우 Hokusai 자연매체 붓이나 p5.brush 절차적 붓으로 갈라지고 모두 획 확정으로 모입니다. 획 확정은 Konva 무대와 CanvasKit 섬으로 화면에 표시됩니다. 점선으로 이어진 libmypaint와 vello_cpu는 결과를 견주는 기준선이고, Google Ink는 PoC 게이트 뒤의 후보입니다.",
      "Pen input on the left passes through smoothing and reaches the engine pick. The default pen goes to a perfect-freehand ink line; when chosen explicitly it branches to the Hokusai natural-media brush or the p5.brush procedural brush, and all converge on the stroke commit. The commit is shown on the Konva stage and the CanvasKit island. The dashed libmypaint and vello_cpu are comparison baselines, and Google Ink is a candidate behind a PoC gate.",
    ),
    nodes: [
      { id: "pen", label: t("펜 입력", "Pen input"), sub: t("압력·기울기·속도", "Pressure, tilt, speed"), tone: "local", shape: "pill", at: [0, 1] },
      { id: "smooth", label: t("손떨림 보정", "Smoothing"), sub: t("lazy-brush + 자체 보정", "lazy-brush + our own smoothing"), tone: "local", at: [1, 1] },
      { id: "pick", label: t("엔진 한 번 고르기", "Pick one engine"), sub: t("펜을 내릴 때 1회", "Once, at pen-down"), tone: "warn", at: [2, 1] },
      { id: "ink", label: t("잉크 선", "Ink line"), sub: t("perfect-freehand", "perfect-freehand"), tone: "local", at: [3, 0] },
      { id: "natural", label: t("자연매체 붓", "Natural media"), sub: t("Hokusai · Rust → WASM", "Hokusai, Rust to WASM"), tone: "local", at: [3, 1] },
      { id: "proc", label: t("절차적 붓", "Procedural brush"), sub: t("p5.brush · Worker", "p5.brush, Worker"), tone: "local", at: [3, 2] },
      { id: "commit", label: t("획 확정", "Stroke commit"), sub: t("문서에 기록 · 래스터는 Canvas2D", "Recorded; raster via Canvas2D"), tone: "good", at: [4, 1] },
      { id: "show", label: t("화면 표시", "On screen"), sub: t("Konva · CanvasKit", "Konva, CanvasKit"), tone: "good", shape: "pill", at: [5, 1] },
      { id: "ref", label: t("비교 기준선", "Baselines"), sub: t("libmypaint · vello_cpu", "libmypaint, vello_cpu"), tone: "neutral", at: [4, 2] },
      { id: "cand", label: t("후보 잉크 엔진", "Candidate ink engine"), sub: t("Google Ink · PoC", "Google Ink, PoC"), tone: "neutral", at: [1, 2] },
    ],
    edges: [
      { from: "pen", to: "smooth", label: t("입력점", "points") },
      { from: "smooth", to: "pick", label: t("보정된 점", "smoothed") },
      { from: "pick", to: "ink", label: t("기본 펜", "default") },
      { from: "pick", to: "natural", style: "dashed", label: t("명시 선택", "explicit") },
      { from: "pick", to: "proc", style: "dashed", label: t("선택형", "opt-in") },
      { from: "ink", to: "commit", label: t("윤곽 선", "outline") },
      { from: "natural", to: "commit", label: t("투명 래스터", "raster") },
      { from: "proc", to: "commit", label: t("결과 이미지", "image") },
      { from: "commit", to: "show", label: t("문서 반영", "to document") },
      { from: "commit", to: "ref", style: "dashed", label: t("결과 대조", "compare") },
      { from: "smooth", to: "cand", style: "dashed", label: t("PoC 게이트", "PoC gate") },
    ],
  },
  libraries: [
    {
      id: "hokusai",
      name: "Hokusai",
      kind: "engine",
      oneLine: t("연필·목탄·수채·유화처럼 번지는 붓을 계산하는 Rust 엔진", "A Rust engine that computes brushes that blend like pencil, charcoal, watercolor and oil"),
      usedFor: t(
        "선택한 획을 연필·목탄·유화 같은 자연매체 붓으로 바꿔 투명한 래스터로 문서에 넣습니다(WASM, Worker에서 실행).",
        "Turns a selected stroke into a natural-media brush such as pencil, charcoal or oil and inserts it into the document as a transparent raster (WASM in a Worker).",
      ),
      why: t(
        "순수 Rust라 WASM 한 가지 도구체인에 맞고 libmypaint(C)의 포팅·메모리 경계 위험을 피합니다. 저장소가 이미 갖춘 결정성 계약과 품질 검증 스크립트도 이어 쓸 수 있었습니다(ADR-0006).",
        "It is pure Rust, so it fits a single WASM toolchain and avoids the porting and memory-boundary risks of libmypaint (C). The repository's existing determinism contract and quality scripts could also be carried over (ADR-0006).",
      ),
      alternatives: t(
        "libmypaint(C→WASM)는 .myb 정답지이자 비교 기준으로 남겼습니다. 상류 hokusai-wasm 래퍼는 타일을 흰 바탕에 합성해 쓰지 않고, 같은 0.3.0 크레이트를 직접 감쌌습니다.",
        "libmypaint (C to WASM) stays as the .myb answer key and comparison baseline. The upstream hokusai-wasm wrapper composites tiles over white, so we wrapped the same 0.3.0 crates ourselves.",
      ),
      cost: t(
        "자동 라우트에 오른 프리셋은 0개입니다. 2026-08-08 한 기기 측정에서 처리량이 libmypaint의 0.097~0.318배(요구 1.2배)라 '선택한 획 변환'으로만 씁니다.",
        "No preset is on the automatic route. In one measurement on one device (2026-08-08), throughput was 0.097 to 0.318 times libmypaint's (1.2x required), so it is used only to convert a selected stroke.",
      ),
      paths: [
        `${DRAWING}/render/studio-hokusai-natural-media.worker.ts`,
        `${DRAWING}/StudioHokusaiNaturalMediaInspectorSection.tsx`,
        "packages/studio-hokusai-wasm/src/lib.rs",
      ],
      license: "MIT OR Apache-2.0",
      licenseSource: "packages/studio-hokusai-wasm/Cargo.toml",
      status: "live",
      mapRowId: "hokusai",
      atlasIds: ["hokusai-wasm-natural-media"],
    },
    {
      id: "perfect-freehand",
      name: "perfect-freehand · lazy-brush",
      kind: "library",
      package: "perfect-freehand",
      oneLine: t("압력과 속도에 따라 굵기가 달라지는 잉크 선을 그려 주는 부품", "A part that draws ink lines whose width follows pressure and speed"),
      usedFor: t(
        "펜 입력점으로 잉크 선의 윤곽을 계산하고(perfect-freehand), 손떨림을 줄여 선이 끈에 끌려오듯 따라오게 합니다(lazy-brush).",
        "Computes the outline of an ink line from pen points (perfect-freehand) and smooths hand tremor so the line trails the pen as if on a string (lazy-brush).",
      ),
      why: t(
        "가볍고 결정적인 윤곽 계산이라 내보내기 형상까지 겸하고, 허용형(MIT)이라 그대로 번들할 수 있습니다. 1.2.3으로 고정해 손맛 회귀 기준(Golden Master 스트로크)을 안정시켰습니다(ADR-0005).",
        "Its outline math is light and deterministic, so it also serves export geometry, and its permissive MIT license allows bundling as is. Pinning 1.2.3 keeps the golden-master strokes stable as a feel regression baseline (ADR-0005).",
      ),
      alternatives: t(
        "Google Ink는 입력 모델링이 풍부하지만 공식 웹 SDK가 아니고 Bazel 전용이라 PoC 게이트 뒤 후보로 두었습니다(ADR-0009).",
        "Google Ink has richer input modeling but is not an official web SDK and is Bazel-only, so it stays a candidate behind a PoC gate (ADR-0009).",
      ),
      cost: t(
        "연필·수채 같은 자연매체나 복합 브러시는 대신하지 못합니다(조사 문서 E10). lazy-brush는 마우스·펜·터치별로 켜고 끕니다.",
        "It cannot replace natural media such as pencil or watercolor, or compound brushes (survey item E10). lazy-brush can be switched on or off per mouse, pen or touch.",
      ),
      paths: [
        `${DRAWING}/studio-perfect-freehand.ts`,
        `${DRAWING}/studio-lazy-brush-stabilizer.ts`,
        "docs/adr/0005-inking-pipeline-staged.md",
      ],
      license: "MIT",
      status: "live",
      mapRowId: "perfect-freehand-lazy-brush",
      atlasIds: ["stroke-smoothing-one-euro", "stroke-replay-deterministic"],
    },
    {
      id: "canvaskit",
      name: "CanvasKit (Skia)",
      kind: "engine",
      package: "canvaskit-wasm",
      oneLine: t("구글 Skia 그래픽 엔진을 웹용으로 옮긴 정밀 벡터 렌더러", "Google's Skia graphics engine compiled for the web, a precise vector renderer"),
      usedFor: t(
        "문서의 벡터 영역을 GPU(WebGL2) 표면에 그리고, 정밀한 경로 연산(PathOps)을 Worker에서 처리합니다.",
        "Draws the document's vector island on a GPU (WebGL2) surface and runs precise path operations (PathOps) in a Worker.",
      ),
      why: t(
        "경로·글자·필터를 한 성숙한 그래픽 코어에서 제공해 기준 출력으로 삼기 좋습니다. 0.41.1로 고정해 골든 이미지 비교의 기준이 흔들리지 않게 했습니다(ADR-0004).",
        "It offers paths, text and filters in one mature graphics core, which suits a reference output. Pinning 0.41.1 keeps the baseline for golden-image comparison steady (ADR-0004).",
      ),
      alternatives: t(
        "Vello는 알파 단계라 명시 선택형으로 두었고, Skia Graphite는 웹 아티팩트가 없으며, Google Forma는 상류가 보관(archived)돼 채택하지 않았습니다(ADR-0017).",
        "Vello is alpha-stage so it is explicit-choice only, Skia Graphite has no web artifact, and Google Forma is archived upstream, so none was adopted (ADR-0017).",
      ),
      cost: t(
        "wasm이 약 7.2MB라 필요할 때 불러옵니다. 배포본은 WebGL 빌드(WebGPU API 없음)이며, 버전은 ADR 개정 없이 올리지 않습니다.",
        "The wasm is about 7.2 MB, so it loads on demand. The shipped build is the WebGL one (no WebGPU API), and the version is not raised without an ADR revision.",
      ),
      paths: [
        "packages/studio-engine-skia/src/document-renderer.ts",
        `${DRAWING}/render/StudioSkiaDocumentSurface.tsx`,
        `${DRAWING}/render/studio-canvaskit-quality-engine.ts`,
      ],
      license: "BSD-3-Clause",
      status: "live",
      mapRowId: "canvaskit",
      atlasIds: ["skia-canvaskit-retained-surface", "renderer-role-ledger"],
    },
    {
      id: "vello-thorvg",
      name: "Vello · ThorVG",
      kind: "engine",
      oneLine: t("GPU 벡터 그래픽 엔진 Vello와 SVG·Lottie 전문 엔진 ThorVG", "Vello, a GPU vector engine, and ThorVG, a specialist for SVG and Lottie"),
      usedFor: t(
        "SVG는 그리기 전에 Vello와 ThorVG 중 한쪽을 골라 맡깁니다. 결정적 CPU판(vello_cpu)은 비교·골든 기준으로만 씁니다.",
        "An SVG is assigned to either Vello or ThorVG before drawing. The deterministic CPU build (vello_cpu) is used only as a comparison and golden baseline.",
      ),
      why: t(
        "Rust GPU 렌더러가 페이지의 GPU 장치를 그대로 받아 써서 그림을 CPU로 되읽지 않고 같은 장치 안에서 씁니다(이득은 그림 크기에 따라 다릅니다). ThorVG는 Vello가 못 그리는 필터·마스크·글자가 든 SVG와 Lottie를 맡습니다.",
        "The Rust GPU renderer adopts the page's own GPU device, so images stay on that device instead of being read back to the CPU (the gain varies with image size). ThorVG covers SVG and Lottie with filters, masks and text that Vello cannot draw.",
      ),
      alternatives: t(
        "resvg는 시각 비교용 QA 기준일 뿐 제품 경로에 연결하지 않았고, Google Forma는 상류가 보관돼 채택하지 않았습니다(지도, ADR-0017).",
        "resvg is only a visual-comparison QA reference and is not wired into the product, and Google Forma is archived upstream, so it was not adopted (map, ADR-0017).",
      ),
      cost: t(
        "Vello는 알파 단계라 '명시 선택'으로만 쓰고 문서 표시는 Skia WebGL2가 맡습니다. 실패해도 다른 엔진으로 자동 전환하지 않습니다.",
        "Vello is alpha-stage, so it is used only by explicit choice and Skia WebGL2 owns document display. A failure never triggers an automatic switch to another engine.",
      ),
      paths: [
        `${DRAWING}/render/studio-vello-hub.ts`,
        `${DRAWING}/studio-svg-product-provider-plan.ts`,
        "crates/studio-engine-vello/Cargo.toml",
      ],
      license: "Apache-2.0 OR MIT",
      licenseSource: "docs/engines/vello-baseline.md",
      status: "configured",
      mapRowId: "vello-thorvg",
      atlasIds: ["gpu-fabric-device-lease-vello"],
    },
    {
      id: "p5-brush",
      name: "p5.brush",
      kind: "library",
      package: "p5.brush",
      oneLine: t("수채 번짐·흐름선·해칭 같은 아티스틱 붓을 만드는 부품", "A part that makes artistic brushes such as watercolor fills, flow fields and hatching"),
      usedFor: t(
        "전용 Worker 안의 숨은 캔버스에서 절차적 붓을 그린 뒤 결과 이미지만 가져옵니다(명시 선택하는 provider).",
        "Draws procedural brushes on a hidden canvas inside a dedicated Worker and takes back only the resulting image (an explicitly chosen provider).",
      ),
      why: t(
        "수채 번짐·flow field 같은 절차적 질감을 처음부터 만들지 않고 가져다 씁니다. p5 본체(LGPL-2.1)는 번들하지 않고 standalone 판만 써서 라이선스 부담을 줄였습니다.",
        "Procedural textures such as watercolor fills and flow fields are borrowed instead of built from scratch. The p5 core (LGPL-2.1) is not bundled; only the standalone build is used, which lightens the license burden.",
      ),
      cost: t(
        "pnpm 패치 1개로 같은 시드인데 픽셀이 달라지던 비결정성을 없앴습니다. 모듈 전역 상태 때문에 모든 호출을 한 줄로 세워야 합니다.",
        "One pnpm patch removed nondeterminism that made pixels differ with the same seed. Module-level global state forces every call into a single queue.",
      ),
      paths: [
        `${DRAWING}/brush/studio-p5-brush-standalone-runtime-adapter.ts`,
        `${DRAWING}/studio-procedural-artistic-brush-provider.ts`,
        "patches/p5.brush@2.2.1.patch",
      ],
      license: "MIT",
      status: "configured",
      mapRowId: "p5-brush",
    },
    {
      id: "mixbox",
      name: "Mixbox",
      kind: "library",
      package: "mixbox",
      oneLine: t("물감처럼 섞이는 색(파랑+노랑=초록)을 계산하는 안료 혼색 엔진", "A pigment-mixing engine that blends colors like paint (blue + yellow = green)"),
      usedFor: t(
        "브러시 스튜디오(제작 도구) V6의 안료 provider 한 곳에서 혼색 후보로 쓰입니다.",
        "Serves as one color-mixing candidate in a single pigment provider of Brush Studio V6, an authoring tool.",
      ),
      why: t(
        "RGB를 평균하면 파랑과 노랑이 칙칙해지지만 안료 모델은 초록이 됩니다. 같은 계약 뒤에 두어 MIT 대안(spectral.js·colormix)으로 바꿔 끼울 수 있게 했습니다.",
        "Averaging RGB turns blue and yellow dull, while a pigment model gives green. It sits behind the same contract as the MIT alternatives (spectral.js, colormix) so it can be swapped.",
      ),
      alternatives: t(
        "제품의 라이브 혼색은 libmypaint에서 옮겨 온 분광 혼색(ISC)입니다. 실험 앱 brush-lab은 경계 테스트로 Mixbox 유입을 막습니다(ADR-0026).",
        "Live mixing in the product is a spectral mix ported from libmypaint (ISC). The experimental brush-lab app blocks Mixbox with a boundary test (ADR-0026).",
      ),
      cost: t(
        "비상업(NC) 라이선스입니다. 상업 이용 조건은 별도 확인이 필요하며, 저장소는 권리 라벨·noncommercial-full 프로필·2.0.0 감사 핀으로 다룹니다.",
        "It carries a non-commercial (NC) license; terms for commercial use need separate confirmation. The repository handles it with a rights label, the noncommercial-full profile and a 2.0.0 audit pin.",
      ),
      paths: [
        `${DRAWING}/brush-lab/brush-studio-v6-pigment-provider.ts`,
        `${DRAWING}/brush-lab/brush-studio-v6-license-profile.ts`,
        "third_party/mixbox/README.md",
      ],
      license: "CC-BY-NC-4.0",
      status: "live",
      mapRowId: "mixbox",
      atlasIds: ["spectral-color-mixing-mixbox"],
    },
    {
      id: "libmypaint",
      name: "libmypaint",
      kind: "engine",
      oneLine: t("오래 쓰여 온 오픈소스 브러시 엔진(MyPaint). 비교 기준선과 엔진 시험 패널에서만 씁니다", "A long-established open-source brush engine (MyPaint), used only as a baseline and in the engine-test panel"),
      usedFor: t(
        "Hokusai 결과를 견주는 정답지(패리티·골든)와 브러시 스튜디오의 엔진 시험 패널에서 쓰입니다.",
        "Serves as the answer key for judging Hokusai output (parity and golden images) and in the engine-test panel of Brush Studio.",
      ),
      why: t(
        ".myb 브러시 생태계의 사실상 기준 구현이라, 새 Rust 엔진이 같은 입력에서 같은 결과를 내는지 가늠할 때 비교 기준이 됩니다(ADR-0006).",
        "As the de facto reference implementation of the .myb brush ecosystem, it is the yardstick for whether the new Rust engine gives the same result on the same input (ADR-0006).",
      ),
      cost: t(
        "C를 직접 컴파일한 약 83KB wasm이며 기본 그리기 엔진이 아닙니다. ADR-0006은 C 포팅·메모리 경계·업데이트 정체를 관리해야 할 위험으로 적었습니다.",
        "A wasm of about 83 KB compiled directly from C, and not the default drawing engine. ADR-0006 lists C porting, the memory boundary and upstream stagnation as risks to manage.",
      ),
      paths: [
        "packages/studio-brush-platform/src/libmypaint/index.ts",
        `${DRAWING}/brush/studio-native-brush-probe.worker.ts`,
        `${DRAWING}/brush/StudioNativeBrushEngineProbe.tsx`,
      ],
      license: "ISC",
      licenseSource: "packages/studio-brush-platform/src/libmypaint/COPYING",
      status: "reference-only",
      mapRowId: "libmypaint",
    },
    {
      id: "google-ink",
      name: "Google Ink",
      kind: "engine",
      oneLine: t("구글의 잉크 브러시 라이브러리. 입력 보정과 획 메시를 직접 WASM으로 빌드했습니다", "Google's ink-brush library; we build its input modeler and stroke mesh to WASM ourselves"),
      usedFor: t(
        "획 끝의 '예측 꼬리'를 보여 주는 보조 미리보기에만 연결돼 있고 입력 보정은 관측용 접점뿐입니다. 최종 획과 출하 잉킹은 perfect-freehand·Canvas 경로입니다.",
        "It is connected only to an auxiliary preview of the stroke's predicted tail, and input modeling has an observation-only seam. The final stroke and shipping ink stay on the perfect-freehand and Canvas path.",
      ),
      why: t(
        "압력·기울기·속도의 풍부한 동역학과 부분 획 편집에 유리해 전문 잉킹의 주력 후보로 봤습니다. 다만 PoC 게이트를 통과하기 전에는 출하 경로에 올리지 않습니다(ADR-0005·0009).",
        "Its rich pressure, tilt and speed dynamics and partial-stroke editing made it the main candidate for professional inking, but it stays off the shipping path until it clears the PoC gate (ADR-0005, 0009).",
      ),
      cost: t(
        "공식 웹 배포가 없고 Bazel 전용이라 76개 소스를 em++로 직접 빌드합니다. 재빌드에 저장소 밖 ~/toolchains/ink 클론이 필요해 저장소만으로는 재현되지 않습니다.",
        "There is no official web distribution and upstream is Bazel-only, so 76 translation units are built directly with em++. A rebuild needs a clone at ~/toolchains/ink outside the repository, so it is not reproducible from the repo alone.",
      ),
      paths: [
        "packages/studio-brush-platform/src/ink-mesh.ts",
        `${DRAWING}/brush/studio-ink-mesh-live-preview.ts`,
        `${DRAWING}/live/studio-live-ink-stabilizer-plan.ts`,
      ],
      license: "Apache-2.0",
      licenseSource: "packages/studio-brush-platform/src/ink-mesh/LICENSE-GOOGLE-INK",
      status: "experimental",
      mapRowId: "google-ink",
    },
  ],
  pitfall: t(
    "'엔진이 많다'와 '전부 쓴다'는 다릅니다. 일상 경로는 perfect-freehand와 CanvasKit이고, Hokusai는 명시 변환, Vello·p5.brush는 선택형, Mixbox는 제작 도구 한 곳, libmypaint는 비교·시험용, Google Ink는 후보입니다.",
    "'Many engines' does not mean 'all in use'. The everyday path is perfect-freehand and CanvasKit; Hokusai is an explicit conversion, Vello and p5.brush are opt-in, Mixbox sits in one authoring tool, libmypaint is for comparison and testing, and Google Ink is a candidate.",
  ),
  status: "live",
  atlasIds: [
    "renderer-role-ledger",
    "stroke-surface-route-pointerdown",
    "hokusai-wasm-natural-media",
    "skia-canvaskit-retained-surface",
    "spectral-color-mixing-mixbox",
  ],
  chapterIds: ["brush-engine", "brush-render-authority", "open-source"],
  glossaryIds: ["hokusai", "libmypaint", "skia-canvaskit", "vello", "thorvg", "stabilizer", "spectral-mixing", "stroke-surface-route", "renderer-role-ledger", "cc-by-nc"],
};
