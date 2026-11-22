import {
  BENCHMARK_SNAPSHOT_DATE,
  type BenchmarkCell,
  type BenchmarkDataset,
  type BenchmarkSupportLevel,
  type BenchmarkToolProfile,
} from "./benchmark-types";

const t = (ko: string, en: string) => ({ ko, en });

const c = (
  level: BenchmarkSupportLevel,
  ko: string,
  en: string,
): BenchmarkCell => ({ level, summary: { ko, en } });

const FILTER_TOOLS: readonly BenchmarkToolProfile[] = [
  {
    id: "toonstudio",
    name: "ToonStudio",
    shortName: "ToonStudio",
    role: t("WebGPU·Worker 기반 브라우저 로컬 이미지/웹툰 필터 엔진", "Browser-local WebGPU & Worker image/webtoon filter engine"),
    pricing: t("베타 전 기능 ₩0 (로컬 실행)", "KRW 0 beta (local execution)"),
    platform: t("WebGPU / WebGL2 / Worker 브라우저", "WebGPU / WebGL2 / Worker browsers"),
    benchmarkTakeaway: t(
      "Float32 무손실 주파수 분리, 로컬 PatchMatch, 7밴드 분광 필터, 스마트 필터 스택, GPU 스크린톤·JFA 외곽선을 ₩0 로컬로 통합",
      "Unifies lossless Float32 frequency separation, local PatchMatch, 7-band spectral filters, smart stacks and GPU screentone/JFA locally",
    ),
    honestStrength: t(
      "서버 업로드나 유료 플러그인 없이 브라우저에서 비파괴 필터·주파수 분리·PatchMatch·스크린톤을 즉시 실행",
      "Executes non-destructive filters, frequency separation, PatchMatch and screentones locally with zero upload or fees",
    ),
  },
  {
    id: "photoshop",
    name: "Adobe Photoshop",
    shortName: "Photoshop",
    role: t("사진 리터칭·필터·비파괴 스마트 오브젝트 업계 표준", "Industry standard for photo retouching, filters & Smart Objects"),
    pricing: t("월간 Creative Cloud 구독", "Monthly Creative Cloud subscription"),
    platform: t("Windows · macOS · iPad · Web", "Windows · macOS · iPad · Web"),
    benchmarkTakeaway: t(
      "스마트 필터 스택, Content-Aware Fill(PatchMatch), Liquify, Camera Raw 색보정 구조를 벤치마킹",
      "Benchmarked for Smart Filter stacks, PatchMatch Content-Aware Fill, Liquify and color grading workflows",
    ),
    honestStrength: t(
      "Camera Raw, 32-bit HDR 네이티브 필터, Neural Filters, 초대형 인쇄 이미지 처리 속도",
      "Camera Raw, 32-bit HDR native filters, Neural Filters and huge print-resolution processing speed",
    ),
  },
  {
    id: "csp",
    name: "Clip Studio Paint",
    shortName: "CSP",
    role: t("만화·웹툰 보정·스크린톤·선화 추출 특화 드로잉 툴", "Manga & webtoon grading, screentone & line-art specialist"),
    pricing: t("영구판(PC) 또는 월/연 구독", "One-time (PC) or monthly/annual subscription"),
    platform: t("Windows · macOS · iPad · Android", "Windows · macOS · iPad · Android"),
    benchmarkTakeaway: t(
      "그라디언트 맵, 액화(다중 레이어), 톤/경계선 효과, 색수차·레트로 필름 필터 UX를 벤치마킹",
      "Benchmarked for gradient maps, multi-layer liquify, screentone/border effects and comic stylization filters",
    ),
    honestStrength: t(
      "만화 원고 전용 톤·집중선·경계선 효과와 600dpi 대형 원고에서의 안정적인 필터 응답",
      "Polished comic screentone/border effects and dependable filter performance on 600dpi print pages",
    ),
  },
  {
    id: "krita",
    name: "Krita (G'MIC)",
    shortName: "Krita / G'MIC",
    role: t("오픈소스 페인팅 + G'MIC 500+ 필터 플러그인 생태계", "Open-source painting + G'MIC 500+ filter plugin ecosystem"),
    pricing: t("무료 오픈소스", "Free open-source"),
    platform: t("Windows · macOS · Linux", "Windows · macOS · Linux"),
    benchmarkTakeaway: t(
      "비파괴 필터 레이어/마스크 구조와 G'MIC의 수학적 형태학·채색/블러 필터 개념을 참고",
      "Referenced for non-destructive filter masks and G'MIC mathematical morphology/colorization concepts",
    ),
    honestStrength: t(
      "G'MIC-Qt 플러그인을 통한 500종 이상의 실험적·수학적 이미지 처리 필터와 비파괴 필터 레이어",
      "500+ mathematical filters via G'MIC-Qt plus mature non-destructive filter layers and masks",
    ),
  },
  {
    id: "procreate",
    name: "Procreate",
    shortName: "Procreate",
    role: t("iPad 터치 슬라이드 제스처 기반 실시간 필터 툴", "iPad gesture-driven real-time Metal filter tool"),
    pricing: t("일회성 유료 구매", "One-time purchase"),
    platform: t("iPadOS 전용", "iPadOS only"),
    benchmarkTakeaway: t(
      "좌우 드래그 강도 조절과 즉각적인 색수차·블룸·하프톤 미리보기 피드백을 참고",
      "Referenced for instant visual feedback on chromatic aberration, bloom and halftone previews",
    ),
    honestStrength: t(
      "Metal GPU 기반 60~120fps 실시간 슬라이드 필터 적용(파괴형이지만 반응성이 극도로 빠름)",
      "Ultra-snappy 60–120fps Metal filter sliders (destructive, yet exceptionally responsive)",
    ),
  },
  {
    id: "magma",
    name: "Magma Studio",
    shortName: "Magma",
    role: t("브라우저 실시간 협업 드로잉 캔버스", "Browser realtime collaborative drawing canvas"),
    pricing: t("무료 티어 + 프로/팀 구독", "Freemium + Pro/Team subscription"),
    platform: t("웹 브라우저", "Web browser"),
    benchmarkTakeaway: t(
      "브라우저 캔버스에서 협업 세션 중 색보정·블러를 빠르게 적용하는 경량 필터 UX를 비교",
      "Compared for lightweight browser color adjustment and blur inside collaborative canvases",
    ),
    honestStrength: t(
      "멀티유저 동기화 중에도 가볍게 동작하는 기본 색보정·그라디언트 맵(프로 티어)",
      "Lightweight color adjustments and gradient maps synchronized smoothly across multiplayer sessions",
    ),
  },
];

