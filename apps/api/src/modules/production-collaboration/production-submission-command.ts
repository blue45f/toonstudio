import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { isDeepStrictEqual } from "node:util";

import {
  activeAssignments,
  applyProductionStudioRevisionLink,
  applyProductionSubmissionReviewToTasks,
  applyProductionTaskOutput,
  applySubmissionToDeliverable,
  evaluateProductionStudioRevisionCoverage,
  ProductionTaskOutputError,
  scopeContains,
  validateDeliverable,
  validateProductionStudioRevisionLink,
  validateSubmission,
  type Deliverable,
  type ProductionProjectAggregate,
  type ProductionStudioRevisionLink,
  type ProductionTaskOutputCaptures,
  type RevisionRef,
  type Submission,
  type SubmitProductionTaskOutputCommand,
} from "../../../../../packages/core/src/production";
import { assertProductionSubmissionActor } from "./production-approval-command";
import type { ProductionMutationResponse } from "./production-collaboration.repository";

type SubmissionCommand =
  | { readonly type: "upsert-deliverable"; readonly deliverable: Deliverable }
  | { readonly type: "upsert-submission"; readonly submission: Submission }
  | { readonly type: "upsert-studio-revision-link"; readonly link: ProductionStudioRevisionLink }
  | SubmitProductionTaskOutputCommand;

function upsertById<T extends { readonly id: string }>(values: readonly T[], value: T): readonly T[] {
  const index = values.findIndex((entry) => entry.id === value.id);
  return Object.freeze(index < 0 ? [...values, value]
    : values.map((entry, currentIndex) => currentIndex === index ? value : entry));
}

function assertProjectIdentity(aggregate: ProductionProjectAggregate, projectId: string): void {
  if (projectId !== aggregate.projectId) {
    throw new BadRequestException("명령의 프로젝트 식별자가 현재 프로젝트와 일치하지 않습니다.");
  }
}

/** 이전 클라이언트의 상태 변경은 서버 근거를 보존하고, 클라이언트의 새 근거 주장은 받지 않는다. */
function preserveSourceEvidence(submission: Submission, current: Submission | null): Submission {
  if (submission.sourceEvidence !== undefined
    && (!current?.sourceEvidence || !isDeepStrictEqual(submission.sourceEvidence, current.sourceEvidence))) {
    throw new BadRequestException({
      message: "원고 사용 근거는 검증된 작업 제출 명령으로만 기록할 수 있습니다.",
      issues: ["submission-source-evidence-server-managed"],
    });
  }
  const withEvidence = current?.sourceEvidence && submission.sourceEvidence === undefined
    ? { ...submission, sourceEvidence: current.sourceEvidence }
    : submission;
  if (submission.revisionRef.productionSubmissionId !== undefined
    && submission.revisionRef.productionSubmissionId !== current?.revisionRef.productionSubmissionId) {
    throw new BadRequestException("제출 revision의 귀속 식별자는 서버가 기록한 값을 바꿀 수 없습니다.");
  }
  if (!current?.sourceEvidence) return withEvidence;
  return {
    ...withEvidence,
    revisionRef: preserveRevisionSubmissionId(submission.revisionRef, current.revisionRef),
    inputRevisionRefs: submission.inputRevisionRefs.length === current.inputRevisionRefs.length
      ? submission.inputRevisionRefs.map((ref, index) => {
          const previous = current.inputRevisionRefs[index];
          return previous ? preserveRevisionSubmissionId(ref, previous) : ref;
        })
      : submission.inputRevisionRefs,
  };
}

/** 기존 다섯 필드가 같은 상태 저장에 한해 누락된 서버 귀속 ID만 보존한다. */
function preserveRevisionSubmissionId(next: RevisionRef, current: RevisionRef): RevisionRef {
  if (next.productionSubmissionId === undefined && current.productionSubmissionId !== undefined
    && next.id === current.id && next.lineage === current.lineage && next.revision === current.revision
    && next.digest === current.digest && next.createdAt === current.createdAt) {
    return { ...next, productionSubmissionId: current.productionSubmissionId };
  }
  return next;
}

