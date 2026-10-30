import { canonicalJson } from "@toonstudio/studio-project-model";
import { productionRevisionKey, productionStudioDocumentRoleLineage, productionTaskHasCurrentApprovedOutputs, sameProductionRevision,
  type ProductionProjectAggregate, type ProductionTask, type ProductionTaskOutputEvidence, type RevisionRef,
  type ScopeRef, type SubmitProductionTaskOutputCommand } from "@toonstudio/core/production";
import type { TaskOutputCapturePages } from "./production-task-output-source";

export interface TaskOutputSaveExpectation {
  readonly projectId: string;
  readonly workId: string;
  readonly revision: number;
  readonly command: SubmitProductionTaskOutputCommand;
  readonly scope: ScopeRef;
  readonly evidence: ProductionTaskOutputEvidence;
  readonly revisionRef: RevisionRef;
  readonly inputRevisionRefs: readonly RevisionRef[];
}
const sameRefs = (left: readonly RevisionRef[], right: readonly RevisionRef[]) => left.length === right.length
  && left.every((ref, index) => { const other = right[index]; return Boolean(other && sameProductionRevision(ref, other) && ref.createdAt === other.createdAt); });

/** 표시한 입력을 고정한다. 모호한 결과는 성공 처리하지 않으며 서버의 권한·원고 증명을 대신하지 않는다. */
function expectedInputs(aggregate: ProductionProjectAggregate, task: ProductionTask, command: SubmitProductionTaskOutputCommand,
  initial: TaskOutputCapturePages | null): readonly RevisionRef[] | null {
  if (command.inputs.mode === "current") return task.inputRevisionRefs;
  if (command.inputs.mode === "initial-capture") {
    if (!initial || task.inputRevisionRefs.length || task.outputDeliverableIds.length || task.dependencyTaskIds.length
      || canonicalJson(initial.choice.subject) !== canonicalJson(command.inputs.source.subject)) return null;
    return [{ id: initial.choice.subject.revisionId, lineage: "integrated", revision: initial.sourceServerRevision,
      digest: `sha256:${initial.choice.subject.rootGraphHash}`, createdAt: initial.choice.revision.createdAt }];
  }
  if (!task.dependencyTaskIds.length || new Set(task.dependencyTaskIds).size !== task.dependencyTaskIds.length) return null;
  const historical = new Set<string>(), currentKeys = new Set<string>(), current: RevisionRef[] = [];
  for (const id of task.dependencyTaskIds) {
    const dependencies = aggregate.tasks.filter((item) => item.id === id), dependency = dependencies[0];
    if (dependencies.length !== 1 || !dependency || dependency.projectId !== aggregate.projectId || !["approved", "done"].includes(dependency.status)
      || !productionTaskHasCurrentApprovedOutputs(dependency, aggregate)) return null;
    for (const deliverableId of dependency.outputDeliverableIds) {
      const deliverable = aggregate.deliverables.find((item) => item.id === deliverableId && item.projectId === aggregate.projectId);
      const submission = aggregate.submissions.find((item) => item.id === deliverable?.approvedSubmissionId
        && item.deliverableId === deliverableId && item.projectId === aggregate.projectId);
      if (!submission || submission.status !== "approved") return null;
      for (const prior of aggregate.submissions.filter((item) => item.deliverableId === deliverableId && item.projectId === aggregate.projectId)) {
        historical.add(productionRevisionKey(prior.revisionRef));
      }
      const key = productionRevisionKey(submission.revisionRef);
      if (!currentKeys.has(key)) { currentKeys.add(key); current.push(submission.revisionRef); }
    }
  }
  return [...task.inputRevisionRefs.filter((ref) => !historical.has(productionRevisionKey(ref))), ...current];
}

