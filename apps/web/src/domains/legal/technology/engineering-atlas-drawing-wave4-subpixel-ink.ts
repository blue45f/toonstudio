import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · drawing · Wave-4 HyperCore:
 * Catmull-Rom · 모폴로지 스플라인 최적화기 + ₩0 정적 엣지 타일 프리페치 플래너 +
 * 4× 회전 격자 슈퍼샘플링(RGSS) · LCD RGB 서브픽셀 선화 커널 + 이방성 모세관 잉크 번짐.
 */
export const ENGINEERING_ATLAS_DRAWING_WAVE4_SUBPIXEL_INK: readonly EngineeringAtlasEntry[] = [
  {
    id: "morphological-spline-rgss-subpixel-capillary-ink",
    category: "drawing",
    name: "Morphological Spline · 4× RGSS LCD · Capillary Ink",
    title: t("모폴로지 스플라인 · 4× RGSS 서브픽셀 선화 · 모세관 잉크 번짐", "Morphological spline, 4× RGSS subpixel line-art & capillary ink"),
    status: "experimental",
    tagline: t(
      "합성 스타일러스 입력에서 매듭 수 60% 이상 감소를 확인했습니다. 서브픽셀 선화와 모세관 번짐도 각각 단위 테스트로 확인했습니다.",
      "Unit fixtures verify more than 60% knot reduction on synthetic stylus input, subpixel ink and capillary bleed.",
    ),
    background: [
      t(
        "고주사율 스타일러스 원시 입력은 직선 구간에도 수백 개의 중복 점과 순간적인 압력 스파이크를 남기며, 일반 픽셀 단위 안티에일리어싱만으로는 얇은 흑백 만화 펜선이 뿌옇게 흐려지거나 색 번짐(Color Fringing)이 생깁니다.",
        "High-rate stylus streams leave redundant points and pressure spikes, while naive antialiasing blurs thin monochrome manga ink or introduces LCD color fringing.",
      ),
      t(
        "합성 입력 테스트에서 optimizeMorphologicalSplineAsset은 형태학적 침식·팽창으로 선폭 노이즈를 50% 이상 줄이고 Catmull-Rom 매듭을 60% 이상 줄였습니다. planStaticEdgeTilePrefetch는 가시 영역과 이동 속도로 요청할 정적 타일을 정합니다.",
        "A synthetic-input test verifies more than 50% width-noise reduction and 60% Catmull-Rom knot pruning. planStaticEdgeTilePrefetch selects static tiles from the viewport and pan velocity.",
      ),
      t(
        "renderSubpixelRgssLineArtPreview 는 4× 회전 격자(±0.125, ±0.375) 거리장 커버리지와 5탭 에너지 균형 필터([1,2,3,2,1]/9)로 무지개 테두리 없는 초선명 LCD 선화를 만들고, stepCapillaryInkBleed(hybrid-compute-shadow-ink-meshlet.ts)는 종이 섬유 이방성과 안료 질량 보존을 지키는 수묵 번짐을 계산합니다(Current: 단위 검증 완료·0B 번들, Target: 펜선 확대 프리뷰·동양화 브러시 연결).",
        "renderSubpixelRgssLineArtPreview pairs 4× rotated-grid SDF coverage with a 5-tap balanced [1,2,3,2,1]/9 LCD filter, while stepCapillaryInkBleed simulates mass-conserving anisotropic paper ink bleed (Current: unit-verified, 0 B eager; Target: zoom preview & sumi-e brush).",
      ),
    ],
    keyPoints: [
      t("합성 입력에서 Opening/Closing 선폭 안정화와 Catmull-Rom 매듭 60% 이상 감소", "Synthetic-input checks for width stabilization and >60% Catmull-Rom knot pruning"),
      t("원점 연산 ₩0 콘텐츠 해시 정적 타일 매니페스트 & 속도 원뿔 프리페치", "₩0 content-hashed static tile manifest & velocity-cone prefetch"),
      t("4× 회전 격자(RGSS) 거리장 + 5탭 에너지 균형 LCD RGB 서브픽셀 선화", "4× RGSS signed-distance + 5-tap balanced LCD RGB subpixel ink"),
      t("종이 섬유 가로·세로 이방성 및 총 안료 질량 보존 모세관 수묵 번짐", "Fiber-anisotropic, mass-conserving capillary ink bleed step"),
    ],
    diagram: {
      id: "morphological-spline-rgss-subpixel-capillary-ink-diagram",
      kind: "graph",
      title: t("모폴로지 스플라인 압축 · 4× RGSS 서브픽셀 · 모세관 번짐 흐름", "Morphological spline, 4× RGSS subpixel & capillary bleed flow"),
      caption: t(
        "원시 펜 입력을 매끄러운 소수 매듭으로 줄인 뒤 건식 선화(RGSS/LCD)와 습식 번짐(모세관) 두 갈래로 선명하게 표현합니다.",
        "Prunes noisy pen input into compact knots before branching into crisp dry line-art (RGSS/LCD) and wet capillary bleed.",
      ),
      alt: t(
        "스타일러스 원시 입력이 모폴로지 스플라인 최적화기를 거쳐 압축 매듭이 되고, 위로는 4× RGSS LCD 서브픽셀 선화 커널로, 아래로는 섬유 이방성 모세관 번짐 솔버와 ₩0 정적 타일 프리페치로 이어집니다.",
        "Raw stylus points pass through the morphological spline optimizer into compact knots, feeding both the 4× RGSS LCD subpixel kernel and the anisotropic capillary bleed solver plus ₩0 tile prefetcher.",
      ),
      nodes: [
        { id: "raw", label: t("원시 펜 입력", "Raw stylus"), sub: t("고밀도 점 · 압력 노이즈", "Dense pts, width spikes"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "opt", label: t("모폴로지 스플라인", "Spline optimizer"), sub: t("스파이크 제거 · 60%+ 압축", "De-spike, >60% prune"), tone: "good", at: [1, 1] },
        { id: "rgss", label: t("4× RGSS · LCD", "4× RGSS & LCD"), sub: t("5탭 균형 초선명 선화", "5-tap crisp line-art"), tone: "good", at: [2, 0] },
        { id: "ink", label: t("모세관 번짐 · 타일", "Capillary & tiles"), sub: t("질량 보존 · 속도 원뿔", "Mass-conserving, ₩0 CDN"), tone: "good", at: [2, 2] },
      ],
      edges: [
        { from: "raw", to: "opt" },
        { from: "opt", to: "rgss", label: t("건식 펜선", "Dry ink") },
        { from: "opt", to: "ink", label: t("습식·타일", "Wet & tile") },
      ],
    },
    usage: [
      {
        feature: t("모폴로지 스플라인 압축기 · ₩0 타일 프리페치 · 4× RGSS LCD 프리뷰", "Morphological spline optimizer, ₩0 tile prefetch & 4× RGSS preview"),
        role: t(
          "실험 모듈의 선폭 보정, 타일 요청 계획, 서브픽셀 선화를 단위 테스트로 확인했습니다. /studio 펜선 미리보기 연결은 후속 단계입니다.",
          "Unit tests cover width correction, tile-request planning and subpixel ink. Integration into the /studio stroke preview is a follow-up.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/spline-edge-subpixel-preview.ts",
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/wasm64-wave4-hypercore.test.ts",
        ],
      },
      {
        feature: t("저점도 이방성 모세관 수묵/잉크 번짐 솔버", "Low-viscosity anisotropic capillary ink bleed solver"),
        role: t(
          "종이 섬유 방향 이방성과 수분 포화도 경사에 따라 총 안료 질량을 보존하며 번짐을 시뮬레이션합니다.",
          "Steps fiber-anisotropic capillary ink diffusion along saturation gradients while conserving total pigment mass.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/hybrid-compute-shadow-ink-meshlet.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("5탭 에너지 균형([1,2,3,2,1]/9) LCD 서브픽셀 커버리지 필터", "5-tap balanced [1,2,3,2,1]/9 LCD subpixel coverage filter"),
        language: "ts",
        ...sampleSource([
          ["export function balancedSubpixelTap(subCov: Float32Array, centerIdx: number): number {"],
          ["  const at = (i: number): number => subCov[Math.max(0, Math.min(subCov.length - 1, i))] ?? 0;"],
          ["  return (at(centerIdx - 2) + 2 * at(centerIdx - 1) + 3 * at(centerIdx) + 2 * at(centerIdx + 1) + at(centerIdx + 2)) / 9;", "합=1 대칭 가중치로 색 번짐 억제", "unit-sum symmetric weights suppress color fringing"],
          ["}"],
        ]),
        explain: t(
          "R·G·B 서브픽셀에 [1,2,3,2,1]/9 대칭 에너지 분배를 적용하면 순수 백색·흑색 영역과 경계에서 무지개 색 번짐 없이 가로 유효 해상도를 끌어올릴 수 있습니다.",
          "Applying [1,2,3,2,1]/9 symmetric energy balancing across R, G, B subpixels boosts horizontal crispness without rainbow fringing.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave4-hypercore/spline-edge-subpixel-preview.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "FreeType Documentation · Subpixel Hinting and Harmony LCD Filtering",
        url: "https://freetype.org/freetype2/docs/reference/ft2-lcd_rendering.html",
        kind: "docs",
        note: t("5탭 에너지 균형 서브픽셀 필터링과 색 번짐 억제 원리", "5-tap energy-balanced LCD subpixel filtering principles"),
      },
      {
        title: "Cloudflare R2 · Caching Static Content-Addressed Assets",
        url: "https://developers.cloudflare.com/r2/",
        kind: "docs",
        note: t("원점 연산 비용 ₩0 불변 해시 정적 타일 서빙 기반", "Zero-egress static tile hosting reference"),
      },
    ],
    chapterIds: ["brush-engine", "performance"],
    talk: {
      pitch: t(
        "합성 획에서 선폭 튐을 줄이고 매듭 수를 60% 이상 줄였습니다. 4× 회전 격자, 5탭 LCD 필터, 안료 질량을 보존하는 번짐은 각 모듈에서 확인했습니다.",
        "A synthetic stroke verified width correction and over 60% knot reduction. Module tests cover 4× RGSS, the 5-tap LCD filter and mass-conserving ink bleed.",
      ),
      analogy: t(
        "떨리는 손자국은 자로 말끔히 정돈해 저장 용량을 줄이고, 화면에 비출 때는 돋보기 눈금(서브픽셀)까지 맞춰 날카로운 만화 펜선을 보여 주는 제도판입니다.",
        "Like smoothing shaky ruler marks for compact storage while aligning subpixel loupe ticks for razor-sharp comic ink.",
      ),
      questions: [
        {
          question: t("OLED 나 회전된 태블릿 화면에서도 LCD RGB 모드를 그대로 쓰나요?", "Is LCD RGB mode forced on OLED or rotated tablets?"),
          answer: t(
            "아닙니다. subpixelMode: 'rgss-grayscale' 옵션을 함께 제공해 패널 배열이 다르거나 화면을 회전할 때는 방향 무관 4× RGSS 그레이스케일 커널로 즉시 전환합니다.",
            "No—subpixelMode: 'rgss-grayscale' switches cleanly to orientation-independent 4× RGSS grayscale coverage on OLED or rotated screens.",
          ),
        },
      ],
    },
    technologies: ["Canvas2D", "WebGPU", "Cloudflare R2", "TypeScript"],
    reviewedAt: "2026-11-26",
  },
];
