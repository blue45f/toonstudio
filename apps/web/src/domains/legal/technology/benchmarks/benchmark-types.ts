import type { LocalizedText } from "../engineering-story-content";

export type BenchmarkLocale = "ko" | "en";

export type BenchmarkCategoryId =
  | "brushes"
  | "filters"
  | "collab-office"
  | "3d-studio"
  | "ai-assist";

export type BenchmarkSupportLevel = "full" | "partial" | "plugin" | "none";

export type BenchmarkMaturity = "current" | "in-progress" | "target";

export interface BenchmarkSubGroup {
  readonly id: string;
  readonly label: LocalizedText;
  readonly description: LocalizedText;
}

export interface BenchmarkToolProfile {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly role: LocalizedText;
  readonly pricing: LocalizedText;
  readonly platform: LocalizedText;
  readonly benchmarkTakeaway: LocalizedText;
  readonly honestStrength: LocalizedText;
}

export interface BenchmarkCell {
  readonly level: BenchmarkSupportLevel;
  readonly summary: LocalizedText;
  readonly detail?: LocalizedText;
}

export interface BenchmarkRow {
  readonly id: string;
  readonly subGroupId: string;
  readonly title: LocalizedText;
  readonly metricTag: LocalizedText;
  readonly toonstudioMaturity: BenchmarkMaturity;
  readonly benchmarkOrigin: LocalizedText;
  readonly evidenceSummary: LocalizedText;
  readonly evidencePaths: readonly string[];
  readonly honestLimit: LocalizedText;
  readonly cells: Readonly<Record<string, BenchmarkCell>>;
}

export interface BenchmarkHonestTradeoff {
  readonly competitorId: string;
  readonly competitorName: string;
  readonly area: LocalizedText;
  readonly competitorEdge: LocalizedText;
  readonly toonstudioPosition: LocalizedText;
}

export interface BenchmarkDataset {
  readonly id: BenchmarkCategoryId;
  readonly path: string;
  readonly shortLabel: LocalizedText;
  readonly eyebrow: string;
  readonly title: LocalizedText;
  readonly subtitle: LocalizedText;
  readonly scopeNote: LocalizedText;
  readonly snapshotDate: string;
  readonly tools: readonly BenchmarkToolProfile[];
  readonly subGroups: readonly BenchmarkSubGroup[];
  readonly rows: readonly BenchmarkRow[];
  readonly honestTradeoffs: readonly BenchmarkHonestTradeoff[];
}

export interface BenchmarkCategoryNavItem {
  readonly id: BenchmarkCategoryId;
  readonly path: string;
  readonly shortLabel: LocalizedText;
  readonly title: LocalizedText;
  readonly summary: LocalizedText;
  readonly badge: LocalizedText;
}

export interface BenchmarkCrossLink {
  readonly id: string;
  readonly path: string;
  readonly label: LocalizedText;
  readonly description: LocalizedText;
  readonly badge: LocalizedText;
}

export interface BenchmarkSupportMeta {
  readonly label: LocalizedText;
  readonly shortLabel: LocalizedText;
  readonly tone: "good" | "warn" | "cool" | "neutral";
}

export const BENCHMARK_SNAPSHOT_DATE = "2026-11-22";

export const BENCHMARK_HUB_PATH = "/about/technology/benchmarks";

export const BENCHMARK_SUPPORT_META: Readonly<Record<BenchmarkSupportLevel, BenchmarkSupportMeta>> = {
  full: {
    label: { ko: "완전 지원", en: "Full support" },
    shortLabel: { ko: "지원", en: "Full" },
    tone: "good",
  },
  partial: {
    label: { ko: "부분 지원", en: "Partial support" },
    shortLabel: { ko: "부분", en: "Partial" },
    tone: "warn",
  },
  plugin: {
    label: { ko: "플러그인·외부", en: "Plugin / external" },
    shortLabel: { ko: "외부", en: "Plugin" },
    tone: "cool",
  },
  none: {
    label: { ko: "미지원", en: "Not supported" },
    shortLabel: { ko: "미지원", en: "None" },
    tone: "neutral",
  },
};

export const BENCHMARK_MATURITY_META: Readonly<
  Record<BenchmarkMaturity, { readonly label: LocalizedText; readonly tone: "good" | "warn" | "cool" }>
> = {
  current: {
    label: { ko: "현재 구현 (Current)", en: "Current" },
    tone: "good",
  },
  "in-progress": {
    label: { ko: "고도화 중 (In progress)", en: "In progress" },
    tone: "warn",
  },
  target: {
    label: { ko: "향후 목표 (Target)", en: "Target" },
    tone: "cool",
  },
};

