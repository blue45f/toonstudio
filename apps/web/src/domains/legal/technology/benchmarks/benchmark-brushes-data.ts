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

const BRUSH_TOOLS: readonly BenchmarkToolProfile[] = [
  {
    id: "toonstudio",
    name: "ToonStudio",
    shortName: "ToonStudio",
    role: t("브라우저 로컬 웹툰·회화 통합 스튜디오", "Browser-local webtoon & painting studio"),
    pricing: t("베타 전 기능 ₩0 (설치 없음)", "KRW 0 beta (no install)"),
    platform: t("WebGPU / WebGL2 / Canvas2D 브라우저", "WebGPU / WebGL2 / Canvas2D browsers"),
    benchmarkTakeaway: t(
      "7밴드 Kubelka-Munk 분광 혼색 + 2D 유체 수채화 + 임파스토 릴리프 + 노드 브러시 스튜디오를 브라우저 로컬로 통합",
      "Unifies 7-band Kubelka-Munk spectral mixing, 2D fluid watercolor, impasto relief and node brush studio locally in-browser",
    ),
    honestStrength: t(
      "설치·구독 없이 분광 혼색·유체 수채화·웹툰 펜선을 한 캔버스에서 바로 실행",
      "Runs spectral pigment mixing, fluid watercolor and comic ink in one zero-install browser canvas",
    ),
  },
  {
    id: "csp",
    name: "Clip Studio Paint",
    shortName: "CSP",
    role: t("만화·웹툰 업계 표준 데스크톱·태블릿 드로잉 툴", "Industry-standard manga & webtoon drawing suite"),
    pricing: t("영구판(PC) 또는 월/연 구독", "One-time (PC) or monthly/annual subscription"),
    platform: t("Windows · macOS · iPad · Android", "Windows · macOS · iPad · Android"),
    benchmarkTakeaway: t(
      "G펜 테이퍼, 벡터 교차점 지우개, 듀얼 브러시, 데코 리본 브러시 흐름을 벤치마킹",
      "Benchmarked for G-pen taper, vector intersection eraser, dual-tip brushes and deco ribbon stamps",
    ),
    honestStrength: t(
      "10년 이상 축적된 Assets 스토어와 10만 종 이상 검증된 웹툰 전용 `.sut` 브러시 생태계",
      "10+ years of Clip Studio Assets ecosystem with 100k+ production-tested `.sut` comic brushes",
    ),
  },
  {
    id: "procreate",
    name: "Procreate",
    shortName: "Procreate",
    role: t("iPad 전용 저지연 터치·애플펜슬 일러스트 툴", "iPad-exclusive low-latency Apple Pencil illustration app"),
    pricing: t("일회성 유료 구매", "One-time purchase"),
    platform: t("iPadOS 전용", "iPadOS only"),
    benchmarkTakeaway: t(
      "브러시 스튜디오의 직관적 슬라이더·테스트 패드와 연필 틸트 쉐이딩 감각을 벤치마킹",
      "Benchmarked for Brush Studio live test pad UX and natural Apple Pencil tilt shading feel",
    ),
    honestStrength: t(
      "Metal 기반 iPad 하드웨어 밀착 최적화와 Apple Pencil 초저지연 필기감",
      "Tightly tuned Metal engine on iPad with industry-leading Apple Pencil latency and gesture polish",
    ),
  },
  {
    id: "krita",
    name: "Krita",
    shortName: "Krita",
    role: t("오픈소스(GPL) 데스크톱 디지털 페인팅 전문 툴", "Open-source (GPL) desktop digital painting suite"),
    pricing: t("무료 오픈소스 (스토어판 유료 후원)", "Free open-source (paid store supporter builds)"),
    platform: t("Windows · macOS · Linux · Android", "Windows · macOS · Linux · Android"),
    benchmarkTakeaway: t(
      "다중 엔진 아키텍처, MyPaint CC0 호환, 색상 번짐(Color Smudge) 및 붓모 반응 설계를 참고",
      "Referenced for multi-engine brush architecture, MyPaint CC0 integration and color smudge mechanics",
    ),
    honestStrength: t(
      "16개 독립 네이티브 C++ 브러시 엔진과 32-bit HDR 파이프라인 성숙도",
      "16 distinct native C++ brush engines with mature 32-bit float HDR painting support",
    ),
  },
  {
    id: "rebelle",
    name: "Rebelle 7",
    shortName: "Rebelle 7",
    role: t("유체 수채화·유화 임파스토 전통 매체 물리 특화 툴", "Real-world watercolor fluid & oil impasto simulation specialist"),
    pricing: t("유료 영구 라이선스 (Standard / Pro)", "Paid perpetual license (Standard / Pro)"),
    platform: t("Windows · macOS", "Windows · macOS"),
    benchmarkTakeaway: t(
      "2D Shallow-Water 유체 수채화, 종이 모세관 번짐, 과립화, 임파스토 릴리프 측면광 원리를 클린룸으로 내재화",
      "Clean-room inspiration for 2D shallow-water watercolor diffusion, granulation and impasto raking-light relief",
    ),
    honestStrength: t(
      "데스크톱 네이티브 환경의 실물급 유화 두께감, 메탈릭 안료, NanoPixel 초고해상도 출력",
      "Unmatched native desktop real-media oil body, metallic leaf pigments and NanoPixel upscaling",
    ),
  },
  {
    id: "photoshop",
    name: "Adobe Photoshop",
    shortName: "Photoshop",
    role: t("이미지 편집·콘셉트 아트 표준 래스터 툴", "Industry-standard raster imaging & concept art suite"),
    pricing: t("월간 Creative Cloud 구독", "Monthly Creative Cloud subscription"),
    platform: t("Windows · macOS · iPad · Web(제한)", "Windows · macOS · iPad · Web (limited)"),
    benchmarkTakeaway: t(
      "`.abr` 브러시 팁 포맷 호환, 듀얼 브러시 마스킹, 믹서 브러시 픽업 모델을 분석·호환",
      "Analyzed for `.abr` tip format compatibility, dual-brush masking and mixer brush pickup behavior",
    ),
    honestStrength: t(
      "수십 년간 축적된 `.abr` 산업 표준 라이브러리와 대형 출판/게임 파이프라인 호환성",
      "Decades of `.abr` industry brush archives and seamless print/AAA concept art pipeline compatibility",
    ),
  },
  {
    id: "magma",
    name: "Magma Studio",
    shortName: "Magma",
    role: t("실시간 멀티유저 브라우저 드로잉 잼 특화 웹앱", "Browser-based realtime multiplayer drawing jam web app"),
    pricing: t("무료 티어 + 팀/프로 구독", "Freemium + Pro/Team subscription"),
    platform: t("웹 브라우저", "Web browser"),
    benchmarkTakeaway: t(
      "무설치 브라우저 캔버스 즉시 진입과 협업 드로잉 스트로크 응답성을 벤치마킹",
      "Benchmarked for zero-install browser startup and responsive collaborative stroke feedback",
    ),
    honestStrength: t(
      "최대 30인 동시 드로잉 잼 룸에 맞춘 가벼운 브러시 동기화 안정성",
      "Lightweight brush sync proven for up to 30 simultaneous artists in live drawing jam rooms",
    ),
  },
];

