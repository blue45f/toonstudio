import { describe, expect, it } from "vitest";
import type { TeamWorkspaceDetail } from "@toonstudio/contracts/production-workspace";

import type { ProductionProjectSummary } from "./production-dashboard-api";
import { buildOrganizationPortfolio, derivePortfolioAttention } from "./organization-portfolio-model";

function summary(workId: string, overrides: Partial<ProductionProjectSummary> = {}): ProductionProjectSummary {
  return {
    projectId: `project-${workId}`,
    workId,
    title: `작품 ${workId}`,
    coverImageUrl: null,
    collaborationModel: "solo",
    revision: 1,
    updatedAt: "2026-10-14T00:00:00.000Z",
    access: { owner: false, role: "editor", canManage: false },
    healthScore: 90,
    activeEpisodeCount: 2,
    readyBufferCount: 1,
    criticalRiskCount: 0,
    overdueTaskCount: 0,
    blockedTaskCount: 0,
    unassignedTaskCount: 0,
    reviewTaskCount: 0,
    nextReleaseAt: null,
    forecastFinishAt: null,
    scheduleConfidencePercent: null,
    ...overrides,
  } as ProductionProjectSummary;
}

function detail(teamId: string, projects: readonly { id: string; workId: string; title: string }[]): TeamWorkspaceDetail {
  return {
    workspace: {
      id: teamId, name: `팀 ${teamId}`, ownerUserId: "owner", revision: 1, role: "owner",
      createdAt: "2026-10-01T00:00:00.000Z", projectCount: projects.length, memberCount: 3, pendingInvites: 0,
    },
    projects,
    members: [],
    invites: [],
  };
}

describe("buildOrganizationPortfolio", () => {
  it("연결 팀의 작품을 workId로 요약과 조인해 행으로 만든다", () => {
    const portfolio = buildOrganizationPortfolio(
      [detail("team-a", [{ id: "p1", workId: "w1", title: "달빛 연대기" }])],
      [summary("w1", { activeEpisodeCount: 3, reviewTaskCount: 2, nextReleaseAt: "2026-10-20T00:00:00.000Z" })],
    );
    expect(portfolio.rows).toHaveLength(1);
    expect(portfolio.rows[0]).toMatchObject({
      teamId: "team-a", projectId: "p1", workId: "w1", title: "달빛 연대기",
      accessible: true, activeEpisodeCount: 3, reviewTaskCount: 2, attention: "ok",
    });
  });

  it("작품 권한이 없어 요약이 없는 작품은 수치를 만들지 않고 unknown으로 둔다", () => {
    const portfolio = buildOrganizationPortfolio(
      [detail("team-a", [{ id: "p1", workId: "w-secret", title: "비공개 작품" }])],
      [],
    );
    expect(portfolio.rows[0].accessible).toBe(false);
    expect(portfolio.rows[0].attention).toBe("unknown");
    expect(portfolio.rows[0].healthScore).toBeNull();
    expect(portfolio.rows[0].overdueTaskCount).toBeNull();
    expect(portfolio.unknownCount).toBe(1);
  });

  it("주의 작품부터 정렬하고, 같은 단계에서는 다음 게시가 임박한 작품을 먼저 둔다", () => {
    const portfolio = buildOrganizationPortfolio(
      [detail("team-a", [
        { id: "p-ok", workId: "w-ok", title: "순항작" },
        { id: "p-late", workId: "w-late", title: "지연작" },
        { id: "p-warn", workId: "w-warn", title: "막힘작" },
      ])],
      [
        summary("w-ok", { nextReleaseAt: "2026-10-15T00:00:00.000Z" }),
        summary("w-late", { overdueTaskCount: 2, nextReleaseAt: "2026-12-01T00:00:00.000Z" }),
        summary("w-warn", { blockedTaskCount: 1, nextReleaseAt: "2026-10-16T00:00:00.000Z" }),
      ],
    );
    expect(portfolio.rows.map((row) => row.projectId)).toEqual(["p-late", "p-warn", "p-ok"]);
    expect(portfolio.criticalCount).toBe(1);
    expect(portfolio.warningCount).toBe(1);
  });

  it("중복된 팀 상세가 들어와도 같은 작품 행은 한 번만 만든다", () => {
    const team = detail("team-a", [{ id: "p1", workId: "w1", title: "작품" }]);
    const portfolio = buildOrganizationPortfolio([team, team], [summary("w1")]);
    expect(portfolio.rows).toHaveLength(1);
  });

  it("여러 팀의 작품을 한 표로 합친다", () => {
    const portfolio = buildOrganizationPortfolio(
      [
        detail("team-a", [{ id: "p1", workId: "w1", title: "A작품" }]),
        detail("team-b", [{ id: "p2", workId: "w2", title: "B작품" }]),
      ],
      [summary("w1"), summary("w2")],
    );
    expect(portfolio.rows.map((row) => row.teamName).sort()).toEqual(["팀 team-a", "팀 team-b"]);
  });
});

describe("derivePortfolioAttention", () => {
  it("지연 작업이나 치명 리스크가 있으면 critical", () => {
    expect(derivePortfolioAttention(summary("w", { overdueTaskCount: 1 }))).toBe("critical");
    expect(derivePortfolioAttention(summary("w", { criticalRiskCount: 1 }))).toBe("critical");
  });
  it("막힌 작업이 있거나 건강도가 낮으면 warning", () => {
    expect(derivePortfolioAttention(summary("w", { blockedTaskCount: 1 }))).toBe("warning");
    expect(derivePortfolioAttention(summary("w", { healthScore: 42 }))).toBe("warning");
  });
  it("요약이 없으면 unknown, 문제가 없으면 ok", () => {
    expect(derivePortfolioAttention(undefined)).toBe("unknown");
    expect(derivePortfolioAttention(summary("w"))).toBe("ok");
  });
});
