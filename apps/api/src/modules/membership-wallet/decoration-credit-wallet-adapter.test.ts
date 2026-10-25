/**
 * decoration-credit-wallet-adapter.test.ts — 꾸미기 결제 seam 라이브 어댑터
 * 단위 테스트. 지갑 서비스는 스텁으로 대체한다 (DB 없음).
 * 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: 꾸미기 예약이 가변 가격 키·카탈로그 가격 단위·꾸미기 구분
 * metadata로 위임되고, 확정도 그대로 위임된다.
 */
import { describe, expect, it, vi } from "vitest";

import { createDecorationCreditWallet } from "./decoration-credit-wallet-adapter";

describe("decoration-credit-wallet-adapter", () => {
  it("꾸미기 예약은 가변 가격 키와 꾸미기 구분 metadata로 위임한다", async () => {
    const reserveStudioCredits = vi.fn(async () => ({
      id: "res-dec-1",
      status: "reserved" as const,
      requestedAmount: 50,
      capturedAmount: 0,
    }));
    const captureCreditReservation = vi.fn(async () => ({
      id: "res-dec-1",
      status: "captured" as const,
      requestedAmount: 50,
      capturedAmount: 50,
    }));
    const wallet = createDecorationCreditWallet({
      reserveStudioCredits,
      captureCreditReservation,
    });
    const reservation = await wallet.reserveDecorationCredits({
      userId: "user-1",
      itemId: "decoration.sample.potted-plant",
      priceCredits: 50,
      idempotencyKey: "decoration-credit:req-1",
    });
    expect(reservation.id).toBe("res-dec-1");
    expect(reserveStudioCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        feature: "market.purchase",
        units: 50,
        idempotencyKey: "decoration-credit:req-1",
        metadata: expect.objectContaining({
          purchaseKind: "studio-decoration",
          decorationItemId: "decoration.sample.potted-plant",
        }),
      }),
    );
    await wallet.captureDecorationReservation("res-dec-1");
    expect(captureCreditReservation).toHaveBeenCalledWith("res-dec-1");
  });
});
