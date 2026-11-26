/**
 * 한글·영문·숫자·전각 문장부호 광학 커닝 및 시각 중심축 기준선 조화·말풍선 줄바꿈 엔진.
 *
 * - 코드포인트별로 한글 음절, 영문 대·소문자, 고정폭 숫자, 전각 여닫는 따옴표(`「『（《` / `」』）》`),
 *   말줄임표·줄표(`…—`), 종결·구두 문장부호(`?!.,`)를 분류한다.
 * - 연속 전각 따옴표(`」「` `-0.35em`), 전각 따옴표 바깥 여백 반폭 트림(`-0.25em`),
 *   한글↔영문·숫자 밀착 구간 광학 숨통(`+0.04em`), 고정폭 숫자(`tabular-digit`) 폭 고정을 계산한다.
 * - 한글 시각 중심축에 맞춰 영문 대문자·숫자의 세로 기준선을 `+0.055em`~`+0.085em` 범위로 들어 올려
 *   `"120FPS 액션!"` 같은 혼용 식자에서 영문·숫자가 아래로 처지는 현상을 막는다.
 * - Knuth-Plass 동적 계획법으로 어절 단위(`keep-all`) 3제곱 여백 편차와 마지막 줄 외톨이 어절을
 *   동시에 최소화해 타원형·사각형 말풍선 윤곽에 맞는 줄바꿈 배치를 산출한다.
 */

export const MIXED_SCRIPT_GLYPH_CLASSES = Object.freeze([
  "hangul-syllable", "latin-upper", "latin-lower", "tabular-digit",
  "cjk-open-quote", "cjk-close-quote", "ellipsis-dash", "terminal-punct",
  "whitespace", "other-symbol",
] as const);

export type MixedScriptGlyphClass = (typeof MIXED_SCRIPT_GLYPH_CLASSES)[number];

/** 연속 전각 닫는 따옴표 + 여는 따옴표(`」「`) 사이 광학 조임 기본값(`em`). */
export const CONSECUTIVE_CJK_QUOTE_KERN_EM = -0.35 as const;

/** 전각 따옴표(`「`, `」` 등) 줄 끝·공백 인접 바깥쪽 반폭 여백 트림 기본값(`em`). */
export const CJK_QUOTE_OUTER_HALF_TRIM_EM = -0.25 as const;

/** 한글과 영문·숫자가 공백 없이 맞닿을 때 확보하는 광학 숨통 간격(`em`). */
export const HANGUL_ALPHANUM_BREATHING_KERN_EM = 0.04 as const;

/** 한글 시각 중심축 정렬을 위한 영문 대문자 기준선 광학 상승량 최소·기본·최대값(`em`). */
export const MIN_CENTRAL_AXIS_OPTICAL_LIFT_EM = 0.055 as const;
export const DEFAULT_LATIN_UPPER_OPTICAL_LIFT_EM = 0.072 as const;
export const DEFAULT_TABULAR_DIGIT_OPTICAL_LIFT_EM = 0.066 as const;
export const MAX_CENTRAL_AXIS_OPTICAL_LIFT_EM = 0.085 as const;

/** 고정폭 숫자(`0`~`9`)의 균일 전진폭(`em`). */
export const TABULAR_DIGIT_ADVANCE_EM = 0.6 as const;

/** 마지막 줄 외톨이 어절(1어절 잔류) 방지를 위한 Knuth-Plass 벌점 가중치. */
export const WIDOW_EOJEOL_PENALTY = 500_000 as const;

export type BalloonContourShape = "ellipse" | "rounded-rect" | "rectangle";

export interface OpticalKerningOptions {
  /** 영문 대문자 세로 기준선 상승량(`+0.055em`~`+0.085em` 범위 권장, 기본 `0.072`). */
  readonly latinUpperLiftEm?: number;
  /** 고정폭 숫자 세로 기준선 상승량(`+0.055em`~`+0.085em` 범위 권장, 기본 `0.066`). */
  readonly tabularDigitLiftEm?: number;
  /** 영문 소문자 세로 기준선 상승량(기본 `0.058`). */
  readonly latinLowerLiftEm?: number;
  /** 한글↔영문·숫자 인접 광학 간격(기본 `+0.04em`). */
  readonly hangulAlphanumKernEm?: number;
  /** 연속 전각 따옴표(`」「`) 조임량(기본 `-0.35em`). */
  readonly consecutiveQuoteKernEm?: number;
  /** 전각 따옴표 바깥쪽 반폭 트림량(기본 `-0.25em`). */
  readonly quoteOuterHalfTrimEm?: number;
  /** 어절 사이 공백 전진폭(기본 `0.28em`). */
  readonly spaceAdvanceEm?: number;
}

