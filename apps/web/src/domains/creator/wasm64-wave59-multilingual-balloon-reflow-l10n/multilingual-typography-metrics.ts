/**
 * 다국어 웹툰·만화 말풍선 타이포그래피 메트릭·금칙 처리(Kinsoku)·다이아몬드 조판 엔진.
 *
 * - 한국어(`ko`), 영어(`en`), 일본어(`ja`, 세로쓰기 `vertical-rl` 포함), 중국어(`zh-Hans`/`zh-Hant`),
 *   스페인어(`es`), 프랑스어(`fr`)의 글리프 폭 비율·모바일 800px 최소 가독 하한·예상 팽창률을 제공한다.
 * - CJK 행두·행말 금칙(Kinsoku), 분리 금지 연쇄(`……`, `——`, `!?`), 스페인어 역문장부호(`¡¿`),
 *   프랑스어 비분리 부호(`«»`, `?!:;`), 라틴 음절 하이픈 분할 및 타원 다이아몬드 DP 조판을 수행한다.
 */

export const SUPPORTED_L10N_LOCALES = Object.freeze(["ko", "en", "ja", "zh-Hans", "zh-Hant", "es", "fr"] as const);
export type SupportedL10nLocale = (typeof SUPPORTED_L10N_LOCALES)[number];
export type TypographyWritingMode = "horizontal-tb" | "vertical-rl";
export type TypographyScriptFamily = "hangul" | "latin" | "japanese" | "cjk-han";
export type BalloonContourKind = "ellipse" | "rounded-rect" | "rectangle" | "shout-burst" | "thought-cloud";
export type TypographyCharClass =
  | "hangul" | "hiragana" | "katakana" | "cjk-ideograph" | "latin-upper" | "latin-lower"
  | "digit" | "gyoto-kinsoku" | "gyomatsu-kinsoku" | "space" | "symbol";

export interface LocaleTypographyProfile {
  readonly locale: SupportedL10nLocale;
  readonly displayNameKo: string;
  readonly scriptFamily: TypographyScriptFamily;
  readonly defaultWritingMode: TypographyWritingMode;
  readonly supportsVerticalRl: boolean;
  readonly wordDelimited: boolean;
  readonly supportsHyphenation: boolean;
  readonly cjkKinsokuEnabled: boolean;
  readonly averageGlyphWidthEm: number;
  readonly spaceAdvanceEm: number;
  readonly defaultLineHeightRatio: number;
  readonly minLineHeightRatio: number;
  readonly maxLineHeightRatio: number;
  readonly defaultLetterSpacingEm: number;
  readonly minLetterSpacingEm: number;
  readonly maxLetterSpacingEm: number;
  /** 모바일 800px 기준 말풍선 본문 최소 가독 픽셀 높이. */
  readonly minReadableFontSizePxAt800w: number;
  readonly fontWeightRange: { readonly min: number; readonly default: number; readonly max: number };
  readonly expansionFromKo: { readonly min: number; readonly typical: number; readonly max: number };
  readonly recommendedFontStack: readonly string[];
}

function makeLocaleProfile(
  locale: SupportedL10nLocale, displayNameKo: string, scriptFamily: TypographyScriptFamily,
  defaultWritingMode: TypographyWritingMode,
  flags: readonly [boolean, boolean, boolean, boolean],
  nums: readonly [number, number, number, number, number, number, number, number, number, number, number, number, number],
  recommendedFontStack: readonly string[]
): LocaleTypographyProfile {
  return {
    locale, displayNameKo, scriptFamily, defaultWritingMode,
    supportsVerticalRl: flags[0], wordDelimited: flags[1], supportsHyphenation: flags[2], cjkKinsokuEnabled: flags[3],
    averageGlyphWidthEm: nums[0], spaceAdvanceEm: nums[1],
    minLineHeightRatio: nums[2], defaultLineHeightRatio: nums[3], maxLineHeightRatio: nums[4],
    minLetterSpacingEm: nums[5], defaultLetterSpacingEm: nums[6], maxLetterSpacingEm: nums[7],
    minReadableFontSizePxAt800w: nums[8],
    fontWeightRange: { min: 400, default: nums[9], max: 700 },
    expansionFromKo: { min: nums[10], typical: nums[11], max: nums[12] },
    recommendedFontStack,
  };
}

export const MULTILINGUAL_TYPOGRAPHY_PROFILES: Readonly<Record<SupportedL10nLocale, LocaleTypographyProfile>> = Object.freeze({
  ko: makeLocaleProfile("ko", "한국어", "hangul", "horizontal-tb", [false, true, false, true], [0.94, 0.28, 1.16, 1.32, 1.52, -0.055, -0.02, 0.04, 13.5, 600, 0.95, 1.0, 1.05], ["Pretendard", "KoPubWorldDotum", "Noto Sans KR", "sans-serif"]),
  en: makeLocaleProfile("en", "영어", "latin", "horizontal-tb", [false, true, true, false], [0.54, 0.26, 1.1, 1.24, 1.44, -0.035, 0, 0.05, 12.5, 600, 1.15, 1.38, 1.7], ["Anime Ace 3", "CC Wild Words", "Komika Text", "Noto Sans", "sans-serif"]),
  ja: makeLocaleProfile("ja", "일본어", "japanese", "vertical-rl", [true, false, false, true], [0.98, 0.5, 1.18, 1.36, 1.56, -0.04, 0, 0.05, 13.5, 500, 0.95, 1.14, 1.38], ["Antique AN", "Shippori Antique", "Noto Sans JP", "sans-serif"]),
  "zh-Hans": makeLocaleProfile("zh-Hans", "중국어(간체)", "cjk-han", "horizontal-tb", [true, false, false, true], [1.0, 0.5, 1.18, 1.34, 1.54, -0.035, 0, 0.05, 14.0, 500, 0.65, 0.78, 0.96], ["Source Han Sans SC", "Noto Sans SC", "PingFang SC", "sans-serif"]),
  "zh-Hant": makeLocaleProfile("zh-Hant", "중국어(번체)", "cjk-han", "horizontal-tb", [true, false, false, true], [1.0, 0.5, 1.2, 1.36, 1.56, -0.03, 0, 0.05, 14.5, 500, 0.68, 0.82, 1.0], ["Source Han Sans TC", "Noto Sans TC", "PingFang TC", "sans-serif"]),
  es: makeLocaleProfile("es", "스페인어", "latin", "horizontal-tb", [false, true, true, false], [0.54, 0.26, 1.11, 1.25, 1.44, -0.035, 0, 0.04, 12.5, 600, 1.28, 1.52, 1.85], ["CC Wild Words", "Komika Text", "Noto Sans", "sans-serif"]),
  fr: makeLocaleProfile("fr", "프랑스어", "latin", "horizontal-tb", [false, true, true, false], [0.54, 0.26, 1.11, 1.25, 1.44, -0.035, 0, 0.04, 12.5, 600, 1.24, 1.48, 1.82], ["CC Wild Words", "Komika Text", "Noto Sans", "sans-serif"]),
});

