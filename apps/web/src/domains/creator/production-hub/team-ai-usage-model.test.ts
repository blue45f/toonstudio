import { describe, expect, it } from "vitest";
import {
  aiUsageVisibilityForRole,
  buildTeamAiUsageReport,
  type AiUsageDailyRecord,
} from "./team-ai-usage-model";

const TEAMS = [
  { id: "ws-a", name: "알파 팀" },
  { id: "ws-b", name: "베타 팀" },
];

function record(partial: Partial<AiUsageDailyRecord> & Pick<AiUsageDailyRecord, "workspaceId" | "memberId">): AiUsageDailyRecord {
  return {
    memberName: partial.memberId,
    day: "2026-10-12",
    source: "managed-free",
    requests: 0,
    reservedTokens: 0,
    blocked: 0,
    blockedByReason: {},
    ...partial,
  };
}

const RECORDS: AiUsageDailyRecord[] = [
  record({ workspaceId: "ws-a", memberId: "u1", memberName: "민지", day: "2026-10-12", requests: 10, reservedTokens: 8_000, blocked: 2, blockedByReason: { "daily-request-budget": 2 } }),
  record({ workspaceId: "ws-a", memberId: "u2", memberName: "준호", day: "2026-10-12", requests: 6, reservedTokens: 4_000, blocked: 0 }),
  record({ workspaceId: "ws-a", memberId: "u3", memberName: "서연", day: "2026-10-13", requests: 4, reservedTokens: 3_000, blocked: 1, blockedByReason: { "rate-limit": 1 } }),
  record({ workspaceId: "ws-a", memberId: "u1", memberName: "민지", day: "2026-10-13", requests: 5, reservedTokens: 5_000, blocked: 0 }),
  record({ workspaceId: "ws-b", memberId: "u4", memberName: "하린", day: "2026-10-12", requests: 3, reservedTokens: 2_000, blocked: 1, blockedByReason: { authentication: 1 } }),
  record({ workspaceId: "ws-b", memberId: "u5", memberName: "도윤", day: "2026-10-12", requests: 2, reservedTokens: 1_000, blocked: 0 }),
];

describe("aiUsageVisibilityForRole", () => {
  it("대표·운영 관리자만 구성원별 행, 매니저는 팀 합계, 구성원·게스트는 없음", () => {
    expect(aiUsageVisibilityForRole("owner")).toBe("member-rows");
    expect(aiUsageVisibilityForRole("admin")).toBe("member-rows");
    expect(aiUsageVisibilityForRole("manager")).toBe("team-totals");
    expect(aiUsageVisibilityForRole("member")).toBe("none");
    expect(aiUsageVisibilityForRole("guest")).toBe("none");
  });
});

describe("buildTeamAiUsageReport", () => {
  it("합계·차단율·사유 분해·일별 추이를 집계한다", () => {
    const report = buildTeamAiUsageReport({ records: RECORDS, teams: TEAMS, viewerRole: "owner" });
    expect(report.totals.requests).toBe(30);
    expect(report.totals.reservedTokens).toBe(23_000);
    expect(report.totals.blocked).toBe(4);
    expect(report.totals.attempts).toBe(34);
    expect(report.totals.blockRate).toBeCloseTo(4 / 34);
    expect(report.days).toEqual(["2026-10-12", "2026-10-13"]);
    expect(report.dailySeries).toEqual([
      { day: "2026-10-12", requests: 21, blocked: 3 },
      { day: "2026-10-13", requests: 9, blocked: 1 },
    ]);
    expect(report.blockedByReason).toEqual([
      { reason: "daily-request-budget", count: 2 },
      { reason: "authentication", count: 1 },
      { reason: "rate-limit", count: 1 },
    ]);
    expect(report.recordCount).toBe(6);
  });

  it("구성원별 행은 요청 내림차순으로 합산되고 활동 일수를 센다", () => {
    const report = buildTeamAiUsageReport({ records: RECORDS, teams: TEAMS, viewerRole: "admin" });
    const alpha = report.teams.find((team) => team.workspaceId === "ws-a");
    expect(alpha?.memberRowState).toBe("visible");
    expect(alpha?.memberRows.map((row) => [row.memberName, row.requests, row.activeDays])).toEqual([
      ["민지", 15, 2],
      ["준호", 6, 1],
      ["서연", 4, 1],
    ]);
  });

  it("활동 구성원이 3명보다 적으면 구성원별 행을 접고 팀 합계만 남긴다", () => {
    const report = buildTeamAiUsageReport({ records: RECORDS, teams: TEAMS, viewerRole: "owner" });
    const beta = report.teams.find((team) => team.workspaceId === "ws-b");
    expect(beta?.activeMemberCount).toBe(2);
    expect(beta?.memberRowState).toBe("suppressed-small-team");
    expect(beta?.memberRows).toEqual([]);
    expect(beta?.requests).toBe(5);
    expect(beta?.blocked).toBe(1);
  });

  it("매니저에게는 팀 합계만 주고 구성원별 행은 역할 때문에 숨긴다고 구분한다", () => {
    const report = buildTeamAiUsageReport({ records: RECORDS, teams: TEAMS, viewerRole: "manager" });
    expect(report.visibility).toBe("team-totals");
    expect(report.totals.requests).toBe(30);
    for (const team of report.teams) {
      expect(team.memberRowState).toBe("hidden-by-role");
      expect(team.memberRows).toEqual([]);
    }
  });

  it("구성원·게스트에게는 집계를 만들지 않는다", () => {
    const report = buildTeamAiUsageReport({ records: RECORDS, teams: TEAMS, viewerRole: "member" });
    expect(report.visibility).toBe("none");
    expect(report.teams).toEqual([]);
    expect(report.totals.requests).toBe(0);
    expect(report.recordCount).toBe(0);
  });

  it("BYOK 사용량은 합산에서 빼고 빠진 양만 따로 알린다", () => {
    const withByok = [
      ...RECORDS,
      record({ workspaceId: "ws-a", memberId: "u1", memberName: "민지", source: "byok", requests: 99, blocked: 7 }),
    ];
    const report = buildTeamAiUsageReport({ records: withByok, teams: TEAMS, viewerRole: "owner" });
    expect(report.totals.requests).toBe(30);
    expect(report.totals.blocked).toBe(4);
    expect(report.excludedByok).toEqual({ requests: 99, blocked: 7 });
    expect(report.recordCount).toBe(6);
  });

  it("깨진 수치와 모르는 차단 사유는 지어내지 않고 버린다", () => {
    const dirty = [
      record({
        workspaceId: "ws-a", memberId: "u1", memberName: "민지",
        requests: Number.NaN, reservedTokens: -5, blocked: 1.9,
        blockedByReason: { "rate-limit": 1, "mystery-reason": 5 } as AiUsageDailyRecord["blockedByReason"],
      }),
    ];
    const report = buildTeamAiUsageReport({ records: dirty, teams: TEAMS, viewerRole: "owner" });
    expect(report.totals.requests).toBe(0);
    expect(report.totals.reservedTokens).toBe(0);
    expect(report.totals.blocked).toBe(1);
    expect(report.blockedByReason).toEqual([{ reason: "rate-limit", count: 1 }]);
  });

  it("기록이 없으면 전부 0이고 차단율을 지어내지 않는다", () => {
    const report = buildTeamAiUsageReport({ records: [], teams: TEAMS, viewerRole: "owner" });
    expect(report.totals).toEqual({ requests: 0, reservedTokens: 0, blocked: 0, attempts: 0, blockRate: 0 });
    expect(report.teams).toEqual([]);
    expect(report.days).toEqual([]);
  });
});