export interface OpticalShapedGlyph {
  readonly index: number;
  readonly char: string;
  readonly codePoint: number;
  readonly glyphClass: MixedScriptGlyphClass;
  readonly baseAdvanceEm: number;
  readonly halfWidthTrimEm: number;
  readonly kernBeforeEm: number;
  readonly effectiveAdvanceEm: number;
  readonly xEm: number;
  readonly dyEm: number;
  readonly isTabularLocked: boolean;
}

export interface OpticalMixedRunResult {
  readonly text: string;
  readonly glyphs: readonly OpticalShapedGlyph[];
  readonly totalAdvanceEm: number;
  readonly unshapedAdvanceEm: number;
  readonly netOpticalDeltaEm: number;
  readonly hangulAlphanumBreathingCount: number;
  readonly tightenedQuotePairCount: number;
}

export interface BalloonTypographyLayoutInput {
  readonly text: string;
  readonly maxWidthEm?: number;
  readonly maxWidthPx?: number;
  readonly fontSizePx?: number;
  readonly lineHeightEm?: number;
  readonly shape?: BalloonContourShape;
  readonly ellipseMinChordRatio?: number;
  readonly kerningOptions?: OpticalKerningOptions;
}

export interface BalloonTypographyLine {
  readonly lineIndex: number;
  readonly text: string;
  readonly eojeols: readonly string[];
  readonly eojeolCount: number;
  readonly glyphs: readonly OpticalShapedGlyph[];
  readonly targetWidthEm: number;
  readonly actualWidthEm: number;
  readonly slackEm: number;
  readonly cubicRaggedness: number;
  readonly centerOffsetXEm: number;
  readonly baselineYEm: number;
}

export interface GreedyLineBreakBaseline {
  readonly lines: readonly string[];
  readonly lineCount: number;
  readonly widowCount: number;
  readonly cubicRaggednessPenalty: number;
}

export interface BalloonTypographyLayoutResult {
  readonly shape: BalloonContourShape;
  readonly fontSizePx: number;
  readonly maxBalloonWidthEm: number;
  readonly totalEojeolCount: number;
  readonly lines: readonly BalloonTypographyLine[];
  readonly lineCount: number;
  readonly widowCount: number;
  readonly cubicRaggednessPenalty: number;
  readonly greedyBaseline: GreedyLineBreakBaseline;
  readonly raggednessReductionRatio: number;
}

const CJK_OPEN_QUOTE_CODES = new Set<number>([0x300c, 0x300e, 0xff08, 0x300a, 0x3008, 0x3010, 0x3014, 0x201c, 0x2018]);
const CJK_CLOSE_QUOTE_CODES = new Set<number>([0x300d, 0x300f, 0xff09, 0x300b, 0x3009, 0x3011, 0x3015, 0x201d, 0x2019]);
const ELLIPSIS_DASH_CODES = new Set<number>([0x2026, 0x2014, 0x2015, 0x2013, 0x22ef, 0x301c]);
const TERMINAL_PUNCT_CODES = new Set<number>([
  0x003f, 0x0021, 0x002e, 0x002c, 0x003a, 0x003b, 0xff1f, 0xff01, 0x3002, 0xff0c, 0x3001, 0xff1a, 0xff1b, 0x00b7, 0x30fb,
]);

function clampNumber(value: number, min: number, max: number): number {
  return Number.isNaN(value) ? min : Math.min(max, Math.max(min, value));
}

