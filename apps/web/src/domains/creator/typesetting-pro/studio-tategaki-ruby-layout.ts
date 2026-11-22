/**
 * Studio Tategaki (세로쓰기) & Ruby (후리가나) Pro Layout Engine (100% 클린룸 순수 알고리즘).
 *
 * 한국어·일본어 출판 만화 세로쓰기 열 배치(우→좌 열 진행, 90° 회전 플래그, 2자리 숫자 및 `!?`
 * 세로중가로)와 베이스 문자 옆 루비(후리가나) 좌표·폭 충돌 회피 박스 계산을 수행한다.
 *
 * 충돌 회피 보장:
 *  - 같은 열 내 인접 루비의 세로 겹침은 PAVA(Pool Adjacent Violators Algorithm, O(m) L2 최적) +
 *    반올림 안전 전진 패스로 겹침 0을 보장한다.
 *  - 루비가 존재하는 열과 인접 열 사이의 가로 피치를 자동 확장해 루비 ↔ 인접 열 베이스 글리프
 *    충돌을 원천 차단한다.
 */

import {
  isVerticalNoBreakAfter,
  isVerticalNoBreakBefore,
  VERTICAL_KINSOKU_BACKTRACK_LIMIT,
} from "../studio-vertical-text";

import {
  codePointBoundarySet,
  parseInlineRubyAnnotations,
  shouldRotateInTategaki,
  splitLongRotatedToken,
  tokenizeTategakiParagraph,
  type TateChuYokoKind,
  type TategakiGlyphKind,
  type TategakiRubySpanInput,
  type TategakiToken,
} from "./studio-tategaki-tokenizer";
import {
  DEFAULT_BALLOON_TEXT_MEASURER,
  type BalloonTextWidthMeasurer,
} from "./studio-typesetting-optical-rules";

export {
  parseInlineRubyAnnotations,
  shouldRotateInTategaki,
  tokenizeTategakiParagraph,
  type TateChuYokoKind,
  type TategakiGlyphKind,
  type TategakiRubySpanInput,
  type TategakiToken,
};

// ── 공개 타입 계약 ────────────────────────────────────────────────────────────

export interface TategakiRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type TategakiRubySide = "right" | "left";
export type TategakiBlockAlign = "start" | "center" | "end";

export interface TategakiRubyLayoutInput {
  readonly text: string;
  readonly rubySpans?: readonly TategakiRubySpanInput[];
  /** 기본 글자 크기(px). 기본 20. */
  readonly fontSize?: number;
  /** 기본 열 간격 배수(`baseColumnAdvance = fontSize * lineHeight`). 기본 1.5. */
  readonly lineHeight?: number;
  /** 세로 자간(px). 기본 0. */
  readonly letterSpacing?: number;
  /** 열 최대 높이(px). 미지정 또는 0 이하이면 `\n`으로만 열을 나눈다. */
  readonly maxColumnHeightPx?: number;
  /** 열 내 세로 정렬. 기본 `"start"`. */
  readonly blockAlign?: TategakiBlockAlign;
  /** 루비 배치 방향. 기본 `"right"`(일본어/한국어 세로쓰기 표준 우측 배치). */
  readonly rubySide?: TategakiRubySide;
  /** 베이스 대비 루비 폰트 크기 비율(0.25..0.65). 기본 0.48. */
  readonly rubySizeRatio?: number;
  /** 베이스 문자와 루비 박스 사이 가로 간격(px). */
  readonly rubyGapPx?: number;
  /** 루비 외곽과 인접 열 베이스 문자 사이 최소 가로 안전 여백(px). */
  readonly rubyColumnClearancePx?: number;
  /** 같은 열 내 인접 루비 박스 사이 최소 세로 간격(px). */
  readonly rubyVerticalGapPx?: number;
  /** 충돌 회피 박스(`avoidanceBox`) 팽창 여유(px). 실제 간격의 40% 이하로 자동 제한. */
  readonly avoidancePaddingPx?: number;
  /** 세로중가로로 묶을 최대 연속 ASCII 숫자 자릿수(1..4). 기본 2. */
  readonly tateChuYokoMaxDigits?: number;
  /** `!?`/`?!`/`!!`/`??` 2글자 조합 세로중가로 활성화 여부. 기본 `true`. */
  readonly enablePunctuationTateChuYoko?: boolean;
  readonly fontFamily?: string;
  readonly fontStyle?: string;
  readonly measurer?: BalloonTextWidthMeasurer;
}

