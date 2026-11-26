import { describe, expect, it, vi } from "vitest";

import {
  ACTIVITY_STUDIO_CREDIT_REWARD_CATALOG,
  MONTHLY_ACTIVITY_CREDIT_POOL_CAP,
} from "./activity-credit-wallet-adapter";
import { AppSettingPaidOperationsStore } from "./app-setting-paid-operations.store";
import {
  CreditBillingModeService,
  MembershipRewardDispatcherService,
  type ActivityCreditLedgerProbe,
  type WaitlistIntentStore,
} from "./credit-billing-mode.service";
import {
  InMemoryPaidOperationsSettingStore,
  PAID_OPERATIONS_DISABLED,
} from "./paid-operations-gate";

vi.mock("../../platform/database", () => ({
  appSettings: {},
  db: {},
  dbPool: { query: vi.fn() },
}));
vi.mock("../admin/admin-types", () => ({
  logAuditAction: vi.fn(async () => undefined),
}));

describe("AppSettingPaidOperationsStore (어드민 유료화 토글 영속 스토어)", () => {
  it("미설정 상태에서 기본값 false(무료·활동 크레딧 모드)를 반환하고 ON↔OFF 전환을 즉시 반영한다", async () => {
    let persisted: boolean | null = null;
    const store = new AppSettingPaidOperationsStore({
      read: async () => persisted,
      write: async (enabled) => {
        persisted = enabled;
      },
    });

    expect(await store.getPaidOperationsEnabled()).toBe(false);
    await store.setPaidOperationsEnabled(true);
    expect(await store.getPaidOperationsEnabled()).toBe(true);
    await store.setPaidOperationsEnabled(false);
    expect(await store.getPaidOperationsEnabled()).toBe(false);
  });

  it("DB 조회 오류 시 fail-closed(false)로 안전 폴백한다", async () => {
    const store = new AppSettingPaidOperationsStore({
      read: async () => {
        throw new Error("db unavailable");
      },
      write: async () => undefined,
    });
    expect(await store.getPaidOperationsEnabled()).toBe(false);
  });
});

describe("CreditBillingModeService (사업자등록 전 무결제 검증 ↔ 정식 유료 전환)", () => {
  function createWaitlistStub(): WaitlistIntentStore {
    const items: Array<{ userId: string; targetType: string; targetId: string }> = [];
    return {
      recordIntent: async (entry) => {
        const duplicate = items.some(
          (item) =>
            item.userId === entry.userId
            && item.targetType === entry.targetType
            && item.targetId === entry.targetId,
        );
        if (!duplicate) items.push(entry);
        return { totalCount: items.length, alreadyRegistered: duplicate };
      },
    };
  }

  it("어드민 토글 OFF일 때 구독·유료 크레딧 구매가 비활성화되고 무결제(0원) 사전예약만 기록된다", async () => {
    const grantAsset = vi.fn(async () => ({ granted: true, lotId: "lot-1", accountId: "acc-1", amount: 100 }));
    const gate = new InMemoryPaidOperationsSettingStore(false);
    const service = new CreditBillingModeService(
      { grantAsset },
      gate,
      createWaitlistStub(),
    );

    const mode = await service.getBillingMode();
    expect(mode.paidOperationsEnabled).toBe(false);
    expect(mode.mode).toBe("free-activity-beta");
    expect(mode.subscriptionsEnabled).toBe(false);
    expect(mode.creditPurchasesEnabled).toBe(false);
    expect(mode.activityCreditRewards).toEqual(ACTIVITY_STUDIO_CREDIT_REWARD_CATALOG);

    // 토글 OFF에서 유료 크레딧 팩 구매 시도는 403 PAID_OPERATIONS_DISABLED로 차단된다.
    await expect(
      service.purchaseCreditPack("user-1", {
        packId: "credit-pack-1000",
        requestId: "req-off-1",
        paymentConfirmationId: "pg-1",
      }),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: PAID_OPERATIONS_DISABLED }),
    });
    expect(grantAsset).not.toHaveBeenCalled();

    // 대신 0원 무결제 사전예약(수요 계측)은 정상 등록된다.
    const waitlist = await service.registerWaitlistIntent("user-1", {
      targetType: "plan",
      targetId: "team",
    });
    expect(waitlist.registered).toBe(true);
    expect(waitlist.chargedKrw).toBe(0);
    expect(waitlist.totalWaitlistCount).toBe(1);
  });

  it("어드민 토글 ON 전환 즉시 구독·유료 크레딧 충전이 열리고 결제 확인 후 만료 없는 크레딧이 적립된다", async () => {
    const grantAsset = vi.fn(async () => ({ granted: true, lotId: "lot-2", accountId: "acc-1", amount: 1000 }));
    const gate = new InMemoryPaidOperationsSettingStore(false);
    const service = new CreditBillingModeService(
      { grantAsset },
      gate,
      createWaitlistStub(),
    );

    await gate.setPaidOperationsEnabled(true);
    const mode = await service.getBillingMode();
    expect(mode.paidOperationsEnabled).toBe(true);
    expect(mode.mode).toBe("paid-credit-active");
    expect(mode.subscriptionsEnabled).toBe(true);
    expect(mode.creditPurchasesEnabled).toBe(true);

    const purchased = await service.purchaseCreditPack("user-1", {
      packId: "credit-pack-1000",
      requestId: "req-on-1",
      paymentConfirmationId: "pg-confirmed-1",
    });
    expect(purchased.credits).toBe(1_000);
    expect(purchased.krwPrice).toBe(10_000);
    expect(purchased.expiresAt).toBeNull();
    expect(grantAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        asset: "studio_credit",
        amount: 1_000,
        source: "purchase",
        expiresAt: null,
      }),
    );
  });
});

