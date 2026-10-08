/**
 * 슬라이드가 16:9 고정 프레임 안에서 넘치지 않도록 글자 크기·문단 길이를 정하는 순수 함수.
 *
 * 슬라이드는 `overflow: hidden`이라 넘쳐도 아무 경고가 없다. 그래서 길이를 "글자 수"가 아니라
 * 화면 폭(영문 1, 한글·한자 2)으로 재고, 칸에 들어가는 가장 큰 글자 크기를 계산해 CSS 변수로 넘긴다.
 * 모든 길이 단위는 슬라이드 폭의 1%(cqw)다.
 */

const CJK_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x11ff],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
];

function isWide(codePoint: number): boolean {
  return CJK_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
}

/** 화면 폭 단위: 영문·숫자 1, 한글·한자·전각 2. */
export function visualWidth(text: string): number {
  let width = 0;
  for (const character of text) width += isWide(character.codePointAt(0) ?? 0) ? 2 : 1;
  return width;
}

/** 글꼴·브라우저마다 글자 폭이 조금씩 달라 어림값에 곱하는 여유(4%). 실제 측정과 비교해 줄 수를 낮게 세는 일이 없도록 정했다. */
const WRAP_SAFETY = 1.04;

/**
 * 글자 크기(`fontSize`, 슬라이드 폭의 %)로 `width`(같은 단위) 안에 글을 쓸 때 줄 수를 어림한다.
 * 비례 글꼴은 화면 폭 한 단위가 0.5em(한글 한 글자 = 2단위 = 1em), 고정폭 글꼴은 한 단위가 0.6em 이다.
 * 브라우저처럼 공백에서만 줄을 바꾸고(슬라이드는 `word-break: keep-all`) 한 줄보다 긴 낱말만 낱말 중간에서 끊는다.
 * 그래서 낱말 경계에서 줄 끝이 남는 손실까지 따라간다(단순히 폭을 줄 길이로 나누면 큰 제목에서 한 줄씩 모자라게 센다).
 * 굵은 글꼴은 호출하는 쪽이 글자 크기에 곱해서(`fontSize × 1.1` 등) 넘긴다.
 */
export function wrappedLineCount(text: string, fontSize: number, width: number, kind: "prop" | "mono" = "prop"): number {
  const unit = fontSize * (kind === "mono" ? 0.6 : 0.5) * WRAP_SAFETY;
  const limit = Math.max(unit, width);
  let lines = 1;
  let used = 0;
  for (const token of text.match(/\s+|\S+/gu) ?? []) {
    if (/^\s/u.test(token)) {
      used = Math.min(limit, used + token.length * unit);
      continue;
    }
    const tokenWidth = visualWidth(token) * unit;
    if (used + tokenWidth <= limit + 1e-9) {
      used += tokenWidth;
      continue;
    }
    if (used > 0) lines += 1;
    if (tokenWidth > limit) {
      const extra = Math.ceil(tokenWidth / limit - 1e-9) - 1;
      lines += extra;
      used = tokenWidth - extra * limit;
    } else used = tokenWidth;
  }
  return lines;
}

const SENTENCE_END = new Set([".", "!", "?", "。", "…"]);

/** 마침표 뒤에 공백이 오는 곳에서만 문장을 나눈다(3.5 같은 소수는 나누지 않는다). */
export function splitSentences(text: string): readonly string[] {
  const sentences: string[] = [];
  let current = "";
  const characters = [...text];
  characters.forEach((character, index) => {
    current += character;
    const next = characters[index + 1];
    if (SENTENCE_END.has(character) && (next === undefined || /\s/u.test(next))) {
      sentences.push(current.trim());
      current = "";
    }
  });
  if (current.trim()) sentences.push(current.trim());
  return sentences;
}

export interface ClippedText {
  readonly text: string;
  readonly clipped: boolean;
}

/**
 * 슬라이드에 올릴 수 있는 길이로 문단을 줄인다. 문장 단위로 앞에서부터 담고,
 * 첫 문장부터 넘치면 글자 단위로 자른다. 줄였는지 여부를 함께 돌려줘 호출자가 전문을 노트에 둘 수 있게 한다.
 */
export function clipForSlide(text: string, maxWidth: number): ClippedText {
  const trimmed = text.trim();
  if (visualWidth(trimmed) <= maxWidth) return { text: trimmed, clipped: false };
  let result = "";
  for (const sentence of splitSentences(trimmed)) {
    const next = result ? `${result} ${sentence}` : sentence;
    if (visualWidth(next) + 2 > maxWidth) break;
    result = next;
  }
  if (result) return { text: `${result} …`, clipped: true };
  let cut = "";
  let width = 0;
  for (const character of trimmed) {
    const step = isWide(character.codePointAt(0) ?? 0) ? 2 : 1;
    if (width + step + 2 > maxWidth) break;
    cut += character;
    width += step;
  }
  return { text: `${cut.trimEnd()}…`, clipped: true };
}

