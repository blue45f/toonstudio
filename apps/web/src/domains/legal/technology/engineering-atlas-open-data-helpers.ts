import type { LocalizedText } from "./engineering-story-content";

/** open-data 카드 작성용 보조 함수. 카드 내용은 engineering-atlas-open-data-*.ts 파일에 둔다. */

/** 한국어·영어 문장 쌍을 만든다. */
export const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/**
 * 한 곳에서 한국어·영어 주석을 함께 적는 샘플 코드 도우미.
 * 줄 끝(또는 줄 전체)에 `//~ 한국어 ## English`(TOML·YAML 은 `#~`) 형태로 적으면 `code`는 한국어 주석,
 * `codeEn`은 영어 주석으로 만들어 두 코드의 줄 수가 언제나 같게 한다.
 * 샘플 본문에는 백틱·역슬래시·`${`를 쓰지 않는다(템플릿 문자열로 감싸기 때문이다).
 */
export function codePair(source: string, comment = "//"): { readonly code: string; readonly codeEn: string } {
  const ko: string[] = [];
  const en: string[] = [];
  for (const line of source.replace(/^\n/u, "").replace(/\n+$/u, "").split("\n")) {
    const marker = /(?:\/\/|#)~ /u.exec(line);
    if (!marker) {
      ko.push(line);
      en.push(line);
      continue;
    }
    const head = line.slice(0, marker.index);
    const [koText = "", enText = ""] = line.slice(marker.index + marker[0].length).split(" ## ");
    ko.push(`${head}${comment} ${koText}`);
    en.push(`${head}${comment} ${enText || koText}`);
  }
  return { code: ko.join("\n"), codeEn: en.join("\n") };
}
