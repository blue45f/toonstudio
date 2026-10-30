import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { isDeepStrictEqual } from "node:util";
import {
  activeAssignments,
  currentProductionReviewDecisions,
  eligibleProductionReviewAssignments,
  evaluateReviewApproval,
  productionScopeDepth,
  productionTaskHasCurrentApprovedOutputs,
  productionTaskHasCurrentDependencyInputs,
  productionTaskHasCurrentReviewOutputs,
  productionSubmissionBlockingClarifications,
  productionSubmissionStaleDependencyTasks,
  scopeContains,
  transitionProductionTask,
  validateReviewDecision,
  type ProductionProjectAggregate,
  type ReviewDecision,
  type Submission,
} from "@toonstudio/core/production";

/** 일반 저장 경로에서도 공정 완료는 최신 승인 제출본으로 증명한다. */
export function assertProductionTaskMutationSafety(
  before: ProductionProjectAggregate,
  after: ProductionProjectAggregate,
  at: string = after.updatedAt,
): void {
  const completed = before.tasks.filter((task) =>
    (task.status === "approved" || task.status === "done") && productionTaskHasCurrentApprovedOutputs(task, before)).map((task) => task.id);
  const issues: string[] = [];
  const active = new Map(activeAssignments(after.assignments, at).filter((entry) => entry.status === "active")
    .map((entry) => [entry.id, entry]));
  for (const task of after.tasks) {
    const current = before.tasks.find((entry) => entry.id === task.id);
    const available = (id: string) => {
      const assignment = active.get(id);
      return assignment?.projectId === task.projectId && scopeContains(assignment.scope, task.scope);
    };
    const scopeChanged = current != null && !isDeepStrictEqual(current.scope, task.scope);
    const added = [...task.assignmentIds.filter((id) => scopeChanged || !current?.assignmentIds.includes(id)),
      ...task.reviewerAssignmentIds.filter((id) => scopeChanged || !current?.reviewerAssignmentIds.includes(id))];
    if (added.some((id) => !available(id))) issues.push(`${task.title}: 현재 활동 기간과 작업 범위에 맞는 담당자·검수자만 새로 배정할 수 있습니다.`);
    if (current?.status !== task.status && task.status === "in-progress" && !task.assignmentIds.some(available)) {
      issues.push(`${task.title}: 작업을 시작하기 전에 현재 활동 기간과 범위에 맞는 활성 담당자를 배정하세요.`);
    }
    if (current?.status === task.status && (!["approved", "done", "conditionally-approved"].includes(task.status)
      || (isDeepStrictEqual(current.inputRevisionRefs, task.inputRevisionRefs)
        && isDeepStrictEqual(current.outputDeliverableIds, task.outputDeliverableIds)))) continue;
    if (!current && !["draft", "ready", "needs-input"].includes(task.status)) {
      issues.push(`${task.title}: 새 작업은 초안 또는 입력 준비 상태에서 시작하세요.`);
      continue;
    }
    if (current && current.status !== task.status) {
      try {
        transitionProductionTask({ ...task, status: current.status }, task.status, completed);
      } catch {
        issues.push(`${task.title}: 공정 순서·선행 작업·고정 입력을 확인하세요.`);
      }
    }
    if (["approved", "done", "conditionally-approved"].includes(task.status)) {
      if (!productionTaskHasCurrentApprovedOutputs(task, after)) issues.push(`${task.title}: 모든 산출물에 고정 입력이 일치하는 최신 승인 제출본이 있어야 승인·완료할 수 있습니다.`);
      if (!productionTaskHasCurrentDependencyInputs(task, after)) issues.push(`${task.title}: 선행 공정의 현재 승인 버전을 입력에 고정한 뒤 승인·완료하세요.`);
    }
    if (["internal-review", "external-review"].includes(task.status) && !productionTaskHasCurrentReviewOutputs(task, after)) {
      issues.push(`${task.title}: 검수 요청 전에 고정 입력과 일치하는 현재 제출본을 저장하세요.`);
    }
    if (["internal-review", "external-review"].includes(task.status) && !task.reviewerAssignmentIds.some(available)) {
      issues.push(`${task.title}: 현재 활동 기간과 범위에 맞는 활성 검수자를 배정하세요.`);
    }
    if (task.status === "in-progress" && !productionTaskHasCurrentDependencyInputs(task, before)) {
      issues.push(`${task.title}: 선행 공정의 현재 승인 버전을 작업 입력에 고정하세요.`);
    }
  }
  if (issues.length) throw new BadRequestException({ message: "작업 인계 조건을 충족하지 못했습니다.", issues });
}

