/**
 * `/compare/studio` 5대 심층 도표 비교 정본 데이터 (Magma Studio 포함 8종 × 42개 기능 항목).
 *
 * 정직·투명 비교 원칙 (기준일 2026-11):
 * - 허위 FPS, 미실측 속도 배수, 가공 설문 비율, 추정 점수를 쓰지 않는다.
 * - Magma Studio(브라우저 실시간 멀티유저 드로잉·크레용/건식 질감), Rebelle 7(물리 수채·유화),
 *   Clip Studio Paint(웹툰 잉킹·3D 데생인형), Procreate(iPad Apple Pencil),
 *   Photoshop(색보정·합성·C2PA), Blender(풀 3D DCC), ibisPaint(모바일 접근성)의 강점을
 *   `native-strength`로 숨기지 않고 표기한다.
 * - ToonStudio는 `current`(현재 구현) / `partial`(확장·고도화 중) / `target`(향후 목표)로 구분하며,
 *   모든 행에 실제 저장소 근거 파일(`evidencePath`)을 연결한다.
 */

import type { BenchmarkStatus, BilingualText } from "./competitor-benchmark-data";

export type DeepCompareToolId =
  | "toonstudio" | "magma" | "csp" | "procreate"
  | "photoshop" | "rebelle7" | "blender" | "ibispaint";

export type DeepCompareCompetitorId = Exclude<DeepCompareToolId, "toonstudio">;
export type DeepCompareDomainId = "brushes" | "filters" | "drawing" | "collab" | "studio3d";
export type DeepCompareFilterMode = "all" | "toonstudio-lead" | "rival-strength" | "expanding";

export interface DeepCompareToolProfile {
  readonly id: DeepCompareToolId;
  readonly name: string;
  readonly shortName: string;
  readonly tagline: BilingualText;
  readonly billingHint: BilingualText;
  readonly isPinnedBaseline?: boolean;
}

export interface DeepCompareCell {
  readonly status: BenchmarkStatus;
  readonly summary: BilingualText;
}

export interface DeepCompareRow {
  readonly id: string;
  readonly title: BilingualText;
  readonly toonstudioSpec: BilingualText;
  readonly evidencePath: string;
  readonly cells: Readonly<Record<DeepCompareToolId, DeepCompareCell>>;
}

export interface DeepCompareDomain {
  readonly id: DeepCompareDomainId;
  readonly order: number;
  readonly shortLabel: BilingualText;
  readonly title: BilingualText;
  readonly subtitle: BilingualText;
  readonly candidTakeaway: BilingualText;
  readonly rows: readonly DeepCompareRow[];
}

export interface DeepCompareStatusVisual {
  readonly status: BenchmarkStatus;
  readonly symbol: string;
  readonly label: BilingualText;
  readonly shortLabel: BilingualText;
  readonly cellClass: string;
  readonly pillClass: string;
  readonly oklchAccent: string;
}

export interface DeepCompareDomainSummary {
  readonly totalRows: number;
  readonly currentCount: number;
  readonly partialCount: number;
  readonly targetCount: number;
  readonly expandingCount: number;
  readonly competitorStrengthRowCount: number;
  readonly competitorStrengthCellCount: number;
}

export interface DeepCompareColumnPreset {
  readonly id: "all8" | "browser-collab" | "webtoon-3d-core";
  readonly label: BilingualText;
  readonly tools: readonly DeepCompareToolId[];
}

const bi = (ko: string, en: string): BilingualText => ({ ko, en });
const c = (status: BenchmarkStatus, ko: string, en: string): DeepCompareCell => ({ status, summary: bi(ko, en) });
const row = (
  id: string,
  title: readonly [string, string],
  spec: readonly [string, string],
  evidencePath: string,
  cells: Readonly<Record<DeepCompareToolId, DeepCompareCell>>,
): DeepCompareRow => ({
  id,
  title: bi(title[0], title[1]),
  toonstudioSpec: bi(spec[0], spec[1]),
  evidencePath,
  cells,
});

/** 탈-바이올렛 OKLCH 시맨틱 상태 메타 (hue 270~320° 완전 배제, 원시 hex/rgb/hsl 0건). */
export const DEEP_COMPARE_STATUS_META: Readonly<Record<BenchmarkStatus, DeepCompareStatusVisual>> = {
  current: { status: "current", symbol: "●", label: bi("현재 구현", "Current"), shortLabel: bi("구현", "Live"), cellClass: "ts-hm-jade", pillClass: "ts-status-good", oklchAccent: "oklch(0.58 0.15 158)" },
  partial: { status: "partial", symbol: "◐", label: bi("확장·고도화 중", "Expanding"), shortLabel: bi("확장", "Part"), cellClass: "ts-hm-amber", pillClass: "ts-status-warn", oklchAccent: "oklch(0.66 0.14 78)" },
  target: { status: "target", symbol: "◎", label: bi("향후 목표", "Target"), shortLabel: bi("목표", "Goal"), cellClass: "ts-hm-amber", pillClass: "ts-status-cool", oklchAccent: "oklch(0.62 0.13 205)" },
  "native-strength": { status: "native-strength", symbol: "★", label: bi("타사 강점", "Rival Strength"), shortLabel: bi("강점", "Lead"), cellClass: "ts-hm-cobalt", pillClass: "ts-status-cool", oklchAccent: "oklch(0.56 0.14 232)" },
  limited: { status: "limited", symbol: "△", label: bi("제한·외부연동", "Limited"), shortLabel: bi("제한", "Lim"), cellClass: "ts-hm-terracotta", pillClass: "ts-status-neutral", oklchAccent: "oklch(0.58 0.15 36)" },
  none: { status: "none", symbol: "—", label: bi("미지원", "Not Built-in"), shortLabel: bi("없음", "None"), cellClass: "ts-hm-sumi", pillClass: "ts-status-muted", oklchAccent: "oklch(0.54 0.014 72)" },
};

const BASELINE_TOOL: DeepCompareToolProfile = {
  id: "toonstudio", name: "ToonStudio", shortName: "ToonStudio",
  tagline: bi("브라우저 네이티브 웹툰 OS", "Browser-native webtoon OS"),
  billingHint: bi("공개 베타 ₩0", "KRW 0 open beta"), isPinnedBaseline: true,
};

export const DEEP_COMPARE_TOOLS: readonly DeepCompareToolProfile[] = [
  BASELINE_TOOL,
  { id: "magma", name: "Magma Studio", shortName: "Magma", tagline: bi("브라우저 실시간 협업 드로잉", "Live multi-user web drawing"), billingHint: bi("Spark 무료 · Blaze·Fusion", "Free Spark · Blaze and Fusion") },
  { id: "csp", name: "Clip Studio Paint", shortName: "CSP", tagline: bi("만화·웹툰 잉킹 & 3D 인형 표준", "Manga ink & 3D figure standard"), billingHint: bi("PRO/EX 구독·PC 영구", "PRO/EX sub / PC perpetual") },
  { id: "procreate", name: "Procreate", shortName: "Procreate", tagline: bi("iPad Apple Pencil 브러시 입력", "Apple Pencil brush input on iPad"), billingHint: bi("iPadOS 일시불", "iPadOS one-time") },
  { id: "photoshop", name: "Photoshop", shortName: "Photoshop", tagline: bi("래스터 합성·색보정·출판 표준", "Compositing, grading & print"), billingHint: bi("Creative Cloud 구독", "Creative Cloud sub") },
  { id: "rebelle7", name: "Rebelle 7", shortName: "Rebelle 7", tagline: bi("물리 유체 수채·임파스토 최강", "Physical watercolor & oil leader"), billingHint: bi("데스크톱 영구 라이선스", "Desktop perpetual") },
  { id: "blender", name: "Blender", shortName: "Blender", tagline: bi("오픈소스 풀 3D DCC · GP", "Open-source full 3D DCC"), billingHint: bi("GNU GPL 완전 무료", "GNU GPL 100% free") },
  { id: "ibispaint", name: "ibisPaint", shortName: "ibisPaint", tagline: bi("모바일 대중 드로잉 & QR 소재", "Mobile drawing & QR brushes"), billingHint: bi("무료(광고) + Prime", "Freemium + Prime") },
];

export const DEEP_COMPARE_COMPETITOR_IDS: readonly DeepCompareCompetitorId[] = [
  "magma", "csp", "procreate", "photoshop", "rebelle7", "blender", "ibispaint",
];

export const DEEP_COMPARE_COLUMN_PRESETS: readonly DeepCompareColumnPreset[] = [
  { id: "all8", label: bi("전체 8종", "All 8 Tools"), tools: ["toonstudio", "magma", "csp", "procreate", "photoshop", "rebelle7", "blender", "ibispaint"] },
  { id: "browser-collab", label: bi("웹·협업 집중 (3종)", "Web & Collab (3)"), tools: ["toonstudio", "magma", "csp"] },
  { id: "webtoon-3d-core", label: bi("웹툰·3D 핵심 (4종)", "Webtoon & 3D (4)"), tools: ["toonstudio", "csp", "procreate", "blender"] },
];

