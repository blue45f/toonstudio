/**
 * 드로잉 툴 8종 심층 기술 비교 프로필 · 상태 메타 · 정직한 한계 정본 (`/about/technology/drawing-compare`).
 *
 * 작성 기준 (2026-11-22 코드·문서 실측):
 * - ToonStudio 셀과 근거는 실제 저장소 소스·테스트·운영 문서를 연결하며 `current`/`partial` 성숙도를 구분한다.
 * - 경쟁 툴 7종(CSP · Krita · Magma Studio · Procreate · Rebelle 7 · Photoshop · ibisPaint/MediBang)의
 *   고유 강점을 축소하지 않고, 각 도구가 실제로 앞서는 영역과 ToonStudio의 현재 한계를 함께 명시한다.
 */

export const DRAWING_COMPARE_SNAPSHOT_DATE = "2026-11-22" as const;

export interface BilingualText {
  readonly ko: string;
  readonly en: string;
}

export type DrawingToolId =
  | "toonstudio"
  | "csp"
  | "krita"
  | "magma"
  | "procreate"
  | "rebelle7"
  | "photoshop"
  | "ibis-medibang";

export type DrawingCategoryId =
  | "brush-pigment"
  | "custom-brush-formats"
  | "filters-retouch"
  | "lineart-vector-fill"
  | "manga-webtoon-tools"
  | "collab-browser"
  | "pricing-sovereignty";

export type DrawingSupportStatus =
  | "supported"
  | "partial"
  | "plugin"
  | "unsupported";

export type DrawingPresetId =
  | "all"
  | "core-trio"
  | "manga-pro"
  | "paint-retouch";

export interface DrawingToolProfile {
  readonly id: DrawingToolId;
  readonly name: string;
  readonly shortName: string;
  readonly engineSummary: BilingualText;
  readonly platforms: BilingualText;
  readonly pricing: BilingualText;
  readonly standoutStrength: BilingualText;
  readonly interopSummary: BilingualText;
}

export interface DrawingToolCell {
  readonly status: DrawingSupportStatus;
  readonly label: BilingualText;
  readonly detail: BilingualText;
}

export interface DrawingCriterionEvidence {
  readonly maturity: "current" | "partial";
  readonly rationale: BilingualText;
  readonly implementationDiff: BilingualText;
  readonly repoPaths: readonly string[];
}

export interface DrawingComparisonCriterion {
  readonly id: string;
  readonly categoryId: DrawingCategoryId;
  readonly title: BilingualText;
  readonly summary: BilingualText;
  readonly cells: Readonly<Record<DrawingToolId, DrawingToolCell>>;
  readonly evidence: DrawingCriterionEvidence;
}

export interface DrawingComparisonCategory {
  readonly id: DrawingCategoryId;
  readonly number: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly shortLabel: BilingualText;
  readonly title: BilingualText;
  readonly summary: BilingualText;
  readonly criteria: readonly DrawingComparisonCriterion[];
}

export interface CompetitorAdvantageNote {
  readonly toolId: Exclude<DrawingToolId, "toonstudio">;
  readonly advantageTitle: BilingualText;
  readonly detail: BilingualText;
}

export interface ToonStudioLimitationNote {
  readonly id: string;
  readonly area: BilingualText;
  readonly honestLimit: BilingualText;
  readonly browserWebGpuEdge: BilingualText;
  readonly repoPaths: readonly string[];
}

const t = (ko: string, en: string): BilingualText => ({ ko, en });

