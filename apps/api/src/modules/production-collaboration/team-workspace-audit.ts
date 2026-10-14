import {
  TEAM_WORKSPACE_AUDIT_DEFAULT_LIMIT,
  TEAM_WORKSPACE_AUDIT_MAX_LIMIT,
  type TeamWorkspaceAuditResponse,
} from "@toonstudio/contracts/production-workspace";
import type { TeamWorkspaceAuditQueryInput } from "./team-workspace.dto";

/** production_team_audit 한 행을 조회한 원시 형태(pg 드라이버 반환값). */
export interface TeamWorkspaceAuditRow {
  readonly id: number;
  readonly actor_user_id: string;
  readonly actorDisplayName: string;
  readonly action: string;
  readonly target_id: string;
  readonly targetDisplayName: string | null;
  readonly revision: number;
  readonly occurredAt: string;
}

/**
 * limit+1건을 조회하는 키셋 페이지네이션 규칙을 순수 함수로 고정한다.
 * repository는 항상 limit+1건을 요청하고, 초과분 1건이 있으면 잘라 내며
 * 마지막으로 남은 항목의 id를 nextCursor로 돌려준다.
 */
export function auditFetchLimit(limit: number | undefined): number {
  const resolved = limit ?? TEAM_WORKSPACE_AUDIT_DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(resolved)), TEAM_WORKSPACE_AUDIT_MAX_LIMIT) + 1;
}

export function toAuditResponse(
  workspaceId: string,
  rows: readonly TeamWorkspaceAuditRow[],
  limit: number | undefined,
): TeamWorkspaceAuditResponse {
  const pageSize = auditFetchLimit(limit) - 1;
  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    workspaceId,
    entries: page.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorDisplayName: row.actorDisplayName,
      // DB에는 record()가 만든 코드만 들어가지만, 미래 코드가 생겨도 조회가 깨지지 않게 문자열 그대로 통과시킨다.
      action: row.action as TeamWorkspaceAuditResponse["entries"][number]["action"],
      targetId: row.target_id,
      targetDisplayName: row.targetDisplayName,
      revision: row.revision,
      occurredAt: row.occurredAt,
    })),
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
  };
}

/**
 * 필터를 위치 파라미터 배열로 바꾼다. 값은 전부 파라미터로만 바인딩하고
 * SQL 문자열에 끼워 넣지 않는다. $1은 항상 workspace_id다.
 */
export function auditWhereClause(query: TeamWorkspaceAuditQueryInput): { readonly sql: string; readonly params: readonly unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length + 1}`;
  };
  if (query.from) clauses.push(`a.occurred_at >= ${bind(query.from)}`);
  if (query.to) clauses.push(`a.occurred_at < ${bind(query.to)}`);
  if (query.actorUserId) clauses.push(`a.actor_user_id = ${bind(query.actorUserId)}`);
  if (query.action) clauses.push(`a.action = ${bind(query.action)}`);
  if (query.cursor) clauses.push(`a.id < ${bind(query.cursor)}`);
  return { sql: clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "", params };
}
