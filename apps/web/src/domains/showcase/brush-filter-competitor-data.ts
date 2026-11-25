/**
 * 브러시 · 필터 실측 정본 개수 · 차세대 스튜디오 6대 역량 · 필기감/장시간 안정성 · 3D 셰이퍼 비교 정본 데이터 (`/compare/studio`).
 *
 * 정직성 원칙:
 * - 무료 기본 브러시 정본: 선택 가능 502종 (Core+Pro 246 + MyPaint CC0 196 + 글로벌 시그니처 60) / 전체 등록 640종 (전부 100% 무료).
 * - 무료 기본 필터 정본: 183종 (스튜디오 86 + Photoshop-Web 61 + 마스터 LUT/웹툰 36) + RGBA16F 비파괴 노드 11종 + KM7 분광 안료 필터 4종.
 * - 장시간 10,000획 지구력 수치는 `scripts/toonstudio-llm-mcp-cli.mjs --bench-stroke --strokes 10000` 실측값에 근거하며
 *   경쟁사 미실측 FPS/배수를 지어내지 않는다.
 * - 3D 셰이퍼는 VRoid Studio · CC4 대비 현재 부족한 지점을 솔직히 인정하고 추월 로드맵을 함께 제시한다.
 */

import type { BilingualText, BenchmarkToolId } from "./competitor-benchmark-data";

export type CellGrade = "lead" | "strong" | "partial" | "none";

export interface BrushFilterCategoryRow {
  readonly id: string;
  readonly kind: "brush" | "filter";
  readonly category: BilingualText;
  readonly toonstudioSpec: BilingualText;
  readonly repoEvidence: string;
  readonly cells: Readonly<Record<BenchmarkToolId, { readonly grade: CellGrade; readonly note: BilingualText }>>;
}

export interface StudioNextGenCapabilityCard {
  readonly id: string;
  readonly categoryTag: BilingualText;
  readonly title: BilingualText;
  readonly headlineMetric: BilingualText;
  readonly summary: BilingualText;
  readonly competitorEdge: BilingualText;
  readonly repoAnchor: string;
  readonly status: "shipped" | "verified";
}

export interface QuantitativePerformanceMetric {
  readonly id: string;
  readonly label: BilingualText;
  readonly toonstudioMeasured: BilingualText;
  readonly measurementBasis: BilingualText;
  readonly competitorBaseline: BilingualText;
  readonly status: "measured" | "spec-verified" | "expanding";
}

export interface Shaper3dBreakthroughPillar {
  readonly id: string;
  readonly title: BilingualText;
  readonly honestGapNow: BilingualText;
  readonly breakthroughArchitecture: BilingualText;
  readonly repoAnchor: string;
  readonly status: "current" | "expanding";
}

const bi = (ko: string, en: string): BilingualText => ({ ko, en });

export const BRUSH_FILTER_SUMMARY_STATS = {
  /** 무료 기본 브러시 실측 정본 (전부 100% 무료) */
  selectableFreeBrushes: 502,
  coreProBrushes: 246,
  mypaintCc0Brushes: 196,
  globalSignatureFreeBrushes: 60,
  totalRegisteredBrushes: 640,
  /** 무료 기본 필터 실측 정본 */
  freeFiltersTotal: 183,
  studioCatalogFilters: 86,
  photoshopWebFilters: 61,
  masterLutWebtoonFilters: 36,
  /** 기존 요약 호환 + 분광/비파괴 엔진 지표 */
  toonstudioSmartFilters: 86,
  toonstudioSpectralPigmentFilters: 4,
  toonstudioCanonicalFilterNodes: 11,
  toonstudioBrushLanes: 6,
  /** 장시간 10,000획 지구력 실측 */
  measuredEnduranceStrokes: 10_000,
  measuredEnduranceP95Ms: 0.005,
  measuredEnduranceHeapDeltaMb: 0.74,
} as const;