const BRUSHES_DOMAIN: DeepCompareDomain = {
  id: "brushes",
  order: 1,
  shortLabel: bi("브러시 · 질감", "Brushes & Tactile"),
  title: bi("01 · 브러시 종류 & 시각·청각 질감 (10대 기준)", "01 · Brush Families, Tactile Grain & Audio Foley (10 Criteria)"),
  subtitle: bi(
    "만화 G펜·크레용·연필·갈필 먹붓부터 물리 수채·임파스토·KM7 분광 혼색·스크린톤·벡터 잉크·청각 Foley까지 8종 도구의 강점과 한계를 나란히 대조합니다.",
    "Side-by-side look across 8 tools covering G-pen, crayon, 4B pencil, dry ink, wet watercolor, oil impasto, KM7 spectral mixing, screentone, vector ink and audio foley.",
  ),
  candidTakeaway: bi(
    "Rebelle 7은 수채·임파스토 도구를, CSP는 만화 펜과 벡터 선화를 제공합니다. Magma는 브라우저에서 함께 그리는 기능을 제공합니다. ToonStudio의 비교 근거는 브러시 카탈로그, KM7 계산 코드와 음향 예제입니다.",
    "Rebelle 7 offers watercolor and impasto tools, CSP has comic pens and vector inking, and Magma offers collaborative drawing in the browser. ToonStudio references its brush catalog, KM7 calculation code and audio examples.",
  ),
  rows: [
    row("brush-gpen", ["G펜 만화 잉크", "G-Pen Comic Ink"],
      ["브러시 카탈로그의 G펜·마루펜 프리셋과 필압·테이퍼 처리", "G-Pen and Maru presets in the brush catalog, with pressure and taper handling"],
      "apps/web/src/domains/creator/brush/studio-brush-catalog.ts", {
        toonstudio: c("current", "G펜 프리셋 · 필압과 테이퍼", "G-Pen presets · pressure and taper"), magma: c("partial", "브라우저 잉크 펜 기본 지원", "Solid browser ink pen"),
        csp: c("native-strength", "10년+ 검증 웹툰 G펜 표준", "Decade-tuned G-pen standard"), procreate: c("native-strength", "Apple Pencil 잉킹", "Apple Pencil inking"),
        photoshop: c("partial", "커스텀 팁 의존 · 만화 특화 약함", "Custom tips; less comic-tuned"), rebelle7: c("partial", "전통 딥펜·잉크 닙 질감 우수", "Expressive traditional dip pen"),
        blender: c("partial", "Grease Pencil 3D 공간 펜선", "Grease Pencil 3D ink strokes"), ibispaint: c("native-strength", "모바일 G펜·손떨림 보정 표준", "Mobile G-pen & stabilizer leader"),
      }),
    row("brush-crayon-pastel", ["크레용 / 왁스 파스텔", "Crayon & Wax Pastel"],
      ["종이 요철 밀착 왁스 레지스트·건식 입자 커널을 Rust/WebGPU로 단계 고도화 중", "Paper-tooth wax-resist and dry-grain kernels actively advancing across Rust WASM and WebGPU"],
      "apps/web/src/domains/creator/brush-physics-pro/wet-soak-impasto-wax-resist.ts", {
        toonstudio: c("partial", "왁스 레지스트·종이 요철 고도화 중", "Wax resist & tooth advancing"), magma: c("native-strength", "브라우저 크레용·건식 입자 강점", "Standout browser crayon texture"),
        csp: c("partial", "텍스처 기반 크레용·파스텔 제공", "Textured crayon & pastel tools"), procreate: c("native-strength", "Pencil 기울기 파스텔·초크 탁월", "Fluid tilt pastel & chalk"),
        photoshop: c("partial", "Kyle 텍스처 팩 기반 건식 표현", "Dry media via Kyle tip packs"), rebelle7: c("native-strength", "실물 종이결 파스텔·초크 최강", "Benchmark paper-grain pastel"),
        blender: c("limited", "Grease Pencil 텍스처 스트로크 보조", "Basic textured GP strokes"), ibispaint: c("partial", "크레용 오버레이 브러시 제공", "Crayon texture overlay brushes"),
      }),
    row("brush-4b-pencil", ["4B 연필 / 기울기 셰이딩", "4B Pencil & Tilt Shading"],
      ["PointerEvent tiltX/Y 기울기 음영과 종이 요철 흑연 입자 반응을 브라우저에서 직접 계산", "Computes PointerEvent tiltX/Y shading and graphite grain contact directly in the browser"],
      "apps/web/src/domains/creator/brush/StudioStylusTiltAndMouseSection.tsx", {
        toonstudio: c("current", "기울기 음영·흑연 요철 반응 내장", "Tilt shading & graphite tooth"), magma: c("native-strength", "가벼운 러프 연필·협업 스케치 강점", "Breezy sketch pencil feel"),
        csp: c("native-strength", "리얼 연필·기울기 입자 검증 완료", "Proven Real Pencil & tilt"), procreate: c("native-strength", "Apple Pencil 6B 기울기 셰이딩 정본", "Benchmark 6B Pencil tilt"),
        photoshop: c("partial", "기울기 지원 팁 기반 연필 세트", "Tilt-enabled pencil presets"), rebelle7: c("native-strength", "종이결 밀착 흑연·목탄 시뮬 최강", "Hyper-real graphite & charcoal"),
        blender: c("limited", "3D 뷰포트 스케치 보조 수준", "3D viewport rough sketching"), ibispaint: c("partial", "기울기 지원 모바일 연필 제공", "Mobile tilt pencil presets"),
      }),
    row("brush-dry-ink", ["갈필 먹붓", "Dry-Brush East Asian Ink"],
      ["순수 Rust WASM 갈필·먹물 고갈(depletion)·종이결 침투 커널 및 동양 수묵 프리셋 내장", "Pure Rust WASM dry-bristle ink depletion kernel paired with East Asian calligraphy presets"],
      "crates/studio-wasm64-drawing-core/src/tactile_texture_kernel.rs", {
        toonstudio: c("current", "Rust WASM 갈필·먹물 고갈 커널", "Rust WASM dry-bristle kernel"), magma: c("limited", "텍스처 브러시 보조 · 고갈 물리 없음", "Textured tip; no ink depletion"),
        csp: c("native-strength", "수묵·거친 먹붓 ASSETS 생태계 풍부", "Huge calligraphy ASSETS catalog"), procreate: c("partial", "서예·드라이 텍스처 브러시 지원", "Calligraphy & dry tip presets"),
        photoshop: c("partial", "듀얼 브러시 팁으로 갈필 근사", "Approximated via dual tips"), rebelle7: c("native-strength", "모필 수분 고갈·번짐 물리 정본", "Physical dry-bristle depletion"),
        blender: c("none", "2D 갈필 먹붓 물리 미지원", "No 2D dry-brush ink physics"), ibispaint: c("partial", "수묵 프리셋 다수 · 물리 고갈 없음", "Sumi presets without depletion"),
      }),
    row("brush-wet-watercolor", ["습윤 수채화 (Wet-Edge)", "Wet-Edge Watercolor"],
      ["Wet-Edge 경계 번짐과 WebGPU LBM 수채 커널 구현 · 중력 건조 물리는 고도화 트랙에서 확장 중", "Ships Wet-Edge bloom and WebGPU LBM kernels; full gravity drying physics remains on the active expansion track"],
      "apps/web/src/domains/creator/brush/studio-wet-edge-bloom-v1.ts", {
        toonstudio: c("partial", "Wet-Edge·LBM 구현 · 중력 건조 확장 중", "Wet-Edge/LBM live; gravity WIP"), magma: c("limited", "수채 느낌 혼색 브러시 · 유체 없음", "Watercolor look; no fluid sim"),
        csp: c("partial", "수채 경계 효과 내장 · 중력 유체 아님", "Watercolor border; non-fluid"), procreate: c("partial", "Wet Mix 지원 · 물리 건조 없음", "Wet Mix without drying physics"),
        photoshop: c("limited", "혼색 브러시 중심 · 수채 번짐 미내장", "Mixer Brush; no water diffusion"), rebelle7: c("native-strength", "실시간 중력 번짐·건조 업계 최강", "Gold standard gravity fluid"),
        blender: c("none", "2D 습윤 수채 시뮬레이션 없음", "No 2D wet watercolor sim"), ibispaint: c("partial", "수채 경계 필터·블렌드 브러시", "Edge watercolor & blend tips"),
      }),
    row("brush-impasto-oil", ["임파스토 유화 (노멀 릴리프)", "Impasto Oil & Normal Relief"],
      ["WebGPU/Rust 측사광(Raking Light) 노멀 릴리프 커널 구축 · 두꺼운 유화 질감 표현 고도화 중", "Built WebGPU/Rust raking-light normal-relief kernels; expanding thick-oil brushstroke range"],
      "apps/web/src/domains/creator/imaging-pro/brush-texture-max/impasto-raking-light-wgsl.ts", {
        toonstudio: c("partial", "WGSL 노멀 릴리프 구축 · 질감 고도화 중", "WGSL relief built; refining feel"), magma: c("limited", "유화 브러시 질감 · 3D 릴리프 없음", "Oil brush look; no heightmap"),
        csp: c("partial", "두꺼운 채색 강점 · 높이맵 릴리프 제한", "Thick paint; limited relief map"), procreate: c("partial", "텍스처 임파스토 · 실시간 높이맵 없음", "Textured impasto; no live height"),
        photoshop: c("partial", "Mixer Brush 우수 · 릴리프는 필터 보조", "Mixer Brush; filter-based relief"), rebelle7: c("native-strength", "실시간 유화 높이맵·측사광 최강", "Industry leader in live impasto"),
        blender: c("limited", "3D 스컬프트·범프 맵 별도 공정", "3D sculpt/bump workflow only"), ibispaint: c("none", "노멀 릴리프 유화 미지원", "No normal-relief oil engine"),
      }),
    row("brush-km7-spectral", ["물리 분광 혼색 (KM7)", "Kubelka-Munk 7-Band Spectral Mixing"],
      ["클린룸 자체 설계 7밴드 Kubelka-Munk WGSL SIMD(420–670nm) · 비상업 mixbox 의존 0건", "Clean-room 7-band Kubelka-Munk WGSL SIMD (420-670nm) with zero non-commercial mixbox dependencies"],
      "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts", {
        toonstudio: c("current", "자체 KM7 WGSL SIMD · 비상업 0", "Clean-room KM7 WGSL · 0 non-com"), magma: c("none", "표준 RGB 알파 블렌딩 중심", "Standard RGB alpha blending"),
        csp: c("partial", "지각 혼색(Perceptual Mixing) 지원", "Perceptual color mixing"), procreate: c("none", "sRGB/P3 RGB 채널 혼색 중심", "sRGB/P3 RGB channel mixing"),
        photoshop: c("none", "RGB/CMYK 채널 기반 블렌딩", "RGB/CMYK channel blending"), rebelle7: c("native-strength", "Pigments 물리 분광 혼색 업계 기준", "Benchmark Pigments spectral mix"),
        blender: c("none", "2D 분광 안료 브러시 미내장", "No 2D spectral pigment brush"), ibispaint: c("none", "표준 RGB 블렌딩 기반", "Standard RGB blending"),
      }),
    row("brush-screentone", ["스크린톤 / 패턴", "Screentone & Pattern"],
      ["모아레 억제 GPU 스크린톤 레이어, 톤 긁기 브러시, 글로벌 시그니처 장식 리본 60종 무료 내장", "Anti-moire GPU screentone layers, scrape brushes and 60 free signature decorative ribbons"],
      "apps/web/src/domains/creator/screentone/screentone-moire-guard.ts", {
        toonstudio: c("current", "모아레 억제 GPU 톤 + 긁기 브러시", "Anti-moire GPU tone + scrape"), magma: c("limited", "기본 패턴·텍스처 브러시 수준", "Basic pattern & texture tips"),
        csp: c("native-strength", "망점 톤 레이어·모아레 제어 표준", "Manga halftone layer standard"), procreate: c("partial", "하프톤 필터·패턴 브러시 보조", "Halftone filter & pattern tips"),
        photoshop: c("partial", "패턴·하프톤 필터 수동 구성", "Manual pattern/halftone setup"), rebelle7: c("none", "전통 회화 특화 · 만화 톤 없음", "Traditional media; no comic tone"),
        blender: c("partial", "셰이더 노드 기반 절차적 하프톤", "Shader-node procedural halftone"), ibispaint: c("native-strength", "모바일 망점 스크린톤 레이어 강점", "Strong mobile screentone layers"),
      }),
    row("brush-vector-ink", ["벡터 잉크 브러시", "Vector Ink Brush"],
      ["Shader 벡터 잉크 리본 LOD 테셀레이션과 Skia WebGL2 선폭 재조정 파이프라인 내장", "Shader vector ink ribbon LOD tessellation with Skia WebGL2 post-stroke width editing"],
      "apps/web/src/domains/creator/nextgen-perf-engine/vector-ink-lod-kernel.ts", {
        toonstudio: c("current", "Shader 벡터 리본 LOD · 선폭 조정", "Shader vector ribbon LOD"), magma: c("none", "래스터 캔버스 중심 · 벡터 잉크 없음", "Raster canvas; no vector ink"),
        csp: c("native-strength", "벡터 레이어·교차 지우개 업계 최강", "Vector layer & intersection eraser"), procreate: c("none", "래스터 전용 엔진 · 벡터 선화 없음", "Raster-only; no vector strokes"),
        photoshop: c("limited", "펜 툴 패스 중심 · 만화 벡터 약함", "Pen paths; weak comic vector"), rebelle7: c("none", "래스터 물리 회화 전용", "Raster physical painting only"),
        blender: c("native-strength", "Grease Pencil 3D 벡터 선화 최강", "Grease Pencil 3D vector leader"), ibispaint: c("partial", "모바일 벡터 레이어 기능 지원", "Mobile vector layer support"),
      }),
    row("brush-foley-haptic", ["청각 필기감 Foley & 햅틱", "Tactile Audio Foley & Haptics"],
      ["Web Audio 절차적 종이 사각거림·먹붓 마찰 Foley 합성 및 디바이스 햅틱 피드백 엔진 내장", "Procedural Web Audio graphite/brush paper friction foley paired with tactile haptic feedback"],
      "apps/web/src/domains/creator/vibrant-studio-fx/studio-procedural-foley-audio.ts", {
        toonstudio: c("current", "Web Audio 절차적 Foley + 햅틱 내장", "Procedural Web Audio Foley + haptics"), magma: c("none", "브러시 필기음 Foley·햅틱 미지원", "No brush audio foley or haptics"),
        csp: c("none", "필기음 Foley 합성 미지원", "No procedural pen audio foley"), procreate: c("limited", "Apple Pencil Pro 스퀴즈 햅틱 연동", "Apple Pencil Pro squeeze haptics"),
        photoshop: c("none", "필기음 Foley·브러시 햅틱 없음", "No tactile brush audio/haptics"), rebelle7: c("none", "시각 질감 특화 · 청각 Foley 없음", "Visual focus; no audio foley"),
        blender: c("none", "드로잉 필기음·햅틱 미지원", "No stroke audio or haptics"), ibispaint: c("none", "필기음 Foley 미지원", "No stroke audio foley"),
      }),
  ],
};

