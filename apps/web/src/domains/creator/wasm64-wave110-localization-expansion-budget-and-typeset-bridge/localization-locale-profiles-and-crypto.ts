/**
 * Wave 110 — 7개 글로벌 연재 로케일 타이포그래피 프로파일·자폭 추정 및
 * 외부 의존성 없는 순수 동기 ES2017 FIPS 180-4 SHA-256 직렬화 모듈.
 */

export type LocalizationTargetLocale =
  | "ko-KR"
  | "ja-JP"
  | "en-US"
  | "fr-FR"
  | "es-ES"
  | "de-DE"
  | "ar-SA";

export type LocaleShortCode = "KO" | "JA" | "EN" | "FR" | "ES" | "DE" | "AR";

export type ScriptFamily = "hangul" | "cjk-kana" | "latin" | "arabic";

export type BalloonInteriorShape = "ellipse" | "rounded-rect" | "burst";

export type BalloonRemediationTier =
  | "fits-cleanly"
  | "micro-tighten-tracking"
  | "expand-balloon-margin"
  | "split-into-linked-sub-balloon"
  | "shorten-translation-copy";

export interface LocaleTypographyProfile {
  readonly locale: LocalizationTargetLocale;
  readonly shortCode: LocaleShortCode;
  readonly labelKo: string;
  readonly scriptFamily: ScriptFamily;
  readonly direction: "ltr" | "rtl";
  readonly isRtl: boolean;
  readonly supportsVerticalTypeset: boolean;
  readonly charExpansionRatio: number;
  readonly areaExpansionRatio: number;
  readonly averageGlyphWidthEm: number;
  readonly lineHeightRatio: number;
  readonly minTrackingEm: number;
  readonly minMobileFontRatioOfCanvas: number;
}

export const ALL_LOCALIZATION_LOCALES: readonly LocalizationTargetLocale[] = [
  "ko-KR",
  "ja-JP",
  "en-US",
  "fr-FR",
  "es-ES",
  "de-DE",
  "ar-SA",
];

export const MATRIX_DISPLAY_LOCALE_ORDER: readonly LocalizationTargetLocale[] = [
  "ko-KR",
  "ja-JP",
  "en-US",
  "fr-FR",
  "de-DE",
  "es-ES",
  "ar-SA",
];

export const LOCALIZATION_LOCALE_PROFILES: Readonly<
  Record<LocalizationTargetLocale, LocaleTypographyProfile>
> = {
  "ko-KR": {
    locale: "ko-KR",
    shortCode: "KO",
    labelKo: "한국어 (마스터)",
    scriptFamily: "hangul",
    direction: "ltr",
    isRtl: false,
    supportsVerticalTypeset: true,
    charExpansionRatio: 1.0,
    areaExpansionRatio: 1.0,
    averageGlyphWidthEm: 0.96,
    lineHeightRatio: 1.38,
    minTrackingEm: -0.04,
    minMobileFontRatioOfCanvas: 0.015,
  },
  "ja-JP": {
    locale: "ja-JP",
    shortCode: "JA",
    labelKo: "일본어",
    scriptFamily: "cjk-kana",
    direction: "ltr",
    isRtl: false,
    supportsVerticalTypeset: true,
    charExpansionRatio: 1.12,
    areaExpansionRatio: 1.1,
    averageGlyphWidthEm: 0.98,
    lineHeightRatio: 1.42,
    minTrackingEm: -0.04,
    minMobileFontRatioOfCanvas: 0.015,
  },
  "en-US": {
    locale: "en-US",
    shortCode: "EN",
    labelKo: "영어 (북미)",
    scriptFamily: "latin",
    direction: "ltr",
    isRtl: false,
    supportsVerticalTypeset: false,
    charExpansionRatio: 2.15,
    areaExpansionRatio: 1.32,
    averageGlyphWidthEm: 0.56,
    lineHeightRatio: 1.32,
    minTrackingEm: -0.04,
    minMobileFontRatioOfCanvas: 0.015,
  },
  "fr-FR": {
    locale: "fr-FR",
    shortCode: "FR",
    labelKo: "프랑스어",
    scriptFamily: "latin",
    direction: "ltr",
    isRtl: false,
    supportsVerticalTypeset: false,
    charExpansionRatio: 2.55,
    areaExpansionRatio: 1.56,
    averageGlyphWidthEm: 0.55,
    lineHeightRatio: 1.35,
    minTrackingEm: -0.04,
    minMobileFontRatioOfCanvas: 0.015,
  },
  "es-ES": {
    locale: "es-ES",
    shortCode: "ES",
    labelKo: "스페인어",
    scriptFamily: "latin",
    direction: "ltr",
    isRtl: false,
    supportsVerticalTypeset: false,
    charExpansionRatio: 2.45,
    areaExpansionRatio: 1.48,
    averageGlyphWidthEm: 0.55,
    lineHeightRatio: 1.34,
    minTrackingEm: -0.04,
    minMobileFontRatioOfCanvas: 0.015,
  },
  "de-DE": {
    locale: "de-DE",
    shortCode: "DE",
    labelKo: "독일어",
    scriptFamily: "latin",
    direction: "ltr",
    isRtl: false,
    supportsVerticalTypeset: false,
    charExpansionRatio: 2.72,
    areaExpansionRatio: 1.74,
    averageGlyphWidthEm: 0.57,
    lineHeightRatio: 1.35,
    minTrackingEm: -0.04,
    minMobileFontRatioOfCanvas: 0.015,
  },
  "ar-SA": {
    locale: "ar-SA",
    shortCode: "AR",
    labelKo: "아랍어",
    scriptFamily: "arabic",
    direction: "rtl",
    isRtl: true,
    supportsVerticalTypeset: false,
    charExpansionRatio: 1.95,
    areaExpansionRatio: 1.4,
    averageGlyphWidthEm: 0.54,
    lineHeightRatio: 1.55,
    minTrackingEm: 0,
    minMobileFontRatioOfCanvas: 0.016,
  },
};