export const DRAWING_TOOL_PROFILES: readonly DrawingToolProfile[] = [
  {
    id: "toonstudio",
    name: "ToonStudio",
    shortName: "ToonStudio",
    engineSummary: t(
      "WebGPU Compute · Canvas2D 커밋 권위 · Rust/WASM · Yjs CRDT",
      "WebGPU Compute, Canvas2D commit authority, Rust/WASM & Yjs CRDT",
    ),
    platforms: t("데스크톱·태블릿·모바일 웹 (설치 없음)", "Desktop, tablet & mobile web (zero install)"),
    pricing: t("베타 전 기능 ₩0 (브라우저 로컬 실행 · 정식 과금 사전 고지)", "KRW 0 in beta (local browser runtime; future pricing announced ahead)"),
    standoutStrength: t(
      "무설치 브라우저 한 탭에서 7밴드 KM 분광·유체 수채화·Watershed 자동 밑색·PatchMatch·만화 식자·Yjs 협업을 통합",
      "Unifies 7-band KM spectral mixing, fluid watercolor, Watershed auto-colorize, PatchMatch, manga lettering and Yjs collab in one browser tab",
    ),
    interopSummary: t(
      "SQLite OPFS 로컬 원본 + PSD · .abr · .sut · .kpp · .brushset · GLB · VRM · .skp",
      "Local SQLite OPFS authority plus PSD, .abr, .sut, .kpp, .brushset, GLB, VRM and .skp",
    ),
  },
  {
    id: "csp",
    name: "Clip Studio Paint",
    shortName: "CSP",
    engineSummary: t("네이티브 C++ 드로잉·만화 전용 엔진 (PRO/EX)", "Native C++ manga & illustration engine (PRO/EX)"),
    platforms: t("Windows · macOS · iPad · Android", "Windows, macOS, iPad & Android"),
    pricing: t("월·연 구독 또는 PC 일시불 영구판(버전 업 유료)", "Monthly/annual subscription or PC perpetual license (paid upgrades)"),
    standoutStrength: t(
      "10년 넘게 쌓인 ASSETS 소재 마켓(.sut/3D/톤), 정교한 벡터 선화·교차점 지우개, EX 다중 페이지·LT 변환",
      "Decade-old ASSETS store (.sut/3D/tones), mature vector lineart/intersection eraser and EX multi-page/LT conversion",
    ),
    interopSummary: t("PSD 레이어·.sut 브러시 가져오기 및 PNG/PSD 왕복", "PSD layer & .sut brush import plus PNG/PSD round-trip"),
  },
  {
    id: "krita",
    name: "Krita",
    shortName: "Krita",
    engineSummary: t("오픈소스 C++/Qt 타일 엔진 · 10+ 브러시 엔진 · G'MIC-Qt", "Open-source C++/Qt tile engine, 10+ brush engines & G'MIC-Qt"),
    platforms: t("Windows · macOS · Linux · Android", "Windows, macOS, Linux & Android"),
    pricing: t("무료 오픈소스 (GPL-3.0 · 스토어 후원 구매 선택)", "Free open source (GPL-3.0; optional paid store builds)"),
    standoutStrength: t(
      "네이티브 C++/Python 플러그인 생태계, Colorize Mask 자동 밑색, 다중 브러시 엔진, Linux·대용량 RAM 안정성",
      "Mature C++/Python plugin ecosystem, Colorize Mask auto-flatting, diverse brush engines and Linux/high-RAM stability",
    ),
    interopSummary: t(".kpp 브러시·.kra/OpenRaster 파서 및 PSD 왕복", ".kpp brush & .kra/OpenRaster parsers plus PSD round-trip"),
  },
  {
    id: "magma",
    name: "Magma Studio",
    shortName: "Magma",
    engineSummary: t("브라우저 실시간 멀티플레이어 캔버스 (WebGL/WebSockets)", "Browser real-time multiplayer canvas (WebGL/WebSockets)"),
    platforms: t("데스크톱·태블릿 웹 브라우저", "Desktop & tablet web browsers"),
    pricing: t("무료 플랜(기본 캔버스) + Blaze/Pro 유료 구독", "Free tier plus Blaze/Pro paid subscriptions"),
    standoutStrength: t(
      "링크 하나로 최대 30인 이상이 바로 들어와 함께 그리는 실시간 드로잉 잼(ArtJam)과 가벼운 협업 UX",
      "Instant link-based multiplayer ArtJam rooms for 30+ simultaneous artists with low-friction presence UX",
    ),
    interopSummary: t("PSD/PNG 내보내기 왕복 · 웹 협업 흐름 호환", "PSD/PNG round-trip and shared web co-drawing workflows"),
  },
  {
    id: "procreate",
    name: "Procreate",
    shortName: "Procreate",
    engineSummary: t("Valkyrie Metal 64-bit iPad 전용 엔진", "Valkyrie Metal 64-bit iPad-native engine"),
    platforms: t("iPadOS 전용 (iPhone은 Pocket 별매)", "iPadOS only (Pocket sold separately on iPhone)"),
    pricing: t("1회 앱 구매 (구독 없음 · iPad/Apple Pencil 기기 별도)", "One-time app purchase (no subscription; requires iPad + Pencil)"),
    standoutStrength: t(
      "Apple Pencil 120Hz 초저지연 필기감, 최소 크롬 몰입 화면, 직관적인 ColorDrop·QuickShape 제스처",
      "120Hz Apple Pencil ultra-low latency, minimal-chrome immersion and iconic ColorDrop & QuickShape gestures",
    ),
    interopSummary: t(".brushset 가져오기 지원 + PSD/PNG 원고 연결", ".brushset import plus PSD/PNG handoff"),
  },
  {
    id: "rebelle7",
    name: "Rebelle 7",
    shortName: "Rebelle 7",
    engineSummary: t("실시간 유체·종이 섬유·Pigments·NanoPixel GPU 엔진", "Real-time fluid, paper fiber, Pigments & NanoPixel GPU engine"),
    platforms: t("Windows · macOS (데스크톱 전용)", "Windows & macOS (desktop only)"),
    pricing: t("데스크톱 영구 라이선스 (Standard / Pro 분리 · 업그레이드 유료)", "Desktop perpetual license (Standard/Pro tiers; paid upgrades)"),
    standoutStrength: t(
      "중력 기울기 물 번짐, 종이 섬유 흡수·건조, 금속박·임파스토 두터운 유화 물성 재현 업계 최상위",
      "Benchmark desktop fluid gravity diffusion, paper absorption/drying, metallic foil and thick oil impasto physics",
    ),
    interopSummary: t("고해상도 PNG/PSD 원화 출력 후 컷·표지 합성", "High-res PNG/PSD painting export into webtoon cuts & covers"),
  },
  {
    id: "photoshop",
    name: "Adobe Photoshop",
    shortName: "Photoshop",
    engineSummary: t("네이티브 C++ Mercury GPU · 16/32-bit 색관리 엔진", "Native C++ Mercury GPU & 16/32-bit color engine"),
    platforms: t("Windows · macOS · iPad · Web(기능 축소)", "Windows, macOS, iPad & limited Web"),
    pricing: t("Creative Cloud 월·연 정기 구독 필수", "Creative Cloud recurring subscription required"),
    standoutStrength: t(
      "비파괴 스마트 오브젝트·조정 레이어, Camera Raw, CMYK 인쇄 분판, 대용량 PSB와 에이전시 PSD 표준",
      "Non-destructive Smart Objects, adjustment layers, Camera Raw, CMYK prepress, huge PSB files and agency PSD standard",
    ),
    interopSummary: t(".abr 브러시·PSD 레이어 양방향 호환", ".abr brush import and bidirectional PSD compatibility"),
  },
  {
    id: "ibis-medibang",
    name: "ibisPaint / MediBang",
    shortName: "ibis · MediBang",
    engineSummary: t("모바일·태블릿 최적화 GPU 래스터 + 클라우드 만화 툴", "Mobile/tablet-tuned GPU raster & cloud manga toolkit"),
    platforms: t("iOS · Android · Windows · macOS (기능 차등)", "iOS, Android, Windows & macOS (feature split)"),
    pricing: t("무료(광고·시간 제한) + Prime/Pro 멤버십 구독", "Freemium (ads/limits) plus Prime/Pro memberships"),
    standoutStrength: t(
      "스마트폰·보급형 태블릿에서도 가벼운 터치 드로잉, 손가락 보정, 풍부한 무료 톤·소재와 타임랩스 공유",
      "Lightweight touch drawing on phones & entry tablets, finger smoothing, free manga tones and timelapse sharing",
    ),
    interopSummary: t("PSD/PNG 출력 원고 연동 · 클라우드 소재 대체", "PSD/PNG manuscript handoff into ToonStudio"),
  },
];