/** 행두 금칙 문자(JIS X 4051·CJK·유럽 문장부호 통합). */
export const GYOTO_KINSOKU_CHARS = new Set<string>(
  Array.from("、。，．・：；？！゛゜´｀¨＾￣＿ヽヾゝゞ〃仝々〆〇ー―‐／＼～‖｜…‥’”）〕］｝〉》」』】°′″℃‰ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ.,:;?!)]}»›")
);
/** 행말 금칙 문자(여는 괄호·인용부호 및 스페인어 역문장부호). */
export const GYOMATSU_KINSOKU_CHARS = new Set<string>(Array.from("‘“（〔［｛〈《「『【([{«‹¡¿"));

const HANGING_PUNCT_CHARS = new Set<string>(Array.from("、。，．.,:;!?？！」』）)]}»"));
const NARROW_LATIN_CHARS = new Set<string>(Array.from("iljIft1.,:;!'|íìîïÍÌÎÏ"));
const WIDE_LATIN_CHARS = new Set<string>(Array.from("mwMW@%ŒœÆæ"));
const LATIN_VOWELS = new Set<string>(Array.from("aeiouyáéíóúüàâèêëîïôùûÿAEIOUYÁÉÍÓÚÜÀÂÈÊËÎÏÔÙÛŸ"));
const UNBREAKABLE_ONSETS = new Set<string>(["bl", "br", "ch", "cl", "cr", "dr", "fl", "fr", "gl", "gn", "gr", "gu", "ll", "ph", "pl", "pr", "qu", "rr", "sh", "th", "tr"]);
const KERNING_PAIRS: Readonly<Record<string, number>> = Object.freeze({
  AV: -0.055, VA: -0.055, To: -0.045, Ta: -0.045, Te: -0.04, Wa: -0.035, We: -0.035, Yo: -0.045,
  "」「": -0.32, "』『": -0.32, "）（": -0.28, "、」": -0.25, "。」": -0.25,
});

const NOMINAL_EXPANSION_MIN = 0.65;
const NOMINAL_EXPANSION_MAX = 1.85;
const HYPHEN_PENALTY = 1400;
const WIDOW_ORPHAN_PENALTY = 2600;
const OVERFLOW_PENALTY_SCALE = 120_000;
const HANGING_ALLOWANCE_EM = 0.52;

export interface MultilingualBalloonLayoutInput {
  readonly text: string;
  readonly locale: SupportedL10nLocale;
  readonly writingMode?: TypographyWritingMode;
  readonly contour?: BalloonContourKind;
  readonly innerWidthPx: number;
  readonly innerHeightPx: number;
  readonly fontSizePx: number;
  readonly fontWeight?: number;
  readonly lineHeightRatio?: number;
  readonly letterSpacingEm?: number;
  readonly allowHyphenation?: boolean;
  readonly enableHangingPunctuation?: boolean;
}

export interface LaidOutBalloonLine {
  readonly lineIndex: number;
  readonly text: string;
  readonly mainAxisAdvancePx: number;
  readonly availableChordPx: number;
  readonly fillRatio: number;
  readonly centerOffsetXPx: number;
  readonly centerOffsetYPx: number;
  readonly hyphenatedAtEnd: boolean;
  readonly usedHangingPunctuation: boolean;
  readonly hasTateChuYoko: boolean;
  readonly overflowsChord: boolean;
}

export interface MultilingualBalloonLayoutResult {
  readonly locale: SupportedL10nLocale;
  readonly writingMode: TypographyWritingMode;
  readonly contour: BalloonContourKind;
  readonly fontSizePx: number;
  readonly fontWeight: number;
  readonly lineHeightPx: number;
  readonly letterSpacingEm: number;
  readonly lines: readonly LaidOutBalloonLine[];
  readonly lineCount: number;
  readonly boundingWidthPx: number;
  readonly boundingHeightPx: number;
  readonly fitsInsideBalloon: boolean;
  readonly overflowsWidth: boolean;
  readonly overflowsHeight: boolean;
  readonly maxChordOverflowPx: number;
  readonly stackOverflowPx: number;
  readonly diamondSymmetryScore: number;
  readonly hyphenationCount: number;
  readonly kinsokuBoundCount: number;
  readonly kinsokuViolationCount: number;
  readonly hangingPunctuationCount: number;
}

