/**
 * Studio Tategaki Tokenizer & Inline Ruby Parser (100% 클린룸 순수 모듈).
 *
 * 세로쓰기(Tategaki) 문자 회전 분류(괄호·장음부호 `ー`·말줄임표 `…` 90° 회전 플래그),
 * 세로중가로(`tate-chu-yoko`: 2자리 숫자 및 `!?`/`?!`/`!!`/`??` 조합) 분절,
 * 그리고 `東京《とうきょう》` 인라인 루비 마크업 파서를 담당한다.
 */

export type TategakiGlyphKind =
  | "upright"
  | "rotated-punctuation"
  | "rotated-latin"
  | "shifted"
  | "tate-chu-yoko";

export type TateChuYokoKind = "digits" | "punctuation-pair" | null;

export interface TategakiRubySpanInput {
  /** 원문 기준 UTF-16 시작 오프셋(inclusive). */
  readonly start: number;
  /** 원문 기준 UTF-16 끝 오프셋(exclusive). */
  readonly end: number;
  /** 베이스 문자 옆에 배치할 루비(후리가나) 문자열. */
  readonly ruby: string;
}

export interface TategakiToken {
  readonly kind: TategakiGlyphKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** 90° 시계방향 회전이 필요한 글리프(괄호·`ー`·`…`·긴 라틴 등)이면 `true`. */
  readonly rotate90: boolean;
  readonly rotationDeg: 0 | 90;
  /** 세로중가로(2자리 숫자·`!?` 조합 등) 셀이면 `true`. */
  readonly isTateChuYoko: boolean;
  readonly tateChuYokoKind: TateChuYokoKind;
  readonly offsetXEm: number;
  readonly offsetYEm: number;
}

const OPENING_BRACKETS = "([{（［｛｟〈《「『【〔〖〘〚“‘〝";
const CLOSING_BRACKETS = ")]}）］｝｠〉》」』】〕〗〙〛”’〞";
const ROTATED_STROKE_CHARS = "ー〜～‐‑‒–—―─－-_＿￣…‥∥＝=";
const SHIFTED_STOP_CHARS = "、。，．｡､";
const SMALL_KANA_CHARS = "ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ";

const ROTATED_BRACKET_SET = new Set([...OPENING_BRACKETS, ...CLOSING_BRACKETS]);
const ROTATED_STROKE_SET = new Set([...ROTATED_STROKE_CHARS]);
const SHIFTED_STOP_SET = new Set([...SHIFTED_STOP_CHARS]);
const SMALL_KANA_SET = new Set([...SMALL_KANA_CHARS]);
const UNICODE_BRACKET_RE = /^(?:\p{Ps}|\p{Pi}|\p{Pe}|\p{Pf})$/u;
const TCY_PUNCT_SET = new Set(["!", "?", "！", "？"]);
const ASCII_DIGIT_RE = /^[0-9]$/u;
const ASCII_LETTER_RE = /^[A-Za-z]$/u;

function isRotatedBracketOrQuote(char: string): boolean {
  return ROTATED_BRACKET_SET.has(char) || UNICODE_BRACKET_RE.test(char);
}

function isRotatedStrokeOrEllipsis(char: string): boolean {
  return ROTATED_STROKE_SET.has(char);
}

function isLatinOrScriptRotatedChar(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  if (TCY_PUNCT_SET.has(char) || isRotatedBracketOrQuote(char) || isRotatedStrokeOrEllipsis(char)) {
    return false;
  }
  if (code >= 0x21 && code <= 0x7e) return true;
  if (code >= 0x00c0 && code <= 0x024f) return true;
  if (code >= 0x0370 && code <= 0x04ff) return true;
  return false;
}

/**
 * 글자 하나가 세로쓰기에서 90° 시계방향 회전해야 하는지(괄호·장음부호 `ー`·말줄임표 `…` 등) 판정한다.
 */
export function shouldRotateInTategaki(char: string): boolean {
  if (!char) return false;
  if (SHIFTED_STOP_SET.has(char) || SMALL_KANA_SET.has(char)) return false;
  if (isRotatedBracketOrQuote(char) || isRotatedStrokeOrEllipsis(char)) return true;
  return isLatinOrScriptRotatedChar(char);
}

/**
 * `東京《とうきょう》` 또는 `｜강조《ルビ》` 형식의 인라인 마크업을 원문과 `rubySpans`로 분리한다.
 */
