/**
 * 다국어(한·영·일·스페인어) 말풍선 자동 리플로우 솔버 (#086–#090).
 *
 * - `measureText` 어댑터 기반 4개 국어(`ko | en | ja | es`) 말풍선 세이프 패딩(14%)·행간·
 *   `keep-all`/하이픈 자동 줄바꿈 피팅 솔버 + 넘침 컷 빨간 배지 분류.
 * - 일본어 세로쓰기(Tategaki) 글리프 회전/치환(#090), SFX 비손상 레이어 메타데이터,
 *   대사 CSV/XLIFF 1.2 1클릭 추출·역주입 코어를 통합 재수출한다.
 * - DOM·브라우저 스토리지 의존 없음(순수·결정적).
 */

import {
  BUBBLE_REFLOW_LOCALES,
  layoutJapaneseTategakiColumns,
  type BubbleReflowLocale,
  type BubbleTextMeasureAdapter,
  type BubbleWritingMode,
  type TategakiColumnLayout,
} from "./multilingual-bubble-tategaki";

export {
  BUBBLE_REFLOW_LOCALES,
  layoutJapaneseTategakiColumns,
  TATEGAKI_VERTICAL_SUBSTITUTIONS,
  transformJapaneseTategakiGlyphs,
  type BubbleReflowLocale,
  type BubbleTextMeasureAdapter,
  type BubbleWritingMode,
  type TategakiBoundaryRole,
  type TategakiColumn,
  type TategakiColumnLayout,
  type TategakiGlyphCategory,
  type TategakiGlyphTransform,
  type TategakiTransformResult,
} from "./multilingual-bubble-tategaki";
export {
  createSfxNonDestructiveLayerMetadata,
  exportDialogueToCsv,
  exportDialogueToXliff,
  importDialogueFromCsv,
  importDialogueFromXliff,
  reinjectLocalizedDialogueEntries,
  updateSfxLocaleVariant,
  type DialogueInterchangeEntry,
  type DialogueReinjectionReport,
  type SfxArchWarpShape,
  type SfxNonDestructiveLayerMetadata,
} from "./multilingual-bubble-interchange";

export type BubbleFitStatus = "ok" | "shrunk-fit" | "overflow";
export type BubbleBadgeTone = "green" | "amber" | "red";

export interface CanvasMeasureContextLike {
  font: string;
  measureText(text: string): { readonly width: number };
}

export interface LocaleTypographyProfile {
  readonly locale: BubbleReflowLocale;
  readonly labelKo: string;
  readonly defaultLineHeight: number;
  readonly minLineHeight: number;
  readonly minFontSizePx: number;
  readonly wordBreakMode: "keep-all" | "hyphenate" | "cjk-kinsoku";
  readonly supportsTategaki: boolean;
}

/** 말풍선 내 안전 여백 비율(가로·세로 각 변 14%). */
export const BUBBLE_SAFE_PADDING_RATIO = 0.14;

export const LOCALE_TYPOGRAPHY_PROFILES: Readonly<
  Record<BubbleReflowLocale, LocaleTypographyProfile>
> = Object.freeze({
  ko: Object.freeze({
    locale: "ko",
    labelKo: "한국어",
    defaultLineHeight: 1.35,
    minLineHeight: 1.2,
    minFontSizePx: 11,
    wordBreakMode: "keep-all",
    supportsTategaki: false,
  }),
  en: Object.freeze({
    locale: "en",
    labelKo: "영어",
    defaultLineHeight: 1.24,
    minLineHeight: 1.12,
    minFontSizePx: 11,
    wordBreakMode: "hyphenate",
    supportsTategaki: false,
  }),
  ja: Object.freeze({
    locale: "ja",
    labelKo: "일본어",
    defaultLineHeight: 1.42,
    minLineHeight: 1.25,
    minFontSizePx: 11,
    wordBreakMode: "cjk-kinsoku",
    supportsTategaki: true,
  }),
  es: Object.freeze({
    locale: "es",
    labelKo: "스페인어",
    defaultLineHeight: 1.26,
    minLineHeight: 1.14,
    minFontSizePx: 11,
    wordBreakMode: "hyphenate",
    supportsTategaki: false,
  }),
});

