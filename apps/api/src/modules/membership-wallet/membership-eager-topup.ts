/**
 * membership-eager-topup.ts — 등급 변경 즉시 지급(eager) 훅.
 * Nest에 의존하지 않는 순수 모듈이다.
 *
 * 배경 (P1 실측): 등급 변경은 `adminApplyMembership`이 grant만 삽입하고,
 * 월 포함량 지급은 다음 `getOverview`·`reserveStudioCredits` 호출에서
 * `ensureMonthlyMembershipCredits`가 lazy로 메웠다. 이 훅은 등급 변경
 * 직후에 공개 `getOverview`를 호출해 lazy 반영을 변경 시점으로 앞당긴다.
 *
 * 멱등 보장: `ensureMonthlyMembershipCredits`는 월 경계 키(cycleKey)별
 * 기지급 합계와 목표량의 차분만큼만 지급하므로, 이 훅을 여러 번
 * 호출해도 초과 지급되지 않는다. 서비스 파일 무접촉: 공개 메서드만 쓴다.
 *
 * 실패 정책: 등급 부여 자체가 성공한 뒤의 지급이므로, `getOverview`
 * 실패 시 예외를 던지지 않고 `{ toppedUp: false, error }`를 반환한다.
 * 컨트롤러 응답이 부여 실패로 보이지 않게 하며, lazy 경로가 뒤에서
 * 메운다. 부여가 적용되지 않았으면(`applied: false` — 동일 requestKey
 * 재호출 등) 지급을 시도하지 않는다.
 *
 * 해결 등급 보고: 요청 등급과 실제 해결 등급이 다르면(더 높은 등급의
 * 부여가 이미 있음) 해결 등급을 그대로 보고하고 강제로 끌어내리지 않는다.
 */
export interface MembershipEagerTopUpWallet {
  getOverview(userId: string): Promise<{
    membership: { planId: string };
    creditCycle: { monthlyIncluded: number };
    wallet: {
      studioCredits: { available: number };
    };
  }>;
}

export interface MembershipEagerTopUpInput {
  userId?: unknown;
  applied?: unknown;
  requestedPlanId?: unknown;
}

export interface MembershipEagerTopUpResult {
  toppedUp: boolean;
  requestedPlanId?: string;
  resolvedPlanId?: string;
  monthlyIncluded?: number;
  availableCredits?: number;
  error?: string;
}

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function applyMembershipEagerTopUp(
  wallet: MembershipEagerTopUpWallet | null | undefined,
  input: MembershipEagerTopUpInput,
): Promise<MembershipEagerTopUpResult> {
  const requestedPlanId = boundedText(input?.requestedPlanId, 160);
  const userId = boundedText(input?.userId, 160);
  if (!wallet || !input?.applied || !userId) {
    return {
      toppedUp: false,
      ...(requestedPlanId ? { requestedPlanId } : {}),
    };
  }
  try {
    const overview = await wallet.getOverview(userId);
    return {
      toppedUp: true,
      ...(requestedPlanId ? { requestedPlanId } : {}),
      resolvedPlanId: overview.membership.planId,
      monthlyIncluded: overview.creditCycle.monthlyIncluded,
      availableCredits: overview.wallet.studioCredits.available,
    };
  } catch (error) {
    return {
      toppedUp: false,
      ...(requestedPlanId ? { requestedPlanId } : {}),
      error: error instanceof Error
        ? error.message.slice(0, 240)
        : "eager-topup-failed",
    };
  }
}
