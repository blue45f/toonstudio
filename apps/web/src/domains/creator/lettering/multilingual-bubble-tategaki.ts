/**
 * 일본어 세로쓰기(Tategaki) 글리프 회전/치환 경계 처리 코어 (#090).
 *
 * - 말줄임표(`…`/`‥`), 장음부호(`ー`/`〜`/`～`), 괄호(`「」`/`『』`/`（）`),
 *   대시(`—`/`―`/`–`)의 90° 회전 플래그, 유니코드 세로 제시형 치환 문자,
 *   열 경계 금칙(`no-column-start` · `no-column-end` · `keep-with-next`)을 결정론적으로 산출한다.
 * - DOM·브라우저 스토리지 의존 없음.
 */

export type BubbleReflowLocale = "ko" | "en" | "ja" | "es";
export type BubbleWritingMode = "horizontal-tb" | "vertical-rl";

export interface BubbleTextMeasureAdapter {
  measureText(
    text: string,
    fontPx: number,
    locale: BubbleReflowLocale,
    fontFamily?: string,
  ): number;
}

export const BUBBLE_REFLOW_LOCALES: readonly BubbleReflowLocale[] = Object.freeze([
  "ko",
  "en",
  "ja",
  "es",
]);

export type TategakiGlyphCategory =
  | "upright"
  | "ellipsis"
  | "prolonged-sound"
  | "bracket-open"
  | "bracket-close"
  | "dash"
  | "stop"
  | "small-kana"
  | "latin-rotated";

export type TategakiBoundaryRole =
  | "none"
  | "no-column-start"
  | "no-column-end"
  | "keep-with-next";

export interface TategakiGlyphTransform {
  readonly index: number;
  readonly sourceChar: string;
  readonly verticalSubstitute: string;
  readonly category: TategakiGlyphCategory;
  readonly rotate90: boolean;
  readonly rotationDeg: 0 | 90;
  readonly offsetXEm: number;
  readonly offsetYEm: number;
  readonly boundaryRole: TategakiBoundaryRole;
}

export interface TategakiTransformResult {
  readonly sourceText: string;
  readonly normalizedText: string;
  readonly verticalSubstitutedText: string;
  readonly glyphs: readonly TategakiGlyphTransform[];
  readonly rotatedGlyphCount: number;
  readonly substitutedGlyphCount: number;
  readonly ellipsisCount: number;
  readonly prolongedSoundCount: number;
  readonly bracketCount: number;
  readonly dashCount: number;
}

export interface TategakiColumn {
  readonly columnIndex: number;
  readonly text: string;
  readonly verticalText: string;
  readonly glyphs: readonly TategakiGlyphTransform[];
  readonly columnHeightPx: number;
}

export interface TategakiColumnLayout {
  readonly columns: readonly TategakiColumn[];
  readonly columnCount: number;
  readonly requiredWidthPx: number;
  readonly maxColumnHeightPx: number;
  readonly boundaryAdjustments: number;
  readonly transform: TategakiTransformResult;
}

export const TATEGAKI_VERTICAL_SUBSTITUTIONS: Readonly<Record<string, string>> = Object.freeze({
  "…": "︙",
  "‥": "︰",
  "ー": "｜",
  "〜": "︱",
  "～": "︱",
  "「": "﹁",
  "」": "﹂",
  "『": "﹃",
  "』": "﹄",
  "（": "︵",
  "）": "︶",
  "(": "︵",
  ")": "︶",
  "【": "︻",
  "】": "︼",
  "《": "︽",
  "》": "︾",
  "〈": "︿",
  "〉": "﹀",
  "〔": "︹",
  "〕": "︺",
  "—": "︱",
  "―": "︱",
  "–": "︲",
  "─": "︱",
});

