import type { OrganizationRole } from "./organization-model";

/**
 * 팀 AI 사용 모니터링 집계 모델 — 조직/팀 관리자가 AI 사용량·차단 건수를 보는 표면의 정본.
 *
 * 데이터의 현재 위치 (main 실측):
 * - 서버 사용량 계약(`WorkspaceUsageResponse`)은 `externalAiEnabled: false`·
 *   `meteredProvidersEnabled: false`를 고정한다 — AI 사용량은 아직 서버에 집계되지 않는다.
 * - 실재하는 유일한 계측은 각자 기기의 무료 AI 안전 원장(`free-ai-runtime-budget`)뿐이고,
 *   그 원장은 본인 기기에만 남는다. 남의 기기 원장을 모아 오는 경로는 만들지 않는다.
 * - 따라서 이 모델은 "조직 서버 계약에 AI 사용량 집계가 붙는 순간 서버가 돌려줄 행 모양"을
 *   입력 계약으로 고정한다. 패널은 records가 null이면 미연결 상태를 정직하게 표시하고,
 *   서버 집계가 연결되면 같은 모양 그대로 실데이터를 그린다.
 *
 * 개인정보 경계 (이 모델이 구조로 강제하는 것 — 문구만의 약속이 아니다):
 * 1. 내용 없음: 입력 행에는 프롬프트·응답·생성물 내용이 들어갈 자리가 타입에 없다.
 *    집계되는 것은 횟수·예약 토큰·차단 건수와 차단 사유뿐이다.
 * 2. 일 단위: 시각 단위·요청 단위 기록은 받지 않는다. 행의 시간 해상도는 UTC 날짜 하나다.
 * 3. BYOK 제외: 자기 AI 키 사용은 제공자와 본인 사이의 일이라 팀 집계에 넣지 않는다.
 *    BYOK 행이 섞여 들어와도 합산에서 빼고, 빠진 양만 `excludedByok`로 따로 알린다.
 * 4. 역할 차등: 구성원별 행은 조직 대표·운영 관리자만 본다. 매니저는 팀 합계만,
 *    구성원·게스트는 이 표면 자체를 보지 않는다.
 * 5. 소규모 팀 억제: 기간 내 활동 구성원이 기준 인원보다 적으면 구성원별 행을 접고
 *    팀 합계만 보여준다 — 한두 명 팀에서 "누가 얼마나 썼는지"가 그대로 드러나는 것을 막는다.
 * 6. 이름은 새 개인정보가 아니다: memberName은 조직 구성원 명단에 이미 있는 표시 이름만
 *    받는다. 이메일·사용자 ID 원문은 표면에 싣지 않는다(memberId는 조인 키로만 쓴다).
 */

/** 차단 사유 — 무료 AI 안전 원장(`free-ai-runtime-budget`)의 차단 사유와 같은 값 집합. */
export type AiBlockReason =
  | "daily-request-budget"
  | "daily-token-budget"
  | "rate-limit"
  | "payment-required"
  | "authentication";

export const AI_BLOCK_REASONS: readonly AiBlockReason[] = [
  "daily-request-budget",
  "daily-token-budget",
  "rate-limit",
  "payment-required",
  "authentication",
];

/** 사용 경로. byok는 개인정보 경계상 집계 제외 대상이다. */
export type AiUsageSource = "managed-free" | "platform" | "byok";

/**
 * 서버 집계 행 1개 = 구성원 1명 × 팀 1개 × UTC 하루.
 * 내용 필드가 없다는 것이 개인정보 경계의 핵심이다 — 이 타입을 넓혀 내용을 넣지 않는다.
 */
export interface AiUsageDailyRecord {
  readonly workspaceId: string;
  /** 조인 키로만 쓴다. 표면에는 싣지 않는다. */
  readonly memberId: string;
  /** 구성원 명단에 이미 있는 표시 이름. */
  readonly memberName: string;
  /** UTC 날짜(yyyy-mm-dd). 이보다 촘촘한 시간 해상도는 받지 않는다. */
  readonly day: string;
  readonly source: AiUsageSource;
  /** 성공해 실행된 AI 요청 수. */
  readonly requests: number;
  /** 예약 토큰 합 (무료 원장의 reservedTokens와 같은 정의). */
  readonly reservedTokens: number;
  /** 가드·제공자가 막은 시도 수. */
  readonly blocked: number;
  readonly blockedByReason: Partial<Record<AiBlockReason, number>>;
}

/** 구성원별 행을 펼치려면 기간 내 활동 구성원이 최소 이 인원 이상이어야 한다. */
export const AI_USAGE_MEMBER_ROW_MIN_TEAM_SIZE = 3;