/** 한 문단이 이 폭(화면 폭 단위)을 넘으면 `chapter`·`tech` 카드의 글자를 줄인다. */
export const DECK_POINT_DENSE_WIDTH = 190;
export const DECK_POINT_TIGHT_WIDTH = 250;
/** 슬라이드 한 칸에 올리는 문단의 절대 상한(화면 폭 단위). 그보다 길면 모델이 줄이고 전문은 노트에 둔다. */
export const DECK_POINT_MAX_WIDTH = 300;

export type DeckDensity = "normal" | "dense" | "tight";

/** 칸마다 들어가는 문단 중 가장 긴 것의 화면 폭으로 글자 크기 단계를 고른다. */
export function deckDensity(widths: readonly number[]): DeckDensity {
  const longest = widths.reduce((max, width) => Math.max(max, width), 0);
  if (longest > DECK_POINT_TIGHT_WIDTH) return "tight";
  if (longest > DECK_POINT_DENSE_WIDTH) return "dense";
  return "normal";
}

/* ── 코드 ────────────────────────────────────────────────── */

export interface FitBox {
  /** 사용할 수 있는 너비와 높이(슬라이드 폭의 %). */
  readonly width: number;
  readonly height: number;
}

/** 슬라이드 코드 표면의 치수(engineering-surfaces.css 의 `data-variant="slide"` 규칙과 같아야 한다). */
const CODE = {
  lineHeight: 1.62,
  verticalPadding: 2.2,
  horizontalPadding: 2.6,
  /** 고정폭 글꼴의 한 칸 폭(글자 크기 배수). 한글은 두 칸. */
  advance: 0.6,
  maxSize: 1.7,
  /** 30줄에 긴 줄이 섞인 코드도 담을 수 있는 최소 크기. 이보다 작으면 읽을 수 없어 스크롤로 넘긴다. */
  minSize: 0.76,
  step: 0.02,
  /** 줄바꿈 없는 크기가 이 값 이상이면 충분히 읽혀서 그대로 쓴다. */
  noWrapReadable: 1,
  /** 줄바꿈 없는 크기가 줄바꿈 허용 크기의 이 비율 이상이면 줄바꿈 없는 쪽을 쓴다. */
  noWrapShare: 0.88,
} as const;

/**
 * 코드 한 줄이 `columns` 칸 안에서 몇 줄로 접히는지 센다. 브라우저처럼 공백에서 끊고, 한 줄보다 긴 낱말만 낱말 중간에서 끊는다.
 * 줄 끝 공백은 폭에 넣지 않는다. 단어 경계에서 줄 끝이 남는 손실까지 따라가므로 "폭 ÷ 칸 수"보다 정확하다(실제 측정과 비교해 확인했다).
 */
export function codeLineRows(line: string, columns: number): number {
  if (visualWidth(line) <= columns) return 1;
  let rows = 1;
  let used = 0;
  for (const word of line.match(/\s+|\S+/gu) ?? []) {
    const width = visualWidth(word);
    if (/^\s/u.test(word)) {
      used = Math.min(columns, used + width);
      continue;
    }
    if (used + width <= columns) {
      used += width;
      continue;
    }
    if (used > 0) rows += 1;
    if (width > columns) {
      const extra = Math.ceil(width / columns) - 1;
      rows += extra;
      used = width - extra * columns;
    } else used = width;
  }
  return rows;
}

function wrappedRows(lines: readonly string[], columns: number): number {
  return lines.reduce((rows, line) => rows + codeLineRows(line, columns), 0);
}

/** 코드 표면이 정한 글자 크기와 줄 높이(글자 크기 배수). */
export interface CodeLayout {
  readonly size: number;
  readonly lineHeight: number;
}

/** 줄 높이를 줄여도 최소 크기에서 안 들어가는 아주 긴 코드를 위한 단계(읽을 수 있는 한계까지만 줄인다). */
const CODE_TIGHT_LINE_HEIGHTS = [1.5, 1.42] as const;

/**
 * 코드가 영역에 모두 들어가는 가장 큰 글자 크기(cqw)와 줄 높이를 정한다.
 * 줄바꿈 없이 들어가는 크기를 먼저 쓰되, 그 크기가 너무 작으면(긴 줄 하나 때문에 전체를 줄이는 경우) 줄바꿈을 허용한 더 큰 크기를 쓴다.
 * 그래도 최소 크기에서 넘치면 줄 높이를 조금씩 줄이고, 그래도 안 되면 최소 크기를 돌려준다(코드 표면이 스크롤한다).
 * 슬라이드의 코드는 가로 스크롤 대신 줄바꿈하므로(발표 중에는 스크롤할 수 없다) 줄바꿈된 줄 수까지 센다.
 */
