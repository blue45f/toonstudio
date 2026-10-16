/**
 * 독자 피드백 텍스트 정리 — 외부에서 온 닉네임·제목·의견을 화면과 파일에 안전하게 담는 순수 함수.
 *
 * 하는 일(전부 결정적·DOM 무관):
 * - 눈에 보이지 않거나 빈 칸처럼 보이는 문자(제어·방향 전환·제로폭·태그·한글 채움·점자 빈칸·짝 없는 서로게이트 …)를
 *   문자 목록이 아니라 유니코드 속성으로 지운다. 이모지를 잇는 제로폭 접합자(ZWJ)와 이모지 표시 선택자만 남긴다.
 * - 줄바꿈·탭은 공백 하나로 접어, 한 줄 문장으로 다룬다.
 * - 이메일·전화번호처럼 보이는 문자열을 가려 개인정보를 최소화한다(휴리스틱이며 완전한 탐지가 아니다).
 * - 길이를 코드 포인트 기준으로 자른다.
 * - 보이는 글자가 하나도 없으면 빈 값으로 본다(`hasVisibleText`). 빈 칸처럼 보이는 응답이 표본 수에 들어가지 않게 한다.
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

/** 줄 구분·탭처럼 공백으로 바꿔 읽는 문자(제어 문자 중 일부와 줄·문단 구분자). */
const SPACE_LIKE_PATTERN = /[\t\n\v\f\r\u0085\u2028\u2029]/gu;

/**
 * 지우는 문자의 집합(정규식 문자 클래스 안쪽). 목록이 아니라 속성으로 정해, 목록에서 빠진 문자가 남는 일을 막는다.
 * - Cc 제어, Cf 서식(방향 전환·제로폭·소프트 하이픈·태그 문자·주석 앵커 …), Cn 미할당·비문자, Co 사용자 지정, Cs 짝 없는 서로게이트.
 *   태그 문자(U+E0000 대)는 보이지 않는 글을 실어 나를 수 있고, 사용자 지정 영역은 어느 글꼴에서도 같은 모양이 아니다.
 *   (미할당은 이 실행 환경의 유니코드 버전 기준이다. 더 새 버전에서 배정된 글자는 지워질 수 있다.)
 * - Default_Ignorable_Code_Point: 한글 채움, 결합 문자 접합자, 크메르 고유 모음, 변형 선택자 …
 *   화면에 아무것도 그리지 않거나 글자 모양만 바꾸는 문자라, 빈 글처럼 보이는 의견·닉네임을 만들 수 있다.
 * - 속성으로는 잡히지 않지만 빈 칸처럼 그려지는 기호: 점자 빈칸(U+2800), 객체 대체 문자(U+FFFC).
 */
const INVISIBLE_CLASS = String.raw`\p{Cc}\p{Cf}\p{Cn}\p{Co}\p{Cs}\p{Default_Ignorable_Code_Point}\u2800\uFFFC`;

/** 이모지 한 칸: 그림 문자 + (표시 선택자) + (피부색). ZWJ 로 이어지는 이모지의 구성 단위다. */
const EMOJI_ELEMENT = String.raw`\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?`;

/**
 * 정리 정규식. 글을 왼쪽부터 훑으며 차례로 시도한다. 첫 번째 그룹에 잡힌 것은 남기고, 세 번째 갈래에 잡힌 것은 지운다.
 * 1) 뒤에 그림 문자가 이어지는 ZWJ(와 그 앞의 이모지 한 칸): 가족·직업·깃발 같은 이모지 연결이므로 남긴다.
 *    이모지 사이가 아닌 ZWJ, ZWNJ, 연달아 붙은 ZWJ 는 여기에 걸리지 않아 지워진다.
 * 2) 이모지 바로 뒤의 표시 선택자(VS15·VS16): 이모지 모양을 정하므로 남긴다. 홀로 있거나 겹치거나 다른 변형 선택자는 지운다
 *    (변형 선택자에 글을 실어 보내는 수법을 막는다).
 * 3) 그 밖의 보이지 않는 문자: 지운다.
 */
const SANITIZE_PATTERN = new RegExp(
  String.raw`(${EMOJI_ELEMENT}\u200D(?=\p{Extended_Pictographic})|\p{Emoji}[\uFE0E\uFE0F])|[${INVISIBLE_CLASS}]`,
  "gu",
);
const INVISIBLE_PATTERN = new RegExp(`[${INVISIBLE_CLASS}]`, "gu");
/** 보이는 글자: 문자·숫자·구두점·기호. 공백과 결합 문자만 있는 것은 보이는 글자가 아니다. */
const VISIBLE_CHARACTER = /[\p{L}\p{N}\p{P}\p{S}]/u;

/**
 * 제어·방향 전환·제로폭·태그·한글 채움 같은 보이지 않는 문자와 짝 없는 서로게이트를 지우고, 줄바꿈·탭은 공백으로 바꾼다.
 * 이모지를 잇는 ZWJ 와 이모지 표시 선택자는 남긴다.
 */
export function stripUnsafeCharacters(value: string): string {
  return value
    .replace(SPACE_LIKE_PATTERN, " ")
    .replace(SANITIZE_PATTERN, (match: string, keep: string | undefined) => (keep === undefined ? "" : match));
}

/**
 * 사람이 읽을 수 있게 그려지는 글자가 하나라도 있는지. 공백·보이지 않는 문자·결합 문자만 있으면 false.
 * 응답에 답한 것이 있는지 가릴 때 길이가 아니라 이것을 쓴다(빈 칸처럼 보이는 응답이 표본 수를 부풀리지 않게).
 */
export function hasVisibleText(value: string): boolean {
  return VISIBLE_CHARACTER.test(value.replace(INVISIBLE_PATTERN, ""));
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

/** 연속 공백을 하나로 접고 앞뒤 공백을 없앤다. */
function foldSpaces(value: string): string {
  return value.replace(/ {2,}/gu, " ").trim();
}

/**
 * 보이지 않는 문자 제거 → 공백 접기 → 연락처 가림 → 길이 제한. 결과는 앞뒤 공백이 없고, 보이는 글자가 없으면 빈 문자열이다.
 * 정리 순서가 곧 규칙이다: 보이지 않는 문자를 먼저 지워야 그 문자로 쪼갠 이메일·전화번호도 가려지고, 길이를 자른 뒤에
 * 한 번 더 지워야(이모지 연결 중간에서 끊긴 ZWJ) 이미 정리된 값을 다시 정리해도 같다.
 */
export function cleanFeedbackText(value: string, maxLength: number): string {
  const folded = foldSpaces(stripUnsafeCharacters(value).normalize("NFC"));
  const cleaned = foldSpaces(stripUnsafeCharacters(truncateCodePoints(maskContactInfo(folded), maxLength)));
  return hasVisibleText(cleaned) ? cleaned : "";
}

/** 닉네임은 연락처로 보이면 가리지 않고 통째로 비운다(신원 단서를 남기지 않는다). 보이는 글자가 없어도 비운다. */
export function cleanNickname(value: string, maxLength: number): string | null {
  const folded = foldSpaces(stripUnsafeCharacters(value).normalize("NFC"));
  if (!hasVisibleText(folded) || hasContactInfo(folded)) return null;
  const truncated = foldSpaces(stripUnsafeCharacters(truncateCodePoints(folded, maxLength)));
  return hasVisibleText(truncated) ? truncated : null;
}

/** 제목 비교·묶음 키에 쓰는 정규형(대소문자·전각·공백 차이를 무시). */
export function normalizeTitleKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}
