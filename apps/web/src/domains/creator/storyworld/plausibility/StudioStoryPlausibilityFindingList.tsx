/**
 * 가운데 목록: 심각도·범주 필터와 검색, 범주별로 묶은 발견, 접어 둔 처리 기록.
 *
 * 키보드: 목록 안에서 ↑/↓로 항목을 옮기고(고른 항목이 따라 바뀐다), Home/End로 처음과 끝으로 간다.
 * Tab은 목록 전체를 한 번에 지나가게 한다(고른 항목만 탭 순서에 있다). 처리한 항목도 접힌 곳에 그대로
 * 남아서 다시 열어 볼 수 있다.
 */
import { Search } from "lucide-react";
import { useMemo, useRef, type KeyboardEvent } from "react";
import { useT } from "@/shared/lib/i18n";
import "../storyworld-status-i18n";

import { ConfidenceBadge, SeverityBadge } from "./StudioStoryPlausibilityParts";
import {
  DEFAULT_PLAUSIBILITY_LIST_FILTERS,
  type PlausibilityListFilters,
} from "./studio-story-plausibility-list-filters";
import {
  filterPlausibilityFindings,
  groupPlausibilityFindings,
  type PlausibilityFilters,
} from "./studio-story-plausibility-report";
import {
  PLAUSIBILITY_CATEGORIES,
  PLAUSIBILITY_DISPOSITION_LABELS,
  PLAUSIBILITY_SEVERITY_LABELS,
  plausibilityCategoryLabel,
  type PlausibilityCategoryId,
  type PlausibilityDispositionStatus,
  type PlausibilityFinding,
  type PlausibilityHandledFinding,
} from "./studio-story-plausibility-types";

export interface FindingListProps {
  readonly open: readonly PlausibilityFinding[];
  readonly handled: readonly PlausibilityHandledFinding[];
  readonly handledCounts: Readonly<Record<PlausibilityDispositionStatus, number>>;
  readonly sceneTitles: ReadonlyMap<string, string>;
  readonly filters: PlausibilityListFilters;
  readonly onFiltersChange: (next: PlausibilityListFilters) => void;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly coveragePercent: number;
  readonly onOpenQuestionnaire: () => void;
  readonly omittedCount: number;
}

function toFilters(filters: PlausibilityListFilters): PlausibilityFilters {
  return { severity: filters.severity, category: filters.category, query: filters.query };
}

