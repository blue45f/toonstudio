/**
 * SVG 속성 값(`transform`·`fill`·`clip-path`)을 읽는 선형 시간 스캐너.
 *
 * 밖에서 받은 SVG 한 장의 속성 값은 원문 예산(2,000,000자) 안에서 얼마든지 길어질 수 있다. 같은 문자에 걸친 인접 수량자
 * (`\s*...\s*`)나 닫는 표지를 못 찾으면 문자열 끝까지 가는 부정 문자 클래스(`[^)]*`)를 시작 위치마다 다시 돌리면
 * 입력 길이의 제곱 시간이 든다(CodeQL js/polynomial-redos). 이 모듈의 함수들은 같은 판정을 입력을 한 번씩만 훑어 내린다.
 */

const WHITESPACE = /\s/u;
// 따옴표 없는 url() 대상과 따옴표 안 대상이 끝나는 글자: 따옴표 두 종류, 닫는 괄호, 공백.
const PAINT_TARGET_STOP = /["')\s]/u;

export interface TransformCall {
  /** 함수 이름이 시작하는 위치. */
  readonly index: number;
  /** 닫는 괄호 바로 다음 위치. */
  readonly end: number;
  readonly name: string;
  /** 여는 괄호와 닫는 괄호 사이 원문. */
  readonly args: string;
}

/**
 * `name(args)` 호출을 앞에서부터 돌려준다. `/([A-Za-z]+)\s*\(([^)]*)\)/g` 와 같은 판정이다.
 * - 이름은 영문자 덩어리 맨 앞에서만 시작한다. 덩어리 안쪽에서 시작해도 뒤따르는 `\s*(` 는 덩어리 끝에서만 이어질 수 있어
 *   맨 앞이 실패하면 안쪽 시작점도 모두 실패한다. 영문자 열 하나를 시작점마다 다시 읽는 일이 없다.
 * - 닫는 괄호는 호출마다 indexOf 로 한 번만 찾고 그 뒤에서 이어 읽는다. 뒤에 `)` 가 더 없으면 이후 호출은 모두 닫히지 못하므로
 *   바로 끝낸다. `translate(` 만 길게 반복돼도 시작점마다 문서 끝까지 읽지 않는다.
 */
export function scanTransformCalls(raw: string): TransformCall[] {
  const head = /(?<![A-Za-z])([A-Za-z]+)\s*\(/gu;
  const calls: TransformCall[] = [];
  for (let match = head.exec(raw); match; match = head.exec(raw)) {
    const argsStart = head.lastIndex;
    const close = raw.indexOf(")", argsStart);
    if (close < 0) break;
    calls.push({ index: match.index, end: close + 1, name: match[1] ?? "", args: raw.slice(argsStart, close) });
    head.lastIndex = close + 1;
  }
  return calls;
}

/** 정규식의 `.` 가 읽지 못하는 줄 끝 문자(LF·CR·LS·PS)가 있는지 본다. */
function hasLineTerminator(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x0a || code === 0x0d || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}

function skipWhitespace(text: string, from: number): number {
  let index = from;
  while (index < text.length && WHITESPACE.test(text[index] ?? "")) index += 1;
  return index;
}

export interface PaintUrlMatch {
  /** 바깥 따옴표를 뺀 `url()` 대상. */
  readonly target: string;
  /** 닫는 괄호 뒤 대체 색 원문(앞쪽 공백 제외). */
  readonly rest: string;
}

/**
 * `url(대상) 대체색` 모양을 읽는다. `/^url\(\s*(["']?)([^"')\s]*)\1\s*\)\s*(.*)$/` 와 같은 판정이다.
 * 그 식은 `url(` 뒤 공백을 앞 `\s*` 와 뒤 `\s*` 가 나눠 가질 수 있고, `)` 뒤 `\s*(.*)$` 도 줄 끝 문자가 끼면 공백 길이만큼
 * 다시 읽어 제곱 시간이 된다. 여기서는 앞에서부터 한 번만 훑는다.
 */
export function matchPaintUrl(value: string): PaintUrlMatch | null {
  if (!value.startsWith("url(")) return null;
  let cursor = skipWhitespace(value, 4);
  const opening = value[cursor];
  const quote = opening === '"' || opening === "'" ? opening : "";
  if (quote) cursor += 1;
  const targetStart = cursor;
  while (cursor < value.length && !PAINT_TARGET_STOP.test(value[cursor] ?? "")) cursor += 1;
  const target = value.slice(targetStart, cursor);
  if (quote) {
    if (value[cursor] !== quote) return null;
    cursor += 1;
  }
  cursor = skipWhitespace(value, cursor);
  if (value[cursor] !== ")") return null;
  const rest = value.slice(skipWhitespace(value, cursor + 1));
  // 원래 식의 `.` 는 줄 끝 문자를 읽지 못해 `$` 에 닿지 못하고 통째로 실패한다.
  return hasLineTerminator(rest) ? null : { target, rest };
}
