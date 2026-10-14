import { describe, expect, it } from "vitest";
import type {
  TeamWorkspaceMember,
  TeamWorkspaceProject,
} from "@toonstudio/contracts/production-workspace";
import type { StudioTeamMember, StudioTeamSnapshot } from "../studio-team-client";
import {
  buildMemberWorkAccessOverview,
  PROJECT_ROLE_LABELS,
  PROJECT_STATUS_LABELS,
} from "./member-work-access-model";

const member = (patch: Partial<TeamWorkspaceMember>): TeamWorkspaceMember => ({
  userId: "user-1",
  displayName: "김작가",
  role: "member",
  joinedAt: "2026-10-01T00:00:00.000Z",
  ...patch,
});

const project = (patch: Partial<TeamWorkspaceProject>): TeamWorkspaceProject => ({
  id: "project-a",
  workId: "work-a",
  title: "검수 원고",
  ...patch,
});

const studioMember = (patch: Partial<StudioTeamMember>): StudioTeamMember => ({
  userId: "user-1",
  name: "김작가",
  image: "",
  role: "editor",
  status: "active",
  isOwner: false,
  ...patch,
});

const snapshot = (workId: string, members: readonly StudioTeamMember[]): StudioTeamSnapshot => ({
  workId,
  viewer: {
    userId: "owner",
    role: "owner",
    status: "active",
    capabilities: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false },
  },
  members: [...members],
});

describe("member work access model", () => {
  it("joins per-work roles onto each team member and keeps team role separate", () => {
    const overview = buildMemberWorkAccessOverview({
      members: [member({ userId: "guest-1", displayName: "외주 채색", role: "guest" })],
      projects: [project({}), project({ id: "project-b", workId: "work-b", title: "신작 콘티" })],
      snapshots: new Map([
        ["work-a", snapshot("work-a", [studioMember({ userId: "guest-1", role: "editor", status: "active" })])],
        ["work-b", snapshot("work-b", [])],
      ]),
    });
    const row = overview.rows[0]!;
    // 팀 소속은 게스트 그대로, 작품 권한은 작품마다 따로 집계된다.
    expect(row.workspaceRole).toBe("guest");
    expect(row.entries[0]).toMatchObject({ workId: "work-a", projectRole: "editor", status: "active", load: "loaded" });
    expect(row.entries[1]).toMatchObject({ workId: "work-b", projectRole: null, status: null, load: "loaded" });
    expect(row.activeCount).toBe(1);
    expect(row.pendingCount).toBe(0);
    expect(overview.projectCount).toBe(2);
    expect(overview.membersWithNoAccessCount).toBe(0);
  });

  it("does not count pending or declined project invites as access", () => {
    const overview = buildMemberWorkAccessOverview({
      members: [member({})],
      projects: [project({}), project({ id: "project-b", workId: "work-b", title: "신작 콘티" })],
      snapshots: new Map([
        ["work-a", snapshot("work-a", [studioMember({ role: "commenter", status: "pending" })])],
        ["work-b", snapshot("work-b", [studioMember({ role: "viewer", status: "declined" })])],
      ]),
    });
    const row = overview.rows[0]!;
    expect(row.activeCount).toBe(0);
    expect(row.pendingCount).toBe(1);
    // 대기·거절만 있는 구성원은 "접근 작품 없음"으로 세되, 거절은 대기와 섞지 않는다.
    expect(row.entries[1]!.status).toBe("declined");
    expect(overview.membersWithNoAccessCount).toBe(1);
  });

  it("marks failed snapshot loads as unknown instead of no access", () => {
    const overview = buildMemberWorkAccessOverview({
      members: [member({})],
      projects: [project({}), project({ id: "project-b", workId: "work-b", title: "신작 콘티" })],
      snapshots: new Map<string, StudioTeamSnapshot | null>([
        ["work-a", null],
        // work-b 키 자체가 없어도 확인 불가로 취급한다.
      ]),
    });
    const row = overview.rows[0]!;
    expect(row.unknownCount).toBe(2);
    expect(row.activeCount).toBe(0);
    expect(overview.failedProjectCount).toBe(2);
    // 모르는 상태를 "작품 권한 없음" 인원수에 넣지 않는다.
    expect(overview.membersWithNoAccessCount).toBe(0);
    expect(row.entries[0]).toMatchObject({ load: "failed", projectRole: null });
  });

  it("dedupes members and projects and preserves project order", () => {
    const overview = buildMemberWorkAccessOverview({
      members: [member({}), member({ displayName: "중복 행" })],
      projects: [
        project({ id: "project-b", workId: "work-b", title: "신작 콘티" }),
        project({}),
        project({ id: "project-a-copy", title: "중복 작품" }),
      ],
      snapshots: new Map([
        ["work-a", snapshot("work-a", [studioMember({})])],
        ["work-b", snapshot("work-b", [studioMember({ role: "owner", status: "active", isOwner: true })])],
      ]),
    });
    expect(overview.rows).toHaveLength(1);
    expect(overview.rows[0]!.displayName).toBe("김작가");
    expect(overview.rows[0]!.entries.map((entry) => entry.workId)).toEqual(["work-b", "work-a"]);
    expect(overview.projectCount).toBe(2);
  });

  it("labels every project role and status in both languages", () => {
    expect(Object.keys(PROJECT_ROLE_LABELS).sort()).toEqual(["admin", "commenter", "editor", "owner", "viewer"]);
    expect(PROJECT_ROLE_LABELS.owner.ko).toContain("소유자");
    expect(PROJECT_STATUS_LABELS.pending.ko).toContain("아직 접근 전");
    expect(PROJECT_STATUS_LABELS.active.en).toBe("Active");
  });
});