function roundEm(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isWhitespaceCode(cp: number): boolean {
  return cp === 0x0020 || cp === 0x0009 || cp === 0x000a || cp === 0x000d || cp === 0x3000;
}

/**
 * 단일 유니코드 코드포인트를 한글·영문·숫자·전각 문장부호 시각 계층으로 분류한다.
 */
export function classifyMixedScriptCodePoint(codePoint: number): MixedScriptGlyphClass {
  if (isWhitespaceCode(codePoint)) return "whitespace";

  if (
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
    (codePoint >= 0x3130 && codePoint <= 0x318f) ||
    (codePoint >= 0xa960 && codePoint <= 0xa97f) ||
    (codePoint >= 0xd7b0 && codePoint <= 0xd7ff)
  ) {
    return "hangul-syllable";
  }

  if ((codePoint >= 0x0041 && codePoint <= 0x005a) || (codePoint >= 0xff21 && codePoint <= 0xff3a)) {
    return "latin-upper";
  }
  if ((codePoint >= 0x0061 && codePoint <= 0x007a) || (codePoint >= 0xff41 && codePoint <= 0xff5a)) {
    return "latin-lower";
  }
  if ((codePoint >= 0x0030 && codePoint <= 0x0039) || (codePoint >= 0xff10 && codePoint <= 0xff19)) {
    return "tabular-digit";
  }

  if (CJK_OPEN_QUOTE_CODES.has(codePoint)) return "cjk-open-quote";
  if (CJK_CLOSE_QUOTE_CODES.has(codePoint)) return "cjk-close-quote";
  if (ELLIPSIS_DASH_CODES.has(codePoint)) return "ellipsis-dash";
  if (TERMINAL_PUNCT_CODES.has(codePoint)) return "terminal-punct";
  return "other-symbol";
}

function isLatinOrDigitClass(c: MixedScriptGlyphClass): boolean {
  return c === "latin-upper" || c === "latin-lower" || c === "tabular-digit";
}

/**
 * 글리프 분류와 코드포인트에 따른 기본 전진폭(`em`)을 반환한다.
 */
export function getNominalGlyphAdvanceEm(
  glyphClass: MixedScriptGlyphClass,
  codePoint: number,
  spaceAdvanceEm: number = 0.28,
): number {
  switch (glyphClass) {
    case "hangul-syllable":
    case "cjk-open-quote":
    case "cjk-close-quote":
    case "ellipsis-dash":
      return 1.0;
    case "tabular-digit":
      return TABULAR_DIGIT_ADVANCE_EM;
    case "latin-upper":
      return codePoint === 0x0049 ? 0.38 : codePoint === 0x004d || codePoint === 0x0057 ? 0.82 : 0.66;
    case "latin-lower":
      return codePoint === 0x0069 || codePoint === 0x006c ? 0.32 : codePoint === 0x006d || codePoint === 0x0077 ? 0.76 : 0.54;
    case "terminal-punct":
      return codePoint >= 0x3000 ? 0.85 : 0.36;
    case "whitespace":
      return codePoint === 0x3000 ? 0.85 : spaceAdvanceEm;
    case "other-symbol":
      return codePoint > 0x2e80 ? 1.0 : 0.58;
  }
}

/**
 * 인접한 두 글리프 시각 계층 사이의 광학 페어 커닝 보정값(`em`)을 계산한다.
 */
export function computeOpticalPairKerningEm(
  leftClass: MixedScriptGlyphClass,
  rightClass: MixedScriptGlyphClass,
  options?: OpticalKerningOptions,
): number {
  if (leftClass === "whitespace" || rightClass === "whitespace") return 0;
  // 고정폭 숫자끼리는 표·수치 흔들림을 막기 위해 페어 커닝을 0으로 잠근다.
  if (leftClass === "tabular-digit" && rightClass === "tabular-digit") return 0;

  if (leftClass === "cjk-close-quote" && rightClass === "cjk-open-quote") {
    return options?.consecutiveQuoteKernEm ?? CONSECUTIVE_CJK_QUOTE_KERN_EM;
  }
  if (
    (leftClass === "cjk-open-quote" && rightClass === "cjk-open-quote") ||
    (leftClass === "cjk-close-quote" && rightClass === "cjk-close-quote")
  ) {
    return -0.25;
  }
  if (leftClass === "terminal-punct" && rightClass === "cjk-close-quote") return -0.12;

  if (leftClass === "cjk-open-quote" && (rightClass === "hangul-syllable" || isLatinOrDigitClass(rightClass))) {
    return -0.08;
  }
  if ((leftClass === "hangul-syllable" || isLatinOrDigitClass(leftClass)) && rightClass === "cjk-close-quote") {
    return -0.08;
  }

  // 한글과 영문·숫자가 공백 없이 맞붙을 때 답답함을 해소하는 +0.04em 광학 숨통
  if (
    (leftClass === "hangul-syllable" && isLatinOrDigitClass(rightClass)) ||
    (isLatinOrDigitClass(leftClass) && rightClass === "hangul-syllable")
  ) {
    return options?.hangulAlphanumKernEm ?? HANGUL_ALPHANUM_BREATHING_KERN_EM;
  }

  if (leftClass === "tabular-digit" && rightClass === "latin-upper") return 0.015;
  if (leftClass === "latin-upper" && rightClass === "latin-upper") return 0.01;
  return 0;
}

/**
 * 한글 시각 중심축에 맞춰 영문·숫자·문장부호의 세로 기준선 이동량 `dyEm`을 산출한다.
 */
export function computeCentralAxisBaselineShiftEm(
  glyphClass: MixedScriptGlyphClass,
  hasHangulContext: boolean = true,
  options?: OpticalKerningOptions,
): number {
  if (!hasHangulContext) return 0;

  switch (glyphClass) {
    case "latin-upper":
      return roundEm(clampNumber(
        options?.latinUpperLiftEm ?? DEFAULT_LATIN_UPPER_OPTICAL_LIFT_EM,
        MIN_CENTRAL_AXIS_OPTICAL_LIFT_EM,
        MAX_CENTRAL_AXIS_OPTICAL_LIFT_EM,
      ));
    case "tabular-digit":
      return roundEm(clampNumber(
        options?.tabularDigitLiftEm ?? DEFAULT_TABULAR_DIGIT_OPTICAL_LIFT_EM,
        MIN_CENTRAL_AXIS_OPTICAL_LIFT_EM,
        MAX_CENTRAL_AXIS_OPTICAL_LIFT_EM,
      ));
    case "latin-lower":
      return roundEm(clampNumber(
        options?.latinLowerLiftEm ?? 0.058,
        MIN_CENTRAL_AXIS_OPTICAL_LIFT_EM,
        MAX_CENTRAL_AXIS_OPTICAL_LIFT_EM,
      ));
    case "terminal-punct":
      return 0.045;
    case "ellipsis-dash":
      return 0.06;
    case "hangul-syllable":
    case "cjk-open-quote":
    case "cjk-close-quote":
    case "whitespace":
    case "other-symbol":
      return 0;
  }
}

/**
 * 문자열 전체에 대해 광학 페어 커닝, 전각 따옴표 반폭 트림, 한글 중심축 `dyEm` 보정을 수행한다.
 */
export function shapeMixedScriptOpticalRun(
  text: string,
  options?: OpticalKerningOptions,
): OpticalMixedRunResult {
  const chars = Array.from(text);
  const classes: MixedScriptGlyphClass[] = new Array<MixedScriptGlyphClass>(chars.length);
  const codePoints: number[] = new Array<number>(chars.length);
  let hasHangulContext = false;

  for (let i = 0; i < chars.length; i += 1) {
    const cp = (chars[i] ?? "").codePointAt(0) ?? 0;
    const glyphClass = classifyMixedScriptCodePoint(cp);
    codePoints[i] = cp;
    classes[i] = glyphClass;
    if (glyphClass === "hangul-syllable") hasHangulContext = true;
  }

  const spaceAdvanceEm = clampNumber(options?.spaceAdvanceEm ?? 0.28, 0.12, 0.8);
  const quoteOuterTrim = options?.quoteOuterHalfTrimEm ?? CJK_QUOTE_OUTER_HALF_TRIM_EM;
  const glyphs: OpticalShapedGlyph[] = [];
  let cursorXEm = 0;
  let unshapedAdvanceEm = 0;
  let hangulAlphanumBreathingCount = 0;
  let tightenedQuotePairCount = 0;

  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i] ?? "";
    const codePoint = codePoints[i] ?? 0;
    const glyphClass = classes[i] ?? "other-symbol";
    const prevClass = i > 0 ? (classes[i - 1] ?? "whitespace") : "whitespace";
    const nextClass = i + 1 < chars.length ? (classes[i + 1] ?? "whitespace") : "whitespace";

    const baseAdvanceEm = getNominalGlyphAdvanceEm(glyphClass, codePoint, spaceAdvanceEm);
    unshapedAdvanceEm += baseAdvanceEm;
    const kernBeforeEm = i === 0 ? 0 : computeOpticalPairKerningEm(prevClass, glyphClass, options);

    if (
      kernBeforeEm > 0 &&
      ((prevClass === "hangul-syllable" && isLatinOrDigitClass(glyphClass)) ||
        (isLatinOrDigitClass(prevClass) && glyphClass === "hangul-syllable"))
    ) {
      hangulAlphanumBreathingCount += 1;
    }
    if (kernBeforeEm < -0.2 && prevClass === "cjk-close-quote" && glyphClass === "cjk-open-quote") {
      tightenedQuotePairCount += 1;
    }

    let halfWidthTrimEm = 0;
    if (glyphClass === "cjk-open-quote" && prevClass === "whitespace") {
      halfWidthTrimEm = quoteOuterTrim;
    } else if (glyphClass === "cjk-close-quote" && nextClass === "whitespace") {
      halfWidthTrimEm = quoteOuterTrim;
    }

    const xEm = roundEm(cursorXEm + kernBeforeEm);
    const effectiveAdvanceEm = roundEm(Math.max(0.18, baseAdvanceEm + halfWidthTrimEm));
    const dyEm = computeCentralAxisBaselineShiftEm(glyphClass, hasHangulContext, options);

    glyphs.push({
      index: i, char, codePoint, glyphClass,
      baseAdvanceEm: roundEm(baseAdvanceEm),
      halfWidthTrimEm: roundEm(halfWidthTrimEm),
      kernBeforeEm: roundEm(kernBeforeEm),
      effectiveAdvanceEm, xEm, dyEm,
      isTabularLocked: glyphClass === "tabular-digit",
    });
    cursorXEm = xEm + effectiveAdvanceEm;
  }

  const totalAdvanceEm = roundEm(Math.max(0, cursorXEm));
  const roundedUnshaped = roundEm(unshapedAdvanceEm);
  return {
    text, glyphs, totalAdvanceEm, unshapedAdvanceEm: roundedUnshaped,
    netOpticalDeltaEm: roundEm(totalAdvanceEm - roundedUnshaped),
    hangulAlphanumBreathingCount, tightenedQuotePairCount,
  };
}

