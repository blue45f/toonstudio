import type { ReviewLane, ScopeRef } from "./types";

export interface ReviewPolicyLane {
  readonly lane: ReviewLane;
  readonly eligibleAssignmentIds: readonly string[];
  readonly requiredAssignmentIds: readonly string[];
  readonly quorum: number;
  readonly vetoAssignmentIds: readonly string[];
  readonly blocksPublication: boolean;
}

export interface ReviewPolicy {
  readonly id: string;
  readonly projectId: string;
  readonly scope: ScopeRef;
  readonly lanes: readonly ReviewPolicyLane[];
  /** 생략된 기존 정책은 역할표 기준을 유지한다. */
  readonly quorumBasis?: "assignments" | "accounts";
  readonly responseDueHours: number;
  readonly expiredReviewAction: "escalate" | "replace-reviewer" | "reschedule";
}

export type ReviewDecisionValue = "approve" | "approve-with-conditions" | "request-changes" | "veto" | "abstain";

export interface ReviewDecision {
  readonly id: string;
  readonly reviewRoundId: string;
  readonly lane: ReviewLane;
  readonly assignmentId: string;
  /** 서버가 기록 시점의 실제 계정을 고정한다. 기존 표의 역할로 계정을 추정하지 않는다. */
  readonly reviewerAccountUserId?: string;
  readonly value: ReviewDecisionValue;
  readonly reasonCode: string | null;
  readonly evidenceScopeRefs: readonly ScopeRef[];
  readonly conditions: readonly string[];
  readonly createdAt: string;
}

export interface ApprovalEvaluation {
  readonly approved: boolean;
  readonly blockingLanes: readonly ReviewLane[];
  readonly laneResults: readonly ApprovalLaneEvaluation[];
}

export interface ApprovalLaneEvaluation {
  readonly lane: ReviewLane;
  readonly approved: boolean;
  readonly approvals: number;
  readonly requiredApprovals: number;
  readonly missingRequiredAssignmentIds: readonly string[];
  readonly vetoedByAssignmentIds: readonly string[];
  readonly changeRequestedByAssignmentIds: readonly string[];
}
