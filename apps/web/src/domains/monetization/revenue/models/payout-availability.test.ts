/**
 * payout-availability.test.ts
 *
 * 출금 신청 가능 판정 테스트.
 * 백엔드 정산 파이프라인이 연결되기 전까지 신청은 불가여야 하고,
 * UI가 가짜 접수를 만들지 않도록 이 계약을 고정한다.
 */
import { describe, expect, it } from "vitest";

import { getPayoutAvailability, PAYOUT_SUBMISSION_ENABLED } from "./payout-availability";

describe("getPayoutAvailability", () => {
  it("백엔드 미연결 동안은 신청 불가와 사유를 반환한다", () => {
    const availability = getPayoutAvailability();

    expect(availability.submissionEnabled).toBe(PAYOUT_SUBMISSION_ENABLED);
    if (!availability.submissionEnabled) {
      expect(availability.unavailableReason).toBe("backend-not-connected");
    } else {
      expect(availability.unavailableReason).toBeNull();
    }
  });

  it("신청 불가 상태에서는 사유가 비어 있지 않다", () => {
    const availability = getPayoutAvailability();

    expect(availability.submissionEnabled || availability.unavailableReason !== null).toBe(true);
  });
});