export const BENCHMARK_CATEGORY_NAV: readonly BenchmarkCategoryNavItem[] = [
  {
    id: "brushes",
    path: "/about/technology/benchmarks/brushes",
    shortLabel: { ko: "브러시 15종", en: "15 Brushes" },
    title: { ko: "브러시 종류별 정밀 벤치마크", en: "Granular brush engine benchmark" },
    summary: {
      ko: "연필·G펜·유체 수채화·임파스토·오일파스텔·마커·듀얼/갈필·커스텀 스튜디오를 CSP·Procreate·Krita·Rebelle 7·Photoshop·Magma와 1:1 대조합니다.",
      en: "1:1 comparison across 15 brush categories against CSP, Procreate, Krita, Rebelle 7, Photoshop and Magma.",
    },
    badge: { ko: "7개 도구 · 15항목", en: "7 tools · 15 items" },
  },
  {
    id: "filters",
    path: "/about/technology/benchmarks/filters",
    shortLabel: { ko: "필터 15종", en: "15 Filters" },
    title: { ko: "필터·보정·변형 항목별 정밀 벤치마크", en: "Granular filter & retouching benchmark" },
    summary: {
      ko: "블러·선명화·Float32 주파수 분리·PatchMatch 인페인팅·액화·7밴드 분광 필터·스마트 필터·GPU 스크린톤·JFA 외곽선을 6개 도구로 검증합니다.",
      en: "1:1 breakdown across blur, Float32 frequency separation, local PatchMatch, liquify, spectral filters, smart stacks and GPU screentone.",
    },
    badge: { ko: "6개 도구 · 15항목", en: "6 tools · 15 items" },
  },
  {
    id: "collab-office",
    path: "/about/technology/benchmarks/collab-office",
    shortLabel: { ko: "협업·가상 오피스", en: "Collab & Office" },
    title: { ko: "실시간 협업 & 가상 스튜디오 벤치마크", en: "Realtime collaboration & virtual studio benchmark" },
    summary: {
      ko: "Yjs CRDT 오프라인 동기화·동시 드로잉·리뷰 핀·분업 OS·가상 오피스 모션/먼지/WebAudio를 Magma·Gather·ZEP·Figma·Creco·Miro·Frame.io와 비교합니다.",
      en: "Compare Yjs CRDT sync, review pins, Division OS and virtual studio motion/SFX against Magma, Gather, ZEP, Figma, Creco, Miro and Frame.io.",
    },
    badge: { ko: "8개 도구 · 14항목", en: "8 tools · 14 items" },
  },
  {
    id: "3d-studio",
    path: "/about/technology/benchmarks/3d-studio",
    shortLabel: { ko: "3D·CAD·조형", en: "3D & CAD" },
    title: { ko: "3D 배경·VRM·CAD·조형·선화/천 벤치마크", en: "3D stage, VRM, CAD, sculpt & HLR benchmark" },
    summary: {
      ko: "Wasm64 대용량 로드·SKP 변환·HLR 벡터 선화·광원 동기화·PBD 천·CAD/스컬프를 Blender·SketchUp·ACON3D·CSP 3D·DesignDoll·Shapr3D·Nomad·Spline·Tooning Plus와 비교합니다.",
      en: "Compare Wasm64 intake, HLR lineart, light sync, PBD cloth, CAD and sculpt against Blender, SketchUp, ACON3D, CSP 3D, DesignDoll, Shapr3D, Nomad, Spline and Tooning Plus.",
    },
    badge: { ko: "10개 도구 · 15항목", en: "10 tools · 15 items" },
  },
  {
    id: "ai-assist",
    path: "/about/technology/benchmarks/ai-assist",
    shortLabel: { ko: "AI 보조·권리", en: "AI Assist & Rights" },
    title: { ko: "AI 보조 · 결정적 자동화 · 저작권 보호 벤치마크", en: "AI assist, deterministic automation & rights benchmark" },
    summary: {
      ko: "₩0 로컬 Watershed 밑색·PatchMatch·HLR·광원 동기화·시선 검사·스마트 태깅·Rights BOM을 Tooning Plus·Photoshop(Firefly)·Krita AI·CSP·Canva/ComfyUI와 비교합니다.",
      en: "Compare KRW 0 local deterministic assistance and fail-closed Rights BOM against Tooning Plus, Photoshop Firefly, Krita AI, CSP and Canva/ComfyUI.",
    },
    badge: { ko: "6개 도구 · 12항목", en: "6 tools · 12 items" },
  },
];

const DRAWING_COMPARE_SUITE_PATH = "/about/technology/drawing-compare";
const SERVICE_COMPARE_SUITE_PATH = "/about/compare";
const TECH_HUB_SUITE_PATH = "/about/technology";
const TECH_LIBRARIES_SUITE_PATH = "/about/technology/libraries";

