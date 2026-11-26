/**
 * activity-credit-wallet-adapter.ts — 활동·온보딩·추천 보상 studio_credit 라이브 지갑 어댑터.
 *
 * credit-activity-rewards.ts에서 seam으로 정의된 `CreditActivityRewardWallet`을
 * `MembershipWalletService.grantAsset` 공개 경로에 연결한다.
 * MembershipWalletService 본문(크기 래칫 기준선)은 수정하지 않는다.
 *
 * 역마진 방어 원칙:
 *  - 무상 활동·온보딩·추천 크레딧은 모두 90일 유효기간(`CREDIT_ACTIVITY_REWARD_EXPIRY_DAYS`)과
 *    높은 차감 우선순위(`source = "activity:<key>"` -> priority 20)를 가져,
 *    유료 충전 크레딧(`priority 900`, 만료 없음)보다 먼저 소진·만료된다.
 *  - 계정별 규칙당 상한 + 동일 sourceRef 중복 지급 차단 +
 *    월간 전체 무상 프로모션 크레딧 발행 상한(`MONTHLY_ACTIVITY_CREDIT_POOL_CAP`)으로
 *    외부 유료 API 원가 역마진을 원천 차단한다.
 */

import type {
  ActivityPointKey,
  RewardMilestoneKey,
} from "../../../../../packages/core/src/membership-wallet";
import type {
  CreditActivityCategory,
  CreditActivityRewardWallet,
} from "./credit-activity-rewards";

/** 월간 플랫폼 전체 무상 활동·추천·온보딩 크레딧 발행 상한 (1C=10원 명목 기준, 실원가 월 1.5만 원 이내). */
export const MONTHLY_ACTIVITY_CREDIT_POOL_CAP = 50_000;

export const REFERRAL_BONUS_CREDITS = 100;

export type ActivityCreditContentKind =
  | "webtoon"
  | "illustration"
  | "workspace"
  | "post"
  | "comment";

export interface ActivityStudioCreditCatalogItem {
  readonly id: ActivityCreditContentKind;
  readonly category: CreditActivityCategory;
  readonly activityKey: ActivityPointKey;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly amountCredits: number;
  readonly dailyCapPerAccount: 1;
  readonly expiryDays: 90;
}

export type MilestoneCreditRewardId =
  | "welcome"
  | "first-public-work"
  | "beta-feedback-accepted"
  | "bug-report-accepted"
  | "referral-invite";

export interface MilestoneStudioCreditCatalogItem {
  readonly id: MilestoneCreditRewardId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly amountCredits: number;
  readonly capRuleKo: string;
  readonly capRuleEn: string;
  readonly expiryDays: 90;
}

/**
 * 일일 창작·협업·커뮤니티 활동 보상 크레딧 지급표:
 *  - 웹툰 회차·단편 공개 업로드: +50 C (일 1회)
 *  - 그림·일러스트·배경 업로드: +30 C (일 1회)
 *  - 공유 검수·구인 광장 파티 작업방 개설: +20 C (일 1회)
 *  - 커뮤니티 창작 게시글 작성: +10 C (일 1회)
 *  - 작품·커뮤니티 피드백 댓글 작성: +5 C (일 1회)
 */
export const ACTIVITY_STUDIO_CREDIT_REWARD_CATALOG: readonly ActivityStudioCreditCatalogItem[] =
  Object.freeze([
    {
      id: "webtoon",
      category: "serialization",
      activityKey: "creator.work.published",
      labelKo: "웹툰 작품·회차 공개 업로드",
      labelEn: "Publish a webtoon episode or short",
      amountCredits: 50,
      dailyCapPerAccount: 1,
      expiryDays: 90,
    },
    {
      id: "illustration",
      category: "serialization",
      activityKey: "creator.work.published",
      labelKo: "그림·일러스트·작화 업로드",
      labelEn: "Upload an illustration or artwork",
      amountCredits: 30,
      dailyCapPerAccount: 1,
      expiryDays: 90,
    },
    {
      id: "workspace",
      category: "serialization",
      activityKey: "creator.work.created",
      labelKo: "새 공유 검수·파티 작업방 개설",
      labelEn: "Create a shared review or party workspace",
      amountCredits: 20,
      dailyCapPerAccount: 1,
      expiryDays: 90,
    },
    {
      id: "post",
      category: "contribution",
      activityKey: "community.post.created",
      labelKo: "커뮤니티 창작글·작업기 게시",
      labelEn: "Publish a community creative post",
      amountCredits: 10,
      dailyCapPerAccount: 1,
      expiryDays: 90,
    },
    {
      id: "comment",
      category: "contribution",
      activityKey: "community.comment.created",
      labelKo: "작품 감상·피드백 댓글 작성",
      labelEn: "Leave a constructive comment",
      amountCredits: 5,
      dailyCapPerAccount: 1,
      expiryDays: 90,
    },
  ]);

/**
 * 온보딩·안정성 검증·동료 추천 1회성 보너스 크레딧 지급표 (90일 유효, 비현금 프로모션):
 *  - 신규 가입 온보딩: +50 C (계정당 1회)
 *  - 첫 작품·회차 공개 달성: +100 C (계정당 1회)
 *  - 동료 작가·어시스턴트 초대 합류(양방향 추천): +100 C (초대자·수락자 각각 지급)
 *  - 베타 안정성 피드백 채택: +100 C (건별 심사 채택 시)
 *  - 복구·검수 버그 제보 채택: +100 C (건별 심사 채택 시)
 */
