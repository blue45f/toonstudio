import type { LocalizedText } from "./engineering-story-content";

/** drawing 카테고리 카드 작성용 공용 도우미. 카드 내용은 두지 않는다. */

export const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/**
 * 샘플 코드 템플릿의 `@번호@` 자리를 한국어·영어 주석으로 채워, 줄 수가 같은 `code`와 `codeEn`을 만든다.
 * 코드 본문은 한 벌만 두므로 영어 화면용 코드가 한국어 코드와 어긋나지 않는다.
 */
export function commentedCode(
  template: string,
  ko: readonly string[],
  en: readonly string[],
): { readonly code: string; readonly codeEn: string } {
  const fill = (comments: readonly string[]): string =>
    template.replace(/@(\d+)@/gu, (_match, index: string) => comments[Number(index)] ?? "");
  return { code: fill(ko), codeEn: fill(en) };
}