describe("MembershipRewardDispatcherService (웹툰·그림 업로드·댓글 활동 크레딧 보상)", () => {
  function createProbe(
    overrides: Partial<{
      duplicateSourceRef: boolean;
      grantedTodayCount: number;
      lastGrantedAtMs: number | null;
      monthlyPoolGrantedCredits: number;
      detectedKind: "webtoon" | "illustration";
    }> = {},
  ): ActivityCreditLedgerProbe {
    return {
      inspectGrantState: async () => ({
        duplicateSourceRef: overrides.duplicateSourceRef ?? false,
        grantedTodayCount: overrides.grantedTodayCount ?? 0,
        lastGrantedAtMs: overrides.lastGrantedAtMs ?? null,
        monthlyPoolGrantedCredits: overrides.monthlyPoolGrantedCredits ?? 0,
      }),
      detectWorkContentKind: async () => overrides.detectedKind ?? "illustration",
    };
  }

  it("웹툰 공개(+50C), 그림·일러스트 업로드(+30C), 게시글(+10C), 댓글(+5C) 보상을 90일 만료 studio_credit으로 적립한다", async () => {
    const grantActivityPoints = vi.fn(async () => ({ granted: true, points: 100 }));
    const grantRewardMilestone = vi.fn(async () => ({ granted: true }));
    const grantAsset = vi.fn(async () => ({ granted: true, lotId: "l", accountId: "a", amount: 50 }));

    const webtoonDispatcher = new MembershipRewardDispatcherService(
      { grantActivityPoints, grantRewardMilestone, grantAsset },
      createProbe({ detectedKind: "webtoon" }),
    );
    await webtoonDispatcher.grantActivityPoints({
      userId: "creator-1",
      activity: "creator.work.published",
      sourceRef: "work-webtoon-1",
    });
    expect(grantAsset).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: "creator-1",
        asset: "studio_credit",
        amount: 50,
        source: "activity:creator.work.published",
        reason: "웹툰 공개 활동 보너스 크레딧",
      }),
    );

    const artDispatcher = new MembershipRewardDispatcherService(
      { grantActivityPoints, grantRewardMilestone, grantAsset },
      createProbe({ detectedKind: "illustration" }),
    );
    await artDispatcher.grantActivityPoints({
      userId: "creator-2",
      activity: "creator.work.published",
      sourceRef: "work-art-1",
    });
    expect(grantAsset).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: "creator-2",
        asset: "studio_credit",
        amount: 30,
        reason: "그림·일러스트 공개 활동 보너스 크레딧",
      }),
    );

    await artDispatcher.grantActivityPoints({
      userId: "reader-1",
      activity: "community.comment.created",
      sourceRef: "comment-1",
    });
    expect(grantAsset).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: "reader-1",
        asset: "studio_credit",
        amount: 5,
        source: "activity:community.comment.created",
        reason: "작품·커뮤니티 댓글 활동 보너스 크레딧",
      }),
    );
  });

  it("일일 상한 도달 또는 월간 프로모션 풀 상한 초과 시 역마진 방어를 위해 크레딧 지급을 건너뛴다", async () => {
    const grantActivityPoints = vi.fn(async () => ({ granted: true, points: 3 }));
    const grantRewardMilestone = vi.fn(async () => ({ granted: true }));
    const grantAsset = vi.fn(async () => ({ granted: true, lotId: "l", accountId: "a", amount: 5 }));

    const cappedDaily = new MembershipRewardDispatcherService(
      { grantActivityPoints, grantRewardMilestone, grantAsset },
      createProbe({ grantedTodayCount: 1 }),
    );
    const dailyRes = await cappedDaily.tryGrantActivityStudioCredits({
      userId: "reader-1",
      activity: "community.comment.created",
      sourceRef: "comment-2",
    });
    expect(dailyRes.granted).toBe(false);
    expect(grantAsset).not.toHaveBeenCalled();

    const cappedMonthly = new MembershipRewardDispatcherService(
      { grantActivityPoints, grantRewardMilestone, grantAsset },
      createProbe({ monthlyPoolGrantedCredits: MONTHLY_ACTIVITY_CREDIT_POOL_CAP }),
    );
    const monthlyRes = await cappedMonthly.tryGrantActivityStudioCredits({
      userId: "creator-1",
      activity: "creator.work.published",
      sourceRef: "work-over-pool",
      metadata: { contentType: "webtoon" },
    });
    expect(monthlyRes.granted).toBe(false);
    expect(monthlyRes.reason).toBe("monthly_promo_pool_cap_reached");
    expect(grantAsset).not.toHaveBeenCalled();
  });

  it("공유 검수·파티 작업방 개설(+20C), 마일스톤(+50C/+100C), 동료 추천 양방향(+100C) 크레딧을 정확히 적립한다", async () => {
    const grantActivityPoints = vi.fn(async () => ({ granted: true, points: 20 }));
    const grantRewardMilestone = vi.fn(async () => ({ granted: true }));
    const grantAsset = vi.fn(async () => ({
      granted: true,
      lotId: "l",
      accountId: "a",
      amount: 100,
    }));

    const dispatcher = new MembershipRewardDispatcherService(
      { grantActivityPoints, grantRewardMilestone, grantAsset },
      createProbe(),
    );

    await dispatcher.grantActivityPoints({
      userId: "pd-1",
      activity: "creator.work.created",
      sourceRef: "party-room-1",
    });
    expect(grantAsset).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: "pd-1",
        asset: "studio_credit",
        amount: 20,
        source: "activity:creator.work.created",
      }),
    );

    await dispatcher.grantRewardMilestone(
      "beta-tester-1",
      "beta-feedback-accepted",
      "feedback-2923",
    );
    expect(grantAsset).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: "beta-tester-1",
        asset: "studio_credit",
        amount: 100,
        source: "activity:milestone.beta-feedback-accepted",
      }),
    );

    const claimed = new Set<string>();
    const billingService = new CreditBillingModeService(
      { grantAsset },
      { getPaidOperationsEnabled: async () => false, setPaidOperationsEnabled: async () => {} },
      { recordIntent: async () => ({ totalCount: 1, alreadyRegistered: false }) },
      {
        hasClaimed: async (id) => claimed.has(id),
        recordClaim: async (r) => {
          claimed.add(r.inviteeUserId);
          return { totalClaims: claimed.size };
        },
      },
      createProbe(),
    );

    const refRes = await billingService.claimReferralBonus("assistant-new", {
      inviterCode: "TS-main-author",
    });
    expect(refRes.claimed).toBe(true);
    expect(refRes.inviteeCredits).toBe(100);
    expect(refRes.inviterCredits).toBe(100);
    expect(refRes.inviterUserId).toBe("main-author");
    await expect(
      billingService.claimReferralBonus("assistant-new", {
        inviterCode: "TS-main-author",
      }),
    ).rejects.toThrow();
  });
});
