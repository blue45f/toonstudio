/**
 * 마켓 게스트 획득 사전 고지(personal P-3)의 판정 모델.
 *
 * 획득(`useMarketLibrary.acquireResource`)은 로그인한 계정에만 보관되므로
 * 게스트가 "내 에셋에 추가"를 누르면 그제야 실패 문구로 로그인 필요를 알게 된다.
 * 이 모델은 그 판정을 누르기 전 표면(상세 사이드바·스티키 바)이 공유하는
 * 단일 규칙으로 고정한다.
 *
 * - `checking`: 세션 확인이 끝나지 않았다(ready=false). 서버 확인 실패로
 *   상태를 단정할 수 없는 경우도 여기로 수렴하므로, 확인이 끝나기 전에는
 *   "로그인이 필요합니다"라고 거짓 고지하지 않는다.
 * - `guest`: 확인 완료 + 미로그인. 획득 버튼 근처에 사전 고지를 띄우고,
 *   획득 클릭은 실패할 획득 모달 대신 로그인 절차로 연결한다.
 * - `signed-in`: 확인 완료 + 로그인. 고지를 렌더하지 않아 방해가 없다.
 */
export type MarketGuestLoginNoticeState = "checking" | "guest" | "signed-in";

export interface MarketGuestLoginSessionSnapshot {
  readonly ready: boolean;
  readonly status: "authenticated" | "unauthenticated";
}

export function resolveMarketGuestLoginNoticeState(
  snapshot: MarketGuestLoginSessionSnapshot,
): MarketGuestLoginNoticeState {
  if (!snapshot.ready) return "checking";
  return snapshot.status === "authenticated" ? "signed-in" : "guest";
}

/** 게스트의 획득 클릭은 획득 모달(열면 실패)이 아니라 로그인으로 보내야 한다. */
export function shouldInterceptMarketAcquireAsLogin(
  state: MarketGuestLoginNoticeState,
): boolean {
  return state === "guest";
}

/** 상세 사이드바 고지의 고정 id — 획득 버튼의 aria-describedby가 참조한다. */
export const MARKET_GUEST_LOGIN_NOTICE_ID = "market-guest-login-notice";

/** 스티키 바 고지의 고정 id — 스티키 획득 버튼의 aria-describedby가 참조한다. */
export const MARKET_GUEST_LOGIN_NOTICE_STICKY_ID =
  "market-guest-login-notice-sticky";

/**
 * 획득 버튼이 고지를 설명으로 참조해야 하는 상태인가.
 * signed-in에서는 고지 자체가 없으므로 참조를 붙이지 않는다.
 */
export function marketGuestLoginNoticeDescribedBy(
  state: MarketGuestLoginNoticeState,
  noticeId: string,
): string | undefined {
  return state === "signed-in" ? undefined : noticeId;
}