export interface TategakiGlyphPlacement {
  readonly columnIndex: number;
  readonly kind: TategakiGlyphKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly x: number;
  readonly y: number;
  readonly drawX: number;
  readonly drawY: number;
  readonly width: number;
  readonly height: number;
  readonly rotate90: boolean;
  readonly rotationDeg: 0 | 90;
  readonly isTateChuYoko: boolean;
  readonly tateChuYokoKind: TateChuYokoKind;
  readonly horizontalScale: number;
  readonly rect: TategakiRect;
}

export interface TategakiColumn {
  /** 0 = 가장 오른쪽 열, 인덱스가 커질수록 왼쪽으로 진행. */
  readonly index: number;
  readonly centerX: number;
  readonly contentHeightPx: number;
  readonly hasRuby: boolean;
  readonly occupiedWidthPx: number;
  readonly glyphs: readonly TategakiGlyphPlacement[];
}

export interface TategakiRubyGlyphCoord {
  readonly char: string;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
}

export interface TategakiRubyPlacement {
  readonly spanIndex: number;
  readonly fragmentIndex: number;
  readonly fragmentCount: number;
  readonly columnIndex: number;
  readonly side: TategakiRubySide;
  readonly baseText: string;
  readonly rubyText: string;
  readonly sourceRuby: string;
  readonly baseStart: number;
  readonly baseEnd: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rubyFontSize: number;
  readonly rubyGlyphAdvance: number;
  readonly baseRect: TategakiRect;
  readonly rect: TategakiRect;
  readonly avoidanceBox: TategakiRect;
  readonly collisionAdjusted: boolean;
  readonly verticalShiftPx: number;
  readonly glyphs: readonly TategakiRubyGlyphCoord[];
}

export interface TategakiRubyIssue {
  readonly code:
    | "invalid-range"
    | "empty-ruby"
    | "overlapping-input-span"
    | "split-surrogate-pair"
    | "no-base-cells";
  readonly spanIndex: number;
  readonly message: string;
}

export interface TategakiCollisionPair {
  readonly kind: "ruby-ruby" | "ruby-base" | "base-base";
  readonly firstId: string;
  readonly secondId: string;
}

export interface TategakiRubyLayoutResult {
  readonly columns: readonly TategakiColumn[];
  readonly rubyPlacements: readonly TategakiRubyPlacement[];
  readonly issues: readonly TategakiRubyIssue[];
  readonly width: number;
  readonly height: number;
  readonly baseColumnAdvance: number;
  readonly rubySide: TategakiRubySide;
  readonly rubyFontSize: number;
  readonly overflow: boolean;
  readonly collisionFree: boolean;
}

// ── 내부 헬퍼 및 PAVA 비겹침 솔버 ────────────────────────────────────────────

interface MeasuredPendingCell {
  readonly token: TategakiToken;
  readonly verticalAdvance: number;
  readonly cellHeight: number;
  readonly horizontalScale: number;
  readonly firstChar: string;
  readonly lastChar: string;
}

interface MutableGlyphPlacement {
  readonly columnIndex: number;
  readonly cell: MeasuredPendingCell;
  readonly x: number;
  readonly y: number;
  readonly drawX: number;
  readonly drawY: number;
  readonly width: number;
  readonly height: number;
}

