/**
 * 독자 피드백 텍스트 정리 — 외부에서 온 닉네임·제목·의견을 화면과 파일에 안전하게 담는 순수 함수.
 *
 * 하는 일(전부 결정적·DOM 무관):
 * - 제어 문자, 방향 전환(bidi) 문자, 제로폭 문자, 짝 없는 서로게이트를 제거한다.
 * - 줄바꿈·탭은 공백 하나로 접어, 한 줄 문장으로 다룬다.
 * - 이메일·전화번호처럼 보이는 문자열을 가려 개인정보를 최소화한다(휴리스틱이며 완전한 탐지가 아니다).
 * - 길이를 코드 포인트 기준으로 자른다.
 *
 * 하지 않는 일: HTML 이스케이프. 이 값은 React 텍스트 노드로만 그리고 HTML·속성·URL로 쓰지 않는다.
 */

/** 가림 처리된 자리에 대신 넣는 표시. */
export const CONTACT_MASK = "[연락처 가림]";

// 반복 횟수에 상한을 두어, 악의적으로 긴 입력에서 정규식 역추적이 커지지 않게 한다.
const EMAIL_PATTERN = /[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}.-]{1,190}\.\p{L}{2,24}/gu;
// 휴대전화(010 등)·지역번호 유선·+82 표기. 국내 표기는 맨 앞 0이 있어야 하므로 20261016 같은 날짜 숫자는 건드리지 않는다.
// 앞뒤가 숫자이면 더 긴 숫자열의 일부로 보고 가리지 않는다.
const PHONE_PATTERN = /(^|\D)((?:\+82[-\s.]?(?:10|1[16789]|2|[3-6]\d)|0(?:10|1[16789]|2|[3-6]\d))[-\s.]?\d{3,4}[-\s.]?\d{4})(?!\d)/gu;

/** 줄 구분·탭처럼 공백으로 바꿔 읽는 문자. */
function isSpaceLike(code: number): boolean {
  return code === 0x09 || code === 0x0a || code === 0x0b || code === 0x0c || code === 0x0d
    || code === 0x85 || code === 0x2028 || code === 0x2029;
}

/** 화면 표시를 속이거나 보이지 않는 문자. */
function isUnsafeCode(code: number): boolean {
  return code < 0x20
    || (code >= 0x7f && code <= 0x9f)
    || (code >= 0x200b && code <= 0x200f)
    || (code >= 0x202a && code <= 0x202e)
    || (code >= 0x2060 && code <= 0x2064)
    || (code >= 0x2066 && code <= 0x2069)
    || code === 0xfeff
    || (code >= 0xd800 && code <= 0xdfff);
}

/** 제어·bidi·제로폭 문자와 짝 없는 서로게이트를 지우고, 줄바꿈·탭은 공백으로 바꾼다. */
export function stripUnsafeCharacters(value: string): string {
  let output = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (isSpaceLike(code)) output += " ";
    else if (!isUnsafeCode(code)) output += character;
  }
  return output;
}

/** 이메일·전화번호처럼 보이는 부분을 가린다. */
export function maskContactInfo(value: string): string {
  return value
    .replace(EMAIL_PATTERN, CONTACT_MASK)
    .replace(PHONE_PATTERN, (_match: string, before: string) => `${before}${CONTACT_MASK}`);
}

/** 이메일·전화번호처럼 보이는 부분이 있는지. (전역 정규식의 lastIndex 상태를 쓰지 않는다.) */
export function hasContactInfo(value: string): boolean {
  return value.search(EMAIL_PATTERN) >= 0 || value.search(PHONE_PATTERN) >= 0;
}

function truncateCodePoints(value: string, maxLength: number): string {
  const characters = Array.from(value);
  return characters.length <= maxLength ? value : characters.slice(0, maxLength).join("");
}

/** 공백 접기 → 연락처 가림 → 길이 제한. 결과는 항상 앞뒤 공백이 없다. */
export function cleanFeedbackText(value: string, maxLength: number): string {
  const folded = stripUnsafeCharacters(value.normalize("NFC")).replace(/ {2,}/gu, " ").trim();
  return truncateCodePoints(maskContactInfo(folded), maxLength).trim();
}

/** 닉네임은 연락처로 보이면 가리지 않고 통째로 비운다(신원 단서를 남기지 않는다). */
export function cleanNickname(value: string, maxLength: number): string | null {
  const folded = stripUnsafeCharacters(value.normalize("NFC")).replace(/ {2,}/gu, " ").trim();
  if (!folded || hasContactInfo(folded)) return null;
  const truncated = truncateCodePoints(folded, maxLength).trim();
  return truncated || null;
}

/** 제목 비교·묶음 키에 쓰는 정규형(대소문자·전각·공백 차이를 무시). */
export function normalizeTitleKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}
