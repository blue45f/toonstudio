/**
 * Wave 107 — 일본어 만화·웹툰 세로쓰기(Tategaki / 縦書き) 조판 엔진.
 *
 * - 열 진행 방향은 엄격한 우→좌(`columnIndex = 0`이 최우측 X, 열마다 `columnPitchPx`만큼 X 감소),
 *   각 열 내부 글리프는 위→아래(Y 증가)로 배치한다.
 * - 세로 문장부호 회전(`verticalRotated: true`, `rotationDeg: 90`)과 광학 오프셋,
 *   마침표·쉼표(`。`, `、`)의 우상단 광학 이동을 적용한다.
 * - 종중횡(縦中横, Tate-chu-yoko): 독립 2자리 숫자(`12`, `99`)와 만화 감탄 부호 쌍(`!?`, `!!`, `?!`, `??`)을
 *   단일 정립 가로 클러스터(`isTateChuYoko: true`, `rotationDeg: 0`)로 묶어 1em 세로 셀에 배치한다.
 * - 금칙 처리(禁則処理, Kinsoku Shori): 행두 금칙 문자(`、`, `。`, `」`, `』`, `）`, `！`, `？`, `ー`, `っ`, `ッ`, `ゃ`, `ゅ`, `ょ` 등)가
 *   새 열 맨 앞에 오지 않도록 매달기(ぶら下げ) 또는 밀어내기(追い出し) 처리하고 `kinsokuViolationCount === 0`을 검증한다.
 * - 루비 후리가나(ルビ): `{漢字|かんじ}` 인라인 문법과 명시적 스팬을 파싱해 `0.45em` 크기로
 *   부모 한자 런의 우측에 배치하며 인접 열·인접 루비와의 겹침(`rubyColumnOverlapCount === 0`)을 기하적으로 검증한다.
 */

import {
  GYOTO_KINSOKU_CHAR_SET,
  TATE_CHU_YOKO_PUNCTUATION_SET,
  parseTategakiRubySegments,
  splitUnicodeChars,
  tokenizeSegmentsForVertical,
  type AtomicVerticalToken,
  type TategakiExplicitRubySpan,
  type TategakiKinsokuAction,
} from "./tategaki-jis-character-rules";

export {
  GYOMATSU_KINSOKU_CHAR_SET,
  GYOTO_KINSOKU_CHAR_SET,
  VERTICAL_ROTATED_GLYPH_SET,
  type TategakiExplicitRubySpan,
  type TategakiKinsokuAction,
} from "./tategaki-jis-character-rules";

export interface TategakiTypesetInput {
  readonly text: string;
  readonly explicitRubySpans?: readonly TategakiExplicitRubySpan[];
  readonly frameWidthPx?: number;
  readonly frameHeightPx?: number;
  readonly paddingTopPx?: number;
  readonly paddingRightPx?: number;
  readonly paddingBottomPx?: number;
  readonly paddingLeftPx?: number;
  readonly fontSizePx?: number;
  readonly lineAdvanceRatio?: number;
  readonly columnGapRatio?: number;
  readonly rubyScale?: number;
  readonly rubyOffsetPx?: number;
  readonly maxGlyphsPerColumn?: number;
  readonly allowKinsokuHanging?: boolean;
}

export interface TategakiGlyphBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface TategakiGlyphCell {
  readonly glyphId: string;
  readonly text: string;
  readonly columnIndex: number;
  readonly rowIndex: number;
  readonly x: number;
  readonly y: number;
  readonly fontSizePx: number;
  readonly verticalRotated: boolean;
  readonly rotationDeg: 0 | 90;
  readonly isTateChuYoko: boolean;
  readonly opticalOffsetX: number;
  readonly opticalOffsetY: number;
  readonly punctuationOpticalShifted: boolean;
  readonly isKinsokuAdjusted: boolean;
  readonly kinsokuAction: TategakiKinsokuAction;
  readonly rubyAnnotationId: string | null;
  readonly bounds: TategakiGlyphBounds;
}

export interface TategakiRubyCharPlacement {
  readonly char: string;
  readonly x: number;
  readonly y: number;
}

