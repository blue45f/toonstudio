/**
 * 통합 리포트 화면: 왼쪽 범위·커버리지·점수, 가운데 발견 목록, 오른쪽 근거 상세.
 *
 * 불러오는 중, 불러오지 못함(다시 시도), 결과 세 상태를 모두 다룬다. 새 점검이 도는 동안에도 이전 결과를
 * 그대로 보여 주고 상단에 안내만 띄운다.
 */
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useT } from "@/shared/lib/i18n";
import "../storyworld-status-i18n";

import type { StoryworldProject, StoryworldQuestionId } from "../studio-storyworld-causality";
import { StudioStoryPlausibilityDetail } from "./StudioStoryPlausibilityDetail";
import { StudioStoryPlausibilityFindingList } from "./StudioStoryPlausibilityFindingList";
import {
  DEFAULT_PLAUSIBILITY_LIST_FILTERS,
  type PlausibilityListFilters,
} from "./studio-story-plausibility-list-filters";
import { StudioStoryPlausibilityScopePanel } from "./StudioStoryPlausibilityScopePanel";
import type { PlausibilityCheckState } from "./use-story-plausibility-check";
import { filterPlausibilityFindings, type PlausibilityDispositionView } from "./studio-story-plausibility-report";
import type { PlausibilityScope } from "./studio-story-plausibility-scope";
import type {
  PlausibilityDispositionStatus,
  PlausibilityFinding,
} from "./studio-story-plausibility-types";

export interface ReportViewProps {
  readonly project: StoryworldProject;
  readonly check: PlausibilityCheckState;
  readonly dispositionView: PlausibilityDispositionView | null;
  readonly readOnly: boolean;
  readonly scope: PlausibilityScope;
  readonly onScopeChange: (scope: PlausibilityScope) => void;
  readonly onRerun: () => void;
  readonly onSetDisposition: (finding: PlausibilityFinding, status: PlausibilityDispositionStatus, note?: string) => void;
  readonly onClearDisposition: (finding: PlausibilityFinding) => void;
  readonly onOpenQuestionnaire: (sceneId?: string, question?: StoryworldQuestionId) => void;
  readonly onOpenSettings: (target: "scene" | "fact" | "character", id: string) => void;
}

function isNarrowScreen(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 900px)").matches;
}

export function StudioStoryPlausibilityReportView(props: ReportViewProps) {
  const { project, check, dispositionView } = props;
  const t = useT();
  const [filters, setFilters] = useState<PlausibilityListFilters>(DEFAULT_PLAUSIBILITY_LIST_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const sceneTitles = useMemo(() => new Map(project.scenes.map((scene) => [scene.id, scene.title])), [project.scenes]);

  if (check.report === null || dispositionView === null) {
    if (check.status === "error") {
      return (
        <div className="plausibility-loading" role="alert">
          <h3>{t("studio.storyworldStatus.report.checkFailed", "점검을 마치지 못했어요")}</h3>
          <p>{check.error}</p>
          <div>
            <button className="storyworld-button storyworld-button--primary" onClick={props.onRerun} type="button">
              <RefreshCcw aria-hidden size={15} /> {t("studio.storyworldStatus.report.retry", "다시 시도")}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div aria-busy="true" className="plausibility-loading" role="status">
        <p>이야기를 점검하는 중이에요…</p>
        <div className="plausibility-skeleton" />
        <div className="plausibility-skeleton" />
        <div className="plausibility-skeleton" />
      </div>
    );
  }

  const { report } = check;
  const open = dispositionView.open;
  const handled = dispositionView.handled;
  const visibleOpen = filterPlausibilityFindings(open, { severity: filters.severity, category: filters.category, query: filters.query });
  const effectiveId = selectedId !== null
    && (open.some((item) => item.id === selectedId) || handled.some((item) => item.finding.id === selectedId))
    ? selectedId
    : visibleOpen[0]?.id ?? null;
  const selectedFinding = effectiveId === null
    ? null
    : open.find((item) => item.id === effectiveId) ?? handled.find((item) => item.finding.id === effectiveId)?.finding ?? null;
  const selectedHandled = effectiveId === null ? null : handled.find((item) => item.finding.id === effectiveId) ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    if (isNarrowScreen()) {
      queueMicrotask(() => {
        headingRef.current?.focus();
        headingRef.current?.scrollIntoView?.({ block: "nearest" });
      });
    }
  };

  const setDisposition = (finding: PlausibilityFinding, status: PlausibilityDispositionStatus, note?: string) => {
    const index = visibleOpen.findIndex((item) => item.id === finding.id);
    const next = visibleOpen[index + 1] ?? visibleOpen[index - 1];
    props.onSetDisposition(finding, status, note);
    setSelectedId(next && next.id !== finding.id ? next.id : null);
  };

  return (
    <div className="plausibility-hub">
      {check.status === "error" ? (
        <div className="plausibility-banner plausibility-banner--error" role="alert">
          <span><AlertTriangle aria-hidden size={14} /> {check.error} 이전 결과를 보여 드려요.</span>
          <button className="storyworld-button" onClick={props.onRerun} type="button">{t("studio.storyworldStatus.report.retry", "다시 시도")}</button>
        </div>
      ) : null}
      {check.refreshing && check.status !== "error" ? (
        <p className="plausibility-hint" role="status">다시 점검하는 중이에요. 끝나면 결과가 바뀔 수 있어요.</p>
      ) : null}
      <div aria-busy={check.refreshing} className="plausibility-layout">
        <StudioStoryPlausibilityScopePanel
          notices={check.notices}
          onOpenQuestionnaire={() => props.onOpenQuestionnaire()}
          onRerun={props.onRerun}
          onScopeChange={props.onScopeChange}
          project={project}
          refreshing={check.refreshing}
          report={report}
          scope={props.scope}
          summary={dispositionView.summary}
        />
        <StudioStoryPlausibilityFindingList
          coveragePercent={dispositionView.summary.coverage.percent}
          filters={filters}
          handled={handled}
          handledCounts={dispositionView.handledCounts}
          omittedCount={report.summary.omittedCount}
          onFiltersChange={setFilters}
          onOpenQuestionnaire={() => props.onOpenQuestionnaire()}
          onSelect={select}
          open={open}
          sceneTitles={sceneTitles}
          selectedId={effectiveId}
        />
        <StudioStoryPlausibilityDetail
          finding={selectedFinding}
          handled={selectedHandled}
          headingRef={headingRef}
          manuscripts={check.manuscripts}
          onClearDisposition={props.onClearDisposition}
          onOpenQuestionnaire={(sceneId, question) => props.onOpenQuestionnaire(sceneId, question)}
          onOpenSettings={props.onOpenSettings}
          onSetDisposition={setDisposition}
          project={project}
          readOnly={props.readOnly}
        />
      </div>
    </div>
  );
}