export interface MultilingualBubbleReflowInput {
  readonly cutId?: string;
  readonly bubbleId?: string;
  readonly text: string;
  readonly locale: BubbleReflowLocale;
  readonly boxWidthPx: number;
  readonly boxHeightPx: number;
  readonly baseFontSizePx: number;
  readonly minFontSizePx?: number;
  readonly lineHeight?: number;
  readonly safePaddingRatio?: number;
  readonly writingMode?: BubbleWritingMode;
  readonly fontFamily?: string;
  readonly measureAdapter?: BubbleTextMeasureAdapter;
}

export interface MultilingualBubbleReflowResult {
  readonly cutId: string;
  readonly bubbleId: string;
  readonly locale: BubbleReflowLocale;
  readonly writingMode: BubbleWritingMode;
  readonly safePaddingRatio: number;
  readonly safePaddingXPx: number;
  readonly safePaddingYPx: number;
  readonly innerWidthPx: number;
  readonly innerHeightPx: number;
  readonly fittedFontSizePx: number;
  readonly fittedLineHeight: number;
  readonly lines: readonly string[];
  readonly lineCount: number;
  readonly hyphenatedLineCount: number;
  readonly requiredExtentPx: number;
  readonly availableExtentPx: number;
  readonly utilizationRatio: number;
  readonly fitStatus: BubbleFitStatus;
  readonly badgeTone: BubbleBadgeTone;
  readonly badgeLabelKo: string;
  readonly overflowPx: number;
  readonly tategaki: TategakiColumnLayout | null;
}

export interface OverflowCutInput {
  readonly cutId: string;
  readonly bubbleId: string;
  readonly locale: BubbleReflowLocale;
  readonly text: string;
  readonly boxWidthPx: number;
  readonly boxHeightPx: number;
  readonly baseFontSizePx: number;
  readonly writingMode?: BubbleWritingMode;
}

export interface OverflowCutBatchReport {
  readonly totalBubbles: number;
  readonly redBadgeCount: number;
  readonly amberBadgeCount: number;
  readonly greenBadgeCount: number;
  readonly redBadgeCutIds: readonly string[];
  readonly results: readonly MultilingualBubbleReflowResult[];
}

const HORIZONTAL_NO_LINE_START = new Set([...".,!?…、。，．！？ー」』）】》〉〕])}:;"]);
const HORIZONTAL_NO_LINE_END = new Set([..."「『（【《〈〔[({₩$€£"]);
const LATIN_VOWELS = new Set([..."aeiouyáéíóúüAEIOUYÁÉÍÓÚÜ"]);
const INSEPARABLE_DIGRAPHS = new Set([
  "ch",
  "ll",
  "rr",
  "th",
  "sh",
  "ph",
  "qu",
  "tr",
  "pr",
  "br",
  "cr",
  "dr",
  "fr",
  "gr",
  "pl",
  "bl",
  "cl",
  "fl",
  "gl",
]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function isWideCjkChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3000 && code <= 0x30ff) ||
    (code >= 0x3130 && code <= 0x318f) ||
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xff00 && code <= 0xff60)
  );
}

/**
 * Canvas 2D `measureText` 컨텍스트를 솔버 어댑터로 감싼다.
 */
export function createCanvasMeasureTextAdapter(
  ctx: CanvasMeasureContextLike,
): BubbleTextMeasureAdapter {
  return {
    measureText(text, fontPx, _locale, fontFamily = "Pretendard, sans-serif"): number {
      ctx.font = `700 ${fontPx}px ${fontFamily}`;
      const width = ctx.measureText(text).width;
      return Number.isFinite(width) && width >= 0 ? width : 0;
    },
  };
}