export const BRUSH_FILTER_COMPETITOR_ROWS: readonly BrushFilterCategoryRow[] = [
  {
    id: "brush-ink-webtoon",
    kind: "brush",
    category: bi("웹툰 펜선 · G펜 · 마루펜 · 무료 502종 선택 브러시", "Webtoon Ink · G-Pen · Maru · 502 Selectable Free Brushes"),
    toonstudioSpec: bi(
      "선택 가능 무료 기본 브러시 502종(Core+Pro 246 + MyPaint CC0 196 + 글로벌 시그니처 60 · 전체 등록 640종, 100% 무료) + 120–240Hz 구심 Catmull-Rom 예측 · Skia WebGL2 벡터 선화",
      "502 selectable free built-in brushes (246 Core+Pro + 196 MyPaint CC0 + 60 Global Signature; 640 total registered, 100% free) + 120-240Hz Centripetal Catmull-Rom prediction & Skia WebGL2 vector ink",
    ),
    repoEvidence: "apps/web/src/domains/creator/brush/studio-brush-catalog.ts",
    cells: {
      toonstudio: { grade: "lead", note: bi("502종 선택(640종 등록) 전부 ₩0 + 벡터·필압 예측", "502 selectable (640 registered) at $0 + vector prediction") },
      csp: { grade: "lead", note: bi("업계 표준 G펜·벡터 지우개 최강 (유료 에셋 별도)", "Industry benchmark G-pen & vector eraser (paid assets extra)") },
      procreate: { grade: "strong", note: bi("Apple Pencil 필기감 우수(iPad 전용 · 래스터 중심)", "Silky Apple Pencil feel (iPad-only, raster-focused)") },
      photoshop: { grade: "partial", note: bi("범용 브러시 방대, 웹툰 벡터 교차 지우개 약함", "Broad brush engine; weak comic vector ink") },
      rebelle7: { grade: "strong", note: bi("전통 연필·잉크 표현 탁월", "Excellent traditional ink & graphite") },
      blender: { grade: "strong", note: bi("Grease Pencil 3D 공간 벡터 선화", "Grease Pencil 3D spatial vector strokes") },
      ibispaint: { grade: "strong", note: bi("모바일 G펜·손떨림 보정 강함(광고/프리미엄 잠금)", "Strong mobile G-pen & stabilizer (ad/premium locks)") },
    },
  },
  {
    id: "brush-spectral-wet",
    kind: "brush",
    category: bi("7밴드 분광 혼색 · 유화 · 수채화 · 동양 수묵", "7-Band Spectral Mixing · Oil · Watercolor · East Asian Ink"),
    toonstudioSpec: bi(
      "클린룸 KM7 420–670nm WGSL SIMD 브러시 + Hokusai Rust WASM 자연매체 + MyPaint CC0 196종 + 글로벌 시그니처 과립수채/임파스토/갈필 수묵 무료 내장",
      "Clean-room KM7 420-670nm WGSL SIMD + Hokusai Rust WASM natural media + 196 MyPaint CC0 + free granulating watercolor, impasto oil & dry-brush calligraphy presets",
    ),
    repoEvidence: "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
    cells: {
      toonstudio: { grade: "lead", note: bi("브라우저 WebGPU KM7 + Rust WASM + CC0 196종", "In-browser WebGPU KM7 + Rust WASM + 196 CC0") },
      csp: { grade: "strong", note: bi("지각 혼색(Perceptual Mixing) 지원", "Supports perceptual color mixing") },
      procreate: { grade: "partial", note: bi("sRGB/P3 혼색 중심, 물리 유체 시뮬레이션 약함", "sRGB/P3 blending; limited fluid physics") },
      photoshop: { grade: "strong", note: bi("Mixer Brush 우수, 분광 물리 미지원", "Great Mixer Brush; no spectral pigment") },
      rebelle7: { grade: "lead", note: bi("유체·중력·임파스토 물리 업계 최강", "Industry leader in fluid, gravity & impasto") },
      blender: { grade: "none", note: bi("2D 수채 유체 브러시 미주력", "Not built for 2D fluid watercolor") },
      ibispaint: { grade: "partial", note: bi("블렌딩 브러시 다수, 물리 혼색 제한", "Many blend brushes; no fluid physics") },
    },
  },
  {
    id: "brush-ribbon-tone",
    kind: "brush",
    category: bi("로판 장식 리본 · 스크린톤 · 효과선 · 글로벌 시그니처 60종", "Rofan Ribbons · Screentone · Speedlines · 60 Global Signatures"),
    toonstudioSpec: bi(
      "글로벌 시그니처 60종(로판 프릴·레이스·진주 체인·벚꽃·집중선·네온 글로우) 100% 무료 + 모아레 억제 GPU 스크린톤 + 브러시 랩 V5/V6 + ABR/SUT 호환",
      "60 free Global Signature brushes (frills, lace, pearl chains, sakura, speedlines, neon glow) + anti-moire GPU screentone + Brush Lab V5/V6 + ABR/SUT import",
    ),
    repoEvidence: "apps/web/src/domains/creator/brush/global-master-collection/",
    cells: {
      toonstudio: { grade: "lead", note: bi("글로벌 시그니처 60종 포함 웹툰 데코 무료 내장", "60 signature webtoon deco & tone brushes built in free") },
      csp: { grade: "lead", note: bi("수만 종 ASSETS 리본·데코 생태계 최강", "Massive ASSETS library of ribbon & deco brushes") },
      procreate: { grade: "strong", note: bi("듀얼 브러시·커스텀 스튜디오 풍부", "Rich dual-brush & custom studio") },
      photoshop: { grade: "strong", note: bi("ABR 생태계 방대, 만화 톤은 수동", "Huge ABR ecosystem; manual comic tones") },
      rebelle7: { grade: "partial", note: bi("전통 회화 중심, 만화 장식 제한", "Traditional focus; limited manga deco") },
      blender: { grade: "partial", note: bi("지오메트리 노드·셰이더 기반 패턴", "Geometry Nodes & shader patterns") },
      ibispaint: { grade: "lead", note: bi("모바일 방대한 브러시·소재 카탈로그", "Huge mobile brush & pattern catalog") },
    },
  },
  {
    id: "filter-blur-optics",
    kind: "filter",
    category: bi("광학 블러 · 렌즈 플레어 · 갓레이 (183종 무료 필터 군)", "Optical Blurs · Anamorphic Flare · God Rays (183 Free Filters)"),
    toonstudioSpec: bi(
      "무료 기본 필터 183종(스튜디오 86 + Photoshop-Web 61 + 마스터 LUT/웹툰 36) 내 조리개 보케·아이리스·틸트시프트·타일블러·아나모픽 플레어·볼류메트릭 갓레이",
      "Inside 183 free built-in filters (86 Studio + 61 Photoshop-Web + 36 Master LUT/Webtoon): aperture bokeh, iris, tilt-shift, tileable blur, anamorphic flare & god rays",
    ),
    repoEvidence: "apps/web/src/domains/creator/filter/studio-filter-catalog.ts",
    cells: {
      toonstudio: { grade: "lead", note: bi("183종 무료 필터 내 광학 블러·플레어·갓레이 완비", "Full optical blur, flare & god-ray suite inside 183 free filters") },
      csp: { grade: "strong", note: bi("가우시안·모션·방사형·스무딩 지원", "Gaussian, motion, radial & smoothing") },
      procreate: { grade: "strong", note: bi("가우시안·모션·원근 블러 직관적", "Intuitive Gaussian, motion & perspective blur") },
      photoshop: { grade: "lead", note: bi("Blur Gallery·스마트 필터 업계 표준", "Blur Gallery & Smart Filters benchmark") },
      rebelle7: { grade: "partial", note: bi("기본 블러 중심, 광학 필터 소수", "Basic blurs; minimal optical suite") },
      blender: { grade: "strong", note: bi("노드 기반 피사계 심도·컴포지터", "Node-based DoF & compositor blurs") },
      ibispaint: { grade: "strong", note: bi("모바일 블러·렌즈 블러 다양", "Rich mobile blurs including lens blur") },
    },
  },
  {
    id: "filter-color-hdr",
    kind: "filter",
    category: bi("비파괴 RGBA16F 색보정 · 3D LUT · 리소그래프 · KM7 안료 필터", "Non-Destructive RGBA16F Color · 3D LUT · Risograph · KM7 Filters"),
    toonstudioSpec: bi(
      "Photoshop-Web 호환 61종 + 마스터 LUT/웹툰 분위기 36종(포트라·벨비아·리소 2도·CMYK 로제트) + RGBA16F 11노드 그래프 + KM7 감산 안료 필터 4종",
      "61 Photoshop-Web presets + 36 Master LUT/Webtoon pixel kernels (Portra, Velvia, 2-ink Risograph, CMYK rosette) + 11 RGBA16F nodes + 4 KM7 pigment filters",
    ),
    repoEvidence: "apps/web/src/domains/creator/filter/master-lut-fx/",
    cells: {
      toonstudio: { grade: "lead", note: bi("183종 무료 필터 + Display-P3 RGBA16F + KM7 4종", "183 free filters + Display-P3 RGBA16F + 4 KM7") },
      csp: { grade: "lead", note: bi("색조 보정 레이어·그라데이션 맵 강력", "Strong correction layers & gradient maps") },
      procreate: { grade: "partial", note: bi("커브·그라데이션맵 지원(파괴 적용 중심)", "Curves & gradient maps (mostly destructive)") },
      photoshop: { grade: "lead", note: bi("16/32-bit 조정 레이어·Camera Raw 최강", "16/32-bit adjustment layers & Camera Raw") },
      rebelle7: { grade: "partial", note: bi("기본 색상·명도 보정 중심", "Core tonal adjustments") },
      blender: { grade: "strong", note: bi("AgX/ACES 파이프라인·컬러 매니지먼트", "AgX/ACES color management & compositor") },
      ibispaint: { grade: "strong", note: bi("필터 다수 제공, 비파괴 조정 레이어 제한", "Rich filter catalog; limited non-destructive stack") },
    },
  },
  {
    id: "filter-comic-line-extract",
    kind: "filter",
    category: bi("웹툰 선화 추출 · 배경 투명화 · 한지/수채지 질감 · 레트로 CRT/VHS", "Webtoon Line Extract · Matte Keying · Paper Grain · Retro CRT/VHS"),
    toonstudioSpec: bi(
      "Sobel+DoG 초정밀 선화 추출, 스마트 단색 배경 투명화, 휘도→투명, 스크린톤 제거, 한지·수채지·린넨 종이결, CRT/VHS/Bayer 디더링 포함 183종 무료 필터",
      "183 free filters including Sobel+DoG line extract, smart matte keying, luma-to-alpha, descreening, Hanji/watercolor/linen grain & CRT/VHS/Bayer dithering",
    ),
    repoEvidence: "apps/web/src/domains/creator/filter/studio-photoshop-web-filter-presets.ts",
    cells: {
      toonstudio: { grade: "lead", note: bi("웹툰 마감·선화추출·LUT·종이결 통합 183종 무료", "183 free filters spanning comic finishing, LUT & line extract") },
      csp: { grade: "lead", note: bi("EX LT 변환·아티스틱·휘도→투명 최강", "EX LT conversion, artistic & luma-to-alpha") },
      procreate: { grade: "strong", note: bi("색수차·블룸·글리치·하프톤 우수", "Chromatic aberration, bloom, glitch & halftone") },
      photoshop: { grade: "strong", note: bi("Filter Gallery 풍부, 만화 LT는 별도 액션", "Rich Filter Gallery; comic LT needs actions") },
      rebelle7: { grade: "partial", note: bi("전통 종이 질감 강점, 만화 마감 필터 소수", "Great paper physics; few stylized comic filters") },
      blender: { grade: "strong", note: bi("Freestyle·Line Art 모디파이어 강력", "Freestyle & Line Art modifiers") },
      ibispaint: { grade: "lead", note: bi("애니 배경·선화 추출·글로우 프리셋 풍부", "Rich anime/comic filter preset catalog") },
    },
  },
];