function tokenizeKoreanEojeols(text: string): string[] {
  const eojeols: string[] = [];
  let start = -1;
  for (let i = 0; i < text.length; i += 1) {
    if (!isWhitespaceCode(text.charCodeAt(i))) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      eojeols.push(text.slice(start, i));
      start = -1;
    }
  }
  if (start !== -1) eojeols.push(text.slice(start));
  return eojeols;
}

/**
 * 말풍선 윤곽(`ellipse` | `rounded-rect` | `rectangle`)과 전체 줄 수에 맞춰 각 줄의 유효 가로폭(`em`)을 계산한다.
 */
export function computeBalloonLineWidthProfileEm(
  lineCount: number,
  maxBalloonWidthEm: number,
  shape: BalloonContourShape,
  ellipseMinChordRatio: number = 0.72,
): readonly number[] {
  const safeCount = Math.max(1, Math.floor(lineCount));
  const minRatio = clampNumber(ellipseMinChordRatio, 0.5, 1.0);
  const widths: number[] = new Array<number>(safeCount);

  for (let k = 0; k < safeCount; k += 1) {
    if (shape === "rectangle" || safeCount === 1) {
      widths[k] = roundEm(maxBalloonWidthEm);
    } else if (shape === "rounded-rect") {
      const isOuter = k === 0 || k === safeCount - 1;
      widths[k] = roundEm(maxBalloonWidthEm * (safeCount >= 3 && isOuter ? Math.max(minRatio, 0.9) : 1.0));
    } else {
      const normalizedY = (((k + 0.5) / safeCount) * 2 - 1) * 0.78;
      const rawChordRatio = Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
      widths[k] = roundEm(maxBalloonWidthEm * clampNumber(rawChordRatio, minRatio, 1.0));
    }
  }
  return widths;
}