/** 개인정보 경계 상수 — 패널 고지 문구와 모델 동작이 이 값을 같이 본다. */
export const AI_USAGE_PRIVACY_BOUNDARY = {
  /** 프롬프트·응답·생성물 내용을 수집·표시하지 않는다. */
  collectsContent: false,
  /** 시간 해상도는 하루까지만. */
  granularity: "day",
  /** 자기 키(BYOK) 사용량은 팀 집계에 포함하지 않는다. */
  byokIncluded: false,
  /** 구성원별 행을 볼 수 있는 조직 역할. */
  memberRowRoles: ["owner", "admin"] as readonly OrganizationRole[],
  /** 팀 합계를 볼 수 있는 조직 역할. */
  teamTotalRoles: ["owner", "admin", "manager"] as readonly OrganizationRole[],
  /** 구성원별 행을 펼치는 최소 팀 규모. */
  memberRowMinTeamSize: AI_USAGE_MEMBER_ROW_MIN_TEAM_SIZE,
} as const;

/** 보는 사람의 조직 역할에 따라 표면이 열려 있는 정도. */
export type AiUsageVisibility = "member-rows" | "team-totals" | "none";

export function aiUsageVisibilityForRole(role: OrganizationRole): AiUsageVisibility {
  if (AI_USAGE_PRIVACY_BOUNDARY.memberRowRoles.includes(role)) return "member-rows";
  if (AI_USAGE_PRIVACY_BOUNDARY.teamTotalRoles.includes(role)) return "team-totals";
  return "none";
}

export interface AiUsageTotals {
  readonly requests: number;
  readonly reservedTokens: number;
  readonly blocked: number;
  /** 시도 = 실행된 요청 + 차단된 시도. 시도가 없으면 0. */
  readonly attempts: number;
  /** 차단율 0..1. 시도가 없으면 0이다(지어내지 않는다). */
  readonly blockRate: number;
}

export interface AiUsageMemberRow extends AiUsageTotals {
  readonly memberId: string;
  readonly memberName: string;
  /** 사용 기록이 있던 날 수. */
  readonly activeDays: number;
}

export type AiUsageMemberRowState = "visible" | "hidden-by-role" | "suppressed-small-team";

export interface AiUsageTeamRow extends AiUsageTotals {
  readonly workspaceId: string;
  readonly name: string;
  /** 기간 내 기록이 있는 구성원 수(중복 없음). */
  readonly activeMemberCount: number;
  readonly memberRowState: AiUsageMemberRowState;
  /** memberRowState가 "visible"일 때만 채워진다. 그 외에는 빈 배열이다. */
  readonly memberRows: readonly AiUsageMemberRow[];
}

export interface AiUsageReasonRow {
  readonly reason: AiBlockReason;
  readonly count: number;
}

export interface AiUsageDayPoint {
  readonly day: string;
  readonly requests: number;
  readonly blocked: number;
}

export interface TeamAiUsageReport {
  readonly visibility: AiUsageVisibility;
  /** 집계에 들어간 플랫폼 행 수(BYOK 제외). */
  readonly recordCount: number;
  /** 집계 기간에 등장한 날짜들(오름차순). */
  readonly days: readonly string[];
  readonly totals: AiUsageTotals;
  readonly teams: readonly AiUsageTeamRow[];
  /** 차단 사유별 분해 — 건수 내림차순, 동률이면 사유 이름순. */
  readonly blockedByReason: readonly AiUsageReasonRow[];
  /** 날짜 오름차순 추이. */
  readonly dailySeries: readonly AiUsageDayPoint[];
  /** 개인정보 경계로 합산에서 빠진 BYOK 사용량. 존재 자체를 숨기지 않고 양만 알린다. */
  readonly excludedByok: { readonly requests: number; readonly blocked: number };
}

export interface TeamAiUsageTeamRef {
  readonly id: string;
  readonly name: string;
}

const EMPTY_TOTALS: AiUsageTotals = { requests: 0, reservedTokens: 0, blocked: 0, attempts: 0, blockRate: 0 };

function cleanCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function totalsOf(requests: number, reservedTokens: number, blocked: number): AiUsageTotals {
  const attempts = requests + blocked;
  return {
    requests,
    reservedTokens,
    blocked,
    attempts,
    blockRate: attempts > 0 ? blocked / attempts : 0,
  };
}

interface MutableBucket {
  requests: number;
  reservedTokens: number;
  blocked: number;
}

function addTo(bucket: MutableBucket, record: AiUsageDailyRecord): void {
  bucket.requests += cleanCount(record.requests);
  bucket.reservedTokens += cleanCount(record.reservedTokens);
  bucket.blocked += cleanCount(record.blocked);
}

function isKnownReason(key: string): key is AiBlockReason {
  return (AI_BLOCK_REASONS as readonly string[]).includes(key);
}