export type ExpansionCategory = "contraction" | "neutral" | "moderate-expansion" | "heavy-expansion" | "extreme-expansion";
export type ExpansionReflowStrategy = "keep-geometry" | "tighten-typography" | "shrink-and-reflow" | "expand-balloon";

export interface LocalizedTextExpansionEstimate {
  readonly sourceLocale: SupportedL10nLocale;
  readonly targetLocale: SupportedL10nLocale;
  readonly sourceVisualWidthEm: number;
  readonly targetVisualWidthEm: number;
  readonly expansionRatio: number;
  readonly clampedNominalRatio: number;
  readonly isWithinNominalBand: boolean;
  readonly estimatedAreaScale: number;
  readonly isMeasuredFromTargetText: boolean;
  readonly category: ExpansionCategory;
  readonly recommendedStrategy: ExpansionReflowStrategy;
}

interface AtomicBreakUnit {
  readonly text: string;
  readonly isSpace: boolean;
  readonly endsWithSoftHyphen: boolean;
  readonly trailingHangingEm: number;
}

interface SliceMetrics {
  readonly text: string;
  readonly advancePx: number;
  readonly hyphenatedAtEnd: boolean;
  readonly trailingHangingEm: number;
  readonly hasTateChuYoko: boolean;
}

interface PartitionCandidate {
  readonly lines: readonly { readonly text: string; readonly advancePx: number; readonly availableChordPx: number; readonly hyphenatedAtEnd: boolean; readonly hasTateChuYoko: boolean }[];
  readonly cost: number;
  readonly diamondSymmetryScore: number;
  readonly hyphenationCount: number;
}

/** 문자 코드포인트와 금칙 집합을 기반으로 타이포그래피 문자 클래스를 판별한다. */
export function classifyTypographyChar(char: string): TypographyCharClass {
  if (!char) return "symbol";
  if (char === " " || char === "\t" || char === "\u3000" || char === "\u00A0" || char === "\u202F") return "space";
  if (GYOTO_KINSOKU_CHARS.has(char)) return "gyoto-kinsoku";
  if (GYOMATSU_KINSOKU_CHARS.has(char)) return "gyomatsu-kinsoku";
  const cp = char.codePointAt(0) ?? 0;
  if ((cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3130 && cp <= 0x318f)) return "hangul";
  if (cp >= 0x3040 && cp <= 0x309f) return "hiragana";
  if ((cp >= 0x30a0 && cp <= 0x30ff) || (cp >= 0x31f0 && cp <= 0x31ff)) return "katakana";
  if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf)) return "cjk-ideograph";
  if (cp >= 0x30 && cp <= 0x39) return "digit";
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0xc0 && cp <= 0xde && cp !== 0xd7)) return "latin-upper";
  if ((cp >= 0x61 && cp <= 0x7a) || (cp >= 0xdf && cp <= 0xff && cp !== 0xf7)) return "latin-lower";
  return "symbol";
}

function isLatinLetter(char: string): boolean {
  const cls = classifyTypographyChar(char);
  return cls === "latin-upper" || cls === "latin-lower";
}

/** 단일 글리프의 진행축 전진폭(`em`)을 로캘·쓰기 방향·굵기 기준으로 계산한다. */
export function measureGlyphAdvanceEm(
  char: string, locale: SupportedL10nLocale, writingMode: TypographyWritingMode = "horizontal-tb", fontWeight = 500
): number {
  const profile = MULTILINGUAL_TYPOGRAPHY_PROFILES[locale];
  const cls = classifyTypographyChar(char);
  const wMul = 1 + ((Math.max(300, Math.min(800, fontWeight)) - 500) / 300) * 0.045;
  if (cls === "space") return char === "\u3000" ? 1.0 : char === "\u202F" ? 0.16 : profile.spaceAdvanceEm;

  if (writingMode === "vertical-rl") {
    if (cls === "hangul" || cls === "hiragana" || cls === "katakana" || cls === "cjk-ideograph") return 1.0;
    if (cls === "gyoto-kinsoku" || cls === "gyomatsu-kinsoku") return (char.codePointAt(0) ?? 0) >= 0x3000 ? 0.92 : 0.56;
    return cls === "digit" ? 0.62 : 0.58 * wMul;
  }

  if (cls === "hangul") return 0.94 * wMul;
  if (cls === "hiragana" || cls === "katakana") return 0.96 * wMul;
  if (cls === "cjk-ideograph") return 1.0 * wMul;
  if (cls === "digit") return 0.58 * wMul;
  if (cls === "gyoto-kinsoku" || cls === "gyomatsu-kinsoku") {
    const cp = char.codePointAt(0) ?? 0;
    if (cp >= 0x3000 || cp === 0x2026 || cp === 0x2014 || cp === 0x2015) return 0.86;
    return char === "«" || char === "»" ? 0.52 : char === "¿" || char === "¡" ? 0.44 : 0.34;
  }
  if (NARROW_LATIN_CHARS.has(char)) return 0.32 * wMul;
  if (WIDE_LATIN_CHARS.has(char)) return 0.84 * wMul;
  return (cls === "latin-upper" ? 0.7 : cls === "latin-lower" ? 0.53 : 0.62) * wMul;
}

