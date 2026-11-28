/**
 * Wave 110 — 한·일·불·독 화자 말투/경어 표지 스캐너 및 라틴 단어 경계 매처.
 */

import {
  LOCALIZATION_LOCALE_PROFILES,
  type LocalizationTargetLocale,
} from "./localization-locale-profiles-and-crypto";

export type RegisterPolitenessLevel = "formal-polite" | "informal-casual" | "archaic-royal";

export interface RegisterScanResult {
  readonly formalMarkers: readonly string[];
  readonly informalMarkers: readonly string[];
  readonly archaicMarkers: readonly string[];
}

function isLatinWordCode(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0xc0 && code <= 0x24f)
  );
}

/** 라틴 문자권은 단어 경계를 검사하고, 한·일·아랍어권은 부분 문자열로 용어를 대조한다. */
export function containsTermWithBoundary(
  haystack: string,
  needle: string,
  locale: LocalizationTargetLocale,
  caseSensitive: boolean,
  allowGenitiveS: boolean,
): boolean {
  const trimmedNeedle = needle.trim();
  if (trimmedNeedle.length === 0) return false;
  const src = caseSensitive ? haystack : haystack.toLowerCase();
  const target = caseSensitive ? trimmedNeedle : trimmedNeedle.toLowerCase();
  const isLatin = LOCALIZATION_LOCALE_PROFILES[locale].scriptFamily === "latin";

  let searchFrom = 0;
  while (searchFrom <= src.length - target.length) {
    const idx = src.indexOf(target, searchFrom);
    if (idx < 0) return false;
    if (!isLatin) return true;

    const beforeOk = idx === 0 || !isLatinWordCode(src.charCodeAt(idx - 1));
    const endIdx = idx + target.length;
    const directAfterOk = endIdx >= src.length || !isLatinWordCode(src.charCodeAt(endIdx));
    const genitiveAfterOk =
      allowGenitiveS &&
      endIdx < src.length &&
      (src.charAt(endIdx) === "s" || src.charAt(endIdx) === "S") &&
      (endIdx + 1 >= src.length || !isLatinWordCode(src.charCodeAt(endIdx + 1)));

    if (beforeOk && (directAfterOk || genitiveAfterOk)) return true;
    searchFrom = idx + 1;
  }
  return false;
}

const KO_FORMAL_ENDINGS: readonly string[] = [
  "습니다", "습니까", "십시오", "세요", "예요", "이에요", "해요",
  "어요", "아요", "여요", "군요", "네요", "지요", "까요", "나요", "가요", "죠",
];
const KO_FORMAL_TOKENS: readonly string[] = ["제가", "저희", "드리", "말씀", "주세요", "주십시오"];
const KO_INFORMAL_ENDINGS: readonly string[] = [
  "거야", "할게", "해라", "했어", "갔어", "있어", "없어", "알아", "몰라",
  "뭐야", "가자", "먹자", "볼래", "할래", "잖아", "거든", "물러서", "닥쳐",
  "그만해", "하지 마", "왜 그래",
];
const KO_INFORMAL_TOKENS: readonly string[] = ["너 ", "너는", "너를", "네가", "니가", "야,", "야!"];
const KO_ARCHAIC_MARKERS: readonly string[] = [
  "하옵소서", "소서", "하시오", "하였소", "하겠소", "하오", "하노라",
  "이로다", "느니라", "폐하", "전하", "과인이", "짐이", "그대",
];

const JA_FORMAL_MARKERS: readonly string[] = [
  "ございます", "いたします", "でしょうか", "ください", "ましょう", "ました", "ません", "です", "ます",
];
const JA_INFORMAL_MARKERS: readonly string[] = [
  "お前", "てめえ", "あんた", "やめろ", "黙れ", "だろ", "だぜ", "だぞ", "だよ", "だね", "じゃん", "くれよ", "するな",
];
const JA_ARCHAIC_MARKERS: readonly string[] = [
  "であろう", "ござる", "そなた", "たまえ", "いたせ", "のじゃ", "じゃよ", "余は", "朕", "申す",
];

const FR_FORMAL_WORDS: readonly string[] = ["vous", "votre", "vos", "vous-même", "veuillez", "monsieur", "madame"];
const FR_INFORMAL_WORDS: readonly string[] = ["tu", "toi", "ton", "ta", "tes", "toi-même", "vas-y", "tais-toi"];
const FR_ARCHAIC_WORDS: readonly string[] = ["votre majesté", "votre altesse", "sire", "messire", "daignez", "guère"];

const DE_FORMAL_WORDS: readonly string[] = ["Sie", "Ihnen", "Ihr", "Ihre", "Ihrem", "Ihren", "Ihrer", "Ihres"];
const DE_INFORMAL_WORDS: readonly string[] = ["du", "dich", "dir", "dein", "deine", "deinem", "deinen", "deiner", "deines"];
const DE_ARCHAIC_WORDS: readonly string[] = ["eure majestät", "eure hoheit", "wohlan", "gebietet", "kniet"];

function endsAtKoreanSentenceBoundary(text: string, suffix: string): boolean {
  let pos = 0;
  while (pos <= text.length - suffix.length) {
    const idx = text.indexOf(suffix, pos);
    if (idx < 0) return false;
    const afterIdx = idx + suffix.length;
    if (afterIdx >= text.length) return true;
    if (".!?,…\"'”’\n".indexOf(text.charAt(afterIdx)) >= 0) return true;
    pos = idx + 1;
  }
  return false;
}

