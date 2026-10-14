import { describe, expect, it } from "vitest";
import { FREE_USAGE_POLICY, type TeamWorkspaceSummary, type WorkspaceUsageResponse } from "@toonstudio/contracts/production-workspace";
import { buildOrganizationUsagePreview, seatStatus } from "./organization-usage-model";

const team = (patch: Partial<TeamWorkspaceSummary>): TeamWorkspaceSummary => ({
  id: "team-a", name: "본편 제작팀", ownerUserId: "owner", role: "owner", revision: 1,
  createdAt: "2026-10-01T00:00:00Z", projectCount: 3, memberCount: 4, pendingInvites: 1,
  ...patch,
});

const usage = (workspaceId: string, counters: WorkspaceUsageResponse["counters"]): WorkspaceUsageResponse => ({
  policy: FREE_USAGE_POLICY, workspaceId, operationMode: "free", policyRevision: 3,
  counters, originalStorage: { status: "not-instrumented", usedBytes: null },
  nextDailyResetAt: "2026-10-15T00:00:00Z", externalAiEnabled: false, meteredProvidersEnabled: false,
});

describe("buildOrganizationUsagePreview", () => {
  it("요약 카운터로 좌석 풀을 합산한다 — 대기 초대가 좌석을 차지한다", () => {
    const preview = buildOrganizationUsagePreview([
      team({ id: "a", memberCount: 4, pendingInvites: 1, projectCount: 3 }),
      team({ id: "b", name: "외전 제작팀", memberCount: 5, pendingInvites: 0, projectCount: 2 }),
    ]);
    expect(preview.enforcement).toBe("preview-only");
    expect(preview.seatCapacity).toBe(20);
    expect(preview.seatsUsed).toBe(10);
    expect(preview.seatsLeft).toBe(10);
    expect(preview.membersTotal).toBe(9);
    expect(preview.pendingInvitesTotal).toBe(1);
    expect(preview.projectsUsed).toBe(5);
    expect(preview.projectCapacity).toBe(10);
    expect(preview.teams[0]?.source).toBe("summary");
    expect(preview.operationMode).toBeNull();
    expect(preview.storageMetered).toBe(false);
  });

  it("사용량 상세가 있으면 그 카운터와 운영 모드를 우선한다", () => {
    const preview = buildOrganizationUsagePreview(
      [team({ id: "a", memberCount: 4, pendingInvites: 1, projectCount: 3 })],
      new Map([["a", usage("a", { ownedWorkspaces: 1, projects: 2, members: 6, pendingInvites: 2 })]]),
    );
    expect(preview.teams[0]).toMatchObject({ members: 6, pendingInvites: 2, seatsUsed: 8, projectsUsed: 2, source: "usage" });
    expect(preview.operationMode).toBe("free");
    expect(preview.policyVersion).toBe(FREE_USAGE_POLICY.version);
  });

  it("한도를 넘긴 팀은 over, 남은 좌석은 음수가 되지 않는다", () => {
    const preview = buildOrganizationUsagePreview([team({ id: "a", memberCount: 9, pendingInvites: 3 })]);
    expect(preview.teams[0]?.status).toBe("over");
    expect(preview.teams[0]?.seatsLeft).toBe(0);
    expect(preview.seatsLeft).toBe(0);
    expect(preview.status).toBe("over");
  });

  it("연결 팀이 없으면 전부 0이고 상태는 available이다", () => {
    const preview = buildOrganizationUsagePreview([]);
    expect(preview).toMatchObject({ teamCount: 0, seatCapacity: 0, seatsUsed: 0, seatsLeft: 0, status: "available" });
  });
});

describe("seatStatus", () => {
  it("80%부터 near-full, 한도와 같으면 full이다", () => {
    expect(seatStatus(7, 10)).toBe("available");
    expect(seatStatus(8, 10)).toBe("near-full");
    expect(seatStatus(10, 10)).toBe("full");
    expect(seatStatus(11, 10)).toBe("over");
  });
});
