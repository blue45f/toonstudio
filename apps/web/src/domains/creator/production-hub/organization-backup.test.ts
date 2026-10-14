import { describe, expect, it } from "vitest";
import type { TeamWorkspaceDetail } from "@toonstudio/contracts/production-workspace";
import {
  buildOrganizationBackup,
  organizationBackupFileName,
  parseOrganizationBackup,
  serializeOrganizationBackup,
  type OrganizationBackupSource,
} from "./organization-backup";

const profile = {
  id: "org-1",
  name: "희준 스튜디오",
  kind: "studio" as const,
  description: "웹툰 제작",
  ownerUserId: "user-owner",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};

function team(id: string, name: string): TeamWorkspaceDetail {
  return {
    workspace: {
      id, name, ownerUserId: "user-owner", revision: 3, role: "owner",
      createdAt: "2026-09-01T00:00:00.000Z", projectCount: 1, memberCount: 2, pendingInvites: 0,
    },
    members: [
      { userId: "user-b", displayName: "민지", role: "member", joinedAt: "2026-09-02T00:00:00.000Z" },
      { userId: "user-a", displayName: "희준", role: "owner", joinedAt: "2026-09-01T00:00:00.000Z" },
    ],
    projects: [{ id: `proj-${id}`, workId: `work-${id}`, title: `${name} 작품`, ownerUserId: "user-owner" }],
    invites: [{ id: `inv-${id}`, email: "guest@example.com", role: "guest", expiresAt: "2026-10-20T00:00:00.000Z" }],
  };
}

const source: OrganizationBackupSource = {
  profile,
  notices: [{ id: "notice-1", body: "월요일 전체 회의", createdAt: "2026-10-03T00:00:00.000Z" }],
  linkedWorkspaceIds: ["ws-b", "ws-a"],
  teams: [
    {
      detail: team("ws-b", "베타 팀"),
      auditEntries: [
        { id: 7, actorUserId: "user-a", actorDisplayName: "희준", action: "workspace.invite", targetId: "user-b", targetDisplayName: "민지", revision: 2, occurredAt: "2026-10-04T00:00:00.000Z" },
      ],
    },
    { detail: team("ws-a", "알파 팀") }, // 감사 로그를 읽지 못한 팀
  ],
};

const ALL = ["settings", "members", "projects", "audit"] as const;
const NOW = new Date("2026-10-14T00:00:00.000Z");

describe("organization backup build", () => {
  it("flattens rosters and projects across linked teams in a stable order", () => {
    const backup = buildOrganizationBackup(source, ALL, NOW);
    expect(backup._app).toBe("toonstudio-organization");
    expect(backup.counts).toEqual({ teams: 2, members: 4, projects: 2, auditEntries: 1, notices: 1 });
    // 팀은 이름순(베타→알파가 아니라 가나다순: 베타 팀 < 알파 팀? 한글 코드포인트 순), 구성원은 이름순
    expect(backup.data.members?.map((member) => member.workspaceName)).toEqual(["베타 팀", "베타 팀", "알파 팀", "알파 팀"]);
    expect(backup.data.members?.map((member) => member.displayName)).toEqual(["민지", "희준", "민지", "희준"]);
    expect(backup.data.audit?.[0]).toMatchObject({ workspaceId: "ws-b", action: "workspace.invite" });
  });

  it("never includes invite emails or tokens — the roster is names and roles only", () => {
    const text = serializeOrganizationBackup(buildOrganizationBackup(source, ALL, NOW));
    expect(text).not.toContain("guest@example.com");
    expect(text).not.toContain("inv-ws-a");
  });

  it("records teams whose audit log could not be read instead of silently dropping them", () => {
    const backup = buildOrganizationBackup(source, ALL, NOW);
    expect(backup.coverage.missingAuditWorkspaceIds).toEqual(["ws-a"]);
    expect(backup.coverage.truncatedAuditWorkspaceIds).toEqual([]);
  });

  it("omits unselected sections from the file entirely", () => {
    const backup = buildOrganizationBackup(source, ["settings"], NOW);
    expect(backup.sections).toEqual(["settings"]);
    expect(Object.keys(backup.data)).toEqual(["settings"]);
    expect(backup.counts.members).toBe(0);
    expect(backup.coverage.missingAuditWorkspaceIds).toEqual([]);
  });

  it("builds a filesystem-safe file name from the organization name and date", () => {
    const backup = buildOrganizationBackup(source, ALL, NOW);
    expect(organizationBackupFileName(backup, NOW)).toBe("toonstudio-organization-backup-희준-스튜디오-2026-10-14.json");
  });
});

describe("organization backup verification", () => {
  it("round-trips: a built backup parses back to the same summary", () => {
    const backup = buildOrganizationBackup(source, ALL, NOW);
    const summary = parseOrganizationBackup(serializeOrganizationBackup(backup));
    expect(summary.organizationId).toBe("org-1");
    expect(summary.organizationName).toBe("희준 스튜디오");
    expect(summary.counts).toEqual(backup.counts);
    expect(summary.sections).toEqual(["settings", "members", "projects", "audit"]);
    expect(summary.missingAuditWorkspaceIds).toEqual(["ws-a"]);
    expect(summary.checksum).toBe(backup.checksum);
  });

  it("rejects a tampered backup (checksum mismatch)", () => {
    const backup = buildOrganizationBackup(source, ALL, NOW);
    const tampered = serializeOrganizationBackup(backup).replace("민지", "민수");
    expect(() => parseOrganizationBackup(tampered)).toThrow();
  });

  it("rejects a backup whose counts lie about its data", () => {
    const backup = buildOrganizationBackup(source, ALL, NOW);
    const lying = { ...backup, counts: { ...backup.counts, members: 99 } };
    expect(() => parseOrganizationBackup(JSON.stringify(lying))).toThrow();
  });

  it("rejects other apps' files and unsafe keys", () => {
    expect(() => parseOrganizationBackup(JSON.stringify({ _app: "toonstudio-library", version: 1 }))).toThrow();
    const backup = buildOrganizationBackup(source, ALL, NOW);
    const poisoned = serializeOrganizationBackup(backup).replace('"data": {', '"data": { "__proto__": {},');
    expect(() => parseOrganizationBackup(poisoned)).toThrow();
  });

  it("rejects a file that smuggles an unselected section into data", () => {
    const backup = buildOrganizationBackup(source, ["settings"], NOW);
    const smuggled = { ...backup, data: { ...backup.data, members: [] } };
    expect(() => parseOrganizationBackup(JSON.stringify(smuggled))).toThrow();
  });
});
