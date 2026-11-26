// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MembershipCreditGatePanel } from "./MembershipCreditGatePanel";

const getBillingModeMock = vi.hoisted(() => vi.fn());
const registerWaitlistMock = vi.hoisted(() => vi.fn());
const purchasePackMock = vi.hoisted(() => vi.fn());
const claimReferralMock = vi.hoisted(() => vi.fn());

vi.mock("@/platform/membership-wallet-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/platform/membership-wallet-client")>();
  return {
    ...actual,
    getMembershipBillingMode: getBillingModeMock,
    registerCreditWaitlistIntent: registerWaitlistMock,
    purchaseCreditPackWithGate: purchasePackMock,
    claimReferralBonusCredits: claimReferralMock,
  };
});

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (s: { userId: string | null }) => unknown) =>
    selector({ userId: "user-test-1" }),
}));

const formatter = new Intl.NumberFormat("ko-KR");

beforeEach(() => {
  getBillingModeMock.mockReset();
  registerWaitlistMock.mockReset();
  purchasePackMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("MembershipCreditGatePanel (어드민 유료화 토글 연동 UI)", () => {
  it("토글 OFF일 때 현금 결제·구독 버튼을 숨기고 웹툰·그림·댓글 활동 적립과 무료 출시 알림만 노출한다", async () => {
    getBillingModeMock.mockResolvedValue({
      paidOperationsEnabled: false,
      mode: "free-activity-beta",
      subscriptionsEnabled: false,
      creditPurchasesEnabled: false,
      krwPerCredit: 10,
      activityRewardExpiryDays: 90,
      monthlyActivityCreditPoolCap: 50_000,
      creditPacks: [{ id: "credit-pack-1000", credits: 1000, krwPrice: 10_000 }],
      subscriptionPlans: [
        {
          planId: "team",
          label: "Team",
          monthlyIncludedCredits: 20_000,
          monthlyPriceKrw: 29_000,
          targetRoleKo: "소규모 웹툰 제작팀",
        },
      ],
      activityCreditRewards: [
        {
          id: "webtoon",
          category: "serialization",
          activityKey: "creator.work.published",
          labelKo: "웹툰 작품·회차 공개 업로드",
          labelEn: "Publish webtoon",
          amountCredits: 50,
          dailyCapPerAccount: 1,
          expiryDays: 90,
        },
        {
          id: "illustration",
          category: "serialization",
          activityKey: "creator.work.published",
          labelKo: "그림·일러스트·작화 업로드",
          labelEn: "Upload artwork",
          amountCredits: 30,
          dailyCapPerAccount: 1,
          expiryDays: 90,
        },
        {
          id: "comment",
          category: "contribution",
          activityKey: "community.comment.created",
          labelKo: "작품 감상·피드백 댓글 작성",
          labelEn: "Comment",
          amountCredits: 5,
          dailyCapPerAccount: 1,
          expiryDays: 90,
        },
      ],
    });
    registerWaitlistMock.mockResolvedValue({
      registered: true,
      chargedKrw: 0,
      targetType: "plan",
      targetId: "team",
      alreadyRegistered: false,
      totalWaitlistCount: 1,
    });

    render(<MembershipCreditGatePanel formatter={formatter} />);

    expect(await screen.findByTestId("free-waitlist-controls")).toBeTruthy();
    expect(screen.queryByTestId("paid-credit-controls")).toBeNull();
    expect(screen.getByText("웹툰 작품·회차 공개 업로드")).toBeTruthy();
    expect(screen.getByText("그림·일러스트·작화 업로드")).toBeTruthy();
    expect(screen.getByText("작품 감상·피드백 댓글 작성")).toBeTruthy();

    fireEvent.click(screen.getByTestId("register-waitlist-btn"));
    expect(
      await screen.findByText(/출시 알림 사전예약\(결제 0원\)이 기록되었습니다/),
    ).toBeTruthy();
    expect(registerWaitlistMock).toHaveBeenCalledWith("plan", "team");
  });

  it.each([true, false])("어드민 토글 ON일 때 구매 가능 여부 %s에 맞춰 구매 버튼 또는 출시 알림을 표시한다", async (creditPurchasesEnabled) => {
    getBillingModeMock.mockResolvedValue({
      paidOperationsEnabled: true,
      mode: "paid-credit-active",
      subscriptionsEnabled: true,
      creditPurchasesEnabled,
      krwPerCredit: 10,
      activityRewardExpiryDays: 90,
      monthlyActivityCreditPoolCap: 50_000,
      creditPacks: [
        { id: "credit-pack-500", credits: 500, krwPrice: 5_000 },
        { id: "credit-pack-1000", credits: 1000, krwPrice: 10_000 },
      ],
      subscriptionPlans: [
        {
          planId: "creator",
          label: "Creator",
          monthlyIncludedCredits: 2_000,
          monthlyPriceKrw: 9_900,
          targetRoleKo: "개인 창작자",
        },
        {
          planId: "team",
          label: "Team",
          monthlyIncludedCredits: 20_000,
          monthlyPriceKrw: 29_000,
          targetRoleKo: "소규모 제작팀",
        },
      ],
      activityCreditRewards: [],
    });

    render(<MembershipCreditGatePanel formatter={formatter} />);

    expect(await screen.findByTestId("paid-credit-controls")).toBeTruthy();
    expect(screen.getByTestId("subscribe-plan-team")).toBeTruthy();
    expect(Boolean(screen.queryByTestId("free-waitlist-controls"))).toBe(!creditPurchasesEnabled);
    expect(Boolean(screen.queryByTestId("buy-credit-pack-credit-pack-1000"))).toBe(creditPurchasesEnabled);

    claimReferralMock.mockResolvedValue({
      claimed: true,
      inviteeCredits: 100,
      inviterCredits: 100,
      inviterUserId: "creator-lead",
      expiresAt: "2027-02-24T00:00:00.000Z",
    });
    fireEvent.change(screen.getByLabelText("동료 초대 코드 입력"), {
      target: { value: "TS-creator-lead" },
    });
    fireEvent.click(screen.getByTestId("claim-referral-btn"));
    expect(await screen.findByText(/동료 초대 보너스 \+100 C가 적립되었습니다/)).toBeTruthy();
    expect(claimReferralMock).toHaveBeenCalledWith("TS-creator-lead");
  });
});
