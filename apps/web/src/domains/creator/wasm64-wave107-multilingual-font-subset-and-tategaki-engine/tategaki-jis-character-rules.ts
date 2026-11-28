/**
 * Wave 107 — 일본어 세로쓰기(Tategaki) JIS X 4051 문자 규칙, 루비 파서, 종중횡 토크나이저.
 */

export interface TategakiExplicitRubySpan {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly reading: string;
}

export type TategakiKinsokuAction =
  | "none"
  | "hung-at-column-end"
  | "pushed-to-next-column"
  | "pushed-opening-bracket";

export interface ParsedTategakiSegment {
  readonly baseText: string;
  readonly rubyReading: string | null;
  readonly rubyGroupId: string | null;
}

export interface AtomicVerticalToken {
  readonly text: string;
  readonly isLineBreak: boolean;
  readonly isTateChuYoko: boolean;
  readonly verticalRotated: boolean;
  readonly rotationDeg: 0 | 90;
  readonly opticalOffsetX: number;
  readonly opticalOffsetY: number;
  readonly punctuationOpticalShifted: boolean;
  readonly isGyotoKinsoku: boolean;
  readonly isHangablePunctuation: boolean;
  readonly isGyomatsuKinsoku: boolean;
  readonly rubyGroupId: string | null;
  readonly rubyReading: string | null;
  readonly kinsokuAction: TategakiKinsokuAction;
}

export const VERTICAL_ROTATED_GLYPH_SET: ReadonlySet<string> = new Set([
  "ー", "ｰ", "「", "」", "『", "』", "（", "）", "(", ")",
  "【", "】", "〈", "〉", "《", "》", "〔", "〕",
  "…", "‥", "—", "―", "〜", "～", "–", "−", "：", "；", "＝",
]);

const OPENING_VERTICAL_BRACKET_SET: ReadonlySet<string> = new Set([
  "「", "『", "（", "(", "【", "〈", "《", "〔",
]);

const CLOSING_VERTICAL_BRACKET_SET: ReadonlySet<string> = new Set([
  "」", "』", "）", ")", "】", "〉", "》", "〕",
]);

const UPPER_RIGHT_PUNCTUATION_SET: ReadonlySet<string> = new Set(["、", "。"]);

const SMALL_KANA_SET: ReadonlySet<string> = new Set([
  "っ", "ッ", "ゃ", "ゅ", "ょ", "ャ", "ュ", "ョ",
  "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "ァ", "ィ", "ゥ", "ェ", "ォ",
]);

/** 행두 금칙 문자 (새 열의 첫머리에 올 수 없는 문자). */
export const GYOTO_KINSOKU_CHAR_SET: ReadonlySet<string> = new Set([
  "、", "。", ",", ".", "」", "』", "）", ")", "】", "〉", "》", "〕",
  "！", "？", "!", "?", "ー", "ｰ", "…", "‥", "〜", "～",
  "っ", "ッ", "ゃ", "ゅ", "ょ", "ャ", "ュ", "ョ",
  "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "ァ", "ィ", "ゥ", "ェ", "ォ", "・", "：", "；",
]);

/** 매달기(ぶら下げ)를 우선 허용하는 문장부호 집합. */
const HANGABLE_PUNCTUATION_SET: ReadonlySet<string> = new Set([
  "、", "。", ",", ".", "」", "』", "）", ")", "】", "〉", "》", "〕",
  "！", "？", "!", "?", "!?", "?!", "!!", "??", "！？", "？！", "！！", "？？",
]);

/** 행말 금칙 문자 (열 맨 끝에 혼자 남으면 안 되는 여는 괄호). */
export const GYOMATSU_KINSOKU_CHAR_SET: ReadonlySet<string> = OPENING_VERTICAL_BRACKET_SET;

export const TATE_CHU_YOKO_PUNCTUATION_SET: ReadonlySet<string> = new Set([
  "!?", "?!", "!!", "??", "！？", "？！", "！！", "？？",
]);

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function isAsciiDigit(ch: string): boolean {
  if (ch.length !== 1) return false;
  const code = ch.charCodeAt(0);
  return code >= 0x30 && code <= 0x39;
}

