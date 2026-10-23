/**
 * community 잔여 상태 문구 사전 (A4 4라운드 cat1 실측 분리 후속).
 *
 * 기존 등록 모듈(community-status-i18n)은 확장하지 않고 형제 모듈로 신설한다.
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (r4-cat1-status-i18n.test.ts가 패리티를 고정한다).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "r4cat1.community.reviewReplies.closed": "이 단계에서는 더 이상 답글을 달 수 없습니다.",
});

registerI18nLocaleEntries("en", {
  "r4cat1.community.reviewReplies.closed": "Replies are closed at this stage.",
});

/** 비훅 생산자·렌더 시점용 상태 문구 리졸버 — resourceStatusText 선례와 같은 계약. */
export function r4CommunityStatusText(key: string, koFallback: string): string;
export function r4CommunityStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function r4CommunityStatusText(
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
