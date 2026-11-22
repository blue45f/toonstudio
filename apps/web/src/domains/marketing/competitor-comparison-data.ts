/**
 * ToonStudio vs 주요 제작·협업·소재 도구 7종 비교 정본 데이터 퍼사드 (`/about/compare`).
 *
 * 프로필·가이드·경계(`competitor-comparison-profiles.ts`),
 * 핵심 작화·3D 축(`competitor-comparison-axes-core.ts`),
 * 식자·협업·UX·비용 축(`competitor-comparison-axes-workflow.ts`)을 단일 진입점으로 조합한다.
 */

import { COMPARISON_AXES_CORE } from "./competitor-comparison-axes-core";
import { COMPARISON_AXES_WORKFLOW } from "./competitor-comparison-axes-workflow";
import {
  COMPETITOR_PROFILES,
  CURRENT_VS_TARGET_BOUNDARIES,
  type ComparisonAxis,
  type ComparisonAxisId,
  type CompetitorId,
  type CompetitorProfile,
} from "./competitor-comparison-profiles";

export {
  CAPABILITY_STATUS_META,
  COMPARISON_SNAPSHOT_DATE,
  COMPETITOR_FOCUS_GROUPS,
  COMPETITOR_PROFILES,
  CURRENT_VS_TARGET_BOUNDARIES,
  DECISION_SCENARIOS,
  type BilingualCopy,
  type CapabilityStatus,
  type ComparisonAxis,
  type ComparisonAxisId,
  type ComparisonCell,
  type ComparisonCriterion,
  type ComparisonEvidence,
  type CompetitorFocusGroupId,
  type CompetitorId,
  type CompetitorProfile,
  type CurrentVsTargetItem,
  type DecisionScenario,
} from "./competitor-comparison-profiles";

export const COMPARISON_AXES: readonly ComparisonAxis[] = [
  ...COMPARISON_AXES_CORE,
  ...COMPARISON_AXES_WORKFLOW,
];

export function getComparisonAxis(axisId: ComparisonAxisId): ComparisonAxis {
  return COMPARISON_AXES.find((axis) => axis.id === axisId) ?? COMPARISON_AXES[0]!;
}

export function getCompetitorProfile(id: CompetitorId): CompetitorProfile {
  return COMPETITOR_PROFILES.find((profile) => profile.id === id) ?? COMPETITOR_PROFILES[0]!;
}

export function countComparisonCriteria(): number {
  return COMPARISON_AXES.reduce((total, axis) => total + axis.criteria.length, 0);
}

export function collectAllComparisonEvidencePaths(): readonly string[] {
  const unique = new Set<string>();
  for (const axis of COMPARISON_AXES) {
    for (const criterion of axis.criteria) {
      for (const repoPath of criterion.toonStudioEvidence.repoPaths) {
        unique.add(repoPath);
      }
    }
  }
  for (const boundary of CURRENT_VS_TARGET_BOUNDARIES) {
    for (const repoPath of boundary.repoPaths) {
      unique.add(repoPath);
    }
  }
  return [...unique].sort();
}
