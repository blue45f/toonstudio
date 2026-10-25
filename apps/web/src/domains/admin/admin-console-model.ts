import { formatNumber } from "@toonstudio/core/format";

// 구 탭 콘솔(AdminPage) 삭제 후에도 대시보드 단축 카드가 레거시 탭 키로 말하고
// 라우터(adminPathFromLegacyTab)가 이를 분할 라우트로 번역하므로, 탭 키 어휘와 타입은 유지한다.
export const ADMIN_TAB_KEYS = [
  "dashboard",
  "traffic",
  "plans",
  "revenue",
  "promos",
  "announcements",
  "reports",
  "security",
  "audit",
  "campaigns",
  "ops",
] as const;

export type AdminTabKey = (typeof ADMIN_TAB_KEYS)[number];

export type AnnouncementOperationalStatus =
  | "active"
  | "scheduled"
  | "expired"
  | "inactive";

export interface SchedulableAnnouncement {
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

export function getAnnouncementOperationalStatus(
  item: SchedulableAnnouncement,
  nowMs = Date.now(),
): AnnouncementOperationalStatus {
  if (!item.isActive) return "inactive";

  const startsAtMs = item.startsAt ? Date.parse(item.startsAt) : Number.NaN;
  if (Number.isFinite(startsAtMs) && startsAtMs > nowMs) return "scheduled";

  const endsAtMs = item.endsAt ? Date.parse(item.endsAt) : Number.NaN;
  if (Number.isFinite(endsAtMs) && endsAtMs <= nowMs) return "expired";

  return "active";
}

export function countActiveCriticalAnnouncements<
  T extends SchedulableAnnouncement & { level?: string | null },
>(items: readonly T[], nowMs = Date.now()): number {
  return items.filter(
    (item) =>
      String(item.level ?? "").toLowerCase() === "critical" &&
      getAnnouncementOperationalStatus(item, nowMs) === "active",
  ).length;
}

export type ReportStatus = "pending" | "resolved" | "dismissed";

export interface ReportFilterableItem {
  id: string;
  reporterId: string;
  reporterName?: string | null;
  reporterEmail?: string | null;
  targetType: string;
  targetId: string;
  reason: string;
  status: ReportStatus;
  resolutionNote?: string | null;
}

export interface ReportFilters {
  status: ReportStatus | "all";
  targetType: string;
  query: string;
}

export function filterReports<T extends ReportFilterableItem>(
  items: readonly T[],
  filters: ReportFilters,
): T[] {
  const query = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.status !== "all" && item.status !== filters.status) {
      return false;
    }
    if (filters.targetType !== "all" && item.targetType !== filters.targetType) {
      return false;
    }
    if (!query) return true;

    return [
      item.id,
      item.reporterId,
      item.reporterName,
      item.reporterEmail,
      item.targetType,
      item.targetId,
      item.reason,
      item.resolutionNote,
    ].some((value) => String(value ?? "").toLowerCase().includes(query));
  });
}

export function countReportsByStatus(
  items: readonly ReportFilterableItem[],
): Record<ReportStatus, number> {
  return items.reduce<Record<ReportStatus, number>>(
    (counts, item) => {
      counts[item.status] += 1;
      return counts;
    },
    { pending: 0, resolved: 0, dismissed: 0 },
  );
}

export function toggleReportSelection(
  selected: ReadonlySet<string>,
  reportId: string,
): Set<string> {
  const next = new Set(selected);
  if (next.has(reportId)) next.delete(reportId);
  else next.add(reportId);
  return next;
}

export function toggleVisibleReportSelection(
  selected: ReadonlySet<string>,
  visiblePendingIds: readonly string[],
): Set<string> {
  const next = new Set(selected);
  const ids = visiblePendingIds.filter(Boolean);
  const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
  for (const id of ids) {
    if (allSelected) next.delete(id);
    else next.add(id);
  }
  return next;
}

export async function runWithConcurrency<T>(
  values: readonly T[],
  limit: number,
  worker: (value: T, index: number) => Promise<void>,
): Promise<Array<{ value: T; ok: boolean; error?: unknown }>> {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  const results: Array<{ value: T; ok: boolean; error?: unknown }> =
    new Array(values.length);
  let cursor = 0;

  const run = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      try {
        await worker(value, index);
        results[index] = { value, ok: true };
      } catch (error) {
        results[index] = { value, ok: false, error };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(normalizedLimit, values.length) }, run),
  );
  return results;
}