export function parseInlineRubyAnnotations(
  markup: string,
): { readonly text: string; readonly rubySpans: readonly TategakiRubySpanInput[] } {
  const source = typeof markup === "string" ? markup : "";
  const rubySpans: TategakiRubySpanInput[] = [];
  let plain = "";
  let cursor = 0;

  const pattern =
    /(?:[｜|]([^｜|《》\n]+)《([^《》\n]+)》)|([\p{Script=Han}\p{Script=Hangul}\p{Script=Katakana}]+)《([^《》\n]+)》/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > cursor) plain += source.slice(cursor, match.index);
    const base = match[1] ?? match[3] ?? "";
    const ruby = (match[2] ?? match[4] ?? "").trim();
    const start = plain.length;
    plain += base;
    const end = plain.length;
    if (base.length > 0 && ruby.length > 0) {
      rubySpans.push(Object.freeze({ start, end, ruby }));
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) plain += source.slice(cursor);

  return Object.freeze({ text: plain, rubySpans: Object.freeze(rubySpans) });
}

interface CodePointUnit {
  readonly char: string;
  readonly start: number;
  readonly end: number;
}

function toCodePointUnits(text: string, baseOffset: number): CodePointUnit[] {
  const units: CodePointUnit[] = [];
  let offset = baseOffset;
  for (const char of text) {
    const start = offset;
    offset += char.length;
    units.push({ char, start, end: offset });
  }
  return units;
}

/** UTF-16 코드포인트 경계 집합을 계산한다(서로게이트 페어 분할 방지용). */
export function codePointBoundarySet(text: string): ReadonlySet<number> {
  const set = new Set<number>([0]);
  let offset = 0;
  for (const char of text) {
    offset += char.length;
    set.add(offset);
  }
  return set;
}

/**
 * 한 문단을 세로쓰기 조판 토큰(`upright`, `shifted`, `rotated-punctuation`, `rotated-latin`,
 * `tate-chu-yoko`)으로 분해한다. 모든 토큰은 원문 UTF-16 오프셋 `[start, end)`를 보존한다.
 */
