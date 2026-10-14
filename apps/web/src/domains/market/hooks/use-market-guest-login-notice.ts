import { useSession } from "@/domains/auth/public/session/auth-session-store";

import {
  resolveMarketGuestLoginNoticeState,
  type MarketGuestLoginNoticeState,
} from "../models/market-guest-login-notice";

/**
 * 획득 버튼·상세 표면이 공유하는 게스트 판정 훅.
 * 판정 규칙은 `market-guest-login-notice` 모델 한 곳에서만 정한다.
 */
export function useMarketGuestLoginNoticeState(): MarketGuestLoginNoticeState {
  const { ready, status } = useSession();
  return resolveMarketGuestLoginNoticeState({ ready, status });
}
