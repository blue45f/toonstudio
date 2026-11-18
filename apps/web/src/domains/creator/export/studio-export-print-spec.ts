/**
 * Studio PDF 인쇄 스펙 옵션 상태 — 내보내기 메뉴의 "단행본 인쇄 스펙(PDF)" 선택지.
 *
 * 인쇄용 빌더(studio-pdf-print-export.ts)는 이미 병합돼 있었지만 메뉴에서 고를 방법이
 * 없어 닿을 수 없었다. 이 모듈은 그 빌더 옵션(PdfPrintOptions)에 "적용 여부"를 더한
 * UI 상태를 소유하고, 빌더가 받는 형태로 해석(resolve)하는 순수 함수를 제공한다.
 *
 * 지오메트리 초안(studio-export-geometry-draft.ts)과 같은 이유로 모듈 스코프 초안을 둔다:
 * 내보내기 패널은 메뉴가 닫힐 때마다 언마운트되므로, 컴포넌트 상태만으로는 작가가 골라 둔
 * 인쇄 스펙이 닫았다 열면 조용히 사라진다. 초안은 패널 자신의 상태 effect로만 기록한다.
 *
 * 역공학 근거(REA evidence_id):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_4571415adae1548e2078cdaf17fdc17fc7b43d1c9bdbbb5a58461c885bbdd64d
 */

import type { EpubProgressionDirection, EpubRenditionSpread } from "./studio-epub-fixed-layout";
import type { MangaBindingDirection } from "./studio-imposition-creep";
import type { PdfPrintOptions } from "./studio-pdf-print-export";
import type { PrintHalftoneSpotShape, PrintMonochromeMode } from "./studio-print-monochrome";

export interface StudioEpubAndPrintAdvancedState {
  readonly epubProgressionDirection: EpubProgressionDirection;
  readonly epubSpread: EpubRenditionSpread;
  readonly kdpComicCompatible: boolean;
  readonly monochromeEnabled: boolean;
  readonly monochromeMode: PrintMonochromeMode;
  readonly halftoneLpi: number;
  readonly halftoneDpi: 600 | 1200;
  readonly halftoneAngleDeg: number;
  readonly halftoneSpotShape: PrintHalftoneSpotShape;
  readonly solidInkThreshold: number;
  readonly saddleCreepEnabled: boolean;
  readonly maxCreepMm: number;
  readonly runningStampEnabled: boolean;
}

export const DEFAULT_STUDIO_EPUB_AND_PRINT_ADVANCED_STATE: StudioEpubAndPrintAdvancedState =
  Object.freeze({
    epubProgressionDirection: "ltr",
    epubSpread: "landscape",
    kdpComicCompatible: true,
    monochromeEnabled: false,
    monochromeMode: "monochrome-1bit",
    halftoneLpi: 60,
    halftoneDpi: 600,
    halftoneAngleDeg: 45,
    halftoneSpotShape: "dot",
    solidInkThreshold: 45,
    saddleCreepEnabled: false,
    maxCreepMm: 1.5,
    runningStampEnabled: false,
  });

/** 인쇄 스펙 UI 상태 — 빌더 옵션에 적용 여부(enabled)를 더한 형태다. */
export interface StudioPdfPrintSpecState {
  /** 켜면 PDF 내보내기가 인쇄용 빌더를 탄다. 끄면 기존 기본 경로와 완전히 같다. */
  readonly enabled: boolean;
  /** 재단 여백(mm). 0이면 도련 없음. */
  readonly bleedMm: number;
  /** 재단 마크 렌더링 여부. */
  readonly cropMarks: boolean;
  /** 색상 모드 — cmyk/grayscale/monochrome-1bit는 픽셀 래스터 변환을 탄다. */
  readonly colorMode: "rgb" | "cmyk" | "grayscale" | "monochrome-1bit";
  /** 페이지 배열 — booklet은 중철 제본 스프레드 배열. */
  readonly imposition: "none" | "booklet";
  /** 제본 방향 — "rtl"은 일본 출판 만화식 우철 제본. */
  readonly bindingDirection?: MangaBindingDirection;
  /** 중철 밀림 보정 폭(mm). */
  readonly creepMm?: number;
  /** 1비트 모노크롬 망점 선수(LPI). */
  readonly halftoneLpi?: number;
  /** 1비트 모노크롬 출력 해상도(DPI). */
  readonly halftoneDpi?: 600 | 1200;
  /** 1비트 모노크롬 망점 회전각(도). */
  readonly halftoneAngleDeg?: number;
  /** 1비트 모노크롬 망점 모양. */
  readonly halftoneSpotShape?: PrintHalftoneSpotShape;
  /** 순흑 먹선 보호 임계값(0..255). */
  readonly solidInkThreshold?: number;
  /** 바깥 여백 작품명·회차·쪽번호 스탬프 인쇄 여부. */
  readonly runningStampEnabled?: boolean;
}