export function buildTeamAiUsageReport(input: {
  readonly records: readonly AiUsageDailyRecord[];
  readonly teams: readonly TeamAiUsageTeamRef[];
  readonly viewerRole: OrganizationRole;
}): TeamAiUsageReport {
  const visibility = aiUsageVisibilityForRole(input.viewerRole);
  const teamNameById = new Map(input.teams.map((team) => [team.id, team.name]));

  const platformRecords: AiUsageDailyRecord[] = [];
  let byokRequests = 0;
  let byokBlocked = 0;
  for (const record of input.records) {
    if (record.source === "byok") {
      byokRequests += cleanCount(record.requests);
      byokBlocked += cleanCount(record.blocked);
    } else {
      platformRecords.push(record);
    }
  }
  const excludedByok = { requests: byokRequests, blocked: byokBlocked };

  if (visibility === "none") {
    return {
      visibility,
      recordCount: 0,
      days: [],
      totals: EMPTY_TOTALS,
      teams: [],
      blockedByReason: [],
      dailySeries: [],
      excludedByok,
    };
  }

  const totalBucket: MutableBucket = { requests: 0, reservedTokens: 0, blocked: 0 };
  const reasonCounts = new Map<AiBlockReason, number>();
  const dayBuckets = new Map<string, MutableBucket>();
  const teamBuckets = new Map<string, MutableBucket>();
  const memberBuckets = new Map<string, MutableBucket & { memberName: string; days: Set<string> }>();
  const teamMembers = new Map<string, Set<string>>();

  for (const record of platformRecords) {
    addTo(totalBucket, record);

    const dayBucket = dayBuckets.get(record.day) ?? { requests: 0, reservedTokens: 0, blocked: 0 };
    addTo(dayBucket, record);
    dayBuckets.set(record.day, dayBucket);

    const teamBucket = teamBuckets.get(record.workspaceId) ?? { requests: 0, reservedTokens: 0, blocked: 0 };
    addTo(teamBucket, record);
    teamBuckets.set(record.workspaceId, teamBucket);

    const members = teamMembers.get(record.workspaceId) ?? new Set<string>();
    members.add(record.memberId);
    teamMembers.set(record.workspaceId, members);

    const memberKey = `${record.workspaceId} ${record.memberId}`;
    const memberBucket = memberBuckets.get(memberKey) ?? {
      requests: 0,
      reservedTokens: 0,
      blocked: 0,
      memberName: record.memberName,
      days: new Set<string>(),
    };
    addTo(memberBucket, record);
    memberBucket.days.add(record.day);
    memberBuckets.set(memberKey, memberBucket);

    for (const [key, value] of Object.entries(record.blockedByReason)) {
      if (!isKnownReason(key)) continue;
      reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + cleanCount(value ?? 0));
    }
  }

  const teams: AiUsageTeamRow[] = [...teamBuckets.entries()]
    .map(([workspaceId, bucket]) => {
      const activeMemberCount = teamMembers.get(workspaceId)?.size ?? 0;
      let memberRowState: AiUsageMemberRowState;
      if (visibility !== "member-rows") memberRowState = "hidden-by-role";
      else if (activeMemberCount < AI_USAGE_MEMBER_ROW_MIN_TEAM_SIZE) memberRowState = "suppressed-small-team";
      else memberRowState = "visible";

      const memberRows: AiUsageMemberRow[] = memberRowState === "visible"
        ? [...memberBuckets.entries()]
            .filter(([key]) => key.startsWith(`${workspaceId} `))
            .map(([key, memberBucket]) => ({
              memberId: key.slice(workspaceId.length + 1),
              memberName: memberBucket.memberName,
              activeDays: memberBucket.days.size,
              ...totalsOf(memberBucket.requests, memberBucket.reservedTokens, memberBucket.blocked),
            }))
            .sort((a, b) => b.requests - a.requests || b.blocked - a.blocked || a.memberName.localeCompare(b.memberName))
        : [];

      return {
        workspaceId,
        name: teamNameById.get(workspaceId) ?? workspaceId,
        activeMemberCount,
        memberRowState,
        memberRows,
        ...totalsOf(bucket.requests, bucket.reservedTokens, bucket.blocked),
      };
    })
    .sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name));

  const blockedByReason: AiUsageReasonRow[] = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  const dailySeries: AiUsageDayPoint[] = [...dayBuckets.entries()]
    .map(([day, bucket]) => ({ day, requests: bucket.requests, blocked: bucket.blocked }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    visibility,
    recordCount: platformRecords.length,
    days: dailySeries.map((point) => point.day),
    totals: totalsOf(totalBucket.requests, totalBucket.reservedTokens, totalBucket.blocked),
    teams,
    blockedByReason,
    dailySeries,
    excludedByok,
  };
}