interface DraftRubyPlacement {
  readonly spanIndex: number;
  readonly fragmentIndex: number;
  readonly fragmentCount: number;
  readonly columnIndex: number;
  readonly baseText: string;
  readonly rubyText: string;
  readonly sourceRuby: string;
  readonly baseStart: number;
  readonly baseEnd: number;
  readonly baseX: number;
  readonly baseY: number;
  readonly baseWidth: number;
  readonly baseHeight: number;
  readonly x: number;
  readonly desiredY: number;
  readonly width: number;
  readonly height: number;
  resolvedY: number;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function columnCellsHeight(cells: readonly MeasuredPendingCell[]): number {
  let total = 0;
  for (const c of cells) total += c.verticalAdvance;
  return total;
}

/**
 * 1차원 PAVA(Pool Adjacent Violators Algorithm)로 같은 열 루비의 세로 좌표를
 * 베이스 중심에서 최소 제곱 변위로 밀어내며 `y[i] + h[i] + gap <= y[i+1]`을 보장한다.
 */
function resolveVerticalRubyOverlapsPava(
  desiredTops: readonly number[],
  heights: readonly number[],
  minGap: number,
): readonly number[] {
  const m = desiredTops.length;
  if (m === 0) return [];
  if (m === 1) return [desiredTops[0]!];

  const shifts = new Float64Array(m);
  for (let i = 1; i < m; i += 1) {
    shifts[i] = shifts[i - 1]! + heights[i - 1]! + minGap;
  }

  interface PavaBlock {
    start: number;
    end: number;
    sum: number;
    count: number;
    value: number;
  }
  const stack: PavaBlock[] = [];
  for (let i = 0; i < m; i += 1) {
    const target = desiredTops[i]! - shifts[i]!;
    stack.push({ start: i, end: i, sum: target, count: 1, value: target });
    while (stack.length >= 2) {
      const right = stack[stack.length - 1]!;
      const left = stack[stack.length - 2]!;
      if (left.value <= right.value) break;
      stack.pop();
      left.end = right.end;
      left.sum += right.sum;
      left.count += right.count;
      left.value = left.sum / left.count;
    }
  }

  const resolved = new Array<number>(m);
  for (const block of stack) {
    for (let i = block.start; i <= block.end; i += 1) {
      resolved[i] = block.value + shifts[i]!;
    }
  }
  return resolved;
}

function rectsStrictlyOverlap(a: TategakiRect, b: TategakiRect, eps = 1e-6): boolean {
  return (
    a.x < b.x + b.width - eps
    && a.x + a.width > b.x + eps
    && a.y < b.y + b.height - eps
    && a.y + a.height > b.y + eps
  );
}

/** 레이아웃 내 모든 루비 박스(긴밀·회피 박스)와 베이스 글리프의 비겹침 불변식을 전수 검증한다. */
export function verifyTategakiRubyNonOverlap(
  layout: Pick<TategakiRubyLayoutResult, "columns" | "rubyPlacements">,
  options?: { readonly useAvoidanceBoxes?: boolean },
): { readonly ok: boolean; readonly collisions: readonly TategakiCollisionPair[] } {
  const useAvoidance = options?.useAvoidanceBoxes === true;
  const collisions: TategakiCollisionPair[] = [];

  const allGlyphs: { readonly id: string; readonly rect: TategakiRect }[] = [];
  for (const col of layout.columns) {
    col.glyphs.forEach((glyph, idx) => {
      allGlyphs.push({ id: `col${col.index}:glyph${idx}(${glyph.text})`, rect: glyph.rect });
    });
  }

  const allRubies = layout.rubyPlacements.map((r) => ({
    id: `ruby:${r.spanIndex}:${r.fragmentIndex}(${r.rubyText})`,
    rect: useAvoidance ? r.avoidanceBox : r.rect,
  }));

  for (let i = 0; i < allRubies.length; i += 1) {
    for (let j = i + 1; j < allRubies.length; j += 1) {
      if (rectsStrictlyOverlap(allRubies[i]!.rect, allRubies[j]!.rect)) {
        collisions.push(Object.freeze({ kind: "ruby-ruby", firstId: allRubies[i]!.id, secondId: allRubies[j]!.id }));
      }
    }
  }
  for (const ruby of allRubies) {
    for (const glyph of allGlyphs) {
      if (rectsStrictlyOverlap(ruby.rect, glyph.rect)) {
        collisions.push(Object.freeze({ kind: "ruby-base", firstId: ruby.id, secondId: glyph.id }));
      }
    }
  }
  for (let i = 0; i < allGlyphs.length; i += 1) {
    for (let j = i + 1; j < allGlyphs.length; j += 1) {
      if (rectsStrictlyOverlap(allGlyphs[i]!.rect, allGlyphs[j]!.rect)) {
        collisions.push(Object.freeze({ kind: "base-base", firstId: allGlyphs[i]!.id, secondId: allGlyphs[j]!.id }));
      }
    }
  }

  return Object.freeze({ ok: collisions.length === 0, collisions: Object.freeze(collisions) });
}

// ── 공개 메인 엔트리포인트 ───────────────────────────────────────────────────

/**
 * 한국어/일본어 세로쓰기(우→좌 열 진행, 90° 회전 플래그, 2자리 숫자·`!?` 세로중가로)와
 * 베이스 문자 옆 루비(후리가나) 좌표 및 폭 충돌 회피 박스를 계산한다.
 */
export function layoutTategakiWithRuby(input: TategakiRubyLayoutInput): TategakiRubyLayoutResult {
  const source = typeof input.text === "string" ? input.text.replaceAll("\r\n", "\n") : "";
  const fontSize =
    typeof input.fontSize === "number" && Number.isFinite(input.fontSize) && input.fontSize > 0
      ? input.fontSize
      : 20;
  const lineHeight =
    typeof input.lineHeight === "number" && Number.isFinite(input.lineHeight) && input.lineHeight > 0
      ? input.lineHeight
      : 1.5;
  const letterSpacing =
    typeof input.letterSpacing === "number" && Number.isFinite(input.letterSpacing)
      ? Math.max(0, input.letterSpacing)
      : 0;
  const maxColumnHeight =
    typeof input.maxColumnHeightPx === "number" && Number.isFinite(input.maxColumnHeightPx) && input.maxColumnHeightPx > 0
      ? input.maxColumnHeightPx
      : Number.POSITIVE_INFINITY;
  const blockAlign: TategakiBlockAlign = input.blockAlign ?? "start";
  const rubySide: TategakiRubySide = input.rubySide === "left" ? "left" : "right";
  const rubySizeRatio = Math.max(
    0.25,
    Math.min(0.65, typeof input.rubySizeRatio === "number" && Number.isFinite(input.rubySizeRatio) ? input.rubySizeRatio : 0.48),
  );
  const rubyFontSize = Math.max(4, round3(fontSize * rubySizeRatio));
  const rubyGlyphAdvance = Math.max(1, round3(rubyFontSize + letterSpacing * rubySizeRatio));
  const rubyGapPx =
    typeof input.rubyGapPx === "number" && Number.isFinite(input.rubyGapPx) && input.rubyGapPx >= 0
      ? input.rubyGapPx
      : Math.max(2, Math.round(fontSize * 0.12));
  const rubyColumnClearancePx =
    typeof input.rubyColumnClearancePx === "number"
    && Number.isFinite(input.rubyColumnClearancePx)
    && input.rubyColumnClearancePx >= 0
      ? input.rubyColumnClearancePx
      : Math.max(2, Math.round(fontSize * 0.14));
  const rubyVerticalGapPx =
    typeof input.rubyVerticalGapPx === "number" && Number.isFinite(input.rubyVerticalGapPx) && input.rubyVerticalGapPx >= 0
      ? input.rubyVerticalGapPx
      : Math.max(1, Math.round(rubyFontSize * 0.15));
  const rawAvoidPad =
    typeof input.avoidancePaddingPx === "number" && Number.isFinite(input.avoidancePaddingPx) && input.avoidancePaddingPx >= 0
      ? input.avoidancePaddingPx
      : 1;
  const avoidPadX = round3(Math.min(rawAvoidPad, Math.min(rubyGapPx, rubyColumnClearancePx) * 0.4));
  const avoidPadY = round3(Math.min(rawAvoidPad, rubyVerticalGapPx * 0.4));

  const fontFamily = input.fontFamily ?? "Pretendard, sans-serif";
  const fontStyle = input.fontStyle ?? "bold";
  const measurer = input.measurer ?? DEFAULT_BALLOON_TEXT_MEASURER;
  const measure = (slice: string): number => measurer.measureWidth(slice, fontSize, fontFamily, fontStyle);
  const baseColumnAdvance = fontSize * Math.max(1.05, lineHeight);

  // 1) 문단별 토큰화 + 금칙 준수 열 분할
  const rawColumns: MeasuredPendingCell[][] = [];
  let overflow = false;
  let paragraphOffset = 0;

  for (const paragraph of source.split("\n")) {
    const tokens = tokenizeTategakiParagraph(paragraph, paragraphOffset, {
      tateChuYokoMaxDigits: input.tateChuYokoMaxDigits,
      enablePunctuationTateChuYoko: input.enablePunctuationTateChuYoko,
    });
    paragraphOffset += paragraph.length + 1;

    let column: MeasuredPendingCell[] = [];
    const flush = (): void => {
      rawColumns.push(column);
      column = [];
    };

    const pushCell = (cell: MeasuredPendingCell): void => {
      if (cell.verticalAdvance > maxColumnHeight) {
        overflow = true;
        if (column.length > 0) flush();
        column.push(cell);
        flush();
        return;
      }
      if (columnCellsHeight(column) + cell.verticalAdvance <= maxColumnHeight) {
        column.push(cell);
        return;
      }
      const combined = [...column, cell];
      const minBreak = Math.max(1, column.length - VERTICAL_KINSOKU_BACKTRACK_LIMIT);
      let breakAt: number | null = null;
      for (let idx = column.length; idx >= minBreak; idx -= 1) {
        const before = combined[idx - 1];
        const after = combined[idx];
        if (!before || !after) continue;
        if (isVerticalNoBreakAfter(before.lastChar) || isVerticalNoBreakBefore(after.firstChar)) continue;
        if (columnCellsHeight(combined.slice(idx)) > maxColumnHeight) continue;
        breakAt = idx;
        break;
      }
      if (breakAt !== null) {
        column = combined.slice(0, breakAt);
        flush();
        column.push(...combined.slice(breakAt));
      } else {
        column.push(cell);
        overflow = true;
      }
    };

    for (const token of tokens) {
      if (token.kind === "rotated-latin") {
        const rawLen = Math.max(1, round3(measure(token.text)));
        const pieces =
          rawLen + letterSpacing > maxColumnHeight
            ? splitLongRotatedToken(token, maxColumnHeight, letterSpacing, measure)
            : [token];
        for (const piece of pieces) {
          const pieceHeight = Math.max(1, round3(measure(piece.text)));
          const chars = [...piece.text];
          pushCell({
            token: piece,
            cellHeight: pieceHeight,
            verticalAdvance: round3(pieceHeight + letterSpacing),
            horizontalScale: 1,
            firstChar: chars[0] ?? "",
            lastChar: chars[chars.length - 1] ?? "",
          });
        }
      } else {
        const chars = [...token.text];
        const horizontalScale =
          token.kind === "tate-chu-yoko"
            ? round3(Math.min(1, fontSize / Math.max(1, measure(token.text))))
            : 1;
        pushCell({
          token,
          cellHeight: round3(fontSize),
          verticalAdvance: round3(fontSize + letterSpacing),
          horizontalScale,
          firstChar: chars[0] ?? "",
          lastChar: chars[chars.length - 1] ?? "",
        });
      }
    }
    flush();
  }

  // 2) 루비 스팬 유효성 검증
  const issues: TategakiRubyIssue[] = [];
  const boundaries = codePointBoundarySet(source);
  type ValidSpan = TategakiRubySpanInput & { readonly spanIndex: number };
  const validSpans: ValidSpan[] = [];

  (input.rubySpans ?? []).forEach((span, spanIndex) => {
    if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end > source.length || span.start >= span.end) {
      issues.push(Object.freeze({ code: "invalid-range", spanIndex, message: `루비 범위(${span.start}..${span.end})가 유효 범위를 벗어났습니다.` }));
      return;
    }
    if (!boundaries.has(span.start) || !boundaries.has(span.end)) {
      issues.push(Object.freeze({ code: "split-surrogate-pair", spanIndex, message: `루비 범위(${span.start}..${span.end})가 코드포인트 중간을 분할합니다.` }));
      return;
    }
    const trimmed = typeof span.ruby === "string" ? span.ruby.trim() : "";
    if (!trimmed) {
      issues.push(Object.freeze({ code: "empty-ruby", spanIndex, message: "루비 읽기가 비어 있습니다." }));
      return;
    }
    validSpans.push({ start: span.start, end: span.end, ruby: trimmed, spanIndex });
  });

