import { productionRevisionKey, sameProductionRevision } from "./revision";
import { isProductionIdentity, projectScope, scopeContains } from "./scope";
import { productionStudioDocumentRoleLineage } from "./studio-revision";
import { productionTaskOutputRevision } from "./task-output-contract";
import { applySubmissionToDeliverable, validateDeliverable, validateSubmission } from "./versioning";
import { productionTaskHasCurrentApprovedOutputs, productionTaskHasCurrentDependencyInputs } from "./workflow";

import type {
  ProductionTaskOutputCaptures, ProductionTaskOutputEvidence, ProductionTaskOutputPageEvidence,
  ProductionTaskOutputSelection, ProductionTaskOutputSubject, SubmitProductionTaskOutputCommand,
  VerifiedProductionTaskOutputCapture,
} from "./task-output-contract";
import type { Deliverable, ProductionProjectAggregate, ProductionTask, RevisionRef, ScopeRef, Submission } from "./types";

export class ProductionTaskOutputError extends Error {
  constructor(readonly code: "forbidden" | "invalid-output" | "invalid-inputs" | "duplicate-id" | "closed-task") {
    super({ forbidden: "현재 계정의 담당 역할과 작업 범위를 확인해 주세요. 배정 기간이 끝났다면 제작 관리자에게 다시 배정을 요청하세요.",
      "invalid-output": "제출할 작업·산출물과 저장된 검수 원고의 페이지·컷 선택을 다시 확인해 주세요.",
      "invalid-inputs": "이 작업의 기준 원고를 고정해 주세요. 선행 공정이 있다면 현재 승인된 산출물을 입력으로 다시 선택하세요.",
      "duplicate-id": "이미 사용한 제출 또는 산출물입니다. 작업 상태를 새로 확인한 뒤 새 제출로 다시 진행해 주세요.",
      "closed-task": "승인·완료·취소·범위 밖 작업에는 새 제출을 등록할 수 없습니다. 변경 요청으로 작업 가능한 상태로 전환하거나 후속 작업을 생성하세요.",
    }[code]);
  }
}
function fail(code: ProductionTaskOutputError["code"]): never { throw new ProductionTaskOutputError(code); }
const HASH = /^[a-f0-9]{64}$/u;
const REVISION_DIGEST = /^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$/u;
const STUDIO_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const positiveRevision = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;

/** 확정·종료된 작업의 상태를 숨겨서 바꾸거나 승인 포인터만 해제하지 않는다. */
export function productionTaskAcceptsOutput(task: Pick<ProductionTask, "status">): boolean {
  return !["conditionally-approved", "approved", "done", "cancelled", "out-of-scope"].includes(task.status);
}

function sameSubject(left: ProductionTaskOutputSubject, right: ProductionTaskOutputSubject): boolean {
  return left.schemaVersion === right.schemaVersion && left.workId === right.workId && left.projectId === right.projectId
    && left.artifactId === right.artifactId && left.reviewId === right.reviewId && left.revisionId === right.revisionId
    && left.rootGraphHash === right.rootGraphHash;
}

function snapshotScope(scope: ScopeRef): ScopeRef {
  return Object.freeze({ kind: scope.kind, id: scope.id,
    ancestors: Object.freeze(scope.ancestors.map((ancestor) => Object.freeze({ ...ancestor }))) });
}

function validateCapture(capture: VerifiedProductionTaskOutputCapture, expected: ProductionTaskOutputSubject, workId: string): void {
  const subject = capture.subject;
  if (!sameSubject(subject, expected) || subject.schemaVersion !== 1 || subject.workId !== workId
    || !HASH.test(subject.rootGraphHash) || !positiveRevision(capture.sourceServerRevision)
    || !Number.isSafeInteger(capture.captureSequence) || capture.captureSequence < 1
    || !Number.isFinite(Date.parse(capture.createdAt)) || capture.pages.length < 1 || capture.pages.length > 100_000) fail("invalid-output");
  if ([subject.workId, subject.projectId, subject.artifactId, subject.reviewId, subject.revisionId]
    .some((value) => !STUDIO_ID.test(value))) fail("invalid-output");
  const ids = new Set<string>(), ordinals = new Set<number>();
  for (const page of capture.pages) {
    if (!STUDIO_ID.test(page.pageId) || !Number.isSafeInteger(page.ordinal) || page.ordinal < 0 || page.ordinal > 99_999
      || !HASH.test(page.sha256) || ids.has(page.pageId) || ordinals.has(page.ordinal)
      || new Set(page.frameIds).size !== page.frameIds.length || page.frameIds.some((id) => !STUDIO_ID.test(id))) fail("invalid-output");
    ids.add(page.pageId); ordinals.add(page.ordinal);
  }
}

