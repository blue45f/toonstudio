import { ChevronDown, LayoutGrid, Pin, Search, X } from "lucide-react";
import { useMemo, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";

export interface StudioHubCalmTabItem<T extends string = string> {
  readonly id: T;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface StudioHubCalmTabNavigatorProps<T extends string> {
  readonly baseId: string;
  readonly ariaLabel: string;
  readonly tabs: readonly StudioHubCalmTabItem<T>[];
  readonly pinnedIds: readonly T[];
  readonly activeId: T;
  readonly onSelect: (id: T) => void;
  readonly renderIcon: (id: T) => ReactNode;
  readonly isEn: boolean;
  readonly searchPlaceholderKo?: string;
  readonly searchPlaceholderEn?: string;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const MOTION_BTN =
  "transition-[background-color,border-color,color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";
const TAB_BASE = `inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] ${MOTION_BTN} ${FOCUS_RING}`;
const MODULE_BASE = `inline-flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold [word-break:keep-all] ${MOTION_BTN} ${FOCUS_RING}`;
const ACTIVE_TONE = "border-accent bg-accent text-on-accent";
const TAB_IDLE = "border-line bg-panel text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const MODULE_IDLE = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const BADGE_CLS = "rounded-full border border-line bg-card px-2 py-0.5 text-[11px] font-semibold tabular-nums text-fg-2";

function matchesModuleQuery<T extends string>(tab: StudioHubCalmTabItem<T>, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = `${tab.labelKo} ${tab.labelEn} ${tab.id}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function StudioHubCalmTabNavigator<T extends string>(props: StudioHubCalmTabNavigatorProps<T>): ReactElement {
  const {
    baseId, ariaLabel, tabs, pinnedIds, activeId, onSelect, renderIcon, isEn,
    searchPlaceholderKo, searchPlaceholderEn,
  } = props;
  const [query, setQuery] = useState("");

  const { pinnedTabs, drawerTabs, visibleTabs, autoPinnedId } = useMemo(() => {
    const byId = new Map<T, StudioHubCalmTabItem<T>>(tabs.map((tab) => [tab.id, tab]));
    const pinned: StudioHubCalmTabItem<T>[] = [];
    const seen = new Set<T>();
    for (const id of pinnedIds) {
      const found = seen.has(id) ? undefined : byId.get(id);
      if (found) {
        seen.add(id);
        pinned.push(found);
      }
    }
    if (pinned.length === 0) {
      for (const tab of tabs.slice(0, 6)) {
        seen.add(tab.id);
        pinned.push(tab);
      }
    }
    const activeTab = byId.get(activeId);
    const outsidePin = activeTab && !seen.has(activeTab.id) ? activeTab : null;
    return {
      pinnedTabs: pinned,
      drawerTabs: tabs.filter((tab) => !seen.has(tab.id)),
      visibleTabs: outsidePin ? [...pinned, outsidePin] : pinned,
      autoPinnedId: outsidePin ? outsidePin.id : null,
    };
  }, [tabs, pinnedIds, activeId]);

  const searchTokens = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return trimmed ? trimmed.split(/\s+/u).filter(Boolean) : [];
  }, [query]);
  const searchMatches = useMemo(
    () => (searchTokens.length > 0 ? tabs.filter((tab) => matchesModuleQuery(tab, searchTokens)) : []),
    [tabs, searchTokens],
  );

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    if (visibleTabs.length === 0) return;
    event.preventDefault();
    const nextIndex =
      event.key === "ArrowRight" ? (index + 1) % visibleTabs.length
        : event.key === "ArrowLeft" ? (index - 1 + visibleTabs.length) % visibleTabs.length
          : event.key === "Home" ? 0 : visibleTabs.length - 1;
    const nextTab = visibleTabs[nextIndex];
    if (!nextTab) return;
    onSelect(nextTab.id);
    const targetButton = document.getElementById(`${baseId}-tab-${nextTab.id}`);
    if (targetButton instanceof HTMLElement) targetButton.focus();
  };

  const renderModuleButton = (tab: StudioHubCalmTabItem<T>, clearSearchOnSelect: boolean) => {
    const selected = tab.id === activeId;
    return (
      <button
        key={tab.id}
        type="button"
        aria-pressed={selected}
        data-hub-module-id={tab.id}
        onClick={() => {
          onSelect(tab.id);
          if (clearSearchOnSelect) setQuery("");
        }}
        className={`${MODULE_BASE} ${selected ? ACTIVE_TONE : MODULE_IDLE}`}
      >
        {renderIcon(tab.id)}
        <span className="min-w-0 flex-1">{isEn ? tab.labelEn : tab.labelKo}</span>
      </button>
    );
  };

  const placeholder = isEn
    ? (searchPlaceholderEn ?? "Find a tool by goal or keyword (e.g. brush, lighting, 3D)…")
    : (searchPlaceholderKo ?? "원하는 작업 이름으로 빠르게 찾기 (예: 브러시, 조명, 3D)…");
  const isSearching = searchTokens.length > 0;

  return (
    <div
      className="flex flex-col gap-2.5"
      data-testid="studio-hub-calm-tab-navigator"
      data-total-tabs={tabs.length}
      data-pinned-count={pinnedTabs.length}
      data-hidden-count={drawerTabs.length}
    >
      <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-2">
        {visibleTabs.map((tab, index) => {
          const selected = tab.id === activeId;
          const isAutoPinned = tab.id === autoPinnedId;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              data-pinned={isAutoPinned ? "auto" : "core"}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`${TAB_BASE} ${selected ? ACTIVE_TONE : TAB_IDLE}`}
            >
              {isAutoPinned ? <Pin size={13} aria-hidden="true" className="shrink-0 opacity-85" /> : null}
              {renderIcon(tab.id)}
              <span>{isEn ? tab.labelEn : tab.labelKo}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <div className="relative flex items-center">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 text-fg-3" />
          <input
            id={`${baseId}-module-search`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query.length > 0) {
                event.preventDefault();
                setQuery("");
              }
            }}
            placeholder={placeholder}
            aria-label={isEn ? `${ariaLabel} module search` : `${ariaLabel} 모듈 실시간 검색`}
            data-testid="studio-hub-calm-search-input"
            className={`min-h-11 w-full rounded-xl border border-line bg-panel py-2 pl-9 pr-11 text-xs text-fg placeholder:text-fg-3 [word-break:keep-all] transition-[border-color,background-color] duration-150 hover:border-line-strong motion-reduce:transition-none ${FOCUS_RING}`}
          />
          {query.length > 0 ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={isEn ? "Clear search" : "검색어 지우기"}
              data-testid="studio-hub-calm-search-clear"
              className={`absolute right-0 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-fg-2 transition-colors duration-150 hover:text-fg motion-reduce:transition-none ${FOCUS_RING}`}
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {isSearching ? (
          <div
            role="region"
            aria-live="polite"
            aria-label={isEn ? "Module search results" : "모듈 검색 결과"}
            data-testid="studio-hub-calm-search-results"
            className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-2.5"
          >
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-xs font-semibold text-fg-2 [word-break:keep-all]">
                {isEn ? "Matching modules" : "일치하는 모듈"}
              </p>
              <span className={BADGE_CLS}>
                {isEn ? `${searchMatches.length} found` : `${searchMatches.length}종`}
              </span>
            </div>
            {searchMatches.length > 0 ? (
              <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2 lg:grid-cols-3">
                {searchMatches.map((tab) => renderModuleButton(tab, true))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2.5">
                <p className="text-xs text-fg-2 [word-break:keep-all]">
                  {isEn ? "No modules match your search." : "입력한 이름과 일치하는 모듈이 없습니다."}
                </p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-fg transition-colors duration-150 hover:border-line-strong hover:bg-raised motion-reduce:transition-none ${FOCUS_RING}`}
                >
                  {isEn ? "Reset search" : "검색 초기화"}
                </button>
              </div>
            )}
          </div>
        ) : null}

        {drawerTabs.length > 0 ? (
          <details className="group rounded-xl border border-line bg-panel" data-testid="studio-hub-calm-drawer">
            <summary
              className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-fg [word-break:keep-all] transition-[background-color,color] duration-150 hover:bg-raised motion-reduce:transition-none ${FOCUS_RING}`}
            >
              <span className="inline-flex items-center gap-2">
                <LayoutGrid size={14} aria-hidden="true" className="shrink-0 text-fg-2" />
                <span>{isEn ? `Browse all ${tabs.length} pro modules` : `전체 전문 모듈 ${tabs.length}종 탐색`}</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span data-testid="studio-hub-calm-hidden-badge" className={BADGE_CLS}>
                  {isEn ? `+${drawerTabs.length} more` : `+${drawerTabs.length}종 숨김`}
                </span>
                <ChevronDown size={14} aria-hidden="true" className="shrink-0 text-fg-2 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
              </span>
            </summary>
            <div className="border-t border-line p-2.5">
              <div data-testid="studio-hub-calm-drawer-grid" className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2 lg:grid-cols-3">
                {drawerTabs.map((tab) => renderModuleButton(tab, false))}
              </div>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