  validSpans.sort((a, b) => a.start - b.start || a.end - b.end || a.spanIndex - b.spanIndex);
  const acceptedSpans: ValidSpan[] = [];
  for (const span of validSpans) {
    const prev = acceptedSpans[acceptedSpans.length - 1];
    if (prev && span.start < prev.end) {
      issues.push(Object.freeze({ code: "overlapping-input-span", spanIndex: span.spanIndex, message: `루비 범위(${span.start}..${span.end})가 선행 범위와 겹칩니다.` }));
    } else {
      acceptedSpans.push(span);
    }
  }

  // 3) 우→좌 비겹침 열 centerX 계산 (루비 스트립 가로 충돌 회피)
  const columnCount = Math.max(1, rawColumns.length);
  const columnHasRuby = new Array<boolean>(columnCount).fill(false);
  for (const span of acceptedSpans) {
    rawColumns.forEach((cells, colIdx) => {
      if (cells.some((c) => c.token.end > span.start && c.token.start < span.end)) {
        columnHasRuby[colIdx] = true;
      }
    });
  }

  const rubyStripExtra = rubyGapPx + rubyFontSize;
  const rubyStepMin = fontSize + rubyStripExtra + rubyColumnClearancePx;
  const centerXByColumn = new Array<number>(columnCount).fill(0);
  const leftmostIdx = columnCount - 1;
  centerXByColumn[leftmostIdx] =
    fontSize / 2 + (rubySide === "left" && columnHasRuby[leftmostIdx] ? rubyStripExtra + avoidPadX : avoidPadX);