function selectedPages(capture: VerifiedProductionTaskOutputCapture, selection: ProductionTaskOutputSelection): readonly ProductionTaskOutputPageEvidence[] {
  const byOrdinal = new Map(capture.pages.map((page) => [page.ordinal, page]));
  const selected = new Map<number, { pageId: string; frameIds: readonly string[] }>();
  if (selection.mode === "document") {
    for (const page of capture.pages) selected.set(page.ordinal, { pageId: page.pageId, frameIds: [] });
  } else {
    if (!selection.pages.length) fail("invalid-output");
    for (const requested of selection.pages) {
      const page = byOrdinal.get(requested.ordinal);
      if (!page || page.pageId !== requested.pageId || selected.has(requested.ordinal)) fail("invalid-output");
      const frames = selection.mode === "frames" && "frameIds" in requested ? requested.frameIds : [];
      const allowed = new Set(page.frameIds), chosen = new Set(frames);
      if (selection.mode === "frames" && (!frames.length || chosen.size !== frames.length
        || frames.some((id) => !allowed.has(id)))) fail("invalid-output");
      selected.set(page.ordinal, { pageId: page.pageId, frameIds: page.frameIds.filter((id) => chosen.has(id)) });
    }
  }
  return Object.freeze([...capture.pages].sort((left, right) => left.ordinal - right.ordinal).flatMap((page) => {
    const chosen = selected.get(page.ordinal);
    return chosen ? [Object.freeze({ pageId: page.pageId, ordinal: page.ordinal, sha256: page.sha256,
      frameIds: Object.freeze([...chosen.frameIds]) })] : [];
  }));
}

function pinnedInputs(aggregate: ProductionProjectAggregate, task: ProductionTask,
  command: SubmitProductionTaskOutputCommand, captures: ProductionTaskOutputCaptures): readonly RevisionRef[] {
  let inputs: readonly RevisionRef[] = task.inputRevisionRefs;
  if (command.inputs.mode === "initial-capture") {
    if (task.dependencyTaskIds.length || task.outputDeliverableIds.length || inputs.length || !captures.initial) fail("invalid-inputs");
    validateCapture(captures.initial, command.inputs.source.subject, aggregate.workId);
    inputs = [productionTaskOutputRevision(captures.initial, "integrated")];
  } else if (command.inputs.mode === "approved-dependencies") {
    if (!task.dependencyTaskIds.length || new Set(task.dependencyTaskIds).size !== task.dependencyTaskIds.length) fail("invalid-inputs");
    const historical = new Set<string>(), currentKeys = new Set<string>(), current: RevisionRef[] = [];
    for (const id of task.dependencyTaskIds) {
      const dependencies = aggregate.tasks.filter((entry) => entry.id === id && entry.projectId === aggregate.projectId);
      const dependency = dependencies[0];
      if (dependencies.length !== 1 || !dependency || !["approved", "done"].includes(dependency.status)
        || !productionTaskHasCurrentApprovedOutputs(dependency, aggregate)) fail("invalid-inputs");
      for (const deliverableId of dependency.outputDeliverableIds) {
        const deliverable = aggregate.deliverables.find((entry) => entry.id === deliverableId && entry.projectId === aggregate.projectId);
        const submission = aggregate.submissions.find((entry) => entry.id === deliverable?.approvedSubmissionId
          && entry.deliverableId === deliverableId && entry.projectId === aggregate.projectId);
        if (!submission || submission.status !== "approved") fail("invalid-inputs");
        for (const prior of aggregate.submissions.filter((entry) => entry.deliverableId === deliverableId && entry.projectId === aggregate.projectId)) {
          historical.add(productionRevisionKey(prior.revisionRef));
        }
        const key = productionRevisionKey(submission.revisionRef);
        if (!currentKeys.has(key)) { currentKeys.add(key); current.push(submission.revisionRef); }
      }
    }
    inputs = [...inputs.filter((entry) => !historical.has(productionRevisionKey(entry))), ...current];
  }
  if (!inputs.length || inputs.some((ref) => !positiveRevision(ref.revision) || !REVISION_DIGEST.test(ref.digest)
    || !["narrative", "visual", "integrated"].includes(ref.lineage)
    || (ref.productionSubmissionId !== undefined && !isProductionIdentity(ref.productionSubmissionId))
    || !ref.id.trim() || !Number.isFinite(Date.parse(ref.createdAt)))
    || !productionTaskHasCurrentDependencyInputs({ ...task, inputRevisionRefs: inputs }, aggregate)) fail("invalid-inputs");
  const boundIds = new Set(inputs.flatMap((ref) => ref.productionSubmissionId ? [ref.productionSubmissionId] : []));
  const bound = new Map<string, Submission | null>();
  for (const submission of aggregate.submissions) {
    if (boundIds.has(submission.id)) bound.set(submission.id, bound.has(submission.id) ? null : submission);
  }
  for (const ref of inputs) {
    if (ref.productionSubmissionId === undefined) continue;
    const submission = bound.get(ref.productionSubmissionId);
    if (!submission || submission.projectId !== aggregate.projectId || !sameProductionRevision(ref, submission.revisionRef)) fail("invalid-inputs");
  }
  return Object.freeze(inputs.map((ref) => Object.freeze({ ...ref })));
}

