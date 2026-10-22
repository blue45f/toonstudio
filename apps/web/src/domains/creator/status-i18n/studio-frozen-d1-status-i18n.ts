/**
 * 절단편 문장 설계 D1 상태 문구 사전 (A4 D1 — frozenD1).
 *
 * 설계 정본: r8-design-d1-final.md §1(Community 완결 문장)·§2(Live 절단편
 * 계약). frozen1~6 모듈은 각 테스트가 전 키 소비를 단언해 확장이 불가능
 * 하므로 D1 전용 형제 모듈로 신설했다.
 *
 * Community 문장은 조사 생략형 완결 키다 — `{action}`에는 액션 라벨 키로
 * 해석이 끝난 문자열만 들어가고, `{detail}`은 errorText 결과를 구두점·공백
 * 후처리 없이 그대로 넣는다(설계 §1.5). Live 접근성 라벨은 절단편 계약
 * (§2.1 허용 목록이 전부이며 순서 C1·구두점 후처리 C2는 소비 코드가 소유)
 * 을 따르고, title은 완결 키로 분리했다(§2.3).
 *
 * 키 수 실측 정정: 설계 §4는 Live 절단편을 9종·총 16/19키로 적었으나
 * §2.1 표를 글자 단위로 세면 절단편은 10종(pinPosition·latestAuthor·
 * latestComment·unresolvedThreads·unreadThreads·allRead·reanchoring·
 * reanchorHint·reanchorBlocked·openWithEnter)이다. 리터럴을 하나도 남기지
 * 않기 위해 10종 전부를 등록하므로 총 키는 Community 6 + Live 절단편 10
 * + title 4 = 20키다.
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 Community는
 * 설계 §1.3 확정 문안, Live는 이관 전 원문 그대로이며, en은 설계의 확정
 * 번역을 그대로 쓴다(보조 폴백·title 확장 3키의 en은 설계에 명시가 없어
 * 같은 문체의 직역으로 채웠다). 두 로케일의 키 집합은 항상 일치해야
 * 한다(studio-frozen-d1-status-i18n-r8d1.test.ts가 패리티를 고정한다).
 * 비컴포넌트 생산자(throw)도 있어 현재 로케일로 해석하는 `frozenD1Text`
 * 헬퍼를 함께 둔다(studio-frozen5-status-i18n 선례와 동일 오버로드 형태).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

// ── StudioCommunityMarketplacePanel (설계 §1.3 확정 문안)
registerI18nLocaleEntries("ko", {
  "studio.frozenD1.community.revalidationNotFound": "{name}의 공개 상태를 더 이상 확인할 수 없어 {action} 중단했습니다. 관리자 숨김, 배급자 목록 내림 또는 배급자 계정 상태 변경일 수 있습니다. 공개 목록을 새로고침한 뒤 다시 시도해 주세요.",
  "studio.frozenD1.community.revalidationUnconfirmed": "{name}의 현재 공개 상태를 다시 확인하지 못해 {action} 안전하게 중단했습니다. {detail} 다시 시도해 주세요.",
  "studio.frozenD1.community.revalidationEvidenceChanged": "{name}의 현재 공개 릴리스 증거가 이 카드와 달라 {action} 중단했습니다. 공개 목록을 새로고침한 뒤 정확한 최신 릴리스에서 다시 시도해 주세요.",
  "studio.frozenD1.community.revalidationDetailFallback": "네트워크 상태를 확인해 주세요.",
  "studio.frozenD1.community.actionLocalInstall": "로컬 설치",
  "studio.frozenD1.community.actionAssetInsert": "에셋 삽입",
});
registerI18nLocaleEntries("en", {
  "studio.frozenD1.community.revalidationNotFound": "Could not confirm that {name} is still public, so {action} was stopped. It may have been hidden by an admin, delisted by the publisher, or affected by a publisher account change. Refresh the public list and try again.",
  "studio.frozenD1.community.revalidationUnconfirmed": "Could not re-check the current public status of {name}, so {action} was stopped safely. {detail} Please try again.",
  "studio.frozenD1.community.revalidationEvidenceChanged": "The current public release evidence for {name} differs from this card, so {action} was stopped. Refresh the public list and try again from the exact latest release.",
  "studio.frozenD1.community.revalidationDetailFallback": "Please check your network status.",
  "studio.frozenD1.community.actionLocalInstall": "Local install",
  "studio.frozenD1.community.actionAssetInsert": "Asset insert",
});

// ── StudioLiveCanvasOverlay 절단편 (설계 §2.1 — ko 원문 무변경)
registerI18nLocaleEntries("ko", {
  "studio.frozenD1.live.pinPosition": "댓글 핀 {index}/{total}",
  "studio.frozenD1.live.latestAuthor": "최근 작성자 {author}",
  "studio.frozenD1.live.latestComment": "최근 댓글 {body}",
  "studio.frozenD1.live.unresolvedThreads": "미해결 대화 {count}개",
  "studio.frozenD1.live.unreadThreads": "읽지 않은 대화 {count}개",
  "studio.frozenD1.live.allRead": "모두 읽음",
  "studio.frozenD1.live.reanchoring": "댓글 위치 이동 중",
  "studio.frozenD1.live.reanchorHint": "드래그 또는 Alt와 방향키로 위치 이동",
  "studio.frozenD1.live.reanchorBlocked": "위치 이동 불가 {reason}",
  "studio.frozenD1.live.openWithEnter": "Enter 키로 대화 열기",
});
registerI18nLocaleEntries("en", {
  "studio.frozenD1.live.pinPosition": "Comment pin {index}/{total}",
  "studio.frozenD1.live.latestAuthor": "Latest author {author}",
  "studio.frozenD1.live.latestComment": "Latest comment {body}",
  "studio.frozenD1.live.unresolvedThreads": "{count} unresolved conversations",
  "studio.frozenD1.live.unreadThreads": "{count} unread conversations",
  "studio.frozenD1.live.allRead": "All read",
  "studio.frozenD1.live.reanchoring": "Moving comment position",
  "studio.frozenD1.live.reanchorHint": "Drag or use Alt + arrow keys to move",
  "studio.frozenD1.live.reanchorBlocked": "Cannot move position {reason}",
  "studio.frozenD1.live.openWithEnter": "Press Enter to open the conversation",
});

// ── StudioLiveCanvasOverlay title 완결 키 (설계 §2.3 — ko 원문 무변경)
registerI18nLocaleEntries("ko", {
  "studio.frozenD1.live.pinTitleBlocked": "{label} · 위치 이동 불가: {reason} · 클릭으로 열기",
  "studio.frozenD1.live.pinTitleReanchorable": "{label} · 드래그 또는 Alt+방향키로 위치 이동 · 클릭으로 열기",
  "studio.frozenD1.live.pinTitleOpened": "{label} · 열림 {count}개",
  "studio.frozenD1.live.pinTitleOpenedUnread": "{label} · 읽지 않음 {unread}개 · 열림 {count}개",
});
registerI18nLocaleEntries("en", {
  "studio.frozenD1.live.pinTitleBlocked": "{label} · Cannot move position: {reason} · Click to open",
  "studio.frozenD1.live.pinTitleReanchorable": "{label} · Drag or use Alt + arrow keys to move · Click to open",
  "studio.frozenD1.live.pinTitleOpened": "{label} · {count} open",
  "studio.frozenD1.live.pinTitleOpenedUnread": "{label} · {unread} unread · {count} open",
});

export function frozenD1Text(key: string, koFallback: string): string;
export function frozenD1Text(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function frozenD1Text(
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