export function fitCodeLayout(code: string, box: FitBox): CodeLayout {
  const lines = code.replace(/\n+$/u, "").split("\n");
  const widest = lines.reduce((max, line) => Math.max(max, visualWidth(line)), 0);
  const columnsAt = (size: number): number => Math.max(8, Math.floor((box.width - CODE.horizontalPadding) / (size * CODE.advance)));
  const fits = (size: number, lineHeight: number): boolean =>
    wrappedRows(lines, columnsAt(size)) * size * lineHeight + CODE.verticalPadding <= box.height;
  const largest = (allowWrap: boolean): number | null => {
    for (let size = CODE.maxSize; size >= CODE.minSize - 1e-9; size -= CODE.step) {
      // 한 줄이 열 수에 딱 맞으면 글꼴 오차로 줄바꿈될 수 있어 한 칸 여유를 둔다.
      if (!allowWrap && widest > columnsAt(size) - 1) continue;
      if (fits(size, CODE.lineHeight)) return Math.round(size * 100) / 100;
    }
    return null;
  };
  const noWrap = largest(false);
  const wrap = largest(true);
  if (noWrap !== null && (wrap === null || noWrap >= CODE.noWrapReadable || noWrap >= wrap * CODE.noWrapShare)) {
    return { size: noWrap, lineHeight: CODE.lineHeight };
  }
  if (wrap !== null) return { size: wrap, lineHeight: CODE.lineHeight };
  for (const lineHeight of CODE_TIGHT_LINE_HEIGHTS) {
    if (fits(CODE.minSize, lineHeight)) return { size: CODE.minSize, lineHeight };
  }
  return { size: CODE.minSize, lineHeight: CODE_TIGHT_LINE_HEIGHTS.at(-1) ?? CODE.lineHeight };
}

/** 코드가 영역에 들어가는 가장 큰 글자 크기(cqw). 줄 높이까지 필요하면 `fitCodeLayout`을 쓴다. */
export function fitCodeFontSize(code: string, box: FitBox): number {
  return fitCodeLayout(code, box).size;
}

/* ── 표 ──────────────────────────────────────────────────── */

export interface FitTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

const TABLE = {
  lineHeight: 1.4,
  cellPaddingX: 1.1,
  cellPaddingY: 0.55,
  /** 비례 글꼴의 화면 폭 단위당 폭(글자 크기 배수). 한글 한 글자(2단위) ≈ 1em. */
  advance: 0.52,
  maxSize: 1.7,
  minSize: 0.9,
  step: 0.05,
  /** 헤더 행은 한 줄로 가정한다. */
  headerLines: 1.2,
} as const;

/** 열 폭을 내용 길이에 비례해 나눈다(너무 좁거나 넓어지지 않게 제한). */
export function tableColumnWidths(table: FitTable, totalWidth: number): readonly number[] {
  const weights = table.columns.map((column, index) => {
    const longest = Math.max(
      visualWidth(column),
      ...table.rows.map((row) => visualWidth(row[index] ?? "")),
    );
    return Math.min(46, Math.max(10, longest));
  });
  const sum = weights.reduce((total, weight) => total + weight, 0) || 1;
  return weights.map((weight) => (weight / sum) * totalWidth);
}

/** 표가 영역 안에 다 들어가는 가장 큰 글자 크기(cqw). */
export function fitTableFontSize(table: FitTable, box: FitBox): number {
  const widths = tableColumnWidths(table, box.width);
  for (let size = TABLE.maxSize; size >= TABLE.minSize - 1e-9; size -= TABLE.step) {
    const rowHeight = (cells: readonly string[], minLines: number): number => {
      const lines = cells.reduce((max, cell, index) => {
        const usable = Math.max(4, (widths[index] ?? box.width) - TABLE.cellPaddingX * 2);
        const perLine = Math.max(1, usable / (size * TABLE.advance));
        return Math.max(max, Math.ceil(visualWidth(cell) / perLine));
      }, minLines);
      return lines * size * TABLE.lineHeight + TABLE.cellPaddingY * 2;
    };
    const body = table.rows.reduce((sum, row) => sum + rowHeight(row, 1), 0);
    const header = rowHeight(table.columns, TABLE.headerLines);
    if (header + body <= box.height) return Math.round(size * 100) / 100;
  }
  return TABLE.minSize;
}

/* ── 경로 ────────────────────────────────────────────────── */

/** 긴 저장소 경로는 뒤쪽 폴더·파일 이름만 남긴다(`…/폴더/파일.ts#심볼`). 전체 경로는 `title`과 발표자 패널에 있다. */
export function shortenDeckPath(path: string, maxChars = 46): string {
  if (path.length <= maxChars) return path;
  const hash = path.indexOf("#");
  const file = hash >= 0 ? path.slice(0, hash) : path;
  const symbol = hash >= 0 ? path.slice(hash) : "";
  const segments = file.split("/");
  let tail = segments.at(-1) ?? file;
  for (let index = segments.length - 2; index >= 0; index -= 1) {
    const candidate = `${segments[index] ?? ""}/${tail}`;
    if (candidate.length + 2 + symbol.length > maxChars) break;
    tail = candidate;
  }
  return `${tail === file ? file : `…/${tail}`}${symbol}`;
}