  for (let colIdx = columnCount - 2; colIdx >= 0; colIdx -= 1) {
    const needsRubyGap = rubySide === "right" ? Boolean(columnHasRuby[colIdx + 1]) : Boolean(columnHasRuby[colIdx]);
    centerXByColumn[colIdx] = centerXByColumn[colIdx + 1]! + (needsRubyGap ? Math.max(baseColumnAdvance, rubyStepMin) : baseColumnAdvance);
  }
  const totalWidth = round3(
    centerXByColumn[0]! + fontSize / 2 + (rubySide === "right" && columnHasRuby[0] ? rubyStripExtra + avoidPadX : avoidPadX),
  );

  // 4) 1차 베이스 글리프 좌표 배치
  const rawColHeights = rawColumns.map((cells) => columnCellsHeight(cells));
  const maxRawHeight = rawColHeights.reduce((max, h) => Math.max(max, h), 0);

  const mutableColumns: MutableGlyphPlacement[][] = rawColumns.map((cells, colIndex) => {
    const centerX = centerXByColumn[colIndex]!;
    const slack = Math.max(0, maxRawHeight - rawColHeights[colIndex]!);
    let cursorY = blockAlign === "center" ? slack / 2 : blockAlign === "end" ? slack : 0;
    return cells.map((cell) => {
      const baseLeft = centerX - fontSize / 2;
      const placement: MutableGlyphPlacement = {
        columnIndex: colIndex,
        cell,
        x: baseLeft,
        y: cursorY,
        drawX: baseLeft + cell.token.offsetXEm * fontSize,
        drawY: cursorY + cell.token.offsetYEm * fontSize,
        width: fontSize,
        height: cell.cellHeight,
      };
      cursorY += cell.verticalAdvance;
      return placement;
    });
  });

