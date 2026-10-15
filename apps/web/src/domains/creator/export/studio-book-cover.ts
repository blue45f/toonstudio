/**
 * studio-book-cover.ts — 책 표지(글자 표지) 그리기
 *
 * 작품 제목과 지은이만 놓는 단순한 타이포그래피 표지다. 일러스트·그림은 넣지 않는다.
 * 한글 글자는 PDF 표준 글꼴로 쓸 수 없으므로(글꼴 임베딩 없음) 브라우저 캔버스로 그려 이미지로 만든 뒤
 * 다른 본문 페이지처럼 JPEG로 PDF에 얹는다. 그리기는 2D 컨텍스트의 작은 부분집합에만 의존해,
 * 기록용 가짜 컨텍스트로 위치·줄바꿈·안전 영역을 테스트할 수 있다.
 *
 * 규칙
 * - 도련까지 포함한 페이지 크기로 그리고(배경은 도련 끝까지), 글자는 전부 안전 영역 안에 둔다.
 * - 제목은 안전 폭 안에서 줄바꿈하고, 너무 길면 글자를 줄여 맞춘다. 글자를 자르거나 말줄임하지 않는다.
 */

import { bookPagePixelSize, bookSafeInsetsMm, type BookTrimSpec } from "./studio-book-layout-model";

/** CanvasRenderingContext2D 중 표지가 쓰는 부분만. 실제 컨텍스트가 그대로 만족한다. */
export interface BookCoverCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): { readonly width: number };
}

export interface BookCoverContent {
  readonly title: string;
  readonly author?: string;
}

export interface BookCoverGeometry {
  /** 도련을 포함한 캔버스 크기(px). */
  readonly widthPx: number;
  readonly heightPx: number;
  /** 안전 영역(캔버스 좌표, 좌상단 원점). */
  readonly safe: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
}

export interface BookCoverLayout {
  readonly titleLines: readonly string[];
  readonly titleFontPx: number;
  readonly authorFontPx: number | null;
}

/** 표지 색은 인쇄 데이터이므로 UI 테마와 무관하게 고정한다(밝은 종이색 + 짙은 잉크 + 포인트 한 가지). */
export const BOOK_COVER_PAPER = "#f6f1e7";
export const BOOK_COVER_INK = "#1d1b19";
export const BOOK_COVER_ACCENT = "#a8431f";
const FONT_STACK = "'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
/** 제목이 이 줄 수를 넘으면 글자를 줄여 다시 맞춘다. */
const MAX_TITLE_LINES = 4;

/**
 * 표지에 쓸 글꼴을 그리기 전에 불러온다. 한글 웹폰트는 글자 범위별 조각으로 나뉘어 있어, 표지 글자가 아직
 * 받아지지 않은 상태에서 캔버스에 그리면 다른 글꼴로 대체되기 때문이다. 브라우저 밖(테스트·서버)이거나
 * 불러오기에 실패해도 조용히 넘어간다 — 그때는 글꼴 목록의 다음 글꼴로 그려지고 표지는 그대로 만들어진다.
 */
export async function loadBookCoverFonts(content: BookCoverContent): Promise<void> {
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!fonts || typeof fonts.load !== "function") return;
  const sample = `${content.title}${content.author ?? ""}`;
  try {
    await Promise.all([800, 500].map((weight) => fonts.load(`${weight} 32px ${FONT_STACK}`, sample)));
  } catch {
    // best-effort: 글꼴 불러오기 실패가 내보내기를 막지 않는다.
  }
}

export function computeBookCoverGeometry(spec: BookTrimSpec, dpi: number): BookCoverGeometry {
  const size = bookPagePixelSize(spec, dpi);
  const pxPerMm = dpi / 25.4;
  const insets = bookSafeInsetsMm(spec, "single");
  const bleed = spec.bleedMm * pxPerMm;
  return {
    widthPx: size.width,
    heightPx: size.height,
    safe: {
      left: bleed + insets.left * pxPerMm,
      top: bleed + insets.top * pxPerMm,
      right: size.width - bleed - insets.right * pxPerMm,
      bottom: size.height - bleed - insets.bottom * pxPerMm,
    },
  };
}

/**
 * 낱말 단위로 줄바꿈하고, 한 낱말이 한 줄보다 길면 글자 단위로 나눈다.
 * measure는 글자 크기가 이미 반영된 폭 측정 함수다. 글자는 하나도 빼지 않는다.
 */