/** 제출본 ID를 검수 회차로 고정하여 이전 원고의 승인을 재사용하지 않는다. */
export function assertProductionSubmissionApproval(
  aggregate: ProductionProjectAggregate,
  submission: Submission,
  actorUserId: string,
  at: string,
): void {
  const current = aggregate.submissions.find((entry) => entry.id === submission.id);
  if (!current && aggregate.reviewDecisions.some((entry) => entry.reviewRoundId === submission.id)) {
    throw new BadRequestException("새 제출본 ID는 이미 사용한 검수 회차 ID와 겹칠 수 없습니다.");
  }
  if (submission.status !== "approved" || current?.status === "approved") return;
  const deliverable = aggregate.deliverables.find((entry) => entry.id === submission.deliverableId);
  if (!deliverable) throw new BadRequestException("제출본의 산출물을 찾을 수 없습니다.");
  if (current?.status !== "in-review" || deliverable.currentSubmissionId !== submission.id) {
    throw new BadRequestException("현재 검수 중인 제출본만 승인할 수 있습니다.");
  }
  const staleTasks = productionSubmissionStaleDependencyTasks(aggregate, submission);
  if (staleTasks.length) throw new BadRequestException({ message: "현재 선행 입력과 일치하는 제출본만 새로 승인할 수 있습니다.",
    issues: staleTasks.map((task) => `${task.title}: 선행 공정의 현재 승인 버전을 입력에 고정한 뒤 승인·완료하세요.`) });
  const blockers = productionSubmissionBlockingClarifications(aggregate, submission);
  if (blockers.length) throw new BadRequestException({ message: "현재 인수인계의 차단 질문을 해결한 뒤 승인하세요.", clarificationIds: blockers.map((entry) => entry.id) });
  const policy = aggregate.reviewPolicies.filter((entry) => scopeContains(entry.scope, deliverable.scope))
    .sort((left, right) => productionScopeDepth(right.scope) - productionScopeDepth(left.scope))[0];
  if (!policy || policy.lanes.length === 0) throw new BadRequestException("산출물 범위의 필수 검수 정책이 필요합니다.");
  const active = eligibleProductionReviewAssignments(aggregate, deliverable.scope, at);
  const eligible = new Set(active.map((entry) => entry.id));
  const latest = new Map<string, ReviewDecision>();
  for (const entry of aggregate.reviewDecisions.filter((entry) => entry.reviewRoundId === submission.id
    && eligible.has(entry.assignmentId) && validateReviewDecision(policy, entry).length === 0)) {
    const key = `${entry.lane}:${entry.assignmentId}`;
    const previous = latest.get(key);
    if (!previous || Date.parse(entry.createdAt) >= Date.parse(previous.createdAt)) latest.set(key, entry);
  }
  const decisions = currentProductionReviewDecisions(aggregate, policy, deliverable.scope, [...latest.values()], at);
  const approval = evaluateReviewApproval(policy, decisions.map((entry) => entry.value === "approve-with-conditions"
    ? { ...entry, value: "request-changes" as const } : entry));
  if (!approval.approved) throw new BadRequestException({ message: "이 제출본의 필수 검수 승인을 완료하세요.", approval });
  const actorPartyIds = new Set(aggregate.parties.filter((party) => party.status === "active" && party.accountUserId === actorUserId).map((party) => party.id));
  const actorAssignmentIds = new Set(active.filter((entry) => actorPartyIds.has(entry.partyId)).map((entry) => entry.id));
  if (!decisions.some((entry) => actorAssignmentIds.has(entry.assignmentId) && entry.value === "approve")) {
    throw new ForbiddenException("이 제출본을 승인한 검수자만 승인을 확정할 수 있습니다.");
  }
}

