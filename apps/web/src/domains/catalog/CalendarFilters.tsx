import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { TitleFilterPanel } from "@/shared/components/title-filter-panel";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { countActiveTitleFilters, type TitleFilterState } from "@/shared/lib/title-filters";
import type { PlatformId } from "@/shared/lib/types";
import { CALENDAR_BM_FILTERS, type CalendarBmFilterId } from "@/shared/navigation/webtoon-platform-router-ux-model";

import "./calendar-page-layout.css";

type PlatformCoverage = { id: PlatformId; label: string; color: string; count: number };
interface CalendarFiltersProps {
  filters: TitleFilterState;
  onChange: (filters: TitleFilterState) => void;
  onPreset: (preset: CalendarBmFilterId) => void;
  platforms: readonly PlatformCoverage[];
  savedCount: number;
  remember: boolean;
  onToggleRemember: () => void;
  actions: ReactNode;
}

/** 기억한 필터·수동 변경·초기화를 실제 값과 대조해 오래된 프리셋 선택 표시를 방지한다. */
function calendarPresetForFilters(filters: TitleFilterState): CalendarBmFilterId | null {
  const { pricing, status, yearRange } = filters;
  if (!status.length && !yearRange) {
    if (!pricing.length) return "all";
    if (pricing.length === 1 && pricing[0] === "wait-free") return "wait-free";
    if (pricing.length === 1 && pricing[0] === "free") return "free";
  }
  if (!pricing.length && status.length === 1) {
    if (status[0] === "completed" && !yearRange) return "completed";
    if (status[0] === "ongoing" && yearRange?.[0] === 2025 && yearRange[1] === 2026) return "new";
  }
  return null;
}

export function CalendarFilters({ filters, onChange, onPreset, platforms, savedCount, remember, onToggleRemember, actions }: CalendarFiltersProps) {
  const bt = useBilingual("CalendarPage");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const activePreset = calendarPresetForFilters(filters);
  const activeCount = countActiveTitleFilters(filters);
  const copy: Record<CalendarBmFilterId, readonly [string, string]> = {
    all: ["전체 연재작", "All series"],
    "wait-free": ["기다리면 무료", "Wait-free"],
    free: ["무료 공개", "Free to read"],
    // 기존 프리셋의 실제 연도 범위를 표시한다. 월 단위 신작이라고 오해시키지 않는다.
    new: ["2025·2026 신작", "New releases in 2025–2026"],
    completed: ["완결 정주행", "Completed series"],
  };
  const presetButton = (id: CalendarBmFilterId) => (
    <button key={id} type="button" className="calendar-preset" aria-pressed={activePreset === id} onClick={() => onPreset(id)}>{bt(...copy[id])}</button>
  );

  return (
    <div className="calendar-controls">
      <div className="calendar-primary-presets" role="group" aria-label={bt("이용권·연재 방식 빠른 필터", "Business model & release filter")} data-testid="calendar-bm-filter-bar">
        {CALENDAR_BM_FILTERS.slice(0, 3).map(({ id }) => presetButton(id))}
        <div className="calendar-more-select">
          <select aria-label={bt("추가 연재 조건", "More release conditions")} value={activePreset === "new" || activePreset === "completed" ? activePreset : ""} onChange={(event) => {
            const selected = CALENDAR_BM_FILTERS.find((entry) => entry.id === event.target.value);
            if (selected) onPreset(selected.id);
          }}>
            <option value="" disabled>{bt("더 보기", "More")}</option>
            {CALENDAR_BM_FILTERS.slice(3).map(({ id }) => <option key={id} value={id}>{bt(...copy[id])}</option>)}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
      </div>
      <button type="button" className="calendar-filter-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((current) => !current)}>
        <SlidersHorizontal size={15} aria-hidden="true" />
        <span className="calendar-filter-label-wide">{bt("플랫폼·상세 필터", "Platforms and filters")}</span>
        <span className="calendar-filter-label-small">{bt("필터", "Filters")}</span>
        {activeCount > 0 ? <span className="calendar-filter-count">{activeCount}</span> : null}
        <ChevronDown size={14} aria-hidden="true" className={open ? "calendar-chevron-open" : undefined} />
      </button>
      <div className="calendar-controls-actions">{actions}</div>
      {open && <section id={panelId} className="calendar-filter-panel" aria-label={bt("연재 조건과 플랫폼", "Release conditions and platforms")}>
        <div className="calendar-mobile-presets" role="group" aria-label={bt("모바일 이용권·연재 방식", "Mobile release conditions")}>
          {CALENDAR_BM_FILTERS.map(({ id }) => presetButton(id))}
        </div>
        {platforms.length > 0 && <div>
          <div className="calendar-platform-heading">
            <p>{bt("표시할 플랫폼", "Platforms to show")}</p>
            {filters.platforms.length > 0 && <button type="button" onClick={() => onChange({ ...filters, platforms: [] })}>{bt("전체 보기", "Show all")}</button>}
          </div>
          <div className="calendar-platform-options" role="group" aria-label={bt("플랫폼 선택", "Choose platforms")}>
            {platforms.map((platform) => <button key={platform.id} type="button" className="calendar-platform-option" aria-pressed={filters.platforms.includes(platform.id)} onClick={() => onChange({
              ...filters, platforms: filters.platforms.includes(platform.id) ? filters.platforms.filter((id) => id !== platform.id) : [...filters.platforms, platform.id],
            })}>
              <span aria-hidden="true" className="calendar-platform-dot" style={{ backgroundColor: platform.color }} />
              {platform.label}<span className="numeral">{platform.count}</span>
            </button>)}
          </div>
        </div>}
        <TitleFilterPanel value={filters} onChange={onChange} facets={["saved", "genre", "pricing", "age", "minRating", "tag"]} savedCount={savedCount} remember={remember} onToggleRemember={onToggleRemember} />
      </section>}
    </div>
  );
}