export const BENCHMARK_BRUSHES_DATASET: BenchmarkDataset = {
  id: "brushes",
  path: "/about/technology/benchmarks/brushes",
  shortLabel: t("브러시 15종", "15 Brushes"),
  eyebrow: `GRANULAR BENCHMARK · BRUSHES · ${BENCHMARK_SNAPSHOT_DATE}`,
  title: t(
    "브러시 종류별 1:1 정밀 벤치마크 (15종 × 7개 툴)",
    "1:1 Granular Brush Engine Benchmark (15 Types × 7 Tools)",
  ),
  subtitle: t(
    "연필·G펜·유체 수채화·임파스토·오일파스텔·마커·듀얼/갈필·커스텀 스튜디오까지 브러시 종류 단위로 실제 코드 구현과 경쟁 툴 강점을 대조했습니다.",
    "Item-by-item audit across pencil, G-pen, fluid watercolor, impasto, pastel, marker, dual-tip and custom brush studio — backed by real repository paths.",
  ),
  scopeNote: t(
    "비교 범위: ToonStudio 2026-11-22 코드베이스 실측(비상업 mixbox 0건 클린룸 7밴드 KM 분광 엔진) vs 6개 대표 드로잉 툴 공식 공개 기능 기준.",
    "Scope: verified against 2026-11-22 ToonStudio source (zero non-commercial mixbox dependencies) versus publicly documented capabilities of 6 drawing tools.",
  ),
  snapshotDate: BENCHMARK_SNAPSHOT_DATE,
  tools: BRUSH_TOOLS,
  subGroups: [
    {
      id: "dry-ink",
      label: t("건식·선화", "Dry & Ink"),
      description: t("연필·샤프·G펜·벡터 선화·교차점 정리", "Pencil, mechanical graphite, G-pen and vector lineart"),
    },
    {
      id: "wet-paint",
      label: t("습식·회화", "Wet & Paint"),
      description: t("2D 유체 수채화·7밴드 분광 안료·유화 임파스토·오일파스텔·목탄", "2D fluid watercolor, 7-band spectral pigment, oil impasto, pastel & charcoal"),
    },
    {
      id: "marker-texture",
      label: t("마커·질감·스탬프", "Marker, Dry-Brush & Stamp"),
      description: t("알코올 마커·에어브러시·듀얼 팁·갈필 붓모·패턴 리본", "Alcohol marker, airbrush, dual-tip, dry-brush split & deco ribbons"),
    },
    {
      id: "custom-compat",
      label: t("커스텀·호환", "Custom & Compat"),
      description: t("커스텀 브러시 스튜디오·노드 그래프·외부 포맷·상업 권리", "Custom brush studio, node graph, external format import & rights"),
    },
  ],
  rows: [
    {
      id: "pencil-graphite",
      subGroupId: "dry-ink",
      title: t("연필 · 샤프 (흑연 질감 & 틸트 쉐이딩)", "Pencil & Mechanical Graphite (Tilt Shading)"),
      metricTag: t("R8 종이 그레인 · 이방성 흑연", "R8 paper grain · anisotropic graphite"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Procreate 6B 연필과 CSP 리얼 연필의 기울기 음영·종이 결 걸림을 분석해 R8 그레인 + 이방성 패스로 내재화",
        "Analyzed Procreate 6B & CSP Real Pencil tilt shading and built R8 paper-grain + anisotropic pass engine",
      ),
      evidenceSummary: t(
        "필압·기울기에 따라 종이 요철에 흑연이 걸리는 다중 패스 연필 프로파일과 이방성 건식 그레인을 로컬 실행합니다.",
        "Runs multi-pass pencil profiles and anisotropic dry-media grain driven by pressure and stylus tilt locally.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/brush/studio-pencil-alias-passes.ts",
        "apps/web/src/domains/creator/brush/studio-dry-media-anisotropic-grain-v1.ts",
      ],
      honestLimit: t(
        "iPad Apple Pencil 호버·기울기 응답 속도는 네이티브 Metal 기반 Procreate가 여전히 가장 매끄럽습니다.",
        "Native Metal Apple Pencil tilt latency on iPad remains smoothest in Procreate.",
      ),
      cells: {
        toonstudio: c("full", "R8 종이 그레인·틸트·이방성 흑연 패스", "R8 grain, tilt & anisotropic graphite passes"),
        csp: c("full", "리얼 연필·샤프·종이 텍스처 풍부", "Real pencil, mechanical & rich paper grain"),
        procreate: c("full", "6B/HB 틸트 쉐이딩 최고 수준", "Top-tier 6B/HB tilt shading on iPad"),
        krita: c("full", "틸트·텍스처 연필 프리셋 다수", "Extensive tilt & textured pencil presets"),
        rebelle: c("full", "종이 요철 물리 연동 흑연 연필", "Paper-tooth physical graphite simulation"),
        photoshop: c("full", "Kyle 연필 세트·틸트 지원", "Kyle pencil packs with tilt support"),
        magma: c("partial", "기본 텍스처 연필(고급 종이 물성 제한)", "Basic textured pencil; limited tooth physics"),
      },
    },
    {
      id: "gpen-ink",
      subGroupId: "dry-ink",
      title: t("G펜 · 먹선 · 웹툰 강약 잉크", "G-Pen & Variable Comic Ink"),
      metricTag: t("진입/이탈 테이퍼 · 예측 스무딩", "In/Out taper · predictive smoothing"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "CSP G펜/둥근펜의 진입·이탈 빼기(In/Out Taper)와 손떨림 보정 곡선을 웹 캔버스 커널에 이식",
        "Modeled after CSP G-pen/Maru-pen in/out taper and stabilization curves inside the browser stroke kernel",
      ),
      evidenceSummary: t(
        "필압 감도 커브, 스트로크 진입/이탈 자동 테이퍼, V2 곡선 리샘플링으로 웹툰 강약 선화를 안정적으로 그립니다.",
        "Combines pressure curves, automatic in/out stroke taper and V2 curve resampling for crisp comic lineart.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/brush/studio-brush-inout-taper.ts",
        "apps/web/src/domains/creator/brush/studio-ink-pressure-model.ts",
        "apps/web/src/domains/creator/brush/studio-stroke-curve-resampler-v2.ts",
      ],
      honestLimit: t(
        "600dpi 대형 인쇄 원고에서 초고속 120Hz 필기 지연은 네이티브 데스크톱 CSP가 유리합니다.",
        "Native desktop CSP still edges out browser pipelines on ultra-high-DPI 600dpi print ink latency.",
      ),
      cells: {
        toonstudio: c("full", "In/Out 테이퍼·필압 커브·V2 리샘플러", "In/out taper, pressure curves & V2 resampler"),
        csp: c("full", "웹툰 G펜/카브라펜 업계 표준", "Webtoon/manga G-pen industry benchmark"),
        procreate: c("full", "스튜디오 펜·StreamLine 보정 우수", "Studio Pen with strong StreamLine smoothing"),
        krita: c("full", "가중치 스무딩 잉크 펜 지원", "Weighted smoothing ink brushes"),
        rebelle: c("full", "잉크 펜·캘리그라피 닙 지원", "Ink pen & calligraphy nib presets"),
        photoshop: c("partial", "기본 원형 잉크(웹툰 전용 테이퍼 약함)", "Basic ink; weaker comic taper ergonomics"),
        magma: c("full", "펜/잉크·스태빌라이저 기본 내장", "Built-in ink pen with stabilizer"),
      },
    },
    {
      id: "vector-ink-eraser",
      subGroupId: "dry-ink",
      title: t("벡터 선화 브러시 & 교차점 지우개", "Vector Lineart & Intersection Eraser"),
      metricTag: t("선폭 후수정 · 교차점 정리", "Post-stroke width edit · intersection erase"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "CSP 벡터 레이어의 교차점까지 지우기·선폭 수정 워크플로를 브라우저 벡터 선화 도구로 구현",
        "Implemented CSP-style vector intersection erasing and post-stroke line width controls in the browser",
      ),
      evidenceSummary: t(
        "선화를 그린 뒤 두께를 부분 보정하고 교차선을 깔끔히 정리하는 선폭 조정 및 고급 지우개 섹션을 제공합니다.",
        "Provides post-draw line width adjustment and advanced eraser controls for clean comic intersections.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/brush/StudioLineWidthAdjustmentPanel.tsx",
        "apps/web/src/domains/creator/brush/StudioEraserAdvancedSection.tsx",
      ],
      honestLimit: t(
        "수천 개 벡터 스트로크가 겹친 복잡한 배경 선화 제어점 편집 깊이는 CSP EX 벡터 레이어가 더 성숙합니다.",
        "CSP EX remains more mature for dense vector control-point editing across thousands of overlapping strokes.",
      ),
      cells: {
        toonstudio: c("full", "선폭 후수정·고급 벡터 지우개 내장", "Post-width adjustment & vector eraser built in"),
        csp: c("full", "벡터 레이어·교차점 지우개 최강", "Best-in-class vector layer & intersection eraser"),
        procreate: c("none", "래스터 중심(벡터 선화 레이어 없음)", "Raster-only; no vector lineart layer"),
        krita: c("partial", "SVG 벡터 레이어(만화 교차 지우개 제한)", "SVG vector layers; no comic intersection erase"),
        rebelle: c("none", "래스터 전통 매체 전용", "Raster real-media only"),
        photoshop: c("partial", "펜 툴 패스(만화 강약 벡터 지우개 없음)", "Pen paths only; no comic vector eraser"),
        magma: c("none", "래스터 레이어 전용", "Raster layers only"),
      },
    },
    {
      id: "fluid-watercolor",
      subGroupId: "wet-paint",
      title: t("2D 유체 수채화 · 모세관 번짐 · 백런", "2D Fluid Watercolor, Diffusion & Backrun"),
      metricTag: t("Shallow-Water WGSL · CPU 1:1", "Shallow-Water WGSL · CPU parity"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Rebelle 7의 수분-안료 유체 수채화와 종이 건조 테두리(백런)를 100% 클린룸 Shallow-Water 방정식으로 내재화",
        "Clean-room 2D Shallow-Water fluid solver inspired by Rebelle 7 wet diffusion and drying backrun edges",
      ),
      evidenceSummary: t(
        "WGSL Compute 셰이더와 동일 수학 CPU 폴백으로 물번짐, 모세관 확산, 웻 엣지 블룸을 브라우저에서 ₩0으로 실행합니다.",
        "Runs identical math across WGSL Compute and CPU fallback for pigment advection, capillary spread and wet-edge bloom.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/imaging-pro/studio-fluid-watercolor-sim.ts",
        "apps/web/src/domains/creator/imaging-pro/studio-fluid-watercolor-wgsl.ts",
        "apps/web/src/domains/creator/brush/studio-wet-edge-bloom-v1.ts",
      ],
      honestLimit: t(
        "실시간 캔버스 기울이기 중력 흐름(Tilt-to-drip)과 초고해상도 대형 수채지 장시간 건조 시뮬은 Rebelle 7이 앞섭니다.",
        "Rebelle 7 leads in live canvas tilt-gravity dripping and long-duration full-sheet fluid drying.",
      ),
      cells: {
        toonstudio: c("full", "2D Shallow-Water 유체·백런·웻 블룸", "2D Shallow-Water fluid, backrun & wet bloom"),
        csp: c("partial", "수채 경계 효과(실시간 유체 시뮬 없음)", "Watercolor edge border; no live fluid solver"),
        procreate: c("partial", "습식 텍스처 브러시(물리 유체 미지원)", "Wet-look brushes; no physical fluid sim"),
        krita: c("partial", "RGBA/수채 팁(실시간 유체 시뮬 없음)", "Watercolor tips; no real-time fluid engine"),
        rebelle: c("full", "실시간 중력·모세관 수채화 업계 최고", "Industry benchmark for live fluid watercolor"),
        photoshop: c("partial", "라이브 팁 수채(물리 유체 미지원)", "Wet brush presets without fluid simulation"),
        magma: c("none", "수채 유체 시뮬레이션 미지원", "No watercolor fluid simulation"),
      },
    },
    {
      id: "spectral-granulation",
      subGroupId: "wet-paint",
      title: t("7밴드 분광 안료 혼색 & 과립화", "7-Band Spectral Pigment Mixing & Granulation"),
      metricTag: t("Kubelka-Munk 7밴드 · mixbox 0건", "7-band Kubelka-Munk · 0 mixbox"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Rebelle의 물리 안료 혼색(파랑+노랑→초록)을 비상업 Mixbox 라이선스 없이 클린룸 7밴드 KM 분광 커널로 구현",
        "Built clean-room 7-band Kubelka-Munk spectral mixing (blue + yellow -> green) with zero non-commercial Mixbox code",
      ),
      evidenceSummary: t(
        "420~670nm 7파장 반사율과 종이 골짜기 안료 침강(과립화)을 상업 안전 클린룸 커널로 처리합니다.",
        "Computes 420–670nm 7-band reflectance and paper-valley pigment granulation in a commercially safe kernel.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
        "apps/web/src/domains/creator/brush-lab/brush-studio-v6-recipe-catalog-km7-spectral.ts",
        "apps/web/src/domains/creator/brush/wet-paper/studio-wet-paper-lbm-wgsl.ts",
      ],
      honestLimit: t(
        "실제 제조사별(Daniel Smith·Winsor & Newton 등) 수백 종 안료 분광 측정 프리셋 DB는 Rebelle Pro가 더 방대합니다.",
        "Rebelle Pro ships a larger database of measured real-world commercial pigment profiles.",
      ),
      cells: {
        toonstudio: c("full", "클린룸 7밴드 KM 분광·과립화(상업 안전)", "Clean-room 7-band KM spectral & granulation"),
        csp: c("partial", "지각 혼색 지원(분광 안료 과립화 제한)", "Perceptual mixing; limited pigment granulation"),
        procreate: c("none", "RGB 혼색 중심(분광 혼색 미지원)", "RGB mixing; no spectral pigment model"),
        krita: c("partial", "MyPaint/색공간 혼합(KM 분광 기본 미탑재)", "Color space mixing; no built-in KM spectral"),
        rebelle: c("full", "Pro 버전 실물 안료 분광·과립화 최강", "Pro real-pigment spectral & granulation leader"),
        photoshop: c("none", "RGB/CMYK 혼색(분광 안료 미지원)", "RGB/CMYK mixing only; no spectral engine"),
        magma: c("none", "기본 sRGB 알파 블렌딩", "Standard sRGB alpha blending"),
      },
    },
    {
      id: "oil-impasto",
      subGroupId: "wet-paint",
      title: t("유화 · 임파스토 두꺼운 물감 질감", "Oil Paint & Impasto Relief"),
      metricTag: t("높이장 릴리프 · 붓모 픽업", "Heightmap relief · bristle pickup"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Rebelle 7 유화 임파스토와 Corel Painter 두꺼운 물감의 높이장·조명 릴리프를 브라우저 WebGPU/CPU로 구현",
        "Modeled after Rebelle 7 impasto relief and thick-paint heightmap lighting for WebGPU/CPU canvases",
      ),
      evidenceSummary: t(
        "페인트 높이장 능선 세그먼트, 측면광 릴리프 셰이딩, 젖은 물감 붓모 픽업 혼색을 별도 설치 없이 실행합니다.",
        "Computes paint ridge segments, raking-light relief shading and wet-into-wet bristle pickup locally.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/brush/studio-oil-impasto-ridge-segment.ts",
        "apps/web/src/domains/creator/brush/studio-oil-ribbon-impasto-relief.ts",
        "apps/web/src/domains/creator/studio-impasto-relief-shading-v1.ts",
      ],
      honestLimit: t(
        "4K 이상 캔버스에서 전체 레이어 전역 조명 방향 실시간 회전과 나이프 혼합 질감은 Rebelle 7 네이티브가 앞섭니다.",
        "Rebelle 7 native leads in real-time full-4K global impasto light rotation and palette-knife mixing.",
      ),
      cells: {
        toonstudio: c("full", "높이장 릴리프·측면광·웨트 픽업 지원", "Heightmap relief, raking light & wet pickup"),
        csp: c("partial", "두꺼운 유화 브러시(실시간 높이장 없음)", "Thick oil brushes; no real-time heightmap"),
        procreate: c("partial", "텍스처 유화(실시간 3D 높이장 없음)", "Textured oil brushes; no dynamic heightmap"),
        krita: c("partial", "RGBA 임파스토 팁(동적 씬 조명 제한)", "RGBA impasto tips; limited dynamic relighting"),
        rebelle: c("full", "실시간 3D 임파스토 높이장·조명 최강", "Best-in-class live 3D impasto height & lighting"),
        photoshop: c("partial", "믹서 브러시(실시간 높이장 릴리프 없음)", "Mixer brush; no real-time impasto heightmap"),
        magma: c("none", "임파스토 높이장 미지원", "No impasto relief engine"),
      },
    },
    {
      id: "oil-pastel-crayon",
      subGroupId: "wet-paint",
      title: t("오일파스텔 · 크레용 · 건식 혼색", "Oil Pastel, Crayon & Dry Blending"),
      metricTag: t("종이 골짜기 접촉 · 텍스처 결합", "Paper valley contact · texture combine"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Rebelle 파스텔과 Procreate 크레용의 종이 산봉우리 우선 착색 및 문지르기 감각을 텍스처 결합 엔진으로 구현",
        "Built paper-ridge deposition and textured dry blending inspired by Rebelle Pastel and Procreate crayons",
      ),
      evidenceSummary: t(
        "종이 기질 레시피와 브러시 텍스처 결합 규칙으로 약한 필압엔 거칠게, 강한 필압엔 두껍게 쌓이는 파스텔 질감을 냅니다.",
        "Pairs paper substrate recipes with texture combine modes for light ridge catch and heavy opaque buildup.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/brush/studio-paper-substrate-recipe-v1.ts",
        "apps/web/src/domains/creator/brush/studio-brush-texture-combine-v1.ts",
      ],
      honestLimit: t(
        "파스텔 가루가 종이 결 사이로 물리적으로 번지는 초고밀도 입자 시뮬레이션은 Rebelle 7이 더 사실적입니다.",
        "Rebelle 7 provides deeper physical pastel dust accumulation on textured papers.",
      ),
      cells: {
        toonstudio: c("full", "종이 기질 레시피·텍스처 결합·건식 혼색", "Paper substrate recipes, texture combine & dry blend"),
        csp: c("full", "오일파스텔·크레용·밑색 혼색 우수", "Strong oil pastel, crayon & color mixing"),
        procreate: c("full", "파스텔·분필 텍스처 프리셋 풍부", "Rich pastel & chalk texture presets"),
        krita: c("full", "분필/파스텔 엔진·텍스처 매핑 지원", "Chalk/pastel engines with texture mapping"),
        rebelle: c("full", "건식 파스텔·종이 요철 반응 최상급", "Top-tier dry pastel & paper tooth interaction"),
        photoshop: c("partial", "텍스처 브러시로 구현(물성 모델 제한)", "Achievable via textured tips; limited dry physics"),
        magma: c("partial", "기본 텍스처 스탬프 수준", "Basic textured stamp brushes only"),
      },
    },
    {
      id: "charcoal-conte",
      subGroupId: "wet-paint",
      title: t("목탄 · 콘테 · 찰필 문지르기", "Charcoal, Conté & Paper-Aware Smudge"),
      metricTag: t("건식 커널 팁 · 질감 유지 블렌드", "Dry-media kernel tip · tooth smudge"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "전통 드로잉 목탄의 입자 거칠기와 찰필 문지르기를 건식 커널 팁 및 레이어 참조 블렌드로 내재화",
        "Modeled rough charcoal grain and blending-stump smudge via dry-media kernel tips and reference-layer blending",
      ),
      evidenceSummary: t(
        "건식 매체 전용 커널 팁과 이방성 그레인으로 목탄 입자감을 유지하며 문지르는 표현을 지원합니다.",
        "Preserves charcoal tooth while smudging using dedicated dry-media kernel tips and anisotropic grain.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/brush/studio-dry-media-kernel-tip.ts",
        "apps/web/src/domains/creator/brush/studio-blend-refer-layer.ts",
      ],
      honestLimit: t(
        "종이 질감에 따른 찰필 마찰음·실시간 분진 감쇠는 데스크톱 전용 매체 엔진 대비 간소화돼 있습니다.",
        "Dry dust falloff is more simplified than dedicated desktop real-media suites.",
      ),
      cells: {
        toonstudio: c("full", "건식 커널 팁·참조 레이어 문지르기", "Dry kernel tip & reference-layer smudge"),
        csp: c("full", "목탄·파스텔·손가락 문지르기 지원", "Charcoal, pastel & finger-tip blending"),
        procreate: c("full", "목탄 팩·스머지 툴 완성도 높음", "Polished charcoal set & smudge tool"),
        krita: c("full", "목탄 팁·Color Smudge 엔진 강력", "Strong charcoal tips & Color Smudge engine"),
        rebelle: c("full", "목탄·종이 결 반응 매우 사실적", "Highly realistic charcoal & paper grain response"),
        photoshop: c("full", "목탄 브러시·스머지 도구 지원", "Charcoal brushes & smudge tool"),
        magma: c("partial", "기본 스머지(목탄 전용 팁 제한)", "Basic smudge; limited charcoal tip options"),
      },
    },
    {
      id: "alcohol-marker",
      subGroupId: "marker-texture",
      title: t("알코올 마커 · 치즐 닙 · 겹칠 발색", "Alcohol Marker, Chisel Nib & Layering"),
      metricTag: t("각도 연동 닙 · 농도 누적", "Angle-linked chisel nib · glaze buildup"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "코픽(Copic) 마커와 CSP 마커의 사각 치즐 닙 회전·겹칠 농도 축적 방식을 전용 닙 프로파일로 구현",
        "Modeled Copic/CSP chisel-nib rotation and translucent glaze buildup in a dedicated marker nib profile",
      ),
      evidenceSummary: t(
        "닙 각도·종횡비·겹칠 농도를 제어하는 전용 마커 프로파일로 일러스트와 건축 스케치 채색을 지원합니다.",
        "Dedicated marker nib profile controls chisel angle, aspect ratio and overlapping ink density.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/studio-marker-nib-profile.ts",
        "apps/web/src/domains/creator/brush/studio-brush-material-dynamics.ts",
      ],
      honestLimit: t(
        "마커 알코올 용매가 종이 뒷면으로 배어나는 미세 블리딩 효과는 추가 고도화 대상입니다.",
        "Micro solvent bleed diffusion along paper fibers remains an area for further refinement.",
      ),
      cells: {
        toonstudio: c("full", "전용 치즐 닙 프로파일·겹칠 발색", "Dedicated chisel nib profile & glaze buildup"),
        csp: c("full", "밀리펜·플랫 마커·겹칠 모드 완성", "Flat/tapered markers with build-up mode"),
        procreate: c("full", "마커 프리셋·블렌딩 모드 조합", "Marker presets with glaze blend modes"),
        krita: c("full", "평붓/마커 프리셋·Build-up 모드", "Marker presets with build-up opacity mode"),
        rebelle: c("full", "전용 알코올 마커 엔진 내장", "Dedicated marker engine built in"),
        photoshop: c("partial", "각도 브러시+Build-up 수동 설정", "Manual flat tip + build-up configuration"),
        magma: c("partial", "기본 사각 브러시(치즐 물리 제한)", "Basic flat brush; limited marker physics"),
      },
    },
    {
      id: "airbrush-soft",
      subGroupId: "marker-texture",
      title: t("에어브러시 · 소프트 그라데이션", "Airbrush & Soft Falloff Shading"),
      metricTag: t("소프트 감쇠 스탬프 · 밴딩 완화", "Soft falloff stamp · smooth gradient"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "웹툰 피부/배경 채색에서 가장 자주 쓰는 부드러운 에어브러시의 밴딩 최소화 감쇠 커널을 정밀 설계",
        "Engineered smooth falloff kernels to minimize gradient banding on webtoon skin and atmospheric shading",
      ),
      evidenceSummary: t(
        "부드러운 방사형 감쇠 스탬프와 필압/유량 제어로 명암 경계가 뭉개지지 않는 에어브러시를 제공합니다.",
        "Soft radial falloff stamps with pressure/flow modulation keep airbrush transitions smooth.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/brush/studio-brush-soft-falloff-stamp.ts",
        "apps/web/src/domains/creator/brush/studio-brush-stroke-color-dynamics.ts",
      ],
      honestLimit: t(
        "전체 캔버스 16-bit 네이티브 출력 저장(PSD 16bpc)은 데스크톱 Photoshop/Krita가 더 폭넓게 지원합니다.",
        "End-to-end 16-bit PSD archival pipelines are more mature in desktop Photoshop and Krita.",
      ),
      cells: {
        toonstudio: c("full", "소프트 감쇠 스탬프·유량/밀도 제어", "Soft falloff stamp with flow/density dynamics"),
        csp: c("full", "부드러움·강함·비말 에어브러시 완비", "Soft, hard & droplet airbrush set"),
        procreate: c("full", "소프트·미디엄·하드 에어브러시", "Soft, medium & hard airbrush family"),
        krita: c("full", "에어브러시+16/32-bit 부동소수점", "Airbrush with 16/32-bit float precision"),
        rebelle: c("full", "에어브러시·스프레이 분사 지원", "Airbrush and splatter spray modes"),
        photoshop: c("full", "에어브러시 유량·16-bit 밴딩 억제", "Airbrush flow with 16-bit anti-banding"),
        magma: c("full", "기본 소프트 에어브러시 지원", "Standard soft airbrush built in"),
      },
    },
    {
      id: "dual-tip-brush",
      subGroupId: "marker-texture",
      title: t("듀얼 브러시 팁 합성 (1차+2차 팁)", "Dual-Tip Brush Composition"),
      metricTag: t("곱셈·감산 팁 마스킹", "Multiply / subtract tip masking"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Photoshop과 CSP의 듀얼 브러시(1차 모양 + 2차 질감/가장자리 팁) 합성 구조를 브라우저 스탬프 엔진에 내재화",
        "Modeled after Photoshop and CSP dual-tip composition inside the browser brush stamp engine",
      ),
      evidenceSummary: t(
        "듀얼 팁 전용 프로바이더와 UI 섹션으로 2개 브러시 팁의 크기·간격·블렌드 모드를 조합합니다.",
        "Dual-tip provider and inspector section combine two tips with independent scale, spacing and blend modes.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/brush/studio-brush-pack-dual-tip-exact-provider.ts",
        "apps/web/src/domains/creator/brush/StudioBrushDualTipSection.tsx",
        "apps/web/src/domains/creator/brush/studio-brush-tip-composition.ts",
      ],
      honestLimit: t(
        "복잡한 외부 `.sut` 듀얼 팁의 모든 세부 특수 파라미터 100% 무손실 변환은 여전히 CSP 네이티브만 보장합니다.",
        "100% exact fidelity for every proprietary `.sut` dual-tip parameter remains exclusive to native CSP.",
      ),
      cells: {
        toonstudio: c("full", "듀얼 팁 프로바이더·블렌드 조합 내장", "Built-in dual-tip provider & blend modes"),
        csp: c("full", "듀얼 브러시·보조 도구 연동 완비", "Full dual-brush & sub-tool integration"),
        procreate: c("full", "두 브러시 결합(Combine) 기능 지원", "Native dual-brush Combine mode"),
        krita: c("full", "마스킹 브러시(Masked Brush) 지원", "Masked Brush dual-tip engine"),
        rebelle: c("partial", "텍스처/형태 결합(듀얼 팁 스태킹 제한)", "Shape + grain combine; limited dual-tip stacking"),
        photoshop: c("full", "듀얼 브러시 원조·블렌드 모드 다양", "Original Dual Brush with rich blend modes"),
        magma: c("none", "듀얼 브러시 합성 미지원", "No dual-tip brush composition"),
      },
    },
    {
      id: "dry-brush-bristle",
      subGroupId: "marker-texture",
      title: t("갈필 · 붓모 갈라짐 · 거친 텍스처", "Dry-Brush Split & Bristle Physics"),
      metricTag: t("붓모 스트랜드 · 속도 고갈", "Bristle strands · velocity depletion"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "동양화 붓·거친 아크릴 갈필의 고속 스트로크 붓모 갈라짐을 붓모 물리 엔진으로 클린룸 구현",
        "Implemented clean-room bristle physics for high-velocity dry-brush splitting and rough ink strokes",
      ),
      evidenceSummary: t(
        "붓모 물리 모델과 재질 브러시 런타임이 속도·필압에 따라 물감이 끊기는 갈필 질감을 실시간 생성합니다.",
        "Bristle physics and material brush runtime generate realistic velocity/pressure-driven dry-brush splits.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/brush/studio-bristle-physics-oil-v1.ts",
        "apps/web/src/domains/creator/brush/studio-material-brush-runtime.ts",
      ],
      honestLimit: t(
        "수백 개 개별 3D 붓모 변형(Bristle 3D geometry)을 실시간 시뮬레이션하는 데스크톱 전용 엔진 대비 경량화 모델을 씁니다.",
        "Uses a streamlined browser bristle model rather than heavy 3D multi-hundred-filament desktop simulation.",
      ),
      cells: {
        toonstudio: c("full", "붓모 물리·갈필·질감 브러시 내장", "Built-in bristle physics & dry-brush runtime"),
        csp: c("full", "갈필·수묵·거친 붓 프리셋 다양", "Wide range of sumi & dry-brush presets"),
        procreate: c("full", "건식 붓·오일 브리슬 프리셋 우수", "Strong dry-brush & bristle presets"),
        krita: c("full", "Bristle 엔진·동양화 갈필 지원", "Dedicated Bristle engine & dry ink sets"),
        rebelle: c("full", "물감 고갈 기반 갈필 표현 최상급", "Top-tier paint-depletion dry-brush effect"),
        photoshop: c("full", "브리슬 팁·드라이 미디어 프리셋", "Bristle tips & dry media presets"),
        magma: c("partial", "정적 텍스처 팁으로만 근사", "Approximated via static textured tips"),
      },
    },
    {
      id: "pattern-deco-stamp",
      subGroupId: "marker-texture",
      title: t("패턴 · 데코 · 리본 스탬프 브러시", "Pattern, Deco & Ribbon Stamp Brushes"),
      metricTag: t("연속 리본 · 산포 스탬프", "Continuous ribbon · scatter stamps"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "웹툰 배경/의상 마감을 단축하는 CSP 데코 브러시(레이스·사슬·꽃잎·이펙트)를 스탬프·리본 런타임으로 구현",
        "Built ribbon & scatter stamp pipelines inspired by CSP webtoon deco brushes (lace, chains, petals, FX)",
      ),
      evidenceSummary: t(
        "스트로크 방향 추종 리본과 다중 소재 스탬프 조합으로 웹툰 의상 장식과 배경 소품을 빠르게 반복 배치합니다.",
        "Follow-path ribbons and multi-tip material stamps speed up costume lace, chains and background foliage.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/brush/studio-brush-stamp-engine.ts",
        "apps/web/src/domains/creator/brush/StudioBrushCompositionComposer.tsx",
      ],
      honestLimit: t(
        "유저가 업로드해 바로 다운받는 상용 웹툰 데코 브러시 수량(수만 종)은 CSP Assets가 압도적입니다.",
        "CSP Assets far surpasses every challenger in sheer volume of user-published commercial deco brushes.",
      ),
      cells: {
        toonstudio: c("full", "리본·산포·다중 스탬프 조합 엔진", "Ribbon, scatter & multi-stamp engine"),
        csp: c("full", "데코 리본 브러시·Assets 생태계 최강", "Unrivaled deco ribbon brushes & Assets store"),
        procreate: c("full", "산포/리본 스탬프 커스텀 제작 가능", "Custom scatter and ribbon stamps supported"),
        krita: c("full", "애니메이션 이미지 호스(`.gih`) 지원", "Animated image hose (`.gih`) stamp brushes"),
        rebelle: c("partial", "회화 중심(만화 데코 리본 기능 제한)", "Painting-focused; limited comic deco ribbons"),
        photoshop: c("full", "산포/패턴 스탬프 브러시 지원", "Scatter & pattern stamp brushes supported"),
        magma: c("partial", "단순 스탬프(리본 추종 제한)", "Simple stamps; limited ribbon following"),
      },
    },
    {
      id: "custom-brush-studio",
      subGroupId: "custom-compat",
      title: t("커스텀 브러시 스튜디오 & 노드/레시피 편집", "Custom Brush Studio & Node/Recipe Graph"),
      metricTag: t("노드 그래프 · 실시간 테스트 패드", "Node graph · live test pad"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "Procreate 브러시 스튜디오의 즉시 테스트 경험과 노드 기반 확장성을 결합해 `/studio/assets/brushes/new`로 통합",
        "Combines Procreate's live test-pad workflow with node-graph composability in the dedicated Brush Lab",
      ),
      evidenceSummary: t(
        "파라미터 편집, 컨트롤러 노드 그래프, 실시간 테스트 패드, SQLite 로컬 저장을 한 화면에서 제공합니다.",
        "Offers parameter tuning, controller node graph, live stroke pad and local SQLite persistence in one view.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/brush-lab/StudioBrushLabPage.tsx",
        "apps/web/src/domains/creator/brush-lab/studio-brush-controller-node-graph.ts",
        "apps/web/src/domains/creator/brush/StudioBrushLiveTestPad.tsx",
      ],
      honestLimit: t(
        "커뮤니티 공유 브러시 마켓의 실제 활성 판매자·리뷰 누적은 베타 단계로 초기 성장 중입니다.",
        "Community brush marketplace volume and reviews are still in early beta growth.",
      ),
      cells: {
        toonstudio: c("full", "노드 그래프·실시간 패드·로컬 DB 저장", "Node graph, live test pad & local DB save"),
        csp: c("full", "보조 도구 상세(세밀한 파라미터 최다)", "Deepest sub-tool detail parameters"),
        procreate: c("full", "브러시 스튜디오 UI·테스트 패드 최고", "Gold-standard Brush Studio UI & test pad"),
        krita: c("full", "16개 엔진별 브러시 에디터·스크래치 패드", "16-engine editor with scratchpad"),
        rebelle: c("full", "Brush Creator 물리 파라미터 편집", "Physics-driven Brush Creator"),
        photoshop: c("full", "브러시 설정 패널(실시간 패드 없음)", "Brush Settings panel (no dedicated pad)"),
        magma: c("partial", "기본 슬라이더 커스텀(노드/고급 제한)", "Basic slider customization only"),
      },
    },
    {
      id: "brush-format-rights",
      subGroupId: "custom-compat",
      title: t("외부 브러시 호환(`.abr`/CC0) & 상업 권리 격리", "External Brush Import (`.abr`/CC0) & Commercial Rights"),
      metricTag: t("`.abr` 파서 · MyPaint CC0 · 권리 추적", "`.abr` parser · MyPaint CC0 · rights tracking"),
      toonstudioMaturity: "current",
      benchmarkOrigin: t(
        "기존 포토샵 `.abr` 자산 재활용과 MyPaint CC0 공개 브러시 내장 + 상업 연재용 라이선스 출처 추적 결합",
        "Combines `.abr` asset reuse and bundled MyPaint CC0 brushes with commercial license provenance tracking",
      ),
      evidenceSummary: t(
        "`.abr` 브라우저 로컬 파싱, MyPaint CC0 카탈로그 내장, 브러시별 원본 출처·상업 권리 메타데이터를 추적합니다.",
        "Parses `.abr` locally in-browser, ships a MyPaint CC0 library and tracks per-brush license provenance.",
      ),
      evidencePaths: [
        "apps/web/src/domains/creator/brush/studio-brush-pack-abr-helpers.ts",
        "apps/web/src/domains/creator/brush/mypaint-library/studio-mypaint-cc0-library-catalog.ts",
        "apps/web/src/domains/creator/brush/studio-brush-original-source.ts",
      ],
      honestLimit: t(
        "CSP 전용 `.sut` 바이너리 내부의 복잡한 자체 텍스처·동역학까지 완벽 호환하지는 못하며 `.abr` 중심으로 지원합니다.",
        "Focuses on `.abr` and CC0 packs; proprietary `.sut` binary dynamics do not convert 1:1.",
      ),
      cells: {
        toonstudio: c("full", "`.abr` 파싱·MyPaint CC0·라이선스 추적", "`.abr` import, MyPaint CC0 & rights provenance"),
        csp: c("full", "`.sut` 네이티브 + `.abr` 가져오기", "Native `.sut` + `.abr` import"),
        procreate: c("full", "`.brushset` 네이티브 + `.abr` 가져오기", "Native `.brushset` + `.abr` import"),
        krita: c("full", "`.kpp`/`.gbr`/`.abr`/MyPaint 호환", "Supports `.kpp`, `.gbr`, `.abr` & MyPaint"),
        rebelle: c("partial", "자체 포맷 중심(`.abr` 제한적 변환)", "Proprietary presets; limited `.abr` import"),
        photoshop: c("full", "`.abr` 원본 표준(권리 감사 내장 없음)", "Original `.abr` standard; no rights audit"),
        magma: c("partial", "자체 브러시 공유(`.abr` 직접 제한)", "Native brush sharing; limited `.abr`"),
      },
    },
  ],
  honestTradeoffs: [
    {
      competitorId: "csp",
      competitorName: "Clip Studio Paint",
      area: t("웹툰 브러시 생태계 & `.sut` 자산", "Webtoon brush ecosystem & `.sut` assets"),
      competitorEdge: t(
        "10년 넘게 쌓인 Assets 스토어와 600dpi 대형 출판 원고에서의 네이티브 선화 성능이 매우 강력합니다.",
        "10+ years of Clip Studio Assets and native 600dpi print ink responsiveness are tough to beat.",
      ),
      toonstudioPosition: t(
        "설치 없이 브라우저에서 G펜·벡터 선화·유체 수채화·분광 혼색을 무료로 바로 쓰고 PSD로 왕복할 수 있게 설계했습니다.",
        "Lets artists jump into G-pen, vector ink, fluid watercolor and spectral mixing at KRW 0 with PSD round-trip.",
      ),
    },
    {
      competitorId: "rebelle",
      competitorName: "Rebelle 7",
      area: t("실물급 유화 임파스토 & 중력 수채화", "Real-world oil impasto & gravity watercolor"),
      competitorEdge: t(
        "데스크톱 네이티브 CPU/GPU 자원을 전부 쓰는 3D 임파스토, 캔버스 기울이기 물방울, 메탈릭 안료 표현이 독보적입니다.",
        "Unmatched native desktop 3D impasto thickness, canvas-tilt dripping and metallic pigment simulation.",
      ),
      toonstudioPosition: t(
        "웹 브라우저 제약 안에서 Shallow-Water 수채화와 7밴드 KM 분광 혼색을 상업 안전 클린룸으로 내재화해 웹툰 채색과 한곳에서 연결했습니다.",
        "Brings commercially safe 7-band KM spectral and Shallow-Water watercolor directly into a webtoon browser workspace.",
      ),
    },
    {
      competitorId: "procreate",
      competitorName: "Procreate",
      area: t("iPad Apple Pencil 초저지연 필기감", "iPad Apple Pencil low-latency feel"),
      competitorEdge: t(
        "iPadOS Metal 파이프라인과 제스처 완성도, 6B 연필 틸트 감각에서 모바일/태블릿 최고 경험을 제공합니다.",
        "Delivers the tightest Apple Pencil tilt latency and gesture ergonomics on iPadOS Metal.",
      ),
      toonstudioPosition: t(
        "특정 OS(iPadOS)에 묶이지 않고 Windows·macOS·태블릿 브라우저 어디서나 같은 작품과 브러시를 이어 작업합니다.",
        "Removes iPadOS lock-in so the same project and brush kit run across Windows, macOS and tablet browsers.",
      ),
    },
    {
      competitorId: "krita",
      competitorName: "Krita",
      area: t("16개 네이티브 C++ 브러시 엔진 & 32-bit HDR", "16 native C++ brush engines & 32-bit HDR"),
      competitorEdge: t(
        "성숙한 데스크톱 오픈소스 C++ 엔진과 32-bit float HDR 색 공간 페인팅에서 깊은 신뢰도를 갖습니다.",
        "Mature native C++ multi-engine painting with full 32-bit float HDR color space support.",
      ),
      toonstudioPosition: t(
        "MyPaint CC0 호환과 오픈소스 철학을 존중하면서 설치 없는 웹 진입·실시간 협업·3D 배경 직결로 웹툰 제작을 통합합니다.",
        "Embraces MyPaint CC0 compatibility while adding zero-install web access, live collab and 3D stage integration.",
      ),
    },
  ],
};