  // 5) 루비 스팬 열 조각 매핑 + 열별 PAVA 세로 충돌 회피
  const draftsByColumn: DraftRubyPlacement[][] = Array.from({ length: columnCount }, () => []);
  for (const span of acceptedSpans) {
    const matchedByCol: MutableGlyphPlacement[][] = [];
    for (let colIdx = 0; colIdx < columnCount; colIdx += 1) {
      const matched = mutableColumns[colIdx]!.filter((g) => g.cell.token.end > span.start && g.cell.token.start < span.end);
      if (matched.length > 0) matchedByCol.push(matched);
    }
    if (matchedByCol.length === 0) {
      issues.push(Object.freeze({ code: "no-base-cells", spanIndex: span.spanIndex, message: `루비 범위(${span.start}..${span.end})에 대응하는 베이스 글리프가 없습니다.` }));
      continue;
    }

    const rubyChars = [...span.ruby];
    const totalBaseCount = matchedByCol.reduce((sum, frags) => sum + frags.length, 0);
    let rubyCursor = 0;
    let consumedBase = 0;

    matchedByCol.forEach((fragment, fragmentIndex) => {
      consumedBase += fragment.length;
      const remainingFrags = matchedByCol.length - fragmentIndex - 1;
      const proportionalEnd =
        fragmentIndex === matchedByCol.length - 1
          ? rubyChars.length
          : Math.round((consumedBase / Math.max(1, totalBaseCount)) * rubyChars.length);
      const nextEnd =
        rubyCursor < rubyChars.length
          ? Math.max(rubyCursor + 1, Math.min(rubyChars.length - remainingFrags, proportionalEnd))
          : rubyChars.length;
      const fragmentRuby = rubyChars.slice(rubyCursor, nextEnd).join("") || span.ruby;
      rubyCursor = nextEnd;

      const colIndex = fragment[0]!.columnIndex;
      const baseX = Math.min(...fragment.map((g) => g.x));
      const baseY = Math.min(...fragment.map((g) => g.y));
      const baseRight = Math.max(...fragment.map((g) => g.x + g.width));
      const baseBottom = Math.max(...fragment.map((g) => g.y + g.height));
      const baseHeight = baseBottom - baseY;
      const rubyHeight = round3(Math.max(rubyFontSize, [...fragmentRuby].length * rubyGlyphAdvance));
      const desiredY = baseY + (baseHeight - rubyHeight) / 2;
      const rubyX = rubySide === "right" ? baseRight + rubyGapPx : baseX - rubyGapPx - rubyFontSize;

      draftsByColumn[colIndex]!.push({
        spanIndex: span.spanIndex,
        fragmentIndex,
        fragmentCount: matchedByCol.length,
        columnIndex: colIndex,
        baseText: fragment.map((g) => g.cell.token.text).join(""),
        rubyText: fragmentRuby,
        sourceRuby: span.ruby,
        baseStart: fragment[0]!.cell.token.start,
        baseEnd: fragment[fragment.length - 1]!.cell.token.end,
        baseX,
        baseY,
        baseWidth: baseRight - baseX,
        baseHeight,
        x: rubyX,
        desiredY,
        width: rubyFontSize,
        height: rubyHeight,
        resolvedY: desiredY,
      });
    });
  }