export function splitUnicodeChars(text: string): string[] {
  const chars: string[] = [];
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i);
    if (cp === undefined) break;
    const len = cp > 0xffff ? 2 : 1;
    chars.push(text.slice(i, i + len));
    i += len;
  }
  return chars;
}

/** `{漢字|かんじ}` 인라인 루비 및 명시적 스팬을 세그먼트 열로 파싱한다. */
export function parseTategakiRubySegments(
  text: string,
  explicitSpans?: readonly TategakiExplicitRubySpan[],
): ParsedTategakiSegment[] {
  if (explicitSpans !== undefined && explicitSpans.length > 0 && !text.includes("{")) {
    const sortedSpans = explicitSpans
      .filter((s) => s.startIndex >= 0 && s.endIndex > s.startIndex && s.endIndex <= text.length && s.reading.length > 0)
      .slice()
      .sort((a, b) => a.startIndex - b.startIndex);
    const segments: ParsedTategakiSegment[] = [];
    let cursor = 0;
    let rubySeq = 1;
    for (let i = 0; i < sortedSpans.length; i += 1) {
      const span = sortedSpans[i];
      if (span.startIndex < cursor) continue;
      if (span.startIndex > cursor) {
        segments.push({ baseText: text.slice(cursor, span.startIndex), rubyReading: null, rubyGroupId: null });
      }
      segments.push({
        baseText: text.slice(span.startIndex, span.endIndex),
        rubyReading: span.reading,
        rubyGroupId: `ruby-${rubySeq}`,
      });
      rubySeq += 1;
      cursor = span.endIndex;
    }
    if (cursor < text.length) {
      segments.push({ baseText: text.slice(cursor), rubyReading: null, rubyGroupId: null });
    }
    return segments;
  }

  const segments: ParsedTategakiSegment[] = [];
  let rubySeq = 1;
  let plainBuffer = "";
  let i = 0;

  while (i < text.length) {
    if (text[i] === "{") {
      const barIdx = text.indexOf("|", i + 1);
      const closeIdx = barIdx > i ? text.indexOf("}", barIdx + 1) : -1;
      if (barIdx > i + 1 && closeIdx > barIdx + 1) {
        const base = text.slice(i + 1, barIdx);
        const reading = text.slice(barIdx + 1, closeIdx);
        if (!base.includes("{") && !base.includes("}") && !base.includes("\n")) {
          if (plainBuffer.length > 0) {
            segments.push({ baseText: plainBuffer, rubyReading: null, rubyGroupId: null });
            plainBuffer = "";
          }
          segments.push({ baseText: base, rubyReading: reading, rubyGroupId: `ruby-${rubySeq}` });
          rubySeq += 1;
          i = closeIdx + 1;
          continue;
        }
      }
    }
    plainBuffer += text[i];
    i += 1;
  }
  if (plainBuffer.length > 0) {
    segments.push({ baseText: plainBuffer, rubyReading: null, rubyGroupId: null });
  }
  return segments;
}

