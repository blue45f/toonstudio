/**
 * Studio Typesetting Pro — 광학 폭 측정·문장부호 광학 커닝·한국어 조사/어미/고아줄 규칙 코어.
 *
 * Knuth-Plass 타원 말풍선 조판 엔진과 세로쓰기·루비 레이아웃 엔진이 공유하는
 * 순수·결정적 측정기, 약물 광학 커닝표, 행단 광학 돌출(Optical Margin), 한국어 언어 경계 판정 모듈.
 */

import {
  isKinsokuNoLineEnd,
  isKinsokuNoLineStart,
  segmentGraphemes,
} from "../lettering/studio-kinsoku-line-break";

export interface BalloonTextWidthMeasurer {
  measureWidth(text: string, fontPx: number, fontFamily: string, fontStyle: string): number;
}

export interface OpticalKerningAdjustment {
  /** 줄 내 자소 인덱스(왼쪽 자소 위치). */
  readonly index: number;
  readonly left: string;
  readonly right: string;
  /** em 단위 커닝량(음수 = 밀착). */
  readonly deltaEm: number;
  /** px 단위 커닝량. */
  readonly deltaPx: number;
}

/** 단독 어절로 줄 첫머리에 분리되면 부자연스러운 한국어 조사 집합. */
const KOREAN_BOUND_PARTICLES: ReadonlySet<string> = new Set([
  "은", "는", "이", "가", "을", "를", "의", "에", "에서", "에게", "한테", "께", "께서",
  "로", "으로", "와", "과", "랑", "이랑", "도", "만", "까지", "부터", "마저", "조차",
  "처럼", "같이", "보다", "마다", "밖에", "야", "이야", "이나", "나", "라도", "이라도",
  "든지", "이든지", "며", "이며", "하고", "뿐", "대로", "만큼",
]);

/** 단독 어절로 줄 첫머리에 떨어지면 안 되는 한국어 어미·보조 요소·의존명사. */
const KOREAN_BOUND_ENDINGS_AND_DEPENDENTS: ReadonlySet<string> = new Set([
  "요", "죠", "네", "네요", "군", "군요", "구나", "잖아", "잖아요", "거든", "거든요",
  "지만", "는데", "은데", "니까", "으니까", "어서", "아서", "해서", "다", "냐", "니",
  "라", "자", "어", "아", "지", "고", "면", "으면", "래", "대", "걸", "듯", "씩",
  "것", "거", "게", "건", "수", "때", "줄", "데", "바", "채", "척", "체", "쪽", "편",
  "쯤", "명", "개", "번", "살", "시", "분", "초", "원", "일", "월", "년",
]);

/** 다음 어절과 강하게 결합해 줄 끝에 홀로 남지 않아야 하는 한국어 관형사·부사·접두 요소. */
const KOREAN_BOUND_PREFIX_TOKENS: ReadonlySet<string> = new Set([
  "이", "그", "저", "한", "두", "세", "네", "몇", "어느", "무슨", "어떤",
  "못", "안", "덜", "더", "꼭", "참", "단", "약", "제일", "가장",
]);

const OPENING_CJK_BRACKETS = new Set(["「", "『", "（", "【", "〈", "《", "〔", "［", "｛"]);
const CLOSING_CJK_BRACKETS = new Set(["」", "』", "）", "】", "〉", "》", "〕", "］", "｝"]);
const OPENING_ASCII_BRACKETS = new Set(["(", "[", "{", "“", "‘"]);
const CLOSING_ASCII_BRACKETS = new Set([")", "]", "}", "”", "’"]);
const CJK_STOPS = new Set(["。", "、", "，", "．"]);
const ASCII_PUNCT = new Set([".", ",", "!", "?", ";", ":", "~", "…"]);
const EXCITEMENT_MARKS = new Set(["!", "?", "！", "？"]);

const LATIN_KERNING_PAIRS: Readonly<Record<string, number>> = Object.freeze({
  AV: -0.08, VA: -0.08, AW: -0.06, WA: -0.06, AT: -0.06, TA: -0.06,
  To: -0.07, Ta: -0.07, Te: -0.06, Tr: -0.06, Ty: -0.07,
  LT: -0.07, LV: -0.08, LW: -0.07, LY: -0.08,
  Yo: -0.07, Ye: -0.06, We: -0.05, Wo: -0.05, Pa: -0.05, Fa: -0.06,
});