export const BENCHMARK_CROSS_LINKS: readonly BenchmarkCrossLink[] = [
  {
    id: "drawing-compare",
    path: DRAWING_COMPARE_SUITE_PATH,
    label: { ko: "드로잉 툴 8종 종합 비교", en: "8-tool drawing comparison" },
    description: {
      ko: "브러시·필터·안료 물리·선화·협업 7대 축을 드로잉 관점에서 한 화면에 모아 비교합니다.",
      en: "All-in-one comparison of 8 drawing apps across pigment physics, filters, lettering and collaboration.",
    },
    badge: { ko: "드로잉 종합", en: "Drawing matrix" },
  },
  {
    id: "service-compare",
    path: SERVICE_COMPARE_SUITE_PATH,
    label: { ko: "서비스 전체 경쟁 도구 7종 비교", en: "Full product comparison (7 tools)" },
    description: {
      ko: "제작 전 과정(드로잉·3D·식자·협업·비용)과 상황별 도구 조합 가이드를 확인합니다.",
      en: "End-to-end production comparison, pricing structures and coexistence decision scenarios.",
    },
    badge: { ko: "전 영역 요약", en: "Full overview" },
  },
  {
    id: "tech-hub",
    path: TECH_HUB_SUITE_PATH,
    label: { ko: "기술과 신뢰 허브", en: "Technology & trust hub" },
    description: {
      ko: "아키텍처 지도, 40개 제작 스토리, 세미나 발표 모드, 장애·교훈 기록으로 이어집니다.",
      en: "Continue to the architecture map, 40 engineering chapters, deck mode and incident lessons.",
    },
    badge: { ko: "기술 허브", en: "Tech hub" },
  },
  {
    id: "tech-libraries",
    path: TECH_LIBRARIES_SUITE_PATH,
    label: { ko: "주요 라이브러리와 선택 이유", en: "Core libraries & rationale" },
    description: {
      ko: "WebGPU, Three.js, Yjs, SQLite WASM, OpenSKP 등 채택 근거와 대안 검토 기록을 봅니다.",
      en: "Inspect why each core library was chosen and which alternatives were evaluated.",
    },
    badge: { ko: "선택 근거", en: "Libraries" },
  },
];

export function pickBenchmarkText(text: LocalizedText, locale: BenchmarkLocale): string {
  return locale === "en" ? text.en : text.ko;
}

export interface BenchmarkFilterOptions {
  readonly subGroupId: string;
  readonly query: string;
  readonly levelFilter: "all" | "full" | "watch";
  readonly locale: BenchmarkLocale;
}

export function filterBenchmarkRows(
  rows: readonly BenchmarkRow[],
  options: BenchmarkFilterOptions,
): readonly BenchmarkRow[] {
  const normalizedQuery = options.query.trim().toLowerCase();

  return rows.filter((row) => {
    if (options.subGroupId !== "all" && row.subGroupId !== options.subGroupId) {
      return false;
    }

    const tsCell = row.cells["toonstudio"];
    if (options.levelFilter === "full" && tsCell?.level !== "full") {
      return false;
    }
    if (options.levelFilter === "watch" && tsCell?.level === "full" && row.toonstudioMaturity === "current") {
      return false;
    }

    if (!normalizedQuery) return true;

    const haystack = [
      row.title.ko,
      row.title.en,
      row.metricTag.ko,
      row.metricTag.en,
      row.benchmarkOrigin.ko,
      row.benchmarkOrigin.en,
      row.evidenceSummary.ko,
      row.evidenceSummary.en,
      row.honestLimit.ko,
      row.honestLimit.en,
      ...row.evidencePaths,
      ...Object.values(row.cells).flatMap((cell) => [
        cell.summary.ko,
        cell.summary.en,
        cell.detail?.ko ?? "",
        cell.detail?.en ?? "",
      ]),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export interface BenchmarkToolCoverageSummary {
  readonly toolId: string;
  readonly full: number;
  readonly partial: number;
  readonly plugin: number;
  readonly none: number;
  readonly total: number;
}

export function summarizeToolSupport(
  rows: readonly BenchmarkRow[],
  toolId: string,
): BenchmarkToolCoverageSummary {
  let full = 0;
  let partial = 0;
  let plugin = 0;
  let none = 0;

  for (const row of rows) {
    const level = row.cells[toolId]?.level ?? "none";
    if (level === "full") full += 1;
    else if (level === "partial") partial += 1;
    else if (level === "plugin") plugin += 1;
    else none += 1;
  }

  return { toolId, full, partial, plugin, none, total: rows.length };
}
