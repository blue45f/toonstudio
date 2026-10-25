/**
 * growth-milestones.ts — 확산 장치: 첫 작품·첫 회차·첫 마켓 등록 유도
 * 마일스톤 체크리스트 (5단계, 2026-10-25).
 * Nest에 의존하지 않는 순수 모듈이다.
 *
 * 연결 규칙 (코디네이터 결정, 반드시 지킬 것):
 *  - 마일스톤의 보상 연결은 베이스 활동 보상 규칙
 *    (`credit-activity-rewards.ts`의 CREDIT_ACTIVITY_REWARD_RULES)에
 *    이미 있는 키에만 한다. 새 보상 키를 만들지 않는다.
 *  - 첫 작품·첫 회차는 모두 연재 키 `creator.work.published`에 연결한다.
 *    베이스에 연재 키가 이것 하나뿐이기 때문이다. 두 마일스톤은
 *    sourceRef(작품 식별자·회차 식별자)가 달라 멱등키는 다르지만,
 *    베이스 규칙이 규칙별·계정별·일자별 1회 상한이므로 같은 날 두
 *    마일스톤 보상을 모두 받으려 하면 두 번째 지급은 일 상한으로
 *    거부될 수 있다. 체크리스트 완료 판정과 보상 지급 성공은 별개다:
 *    완료는 이벤트 발생으로 확정되고, 지급 거부는 기존 보상 API의
 *    거부 사유 그대로 호출부에 전달된다.
 *  - 첫 마켓 등록은 베이스 규칙에 키가 없으므로 보상 연결을 하지
 *    않는다. 마일스톤 표시만 하고, 보상 상태는
 *    "reward-key-pending"으로 둔다. "마켓 등록 보상 키 신설"은
 *    제품 결정 대기 항목이다 (STAGE56.md 참조).
 *
 * 이 모듈은 보상 지급 자체를 수행하지 않는다. 보상 지급은 기존
 * `buildActivityRewardGrant` + `grantActivityReward`가 담당하고, 이
 * 모듈은 마일스톤 정의·완료 판정·보상 연결 해석만 제공한다.
 * DB 테이블·마이그레이션 신설 없음, 유료 경로 무접촉.
 */

import {
  CREDIT_ACTIVITY_REWARD_RULES,
  findActivityRewardRule,
  type CreditActivityCategory,
} from "./credit-activity-rewards";

/** 확산 마일스톤 식별자 (체크리스트 표시 순서와 동일). */
export const GROWTH_MILESTONE_IDS = [
  "first-work",
  "first-episode",
  "first-market-listing",
] as const;

export type GrowthMilestoneId = (typeof GROWTH_MILESTONE_IDS)[number];

/** 마일스톤의 보상 연결 상태. */
export type GrowthMilestoneRewardStatus =
  /** 베이스 규칙 키에 연결됨 (지급은 기존 보상 API로). */
  | "linked"
  /** 베이스 규칙에 키가 없어 표시만 함 (제품 결정 대기). */
  | "reward-key-pending";

export interface GrowthMilestoneRewardLink {
  readonly category: CreditActivityCategory;
  /** 기존 활동 키. 연결 없음이면 null이다. */
  readonly activityKey: string | null;
  readonly status: GrowthMilestoneRewardStatus;
}

export interface GrowthMilestoneDefinition {
  readonly id: GrowthMilestoneId;
  /** 웹 표시 문자열 키 (growth.milestone.* 네임스페이스). */
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly reward: GrowthMilestoneRewardLink;
}

function linkedReward(
  category: CreditActivityCategory,
  activityKey: string,
): GrowthMilestoneRewardLink {
  return { category, activityKey, status: "linked" };
}

function pendingReward(
  category: CreditActivityCategory,
): GrowthMilestoneRewardLink {
  return { category, activityKey: null, status: "reward-key-pending" };
}

/**
 * 마일스톤 정의표. 첫 작품·첫 회차는 연재 키에만 연결하고,
 * 첫 마켓 등록은 보상 연결 없이 표시만 한다.
 */