function targetDeliverable(aggregate: ProductionProjectAggregate, task: ProductionTask,
  command: SubmitProductionTaskOutputCommand): Deliverable {
  const target = command.target;
  if (!isProductionIdentity(target.deliverableId)) fail("invalid-output");
  const matches = aggregate.deliverables.filter((entry) => entry.id === target.deliverableId);
  if (target.kind === "existing") {
    const current = matches[0];
    if (matches.length !== 1 || !current || current.projectId !== aggregate.projectId
      || !task.outputDeliverableIds.includes(current.id) || !scopeContains(projectScope(aggregate.projectId), current.scope)
      || !scopeContains(task.scope, current.scope)) fail("invalid-output");
    const roles = new Set(aggregate.submissions.flatMap((submission) => submission.projectId === aggregate.projectId
      && submission.deliverableId === current.id && submission.sourceEvidence?.version === 1
      ? [submission.sourceEvidence.documentRole] : []));
    if (roles.size > 1 || (roles.size === 1 && !roles.has(command.documentRole))) fail("invalid-output");
    if (validateDeliverable(current, aggregate.projectId).length) fail("invalid-output");
    if (current.currentSubmissionId) {
      const submissions = aggregate.submissions.filter((entry) => entry.id === current.currentSubmissionId);
      if (submissions.length !== 1 || submissions[0]?.projectId !== aggregate.projectId
        || submissions[0]?.deliverableId !== current.id || submissions[0]?.status === "superseded") fail("invalid-output");
    }
    return current;
  }
  if (matches.length || aggregate.tasks.some((entry) => entry.outputDeliverableIds.includes(target.deliverableId))) fail("duplicate-id");
  const created: Deliverable = Object.freeze({ id: target.deliverableId, projectId: aggregate.projectId,
    scope: snapshotScope(task.scope), type: target.type, expectedFormat: target.expectedFormat,
    completionCriteria: Object.freeze([...target.completionCriteria]), currentSubmissionId: null, approvedSubmissionId: null });
  if (validateDeliverable(created, aggregate.projectId, null).length || created.completionCriteria.some((criterion) => !criterion.trim())) fail("invalid-output");
  return created;
}

