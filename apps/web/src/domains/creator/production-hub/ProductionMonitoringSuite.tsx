import { useEffect, useRef, useState } from "react";
import {
  defaultVisibleMonitoringColumns,
  exportMonitoringRowsToCsv,
  filterMonitoringRows,
  MONITORING_COLUMNS,
  toggleMonitoringColumn,
  type MonitoringColumnId,
  type MonitoringSubtab,
  type MonitoringTableRow,
} from "./production-monitoring-suite-model";

const INITIAL_MONITORING_ROWS: readonly MonitoringTableRow[] = [
  {
    id: "mon-fb-1",
    tab: "feedback",
    occurredAt: "2026-10-26 14:20",
    episode: "12화",
    process: "선화",
    actor: "총괄 PD",
    isDepartedMember: false,
    summary: "12컷 역광 실루엣 외곽선 두께 보강 요청",
    status: "필수 · 미해결",
    workHours: null,
    contributionPercent: null,
  },
  {
    id: "mon-fb-2",
    tab: "feedback",
    occurredAt: "2026-10-25 19:05",
    episode: "11화",
    process: "배경",
    actor: "김도윤 (이전 어시)",
    isDepartedMember: true,
    summary: "성벽 복도 소실점 보정 완료 코멘트",
    status: "권장 · 해결됨",
    workHours: null,
    contributionPercent: null,
  },
  {
    id: "mon-ver-1",
    tab: "version",
    occurredAt: "2026-10-26 13:50",
    episode: "12화",
    process: "채색·음영",
    actor: "메인 채색 작가",
    isDepartedMember: false,
    summary: "v3 정식 공개 버전 (페이지 1~4 업데이트)",
    status: "공정 마감 · 공개",
    workHours: 14,
    contributionPercent: 70,
  },
  {
    id: "mon-ver-2",
    tab: "version",
    occurredAt: "2026-10-24 18:10",
    episode: "11화",
    process: "배경",
    actor: "김도윤 (이전 어시)",
    isDepartedMember: true,
    summary: "v2 배경 3D 스냅샷 업로드",
    status: "작업 완료 · 일부 공개",
    workHours: 6,
    contributionPercent: 30,
  },
  {
    id: "mon-act-1",
    tab: "activity",
    occurredAt: "2026-10-26 15:00",
    episode: "12화",
    process: "식자·보정",
    actor: "총괄 PD",
    isDepartedMember: false,
    summary: "식자 공정 데드라인을 2026-10-29로 연쇄 이동(+2일)",
    status: "일정 변경",
    workHours: null,
    contributionPercent: null,
  },
  {
    id: "mon-act-2",
    tab: "activity",
    occurredAt: "2026-10-23 11:30",
    episode: "10화",
    process: "선화",
    actor: "김도윤 (이전 어시)",
    isDepartedMember: true,
    summary: "10화 선화 v1 아카이브 전환",
    status: "버전 관리",
    workHours: null,
    contributionPercent: null,
  },
];

const RESPONSIVE_MONITORING_TABLE_CSS = `
.monitoring-table-region {
  container-type: inline-size;
  overflow-x: auto;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
}
.monitoring-table-region table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}
.monitoring-table-region thead th {
  position: sticky;
  top: 0;
  background: #f1f5f9;
  color: #0f172a;
  text-align: left;
  padding: 0.55rem 0.7rem;
  border-bottom: 1px solid #cbd5e1;
  z-index: 2;
}
.monitoring-table-region tbody th {
  position: sticky;
  left: 0;
  background: #f8fafc;
  text-align: left;
  padding: 0.5rem 0.7rem;
  border-bottom: 1px solid #e2e8f0;
  z-index: 1;
}
.monitoring-table-region tbody td {
  padding: 0.5rem 0.7rem;
  border-bottom: 1px solid #e2e8f0;
  font-variant-numeric: tabular-nums;
}
@container (width < 600px) {
  .monitoring-table-region thead {
    display: none;
  }
  .monitoring-table-region tbody tr {
    display: grid;
    gap: 0.25rem;
    padding: 0.6rem;
    border-bottom: 1px solid #cbd5e1;
  }
  .monitoring-table-region tbody th,
  .monitoring-table-region tbody td {
    position: static;
    display: flex;
    justify-content: space-between;
    padding: 0.2rem 0;
    border: none;
  }
  .monitoring-table-region tbody td::before {
    content: attr(data-label);
    font-weight: 700;
    color: #475569;
  }
}
`;