export const STUDIO_NEXTGEN_CAPABILITY_CARDS: readonly StudioNextGenCapabilityCard[] = [
  {
    id: "ooxml-pptx-suite",
    categoryTag: bi("프레젠테이션 · OOXML 바이너리", "Presentation · Native OOXML"),
    title: bi("실제 .pptx OOXML 내보내기 · 가져오기 & SmartArt · 차트 · 표", "Native .pptx OOXML Export / Import & SmartArt · Charts · Tables"),
    headlineMetric: bi("제로 의존성 ZIP/CRC-32 · SmartArt 6종 · 차트 4종 · 표 · 발표자 노트", "Zero-dep ZIP/CRC-32 · 6 SmartArt · 4 Charts · Tables · Speaker Notes"),
    summary: bi(
      "PowerPoint · Keynote · LibreOffice에서 바로 열리는 표준 OOXML `.pptx` 바이너리를 브라우저에서 생성·파싱합니다. 텍스트·도형·표·전환 효과·발표자 노트를 한글 UTF-8 무손실로 왕복합니다.",
      "Generates and parses standard OOXML `.pptx` binaries directly in the browser for PowerPoint, Keynote, and LibreOffice—preserving UTF-8 text, vector shapes, tables, transitions, and speaker notes.",
    ),
    competitorEdge: bi(
      "기존 드로잉 앱(CSP·Procreate·ibisPaint)은 슬라이드 제작 미지원 — 웹툰 기획서·IR 피치덱·콘티 발표를 한 도구에서 끝냅니다.",
      "Drawing apps (CSP, Procreate, ibisPaint) lack slide authoring; ToonStudio handles comic pitches, IR decks, and storyboards in one tab.",
    ),
    repoAnchor: "apps/web/src/domains/creator/pro-drawing-ppt-suite/pptx-ooxml/",
    status: "shipped",
  },
  {
    id: "all-in-one-web-design-editor",
    categoryTag: bi("올인원 웹 디자인 · 카드뉴스 · UI", "All-in-One Web Design · Social · UI"),
    title: bi("미리캔버스 · Canva · Figma 올인원 웹 디자인 에디터", "MiriCanvas · Canva · Figma All-in-One Web Design Editor"),
    headlineMetric: bi("매직 리사이즈 14종 · Figma Auto-Layout · 브랜드 키트 8종 · 템플릿 16종", "14 Magic Resize Formats · Figma Auto-Layout · 8 Brand Kits · 16 Templates"),
    summary: bi(
      "웹툰 컷·유튜브 썸네일·인스타 카드뉴스·A4 인쇄(3mm 재단선)를 1클릭 리플로우하고, Figma Auto-Layout 제약 솔버·컴포넌트 인스턴스 동기화·Excalidraw 손그림 화이트보드까지 내장했습니다.",
      "One-click reflow across 14 webtoon, social, and 3mm-bleed print formats, paired with a Figma Auto-Layout solver, master-instance sync, 8 Brand Kits, and an Excalidraw sketch toggle.",
    ),
    competitorEdge: bi(
      "원고 작화 뒤 홍보 카드뉴스·굿즈 시안을 Canva나 Figma로 옮길 필요 없이 같은 아트보드와 브랜드 토큰으로 마감합니다.",
      "Finish promo cards, thumbnails, and merch layouts with the same artboards and brand tokens instead of bouncing to Canva or Figma.",
    ),
    repoAnchor: "apps/web/src/domains/creator/design-editor-suite/",
    status: "shipped",
  },
  {
    id: "hlc-crdt-offline-merger",
    categoryTag: bi("오프라인 내결함성 · CRDT 분산 병합", "Offline Resilience · CRDT Merging"),
    title: bi("HLC + Vector Clock 3-Way CRDT 오프라인 무손실 병합 엔진", "HLC + Vector Clock 3-Way CRDT Lossless Offline Merger"),
    headlineMetric: bi("256×256 타일·레이어 자동 병합 · 충돌 시 신규 레이어 보존 · FNV-1a 64-bit", "256x256 Tile/Layer Auto-Merge · Non-Destructive Layer Stack · FNV-1a 64-bit"),
    summary: bi(
      "네트워크가 끊긴 상태에서 데스크톱과 태블릿이 같은 원고를 동시에 수정해도, 재연결 시 비중복 타일은 자동 병합하고 동시 수정 타일은 새 보조 레이어로 올려 1획도 잃지 않습니다.",
      "When desktop and tablet edit the same episode offline, non-overlapping 256x256 tiles merge automatically on reconnect while concurrent collisions stack onto a new layer with zero lost strokes.",
    ),
    competitorEdge: bi(
      "단순 파일 덮어쓰기(Last-Write-Wins) 동기화와 달리 교환·결합·멱등 CRDT 수렴과 스냅샷 무결성 체크섬을 수학적으로 검증합니다.",
      "Replaces destructive last-write-wins file sync with mathematically verified commutative, associative, idempotent CRDT merging and manifest checksums.",
    ),
    repoAnchor: "apps/web/src/domains/creator/offline-conflict-crdt/",
    status: "verified",
  },
  {
    id: "hologram-webxr-5plane",
    categoryTag: bi("공간 웹툰 · WebXR · 라이트필드", "Spatial Webtoon · WebXR · Lightfield"),
    title: bi("홀로그램 WebXR 5-평면 입체 웹툰 스테이지", "Holographic WebXR 5-Plane Spatial Webtoon Stage"),
    headlineMetric: bi("5-평면 Off-Axis 투영 · IPD 63mm 양안 스테레오(<=2.5°) · Quilt 32-뷰", "5-Plane Off-Axis Projection · 63mm IPD Stereo (<=2.5 deg) · 32-View Quilt"),
    summary: bi(
      "2D 웹툰 레이어(배경·중경·캐릭터·이펙트·말풍선)에 Z-깊이(mm)를 부여해 오프액시스 프러스텀 투영, WebXR SBS 스테레오, 애너글리프 3D, Looking Glass 4×8 Quilt 메타데이터로 실시간 변환합니다.",
      "Assigns Z-depth (mm) to 5 comic layers for real-time off-axis frustum projection, WebXR side-by-side stereo with <=2.5 deg eye-comfort clamping, anaglyph 3D, and 32-view Looking Glass Quilt export.",
    ),
    competitorEdge: bi(
      "기존 2D 컷 제작 도구를 넘어 `.toon-holo.json` 표준 매니페스트로 차세대 공간 웹툰·AR/XR 전시용 입체 컷을 바로 출고합니다.",
      "Extends traditional 2D comic pages directly into spatial WebXR and lightfield exhibition cuts via the portable `.toon-holo.json` manifest.",
    ),
    repoAnchor: "apps/web/src/domains/creator/hologram-webtoon/",
    status: "shipped",
  },
  {
    id: "idea-to-webtoon-6stage",
    categoryTag: bi("멀티에이전트 자동화 · 연재 일관성", "Multi-Agent Automation · Continuity"),
    title: bi("아이디어 → 완성 웹툰 6단계 파이프라인 & 장기 연재 연속성 감사기", "Idea-to-Webtoon 6-Stage Pipeline & Long-Run Continuity Auditor"),
    headlineMetric: bi("1줄 로그라인 → 6단계 서사·캐릭터 DNA·연출·자동 교정·OST → 프로젝트 JSON", "1-Line Logline -> 6 Stages (Story, DNA, Panels, Auto-Repair, OST) -> Project JSON"),
    summary: bi(
      "로그라인 1줄에서 서사 비트·캐릭터 외형/말투 DNA 락·스크롤 호흡/컷 분할·의상/시간대/말풍선 모순 감사 및 원클릭 자동 교정·적응형 감정 OST 큐·에디터용 프로젝트 JSON까지 완결합니다.",
      "Transforms a single logline into story beats, character DNA locks, scroll-paced panel blueprints, continuity contradiction auditing with one-click auto-repair, adaptive OST cues, and editor-ready JSON.",
    ),
    competitorEdge: bi(
      "단순 이미지 1장 생성과 달리 화수 단위 연출 리듬, 장기 연재 설정 일관성, 사운드 호흡까지 결정론적으로 검증해 바로 작화에 넘깁니다.",
      "Goes beyond single-frame image prompts by deterministically auditing episode pacing, character continuity, and music cues before handing off to the canvas.",
    ),
    repoAnchor: "apps/web/src/domains/creator/idea-to-webtoon-engine/",
    status: "shipped",
  },
  {
    id: "uhd-4k-8k-edge-haptic-grid",
    categoryTag: bi("초고해상도 4K~8K · 햅틱 그리드", "UHD 4K-8K · Haptic Grid"),
    title: bi("UHD 4K/5K/8K DPR 엣지 렌더링 예산기 · 반응형 햅틱 그리드", "UHD 4K/5K/8K DPR Edge Render Budgeter & Responsive Haptic Grid"),
    headlineMetric: bi("125~300% 물리 픽셀 스냅(<1e-6) · VRAM 상한 클램프 · >=18px 햅틱 그리드", "125-300% Physical Pixel Snap (<1e-6) · Strict VRAM Clamp · >=18px Haptic Grid"),
    summary: bi(
      "Windows 125%/150%/175% 비정수 배율과 4K/5K/8K 모니터에서 1px 헤어라인 번짐을 제거하고, VRAM 예산에 맞춰 백킹 DPR과 1/2-링 속도 프리페치를 제어하며 줌 25~800% 적응형 자석 햅틱 그리드를 구동합니다.",
      "Eliminates 1px hairline blur on fractional 125-175% and 4K/5K/8K displays, enforces strict VRAM-capped DPR and velocity-directed tile prefetch, and drives a >=18px magnetic haptic grid across 25-800% zoom.",
    ),
    competitorEdge: bi(
      "웹 브라우저의 비정수 스케일 뭉개짐과 8K/모바일 OOM을 수학적 픽셀 스냅 행렬과 결정론적 타일 예산기로 방지합니다.",
      "Prevents fractional-DPR subpixel blur and 8K or 256MiB mobile OOM through exact physical pixel snap matrices and deterministic tile memory budgeting.",
    ),
    repoAnchor: "apps/web/src/domains/creator/render/uhd-edge-grid/",
    status: "verified",
  },
];