/** 원본 aggregate를 바꾸지 않고 고정 원고·입력·새 제출·출력 포인터를 한 결과로 만든다. */
export function applyProductionTaskOutput(aggregate: ProductionProjectAggregate, command: SubmitProductionTaskOutputCommand,
  actorUserId: string, at: string, captures: ProductionTaskOutputCaptures): {
    readonly aggregate: ProductionProjectAggregate; readonly deliverableId: string; readonly submissionId: string;
  } {
  const tasks = aggregate.tasks.filter((entry) => entry.id === command.taskId);
  const task = tasks[0], instant = Date.parse(at);
  if (tasks.length !== 1 || !task || task.projectId !== aggregate.projectId || !Number.isFinite(instant)
    || !scopeContains(projectScope(aggregate.projectId), task.scope)) fail("invalid-output");
  const assignments = aggregate.assignments.filter((entry) => entry.id === command.submittedByAssignmentId);
  const assignment = assignments[0];
  const party = assignment ? aggregate.parties.find((entry) => entry.id === assignment.partyId) : undefined;
  if (!actorUserId.trim() || assignments.length !== 1 || !assignment || !party || party.status !== "active"
    || party.accountUserId !== actorUserId || assignment.status !== "active" || assignment.projectId !== aggregate.projectId
    || !Number.isFinite(Date.parse(assignment.startsAt)) || Date.parse(assignment.startsAt) > instant
    || (assignment.endsAt !== null && (!Number.isFinite(Date.parse(assignment.endsAt)) || Date.parse(assignment.endsAt) <= instant))
    || !scopeContains(projectScope(aggregate.projectId), assignment.scope) || !scopeContains(assignment.scope, task.scope)) fail("forbidden");
  if (!productionTaskAcceptsOutput(task)) fail("closed-task");
  if (!isProductionIdentity(command.submissionId)) fail("invalid-output");
  if (aggregate.submissions.some((entry) => entry.id === command.submissionId)
    || aggregate.reviewDecisions.some((entry) => entry.reviewRoundId === command.submissionId)) fail("duplicate-id");
  const deliverable = targetDeliverable(aggregate, task, command);
  if (!scopeContains(assignment.scope, deliverable.scope)) fail("forbidden");
  validateCapture(captures.output, command.source.subject, aggregate.workId);
  const lineage = productionStudioDocumentRoleLineage(command.documentRole);
  if (!lineage) fail("invalid-output");
  const pages = selectedPages(captures.output, command.selection);
  const inputs = pinnedInputs(aggregate, task, command, captures);
  const evidence: ProductionTaskOutputEvidence = Object.freeze({ version: 1, kind: "studio-review-capture", taskId: task.id,
    scope: snapshotScope(deliverable.scope), documentRole: command.documentRole,
    subject: Object.freeze({ ...captures.output.subject }), sourceServerRevision: captures.output.sourceServerRevision,
    captureSequence: captures.output.captureSequence, selectionMode: command.selection.mode, pages });
  const submission: Submission = Object.freeze({ id: command.submissionId, projectId: aggregate.projectId, deliverableId: deliverable.id,
    revisionRef: Object.freeze({ ...productionTaskOutputRevision(captures.output, lineage), productionSubmissionId: command.submissionId }), submittedByAssignmentId: assignment.id,
    submittedAt: at, status: "submitted", inputRevisionRefs: inputs, evidenceRefs: Object.freeze([]), sourceEvidence: evidence });
  if (validateSubmission({ submission, deliverable, activeAssignmentIds: [assignment.id], allowSourceEvidence: true }).length) fail("invalid-output");
  const updated = applySubmissionToDeliverable(deliverable, submission);
  const nextTask = Object.freeze({ ...task, inputRevisionRefs: inputs,
    outputDeliverableIds: Object.freeze(task.outputDeliverableIds.includes(deliverable.id)
      ? [...task.outputDeliverableIds] : [...task.outputDeliverableIds, deliverable.id]) });
  return Object.freeze({ deliverableId: deliverable.id, submissionId: submission.id, aggregate: Object.freeze({ ...aggregate,
    tasks: Object.freeze(aggregate.tasks.map((entry) => entry.id === task.id ? nextTask : entry)),
    deliverables: Object.freeze(command.target.kind === "create" ? [...aggregate.deliverables, updated]
      : aggregate.deliverables.map((entry) => entry.id === deliverable.id ? updated : entry)),
    submissions: Object.freeze([...aggregate.submissions, submission]),
  }) });
}
