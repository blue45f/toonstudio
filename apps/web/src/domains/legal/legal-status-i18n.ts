/**
 * legal(피드백) 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c10).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (legal-status-i18n-r3c10.test.ts가 패리티를 고정한다). 법률·안내 본문은
 * 콘텐츠 본문이라 대상이 아니며, feedback 표면의 로딩·실패·빈 상태만
 * 다룬다. 비컴포넌트 생산자(throw·getApiErrorMessage 폴백 등)도 있어
 * 현재 로케일로 해석하는 `legalStatusText` 헬퍼를 함께 둔다 (catalog 선례).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "legal.status.feedbackComposer.submitUnconfirmed": "등록 결과를 확인하지 못했어요. 중복 제보를 피하려면 내 제보 목록을 먼저 확인해 주세요. 입력 내용은 유지됩니다.",
  "legal.status.feedbackComposer.submitting": "등록 중…",
  "legal.status.feedbackPostCard.noteRequired": "사용자에게 공개할 처리 안내를 입력해 주세요.",
  "legal.status.feedbackPostCard.saveUnconfirmed": "처리 상태 저장 결과를 확인하지 못했어요. 목록을 새로고침해 주세요.",
  "legal.status.feedbackPostCard.saveFailed": "처리 상태를 변경하지 못했어요.",
  "legal.status.feedbackPostCard.saving": "저장 중…",
  "legal.status.feedbackPostCard.voteUnconfirmed": "공감 결과를 확인하지 못했어요. 목록을 새로고침해 주세요.",
  "legal.status.feedbackPostCard.voteFailed": "공감을 반영하지 못했어요.",
  "legal.status.feedbackThread.loadFailed": "댓글을 불러오지 못했어요.",
  "legal.status.feedbackThread.submitUnconfirmed": "댓글 등록 결과를 확인하지 못했어요. 중복 등록을 피하려면 댓글 목록을 먼저 확인해 주세요.",
  "legal.status.feedbackThread.submitFailed": "댓글을 보내지 못했어요. 입력 내용은 유지됩니다.",
  "legal.status.feedbackThread.loading": "댓글을 불러오고 있어요.",
  "legal.status.feedbackThread.reload": "댓글 다시 불러오기",
  "legal.status.feedbackThread.empty": "아직 댓글이 없어요. 같은 경험이나 도움이 되는 정보를 남겨주세요.",
});

registerI18nLocaleEntries("en", {
  "legal.status.feedbackComposer.submitUnconfirmed": "Could not confirm the submission result. Check your submissions first to avoid a duplicate. Your input is kept.",
  "legal.status.feedbackComposer.submitting": "Submitting…",
  "legal.status.feedbackPostCard.noteRequired": "Enter a handling note to show the user publicly.",
  "legal.status.feedbackPostCard.saveUnconfirmed": "Could not confirm the status save result. Refresh the list.",
  "legal.status.feedbackPostCard.saveFailed": "Could not change the handling status.",
  "legal.status.feedbackPostCard.saving": "Saving…",
  "legal.status.feedbackPostCard.voteUnconfirmed": "Could not confirm the vote result. Refresh the list.",
  "legal.status.feedbackPostCard.voteFailed": "Could not apply your vote.",
  "legal.status.feedbackThread.loadFailed": "Could not load the comments.",
  "legal.status.feedbackThread.submitUnconfirmed": "Could not confirm the comment submission. Check the comment list first to avoid a duplicate.",
  "legal.status.feedbackThread.submitFailed": "Could not post the comment. Your input is kept.",
  "legal.status.feedbackThread.loading": "Loading comments.",
  "legal.status.feedbackThread.reload": "Reload comments",
  "legal.status.feedbackThread.empty": "No comments yet. Share a similar experience or helpful information.",
});

export function legalStatusText(key: string, koFallback: string): string;
export function legalStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function legalStatusText(
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