export const MEMBER_ROLES = ["user", "creator", "operator", "admin"] as const;
export const MEMBER_STATUSES = ["active", "suspended", "deleted", "merged"] as const;
export const MEMBER_SORTS = [
  "created_desc",
  "created_asc",
  "name_asc",
  "name_desc",
] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];
export type MemberStatus = (typeof MEMBER_STATUSES)[number];
export type MemberSort = (typeof MEMBER_SORTS)[number];

/** 화면의 관리 동작 노출만 결정한다. 서버는 모든 변경 요청의 권한을 별도로 검증한다. */
export function canManageAdminMembers(role: unknown): boolean {
  return role === "admin";
}

export interface MemberListFilters {
  q: string;
  role: MemberRole | "all";
  status: MemberStatus | "all";
  sort: MemberSort;
  limit: number;
  offset: number;
}

export function splitMemberSort(sort: MemberSort): {
  sort: "createdAt" | "name";
  direction: "asc" | "desc";
} {
  if (sort === "created_asc") return { sort: "createdAt", direction: "asc" };
  if (sort === "name_asc") return { sort: "name", direction: "asc" };
  if (sort === "name_desc") return { sort: "name", direction: "desc" };
  return { sort: "createdAt", direction: "desc" };
}

export function buildMemberQuery(
  filters: MemberListFilters,
  options: { includePaging?: boolean } = {},
): string {
  const params = new URLSearchParams();
  const search = filters.q.trim();
  if (search) params.set("q", search);
  if (filters.role !== "all") params.set("role", filters.role);
  if (filters.status !== "all") params.set("status", filters.status);

  const sort = splitMemberSort(filters.sort);
  params.set("sort", sort.sort);
  params.set("direction", sort.direction);

  if (options.includePaging !== false) {
    params.set("limit", String(Math.max(1, Math.floor(filters.limit))));
    params.set("offset", String(Math.max(0, Math.floor(filters.offset))));
  }

  return params.toString();
}

export function getPageCount(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 25;
  return Math.max(1, Math.ceil(total / size));
}

export function clampPage(page: number, total: number, pageSize: number): number {
  const maxPage = getPageCount(total, pageSize);
  if (!Number.isFinite(page)) return 1;
  return Math.min(maxPage, Math.max(1, Math.floor(page)));
}

export function toggleMemberSelection(
  selected: ReadonlySet<string>,
  memberId: string,
): Set<string> {
  const next = new Set(selected);
  if (next.has(memberId)) next.delete(memberId);
  else next.add(memberId);
  return next;
}

export function toggleVisibleMemberSelection(
  selected: ReadonlySet<string>,
  visibleMemberIds: readonly string[],
): Set<string> {
  const next = new Set(selected);
  const selectable = visibleMemberIds.filter(Boolean);
  const everySelected =
    selectable.length > 0 && selectable.every((id) => next.has(id));

  for (const id of selectable) {
    if (everySelected) next.delete(id);
    else next.add(id);
  }

  return next;
}

export interface MemberCsvRow {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  status: string;
  createdAt?: string | null;
}

function spreadsheetSafeCsvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildMemberCsv(rows: readonly MemberCsvRow[]): string {
  const header = ["ID", "Name", "Email", "Role", "Status", "CreatedAt"]
    .map(spreadsheetSafeCsvCell)
    .join(",");
  const body = rows
    .map((row) =>
      [
        row.id,
        row.name ?? "",
        row.email ?? "",
        row.role,
        row.status,
        row.createdAt ?? "",
      ]
        .map(spreadsheetSafeCsvCell)
        .join(","),
    )
    .join("\n");
  return `\uFEFF${header}\n${body}`;
}

export function interpolateCount(template: string, count: number): string {
  return template.replace("{count}", formatNumber(count));
}

export type WebVitalRating = "good" | "needs-improvement" | "poor";

