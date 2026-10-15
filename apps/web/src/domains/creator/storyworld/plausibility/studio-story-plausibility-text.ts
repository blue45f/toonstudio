/**
 * 개연성 리포트 문장에 쓰는 한국어 조사 도우미.
 *
 * 이름이나 장면 제목 뒤에 이/가, 은/는, 을/를을 붙일 때 받침 유무로 고른다.
 * 한글이 아닌 글자로 끝나면 받침이 없는 쪽을 쓴다(판정할 수 없는 값을 지어내지 않는다).
 */

/** 조사만 돌려준다. josa("하은", "이", "가") === "이" */
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  const last = Array.from(word.trim()).at(-1);
  if (!last) return withoutBatchim;
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return withoutBatchim;
  return (code - 0xac00) % 28 === 0 ? withoutBatchim : withBatchim;
}

/** "하은이" / "도진이" / "나라가" */
export function subjectJosa(word: string): string {
  return `${word}${josa(word, "이", "가")}`;
}

/** "하은은" / "나라는" */
export function topicJosa(word: string): string {
  return `${word}${josa(word, "은", "는")}`;
}

/** "열쇠를" / "문을" */
export function objectJosa(word: string): string {
  return `${word}${josa(word, "을", "를")}`;
}

/** 조사만 돌려준다. 받침이 없거나 ㄹ 받침이면 "로", 그 밖에는 "으로". directionSuffix("시장") === "으로" */
export function directionSuffix(word: string): string {
  const last = Array.from(word.trim()).at(-1);
  if (!last) return "로";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "로";
  const batchim = (code - 0xac00) % 28;
  return batchim === 0 || batchim === 8 ? "로" : "으로";
}

/** "시장으로" / "금고로" / "서울로" */
export function directionJosa(word: string): string {
  return `${word}${directionSuffix(word)}`;
}

/** ‘이름’ 형태로 감싼다. */
export function quoted(word: string): string {
  return `‘${word}’`;
}

/** 이름 목록을 쉼표로 잇는다. 마지막 이름을 따로 돌려줘 조사 선택에 쓴다. */
export function listNames(names: readonly string[]): { readonly text: string; readonly last: string } {
  return { text: names.join(", "), last: names.at(-1) ?? "" };
}
