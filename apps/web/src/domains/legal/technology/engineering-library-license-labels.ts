import type { LocalizedText } from "./engineering-story-content";

/**
 * 라이브러리 카드의 `license` 는 SPDX 식별자(영문 그대로)가 기본이다. 표준·서비스·형식처럼 SPDX 가 없는 항목은
 * 짧은 영어 설명 문구를 쓰고, 화면은 아래 표로 한국어 화면에서는 한국어로 바꿔 보여 준다.
 * 표에 없는 문구는 그대로 보여 주며, 한글이 든 문구에는 반드시 영어 짝을 두도록 테스트가 확인한다.
 */
const LICENSE_TEXT: ReadonlyMap<string, LocalizedText> = new Map<string, LocalizedText>([
  ["Web standard", { ko: "웹 표준", en: "Web standard" }],
  ["Service terms", { ko: "서비스 약관", en: "Service terms" }],
  ["Per-model terms", { ko: "모델별 이용조건", en: "Per-model terms" }],
  ["원본 라이선스를 따름", { ko: "원본 라이선스를 따름", en: "Follows each original license" }],
]);

export function localizedLicense(license: string): LocalizedText {
  return LICENSE_TEXT.get(license) ?? { ko: license, en: license };
}

/** 한글이 든 라이선스 문구인데 영어 짝이 표에 없는지(테스트가 모든 카드를 확인하는 용도). */
export function licenseNeedsEnglish(license: string): boolean {
  return /[ㄱ-ㆎ가-힣]/u.test(license) && !LICENSE_TEXT.has(license);
}
