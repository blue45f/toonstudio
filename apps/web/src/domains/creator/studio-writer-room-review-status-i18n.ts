/**
 * 작가실 리뷰 표면(StudioWriterRoomReviewSurfaces) 로딩·실패·빈 상태 문구 사전
 * (A4 잔여 3라운드 — WriterRoom 경계 계약 개정 과제).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. 소비 파일은 생산 시점
 * 해석 헬퍼 `writerRoomReviewText(key, fallback)`로 호출한다
 * (studio-panel-status-i18n-r3c06의 panelStatusText 선례와 동일 규약).
 * 이 모듈의 유일한 런타임 의존은 `@/shared/lib/i18n`이며, 오케스트레이션·
 * 스토어·CRDT·AI 클라이언트에는 닿지 않는다 — 경계 계약
 * (studio-writer-room-review-boundary)이 이 모듈의 import 목록까지 고정한다.
 * 기존 panelStatus 모듈군을 확장하지 않고 표면 전용 형제 모듈로 나눈 근거:
 * 배치 1·r3c06·r3c07 테스트가 각 모듈의 등록 키 개수를 정확히 단언한다.
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.writerRoomReview.canvasPlan.applyFailed": "컷 플랜을 캔버스에 적용하지 못했어요.",
  "studio.writerRoomReview.canvasPlan.readyWithApply": "검토된 컷 순서대로 새 페이지를 만듭니다. 버튼을 누르기 전에는 캔버스를 바꾸지 않습니다.",
  "studio.writerRoomReview.canvasPlan.readyWithoutApply": "컷과 페이지 구성이 준비되었습니다. 캔버스 적용 연결은 아직 제공되지 않습니다.",
  "studio.writerRoomReview.suggestion.bulkDecideFailed": "제안 묶음을 처리하지 못했어요.",
  "studio.writerRoomReview.suggestion.decideFailed": "제안을 처리하지 못했어요.",
  "studio.writerRoomReview.suggestion.emptyTitle": "검토할 제안이 없습니다",
  "studio.writerRoomReview.suggestion.emptyValue": "비어 있음",
  "studio.writerRoomReview.suggestion.pendingNotice": "AI 결과는 여기서 대기하며, 승인 버튼을 누르기 전에는 원고에 적용되지 않습니다.",
  "studio.writerRoomReview.suggestion.undoFailed": "마지막 결정을 되돌리지 못했어요.",
});

registerI18nLocaleEntries("en", {
  "studio.writerRoomReview.canvasPlan.applyFailed": "Could not apply the cut plan to the canvas.",
  "studio.writerRoomReview.canvasPlan.readyWithApply": "New pages are created in the reviewed cut order. The canvas does not change until you press the button.",
  "studio.writerRoomReview.canvasPlan.readyWithoutApply": "The cuts and page layout are ready. Connecting them to the canvas is not available yet.",
  "studio.writerRoomReview.suggestion.bulkDecideFailed": "Could not process the batch of suggestions.",
  "studio.writerRoomReview.suggestion.decideFailed": "Could not process the suggestion.",
  "studio.writerRoomReview.suggestion.emptyTitle": "No suggestions to review",
  "studio.writerRoomReview.suggestion.emptyValue": "Empty",
  "studio.writerRoomReview.suggestion.pendingNotice": "AI results wait here and are not applied to the manuscript until you press the approve button.",
  "studio.writerRoomReview.suggestion.undoFailed": "Could not undo the last decision.",
});

/**
 * 비컴포넌트 생산자용 생산 시점 로케일 해석 헬퍼 (studio-panel-status-i18n-r3c06의
 * `panelStatusText` 선례). 키가 사전에 없으면 koFallback을 그대로 돌려준다.
 * `{token}` 보간은 useT 리졸버와 같은 규약으로 한 번만 치환한다.
 */
export function writerRoomReviewText(key: string, koFallback: string): string;
export function writerRoomReviewText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function writerRoomReviewText(
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
