/**
 * 드로잉 툴 8종 심층 기술 비교 정본 데이터 퍼사드 (`/about/technology/drawing-compare`).
 *
 * 800줄 파일 크기 상한을 지키기 위해 프로필·정직한 한계(`drawing-tool-comparison-profiles.ts`),
 * 브러시·커스텀·필터 3영역(`drawing-tool-comparison-axes-paint.ts`),
 * 선화·만화·협업·가격 4영역(`drawing-tool-comparison-axes-workflow.ts`)을 단일 진입점으로 묶는다.
 */

import { DRAWING_CATEGORIES_PAINT } from "./drawing-tool-comparison-axes-paint";
import { DRAWING_CATEGORIES_WORKFLOW } from "./drawing-tool-comparison-axes-workflow";
import {
  DRAWING_TOOL_PROFILES,
  TOONSTUDIO_HONEST_LIMITATIONS,
  type DrawingCategoryId,
  type DrawingComparisonCategory,
  type DrawingComparisonCriterion,
  type DrawingSupportStatus,
  type DrawingToolId,
  type DrawingToolProfile,
} from "./drawing-tool-comparison-profiles";

export {
  COMPETITOR_ADVANTAGES,
  DRAWING_COMPARE_SNAPSHOT_DATE,
  DRAWING_SUPPORT_STATUS_META,
  DRAWING_TOOL_PRESETS,
  DRAWING_TOOL_PROFILES,
  TOONSTUDIO_HONEST_LIMITATIONS,
  type BilingualText,
  type CompetitorAdvantageNote,
  type DrawingCategoryId,
  type DrawingComparisonCategory,
  type DrawingComparisonCriterion,
  type DrawingCriterionEvidence,
  type DrawingPresetId,
  type DrawingSupportStatus,
  type DrawingToolCell,
  type DrawingToolId,
  type DrawingToolProfile,
  type ToonStudioLimitationNote,
} from "./drawing-tool-comparison-profiles";

export const DRAWING_COMPARISON_CATEGORIES: readonly DrawingComparisonCategory[] = [
  ...DRAWING_CATEGORIES_PAINT,
  ...DRAWING_CATEGORIES_WORKFLOW,
];

export const ALL_DRAWING_CRITERIA: readonly DrawingComparisonCriterion[] =
  DRAWING_COMPARISON_CATEGORIES.flatMap((category) => category.criteria);

export function countDrawingCriteria(): number {
  return ALL_DRAWING_CRITERIA.length;
}

export function getDrawingToolProfile(id: DrawingToolId): DrawingToolProfile {
  return DRAWING_TOOL_PROFILES.find((profile) => profile.id === id) ?? DRAWING_TOOL_PROFILES[0]!;
}

export interface ToolSupportCounts {
  readonly supported: number;
  readonly partial: number;
  readonly plugin: number;
  readonly unsupported: number;
}

export function countToolSupportStats(
  toolId: DrawingToolId,
  criteria: readonly DrawingComparisonCriterion[] = ALL_DRAWING_CRITERIA,
): ToolSupportCounts {
  let supported = 0;
  let partial = 0;
  let plugin = 0;
  let unsupported = 0;
  for (const item of criteria) {
    const status = item.cells[toolId].status;
    if (status === "supported") supported += 1;
    else if (status === "partial") partial += 1;
    else if (status === "plugin") plugin += 1;
    else unsupported += 1;
  }
  return { supported, partial, plugin, unsupported };
}

export interface FilterDrawingCriteriaInput {
  readonly categoryId: "all" | DrawingCategoryId;
  readonly query: string;
  readonly statusFilter: "all" | DrawingSupportStatus;
  readonly visibleTools: readonly DrawingToolId[];
}

function matchesSearchQuery(
  criterion: DrawingComparisonCriterion,
  normalizedQuery: string,
  visibleTools: readonly DrawingToolId[],
): boolean {
  if (!normalizedQuery) return true;
  const fields: string[] = [
    criterion.title.ko,
    criterion.title.en,
    criterion.summary.ko,
    criterion.summary.en,
    criterion.evidence.rationale.ko,
    criterion.evidence.rationale.en,
    criterion.evidence.implementationDiff.ko,
    criterion.evidence.implementationDiff.en,
    ...criterion.evidence.repoPaths,
  ];
  for (const toolId of visibleTools) {
    const cell = criterion.cells[toolId];
    fields.push(cell.label.ko, cell.label.en, cell.detail.ko, cell.detail.en);
  }
  return fields.some((field) => field.toLowerCase().includes(normalizedQuery));
}

export function filterDrawingCriteria({
  categoryId,
  query,
  statusFilter,
  visibleTools,
}: FilterDrawingCriteriaInput): readonly DrawingComparisonCriterion[] {
  const normalizedQuery = query.trim().toLowerCase();
  const base = categoryId === "all"
    ? ALL_DRAWING_CRITERIA
    : (DRAWING_COMPARISON_CATEGORIES.find((category) => category.id === categoryId)?.criteria ?? []);

  return base.filter((criterion) => {
    if (statusFilter !== "all" && criterion.cells.toonstudio.status !== statusFilter) {
      return false;
    }
    return matchesSearchQuery(criterion, normalizedQuery, visibleTools);
  });
}

export function collectAllDrawingEvidencePaths(): readonly string[] {
  const unique = new Set<string>();
  for (const criterion of ALL_DRAWING_CRITERIA) {
    for (const repoPath of criterion.evidence.repoPaths) {
      unique.add(repoPath);
    }
  }
  for (const limit of TOONSTUDIO_HONEST_LIMITATIONS) {
    for (const repoPath of limit.repoPaths) {
      unique.add(repoPath);
    }
  }
  return [...unique].sort();
}