function createGlyphToken(
  text: string,
  fontSizePx: number,
  isTateChuYoko: boolean,
  rubyGroupId: string | null,
  rubyReading: string | null,
): AtomicVerticalToken {
  if (text === "\n") {
    return {
      text: "\n",
      isLineBreak: true,
      isTateChuYoko: false,
      verticalRotated: false,
      rotationDeg: 0,
      opticalOffsetX: 0,
      opticalOffsetY: 0,
      punctuationOpticalShifted: false,
      isGyotoKinsoku: false,
      isHangablePunctuation: false,
      isGyomatsuKinsoku: false,
      rubyGroupId: null,
      rubyReading: null,
      kinsokuAction: "none",
    };
  }

  const verticalRotated = !isTateChuYoko && VERTICAL_ROTATED_GLYPH_SET.has(text);
  const rotationDeg: 0 | 90 = verticalRotated ? 90 : 0;
  let opticalOffsetX = 0;
  let opticalOffsetY = 0;
  let punctuationOpticalShifted = false;

  if (verticalRotated) {
    if (OPENING_VERTICAL_BRACKET_SET.has(text)) {
      opticalOffsetX = round2(fontSizePx * 0.04);
      opticalOffsetY = round2(fontSizePx * 0.08);
    } else if (CLOSING_VERTICAL_BRACKET_SET.has(text)) {
      opticalOffsetX = round2(-fontSizePx * 0.04);
      opticalOffsetY = round2(-fontSizePx * 0.08);
    } else {
      opticalOffsetX = 0;
      opticalOffsetY = round2(fontSizePx * 0.02);
    }
  } else if (!isTateChuYoko && UPPER_RIGHT_PUNCTUATION_SET.has(text)) {
    opticalOffsetX = round2(fontSizePx * 0.28);
    opticalOffsetY = round2(-fontSizePx * 0.28);
    punctuationOpticalShifted = true;
  } else if (!isTateChuYoko && SMALL_KANA_SET.has(text)) {
    opticalOffsetX = round2(fontSizePx * 0.08);
    opticalOffsetY = round2(-fontSizePx * 0.08);
  }

  return {
    text,
    isLineBreak: false,
    isTateChuYoko,
    verticalRotated,
    rotationDeg,
    opticalOffsetX,
    opticalOffsetY,
    punctuationOpticalShifted,
    isGyotoKinsoku: GYOTO_KINSOKU_CHAR_SET.has(text) || TATE_CHU_YOKO_PUNCTUATION_SET.has(text),
    isHangablePunctuation: HANGABLE_PUNCTUATION_SET.has(text),
    isGyomatsuKinsoku: !isTateChuYoko && GYOMATSU_KINSOKU_CHAR_SET.has(text),
    rubyGroupId,
    rubyReading,
    kinsokuAction: "none",
  };
}

/** 세그먼트를 종중횡(2자리 숫자·감탄부호 쌍)과 개별 세로 글리프 토큰으로 분해한다. */
export function tokenizeSegmentsForVertical(
  segments: readonly ParsedTategakiSegment[],
  fontSizePx: number,
): AtomicVerticalToken[] {
  const tokens: AtomicVerticalToken[] = [];

  for (let s = 0; s < segments.length; s += 1) {
    const seg = segments[s];
    const chars = splitUnicodeChars(seg.baseText);
    let i = 0;
    while (i < chars.length) {
      const ch = chars[i];
      if (ch === "\r") {
        i += 1;
        continue;
      }
      if (ch === "\n") {
        tokens.push(createGlyphToken("\n", fontSizePx, false, null, null));
        i += 1;
        continue;
      }

      if (seg.rubyGroupId === null) {
        if (isAsciiDigit(ch)) {
          let digitRunEnd = i + 1;
          while (digitRunEnd < chars.length && isAsciiDigit(chars[digitRunEnd])) {
            digitRunEnd += 1;
          }
          if (digitRunEnd - i === 2) {
            tokens.push(createGlyphToken(`${chars[i]}${chars[i + 1]}`, fontSizePx, true, null, null));
            i += 2;
            continue;
          }
          for (let d = i; d < digitRunEnd; d += 1) {
            tokens.push(createGlyphToken(chars[d], fontSizePx, false, null, null));
          }
          i = digitRunEnd;
          continue;
        }

        if (i + 1 < chars.length) {
          const pair = `${ch}${chars[i + 1]}`;
          if (TATE_CHU_YOKO_PUNCTUATION_SET.has(pair)) {
            tokens.push(createGlyphToken(pair, fontSizePx, true, null, null));
            i += 2;
            continue;
          }
        }
      }

      tokens.push(createGlyphToken(ch, fontSizePx, false, seg.rubyGroupId, seg.rubyReading));
      i += 1;
    }
  }

  return tokens;
}
