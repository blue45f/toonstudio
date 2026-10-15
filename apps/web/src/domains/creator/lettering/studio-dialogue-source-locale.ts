/**
 * 대사 번역의 예약 로케일 키 — 번역 코어에서 떼어 낸 리프 모듈.
 *
 * `studio-dialogue-translate` 가 이 값을 재수출하므로 기존 import 경로는 그대로 쓸 수 있다.
 * 인물 카드 계층(`studio-translation-card-context`, `studio-localization-qa-character`)은 예약 로케일 판정만
 * 필요하다. 프롬프트 조립·청크 분할·응답 파싱을 가진 번역 코어 전체를 끌어오지 않고 여기서 바로 가져온다.
 */

/** 원문(번역 이전 원본 텍스트)을 가리키는 예약 로케일 키. 사용자에게 노출 시 "원문"으로 표시. */
export const SOURCE_LOCALE = "source";

/** 번역 언어를 가리키는 로케일인가 — 비어 있거나 원문 예약어면 번역문이 아니다. */
export function isTranslationTargetLocale(locale: string): boolean {
  const trimmed = locale.trim();
  return trimmed !== "" && trimmed !== SOURCE_LOCALE;
}
