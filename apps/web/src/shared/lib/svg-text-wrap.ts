/**
 * SVG `<text>` 한글·영문 혼합 라벨 폭 추정 및 멀티라인 `<tspan>` 줄바꿈 유틸리티.
 *
 * 고정 `viewBox` 안에서 한글·영문 라벨이 노드 상자나 SVG 경계를 넘쳐
 * 잘리거나 인접 텍스트와 겹치는 현상을 방지한다.
 */

const CJK_FULLWIDTH_RE = /[\u1100-\u11FF\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/u;
const WIDE_LATIN_RE = /[A-ZMW%@#&]/u;
const NARROW_CHAR_RE = /[\s.,:;!'|·/\\()[\]-]/u;

/** 문자별 em 단위 폭 가중치. */
export function svgCharUnit(char: string): number {
  if (CJK_FULLWIDTH_RE.test(char)) return 1.0;
  if (NARROW_CHAR_RE.test(char)) return 0.36;
  if (WIDE_LATIN_RE.test(char)) return 0.7;
  return 0.58;
}

/** 주어진 `fontSize`에서 문자열의 예상 렌더 폭(SVG user unit)을 계산한다. */
export function estimateSvgTextWidth(text: string, fontSize: number, bold = false): number {
  let units = 0;
  for (const char of text) {
    units += svgCharUnit(char);
  }
  return units * fontSize * (bold ? 1.06 : 1.0);
}

export interface WrapSvgTextOptions {
  readonly maxWidth: number;
  readonly fontSize: number;
  readonly maxLines?: number;
  readonly bold?: boolean;
}

function splitLongToken(token: string, maxWidth: number, fontSize: number, bold: boolean): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const char of token) {
    const candidate = `${current}${char}`;
    if (current.length > 0 && estimateSvgTextWidth(candidate, fontSize, bold) > maxWidth) {
      pieces.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

function truncateToFit(line: string, maxWidth: number, fontSize: number, bold: boolean): string {
  const ellipsis = "…";
  const ellipsisWidth = estimateSvgTextWidth(ellipsis, fontSize, bold);
  if (estimateSvgTextWidth(line, fontSize, bold) <= maxWidth) return line;
  let result = "";
  for (const char of line) {
    const next = `${result}${char}`;
    if (estimateSvgTextWidth(next, fontSize, bold) + ellipsisWidth > maxWidth) break;
    result = next;
  }
  return `${result.trimEnd()}${ellipsis}`;
}

/**
 * 한글 어절과 영문 단어·구두점 경계를 존중해 `maxWidth` 이내의 줄 배열로 분할한다.
 * 최대 줄 수(`maxLines`)를 넘으면 마지막 줄을 폭에 맞게 말줄임(`…`) 처리한다.
 */
export function wrapSvgText(text: string, options: WrapSvgTextOptions): readonly string[] {
  const trimmed = text.trim().replace(/\s+/gu, " ");
  if (!trimmed) return [];
  const { maxWidth, fontSize, maxLines = 2, bold = false } = options;
  if (maxWidth <= fontSize) return [trimmed];
  if (estimateSvgTextWidth(trimmed, fontSize, bold) <= maxWidth) return [trimmed];

  // 공백과 중점(·)/슬래시/하이픈 뒤에서 우선 분할할 수 있도록 토큰화한다.
  const rawTokens = trimmed
    .split(/(?<=\s|·|\/|-)/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const tokens: string[] = [];
  for (const token of rawTokens) {
    if (estimateSvgTextWidth(token, fontSize, bold) > maxWidth) {
      tokens.push(...splitLongToken(token, maxWidth, fontSize, bold));
    } else {
      tokens.push(token);
    }
  }

  const lines: string[] = [];
  let current = "";
  for (const token of tokens) {
    const joiner = current.length === 0 || /[/-]$/u.test(current) ? "" : " ";
    const candidate = `${current}${joiner}${token}`;
    if (current.length > 0 && estimateSvgTextWidth(candidate, fontSize, bold) > maxWidth) {
      lines.push(current);
      current = token;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines - 1);
  const overflowTail = lines.slice(maxLines - 1).join(" ");
  kept.push(truncateToFit(overflowTail, maxWidth, fontSize, bold));
  return kept;
}

/** 텍스트 길이에 맞춰 배지/필 `<rect>` 폭을 안전하게 계산한다. */
export function fitSvgPillWidth(
  text: string,
  fontSize: number,
  padX: number,
  minWidth: number,
  maxWidth: number,
  bold = true,
): number {
  const estimated = Math.ceil(estimateSvgTextWidth(text, fontSize, bold) + padX * 2);
  return Math.max(minWidth, Math.min(maxWidth, estimated));
}
