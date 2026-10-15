/**
 * studio-book-binding.ts — "책으로 내보내기" 구성 모델 (순수 모듈)
 *
 * 단행본 빌더(studio-book-pdf-export)가 판형 박스만 기록하던 것에, 제본용 책으로 묶을 때 필요한
 * 세 가지를 더한다: ① 페이지 배치(여백 안에 맞춤) ② 쪽 번호 ③ 표지. 판형·도련·안전 여백 수치는
 * 1단계 모델(studio-book-layout-model)의 프리셋을 그대로 쓰고 여기서 새로 정의하지 않는다.
 *
 * 한계(문서·화면에도 같은 문장으로 밝힌다)
 * - 쪽 번호는 PDF 표준 글꼴(Helvetica)의 숫자만 쓴다. 한글·장식 글꼴 번호는 만들지 않는다.
 * - 표지는 작품 제목과 지은이만 놓는 글자 표지다. 일러스트 표지는 첫 페이지로 직접 넣어야 한다.
 * - 세로로 긴 스크롤 원고를 쪽으로 나누지 않는다. 비율을 지켜 안전 영역 안에 한 장으로 맞춘다.
 * - 책등 폭, PDF/X, CMYK, 제본소별 규격 검증은 하지 않는다. 값은 일반적인 무선 제본 기본값이며
 *   인쇄소 규격이 우선이다.
 */

import type { BookPageBoxes, BookPageSide, PdfBox } from "./studio-book-layout-model";

/** 페이지 이미지를 어디까지 채울지. full-bleed = 도련 끝까지(기존 동작), inside-safe = 안전 영역 안에 비율 유지. */
export type BookPagePlacement = "full-bleed" | "inside-safe";

export type BookFolioFormat = "arabic" | "arabic-dash";

export interface BookFolioOptions {
  /** 첫 본문 쪽에 찍을 번호. 표지는 번호를 세지 않는다. */
  readonly startAt: number;
  /** 바깥쪽 아래(왼쪽 면은 왼쪽, 오른쪽 면은 오른쪽) 또는 아래 가운데. */
  readonly anchor: "bottom-outside" | "bottom-center";
  readonly fontSizePt: number;
  readonly format: BookFolioFormat;
}

export interface BookCoverOptions {
  /** 표지에 적을 지은이. 비우면 표지에 지은이 줄을 두지 않는다(제목은 내보내기 제목을 쓴다). */
  readonly author?: string;
}

/** 단행본 요청의 선택 확장. 모두 생략하면 기존 풀블리드 동작과 PDF 바이트가 같다. */
export interface BookBindingLayout {
  readonly placement?: BookPagePlacement;
  readonly folio?: BookFolioOptions;
  readonly cover?: BookCoverOptions;
}

export const DEFAULT_BOOK_FOLIO: BookFolioOptions = Object.freeze({
  startAt: 1,
  anchor: "bottom-outside",
  fontSizePt: 9,
  format: "arabic",
});

/** 책 구성 프리셋 — 판형 프리셋(trimPresetId)에 구성 세 가지를 한 번에 맞춘다. */
export interface BookBindingPreset {
  readonly id: string;
  readonly label: string;
  readonly trimPresetId: string;
  readonly placement: BookPagePlacement;
  readonly folio: boolean;
  readonly cover: boolean;
  readonly cropMarks: boolean;
  readonly dpi: number;
}

export const A5_PORTRAIT_BOOK_PRESET: BookBindingPreset = Object.freeze({
  id: "a5-portrait-book",
  label: "A5 세로 제본 책 (148×210)",
  trimPresetId: "a5",
  placement: "inside-safe",
  folio: true,
  cover: true,
  cropMarks: true,
  dpi: 300,
});

export const BOOK_BINDING_PRESETS: readonly BookBindingPreset[] = Object.freeze([A5_PORTRAIT_BOOK_PRESET]);

export function findBookBindingPreset(id: string): BookBindingPreset | undefined {
  return BOOK_BINDING_PRESETS.find((preset) => preset.id === id);
}

// ── 쪽 번호 ────────────────────────────────────────────────────────────

/** 표준 글꼴 Helvetica의 글자 폭(1000 단위). 쪽 번호에 쓰이는 글자만 둔다. */
const HELVETICA_WIDTHS: Readonly<Record<string, number>> = Object.freeze({
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556,
  "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  "-": 333, " ": 278,
});

export function formatBookFolioText(folio: number, format: BookFolioFormat): string {
  const value = Math.trunc(folio);
  return format === "arabic-dash" ? `- ${value} -` : String(value);
}

export function bookFolioTextWidthPt(text: string, fontSizePt: number): number {
  let units = 0;
  for (const character of text) units += HELVETICA_WIDTHS[character] ?? 556;
  return (units * fontSizePt) / 1000;
}

export interface BookFolioPlacement {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly fontSizePt: number;
}

/**
 * 쪽 번호가 놓일 자리. 아래 여백(재단선과 안전 영역 사이) 띠의 세로 가운데에 글자 중심을 맞추고,
 * 가로는 바깥쪽 가장자리(안전 영역 기준) 또는 안전 영역 가운데로 정한다. 좌표는 PDF pt(좌하단 원점)이며
 * boxes는 재단 마크 여유가 반영된 값을 받는다.
 */
export function placeBookFolio(
  boxes: BookPageBoxes,
  side: BookPageSide,
  folio: number,
  options: BookFolioOptions,
): BookFolioPlacement {
  const text = formatBookFolioText(folio, options.format);
  const width = bookFolioTextWidthPt(text, options.fontSizePt);
  const stripBottom = boxes.trim.y;
  const stripTop = boxes.safe.y;
  const centerY = stripBottom + (stripTop - stripBottom) / 2;
  // 숫자 높이는 글자 크기의 약 0.72배라, 중심에서 0.36배만큼 내린 곳이 기준선이다.
  const y = centerY - options.fontSizePt * 0.36;
  const safeLeft = boxes.safe.x;
  const safeRight = boxes.safe.x + boxes.safe.width;
  let x = safeLeft + (boxes.safe.width - width) / 2;
  if (options.anchor === "bottom-outside") {
    x = side === "left" ? safeLeft : safeRight - width;
  }
  return { text, x, y, fontSizePt: options.fontSizePt };
}

// ── 페이지 이미지 배치 ──────────────────────────────────────────────────

/**
 * 안전 영역 안에 이미지를 비율을 지켜 가운데로 맞춘 박스(PDF pt). 원본 해상도와 무관하게 영역에
 * 맞추므로(작으면 키우고 크면 줄인다) 가로세로 비율이 다른 원고도 찌그러지지 않고 여백이 남는다.
 */
export function fitBoxInside(area: PdfBox, imageWidthPx: number, imageHeightPx: number): PdfBox {
  const scale = Math.min(area.width / imageWidthPx, area.height / imageHeightPx);
  const width = imageWidthPx * scale;
  const height = imageHeightPx * scale;
  return {
    x: area.x + (area.width - width) / 2,
    y: area.y + (area.height - height) / 2,
    width,
    height,
  };
}
