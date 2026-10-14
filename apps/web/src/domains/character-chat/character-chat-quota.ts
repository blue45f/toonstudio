/**
 * 캐릭터 챗 쿼터 어댑터 — 월 상한 상수와 사용량 계측을 표시 모델로 잇는다.
 *
 * 기존 상태(2026-10-14 main 실측):
 * - 상한: `CHARACTER_CHAT_PLATFORM_MONTHLY_MESSAGE_CAP = 300` (프로필당 월 팬 메시지).
 *   엔진 주석상 플랫폼 키 경로에서만 강제하고 BYOK는 계측만 한다.
 * - 계측: 스토어 `usageByProfile[profileId].fanMessages`는 누적값이라 월 단위
 *   잔여를 만들 수 없다. 세션 메시지는 `createdAt`을 가지므로, 월 사용량은
 *   세션에서 이번 달(UTC) 팬 메시지를 세는 것이 정본이다 — 누적 카운터는
 *   작가 요약 전용으로 그대로 둔다.
 *
 * BYOK 정직성: 자기 키 경로는 플랫폼 상한이 없으므로 `unlimited` 뷰를 돌려준다.
 * 숫자 있는 척하지 않는다. 플랫폼 경로가 열리면 호출부가 scope만 그대로 두고
 * `platformEnforced: true`로 넘기면 같은 표시가 강제 상한 표시가 된다.
 */

import {
  buildUsageQuotaView,
  nextQuotaResetAt,
  type UsageQuotaView,
} from "@/shared/ai/usage-quota";

import { CHARACTER_CHAT_PLATFORM_MONTHLY_MESSAGE_CAP } from "./character-chat-engine";
import type { CharacterChatSession } from "./character-chat-types";

/** 이번 달(UTC) 한 프로필에 팬이 보낸 메시지 수 — 인사말(캐릭터 발화)은 세지 않는다. */
export function countMonthlyFanMessages(
  sessions: readonly CharacterChatSession[],
  profileId: string,
  now: number,
): number {
  const date = new Date(now);
  const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const monthEnd = nextQuotaResetAt("month", now);
  let count = 0;
  for (const session of sessions) {
    if (session.profileId !== profileId) continue;
    for (const message of session.messages) {
      if (message.role !== "fan") continue;
      const at = Date.parse(message.createdAt);
      if (Number.isFinite(at) && at >= monthStart && at < monthEnd) count += 1;
    }
  }
  return count;
}

export interface CharacterChatQuotaOptions {
  /**
   * 플랫폼 키 경로(상한 강제 중)인지. 파일럿 기본값은 BYOK라 false —
   * 이때 표시는 "상한 없음"이 정직한 정답이고, 월 사용량은 강제와 무관하게
   * 참고 숫자로도 보여주지 않는다(상한이 없는데 잔여를 보여주면 거짓말이 된다).
   */
  readonly platformEnforced: boolean;
  readonly now?: number;
}

/** 캐릭터 챗 스레드 입력 영역에 붙일 쿼터 뷰. */
export function buildCharacterChatQuotaView(
  sessions: readonly CharacterChatSession[],
  profileId: string,
  options: CharacterChatQuotaOptions,
): UsageQuotaView {
  const now = options.now ?? Date.now();
  if (!options.platformEnforced) {
    return buildUsageQuotaView({
      scope: "character-chat-monthly",
      used: 0,
      limit: null,
      period: "month",
      resetsAt: null,
    });
  }
  return buildUsageQuotaView({
    scope: "character-chat-monthly",
    used: countMonthlyFanMessages(sessions, profileId, now),
    limit: CHARACTER_CHAT_PLATFORM_MONTHLY_MESSAGE_CAP,
    period: "month",
    resetsAt: nextQuotaResetAt("month", now),
  });
}