export const GROWTH_MILESTONES: readonly GrowthMilestoneDefinition[] = [
  {
    id: "first-work",
    titleKey: "growth.milestone.firstWork.title",
    descriptionKey: "growth.milestone.firstWork.description",
    reward: linkedReward("serialization", "creator.work.published"),
  },
  {
    id: "first-episode",
    titleKey: "growth.milestone.firstEpisode.title",
    descriptionKey: "growth.milestone.firstEpisode.description",
    reward: linkedReward("serialization", "creator.work.published"),
  },
  {
    id: "first-market-listing",
    titleKey: "growth.milestone.firstMarketListing.title",
    descriptionKey: "growth.milestone.firstMarketListing.description",
    // 카테고리는 마켓 등록의 성격상 event로 두되, 베이스 event 규칙도
    // 미매핑이므로 activityKey는 null이다. 임의 매핑 금지.
    reward: pendingReward("event"),
  },
] as const;

export function findGrowthMilestone(
  id: unknown,
): GrowthMilestoneDefinition | null {
  if (typeof id !== "string") return null;
  return GROWTH_MILESTONES.find((item) => item.id === id) ?? null;
}

/**
 * 마일스톤 정의의 보상 연결이 베이스 규칙표와 어긋나는지 검증한다.
 * linked로 표기된 연결은 반드시 베이스 규칙에 존재해야 하고,
 * pending 연결은 activityKey가 null이어야 한다. 베이스 규칙이
 * 바뀌면 이 검사가 먼저 실패해 임의 연결을 막는다.
 */
export function validateGrowthMilestoneRewardLinks(): {
  valid: boolean;
  problems: string[];
} {
  const problems: string[] = [];
  for (const milestone of GROWTH_MILESTONES) {
    if (milestone.reward.status === "linked") {
      const rule = findActivityRewardRule(
        milestone.reward.category,
        milestone.reward.activityKey,
      );
      if (rule === null) {
        problems.push(
          `${milestone.id}: 베이스 규칙에 없는 보상 키에 연결됨`,
        );
      }
    } else if (milestone.reward.activityKey !== null) {
      problems.push(`${milestone.id}: 미연결 표기인데 activityKey가 있음`);
    }
  }
  // 베이스 규칙표 자체가 비어 있으면 연결 검증이 무의미하므로 실패한다.
  if (CREDIT_ACTIVITY_REWARD_RULES.length === 0) {
    problems.push("베이스 활동 보상 규칙표가 비어 있음");
  }
  return { valid: problems.length === 0, problems };
}

export interface GrowthMilestoneProgressInput {
  /** 공개된 작품 수 (0이면 첫 작품 미완료). */
  publishedWorkCount?: unknown;
  /** 공개된 회차 수 (0이면 첫 회차 미완료). */
  publishedEpisodeCount?: unknown;
  /** 마켓 등록 수 (0이면 첫 마켓 등록 미완료). */
  marketListingCount?: unknown;
}

export interface GrowthMilestoneProgress {
  readonly milestone: GrowthMilestoneDefinition;
  readonly completed: boolean;
  /** 완료 근거가 된 횟수 (미완료면 0). */
  readonly evidenceCount: number;
}

function countValue(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

/**
 * 횟수 근거로 체크리스트 완료 상태를 판정한다. 횟수가 음수·비정수·
 * 누락이면 0으로 취급해 미완료로 판정한다 (fail-closed).
 */
export function evaluateGrowthMilestones(
  input: GrowthMilestoneProgressInput,
): GrowthMilestoneProgress[] {
  const counts: Record<GrowthMilestoneId, number> = {
    "first-work": countValue(input.publishedWorkCount),
    "first-episode": countValue(input.publishedEpisodeCount),
    "first-market-listing": countValue(input.marketListingCount),
  };
  return GROWTH_MILESTONES.map((milestone) => {
    const evidenceCount = counts[milestone.id];
    return { milestone, completed: evidenceCount >= 1, evidenceCount };
  });
}

/**
 * 마일스톤의 보상 지급 호출부에 넘길 연결 해석. linked가 아니면
 * null을 반환하므로 호출부는 보상 지급을 시도하지 않는다.
 */
export function resolveGrowthMilestoneReward(
  id: GrowthMilestoneId,
): { category: CreditActivityCategory; activityKey: string } | null {
  const milestone = findGrowthMilestone(id);
  if (!milestone) return null;
  if (
    milestone.reward.status !== "linked"
    || milestone.reward.activityKey === null
  ) {
    return null;
  }
  return {
    category: milestone.reward.category,
    activityKey: milestone.reward.activityKey,
  };
}
