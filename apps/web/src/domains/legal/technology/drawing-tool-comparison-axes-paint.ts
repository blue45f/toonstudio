import type {
  BilingualText,
  DrawingComparisonCategory,
  DrawingSupportStatus,
  DrawingToolCell,
} from "./drawing-tool-comparison-profiles";

const t = (ko: string, en: string): BilingualText => ({ ko, en });

const cell = (
  status: DrawingSupportStatus,
  koLabel: string,
  enLabel: string,
  koDetail: string,
  enDetail: string,
): DrawingToolCell => ({
  status,
  label: t(koLabel, enLabel),
  detail: t(koDetail, enDetail),
});

export const DRAWING_CATEGORIES_PAINT: readonly DrawingComparisonCategory[] = [
  {
    id: "brush-pigment",
    number: 1,
    shortLabel: t("① 브러시·안료 물리", "1. Brush & Pigment"),
    title: t("브러시 엔진 & 안료 물리", "Brush Engine & Pigment Physics"),
    summary: t(
      "Kubelka-Munk 분광 혼색, 유체 수채화·과립화·백런, 임파스토 양각, 듀얼 브러시·붓모 물리, 저지연 스타일러스 입력 비교",
      "Comparing Kubelka-Munk spectral mixing, fluid watercolor/granulation/backrun, impasto relief, dual brushes/bristle physics and stylus smoothing",
    ),
    criteria: [
      {
        id: "km7-spectral-mixing",
        categoryId: "brush-pigment",
        title: t("7밴드 Kubelka-Munk 분광 혼색 (파랑+노랑→초록)", "7-Band Kubelka-Munk Spectral Mixing (Blue + Yellow → Green)"),
        summary: t(
          "RGB 선형 혼색의 탁한 회색 없이 감산 안료 반사 스펙트럼으로 자연스러운 초록·보라 혼색 재현",
          "Subtractive pigment reflectance mixing avoiding muddy gray RGB midtones",
        ),
        cells: {
          toonstudio: cell("supported", "클린룸 7밴드 KM", "Clean-room 7-band KM", "420–670nm WebGPU Compute + CPU 동등 · 상업 안전", "420–670nm WebGPU Compute + CPU parity, commercial-safe"),
          csp: cell("supported", "지각적 색혼합", "Perceptual mixing", "v2.0+ 감산형 지각 혼색 내장(7밴드 분광 필터는 별도)", "Built-in perceptual mixing since v2.0"),
          krita: cell("partial", "RGBA·색공간 혼색", "RGBA & color spaces", "Lab/선형/CMYK 혼색 강하나 전용 분광 KM 엔진은 플러그인", "Strong Lab/linear/CMYK mixing; spectral KM needs plugin"),
          magma: cell("unsupported", "RGB 블렌딩", "RGB blending", "표준 디지털 RGB 혼합 중심", "Standard digital RGB blending"),
          procreate: cell("unsupported", "sRGB/P3 블렌딩", "sRGB/P3 blending", "일반 디지털 혼색, 물리 분광 엔진 미내장", "Standard sRGB/P3 blending without spectral KM"),
          rebelle7: cell("supported", "Pigments 분광 최상", "Top Pigments engine", "Pro 에디션 실시간 안료 분광 혼색 업계 기준", "Pro edition real-time pigment mixing benchmark"),
          photoshop: cell("plugin", "믹서 브러시(RGB)", "Mixer Brush (RGB)", "기본 RGB 믹서, 분광 감산 안료는 플러그인 의존", "RGB Mixer Brush; spectral mixing requires plugin"),
          "ibis-medibang": cell("unsupported", "RGB 블렌딩", "RGB blending", "모바일 경량 sRGB 혼색 위주", "Lightweight mobile sRGB blending"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "비상업(CC BY-NC) mixbox를 완전히 제거하고 420–670nm 7밴드 Kubelka-Munk 흡수·산란 모델을 클린룸으로 구현했습니다.",
            "Replaced non-commercial mixbox with a clean-room 420–670nm 7-band Kubelka-Munk absorption/scattering core.",
          ),
          implementationDiff: t(
            "Rebelle 7 Pro와 CSP v2+는 네이티브 C++ 엔진에 감산 혼색을 탑재한 반면, ToonStudio는 WGSL Compute 셰이더와 동일 수식의 CPU 폴백을 함께 두어 브라우저에서 상업 안전하게 실행합니다.",
            "Rebelle 7 Pro and CSP v2+ run native C++ subtractive mixing; ToonStudio pairs WGSL compute shaders with an identical CPU fallback for commercial-safe browser execution.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
            "apps/web/src/domains/creator/render/studio-webgpu-km7-compute-wgsl.ts",
            "apps/web/src/domains/creator/brush-lab/brush-studio-v6-recipe-catalog-km7-spectral.ts",
          ],
        },
      },
      {
        id: "fluid-watercolor-granulation",
        categoryId: "brush-pigment",
        title: t("2D 유체 수채화 · 종이 과립화 · 백런(Backrun)", "2D Fluid Watercolor, Paper Granulation & Backrun"),
        summary: t(
          "물막 확산, 모세관 침투, 종이 골짜기 안료 침착(과립화), 건조 경계 컬리플라워(백런) 시뮬레이션",
          "Shallow-water diffusion, capillary seepage, paper-valley pigment granulation and wet-edge backrun blooms",
        ),
        cells: {
          toonstudio: cell("supported", "2D Shallow-Water", "2D Shallow-Water", "WGSL+CPU 동등 유체·중력 흘림·과립화·백런(로컬)", "WGSL + CPU-parity fluid, gravity tilt, granulation & backrun"),
          csp: cell("partial", "수채 경계 효과", "Watercolor edge", "스트로크 경계 농도·종이 텍스처 지원(실시간 유체 아님)", "Stroke edge darkening & paper grain, not real-time fluid"),
          krita: cell("partial", "RGBA 습식 팁", "RGBA wet tips", "수채 느낌 브러시·텍스처 풍부, 실시간 유체 격자는 미내장", "Rich watercolor brushes, no real-time shallow-water grid"),
          magma: cell("unsupported", "정적 팁 혼합", "Static wet-look", "실시간 유체·과립화 물리 시뮬레이션 없음", "No real-time fluid or granulation physics"),
          procreate: cell("partial", "습식 엣지 표현", "Wet-edge look", "브러시 텍스처·블렌딩으로 모사, 물리 유체 흐름은 미지원", "Texture-simulated wet edges, no physical fluid flow"),
          rebelle7: cell("supported", "유체·종이 물리 1위", "Fluid physics leader", "중력 기울기·모세관·건조·과립화 실시간 물리 최상위", "Best-in-class gravity fluid, capillary & drying physics"),
          photoshop: cell("partial", "라이브 팁·텍스처", "Live tips & grain", "실시간 수채 유체 격자는 없음(Fresco 별도 앱 분리)", "No fluid grid in Photoshop (split into Adobe Fresco)"),
          "ibis-medibang": cell("partial", "수채 경계 필터", "Edge border effect", "간이 수채 경계선 효과만 제공", "Simplified wet-border stroke effect only"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "Cold-press·Hot-press·Rough 용지 높이맵 기반 2D Shallow-Water 속도장·안료 이송·과립화·백런을 클린룸 수학 모델로 구현했습니다.",
            "Clean-room 2D Shallow-Water velocity/transport, paper heightmap granulation and backrun blooms implemented with CPU/WGSL parity.",
          ),
          implementationDiff: t(
            "Rebelle 7은 데스크톱 GPU 풀 해상도 실시간 유체와 종이 섬유 모델에서 여전히 가장 깊고, ToonStudio는 브라우저 탭 예산 안에서 중력·블로우·과립화·백런을 무설치로 제공합니다.",
            "Rebelle 7 leads on full-resolution desktop GPU fluid depth; ToonStudio brings gravity, blow, granulation and backrun inside browser memory budgets with zero install.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/imaging-pro/studio-fluid-watercolor-sim.ts",
            "apps/web/src/domains/creator/imaging-pro/studio-fluid-watercolor-wgsl.ts",
            "apps/web/src/domains/creator/render/studio-wet-gravity-blow-controller.ts",
          ],
        },
      },
      {
        id: "impasto-thickness-metallic",
        categoryId: "brush-pigment",
        title: t("임파스토 두께 · 입체 광원 · 금속성 높이맵", "Impasto Thickness, Relief Shading & Metallic Heightmap"),
        summary: t(
          "물감 높이 채널 축적, 방향광 하이라이트/그림자 양각, 금박·메탈릭 반사 표현",
          "Paint height-channel accumulation, directional relief lighting and metallic foil specular shading",
        ),
        cells: {
          toonstudio: cell("supported", "높이맵 양각·메탈릭", "Height relief & metallic", "임파스토 높이 버퍼·광원 음영·금속성 높이맵 셰이딩", "Impasto height provider, relief shading & metallic heightmap"),
          csp: cell("partial", "후처리·두터운 채색", "Thick paint mix", "유화 혼색은 우수하나 실시간 높이맵 광원 양각은 제한", "Strong oil mixing, limited live height-map lighting"),
          krita: cell("partial", "Heightmap 필터/브러시", "Heightmap modes", "일부 브러시·범프맵 조합 가능, 전용 임파스토 광원은 제한", "Possible via bump/filters, lacks dedicated live impasto lighting"),
          magma: cell("unsupported", "평면 래스터", "Flat raster", "물감 두께 높이 채널 미지원", "No paint height channel"),
          procreate: cell("partial", "3D 텍스처 전용", "3D paint only", "2D 캔버스 실시간 임파스토 높이 채널은 미지원", "Metallic/roughness maps limited to 3D painting"),
          rebelle7: cell("supported", "임파스토·금박 최상", "Impasto & foil leader", "실시간 물감 두께·방향광 음영·메탈릭 리프 최상위", "Top-tier live impasto depth, lighting & metallic leaf"),
          photoshop: cell("partial", "베벨·엠보스 FX", "Bevel & Emboss FX", "레이어 스타일로 모사, 스트로크별 누적 높이맵은 아님", "Simulated via layer FX rather than per-stroke paint height"),
          "ibis-medibang": cell("unsupported", "평면 래스터", "Flat raster", "실시간 임파스토 높이 채널 없음", "No live impasto height channel"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "스트로크 높이 버퍼, 방향광 엠보스 양각 셰이더, 높이맵 기반 메탈릭 반사 커널을 분리해 웹 캔버스에 통합했습니다.",
            "Dedicated impasto height provider, directional relief shading and heightmap metallic specular kernels run locally in the browser.",
          ),
          implementationDiff: t(
            "Rebelle 7의 다중 물감층·캔버스 기울기 광원보다는 가볍지만, 웹 브라우저 캔버스에서 스트로크 리지(ridge) 양각과 메탈릭 광택을 실시간으로 계산합니다.",
            "Lighter than Rebelle 7's full multi-layer oil stack, while computing per-stroke ridge relief and metallic highlights directly in browser canvas sessions.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/studio-impasto-height-provider.ts",
            "apps/web/src/domains/creator/studio-impasto-relief-shading-v1.ts",
            "apps/web/src/domains/creator/brush/wet-paper/studio-rebelle-heightmap-metallic.ts",
          ],
        },
      },
      {
        id: "dual-brush-bristle-physics",
        categoryId: "brush-pigment",
        title: t("듀얼 브러시 팁 합성 & 다중 붓모(Bristle) 물리", "Dual Brush Tip Compositing & Multi-Bristle Physics"),
        summary: t(
          "주·보조 두 개 브러시 팁의 곱하기/차집합 합성과 개별 붓모 갈라짐·물감 소진 시뮬레이션",
          "Primary/secondary tip blending modes plus individual bristle splay and paint-load depletion",
        ),
        cells: {
          toonstudio: cell("supported", "듀얼 팁 + GPU 붓모", "Dual tip + GPU bristle", "듀얼 브러시 합성 + 섬유 붓모 워커/WGSL 물감 소진", "Dual-tip compositing plus worker/WGSL bristle load dynamics"),
          csp: cell("supported", "듀얼 브러시 성숙", "Mature Dual Brush", "v1.10+ 듀얼 브러시 팁 합성 지원(물리 붓모는 스탬프형)", "Mature dual brush tips; bristle look via stamp tips"),
          krita: cell("supported", "Masked + Bristle 엔진", "Masked & Bristle", "Masked Brush(듀얼)와 Bristle 전용 브러시 엔진 내장", "Built-in Masked Brush and dedicated Bristle engine"),
          magma: cell("partial", "단일 팁 중심", "Single-tip focus", "기본 텍스처 브러시 중심, 물리 붓모 엔진 미내장", "Single-tip texture brushes; no physical bristle sim"),
          procreate: cell("supported", "Dual Brush 지원", "Dual Brush", "두 브러시 결합(Combine) 직관적 지원(붓모는 스탬프형)", "Intuitive Dual Brush combine; stamp-based bristles"),
          rebelle7: cell("supported", "실시간 붓모 물리", "Live bristle physics", "붓모 갈라짐·물감 적재·오염 시뮬레이션 매우 정교", "Highly realistic bristle splay and pigment loading"),
          photoshop: cell("supported", "듀얼 + 3D 붓모 팁", "Dual + Bristle Tips", "Dual Brush와 3D Bristle Tip 미리보기·탄성 제어 제공", "Classic Dual Brush plus 3D Bristle Tip dynamics"),
          "ibis-medibang": cell("partial", "다중 스탬프 팁", "Multi-stamp tips", "복합 팁 프리셋은 많으나 물리 붓모·임의 듀얼 합성 제한", "Many preset tips, limited arbitrary dual/bristle physics"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "듀얼 팁 마스크 합성 엔진과 별도 워커·WGSL 기반 섬유 붓모 탄성·물감 적재량 감소 모델을 함께 구현했습니다.",
            "Combines dual-tip compositing with worker and WGSL fiber-bristle splay and paint-load depletion models.",
          ),
          implementationDiff: t(
            "CSP·Procreate는 스탬프 조합 기반 듀얼 브러시에 강하고, Krita·Photoshop·Rebelle 7은 네이티브 붓모 엔진을 갖춥니다. ToonStudio는 두 방식을 모두 웹 워커와 WGSL 경로로 제공합니다.",
            "CSP/Procreate excel at stamp-based dual brushes while Krita/Photoshop/Rebelle 7 include native bristle models; ToonStudio provides both via Web Worker and WGSL lanes.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/drawing-pro/studio-dual-brush-tip-composite.ts",
            "apps/web/src/domains/creator/brush/studio-bristle-physics-oil-v1.ts",
            "apps/web/src/domains/creator/render/studio-gpu-bristle-wgsl.ts",
          ],
        },
      },
      {
        id: "stylus-tilt-predictive-smoothing",
        categoryId: "brush-pigment",
        title: t("스타일러스 기울기 · 방위각 · 예측 스무딩", "Stylus Tilt, Azimuth & Predictive Smoothing"),
        summary: t(
          "필압·기울기·방위각 매핑, 서브픽셀 예측 입력과 손떨림 보정(Pull-string/가중 평균)",
          "Pressure/tilt/azimuth mapping, subpixel motion prediction and weighted/pulled-string stabilization",
        ),
        cells: {
          toonstudio: cell("supported", "예측 + 스태빌라이저", "Prediction + stabilizer", "PointerEvents 기울기·방위각 + 서브픽셀 예측 + 스태빌라이저", "PointerEvents tilt/azimuth, subpixel prediction & stabilizer"),
          csp: cell("supported", "네이티브 타블렛 최강", "Native tablet leader", "Wintab/Windows Ink 직접 연동·정밀 보정 및 필압 커브", "Direct Wintab/Windows Ink hooks & fine stabilization"),
          krita: cell("supported", "가중치·스태빌라이저", "Weighted & stabilizer", "기본/가중치/딜레이 스태빌라이저 및 기울기·회전 완전 지원", "Basic/weighted/stabilizer smoothing plus full tilt/rotation"),
          magma: cell("supported", "웹 필압·스무딩", "Web pressure & smooth", "브라우저 PointerEvents 필압·보정 지원", "Browser PointerEvents pressure & stroke smoothing"),
          procreate: cell("supported", "120Hz Pencil 최적화", "120Hz Pencil native", "StreamLine·모션 필터링·배럴 롤·호버 초저지연", "StreamLine, motion filtering, barrel roll & hover at 120Hz"),
          rebelle7: cell("supported", "기울기·방위각 정밀", "Precise tilt/azimuth", "Wacom Art Pen 회전·기울기·캔버스 기울기 연동", "Wacom Art Pen rotation, tilt & canvas tilt support"),
          photoshop: cell("supported", "스무딩·Pulled String", "Pulled-string smooth", "Pulled String·Catch-up 보정 및 스타일러스 기울기 완전 지원", "Pulled-string smoothing & full stylus tilt/rotation"),
          "ibis-medibang": cell("supported", "강력한 손떨림 보정", "Strong mobile smooth", "손가락·스타일러스 실시간/사후 보정 및 강제 페이드 우수", "Strong real-time/post smoothing & forced fade for touch"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "브라우저 PointerEvents의 coalesced/predicted 입력과 독립 스태빌라이저·기울기 매핑 UI를 결합해 웹 입력 지연을 줄였습니다.",
            "Combines coalesced/predicted PointerEvents with a dedicated stabilizer package and stylus tilt/azimuth curve controls.",
          ),
          implementationDiff: t(
            "네이티브 OS 드라이버(Wintab/Metal)에 직접 닿는 CSP·Procreate보다 브라우저 입력 파이프라인 1프레임 제약이 있으나, 예측 서브픽셀 보간과 스태빌라이저로 격차를 줄입니다.",
            "Browser PointerEvents incur OS-compositor latency versus CSP Wintab or Procreate Metal; ToonStudio narrows the gap with predictive subpixel curves and stabilization.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/render/gpu-next/gpu-stylus-predict-and-screentone.ts",
            "apps/web/src/domains/creator/brush/StudioStylusTiltAndMouseSection.tsx",
            "packages/studio-brush-platform/src/stabilizer.ts",
          ],
        },
      },
      {
        id: "natural-media-dry-ink",
        categoryId: "brush-pigment",
        title: t("건식 매체(연필·목탄) 종이 결 & WASM 엔진 격리", "Dry Media (Pencil/Charcoal) Paper Tooth & WASM Isolation"),
        summary: t(
          "필압에 따른 종이 요철 침투(R8 그레인), 전용 워커 격리로 메인 스레드 UI 프리징 방지",
          "Pressure-coupled paper-tooth grain penetration and dedicated worker isolation to prevent UI jank",
        ),
        cells: {
          toonstudio: cell("supported", "Hokusai WASM + R8 그레인", "Hokusai WASM + R8 grain", "Dedicated Worker 자연매체 + 필압-종이결 R8 네이티브", "Dedicated Worker natural media + native R8 pressure tooth"),
          csp: cell("supported", "연필·종이 텍스처", "Pencil & paper grain", "밀도 기반 텍스처 합성·부드러운 연필 필기감 성숙", "Mature density-mapped paper texture & pencil feel"),
          krita: cell("supported", "Texture + MyPaint 엔진", "Texture + MyPaint", "libmypaint 내장 및 다양한 건식 텍스처 브러시", "Built-in libmypaint and rich dry-media texture brushes"),
          magma: cell("partial", "기본 텍스처 연필", "Basic grain pencils", "간단한 그레인 텍스처 지원, 물리 종이 요철 모델은 제한", "Basic texture pencils without physical tooth modeling"),
          procreate: cell("supported", "6B 연필·기울기 셰이딩", "6B pencil & tilt", "기울기 기반 목탄·연필 셰이딩 품질이 매우 높음", "Excellent tilt-driven graphite and charcoal shading"),
          rebelle7: cell("supported", "건식 파스텔·연필 정밀", "Fine pastel & pencil", "초고해상도 종이 스캔 요철과 건식 마찰 물리 탁월", "Ultra-high-res scanned paper tooth & dry friction"),
          photoshop: cell("supported", "텍스처·Kyle 브러시", "Texture & Kyle packs", "Kyle T. Webster 연필·목탄 팩 포함 풍부한 질감", "Rich graphite/charcoal packs via Kyle T. Webster sets"),
          "ibis-medibang": cell("partial", "스탬프 텍스처 연필", "Stamp grain pencils", "연필 브러시 다양하나 필압-요철 물리 모델은 단순", "Many pencil presets with simpler grain math"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "Hokusai Rust WASM·libmypaint WASM 자연매체 권위와 R8 그레인 필압-요철 셰이더를 워커 경계로 격리했습니다.",
            "Isolates Hokusai Rust WASM and libmypaint WASM engines alongside an R8 native paper-tooth shader in dedicated workers.",
          ),
          implementationDiff: t(
            "Krita는 C++ 스레드 풀로 libmypaint를 실행하고, ToonStudio는 동일한 libmypaint·Hokusai 자연매체 연산을 브라우저 Web Worker/WASM으로 실행해 UI 스레드 멈춤을 막습니다.",
            "Krita executes libmypaint on native C++ threads; ToonStudio runs libmypaint and Hokusai inside browser WASM workers to keep canvas chrome responsive.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/render/studio-webgpu-pressure-tooth.ts",
            "apps/web/src/domains/creator/render/studio-webgpu-r8-grain-native.ts",
            "docs/engines/renderer-roles.md",
          ],
        },
      },
    ],
  },
  {
    id: "custom-brush-formats",
    number: 2,
    shortLabel: t("② 커스텀·포맷 호환", "2. Custom & Formats"),
    title: t("커스텀 브러시 제작 & 포맷 호환", "Custom Brush Authoring & Format Compatibility"),
    summary: t(
      "노드·레시피 커스텀 브러시 제작기, .abr/.sut/.kpp/.brushset 파서, 공유 코드·마켓, 상업용 라이선스 안전성 비교",
      "Comparing parameter/recipe brush studios, .abr/.sut/.kpp/.brushset import, share codes, asset markets and commercial license safety",
    ),
    criteria: [
      {
        id: "custom-brush-studio-nodes",
        categoryId: "custom-brush-formats",
        title: t("파라미터 · 노드/레시피 커스텀 브러시 스튜디오", "Parameter & Node/Recipe Custom Brush Studio"),
        summary: t(
          "브러시 팁·간격·지터·혼색·입력 커브를 조합해 새 브러시를 제작하고 실시간 테스트 패드로 검증",
          "Authoring custom brushes via tip, spacing, jitter, pigment and curve graphs with a live stroke test pad",
        ),
        cells: {
          toonstudio: cell("supported", "Brush Studio v6", "Brush Studio v6", "레시피·컴포지션 노드 그래프 + 실시간 테스트 패드 + 품질 분석", "Recipe & composition node graph, live stroke pad & quality analyzer"),
          csp: cell("supported", "보조 도구 상세 80+ 항목", "Sub Tool Detail 80+", "만화·일러스트 세부 파라미터 최상급 제어(노드형은 아님)", "80+ granular sub-tool controls (parameter list, not node graph)"),
          krita: cell("supported", "10+ 엔진 커브 편집기", "10+ engine editors", "엔진별 센서 커브·텍스처 조합 깊이 최상", "Deep per-engine sensor curves across 10+ brush engines"),
          magma: cell("partial", "기본 슬라이더 튜닝", "Core slider tuning", "크기·흐름·산포·텍스처 중심의 간결한 커스텀", "Streamlined size, flow, scatter and texture sliders"),
          procreate: cell("supported", "Brush Studio 직관성", "Intuitive Brush Studio", "11개 카테고리 실시간 테스트 패드로 모바일 최상급 UX", "11-section Brush Studio with instant touch test pad"),
          rebelle7: cell("supported", "Brush Creator 정교", "Deep Brush Creator", "물·기름·종이·붓모 물리 파라미터를 실시간 조합", "Deep physical water, oil, grain and bristle tuning"),
          photoshop: cell("supported", "브러시 설정 패널", "Brush Settings panel", "모양·산포·듀얼·전송·노이즈 등 업계 표준 설정", "Industry-standard Shape, Scattering, Dual & Transfer panels"),
          "ibis-medibang": cell("supported", "세부 커스텀 지원", "Detailed mobile editor", "ibisPaint는 수십 개 커스텀 파라미터 제공(MediBang은 간결)", "ibisPaint exposes dozens of parameters; MediBang is simpler"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "Brush Studio v6 워크벤치, 노드 컴포지션 런타임, 실시간 스트로크 패드와 결정적 프리뷰 컴파일러를 독립 패키지와 함께 운영합니다.",
            "Operates Brush Studio v6 workbench, composition node runtime and live test pad backed by deterministic preview compilation.",
          ),
          implementationDiff: t(
            "CSP·Procreate가 슬라이더·커브 중심인 반면, ToonStudio는 파라미터 패널과 선언적 컴포지션 노드/레시피 JSON을 함께 제공해 버전 관리와 재현 테스트가 가능합니다.",
            "While CSP and Procreate focus on slider panels, ToonStudio adds declarative composition recipes and JSON graphs enabling reproducible testing.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/brush-lab/StudioBrushV6Workbench.tsx",
            "apps/web/src/domains/creator/brush-lab/brush-studio-v6-engine.ts",
            "apps/web/src/domains/creator/brush/studio-brush-composition-runtime.ts",
          ],
        },
      },
      {
        id: "external-format-abr-sut-kpp",
        categoryId: "custom-brush-formats",
        title: t(".abr · .sut · .kpp · .brushset 외부 브러시 호환", ".abr, .sut, .kpp & .brushset External Brush Compatibility"),
        summary: t(
          "타사 앱에서 쓰던 브러시 파일을 가져와 팁·동역학·미매핑 경고와 함께 재사용하는 이식성",
          "Importing external brush archives with tip/dynamics mapping and explicit unmapped-parameter warnings",
        ),
        cells: {
          toonstudio: cell("partial", "4대 포맷 파서 내장", "4-format parsers", ".abr · .sut(SQLite) · .kpp · .brushset 파서(일부 고급 옵션 경고)", "Parses .abr, .sut (SQLite), .kpp & .brushset with unmapped warnings"),
          csp: cell("supported", ".sut 정본 + .abr", "Native .sut + .abr", ".sut 네이티브 완벽 지원 + Photoshop .abr 가져오기", "Native .sut authority plus Photoshop .abr import"),
          krita: cell("supported", ".kpp · .abr · .gbr · .myb", ".kpp/.abr/.gbr/.myb", "오픈 포맷(.kpp/.myb/.gbr)과 .abr 팁 가져오기 우수", "Native .kpp/.myb/.gbr plus strong .abr tip import"),
          magma: cell("partial", ".abr 일부 가져오기", "Partial .abr import", "유료 플랜 중심 커스텀 팁 업로드(.sut/.kpp 미지원)", "Custom tip upload & partial .abr (no .sut/.kpp)"),
          procreate: cell("supported", ".brushset + .abr", ".brushset + .abr", "자체 .brushset과 Photoshop .abr 가져오기 지원", "Native .brushset plus Photoshop .abr import"),
          rebelle7: cell("partial", "자체 포맷 + 이미지 팁", "Native + image tips", "PNG 팁/그레인 가져오기 중심(.sut/.kpp 직접 파싱 없음)", "Custom PNG tip/grain import; no .sut/.kpp parser"),
          photoshop: cell("supported", ".abr 업계 표준", ".abr industry standard", ".abr/.tpl 정본(.sut/.kpp/.brushset은 미지원)", "Canonical .abr/.tpl owner (does not read .sut/.kpp/.brushset)"),
          "ibis-medibang": cell("partial", "자체 QR/브러시 포맷", "Proprietary formats", "자체 QR 코드·클라우드 공유 중심(.abr/.sut 직접 호환 약함)", "QR/cloud presets; limited .abr/.sut compatibility"),
        },
        evidence: {
          maturity: "partial",
          rationale: t(
            "브라우저 워커에서 `.abr` 바이너리, `.sut` SQLite(`sqlite3_deserialize`), `.kpp`(PaintOp/MyPaint), `.brushset`(bplist) 파서를 직접 구동하고 미매핑 항목을 투명하게 알립니다.",
            "Decodes .abr binaries, .sut SQLite DBs via sqlite3_deserialize, .kpp and .brushset plists locally in browser workers with explicit unmapped-feature diagnostics.",
          ),
          implementationDiff: t(
            "각 경쟁 툴은 자사 포맷과 `.abr` 중심이지만, ToonStudio는 4종 포맷을 모두 읽기 전용 게이트웨이로 해석합니다. 단 CSP/Krita 고유 셰이더 전체를 100% 복제할 수는 없어 미매핑 경고를 명시합니다.",
            "Competitors focus on native formats plus .abr; ToonStudio reads all four formats in a sandboxed gateway while honestly surfacing unmapped engine-specific fields.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/studio-abr-import.ts",
            "apps/web/src/domains/creator/studio-csp-sut-sqlite-reader-runtime.ts",
            "packages/studio-format-gateway/src/kpp.ts",
            "packages/studio-format-gateway/src/procreate-brushset.ts",
          ],
        },
      },
      {
        id: "brush-share-code-market",
        categoryId: "custom-brush-formats",
        title: t("브러시 공유 코드 · 마켓플레이스 배포 & 생태계", "Brush Share Codes, Marketplace & Ecosystem Scale"),
        summary: t(
          "짧은 코드·링크로 브러시 설정을 즉시 나누고 창작자 마켓에서 탐색·배포하는 생태계 성숙도",
          "Sharing presets via compact codes/links and discovering community brushes in an asset marketplace",
        ),
        cells: {
          toonstudio: cell("partial", "공유 코드 + 자체 마켓", "Share code + market", "텍스트 공유 코드·자체 소재 마켓 구현(커뮤니티 축적 초기)", "Compact share codes & built-in market (early community scale)"),
          csp: cell("supported", "ASSETS 생태계 최강", "Largest ASSETS store", "10년+ 누적 수만 종 브러시·소재와 원클릭 앱 다운로드", "10+ years of tens of thousands of one-click ASSETS"),
          krita: cell("supported", "번들·커뮤니티 팩", "Bundles & community", ".bundle 패키지 배포·공식 포럼 무료 브러시 팩 풍부", "Rich free .bundle packs across Krita Artists community"),
          magma: cell("partial", "세션·프로필 공유", "Profile brush sync", "계정 브러시 동기화 중심, 대형 마켓플레이스는 아님", "Account-synced brushes without a large public store"),
          procreate: cell("supported", "방대한 외부 마켓", "Huge external market", "Gumroad·Creative Market 등 서드파티 .brushset 시장 거대", "Massive third-party .brushset creator economy"),
          rebelle7: cell("partial", "공식 팩 + 포럼", "Official packs & forum", "공식 종이·브러시 팩과 사용자 커뮤니티 공유", "Official paper/brush packs plus community forum sharing"),
          photoshop: cell("supported", "Creative Cloud + 외부", "CC + external stores", "Adobe 무료 브러시 팩 및 수십 년치 .abr 생태계", "Decades-long .abr ecosystem plus included Adobe packs"),
          "ibis-medibang": cell("supported", "QR 코드 · 클라우드", "QR code & cloud", "ibisPaint 브러시 QR 코드 공유와 MediBang 클라우드 소재 활발", "Active ibisPaint QR brush sharing & MediBang cloud materials"),
        },
        evidence: {
          maturity: "partial",
          rationale: t(
            "브러시 설정 직렬화 공유 코드(`brush-preset-share-code.ts`)와 소재 마켓 연동 카탈로그 UI를 구현했으나, 생태계 수량은 베타 초기 단계입니다.",
            "Implements portable brush share codes and integrated market catalog panels; community catalog volume is still early-stage.",
          ),
          implementationDiff: t(
            "CSP ASSETS나 ibisPaint QR 생태계의 누적 수량이 압도적으로 크므로, ToonStudio는 공유 코드 간편성과 외부 포맷 가져오기로 진입 장벽을 낮춥니다.",
            "CSP ASSETS and ibisPaint QR ecosystems hold far larger catalogs; ToonStudio emphasizes frictionless share codes plus external format import.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/brush-lab/brush-preset-share-code.ts",
            "apps/web/src/domains/creator/brush/StudioBrushLibraryPanel.tsx",
            "apps/web/src/domains/creator/brush-lab/StudioBrushProductCataloguePanel.tsx",
          ],
        },
      },
      {
        id: "brush-commercial-license-safety",
        categoryId: "custom-brush-formats",
        title: t("브러시 · 안료 상업용 라이선스 안전성 검증", "Commercial License Safety for Brushes & Pigments"),
        summary: t(
          "비상업(NC)·GPL 혼입을 막고 상업 웹툰 연재에 안심하고 쓸 수 있는 브러시 권리 보증",
          "Preventing non-commercial (NC) or incompatible licenses from entering commercial serialization pipelines",
        ),
        cells: {
          toonstudio: cell("supported", "자동 감사·NC 차단", "Auto audit & NC block", "mixbox(NC) 0건 · 라이선스 프로필 검사 + Rights BOM 연동", "Zero NC mixbox; automated license profile check & Rights BOM"),
          csp: cell("partial", "작품 상용 OK·소재 별도", "Art OK, check ASSETS", "기본 브러시 상용 허용, ASSETS 개별 소재 약관은 수동 확인", "Default brushes commercial-safe; ASSETS items require manual check"),
          krita: cell("supported", "산출물 상용 자유", "Commercial art free", "앱은 GPL-3.0이나 그림 결과물과 기본 브러시 상업 이용 자유", "GPL-3.0 app; created artwork & bundled brushes are commercial-safe"),
          magma: cell("supported", "상용 작업 허용", "Commercial art OK", "기본 브러시 상용 작품 허용(팀/기업 플랜 약관 확인)", "Default brushes commercial-safe; review team plan terms"),
          procreate: cell("supported", "기본 브러시 상용 OK", "Default set commercial", "기본 브러시 상업 이용 자유, 외부 구매 팩은 개별 확인", "Default brushes commercial-safe; external packs vary"),
          rebelle7: cell("supported", "상업 라이선스 명확", "Clear commercial terms", "1인·스튜디오 상업 작품 제작 명시 허용", "Explicit commercial rights for individuals and studios"),
          photoshop: cell("supported", "기업 상용 표준", "Enterprise standard", "구독 유지 시 상업 이용, 외부 팩·폰트는 라이선스별 확인", "Enterprise commercial standard; check third-party packs"),
          "ibis-medibang": cell("partial", "소재별 상용 범위 확인", "Check material terms", "기본 브러시 상용 가능, 일부 클라우드 소재·폰트 약관 확인 필요", "Base brushes OK; verify specific cloud tones and fonts"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "브러시 스튜디오 라이선스 프로필 검사기와 `pnpm run audit:licenses` 자동 게이트로 비상업 의존성 혼입을 빌드 단계에서 차단합니다.",
            "Enforces commercial-safe brush profiles and blocks non-commercial dependencies automatically at build time via audit:licenses.",
          ),
          implementationDiff: t(
            "대부분의 드로잉 툴은 외부 브러시 팩의 상업 권리를 작가 기억에 맡기지만, ToonStudio는 브러시 레시피 메타데이터와 출고 Rights BOM을 연결해 NC 혼입을 출고 전 차단합니다.",
            "Most apps leave third-party brush rights to manual memory; ToonStudio links brush license metadata directly to fail-closed export Rights BOM checks.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/brush-lab/brush-studio-v6-license-profile.ts",
            "apps/brush-lab/src/license-policy.test.ts",
            "docs/legal/solo-founder-commercial-license-audit-20261122.md",
          ],
        },
      },
      {
        id: "mypaint-cc0-library",
        categoryId: "custom-brush-formats",
        title: t("내장 CC0 자연매체 프리셋 & 독립 실험 샌드박스", "Built-in CC0 Natural-Media Presets & Standalone Sandbox"),
        summary: t(
          "별도 구매 없이 바로 쓰는 CC0 자연매체 브러시 묶음과 원고 오염 없는 독립 브러시 실험실",
          "Zero-cost CC0 natural-media preset library plus an isolated sandbox for testing strokes without touching manuscripts",
        ),
        cells: {
          toonstudio: cell("supported", "CC0 MyPaint + Brush Lab", "CC0 MyPaint + Lab", "CC0 자연매체 라이브러리 내장 + 독립 Brush Lab 패드", "Bundled CC0 MyPaint library + standalone Brush Lab pad"),
          csp: cell("supported", "기본 프리셋 + 보조 패드", "Defaults + test pad", "기본 만화/회화 브러시 풍부(독립 테스트 창은 제한적)", "Rich default manga/paint sets; modest preview strip"),
          krita: cell("supported", "MyPaint 번들 내장", "Bundled MyPaint", "CC0/공개 MyPaint·Krita 기본 브러시 팩 기본 포함", "Includes open MyPaint & Krita brush bundles out of the box"),
          magma: cell("partial", "기본 프리셋 세트", "Core preset set", "협업에 필요한 핵심 프리셋 제공(자연매체 깊이 제한)", "Core collaboration presets; modest natural-media variety"),
          procreate: cell("supported", "190+ 기본 + 테스트 패드", "190+ defaults + pad", "풍부한 기본 브러시와 브러시 스튜디오 테스트 패드", "190+ curated brushes with dedicated live test pad"),
          rebelle7: cell("supported", "화구별 기본 팩", "Curated media packs", "수채·유화·아크릴·파스텔 화구별 기본 프리셋 완비", "Comprehensive built-in watercolor, oil, acrylic & pastel sets"),
          photoshop: cell("supported", "기본 + Kyle 팩 무료", "Defaults + Kyle packs", "구독자에게 대규모 공식 브러시 팩 추가 제공", "Includes extensive official Kyle brush libraries"),
          "ibis-medibang": cell("partial", "무료+광고/유료 잠금", "Freemium gated sets", "ibisPaint는 일부 브러시 광고 시청/유료 잠금 존재", "ibisPaint gates many brushes behind ads or Prime"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "CC0 MyPaint 브러시 카탈로그를 내장하고 `/studio/assets/brushes/new` 독립 Brush Lab에서 실시간 스트로크 패드로 안전하게 시험합니다.",
            "Bundles a CC0 MyPaint preset library and offers an isolated Brush Lab stroke pad at /studio/assets/brushes/new.",
          ),
          implementationDiff: t(
            "Krita처럼 검증된 CC0 MyPaint 프리셋을 무료 포함하면서도, 브라우저에서 별도 설치 없이 테스트 패드와 스펙트럼 비교를 바로 열 수 있습니다.",
            "Matches Krita's open CC0 MyPaint inclusion while providing an instant zero-install web test pad.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/brush/mypaint-library/studio-mypaint-cc0-library-catalog.ts",
            "apps/web/src/domains/creator/brush-lab/StudioBrushLabLiveStrokePad.tsx",
          ],
        },
      },
    ],
  },
  {
    id: "filters-retouch",
    number: 3,
    shortLabel: t("③ 필터·보정·리터칭", "3. Filters & Retouch"),
    title: t("필터 · 비파괴 보정 · 리터칭", "Filters, Non-Destructive Adjustments & Retouching"),
    summary: t(
      "WebGPU 컴퓨트 안료 필터, 비파괴 스마트 필터 스택, 무손실 Float32 주파수 분리, 로컬 PatchMatch 인페인팅, 액화·메시 워프·Lanczos3, 16-bit HDR 디더링 비교",
      "Comparing WebGPU pigment filters, non-destructive smart filter stacks, Float32 frequency separation, local PatchMatch inpainting, Liquify/Lanczos3 and 16-bit HDR dithering",
    ),
    criteria: [
      {
        id: "webgpu-pigment-filters",
        categoryId: "filters-retouch",
        title: t("WebGPU 컴퓨트 안료 필터 (분광 그라디언트·글레이징)", "WebGPU Compute Pigment Filters (Spectral Gradient & Glazing)"),
        summary: t(
          "일반 RGB 필터 대신 KM 분광 공간에서 그라디언트 맵·색온도·글레이징·색조 조화를 계산",
          "Computing gradient maps, color temperature, glazing and color harmony in spectral KM space instead of raw RGB",
        ),
        cells: {
          toonstudio: cell("supported", "KM7 안료 필터 4종", "4 KM7 pigment filters", "분광 그라디언트 맵·색온도·글레이징·하모나이저 내장", "Spectral gradient map, temperature, glazing & harmonizer"),
          csp: cell("partial", "RGB 그라데이션 맵", "RGB Gradient Map", "그라데이션 맵·색조 보정 우수(분광 KM 필터는 아님)", "Mature RGB gradient maps, not spectral KM"),
          krita: cell("partial", "필터 + G'MIC 색보정", "Filters + G'MIC", "풍부한 색공간 필터·G'MIC 제공(전용 KM 안료 필터는 별도)", "Rich color-space & G'MIC filters; KM filters require custom setup"),
          magma: cell("partial", "기본 색조/대비 보정", "Basic color grading", "밝기·대비·색조·그라디언트 맵 등 핵심 보정 제공", "Core brightness/contrast/hue/gradient adjustments"),
          procreate: cell("partial", "RGB 그라디언트·커브", "RGB Gradient & Curves", "직관적 조정 제공, 물리 안료 필터는 없음", "Intuitive RGB adjustments without spectral pigment filters"),
          rebelle7: cell("partial", "광원·색조 필터", "Light & color filters", "안료 브러시 혼색은 최상, 범용 필터 스택은 간결", "Top pigment brushes; concise post-filter set"),
          photoshop: cell("partial", "LUT · 그라디언트 맵", "LUT & Gradient Map", "색보정 최강이나 분광 감산 안료 글레이징 필터는 기본 미내장", "Unmatched RGB/Lab/CMYK grading; no native spectral KM filter"),
          "ibis-medibang": cell("partial", "모바일 필터 70+", "70+ mobile filters", "ibisPaint 필터 수는 많으나 모두 RGB 기반", "ibisPaint has 70+ RGB filters, none spectral KM"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "7밴드 KM 분광 코어를 필터 갤러리 4종(분광 그라디언트 맵·색온도·글레이징·하모나이저)으로 직접 노출했습니다.",
            "Exposes the 7-band KM core directly in the filter gallery via four dedicated spectral pigment filters.",
          ),
          implementationDiff: t(
            "기존 툴의 그라데이션 맵이 RGB 보간으로 중간 톤이 탁해지는 문제를 분광 반사율 보간으로 해결합니다.",
            "Prevents muddy midtone interpolation common in RGB gradient maps by blending pigment reflectance curves.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/filter/gallery/studio-filter-gallery-spectral-pigment.ts",
            "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
          ],
        },
      },
      {
        id: "non-destructive-smart-filter-stack",
        categoryId: "filters-retouch",
        title: t("비파괴 스마트 필터 스택 & 순서 재배치", "Non-Destructive Smart Filter Stack & Reordering"),
        summary: t(
          "원본 픽셀을 덮어쓰지 않고 여러 필터를 스택으로 쌓아 파라미터 수정·토글·순서 변경 지원",
          "Stacking editable, toggleable and reorderable filters non-destructively over source imagery",
        ),
        cells: {
          toonstudio: cell("supported", "비파괴 스마트 필터 스택", "Smart Filter stack", "검색·순서 재배치·마스크·결정적 이펙트 그래프 지원", "Searchable, reorderable non-destructive smart-filter graph"),
          csp: cell("partial", "색조 보정 레이어 중심", "Correction layers", "색보정 레이어는 비파괴, 블러·샤픈 등 일반 필터는 파괴적", "Non-destructive color correction layers; blur/sharpen destructive"),
          krita: cell("supported", "Filter Layers & Masks", "Filter Layers/Masks", "임의 필터를 비파괴 레이어·마스크로 스택 구성 가능", "Any filter can be stacked non-destructively as layer or mask"),
          magma: cell("unsupported", "파괴적 적용 위주", "Mostly destructive", "실시간 협업 특성상 일반 필터는 레이어 직접 적용", "Filters generally bake directly onto raster layers"),
          procreate: cell("unsupported", "파괴적 조정", "Destructive only", "조정·블러 적용 즉시 픽셀에 구워짐(비파괴 스택 없음)", "Adjustments and blurs commit destructively"),
          rebelle7: cell("partial", "필터 레이어 일부", "Limited filter layers", "색상 조정 레이어 일부 지원, 범용 스마트 필터 스택 없음", "Basic adjustment layers; no general smart-filter stack"),
          photoshop: cell("supported", "Smart Objects 최강", "Smart Objects leader", "스마트 오브젝트 + 스마트 필터 + 개별 마스크 업계 표준", "Industry gold standard with Smart Objects & filter masks"),
          "ibis-medibang": cell("unsupported", "파괴적 필터", "Destructive filters", "필터 적용 즉시 래스터 레이어에 반영", "Filters commit directly to raster layers"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "이미지 요소별 비파괴 스마트 필터 스택 UI, 순서 재배치, 파라미터 스키마 검증과 조정 이펙트 그래프를 구현했습니다.",
            "Implements per-element non-destructive smart-filter stacks with reordering, schema validation and an adjustment effect graph.",
          ),
          implementationDiff: t(
            "Photoshop Smart Objects와 Krita Filter Masks가 네이티브에서 제공하는 비파괴 스택을 브라우저 캔버스 요소에 직결해 재편집 비용을 없앴습니다.",
            "Brings Photoshop Smart Object and Krita Filter Mask non-destructive workflows directly to browser canvas elements.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/StudioSmartFiltersPanel.tsx",
            "apps/web/src/domains/creator/photoshop-pro/photoshop-smart-object-stack.ts",
            "apps/web/src/domains/creator/filter/studio-adjustment-effect-graph.ts",
          ],
        },
      },
      {
        id: "lossless-float32-frequency-separation",
        categoryId: "filters-retouch",
        title: t("무손실 Float32 주파수 분리 (질감·색조 분리)", "Lossless Float32 Frequency Separation (Texture / Tone Split)"),
        summary: t(
          "저주파(색·명암)와 고주파(선·피부·종이 질감)를 Float32로 분리해 양자화 손실 없이 리터칭",
          "Separating low-frequency tone and high-frequency detail in Float32 for zero-quantization retouching",
        ),
        cells: {
          toonstudio: cell("supported", "Float32 가역 분리", "Lossless Float32", "분리형 가우시안/중앙값 기반 Float32 무손실 재합성", "Separable Gaussian/median Float32 exact reconstruction"),
          csp: cell("unsupported", "수동 블러·감산", "Manual workaround", "전용 주파수 분리 원클릭 도구 없음", "Requires manual blur & subtract layer setup"),
          krita: cell("plugin", "G'MIC Wavelet Decompose", "G'MIC Wavelet", "G'MIC-Qt 플러그인의 Wavelet Decompose로 지원", "Available via G'MIC-Qt Wavelet Decompose plugin"),
          magma: cell("unsupported", "미지원", "Not supported", "주파수 분리 리터칭 도구 없음", "No frequency separation tool"),
          procreate: cell("unsupported", "수동 작업", "Manual only", "전용 주파수 분리 기능 없음", "No built-in frequency separation"),
          rebelle7: cell("unsupported", "미지원", "Not supported", "회화 전용으로 리터칭 주파수 분리 없음", "Not part of traditional painting focus"),
          photoshop: cell("partial", "액션·Apply Image", "Action / Apply Image", "16-bit Apply Image 워크플로 업계 표준(원클릭 기본 버튼은 액션)", "16-bit Apply Image industry standard via Actions"),
          "ibis-medibang": cell("unsupported", "미지원", "Not supported", "주파수 분리 도구 없음", "No frequency separation"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "8-bit 반올림 오차가 쌓이는 기존 수동 방식과 달리, Float32 분리형 커널로 저주파+고주파 재합성 오차 0에 수렴하는 무손실 파이프라인을 구현했습니다.",
            "Computes separable low/high bands in Float32 so recomposition avoids 8-bit quantization drift.",
          ),
          implementationDiff: t(
            "Photoshop에서는 16-bit 문서 + Apply Image 액션으로 수동 구성하고 Krita는 G'MIC-Qt에 의존하지만, ToonStudio는 원클릭 Float32 분리 커널을 내장합니다.",
            "Photoshop relies on manual 16-bit Apply Image actions and Krita uses G'MIC-Qt; ToonStudio ships a built-in one-click Float32 separator.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/imaging-pro/studio-separable-frequency-separation.ts",
            "apps/web/src/domains/creator/photoshop-pro/photoshop-retouch-frequency.ts",
          ],
        },
      },
      {
        id: "local-patchmatch-inpainting",
        categoryId: "filters-retouch",
        title: t("로컬 PatchMatch 피라미드 인페인팅 (AI 서버 없음)", "Local PatchMatch Pyramid Inpainting (Zero Cloud AI)"),
        summary: t(
          "클라우드 생성 AI·과금 없이 기기 내 다중 해상도 패치 매칭으로 말풍선·잡티·배경 구멍 복원",
          "Removing speech bubbles, dust or background gaps locally via multi-scale patch matching with zero cloud AI",
        ),
        cells: {
          toonstudio: cell("supported", "로컬 PatchMatch 워커", "Local PatchMatch", "다중 피라미드 PatchMatch 오프라인 복원 · 비용 ₩0", "Multi-scale pyramid PatchMatch offline in worker at KRW 0"),
          csp: cell("unsupported", "도장·수동 리터칭", "Clone stamp only", "자동 PatchMatch 내용 인식 채우기 미내장", "No built-in PatchMatch content-aware fill"),
          krita: cell("plugin", "Smart Patch + G'MIC", "Smart Patch + G'MIC", "내장 Smart Patch Remove 툴과 G'MIC Inpaint 지원", "Built-in Smart Patch tool plus G'MIC Inpaint"),
          magma: cell("unsupported", "미지원", "Not supported", "내용 인식 인페인팅 도구 없음", "No content-aware inpainting"),
          procreate: cell("unsupported", "도장 도구만", "Clone only", "자동 패치 인페인팅 없음", "Clone brush only; no automatic inpainting"),
          rebelle7: cell("unsupported", "미지원", "Not supported", "회화 전용으로 인페인팅 미제공", "No inpainting tool"),
          photoshop: cell("supported", "Content-Aware + Firefly", "Content-Aware + AI", "로컬 PatchMatch(Content-Aware Fill) + 클라우드 생성 채우기 최강", "Industry benchmark local Content-Aware Fill + cloud Generative Fill"),
          "ibis-medibang": cell("unsupported", "도장·복제 위주", "Clone only", "로컬 PatchMatch 자동 복원 없음", "No local PatchMatch inpainting"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "Coarse-to-fine 이미지 피라미드 + 랜덤 서치/전파 PatchMatch 인페인팅을 전용 Web Worker로 구현해 외부 AI 전송 없이 배경을 복원합니다.",
            "Implements coarse-to-fine pyramid PatchMatch inpainting inside a Web Worker with zero external AI calls.",
          ),
          implementationDiff: t(
            "Photoshop Content-Aware Fill의 원조 알고리즘과 같은 계열을 브라우저 로컬 워커로 클린룸 구현해, 생성형 AI 저작권 논란이나 서버 크레딧 소모 없이 배경 틈을 메웁니다.",
            "Clean-room browser worker implementation of pyramid PatchMatch, avoiding generative AI copyright ambiguity or cloud credit burn.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/imaging-pro/studio-patchmatch-inpaint-and-freqsep.ts",
            "apps/web/src/domains/creator/imaging-pro/studio-patchmatch-pyramid-ops.ts",
            "apps/web/src/domains/creator/filter/studio-patchmatch-inpaint-worker.ts",
          ],
        },
      },
      {
        id: "liquify-mesh-warp-lanczos3",
        categoryId: "filters-retouch",
        title: t("액화(Liquify) · 메시/퍼펫 워프 · Lanczos3 리샘플링", "Liquify, Mesh/Puppet Warp & Lanczos3 Resampling"),
        summary: t(
          "인체 비율 보정용 액화, 격자 메시·핀 퍼펫 변형, 선화 뭉개짐을 줄이는 Lanczos3 고품질 리샘플링",
          "Liquify proportion tweaks, mesh/puppet warp and crisp Lanczos3 resampling to preserve inked lineart",
        ),
        cells: {
          toonstudio: cell("supported", "액화·메시·퍼펫·Lanczos3", "Liquify/Mesh/Lanczos3", "워커 액화 + 캔버스 메시/퍼펫 워프 + WGSL Lanczos3 변형", "Worker Liquify, on-canvas Mesh/Puppet warp & WGSL Lanczos3"),
          csp: cell("supported", "액화·메시·퍼펫 완비", "Liquify/Mesh/Puppet", "v1.11+ 액화·다중 레이어 메시 변형·v4 퍼펫 워프 지원", "Liquify, multi-layer mesh transform & v4 Puppet Warp"),
          krita: cell("supported", "Liquify·Cage·Mesh", "Liquify, Cage & Mesh", "변형 툴 내 Liquify·Cage·Mesh·Lanczos3 필터 완비", "Full Liquify, Cage, Mesh transforms & Lanczos3 filter"),
          magma: cell("partial", "기본 자유 변형", "Free transform", "기본 이동·회전·왜곡 지원(액화·퍼펫 워프 제한)", "Basic transform/distort; limited liquify/puppet warp"),
          procreate: cell("supported", "실시간 액화·워프", "Live Liquify & Warp", "Metal 60/120fps 액화·메시 워프·바이큐빅 보간 매우 쾌적", "Very smooth Metal Liquify & Mesh Warp (no Puppet Warp)"),
          rebelle7: cell("partial", "액화·자유 변형", "Liquify & Transform", "액화·메시 변형 지원(퍼펫 핀 워프는 없음)", "Liquify & Mesh Warp available; no Puppet Warp"),
          photoshop: cell("supported", "액화·퍼펫·얼굴인식", "Full Warp + Face AI", "얼굴 인식 액화·퍼펫 워프·원근 워프·세부 리샘플링 최상", "Face-aware Liquify, Puppet/Perspective Warp & fine resampling"),
          "ibis-medibang": cell("partial", "액화·메시 (앱 차등)", "Liquify/Mesh (split)", "ibisPaint는 액화·메시 지원, MediBang은 메시 변형 중심", "ibisPaint has Liquify & Mesh; MediBang focuses on Mesh"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "Dedicated Worker 액화 엔진, 캔버스 위 메시·퍼펫 워프, 선화 선명도를 지키는 WGSL Lanczos3 리샘플링 커널을 함께 갖췄습니다.",
            "Pairs a Web Worker Liquify engine with on-canvas Mesh/Puppet warp and WGSL Lanczos3 resampling.",
          ),
          implementationDiff: t(
            "브라우저 기본 `drawImage` 이중선형 보간은 회전·축소 2~3번만에 선화가 흐려지지만, ToonStudio는 WGSL/CPU Lanczos3 커널로 선화 선명도를 유지합니다.",
            "Standard browser bilinear drawImage blurs ink after repeated transforms; ToonStudio preserves line crispness with WGSL/CPU Lanczos3 kernels.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/StudioLiquifyPanel.tsx",
            "apps/web/src/domains/creator/studio-mesh-warp-liquify.ts",
            "apps/web/src/domains/creator/transform/studio-puppet-warp.ts",
            "apps/web/src/domains/creator/render/studio-webgpu-transform-resample-wgsl.ts",
          ],
        },
      },
      {
        id: "hdr-16bit-dithering-camera-raw",
        categoryId: "filters-retouch",
        title: t("16-bit HDR 디더링 · 밴딩 억제 · 색보정 현상", "16-Bit HDR Dithering, Anti-Banding & Develop Grading"),
        summary: t(
          "야간·그라데이션 컷의 계단 현상(컬러 밴딩) 억제, 광색역 출력 및 Camera Raw 스타일 톤 현상",
          "Suppressing gradient banding in dark scenes via dithering plus Camera Raw-style tonal development",
        ),
        cells: {
          toonstudio: cell("partial", "HDR 디더링 + 현상 모듈", "HDR dither + develop", "WebGPU HDR 디더링·블루노이즈 밴딩 억제 + 현상 톤 커브(전면 16-bit 문서 전환 중)", "WebGPU HDR blue-noise dithering & develop curves (full 16-bit doc in progress)"),
          csp: cell("partial", "8-bit 중심 캔버스", "8-bit canvas core", "내부 8-bit 채널 기반이라 어두운 그라데이션 밴딩 취약", "8-bit per channel core can band on subtle dark gradients"),
          krita: cell("supported", "16/32-bit Float HDR", "16/32-bit Float HDR", "16-bit 정수·32-bit 부동소수점·OCIO HDR 컬러 관리 최상", "Full 16-bit int, 32-bit float & OCIO HDR color management"),
          magma: cell("unsupported", "8-bit sRGB", "8-bit sRGB", "표준 8-bit sRGB 웹 캔버스", "Standard 8-bit sRGB web canvas"),
          procreate: cell("partial", "Display P3 (8-bit)", "Display P3 (8-bit)", "광색역 P3 지원하나 채널 정밀도는 8-bit 기반", "Wide-gamut Display P3, 8-bit per channel"),
          rebelle7: cell("partial", "광색역·16-bit 출력", "16-bit export", "고정밀 내부 색공간·16-bit PNG/TIFF 출력 지원", "High-precision internal color & 16-bit export"),
          photoshop: cell("supported", "16/32-bit + Camera Raw", "16/32-bit + ACR", "16/32-bit 편집, 디더링 그라디언트, Camera Raw 업계 표준", "Full 16/32-bit editing, dithered gradients & Camera Raw"),
          "ibis-medibang": cell("unsupported", "8-bit sRGB", "8-bit sRGB", "모바일 8-bit sRGB 파이프라인", "Mobile 8-bit sRGB pipeline"),
        },
        evidence: {
          maturity: "partial",
          rationale: t(
            "WebGPU HDR 디더링·프레임 예산 가드와 Camera Raw 스타일 톤 현상 채널 모듈을 구현했으며, 전 레이어 네이티브 16-bit 저장은 단계 확장 중입니다.",
            "Implements WebGPU HDR dithering and Camera Raw-style channel develop controls; full native 16-bit layer storage is expanding progressively.",
          ),
          implementationDiff: t(
            "Krita와 Photoshop이 16/32-bit Float 문서 전체를 네이티브로 다루는 점에서 앞서며, ToonStudio는 8-bit 출력 시 발생하는 밴딩을 GPU 디더링으로 우선 해소합니다.",
            "Krita and Photoshop lead with full 16/32-bit float documents; ToonStudio mitigates 8-bit banding via GPU dithering and tonal develop stages.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/render/gpu-next/gpu-hdr-dither-and-frame-budget.ts",
            "apps/web/src/domains/creator/filter/studio-camera-raw-develop.ts",
            "apps/web/src/domains/creator/photoshop-pro/photoshop-camera-raw-channels.ts",
          ],
        },
      },
    ],
  },
];