/** 문자열 런의 총 진행축 길이(`em`)와 세로쓰기 縦中横(tate-chu-yoko) 적용 여부를 산출한다. */
export function measureTextRunEm(
  text: string, locale: SupportedL10nLocale,
  options: { readonly writingMode?: TypographyWritingMode; readonly fontWeight?: number; readonly letterSpacingEm?: number } = {}
): { readonly advanceEm: number; readonly hasTateChuYoko: boolean } {
  const chars = Array.from(text);
  if (chars.length === 0) return { advanceEm: 0, hasTateChuYoko: false };
  const profile = MULTILINGUAL_TYPOGRAPHY_PROFILES[locale];
  const writingMode = options.writingMode ?? profile.defaultWritingMode;
  const fontWeight = options.fontWeight ?? profile.fontWeightRange.default;
  const letterSpacingEm = options.letterSpacingEm ?? profile.defaultLetterSpacingEm;

  let totalEm = 0;
  let hasTateChuYoko = false;
  let glyphCount = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const cur = chars[i] ?? "";
    const nxt = i + 1 < chars.length ? (chars[i + 1] ?? "") : "";
    const nxt2 = i + 2 < chars.length ? (chars[i + 2] ?? "") : "";
    if (
      writingMode === "vertical-rl" && nxt !== "" &&
      ((/^[0-9]$/.test(cur) && /^[0-9]$/.test(nxt) && !/^[0-9]$/.test(nxt2)) ||
        ((cur === "!" || cur === "?") && (nxt === "!" || nxt === "?")))
    ) {
      totalEm += 1.0; hasTateChuYoko = true; glyphCount += 1; i += 1; continue;
    }
    totalEm += measureGlyphAdvanceEm(cur, locale, writingMode, fontWeight);
    glyphCount += 1;
    if (nxt !== "") totalEm += KERNING_PAIRS[`${cur}${nxt}`] ?? 0;
  }
  if (glyphCount > 1) totalEm += (glyphCount - 1) * letterSpacingEm;
  return { advanceEm: Math.max(0, totalEm), hasTateChuYoko };
}

/** 라틴 계열(`en`/`es`/`fr`) 장문 어휘를 음절 경계 기준으로 하이픈 분할한다. */
export function hyphenateLatinWord(word: string, locale: SupportedL10nLocale, minPrefix = 3, minSuffix = 3): readonly string[] {
  if (!MULTILINGUAL_TYPOGRAPHY_PROFILES[locale].supportsHyphenation) return [word];
  const chars = Array.from(word);
  if (chars.length < minPrefix + minSuffix) return [word];
  let startIdx = 0;
  while (startIdx < chars.length && !isLatinLetter(chars[startIdx] ?? "")) startIdx += 1;
  let endIdx = chars.length;
  while (endIdx > startIdx && !isLatinLetter(chars[endIdx - 1] ?? "")) endIdx -= 1;
  if (endIdx - startIdx < minPrefix + minSuffix) return [word];

  const breakPoints: number[] = [];
  for (let i = startIdx + minPrefix; i <= endIdx - minSuffix; i += 1) {
    const prev = (chars[i - 1] ?? "").toLowerCase();
    const curr = (chars[i] ?? "").toLowerCase();
    const next = i + 1 < endIdx ? (chars[i + 1] ?? "").toLowerCase() : "";
    const pV = LATIN_VOWELS.has(prev);
    const cV = LATIN_VOWELS.has(curr);
    const nV = LATIN_VOWELS.has(next);
    const canSplit =
      (pV && !cV && nV) ||
      (!pV && !cV && prev !== curr && !UNBREAKABLE_ONSETS.has(`${prev}${curr}`)) ||
      (!pV && prev === curr && prev !== "l" && prev !== "r");
    if (canSplit && i - (breakPoints[breakPoints.length - 1] ?? 0) >= 2) breakPoints.push(i);
  }
  if (breakPoints.length === 0) return [word];
  const syllables: string[] = [];
  let cursor = 0;
  for (const bp of breakPoints) { syllables.push(chars.slice(cursor, bp).join("")); cursor = bp; }
  syllables.push(chars.slice(cursor).join(""));
  return syllables.filter((p) => p.length > 0);
}

/** 한국어 원문 대비 번역 대사의 시각 폭 팽창률(`0.65× ~ 1.85×` 기준 대역)을 산출한다. */
export function estimateLocalizedTextExpansion(params: {
  readonly sourceText: string; readonly sourceLocale?: SupportedL10nLocale;
  readonly targetLocale: SupportedL10nLocale; readonly targetText?: string;
}): LocalizedTextExpansionEstimate {
  const sourceLocale = params.sourceLocale ?? "ko";
  const targetLocale = params.targetLocale;
  const sProf = MULTILINGUAL_TYPOGRAPHY_PROFILES[sourceLocale];
  const tProf = MULTILINGUAL_TYPOGRAPHY_PROFILES[targetLocale];

  const sourceVisualWidthEm = Math.max(0.5, measureTextRunEm(params.sourceText.replace(/\s+/g, " ").trim(), sourceLocale, { writingMode: "horizontal-tb" }).advanceEm);
  const hasTarget = typeof params.targetText === "string" && params.targetText.trim().length > 0;
  const targetVisualWidthEm = hasTarget && params.targetText !== undefined
    ? Math.max(0.5, measureTextRunEm(params.targetText.replace(/\s+/g, " ").trim(), targetLocale, { writingMode: "horizontal-tb" }).advanceEm)
    : sourceVisualWidthEm * (tProf.expansionFromKo.typical / sProf.expansionFromKo.typical);

  const expansionRatio = targetVisualWidthEm / sourceVisualWidthEm;
  const clampedNominalRatio = Math.max(NOMINAL_EXPANSION_MIN, Math.min(NOMINAL_EXPANSION_MAX, expansionRatio));
  const isWithinNominalBand = expansionRatio >= NOMINAL_EXPANSION_MIN && expansionRatio <= NOMINAL_EXPANSION_MAX;
  const estimatedAreaScale = expansionRatio * (tProf.defaultLineHeightRatio / sProf.defaultLineHeightRatio);

  let category: ExpansionCategory = "extreme-expansion";
  let recommendedStrategy: ExpansionReflowStrategy = "expand-balloon";
  if (expansionRatio < 0.88) { category = "contraction"; recommendedStrategy = "keep-geometry"; }
  else if (expansionRatio <= 1.12) { category = "neutral"; recommendedStrategy = "keep-geometry"; }
  else if (expansionRatio <= 1.35) { category = "moderate-expansion"; recommendedStrategy = "tighten-typography"; }
  else if (expansionRatio <= 1.65) { category = "heavy-expansion"; recommendedStrategy = "shrink-and-reflow"; }

  return {
    sourceLocale, targetLocale,
    sourceVisualWidthEm: Number(sourceVisualWidthEm.toFixed(3)),
    targetVisualWidthEm: Number(targetVisualWidthEm.toFixed(3)),
    expansionRatio: Number(expansionRatio.toFixed(3)),
    clampedNominalRatio: Number(clampedNominalRatio.toFixed(3)),
    isWithinNominalBand, estimatedAreaScale: Number(estimatedAreaScale.toFixed(3)),
    isMeasuredFromTargetText: hasTarget, category, recommendedStrategy,
  };
}

