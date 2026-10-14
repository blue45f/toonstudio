/**
 * payout-availability.ts
 *
 * 출금 신청 가능 여부를 한곳에서 판정한다.
 *
 * 현재 백엔드 정산·출금 API(apps/api 정산 모듈)가 없어 신청을 실제로
 * 접수할 수 없다. 그래서 신청 가능 여부는 false 가 정본이며, UI는
 * 이 값을 보고 "준비 중" 고지만 표시해야 한다 — 접수되지 않는 신청을
 * 완료된 것처럼 보여주면 안 된다.
 *
 * 실연결 시: 백엔드 출금 API가 신청 접수·이력·상태 조회를 제공하게 되면
 * 이 모듈만 서버 상태 조회로 교체하고, PayoutDialog에 신청 폼을 되살린다.
 */

/** 출금 신청 접수 가능 여부. 백엔드 정산 파이프라인 연결 전까지 false. */
export const PAYOUT_SUBMISSION_ENABLED = false as const;

/** 출금 신청을 받을 수 없는 이유 코드. */
export type PayoutUnavailableReason = "backend-not-connected";

export interface PayoutAvailability {
  readonly submissionEnabled: boolean;
  /** 신청 불가 사유. 신청 가능하면 null. */
  readonly unavailableReason: PayoutUnavailableReason | null;
}

/** 현재 출금 신청 가능 상태를 반환한다. */
export function getPayoutAvailability(): PayoutAvailability {
  if (PAYOUT_SUBMISSION_ENABLED) {
    return { submissionEnabled: true, unavailableReason: null };
  }
  return { submissionEnabled: false, unavailableReason: "backend-not-connected" };
}
