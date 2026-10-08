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
 */

import type { PdfPrintOptions } from "./studio-pdf-print-export";

/** 인쇄 스펙 UI 상태 — 빌더 옵션에 적용 여부(enabled)를 더한 형태다. */
export interface StudioPdfPrintSpecState {
  /** 켜면 PDF 내보내기가 인쇄용 빌더를 탄다. 끄면 기존 기본 경로와 완전히 같다. */
  readonly enabled: boolean;
  /** 재단 여백(mm). 0이면 도련 없음. */
  readonly bleedMm: number;
  /** 재단 마크 렌더링 여부. */
  readonly cropMarks: boolean;
  /** 색상 모드 — cmyk는 JPEG가 아닌 픽셀 래스터 변환을 탄다. */
  readonly colorMode: "rgb" | "cmyk";
  /** 페이지 배열 — booklet은 중철 제본 스프레드 배열. */
  readonly imposition: "none" | "booklet";
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
  if (state.imposition === "booklet") parts.push("중철 스프레드");
  return parts.length > 0 ? parts.join(" · ") : "기본 구성";
}