function computeLineCubicBadness(lineWidthEm: number, targetWidthEm: number): number {
  if (lineWidthEm <= targetWidthEm) {
    const slack = targetWidthEm - lineWidthEm;
    return slack * slack * slack;
  }
  const overflow = lineWidthEm - targetWidthEm;
  return 1_000_000 + overflow * overflow * overflow * 1_000;
}

function evaluateGreedyBaseline(
  eojeols: readonly string[],
  eojeolWidths: readonly number[],
  spaceAdvanceEm: number,
  maxBalloonWidthEm: number,
  shape: BalloonContourShape,
  ellipseMinChordRatio: number,
): GreedyLineBreakBaseline {
  if (eojeols.length === 0) {
    return { lines: [], lineCount: 0, widowCount: 0, cubicRaggednessPenalty: 0 };
  }
  const ranges: Array<{ readonly start: number; readonly end: number; readonly widthEm: number }> = [];
  let lineStart = 0;
  let currentWidth = eojeolWidths[0] ?? 0;

  for (let i = 1; i < eojeols.length; i += 1) {
    const w = eojeolWidths[i] ?? 0;
    const tentative = currentWidth + spaceAdvanceEm + w;
    if (tentative <= maxBalloonWidthEm) {
      currentWidth = tentative;
    } else {
      ranges.push({ start: lineStart, end: i, widthEm: currentWidth });
      lineStart = i;
      currentWidth = w;
    }
  }
  ranges.push({ start: lineStart, end: eojeols.length, widthEm: currentWidth });

  const profile = computeBalloonLineWidthProfileEm(ranges.length, maxBalloonWidthEm, shape, ellipseMinChordRatio);
  let cubicPenalty = 0;
  const lineStrings: string[] = [];
  for (let k = 0; k < ranges.length; k += 1) {
    const range = ranges[k];
    if (!range) continue;
    cubicPenalty += computeLineCubicBadness(range.widthEm, profile[k] ?? maxBalloonWidthEm);
    lineStrings.push(eojeols.slice(range.start, range.end).join(" "));
  }

  const lastRange = ranges[ranges.length - 1];
  const widowCount =
    eojeols.length >= 2 && ranges.length >= 2 && lastRange !== undefined && lastRange.end - lastRange.start === 1 ? 1 : 0;

  return { lines: lineStrings, lineCount: ranges.length, widowCount, cubicRaggednessPenalty: roundEm(cubicPenalty) };
}

