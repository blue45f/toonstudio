import { normalizeLocaleCode } from "./i18n-locale-list";

export type Lang = string;

export interface LanguageLocaleOption {
  code: string;
  label: string;
  nativeLabel: string;
  englishLabel: string;
  /**
   * 실측 번역률(0~1) — 이 로케일 자산에서 영어 원문과 다른 값을 가진 키의 비율.
   * 자산이 없으면 0. 자세한 정의는 lib/i18n-locale-catalog.ts 참조.
   */
  translatedRatio: number;
  /**
   * false 면 사람이 검수한 완성 번역이 아니라 자동 번역과 영어 폴백을 함께 사용한다.
   * 언어 선택 UI 는 이 품질 차이를 감추면 안 된다.
   */
  fullyTranslated: boolean;
  /**
   * 로케일 완성도(0~1) — 카탈로그 생성 시 산출한 완성도 리포트의 completenessRatio 와 같은
   * 실측값이다. 자세한 정의는 scripts/generate-app-i18n-catalog.mjs 의
   * buildLocaleCompletenessReport 참조.
   */
  completenessRatio: number;
  /**
   * true 면 완성도가 임계(APP_I18N_COMPLETENESS_IN_PROGRESS_THRESHOLD) 미만이다.
   * 언어 선택 UI 는 이 로케일을 "번역 진행 중"으로 표기해야 하며, 번역 완료 언어인 것처럼
   * 제시하면 안 된다.
   */
  translationInProgress: boolean;
}

export type Dict = Record<string, string>;

export const FALLBACK_LANG: Lang = "ko";
export const FALLBACK_CHAIN: readonly string[] = ["en", FALLBACK_LANG];

export function getLocaleCandidateChain(
  raw: string,
  fallbackChain: readonly string[],
): string[] {
  const normalized = normalizeLocaleCode(raw);
  const candidates = new Set<string>();

  if (!normalized) {
    for (const fallback of fallbackChain) {
      candidates.add(fallback);
    }
    return [...candidates];
  }

  const parts = normalized.split("-");
  for (let i = parts.length; i >= 1; i--) {
    const candidate = parts.slice(0, i).join("-");
    candidates.add(candidate);
  }

  for (const fallback of fallbackChain) {
    candidates.add(fallback);
  }

  return [...candidates];
}

export function getLocaleCandidates(
  raw: string,
  fallbackChain: readonly string[] = FALLBACK_CHAIN,
): string[] {
  return getLocaleCandidateChain(raw, fallbackChain);
}