const TATEGAKI_ELLIPSIS = new Set(["…", "‥"]);
const TATEGAKI_PROLONGED = new Set(["ー", "〜", "～"]);
const TATEGAKI_OPEN_BRACKETS = new Set(["「", "『", "（", "(", "【", "《", "〈", "〔", "[", "{"]);
const TATEGAKI_CLOSE_BRACKETS = new Set(["」", "』", "）", ")", "】", "》", "〉", "〕", "]", "}"]);
const TATEGAKI_DASHES = new Set(["—", "―", "–", "─"]);
const TATEGAKI_STOPS = new Set(["、", "。", "，", "．"]);
const TATEGAKI_SMALL_KANA = new Set([..."ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ"]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 일본어 세로쓰기(Tategaki) 전환 시 말줄임표(`…`)·장음부호(`ー`)·괄호(`「」`/`『』`/`（）`)·대시(`—`)의
 * 90° 회전 플래그, 유니코드 세로 제시형 치환 문자, 열 경계 금칙 역할을 결정론적으로 산출한다.
 */
export function transformJapaneseTategakiGlyphs(
  sourceText: string,
  options: { readonly normalizeAsciiPunctuation?: boolean } = {},
): TategakiTransformResult {
  const normalize = options.normalizeAsciiPunctuation ?? true;
  const normalizedText = normalize
    ? sourceText.replaceAll("...", "…").replaceAll("--", "—")
    : sourceText;

  const chars = [...normalizedText];
  const glyphs: TategakiGlyphTransform[] = [];
  let rotatedGlyphCount = 0;
  let substitutedGlyphCount = 0;
  let ellipsisCount = 0;
  let prolongedSoundCount = 0;
  let bracketCount = 0;
  let dashCount = 0;

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i] ?? "";
    const next = chars[i + 1];
    const verticalSubstitute = TATEGAKI_VERTICAL_SUBSTITUTIONS[ch] ?? ch;
    const isSubstituted = verticalSubstitute !== ch;

    let category: TategakiGlyphCategory = "upright";
    let rotate90 = false;
    let offsetXEm = 0;
    let offsetYEm = 0;
    let boundaryRole: TategakiBoundaryRole = "none";

    if (TATEGAKI_ELLIPSIS.has(ch)) {
      category = "ellipsis";
      rotate90 = true;
      ellipsisCount += 1;
      boundaryRole = next && TATEGAKI_ELLIPSIS.has(next) ? "keep-with-next" : "no-column-start";
    } else if (TATEGAKI_PROLONGED.has(ch)) {
      category = "prolonged-sound";
      rotate90 = true;
      prolongedSoundCount += 1;
      boundaryRole = "no-column-start";
    } else if (TATEGAKI_OPEN_BRACKETS.has(ch)) {
      category = "bracket-open";
      rotate90 = true;
      bracketCount += 1;
      boundaryRole = "no-column-end";
    } else if (TATEGAKI_CLOSE_BRACKETS.has(ch)) {
      category = "bracket-close";
      rotate90 = true;
      bracketCount += 1;
      boundaryRole = "no-column-start";
    } else if (TATEGAKI_DASHES.has(ch)) {
      category = "dash";
      rotate90 = true;
      dashCount += 1;
      boundaryRole = next && TATEGAKI_DASHES.has(next) ? "keep-with-next" : "none";
    } else if (TATEGAKI_STOPS.has(ch)) {
      category = "stop";
      offsetXEm = 0.5;
      offsetYEm = -0.5;
      boundaryRole = "no-column-start";
    } else if (TATEGAKI_SMALL_KANA.has(ch)) {
      category = "small-kana";
      offsetXEm = 0.08;
      offsetYEm = -0.08;
      boundaryRole = "no-column-start";
    } else if (/^[A-Za-z0-9]$/u.test(ch)) {
      category = "latin-rotated";
      rotate90 = true;
    }

    if (rotate90) rotatedGlyphCount += 1;
    if (isSubstituted) substitutedGlyphCount += 1;

    glyphs.push(
      Object.freeze({
        index: i,
        sourceChar: ch,
        verticalSubstitute,
        category,
        rotate90,
        rotationDeg: rotate90 ? 90 : 0,
        offsetXEm,
        offsetYEm,
        boundaryRole,
      }),
    );
  }

  return Object.freeze({
    sourceText,
    normalizedText,
    verticalSubstitutedText: glyphs.map((g) => g.verticalSubstitute).join(""),
    glyphs: Object.freeze(glyphs),
    rotatedGlyphCount,
    substitutedGlyphCount,
    ellipsisCount,
    prolongedSoundCount,
    bracketCount,
    dashCount,
  });
}