function sceneLine(finding: PlausibilityFinding, titles: ReadonlyMap<string, string>): string {
  const names = finding.sceneIds.map((id) => titles.get(id)).filter((name): name is string => name !== undefined);
  if (names.length === 0) return "";
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} 외 ${names.length - 2}개`;
}

function Row({ finding, selected, tabbable, titles, handled, onSelect, onKeyDown }: {
  readonly finding: PlausibilityFinding;
  readonly selected: boolean;
  readonly tabbable: boolean;
  readonly titles: ReadonlyMap<string, string>;
  readonly handled?: PlausibilityHandledFinding;
  readonly onSelect: (id: string) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const scenes = sceneLine(finding, titles);
  return (
    <li>
      <button
        aria-current={selected ? "true" : undefined}
        className={`plausibility-row plausibility-row--${finding.severity}`}
        data-finding-id={finding.id}
        data-finding-row=""
        onClick={() => onSelect(finding.id)}
        onKeyDown={onKeyDown}
        tabIndex={tabbable ? 0 : -1}
        type="button"
      >
        <span className="plausibility-row__top">
          <SeverityBadge severity={finding.severity} />
          <ConfidenceBadge confidence={finding.confidence} />
          {handled ? <span className="plausibility-badge plausibility-badge--muted">{PLAUSIBILITY_DISPOSITION_LABELS[handled.status]}</span> : null}
        </span>
        <span className="plausibility-row__title">{finding.title}</span>
        <span className="plausibility-row__meta">
          {plausibilityCategoryLabel(finding.category)}{scenes ? ` · ${scenes}` : ""}
        </span>
      </button>
    </li>
  );
}

export function StudioStoryPlausibilityFindingList(props: FindingListProps) {
  const { open, handled, filters, selectedId, coveragePercent } = props;
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleOpen = useMemo(() => filterPlausibilityFindings(open, toFilters(filters)), [open, filters]);
  const visibleHandled = useMemo(() => {
    const allowed = new Set(filterPlausibilityFindings(handled.map((item) => item.finding), toFilters(filters)).map((item) => item.id));
    return handled.filter((item) => allowed.has(item.finding.id));
  }, [handled, filters]);
  const groups = useMemo(() => groupPlausibilityFindings(visibleOpen), [visibleOpen]);

  const severityCounts = useMemo(() => {
    const counts = { all: open.length, error: 0, warning: 0, suggestion: 0 };
    for (const finding of open) counts[finding.severity] += 1;
    return counts;
  }, [open]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<PlausibilityCategoryId, number>();
    for (const finding of open) counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
    return counts;
  }, [open]);

  const visibleIds = useMemo(
    () => [...visibleOpen.map((item) => item.id), ...visibleHandled.map((item) => item.finding.id)],
    [visibleOpen, visibleHandled],
  );
  const activeId = selectedId !== null && visibleIds.includes(selectedId) ? selectedId : visibleIds[0] ?? null;
  /** 탭으로 들어오는 곳: 고른 항목이 열린 목록에 있으면 그것, 아니면 열린 목록의 첫 항목. */
  const tabStopId = visibleOpen.some((item) => item.id === activeId) ? activeId : visibleOpen[0]?.id ?? null;

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const target = event.currentTarget;
    const rows = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-finding-row]") ?? [])
      .filter((row) => row.closest("details:not([open])") === null);
    const index = rows.indexOf(target);
    if (index < 0) return;
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? rows.length - 1
      : event.key === "ArrowDown" ? Math.min(rows.length - 1, index + 1)
      : Math.max(0, index - 1);
    const next = rows[nextIndex];
    if (!next) return;
    event.preventDefault();
    next.focus();
    const id = next.dataset["findingId"];
    if (id) props.onSelect(id);
  };

  const filtered = filters.severity !== "all" || filters.category !== "all" || filters.query.trim() !== "";
  const nothingOpen = open.length === 0;

  return (
    <section aria-label="발견 목록" className="plausibility-findings">
      <div className="plausibility-card plausibility-filters">
        <div className="plausibility-filters__row">
          <div aria-label="심각도로 거르기" className="plausibility-segmented" role="group">
            {(["all", "error", "warning", "suggestion"] as const).map((value) => (
              <button
                aria-pressed={filters.severity === value}
                key={value}
                onClick={() => props.onFiltersChange({ ...filters, severity: value })}
                type="button"
              >
                {value === "all" ? "전체" : PLAUSIBILITY_SEVERITY_LABELS[value]} {severityCounts[value]}
              </button>
            ))}
          </div>
          <label>
            범주
            <select
              onChange={(event) => {
                const value = event.target.value;
                const match = PLAUSIBILITY_CATEGORIES.find((category) => category.id === value);
                props.onFiltersChange({ ...filters, category: match ? match.id : "all" });
              }}
              value={filters.category}
            >
              <option value="all">전체 범주</option>
              {PLAUSIBILITY_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>{category.label} ({categoryCounts.get(category.id) ?? 0})</option>
              ))}
            </select>
          </label>
          <label>
            <span><Search aria-hidden size={12} /> 검색</span>
            <input
              onChange={(event) => props.onFiltersChange({ ...filters, query: event.target.value })}
              placeholder="제목·설명·장면 이름"
              type="search"
              value={filters.query}
            />
          </label>
        </div>
        <p aria-live="polite" className="plausibility-hint" role="status">
          {visibleOpen.length}개 표시{filtered ? ` (전체 ${open.length}개 중)` : ""}
          {props.omittedCount > 0 ? t("studio.storyworldStatus.findingList.omitted", { count: props.omittedCount }, " · 목록 상한 때문에 {count}개는 담지 못했어요") : ""}
        </p>
      </div>

      <div ref={containerRef}>
        {groups.map((group) => (
          <section aria-labelledby={`pl-group-${group.category}`} className="plausibility-group" key={group.category}>
            <h3 id={`pl-group-${group.category}`}>{group.label} <small>{group.findings.length}건</small></h3>
            <ul className="plausibility-rows">
              {group.findings.map((finding) => (
                <Row
                  finding={finding}
                  key={finding.id}
                  onKeyDown={moveFocus}
                  onSelect={props.onSelect}
                  selected={finding.id === activeId}
                  tabbable={finding.id === tabStopId}
                  titles={props.sceneTitles}
                />
              ))}
            </ul>
          </section>
        ))}

        {visibleOpen.length === 0 ? (
          <div className="plausibility-empty">
            {filtered && !nothingOpen ? (
              <>
                <h3>{t("studio.storyworldStatus.findingList.emptyFiltered", "조건에 맞는 항목이 없어요")}</h3>
                <p>거르는 조건을 바꾸거나 모두 지워 보세요.</p>
                <div className="plausibility-empty__actions">
                  <button className="storyworld-button" onClick={() => props.onFiltersChange(DEFAULT_PLAUSIBILITY_LIST_FILTERS)} type="button">조건 모두 지우기</button>
                </div>
              </>
            ) : coveragePercent < 40 ? (
              <>
                <h3>{t("studio.storyworldStatus.findingList.emptyUnknown", "찾은 문제가 없지만, 아직 모르는 부분이 많아요")}</h3>
                <p>점검할 수 있었던 칸이 {coveragePercent}%뿐이라 ‘문제 없음’이 아니라 ‘아직 모름’에 가까워요. 질문지에서 장면마다 동기·원인·정보를 알려 주면 더 많이 확인할 수 있어요.</p>
                <div className="plausibility-empty__actions">
                  <button className="storyworld-button storyworld-button--primary" onClick={props.onOpenQuestionnaire} type="button">질문지로 채우기</button>
                </div>
              </>
            ) : (
              <>
                <h3>{t("studio.storyworldStatus.findingList.emptyChecked", "점검한 범위에서는 어긋남을 찾지 못했어요")}</h3>
                <p>점검 가능 범위 {coveragePercent}% 안에서 확인한 결과예요. 기계가 읽지 못하는 부분(말투, 암시, 반어)은 여전히 작가님의 눈이 필요해요.</p>
              </>
            )}
          </div>
        ) : null}

        {handled.length > 0 ? (
          <details className="plausibility-handled plausibility-card">
            <summary>
              처리한 항목 {handled.length}건
              {" "}(해결함 {props.handledCounts.resolved} · 의도된 설정 {props.handledCounts.intended} · 나중에 {props.handledCounts.deferred} · 무시함 {props.handledCounts.ignored})
            </summary>
            {visibleHandled.length === 0 ? (
              <p className="plausibility-hint">{t("studio.storyworldStatus.findingList.emptyHandled", "거르는 조건에 맞는 처리한 항목이 없어요.")}</p>
            ) : (
              <ul className="plausibility-rows">
                {visibleHandled.map((item) => (
                  <Row
                    finding={item.finding}
                    handled={item}
                    key={item.finding.id}
                    onKeyDown={moveFocus}
                    onSelect={props.onSelect}
                    selected={item.finding.id === activeId}
                    tabbable
                    titles={props.sceneTitles}
                  />
                ))}
              </ul>
            )}
          </details>
        ) : null}
      </div>
    </section>
  );
}