export const DRAWING_TOOL_PRESETS: readonly {
  readonly id: DrawingPresetId;
  readonly label: BilingualText;
  readonly competitors: readonly Exclude<DrawingToolId, "toonstudio">[];
}[] = [
  {
    id: "all",
    label: t("전체 8종", "All 8 tools"),
    competitors: ["csp", "krita", "magma", "procreate", "rebelle7", "photoshop", "ibis-medibang"],
  },
  {
    id: "core-trio",
    label: t("핵심 3종 집중 (CSP · Krita · Magma)", "Core 3 focus (CSP, Krita & Magma)"),
    competitors: ["csp", "krita", "magma"],
  },
  {
    id: "manga-pro",
    label: t("만화·웹툰 실무 (CSP · Procreate · ibis/MediBang)", "Manga & webtoon (CSP, Procreate & ibis/MediBang)"),
    competitors: ["csp", "procreate", "ibis-medibang"],
  },
  {
    id: "paint-retouch",
    label: t("자연매체·리터칭 (Rebelle 7 · Krita · Photoshop)", "Natural media & retouch (Rebelle 7, Krita & Photoshop)"),
    competitors: ["rebelle7", "krita", "photoshop"],
  },
];

export const DRAWING_SUPPORT_STATUS_META: Readonly<
  Record<DrawingSupportStatus, { readonly label: BilingualText; readonly tone: "good" | "warn" | "cool" | "neutral" }>