/** 기본 상태 — 적용 안 함. 패널 첫 mount와 테스트 리셋의 기준값이다. */
export const DEFAULT_STUDIO_PDF_PRINT_SPEC: StudioPdfPrintSpecState = {
  enabled: false,
  bleedMm: 0,
  cropMarks: false,
  colorMode: "rgb",
  imposition: "none",
};

let draft: StudioPdfPrintSpecState | null = null;

export function readStudioPdfPrintSpecDraft(): StudioPdfPrintSpecState | null {
  return draft;
}

export function writeStudioPdfPrintSpecDraft(next: StudioPdfPrintSpecState): void {
  draft = next;
}

/** Test-only reset so one case's print spec cannot leak into the next. */
export function resetStudioPdfPrintSpecDraft(): void {
  draft = null;
}

/**
 * UI 상태 → 빌더 옵션. 비활성이면 undefined를 돌려준다 — 호출자는 print 키 자체를
 * 생략해야 하고, 그래야 렌더러가 기존 기본 빌더 경로(기본 라이터와 바이트 동등)를
 * 그대로 탄다. 활성인데 전부 기본값이면 기본값 그대로의 옵션을 돌려주며, 이 경우도
 * 빌더가 기본 라이터와 바이트 동등을 회귀 테스트로 보장한다.
 */
export function resolvePdfPrintOptions(
  state: StudioPdfPrintSpecState
): PdfPrintOptions | undefined {
  if (!state.enabled) return undefined;
  return {
    bleedMm: state.bleedMm,
    cropMarks: state.cropMarks,
    colorMode: state.colorMode,
    imposition: state.imposition,
    ...(state.bindingDirection && state.bindingDirection !== "ltr"
      ? { bindingDirection: state.bindingDirection }
      : {}),
    ...(state.creepMm !== undefined && state.creepMm > 0
      ? { creepMm: state.creepMm }
      : {}),
    ...(state.halftoneLpi !== undefined ? { halftoneLpi: state.halftoneLpi } : {}),
    ...(state.halftoneDpi !== undefined ? { halftoneDpi: state.halftoneDpi } : {}),
    ...(state.halftoneAngleDeg !== undefined ? { halftoneAngleDeg: state.halftoneAngleDeg } : {}),
    ...(state.halftoneSpotShape !== undefined
      ? { halftoneSpotShape: state.halftoneSpotShape }
      : {}),
    ...(state.solidInkThreshold !== undefined
      ? { solidInkThreshold: state.solidInkThreshold }
      : {}),
    ...(state.runningStampEnabled === true ? { runningStampEnabled: true } : {}),
  };
}

/**
 * 적용 중인 인쇄 스펙의 한 줄 요약 — 기본값에서 벗어난 항목만 추려 상태 표시에 쓴다.
 * 전부 기본값이면 "기본 구성"이라고만 말한다(적용 사실 자체는 호출자가 붙인다).
 */
export function describePdfPrintSpec(state: StudioPdfPrintSpecState): string {
  const parts: string[] = [];
  if (state.bleedMm > 0) parts.push(`도련 ${state.bleedMm}mm`);
  if (state.cropMarks) parts.push("재단 마크");
  if (state.colorMode === "cmyk") parts.push("CMYK");
  if (state.colorMode === "grayscale") parts.push("그레이스케일");
  if (state.colorMode === "monochrome-1bit") {
    parts.push(state.halftoneLpi ? `1비트 망점(${state.halftoneLpi}LPI)` : "1비트 망점");
  }
  if (state.imposition === "booklet") parts.push("중철 스프레드");
  if (state.bindingDirection === "rtl") parts.push("우철(RTL)");
  if (state.creepMm !== undefined && state.creepMm > 0) {
    parts.push(`중철 밀림 ${state.creepMm}mm`);
  }
  if (state.runningStampEnabled) parts.push("여백 쪽번호");
  return parts.length > 0 ? parts.join(" · ") : "기본 구성";
}