export interface TategakiRubyAnnotation {
  readonly rubyId: string;
  readonly columnIndex: number;
  readonly baseText: string;
  readonly reading: string;
  readonly baseGlyphIds: readonly string[];
  readonly fontSizePx: number;
  readonly x: number;
  readonly topY: number;
  readonly bottomY: number;
  readonly bounds: TategakiGlyphBounds;
  readonly characters: readonly TategakiRubyCharPlacement[];
}

export interface TategakiKinsokuAdjustment {
  readonly columnIndex: number;
  readonly glyphText: string;
  readonly action: Exclude<TategakiKinsokuAction, "none">;
  readonly reasonKo: string;
}

export interface TategakiColumnLayout {
  readonly columnIndex: number;
  readonly x: number;
  readonly topY: number;
  readonly bottomY: number;
  readonly glyphs: readonly TategakiGlyphCell[];
}

export interface TategakiTypesetLayout {
  readonly writingMode: "vertical-rl";
  readonly sourceText: string;
  readonly plainText: string;
  readonly totalWidthPx: number;
  readonly totalHeightPx: number;
  readonly fontSizePx: number;
  readonly rubyFontSizePx: number;
  readonly columnPitchPx: number;
  readonly glyphAdvancePx: number;
  readonly maxGlyphsPerColumn: number;
  readonly columns: readonly TategakiColumnLayout[];
  readonly rubyAnnotations: readonly TategakiRubyAnnotation[];
  readonly kinsokuAdjustments: readonly TategakiKinsokuAdjustment[];
  readonly totalGlyphCells: number;
  readonly verticalRotatedCount: number;
  readonly tateChuYokoCount: number;
  readonly rubyAnnotationCount: number;
  readonly kinsokuViolationCount: number;
  readonly rubyColumnOverlapCount: number;
  readonly isRightToLeftMonotonic: boolean;
  readonly isTopToBottomMonotonic: boolean;
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function clampFinite(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function withKinsokuAction(
  token: AtomicVerticalToken,
  action: TategakiKinsokuAction,
): AtomicVerticalToken {
  return { ...token, kinsokuAction: action };
}

function measureRubyGroupRunLength(tokens: readonly AtomicVerticalToken[], startIdx: number): number {
  const groupId = tokens[startIdx].rubyGroupId;
  if (groupId === null) return 1;
  let len = 1;
  while (startIdx + len < tokens.length && tokens[startIdx + len].rubyGroupId === groupId) {
    len += 1;
  }
  return len;
}

function pullTrailingOpeningBrackets(
  currentCol: AtomicVerticalToken[],
  nextColumnIndex: number,
  adjustments: TategakiKinsokuAdjustment[],
): AtomicVerticalToken[] {
  const pulled: AtomicVerticalToken[] = [];
  while (currentCol.length > 1 && currentCol[currentCol.length - 1].isGyomatsuKinsoku) {
    const popped = currentCol.pop();
    if (popped !== undefined) {
      pulled.unshift(withKinsokuAction(popped, "pushed-opening-bracket"));
      adjustments.push({
        columnIndex: nextColumnIndex,
        glyphText: popped.text,
        action: "pushed-opening-bracket",
        reasonKo: `행말 금칙 여는 괄호 '${popped.text}'를 다음 열 첫머리로 이동`,
      });
    }
  }
  return pulled;
}

/** 열 줄바꿈 및 행두·행말 금칙 처리(禁則処理)를 적용해 열별 토큰 배열을 생성한다. */
function wrapVerticalColumnsWithKinsoku(
  tokens: readonly AtomicVerticalToken[],
  maxGlyphsPerColumn: number,
  allowKinsokuHanging: boolean,
): {
  readonly columns: readonly (readonly AtomicVerticalToken[])[];
  readonly adjustments: readonly TategakiKinsokuAdjustment[];
} {
  const columns: AtomicVerticalToken[][] = [];
  const adjustments: TategakiKinsokuAdjustment[] = [];
  let currentCol: AtomicVerticalToken[] = [];

  const flushColumn = (): void => {
    columns.push(currentCol);
    currentCol = [];
  };

  let idx = 0;
  while (idx < tokens.length) {
    const token = tokens[idx];

    if (token.isLineBreak) {
      flushColumn();
      idx += 1;
      continue;
    }

    // 루비 한자 복합어가 열 경계에서 잘리지 않도록 여유가 부족하면 통째로 다음 열로 보낸다.
    if (
      token.rubyGroupId !== null &&
      currentCol.length > 0 &&
      (idx === 0 || tokens[idx - 1].rubyGroupId !== token.rubyGroupId)
    ) {
      const runLen = measureRubyGroupRunLength(tokens, idx);
      if (runLen <= maxGlyphsPerColumn && currentCol.length + runLen > maxGlyphsPerColumn) {
        const pulledOpening = pullTrailingOpeningBrackets(currentCol, columns.length + 1, adjustments);
        flushColumn();
        for (let p = 0; p < pulledOpening.length; p += 1) currentCol.push(pulledOpening[p]);
      }
    }

    if (currentCol.length < maxGlyphsPerColumn) {
      currentCol.push(token);
      idx += 1;
      continue;
    }

    // 열이 가득 찬 상태에서 다음 토큰이 행두 금칙 문자인 경우
    if (token.isGyotoKinsoku) {
      let runEnd = idx + 1;
      while (runEnd < tokens.length && !tokens[runEnd].isLineBreak && tokens[runEnd].isGyotoKinsoku) {
        runEnd += 1;
      }
      const gyotoRunLen = runEnd - idx;
      let allHangable = true;
      for (let k = idx; k < runEnd; k += 1) {
        if (!tokens[k].isHangablePunctuation) {
          allHangable = false;
          break;
        }
      }

      if (allowKinsokuHanging && allHangable && gyotoRunLen <= 2) {
        for (let k = idx; k < runEnd; k += 1) {
          const hung = withKinsokuAction(tokens[k], "hung-at-column-end");
          currentCol.push(hung);
          adjustments.push({
            columnIndex: columns.length,
            glyphText: hung.text,
            action: "hung-at-column-end",
            reasonKo: `행두 금칙 문장부호 '${hung.text}'를 직전 열 하단에 매달기(ぶら下げ) 처리`,
          });
        }
        idx = runEnd;
        if (idx < tokens.length && !tokens[idx].isLineBreak) flushColumn();
        continue;
      }

      // 밀어내기(追い出し): 직전 열 끝에서 유효한 행두 시작 토큰을 찾아 다음 열로 이동
      let pullStart = currentCol.length - 1;
      while (pullStart > 0 && currentCol[pullStart].isGyotoKinsoku) pullStart -= 1;
      const targetGroupId = currentCol[pullStart].rubyGroupId;
      if (targetGroupId !== null) {
        while (pullStart > 0 && currentCol[pullStart - 1].rubyGroupId === targetGroupId) {
          pullStart -= 1;
        }
      }

      if (pullStart > 0 && !currentCol[pullStart].isGyotoKinsoku) {
        const pulled = currentCol.splice(pullStart);
        flushColumn();
        for (let p = 0; p < pulled.length; p += 1) {
          currentCol.push(withKinsokuAction(pulled[p], "pushed-to-next-column"));
        }
        adjustments.push({
          columnIndex: columns.length,
          glyphText: token.text,
          action: "pushed-to-next-column",
          reasonKo: `행두 금칙 문자 '${token.text}'가 열 첫머리에 오지 않도록 직전 글자 '${pulled[0].text}'를 다음 열로 밀어내기(追い出し) 처리`,
        });
        for (let k = idx; k < runEnd; k += 1) {
          currentCol.push(withKinsokuAction(tokens[k], "pushed-to-next-column"));
        }
        idx = runEnd;
        continue;
      }

      for (let k = idx; k < runEnd; k += 1) {
        const hung = withKinsokuAction(tokens[k], "hung-at-column-end");
        currentCol.push(hung);
        adjustments.push({
          columnIndex: columns.length,
          glyphText: hung.text,
          action: "hung-at-column-end",
          reasonKo: `밀어낼 선행 문자가 없어 행두 금칙 문자 '${hung.text}'를 현재 열 하단에 유지`,
        });
      }
      idx = runEnd;
      continue;
    }

    const pulledOpening = pullTrailingOpeningBrackets(currentCol, columns.length + 1, adjustments);
    flushColumn();
    for (let p = 0; p < pulledOpening.length; p += 1) currentCol.push(pulledOpening[p]);
    currentCol.push(token);
    idx += 1;
  }

  if (currentCol.length > 0 || columns.length === 0) columns.push(currentCol);
  return { columns, adjustments };
}

function boxesOverlap(a: TategakiGlyphBounds, b: TategakiGlyphBounds): boolean {
  const epsilon = 0.01;
  return (
    a.minX + epsilon < b.maxX &&
    a.maxX - epsilon > b.minX &&
    a.minY + epsilon < b.maxY &&
    a.maxY - epsilon > b.minY
  );
}

/**
 * 일본어 만화·웹툰 세로쓰기(Tategaki) 열 조판과 루비·종중횡·금칙 검증을 수행한다.
 */
export function typesetJapaneseTategakiColumns(input: TategakiTypesetInput): TategakiTypesetLayout {
  const fontSizePx = clampFinite(input.fontSizePx, 24, 10, 96);
  const lineAdvanceRatio = clampFinite(input.lineAdvanceRatio, 1.08, 0.9, 2.2);
  const columnGapRatio = clampFinite(input.columnGapRatio, 0.95, 0.25, 3.0);
  const rubyScale = clampFinite(input.rubyScale, 0.45, 0.3, 0.65);
  const rubyOffsetPx = clampFinite(input.rubyOffsetPx, 2, 1, 16);
  const paddingTopPx = clampFinite(input.paddingTopPx, 24, 8, 120);
  const paddingRightPx = clampFinite(input.paddingRightPx, 28, 8, 120);
  const paddingBottomPx = clampFinite(input.paddingBottomPx, 24, 8, 120);
  const paddingLeftPx = clampFinite(input.paddingLeftPx, 24, 8, 120);
  const requestedFrameWidthPx = clampFinite(input.frameWidthPx, 360, 120, 4096);
  const requestedFrameHeightPx = clampFinite(input.frameHeightPx, 320, 80, 4096);
  const allowKinsokuHanging = input.allowKinsokuHanging !== false;

  const glyphAdvancePx = round2(fontSizePx * lineAdvanceRatio);
  const rubyFontSizePx = round2(fontSizePx * rubyScale);
  const availableHeightPx = Math.max(glyphAdvancePx * 2, requestedFrameHeightPx - paddingTopPx - paddingBottomPx);
  const derivedMaxGlyphs = Math.max(2, Math.floor(availableHeightPx / glyphAdvancePx));
  const maxGlyphsPerColumn =
    input.maxGlyphsPerColumn !== undefined && Number.isFinite(input.maxGlyphsPerColumn)
      ? Math.max(2, Math.floor(input.maxGlyphsPerColumn))
      : derivedMaxGlyphs;

  const segments = parseTategakiRubySegments(input.text, input.explicitRubySpans);
  const plainText = segments.map((s) => s.baseText).join("");
  const hasRuby = segments.some((s) => s.rubyGroupId !== null && s.rubyReading !== null);
  const tokens = tokenizeSegmentsForVertical(segments, fontSizePx);
  const wrapped = wrapVerticalColumnsWithKinsoku(tokens, maxGlyphsPerColumn, allowKinsokuHanging);

  // 루비 후리가나가 인접 우측 열과 겹치지 않도록 최소 열 간격을 기하적으로 보장한다.
  const minRubyClearancePx = 3;
  const minPitchForRubyPx = hasRuby
    ? round2(fontSizePx + rubyOffsetPx + rubyFontSizePx + minRubyClearancePx)
    : round2(fontSizePx * 1.25);
  const columnPitchPx = round2(Math.max(fontSizePx * (1 + columnGapRatio), minPitchForRubyPx));
  const rubyReserveRightPx = hasRuby ? round2(rubyOffsetPx + rubyFontSizePx + minRubyClearancePx) : 0;

  const colCount = wrapped.columns.length;
  const requiredWidthPx = round2(
    paddingLeftPx + paddingRightPx + rubyReserveRightPx + fontSizePx + Math.max(0, colCount - 1) * columnPitchPx,
  );
  const totalWidthPx = round2(Math.max(requestedFrameWidthPx, requiredWidthPx));

  let maxColRows = 1;
  for (let c = 0; c < colCount; c += 1) {
    if (wrapped.columns[c].length > maxColRows) maxColRows = wrapped.columns[c].length;
  }
  const totalHeightPx = round2(
    Math.max(requestedFrameHeightPx, paddingTopPx + paddingBottomPx + maxColRows * glyphAdvancePx),
  );

  // 열 0(최우측)에서 왼쪽으로 엄격히 감소하는 X 좌표 계산
  const rightMostColumnX = round2(totalWidthPx - paddingRightPx - rubyReserveRightPx - fontSizePx / 2);

  const columns: TategakiColumnLayout[] = [];
  const rubyAnnotations: TategakiRubyAnnotation[] = [];
  let totalGlyphCells = 0;
  let verticalRotatedCount = 0;
  let tateChuYokoCount = 0;
  let glyphSeq = 1;

  for (let colIdx = 0; colIdx < colCount; colIdx += 1) {
    const colTokens = wrapped.columns[colIdx];
    const colX = round2(rightMostColumnX - colIdx * columnPitchPx);
    const glyphs: TategakiGlyphCell[] = [];

    for (let rowIdx = 0; rowIdx < colTokens.length; rowIdx += 1) {
      const tok = colTokens[rowIdx];
      const cellY = round2(paddingTopPx + fontSizePx / 2 + rowIdx * glyphAdvancePx);
      const half = fontSizePx / 2;
      const glyphId = `c${colIdx}-r${rowIdx}-g${glyphSeq}`;
      glyphSeq += 1;

      if (tok.verticalRotated) verticalRotatedCount += 1;
      if (tok.isTateChuYoko) tateChuYokoCount += 1;
      totalGlyphCells += 1;

      glyphs.push({
        glyphId,
        text: tok.text,
        columnIndex: colIdx,
        rowIndex: rowIdx,
        x: colX,
        y: cellY,
        fontSizePx,
        verticalRotated: tok.verticalRotated,
        rotationDeg: tok.rotationDeg,
        isTateChuYoko: tok.isTateChuYoko,
        opticalOffsetX: tok.opticalOffsetX,
        opticalOffsetY: tok.opticalOffsetY,
        punctuationOpticalShifted: tok.punctuationOpticalShifted,
        isKinsokuAdjusted: tok.kinsokuAction !== "none",
        kinsokuAction: tok.kinsokuAction,
        rubyAnnotationId: tok.rubyGroupId,
        bounds: {
          minX: round2(colX - half),
          maxX: round2(colX + half),
          minY: round2(cellY - half),
          maxY: round2(cellY + half),
        },
      });
    }

    // 열 내부 루비 후리가나 배치 (부모 한자 런 우측 · 같은 열 인접 루비 간 겹침 방지)
    let lastRubyBottomY = -1e9;
    let rIdx = 0;
    while (rIdx < colTokens.length) {
      const groupId = colTokens[rIdx].rubyGroupId;
      const reading = colTokens[rIdx].rubyReading;
      if (groupId === null || reading === null) {
        rIdx += 1;
        continue;
      }
      let runEnd = rIdx + 1;
      while (runEnd < colTokens.length && colTokens[runEnd].rubyGroupId === groupId) runEnd += 1;

      const baseGlyphs = glyphs.slice(rIdx, runEnd);
      const baseText = baseGlyphs.map((g) => g.text).join("");
      const baseTopY = baseGlyphs[0].bounds.minY;
      const baseBottomY = baseGlyphs[baseGlyphs.length - 1].bounds.maxY;
      const baseSpanHeight = Math.max(fontSizePx, baseBottomY - baseTopY);
      const baseCenterY = round2((baseTopY + baseBottomY) / 2);

      const rubyChars = splitUnicodeChars(reading);
      const naturalAdvance = round2(rubyFontSizePx * 1.02);
      const fittedAdvance =
        rubyChars.length > 1
          ? round2(Math.max(rubyFontSizePx * 0.78, (baseSpanHeight - rubyFontSizePx) / (rubyChars.length - 1)))
          : naturalAdvance;
      const rubyCharAdvance = Math.min(naturalAdvance, fittedAdvance);
      const rubySpanHeight = round2(
        rubyChars.length <= 1 ? rubyFontSizePx : (rubyChars.length - 1) * rubyCharAdvance + rubyFontSizePx,
      );
      let rubyTopY = round2(baseCenterY - rubySpanHeight / 2);
      if (rubyTopY < lastRubyBottomY + 1) {
        rubyTopY = round2(lastRubyBottomY + 1);
      }
      const rubyStartY = round2(rubyTopY + rubyFontSizePx / 2);
      const rubyBottomY = round2(rubyTopY + rubySpanHeight);
      lastRubyBottomY = rubyBottomY;

      const rubyLeftX = round2(colX + fontSizePx / 2 + rubyOffsetPx);
      const rubyCenterX = round2(rubyLeftX + rubyFontSizePx / 2);
      const rubyRightX = round2(rubyLeftX + rubyFontSizePx);

      const characters: TategakiRubyCharPlacement[] = [];
      for (let k = 0; k < rubyChars.length; k += 1) {
        characters.push({ char: rubyChars[k], x: rubyCenterX, y: round2(rubyStartY + k * rubyCharAdvance) });
      }

      rubyAnnotations.push({
        rubyId: groupId,
        columnIndex: colIdx,
        baseText,
        reading,
        baseGlyphIds: baseGlyphs.map((g) => g.glyphId),
        fontSizePx: rubyFontSizePx,
        x: rubyCenterX,
        topY: rubyTopY,
        bottomY: rubyBottomY,
        bounds: { minX: rubyLeftX, maxX: rubyRightX, minY: rubyTopY, maxY: rubyBottomY },
        characters,
      });

      rIdx = runEnd;
    }

    columns.push({
      columnIndex: colIdx,
      x: colX,
      topY: glyphs.length > 0 ? glyphs[0].bounds.minY : paddingTopPx,
      bottomY: glyphs.length > 0 ? glyphs[glyphs.length - 1].bounds.maxY : paddingTopPx,
      glyphs,
    });
  }

  // 기하 불변식 검증: 열 우→좌 단조 감소, 글리프 위→아래 단조 증가, 금칙 위반 0건, 루비 열 겹침 0건
  let isRightToLeftMonotonic = true;
  for (let c = 1; c < columns.length; c += 1) {
    if (!(columns[c - 1].x > columns[c].x)) {
      isRightToLeftMonotonic = false;
      break;
    }
  }

  let isTopToBottomMonotonic = true;
  for (let c = 0; c < columns.length; c += 1) {
    const colGlyphs = columns[c].glyphs;
    for (let r = 1; r < colGlyphs.length; r += 1) {
      if (!(colGlyphs[r - 1].y < colGlyphs[r].y)) {
        isTopToBottomMonotonic = false;
        break;
      }
    }
    if (!isTopToBottomMonotonic) break;
  }

  let kinsokuViolationCount = 0;
  for (let c = 1; c < columns.length; c += 1) {
    const firstGlyph = columns[c].glyphs[0];
    if (
      firstGlyph !== undefined &&
      (GYOTO_KINSOKU_CHAR_SET.has(firstGlyph.text) || TATE_CHU_YOKO_PUNCTUATION_SET.has(firstGlyph.text))
    ) {
      kinsokuViolationCount += 1;
    }
  }

  let rubyColumnOverlapCount = 0;
  for (let r = 0; r < rubyAnnotations.length; r += 1) {
    const ruby = rubyAnnotations[r];
    for (let c = 0; c < columns.length; c += 1) {
      if (c === ruby.columnIndex) continue;
      for (let g = 0; g < columns[c].glyphs.length; g += 1) {
        if (boxesOverlap(ruby.bounds, columns[c].glyphs[g].bounds)) rubyColumnOverlapCount += 1;
      }
    }
    for (let otherR = r + 1; otherR < rubyAnnotations.length; otherR += 1) {
      if (boxesOverlap(ruby.bounds, rubyAnnotations[otherR].bounds)) rubyColumnOverlapCount += 1;
    }
  }

  return {
    writingMode: "vertical-rl",
    sourceText: input.text,
    plainText,
    totalWidthPx,
    totalHeightPx,
    fontSizePx,
    rubyFontSizePx,
    columnPitchPx,
    glyphAdvancePx,
    maxGlyphsPerColumn,
    columns,
    rubyAnnotations,
    kinsokuAdjustments: wrapped.adjustments,
    totalGlyphCells,
    verticalRotatedCount,
    tateChuYokoCount,
    rubyAnnotationCount: rubyAnnotations.length,
    kinsokuViolationCount,
    rubyColumnOverlapCount,
    isRightToLeftMonotonic,
    isTopToBottomMonotonic,
  };
}