export function tokenizeTategakiParagraph(
  paragraph: string,
  baseOffset = 0,
  options?: {
    readonly tateChuYokoMaxDigits?: number;
    readonly enablePunctuationTateChuYoko?: boolean;
  },
): readonly TategakiToken[] {
  const maxDigits = Math.max(1, Math.min(4, Math.floor(options?.tateChuYokoMaxDigits ?? 2)));
  const enablePunctTcy = options?.enablePunctuationTateChuYoko !== false;
  const units = toCodePointUnits(paragraph, baseOffset);
  const tokens: TategakiToken[] = [];
  let i = 0;

  while (i < units.length) {
    const unit = units[i]!;
    const ch = unit.char;

    // 1) `!?` / `?!` / `!!` / `??` (전각 포함) 세로중가로 조합
    if (enablePunctTcy && TCY_PUNCT_SET.has(ch)) {
      let runEnd = i + 1;
      while (runEnd < units.length && TCY_PUNCT_SET.has(units[runEnd]!.char)) runEnd += 1;
      let cursor = i;
      while (runEnd - cursor >= 2) {
        const first = units[cursor]!;
        const second = units[cursor + 1]!;
        tokens.push(Object.freeze({
          kind: "tate-chu-yoko",
          text: `${first.char}${second.char}`,
          start: first.start,
          end: second.end,
          rotate90: false,
          rotationDeg: 0,
          isTateChuYoko: true,
          tateChuYokoKind: "punctuation-pair",
          offsetXEm: 0,
          offsetYEm: 0,
        }));
        cursor += 2;
      }
      if (cursor < runEnd) {
        const lone = units[cursor]!;
        tokens.push(Object.freeze({
          kind: "upright",
          text: lone.char,
          start: lone.start,
          end: lone.end,
          rotate90: false,
          rotationDeg: 0,
          isTateChuYoko: false,
          tateChuYokoKind: null,
          offsetXEm: 0,
          offsetYEm: 0,
        }));
      }
      i = runEnd;
      continue;
    }

    // 2) 독립 ASCII 숫자 런: 2..maxDigits자리 → 세로중가로, 1자리 → 직립, 초과 → 90° 회전
    if (ASCII_DIGIT_RE.test(ch)) {
      const prevChar = i > 0 ? units[i - 1]!.char : "";
      let digitEnd = i + 1;
      while (digitEnd < units.length && ASCII_DIGIT_RE.test(units[digitEnd]!.char)) digitEnd += 1;
      const nextChar = digitEnd < units.length ? units[digitEnd]!.char : "";
      const touchesAsciiLetter = ASCII_LETTER_RE.test(prevChar) || ASCII_LETTER_RE.test(nextChar);

      if (!touchesAsciiLetter) {
        const digitCount = digitEnd - i;
        const text = units.slice(i, digitEnd).map((u) => u.char).join("");
        const start = units[i]!.start;
        const end = units[digitEnd - 1]!.end;
        if (digitCount >= 2 && digitCount <= maxDigits) {
          tokens.push(Object.freeze({
            kind: "tate-chu-yoko",
            text,
            start,
            end,
            rotate90: false,
            rotationDeg: 0,
            isTateChuYoko: true,
            tateChuYokoKind: "digits",
            offsetXEm: 0,
            offsetYEm: 0,
          }));
        } else if (digitCount === 1) {
          tokens.push(Object.freeze({
            kind: "upright",
            text,
            start,
            end,
            rotate90: false,
            rotationDeg: 0,
            isTateChuYoko: false,
            tateChuYokoKind: null,
            offsetXEm: 0,
            offsetYEm: 0,
          }));
        } else {
          tokens.push(Object.freeze({
            kind: "rotated-latin",
            text,
            start,
            end,
            rotate90: true,
            rotationDeg: 90,
            isTateChuYoko: false,
            tateChuYokoKind: null,
            offsetXEm: 0,
            offsetYEm: 0,
          }));
        }
        i = digitEnd;
        continue;
      }
    }

    // 3) 우상단 광학 이동 직립 글리프(마침표·쉼표·작은 가나)
    if (SHIFTED_STOP_SET.has(ch) || SMALL_KANA_SET.has(ch)) {
      const isStop = SHIFTED_STOP_SET.has(ch);
      tokens.push(Object.freeze({
        kind: "shifted",
        text: ch,
        start: unit.start,
        end: unit.end,
        rotate90: false,
        rotationDeg: 0,
        isTateChuYoko: false,
        tateChuYokoKind: null,
        offsetXEm: isStop ? 0.5 : 0.08,
        offsetYEm: isStop ? -0.5 : -0.08,
      }));
      i += 1;
      continue;
    }

    // 4) 90° 회전 괄호·장음부호(`ー`)·말줄임표(`…`)·획 기호
    if (isRotatedBracketOrQuote(ch) || isRotatedStrokeOrEllipsis(ch)) {
      tokens.push(Object.freeze({
        kind: "rotated-punctuation",
        text: ch,
        start: unit.start,
        end: unit.end,
        rotate90: true,
        rotationDeg: 90,
        isTateChuYoko: false,
        tateChuYokoKind: null,
        offsetXEm: 0,
        offsetYEm: 0,
      }));
      i += 1;
      continue;
    }

    // 5) 라틴/그리스/키릴/영숫자 결합 런 → 90° 회전
    if (isLatinOrScriptRotatedChar(ch)) {
      let runEnd = i + 1;
      while (runEnd < units.length && isLatinOrScriptRotatedChar(units[runEnd]!.char)) runEnd += 1;
      const slice = units.slice(i, runEnd);
      tokens.push(Object.freeze({
        kind: "rotated-latin",
        text: slice.map((u) => u.char).join(""),
        start: slice[0]!.start,
        end: slice[slice.length - 1]!.end,
        rotate90: true,
        rotationDeg: 90,
        isTateChuYoko: false,
        tateChuYokoKind: null,
        offsetXEm: 0,
        offsetYEm: 0,
      }));
      i = runEnd;
      continue;
    }

    // 6) 기본 직립 글리프(한글·한자·가나·전각·이모지·공백)
    tokens.push(Object.freeze({
      kind: "upright",
      text: ch,
      start: unit.start,
      end: unit.end,
      rotate90: false,
      rotationDeg: 0,
      isTateChuYoko: false,
      tateChuYokoKind: null,
      offsetXEm: 0,
      offsetYEm: 0,
    }));
    i += 1;
  }

  return Object.freeze(tokens);
}

/** 열 최대 높이를 초과하는 긴 회전 라틴/숫자 런을 코드포인트 단위로 분할한다. */
export function splitLongRotatedToken(
  token: TategakiToken,
  maxColumnHeight: number,
  letterSpacing: number,
  measure: (slice: string) => number,
): TategakiToken[] {
  const units = toCodePointUnits(token.text, token.start);
  const pieces: TategakiToken[] = [];
  let startIdx = 0;

  while (startIdx < units.length) {
    let endIdx = startIdx + 1;
    let currentText = units[startIdx]!.char;
    while (endIdx < units.length) {
      const nextText = currentText + units[endIdx]!.char;
      if (measure(nextText) + letterSpacing > maxColumnHeight) break;
      currentText = nextText;
      endIdx += 1;
    }
    pieces.push(Object.freeze({
      ...token,
      text: currentText,
      start: units[startIdx]!.start,
      end: units[endIdx - 1]!.end,
    }));
    startIdx = endIdx;
  }
  return pieces;
}