export function layoutJapaneseTategakiColumns(
  text: string,
  params: {
    readonly innerHeightPx: number;
    readonly fontSizePx: number;
    readonly lineHeight: number;
    readonly measureAdapter?: BubbleTextMeasureAdapter;
  },
): TategakiColumnLayout {
  const transform = transformJapaneseTategakiGlyphs(text);
  const maxColHeight = Math.max(params.fontSizePx, params.innerHeightPx);
  const columns: TategakiColumn[] = [];
  let boundaryAdjustments = 0;

  const paragraphSegments: TategakiGlyphTransform[][] = [[]];
  for (const glyph of transform.glyphs) {
    if (glyph.sourceChar === "\n") {
      paragraphSegments.push([]);
    } else {
      paragraphSegments[paragraphSegments.length - 1]?.push(glyph);
    }
  }

  const glyphAdvance = (glyph: TategakiGlyphTransform): number => {
    if (glyph.category === "latin-rotated" && params.measureAdapter) {
      return Math.max(
        params.fontSizePx * 0.55,
        params.measureAdapter.measureText(glyph.sourceChar, params.fontSizePx, "ja"),
      );
    }
    return params.fontSizePx;
  };

  for (const segment of paragraphSegments) {
    if (segment.length === 0) {
      columns.push(
        Object.freeze({
          columnIndex: columns.length,
          text: "",
          verticalText: "",
          glyphs: Object.freeze([]),
          columnHeightPx: 0,
        }),
      );
      continue;
    }

    let cursor = 0;
    while (cursor < segment.length) {
      let accHeight = 0;
      let end = cursor;
      while (end < segment.length) {
        const step = glyphAdvance(segment[end]!);
        if (end > cursor && accHeight + step > maxColHeight) break;
        accHeight += step;
        end += 1;
      }

      if (end < segment.length && end > cursor + 1) {
        let adjusted = end;
        const minCut = Math.max(cursor + 1, end - 3);
        while (adjusted > minCut) {
          const prevGlyph = segment[adjusted - 1];
          const nextGlyph = segment[adjusted];
          const badEnd =
            prevGlyph?.boundaryRole === "no-column-end" ||
            prevGlyph?.boundaryRole === "keep-with-next";
          const badStart = nextGlyph?.boundaryRole === "no-column-start";
          if (!badEnd && !badStart) break;
          adjusted -= 1;
        }
        if (adjusted !== end) {
          end = adjusted;
          boundaryAdjustments += 1;
        }
      }

      const slice = segment.slice(cursor, end);
      const colHeight = round2(slice.reduce((sum, g) => sum + glyphAdvance(g), 0));
      columns.push(
        Object.freeze({
          columnIndex: columns.length,
          text: slice.map((g) => g.sourceChar).join(""),
          verticalText: slice.map((g) => g.verticalSubstitute).join(""),
          glyphs: Object.freeze(slice),
          columnHeightPx: colHeight,
        }),
      );
      cursor = end;
    }
  }

  const columnStride = params.fontSizePx * params.lineHeight;
  return Object.freeze({
    columns: Object.freeze(columns),
    columnCount: columns.length,
    requiredWidthPx: round2(columns.length * columnStride),
    maxColumnHeightPx: columns.reduce((max, c) => Math.max(max, c.columnHeightPx), 0),
    boundaryAdjustments,
    transform,
  });
}
