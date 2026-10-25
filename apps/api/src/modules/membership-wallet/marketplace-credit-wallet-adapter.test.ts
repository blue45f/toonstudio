/**
 * marketplace-credit-wallet-adapter.test.ts — 마켓 정산 seam 라이브 어댑터
 * 단위 테스트. 지갑 서비스는 스텁으로 대체한다 (DB 없음).
 * 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: 판매자 적립이 studio_credit 자산·marketplace 출처·정산 요청 키로
 * grantAsset을 호출하고, 예약·확정·해제를 그대로 위임한다.
 */
import { describe, expect, it, vi } from "vitest";

import { createMarketplaceCreditWallet } from "./marketplace-credit-wallet-adapter";

describe("marketplace-credit-wallet-adapter", () => {
  it("판매자 적립은 studio_credit·marketplace 출처·요청 키로 grantAsset을 호출한다", async () => {
    const grantAsset = vi.fn(async () => ({ granted: true }));
    const wallet = createMarketplaceCreditWallet({
      reserveStudioCredits: vi.fn(async () => ({
        id: "res-1",
        status: "reserved" as const,
        requestedAmount: 100,
        capturedAmount: 0,
      })),
      captureCreditReservation: vi.fn(async () => ({
        id: "res-1",
        status: "captured" as const,
        requestedAmount: 100,
        capturedAmount: 100,
      })),
      releaseCreditReservation: vi.fn(async () => ({})),
      grantAsset,
    });
    const result = await wallet.grantMarketplaceSellerCredits({
      userId: "seller-1",
      amount: 80,
      requestKey: "marketplace-credit:req-1",
      metadata: { releaseId: "release-1" },
    });
    expect(result).toEqual({ granted: true });
    expect(grantAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "seller-1",
        asset: "studio_credit",
        amount: 80,
        source: "marketplace",
        sourceKey: "marketplace-credit:req-1",
        sourceRef: "marketplace-credit:req-1",
        expiresAt: null,
      }),
    );
  });

  it("예약은 가변 가격 키·단위 가격 그대로 위임한다", async () => {
    const reserveStudioCredits = vi.fn(async () => ({
      id: "res-1",
      status: "reserved" as const,
      requestedAmount: 100,
      capturedAmount: 0,
    }));
    const wallet = createMarketplaceCreditWallet({
      reserveStudioCredits,
      captureCreditReservation: vi.fn(async () => ({
        id: "res-1",
        status: "captured" as const,
        requestedAmount: 100,
        capturedAmount: 100,
      })),
      releaseCreditReservation: vi.fn(async () => ({})),
      grantAsset: vi.fn(async () => ({ granted: true })),
    });
    await wallet.reserveStudioCredits({
      userId: "buyer-1",
      feature: "market.purchase",
      units: 100,
      idempotencyKey: "marketplace-credit:req-1",
      metadata: { releaseId: "release-1" },
    });
    expect(reserveStudioCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "buyer-1",
        feature: "market.purchase",
        units: 100,
      }),
    );
  });
});
