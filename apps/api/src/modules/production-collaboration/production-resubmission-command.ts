import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { validateProductionWorkflowMutation } from "@toonstudio/contracts/production-workflow";
import {
  isProductionIdentity, isProductionResubmissionEvidenceRef, planProductionReviewResubmission, ProductionResubmissionError,
  type ProductionProjectAggregate, type ProductionTaskOutputCaptures, type Submission,
} from "../../../../../packages/core/src/production";

import { assertProductionSubmissionActor, assertProductionTaskMutationSafety } from "./production-approval-command";
import { ProductionCommandSchema, type ProductionCommand } from "./production-collaboration.dto";
import type { ProductionMutationResponse, ProductionProjectAccess } from "./production-collaboration.repository";

type SingleCommand = Exclude<ProductionCommand, { type: "resubmit-for-review" }>;
type ApplySingle = (
  aggregate: ProductionProjectAggregate, command: SingleCommand, actorUserId: string, at: string,
  captures?: ProductionTaskOutputCaptures,
) => ProductionMutationResponse;

/** 상태를 바꿔도 제출 당시의 컷 선택과 메모는 그대로 남긴다. */
function assertStoredResubmissionEvidence(aggregate: ProductionProjectAggregate, submission: Submission): void {
  const prior = aggregate.submissions.find((entry) => entry.id === submission.id)?.evidenceRefs ?? [];
  const previous = prior.filter(isProductionResubmissionEvidenceRef);
  if (previous.length === 0 && submission.evidenceRefs.every(isProductionIdentity)) return;
  const current = submission.evidenceRefs.filter(isProductionResubmissionEvidenceRef);
  if (previous.length !== current.length || previous.some((value, index) => value !== current[index])) {
    throw new BadRequestException("재제출 근거는 저장된 원본을 유지해야 합니다.");
  }
}

export function applyCheckedProductionMutation(
  aggregate: ProductionProjectAggregate, command: ProductionCommand, actorUserId: string, at: string,
  access: ProductionProjectAccess, apply: ApplySingle, captures?: ProductionTaskOutputCaptures,
): ProductionMutationResponse {
  const applyStep = (before: ProductionProjectAggregate, step: SingleCommand) => {
    const result = apply(before, step, actorUserId, at, captures);
    assertProductionTaskMutationSafety(before, result.aggregate, at);
    const issues = validateProductionWorkflowMutation(before, result.aggregate, at);
    if (issues.length) throw new BadRequestException({ message: "공정 운영 조건을 충족하지 못했습니다.", issues });
    return result;
  };
  if (command.type !== "resubmit-for-review") {
    if (command.type === "upsert-submission") assertStoredResubmissionEvidence(aggregate, command.submission);
    return applyStep(aggregate, command);
  }

  if (!access.edit || !access.comment) throw new ForbiddenException("원고를 편집하고 검수를 요청할 권한이 필요합니다.");
  const previous = aggregate.submissions.find((entry) => entry.id === command.previousSubmissionId);
  if (!previous) throw new BadRequestException("재제출할 원고를 찾을 수 없습니다.");
  assertProductionSubmissionActor(aggregate, { ...previous, status: "superseded" }, actorUserId, at);
  let plan: ReturnType<typeof planProductionReviewResubmission>;
  try {
    plan = planProductionReviewResubmission(aggregate, command, at);
  } catch (error) {
    if (error instanceof ProductionResubmissionError) throw new BadRequestException(error.message);
    throw error;
  }
  // 작업 복귀·제출·검수 재진입 사이의 중간 상태는 같은 저장소 트랜잭션 내부에서만 사용한다.
  let next = aggregate;
  for (const step of plan.commands) {
    const parsed = ProductionCommandSchema.safeParse(step);
    if (!parsed.success || parsed.data.type !== step.type) {
      throw new BadRequestException("재제출 단계의 원고·작업 기록이 저장 형식과 맞지 않습니다.");
    }
    next = applyStep(next, parsed.data).aggregate;
  }
  return { aggregate: next, derived: { submissionId: plan.nextSubmission.id } };
}
