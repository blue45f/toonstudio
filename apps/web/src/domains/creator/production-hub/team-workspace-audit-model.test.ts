import { describe, expect, it } from "vitest";
import type { TeamWorkspaceAuditEntry } from "@toonstudio/contracts/production-workspace";
import {
  EMPTY_TEAM_AUDIT_FILTER,
  isTeamAuditFilterActive,
  teamAuditActionLabel,
  teamAuditQueryFromFilter,
  teamAuditTargetText,
} from "./team-workspace-audit-model";

const entry = (patch: Partial<TeamWorkspaceAuditEntry>): TeamWorkspaceAuditEntry => ({
  id: 1,
  actorUserId: "user-1",
  actorDisplayName: "김작가",
  action: "workspace.invite",
  targetId: "invite-1",
  targetDisplayName: null,
  revision: 1,
  occurredAt: "2026-10-14T00:00:00.000Z",
  ...patch,
});

describe("team audit model", () => {
  it("labels every recorded action and falls back to the raw code", () => {
    expect(teamAuditActionLabel("workspace.remove-member").ko).toContain("제외");
    expect(teamAuditActionLabel("workspace.attach-project").en).toContain("Linked");
    expect(teamAuditActionLabel("workspace.future-action")).toEqual({ ko: "workspace.future-action", en: "workspace.future-action" });
  });

  it("converts a date range into a half-open instant range covering the end day", () => {
    const query = teamAuditQueryFromFilter({ fromDate: "2026-10-01", toDate: "2026-10-14", actorUserId: "", action: "" });
    expect(new Date(query.from!).getTime()).toBe(new Date("2026-10-01T00:00:00").getTime());
    expect(new Date(query.to!).getTime()).toBe(new Date("2026-10-15T00:00:00").getTime());
  });

  it("passes actor, action and cursor through, and drops invalid values", () => {
    const query = teamAuditQueryFromFilter(
      { fromDate: "not-a-date", toDate: "", actorUserId: "user-9", action: "workspace.invite" },
      42,
    );
    expect(query).toEqual({ actorUserId: "user-9", action: "workspace.invite", cursor: 42 });
    expect(teamAuditQueryFromFilter({ ...EMPTY_TEAM_AUDIT_FILTER, action: "workspace.checkout" })).toEqual({});
    // 시작일이 종료일보다 뒤인 구간은 양쪽을 비워 서버 오류 대신 전체 조회로 떨어지지 않게 한다.
    expect(teamAuditQueryFromFilter({ fromDate: "2026-10-14", toDate: "2026-10-01", actorUserId: "", action: "" })).toEqual({});
  });

  it("reports whether any filter is active", () => {
    expect(isTeamAuditFilterActive(EMPTY_TEAM_AUDIT_FILTER)).toBe(false);
    expect(isTeamAuditFilterActive({ ...EMPTY_TEAM_AUDIT_FILTER, actorUserId: "user-1" })).toBe(true);
  });

  it("shows the target name when resolved and a shortened id otherwise", () => {
    expect(teamAuditTargetText(entry({ targetDisplayName: "홍길동" }))).toBe("홍길동");
    expect(teamAuditTargetText(entry({ targetId: "12345678-1234-1234-1234-1234567890ab" }))).toBe("…567890ab");
    expect(teamAuditTargetText(entry({ targetId: "short" }))).toBe("short");
  });
});