export const QUANTITATIVE_PERFORMANCE_METRICS: readonly QuantitativePerformanceMetric[] = [
  {
    id: "endurance-10k-strokes",
    label: bi("장시간 10,000획 지구력 (3840×2160 기준)", "10,000-Stroke Endurance (3840x2160)"),
    toonstudioMeasured: bi("총 14.04ms · p50 0.0009ms · p95 0.005ms · p99 0.0061ms · 힙 증가 +0.74 MB", "14.04ms total · p50 0.0009ms · p95 0.005ms · p99 0.0061ms · +0.74 MB heap"),
    measurementBasis: bi("실측: `scripts/toonstudio-llm-mcp-cli.mjs --bench-stroke --strokes 10000` (고정 Float32Array 링버퍼 + 128타일 LRU + OPFS Undo 20단계 상한)", "Measured via `toonstudio-llm-mcp-cli.mjs --bench-stroke --strokes 10000` (Float32Array ring + 128-tile LRU + 20-step OPFS Undo spill)"),
    competitorBaseline: bi("일반 웹 캔버스: 획 누적 시 배열/스냅샷 팽창으로 GC 스파이크 발생 · 네이티브 앱: OS RAM에 상주", "Typical web canvases suffer GC spikes as stroke arrays grow; native apps hold history in OS RAM"),
    status: "measured",
  },
  {
    id: "stylus-input-prediction",
    label: bi("스타일러스 입력 · 필기감 선행 예측", "Stylus Input & 1-Frame Feel Prediction"),
    toonstudioMeasured: bi("120–240Hz `getCoalescedEvents` + `getPredictedEvents(w=0.65)` + 구심 Catmull-Rom 16.67ms 선행(24ms/48px 클램프)", "120-240Hz coalesced + predicted events (w=0.65) + Centripetal Catmull-Rom 16.67ms lead"),
    measurementBasis: bi("코드 불변식: `gpu-stylus-subpixel-predictor.ts` (`predicted-preview` 권위 분리로 확정 획 오염 0%)", "Code invariant in `gpu-stylus-subpixel-predictor.ts` (isolated predicted-preview authority)"),
    competitorBaseline: bi("Procreate(Metal 120Hz)·CSP(네이티브 WinTab/DirectInk)는 OS 직결 저지연 강점 보유 — 웹 한계를 예측·WebGPU로 추격", "Procreate (Metal 120Hz) & CSP (native WinTab) lead OS latency; ToonStudio closes gap via prediction + WebGPU"),
    status: "spec-verified",
  },
  {
    id: "uhd-edge-haptic-grid",
    label: bi("초고해상도(4K/5K/8K · 125~175%) 엣지 스냅 & 반응형 햅틱 그리드", "UHD 4K/5K/8K & Fractional DPR Edge Snap + Haptic Grid"),
    toonstudioMeasured: bi("물리 픽셀 스냅 오차 < 1e-6 · 1080p~8K/256MiB 모바일 VRAM 0초과 · 줌 25~800% 최소 간격 >= 18px · ±6px 자석 햅틱", "Physical snap error < 1e-6 · 0 VRAM overruns across 1080p-8K & 256MiB mobile · >= 18px spacing (25-800% zoom) · +-6px haptic snap"),
    measurementBasis: bi("단위 검증: `uhd-dpr-tile-budgeter.ts` · `responsive-haptic-grid.ts` (1x/1.25x/1.5x/1.75x/2x/3x · 4그리드 모드 전수 통과)", "Unit-verified in `uhd-dpr-tile-budgeter.ts` & `responsive-haptic-grid.ts` across 1x-3x DPRs and 4 grid modes"),
    competitorBaseline: bi("일반 웹 캔버스는 Windows 125%/150% 배율 1px 흐림·8K VRAM 폭증에 취약 — 물리 픽셀 스냅 행렬과 적응형 DPR 클램프로 해결", "Standard web canvases blur 1px edges at 125-150% scaling and spike VRAM at 8K; solved via snap matrices & adaptive DPR clamp"),
    status: "spec-verified",
  },
  {
    id: "spectral-color-accuracy",
    label: bi("분광 혼색 & 183종 무료 필터 색공간 정밀도", "Spectral Mixing & 183-Filter Color Precision"),
    toonstudioMeasured: bi("7밴드 420–670nm KM7 WGSL SIMD + RGBA16F Display-P3 11노드 그래프 + 183종 무료 필터(86+61+36)", "7-band 420-670nm KM7 WGSL SIMD + RGBA16F Display-P3 11-node graph + 183 free filters (86+61+36)"),
    measurementBasis: bi("단위 테스트 검증: `studio-webgpu-km7-spectral-core.ts` · `studio-engine-canonical-filter-plan.ts` · `master-lut-fx/`", "Unit-tested in `studio-webgpu-km7-spectral-core.ts`, `studio-engine-canonical-filter-plan.ts` & `master-lut-fx/`"),
    competitorBaseline: bi("Rebelle 7(Pigments)·CSP(지각 혼색)·Photoshop(16/32-bit)과 동일 축에서 브라우저 무설치 구현", "Matches perceptual/16-bit precision axis right inside an install-free browser tab"),
    status: "spec-verified",
  },
  {
    id: "local-3d-wasm64-budget",
    label: bi("대용량 3D · 다중 레이어 로컬 메모리 한도", "Large 3D & Multi-Layer Local Memory Cap"),
    toonstudioMeasured: bi("로컬 GLB/VRM 최대 1 GiB · OpenSKP `.skp` 최대 256 MiB · OPFS 누적 16 GiB · 256px Dirty-Tile 128 MiB LRU", "Local GLB/VRM up to 1 GiB · OpenSKP `.skp` 256 MiB · 16 GiB OPFS · 128 MiB Dirty-Tile LRU"),
    measurementBasis: bi("정책 계약: `studio-wasm64-memory-governor.ts` · `studio-webgpu-tile-runtime.ts`", "Enforced in `studio-wasm64-memory-governor.ts` & `studio-webgpu-tile-runtime.ts`"),
    competitorBaseline: bi("Blender는 데스크톱 시스템 RAM/VRAM 전체 활용 가능(절대 용량 우위) · ToonStudio는 0초 웹 진입 + ₩0 서버 저장비 강점", "Blender leverages full desktop RAM/VRAM; ToonStudio pairs zero-install speed with KRW 0 cloud storage"),
    status: "spec-verified",
  },
];