export const MILESTONE_STUDIO_CREDIT_REWARD_CATALOG: readonly MilestoneStudioCreditCatalogItem[] =
  Object.freeze([
    {
      id: "welcome",
      labelKo: "신규 가입 첫 시작 보너스",
      labelEn: "Welcome starter bonus",
      amountCredits: 50,
      capRuleKo: "계정당 1회",
      capRuleEn: "Once per account",
      expiryDays: 90,
    },
    {
      id: "first-public-work",
      labelKo: "첫 작품·회차 공개 달성",
      labelEn: "First public release milestone",
      amountCredits: 100,
      capRuleKo: "계정당 1회",
      capRuleEn: "Once per account",
      expiryDays: 90,
    },
    {
      id: "referral-invite",
      labelKo: "동료 작가·어시 초대 합류 (양방향)",
      labelEn: "Teammate referral bonus (both sides)",
      amountCredits: REFERRAL_BONUS_CREDITS,
      capRuleKo: "피초대 계정당 1회",
      capRuleEn: "Once per invited account",
      expiryDays: 90,
    },
    {
      id: "beta-feedback-accepted",
      labelKo: "베타 안정성·검수 피드백 채택",
      labelEn: "Accepted stability feedback reward",
      amountCredits: 100,
      capRuleKo: "운영 검토 채택 건별",
      capRuleEn: "Per accepted feedback",
      expiryDays: 90,
    },
    {
      id: "bug-report-accepted",
      labelKo: "저장·복구 버그 제보 채택",
      labelEn: "Accepted recovery bug report reward",
      amountCredits: 100,
      capRuleKo: "운영 검토 채택 건별",
      capRuleEn: "Per accepted report",
      expiryDays: 90,
    },
  ]);

export function resolveActivityCreditSpec(
  activityKey: ActivityPointKey,
  contentKind?: "webtoon" | "illustration",
): {
  category: CreditActivityCategory;
  amountCredits: number;
  contentKind: ActivityCreditContentKind;
  reason: string;
} | null {
  if (activityKey === "creator.work.published") {
    if (contentKind === "webtoon") {
      return {
        category: "serialization",
        amountCredits: 50,
        contentKind: "webtoon",
        reason: "웹툰 공개 활동 보너스 크레딧",
      };
    }
    return {
      category: "serialization",
      amountCredits: 30,
      contentKind: "illustration",
      reason: "그림·일러스트 공개 활동 보너스 크레딧",
    };
  }
  if (activityKey === "creator.work.created") {
    return {
      category: "serialization",
      amountCredits: 20,
      contentKind: "workspace",
      reason: "공유 검수·파티 작업방 개설 보너스 크레딧",
    };
  }
  if (activityKey === "community.post.created") {
    return {
      category: "contribution",
      amountCredits: 10,
      contentKind: "post",
      reason: "커뮤니티 창작글 게시 보너스 크레딧",
    };
  }
  if (activityKey === "community.comment.created") {
    return {
      category: "contribution",
      amountCredits: 5,
      contentKind: "comment",
      reason: "작품·커뮤니티 댓글 활동 보너스 크레딧",
    };
  }
  return null;
}

export function resolveMilestoneCreditSpec(
  milestone: RewardMilestoneKey,
): { amountCredits: number; reason: string } | null {
  switch (milestone) {
    case "welcome":
      return { amountCredits: 50, reason: "신규 가입 첫 시작 보너스 크레딧" };
    case "first-public-work":
      return { amountCredits: 100, reason: "첫 작품 공개 달성 보너스 크레딧" };
    case "beta-feedback-accepted":
      return { amountCredits: 100, reason: "베타 안정성 피드백 채택 보너스 크레딧" };
    case "bug-report-accepted":
      return { amountCredits: 100, reason: "저장·복구 버그 제보 채택 보너스 크레딧" };
    default:
      return null;
  }
}

export interface ActivityGrantAssetWallet {
  grantAsset(input: {
    userId: string;
    asset: "studio_credit";
    amount: number;
    source: string;
    sourceKey: string;
    sourceRef?: string | null;
    expiresAt?: Date | null;
    reason: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ granted: boolean }>;
}

export function createActivityCreditWallet(
  wallet: ActivityGrantAssetWallet,
  reason = "창작·커뮤니티 활동 보상 크레딧",
): CreditActivityRewardWallet {
  return {
    grantActivityStudioCredits: async (input) => {
      const activityKey =
        typeof input.metadata?.activityKey === "string"
          ? input.metadata.activityKey
          : "activity";
      const result = await wallet.grantAsset({
        userId: input.userId,
        asset: "studio_credit",
        amount: input.amountCredits,
        source: `activity:${activityKey}`,
        sourceKey: input.sourceKey,
        sourceRef: input.idempotencyKey,
        expiresAt: input.expiresAt,
        reason,
        metadata: input.metadata ?? {},
      });
      return { granted: result.granted };
    },
  };
}