> = {
  supported: { label: t("지원", "Supported"), tone: "good" },
  partial: { label: t("부분 지원", "Partial"), tone: "warn" },
  plugin: { label: t("플러그인·외부", "Plugin / External"), tone: "cool" },
  unsupported: { label: t("미지원", "Not supported"), tone: "neutral" },
};

export const COMPETITOR_ADVANTAGES: readonly CompetitorAdvantageNote[] = [
  {
    toolId: "csp",
    advantageTitle: t("10년 축적 ASSETS 에셋 스토어와 주간 연재 안정성", "Decade-old ASSETS store & weekly serialization maturity"),
    detail: t(
      "수만 종의 커뮤니티 .sut 브러시·3D 소품·톤 소재, 네이티브 C++ 타블렛 드라이버 안정성, EX 다중 페이지 관리와 LT 선화 추출은 현업 장편 연재에서 가장 오래 검증된 강점입니다.",
      "Tens of thousands of community .sut brushes, 3D props and tones, rock-solid native tablet drivers, EX multi-page management and LT extraction remain battle-tested in weekly serialization.",
    ),
  },
  {
    toolId: "krita",
    advantageTitle: t("네이티브 C++/Python 플러그인 생태계와 Linux·대용량 RAM 활용", "Mature native C++/Python plugins & Linux/high-RAM headroom"),
    detail: t(
      "G'MIC-Qt 수백 종 필터, Python 스크립트 확장, 10종 이상 전문 브러시 엔진, 완전 오프라인 GPL-3.0 데스크톱 바이너리와 대용량 시스템 메모리 직접 활용은 브라우저 샌드박스가 넘기 어려운 네이티브 우위입니다.",
      "Hundreds of G'MIC-Qt filters, Python scripting, 10+ brush engines, fully offline GPL-3.0 binaries and direct multi-gigabyte system RAM access give Krita strong native desktop depth.",
    ),
  },
  {
    toolId: "magma",
    advantageTitle: t("최대 30인+ 즉시 합류 드로잉 잼 룸과 멀티플레이어 성숙도", "30+ user instant ArtJam rooms & live co-drawing maturity"),
    detail: t(
      "별도 프로젝트 설정 없이 초대 링크 하나로 수십 명이 동시에 낙서·합작하는 ArtJam 문화, 가벼운 저지연 멀티 커서 동기화, 커뮤니티 잼 피드는 실시간 드로잉 잼 영역에서 가장 성숙합니다.",
      "Instant invite-link ArtJams hosting dozens of artists simultaneously, lean low-latency stroke broadcast and social jam feeds make Magma the proven leader for large co-drawing jams.",
    ),
  },
  {
    toolId: "procreate",
    advantageTitle: t("iPad Metal 120Hz 필기감과 최소 크롬 제스처 완성도", "iPad Metal 120Hz pen feel & minimal-chrome gestures"),
    detail: t(
      "Apple Pencil 호버·배럴 롤·기울기를 단일 하드웨어(iPadOS Metal)에 끝까지 맞춘 필기 응답성과 직관적 멀티터치 제스처는 휴대 일러스트 작업에서 여전히 독보적입니다.",
      "Hardware-tuned Apple Pencil latency, barrel roll, tilt and uncluttered multi-touch gestures on iPadOS Metal remain unmatched for portable illustration.",
    ),
  },
  {
    toolId: "rebelle7",
    advantageTitle: t("데스크톱 GPU 기반 실사 유체 수채·유화·종이 물성", "Desktop GPU physical watercolor, oil & paper realism"),
    detail: t(
      "실시간 중력 기울기 물 번짐, 종이 섬유질 흡수·건조, 두터운 유화 임파스토, 금박·메탈릭 반사와 NanoPixel 초해상도 출력은 전통 회화 시뮬레이션 전용 도구로서 최상위입니다.",
      "Real-time tilted-canvas gravity diffusion, paper fiber capillary drying, thick impasto oil, metallic leaf and NanoPixel upscaling place Rebelle 7 at the top of traditional-media simulation.",
    ),
  },
  {
    toolId: "photoshop",
    advantageTitle: t("CMYK 출판 분판 · 16/32-bit 색보정 · 대용량 PSB 표준", "CMYK print prepress, 16/32-bit grading & huge PSB standard"),
    detail: t(
      "인쇄소 ICC/CMYK 분판, Camera Raw, 수 GB PSB 포토배싱, 상업 에이전시 납품용 PSD 호환성과 방대한 서드파티 플러그인은 종합 래스터 편집의 기준점입니다.",
      "Press-ready CMYK/ICC separation, Camera Raw, multi-gigabyte PSB compositing and agency-standard PSD compatibility remain the benchmark for finishing and print.",
    ),
  },
  {
    toolId: "ibis-medibang",
    advantageTitle: t("스마트폰·보급형 태블릿 최적화와 낮은 입문 장벽", "Phone & entry-tablet ergonomics with low entry friction"),
    detail: t(
      "저사양 모바일 기기에서도 가볍게 돌아가는 터치 캔버스, 손가락 보정, 즉석 타임랩스 공유와 방대한 무료 만화 톤·말풍선 템플릿은 모바일 입문 작가에게 강합니다.",
      "Smooth touch painting on phones and budget tablets, finger stabilization, instant timelapse export and abundant free manga templates make them easy mobile starters.",
    ),
  },
];

