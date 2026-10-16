/**
 * Studio Translation Term Match — 번역문에 용어가 들어 있는지 보는 단어 경계 인식 부분 문자열 판정.
 *
 * 용어집 엔진(`studio-translation-glossary`)의 대조는 경계 없는 `includes` 라 영문 "art" 가 "heart" 에 걸린다.
 * 인물 카드의 호칭·고정어·금지어는 짧은 라틴 표기("Sun", "Sir")가 많아 같은 오탐이 곧 거짓 경고가 된다.
 * 그래서 카드 계층은 이 함수를 쓴다.
 *
 *  · 정규화: NFKC(전각 → 반각 포함) + 소문자 + 하이픈·대시를 공백으로 + 공백 접기
 *    ("Demon-King" 과 "Demon King" 은 같은 말이다). 대시를 공백으로 바꾸면 사라지는 대시뿐인 용어("—"·"-")만
 *    예외로, 대시를 그대로 둔 표기끼리 비교한다.
 *  · 라틴·키릴·그리스 문자와 숫자는 띄어쓰기로 단어가 갈린다 — 용어의 양끝이 그런 문자이고 이웃한 글자도
 *    그런 문자면 같은 단어의 일부라 일치로 보지 않는다("Sun" 은 "Sunbae" 에 걸리지 않고, "Sun-bae" 에는 걸린다).
 *  · 영어 굴절은 같은 말로 본다 — 라틴 문자로 끝나는 3글자 이상 용어 뒤에 복수형·소유형(-s, -es, 's, s')이 바로
 *    붙으면 일치다("Demon King" ↔ "Demon Kings"). 3글자 미만은 "us" ↔ "uses" 같은 다른 단어와 겹쳐 제외한다.
 *  · 한글·가나·한자·태국어는 띄어쓰기가 단어를 가르지 않거나 조사가 붙으므로 경계 없이 본다("선배를", "先輩が").
 *    그 대신 짧은 표기가 다른 단어 속에서도 일치한다("야" ↔ "시야").
 *  · 형태소 분석은 하지 않는다 — 한국어 어간 변화는 잡지 못한다. 호출부는 이 한계를 숨기지 않는다.
 *
 * 순수·결정적. 반환은 불리언뿐이라 입력 변형 가능성이 없다.
 */

/** 띄어쓰기로 단어가 갈리는 문자(라틴·키릴·그리스·숫자). 이 문자끼리는 이웃하면 같은 단어다. */
const SPACED_WORD_CHARACTER = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{N}]/u;
const LATIN_LETTER = /\p{Script=Latin}/u;
/** 용어 바로 뒤에 붙는 영어 복수형·소유형 — 그 뒤가 단어 문자가 아니어야 한다. */
const ENGLISH_INFLECTION_SUFFIX =
  /^(?:e?s|['’]s|s['’])(?![\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{N}])/u;
const INFLECTION_MIN_LETTERS = 3;

function normalizeBasic(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

function normalizeForMatch(value: string): string {
  return normalizeBasic(value).replace(/\p{Pd}+/gu, " ").replace(/\s+/gu, " ").trim();
}

/** `text` 가 `term` 을 단어로 포함하는가. 빈 용어는 항상 false 다(빈 문자열이 모든 곳에 "포함"되는 오탐 방지). */
export function studioTranslationTextContains(text: string, term: string): boolean {
  const haystack = normalizeForMatch(text);
  const needle = normalizeForMatch(term);
  if (needle === "") {
    // 대시뿐인 용어("—"·"〜")는 대시를 공백으로 바꾸면 사라진다 — 이때만 대시를 그대로 둔 표기로 비교한다.
    const dashes = normalizeBasic(term);
    return dashes !== "" && normalizeBasic(text).includes(dashes);
  }
  const characters = Array.from(needle);
  const needsLeftBoundary = SPACED_WORD_CHARACTER.test(characters[0] ?? "");
  const needsRightBoundary = SPACED_WORD_CHARACTER.test(characters[characters.length - 1] ?? "");
  const allowsInflection =
    characters.length >= INFLECTION_MIN_LETTERS && LATIN_LETTER.test(characters[characters.length - 1] ?? "");

  let at = haystack.indexOf(needle);
  while (at >= 0) {
    const end = at + needle.length;
    const leftOk = !needsLeftBoundary || !SPACED_WORD_CHARACTER.test(haystack.slice(Math.max(0, at - 1), at));
    const rightOk =
      !needsRightBoundary
      || !SPACED_WORD_CHARACTER.test(haystack.slice(end, end + 1))
      || (allowsInflection && ENGLISH_INFLECTION_SUFFIX.test(haystack.slice(end)));
    if (leftOk && rightOk) return true;
    at = haystack.indexOf(needle, at + 1);
  }
  return false;
}
