/**
 * credit-activity-rewards.test.ts — 활동 보상 지급 규칙 단위 테스트.
 * 지갑은 스텁으로 대체한다 (DB 없음). 정식 실행은 vitest(CI 확인 항목).
 *
 * 케이스: 보상 만료 90일(기존 reward_point 365일 상수 무변경·구매
 * null과 차등), 연재·기여 매핑(기존 키·쿨다운 재사용), 출석·이벤트
 * 미매핑(라이브 지급 불가), 중복 sourceRef 거부, 1일 1회 상한 거부,
 * 쿨다운 거부, 지급량 검증, seam 적립 호출(만료 90일 전달).
 */
import { describe, expect, it, vi } from "vitest";

import {
  CREDIT_ACTIVITY_REWARD_EXPIRY_DAYS,
  CREDIT_ACTIVITY_REWARD_RULES,
  CreditActivityRewardError,
  REWARD_POINT_EXPIRY_DAYS,
  activityRewardExpiry,
  buildActivityRewardGrant,
  findActivityRewardRule,
  findActivityRewardRules,
  grantActivityReward,
  type CreditActivityRewardState,
  type CreditActivityRewardWallet,
} from "./credit-activity-rewards";

const BASE_STATE: CreditActivityRewardState = {
  duplicateSourceRef: false,
  grantedTodayCount: 0,
  lastGrantedAtMs: null,
  nowMs: Date.parse("2026-10-25T00:00:00.000Z"),
};

function stubWallet(
  overrides: Partial<CreditActivityRewardWallet> = {},
): CreditActivityRewardWallet & { calls: { grant: number } } {
  const calls = { grant: 0 };
  const wallet: CreditActivityRewardWallet = {
    grantActivityStudioCredits: vi.fn(async () => {
      calls.grant += 1;
      return { granted: true };
    }),
    ...overrides,
  };
  return { ...wallet, calls };
}

describe("활동 보상 만료 차등", () => {
  it("보상 크레딧 만료는 90일이고 기존 reward_point 365일과 다르다", () => {
    expect(CREDIT_ACTIVITY_REWARD_EXPIRY_DAYS).toBe(90);
    expect(REWARD_POINT_EXPIRY_DAYS).toBe(365);
    const from = new Date("2026-10-25T00:00:00.000Z");
    expect(activityRewardExpiry(from).toISOString()).toBe(
      "2027-01-23T00:00:00.000Z",
    );
  });
});

describe("활동 보상 규칙표", () => {
  it("연재는 작품 공개 키, 기여는 글·댓글 키에 매핑된다", () => {
    expect(findActivityRewardRule("serialization", "creator.work.published"))
      .toMatchObject({
        category: "serialization",
        claimMode: "server",
        cooldownSeconds: 300,
        referencePoints: 100,
        dailyCapPerAccount: 1,
      });
    expect(findActivityRewardRules("contribution")).toHaveLength(2);
    expect(CREDIT_ACTIVITY_REWARD_RULES).toHaveLength(5);
  });

  it("출석·이벤트는 기존 키가 없어 규칙만 정의된다", () => {
    expect(findActivityRewardRules("attendance")).toEqual([
      expect.objectContaining({ activityKey: null }),
    ]);
    expect(findActivityRewardRules("event")).toEqual([
      expect.objectContaining({ activityKey: null }),
    ]);
    // 운세·놀이터는 출석·이벤트가 아니므로 매핑하지 않는다.
    expect(findActivityRewardRule("event", "fortune.used")).toBeNull();
    expect(findActivityRewardRule("attendance", "playground.used")).toBeNull();
  });
});