export const SHAPER_3D_BREAKTHROUGH_PILLARS: readonly Shaper3dBreakthroughPillar[] = [
  {
    id: "sdf-anime-face-subd",
    title: bi("① SDF 웹툰 얼굴 음영 맵 + Catmull-Clark SubD 매니폴드", "1. SDF Webtoon Face Shadow Map + Catmull-Clark SubD"),
    honestGapNow: bi("현재 절차적 기본 메시와 구면 노멀 셰이딩은 코·볼에 뭉개진 3D 인형 그림자가 생겨 VRoid·CC4 대비 미형이 떨어집니다.", "Current procedural meshes with spherical normals cast bulbous doll shadows vs. VRoid & CC4."),
    breakthroughArchitecture: bi("얼굴 전용 커스텀 SDF 음영 텍스처 + ≥24분할 SubD 루프 + 매니폴드 0결함 감사(`precision-3d-craft`)로 어느 각도에서도 한국 웹툰 작화 같은 깔끔한 셀 음영을 생성합니다.", "Replaces spherical face normals with custom SDF cel-shadow maps, >=24-loop SubD silhouettes and 0-defect manifold auditing."),
    repoAnchor: "apps/web/src/domains/creator/precision-3d-craft/",
    status: "expanding",
  },
  {
    id: "procedural-hair-garment-drape",
    title: bi("② 스플라인 리본 헤어 + 천사링 셰이더 + 42-소켓 의상 드레이프", "2. Spline Ribbon Hair + Angel-Ring Shader + 42-Socket Drape"),
    honestGapNow: bi("단순 볼륨 머리카락과 피부 밀착형 의상은 로판·현대물 웹툰의 머릿결·옷 주름 디테일을 따라가지 못합니다.", "Simple blob hair and skin-tight outfits lack webtoon hair-strand flow and cloth folds."),
    breakthroughArchitecture: bi("뿌리→끝 테이퍼 베지어 리본 헤어 + 시선 연동 엔젤링 하이라이트 + 42-소켓 본 자동 밀착(`1.5~3mm Anti-Clip`)·패턴 드레이프(`studio-vrm-pattern-sewing-drape.ts`)를 결합합니다.", "Combines tapered Bezier hair ribbons, view-dependent angel-ring highlights and 42-socket anti-clip garment draping."),
    repoAnchor: "apps/web/src/domains/creator/studio-scale-and-3d-fit/",
    status: "current",
  },
  {
    id: "kwebtoon-archetype-foundry",
    title: bi("③ 한국 웹툰 8대 체형·화풍 원클릭 아키타입 & 외부 VRM/Blender 브리지", "3. 8 Korean Webtoon Archetypes & Seamless VRM/Blender Bridge"),
    honestGapNow: bi("수십 개 수치 슬라이더만 주어지면 초보자가 미형 캐릭터를 뽑기 어렵고, 화풍 다양성이 좁아 보입니다.", "Exposing dozens of raw sliders makes attractive character styling hard and limits genre variety."),
    breakthroughArchitecture: bi("로판 8등신·헌터 근육형·학원 7등신·SD 치비 2.5등신·중년/노년·판타지 종족 원클릭 프리셋 + 얼굴 비율 황금률 가드 + 외부 VRoid/Blender `.vrm`/`.glb` 무손실 리타겟을 한 화면에 통합합니다.", "One-click genre archetypes with facial proportion guardrails plus lossless VRoid/Blender `.vrm`/`.glb` import & retarget."),
    repoAnchor: "apps/web/src/domains/creator/vrm/studio-vrm-proportion-core.ts",
    status: "expanding",
  },
  {
    id: "three-layer-lt-canvas-drop",
    title: bi("④ 캔버스 직결 3레이어 출고 (가변 굵기 선화 · 셀 음영 · 파트 ID 마스크)", "4. Direct 3-Layer Canvas Output (Variable Lineart · Cel · Mask)"),
    honestGapNow: bi("3D 셰이퍼 결과물이 단순 3D 스냅샷으로만 들어가면 2D 웹툰 컷 위에서 이질적으로 떠 보입니다.", "Dropping flat 3D snapshots onto a 2D comic panel creates visual mismatch."),
    breakthroughArchitecture: bi("캐릭터 배치 즉시 [1] 크리즈+인버티드 헐 가변 굵기 흑백 선화, [2] 조명 연동 셀 음영, [3] 머리카락·피부·의상 파트 ID 마스크 3개 레이어로 자동 분해해 2D 브러시로 1초 만에 덧칠할 수 있게 합니다.", "Splits any posed character into editable variable-width ink lineart, cel-shading and per-part ID masks in one click."),
    repoAnchor: "apps/web/src/domains/creator/studio-scale-and-3d-fit/",
    status: "current",
  },
];