export const BENCHMARK_FILTERS_DATASET: BenchmarkDataset = {
  id: "filters",
  path: "/about/technology/benchmarks/filters",
  shortLabel: t("필터 15종", "15 Filters"),
  eyebrow: `GRANULAR BENCHMARK · FILTERS · ${BENCHMARK_SNAPSHOT_DATE}`,
  title: t(
    "필터 · 리터칭 · 변형 항목별 1:1 정밀 벤치마크 (15종 × 6개 툴)",
    "1:1 Granular Filter, Retouching & Warp Benchmark (15 Items × 6 Tools)",
  ),
  subtitle: t(
    "블러·선명화·무손실 Float32 주파수 분리·로컬 PatchMatch·액화/워프·7밴드 분광 필터·스마트 필터 스택·GPU 스크린톤/JFA 외곽선까지 항목별로 정직하게 대조했습니다.",
    "Detailed breakdown across blur, sharpening, lossless Float32 frequency separation, local PatchMatch, liquify/warp, spectral pigment filters, smart filter stacks and GPU screentone/JFA.",
  ),
  scopeNote: t(
    "비교 범위: ToonStudio 2026-11-22 필터·이미징 커널 실측 vs Photoshop · CSP · Krita(G'MIC) · Procreate · Magma 공식 기능 기준.",
    "Scope: verified against 2026-11-22 ToonStudio filter/imaging kernels vs publicly documented features of 5 creative tools.",
  ),
  snapshotDate: BENCHMARK_SNAPSHOT_DATE,
  tools: FILTER_TOOLS,
  subGroups: [
    {
      id: "blur-sharpen",
      label: t("블러·선명화", "Blur & Sharpen"),
      description: t("가우시안·모션·렌즈 보케 블러와 언샵/하이패스 선명화", "Gaussian, motion, lens bokeh blur and unsharp/high-pass sharpen"),
    },
    {
      id: "retouch-warp",
      label: t("복원·리터칭·변형", "Retouch & Warp"),
      description: t("Float32 주파수 분리·PatchMatch 로컬 인페인팅·액화·메시/퍼펫 워프", "Float32 frequency separation, local PatchMatch, liquify and mesh/puppet warp"),
    },
    {
      id: "color-fx",
      label: t("색보정·분광·효과", "Color, Spectral & FX"),
      description: t("7밴드 분광 안료 필터·색수차/그레인·글로우·그라디언트 맵/톤 커브", "7-band spectral filter, chromatic aberration/grain, glow and gradient map/tone curve"),
    },
    {
      id: "nondestructive-webtoon",
      label: t("비파괴·웹툰 특화", "Non-Destructive & Webtoon"),
      description: t("비파괴 스마트 필터 스택·GPU 스크린톤·JFA 외곽선", "Non-destructive smart filter stack, GPU screentone and JFA outlines"),
    },
  ],
  rows: [
    {
      id: "gaussian-blur",
      subGroupId: "blur-sharpen",
      title: t("가우시안 블러 (분리형 커널)", "Separable Gaussian Blur"),
      metricTag: t("O(r) 2-Pass 분리 커널", "O(r) 2-pass separable kernel"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Photoshop·CSP의 반경 가우시안 블러를 2-Pass 분리형 Float32/GPU 커널로 구현해 큰 반경에서도 선형 시간 보장",
        "Built 2-pass separable Float32/GPU Gaussian blur so large blur radii remain linear-time in-browser",
      ),
      evidenceSummary: t(
        "분리형 가우시안 커널과 고급 블러 패널로 배경 흐림 및 광원 확산을 로컬에서 실행합니다.",
        "Separable Gaussian kernels and the blur panel execute background softening and glow passes locally.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/studio-advanced-blur-filters.ts",
        "apps/web/src/domains/creator/studio-advanced-blur-filter-kernels.ts",
        "apps/web/src/domains/creator/StudioBlurPanel.tsx",
      ],
      honestLimit: t(
        "초고해상도(8K 이상) 32-bit HDR 캔버스 실시간 반경 슬라이드 속도는 네이티브 C++/Metal 앱이 빠릅니다.",
        "Native C++/Metal apps still hold an edge on real-time 8K+ 32-bit HDR radius scrubbing.",
      ),
      cells: {
        toonstudio: c("full", "분리형 Float32/GPU 가우시안 블러", "Separable Float32/GPU Gaussian blur"),
        photoshop: c("full", "표준 가우시안·스마트 필터 지원", "Standard Gaussian with Smart Filter"),
        csp: c("full", "가우시안 흐리기 실시간 미리보기", "Gaussian blur with live preview"),
        krita: c("full", "가우시안 블러 + 비파괴 필터 마스크", "Gaussian blur + non-destructive mask"),
        procreate: c("full", "터치 슬라이드 실시간 가우시안", "Real-time gesture Gaussian blur"),
        magma: c("full", "기본 가우시안 블러 지원", "Standard Gaussian blur"),
      },
    },
    {
      id: "motion-radial-blur",
      subGroupId: "blur-sharpen",
      title: t("모션 블러 · 방사형(줌) 블러", "Motion & Radial Zoom Blur"),
      metricTag: t("액션 컷 방향/중심점 제어", "Action-cut angle & center control"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "웹툰 액션 컷에서 필수인 이동 흐리기·방사 흐리기를 각도·거리·중심점 파라미터 커널로 내재화",
        "Implemented directional motion and radial zoom blur kernels essential for webtoon action cuts",
      ),
      evidenceSummary: t(
        "각도별 모션 블러와 줌/회전 방사형 블러를 고급 블러 커널과 필터 갤러리에서 모두 호출할 수 있습니다.",
        "Directional motion and radial zoom/spin blur are available across both the blur kernel and filter gallery.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/studio-advanced-blur-filter-kernels.ts",
        "apps/web/src/domains/creator/filter/studio-photoshop-web-filter-catalog-a.ts",
      ],
      honestLimit: t(
        "Photoshop의 경로 블러(Path Blur — 곡선 경로 추종 흐림) 수준의 자유 곡선 모션 블러는 아직 미지원입니다.",
        "Freeform curved Path Blur like Photoshop's Blur Gallery is not yet implemented.",
      ),
      cells: {
        toonstudio: c("full", "방향 모션·방사형 블러 커널 내장", "Built-in directional motion & radial blur"),
        photoshop: c("full", "모션·방사형·경로(Path) 블러 완비", "Motion, Radial & curved Path Blur"),
        csp: c("full", "이동 흐리기·방사 흐리기 내장", "Motion & radial blur built in"),
        krita: c("full", "모션·렌즈·G'MIC 방사 블러", "Motion blur + G'MIC radial options"),
        procreate: c("full", "모션·원근(Perspective) 블러 지원", "Motion & Perspective blur supported"),
        magma: c("partial", "기본 블러 중심(방사/모션 제한)", "Basic blur; limited radial/motion options"),
      },
    },
    {
      id: "lens-bokeh-blur",
      subGroupId: "blur-sharpen",
      title: t("렌즈 블러 · 보케 피사계 심도(DoF)", "Lens Blur & Atmospheric Bokeh DoF"),
      metricTag: t("조리개 보케 · 3D 심도 연동", "Aperture bokeh · 3D depth-linked"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Photoshop 렌즈 블러와 카메라 조리개 보케를 2D 필터 + 3D 배경 심도 카드와 연결해 웹툰 연출에 특화",
        "Combines 2D aperture lens blur with 3D scene depth-of-field bokeh tailored for webtoon cuts",
      ),
      evidenceSummary: t(
        "2D 고급 블러 커널의 렌즈 보케와 3D 배경 대기 보케 DoF 카드를 함께 제공합니다.",
        "Provides both 2D lens bokeh kernels and 3D stage atmospheric bokeh depth-of-field controls.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/studio-advanced-blur-filters.ts",
        "apps/web/src/domains/creator/bg3d/StudioBg3dAtmosphericBokehDofCard.tsx",
      ],
      honestLimit: t(
        "사진 인물용 AI 깊이맵 자동 추정 렌즈 블러는 Photoshop Camera Raw/Lens Blur가 더 정교합니다.",
        "AI depth-map estimation on arbitrary 2D photos is more advanced in Photoshop Lens Blur.",
      ),
      cells: {
        toonstudio: c("full", "2D 렌즈 보케 + 3D 씬 심도 DoF 연동", "2D lens bokeh + 3D scene depth DoF"),
        photoshop: c("full", "렌즈 블러·AI 깊이맵 보케 최강", "Industry-leading Lens Blur & AI depth map"),
        csp: c("partial", "가우시안 중심(전용 조리개 보케 약함)", "Gaussian-focused; limited aperture bokeh"),
        krita: c("full", "렌즈 블러 + G'MIC 보케 필터", "Lens blur + G'MIC bokeh filters"),
        procreate: c("none", "전용 조리개 보케 렌즈 블러 미지원", "No dedicated aperture bokeh lens blur"),
        magma: c("none", "렌즈 블러 미지원", "No lens blur"),
      },
    },
    {
      id: "unsharp-highpass",
      subGroupId: "blur-sharpen",
      title: t("언샵 마스크 · 하이패스 선명화", "Unsharp Mask & High-Pass Sharpen"),
      metricTag: t("반경·양·임계치 · 선화 선명도", "Radius/Amount/Threshold · crisp ink"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Photoshop 언샵 마스크(USM)와 하이패스 오버레이 기법을 필터 갤러리·선명화 커널로 직접 구현",
        "Implemented Photoshop-style Unsharp Mask and High-Pass sharpening kernels directly in the filter suite",
      ),
      evidenceSummary: t(
        "언샵 마스크·하이패스 필터와 리사이즈 후 선화 날카로움 보정 파이프라인을 브라우저 로컬로 실행합니다.",
        "Runs Unsharp Mask, High-Pass and post-transform crispness sharpening locally in the browser.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/filter/gallery/studio-filter-gallery-engine.ts",
        "apps/web/src/domains/creator/filter/studio-photoshop-web-filter-catalog-a.ts",
      ],
      honestLimit: t(
        "Photoshop 스마트 샤픈(Smart Sharpen)의 모션 블러 역컨볼루션 복원 알고리즘은 미포함입니다.",
        "Does not yet include deconvolution motion-blur recovery like Photoshop Smart Sharpen.",
      ),
      cells: {
        toonstudio: c("full", "언샵 마스크·하이패스 선명화 내장", "Built-in Unsharp Mask & High-Pass"),
        photoshop: c("full", "USM·하이패스·스마트 샤픈 완비", "USM, High-Pass & Smart Sharpen"),
        csp: c("full", "언샵 마스크·선명하게 내장", "Unsharp Mask & Sharpen built in"),
        krita: c("full", "언샵 마스크·하이패스·G'MIC 샤픈", "Unsharp Mask, High-Pass & G'MIC sharpen"),
        procreate: c("full", "슬라이드 선명화(하이패스 수동)", "Slide Sharpen (manual high-pass)"),
        magma: c("partial", "기본 선명화(임계치/하이패스 제한)", "Basic sharpen; limited USM/High-Pass"),
      },
    },
    {
      id: "frequency-separation",
      subGroupId: "retouch-warp",
      title: t("무손실 Float32 주파수 분리 (Frequency Separation)", "Lossless Float32 Frequency Separation"),
      metricTag: t("Low+High 잔차 0 재합성", "Zero-residual Low+High recombine"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Photoshop 고급 리터칭 수동 액션(Apply Image 16-bit)을 원클릭 무손실 Float32 분리·재합성 엔진으로 내재화",
        "Turned Photoshop's multi-step Apply Image frequency separation into a 1-click lossless Float32 engine",
      ),
      evidenceSummary: t(
        "분리형 가우시안으로 저주파(색·명암)와 고주파(질감·선)를 Float32로 분리하며, 편집 없을 시 원본과 오차 0으로 재합성합니다.",
        "Separates low-frequency color/tone and high-frequency detail in Float32 with zero-loss exact recombination.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/imaging-pro/studio-separable-frequency-separation.ts",
        "apps/web/src/domains/creator/imaging-pro/studio-patchmatch-inpaint-and-freqsep.ts",
      ],
      honestLimit: t(
        "초대형 다중 레이어 스튜디오 사진 리터칭 액션 자동화는 Photoshop 액션 생태계가 더 익숙한 사용자가 많습니다.",
        "Commercial photo retouchers still rely heavily on established Photoshop Action libraries.",
      ),
      cells: {
        toonstudio: c("full", "원클릭 Float32 무손실 분리·재합성", "1-click lossless Float32 split & recombine"),
        photoshop: c("partial", "Apply Image 수동 액션 구성 필요", "Requires manual Apply Image action setup"),
        csp: c("none", "전용 주파수 분리 필터 미내장", "No built-in frequency separation filter"),
        krita: c("plugin", "G'MIC Wavelet Decompose 플러그인", "Available via G'MIC Wavelet Decompose"),
        procreate: c("none", "전용 주파수 분리 미지원", "No frequency separation"),
        magma: c("none", "주파수 분리 미지원", "No frequency separation"),
      },
    },
    {
      id: "patchmatch-inpaint",
      subGroupId: "retouch-warp",
      title: t("PatchMatch ₩0 로컬 콘텐츠 인식 인페인팅", "Local PatchMatch Content-Aware Inpainting"),
      metricTag: t("₩0 로컬 · 다중 스케일 피라미드", "KRW 0 local · multi-scale pyramid"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Photoshop Content-Aware Fill의 원조 논문(Barnes et al. 2009 PatchMatch)을 클린룸 다중 피라미드로 100% 로컬 구현",
        "Clean-room multi-scale implementation of Barnes et al. (2009) PatchMatch running 100% locally at KRW 0",
      ),
      evidenceSummary: t(
        "외부 생성형 서버나 크레딧 없이 5×5 패치 최근접 탐색 + 피라미드 투표로 배경 잡티·불필요 소품을 복원합니다.",
        "Restores unwanted elements using 5×5 nearest-neighbor field search and pyramid voting with zero cloud fees.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/imaging-pro/studio-patchmatch-inpaint-and-freqsep.ts",
        "apps/web/src/domains/creator/imaging-pro/studio-patchmatch-pyramid-ops.ts",
      ],
      honestLimit: t(
        "없는 사물을 새로 그려 넣는 생성형 채우기(Generative Fill)와 달리 주변 텍스처 복원 전용이며, 의미 생성은 Photoshop Firefly가 우위입니다.",
        "Synthesizes strictly from surrounding pixels; semantic object invention remains Photoshop Firefly's strength.",
      ),
      cells: {
        toonstudio: c("full", "₩0 브라우저 로컬 다중 스케일 PatchMatch", "KRW 0 browser-local multi-scale PatchMatch"),
        photoshop: c("full", "Content-Aware Fill + 유료 Firefly 생성", "Content-Aware Fill + paid Firefly Gen Fill"),
        csp: c("none", "콘텐츠 인식 PatchMatch 미지원", "No PatchMatch content-aware fill"),
        krita: c("plugin", "G'MIC Inpaint(Patch-Based) 플러그인", "Via G'MIC Inpaint (Patch-Based) plugin"),
        procreate: c("none", "콘텐츠 인식 채우기 미지원", "No content-aware fill"),
        magma: c("none", "인페인팅 미지원", "No content-aware inpainting"),
      },
    },
    {
      id: "liquify-tool",
      subGroupId: "retouch-warp",
      title: t("액화 (Liquify — 밀기·팽창·수축·회오리)", "Liquify (Push, Bloat, Pinch, Twirl)"),
      metricTag: t("얼굴·인체 비율 즉시 보정", "Fast anatomy & face proportion fix"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Photoshop·CSP·Procreate의 액화(픽셀 유동화) 브러시를 웹 GPU/변위장 커널로 통합",
        "Integrated Photoshop/CSP/Procreate-style displacement-field liquify brushes into the web canvas",
      ),
      evidenceSummary: t(
        "밀기·팽창·수축·회오리 변위장과 Liquify 전용 패널로 웹툰 캐릭터 얼굴과 체형 비율을 즉시 다듬습니다.",
        "Displacement-field push/bloat/pinch/twirl kernels and dedicated Liquify panel refine character proportions fast.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/studio-mesh-warp-liquify.ts",
        "apps/web/src/domains/creator/filter/studio-photoshop-liquify-harmonize.ts",
        "apps/web/src/domains/creator/StudioLiquifyPanel.tsx",
      ],
      honestLimit: t(
        "Photoshop의 얼굴 부위 자동 인식(Face-Aware Liquify 슬라이더)은 아직 미제공이며 직접 브러시로 조작합니다.",
        "Does not auto-detect facial landmarks for sliders like Photoshop's Face-Aware Liquify.",
      ),
      cells: {
        toonstudio: c("full", "밀기·팽창·수축·회오리 액화 패널", "Push, bloat, pinch & twirl Liquify panel"),
        photoshop: c("full", "액화 + Face-Aware 얼굴 인식 슬라이더", "Liquify + Face-Aware landmark sliders"),
        csp: c("full", "픽셀 유동화(다중 레이어 동시 적용)", "Liquify supporting multiple layers at once"),
        krita: c("full", "변형 도구 내 Liquify 모드(비파괴 마스크)", "Liquify transform mode with non-destructive mask"),
        procreate: c("full", "초저지연 실시간 액화 6종 모드", "Ultra-fast real-time Liquify (6 modes)"),
        magma: c("partial", "프로 티어 제한적 액화 지원", "Limited Liquify on paid tiers"),
      },
    },
    {
      id: "mesh-puppet-warp",
      subGroupId: "retouch-warp",
      title: t("메시 워프 · 퍼펫 워프 · 원근 변형", "Mesh Warp, Puppet Warp & Perspective Transform"),
      metricTag: t("Lanczos/바이큐빅 · 핀 변형", "High-quality resampling · pin warp"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Photoshop 퍼펫 워프·메시 변형과 CSP 자유 변형 격자를 WebGPU 변형 수학 + 핀 오버레이로 구현",
        "Built WebGPU transform warp math and puppet-pin overlays modeled after Photoshop and CSP warp grids",
      ),
      evidenceSummary: t(
        "다점 메시 격자 변형, 핀 기반 퍼펫 워프 오버레이, 투시 정합을 캔버스에서 바로 적용합니다.",
        "Supports multi-point mesh grid warp, pin-based puppet warp overlay and perspective fitting directly on canvas.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/render/studio-webgpu-transform-warp-math.ts",
        "apps/web/src/domains/creator/StudioPuppetWarpOverlay.tsx",
      ],
      honestLimit: t(
        "복잡한 인체 실루엣 자동 삼각화 메시는 Photoshop 퍼펫 워프의 핀 회전/깊이 정렬이 더 성숙합니다.",
        "Photoshop Puppet Warp remains more mature for pin-depth stacking on dense character silhouettes.",
      ),
      cells: {
        toonstudio: c("full", "메시 워프·퍼펫 핀 오버레이·원근 변형", "Mesh warp, puppet pin overlay & perspective"),
        photoshop: c("full", "퍼펫 워프·원근 워프·자유 메시 최강", "Full Puppet, Perspective & Split Mesh Warp"),
        csp: c("full", "메시 변형·퍼펫 변형(v4) 지원", "Mesh transform & Puppet Warp (v4)"),
        krita: c("full", "케이지·메시·원근 변형(비파괴 마스크)", "Cage, Mesh & Perspective transform masks"),
        procreate: c("partial", "메시 워프 지원(퍼펫 핀 변형 없음)", "Mesh Warp supported; no Puppet Warp pins"),
        magma: c("partial", "자유/원근 변형(퍼펫 워프 없음)", "Free/perspective transform; no Puppet Warp"),
      },
    },
    {
      id: "spectral-pigment-filter",
      subGroupId: "color-fx",
      title: t("7밴드 분광 안료 필터 · 색온도 조화", "7-Band Spectral Pigment Filter"),
      metricTag: t("Kubelka-Munk 물리 필터", "Kubelka-Munk physical filter"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "일반 RGB 색조 보정이 만드는 탁한 회색화 문제를 풀기 위해 7밴드 분광 반사율 기반 필터를 독자 설계",
        "Designed an original 7-band spectral reflectance filter to avoid muddy RGB desaturation during grading",
      ),
      evidenceSummary: t(
        "필터 갤러리에서 레이어 전체에 분광 안료 틴트와 색온도 물리 혼합을 적용해 회화적 색감을 유지합니다.",
        "Applies physical spectral tinting and color-temperature mixing across layers inside the Filter Gallery.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/filter/gallery/studio-filter-gallery-spectral-pigment.ts",
        "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
      ],
      honestLimit: t(
        "사진 인쇄용 ICC CMYK 프로파일 소프트 프루핑은 Photoshop과 Krita가 표준 도구입니다.",
        "CMYK ICC soft-proofing for offset print remains the domain of Photoshop and Krita.",
      ),
      cells: {
        toonstudio: c("full", "7밴드 KM 분광 안료 필터 기본 내장", "Built-in 7-band KM spectral pigment filter"),
        photoshop: c("none", "RGB/Lab/CMYK 보정(분광 안료 필터 없음)", "RGB/Lab/CMYK grading; no spectral filter"),
        csp: c("none", "일반 색조 보정(분광 필터 없음)", "Standard color grading; no spectral filter"),
        krita: c("none", "색공간 필터 풍부(분광 안료 미내장)", "Rich color space filters; no spectral pigment"),
        procreate: c("none", "RGB 색조 보정 전용", "RGB adjustments only"),
        magma: c("none", "기본 RGB 색보정 전용", "Basic RGB adjustments only"),
      },
    },
    {
      id: "chromatic-noise-grain",
      subGroupId: "color-fx",
      title: t("색수차 · 노이즈 · 아날로그 필름 그레인", "Chromatic Aberration, Noise & Film Grain"),
      metricTag: t("RGB 채널 시프트 · 절차적 입자", "RGB channel shift · procedural grain"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "웹툰 충격 컷·감성 마무리에 자주 쓰이는 Procreate/CSP 색수차와 필름 그레인을 경량 필터 모듈로 통합",
        "Integrated Procreate/CSP-style chromatic aberration and analog film grain for webtoon impact and mood cuts",
      ),
      evidenceSummary: t(
        "전용 그레인 엔진과 노이즈/색수차 필터 갤러리 모듈로 웹툰 마무리 질감을 즉시 입힙니다.",
        "Dedicated grain engine and noise/chromatic gallery modules add analog finishing texture immediately.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/studio-grain.ts",
        "apps/web/src/domains/creator/filter/gallery/studio-filter-gallery-noise.ts",
      ],
      honestLimit: t(
        "실제 필름 스톡(Kodak Portra 등) LUT 스캔 노이즈 프로파일은 전문 사진 보정 플러그인이 더 다양합니다.",
        "Dedicated photography film-stock emulation suites offer more real film scan profiles.",
      ),
      cells: {
        toonstudio: c("full", "색수차·노이즈·필름 그레인 내장", "Chromatic aberration, noise & film grain"),
        photoshop: c("full", "노이즈·그레인·렌즈 색수차 완비", "Noise, grain & Lens Correction aberration"),
        csp: c("full", "색수차·펄린 노이즈·필름 효과 지원", "Chromatic aberration, Perlin noise & film FX"),
        krita: c("full", "노이즈 + G'MIC 필름/색수차 다수", "Noise + extensive G'MIC film/aberration FX"),
        procreate: c("full", "색수차·노이즈 실시간 슬라이드 우수", "Snappy real-time Chromatic Aberration & Noise"),
        magma: c("partial", "기본 노이즈 수준(색수차 제한)", "Basic noise; limited chromatic aberration"),
      },
    },
    {
      id: "glow-bloom-light",
      subGroupId: "color-fx",
      title: t("글로우 · 블룸 · 라이트 데코 연출", "Glow, Bloom & Light Decor"),
      metricTag: t("하이라이트 임계 추출 · 가산 블룸", "Highlight threshold · additive bloom"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "웹툰 판타지 마법·역광 컷의 블룸/발광 연출을 1클릭 글로우 엔진과 라이트 데코 필터로 구현",
        "Built 1-click threshold bloom and light-decor filters for webtoon backlight and magic FX cuts",
      ),
      evidenceSummary: t(
        "명부 임계치 기반 가산 블룸과 라이트 데코 모듈로 발광 효과를 비파괴 레이어 흐름과 결합합니다.",
        "Threshold-based additive bloom and light decor modules pair cleanly with non-destructive workflows.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/studio-glow.ts",
        "apps/web/src/domains/creator/filter/gallery/studio-filter-gallery-light-decor.ts",
      ],
      honestLimit: t(
        "HDR 32-bit 선형 공간의 물리 렌즈 플레어 합성 깊이는 전문 합성 툴(After Effects/Photoshop 32bpc)이 우위입니다.",
        "32-bit linear HDR lens flare compositing remains deeper in dedicated VFX/32bpc apps.",
      ),
      cells: {
        toonstudio: c("full", "글로우·블룸·라이트 데코 필터 내장", "Built-in glow, bloom & light decor"),
        photoshop: c("full", "외부 광선·블러 합성·HDR 블룸", "Outer Glow, Screen blur & HDR bloom"),
        csp: c("partial", "가우시안+발광 닷지 조합(전용 블룸 약함)", "Gaussian + Glow Dodge combo; no dedicated bloom"),
        krita: c("full", "글로우 레이어 스타일 + G'MIC 블룸", "Glow layer styles + G'MIC bloom"),
        procreate: c("full", "전용 블룸(Bloom) 실시간 슬라이더", "Dedicated real-time Bloom slider"),
        magma: c("partial", "발광 블렌드 모드 수동 조합", "Manual glow blend mode workflow"),
      },
    },
    {
      id: "gradient-map-tone-curve",
      subGroupId: "color-fx",
      title: t("그라디언트 맵 · 톤 커브 · 컬러 밸런스", "Gradient Map, Tone Curve & Color Balance"),
      metricTag: t("명도→팔레트 매핑 · 채널 커브", "Luminance-to-palette · channel curves"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "웹툰 그레이스케일 채색·분위기 통일에 핵심인 CSP 그라디언트 맵과 톤 커브를 전용 패널로 통합",
        "Built dedicated Gradient Map, Tone Curve and Color Balance panels tailored for webtoon mood grading",
      ),
      evidenceSummary: t(
        "그라디언트 맵 매핑 엔진, RGB/휘도 톤 커브 패널, 섀도/미드톤/하이라이트 컬러 밸런스를 기본 제공합니다.",
        "Provides gradient map LUT engine, RGB/luminance tone curve panel and 3-way color balance out of the box.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/drawing/studio-gradient-map.ts",
        "apps/web/src/domains/creator/StudioCurvePanel.tsx",
        "apps/web/src/domains/creator/StudioColorBalancePanel.tsx",
      ],
      honestLimit: t(
        "CSP Assets에서 원클릭으로 내려받는 수천 종 웹툰 작가 공유 그라디언트 세트 생태계는 CSP가 훨씬 큽니다.",
        "CSP Assets hosts thousands of ready-made webtoon artist gradient map sets.",
      ),
      cells: {
        toonstudio: c("full", "그라디언트 맵·톤 커브·컬러 밸런스", "Gradient map, tone curve & color balance"),
        photoshop: c("full", "조정 레이어 그라디언트 맵·커브 최강", "Full adjustment-layer gradient map & curves"),
        csp: c("full", "그라디언트 맵·보정 레이어·에셋 풍부", "Gradient maps, correction layers & vast packs"),
        krita: c("full", "필터 레이어 그라디언트 맵·커브 지원", "Non-destructive gradient map & curve layers"),
        procreate: c("full", "그라디언트 맵·커브(비파괴 조정 레이어 없음)", "Gradient map & curves (destructive only)"),
        magma: c("partial", "프로 티어 색조/그라디언트 맵 지원", "Color/gradient map available on paid tier"),
      },
    },
    {
      id: "smart-filter-stack",
      subGroupId: "nondestructive-webtoon",
      title: t("비파괴 스마트 필터 스택 & 필터 마스크", "Non-Destructive Smart Filter Stack & Masks"),
      metricTag: t("재편집·순서 변경·마스크", "Re-editable · reorderable · masked"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Photoshop 스마트 필터와 Krita 필터 마스크의 비파괴 재편집 계약을 브라우저 레이어 파이프라인에 도입",
        "Brought Photoshop Smart Filter and Krita filter-mask non-destructive re-editing into browser layers",
      ),
      evidenceSummary: t(
        "필터 적용 후에도 파라미터 수정·순서 재배치·부분 마스크 제어가 가능한 스마트 필터 스택 계약을 구현했습니다.",
        "Implements a smart filter stack contract with live parameter re-editing, reordering and filter masks.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/contracts/studio-smart-filter-stack-contract.ts",
        "apps/web/src/domains/creator/studio-smart-filter-mutation.ts",
        "apps/web/src/domains/creator/filter/studio-filter-mask.ts",
      ],
      honestLimit: t(
        "중첩 스마트 오브젝트(Smart Object 내부의 스마트 필터 재귀 편집) 깊이는 Photoshop이 독보적입니다.",
        "Deeply nested recursive Smart Objects remain unique to desktop Adobe Photoshop.",
      ),
      cells: {
        toonstudio: c("full", "비파괴 스마트 필터 스택·마스크 지원", "Non-destructive smart filter stack & masks"),
        photoshop: c("full", "스마트 오브젝트·중첩 스마트 필터 최강", "Gold-standard nested Smart Objects & filters"),
        csp: c("partial", "색조 보정 레이어만 비파괴(블러 등 파괴형)", "Color correction layers only; blurs destructive"),
        krita: c("full", "비파괴 필터 레이어·필터 마스크 완비", "Full non-destructive filter layers & masks"),
        procreate: c("none", "모든 필터·조정이 파괴형 적용", "All filters and adjustments are destructive"),
        magma: c("none", "비파괴 스마트 필터 스택 미지원", "No non-destructive filter stack"),
      },
    },
    {
      id: "gpu-screentone",
      subGroupId: "nondestructive-webtoon",
      title: t("GPU 스크린톤 · 하프톤 · 망점 깎기", "GPU Screentone, Halftone & Scrape Brush"),
      metricTag: t("실시간 선밀도/각도 · 깎기 브러시", "Live LPI/angle · scrape brush"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "일본 만화·흑백 웹툰의 핵심인 CSP 톤 레이어와 망점 깎기(Tone Scraping)를 GPU 스크린톤 + 깎기 브러시로 구현",
        "Modeled after CSP comic screentone layers and tone-scraping workflows using GPU shaders and live masks",
      ),
      evidenceSummary: t(
        "GPU 스크린톤 셰이더, 라이브 마스크, 망점 깎기 브러시로 출판 만화와 흑백 연출을 브라우저에서 처리합니다.",
        "Combines GPU screentone generation, live masks and a tone-scrape brush for manga/comic shading.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/render/gpu-next/gpu-stylus-predict-and-screentone.ts",
        "apps/web/src/domains/creator/screentone/studio-screentone-live-mask.ts",
        "apps/web/src/domains/creator/screentone/studio-screentone-scrape-brush.ts",
      ],
      honestLimit: t(
        "600dpi 단색 이진(1-bit Monochrome) 인쇄 출판용 모아레 방지 톤 출력은 CSP EX가 업계 표준입니다.",
        "CSP EX remains the print-industry standard for 600dpi 1-bit monochrome anti-moiré manga output.",
      ),
      cells: {
        toonstudio: c("full", "GPU 스크린톤·라이브 마스크·깎기 브러시", "GPU screentone, live mask & scrape brush"),
        photoshop: c("partial", "컬러 하프톤 필터(만화 톤 깎기 비효율)", "Color Halftone filter; clunky for comic tone"),
        csp: c("full", "비파괴 톤 레이어·인쇄 1-bit 업계 표준", "Industry-standard live tones & 1-bit print"),
        krita: c("partial", "하프톤 필터 마스크(만화 전용 톤 약함)", "Halftone filter mask; fewer comic presets"),
        procreate: c("partial", "하프톤 필터(파괴형·깎기 워크플로 제한)", "Destructive halftone; limited scrape workflow"),
        magma: c("none", "전용 스크린톤 엔진 미지원", "No dedicated screentone engine"),
      },
    },
    {
      id: "jfa-outline-border",
      subGroupId: "nondestructive-webtoon",
      title: t("JFA 거리장 외곽선 · 경계선 효과", "JFA Distance-Field Outline & Border Effect"),
      metricTag: t("Jump Flooding O(log N) 균일 외곽선", "O(log N) JFA uniform outline"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "CSP 레이어 속성 경계선 효과와 효과음/말풍선 테두리를 Jump Flooding Algorithm(JFA) 거리장으로 깔끔하게 구현",
        "Implemented CSP-style crisp border effects using Jump Flooding Algorithm (JFA) signed distance fields",
      ),
      evidenceSummary: t(
        "두꺼운 외곽선에서도 모서리 깨짐 없이 균일한 테두리를 생성하는 JFA 거리장과 엣지 맵 필터를 제공합니다.",
        "JFA distance-field and edge-map filters generate clean, artifact-free outlines even at heavy widths.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/scene-3d/studio-asset3d-pbr-jfa-wave-engine.ts",
        "apps/web/src/domains/creator/filter/gallery/studio-filter-gallery-map-edge.ts",
      ],
      honestLimit: t(
        "수채 경계선·이중 외곽선을 레이어 속성 체크박스 한 번으로 켜는 일상 편의성은 CSP 레이어 속성이 매우 직관적입니다.",
        "CSP's 1-click Layer Property border toggles (including watercolor edge) remain exceptionally convenient.",
      ),
      cells: {
        toonstudio: c("full", "JFA 거리장 외곽선·엣지 맵 필터", "JFA distance-field outline & edge map"),
        photoshop: c("full", "레이어 스타일 획(Stroke) 실시간 적용", "Live Layer Style Stroke"),
        csp: c("full", "레이어 속성 경계선·수채 경계 최강", "Best-in-class Layer Property borders"),
        krita: c("full", "레이어 스타일 획(Stroke) 지원", "Layer Style Stroke supported"),
        procreate: c("none", "자동 레이어 외곽선 효과 미지원", "No automatic layer border effect"),
        magma: c("none", "레이어 외곽선 효과 미지원", "No layer outline effect"),
      },
    },
  ],
  honestTradeoffs: [
    {
      competitorId: "photoshop",
      competitorName: "Adobe Photoshop",
      area: t("사진 리터칭·Camera Raw·중첩 스마트 오브젝트", "Photo retouching, Camera Raw & nested Smart Objects"),
      competitorEdge: t(
        "32-bit HDR 사진 보정, Camera Raw, Neural Filters, 중첩 스마트 오브젝트 생태계는 여전히 독보적입니다.",
        "Unrivaled in 32-bit HDR photo grading, Camera Raw, Neural Filters and deeply nested Smart Objects.",
      ),
      toonstudioPosition: t(
        "구독료 없이 웹툰·일러스트 핵심 필터(주파수 분리·PatchMatch·액화·분광 필터·스마트 스택)를 브라우저 로컬로 제공합니다.",
        "Delivers core illustration & webtoon filters (frequency separation, PatchMatch, liquify, spectral, smart stack) locally at KRW 0.",
      ),
    },
    {
      competitorId: "krita",
      competitorName: "Krita (G'MIC)",
      area: t("500종 이상 수학적 필터 카탈로그", "500+ mathematical filter catalog"),
      competitorEdge: t(
        "G'MIC-Qt 플러그인은 학술·실험적 영상처리 필터 수량에서 타의 추종을 불허합니다.",
        "G'MIC-Qt offers an unmatched breadth of 500+ specialized mathematical image filters.",
      ),
      toonstudioPosition: t(
        "방대한 실험 필터를 전부 나열하기보다 웹툰 제작에 실제로 쓰이는 Watershed·주파수 분리·보정 필터를 웹 네이티브 UI로 정선했습니다.",
        "Curates webtoon-essential algorithms (Watershed, frequency separation, color grading) into a zero-install native UI.",
      ),
    },
    {
      competitorId: "csp",
      competitorName: "Clip Studio Paint",
      area: t("600dpi 인쇄 만화 톤 & 보정 에셋", "600dpi print manga tones & correction assets"),
      competitorEdge: t(
        "단색 출판 만화 1-bit 톤 출력과 Assets 스토어의 수천 종 그라디언트 맵 팩이 매우 강력합니다.",
        "Industry benchmark for 1-bit monochrome print tones and thousands of downloadable gradient map sets.",
      ),
      toonstudioPosition: t(
        "웹 스크롤 웹툰·디지털 연재에 맞춰 비파괴 스마트 필터 스택과 GPU 스크린톤, 7밴드 분광 필터를 통합 제공합니다.",
        "Focuses on digital vertical-scroll webtoon production with non-destructive filter stacks, GPU tones and spectral grading.",
      ),
    },
    {
      competitorId: "procreate",
      competitorName: "Procreate",
      area: t("iPad 터치 슬라이드 실시간 반응 속도", "iPad gesture real-time filter speed"),
      competitorEdge: t(
        "파괴형 대신 Metal 하드웨어에 밀착한 120fps 즉각 슬라이드 미리보기가 매우 쾌적합니다.",
        "Trades non-destructive stacks for remarkably fluid 120fps Metal gesture previews on iPad.",
      ),
      toonstudioPosition: t(
        "데스크톱·노트북·태블릿 브라우저에서 나중에 다시 고칠 수 있는 비파괴 스마트 필터 스택을 우선합니다.",
        "Prioritizes cross-platform non-destructive smart filter stacks that stay editable across revisions.",
      ),
    },
  ],
};
