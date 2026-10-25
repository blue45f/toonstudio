/**
 * studio-3d-credit-charge.test.ts — 서버 3D 생성 크레딧 차감 오케스트레이션 단위 테스트.
 * 지갑은 스텁으로 대체한다 (DB 없음). 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: BYOK 제외, 운영자 미부담 제외, 운영자 부담 경로 예약(단가 키
 * ai.3d.generate·멱등키 접두사), 제출 성공 캡처 / 제출 실패 해제,
 * 지갑 미주입 시 건너뜀.
 */
import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_3D_CREDIT_FEATURE,
  Studio3dCreditError,
  beginStudio3dCreditCharge,
  settleStudio3dCreditCharge,
  shouldChargeStudio3dCredits,
  studio3dCreditIdempotencyKey,
  type Studio3dCreditWallet,
} from "./studio-3d-credit-charge";
import { InMemoryPaidOperationsSettingStore } from "../membership-wallet/paid-operations-gate";

/** 기존 성공 경로용 마스터 ON 스토어 (토글 테스트는 별도 인스턴스 사용). */
const GATE_ON = new InMemoryPaidOperationsSettingStore(true);

function stubWallet() {
  const calls = { reserve: 0, capture: 0, release: 0 };
  const wallet: Studio3dCreditWallet = {
    reserveStudioCredits: vi.fn(async () => {
      calls.reserve += 1;
      return { id: "res-3d-1", status: "reserved" };
    }),
    captureCreditReservation: vi.fn(async () => {
      calls.capture += 1;
      return { id: "res-3d-1", status: "captured" };
    }),
    releaseCreditReservation: vi.fn(async () => {
      calls.release += 1;
      return { id: "res-3d-1", status: "released" };
    }),
  };
  return { wallet, calls };
}

describe("studio-3d-credit-charge 차감 판정", () => {
  it("사용자 키가 있으면(BYOK) 차감하지 않는다", () => {
    expect(
      shouldChargeStudio3dCredits({
        providerApiKey: "user-key-1234567890",
        operatorFunded: true,
      }),
    ).toBe(false);
  });

  it("운영자 부담이 아니면 차감하지 않는다", () => {
    expect(
      shouldChargeStudio3dCredits({
        providerApiKey: undefined,
        operatorFunded: false,
      }),
    ).toBe(false);
  });

  it("사용자 키가 없고 운영자 부담일 때만 차감한다", () => {
    expect(
      shouldChargeStudio3dCredits({
        providerApiKey: undefined,
        operatorFunded: true,
      }),
    ).toBe(true);
  });

  it("단가 키는 ai.3d.generate이다", () => {
    expect(STUDIO_3D_CREDIT_FEATURE).toBe("ai.3d.generate");
  });

  it("멱등키는 접두사 + 요청 식별자이며 200자 상한 내이다", () => {
    const key = studio3dCreditIdempotencyKey("studio-3d-abcdef0123456789abcdef");
    expect(key.startsWith("studio-3d-credit:")).toBe(true);
    expect(key.length).toBeLessThanOrEqual(200);
  });
});

