import type { LocalizedText } from "./engineering-story-content";

/** web-platform 카드 공용 도우미. ko/en 한 쌍을 만들고, 줄 수가 같은 한국어·영어 샘플 코드를 함께 만든다. */

export const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/** `[코드, 한국어 주석, 영어 주석]` 한 줄. 코드가 공백뿐이면 주석만 있는 줄이고, 주석을 생략하면 코드만 남는다. */
export type SampleLine = readonly [code: string, ko?: string, en?: string];

function renderComment(marker: string, comment: string): string {
  return marker === "/*" ? `/* ${comment} */` : `${marker} ${comment}`;
}

function renderLine([code, ko, en]: SampleLine, language: "ko" | "en", marker: string): string {
  const comment = language === "ko" ? ko : en;
  if (!comment) return code;
  return code.trim() === "" ? `${code}${renderComment(marker, comment)}` : `${code} ${renderComment(marker, comment)}`;
}

/**
 * 같은 코드에 한국어·영어 주석을 입힌 두 문자열을 만든다(줄 수가 항상 같다).
 * 주석 기호는 기본이 `//`이고, 설정 파일 예제처럼 `#`을 쓰는 언어에는 `marker`를 넘긴다.
 * `/*`를 넘기면 CSS 처럼 `/* … *\/` 한 줄 주석으로 감싼다.
 */
export function sampleSource(
  lines: readonly SampleLine[],
  marker = "//",
): { readonly code: string; readonly codeEn: string } {
  return {
    code: lines.map((line) => renderLine(line, "ko", marker)).join("\n"),
    codeEn: lines.map((line) => renderLine(line, "en", marker)).join("\n"),
  };
}
