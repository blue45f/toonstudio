import { getLocaleCandidateChain } from "./i18n-constants";
import {
  APP_I18N_ASSET_LOCALES,
  APP_I18N_COMPLETENESS_IN_PROGRESS_THRESHOLD,
  APP_I18N_LOCALE_TRANSLATED_RATIO,
  APP_I18N_TRANSLATED_LOCALE_THRESHOLD,
} from "./i18n-locale-catalog";

const APP_I18N_ASSET_LOCALE_SET: ReadonlySet<string> = new Set(
  APP_I18N_ASSET_LOCALES,
);

/**
 * 요청 로케일을 실제 배포 자산으로 좁힌다. 폴백 체인(en → ko)은 **의도적으로 제외한다** —
 * 여기에 en 을 섞으면 모든 로케일이 "자산 있음"으로 보여, 자산이 없다는 사실 자체가 사라진다.
 */
export function resolveAppI18nAssetLocale(locale: string): string | null {
  for (const candidate of getLocaleCandidateChain(locale, [])) {
    if (APP_I18N_ASSET_LOCALE_SET.has(candidate)) return candidate;
  }
  return null;
}

/** 이 로케일 자산의 실측 번역률(0~1). 자산이 없으면 0. */
export function getAppI18nTranslatedRatio(locale: string): number {
  const assetLocale = resolveAppI18nAssetLocale(locale);
  if (!assetLocale) return 0;
  return APP_I18N_LOCALE_TRANSLATED_RATIO[assetLocale] ?? 0;
}

/**
 * 이 로케일을 "번역된 언어"로 제시해도 되는지. false 면 사용자는 사실상 영어를 보게 된다.
 */
export function isFullyTranslatedAppLocale(locale: string): boolean {
  return (
    getAppI18nTranslatedRatio(locale) >= APP_I18N_TRANSLATED_LOCALE_THRESHOLD
  );
}

/**
 * 이 로케일의 완성도(0~1). 카탈로그 생성 시 산출되는 완성도 리포트의 completenessRatio 와
 * 같은 실측값(영어 기준 키 중 영어 원문과 다른 값을 가진 비율)이다. 자산이 없으면 0.
 */
export function getAppI18nCompletenessRatio(locale: string): number {
  return getAppI18nTranslatedRatio(locale);
}

/**
 * 완성도가 임계 미만이라 "번역 진행 중"으로 표기해야 하는지. 번역 하한(0.5)을 넘는 로케일도
 * 완성도 임계(0.9) 미만이면 진행 중이다 — 절반만 번역된 언어를 완성된 번역처럼 보이면
 * 사용자는 나머지 절반이 영어로 나오는 이유를 알 수 없다.
 */
export function isAppI18nTranslationInProgress(locale: string): boolean {
  return (
    getAppI18nCompletenessRatio(locale) <
    APP_I18N_COMPLETENESS_IN_PROGRESS_THRESHOLD
  );
}
