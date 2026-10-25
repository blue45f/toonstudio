/**
 * growth-milestones.test.ts — 확산 마일스톤 체크리스트 단위 테스트.
 * 정식 실행은 vitest(CI 확인 항목). 베이스 규칙과 무관한 새 보상 키
 * 발명을 막는 연결 검증이 핵심 케이스다.
 *
 * 케이스: 정의 3건·표시 순서, 첫 작품·첫 회차는 연재 키에만 연결,
 * 첫 마켓 등록은 보상 미연결(표시만), 연결 검증 통과, 횟수 근거
 * 완료 판정(0·음수·비정수 fail-closed), 미연결 마일스톤의 보상
 * 해석 null, 미지정 식별자 null.
 */
import { describe, expect, it } from "vitest";

import {
  GROWTH_MILESTONES,
  evaluateGrowthMilestones,
  findGrowthMilestone,
  resolveGrowthMilestoneReward,
  validateGrowthMilestoneRewardLinks,
} from "./growth-milestones";

describe("growth milestones", () => {
  it("마일스톤 3건을 표시 순서대로 정의한다", () => {
    expect(GROWTH_MILESTONES.map((item) => item.id)).toEqual([
      "first-work",
      "first-episode",
      "first-market-listing",
    ]);
  });

  it("첫 작품·첫 회차는 기존 연재 키에만 연결한다", () => {
    const firstWork = findGrowthMilestone("first-work");
    const firstEpisode = findGrowthMilestone("first-episode");
    expect(firstWork?.reward).toEqual({
      category: "serialization",
      activityKey: "creator.work.published",
      status: "linked",
    });
    expect(firstEpisode?.reward).toEqual({
      category: "serialization",
      activityKey: "creator.work.published",
      status: "linked",
    });
  });

  it("첫 마켓 등록은 보상 키를 새로 만들지 않고 표시만 한다", () => {
    const listing = findGrowthMilestone("first-market-listing");
    expect(listing?.reward.activityKey).toBeNull();
    expect(listing?.reward.status).toBe("reward-key-pending");
    expect(resolveGrowthMilestoneReward("first-market-listing")).toBeNull();
  });

  it("보상 연결 검증이 베이스 규칙과 일치한다", () => {
    const result = validateGrowthMilestoneRewardLinks();
    expect(result.valid).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("횟수 근거로 완료를 판정하고 비정상 입력은 미완료로 둔다", () => {
    const progress = evaluateGrowthMilestones({
      publishedWorkCount: 1,
      publishedEpisodeCount: 0,
      marketListingCount: -3,
    });
    expect(progress.map((item) => item.completed)).toEqual([
      true,
      false,
      false,
    ]);
    expect(progress[0]?.evidenceCount).toBe(1);
    const invalid = evaluateGrowthMilestones({
      publishedWorkCount: "many",
      publishedEpisodeCount: 1.5,
    });
    expect(invalid.map((item) => item.completed)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("연결된 마일스톤의 보상 해석을 반환하고 미지정은 null이다", () => {
    expect(resolveGrowthMilestoneReward("first-work")).toEqual({
      category: "serialization",
      activityKey: "creator.work.published",
    });
    expect(findGrowthMilestone("no-such-milestone")).toBeNull();
  });
});