interface CandidateDpSolution {
  readonly lineCount: number;
  readonly ranges: readonly { readonly start: number; readonly end: number }[];
  readonly targetWidthsEm: readonly number[];
  readonly widowCount: number;
  readonly cubicRaggednessPenalty: number;
  readonly totalObjective: number;
}

function solveFixedLineCountKnuthPlass(
  eojeolCount: number,
  prefixEojeolAdvance: readonly number[],
  spaceAdvanceEm: number,
  lineCount: number,
  targetWidthsEm: readonly number[],
): CandidateDpSolution | null {
  const stride = eojeolCount + 1;
  const dp = new Float64Array((lineCount + 1) * stride);
  const parent = new Int32Array((lineCount + 1) * stride);
  dp.fill(Number.POSITIVE_INFINITY);
  parent.fill(-1);
  dp[0] = 0;

  const lineSpanAdvance = (start: number, end: number): number =>
    (prefixEojeolAdvance[end] ?? 0) - (prefixEojeolAdvance[start] ?? 0) + Math.max(0, end - start - 1) * spaceAdvanceEm;

  for (let k = 1; k <= lineCount; k += 1) {
    const targetW = targetWidthsEm[k - 1] ?? 1;
    const isLastLine = k === lineCount;
    const remainingLinesAfter = lineCount - k;

    for (let i = k; i <= eojeolCount - remainingLinesAfter; i += 1) {
      let bestCost = Number.POSITIVE_INFINITY;
      let bestPrev = -1;

      for (let p = k - 1; p < i; p += 1) {
        const prevCost = dp[(k - 1) * stride + p] ?? Number.POSITIVE_INFINITY;
        if (!Number.isFinite(prevCost)) continue;

        const wordsInLine = i - p;
        const widthEm = lineSpanAdvance(p, i);
        if (widthEm > targetW && wordsInLine > 1) continue;

        const widowPenalty =
          isLastLine && lineCount >= 2 && eojeolCount >= 2 && wordsInLine === 1 ? WIDOW_EOJEOL_PENALTY : 0;
        const candidate = prevCost + computeLineCubicBadness(widthEm, targetW) + widowPenalty;
        if (candidate < bestCost) {
          bestCost = candidate;
          bestPrev = p;
        }
      }
      dp[k * stride + i] = bestCost;
      parent[k * stride + i] = bestPrev;
    }
  }

  const finalCost = dp[lineCount * stride + eojeolCount] ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(finalCost)) return null;

  const ranges: Array<{ readonly start: number; readonly end: number }> = [];
  let cursor = eojeolCount;
  for (let k = lineCount; k >= 1; k -= 1) {
    const prev = parent[k * stride + cursor] ?? -1;
    if (prev < 0) return null;
    ranges.push({ start: prev, end: cursor });
    cursor = prev;
  }
  ranges.reverse();

  let cubicRaggednessPenalty = 0;
  for (let k = 0; k < ranges.length; k += 1) {
    const range = ranges[k];
    if (range) cubicRaggednessPenalty += computeLineCubicBadness(lineSpanAdvance(range.start, range.end), targetWidthsEm[k] ?? 1);
  }
  const lastRange = ranges[ranges.length - 1];
  const widowCount =
    eojeolCount >= 2 && ranges.length >= 2 && lastRange !== undefined && lastRange.end - lastRange.start === 1 ? 1 : 0;

  return { lineCount, ranges, targetWidthsEm, widowCount, cubicRaggednessPenalty, totalObjective: finalCost };
}

