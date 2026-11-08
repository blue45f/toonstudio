import { SlidersHorizontal } from "lucide-react";

import { useBilingual, translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { PERIODS, RANK_AXES, type RankAxis, type RankPeriod } from "@/shared/lib/ranking";
import type { PlatformId } from "@/shared/lib/types";

import "./ranking-primary-controls.css";

interface RankingPrimaryControlsProps {
  axis: RankAxis;
  onAxisChange: (axis: RankAxis) => void;
  period: RankPeriod;
  onPeriodChange: (period: RankPeriod) => void;
  platform: PlatformId | "all";
  onPlatformChange: (platform: PlatformId | "all") => void;
  platforms: readonly { value: PlatformId | "all"; label: string }[];
  filtersOpen: boolean;
  filterCount: number;
  onToggleFilters: () => void;
}

/** 넓은 화면은 주요 기준을 바로 고르고, 모바일은 여덟 기준을 하나의 선택기로 유지한다. */
export function RankingPrimaryControls({
  axis, onAxisChange, period, onPeriodChange, platform, onPlatformChange,
  platforms, filtersOpen, filterCount, onToggleFilters,
}: RankingPrimaryControlsProps) {
  const bt = useBilingual("RankingBoard");
  const label = (source: string) => translateCurrentStaticSourceText("RankingBoard", "ko", source);
  const primaryAxes = RANK_AXES.slice(0, 4);
  const extraAxes = RANK_AXES.slice(4);
  const changeAxis = (value: string) => {
    const selected = RANK_AXES.find((entry) => entry.key === value);
    if (selected) onAxisChange(selected.key);
  };

  return (
    <section className="ranking-primary-controls" aria-label={bt("랭킹 조건", "Ranking controls")}>
      <div className="ranking-primary-axes" role="group" aria-label={bt("주요 랭킹 기준", "Main ranking criteria")}>
        {primaryAxes.map((entry) => (
          <button key={entry.key} type="button" aria-pressed={axis === entry.key} onClick={() => onAxisChange(entry.key)}>
            {label(entry.label)}
          </button>
        ))}
        <select
          aria-label={bt("더 많은 랭킹 기준", "More ranking criteria")}
          value={extraAxes.some((entry) => entry.key === axis) ? axis : ""}
          data-active={extraAxes.some((entry) => entry.key === axis)}
          onChange={(event) => changeAxis(event.target.value)}
        >
          <option value="" disabled>{bt("더 보기", "More")}</option>
          {extraAxes.map((entry) => <option key={entry.key} value={entry.key}>{label(entry.label)}</option>)}
        </select>
      </div>
      <select
        aria-label={bt("랭킹 산식 축", "Ranking criterion")}
        className="ranking-primary-axis-mobile"
        value={axis}
        onChange={(event) => changeAxis(event.target.value)}
      >
        {RANK_AXES.map((entry) => <option key={entry.key} value={entry.key}>{label(entry.label)}</option>)}
      </select>
      <select
        aria-label={bt("랭킹 기간", "Ranking period")}
        className="ranking-primary-period"
        value={period}
        onChange={(event) => {
          const selected = PERIODS.find((entry) => entry.key === event.target.value);
          if (selected) onPeriodChange(selected.key);
        }}
      >
        {PERIODS.map((entry) => <option key={entry.key} value={entry.key}>{label(entry.label)}</option>)}
      </select>
      <select
        aria-label={bt("랭킹 플랫폼", "Ranking platform")}
        className="ranking-primary-platform"
        value={platform}
        onChange={(event) => {
          const selected = platforms.find((entry) => entry.value === event.target.value);
          if (selected) onPlatformChange(selected.value);
        }}
      >
        {platforms.map((entry) => <option key={entry.value} value={entry.value}>{label(entry.label)}</option>)}
      </select>
      <button type="button" className="ranking-primary-filter" onClick={onToggleFilters} aria-expanded={filtersOpen} aria-controls="ranking-client-filters">
        <SlidersHorizontal size={15} aria-hidden="true" />
        {bt("필터", "Filters")}
        {filterCount > 0 ? <span className="ranking-primary-filter-count">{filterCount}</span> : null}
      </button>
    </section>
  );
}