const OPTICAL_LEFT_HANG_EM: Readonly<Record<string, number>> = Object.freeze({
  "「": 0.45, "『": 0.45, "（": 0.4, "【": 0.4, "〈": 0.4, "《": 0.42,
  "“": 0.42, "‘": 0.36, "\"": 0.34, "'": 0.3, "(": 0.28, "[": 0.26,
});

const OPTICAL_RIGHT_HANG_EM: Readonly<Record<string, number>> = Object.freeze({
  "」": 0.45, "』": 0.45, "）": 0.4, "】": 0.4, "〉": 0.4, "》": 0.42,
  "。": 0.5, "、": 0.5, ".": 0.46, ",": 0.46, "!": 0.3, "?": 0.26,
  "！": 0.32, "？": 0.28, "…": 0.3, "~": 0.28, "”": 0.42, "’": 0.36,
  "\"": 0.34, "'": 0.3, ")": 0.28, "]": 0.26,
});

function isWideCjkOrHangulCodePoint(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x11ff)
    || (code >= 0x3000 && code <= 0x30ff)
    || (code >= 0x3130 && code <= 0x318f)
    || (code >= 0x3400 && code <= 0x9fff)
    || (code >= 0xac00 && code <= 0xd7af)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xff01 && code <= 0xff60)
    || code >= 0x1f000
  );
}