function buildAtomicUnitsForParagraph(
  paragraph: string, locale: SupportedL10nLocale, writingMode: TypographyWritingMode,
  allowHyphenation: boolean, maxSingleChordEm: number
): { readonly units: readonly AtomicBreakUnit[]; readonly kinsokuBoundCount: number } {
  const profile = MULTILINGUAL_TYPOGRAPHY_PROFILES[locale];
  const rawTokens: string[] = [];
  let kinsokuBoundCount = 0;

  if (profile.wordDelimited) {
    const normalized = locale === "fr" ? paragraph.replace(/«\s+/g, "«\u202F").replace(/\s+([?!:;»])/g, "\u202F$1") : paragraph;
    for (const piece of normalized.split(/(\s+)/)) if (piece.length > 0) rawTokens.push(piece);
  } else {
    const chars = Array.from(paragraph);
    let idx = 0;
    while (idx < chars.length) {
      const ch = chars[idx] ?? "";
      const cls = classifyTypographyChar(ch);
      if (cls === "latin-upper" || cls === "latin-lower" || cls === "digit") {
        let end = idx + 1;
        while (end < chars.length && ["latin-upper", "latin-lower", "digit"].includes(classifyTypographyChar(chars[end] ?? ""))) end += 1;
        rawTokens.push(chars.slice(idx, end).join(""));
        idx = end;
        continue;
      }
      const next = idx + 1 < chars.length ? (chars[idx + 1] ?? "") : "";
      const isPair = ((ch === "…" || ch === "—" || ch === "―") && next === ch) || ("!?！？".includes(ch) && next !== "" && "!?！？".includes(next));
      rawTokens.push(isPair ? `${ch}${next}` : ch);
      idx += isPair ? 2 : 1;
    }
  }

  // 행두·행말 금칙 문자를 인접 토큰과 원자 결합해 줄 경계 위반 차단
  const merged: string[] = [];
  for (const token of rawTokens) {
    const isWs = /^\s+$/.test(token);
    const firstChar = Array.from(token)[0] ?? "";
    const prevIdx = merged.length - 1;
    const prev = prevIdx >= 0 ? (merged[prevIdx] ?? "") : "";
    if (!isWs && prevIdx >= 0 && !/^\s+$/.test(prev) && GYOTO_KINSOKU_CHARS.has(firstChar)) {
      merged[prevIdx] = `${prev}${token}`; kinsokuBoundCount += 1; continue;
    }
    if (!isWs && prevIdx >= 0 && GYOMATSU_KINSOKU_CHARS.has(Array.from(prev).slice(-1)[0] ?? "")) {
      merged[prevIdx] = `${prev}${token}`; kinsokuBoundCount += 1; continue;
    }
    merged.push(token);
  }

  const units: AtomicBreakUnit[] = [];
  for (const token of merged) {
    if (/^\s+$/.test(token)) {
      units.push({ text: " ", isSpace: true, endsWithSoftHyphen: false, trailingHangingEm: 0 });
      continue;
    }
    const tokenRun = measureTextRunEm(token, locale, { writingMode });
    if (allowHyphenation && profile.supportsHyphenation && tokenRun.advanceEm > Math.max(4.5, maxSingleChordEm * 0.72)) {
      const syllables = hyphenateLatinWord(token, locale);
      if (syllables.length > 1) {
        for (let s = 0; s < syllables.length; s += 1) {
          const part = syllables[s] ?? "";
          const isLast = s === syllables.length - 1;
          const lastCh = Array.from(part).slice(-1)[0] ?? "";
          units.push({ text: part, isSpace: false, endsWithSoftHyphen: !isLast, trailingHangingEm: isLast && HANGING_PUNCT_CHARS.has(lastCh) ? HANGING_ALLOWANCE_EM : 0 });
        }
        continue;
      }
    }
    const lastCh = Array.from(token).slice(-1)[0] ?? "";
    units.push({ text: token, isSpace: false, endsWithSoftHyphen: false, trailingHangingEm: HANGING_PUNCT_CHARS.has(lastCh) ? HANGING_ALLOWANCE_EM : 0 });
  }
  return { units, kinsokuBoundCount };
}

