/**
 * growth-milestones.ts — 확산 마일스톤 체크리스트의 웹 표시 모듈
 * (5단계, 2026-10-25).
 *
 * 이 모듈은 표시만 담당한다. 보상 규칙·완료 판정의 정본은 서버
 * 순수 모듈(`growth-milestones.ts`, API)이며, 웹은 서버가 준
 * 완료 여부와 보상 연결 상태만 받아 표시한다. 웹이 API 소스를
 * 직접 import하지 않는 경계를 지키기 위해 식별자·키를 구조만으로
 * 공유한다 (값은 서버 정의와 같은 순서·같은 키여야 한다).
 *
 * 보상 연결 상태는 서버 정본과 같다: 첫 작품·첫 회차는 linked,
 * 첫 마켓 등록은 reward-key-pending (보상 키 신설은 제품 결정
 * 대기 — 이 모듈이 임의로 보상 키를 만들지 않는다).
 */

/** 체크리스트 표시 순서 (서버 정의와 동일). */
export const GROWTH_MILESTONE_DISPLAY_ORDER = [
  "first-work",
  "first-episode",
  "first-market-listing",
] as const;

export type GrowthMilestoneDisplayId =
  (typeof GROWTH_MILESTONE_DISPLAY_ORDER)[number];

export type GrowthMilestoneDisplayRewardStatus =
  | "linked"
  | "reward-key-pending";

export interface GrowthMilestoneDisplayItem {
  readonly id: GrowthMilestoneDisplayId;
  readonly completed: boolean;
  readonly rewardStatus: GrowthMilestoneDisplayRewardStatus;
}

export interface GrowthMilestoneDisplay {
  readonly id: GrowthMilestoneDisplayId;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly statusKey: string;
  readonly rewardKey: string;
  readonly completed: boolean;
}

const DISPLAY_KEYS: Record<
  GrowthMilestoneDisplayId,
  { titleKey: string; descriptionKey: string }
> = {
  "first-work": {
    titleKey: "growth.milestone.firstWork.title",
    descriptionKey: "growth.milestone.firstWork.description",
  },
  "first-episode": {
    titleKey: "growth.milestone.firstEpisode.title",
    descriptionKey: "growth.milestone.firstEpisode.description",
  },
  "first-market-listing": {
    titleKey: "growth.milestone.firstMarketListing.title",
    descriptionKey: "growth.milestone.firstMarketListing.description",
  },
};

/**
 * 서버 전달 항목을 표시 항목으로 바꾼다. 알 수 없는 식별자는
 * 버린다 (서버 정본 외 마일스톤을 웹이 임의로 표시하지 않음).
 */
export function resolveGrowthMilestoneDisplay(
  items: readonly GrowthMilestoneDisplayItem[],
): GrowthMilestoneDisplay[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return GROWTH_MILESTONE_DISPLAY_ORDER.flatMap((id) => {
    const item = byId.get(id);
    if (!item) return [];
    const keys = DISPLAY_KEYS[id];
    return [
      {
        id,
        titleKey: keys.titleKey,
        descriptionKey: keys.descriptionKey,
        statusKey: item.completed
          ? "growth.milestone.completed"
          : "growth.milestone.notYet",
        rewardKey:
          item.rewardStatus === "linked"
            ? "growth.milestone.rewardLinked"
            : "growth.milestone.rewardPending",
        completed: item.completed,
      },
    ];
  });
}