/** 타인 제출본의 검수 상태는 해당 범위에 배정된 활성 검수자만 변경한다. */
export function assertProductionSubmissionActor(
  aggregate: ProductionProjectAggregate,
  submission: Submission,
  actorUserId: string,
  at: string,
): void {
  const current = aggregate.submissions.find((entry) => entry.id === submission.id);
  if (!current && aggregate.reviewDecisions.some((entry) => entry.reviewRoundId === submission.id)) {
    throw new BadRequestException("새 제출본 ID는 이미 사용한 검수 회차 ID와 겹칠 수 없습니다.");
  }
  if (!current && submission.status !== "submitted") throw new BadRequestException("새 제출본은 제출 상태에서 검수를 시작해야 합니다.");
  if (submission.status === "approved" && current?.status !== "approved") {
    assertProductionSubmissionApproval(aggregate, submission, actorUserId, at);
    return;
  }
  const partyIds = new Set(aggregate.parties.filter((party) => party.status === "active" && party.accountUserId === actorUserId).map((party) => party.id));
  const assignments = activeAssignments(aggregate.assignments, at).filter((entry) => entry.status === "active" && partyIds.has(entry.partyId));
  const deliverable = aggregate.deliverables.find((entry) => entry.id === submission.deliverableId);
  const ownAssignment = assignments.find((entry) => entry.id === submission.submittedByAssignmentId);
  if (ownAssignment) {
    if (!current && deliverable && !scopeContains(ownAssignment.scope, deliverable.scope)) {
      throw new ForbiddenException("새 제출은 산출물 범위를 포함하는 현재 계정의 활성 역할로 등록하세요.");
    }
    return;
  }
  const policy = deliverable && aggregate.reviewPolicies.filter((entry) => scopeContains(entry.scope, deliverable.scope))
    .sort((left, right) => productionScopeDepth(right.scope) - productionScopeDepth(left.scope))[0];
  if (current && deliverable && policy && ["in-review", "changes-requested"].includes(submission.status)
    && assignments.some((assignment) => scopeContains(assignment.scope, deliverable.scope)
      && policy.lanes.some((lane) => lane.eligibleAssignmentIds.includes(assignment.id)))) {
    if (submission.status === "changes-requested" && !aggregate.reviewDecisions.some((entry) =>
      entry.reviewRoundId === submission.id && assignments.some((assignment) => assignment.id === entry.assignmentId)
      && ["request-changes", "veto"].includes(entry.value) && validateReviewDecision(policy, entry).length === 0)) {
      throw new BadRequestException("이 제출본에 수정 요청 결정을 먼저 기록하세요.");
    }
    return;
  }
  throw new ForbiddenException("제출자 또는 이 산출물 범위의 활성 검수자만 상태를 변경할 수 있습니다.");
}

/** 검수 결정은 새 ID로 추가하고 서버 시각을 사용해 이전 거부권을 덮어쓰지 않는다. */
export function applyProductionReviewDecision(
  aggregate: ProductionProjectAggregate,
  policyId: string,
  decision: ReviewDecision,
  actorUserId: string,
  at: string,
) {
  const policy = aggregate.reviewPolicies.find((entry) => entry.id === policyId);
  if (!policy) throw new BadRequestException("검수 정책을 찾을 수 없습니다.");
  if (aggregate.reviewDecisions.some((entry) => entry.id === decision.id)) {
    throw new ConflictException("이미 기록된 검수 결정은 바꿀 수 없습니다. 새 결정 ID로 기록하세요.");
  }
  if (decision.reviewerAccountUserId !== undefined && decision.reviewerAccountUserId !== actorUserId) {
    throw new ForbiddenException("검수 계정 식별자는 현재 로그인 계정과 일치해야 합니다.");
  }
  const submission = aggregate.submissions.find((entry) => entry.id === decision.reviewRoundId);
  const deliverable = submission && aggregate.deliverables.find((entry) => entry.id === submission.deliverableId);
  if (submission && (!deliverable || deliverable.currentSubmissionId !== submission.id || submission.status !== "in-review")) {
    throw new BadRequestException("현재 검수 중인 제출본에만 결정을 기록할 수 있습니다.");
  }
  const scope = deliverable?.scope ?? policy.scope;
  if (!scopeContains(policy.scope, scope)) throw new BadRequestException("검수 정책 범위와 제출본이 일치하지 않습니다.");
  const partyIds = new Set(aggregate.parties.filter((party) => party.status === "active" && party.accountUserId === actorUserId).map((party) => party.id));
  const actor = eligibleProductionReviewAssignments(aggregate, scope, at)
    .some((entry) => entry.id === decision.assignmentId && partyIds.has(entry.partyId));
  if (!actor) throw new ForbiddenException("현재 사용자의 활성 검수 역할과 대상 범위로만 결정을 기록할 수 있습니다.");
  const stored = { ...decision, reviewerAccountUserId: actorUserId, createdAt: at };
  const issues = validateReviewDecision(policy, stored);
  if (issues.length) throw new BadRequestException({ message: "검수 결정을 기록할 수 없습니다.", issues });
  const reviewDecisions = [...aggregate.reviewDecisions, stored];
  return {
    aggregate: { ...aggregate, reviewDecisions },
    derived: { approval: evaluateReviewApproval(policy, currentProductionReviewDecisions(aggregate, policy, scope,
      reviewDecisions.filter((entry) => entry.reviewRoundId === decision.reviewRoundId), at)) },
  };
}
