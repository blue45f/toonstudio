/**
 * 발견 목록의 거르기 조건(심각도·범주·검색어).
 */
import type { PlausibilityCategoryId, PlausibilitySeverity } from "./studio-story-plausibility-types";

export type PlausibilitySeverityFilter = PlausibilitySeverity | "all";
export type PlausibilityCategoryFilter = PlausibilityCategoryId | "all";

export interface PlausibilityListFilters {
  readonly severity: PlausibilitySeverityFilter;
  readonly category: PlausibilityCategoryFilter;
  readonly query: string;
}

export const DEFAULT_PLAUSIBILITY_LIST_FILTERS: PlausibilityListFilters = { severity: "all", category: "all", query: "" };