  let globalMinY = 0;
  for (let colIdx = 0; colIdx < columnCount; colIdx += 1) {
    const colDrafts = draftsByColumn[colIdx]!;
    if (colDrafts.length === 0) continue;
    colDrafts.sort((a, b) => a.desiredY - b.desiredY || a.baseStart - b.baseStart);
    const resolved = resolveVerticalRubyOverlapsPava(
      colDrafts.map((d) => d.desiredY),
      colDrafts.map((d) => d.height),
      rubyVerticalGapPx,
    );
    colDrafts.forEach((draft, idx) => {
      draft.resolvedY = resolved[idx]!;
      globalMinY = Math.min(globalMinY, draft.resolvedY - avoidPadY);
    });
  }

  const topShift = globalMinY < 0 ? round3(-globalMinY) : 0;
  let totalHeight = maxRawHeight + topShift;

  const finalColumns: TategakiColumn[] = mutableColumns.map((colGlyphs, colIndex) => {
    const centerX = round3(centerXByColumn[colIndex]!);
    const placements: TategakiGlyphPlacement[] = colGlyphs.map((g) => {
      const x = round3(g.x);
      const y = round3(g.y + topShift);
      const width = round3(g.width);
      const height = round3(g.height);
      totalHeight = Math.max(totalHeight, y + height);
      return Object.freeze({
        columnIndex: colIndex,
        kind: g.cell.token.kind,
        text: g.cell.token.text,
        start: g.cell.token.start,
        end: g.cell.token.end,
        x,
        y,
        drawX: round3(g.drawX),
        drawY: round3(g.drawY + topShift),
        width,
        height,
        rotate90: g.cell.token.rotate90,
        rotationDeg: g.cell.token.rotationDeg,
        isTateChuYoko: g.cell.token.isTateChuYoko,
        tateChuYokoKind: g.cell.token.tateChuYokoKind,
        horizontalScale: g.cell.horizontalScale,
        rect: Object.freeze({ x, y, width, height }),
      });
    });

    const hasRuby = Boolean(columnHasRuby[colIndex]);
    return Object.freeze({
      index: colIndex,
      centerX,
      contentHeightPx: round3(rawColHeights[colIndex]!),
      hasRuby,
      occupiedWidthPx: round3(fontSize + (hasRuby ? rubyStripExtra : 0)),
      glyphs: Object.freeze(placements),
    });
  });

