import { describe, expect, it } from "vitest";
import type { TeamWorkspaceDetail, TeamWorkspaceMember } from "@toonstudio/contracts/production-workspace";

import { buildDepartureChecklist, type MemberWorkSignal } from "./member-departure-checklist-model";

function member(overrides: Partial<TeamWorkspaceMember> = {}): TeamWorkspaceMember {
  return { userId: "u-mina", displayName: "민아", role: "member", joinedAt: "2026-09-01T00:00:00.000Z", ...overrides };
}

function detail(projects: readonly { id: string; workId: string; title: string; ownerUserId: string }[] = [{ id: "p1", workId: "w1", title: "달빛 연대기", ownerUserId: "u-owner" }]): TeamWorkspaceDetail {
  return {
    workspace: {
      id: "team-a", name: "스튜디오 팀", ownerUserId: "u-owner", revision: 3, role: "owner",
      createdAt: "2026-09-01T00:00:00.000Z", projectCount: projects.length, memberCount: 4, pendingInvites: 1,
    },
    projects,
    members: [member()],
    invites: [],
  };
}

function itemIds(checklist: ReturnType<typeof buildDepartureChecklist>): string[] {
  return checklist.items.map((item) => item.id);
}

describe("buildDepartureChecklist", () => {
  it("소유자 제외는 하드 블록으로 막는다", () => {
    const checklist = buildDepartureChecklist({ detail: detail(), member: member({ role: "owner" }), action: "remove" });
    expect(checklist.blocked).toBe(true);
    expect(checklist.items.find((item) => item.id === "ownership-block")?.severity).toBe("block");
  });

  it("일반 구성원 제외는 막지 않되 작품 권한 잔여와 자료 보존을 알린다", () => {
    const checklist = buildDepartureChecklist({ detail: detail(), member: member(), action: "remove" });
    expect(checklist.blocked).toBe(false);
    expect(itemIds(checklist)).toContain("project-access-remains");
    expect(itemIds(checklist)).toContain("data-retention");
    expect(checklist.items.find((item) => item.id === "project-access-remains")?.severity).toBe("warn");
  });

  it("담당 신호가 없으면 작업 건수를 0으로 위장하지 않고 확인 필요로 둔다", () => {
    const checklist = buildDepartureChecklist({ detail: detail(), member: member(), action: "remove" });
    const unverified = checklist.items.find((item) => item.id === "assigned-work-unverified");
    expect(unverified?.severity).toBe("warn");
    expect(itemIds(checklist)).not.toContain("assigned-work");
  });

  it("신호가 전 작품을 덮으면 열린 작업과 검수 대기를 숫자로 경고한다", () => {
    const signals: MemberWorkSignal[] = [{ projectId: "p1", openAssignedTaskCount: 3, reviewWaitingTaskCount: 2 }];
    const checklist = buildDepartureChecklist({ detail: detail(), member: member(), action: "remove", workSignals: signals });
    expect(checklist.items.find((item) => item.id === "assigned-work")?.title.ko).toContain("3건");
    expect(checklist.items.find((item) => item.id === "review-waiting")?.title.ko).toContain("2건");
  });

  it("신호가 있고 열린 작업이 없으면 통과(done)로 표시한다", () => {
    const signals: MemberWorkSignal[] = [{ projectId: "p1", openAssignedTaskCount: 0, reviewWaitingTaskCount: 0 }];
    const checklist = buildDepartureChecklist({ detail: detail(), member: member(), action: "leave", workSignals: signals });
    expect(checklist.items.find((item) => item.id === "assigned-work")?.severity).toBe("done");
    expect(checklist.items.find((item) => item.id === "review-waiting")?.severity).toBe("done");
    expect(checklist.blocked).toBe(false);
  });

  it("신호가 일부 작품만 덮으면 전체를 확인한 것으로 치지 않는다", () => {
    const two = detail([
      { id: "p1", workId: "w1", title: "작품1", ownerUserId: "u-owner" },
      { id: "p2", workId: "w2", title: "작품2", ownerUserId: "u-owner" },
    ]);
    const signals: MemberWorkSignal[] = [{ projectId: "p1", openAssignedTaskCount: 0, reviewWaitingTaskCount: 0 }];
    const checklist = buildDepartureChecklist({ detail: two, member: member(), action: "remove", workSignals: signals });
    expect(itemIds(checklist)).toContain("assigned-work-unverified");
  });

  it("소유권 이전에서는 이전 범위(팀만·작품 불변·이전자는 관리자 잔류)만 안내하고 작업 점검은 넣지 않는다", () => {
    const checklist = buildDepartureChecklist({ detail: detail(), member: member(), action: "transfer-owner" });
    expect(itemIds(checklist)).toEqual(["ownership-transfer-scope", "data-retention"]);
    expect(checklist.blocked).toBe(false);
  });

  it("연결 작품이 없으면 작품 권한 잔여는 통과로 표시한다", () => {
    const checklist = buildDepartureChecklist({ detail: detail([]), member: member(), action: "remove" });
    expect(checklist.items.find((item) => item.id === "project-access-remains")?.severity).toBe("done");
  });
});