describe("활동 보상 지급 평가", () => {
  it("정상 지급 명세는 studio_credit·90일 만료·멱등키를 담는다", () => {
    const grant = buildActivityRewardGrant({
      userId: "user-1",
      category: "serialization",
      activityKey: "creator.work.published",
      sourceRef: "work-123",
      dayKey: "2026-10-25",
      amountCredits: 50,
      state: BASE_STATE,
    });
    expect(grant.asset).toBe("studio_credit");
    expect(grant.sourceKey).toBe("activity:creator.work.published:work-123");
    expect(grant.idempotencyKey).toBe(grant.sourceKey);
    expect(grant.expiresAt.toISOString()).toBe("2027-01-23T00:00:00.000Z");
  });

  it("출석 보상은 키가 없어 라이브 지급이 거부된다", () => {
    expect(() =>
      buildActivityRewardGrant({
        userId: "user-1",
        category: "attendance",
        activityKey: "creator.work.published",
        sourceRef: "day-1",
        dayKey: "2026-10-25",
        amountCredits: 10,
        state: BASE_STATE,
      }),
    ).toThrowError(CreditActivityRewardError);
    try {
      buildActivityRewardGrant({
        userId: "user-1",
        category: "attendance",
        sourceRef: "day-1",
        dayKey: "2026-10-25",
        amountCredits: 10,
        state: BASE_STATE,
      });
    } catch (error) {
      expect((error as CreditActivityRewardError).code).toBe(
        "activity_rule_unmapped",
      );
    }
  });

  it("중복 sourceRef는 멱등으로 거부된다", () => {
    expect(() =>
      buildActivityRewardGrant({
        userId: "user-1",
        category: "contribution",
        activityKey: "community.post.created",
        sourceRef: "post-9",
        dayKey: "2026-10-25",
        amountCredits: 10,
        state: { ...BASE_STATE, duplicateSourceRef: true },
      }),
    ).toThrowError(/이미 지급된 활동 근거/);
  });

  it("규칙별 1일 1회 상한을 넘으면 거부된다", () => {
    expect(() =>
      buildActivityRewardGrant({
        userId: "user-1",
        category: "serialization",
        activityKey: "creator.work.published",
        sourceRef: "work-124",
        dayKey: "2026-10-25",
        amountCredits: 10,
        state: { ...BASE_STATE, grantedTodayCount: 1 },
      }),
    ).toThrowError(/1일 1회 상한/);
  });

  it("기존 쿨다운(작품 공개 300초) 내 재지급은 거부된다", () => {
    expect(() =>
      buildActivityRewardGrant({
        userId: "user-1",
        category: "serialization",
        activityKey: "creator.work.published",
        sourceRef: "work-125",
        dayKey: "2026-10-25",
        amountCredits: 10,
        state: {
          ...BASE_STATE,
          lastGrantedAtMs: BASE_STATE.nowMs - 100_000,
        },
      }),
    ).toThrowError(/쿨다운/);
  });

  it("지급량이 양의 정수가 아니면 거부된다", () => {
    expect(() =>
      buildActivityRewardGrant({
        userId: "user-1",
        category: "serialization",
        activityKey: "creator.work.published",
        sourceRef: "work-126",
        dayKey: "2026-10-25",
        amountCredits: 0,
        state: BASE_STATE,
      }),
    ).toThrowError(/양의 정수/);
  });

  it("seam 적립 호출 시 90일 만료가 그대로 전달된다", async () => {
    const wallet = stubWallet();
    const grant = buildActivityRewardGrant({
      userId: "user-1",
      category: "contribution",
      activityKey: "community.comment.created",
      sourceRef: "comment-7",
      dayKey: "2026-10-25",
      amountCredits: 5,
      state: BASE_STATE,
    });
    const result = await grantActivityReward(wallet, grant);
    expect(result.granted).toBe(true);
    expect(wallet.calls.grant).toBe(1);
    const call = (
      wallet.grantActivityStudioCredits as unknown as {
        mock: { calls: unknown[][] };
      }
    ).mock.calls[0][0] as { expiresAt: Date; amountCredits: number };
    expect(call.amountCredits).toBe(5);
    expect(call.expiresAt.toISOString()).toBe("2027-01-23T00:00:00.000Z");
  });
});
