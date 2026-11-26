import { api } from "@/platform/api";

export type EconomyPolicy = {
  mode: "dual-wallet-beta";
  paymentsEnabled: boolean;
  studioCreditsEnabled: boolean;
  membershipCreditsEnabled: boolean;
  creditPurchasesEnabled: boolean;
  publicAsset: "reward_point";
  pointExpiryDays: number | null;
  purchasedCreditExpiryDays: number | null;
  fairUseLimitsApplyDuringBeta: boolean;
};

export type MembershipEntitlementValue = number | boolean;

export type MembershipPlanView = {
  id: "free" | "creator" | "pro" | "team";
  label: string;
  description: string;
  entitlements: Record<string, MembershipEntitlementValue>;
};

export type ActivityRewardView = {
  key: string;
  label: string;
  points: number;
  dailyGrantLimit: number;
  cooldownSeconds: number;
  claimMode: "server" | "client";
};
export type MembershipCatalog = {
  economy: EconomyPolicy;
  plans: MembershipPlanView[];
  activityRewards: ActivityRewardView[];
  rewardMilestones: Record<string, { points: number; label: string }>;
  policyNotes: {
    paymentsEnabled: boolean;
    pointsAreCashEquivalent: boolean;
    fairUseLimitsApplyDuringBeta: boolean;
  };
};

export type WalletBalanceView = {
  available: number;
  reserved: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  bySource: Record<string, number>;
};

export type MembershipGrantView = {
  id: string;
  planId: string;
  source: string;
  grantKey: string;
  sourceRef?: string | null;
  startsAt: string;
  endsAt?: string | null;
  autoRenew: boolean;
};
export type MembershipOverview = {
  membership: {
    planId: "free" | "creator" | "pro" | "team";
    plan: MembershipPlanView;
    grants: MembershipGrantView[];
  };
  economy: EconomyPolicy;
  wallet: {
    points: WalletBalanceView;
    studioCredits: WalletBalanceView;
  };
  creditCycle: {
    monthlyIncluded: number;
    dailyLimit: number;
    spentToday: number;
    remainingToday: number;
    monthlyResetsAt: string;
    dailyResetsAt: string;
  };
  levels: {
    creatorLevel: string;
    trustLevel: string;
    sellerLevel: string;
    trustScore: number;
    updatedAt?: string;
  };
  creatorProgress: {
    metrics: {
      verifiedCreator: boolean;
      publishedWorks: number;
      activityPoints: number;
    };
    automaticLevel: string;
    effectiveLevel: string;
    manuallyManaged: boolean;
  };
  recentLedger: Array<{
    asset: "reward_point" | "studio_credit";
    id: string;
    entryType: string;
    amount: number;
    deltaAvailable: number;
    deltaReserved: number;
    reason: string;
    referenceKey?: string | null;
    createdAt: string;
  }>;
};

export function getMembershipCatalog(): Promise<MembershipCatalog> {
  return api.get<MembershipCatalog>("/membership/catalog");
}
export function getMembershipOverview(): Promise<MembershipOverview> {
  return api.get<MembershipOverview>("/membership/overview");
}

export function getMembershipEntitlements(): Promise<{
  planId: MembershipOverview["membership"]["planId"];
  entitlements: Record<string, MembershipEntitlementValue>;
}> {
  return api.get("/membership/entitlements");
}

export type MembershipSpendResult = {
  spendEventId: string;
  balance: WalletBalanceView;
};

/**
 * spend 이후 잔액 갱신 흐름: 이 호출의 응답 balance로 즉시 갱신하고,
 * 필요하면 getMembershipOverview()를 다시 불러 전체 지갑 상태를 동기화한다.
 * 새 문자열이 필요 없어 i18n 카탈로그·builtins에는 손대지 않는다.
 */
export function spendMembershipCredits(
  resourceId: string,
  pointPrice: number,
  requestId: string,
): Promise<MembershipSpendResult> {
  return api.post<MembershipSpendResult>("/membership/wallet/spend", {
    resourceId,
    pointPrice,
    requestId,
  });
}

export type MarketplaceCreditPaymentResult = {
  buyerPaymentId: string;
  buyerId: string;
  sellerId: string;
  releaseId: string;
  priceCredits: number;
  sellerCredits: number;
  platformFeeCredits: number;
  entitled: true;
  productId: string;
  krwAmount: number;
};

export type DecorationCreditItemView = {
  id: string;
  priceCredits: number;
  note: string;
};

export type DecorationCreditPurchaseResult = {
  purchaseId: string;
  itemId: string;
  priceCredits: number;
  charged: true;
};