/** 말풍선 윤곽 형태와 행 수(`lineCount`)에 따른 각 행/열의 가용 현 길이(px)를 계산한다. */
export function computeContourChordsPx(params: {
  readonly contour: BalloonContourKind; readonly writingMode: TypographyWritingMode;
  readonly innerWidthPx: number; readonly innerHeightPx: number;
  readonly lineCount: number; readonly fontSizePx: number; readonly lineHeightPx: number;
}): { readonly chordsPx: readonly number[]; readonly stackOffsetsPx: readonly number[]; readonly stackOverflowPx: number } {
  const { contour, writingMode, innerWidthPx, innerHeightPx, lineCount, fontSizePx, lineHeightPx } = params;
  const isVertical = writingMode === "vertical-rl";
  const mainAxisSpan = isVertical ? innerHeightPx : innerWidthPx;
  const crossAxisSpan = isVertical ? innerWidthPx : innerHeightPx;
  const rx = mainAxisSpan / 2;
  const ry = crossAxisSpan / 2;
  const totalStack = Math.max(fontSizePx, (lineCount - 1) * lineHeightPx + fontSizePx);
  const stackOverflowPx = Math.max(0, totalStack - crossAxisSpan);

  const chordsPx: number[] = [];
  const stackOffsetsPx: number[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    const rawOffset = -totalStack / 2 + fontSizePx / 2 + i * lineHeightPx;
    stackOffsetsPx.push(isVertical ? -rawOffset : rawOffset);
    if (contour === "rectangle") { chordsPx.push(Math.max(fontSizePx, mainAxisSpan)); continue; }
    if (contour === "rounded-rect") {
      const norm = ry > 0 ? Math.min(1, (Math.abs(rawOffset) + fontSizePx * 0.3) / ry) : 1;
      const inset = norm > 0.72 ? (norm - 0.72) / 0.28 : 0;
      chordsPx.push(Math.max(fontSizePx, mainAxisSpan * (1 - 0.14 * inset * inset)));
      continue;
    }
    const factor = contour === "shout-burst" ? 0.88 : contour === "thought-cloud" ? 0.94 : 1.0;
    const normCross = Math.min(0.97, (Math.abs(rawOffset) + fontSizePx * 0.32) / Math.max(1, ry * factor));
    const ratio = Math.sqrt(Math.max(0.06, 1 - normCross * normCross));
    chordsPx.push(Math.max(fontSizePx, 2 * rx * factor * Math.max(contour === "shout-burst" ? 0.36 : 0.42, ratio)));
  }
  return { chordsPx, stackOffsetsPx, stackOverflowPx };
}

function buildSliceMetricsCache(
  units: readonly AtomicBreakUnit[], locale: SupportedL10nLocale, writingMode: TypographyWritingMode,
  fontSizePx: number, fontWeight: number, letterSpacingEm: number
): (start: number, end: number) => SliceMetrics | null {
  const n = units.length;
  const cache = new Map<number, SliceMetrics | null>();
  return (start: number, end: number): SliceMetrics | null => {
    const key = start * (n + 1) + end;
    if (cache.has(key)) return cache.get(key) ?? null;
    let lo = start;
    let hi = end;
    while (lo < hi && units[lo]?.isSpace) lo += 1;
    while (hi > lo && units[hi - 1]?.isSpace) hi -= 1;
    if (lo >= hi) { cache.set(key, null); return null; }
    let text = "";
    for (let i = lo; i < hi; i += 1) text += units[i]?.text ?? "";
    const lastUnit = units[hi - 1];
    const hyphenatedAtEnd = Boolean(lastUnit?.endsWithSoftHyphen);
    if (hyphenatedAtEnd) text += "-";
    const run = measureTextRunEm(text, locale, { writingMode, fontWeight, letterSpacingEm });
    const entry: SliceMetrics = {
      text, advancePx: run.advanceEm * fontSizePx, hyphenatedAtEnd,
      trailingHangingEm: lastUnit?.trailingHangingEm ?? 0, hasTateChuYoko: run.hasTateChuYoko,
    };
    cache.set(key, entry);
    return entry;
  };
}