/** 원래 선택과 실제 서버 응답을 대조하기 위한 로컬 기대값이다. 새 sourceEvidence를 서버로 보내지 않는다. */
export function createTaskOutputSaveExpectation(aggregate: ProductionProjectAggregate, task: ProductionTask,
  command: SubmitProductionTaskOutputCommand, source: TaskOutputCapturePages | null, initial: TaskOutputCapturePages | null): TaskOutputSaveExpectation | null {
  if (!source || canonicalJson(source.choice.subject) !== canonicalJson(command.source.subject)
    || aggregate.submissions.some((submission) => submission.id === command.submissionId)) return null;
  const sequence = source.choice.revision.operationLast;
  if (sequence === null || !Number.isSafeInteger(sequence) || sequence < 1 || source.choice.revision.operationFirst !== sequence) return null;
  const inputs = expectedInputs(aggregate, task, command, initial);
  if (!inputs?.length) return null;
  const existing = command.target.kind === "existing" ? aggregate.deliverables.find((item) => item.id === command.target.deliverableId) : null;
  if (command.target.kind === "existing" && !existing) return null;
  const scope = existing?.scope ?? task.scope;
  const selection = command.selection;
  const selected = selection.mode === "document" ? null : new Map<number, { readonly ordinal: number; readonly pageId: string; readonly frameIds?: readonly string[] }>(selection.pages.map((page) => [page.ordinal, page] as const));
  const pages = source.pages.flatMap((page) => {
    const requested = selected?.get(page.ordinal);
    if (selected && (!requested || requested.pageId !== page.pageId)) return [];
    const frames = selection.mode === "frames" ? new Set(requested?.frameIds ?? []) : new Set<string>();
    return [{ pageId: page.pageId, ordinal: page.ordinal, sha256: page.sha256, frameIds: page.frameIds.filter((id) => frames.has(id)) }];
  }).sort((left, right) => left.ordinal - right.ordinal);
  if (!pages.length || (selected && selected.size !== pages.length)) return null;
  const expected: TaskOutputSaveExpectation = { projectId: aggregate.projectId, workId: aggregate.workId, revision: aggregate.revision, command, scope,
    evidence: { version: 1, kind: "studio-review-capture", taskId: task.id, scope, documentRole: command.documentRole,
      subject: source.choice.subject, sourceServerRevision: source.sourceServerRevision, captureSequence: sequence, selectionMode: selection.mode, pages },
    revisionRef: { id: source.choice.subject.revisionId, lineage: productionStudioDocumentRoleLineage(command.documentRole),
      revision: source.sourceServerRevision, digest: `sha256:${source.choice.subject.rootGraphHash}`,
      createdAt: source.choice.revision.createdAt, productionSubmissionId: command.submissionId }, inputRevisionRefs: inputs };
  return structuredClone(expected);
}

/** 같은 ID만으로 성공 처리하지 않고 입력·선택 원고·작업 연결이 일치하는 실제 저장 결과를 확인한다. */
export function hasConfirmedTaskOutputSave(aggregate: ProductionProjectAggregate, expected: TaskOutputSaveExpectation): boolean {
  const { command } = expected;
  if (aggregate.projectId !== expected.projectId || aggregate.workId !== expected.workId || aggregate.revision <= expected.revision) return false;
  const submissions = aggregate.submissions.filter((item) => item.id === command.submissionId), submission = submissions[0];
  const tasks = aggregate.tasks.filter((item) => item.id === command.taskId), task = tasks[0];
  const deliverables = aggregate.deliverables.filter((item) => item.id === command.target.deliverableId), deliverable = deliverables[0];
  if (submissions.length !== 1 || !submission || submission.projectId !== expected.projectId
    || submission.deliverableId !== command.target.deliverableId || submission.submittedByAssignmentId !== command.submittedByAssignmentId
    || !sameProductionRevision(submission.revisionRef, expected.revisionRef) || submission.revisionRef.createdAt !== expected.revisionRef.createdAt
    || !sameRefs(submission.inputRevisionRefs, expected.inputRevisionRefs) || canonicalJson(submission.sourceEvidence) !== canonicalJson(expected.evidence)
    || !Number.isFinite(Date.parse(submission.submittedAt)) || tasks.length !== 1 || !task || task.projectId !== expected.projectId
    || !task.outputDeliverableIds.includes(command.target.deliverableId) || deliverables.length !== 1 || !deliverable
    || deliverable.projectId !== expected.projectId || canonicalJson(deliverable.scope) !== canonicalJson(expected.scope)) return false;
  return command.target.kind !== "create" || (deliverable.type === command.target.type && deliverable.expectedFormat === command.target.expectedFormat
    && canonicalJson(deliverable.completionCriteria) === canonicalJson(command.target.completionCriteria));
}