/**
 * 2단계 수익화 가동 (2026-10-25) — 마켓·꾸미기 구매 흐름의 화면 측 연결점.
 * 가격은 서버 권위이다: 마켓 결제는 상품 식별자만 보내고 가격·판매자는
 * 서버 판정에서 결정되며, 꾸미기 결제는 아이템 식별자만 보내고 가격은
 * 서버 카탈로그에서 결정된다. 결제 뒤에는 getMembershipOverview()를
 * 다시 불러 잔액·원장을 동기화한다. 새 문자열이 필요 없어 i18n
 * 카탈로그·builtins에는 손대지 않는다 (spend 함수와 동일 패턴).
 */
export function payMarketplaceWithCredits(
  releaseId: string,
  requestId: string,
): Promise<MarketplaceCreditPaymentResult> {
  return api.post<MarketplaceCreditPaymentResult>(
    "/membership/marketplace/credit-payment",
    {
      releaseId,
      requestId,
    },
  );
}

export function getDecorationCreditCatalog(): Promise<
  DecorationCreditItemView[]
> {
  return api.get<DecorationCreditItemView[]>(
    "/membership/decorations/catalog",
  );
}

export function purchaseDecorationWithCredits(
  itemId: string,
  requestId: string,
): Promise<DecorationCreditPurchaseResult> {
  return api.post<DecorationCreditPurchaseResult>(
    "/membership/decorations/credit-purchase",
    {
      itemId,
      requestId,
    },
  );
}

export function claimMembershipActivity(
  activity: string,
  sourceRef: string,
  metadata: Record<string, unknown> = {},
): Promise<{
  granted: boolean;
  points: number;
  capped?: boolean;
  cooldown?: boolean;
  idempotent?: boolean;
  remainingDailyGrants?: number;
}> {
  return api.post("/membership/activity/claim", {
    activity,
    sourceRef,
    metadata,
  });
}

export type CreditPackView = {
  id: string;
  credits: number;
  krwPrice: number;
};

export type SubscriptionCreditPlanView = {
  planId: "creator" | "pro" | "team";
  label: string;
  monthlyIncludedCredits: number;
  monthlyPriceKrw: number;
  targetRoleKo: string;
};

export type ActivityStudioCreditRewardView = {
  id: "webtoon" | "illustration" | "workspace" | "post" | "comment";
  category: "serialization" | "contribution";
  activityKey: string;
  labelKo: string;
  labelEn: string;
  amountCredits: number;
  dailyCapPerAccount: number;
  expiryDays: number;
};

export type MilestoneStudioCreditRewardView = {
  id:
    | "welcome"
    | "first-public-work"
    | "beta-feedback-accepted"
    | "bug-report-accepted"
    | "referral-invite";
  labelKo: string;
  labelEn: string;
  amountCredits: number;
  capRuleKo: string;
  capRuleEn: string;
  expiryDays: number;
};

export type MembershipBillingModeView = {
  paidOperationsEnabled: boolean;
  mode: "free-activity-beta" | "paid-credit-active";
  subscriptionsEnabled: boolean;
  creditPurchasesEnabled: boolean;
  krwPerCredit: number;
  activityRewardExpiryDays: number;
  monthlyActivityCreditPoolCap: number;
  creditPacks: CreditPackView[];
  subscriptionPlans: SubscriptionCreditPlanView[];
  activityCreditRewards: ActivityStudioCreditRewardView[];
  milestoneCreditRewards?: MilestoneStudioCreditRewardView[];
};

export function getMembershipBillingMode(): Promise<MembershipBillingModeView> {
  return api.get<MembershipBillingModeView>("/membership/billing-mode");
}

export function registerCreditWaitlistIntent(
  targetType: "plan" | "credit-pack",
  targetId: string,
): Promise<{
  registered: boolean;
  chargedKrw: 0;
  targetType: "plan" | "credit-pack";
  targetId: string;
  alreadyRegistered: boolean;
  totalWaitlistCount: number;
}> {
  return api.post("/membership/waitlist-intent", { targetType, targetId });
}

export function claimReferralBonusCredits(inviterCode: string): Promise<{
  claimed: true;
  inviteeCredits: number;
  inviterCredits: number;
  inviterUserId: string;
  expiresAt: string;
}> {
  return api.post("/membership/referral-claim", { inviterCode });
}

export function purchaseCreditPackWithGate(
  packId: string,
  requestId: string,
  paymentConfirmationId?: string,
): Promise<{
  purchaseIntentId: string;
  packId: string;
  credits: number;
  krwPrice: number;
  granted: true;
  expiresAt: null;
}> {
  return api.post("/membership/credit-packs/purchase", {
    packId,
    requestId,
    paymentConfirmationId,
  });
}