function solveDiamondPartitionForLineCount(
  units: readonly AtomicBreakUnit[], getSlice: (s: number, e: number) => SliceMetrics | null,
  lineCount: number, chordsPx: readonly number[], stackOverflowPx: number, fontSizePx: number, enableHanging: boolean
): PartitionCandidate | null {
  const nonSpaceCount = units.filter((u) => !u.isSpace).length;
  if (nonSpaceCount === 0 || lineCount > nonSpaceCount) return null;

  const n = units.length;
  const INF = 1e18;
  const dp: number[][] = Array.from({ length: lineCount + 1 }, () => new Array<number>(n + 1).fill(INF));
  const prevIdx: number[][] = Array.from({ length: lineCount + 1 }, () => new Array<number>(n + 1).fill(-1));
  if (dp[0]) dp[0][0] = 0;

  for (let row = 1; row <= lineCount; row += 1) {
    const chordPx = chordsPx[row - 1] ?? fontSizePx;
    const prevRow = dp[row - 1];
    const currRow = dp[row];
    const currPrev = prevIdx[row];
    if (!prevRow || !currRow || !currPrev) continue;

    for (let start = 0; start < n; start += 1) {
      const baseCost = prevRow[start] ?? INF;
      if (baseCost >= INF) continue;
      let overflowSteps = 0;
      for (let end = start + 1; end <= n; end += 1) {
        if (units[end - 1]?.isSpace && end < n) continue;
        const slice = getSlice(start, end);
        if (!slice) continue;
        const hangingPx = enableHanging ? slice.trailingHangingEm * fontSizePx : 0;
        const overflowPx = Math.max(0, slice.advancePx - (chordPx + hangingPx));
        if (overflowPx > 0) overflowSteps += 1;

        const fillRatio = chordPx > 0 ? slice.advancePx / chordPx : 2;
        let cost = overflowPx > 0
          ? OVERFLOW_PENALTY_SCALE * (1 + overflowPx * overflowPx)
          : Math.pow(Math.max(0, (lineCount === 1 ? 0.92 : 0.9) - fillRatio), 2) * 1200 + (slice.advancePx > chordPx ? 90 : 0);
        if (lineCount >= 2 && (row === 1 || row === lineCount) && fillRatio < 0.32 && Array.from(slice.text).length <= 2) {
          cost += WIDOW_ORPHAN_PENALTY;
        }
        if (slice.hyphenatedAtEnd) cost += HYPHEN_PENALTY;

        let nextCursor = end;
        while (nextCursor < n && units[nextCursor]?.isSpace) nextCursor += 1;
        if (baseCost + cost < (currRow[nextCursor] ?? INF)) {
          currRow[nextCursor] = baseCost + cost;
          currPrev[nextCursor] = start;
        }
        if (overflowSteps >= 2 && row < lineCount) break;
      }
    }
  }

  const finalCost = dp[lineCount]?.[n] ?? INF;
  if (finalCost >= INF) return null;

  const ranges: { readonly start: number; readonly end: number }[] = [];
  let cursor = n;
  for (let row = lineCount; row >= 1; row -= 1) {
    const start = prevIdx[row]?.[cursor] ?? -1;
    if (start < 0) return null;
    ranges.push({ start, end: cursor });
    cursor = start;
  }
  ranges.reverse();

  let hyphenationCount = 0;
  const resolvedLines: PartitionCandidate["lines"][number][] = [];
  for (let i = 0; i < ranges.length; i += 1) {
    const r = ranges[i];
    const slice = r ? getSlice(r.start, r.end) : null;
    if (!slice) continue;
    if (slice.hyphenatedAtEnd) hyphenationCount += 1;
    resolvedLines.push({ text: slice.text, advancePx: slice.advancePx, availableChordPx: chordsPx[i] ?? fontSizePx, hyphenatedAtEnd: slice.hyphenatedAtEnd, hasTateChuYoko: slice.hasTateChuYoko });
  }

  let symDelta = 0;
  const halfPairs = Math.floor(resolvedLines.length / 2);
  const maxAdv = Math.max(1, ...resolvedLines.map((l) => l.advancePx));
  for (let i = 0; i < halfPairs; i += 1) {
    symDelta += Math.abs((resolvedLines[i]?.advancePx ?? 0) - (resolvedLines[resolvedLines.length - 1 - i]?.advancePx ?? 0)) / maxAdv;
  }
  const mirrorSym = halfPairs > 0 ? Math.max(0, 1 - symDelta / halfPairs) : 1;
  let convexity = 1;
  if (resolvedLines.length >= 3) {
    const midW = resolvedLines[Math.floor(resolvedLines.length / 2)]?.advancePx ?? 0;
    const edgeAvg = ((resolvedLines[0]?.advancePx ?? 0) + (resolvedLines[resolvedLines.length - 1]?.advancePx ?? 0)) / 2;
    convexity = midW >= edgeAvg * 0.96 ? 1 : Math.max(0.4, midW / Math.max(1, edgeAvg));
  }
  const diamondSymmetryScore = Number((mirrorSym * 0.65 + convexity * 0.35).toFixed(4));
  const stackCost = stackOverflowPx > 0 ? OVERFLOW_PENALTY_SCALE * (1 + stackOverflowPx * stackOverflowPx) : 0;
  return { lines: resolvedLines, cost: finalCost + stackCost + (1 - diamondSymmetryScore) * 420, diamondSymmetryScore, hyphenationCount };
}

