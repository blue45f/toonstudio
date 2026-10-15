/**
 * 내 이야기 답변을 다루는 순수 텍스트 도우미.
 *
 * 모두 결정적이며 사용자가 쓴 글자를 바꾸지 않는 방향으로만 동작한다.
 * - 정리(clean): 제어 문자를 버리고 공백을 접을 뿐 단어를 고치지 않는다.
 * - 나레이션 분할: 문장 경계(없으면 띄어쓰기)에서 나눌 뿐 말줄임표나 새 단어를 넣지 않는다.
 * - 대사 추출: 사용자가 따옴표로 직접 묶은 말만 말풍선 후보로 올린다. 대사를 지어내지 않는다.
 * - 개인정보 힌트: 연락처·주민번호·계좌처럼 보이는 숫자열을 "알려 주기만" 한다. 막거나 지우지 않는다.
 */

import { MY_STORY_ANSWER_MAX_LENGTH } from "./my-story-model";

function stripControlCharacters(value: string): string {
  let out = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    // 탭·줄바꿈은 아래에서 공백으로 접히므로 남기고, 나머지 제어 문자는 버린다.
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) continue;
    out += character;
  }
  return out;
}

/** 코드 포인트 기준으로 자른다 — 이모지 같은 서로게이트 쌍이 반쪽으로 잘리지 않게 한다. */
export function clampMyStoryText(value: string, maxLength: number): string {
  const characters = Array.from(value);
  return characters.length <= maxLength ? value : characters.slice(0, maxLength).join("");
}

/** 제어 문자 제거 + 연속 공백(줄바꿈 포함) 접기 + 앞뒤 공백 제거 + 길이 제한. */
export function cleanMyStoryAnswer(
  value: string,
  maxLength: number = MY_STORY_ANSWER_MAX_LENGTH,
): string {
  return clampMyStoryText(stripControlCharacters(value).replace(/\s+/gu, " ").trim(), maxLength);
}

// 문장 하나 = 종결 부호 앞까지의 글 + 종결 부호 + 뒤따르는 닫는 따옴표·괄호.
const SENTENCE_PATTERN = /[^.!?。！？]+[.!?。！？]*[”"’'」』)\]]*/gu;

function splitSentences(text: string): string[] {
  const matched = text.match(SENTENCE_PATTERN);
  return (matched ?? [text]).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}

/** 한 문장이 상자 한 칸보다 길 때 띄어쓰기에서, 띄어쓰기가 없으면 글자 수에서 나눈다. */
function splitLongSentence(sentence: string, maxChars: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const word of sentence.split(" ")) {
    const wordLength = Array.from(word).length;
    if (wordLength > maxChars) {
      if (current) {
        parts.push(current);
        current = "";
      }
      const characters = Array.from(word);
      for (let start = 0; start < characters.length; start += maxChars) {
        parts.push(characters.slice(start, start + maxChars).join(""));
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (Array.from(candidate).length <= maxChars) {
      current = candidate;
    } else {
      if (current) parts.push(current);
      current = word;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * 답변을 나레이션 상자 한 칸(maxChars자 이내)씩 나눈다. 첫 항목이 기본 후보이고 나머지는
 * 이어서 쓸 후보다. 내용은 그대로이며 앞뒤 공백만 정리한다. 빈 답변이면 빈 배열.
 */
export function splitMyStoryNarration(text: string, maxChars: number): string[] {
  const cleaned = cleanMyStoryAnswer(text);
  if (!cleaned) return [];
  const limit = Math.max(1, Math.floor(maxChars));
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };
  for (const sentence of splitSentences(cleaned)) {
    if (Array.from(sentence).length > limit) {
      flush();
      chunks.push(...splitLongSentence(sentence, limit));
      continue;
    }
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (Array.from(candidate).length <= limit) {
      current = candidate;
    } else {
      flush();
      current = sentence;
    }
  }
  flush();
  return chunks;
}

// “…” "…" 「…」 『…』 ‘…’ — 사용자가 직접 따옴표로 묶은 말만 대사로 본다.
const QUOTE_PATTERN = /“([^”]{1,120})”|"([^"]{1,120})"|「([^」]{1,120})」|『([^』]{1,120})』|‘([^’]{1,120})’/gu;

/** 따옴표로 묶인 말을 나온 순서대로 돌려준다. 따옴표가 없으면 빈 배열(대사를 만들지 않는다). */
export function extractMyStoryQuotes(text: string): string[] {
  const quotes: string[] = [];
  for (const match of text.matchAll(QUOTE_PATTERN)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? "").trim();
    if (value) quotes.push(value);
  }
  return quotes;
}

export type MyStorySensitiveKind = "phone" | "email" | "resident-id" | "account";

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u;
const RESIDENT_ID_PATTERN = /(?<!\d)\d{6}[-\s]?[1-8]\d{6}(?!\d)/gu;
const PHONE_PATTERN = /(?<!\d)(?:0\d{1,2}|\+82[-\s]?\d{1,2})[-\s.]?\d{3,4}[-\s.]?\d{4}(?!\d)/gu;
const ACCOUNT_PATTERN = /(?<!\d)\d{2,6}(?:[-\s]\d{2,8}){2,4}(?!\d)/gu;

function digitCount(value: string): number {
  return value.replace(/\D/gu, "").length;
}

/**
 * 연락처·주민등록번호·계좌처럼 보이는 숫자열과 이메일을 찾는다. 날짜(1998-05-12)나 연도 같은
 * 흔한 숫자는 잡지 않도록 자릿수와 형태를 함께 본다. 결과는 안내용이며 입력을 막지 않는다.
 */
export function detectMyStorySensitiveKinds(text: string): MyStorySensitiveKind[] {
  // search()는 전역 정규식의 lastIndex를 건드리지 않는다 — 모듈 수준 정규식을 안전하게 재사용한다.
  const hit = (pattern: RegExp, value: string): boolean => value.search(pattern) !== -1;
  const kinds: MyStorySensitiveKind[] = [];
  let rest = text;
  if (hit(EMAIL_PATTERN, rest)) kinds.push("email");
  rest = rest.replace(EMAIL_PATTERN, " ");
  if (hit(RESIDENT_ID_PATTERN, rest)) kinds.push("resident-id");
  rest = rest.replace(RESIDENT_ID_PATTERN, " ");
  if (hit(PHONE_PATTERN, rest)) kinds.push("phone");
  rest = rest.replace(PHONE_PATTERN, " ");
  const accountLike = rest.match(ACCOUNT_PATTERN)?.some((candidate) => digitCount(candidate) >= 10) ?? false;
  if (accountLike) kinds.push("account");
  return kinds;
}

/** 여러 칸의 답변에서 나온 힌트를 합쳐 중복 없이 안정된 순서로 돌려준다. */
export function mergeMyStorySensitiveKinds(
  groups: readonly (readonly MyStorySensitiveKind[])[],
): MyStorySensitiveKind[] {
  const order: readonly MyStorySensitiveKind[] = ["phone", "resident-id", "account", "email"];
  const found = new Set(groups.flat());
  return order.filter((kind) => found.has(kind));
}