export const TOONSTUDIO_HONEST_LIMITATIONS: readonly ToonStudioLimitationNote[] = [
  {
    id: "browser-sandbox-ceiling",
    area: t("브라우저 탭 메모리·드라이버 샌드박스 한계", "Browser tab memory & GPU sandbox ceiling"),
    honestLimit: t(
      "브라우저 탭은 데스크톱 네이티브 앱처럼 32~64GB RAM이나 OS 전용 타블렛 드라이버(Wintab/HID 저수준 후크)에 직접 접근할 수 없습니다. 수 GB급 초대형 PSB 합성이나 4K 실시간 유체 시뮬레이션은 네이티브 앱이 더 여유롭습니다.",
      "Browser tabs cannot claim 32–64 GB of OS RAM or hook low-level Wintab drivers directly; huge multi-GB PSB composites and desktop 4K real-time fluid sims retain more headroom in native apps.",
    ),
    browserWebGpuEdge: t(
      "대신 설치·업데이트·OS 제약 없이 3초 안에 열리고, Wasm64 메모리 거버너와 WebGPU 버퍼 풀·LRU 타일 예산으로 브라우저 한계 안에서 안전하게 작업하도록 설계했습니다.",
      "In exchange, creators enter in 3 seconds on any OS with zero install, protected by a Wasm64 memory governor, WebGPU buffer pooling and LRU tile frame budgets.",
    ),
    repoPaths: [
      "apps/web/src/domains/creator/studio-wasm64-memory-governor.ts",
      "apps/web/src/domains/creator/render/gpu-next/gpu-frame-budget-and-lru-tiles.ts",
    ],
  },
  {
    id: "webgpu-primary-transition",
    area: t("WebGPU 1차 커밋 레인 전면 전환 진행 중", "Primary WebGPU commit lane transition in progress"),
    honestLimit: t(
      "7밴드 KM 분광·유체 수채화·스크린톤·JFA·Lanczos3 WGSL 컴퓨트 셰이더와 CPU 동등 엔진은 구현되어 있으나, 기본 캔버스 커밋 권위는 기기 호환 안전을 위해 fail-visible Canvas2D를 유지하며 단계 전환 중입니다.",
      "7-band KM spectral, fluid watercolor, screentone, JFA and Lanczos3 WGSL compute kernels plus CPU parity paths are implemented, while fail-visible Canvas2D remains the primary commit authority during cross-GPU rollout.",
    ),
    browserWebGpuEdge: t(
      "WebGPU 미지원 브라우저나 구형 GPU에서도 화면이 깨지지 않고 동일한 수학 모델의 CPU/WASM 폴백으로 원고 작업을 이어갈 수 있습니다.",
      "Even on browsers without WebGPU or older GPUs, strokes and filters fall back deterministically to equivalent CPU/WASM math without corrupting manuscripts.",
    ),
    repoPaths: [
      "docs/engines/renderer-roles.md",
      "apps/web/src/domains/creator/render/studio-webgpu-km7-compute-wgsl.ts",
    ],
  },
  {
    id: "ecosystem-and-jam-scale",
    area: t("서드파티 마켓 규모 & 30인+ 초대형 드로잉 잼 부하 실증", "Third-party store scale & 30+ artist jam load validation"),
    honestLimit: t(
      "CSP ASSETS의 10년치 브러시 수량이나 Magma의 30인+ 대규모 ArtJam 장기 운영 트랙레코드는 아직 따라가는 단계입니다. Yjs CRDT + Durable Objects 동시 편집은 대규모 잼 부하 실증이 계속 필요합니다.",
      "ToonStudio does not yet match CSP ASSETS's 10-year catalog size or Magma's track record for 30+ user ArtJams; Yjs CRDT + Durable Objects sessions are still undergoing large-room load validation.",
    ),
    browserWebGpuEdge: t(
      ".abr · .sut · .kpp · .brushset · PSD 호환 파서로 기존 자산을 그대로 가져오고, 웹툰 2~6인 분업(레이어 소유권·컷 리스·AD 검수·Rights BOM)에 맞춘 협업 흐름을 단일 캔버스에 결합했습니다.",
      "ToonStudio bridges existing assets via .abr/.sut/.kpp/.brushset/PSD parsers and focuses collaboration directly on 2–6 person webtoon workflows (layer ownership, cut leases, AD redlines and Rights BOM).",
    ),
    repoPaths: [
      "apps/web/src/domains/creator/live/studio-magma-collaboration.ts",
      "packages/studio-format-gateway/src/csp-sut.ts",
      "packages/studio-format-gateway/src/kpp.ts",
    ],
  },
];