/** 다국어 말풍선 문단을 금칙 처리·음절 하이픈·타원 다이아몬드 균형에 맞춰 조판한다. */
export function layoutMultilingualBalloonLines(input: MultilingualBalloonLayoutInput): MultilingualBalloonLayoutResult {
  const profile = MULTILINGUAL_TYPOGRAPHY_PROFILES[input.locale];
  const writingMode: TypographyWritingMode = input.writingMode ?? (input.locale === "ja" ? "vertical-rl" : profile.defaultWritingMode);
  const contour: BalloonContourKind = input.contour ?? "ellipse";
  const fontSizePx = Math.max(4, input.fontSizePx);
  const fontWeight = input.fontWeight ?? profile.fontWeightRange.default;
  const lineHeightPx = fontSizePx * (input.lineHeightRatio ?? profile.defaultLineHeightRatio);
  const letterSpacingEm = input.letterSpacingEm ?? profile.defaultLetterSpacingEm;
  const allowHyphenation = input.allowHyphenation ?? profile.supportsHyphenation;
  const enableHanging = input.enableHangingPunctuation ?? true;
  const innerWidthPx = Math.max(fontSizePx, input.innerWidthPx);
  const innerHeightPx = Math.max(fontSizePx, input.innerHeightPx);

  const paragraphs = input.text.replace(/\r\n/g, "\n").split("\n").map((p) => p.trim()).filter((p) => p.length > 0);
  if (paragraphs.length === 0) {
    return {
      locale: input.locale, writingMode, contour, fontSizePx, fontWeight, lineHeightPx, letterSpacingEm,
      lines: [], lineCount: 0, boundingWidthPx: 0, boundingHeightPx: 0,
      fitsInsideBalloon: true, overflowsWidth: false, overflowsHeight: false,
      maxChordOverflowPx: 0, stackOverflowPx: 0, diamondSymmetryScore: 1,
      hyphenationCount: 0, kinsokuBoundCount: 0, kinsokuViolationCount: 0, hangingPunctuationCount: 0,
    };
  }

  const isVertical = writingMode === "vertical-rl";
  const mainAxisSpanPx = isVertical ? innerHeightPx : innerWidthPx;
  const crossAxisSpanPx = isVertical ? innerWidthPx : innerHeightPx;
  const maxFitLines = Math.max(1, Math.floor((crossAxisSpanPx - fontSizePx) / lineHeightPx) + 1);
  const maxCandidateLines = Math.min(14, Math.max(maxFitLines + 2, paragraphs.length + 2));

  let totalKinsokuBound = 0;
  let diamondSymmetryAccum = 0;
  let hyphenationCount = 0;
  const rawLines: PartitionCandidate["lines"][number][] = [];

  for (const paragraph of paragraphs) {
    const { units, kinsokuBoundCount } = buildAtomicUnitsForParagraph(paragraph, input.locale, writingMode, allowHyphenation, mainAxisSpanPx / fontSizePx);
    totalKinsokuBound += kinsokuBoundCount;
    const getSlice = buildSliceMetricsCache(units, input.locale, writingMode, fontSizePx, fontWeight, letterSpacingEm);
    const nonSpaceCount = units.filter((u) => !u.isSpace).length;
    const pMaxLines = Math.min(nonSpaceCount, Math.max(1, Math.ceil(maxCandidateLines / paragraphs.length) + 1));

    let best: PartitionCandidate | null = null;
    for (let k = 1; k <= pMaxLines; k += 1) {
      const geom = computeContourChordsPx({
        contour: paragraphs.length === 1 ? contour : "rounded-rect", writingMode, innerWidthPx,
        innerHeightPx: paragraphs.length === 1 ? innerHeightPx : innerHeightPx / paragraphs.length,
        lineCount: k, fontSizePx, lineHeightPx,
      });
      const candidate = solveDiamondPartitionForLineCount(units, getSlice, k, geom.chordsPx, geom.stackOverflowPx, fontSizePx, enableHanging);
      if (candidate && (!best || candidate.cost < best.cost)) best = candidate;
    }
    if (best) {
      for (const l of best.lines) rawLines.push(l);
      diamondSymmetryAccum += best.diamondSymmetryScore;
      hyphenationCount += best.hyphenationCount;
    }
  }

  const finalGeom = computeContourChordsPx({ contour, writingMode, innerWidthPx, innerHeightPx, lineCount: Math.max(1, rawLines.length), fontSizePx, lineHeightPx });
  let maxMainAdvancePx = 0;
  let maxChordOverflowPx = 0;
  let kinsokuViolationCount = 0;
  let hangingPunctuationCount = 0;

  const finalLines: LaidOutBalloonLine[] = rawLines.map((line, idx) => {
    const chordPx = finalGeom.chordsPx[idx] ?? fontSizePx;
    const stackOffset = finalGeom.stackOffsetsPx[idx] ?? 0;
    const chars = Array.from(line.text);
    const firstChar = chars[0] ?? "";
    const lastChar = chars[chars.length - 1] ?? "";
    if (GYOTO_KINSOKU_CHARS.has(firstChar) || GYOMATSU_KINSOKU_CHARS.has(lastChar)) kinsokuViolationCount += 1;

    const hangingPx = enableHanging && HANGING_PUNCT_CHARS.has(lastChar) ? HANGING_ALLOWANCE_EM * fontSizePx : 0;
    const overflowPx = Math.max(0, line.advancePx - (chordPx + hangingPx));
    if (overflowPx > maxChordOverflowPx) maxChordOverflowPx = overflowPx;
    if (line.advancePx > maxMainAdvancePx) maxMainAdvancePx = line.advancePx;
    const usedHanging = line.advancePx > chordPx && overflowPx <= 0.01;
    if (usedHanging) hangingPunctuationCount += 1;

    return {
      lineIndex: idx, text: line.text, mainAxisAdvancePx: Number(line.advancePx.toFixed(2)),
      availableChordPx: Number(chordPx.toFixed(2)), fillRatio: Number((chordPx > 0 ? line.advancePx / chordPx : 0).toFixed(3)),
      centerOffsetXPx: Number((isVertical ? stackOffset : 0).toFixed(2)),
      centerOffsetYPx: Number((isVertical ? 0 : stackOffset).toFixed(2)),
      hyphenatedAtEnd: line.hyphenatedAtEnd, usedHangingPunctuation: usedHanging,
      hasTateChuYoko: line.hasTateChuYoko, overflowsChord: overflowPx > 0.01,
    };
  });

  const totalCrossStackPx = rawLines.length > 0 ? (rawLines.length - 1) * lineHeightPx + fontSizePx : 0;
  const overflowsWidth = isVertical ? finalGeom.stackOverflowPx > 0.01 : maxChordOverflowPx > 0.01;
  const overflowsHeight = isVertical ? maxChordOverflowPx > 0.01 : finalGeom.stackOverflowPx > 0.01;

  return {
    locale: input.locale, writingMode, contour,
    fontSizePx: Number(fontSizePx.toFixed(2)), fontWeight,
    lineHeightPx: Number(lineHeightPx.toFixed(2)), letterSpacingEm: Number(letterSpacingEm.toFixed(4)),
    lines: finalLines, lineCount: rawLines.length,
    boundingWidthPx: Number((isVertical ? totalCrossStackPx : maxMainAdvancePx).toFixed(2)),
    boundingHeightPx: Number((isVertical ? maxMainAdvancePx : totalCrossStackPx).toFixed(2)),
    fitsInsideBalloon: !overflowsWidth && !overflowsHeight, overflowsWidth, overflowsHeight,
    maxChordOverflowPx: Number(maxChordOverflowPx.toFixed(2)), stackOverflowPx: Number(finalGeom.stackOverflowPx.toFixed(2)),
    diamondSymmetryScore: Number((diamondSymmetryAccum / Math.max(1, paragraphs.length)).toFixed(4)),
    hyphenationCount, kinsokuBoundCount: totalKinsokuBound, kinsokuViolationCount, hangingPunctuationCount,
  };
}
