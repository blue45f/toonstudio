/**
 * 분기형 컷툰 글 도우미 — 식별자 규칙, 글자 수 세기, 안전하지 않은 문자 판정, 선택지 이름 비교 키.
 * 정규식에 제어 문자를 쓰지 않고 코드 포인트 범위로 판정한다.
 */
import { BRANCHING_CUTTOON_LIMITS } from "./branching-cuttoon-types";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

/** 식별자: 영문·숫자로 시작하고 영문·숫자·밑줄·붙임표만 쓰며 48자까지다. 비어 있으면 유효하지 않다. */
export function isValidBranchingId(value: string): boolean {
  return value.length >= 1 && value.length <= BRANCHING_CUTTOON_LIMITS.idLength && ID_PATTERN.test(value);
}

/** 코드 포인트 수. 이모지처럼 코드 단위 둘로 된 글자도 하나로 센다. */
export function countCodePoints(value: string): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    count += 1;
    // 위 서로게이트(U+D800~DBFF) 뒤에 아래 서로게이트가 이어지면 코드 포인트 하나다.
    const codePoint = value.codePointAt(index) ?? 0;
    if (codePoint > 0xffff) index += 1;
  }
  return count;
}

/** 줄바꿈·탭을 제외한 제어 문자, 줄/문단 구분자, 방향 제어, 보이지 않는 폭 0 문자, BOM. 이모지 결합용 ZWJ(U+200D)와 ZWNJ(U+200C)는 허용한다. */
function isUnsafeCodePoint(codePoint: number): boolean {
  if (codePoint <= 0x08) return true;
  if (codePoint === 0x0b || codePoint === 0x0c) return true;
  if (codePoint >= 0x0e && codePoint <= 0x1f) return true;
  if (codePoint >= 0x7f && codePoint <= 0x9f) return true;
  if (codePoint === 0x200b || codePoint === 0x200e || codePoint === 0x200f) return true;
  if (codePoint === 0x2028 || codePoint === 0x2029 || codePoint === 0x2060) return true;
  if (codePoint >= 0x202a && codePoint <= 0x202e) return true;
  if (codePoint >= 0x2066 && codePoint <= 0x2069) return true;
  return codePoint === 0xfeff;
}

/**
 * 읽거나 화면에 그리면 안 되는 문자가 들어 있는지. 한 줄 글(제목·라벨)은 줄바꿈·탭·CR 도 거절하고,
 * 여러 줄 글(컷 캡션)은 LF 한 가지 줄바꿈만 허용한다.
 */
export function hasUnsafeText(value: string, multiline: boolean): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (isUnsafeCodePoint(codePoint)) return true;
    if (codePoint === 0x09 || codePoint === 0x0d) return true;
    if (codePoint === 0x0a && !multiline) return true;
  }
  return false;
}

/** 이름이 겹치는지 비교하는 키: 호환 정규화, 연속 공백 하나로, 앞뒤 공백 제거, 소문자. */
export function choiceLabelKey(label: string): string {
  return label.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

/** 앞뒤 공백을 걷어 낸 뒤 비어 있는지. */
export function isBlankText(value: string): boolean {
  return value.trim().length === 0;
}

/** `prefix + 번호` 중 아직 쓰이지 않은 가장 작은 식별자. 48자 안에서 찾지 못하면 null. */
export function nextFreeId(prefix: string, used: ReadonlySet<string>): string | null {
  for (let sequence = 1; sequence <= used.size + 1; sequence += 1) {
    const candidate = `${prefix}${sequence}`;
    if (!used.has(candidate) && isValidBranchingId(candidate)) return candidate;
  }
  return null;
}
