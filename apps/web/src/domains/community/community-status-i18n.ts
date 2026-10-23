/**
 * community 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c08).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (catalog-status-i18n-r3c08.test.ts가 패리티를 고정한다). 비컴포넌트
 * 생산자(fetch 오류 폴백 등)도 있어 현재 로케일로 해석하는
 * `communityStatusText` 헬퍼를 함께 둔다 (creator-resources 선례).
 * 이미 translateCurrentStaticSourceText·useBilingual·tx()로 감싸진
 * 문구는 기존 패턴이 정본이라 이 사전에 중복 등록하지 않는다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "community.status.events.emptyTitle": "아직 올라온 이벤트 소식이 없어요",
  "community.status.post.loadFailed": "토론 글을 불러오지 못했습니다.",
  "community.status.post.notFoundTitle": "토론 글을 찾을 수 없어요",
  "community.status.post.deleteFailed": "글을 삭제하지 못했습니다.",
  "community.status.reviews.loadFailed": "리뷰 데이터를 불러오지 못했습니다.",
  "community.status.activity.loadFailed": "커뮤니티 글을 불러오지 못했어요.",
  "community.status.scope.loadFailed": "커뮤니티 목록을 불러오지 못했습니다.",
  "community.status.scope.loadFailedMessage": "잠시 후 다시 시도해 주세요. 통합 커뮤니티와 작품 탐색은 아래 링크로 계속 이용할 수 있습니다.",
  "community.status.scope.searchEmpty": "검색한 이름의 대화가 아직 없어요",
  "community.status.scope.empty": "아직 등록된 대화가 없어요",
  "community.status.fanCafeReply.loadFailed": "댓글을 불러오지 못했습니다.",
  "community.status.fanCafeReply.invalidResponse": "댓글 응답이 유효하지 않습니다.",
  "community.status.fanCafeReply.saveFailed": "댓글을 저장하지 못했습니다. 입력 내용은 유지됩니다.",
  "community.status.fanCafeReply.deleteFailed": "댓글을 삭제하지 못했습니다.",
  "community.status.fanCafeReply.syncWaiting": "대기 중",
  "community.status.fanCafeReply.reloadList": "댓글 목록 다시 불러오기",
  "community.status.fanCafeReply.saving": "저장 중...",
  "community.status.reviewReplies.loadFailedWithStatus": "답글 목록을 불러오지 못했습니다. ({status})",
  "community.status.reviewReplies.listInvalid": "답글 목록 응답이 유효하지 않습니다. 다시 불러와 주세요.",
  "community.status.reviewReplies.loadFailed": "답글을 불러오지 못했습니다.",
  "community.status.reviewReplies.saveFailedWithStatus": "답글을 저장하지 못했습니다. ({status}) 입력 내용은 유지됩니다.",
  "community.status.reviewReplies.responseInvalid": "답글 응답 형식이 유효하지 않습니다.",
  "community.status.reviewReplies.saveFailed": "답글을 저장하지 못했습니다. 연결 상태를 확인한 뒤 다시 등록해 주세요. 입력 내용은 유지됩니다.",
  "community.status.reviewReplies.deleteFailed": "답글을 삭제하지 못했습니다.",
  "community.status.reviewReplies.loading": "답글 불러오는 중",
  "community.status.reviewReplies.saving": "저장 중...",
});

registerI18nLocaleEntries("en", {
  "community.status.events.emptyTitle": "No event news posted yet",
  "community.status.post.loadFailed": "Could not load the discussion post.",
  "community.status.post.notFoundTitle": "Couldn't find the discussion post",
  "community.status.post.deleteFailed": "Could not delete the post.",
  "community.status.reviews.loadFailed": "Could not load the review data.",
  "community.status.activity.loadFailed": "Could not load community posts.",
  "community.status.scope.loadFailed": "Could not load the community list.",
  "community.status.scope.loadFailedMessage": "Please try again shortly. You can keep using the unified community and work discovery via the links below.",
  "community.status.scope.searchEmpty": "No conversations with that name yet",
  "community.status.scope.empty": "No conversations registered yet",
  "community.status.fanCafeReply.loadFailed": "Could not load the comments.",
  "community.status.fanCafeReply.invalidResponse": "The comment response is invalid.",
  "community.status.fanCafeReply.saveFailed": "Could not save the comment. Your input is kept.",
  "community.status.fanCafeReply.deleteFailed": "Could not delete the comment.",
  "community.status.fanCafeReply.syncWaiting": "Waiting",
  "community.status.fanCafeReply.reloadList": "Reload the comment list",
  "community.status.fanCafeReply.saving": "Saving...",
  "community.status.reviewReplies.loadFailedWithStatus": "Could not load the reply list. ({status})",
  "community.status.reviewReplies.listInvalid": "The reply list response is invalid. Please reload it.",
  "community.status.reviewReplies.loadFailed": "Could not load the replies.",
  "community.status.reviewReplies.saveFailedWithStatus": "Could not save the reply. ({status}) Your input is kept.",
  "community.status.reviewReplies.responseInvalid": "The reply response format is invalid.",
  "community.status.reviewReplies.saveFailed": "Could not save the reply. Check your connection and submit again. Your input is kept.",
  "community.status.reviewReplies.deleteFailed": "Could not delete the reply.",
  "community.status.reviewReplies.loading": "Loading replies",
  "community.status.reviewReplies.saving": "Saving...",
});


export function communityStatusText(key: string, koFallback: string): string;
export function communityStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function communityStatusText(
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