export function applyProductionSubmissionCommand(
  aggregate: ProductionProjectAggregate,
  command: SubmissionCommand,
  actorUserId: string,
  at: string,
  taskOutputCaptures?: ProductionTaskOutputCaptures,
): ProductionMutationResponse {
  switch (command.type) {
    case "upsert-deliverable": {
      assertProjectIdentity(aggregate, command.deliverable.projectId);
      const current = aggregate.deliverables.find((entry) => entry.id === command.deliverable.id) ?? null;
      const issues = [...validateDeliverable(command.deliverable, aggregate.projectId, current)];
      if (current?.approvedSubmissionId && (
        current.scope.kind !== command.deliverable.scope.kind
        || current.scope.id !== command.deliverable.scope.id
        || current.type !== command.deliverable.type
        || current.expectedFormat !== command.deliverable.expectedFormat
      )) issues.push("approved-deliverable-contract-mutated");
      if (issues.length) throw new BadRequestException({ message: "산출물 정의를 저장할 수 없습니다.", issues });
      return { aggregate: { ...aggregate, deliverables: upsertById(aggregate.deliverables, command.deliverable) } };
    }
    case "upsert-submission": {
      assertProjectIdentity(aggregate, command.submission.projectId);
      const deliverable = aggregate.deliverables.find((entry) => entry.id === command.submission.deliverableId) ?? null;
      const current = aggregate.submissions.find((entry) => entry.id === command.submission.id) ?? null;
      const submission = preserveSourceEvidence(command.submission, current);
      assertProductionSubmissionActor(aggregate, submission, actorUserId, at);
      const issues = validateSubmission({
        submission, current, deliverable,
        activeAssignmentIds: aggregate.assignments.filter((entry) => entry.status === "active").map((entry) => entry.id),
      });
      if (issues.length) throw new BadRequestException({ message: "제출본을 저장할 수 없습니다.", issues });
      if (!deliverable) throw new BadRequestException("제출본의 산출물을 찾을 수 없습니다.");
      return {
        aggregate: applyProductionSubmissionReviewToTasks({
          ...aggregate,
          submissions: upsertById(aggregate.submissions, submission),
          deliverables: upsertById(aggregate.deliverables, applySubmissionToDeliverable(deliverable, submission)),
        }, submission, at),
      };
    }
    case "upsert-studio-revision-link": {
      assertProjectIdentity(aggregate, command.link.projectId);
      const partyIds = new Set(aggregate.parties.filter((entry) => entry.accountUserId === actorUserId && entry.status === "active")
        .map((entry) => entry.id));
      const assignment = activeAssignments(aggregate.assignments, at).find((entry) => entry.id === command.link.linkedByAssignmentId
        && entry.status === "active" && entry.projectId === aggregate.projectId);
      const deliverable = aggregate.deliverables.find((entry) => entry.id === command.link.deliverableId);
      if (!assignment || !partyIds.has(assignment.partyId)
        || (deliverable && !scopeContains(assignment.scope, deliverable.scope))) {
        throw new ForbiddenException("현재 사용자의 활동 기간과 산출물 범위에 맞는 활성 역할로만 원고를 연결할 수 있습니다.");
      }
      const issues = validateProductionStudioRevisionLink({ aggregate, link: command.link });
      if (issues.length) throw new BadRequestException({ message: "Studio 원고 revision을 제작 산출물에 연결할 수 없습니다.", issues });
      const next = applyProductionStudioRevisionLink(aggregate, command.link);
      return {
        aggregate: next,
        derived: command.link.episodeId
          ? { coverage: evaluateProductionStudioRevisionCoverage(next, command.link.episodeId) }
          : undefined,
      };
    }
    case "submit-task-output": {
      if (!taskOutputCaptures) throw new BadRequestException("서버가 검증한 원고 제출 근거가 필요합니다.");
      try {
        const result = applyProductionTaskOutput(aggregate, command, actorUserId, at, taskOutputCaptures);
        return { aggregate: result.aggregate, derived: { deliverableId: result.deliverableId, submissionId: result.submissionId } };
      } catch (error) {
        if (!(error instanceof ProductionTaskOutputError)) throw error;
        if (error.code === "forbidden") throw new ForbiddenException(error.message);
        if (error.code === "duplicate-id") throw new ConflictException(error.message);
        throw new BadRequestException(error.message);
      }
    }
  }
}