export const DEEP_COMPARE_DOMAINS: readonly DeepCompareDomain[] = [
  BRUSHES_DOMAIN,
  {
    id: "filters",
    order: 2,
    shortLabel: bi("필터 · 보정", "Filters & FX"),
    title: bi("02 · 필터 & 비파괴 보정 효과 (8대 기준)", "02 · Filters & Non-Destructive Finishing FX (8 Criteria)"),
    subtitle: bi(
      "광학 블러·리퀴파이·MLS 퍼펫 워프·3D→2D LT 선화 추출·그라데이션 맵·색수차/블룸·3층 리라이트·LMS 색약 프루프까지 8종 도구를 정직하게 비교합니다.",
      "Honest comparison of optical blurs, liquify, MLS puppet warp, 3D-to-2D LT line extraction, gradient maps, bloom/chromatic FX, 3-layer relight and LMS colorblind proofing.",
    ),
    candidTakeaway: bi(
      "16/32-bit 색보정·스마트 필터·LMS 프루프는 Photoshop, EX 3D LT 변환은 CSP, 컴포지터 노드 리라이트는 Blender가 최강입니다. ToonStudio는 무료 필터 183종과 MLS 퍼펫 워프·LMS 프루프를 브라우저에서 바로 제공합니다.",
      "Photoshop leads 16/32-bit grading and Smart Filters, CSP EX leads 3D LT line extraction, and Blender leads compositor relighting. ToonStudio delivers 183 free filters, MLS puppet warp and LMS proofing right in the browser.",
    ),
    rows: [
      row("filter-blur", ["가우시안 / 모션 블러", "Gaussian & Motion Blur"],
        ["183종 무료 기본 필터 정본 내 가우시안·모션·방사형·조리개 보케·틸트시프트 블러 지원", "Gaussian, motion, radial, aperture bokeh and tilt-shift blurs inside 183 free built-in filters"],
        "apps/web/src/domains/creator/studio-advanced-blur-filters.ts", {
          toonstudio: c("current", "183종 무료 필터 내 광학·모션 블러", "Optical & motion blurs in 183 free"), magma: c("partial", "가우시안 등 핵심 블러 필터 제공", "Core Gaussian blur filters"),
          csp: c("native-strength", "가우시안·모션·방사형·스무딩 성숙", "Mature Gaussian, motion & radial"), procreate: c("native-strength", "터치 슬라이드 실시간 블러 UX 탁월", "Fluid gesture-driven live blur"),
          photoshop: c("native-strength", "Blur Gallery·스마트 필터 업계 표준", "Blur Gallery & Smart Filters"), rebelle7: c("partial", "기본 가우시안·모션 블러 제공", "Core Gaussian & motion blur"),
          blender: c("native-strength", "노드 컴포지터·물리 피사계 심도 최강", "Node compositor & physical DoF"), ibispaint: c("native-strength", "모바일 가우시안·렌즈·모션 블러 풍부", "Rich mobile lens & motion blurs"),
        }),
      row("filter-liquify", ["리퀴파이 / 유동화", "Liquify & Fluid Reshape"],
        ["밀기·팽창·수축·조화 보정을 브라우저 캔버스에서 바로 처리하는 유동화 필터 모듈 내장", "In-browser liquify push/bloat/pinch and harmonization filter suite"],
        "apps/web/src/domains/creator/filter/studio-photoshop-liquify-harmonize.ts", {
          toonstudio: c("current", "브라우저 유동화·조화 필터 내장", "In-browser liquify & harmonize"), magma: c("partial", "기본 유동화 변형 도구 제공", "Core liquify push tool"),
          csp: c("native-strength", "다중 레이어 동시 유동화 강력", "Multi-layer simultaneous liquify"), procreate: c("native-strength", "초저지연 터치 리퀴파이 직관적", "Instant touch liquify controls"),
          photoshop: c("native-strength", "얼굴 인식 유동화·메쉬 복원 표준", "Face-Aware Liquify benchmark"), rebelle7: c("partial", "기본 리퀴파이 변형 도구 지원", "Built-in liquify deform tool"),
          blender: c("partial", "스컬프트 Grab·GP 변형 별도 공정", "Sculpt Grab / GP transform"), ibispaint: c("native-strength", "모바일 유동화 펜 접근성 최강", "Fast mobile Liquify Pen"),
        }),
      row("filter-puppet-warp", ["2D 퍼펫 워프 (MLS)", "2D Puppet Warp (MLS)"],
        ["Moving Least Squares(MLS) 관절 핀 기반 2D 퍼펫 워프 엔진으로 포즈·실루엣 미세 보정", "Moving Least Squares (MLS) pin-based 2D puppet warp engine for pose adjustments"],
        "apps/web/src/domains/creator/csp-puppet-warp/puppet-warp-mls-engine.ts", {
          toonstudio: c("current", "MLS 핀 기반 2D 퍼펫 워프 내장", "MLS pin-based 2D puppet warp"), magma: c("none", "자유 변형 위주 · 핀 퍼펫 워프 없음", "Free transform; no puppet pins"),
          csp: c("native-strength", "Ver.4 다중 레이어 퍼펫 변형 강력", "Ver.4 multi-layer Puppet Warp"), procreate: c("limited", "메쉬 워프만 지원 · 관절 핀 없음", "Mesh warp without puppet pins"),
          photoshop: c("native-strength", "스마트 오브젝트 비파괴 퍼펫 표준", "Non-destructive Puppet Warp"), rebelle7: c("none", "자유·원근 변형만 지원", "Free/perspective deform only"),
          blender: c("partial", "2D 리깅·Lattice 모디파이어 활용", "2D rig / Lattice workaround"), ibispaint: c("limited", "메쉬 변형 지원 · 핀 퍼펫 미지원", "Mesh form without puppet pins"),
        }),
      row("filter-lt-extract", ["3D→2D LT 선화 추출", "3D-to-2D LT Line Extraction"],
        ["3D 배경 세트와 사진에서 Sobel+DoG·LT 선화 및 톤 레이어를 분리 추출하는 브리지 내장", "Separates Sobel+DoG and LT lineart plus tone layers from 3D sets and photo sources"],
        "apps/web/src/domains/creator/lt-convert/studio-lt-convert-layer.ts", {
          toonstudio: c("current", "3D·사진 Sobel+DoG/LT 선화 추출", "3D & photo Sobel+DoG/LT extract"), magma: c("none", "3D→2D LT 선화 변환 미지원", "No 3D-to-2D LT conversion"),
          csp: c("native-strength", "EX 3D LT 변환 웹툰 업계 표준", "EX 3D LT webtoon standard"), procreate: c("none", "3D LT 선화 추출 미지원", "No 3D LT line extraction"),
          photoshop: c("limited", "윤곽선 필터·액션 수동 조합 필요", "Manual Find Edges / actions"), rebelle7: c("none", "2D 회화 전용 · LT 변환 없음", "2D painting only; no LT"),
          blender: c("native-strength", "Line Art 모디파이어·Freestyle 최강", "Line Art modifier & Freestyle"), ibispaint: c("partial", "사진 선화 추출 강점 · 3D LT 제한", "Photo line extract; no 3D LT"),
        }),
      row("filter-gradient-map", ["그라데이션 맵 / 색온도", "Gradient Map & Color Temperature"],
        ["RGBA16F 비파괴 색보정·그라데이션 맵 + 포트라/벨비아/리소그래프 36종 마스터 LUT 무료 내장", "Non-destructive RGBA16F gradient maps plus 36 free film/risograph master LUT kernels"],
        "apps/web/src/domains/creator/filter/studio-photoshop-adjustment-presets-v2.ts", {
          toonstudio: c("current", "RGBA16F 그라데이션 맵 + 36종 LUT", "RGBA16F gradient map + 36 LUTs"), magma: c("partial", "곡선·그라데이션 맵 조정 레이어 지원", "Curves & gradient map layers"),
          csp: c("native-strength", "보정 레이어·ASSETS 그라데이션 풍부", "Adjustment layers + ASSETS sets"), procreate: c("partial", "그라데이션 맵 지원 · 파괴 적용 중심", "Gradient maps (destructive)"),
          photoshop: c("native-strength", "16/32-bit 조정 레이어·Camera Raw 최강", "16/32-bit layers & Camera Raw"), rebelle7: c("partial", "기본 컬러 밸런스·커브 보정 지원", "Core color balance & curves"),
          blender: c("native-strength", "AgX/ACES 컴포지터 색보정 표준", "AgX/ACES compositor grading"), ibispaint: c("partial", "그라데이션 맵 필터 · 비파괴 스택 제한", "Gradient map filter; few stacks"),
        }),
      row("filter-chromatic-bloom", ["색수차 / 블룸 / 글로우", "Chromatic Aberration, Bloom & Glow"],
        ["아나모픽 렌즈 플레어·볼류메트릭 갓레이·색수차·블룸 마감 필터를 183종 무료 세트에 통합", "Bundles chromatic aberration, bloom, anamorphic flare and volumetric god rays in 183 free filters"],
        "apps/web/src/domains/creator/filter/studio-filter-catalog.ts", {
          toonstudio: c("current", "색수차·블룸·플레어·갓레이 무료 내장", "Chromatic, bloom, flare & rays"), magma: c("limited", "기본 레이어 효과·블룸 일부 지원", "Basic layer effects & glow"),
          csp: c("partial", "색수차 필터·발광 닷지 조합 활용", "Chromatic filter + Glow Dodge"), procreate: c("native-strength", "실시간 색수차·블룸 터치 마감 탁월", "Live touch chromatic & bloom"),
          photoshop: c("native-strength", "스마트 필터·광학 글로우 정밀 제어", "Smart Filter optical precision"), rebelle7: c("limited", "회화 중심 · 광학 이펙트 소수", "Painterly focus; few optical FX"),
          blender: c("native-strength", "Glare·Lens Distortion 물리 노드 최강", "Physical Glare & Lens nodes"), ibispaint: c("native-strength", "애니 마감 글로우·색수차 프리셋 풍부", "Rich anime glow & aberration FX"),
        }),
      row("filter-relight-3layer", ["비파괴 3층 리라이트", "Non-Destructive 3-Layer Relight"],
        ["키·필·림 3층 비파괴 그래프 리라이트 엔진 구축 · 실사 광원 정합 고도화 중", "Built 3-layer key/fill/rim non-destructive relight graph; advancing physical light fidelity"],
        "apps/web/src/domains/creator/ai-creative-suites/firefly-graph-relight-engine.ts", {
          toonstudio: c("partial", "3층 그래프 리라이트 구축 · 고도화 중", "3-layer relight graph advancing"), magma: c("none", "2D 레이어 블렌딩 중심 · 리라이트 없음", "2D blend modes; no 3-layer relight"),
          csp: c("limited", "3D 광원 조정 가능 · 2D 자동 3층 없음", "3D lights only; manual 2D relight"), procreate: c("none", "블렌드 모드 수동 채색 중심", "Manual blend-mode shading"),
          photoshop: c("partial", "조명 효과·Neural 필터 부분 지원", "Lighting Effects / Neural filters"), rebelle7: c("partial", "임파스토 표면 광원 각도 조절 특화", "Impasto surface light direction"),
          blender: c("native-strength", "3D 3점 광원·컴포지터 리라이트 최강", "3D lighting & compositor relight"), ibispaint: c("none", "비파괴 3층 리라이트 미지원", "No non-destructive 3-layer relight"),
        }),
      row("filter-colorblind-lms", ["색약 (LMS) 소프트프루프", "Colorblind LMS Soft-Proofing"],
        ["OKLCH·LMS 행렬 기반 적·녹·청색약 실시간 소프트프루프 및 대비 검증 내장", "Built-in OKLCH/LMS protanopia, deuteranopia and tritanopia real-time soft-proofing"],
        "apps/web/src/domains/creator/color/oklch-colorblind-softproof.ts", {
          toonstudio: c("current", "OKLCH/LMS 3종 색약 실시간 프루프", "Live LMS 3-mode soft-proof"), magma: c("none", "LMS 색약 시뮬레이션 미지원", "No LMS colorblind soft-proof"),
          csp: c("limited", "ICC 컬러 프루프 지원 · LMS 색약 없음", "ICC proofing; no LMS simulation"), procreate: c("none", "색약 소프트프루프 미내장", "No built-in colorblind proof"),
          photoshop: c("native-strength", "적록색약 교정·ICC 소프트프루프 표준", "Colorblind & ICC proof standard"), rebelle7: c("none", "색약 소프트프루프 미지원", "No colorblind soft-proofing"),
          blender: c("limited", "OCIO 커스텀 뷰 변환 수동 구성", "Manual OCIO custom view setup"), ibispaint: c("none", "색약 소프트프루프 미지원", "No LMS soft-proofing"),
        }),
    ],
  },
  {
    id: "drawing",
    order: 3,
    shortLabel: bi("드로잉 전반", "Core Drawing"),
    title: bi("03 · 드로잉 핵심 기능 전반 (8대 기준)", "03 · Core Drawing & Webtoon Workflow Capabilities (8 Criteria)"),
    subtitle: bi(
      "무한 세로 캔버스, 9:16 모바일 독자 시뮬레이터, 대사·감정 연출 코치, 얼굴 회피 말풍선, 투시/대칭 자, OPFS 로컬 저장, 1만 BVH, 프로 디지타이저를 대조합니다.",
      "Compares vertical webtoon canvas, 9:16 reader simulation, dialogue emotion coach, face-avoiding balloons, rulers, OPFS local storage, 10K BVH instancing and pro digitizers.",
    ),
    candidTakeaway: bi(
      "OS 네이티브 디지타이저 드라이버는 CSP·Procreate·Photoshop, 10만+ 씬 인스턴싱은 Blender가 강점입니다. ToonStudio는 세로 웹툰 호흡·비파괴 연출 코치·얼굴 회피 식자·브라우저 OPFS 로컬 저장을 한 공간에 통합했습니다.",
      "CSP, Procreate and Photoshop lead native OS stylus drivers while Blender leads massive scene instancing. ToonStudio unifies vertical webtoon rhythm, artist-approved directing coaches, face-avoiding lettering and offline OPFS storage.",
    ),
    rows: [
      row("draw-infinite-vertical", ["무한 세로 웹툰 캔버스", "Infinite Vertical Webtoon Canvas"],
        ["세로 스크롤 컷 리듬 분석·안전선·일괄 플랫폼 규격 슬라이스까지 네이티브 설계", "Native vertical-scroll panel rhythm analysis, safe guides and batch platform slicing"],
        "apps/web/src/domains/creator/webtoon-panel-rhythm-studio/panel-rhythm-engine.ts", {
          toonstudio: c("current", "세로 컷 리듬·안전선·규격 슬라이스", "Scroll rhythm, guides & slicing"), magma: c("partial", "대형 캔버스 지원 · 웹툰 컷 도구 약함", "Large canvas; minimal comic tools"),
          csp: c("native-strength", "EX 세로 웹툰 페이지 관리 업계 표준", "EX vertical webtoon benchmark"), procreate: c("limited", "단일 캔버스 크기·레이어 수 제약", "Single-canvas size & layer caps"),
          photoshop: c("limited", "대지·슬라이스 액션 수동 구성", "Manual artboards & slice scripts"), rebelle7: c("none", "단일 회화 캔버스 전용", "Single painterly canvas only"),
          blender: c("none", "3D 뷰포트 중심 · 세로 웹툰 아님", "3D viewport; not scroll canvas"), ibispaint: c("partial", "모바일 세로 긴 캔버스·컷 분할 지원", "Long canvas & panel divider"),
        }),
      row("draw-mobile-reader-sim", ["9:16 모바일 독자 시뮬레이터", "9:16 Mobile Reader Simulator"],
        ["작업 캔버스 옆에서 9:16 스마트폰 실제 독자 스크롤·글자 가독 크기를 즉시 시뮬레이션", "Simulates 9:16 smartphone scroll pacing and lettering legibility beside the live canvas"],
        "apps/web/src/domains/creator/mobile-reader-preview-sim/mobile-reader-sim-engine.ts", {
          toonstudio: c("current", "실시간 9:16 폰 화면·스크롤 호흡 시뮬", "Live 9:16 phone scroll simulator"), magma: c("none", "모바일 독자 시뮬레이터 미지원", "No mobile reader simulator"),
          csp: c("native-strength", "스마트폰 표시 영역 미리보기 검증 완료", "Proven mobile display area view"), procreate: c("none", "모바일 스크롤 독자 프리뷰 없음", "No scroll reader preview"),
          photoshop: c("none", "웹툰 9:16 스크롤 미리보기 없음", "No 9:16 webtoon reader preview"), rebelle7: c("none", "독자 프리뷰 미지원", "No reader simulator"),
          blender: c("none", "모바일 웹툰 독자 뷰 없음", "No mobile comic reader view"), ibispaint: c("limited", "비율 가이드 수준 · 독자 시뮬 없음", "Aspect guides; no reader sim"),
        }),
      row("draw-dialogue-emotion-assist", ["대사·감정 비파괴 연출 어시스턴트", "Non-Destructive Dialogue & Emotion Assistant"],
        ["대사 감정선을 읽어 표정·포즈·분위기 안을 미리보기로 제안하고 작가 승인 시에만 비파괴 적용", "Reads dialogue emotion to propose expression and staging previews applied only after artist approval"],
        "apps/web/src/domains/creator/char-expression-pose-advisor/char-expression-pose-engine.ts", {
          toonstudio: c("current", "대사 감정→표정·구도 승인형 비파괴 제안", "Artist-approved emotion proposals"), magma: c("none", "웹툰 연출 어시스턴트 미내장", "No comic directing assistant"),
          csp: c("none", "3D 포즈·표정 수동 조작 중심", "Manual 3D pose/expression"), procreate: c("none", "단독 일러스트 수동 작화 중심", "Manual solo illustration"),
          photoshop: c("none", "웹툰 대사 연동 연출 코치 없음", "No dialogue directing coach"), rebelle7: c("none", "전통 회화 전용", "Traditional painting only"),
          blender: c("none", "웹툰 대사 연동 코치 미내장", "No dialogue directing coach"), ibispaint: c("none", "연출 어시스턴트 없음", "No directing assistant"),
        }),
      row("draw-balloon-sfx", ["얼굴 회피 말풍선 / 한글 SFX", "Face-Avoiding Balloons & Korean SFX"],
        ["캐릭터 얼굴 보호 영역을 자동 회피하는 말풍선 배치 제안 + 한글 효과음·다국어 번역 메모리", "Face-safe balloon placement proposals combined with Korean SFX styling and localization memory"],
        "apps/web/src/domains/creator/balloon-sfx-placement-proposer/balloon-sfx-placement-engine.ts", {
          toonstudio: c("current", "얼굴 자동 회피 말풍선 + 한글 SFX·번역", "Face-safe balloons + Korean SFX"), magma: c("none", "기본 텍스트 입력만 지원", "Basic text tool only"),
          csp: c("native-strength", "말풍선·꼬리·스토리 에디터 완성도 최강", "Top balloon & story editor tools"), procreate: c("limited", "기본 텍스트 · 식자 전용 도구 없음", "Basic text; no comic lettering"),
          photoshop: c("partial", "정밀 타이포그래피 · 말풍선은 수동", "Pro typography; manual balloons"), rebelle7: c("none", "텍스트·말풍선 도구 미지원", "No text or balloon tools"),
          blender: c("none", "웹툰 식자 전용 도구 없음", "No webtoon lettering tools"), ibispaint: c("partial", "기본 말풍선·폰트 지원 · 자동 회피 없음", "Basic balloons; no face avoid"),
        }),
      row("draw-rulers", ["퍼스펙티브 / 대칭 자", "Perspective & Symmetry Rulers"],
        ["1~3점·어안 투시 자, 대칭·방사형·집중선 가이드 스냅을 브라우저 캔버스에 내장", "Built-in 1-to-3-point and fisheye perspective rulers plus symmetry and speedline snapping"],
        "apps/web/src/domains/creator/rulers-pro/studio-perspective-symmetry-ruler-snap.ts", {
          toonstudio: c("current", "1~3점·어안 투시 + 대칭·집중선 스냅", "1-3pt/fisheye + symmetry snap"), magma: c("partial", "대칭·기본 도형 가이드 지원", "Symmetry & basic shape guides"),
          csp: c("native-strength", "퍼스펙티브·특수 자·집중선 업계 표준", "Perspective & special ruler king"), procreate: c("native-strength", "QuickShape·투시·대칭 가이드 직관적", "Intuitive QuickShape & guides"),
          photoshop: c("partial", "대칭 페인팅·소실점 필터 지원", "Symmetry paint & Vanishing Point"), rebelle7: c("partial", "기본 직선·원근 가이드 지원", "Core straight & perspective guide"),
          blender: c("partial", "3D 그리드·미러 모디파이어 강력", "3D grids & Mirror modifiers"), ibispaint: c("native-strength", "방사형·대칭·배열 자 모바일 최강", "Top mobile symmetry/array rulers"),
        }),
      row("draw-opfs-sqlite", ["오프라인 로컬 저장 (OPFS/SQLite)", "Offline Local Storage (OPFS/SQLite)"],
        ["브라우저 Origin Private File System(OPFS) + SQLite WASM 저널로 오프라인 작업·충돌 복구 보장", "Origin Private File System (OPFS) + SQLite WASM journal ensures crash-safe offline work"],
        "apps/web/src/domains/creator/studio-opfs-filesystem.ts", {
          toonstudio: c("current", "SQLite WASM + OPFS 오프라인 정본", "SQLite WASM + OPFS local store"), magma: c("limited", "클라우드 세션 중심 · 오프라인 정본 제한", "Cloud-first; limited offline store"),
          csp: c("native-strength", "네이티브 로컬 .clip 저장·자동 복구", "Native local .clip + auto-recover"), procreate: c("native-strength", "iPad 로컬 고속 자동 저장 검증", "Proven instant local iPad saves"),
          photoshop: c("native-strength", "로컬 .psd/.psb + 클라우드 문서 병행", "Local .psd/.psb + Cloud Docs"), rebelle7: c("native-strength", "로컬 .reb 데스크톱 고속 저장", "Fast desktop local .reb saves"),
          blender: c("native-strength", "로컬 .blend + 자동 백업 검증 완료", "Local .blend + autosave recovery"), ibispaint: c("partial", "기기 로컬 저장 + 클라우드 백업", "Device storage + cloud backup"),
        }),
      row("draw-10k-bvh-instancing", ["1만 오브젝트 GPU 인스턴싱 · BVH", "10K-Object GPU Instancing & Flat-BVH"],
        ["WebGPU 단일 드로우 콜 인스턴싱·Flat-BVH 공간 분할 엔진 구현 완료 · 브라우저 실전 부하 확대 중", "Single-draw-call WebGPU instancing and Flat-BVH engine shipped; expanding real-browser soak rollout"],
        "apps/web/src/domains/creator/render/webgpu-instanced-bvh/instanced-bvh-spatial-engine.ts", {
          toonstudio: c("partial", "WebGPU 인스턴싱·Flat-BVH 구현 · 확대 중", "WebGPU Flat-BVH built; scaling"), magma: c("none", "2D 래스터 레이어 구조 · BVH 없음", "2D raster layers; no BVH engine"),
          csp: c("limited", "다수 오브젝트·3D 배치 시 CPU 병목", "CPU bottlenecks at high counts"), procreate: c("none", "고정 레이어 한도 · 인스턴싱 아님", "Fixed layer limits; no instancing"),
          photoshop: c("limited", "스마트 오브젝트 복제 · 1만 BVH 아님", "Smart Objects; not 10K GPU BVH"), rebelle7: c("none", "단일 회화 레이어 중심", "Painterly layers; no scene BVH"),
          blender: c("native-strength", "Geometry Nodes 수십만 GPU 인스턴싱", "Geometry Nodes 100K+ instancing"), ibispaint: c("none", "모바일 레이어 기반 · 인스턴싱 없음", "Mobile layers; no GPU instancing"),
        }),
      row("draw-pro-digitizer", ["프로 디지타이저 (와콤/애플펜슬/S펜/HID)", "Pro Digitizers (Wacom / Apple Pencil / S-Pen / HID)"],
        ["PointerEvent 필압·기울기·배럴 회전과 Chromium WebHID 다이얼 매핑 구축 · OS 드라이버 검증 확대 중", "PointerEvent pressure/tilt/twist plus Chromium WebHID dial mapping; expanding OS driver coverage"],
        "apps/web/src/domains/creator/pro-digitizer-hid-engine/pro-digitizer-engine.ts", {
          toonstudio: c("partial", "PointerEvent + WebHID · OS 검증 확대 중", "PointerEvent + WebHID expanding"), magma: c("partial", "브라우저 필압 지원 · WebHID 다이얼 없음", "Browser pressure; no WebHID"),
          csp: c("native-strength", "Wintab·Wacom·Apple Pencil·S펜 전 기기 최강", "Top Wacom, Pencil & S-Pen support"), procreate: c("native-strength", "Apple Pencil Pro 배럴 롤·호버 완벽 통합", "Native Apple Pencil Pro integration"),
          photoshop: c("native-strength", "Wacom·Windows Ink·macOS 업계 표준", "Desktop digitizer gold standard"), rebelle7: c("native-strength", "Wacom Art Pen 배럴 회전·기울기 정밀", "Precision Art Pen tilt & twist"),
          blender: c("partial", "데스크톱 타블렛 지원 · 모바일 펜 없음", "Desktop tablets; no mobile pen"), ibispaint: c("native-strength", "Apple Pencil·S펜·모바일 펜 광범위 지원", "Broad mobile stylus compatibility"),
        }),
    ],
  },
  {
    id: "collab",
    order: 4,
    shortLabel: bi("실시간 협업", "Live Collab"),
    title: bi("04 · 실시간 협업 & 팀 분업 (8대 기준)", "04 · Real-Time Collaboration & Studio Handoff (8 Criteria)"),
    subtitle: bi(
      "브라우저 동시 접속 드로잉(CRDT), 캔버스 좌표 핀 검수, 6단계 바통 결재선, 어시스턴트 인수인계, 시맨틱 컷 비교, 1~60컷 드리프트 붉은펜, 외부 왕복, 권리 BOM·C2PA를 비교합니다.",
      "Compares live browser CRDT drawing, coordinate pin reviews, 6-stage baton sign-off, assistant handoff packs, semantic cut diff, 1-60 cut drift red-pen, round-trips and Rights BOM/C2PA.",
    ),
    candidTakeaway: bi(
      "Magma Studio에는 브라우저 공동 드로잉이 있고 Photoshop은 리뷰 링크와 클라우드 버전 기능을 제공합니다. Blender는 링크 라이브러리를 쓸 수 있습니다. ToonStudio에는 결재·설정집 대조 예제와 출고 권리 점검 기능이 있습니다.",
      "Magma Studio offers shared browser drawing, Photoshop offers review links and cloud versions, and Blender supports linked asset libraries. ToonStudio includes review and model-sheet examples along with export rights checks.",
    ),
    rows: [
      row("collab-crdt-live", ["브라우저 동시 접속 드로잉 (CRDT)", "Live Multi-User Browser Drawing (CRDT)"],
        ["Yjs CRDT + WebRTC P2P 동시 편집과 컴팩션을 구현했고, 대규모 장기 팀 세션 실증을 확대 중", "Ships Yjs CRDT + WebRTC P2P editing and compaction; expanding large-team long-session validation"],
        "apps/web/src/domains/creator/live/studio-live-socket-transport-crdt.ts", {
          toonstudio: c("partial", "Yjs CRDT + WebRTC · 대규모 실증 확대 중", "Yjs + WebRTC; scaling team soak"), magma: c("native-strength", "수십 명 브라우저 실시간 동시 드로잉 최강", "Industry leader in live web drawing"),
          csp: c("limited", "클라우드 팀워크 체크아웃 · 동시 브러시 아님", "File check-out; not live strokes"), procreate: c("none", "단독 iPad 오프라인 앱 · 다중 편집 없음", "Solo iPad app; no live collab"),
          photoshop: c("limited", "순차 클라우드 공동 편집 · 동시 드로잉 제한", "Async cloud edits; limited live"), rebelle7: c("none", "단독 데스크톱 앱 · 협업 미지원", "Single-user desktop workflow"),
          blender: c("limited", "외부 Multi-User 애드온 의존", "Requires third-party sync add-on"), ibispaint: c("none", "실시간 다중 사용자 캔버스 없음", "No multi-user live canvas"),
        }),
      row("collab-pin-review", ["캔버스 좌표 핀 검수", "Canvas Coordinate Pin Review"],
        ["컷 좌표에 핀을 꽂아 수정 요청·리앵커링·상태 필터로 PD·작가 검수를 바로 처리", "Pins review threads directly to cut coordinates with re-anchoring and status filters"],
        "apps/web/src/domains/creator/visual-pin-review-studio/visual-pin-review-engine.ts", {
          toonstudio: c("current", "컷 좌표 핀 고정·리앵커·상태 필터 내장", "Coordinate pins, re-anchor & filter"), magma: c("partial", "실시간 커서·레이어 메모·채팅 피드백", "Live cursors, notes & chat"),
          csp: c("none", "외부 뷰어·메신저 캡처 검수 의존", "Relies on external review tools"), procreate: c("none", "캔버스 좌표 리뷰 핀 미지원", "No canvas coordinate review pins"),
          photoshop: c("native-strength", "웹 공유 링크 핀 코멘트·승인 성숙", "Mature web link pin comments"), rebelle7: c("none", "검수 핀 기능 없음", "No review pin workflow"),
          blender: c("limited", "Grease Pencil 주석 · 웹 핀은 외부 연동", "GP annotations; web pins external"), ibispaint: c("none", "좌표 핀 검수 미지원", "No coordinate pin review"),
        }),
      row("collab-baton-signoff", ["6단계 바통터치 결재선", "6-Stage Baton-Pass Sign-Off Workflow"],
        ["콘티→선화→채색→배경→식자→PD 6단계 웹툰 직무별 승인·반려 바통터치 결재선 내장", "Built-in 6-stage webtoon role sign-off from boards, ink, color, 3D sets, lettering to PD"],
        "apps/web/src/domains/creator/collab-signoff-hub/multi-role-signoff-engine.ts", {
          toonstudio: c("current", "콘티→선화→채색→배경→식자→PD 결재선", "6-stage webtoon role baton flow"), magma: c("partial", "팀 프로젝트 권한·역할 관리 지원", "Team project roles & permissions"),
          csp: c("limited", "페이지 상태 표기 · 직무 결재선 없음", "Page status tags; no sign-off"), procreate: c("none", "팀 결재 워크플로 없음", "No team sign-off workflow"),
          photoshop: c("limited", "공유 리뷰 승인 수준 · 6단계 바통 없음", "Review approval; no 6-stage baton"), rebelle7: c("none", "팀 결재 기능 없음", "No team approval system"),
          blender: c("limited", "Blender Studio Kitsu 등 외부 연동", "External Kitsu/Studio pipeline"), ibispaint: c("none", "팀 결재선 없음", "No team sign-off"),
        }),
      row("collab-assistant-handoff", ["어시스턴트 분업 인수인계 패키지", "Assistant Handoff & QA Package"],
        ["담당 컷 범위·컬러 팔레트·폰트·브러시·체크리스트를 한 패키지로 묶어 안전하게 인계", "Bundles cut scopes, palettes, fonts, brushes and QA checklists into one handoff kit"],
        "apps/web/src/domains/creator/assistant-handoff-qa-kit/assistant-handoff-engine.ts", {
          toonstudio: c("current", "컷 잠금·팔레트·폰트·QA 패키지 자동 묶음", "Scoped cut, palette & QA handoff"), magma: c("partial", "링크 기반 즉석 팀 합류·권한 제어 강점", "Fast link invite & layer permissions"),
          csp: c("partial", "팀워크 페이지 분배 · 소재 묶음은 수동", "Page handoff; manual asset pack"), procreate: c("none", "파일 에어드롭·클라우드 수동 전달", "Manual AirDrop/file transfer"),
          photoshop: c("partial", "CC 라이브러리·패키지 공유 지원", "CC Libraries & Package export"), rebelle7: c("none", "수동 .reb/.psd 파일 전달", "Manual .reb/.psd file handoff"),
          blender: c("native-strength", "Linked Library·Asset Browser 스튜디오 검증", "Proven Linked Library pipelines"), ibispaint: c("none", "분업 인수인계 패키지 없음", "No assistant handoff kit"),
        }),
      row("collab-version-diff", ["비파괴 버전 / 시맨틱 컷 비교", "Non-Destructive Versioning & Semantic Cut Diff"],
        ["컷·텍스트·컬러 스크립트 리비전 차이를 시각 비교하고 원하는 시점으로 즉시 되돌림", "Visualizes cut, text and color-script revision diffs with instant point-in-time restore"],
        "apps/web/src/domains/creator/studio-revision-diff.ts", {
          toonstudio: c("current", "리비전·컬러 스크립트 시맨틱 diff 복원", "Semantic cut & color-script diff"), magma: c("partial", "클라우드 버전 스냅샷·타임랩스 기록", "Cloud snapshots & timelapse"),
          csp: c("limited", "자동 백업·타임랩스 · 시맨틱 diff 없음", "Auto-backup only; no cut diff"), procreate: c("none", "버전 히스토리·컷 diff 미지원", "No version history or cut diff"),
          photoshop: c("native-strength", "클라우드 문서 30일+ 버전·북마크 성숙", "Mature Cloud Doc version history"), rebelle7: c("none", "수동 파일명 버전 관리", "Manual filename versioning"),
          blender: c("limited", "Git LFS·SVN 외부 버전 관리와 병행", "External Git LFS / SVN tooling"), ibispaint: c("none", "버전·컷 비교 기능 없음", "No version or cut diff"),
        }),
      row("collab-drift-redpen", ["1~60컷 설정집 드리프트 붉은펜", "1–60 Cut Model-Sheet Drift Red-Pen"],
        ["회차 1~60컷 전체에서 캐릭터 비율·색상·소품 이탈을 설정집과 자동 대조해 붉은펜 표시", "Audits cuts 1-60 against the character model sheet and red-pens proportion or color drift"],
        "apps/web/src/domains/creator/crosscut-modelsheet-drift-coach/modelsheet-drift-engine.ts", {
          toonstudio: c("current", "1~60컷 설정집 비율·색상 자동 붉은펜", "Auto 1-60 cut model-sheet red-pen"), magma: c("none", "회차 60컷 설정집 자동 대조 없음", "No 60-cut model-sheet audit"),
          csp: c("none", "서브 뷰 참고창만 제공 · 검수는 수동", "Sub View reference; manual audit"), procreate: c("none", "레퍼런스 창 보조만 지원", "Reference companion window only"),
          photoshop: c("none", "웹툰 설정집 드리프트 점검 없음", "No model-sheet drift checker"), rebelle7: c("none", "단일 캔버스 회화 중심", "Single-canvas painting focus"),
          blender: c("limited", "3D 리그 재사용 유리 · 2D 컷 검수는 별도", "3D rig reuse; no 2D red-pen"), ibispaint: c("none", "설정집 드리프트 붉은펜 없음", "No continuity drift red-pen"),
        }),
      row("collab-external-roundtrip", ["외부 툴 왕복 호환 (.psd/.glb/Figma)", "External Round-Trip (.psd / .glb / Figma)"],
        ["PSD·ABR·SUT·GLB·VRM·SKP·PPTX·웹 디자인 에셋까지 타사 도구와 공존하는 왕복 게이트웨이 내장", "Coexistence gateway supporting PSD, ABR, SUT, GLB, VRM, SKP, PPTX and web design round-trips"],
        "packages/studio-format-gateway/src/artcraft-suite-formats.ts", {
          toonstudio: c("current", "PSD·ABR·SUT·GLB·VRM·SKP·웹 왕복", "PSD/ABR/SUT/GLB/VRM/SKP gateway"), magma: c("partial", "PSD 입출력 지원 · 3D 포맷 없음", "PSD import/export; no 3D formats"),
          csp: c("native-strength", "PSD·PDF·3D FBX/OBJ/VRM 실무 호환 최강", "Broad PSD, PDF & 3D interop"), procreate: c("partial", "PSD·PNG·USDZ 내보내기 지원", "PSD, PNG & USDZ export"),
          photoshop: c("native-strength", "PSD 원본 정본 · Adobe 생태계 최강", "PSD authority & Adobe ecosystem"), rebelle7: c("partial", "PSD 레이어 입출력 지원", "Layered PSD import/export"),
          blender: c("native-strength", "GLB·USD·FBX·Alembic 3D 호환 최강", "Top 3D interchange (GLB/USD/FBX)"), ibispaint: c("partial", "PSD 내보내기 지원 · 3D 포맷 없음", "PSD export; no 3D round-trip"),
        }),
      row("collab-rights-c2pa", ["권리 BOM & C2PA 출고", "Rights BOM & C2PA Delivery"],
        ["출고 전 Rights BOM 상업 라이선스 자동 검증 구현 · 외부 CA 연동 C2PA 인증 체인은 향후 목표 트랙", "Pre-export commercial Rights BOM validator shipped; external-CA C2PA attestation chain on target track"],
        "apps/web/src/domains/creator/delivery-pack/rights-bom-validator.ts", {
          toonstudio: c("target", "Rights BOM 구현 · 외부 CA C2PA 목표", "Rights BOM live; external C2PA goal"), magma: c("none", "소재 권리 BOM·C2PA 서명 미지원", "No Rights BOM or C2PA signing"),
          csp: c("limited", "웹툰 일괄 분할 출고 · 권리 BOM 수동", "Slice export; manual rights tracking"), procreate: c("none", "권리 원장·C2PA 출고 검수 없음", "No rights ledger or C2PA"),
          photoshop: c("native-strength", "공식 Content Credentials(C2PA) 서명 표준", "Official C2PA Content Credentials"), rebelle7: c("none", "단일 이미지 저장 · 권리 BOM 없음", "Image export only; no BOM"),
          blender: c("none", "렌더·메쉬 출력 · 권리 원장 수동", "Mesh/frame export; manual rights"), ibispaint: c("none", "권리 BOM·C2PA 서명 미지원", "No Rights BOM or C2PA"),
        }),
    ],
  },
  {
    id: "studio3d",
    order: 5,
    shortLabel: bi("3D 셰이퍼 · 세트", "3D Shaper & Stage"),
    title: bi("05 · 3D 셰이퍼 & 3D 배경 세트장 (8대 기준)", "05 · 3D Character Shaper & In-Browser 3D Stage (8 Criteria)"),
    subtitle: bi(
      "브라우저 3D 배경 세트장, VRM 42-소켓 캐릭터 셰이퍼, 15관절 손 자동 그립, 3점 역광, 180° 카메라 코치, 4층 UV 페인팅, 3D→2D 셀 변환, 매니폴드-0 검증을 대조합니다.",
      "Compares browser 3D stages, VRM 42-socket character shaping, 15-joint hand auto-grip, 3-point backlighting, 180-degree camera coach, 4-layer UV paint, cel shading and Manifold-0 validation.",
    ),
    candidTakeaway: bi(
      "하이폴리 모델링·리깅·Cycles/EEVEE 셰이딩은 Blender, 3D 데생인형·핸드 스캐너는 CSP, USDZ PBR 페인팅은 Procreate가 강점입니다. ToonStudio는 설치 0초 브라우저 안에서 3D 배경·15관절 그립·180° 카메라·매니폴드-0 검증을 웹툰 컷에 바로 연결합니다.",
      "Blender dominates full 3D modeling and rendering, CSP leads pose mannequins and Hand Scanner, and Procreate excels at iPad USDZ painting. ToonStudio connects zero-install 3D stages, 15-joint grips, 180-degree camera coaching and Manifold-0 gates directly to webtoon panels.",
    ),
    rows: [
      row("s3d-browser-set", ["브라우저 3D 배경 세트장", "In-Browser 3D Background Stage"],
        ["설치 0초 WebGPU 3D 실내·건축 세트 조립과 OpenSKP/GLB 반입을 웹툰 컷에 즉시 연결", "Zero-install WebGPU 3D room staging with OpenSKP/GLB import linked straight to comic cuts"],
        "apps/web/src/domains/creator/bg3d/StudioBg3dSketchUpWebtoonStagingSection.tsx", {
          toonstudio: c("current", "설치 0초 WebGPU 3D 세트 + OpenSKP", "Zero-install 3D stage + OpenSKP"), magma: c("none", "2D 캔버스 전용 · 3D 세트장 없음", "2D canvas only; no 3D stage"),
          csp: c("native-strength", "3D 배경 배치·레이어 연동 실무 표준", "Proven 3D background staging"), procreate: c("none", "단일 3D 모델 채색만 · 세트 조립 불가", "Single-mesh paint; no room stage"),
          photoshop: c("none", "기존 3D 워크스페이스 종료", "Legacy 3D workspace retired"), rebelle7: c("none", "2D 전통 회화 전용", "2D traditional media only"),
          blender: c("native-strength", "대규모 3D 건축·씬 조립 절대 강자", "Unmatched 3D architectural staging"), ibispaint: c("none", "3D 배경 세트장 미지원", "No 3D background stage"),
        }),
      row("s3d-vrm-42socket", ["VRM 42-소켓 캐릭터 셰이퍼", "VRM 42-Socket Character Shaper"],
        ["42-소켓 VRM Auto-Fit 기반 구현 완료 · VRoid·CC4 수준의 미형 프리셋 다양성을 고도화 중", "42-socket VRM Auto-Fit foundation shipped; actively expanding stylized preset variety toward VRoid/CC4"],
        "apps/web/src/domains/creator/studio-scale-and-3d-fit/vrm-autofit-socket-registry.ts", {
          toonstudio: c("partial", "42-소켓 Auto-Fit 구현 · 미형 다양성 고도화", "42-socket base live; presets WIP"), magma: c("none", "3D 캐릭터 셰이퍼 없음", "No 3D character shaper"),
          csp: c("native-strength", "3D 데생인형 체형·머리 셰이퍼 표준", "Proven 3D figure & head shaper"), procreate: c("none", "3D 캐릭터 셰이퍼 미지원", "No 3D character shaper"),
          photoshop: c("none", "3D 캐릭터 셰이퍼 미지원", "No 3D character shaper"), rebelle7: c("none", "3D 기능 미지원", "No 3D character tools"),
          blender: c("native-strength", "풀 스컬프팅·아마추어·셰이프키 최강", "Full sculpting, rigs & shape keys"), ibispaint: c("limited", "기본 3D 포즈 인형 · 체형 셰이퍼 제한", "Basic pose doll; minimal shaping"),
        }),
      row("s3d-hand-autogrip", ["3D 소품 15관절 손 자동 그립", "15-Joint 3D Prop Auto-Grip"],
        ["검·컵·스마트폰 등 소품 형태에 맞춰 15관절 손가락 포즈를 자동 제안하고 비파괴 미세 보정", "Proposes 15-joint finger grips for props (swords, cups, phones) with non-destructive fine tuning"],
        "apps/web/src/domains/creator/hand-prop-autogrip-assistant/hand-prop-autogrip-engine.ts", {
          toonstudio: c("current", "소품별 15관절 손가락 자동 그립 제안", "15-joint prop auto-grip advisor"), magma: c("none", "3D 손 리깅 미지원", "No 3D hand rigging"),
          csp: c("native-strength", "카메라 핸드 스캐너·손 포즈 프리셋 최강", "Hand Scanner & hand pose presets"), procreate: c("none", "3D 손 리깅 없음", "No 3D hand rigging"),
          photoshop: c("none", "3D 손 리깅 없음", "No 3D hand rigging"), rebelle7: c("none", "3D 기능 없음", "No 3D features"),
          blender: c("partial", "정밀 손 리깅 가능 · 자동 그립은 수동", "Full hand rigs; manual prop grip"), ibispaint: c("limited", "기본 손 포즈 프리셋 제한 제공", "Limited basic hand pose presets"),
        }),
      row("s3d-3point-backlight", ["3점 조명 · 역광 자동 연출", "3-Point Lighting & Backlight Staging"],
        ["장면 분위기에 맞춘 키·필·림 3점 조명·역광 드라마 프리셋과 HDRI 스카이 리그 연동", "Scene-aware key/fill/rim 3-point lighting, dramatic backlight presets and HDRI sky rigs"],
        "apps/web/src/domains/creator/scene-lighting-atmosphere-advisor/scene-lighting-advisor-engine.ts", {
          toonstudio: c("current", "키·필·림 3점 조명·역광·HDRI 리그", "3-point lighting, backlight & HDRI"), magma: c("none", "3D 조명 엔진 없음", "No 3D lighting engine"),
          csp: c("partial", "2개 방향광·환경광 · 3점 역광은 수동", "2 directional lights; manual rim"), procreate: c("limited", "3D 모델 환경광 조절만 지원", "3D paint environment light only"),
          photoshop: c("none", "3D 조명 워크스페이스 종료", "3D lighting workspace retired"), rebelle7: c("none", "3D 조명 미지원", "No 3D scene lighting"),
          blender: c("native-strength", "Cycles/EEVEE 물리 3점·볼류메트릭 최강", "Cycles/EEVEE physical lighting"), ibispaint: c("limited", "3D 인형 단일 광원 방향만 조절", "Single light direction on figure"),
        }),
      row("s3d-180-camera", ["180° 법칙 카메라 앵글 코치", "180-Degree Rule Camera Coach"],
        ["인물 시선 축과 180° 법칙 이탈을 자동 감지해 안전한 컷 리프레이밍 각도를 비파괴 제안", "Detects 180-degree axis breaks and suggests safe cut reframing angles non-destructively"],
        "apps/web/src/domains/creator/camera-framing-continuity-coach/camera-framing-coach-engine.ts", {
          toonstudio: c("current", "시선 축·180° 이탈 감지 및 리프레이밍", "Axis break detection & reframing"), magma: c("none", "3D 카메라 코치 없음", "No 3D camera coach"),
          csp: c("limited", "3D 카메라 프리셋 · 180° 검증은 수동", "Camera presets; manual continuity"), procreate: c("none", "3D 카메라 시스템 없음", "No 3D camera system"),
          photoshop: c("none", "3D 카메라 없음", "No 3D camera tools"), rebelle7: c("none", "3D 카메라 없음", "No 3D camera tools"),
          blender: c("partial", "다중 카메라·시퀀서 강력 · 180° 수동 검수", "Multi-camera; manual 180° audit"), ibispaint: c("none", "3D 카메라 코치 없음", "No 3D camera coach"),
        }),
      row("s3d-surface-paint-4layer", ["3D 표면 직접 페인팅 (4층 UV)", "Direct 3D Surface Painting (4-Layer UV)"],
        ["UV 레이캐스트 4층 표면 직접 페인팅 구현 완료 · 멀티채널 PBR 재질 워크플로 고도화 중", "UV raycast 4-layer surface painter shipped; expanding multi-channel PBR painting controls"],
        "apps/web/src/domains/creator/model3d-surface-paint/uv-raycast-surface-painter.ts", {
          toonstudio: c("partial", "UV 4층 직접 페인팅 구현 · PBR 고도화 중", "4-layer UV paint live; PBR WIP"), magma: c("none", "3D UV 페인팅 미지원", "No 3D UV painting"),
          csp: c("none", "3D 메쉬 위 직접 UV 페인팅 미지원", "No direct UV brush painting"), procreate: c("native-strength", "USDZ/OBJ PBR 알베도·거칠기 직접 채색", "Fluid USDZ/OBJ PBR 3D painting"),
          photoshop: c("none", "3D 페인팅 기능 종료", "3D texture painting retired"), rebelle7: c("none", "3D 페인팅 미지원", "No 3D surface painting"),
          blender: c("native-strength", "Texture Paint·멀티 UV 셰이더 최강", "Full Texture Paint & UV shaders"), ibispaint: c("none", "3D UV 페인팅 미지원", "No 3D UV painting"),
        }),
      row("s3d-toon-cel", ["3D→2D 화풍 / 셀 변환", "3D-to-2D Style & Cel Shading"],
        ["MToon·셀 셰이더 팩 교환 엔진과 2D 화풍 브리지로 3D 세트를 작품 톤에 맞게 통합", "MToon/cel shader pack exchange and 2D style bridge to blend 3D sets into comic art direction"],
        "apps/web/src/domains/creator/style-shader-pack-exchange/style-shader-pack-engine.ts", {
          toonstudio: c("current", "MToon·셀 셰이더 팩 + 2D 화풍 브리지", "MToon/cel packs + 2D style bridge"), magma: c("none", "3D 셰이더 변환 없음", "No 3D shader conversion"),
          csp: c("partial", "카툰 렌더·윤곽선 지원 · 커스텀 셰이더 제한", "Toon render & outlines; no graph"), procreate: c("none", "3D 셀 셰이더 변환 없음", "No 3D cel shader conversion"),
          photoshop: c("none", "3D 셀 변환 없음", "No 3D cel shading"), rebelle7: c("none", "3D 기능 없음", "No 3D shading"),
          blender: c("native-strength", "EEVEE Shader-to-RGB·NPR 셀 셰이딩 최강", "EEVEE Shader-to-RGB NPR leader"), ibispaint: c("limited", "3D 인형 윤곽선 표시 수준", "Basic 3D figure outline display"),
        }),
      row("s3d-manifold-gate", ["매니폴드-0 GLB/VRM 검증", "Manifold-0 GLB/VRM Quality Gate"],
        ["비매니폴드 0·미터 스케일(1.0=1m)·바닥 접지(Y=0) 자동 검증 게이트로 깨진 3D 에셋 반입 차단", "Automated Manifold-0, metric scale (1.0=1m) and floor-grounding (Y=0) gate blocks broken 3D assets"],
        "apps/web/src/domains/creator/precision-3d-craft/precision-3d-mesh-quality-engine.ts", {
          toonstudio: c("current", "비매니폴드 0·미터·바닥 접지 자동 게이트", "Auto Manifold-0, metric & Y=0 gate"), magma: c("none", "3D 포맷 미지원", "No 3D format pipeline"),
          csp: c("none", "메쉬 매니폴드 자동 진단 게이트 없음", "No automated manifold gate"), procreate: c("limited", "UV 포함 USDZ 로드 검사 · 매니폴드 없음", "USDZ UV check only; no manifold"),
          photoshop: c("none", "3D 메쉬 검증 없음", "No 3D mesh validation"), rebelle7: c("none", "3D 미지원", "No 3D pipeline"),
          blender: c("native-strength", "3D-Print Toolbox·노멀/매니폴드 정밀 검사", "3D-Print Toolbox mesh validation"), ibispaint: c("none", "GLB/VRM 검증 없음", "No GLB/VRM validation"),
        }),
    ],
  },
];

