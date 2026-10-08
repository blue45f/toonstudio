import type { LocalizedText } from "./engineering-story-content";

/** local-first 카드 작성용 작은 도우미. ko/en 한 쌍과 줄 수가 같은 샘플 코드 쌍을 만든다. */
export const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/** 샘플 코드 한 줄. 문자열이면 두 언어 공통, 튜플이면 [한국어 줄, 영어 줄](주석만 다르다). */
export type SampleLine = string | readonly [ko: string, en: string];

/**
 * 샘플 코드를 줄 단위로 선언해 `code`(한국어 주석)와 `codeEn`(영어 주석)의 줄 수가 항상 같게 만든다.
 * 샘플 코드 안에는 백틱과 `${`를 쓰지 않는다(문자열 이어 붙이기를 쓴다).
 */
export function sampleLines(rows: readonly SampleLine[]): { readonly code: string; readonly codeEn: string } {
  return {
    code: rows.map((row) => (typeof row === "string" ? row : row[0])).join("\n"),
    codeEn: rows.map((row) => (typeof row === "string" ? row : row[1])).join("\n"),
  };
}