/** 한국어·일본어·프랑스어·독일어 대사에서 경어/반말/고어체 표지를 스캔한다. */
export function scanRegisterMarkers(
  text: string,
  locale: LocalizationTargetLocale,
): RegisterScanResult | null {
  const formal: string[] = [];
  const informal: string[] = [];
  const archaic: string[] = [];

  if (locale === "ko-KR") {
    for (let i = 0; i < KO_FORMAL_ENDINGS.length; i += 1) {
      if (endsAtKoreanSentenceBoundary(text, KO_FORMAL_ENDINGS[i])) formal.push(KO_FORMAL_ENDINGS[i]);
    }
    for (let i = 0; i < KO_FORMAL_TOKENS.length; i += 1) {
      if (text.indexOf(KO_FORMAL_TOKENS[i]) >= 0) formal.push(KO_FORMAL_TOKENS[i]);
    }
    for (let i = 0; i < KO_INFORMAL_ENDINGS.length; i += 1) {
      if (endsAtKoreanSentenceBoundary(text, KO_INFORMAL_ENDINGS[i])) informal.push(KO_INFORMAL_ENDINGS[i]);
    }
    for (let i = 0; i < KO_INFORMAL_TOKENS.length; i += 1) {
      if (text.indexOf(KO_INFORMAL_TOKENS[i]) >= 0) informal.push(KO_INFORMAL_TOKENS[i].trim());
    }
    for (let i = 0; i < KO_ARCHAIC_MARKERS.length; i += 1) {
      if (text.indexOf(KO_ARCHAIC_MARKERS[i]) >= 0) archaic.push(KO_ARCHAIC_MARKERS[i]);
    }
    return { formalMarkers: formal, informalMarkers: informal, archaicMarkers: archaic };
  }

  if (locale === "ja-JP") {
    for (let i = 0; i < JA_FORMAL_MARKERS.length; i += 1) {
      if (text.indexOf(JA_FORMAL_MARKERS[i]) >= 0) formal.push(JA_FORMAL_MARKERS[i]);
    }
    for (let i = 0; i < JA_INFORMAL_MARKERS.length; i += 1) {
      if (text.indexOf(JA_INFORMAL_MARKERS[i]) >= 0) informal.push(JA_INFORMAL_MARKERS[i]);
    }
    for (let i = 0; i < JA_ARCHAIC_MARKERS.length; i += 1) {
      if (text.indexOf(JA_ARCHAIC_MARKERS[i]) >= 0) archaic.push(JA_ARCHAIC_MARKERS[i]);
    }
    return { formalMarkers: formal, informalMarkers: informal, archaicMarkers: archaic };
  }

  if (locale === "fr-FR") {
    for (let i = 0; i < FR_FORMAL_WORDS.length; i += 1) {
      if (containsTermWithBoundary(text, FR_FORMAL_WORDS[i], "fr-FR", false, false)) formal.push(FR_FORMAL_WORDS[i]);
    }
    for (let i = 0; i < FR_INFORMAL_WORDS.length; i += 1) {
      if (containsTermWithBoundary(text, FR_INFORMAL_WORDS[i], "fr-FR", false, false)) informal.push(FR_INFORMAL_WORDS[i]);
    }
    if (/(?:^|[\s,;!?"'«])t'[a-zàâéèêëîïôùûüç]/i.test(text)) informal.push("t'");
    for (let i = 0; i < FR_ARCHAIC_WORDS.length; i += 1) {
      if (containsTermWithBoundary(text, FR_ARCHAIC_WORDS[i], "fr-FR", false, false)) archaic.push(FR_ARCHAIC_WORDS[i]);
    }
    return { formalMarkers: formal, informalMarkers: informal, archaicMarkers: archaic };
  }

  if (locale === "de-DE") {
    for (let i = 0; i < DE_FORMAL_WORDS.length; i += 1) {
      if (containsTermWithBoundary(text, DE_FORMAL_WORDS[i], "de-DE", true, false)) formal.push(DE_FORMAL_WORDS[i]);
    }
    for (let i = 0; i < DE_INFORMAL_WORDS.length; i += 1) {
      if (containsTermWithBoundary(text, DE_INFORMAL_WORDS[i], "de-DE", false, false)) informal.push(DE_INFORMAL_WORDS[i]);
    }
    for (let i = 0; i < DE_ARCHAIC_WORDS.length; i += 1) {
      if (containsTermWithBoundary(text, DE_ARCHAIC_WORDS[i], "de-DE", false, false)) archaic.push(DE_ARCHAIC_WORDS[i]);
    }
    return { formalMarkers: formal, informalMarkers: informal, archaicMarkers: archaic };
  }

  return null;
}

export function evaluateRegisterViolation(
  required: RegisterPolitenessLevel,
  scan: RegisterScanResult,
): { readonly detected: RegisterPolitenessLevel; readonly markers: readonly string[] } | null {
  if (required === "formal-polite") {
    return scan.informalMarkers.length > 0
      ? { detected: "informal-casual", markers: scan.informalMarkers }
      : null;
  }
  if (required === "informal-casual") {
    if (scan.formalMarkers.length > 0) return { detected: "formal-polite", markers: scan.formalMarkers };
    if (scan.archaicMarkers.length > 0) return { detected: "archaic-royal", markers: scan.archaicMarkers };
    return null;
  }
  if (scan.informalMarkers.length > 0) return { detected: "informal-casual", markers: scan.informalMarkers };
  if (scan.archaicMarkers.length === 0 && scan.formalMarkers.length > 0) {
    return { detected: "formal-polite", markers: scan.formalMarkers };
  }
  return null;
}