/**
 * 어절 보존(`keep-all`), 3제곱 여백 균형, 외톨이 어절 방지를 결합한 Knuth-Plass 말풍선 식자 배치기.
 */
export function layoutBalloonMixedTypography(
  input: BalloonTypographyLayoutInput,
): BalloonTypographyLayoutResult {
  const fontSizePx = clampNumber(input.fontSizePx ?? 18, 8, 120);
  const lineHeightEm = clampNumber(input.lineHeightEm ?? 1.48, 1.0, 2.5);
  const shape: BalloonContourShape = input.shape ?? "ellipse";
  const ellipseMinChordRatio = clampNumber(input.ellipseMinChordRatio ?? 0.72, 0.5, 1.0);
  const requestedMaxWidthEm =
    input.maxWidthPx !== undefined ? Math.max(2.0, input.maxWidthPx / fontSizePx) : Math.max(2.0, input.maxWidthEm ?? 9.5);
  const spaceAdvanceEm = clampNumber(input.kerningOptions?.spaceAdvanceEm ?? 0.28, 0.12, 0.8);
  const eojeols = tokenizeKoreanEojeols(input.text);

  if (eojeols.length === 0) {
    return {
      shape, fontSizePx, maxBalloonWidthEm: roundEm(requestedMaxWidthEm), totalEojeolCount: 0,
      lines: [], lineCount: 0, widowCount: 0, cubicRaggednessPenalty: 0,
      greedyBaseline: { lines: [], lineCount: 0, widowCount: 0, cubicRaggednessPenalty: 0 },
      raggednessReductionRatio: 0,
    };
  }

  const eojeolWidths = eojeols.map((w) => shapeMixedScriptOpticalRun(w, input.kerningOptions).totalAdvanceEm);
  const minWidowSafePairEm =
    eojeols.length >= 2
      ? (eojeolWidths[eojeols.length - 2] ?? 0) + spaceAdvanceEm + (eojeolWidths[eojeols.length - 1] ?? 0)
      : 0;
  const maxBalloonWidthEm = roundEm(Math.max(requestedMaxWidthEm, minWidowSafePairEm));

  const prefixEojeolAdvance: number[] = new Array<number>(eojeols.length + 1);
  prefixEojeolAdvance[0] = 0;
  for (let i = 0; i < eojeols.length; i += 1) {
    prefixEojeolAdvance[i + 1] = (prefixEojeolAdvance[i] ?? 0) + (eojeolWidths[i] ?? 0);
  }

  const greedyBaseline = evaluateGreedyBaseline(
    eojeols, eojeolWidths, spaceAdvanceEm, maxBalloonWidthEm, shape, ellipseMinChordRatio,
  );

  let bestSolution: CandidateDpSolution | null = null;
  const maxCandidateLines = Math.min(eojeols.length, 24);

  for (let candidateLines = 1; candidateLines <= maxCandidateLines; candidateLines += 1) {
    const profile = computeBalloonLineWidthProfileEm(candidateLines, maxBalloonWidthEm, shape, ellipseMinChordRatio);
    const candidate = solveFixedLineCountKnuthPlass(eojeols.length, prefixEojeolAdvance, spaceAdvanceEm, candidateLines, profile);
    if (candidate && (!bestSolution || candidate.totalObjective < bestSolution.totalObjective)) {
      bestSolution = candidate;
    }

    if (shape !== "rectangle" && candidateLines >= 2 && (!candidate || candidate.widowCount > 0)) {
      const relaxedProfile = profile.map((w, idx) => (idx === candidateLines - 1 ? maxBalloonWidthEm : w));
      const relaxed = solveFixedLineCountKnuthPlass(eojeols.length, prefixEojeolAdvance, spaceAdvanceEm, candidateLines, relaxedProfile);
      if (relaxed && (!bestSolution || relaxed.totalObjective + 12 < bestSolution.totalObjective)) {
        bestSolution = { ...relaxed, totalObjective: relaxed.totalObjective + 12 };
      }
    }
  }

  const chosenRanges = bestSolution?.ranges ?? [{ start: 0, end: eojeols.length }];
  const chosenTargets =
    bestSolution?.targetWidthsEm ??
    computeBalloonLineWidthProfileEm(chosenRanges.length, maxBalloonWidthEm, shape, ellipseMinChordRatio);

  const lines: BalloonTypographyLine[] = chosenRanges.map((range, lineIndex) => {
    const slice = eojeols.slice(range.start, range.end);
    const lineText = slice.join(" ");
    const shaped = shapeMixedScriptOpticalRun(lineText, input.kerningOptions);
    const targetWidthEm = chosenTargets[lineIndex] ?? maxBalloonWidthEm;
    const actualWidthEm = shaped.totalAdvanceEm;
    return {
      lineIndex,
      text: lineText,
      eojeols: slice,
      eojeolCount: slice.length,
      glyphs: shaped.glyphs,
      targetWidthEm,
      actualWidthEm,
      slackEm: roundEm(Math.max(0, targetWidthEm - actualWidthEm)),
      cubicRaggedness: roundEm(computeLineCubicBadness(actualWidthEm, targetWidthEm)),
      centerOffsetXEm: roundEm((maxBalloonWidthEm - actualWidthEm) * 0.5),
      baselineYEm: roundEm((lineIndex + 0.82) * lineHeightEm),
    };
  });

  const lastLine = lines[lines.length - 1];
  const widowCount =
    eojeols.length >= 2 && lines.length >= 2 && lastLine !== undefined && lastLine.eojeolCount === 1 ? 1 : 0;
  const cubicRaggednessPenalty = roundEm(lines.reduce((acc, line) => acc + line.cubicRaggedness, 0));
  const raggednessReductionRatio =
    greedyBaseline.cubicRaggednessPenalty > 0
      ? roundEm(Math.max(0, (greedyBaseline.cubicRaggednessPenalty - cubicRaggednessPenalty) / greedyBaseline.cubicRaggednessPenalty))
      : 0;

  return {
    shape, fontSizePx, maxBalloonWidthEm, totalEojeolCount: eojeols.length,
    lines, lineCount: lines.length, widowCount, cubicRaggednessPenalty,
    greedyBaseline, raggednessReductionRatio,
  };
}