/**
 * DOM/Canvas 없이 스크립트별 평균 폭 계수로 결정론 폭을 계산하는 기본 어댑터.
 */
export function createDeterministicMeasureTextAdapter(): BubbleTextMeasureAdapter {
  return {
    measureText(text, fontPx, locale): number {
      if (!text || fontPx <= 0) return 0;
      const localeAdjust = locale === "es" ? 1.03 : 1.0;
      let emTotal = 0;
      for (const ch of text) {
        if (ch === " ") {
          emTotal += 0.32;
        } else if (isWideCjkChar(ch)) {
          emTotal += 1.0;
        } else if ("ilI1.,!|:;'`".includes(ch)) {
          emTotal += 0.34;
        } else if ("mwMW@%".includes(ch)) {
          emTotal += 0.86;
        } else if (ch === "-") {
          emTotal += 0.38;
        } else if (/[A-ZÁÉÍÓÚÑÜ]/u.test(ch)) {
          emTotal += 0.68;
        } else {
          emTotal += 0.56;
        }
      }
      return round2(emTotal * fontPx * localeAdjust);
    },
  };
}

const DEFAULT_MEASURE_ADAPTER = createDeterministicMeasureTextAdapter();

/**
 * 영어·스페인어 단어를 음절 경계로 분할한다(1글자 고아 조각 방지 · 문장부호 보존).
 */
