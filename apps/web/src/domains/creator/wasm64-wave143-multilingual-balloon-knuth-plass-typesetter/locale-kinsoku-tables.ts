/**
 * Wave 143 — 5개국어(한/일/영/불/스) 금칙문자(Kinsoku-Shori) 테이블 및 글리프 폭 메트릭.
 */

import type { KinsokuRuleSet, SupportedTypesetLocale } from "./balloon-typeset-types";

export const NBSP = "\u00A0";

const KO_GYOTO_CHARS: readonly string[] = [
  ",", ".", "!", "?", ":", ";", ")", "]", "}", "”", "’", "》", "〉", "」", "』", "】",
  "~", "…", "‥", "·", "、", "。", "！", "？", "）", "］", "｝",
];

const KO_GYOMATSU_CHARS: readonly string[] = [
  "(", "[", "{", "“", "‘", "《", "〈", "「", "『", "【", "（", "［", "｛",
];

const JA_GYOTO_CHARS: readonly string[] = [
  "、", "。", "，", "．", "！", "？", "）", "］", "｝", "」", "』", "】", "〉", "》",
  "〕", "〗", "〙", "〛", "…", "‥", "ー", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "っ", "ゃ",
  "ゅ", "ょ", "ゎ", "ァ", "ィ", "ゥ", "ェ", "ォ", "ッ", "ャ", "ュ", "ョ", "ヮ", "ヵ",
  "ヶ", "々", "ゝ", "ゞ", "ヽ", "ヾ", "゛", "゜", "・", "：", "；", ",", ".", "!", "?",
  ")", "]", "}", "~",
];

const JA_GYOMATSU_CHARS: readonly string[] = [
  "（", "［", "｛", "「", "『", "【", "〈", "《", "〔", "〖", "〘", "〚", "“", "‘",
  "(", "[", "{",
];

const EN_GYOTO_CHARS: readonly string[] = [
  ",", ".", "!", "?", ":", ";", ")", "]", "}", "”", "’", "…", "—",
];

const EN_GYOMATSU_CHARS: readonly string[] = ["(", "[", "{", "“", "‘"];

const FR_GYOTO_CHARS: readonly string[] = [
  ",", ".", "!", "?", ":", ";", ")", "]", "}", "»", "”", "’", "…", "—",
];

const FR_GYOMATSU_CHARS: readonly string[] = ["(", "[", "{", "«", "“", "‘"];

const ES_GYOTO_CHARS: readonly string[] = [
  ",", ".", "!", "?", ":", ";", ")", "]", "}", "»", "”", "’", "…", "—",
];

const ES_GYOMATSU_CHARS: readonly string[] = ["(", "[", "{", "«", "¡", "¿", "“", "‘"];

export const FRENCH_HIGH_PUNCTUATION_SET = new Set<string>([":", ";", "!", "?", "»"]);
export const SPANISH_OPENER_SET = new Set<string>(["¡", "¿"]);

const SMALL_KANA_SET = new Set<string>([
  "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "っ", "ゃ", "ゅ", "ょ", "ゎ",
  "ァ", "ィ", "ゥ", "ェ", "ォ", "ッ", "ャ", "ュ", "ョ", "ヮ", "ヵ", "ヶ",
]);
const CJK_HALF_PUNCT_SET = new Set<string>(["、", "。", "，", "．", "・", "：", "；"]);
const CJK_BRACKET_SET = new Set<string>([
  "「", "」", "『", "』", "（", "）", "［", "］", "｛", "｝", "【", "】", "〈", "〉", "《", "》",
]);
const NARROW_LATIN_SET = new Set<string>([
  "i", "l", "j", "t", "f", "r", "í", "ì", "î", "ï", "I", "Í", "Ì", "Î", "Ï",
]);
const WIDE_LOWER_LATIN_SET = new Set<string>(["m", "w", "œ", "æ"]);
const WIDE_UPPER_LATIN_SET = new Set<string>(["M", "W", "Œ", "Æ"]);
const NARROW_ASCII_PUNCT_SET = new Set<string>([".", ",", ":", ";", "!", "'", "|", "`", "’", "‘"]);
const MEDIUM_PUNCT_SET = new Set<string>(["?", "¡", "¿", "(", ")", "[", "]", "{", "}", "\"", "“", "”", "-"]);

