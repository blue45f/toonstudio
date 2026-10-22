/**
 * Production 리스크 도메인 타입.
 *
 * `types.ts`에서 리스크 정책·증거·신호·대응·평가 계약만 분리했다(타입 전용, 런타임 없음).
 * 스코프 참조 같은 공통 계약은 `./types`에서 type-only로 가져온다.
 */

import type { ScopeRef } from "./types";

export type ProductionRiskCategory =
  | "story"
  | "visual"
  | "schedule"
  | "capacity"
  | "review"
  | "asset"
  | "budget"
  | "rights"
  | "contract"
  | "platform"
  | "health"
  | "security"
  | "communication"
  | "technical";

export type ProductionRiskSeverity = "watch" | "warning" | "high" | "critical";
export type ProductionRiskResponseStatus = "proposed" | "approved" | "in-progress" | "completed" | "cancelled";
export type ProductionRiskStatus =
  | "open"
  | "monitoring"
  | "mitigating"
  | "occurred"
  | "accepted"
  | "resolved"
  | "dismissed"
  | "closed";
export type ProductionRiskSource = "manual" | "automatic";
export type ProductionRiskSignalState = "active" | "cleared" | "suppressed";
export type ProductionRiskConfidence = "high" | "medium" | "low";

export interface ProductionRiskPolicy {
  readonly id: string;
  readonly projectId: string;
  readonly timezone: string;
  readonly workdayEndLocal: string;
  readonly dueSoonHours: number;
  readonly blockedWarningHours: number;
  readonly blockedCriticalHours: number;
  readonly capacityWarningPercent: number;
  readonly capacityCriticalPercent: number;
  readonly defaultReviewSlaHours: number;
  readonly minimumReadyBufferEpisodes: number;
  readonly autoOpenSeverity: "warning" | "high" | "critical";
  readonly notificationCooldownHours: number;
  /** Backward-compatible stability window for automatically opening inferred risks. */
  readonly autoOpenStableHours?: number;
  /** Hysteresis applied while an existing automatic risk recovers below its trigger. */
  readonly thresholdHysteresisPercent?: number;
  /** Minimum evidence confidence for opening non-critical automatic risks. */
  readonly autoOpenMinimumConfidence?: ProductionRiskConfidence;
  readonly autoResolveStableHours: number;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface ProductionRiskEvidence {
  readonly key: string;
  readonly label: string;
  readonly value: string | number | boolean | null;
  readonly threshold: string | number | null;
  readonly unit: string | null;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly observedAt: string;
}

export interface ProductionRiskSignal {
  readonly id: string;
  readonly projectId: string;
  readonly fingerprint: string;
  readonly ruleKey: string;
  readonly scope: ScopeRef;
  readonly sourceEntityType:
    | "task"
    | "episode"
    | "assignment"
    | "review"
    | "asset"
    | "milestone"
    | "change-request"
    | "project";
  readonly sourceEntityId: string;
  readonly category: ProductionRiskCategory;
  readonly severity: ProductionRiskSeverity;
  readonly priorityScore: number;
  readonly confidence: ProductionRiskConfidence;
  readonly title: string;
  readonly summary: string;
  readonly evidence: readonly ProductionRiskEvidence[];
  readonly affectedTaskIds: readonly string[];
  readonly affectedEpisodeIds: readonly string[];
  readonly affectedMilestoneIds: readonly string[];
  readonly linkedRiskId: string | null;
  readonly state: ProductionRiskSignalState;
  readonly firstDetectedAt: string;
  readonly lastDetectedAt: string;
  readonly clearedAt: string | null;
  readonly suppression: {
    readonly reason: string;
    readonly suppressedByAssignmentId: string;
    readonly suppressedAt: string;
    readonly expiresAt: string | null;
  } | null;
}

export interface ProductionRiskResponse {
  readonly id: string;
  readonly projectId: string;
  readonly riskId: string;
  readonly strategy: "avoid" | "mitigate" | "transfer" | "accept" | "escalate";
  readonly actionType:
    | "assign"
    | "split-task"
    | "reschedule"
    | "resolve-dependency"
    | "parallel-review"
    | "outsource"
    | "reduce-scope"
    | "reuse-asset"
    | "create-change-request"
    | "manual";
  readonly title: string;
  readonly description: string;
  readonly ownerAssignmentId: string | null;
  readonly dueAt: string | null;
  readonly linkedTaskId: string | null;
  readonly linkedChangeRequestId: string | null;
  readonly linkedChangeOrderId: string | null;
  readonly expectedEffect: string;
  readonly actualEffect: string | null;
  readonly status: ProductionRiskResponseStatus;
  /** Optional on legacy records; transitions materialize the current revision. */
  readonly revision?: number;
  readonly cancellationReason?: string | null;
  readonly approvedAt?: string | null;
  readonly startedAt?: string | null;
  readonly cancelledAt?: string | null;
  readonly updatedAt?: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface ProductionRiskAssessment {
  readonly id: string;
  readonly projectId: string;
  readonly riskId: string;
  readonly signalIds: readonly string[];
  readonly probability: 1 | 2 | 3 | 4 | 5;
  readonly impact: 1 | 2 | 3 | 4 | 5;
  readonly exposureScore: number;
  readonly priorityScore: number;
  readonly confidence: ProductionRiskConfidence;
  readonly rationale: readonly string[];
  readonly assessedAt: string;
}

export interface ProductionRisk {
  readonly id: string;
  readonly projectId: string;
  readonly revision: number;
  readonly scope: ScopeRef;
  readonly category: ProductionRiskCategory;
  readonly source: ProductionRiskSource;
  readonly signalIds: readonly string[];
  readonly title: string;
  readonly description: string;
  readonly probability: 1 | 2 | 3 | 4 | 5;
  readonly impact: 1 | 2 | 3 | 4 | 5;
  readonly exposureScore: number;
  readonly severity: ProductionRiskSeverity;
  readonly priorityScore: number;
  readonly ownerAssignmentId: string | null;
  readonly causeCodes: readonly string[];
  readonly earlySignals: readonly string[];
  readonly mitigation: string;
  readonly contingency: string;
  readonly trigger: string;
  readonly affectedTaskIds: readonly string[];
  readonly affectedEpisodeIds: readonly string[];
  readonly affectedMilestoneIds: readonly string[];
  readonly baselineDueAt: string | null;
  readonly forecastDueAt: string | null;
  readonly varianceHours: number | null;
  readonly status: ProductionRiskStatus;
  /** @deprecated use responseDueAt */
  readonly dueAt: string | null;
  readonly responseDueAt: string | null;
  readonly nextReviewAt: string | null;
  readonly acceptedReason: string | null;
  readonly dismissedReason: string | null;
  readonly resolutionSummary: string | null;
  readonly detectedAt: string;
  readonly lastEvaluatedAt: string;
  readonly occurredAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