export function hyphenateLatinWord(word: string, locale: "en" | "es"): readonly string[] {
  const trimmed = word.trim();
  const match = /^([("'¡¿«]*)([A-Za-zÁÉÍÓÚÑÜáéíóúñü]+)([)"'!?.,;:»]*)$/u.exec(trimmed);
  if (!match) return Object.freeze([trimmed]);
  const prefixPunct = match[1] ?? "";
  const clean = match[2] ?? "";
  const suffixPunct = match[3] ?? "";
  if (clean.length < 6) {
    return Object.freeze([trimmed]);
  }
  const lower = clean.toLowerCase();
  const breakIndices: number[] = [];

  for (let i = 2; i < clean.length - 2; i += 1) {
    const prev = lower[i - 1] ?? "";
    const curr = lower[i] ?? "";
    const next = lower[i + 1] ?? "";
    const pair = `${curr}${next}`;
    const prevCurr = `${prev}${curr}`;

    if (INSEPARABLE_DIGRAPHS.has(prevCurr)) continue;

    if (LATIN_VOWELS.has(prev) && !LATIN_VOWELS.has(curr) && LATIN_VOWELS.has(next)) {
      breakIndices.push(i);
      continue;
    }
    if (
      !LATIN_VOWELS.has(curr) &&
      !LATIN_VOWELS.has(next) &&
      !INSEPARABLE_DIGRAPHS.has(pair) &&
      i + 2 < clean.length - 1
    ) {
      breakIndices.push(i + 1);
      continue;
    }
    if (
      locale === "en" &&
      (lower.slice(i) === "tion" || lower.slice(i) === "ment" || lower.slice(i) === "ness")
    ) {
      breakIndices.push(i);
    }
  }

  const uniqueBreaks = [...new Set(breakIndices)]
    .filter((idx) => idx >= 2 && idx <= clean.length - 2)
    .sort((a, b) => a - b);

  if (uniqueBreaks.length === 0) return Object.freeze([trimmed]);

  const syllables: string[] = [];
  let start = 0;
  for (const br of uniqueBreaks) {
    if (br - start < 2 || clean.length - br < 2) continue;
    syllables.push(clean.slice(start, br));
    start = br;
  }
  syllables.push(clean.slice(start));
  if (syllables.length <= 1) return Object.freeze([trimmed]);
  syllables[0] = `${prefixPunct}${syllables[0]}`;
  syllables[syllables.length - 1] = `${syllables[syllables.length - 1]}${suffixPunct}`;
  return Object.freeze(syllables);
}

function wrapHorizontalLines(params: {
  readonly text: string;
  readonly locale: BubbleReflowLocale;
  readonly innerWidthPx: number;
  readonly fontSizePx: number;
  readonly fontFamily?: string;
  readonly adapter: BubbleTextMeasureAdapter;
}): {
  readonly lines: readonly string[];
  readonly hyphenatedLineCount: number;
  readonly maxLineWidthPx: number;
} {
  const { text, locale, innerWidthPx, fontSizePx, fontFamily, adapter } = params;
  const measure = (s: string) => adapter.measureText(s, fontSizePx, locale, fontFamily);
  const paragraphs = text.split(/\r?\n/u);
  const lines: string[] = [];
  let hyphenatedLineCount = 0;

  const breakCharsWithKinsoku = (segment: string): string[] => {
    const chars = [...segment];
    const out: string[] = [];
    let cursor = 0;
    while (cursor < chars.length) {
      let end = cursor + 1;
      while (end < chars.length) {
        if (measure(chars.slice(cursor, end + 1).join("")) > innerWidthPx) break;
        end += 1;
      }
      if (end < chars.length && end > cursor + 1) {
        const minBack = Math.max(cursor + 1, end - 3);
        while (end > minBack) {
          const prevChar = chars[end - 1] ?? "";
          const nextChar = chars[end] ?? "";
          if (!HORIZONTAL_NO_LINE_END.has(prevChar) && !HORIZONTAL_NO_LINE_START.has(nextChar)) {
            break;
          }
          end -= 1;
        }
      }
      out.push(chars.slice(cursor, end).join(""));
      cursor = end;
    }
    return out;
  };

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push("");
      continue;
    }

    if (locale === "ja") {
      lines.push(...breakCharsWithKinsoku(trimmed));
      continue;
    }

    const words = trimmed.split(/\s+/u).filter(Boolean);
    let currentLine = "";

    const flushWord = (word: string): void => {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (measure(candidate) <= innerWidthPx) {
        currentLine = candidate;
        return;
      }

      if (locale === "en" || locale === "es") {
        const syllables = hyphenateLatinWord(word, locale);
        if (syllables.length > 1) {
          const shouldTryCurrentLine =
            !currentLine || measure(word) > innerWidthPx || measure(currentLine) < innerWidthPx * 0.65;
          if (shouldTryCurrentLine) {
            let bestSplit = -1;
            for (let k = 1; k < syllables.length; k += 1) {
              const head = `${syllables.slice(0, k).join("")}-`;
              const testLine = currentLine ? `${currentLine} ${head}` : head;
              if (measure(testLine) <= innerWidthPx) {
                bestSplit = k;
              } else {
                break;
              }
            }
            if (bestSplit > 0) {
              const head = `${syllables.slice(0, bestSplit).join("")}-`;
              lines.push(currentLine ? `${currentLine} ${head}` : head);
              hyphenatedLineCount += 1;
              currentLine = "";
              flushWord(syllables.slice(bestSplit).join(""));
              return;
            }
          }
        }
      }

      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      if (measure(word) <= innerWidthPx) {
        currentLine = word;
        return;
      }

      const broken = breakCharsWithKinsoku(word);
      for (let i = 0; i < broken.length - 1; i += 1) {
        lines.push(broken[i]!);
      }
      currentLine = broken[broken.length - 1] ?? "";
    };

    for (const word of words) {
      flushWord(word);
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  const maxLineWidthPx = lines.reduce((max, line) => Math.max(max, measure(line)), 0);
  return { lines: Object.freeze(lines), hyphenatedLineCount, maxLineWidthPx };
}

/**
 * 4개 국어(`ko | en | ja | es`) 말풍선 세이프 패딩(14%)·행간·`keep-all`/하이픈/세로쓰기 자동 피팅 솔버.
 */
export function solveMultilingualBubbleReflow(
  input: MultilingualBubbleReflowInput,
): MultilingualBubbleReflowResult {
  const profile = LOCALE_TYPOGRAPHY_PROFILES[input.locale];
  const safePaddingRatio = clamp(input.safePaddingRatio ?? BUBBLE_SAFE_PADDING_RATIO, 0, 0.35);
  const safePaddingXPx = round2(input.boxWidthPx * safePaddingRatio);
  const safePaddingYPx = round2(input.boxHeightPx * safePaddingRatio);
  const innerWidthPx = Math.max(12, round2(input.boxWidthPx - safePaddingXPx * 2));
  const innerHeightPx = Math.max(12, round2(input.boxHeightPx - safePaddingYPx * 2));
  const baseFontSizePx = Math.max(8, input.baseFontSizePx);
  const minFontSizePx = Math.min(baseFontSizePx, Math.max(8, input.minFontSizePx ?? profile.minFontSizePx));
  const baseLineHeight = input.lineHeight ?? profile.defaultLineHeight;
  const writingMode: BubbleWritingMode = input.writingMode ?? "horizontal-tb";
  const adapter = input.measureAdapter ?? DEFAULT_MEASURE_ADAPTER;

  const evaluateAt = (fontSizePx: number, lineHeight: number) => {
    if (input.text.trim().length === 0) {
      return {
        fits: true,
        lines: [] as readonly string[],
        lineCount: 0,
        hyphenatedLineCount: 0,
        requiredExtentPx: 0,
        availableExtentPx: writingMode === "vertical-rl" ? innerWidthPx : innerHeightPx,
        tategaki:
          writingMode === "vertical-rl"
            ? layoutJapaneseTategakiColumns("", {
                innerHeightPx,
                fontSizePx,
                lineHeight,
                measureAdapter: adapter,
              })
            : null,
      };
    }

    if (writingMode === "vertical-rl") {
      const tategaki = layoutJapaneseTategakiColumns(input.text, {
        innerHeightPx,
        fontSizePx,
        lineHeight,
        measureAdapter: adapter,
      });
      const fits =
        tategaki.requiredWidthPx <= innerWidthPx + 0.01 &&
        tategaki.maxColumnHeightPx <= innerHeightPx + 0.01;
      return {
        fits,
        lines: tategaki.columns.map((c) => c.verticalText),
        lineCount: tategaki.columnCount,
        hyphenatedLineCount: 0,
        requiredExtentPx: tategaki.requiredWidthPx,
        availableExtentPx: innerWidthPx,
        tategaki,
      };
    }

    const wrapped = wrapHorizontalLines({
      text: input.text,
      locale: input.locale,
      innerWidthPx,
      fontSizePx,
      fontFamily: input.fontFamily,
      adapter,
    });
    const requiredHeight = round2(wrapped.lines.length * fontSizePx * lineHeight);
    const fits =
      requiredHeight <= innerHeightPx + 0.01 &&
      wrapped.maxLineWidthPx <= innerWidthPx + 0.01;
    return {
      fits,
      lines: wrapped.lines,
      lineCount: wrapped.lines.length,
      hyphenatedLineCount: wrapped.hyphenatedLineCount,
      requiredExtentPx: requiredHeight,
      availableExtentPx: innerHeightPx,
      tategaki: null,
    };
  };

  let chosenFont = baseFontSizePx;
  let chosenLineHeight = baseLineHeight;
  let chosenEval = evaluateAt(baseFontSizePx, baseLineHeight);

  if (!chosenEval.fits) {
    let found = false;
    const lineHeightCandidates =
      baseLineHeight > profile.minLineHeight
        ? [baseLineHeight, round2(Math.max(profile.minLineHeight, baseLineHeight - 0.1))]
        : [baseLineHeight];

    for (let font = baseFontSizePx; font >= minFontSizePx - 1e-6; font = round2(font - 0.5)) {
      for (const lh of lineHeightCandidates) {
        const probe = evaluateAt(font, lh);
        if (probe.fits) {
          chosenFont = font;
          chosenLineHeight = lh;
          chosenEval = probe;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      chosenFont = minFontSizePx;
      chosenLineHeight = lineHeightCandidates[lineHeightCandidates.length - 1] ?? baseLineHeight;
      chosenEval = evaluateAt(chosenFont, chosenLineHeight);
    }
  }

  const overflowPx = chosenEval.fits
    ? 0
    : Math.max(1, Math.ceil(chosenEval.requiredExtentPx - chosenEval.availableExtentPx));
  const utilizationRatio = round2(
    chosenEval.requiredExtentPx / Math.max(1, chosenEval.availableExtentPx),
  );

  let fitStatus: BubbleFitStatus;
  let badgeTone: BubbleBadgeTone;
  let badgeLabelKo: string;
  if (!chosenEval.fits) {
    fitStatus = "overflow";
    badgeTone = "red";
    badgeLabelKo = `넘침 +${overflowPx}px`;
  } else if (chosenFont < baseFontSizePx || utilizationRatio > 0.88) {
    fitStatus = "shrunk-fit";
    badgeTone = "amber";
    badgeLabelKo = chosenFont < baseFontSizePx ? `축소 맞춤 ${chosenFont}px` : "여백 빠듯";
  } else {
    fitStatus = "ok";
    badgeTone = "green";
    badgeLabelKo = "안전 맞춤";
  }

  return Object.freeze({
    cutId: input.cutId ?? "cut-001",
    bubbleId: input.bubbleId ?? "bubble-001",
    locale: input.locale,
    writingMode,
    safePaddingRatio,
    safePaddingXPx,
    safePaddingYPx,
    innerWidthPx,
    innerHeightPx,
    fittedFontSizePx: chosenFont,
    fittedLineHeight: chosenLineHeight,
    lines: Object.freeze([...chosenEval.lines]),
    lineCount: chosenEval.lineCount,
    hyphenatedLineCount: chosenEval.hyphenatedLineCount,
    requiredExtentPx: chosenEval.requiredExtentPx,
    availableExtentPx: chosenEval.availableExtentPx,
    utilizationRatio,
    fitStatus,
    badgeTone,
    badgeLabelKo,
    overflowPx,
    tategaki: chosenEval.tategaki,
  });
}

/**
 * 컷/말풍선 배치를 일괄 리플로우 진단해 넘침 컷을 빨간 배지(`red`)로 분류한다.
 */
export function classifyOverflowCuts(
  cuts: readonly OverflowCutInput[],
  options: {
    readonly safePaddingRatio?: number;
    readonly minFontSizePx?: number;
    readonly measureAdapter?: BubbleTextMeasureAdapter;
  } = {},
): OverflowCutBatchReport {
  const results = cuts.map((cut) =>
    solveMultilingualBubbleReflow({
      cutId: cut.cutId,
      bubbleId: cut.bubbleId,
      locale: cut.locale,
      text: cut.text,
      boxWidthPx: cut.boxWidthPx,
      boxHeightPx: cut.boxHeightPx,
      baseFontSizePx: cut.baseFontSizePx,
      writingMode: cut.writingMode,
      safePaddingRatio: options.safePaddingRatio,
      minFontSizePx: options.minFontSizePx,
      measureAdapter: options.measureAdapter,
    }),
  );

  const redBadgeCutIds = [
    ...new Set(results.filter((r) => r.badgeTone === "red").map((r) => r.cutId)),
  ];
  return Object.freeze({
    totalBubbles: results.length,
    redBadgeCount: results.filter((r) => r.badgeTone === "red").length,
    amberBadgeCount: results.filter((r) => r.badgeTone === "amber").length,
    greenBadgeCount: results.filter((r) => r.badgeTone === "green").length,
    redBadgeCutIds: Object.freeze(redBadgeCutIds),
    results: Object.freeze(results),
  });
}

/** 4개 국어 지원 코드 여부 판정. */
export function isBubbleReflowLocale(value: string): value is BubbleReflowLocale {
  return (BUBBLE_REFLOW_LOCALES as readonly string[]).includes(value);
}