describe("studio-3d-credit-charge 예약·정산", () => {
  it("운영자 부담 경로는 예약하고 제출 성공 시 캡처한다", async () => {
    const { wallet, calls } = stubWallet();
    const charge = await beginStudio3dCreditCharge(wallet, {
      userId: "user-1",
      requestId: "studio-3d-abcdef0123456789abcdef",
      mode: "text-to-3d",
      providerApiKey: undefined,
      operatorFunded: true,
    }, GATE_ON);
    expect(charge.charged).toBe(true);
    expect(charge.reservationId).toBe("res-3d-1");
    expect(charge.feature).toBe("ai.3d.generate");
    expect(calls.reserve).toBe(1);
    await settleStudio3dCreditCharge(wallet, charge, { submitted: true });
    expect(calls.capture).toBe(1);
    expect(calls.release).toBe(0);
  });

  it("제출 실패 시 해제한다", async () => {
    const { wallet, calls } = stubWallet();
    const charge = await beginStudio3dCreditCharge(wallet, {
      userId: "user-1",
      requestId: "studio-3d-abcdef0123456789abcdef",
      mode: "image-to-3d",
      providerApiKey: undefined,
      operatorFunded: true,
    });
    await settleStudio3dCreditCharge(wallet, charge, { submitted: false });
    expect(calls.capture).toBe(0);
    expect(calls.release).toBe(1);
  });

  it("BYOK 경로는 예약하지 않는다", async () => {
    const { wallet, calls } = stubWallet();
    const charge = await beginStudio3dCreditCharge(wallet, {
      userId: "user-1",
      requestId: "studio-3d-abcdef0123456789abcdef",
      mode: "text-to-3d",
      providerApiKey: "user-key-1234567890",
      operatorFunded: true,
    });
    expect(charge.charged).toBe(false);
    expect(calls.reserve).toBe(0);
  });

  it("지갑 미주입 시 건너뛴다", async () => {
    const charge = await beginStudio3dCreditCharge(null, {
      userId: "user-1",
      requestId: "studio-3d-abcdef0123456789abcdef",
      mode: "text-to-3d",
      providerApiKey: undefined,
      operatorFunded: true,
    }, GATE_ON);
    expect(charge.charged).toBe(false);
    await settleStudio3dCreditCharge(null, charge, { submitted: true });
  });
});

describe("studio-3d-credit-charge 유료 운영 게이트", () => {
  it("스토어 미주입(기본 OFF)에서는 운영자 부담 예약이 거부되고 지갑을 호출하지 않는다", async () => {
    const { wallet, calls } = stubWallet();
    const error = await beginStudio3dCreditCharge(wallet, {
      userId: "user-1",
      requestId: "studio-3d-abcdef0123456789abcdef",
      mode: "text-to-3d",
      providerApiKey: undefined,
      operatorFunded: true,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Studio3dCreditError);
    expect(error).toMatchObject({
      code: "PAID_OPERATIONS_DISABLED",
      status: 403,
    });
    expect(calls.reserve).toBe(0);
  });

  it("마스터 OFF 스토어에서는 운영자 부담 예약이 거부된다", async () => {
    const { wallet, calls } = stubWallet();
    const gateOff = new InMemoryPaidOperationsSettingStore(false);
    await expect(
      beginStudio3dCreditCharge(
        wallet,
        {
          userId: "user-1",
          requestId: "studio-3d-abcdef0123456789abcdef",
          mode: "text-to-3d",
          providerApiKey: undefined,
          operatorFunded: true,
        },
        gateOff,
      ),
    ).rejects.toMatchObject({
      code: "PAID_OPERATIONS_DISABLED",
      status: 403,
    });
    expect(calls.reserve).toBe(0);
  });

  it("게이트 OFF라도 BYOK 경로는 게이트 검사 없이 차감하지 않고 통과한다 (무료 경로)", async () => {
    const { wallet, calls } = stubWallet();
    const gateOff = new InMemoryPaidOperationsSettingStore(false);
    const charge = await beginStudio3dCreditCharge(
      wallet,
      {
        userId: "user-1",
        requestId: "studio-3d-abcdef0123456789abcdef",
        mode: "text-to-3d",
        providerApiKey: "user-key-1234567890",
        operatorFunded: true,
      },
      gateOff,
    );
    expect(charge.charged).toBe(false);
    expect(calls.reserve).toBe(0);
  });

  it("토글 ON→OFF→ON 변경이 호출마다 즉시 반영된다 (캐시 없음)", async () => {
    const { wallet } = stubWallet();
    const store = new InMemoryPaidOperationsSettingStore(false);
    const input = {
      userId: "user-1",
      requestId: "studio-3d-abcdef0123456789abcdef",
      mode: "text-to-3d",
      providerApiKey: undefined,
      operatorFunded: true,
    };
    await expect(beginStudio3dCreditCharge(wallet, input, store)).rejects
      .toMatchObject({ code: "PAID_OPERATIONS_DISABLED" });
    await store.setPaidOperationsEnabled(true);
    const charge = await beginStudio3dCreditCharge(wallet, input, store);
    expect(charge.charged).toBe(true);
    await store.setPaidOperationsEnabled(false);
    await expect(beginStudio3dCreditCharge(wallet, input, store)).rejects
      .toMatchObject({ code: "PAID_OPERATIONS_DISABLED" });
  });
});
