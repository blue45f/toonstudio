import {
  filterPageConsolidationGroups,
  PAGE_CONSOLIDATION_AUDIT_MAP,
  type PageConsolidationAuditSummary,
  type PageConsolidationFilter,
  type PageRouteDisposition,
} from "./character-shaper-unified-engine";

const DISPOSITION_LABELS: Record<PageRouteDisposition, string> = {
  canonical: "단일 정본 유지",
  "redirect-to-canonical": "정본 리다이렉트",
  "absorb-into-tab": "정본 탭 흡수",
  "role-canonical": "역할별 정본 확정",
};

const AUDIT_FILTER_OPTIONS: readonly { readonly id: PageConsolidationFilter; readonly labelKo: string }[] = [
  { id: "all", labelKo: "전체 4대 구간" },
  { id: "single-canonical", labelKo: "단일 정본 통합 (탐색·고객센터)" },
  { id: "role-split", labelKo: "역할 분리·수렴 (소재·협업)" },
];

/** 사이트 전체 페이지 중복 정리 및 4대 구간 단일 정본 지도 탭. */
export function CharacterShaperAuditTab({
  panelId,
  tabId,
  auditSummary,
  auditFilter,
  onSelectFilter,
}: {
  readonly panelId: string;
  readonly tabId: string;
  readonly auditSummary: PageConsolidationAuditSummary;
  readonly auditFilter: PageConsolidationFilter;
  readonly onSelectFilter: (filter: PageConsolidationFilter) => void;
}) {
  const visibleGroups = filterPageConsolidationGroups(PAGE_CONSOLIDATION_AUDIT_MAP, auditFilter);

  return (
    <section
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      data-testid="csu-audit-tabpanel"
      className="flex flex-col gap-4"
    >
      <div className="csu-audit-summary-grid csu-num">
        <div className="csu-stat-cell">
          <span className="csu-stat-label">감사 대상 중복 구간</span>
          <span className="csu-stat-value">{auditSummary.groupCount}대 구간</span>
        </div>
        <div className="csu-stat-cell">
          <span className="csu-stat-label">전수 점검 라우트</span>
          <span className="csu-stat-value">{auditSummary.totalRoutesAudited}개 경로</span>
        </div>
        <div className="csu-stat-cell">
          <span className="csu-stat-label">정본 리다이렉트 · 흡수</span>
          <span className="csu-stat-value">{auditSummary.redirectOrAbsorbCount}개 경로</span>
        </div>
        <div className="csu-stat-cell">
          <span className="csu-stat-label">정본·독립 역할 확정</span>
          <span className="csu-stat-value">
            {auditSummary.canonicalAnchorCount + auditSummary.distinctRoleCount}개 경로
          </span>
        </div>
      </div>

      <div className="csu-chip-row" role="group" aria-label="페이지 통합 전략 필터">
        {AUDIT_FILTER_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="csu-chip csu-chip--inline"
            aria-pressed={auditFilter === option.id}
            data-testid={`csu-audit-filter-${option.id}`}
            onClick={() => onSelectFilter(option.id)}
          >
            {option.labelKo}
          </button>
        ))}
      </div>

      <div className="csu-audit-grid">
        {visibleGroups.map((group) => (
          <article
            key={group.id}
            className="csu-audit-card"
            data-accent={group.accentSlot}
            data-testid={`csu-audit-group-${group.id}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="csu-section-heading">{group.titleKo}</h3>
              <span className="csu-badge">기준 경로: {group.canonicalPath}</span>
            </div>
            <p className="csu-section-caption">{group.problemSummaryKo}</p>
            <p className="m-0 text-xs font-semibold text-fg">{group.decisionSummaryKo}</p>

            <ul className="csu-route-list" aria-label={`${group.titleKo} 라우트 목록`}>
              {group.routes.map((route) => (
                <li key={route.path} className="csu-route-row">
                  <div className="csu-route-head">
                    <span className="csu-route-path">{route.path}</span>
                    <span className="csu-disposition-pill" data-kind={route.disposition}>
                      {DISPOSITION_LABELS[route.disposition]}
                    </span>
                  </div>
                  <span className="text-xs text-fg">{route.roleSummaryKo}</span>
                  <span className="text-xs text-fg-2">
                    조치: {route.migrationActionKo} → <code>{route.destinationPath}</code>
                  </span>
                </li>
              ))}
            </ul>

            <ul className="csu-checklist">
              {group.checklistKo.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
