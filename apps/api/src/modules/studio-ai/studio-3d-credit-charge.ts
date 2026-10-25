/**
 * studio-3d-credit-charge.ts — 서버 3D 생성
 * (Studio3dGenerationService.create)의 크레딧 차감 오케스트레이션.
 * Nest에 의존하지 않는 순수 모듈이다. studio-ai-credit-charge.ts와 동일 패턴이다.
 *
 * 판정 (코드 실측, 설계서 CREDIT_SYSTEM_DESIGN.md §1.2/§1.5):
 *  - 차감 대상은 운영자 부담 경로뿐이다: 사용자 제공자 키가 없고
 *    operatorAiFundingEnabled()가 참일 때만 예약한다. VARCO·Hyper3D
 *    운영자 키 경로가 이에 해당한다 (운영자가 선불 포인트·크레딧으로 부담).
 *  - BYOK 경로(사용자 키 전달)는 차감 제외. 무료 풀 개념은 3D 경로에 없다.
 *  - HTTP 컨트롤러(POST /studio-ai/3d/jobs)는 현재 사용자 키를 강제
 *    (requireProviderApiKey)하므로 라이브 HTTP 경로에서는 이 차감이
 *    dormant하다. 서비스 직접 호출의 운영자 부담 경로가 차감 대상이며,
 *    컨트롤러 정책 변경은 제품 결정 사항이다 (기록에 명시).
 *  - 단가 키 ai.3d.generate, 1단위/잡. 멱등키는 서비스가 만드는 요청
 *    식별자(`studio-3d-<hash>`)에 접두사를 붙인 형태 (200자 상한 내).
 *  - 정산 경계는 제출(submit)이다: 제출 성공 시 capture, 제출 실패 시
 *    release. 제출 이후 단계(지오메트리·텍스처·다운로드) 실패 시 환불은
 *    이 배선에 없다 — 예약 식별자를 잡 원장에 영속화하는 후속 작업이
 *    필요하다 (기록에 명시).
 *  - 예약 실패(잔액·일 한도)는 제공자 호출 전에 차단한다 (studio-ai와 동일).
 *
 * 지갑이 주입되지 않은 경우(null — 기존 단위 테스트 구성 등) 차감은
 * 건너뛴다. 운영 배선(StudioAiModule이 MembershipWalletModule을 import)
 * 에서는 지갑이 제공되므로, null 경로는 테스트용 폴백이다.
 */
import type { CreditFeatureKey } from "../membership-wallet/credit-pricing";
import {
  PAID_OPERATIONS_DISABLED,
  resolvePaidOperationsEnabled,
  type PaidOperationsSettingStore,
} from "../membership-wallet/paid-operations-gate";

export const STUDIO_3D_CREDIT_WALLET = Symbol("STUDIO_3D_CREDIT_WALLET");

export const STUDIO_3D_CREDIT_FEATURE = "ai.3d.generate" as const;
export const STUDIO_3D_CREDIT_IDEMPOTENCY_PREFIX = "studio-3d-credit:";

export interface Studio3dCreditWallet {
  reserveStudioCredits(input: {
    userId: string;
    feature: CreditFeatureKey;
    units?: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; status: string }>;
  captureCreditReservation(reservationId: string): Promise<unknown>;
  releaseCreditReservation(reservationId: string): Promise<unknown>;
}

export interface Studio3dCreditCharge {
  charged: boolean;
  reservationId?: string;
  feature?: CreditFeatureKey;
}

export class Studio3dCreditError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "Studio3dCreditError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** 운영자 부담 경로일 때만 차감한다. BYOK(사용자 키 있음)는 제외. */
export function shouldChargeStudio3dCredits(input: {
  providerApiKey?: string;
  operatorFunded: boolean;
}): boolean {
  return !input.providerApiKey?.trim() && input.operatorFunded;
}

export function studio3dCreditIdempotencyKey(requestId: string): string {
  return `${STUDIO_3D_CREDIT_IDEMPOTENCY_PREFIX}${requestId}`;
}

export async function beginStudio3dCreditCharge(
  wallet: Studio3dCreditWallet | null | undefined,
  input: {
    userId: string;
    requestId: string;
    mode: string;
    providerApiKey?: string;
    operatorFunded: boolean;
  },
  paidOperations?: PaidOperationsSettingStore,
): Promise<Studio3dCreditCharge> {
  if (
    !wallet
    || !shouldChargeStudio3dCredits({
      providerApiKey: input.providerApiKey,
      operatorFunded: input.operatorFunded,
    })
  ) {
    // BYOK·지갑 미주입 경로는 무료/비차감 경로이므로 게이트를 검사하지 않는다.
    return { charged: false };
  }
  // 유료 실행 게이트: 운영자 부담 차감 경로에서, 예약 전에 검사한다.
  // 스토어 미주입·미설정 시 false이므로 기본 OFF에서 예약하지 않는다.
  // 호출부(Studio3dGenerationService.create)는 이 오류를 받아 잡을
  // 실패로 전이하고 제공자를 호출하지 않는다.
  if (!(await resolvePaidOperationsEnabled(paidOperations))) {
    throw new Studio3dCreditError(
      PAID_OPERATIONS_DISABLED,
      403,
      "유료 운영이 비활성화되어 있어 서버 3D 생성 크레딧 차감을 실행할 수 없습니다.",
      { feature: STUDIO_3D_CREDIT_FEATURE },
    );
  }
  const reservation = await wallet.reserveStudioCredits({
    userId: input.userId,
    feature: STUDIO_3D_CREDIT_FEATURE,
    units: 1,
    idempotencyKey: studio3dCreditIdempotencyKey(input.requestId),
    metadata: {
      mode: input.mode,
      studio3dRequestId: input.requestId,
    },
  });
  return {
    charged: true,
    reservationId: reservation.id,
    feature: STUDIO_3D_CREDIT_FEATURE,
  };
}

export async function settleStudio3dCreditCharge(
  wallet: Studio3dCreditWallet | null | undefined,
  charge: Studio3dCreditCharge,
  outcome: { submitted: boolean },
): Promise<void> {
  if (!wallet || !charge.charged || !charge.reservationId) return;
  if (outcome.submitted) {
    await wallet.captureCreditReservation(charge.reservationId);
  } else {
    await wallet.releaseCreditReservation(charge.reservationId);
  }
}
