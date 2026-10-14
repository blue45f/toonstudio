import type {
  TeamWorkspaceAuditAction,
  TeamWorkspaceAuditEntry,
  TeamWorkspaceAuditQuery,
} from "@toonstudio/contracts/production-workspace";

export interface BilingualLabel {
  readonly ko: string;
  readonly en: string;
}

/** record()가 실제로 남기는 행위 코드 전체의 표시 이름. 알 수 없는 코드는 코드 그대로 보여 준다. */
export const TEAM_AUDIT_ACTION_LABELS: Readonly<Record<TeamWorkspaceAuditAction, BilingualLabel>> = {
  "workspace.created": { ko: "팀을 만들었습니다", en: "Created the team" },
  "workspace.rename": { ko: "팀 이름을 바꿨습니다", en: "Renamed the team" },
  "workspace.invite": { ko: "구성원을 초대했습니다", en: "Invited a member" },
  "workspace.revoke-invite": { ko: "초대를 취소했습니다", en: "Cancelled an invite" },
  "workspace.change-member-role": { ko: "구성원 역할을 바꿨습니다", en: "Changed a member's role" },
  "workspace.remove-member": { ko: "구성원을 팀에서 제외했습니다", en: "Removed a member from the team" },
  "workspace.transfer-owner": { ko: "팀 소유권을 이전했습니다", en: "Transferred team ownership" },
  "workspace.attach-project": { ko: "작품을 팀에 연결했습니다", en: "Linked a project to the team" },
  "workspace.detach-project": { ko: "작품 연결을 해제했습니다", en: "Unlinked a project" },
  "workspace.invite-accepted": { ko: "초대를 수락해 합류했습니다", en: "Accepted an invite and joined" },
};

export const TEAM_AUDIT_ACTION_OPTIONS: readonly TeamWorkspaceAuditAction[] = Object.keys(
  TEAM_AUDIT_ACTION_LABELS,
) as TeamWorkspaceAuditAction[];

export function teamAuditActionLabel(action: string): BilingualLabel {
  return TEAM_AUDIT_ACTION_LABELS[action as TeamWorkspaceAuditAction] ?? { ko: action, en: action };
}

/** 활동 탭 필터 상태. 날짜는 date 입력값(YYYY-MM-DD) 그대로 들고 있는다. */
export interface TeamAuditFilterState {
  readonly fromDate: string;
  readonly toDate: string;
  readonly actorUserId: string;
  readonly action: string;
}

export const EMPTY_TEAM_AUDIT_FILTER: TeamAuditFilterState = {
  fromDate: "",
  toDate: "",
  actorUserId: "",
  action: "",
};

export function isTeamAuditFilterActive(filter: TeamAuditFilterState): boolean {
  return Boolean(filter.fromDate || filter.toDate || filter.actorUserId || filter.action);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * 날짜 입력값을 API의 [from, to) 구간으로 바꾼다.
 * date 입력은 하루 단위이므로 종료일은 다음 날 00:00을 to로 보내 선택한 날 전체를 포함한다.
 * 잘못된 날짜 문자열은 보내지 않고 해당 경계를 비운다(서버 DTO가 어차피 거부한다).
 */
export function teamAuditQueryFromFilter(
  filter: TeamAuditFilterState,
  cursor?: number,
): TeamWorkspaceAuditQuery {
  const query: { -readonly [K in keyof TeamWorkspaceAuditQuery]: TeamWorkspaceAuditQuery[K] } = {};
  if (DATE_ONLY.test(filter.fromDate)) query.from = new Date(`${filter.fromDate}T00:00:00`).toISOString();
  if (DATE_ONLY.test(filter.toDate)) {
    const end = new Date(`${filter.toDate}T00:00:00`);
    end.setDate(end.getDate() + 1);
    query.to = end.toISOString();
  }
  if (query.from && query.to && query.from >= query.to) {
    // 시작일이 종료일보다 뒤면 서버가 400을 주기 전에 빈 결과로 읽히지 않게 양쪽을 비운다.
    delete query.from;
    delete query.to;
  }
  if (filter.actorUserId) query.actorUserId = filter.actorUserId;
  if (filter.action && filter.action in TEAM_AUDIT_ACTION_LABELS) {
    query.action = filter.action as TeamWorkspaceAuditAction;
  }
  if (cursor !== undefined) query.cursor = cursor;
  return query;
}

/** 한 줄 설명: "김작가 · 구성원을 초대했습니다 · 대상 홍길동". 대상 이름이 없으면 대상 id 뒷부분만 짧게 보인다. */
export function teamAuditTargetText(entry: TeamWorkspaceAuditEntry): string {
  if (entry.targetDisplayName) return entry.targetDisplayName;
  return entry.targetId.length > 12 ? `…${entry.targetId.slice(-8)}` : entry.targetId;
}