export function isDeepCompareDomainId(value: string | null | undefined): value is DeepCompareDomainId {
  return value === "brushes" || value === "filters" || value === "drawing" || value === "collab" || value === "studio3d";
}

export function parseDeepCompareDomainId(value: string | null | undefined): DeepCompareDomainId {
  return isDeepCompareDomainId(value) ? value : "brushes";
}

export function getDeepCompareDomain(domainId: DeepCompareDomainId): DeepCompareDomain {
  return DEEP_COMPARE_DOMAINS.find((domain) => domain.id === domainId) ?? BRUSHES_DOMAIN;
}

export function getDeepCompareTool(toolId: DeepCompareToolId): DeepCompareToolProfile {
  return DEEP_COMPARE_TOOLS.find((tool) => tool.id === toolId) ?? BASELINE_TOOL;
}

export function computeDomainSummary(
  rows: readonly DeepCompareRow[],
  visibleTools: readonly DeepCompareToolId[] = DEEP_COMPARE_TOOLS.map((tool) => tool.id),
): DeepCompareDomainSummary {
  let currentCount = 0;
  let partialCount = 0;
  let targetCount = 0;
  let competitorStrengthRowCount = 0;
  let competitorStrengthCellCount = 0;
  const rivalTools = visibleTools.filter((id): id is DeepCompareCompetitorId => id !== "toonstudio");

  for (const item of rows) {
    const tsStatus = item.cells.toonstudio.status;
    if (tsStatus === "current") currentCount += 1;
    else if (tsStatus === "partial") partialCount += 1;
    else if (tsStatus === "target") targetCount += 1;

    let rowHasRivalStrength = false;
    for (const rivalId of rivalTools) {
      if (item.cells[rivalId].status === "native-strength") {
        rowHasRivalStrength = true;
        competitorStrengthCellCount += 1;
      }
    }
    if (rowHasRivalStrength) competitorStrengthRowCount += 1;
  }

  return {
    totalRows: rows.length,
    currentCount,
    partialCount,
    targetCount,
    expandingCount: partialCount + targetCount,
    competitorStrengthRowCount,
    competitorStrengthCellCount,
  };
}