function isNarrowAsciiGlyph(char: string): boolean {
  return /^[.,:;!'|ilI1`\s]$/u.test(char);
}

/** DOM 없이 결정적으로 동작하는 한글/CJK/라틴 기본 텍스트 폭 측정기. */
export function createDefaultBalloonTextMeasurer(): BalloonTextWidthMeasurer {
  return {
    measureWidth(text: string, fontPx: number): number {
      if (!text || !(fontPx > 0)) return 0;
      let width = 0;
      for (const grapheme of segmentGraphemes(text)) {
        if (grapheme === " ") {
          width += fontPx * 0.34;
        } else if (grapheme === "…" || grapheme === "—" || grapheme === "―") {
          width += fontPx * 0.96;
        } else {
          const cp = grapheme.codePointAt(0) ?? 0;
          if (isWideCjkOrHangulCodePoint(cp)) width += fontPx;
          else if (isNarrowAsciiGlyph(grapheme)) width += fontPx * 0.36;
          else width += fontPx * 0.58;
        }
      }
      return width;
    },
  };
}

export const DEFAULT_BALLOON_TEXT_MEASURER = createDefaultBalloonTextMeasurer();

function isHangulOrCjkGrapheme(grapheme: string): boolean {
  const cp = grapheme.codePointAt(0) ?? 0;
  return (
    (cp >= 0xac00 && cp <= 0xd7a3)
    || (cp >= 0x3040 && cp <= 0x30ff)
    || (cp >= 0x3400 && cp <= 0x9fff)
  );
}

function pairOpticalKerningEm(left: string, right: string): number {
  if (CLOSING_CJK_BRACKETS.has(left) && OPENING_CJK_BRACKETS.has(right)) return -0.45;
  if (CLOSING_CJK_BRACKETS.has(left) && CJK_STOPS.has(right)) return -0.42;
  if (CJK_STOPS.has(left) && OPENING_CJK_BRACKETS.has(right)) return -0.4;
  if (OPENING_CJK_BRACKETS.has(left) && OPENING_CJK_BRACKETS.has(right)) return -0.35;
  if (CLOSING_CJK_BRACKETS.has(left) && CLOSING_CJK_BRACKETS.has(right)) return -0.35;
  if (CLOSING_ASCII_BRACKETS.has(left) && (right === "." || right === ",")) return -0.32;
  if ((left === "." || left === ",") && OPENING_ASCII_BRACKETS.has(right)) return -0.28;
  if (EXCITEMENT_MARKS.has(left) && EXCITEMENT_MARKS.has(right)) return -0.16;
  if (left === "…" && EXCITEMENT_MARKS.has(right)) return -0.12;
  if (CJK_STOPS.has(left) && isHangulOrCjkGrapheme(right)) return -0.22;
  if (isHangulOrCjkGrapheme(left) && OPENING_CJK_BRACKETS.has(right)) return -0.22;
  if (isHangulOrCjkGrapheme(left) && ASCII_PUNCT.has(right)) return -0.08;
  if (isHangulOrCjkGrapheme(left) && CLOSING_ASCII_BRACKETS.has(right)) return -0.08;
  if (OPENING_ASCII_BRACKETS.has(left) && isHangulOrCjkGrapheme(right)) return -0.08;
  return LATIN_KERNING_PAIRS[`${left}${right}`] ?? 0;
}

/** 한 줄 문자열 내 인접 문장부호·약물·라틴 광학 커닝 쌍과 총 보정량(px)을 계산한다. */
export function computePunctuationOpticalKerning(
  lineText: string,
  fontSize: number,
): { readonly adjustments: readonly OpticalKerningAdjustment[]; readonly totalDeltaPx: number } {
  if (!lineText || !(fontSize > 0)) {
    return { adjustments: Object.freeze([]), totalDeltaPx: 0 };
  }
  const graphemes = segmentGraphemes(lineText);
  const adjustments: OpticalKerningAdjustment[] = [];
  let totalDeltaPx = 0;

  for (let i = 0; i < graphemes.length - 1; i += 1) {
    const left = graphemes[i]!;
    const right = graphemes[i + 1]!;
    const deltaEm = pairOpticalKerningEm(left, right);
    if (deltaEm !== 0) {
      const deltaPx = deltaEm * fontSize;
      totalDeltaPx += deltaPx;
      adjustments.push(Object.freeze({ index: i, left, right, deltaEm, deltaPx }));
    }
  }
  return { adjustments: Object.freeze(adjustments), totalDeltaPx };
}

/** 자간을 포함한 줄의 원시 렌더 폭(px)을 측정한다. */
export function measureLineRawWidth(
  lineText: string,
  fontSize: number,
  letterSpacing: number,
  fontFamily: string,
  fontStyle: string,
  measurer: BalloonTextWidthMeasurer,
): number {
  if (!lineText) return 0;
  const base = measurer.measureWidth(lineText, fontSize, fontFamily, fontStyle);
  if (!letterSpacing) return base;
  const count = segmentGraphemes(lineText).length;
  return count > 1 ? base + (count - 1) * letterSpacing : base;
}

/** 행두·행말 문장부호의 광학 여백 돌출량(px)을 계산한다. */
export function computeLineEdgeOpticalHang(
  lineText: string,
  fontSize: number,
  weight: number,
): { readonly leftHangPx: number; readonly rightHangPx: number } {
  const trimmed = lineText.trim();
  if (!trimmed || weight <= 0) return { leftHangPx: 0, rightHangPx: 0 };
  const graphemes = segmentGraphemes(trimmed);
  const first = graphemes[0] ?? "";
  const last = graphemes[graphemes.length - 1] ?? "";
  return {
    leftHangPx: (OPTICAL_LEFT_HANG_EM[first] ?? 0) * fontSize * weight,
    rightHangPx: (OPTICAL_RIGHT_HANG_EM[last] ?? 0) * fontSize * weight,
  };
}

function stripSurroundingPunctuation(token: string): string {
  return token.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
}

/** 문장부호·공백을 제외한 실질 음절/문자 개수를 반환한다. */
export function countCoreSyllables(text: string): number {
  const stripped = text.replace(/[\s\p{P}\p{S}]+/gu, "");
  return segmentGraphemes(stripped).length;
}

/** 토큰이 구두점·기호만으로 이루어져 있는지 판정한다. */
export function isPurePunctuationToken(token: string): boolean {
  return token.length > 0 && countCoreSyllables(token) === 0;
}

/** 어절이 줄 첫머리에 단독으로 분리되면 안 되는 한국어 조사·어미·의존명사·구두점인지 판정한다. */
export function isKoreanBoundLineStartToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;
  if (isPurePunctuationToken(trimmed)) return true;
  const graphemes = segmentGraphemes(trimmed);
  if (isKinsokuNoLineStart(graphemes[0])) return true;
  const core = stripSurroundingPunctuation(trimmed);
  if (!core) return true;
  return KOREAN_BOUND_PARTICLES.has(core) || KOREAN_BOUND_ENDINGS_AND_DEPENDENTS.has(core);
}

/** 어절이 줄 끝에 홀로 남기지 말아야 할 접두 요소(여는 괄호·관형사·통화 기호)인지 판정한다. */
export function isKoreanBoundLineEndToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;
  const graphemes = segmentGraphemes(trimmed);
  if (isKinsokuNoLineEnd(graphemes[graphemes.length - 1])) return true;
  const core = stripSurroundingPunctuation(trimmed);
  if (!core) return false;
  return KOREAN_BOUND_PREFIX_TOKENS.has(core);
}
