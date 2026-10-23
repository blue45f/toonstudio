/**
 * catalog 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c08).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (catalog-status-i18n-r3c08.test.ts가 패리티를 고정한다). 비컴포넌트
 * 생산자(useApiResource 인자 등)도 있어 현재 로케일로 해석하는
 * `catalogStatusText` 헬퍼를 함께 둔다 (creator-resources 선례).
 * 이미 translateCurrentStaticSourceText·useBilingual로 감싸진 문구는
 * 기존 패턴이 정본이라 이 사전에 중복 등록하지 않는다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "catalog.status.author.loadFailed": "작가 데이터를 불러오지 못했습니다.",
  "catalog.status.authors.searchEmpty": "“{query}” 작가를 찾지 못했어요",
  "catalog.status.authors.empty": "등록된 작가가 없어요",
  "catalog.status.insights.loadFailed": "인사이트 데이터를 불러오지 못했습니다.",
  "catalog.status.random.emptyTitle": "조건에 맞는 작품이 없어요",
  "catalog.status.random.emptyDescription": "지금 조건으로는 뽑을 작품이 없어요. 조건을 바꾸면 새 작품을 만날 수 있어요.",
  "catalog.status.random.loadFailedTitle": "랜덤 작품을 불러오지 못했어요",
  "catalog.status.random.loadFailedMessage": "네트워크나 서버 문제로 데이터를 가져오지 못했습니다. 잠시 뒤 다시 시도해 보세요.",
  "catalog.status.tags.loadFailed": "태그를 불러오지 못했습니다.",
  "catalog.status.tags.loading": "태그를 불러오는 중입니다.",
  "catalog.status.tags.loadingAria": "태그 목록 불러오는 중",
  "catalog.status.tags.searchEmpty": "일치하는 태그가 없습니다.",
  "catalog.status.titleDetail.loadFailed": "작품 상세 데이터를 불러오지 못했습니다.",
  "catalog.status.titleDetail.reviewsUnavailableBadge": "현재 확인 불가",
  "catalog.status.titleDetail.reviewsUnavailableTitle": "리뷰 기능을 일시적으로 사용할 수 없습니다.",
  "catalog.status.titleDetail.reviewsUnavailableDescription": "리뷰 목록이 비어 있다는 뜻은 아닙니다. 작품 정보와 다른 탐색 기능은 계속 사용할 수 있습니다.",
  "catalog.status.titleReader.loadFailed": "작품 정보를 불러오지 못했습니다.",
  "catalog.status.worldWiki.empty": "아직 공개된 설정이 없어요",
});

registerI18nLocaleEntries("en", {
  "catalog.status.author.loadFailed": "Could not load the author data.",
  "catalog.status.authors.searchEmpty": "Couldn't find the author “{query}”",
  "catalog.status.authors.empty": "No authors registered yet",
  "catalog.status.insights.loadFailed": "Could not load the insights data.",
  "catalog.status.random.emptyTitle": "No works match these conditions",
  "catalog.status.random.emptyDescription": "No work can be picked with the current conditions. Change the conditions to discover new works.",
  "catalog.status.random.loadFailedTitle": "Could not load a random work",
  "catalog.status.random.loadFailedMessage": "Could not fetch the data due to a network or server problem. Please try again in a moment.",
  "catalog.status.tags.loadFailed": "Could not load the tags.",
  "catalog.status.tags.loading": "Loading tags.",
  "catalog.status.tags.loadingAria": "Loading the tag list",
  "catalog.status.tags.searchEmpty": "No matching tags.",
  "catalog.status.titleDetail.loadFailed": "Could not load the work details.",
  "catalog.status.titleDetail.reviewsUnavailableBadge": "Currently unavailable",
  "catalog.status.titleDetail.reviewsUnavailableTitle": "The review feature is temporarily unavailable.",
  "catalog.status.titleDetail.reviewsUnavailableDescription": "This does not mean the review list is empty. Work information and other discovery features remain available.",
  "catalog.status.titleReader.loadFailed": "Could not load the work information.",
  "catalog.status.worldWiki.empty": "No public world settings yet",
});


export function catalogStatusText(key: string, koFallback: string): string;
export function catalogStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function catalogStatusText(
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
