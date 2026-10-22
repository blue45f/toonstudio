/**
 * engagement 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c08).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (catalog-status-i18n-r3c08.test.ts가 패리티를 고정한다).
 * `engagementStatusText` 헬퍼는 creator-resources 선례를 따른다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "engagement.status.growthLab.diffUnavailable": "차이 확인 불가",
  "engagement.status.growthLab.loading": "성장 실험을 불러오는 중입니다…",
  "engagement.status.growthLab.emptyTitle": "아직 성장 실험이 없습니다",
  "engagement.status.libraryDiary.loading": "감상 일기를 불러오는 중입니다…",
  "engagement.status.notifications.loadLatestFailed": "최신 알림을 불러오지 못했어요",
  "engagement.status.notifications.loadLatestHint": "저장된 알림은 그대로 볼 수 있습니다. 네트워크를 확인하고 다시 시도해 주세요.",
  "engagement.status.notifications.retry": "다시 시도",
  "engagement.status.notifications.loading": "알림을 불러오는 중",
  "engagement.status.notifications.archivedEmpty": "보관한 알림이 없습니다",
  "engagement.status.notifications.empty": "아직 확인할 알림이 없습니다",
  "engagement.status.notificationSettings.roleLoadFailed": "직군 알림 설정을 불러오지 못했어요. 지금은 직군으로 거르지 않고 모든 제작 알림을 보여줍니다.",
  "engagement.status.notificationSettings.retry": "다시 시도",
  "engagement.status.notificationSettings.roleLoading": "직군 알림 설정을 불러오는 중이에요…",
  "engagement.status.notificationSettings.savedLoading": "저장된 알림 설정을 불러오는 중이에요…",
  "engagement.status.publicCollection.openFailedTitle": "공개 리스트를 열 수 없습니다",
  "engagement.status.publicCollection.openFailedDescription": "링크가 손상되었거나 지원하지 않는 형식입니다.",
  "engagement.status.publicCollection.partialLoadFailed": "일부 작품 정보를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.",
  "engagement.status.publicCollection.emptyTitle": "현재 카탈로그에서 확인할 수 있는 작품이 없습니다",
  "engagement.status.taste.popularLoadFailedTitle": "인기 작품 목록을 불러오지 못했습니다",
  "engagement.status.taste.listLoadingAria": "작품 목록을 불러오는 중",
  "engagement.status.taste.listLoadFailedSkip": "작품 목록을 불러오지 못해 건너뜁니다. 장르만 골라도 완료할 수 있어요.",
  "engagement.status.taste.popularEmpty": "지금은 보여 줄 인기 작품이 없어요. 장르만 골라도 취향을 완성할 수 있어요.",
  "engagement.status.taste.previewLoadFailedSkip": "작품 목록을 불러오지 못해 추천 미리보기를 건너뜁니다. 저장한 취향은 추천 화면에 그대로 반영됩니다.",
  "engagement.status.taste.previewLoadingSkip": "작품 목록을 불러오는 중이라 추천 미리보기를 건너뜁니다. 저장한 취향은 추천 화면에 그대로 반영됩니다.",
  "engagement.status.taste.previewEmptySkip": "지금은 보여 줄 작품이 없어 추천 미리보기를 건너뜁니다. 저장한 취향은 추천 화면에 그대로 반영됩니다.",
  "engagement.status.tasteSpectrum.emptyAria": "아직 고른 장르가 없어 비어 있는 취향 스펙트럼",
});

registerI18nLocaleEntries("en", {
  "engagement.status.growthLab.diffUnavailable": "Difference unavailable",
  "engagement.status.growthLab.loading": "Loading growth experiments…",
  "engagement.status.growthLab.emptyTitle": "No growth experiments yet",
  "engagement.status.libraryDiary.loading": "Loading your reading diary…",
  "engagement.status.notifications.loadLatestFailed": "Could not load the latest notifications",
  "engagement.status.notifications.loadLatestHint": "You can still view saved notifications. Check your network and try again.",
  "engagement.status.notifications.retry": "Try again",
  "engagement.status.notifications.loading": "Loading notifications",
  "engagement.status.notifications.archivedEmpty": "No archived notifications",
  "engagement.status.notifications.empty": "No notifications to check yet",
  "engagement.status.notificationSettings.roleLoadFailed": "Could not load role notification settings. For now, all production notifications are shown without role filtering.",
  "engagement.status.notificationSettings.retry": "Try again",
  "engagement.status.notificationSettings.roleLoading": "Loading role notification settings…",
  "engagement.status.notificationSettings.savedLoading": "Loading your saved notification settings…",
  "engagement.status.publicCollection.openFailedTitle": "Could not open the public list",
  "engagement.status.publicCollection.openFailedDescription": "The link is damaged or in an unsupported format.",
  "engagement.status.publicCollection.partialLoadFailed": "Could not load some work information. Please reopen it shortly.",
  "engagement.status.publicCollection.emptyTitle": "No works currently available in the catalog",
  "engagement.status.taste.popularLoadFailedTitle": "Could not load the popular works list",
  "engagement.status.taste.listLoadingAria": "Loading the works list",
  "engagement.status.taste.listLoadFailedSkip": "Skipping because the works list could not be loaded. You can finish with genres alone.",
  "engagement.status.taste.popularEmpty": "No popular works to show right now. You can complete your taste with genres alone.",
  "engagement.status.taste.previewLoadFailedSkip": "Skipping the recommendation preview because the works list could not be loaded. Your saved taste is still reflected on the recommendation screen.",
  "engagement.status.taste.previewLoadingSkip": "Skipping the recommendation preview while the works list loads. Your saved taste is still reflected on the recommendation screen.",
  "engagement.status.taste.previewEmptySkip": "Skipping the recommendation preview because there are no works to show. Your saved taste is still reflected on the recommendation screen.",
  "engagement.status.tasteSpectrum.emptyAria": "An empty taste spectrum with no genres chosen yet",
});


export function engagementStatusText(key: string, koFallback: string): string;
export function engagementStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function engagementStatusText(
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