export function filterDeepCompareRows(
  rows: readonly DeepCompareRow[],
  mode: DeepCompareFilterMode,
  query: string,
  locale: "ko" | "en",
  visibleTools: readonly DeepCompareToolId[] = DEEP_COMPARE_TOOLS.map((tool) => tool.id),
): readonly DeepCompareRow[] {
  const normalizedQuery = query.trim().toLowerCase();
  const rivalTools = visibleTools.filter((id): id is DeepCompareCompetitorId => id !== "toonstudio");

  return rows.filter((item) => {
    if (mode === "toonstudio-lead" && item.cells.toonstudio.status !== "current") return false;
    if (mode === "rival-strength" && !rivalTools.some((id) => item.cells[id].status === "native-strength")) return false;
    if (mode === "expanding" && item.cells.toonstudio.status !== "partial" && item.cells.toonstudio.status !== "target") return false;
    if (normalizedQuery.length === 0) return true;

    const titleText = locale === "ko" ? item.title.ko : item.title.en;
    const specText = locale === "ko" ? item.toonstudioSpec.ko : item.toonstudioSpec.en;
    if (
      titleText.toLowerCase().includes(normalizedQuery) ||
      specText.toLowerCase().includes(normalizedQuery) ||
      item.evidencePath.toLowerCase().includes(normalizedQuery)
    ) {
      return true;
    }

    return visibleTools.some((toolId) => {
      const cellText = locale === "ko" ? item.cells[toolId].summary.ko : item.cells[toolId].summary.en;
      return cellText.toLowerCase().includes(normalizedQuery);
    });
  });
}