const LOCALE_KINSOKU_RULES: Readonly<Record<SupportedTypesetLocale, KinsokuRuleSet>> = {
  "ko-KR": {
    locale: "ko-KR",
    gyotoForbiddenChars: KO_GYOTO_CHARS,
    gyomatsuForbiddenChars: KO_GYOMATSU_CHARS,
    requiresPreHighPunctuationNbsp: false,
    protectsInvertedSpanishOpeners: false,
    defaultLineHeightRatio: 1.38,
    descriptionKo: "어절 우선(keep-all) + 행두·행말 문장부호 금칙 보호",
  },
  "ja-JP": {
    locale: "ja-JP",
    gyotoForbiddenChars: JA_GYOTO_CHARS,
    gyomatsuForbiddenChars: JA_GYOMATSU_CHARS,
    requiresPreHighPunctuationNbsp: false,
    protectsInvertedSpanishOpeners: false,
    defaultLineHeightRatio: 1.38,
    descriptionKo: "문자 단위 분할 + JIS X 4051 행두(、。！？）」』…ー)·행말(（「『) 금칙 엄수",
  },
  "en-US": {
    locale: "en-US",
    gyotoForbiddenChars: EN_GYOTO_CHARS,
    gyomatsuForbiddenChars: EN_GYOMATSU_CHARS,
    requiresPreHighPunctuationNbsp: false,
    protectsInvertedSpanishOpeners: false,
    defaultLineHeightRatio: 1.28,
    descriptionKo: "단어 단위 줄바꿈 + 장문 하이픈 분할 및 고아 막줄 억제",
  },
  "fr-FR": {
    locale: "fr-FR",
    gyotoForbiddenChars: FR_GYOTO_CHARS,
    gyomatsuForbiddenChars: FR_GYOMATSU_CHARS,
    requiresPreHighPunctuationNbsp: true,
    protectsInvertedSpanishOpeners: false,
    defaultLineHeightRatio: 1.3,
    descriptionKo: "길메(« ») 및 고부호(: ; ! ?) 앞뒤 비분리 공백 결합 보호",
  },
  "es-ES": {
    locale: "es-ES",
    gyotoForbiddenChars: ES_GYOTO_CHARS,
    gyomatsuForbiddenChars: ES_GYOMATSU_CHARS,
    requiresPreHighPunctuationNbsp: false,
    protectsInvertedSpanishOpeners: true,
    defaultLineHeightRatio: 1.3,
    descriptionKo: "여는 감탄·의문부호(¡ ¿) 행말 고립 금지 및 단어 단위 균형 피팅",
  },
};

const GYOTO_SETS: Readonly<Record<SupportedTypesetLocale, ReadonlySet<string>>> = {
  "ko-KR": new Set(KO_GYOTO_CHARS),
  "ja-JP": new Set(JA_GYOTO_CHARS),
  "en-US": new Set(EN_GYOTO_CHARS),
  "fr-FR": new Set(FR_GYOTO_CHARS),
  "es-ES": new Set(ES_GYOTO_CHARS),
};

const GYOMATSU_SETS: Readonly<Record<SupportedTypesetLocale, ReadonlySet<string>>> = {
  "ko-KR": new Set(KO_GYOMATSU_CHARS),
  "ja-JP": new Set(JA_GYOMATSU_CHARS),
  "en-US": new Set(EN_GYOMATSU_CHARS),
  "fr-FR": new Set(FR_GYOMATSU_CHARS),
  "es-ES": new Set(ES_GYOMATSU_CHARS),
};

/** 지정 로캘의 금칙규칙 메타데이터를 반환한다. */
export function getLocaleKinsokuRuleSet(locale: SupportedTypesetLocale): KinsokuRuleSet {
  return LOCALE_KINSOKU_RULES[locale];
}

/** 주어진 문자가 해당 로캘의 행두금칙 문자인지 판정한다. */
export function isLineStartForbiddenChar(ch: string, locale: SupportedTypesetLocale): boolean {
  return GYOTO_SETS[locale].has(ch);
}

/** 주어진 문자가 해당 로캘의 행말금칙 문자인지 판정한다. */
export function isLineEndForbiddenChar(ch: string, locale: SupportedTypesetLocale): boolean {
  return GYOMATSU_SETS[locale].has(ch);
}

/** 문자열을 서로게이트 쌍을 보존한 문자 단위 배열로 분해한다. */
export function splitCodePoints(text: string): readonly string[] {
  const result: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        result.push(text.slice(i, i + 2));
        i += 1;
        continue;
      }
    }
    result.push(text.charAt(i));
  }
  return result;
}

