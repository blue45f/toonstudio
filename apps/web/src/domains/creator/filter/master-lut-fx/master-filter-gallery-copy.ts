/**
 * 마스터 3D LUT · 웹툰 분위기 · 광학 · 선화추출 갤러리 패널 KO/EN 지역화 문구 사전.
 * EN 모드에서는 모든 문자열에 한글 0자를 보장한다.
 */

import type { MasterFilterLocale } from "./master-filter-lut-catalog";

export interface MasterFilterGalleryCopy {
  readonly kicker: string;
  readonly title: string;
  readonly subtitle: string;
  readonly totalBadge: string;
  readonly freeBadge: string;
  readonly allCategoryLabel: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly beforeLabel: string;
  readonly afterLabel: string;
  readonly splitLabel: string;
  readonly intensityLabel: string;
  readonly applyButton: string;
  readonly appliedBanner: (name: string, pct: number) => string;
  readonly emptySearch: string;
  readonly resetSearch: string;
  readonly pixelDiffLabel: string;
  readonly alphaKeyHint: string;
  readonly filterCountUnit: (count: number) => string;
  readonly previewAriaLabel: (name: string, splitPct: number, intensityPct: number) => string;
}

export const MASTER_FILTER_GALLERY_COPY: Readonly<
  Record<MasterFilterLocale, MasterFilterGalleryCopy>
> = Object.freeze({
  ko: {
    kicker: "RGBA 픽셀 커널 엔진 · 100% 무료",
    title: "마스터 3D LUT · 웹툰 분위기 · 광학 · 선화추출",
    subtitle:
      "가짜 CSS 필터 없이 실제 RGBA 픽셀 버퍼 연산으로 색보정·리소그래프·광학·종이질감·선화추출을 즉시 미리 보고 적용합니다.",
    totalBadge: "기본 86 + Photoshop-Web 61 + 마스터 LUT/웹툰 36 = 총 183종 무료 필터",
    freeBadge: "36종 신규 전부 무료",
    allCategoryLabel: "전체",
    searchLabel: "필터 검색",
    searchPlaceholder: "예: 노을, 포트라, 리소그래프, 갓레이, 선화",
    beforeLabel: "원본 Before",
    afterLabel: "적용 After",
    splitLabel: "Before / After 분할 위치",
    intensityLabel: "필터 강도",
    applyButton: "현재 레이어에 적용",
    appliedBanner: (name, pct) => `${name} 필터를 ${pct}% 강도로 적용했습니다.`,
    emptySearch: "검색 조건에 맞는 필터가 없습니다.",
    resetSearch: "검색 초기화",
    pixelDiffLabel: "실제 픽셀 변화율",
    alphaKeyHint: "투명 알파 채널 출력(체커보드 확인)",
    filterCountUnit: (count) => `${count}종`,
    previewAriaLabel: (name, splitPct, intensityPct) =>
      `${name} 필터 실시간 픽셀 비교 미리보기, 분할 ${splitPct}%, 강도 ${intensityPct}%`,
  },
  en: {
    kicker: "RGBA Pixel Kernel Engine · 100% Free",
    title: "Master 3D LUT · Webtoon Mood · Optical · Line Extract",
    subtitle:
      "Real RGBA pixel-buffer math for color grading, risograph print, optical flares, paper grain, and precision line extraction.",
    totalBadge: "Base 86 + Photoshop-Web 61 + Master LUT/Webtoon 36 = 183 Free Filters Total",
    freeBadge: "All 36 New Filters Free",
    allCategoryLabel: "All",
    searchLabel: "Search filters",
    searchPlaceholder: "e.g. Sunset, Portra, Risograph, God Rays, Sobel",
    beforeLabel: "Before",
    afterLabel: "After",
    splitLabel: "Before / After split position",
    intensityLabel: "Filter intensity",
    applyButton: "Apply to active layer",
    appliedBanner: (name, pct) => `Applied ${name} at ${pct}% intensity.`,
    emptySearch: "No filters match your search.",
    resetSearch: "Clear search",
    pixelDiffLabel: "Active pixel delta",
    alphaKeyHint: "Transparent alpha matte output",
    filterCountUnit: (count) => `${count}`,
    previewAriaLabel: (name, splitPct, intensityPct) =>
      `${name} live pixel comparison preview, split ${splitPct}%, intensity ${intensityPct}%`,
  },
});
