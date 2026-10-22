/**
 * 모델 출력과 사용자 입력을 화면·클립보드·프롬프트로 내보내기 전에 정리하는 순수 함수.
 *
 * 모델이 돌려준 글은 마지막 관문에서 한 번 더 정리한다: 제어 문자(줄바꿈 제외)는 공백으로 바꾸고, 길이는 UTF-16 조각이 아니라
 * 코드 포인트 기준으로 자른다(이모지·드문 한자가 반으로 잘리지 않는다).
 */

function replaceControlCharacters(text: string, keepNewline: boolean): string {
  let result = "";
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    const control = code < 32 || code === 127;
    result += control && !(keepNewline && code === 10) ? " " : character;
  }
  return result;
}

function clip(text: string, maxLength: number): string {
  return [...text].slice(0, Math.max(0, maxLength)).join("").trim();
}

/** 여러 줄을 허용하는 글(상세 설명·말풍선 번역 등). 줄바꿈 둘레의 공백과 세 번 이상 이어진 줄바꿈을 정리한다. */
export function cleanMultilineText(text: string, maxLength: number): string {
  const tidy = replaceControlCharacters(text, true)
    .replace(/[ \t]+/gu, " ")
    .replace(/ ?\n ?/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return clip(tidy, maxLength);
}

/** 한 줄 글(제목·메모·대사 한 줄·명령 이름). 모든 공백 연속을 한 칸으로 줄인다. */
export function cleanSingleLineText(text: string, maxLength: number): string {
  return clip(replaceControlCharacters(text, false).replace(/\s+/gu, " ").trim(), maxLength);
}