export function isHangulCode(code: number): boolean {
  return (
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3130 && code <= 0x318f)
  );
}

export function isCjkIdeographCode(code: number): boolean {
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
}

export function isKanaCode(code: number): boolean {
  return (
    (code >= 0x3040 && code <= 0x309f) ||
    (code >= 0x30a0 && code <= 0x30ff) ||
    (code >= 0x31f0 && code <= 0x31ff)
  );
}

export function isLatinLetterOrDigitCode(code: number): boolean {
  if ((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
    return true;
  }
  if (code >= 0x00c0 && code <= 0x00ff && code !== 0x00d7 && code !== 0x00f7) {
    return true;
  }
  return code >= 0x0100 && code <= 0x017f;
}

function isUppercaseLatinCode(code: number): boolean {
  if (code >= 0x41 && code <= 0x5a) return true;
  return code >= 0x00c0 && code <= 0x00de && code !== 0x00d7;
}

/** 발화 가능한 실질 문자(한글·한자·가나·라틴 문자·숫자)인지 판정한다. */
export function isSpeakableGlyph(ch: string): boolean {
  if (ch.length === 0 || ch === "ー" || ch === "・") return false;
  const code = ch.charCodeAt(0);
  return isHangulCode(code) || isCjkIdeographCode(code) || isKanaCode(code) || isLatinLetterOrDigitCode(code);
}

/** 문자열 내 실질 발화 문자 수를 계산한다. */
export function countSpeakableChars(text: string): number {
  const chars = splitCodePoints(text);
  let count = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch && isSpeakableGlyph(ch)) count += 1;
  }
  return count;
}

/** 글리프 1자의 결정론적 상대 폭 계수(`em` 단위)를 반환한다. */
export function measureGlyphAdvanceEm(ch: string, locale: SupportedTypesetLocale): number {
  if (ch.length === 0) return 0;
  if (ch === " ") return locale === "ja-JP" ? 0.42 : 0.28;
  if (ch === NBSP) return locale === "fr-FR" ? 0.22 : 0.26;
  if (ch === "\u3000") return 1.0;

  const code = ch.charCodeAt(0);
  if (isHangulCode(code) || isCjkIdeographCode(code)) return 1.0;
  if (SMALL_KANA_SET.has(ch)) return 0.86;
  if (ch === "ー") return 0.96;
  if (isKanaCode(code)) return 0.98;
  if (CJK_HALF_PUNCT_SET.has(ch)) return 0.62;
  if (CJK_BRACKET_SET.has(ch)) return 0.68;
  if (ch === "…" || ch === "‥" || ch === "—" || ch === "！" || ch === "？") return 0.96;

  if (ch === "1") return 0.44;
  if (code >= 0x30 && code <= 0x39) return 0.56;
  if (NARROW_LATIN_SET.has(ch)) return ch === "t" || ch === "f" || ch === "r" ? 0.36 : 0.31;
  if (WIDE_LOWER_LATIN_SET.has(ch)) return 0.84;
  if (WIDE_UPPER_LATIN_SET.has(ch)) return 0.92;
  if (isUppercaseLatinCode(code)) return 0.7;
  if (isLatinLetterOrDigitCode(code)) return 0.54;

  if (NARROW_ASCII_PUNCT_SET.has(ch)) return 0.3;
  if (ch === "«" || ch === "»") return 0.58;
  if (MEDIUM_PUNCT_SET.has(ch)) return 0.5;
  if (code >= 0xff01 && code <= 0xff60) return 0.92;
  return 0.62;
}

/** 한 줄 문자열의 픽셀 폭을 결정론적으로 측정한다. */
export function measureLineWidthPx(
  text: string,
  fontSizePx: number,
  locale: SupportedTypesetLocale,
  letterSpacingEm = 0,
): number {
  const safeFont = Number.isFinite(fontSizePx) && fontSizePx > 0 ? fontSizePx : 16;
  const safeSpacing = Number.isFinite(letterSpacingEm) ? Math.max(-0.2, Math.min(0.6, letterSpacingEm)) : 0;
  const chars = splitCodePoints(text);
  if (chars.length === 0) return 0;

  let totalEm = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch) totalEm += measureGlyphAdvanceEm(ch, locale);
  }
  if (chars.length > 1 && safeSpacing !== 0) {
    totalEm += (chars.length - 1) * safeSpacing;
  }
  const rawPx = Math.max(0, totalEm * safeFont);
  return Math.round(rawPx * 1000) / 1000;
}