export const KINSOKU_LINE_START_FORBIDDEN = ".,!?:;)]}、。！？）」』】…・ー々";
export const KINSOKU_LINE_END_FORBIDDEN = "([{（「『【";

const NARROW_LATIN_CHARS = "ilIjtfr1.,:;!'|";
const WIDE_LATIN_CHARS = "mwMWGOQ@%&";

function isHangulCode(code: number): boolean {
  return (
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0x3131 && code <= 0x318e) ||
    (code >= 0x1100 && code <= 0x11ff)
  );
}

function isCjkOrKanaCode(code: number): boolean {
  return (
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

function isArabicCombiningMark(code: number): boolean {
  return (code >= 0x064b && code <= 0x065f) || code === 0x0670;
}

/** 개별 문자의 정규화 자폭(em)을 추정한다. */
export function estimateGlyphAdvanceEm(char: string, profile: LocaleTypographyProfile): number {
  if (char.length === 0) return 0;
  const code = char.charCodeAt(0);
  if (char === " " || char === "\t") {
    return profile.scriptFamily === "hangul" || profile.scriptFamily === "cjk-kana" ? 0.44 : 0.29;
  }
  if (isArabicCombiningMark(code)) return 0;
  if (code >= 0x0600 && code <= 0x06ff) return 0.54;
  if (isHangulCode(code)) return 0.96;
  if (isCjkOrKanaCode(code)) {
    return KINSOKU_LINE_START_FORBIDDEN.indexOf(char) >= 0 ||
      KINSOKU_LINE_END_FORBIDDEN.indexOf(char) >= 0
      ? 0.56
      : 0.98;
  }
  if (NARROW_LATIN_CHARS.indexOf(char) >= 0) return 0.34;
  if (WIDE_LATIN_CHARS.indexOf(char) >= 0) return 0.82;
  if (code >= 0x30 && code <= 0x39) return 0.58;
  if ((code >= 0x41 && code <= 0x5a) || (code >= 0xc0 && code <= 0xde)) return 0.68;
  if ((code >= 0x61 && code <= 0x7a) || (code >= 0xdf && code <= 0xff)) return 0.54;
  return profile.averageGlyphWidthEm;
}

export function measureTextWidthPx(
  text: string,
  fontSizePx: number,
  trackingEm: number,
  profile: LocaleTypographyProfile,
): number {
  if (text.length === 0) return 0;
  let totalEm = 0;
  let visibleCount = 0;
  for (let i = 0; i < text.length; i += 1) {
    const adv = estimateGlyphAdvanceEm(text.charAt(i), profile);
    if (adv === 0) continue;
    totalEm += adv;
    visibleCount += 1;
  }
  if (visibleCount > 1 && trackingEm !== 0) {
    totalEm = Math.max(visibleCount * 0.18, totalEm + (visibleCount - 1) * trackingEm);
  }
  return totalEm * fontSizePx;
}

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function encodeUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (cp <= 0x7f) {
      bytes.push(cp);
    } else if (cp <= 0x7ff) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp <= 0xffff) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function uint32ToHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** 외부 의존성 없는 순수 동기 ES2017 FIPS 180-4 SHA-256 해시. */
export function sha256LocalizationHex(input: string | Uint8Array): string {
  const raw = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const byteLength = raw.length;
  const paddedLength = Math.ceil((byteLength + 9) / 64) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(raw, 0);
  buffer[byteLength] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, Math.floor(byteLength / 0x20000000), false);
  view.setUint32(paddedLength - 4, (byteLength << 3) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0;
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return (
    uint32ToHex(h0) +
    uint32ToHex(h1) +
    uint32ToHex(h2) +
    uint32ToHex(h3) +
    uint32ToHex(h4) +
    uint32ToHex(h5) +
    uint32ToHex(h6) +
    uint32ToHex(h7)
  );
}

/** 객체 키를 사전순으로 정규화해 결정론적 JSON 문자열을 만든다. */
export function canonicalizeLocalizationJson(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    const num = value as number;
    if (!Number.isFinite(num)) return "null";
    return Object.is(num, -0) ? "0" : JSON.stringify(num);
  }
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((el) => (el === undefined ? "null" : canonicalizeLocalizationJson(el))).join(",")}]`;
  }
  if (t === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    const parts: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (rec[k] !== undefined) {
        parts.push(`${JSON.stringify(k)}:${canonicalizeLocalizationJson(rec[k])}`);
      }
    }
    return `{${parts.join(",")}}`;
  }
  return "null";
}