export function wrapBookCoverText(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string[] {
  const words = text.trim().split(/\s+/u).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    // 지금 줄을 닫는다. current는 아래에서 곧바로 새 낱말(또는 글자 조각)로 다시 채워진다.
    if (current) lines.push(current);
    if (measure(word) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const character of word) {
      if (chunk === "" || measure(chunk + character) <= maxWidth) {
        chunk += character;
      } else {
        lines.push(chunk);
        chunk = character;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * 줄 수는 그대로 두고 줄 길이를 고르게 맞춘다 — 마지막 줄에 낱말 하나만 덩그러니 남는 모양을 피한다.
 * 줄 수는 폭이 넓어질수록 늘지 않으므로, 같은 줄 수를 유지하는 가장 좁은 폭을 이분 탐색으로 찾는다.
 * 글자는 하나도 빼지 않는다.
 */
export function balanceBookCoverLines(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string[] {
  const greedy = wrapBookCoverText(text, maxWidth, measure);
  if (greedy.length < 2) return greedy;
  let low = 1;
  // 정수 폭으로 탐색하되 상한은 내림해, 고른 줄이 원래 폭을 넘지 않게 한다.
  let high = Math.floor(maxWidth);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (wrapBookCoverText(text, middle, measure).length <= greedy.length) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  const balanced = wrapBookCoverText(text, high, measure);
  return balanced.length === greedy.length ? balanced : greedy;
}

/** 표지를 컨텍스트에 그린다. 반환값은 실제로 정해진 줄과 글자 크기(테스트·진단용). */
export function drawBookCover(
  ctx: BookCoverCanvasContext,
  geometry: BookCoverGeometry,
  content: BookCoverContent,
): BookCoverLayout {
  const { widthPx, heightPx, safe } = geometry;
  const safeWidth = safe.right - safe.left;
  const safeHeight = safe.bottom - safe.top;
  const centerX = (safe.left + safe.right) / 2;
  const maxTextWidth = safeWidth * 0.9;

  ctx.fillStyle = BOOK_COVER_PAPER;
  ctx.fillRect(0, 0, widthPx, heightPx);

  const measureAt = (fontPx: number, weight: number) => (value: string): number => {
    ctx.font = `${weight} ${fontPx}px ${FONT_STACK}`;
    return ctx.measureText(value).width;
  };

  // 제목 — 큰 글자에서 시작해 정해진 줄 수 안에 들어올 때까지 줄인다(최소 크기에서는 줄 수를 늘려서라도 다 보여 준다).
  const title = content.title.trim();
  const minTitlePx = Math.max(8, Math.round(safeWidth * 0.06));
  let titleFontPx = Math.round(safeWidth * 0.14);
  let titleLines = wrapBookCoverText(title, maxTextWidth, measureAt(titleFontPx, 800));
  while (titleLines.length > MAX_TITLE_LINES && titleFontPx > minTitlePx) {
    titleFontPx = Math.max(minTitlePx, Math.round(titleFontPx * 0.88));
    titleLines = wrapBookCoverText(title, maxTextWidth, measureAt(titleFontPx, 800));
  }
  // 줄 수가 정해진 뒤에는 줄 길이를 고르게 맞춰 마지막 줄에 낱말 하나만 남지 않게 한다.
  titleLines = balanceBookCoverLines(title, maxTextWidth, measureAt(titleFontPx, 800));
  const lineHeight = titleFontPx * 1.3;
  const blockHeight = lineHeight * titleLines.length;
  const blockTop = safe.top + safeHeight * 0.36 - blockHeight / 2;

  ctx.fillStyle = BOOK_COVER_INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${titleFontPx}px ${FONT_STACK}`;
  titleLines.forEach((line, index) => {
    ctx.fillText(line, centerX, blockTop + lineHeight * (index + 0.5));
  });

  // 제목 아래 포인트 선.
  const ruleY = blockTop + blockHeight + titleFontPx * 0.5;
  ctx.strokeStyle = BOOK_COVER_ACCENT;
  ctx.lineWidth = Math.max(2, Math.round(titleFontPx * 0.06));
  ctx.beginPath();
  ctx.moveTo(centerX - safeWidth * 0.09, ruleY);
  ctx.lineTo(centerX + safeWidth * 0.09, ruleY);
  ctx.stroke();

  // 지은이 — 아래쪽 안전 가장자리 위에 한 줄. 너무 길면 글자를 줄이고 그래도 길면 줄을 나눈다.
  const author = content.author?.trim() ?? "";
  let authorFontPx: number | null = null;
  if (author) {
    const minAuthorPx = Math.max(8, Math.round(safeWidth * 0.035));
    let size = Math.max(minAuthorPx, Math.round(titleFontPx * 0.4));
    let authorLines = wrapBookCoverText(author, maxTextWidth, measureAt(size, 500));
    while (authorLines.length > 1 && size > minAuthorPx) {
      size = Math.max(minAuthorPx, Math.round(size * 0.88));
      authorLines = wrapBookCoverText(author, maxTextWidth, measureAt(size, 500));
    }
    authorFontPx = size;
    ctx.fillStyle = BOOK_COVER_INK;
    ctx.textBaseline = "middle";
    ctx.font = `500 ${size}px ${FONT_STACK}`;
    const authorHeight = size * 1.3 * authorLines.length;
    const authorTop = safe.bottom - authorHeight;
    authorLines.forEach((line, index) => {
      ctx.fillText(line, centerX, authorTop + size * 1.3 * (index + 0.5));
    });
  }

  return { titleLines, titleFontPx, authorFontPx };
}
