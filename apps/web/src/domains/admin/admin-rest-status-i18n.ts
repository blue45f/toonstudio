/**
 * admin 잔여 표면의 로딩·실패 상태 문구 사전 (A4 잔여 3라운드 c14).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (대응하는 r3c14 테스트가 패리티를 고정한다). 콘텐츠 본문·폼 라벨·
 * placeholder는 대상이 아니며 로딩·실패·빈 상태 문구만 다룬다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "adminRest.status.integrations.loadFailed": "연동 운영 상태를 불러오지 못했습니다.",
  "adminRest.status.webVitals.loading": "성능 실측 불러오는 중",
  "adminRest.status.webVitals.retry": "다시 불러오기",
});

registerI18nLocaleEntries("en", {
  "adminRest.status.integrations.loadFailed": "Could not load integration operations status.",
  "adminRest.status.webVitals.loading": "Loading performance measurements",
  "adminRest.status.webVitals.retry": "Reload",
});

export function adminRestStatusText(key: string, koFallback: string): string;
export function adminRestStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function adminRestStatusText(
  key: string,
  paramsOrFallback: Readonly<Record<string, string | number>> | string,
  koFallback?: string,
): string {
  const params = typeof paramsOrFallback === "string" ? undefined : paramsOrFallback;
  const fallback = typeof paramsOrFallback === "string" ? paramsOrFallback : koFallback ?? "";
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  if (!params) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(params, token) ? String(params[token]) : placeholder,
  );
}