  const finalRubies: TategakiRubyPlacement[] = [];
  for (let colIdx = 0; colIdx < columnCount; colIdx += 1) {
    let minAllowedTop = 0;
    for (const draft of draftsByColumn[colIdx]!) {
      const candidateY = round3(draft.resolvedY + topShift);
      const y = Math.max(candidateY, minAllowedTop);
      const x = round3(draft.x);
      const width = round3(draft.width);
      const height = round3(draft.height);
      minAllowedTop = round3(y + height + rubyVerticalGapPx);
      const baseY = round3(draft.baseY + topShift);
      const verticalShiftPx = round3(y - (draft.desiredY + topShift));
      totalHeight = Math.max(totalHeight, y + height + avoidPadY);

      const glyphs: TategakiRubyGlyphCoord[] = [...draft.rubyText].map((char, idx) =>
        Object.freeze({ char, x, y: round3(y + idx * rubyGlyphAdvance), fontSize: rubyFontSize }),
      );

      finalRubies.push(Object.freeze({
        spanIndex: draft.spanIndex,
        fragmentIndex: draft.fragmentIndex,
        fragmentCount: draft.fragmentCount,
        columnIndex: draft.columnIndex,
        side: rubySide,
        baseText: draft.baseText,
        rubyText: draft.rubyText,
        sourceRuby: draft.sourceRuby,
        baseStart: draft.baseStart,
        baseEnd: draft.baseEnd,
        x,
        y,
        width,
        height,
        rubyFontSize,
        rubyGlyphAdvance,
        baseRect: Object.freeze({ x: round3(draft.baseX), y: baseY, width: round3(draft.baseWidth), height: round3(draft.baseHeight) }),
        rect: Object.freeze({ x, y, width, height }),
        avoidanceBox: Object.freeze({
          x: round3(x - avoidPadX),
          y: round3(y - avoidPadY),
          width: round3(width + avoidPadX * 2),
          height: round3(height + avoidPadY * 2),
        }),
        collisionAdjusted: Math.abs(verticalShiftPx) > 1e-3,
        verticalShiftPx,
        glyphs: Object.freeze(glyphs),
      }));
    }
  }

  const tightCheck = verifyTategakiRubyNonOverlap({ columns: finalColumns, rubyPlacements: finalRubies }, { useAvoidanceBoxes: false });
  const avoidanceCheck = verifyTategakiRubyNonOverlap({ columns: finalColumns, rubyPlacements: finalRubies }, { useAvoidanceBoxes: true });

  return Object.freeze({
    columns: Object.freeze(finalColumns),
    rubyPlacements: Object.freeze(finalRubies),
    issues: Object.freeze(issues),
    width: totalWidth,
    height: round3(totalHeight),
    baseColumnAdvance: round3(baseColumnAdvance),
    rubySide,
    rubyFontSize,
    overflow,
    collisionFree: tightCheck.ok && avoidanceCheck.ok,
  });
}
