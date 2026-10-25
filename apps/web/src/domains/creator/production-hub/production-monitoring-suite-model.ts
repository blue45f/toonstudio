/**
 * 프로젝트 통합 모니터링 3탭(`피드백` / `버전` / `활동`)·테이블 컬럼 편집·탈퇴 멤버 필터·CSV 내보내기 모델.
 *
 * - 3개 서브탭: `feedback`(피드백 전수 조사), `version`(회차>공정>버전 트리 및 작업 시간·기여도), `activity`(활동 감사 로그)
 * - 컬럼 표시/숨김 커스터마이징(`테이블 편집`): 선택한 컬럼만 화면 표시 및 CSV 내보내기
 * - 탈퇴한 멤버 포함 필터(`includeDepartedMembers`)
 */

export type MonitoringSubtab = "feedback" | "version" | "activity";

export type MonitoringColumnId =
  | "occurredAt"
  | "episode"
  | "process"
  | "actor"
  | "summary"
  | "status"
  | "workHours"
  | "contributionPercent";

export interface MonitoringColumnDefinition {
  readonly id: MonitoringColumnId;
  readonly labelKo: string;
  readonly defaultVisible: boolean;
}

export const MONITORING_COLUMNS: readonly MonitoringColumnDefinition[] = [
  { id: "occurredAt", labelKo: "일시", defaultVisible: true },
  { id: "episode", labelKo: "회차", defaultVisible: true },
  { id: "process", labelKo: "공정", defaultVisible: true },
  { id: "actor", labelKo: "작업자·작성자", defaultVisible: true },
  { id: "summary", labelKo: "내용·버전", defaultVisible: true },
  { id: "status", labelKo: "상태·중요도", defaultVisible: true },
  { id: "workHours", labelKo: "작업 시간", defaultVisible: true },
  { id: "contributionPercent", labelKo: "기여도(%)", defaultVisible: true },
];

export interface MonitoringTableRow {
  readonly id: string;
  readonly tab: MonitoringSubtab;
  readonly occurredAt: string;
  readonly episode: string;
  readonly process: string;
  readonly actor: string;
  readonly isDepartedMember: boolean;
  readonly summary: string;
  readonly status: string;
  readonly workHours: number | null;
  readonly contributionPercent: number | null;
}

export function defaultVisibleMonitoringColumns(): readonly MonitoringColumnId[] {
  return MONITORING_COLUMNS.filter((col) => col.defaultVisible).map((col) => col.id);
}

/** 최소 1개 이상의 컬럼은 항상 유지하도록 토글한다. */
export function toggleMonitoringColumn(
  current: readonly MonitoringColumnId[],
  columnId: MonitoringColumnId,
): readonly MonitoringColumnId[] {
  if (current.includes(columnId)) {
    if (current.length <= 1) return current;
    return current.filter((id) => id !== columnId);
  }
  const order = MONITORING_COLUMNS.map((col) => col.id);
  return [...current, columnId].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** 서브탭, 검색어, 탈퇴한 멤버 포함 여부에 따라 모니터링 행을 필터링한다. */
export function filterMonitoringRows(
  rows: readonly MonitoringTableRow[],
  options: {
    readonly tab: MonitoringSubtab;
    readonly query: string;
    readonly includeDepartedMembers: boolean;
  },
): readonly MonitoringTableRow[] {
  const normalized = options.query.trim().toLocaleLowerCase("ko-KR");
  return rows.filter((row) => {
    if (row.tab !== options.tab) return false;
    if (!options.includeDepartedMembers && row.isDepartedMember) return false;
    if (!normalized) return true;
    return (
      row.episode.toLocaleLowerCase("ko-KR").includes(normalized)
      || row.process.toLocaleLowerCase("ko-KR").includes(normalized)
      || row.actor.toLocaleLowerCase("ko-KR").includes(normalized)
      || row.summary.toLocaleLowerCase("ko-KR").includes(normalized)
      || row.status.toLocaleLowerCase("ko-KR").includes(normalized)
    );
  });
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/u.test(value)) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}

/**
 * 현재 선택된 컬럼(`visibleColumns`)만 포함하여 RFC 4180 호환 CSV 문자열을 생성한다.
 */
export function exportMonitoringRowsToCsv(
  rows: readonly MonitoringTableRow[],
  visibleColumns: readonly MonitoringColumnId[],
): string {
  const activeCols = MONITORING_COLUMNS.filter((col) => visibleColumns.includes(col.id));
  const headerLine = activeCols.map((col) => escapeCsvCell(col.labelKo)).join(",");
  const dataLines = rows.map((row) =>
    activeCols
      .map((col) => {
        switch (col.id) {
          case "occurredAt":
            return escapeCsvCell(row.occurredAt);
          case "episode":
            return escapeCsvCell(row.episode);
          case "process":
            return escapeCsvCell(row.process);
          case "actor":
            return escapeCsvCell(row.isDepartedMember ? `${row.actor} (탈퇴)` : row.actor);
          case "summary":
            return escapeCsvCell(row.summary);
          case "status":
            return escapeCsvCell(row.status);
          case "workHours":
            return escapeCsvCell(row.workHours !== null ? `${row.workHours}h` : "—");
          case "contributionPercent":
            return escapeCsvCell(row.contributionPercent !== null ? `${row.contributionPercent}%` : "—");
        }
      })
      .join(","),
  );
  return [headerLine, ...dataLines].join("\r\n");
}
