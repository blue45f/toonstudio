import type { ProductionRisk } from "@toonstudio/core/production";

/** 샘플 시나리오의 기준 시각. `production-demo.ts`가 같은 값을 앵커로 다시 내보낸다. */
export const PRODUCTION_DEMO_BASE_AT = "2026-09-15T12:00:00.000Z";
const AT = PRODUCTION_DEMO_BASE_AT;

export type DemoRiskInput = Pick<
  ProductionRisk,
  | "id"
  | "projectId"
  | "scope"
  | "category"
  | "title"
  | "description"
  | "probability"
  | "impact"
  | "ownerAssignmentId"
  | "mitigation"
  | "trigger"
  | "status"
  | "dueAt"
>;

export function createDemoRisk(input: DemoRiskInput): ProductionRisk {
  const exposureScore = input.probability * input.impact;
  const priorityScore = Math.min(100, exposureScore * 4);
  const severity: ProductionRisk["severity"] = priorityScore >= 85
    ? "critical"
    : priorityScore >= 70
      ? "high"
      : priorityScore >= 30 ? "warning" : "watch";
  const episodeId = input.scope.kind === "episode"
    ? input.scope.id
    : input.scope.ancestors.find((entry) => entry.kind === "episode")?.id ?? null;
  return Object.freeze({
    ...input,
    revision: 1,
    source: "manual",
    signalIds: Object.freeze([]),
    exposureScore,
    severity,
    priorityScore,
    causeCodes: Object.freeze(["manual"]),
    earlySignals: Object.freeze([]),
    contingency: "필요하면 일정·범위·인력 조정을 검토합니다.",
    affectedTaskIds: Object.freeze([]),
    affectedEpisodeIds: Object.freeze(episodeId ? [episodeId] : []),
    affectedMilestoneIds: Object.freeze([]),
    baselineDueAt: null,
    forecastDueAt: null,
    varianceHours: null,
    responseDueAt: input.dueAt,
    nextReviewAt: input.dueAt,
    acceptedReason: null,
    dismissedReason: null,
    resolutionSummary: null,
    detectedAt: AT,
    lastEvaluatedAt: AT,
    occurredAt: input.status === "occurred" ? AT : null,
    resolvedAt: input.status === "resolved" ? AT : null,
    closedAt: input.status === "closed" ? AT : null,
    createdAt: AT,
    updatedAt: AT,
  });
}