export interface WebVitalMetricSummary {
  metric: "LCP" | "CLS" | "INP";
  samples: number;
  p75: number | null;
  rating: WebVitalRating | null;
  status: "pass" | "fail" | "insufficient-data";
}

export interface WebVitalsPathSummary {
  path: string;
  metrics: WebVitalMetricSummary[];
  status: "pass" | "fail" | "insufficient-data";
}

export interface WebVitalsAlert {
  kind: "rating-regression" | "p75-drift";
  severity: "warning" | "critical";
  path: string;
  metric: "LCP" | "CLS" | "INP";
  currentP75: number;
  previousP75: number;
  currentRating: WebVitalRating;
  previousRating: WebVitalRating;
  message: string;
}

export interface WebVitalsReport {
  generatedAt: string;
  windowDays: number;
  status: "ok" | "regressed" | "insufficient-data";
  paths: WebVitalsPathSummary[];
  alerts: WebVitalsAlert[];
}

/** LCP/INP read as seconds once they pass a second; CLS is a bare ratio. */
export function formatWebVitalValue(
  metric: "LCP" | "CLS" | "INP",
  value: number | null,
): string {
  if (value === null) return "—";
  if (metric === "CLS") return value.toFixed(2);
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}초`;
  return `${Math.round(value)}ms`;
}

export function webVitalRatingLabel(rating: WebVitalRating | null): string {
  if (rating === "good") return "좋음";
  if (rating === "needs-improvement") return "개선 필요";
  if (rating === "poor") return "나쁨";
  return "표본 부족";
}

/** Badge tone per rating; insufficient data stays neutral grey. */
export function webVitalRatingTone(
  rating: WebVitalRating | null,
): "good" | "warn" | "bad" | "muted" {
  if (rating === "good") return "good";
  if (rating === "needs-improvement") return "warn";
  if (rating === "poor") return "bad";
  return "muted";
}

const KO = {
  common: {
    all: "전체",
    cancel: "취소",
    close: "닫기",
    confirm: "확인",
    delete: "삭제",
    edit: "수정",
    exportCsv: "CSV 내보내기",
    next: "다음",
    previous: "이전",
    refresh: "새로고침",
    save: "저장",
    saving: "저장 중…",
  },
  console: {
    navLabel: "관리 영역",
    tabPanelLabel: "관리자 콘솔 작업 영역",
  },
  dashboard: {
    actionCenterTitle: "운영 액션 센터",
    actionCenterDesc: "즉시 확인하거나 처리해야 할 항목을 우선순위별로 모았습니다.",
    periodLabel: "집계 기간",
    refreshing: "갱신 중…",
    partialWarning: "일부 운영 데이터가 지연되어 마지막 정상 값 또는 0으로 표시됩니다.",
    pendingReports: "미처리 신고",
    pendingReportsDesc: "콘텐츠 신고 큐를 검토하고 조치합니다.",
    pendingSettlements: "대기 정산",
    pendingSettlementsDesc: "승인 또는 반려가 필요한 정산 이벤트입니다.",
    criticalAnnouncements: "활성 긴급 공지",
    criticalAnnouncementsDesc: "현재 사용자에게 노출 중인 긴급 공지입니다.",
    systemStatus: "시스템 상태",
    maintenance: "점검 모드가 활성화되어 있습니다.",
    degraded: "시스템 상태가 저하되었습니다.",
    healthy: "정상 운영 중입니다.",
    open: "바로가기",
    allClear: "현재 즉시 대응이 필요한 운영 항목이 없습니다.",
    lastUpdated: "마지막 갱신",
  },
  members: {
    filtersTitle: "회원 필터",
    roleAll: "모든 역할",
    statusAll: "모든 상태",
    sortNewest: "최근 가입순",
    sortOldest: "오래된 가입순",
    sortNameAsc: "이름 오름차순",
    sortNameDesc: "이름 내림차순",
    pageSize: "페이지당",
    resetFilters: "필터 초기화",
    exportFiltered: "현재 조건 CSV",
    selectPage: "현재 페이지 전체 선택",
    selectedCount: "{count}명 선택",
    totalCount: "총 {count}명",
    pageOf: "{page} / {pages} 페이지",
    details: "상세",
    detailsTitle: "회원 상세",
    bulkSuspend: "선택 정지",
    bulkRestore: "선택 복구",
    noSelection: "먼저 회원을 선택해 주세요.",
    actionReason: "사유",
    actionReasonOptional: "운영 이력에 남길 사유를 입력하세요.",
    roleChangeTitle: "회원 역할 변경",
    suspendTitle: "회원 계정 정지",
    restoreTitle: "회원 계정 복구",
    deleteTitle: "회원 탈퇴 처리",
    bulkSuspendTitle: "선택 회원 일괄 정지",
    bulkRestoreTitle: "선택 회원 일괄 복구",
    destructiveWarning: "이 작업은 즉시 적용되며 감사 로그에 남습니다.",
    updateSuccess: "회원 정보가 업데이트되었습니다.",
    bulkSuccess: "{count}명의 상태를 변경했습니다.",
    exportSuccess: "회원 CSV를 내려받았습니다.",
    exportError: "회원 CSV를 내려받지 못했습니다.",
    accountSection: "계정",
    activitySection: "활동",
    paymentSection: "결제",
    posts: "게시글",
    reviews: "리뷰",
    ratings: "평점",
    paid: "누적 결제",
    emptyDetail: "상세 정보를 불러오지 못했습니다.",
  },
  announcements: {
    create: "새 공지 만들기",
    edit: "공지 수정",
    preview: "실시간 미리보기",
    filters: "노출 상태",
    statusAll: "전체",
    statusActive: "노출 중",
    statusScheduled: "예약",
    statusExpired: "종료",
    statusInactive: "비활성",
    schedule: "노출 일정",
    startsAt: "시작 일시",
    endsAt: "종료 일시",
    activeToggle: "활성화",
    activeDesc: "활성화되어 있어도 예약 시작 전이거나 종료 후에는 노출되지 않습니다.",
    noStart: "즉시 시작",
    noEnd: "종료 없음",
    editAction: "수정",
    duplicateAction: "복제",
    scheduleError: "종료 일시는 시작 일시보다 뒤여야 합니다.",
    saveSuccess: "공지사항을 저장했습니다.",
    deleteSuccess: "공지사항을 삭제했습니다.",
    toggleSuccess: "공지 노출 상태를 변경했습니다.",
    deleteConfirmTitle: "공지사항 삭제",
    deleteConfirmDesc: "삭제한 공지는 복구할 수 없습니다.",
    emptyFiltered: "조건에 맞는 공지사항이 없습니다.",
    targetPrefix: "대상",
    createdPrefix: "생성",
  },
  reports: {
    searchPlaceholder: "신고 사유·신고자·대상 ID 검색",
    targetAll: "모든 대상",
    selectedCount: "{count}건 선택",
    selectPage: "현재 목록 전체 선택",
    bulkResolve: "선택 해결",
    bulkDismiss: "선택 기각",
    note: "처리 메모",
    notePlaceholder: "판단 근거와 후속 조치를 기록하세요.",
    bulkTitle: "신고 일괄 처리",
    resolveTitle: "신고 해결 처리",
    dismissTitle: "신고 기각 처리",
    processSuccess: "{count}건의 신고를 처리했습니다.",
    partialFailure: "{failed}건은 처리하지 못했습니다.",
    viewTarget: "대상 열기",
    refresh: "신고 새로고침",
  },
} as const;

const EN = {
  common: {
    all: "All",
    cancel: "Cancel",
    close: "Close",
    confirm: "Confirm",
    delete: "Delete",
    edit: "Edit",
    exportCsv: "Export CSV",
    next: "Next",
    previous: "Previous",
    refresh: "Refresh",
    save: "Save",
    saving: "Saving…",
  },
  console: {
    navLabel: "Administration areas",
    tabPanelLabel: "Admin console workspace",
  },
  dashboard: {
    actionCenterTitle: "Operations action center",
    actionCenterDesc: "Prioritized items that need review or action.",
    periodLabel: "Reporting period",
    refreshing: "Refreshing…",
    partialWarning: "Some operational data is delayed; the last healthy value or zero is shown.",
    pendingReports: "Pending reports",
    pendingReportsDesc: "Review and resolve the content report queue.",
    pendingSettlements: "Pending settlements",
    pendingSettlementsDesc: "Revenue events awaiting approval or rejection.",
    criticalAnnouncements: "Active critical notices",
    criticalAnnouncementsDesc: "Critical notices currently visible to users.",
    systemStatus: "System status",
    maintenance: "Maintenance mode is enabled.",
    degraded: "System health is degraded.",
    healthy: "All monitored systems are healthy.",
    open: "Open",
    allClear: "There are no urgent operational items right now.",
    lastUpdated: "Last updated",
  },
  members: {
    filtersTitle: "Member filters",
    roleAll: "All roles",
    statusAll: "All statuses",
    sortNewest: "Newest first",
    sortOldest: "Oldest first",
    sortNameAsc: "Name A–Z",
    sortNameDesc: "Name Z–A",
    pageSize: "Per page",
    resetFilters: "Reset filters",
    exportFiltered: "Export current filters",
    selectPage: "Select current page",
    selectedCount: "{count} selected",
    totalCount: "{count} total",
    pageOf: "Page {page} of {pages}",
    details: "Details",
    detailsTitle: "Member details",
    bulkSuspend: "Suspend selected",
    bulkRestore: "Restore selected",
    noSelection: "Select at least one member first.",
    actionReason: "Reason",
    actionReasonOptional: "Add a reason for the operational record.",
    roleChangeTitle: "Change member role",
    suspendTitle: "Suspend member account",
    restoreTitle: "Restore member account",
    deleteTitle: "Delete member account",
    bulkSuspendTitle: "Suspend selected members",
    bulkRestoreTitle: "Restore selected members",
    destructiveWarning: "This takes effect immediately and is recorded in the audit log.",
    updateSuccess: "Member information was updated.",
    bulkSuccess: "Updated {count} members.",
    exportSuccess: "Member CSV downloaded.",
    exportError: "Member CSV download failed.",
    accountSection: "Account",
    activitySection: "Activity",
    paymentSection: "Payments",
    posts: "Posts",
    reviews: "Reviews",
    ratings: "Ratings",
    paid: "Lifetime paid",
    emptyDetail: "Member details could not be loaded.",
  },
  announcements: {
    create: "Create notice",
    edit: "Edit notice",
    preview: "Live preview",
    filters: "Visibility status",
    statusAll: "All",
    statusActive: "Live",
    statusScheduled: "Scheduled",
    statusExpired: "Ended",
    statusInactive: "Inactive",
    schedule: "Visibility schedule",
    startsAt: "Starts",
    endsAt: "Ends",
    activeToggle: "Enabled",
    activeDesc: "An enabled notice is still hidden before its start time and after its end time.",
    noStart: "Start immediately",
    noEnd: "No end date",
    editAction: "Edit",
    duplicateAction: "Duplicate",
    scheduleError: "The end time must be later than the start time.",
    saveSuccess: "Announcement saved.",
    deleteSuccess: "Announcement deleted.",
    toggleSuccess: "Announcement visibility updated.",
    deleteConfirmTitle: "Delete announcement",
    deleteConfirmDesc: "Deleted announcements cannot be recovered.",
    emptyFiltered: "No announcements match the selected status.",
    targetPrefix: "Target",
    createdPrefix: "Created",
  },
  reports: {
    searchPlaceholder: "Search reason, reporter, or target ID",
    targetAll: "All targets",
    selectedCount: "{count} selected",
    selectPage: "Select all visible",
    bulkResolve: "Resolve selected",
    bulkDismiss: "Dismiss selected",
    note: "Resolution note",
    notePlaceholder: "Record the rationale and any follow-up action.",
    bulkTitle: "Process selected reports",
    resolveTitle: "Resolve report",
    dismissTitle: "Dismiss report",
    processSuccess: "Processed {count} reports.",
    partialFailure: "{failed} reports failed.",
    viewTarget: "Open target",
    refresh: "Refresh reports",
  },
} as const;

export type AdminAdvancedCopy = typeof KO;

export function getAdminAdvancedCopy(locale: string): AdminAdvancedCopy {
  return locale.toLowerCase().startsWith("ko") ? KO : (EN as unknown as AdminAdvancedCopy);
}