export function ProductionMonitoringSuite() {
  const [activeTab, setActiveTab] = useState<MonitoringSubtab>("feedback");
  const [query, setQuery] = useState<string>("");
  const [includeDepartedMembers, setIncludeDepartedMembers] = useState<boolean>(false);
  const [visibleColumns, setVisibleColumns] = useState<readonly MonitoringColumnId[]>(() =>
    defaultVisibleMonitoringColumns(),
  );
  const [csvPreview, setCsvPreview] = useState<string | null>(null);
  const columnDialogRef = useRef<HTMLDialogElement | null>(null);

  // `closedby="any"` 미지원 브라우저용 light-dismiss 폴백
  useEffect(() => {
    const dialog = columnDialogRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const handleFallbackClick = (event: MouseEvent) => {
      const rect = dialog.getBoundingClientRect();
      const clickedOutside =
        event.clientY < rect.top
        || event.clientY > rect.bottom
        || event.clientX < rect.left
        || event.clientX > rect.right;
      if (clickedOutside && dialog.open) {
        dialog.close();
      }
    };
    dialog.addEventListener("click", handleFallbackClick);
    return () => dialog.removeEventListener("click", handleFallbackClick);
  }, []);

  const filteredRows = filterMonitoringRows(INITIAL_MONITORING_ROWS, {
    tab: activeTab,
    query,
    includeDepartedMembers,
  });

  const activeColDefs = MONITORING_COLUMNS.filter((col) => visibleColumns.includes(col.id));

  const handleExportCsv = () => {
    const csv = exportMonitoringRowsToCsv(filteredRows, visibleColumns);
    setCsvPreview(csv);
  };

  const renderCellContent = (row: MonitoringTableRow, colId: MonitoringColumnId): string => {
    switch (colId) {
      case "occurredAt":
        return row.occurredAt;
      case "episode":
        return row.episode;
      case "process":
        return row.process;
      case "actor":
        return row.isDepartedMember ? `${row.actor} (탈퇴)` : row.actor;
      case "summary":
        return row.summary;
      case "status":
        return row.status;
      case "workHours":
        return row.workHours !== null ? `${row.workHours}h` : "—";
      case "contributionPercent":
        return row.contributionPercent !== null ? `${row.contributionPercent}%` : "—";
    }
  };

  return (
    <section
      aria-labelledby="production-monitoring-suite-heading"
      data-testid="production-monitoring-suite"
      style={{
        display: "grid",
        gap: "0.85rem",
        padding: "1rem",
        borderRadius: "12px",
        border: "1px solid var(--border-subtle, #cbd5e1)",
        background: "var(--surface-elevated, #ffffff)",
      }}
    >
      <style>{RESPONSIVE_MONITORING_TABLE_CSS}</style>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <div>
          <h3 id="production-monitoring-suite-heading" style={{ margin: 0, fontSize: "0.95rem" }}>
            프로젝트 통합 모니터링 (피드백 · 버전 · 활동 감사 &amp; CSV 내보내기)
          </h3>
          <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "#475569" }}>
            전체 회차·공정을 아우르는 피드백 전수 조사, 버전별 작업 시간·기여도 집계, 활동 로그 및 컬럼 맞춤 CSV 추출을 제공합니다.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          <button
            type="button"
            data-testid="open-monitoring-column-editor-btn"
            onClick={() => columnDialogRef.current?.showModal()}
            style={{
              padding: "0.28rem 0.6rem",
              fontSize: "0.76rem",
              borderRadius: "6px",
              border: "1px solid #64748b",
              background: "#f8fafc",
            }}
          >
            테이블 편집 (표시 컬럼 {visibleColumns.length}개)
          </button>

          <button
            type="button"
            data-testid="export-monitoring-csv-btn"
            onClick={handleExportCsv}
            style={{
              padding: "0.28rem 0.65rem",
              fontSize: "0.76rem",
              borderRadius: "6px",
              border: "1px solid #0f766e",
              background: "#ccfbf1",
              color: "#115e59",
              fontWeight: 600,
            }}
          >
            CSV 다운로드 생성
          </button>
        </div>
      </div>

      {/* 3개 서브탭(피드백 / 버전 / 활동) + 검색어 + 탈퇴한 멤버 포함 토글 */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {(
            [
              { id: "feedback", label: "피드백 모니터링" },
              { id: "version", label: "버전·기여도 모니터링" },
              { id: "activity", label: "활동 로그 모니터링" },
            ] as const
          ).map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              data-testid={`monitoring-subtab-${tabItem.id}-btn`}
              aria-pressed={activeTab === tabItem.id}
              onClick={() => setActiveTab(tabItem.id)}
              style={{
                padding: "0.28rem 0.65rem",
                fontSize: "0.76rem",
                borderRadius: "999px",
                border: "1px solid #475569",
                background: activeTab === tabItem.id ? "#0f172a" : "#ffffff",
                color: activeTab === tabItem.id ? "#ffffff" : "#0f172a",
              }}
            >
              {tabItem.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.55rem" }}>
          <input
            type="search"
            aria-label="모니터링 키워드 검색"
            data-testid="monitoring-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="회차·공정·작업자·내용 검색"
            style={{ padding: "0.22rem 0.5rem", fontSize: "0.75rem", width: "13rem" }}
          />

          <label style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <input
              type="checkbox"
              data-testid="monitoring-include-departed-checkbox"
              checked={includeDepartedMembers}
              onChange={(e) => setIncludeDepartedMembers(e.target.checked)}
            />
            탈퇴한 멤버 포함 조회
          </label>
        </div>
      </div>

      {/* 반응형 데이터 테이블 (`role="region"` + `@container (width < 600px)`) */}
      <div
        className="monitoring-table-region"
        role="region"
        aria-labelledby="production-monitoring-suite-heading"
        data-testid="monitoring-responsive-table-region"
      >
        <table>
          <thead>
            <tr>
              {activeColDefs.map((col) => (
                <th key={col.id} scope="col">
                  {col.labelKo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} data-testid={`monitoring-row-${row.id}`}>
                {activeColDefs.map((col, colIndex) => {
                  const text = renderCellContent(row, col.id);
                  if (colIndex === 0) {
                    return (
                      <th key={col.id} scope="row" data-label={col.labelKo}>
                        {text}
                      </th>
                    );
                  }
                  return (
                    <td key={col.id} data-label={col.labelKo}>
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {csvPreview && (
        <div
          data-testid="monitoring-csv-output-preview"
          style={{
            padding: "0.6rem 0.75rem",
            borderRadius: "8px",
            background: "#f8fafc",
            border: "1px solid #cbd5e1",
            fontSize: "0.73rem",
          }}
        >
          <strong>CSV 내보내기 미리보기 ({filteredRows.length}행 · {visibleColumns.length}컬럼):</strong>
          <pre style={{ margin: "0.35rem 0 0", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
            {csvPreview}
          </pre>
        </div>
      )}

      {/* 테이블 편집 모달 (`closedby="any"` + light-dismiss 폴백) */}
      <dialog
        ref={columnDialogRef}
        {...({ closedby: "any" } as Record<string, string>)}
        aria-labelledby="monitoring-column-dialog-title"
        data-testid="monitoring-column-editor-dialog"
        style={{
          borderRadius: "12px",
          border: "1px solid #cbd5e1",
          padding: "1rem 1.25rem",
          maxWidth: "28rem",
        }}
      >
        <div style={{ display: "grid", gap: "0.65rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 id="monitoring-column-dialog-title" style={{ margin: 0, fontSize: "0.92rem" }}>
              테이블 컬럼 표시 설정 (CSV 출력 연동)
            </h4>
            <button
              type="button"
              onClick={() => columnDialogRef.current?.close()}
              style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
            >
              닫기
            </button>
          </div>

          <div style={{ display: "grid", gap: "0.35rem", fontSize: "0.78rem" }}>
            {MONITORING_COLUMNS.map((col) => (
              <label key={col.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <input
                  type="checkbox"
                  data-testid={`monitoring-col-toggle-${col.id}`}
                  checked={visibleColumns.includes(col.id)}
                  onChange={() => setVisibleColumns((prev) => toggleMonitoringColumn(prev, col.id))}
                />
                {col.labelKo}
              </label>
            ))}
          </div>
        </div>
      </dialog>
    </section>
  );
}
