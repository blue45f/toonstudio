import { describe, expect, it } from "vitest";
import { TEAM_WORKSPACE_AUDIT_ACTIONS as CONTRACT_ACTIONS } from "@toonstudio/contracts/production-workspace";
import { TEAM_WORKSPACE_AUDIT_ACTIONS as DTO_ACTIONS, WorkspaceAuditQuerySchema } from "./team-workspace.dto";
import { auditFetchLimit, auditWhereClause, toAuditResponse, type TeamWorkspaceAuditRow } from "./team-workspace-audit";

const row = (id: number): TeamWorkspaceAuditRow => ({
  id,
  actor_user_id: "user-1",
  actorDisplayName: "김작가",
  action: "workspace.invite",
  target_id: "invite-1",
  targetDisplayName: "new@example.test",
  revision: id,
  occurredAt: "2026-10-14T00:00:00.000Z",
});

describe("team workspace audit query contract", () => {
  it("keeps the dto action list identical to the shared contract list", () => {
    expect([...DTO_ACTIONS]).toEqual([...CONTRACT_ACTIONS]);
  });

  it("accepts period, actor, action, cursor and limit filters from query strings", () => {
    const parsed = WorkspaceAuditQuerySchema.parse({
      from: "2026-10-01T00:00:00+09:00",
      to: "2026-11-01T00:00:00+09:00",
      actorUserId: "user-1",
      action: "workspace.remove-member",
      cursor: "42",
      limit: "25",
    });
    expect(parsed).toMatchObject({ actorUserId: "user-1", action: "workspace.remove-member", cursor: 42, limit: 25 });
  });

  it("defaults the limit to 50 and rejects unknown actions, oversized limits and reversed periods", () => {
    expect(WorkspaceAuditQuerySchema.parse({}).limit).toBe(50);
    expect(WorkspaceAuditQuerySchema.safeParse({ action: "workspace.checkout" }).success).toBe(false);
    expect(WorkspaceAuditQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(WorkspaceAuditQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(WorkspaceAuditQuerySchema.safeParse({
      from: "2026-11-01T00:00:00+09:00", to: "2026-10-01T00:00:00+09:00",
    }).success).toBe(false);
    // 오타 필터가 조용히 무시되면 감사 조회가 잘못된 신뢰를 주므로 strict로 거부한다.
    expect(WorkspaceAuditQuerySchema.safeParse({ actorrUserId: "user-1" }).success).toBe(false);
  });
});

describe("team workspace audit pagination", () => {
  it("fetches one extra row and exposes the last visible id as the next cursor", () => {
    expect(auditFetchLimit(undefined)).toBe(51);
    expect(auditFetchLimit(2)).toBe(3);
    expect(auditFetchLimit(500)).toBe(101);
    const response = toAuditResponse("ws-1", [row(9), row(8), row(7)], 2);
    expect(response.entries.map((entry) => entry.id)).toEqual([9, 8]);
    expect(response.nextCursor).toBe(8);
    expect(response.entries[0]).toMatchObject({
      actorUserId: "user-1", actorDisplayName: "김작가", action: "workspace.invite",
      targetId: "invite-1", targetDisplayName: "new@example.test", revision: 9,
    });
  });

  it("returns a null cursor when the page is the last one", () => {
    const response = toAuditResponse("ws-1", [row(3)], 50);
    expect(response.nextCursor).toBeNull();
    expect(response.entries).toHaveLength(1);
  });
});

describe("team workspace audit filters", () => {
  it("binds every filter as a positional parameter after workspace_id", () => {
    const { sql, params } = auditWhereClause({
      from: "2026-10-01T00:00:00+09:00",
      to: "2026-11-01T00:00:00+09:00",
      actorUserId: "user-1",
      action: "workspace.invite",
      cursor: 42,
      limit: 50,
    });
    expect(params).toEqual(["2026-10-01T00:00:00+09:00", "2026-11-01T00:00:00+09:00", "user-1", "workspace.invite", 42]);
    expect(sql).toBe(" AND a.occurred_at >= $2 AND a.occurred_at < $3 AND a.actor_user_id = $4 AND a.action = $5 AND a.id < $6");
    expect(sql).not.toContain("user-1");
  });

  it("adds no clause when no filter is given", () => {
    expect(auditWhereClause({ limit: 50 })).toEqual({ sql: "", params: [] });
  });
});
