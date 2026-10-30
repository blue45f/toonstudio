import { productionTaskAcceptsOutput, scopeContains, type ProductionProjectAggregate, type ProductionStudioDocumentRole, type ProductionTask,
  type ProductionTaskOutputSelection, type RoleAssignment, type SubmitProductionTaskOutputCommand } from "@toonstudio/core/production";
import type { TaskOutputCapturePages } from "./production-task-output-source";

const DOCUMENT_ROLES: Readonly<Record<ProductionStudioDocumentRole, { readonly ko: string; readonly en: string }>> = {
  story: { ko: "대본", en: "Script" }, thumbnail: { ko: "콘티", en: "Storyboard" }, lineart: { ko: "선화", en: "Line art" },
  background: { ko: "배경", en: "Background" }, color: { ko: "채색", en: "Coloring" }, lettering: { ko: "식자", en: "Lettering" },
  final: { ko: "통합 원고", en: "Integrated manuscript" },
};
export function taskOutputDocumentRoleLabel(role: ProductionStudioDocumentRole, localize: (ko: string, en: string) => string): string {
  const label = DOCUMENT_ROLES[role];
  return localize(label.ko, label.en);
}

/** 표시용 역할 선택이며 원고 편집·검수 결정 권한을 부여하지 않는다. */
export function taskOutputActorAssignments(aggregate: ProductionProjectAggregate, task: ProductionTask, actorId: string | null, at: number): readonly RoleAssignment[] {
  if (!actorId?.trim() || task.projectId !== aggregate.projectId) return [];
  const parties = new Set(aggregate.parties.filter((party) => party.accountUserId === actorId && party.status === "active").map((party) => party.id));
  return aggregate.assignments.filter((assignment) => assignment.projectId === aggregate.projectId && parties.has(assignment.partyId)
    && assignment.status === "active" && Date.parse(assignment.startsAt) <= at
    && (assignment.endsAt === null || Date.parse(assignment.endsAt) > at) && scopeContains(assignment.scope, task.scope));
}

export interface TaskOutputFormDraft {
  readonly assignmentId: string;
  readonly documentRole: ProductionStudioDocumentRole | "";
  readonly targetId: string;
  readonly newType: string;
  readonly newFormat: string;
  readonly criteria: string;
  readonly selectionMode: ProductionTaskOutputSelection["mode"] | "";
  readonly pageIds: readonly string[];
  readonly frameIds: readonly string[];
  readonly inputMode: SubmitProductionTaskOutputCommand["inputs"]["mode"] | "";
}
export function emptyTaskOutputDraft(): TaskOutputFormDraft {
  return { assignmentId: "", documentRole: "", targetId: "", newType: "", newFormat: "", criteria: "",
    selectionMode: "", pageIds: [], frameIds: [], inputMode: "" };
}
export interface TaskOutputFormIds { readonly submissionId: string; readonly deliverableId: string }

/** 클라이언트는 선택 ID만 보낸다. digest·capture 영수증·sourceEvidence는 서버가 다시 검증한다. */
export function buildTaskOutputCommand({ aggregate, task, actorId, draft, source, initialSource, ids, at }: {
  readonly aggregate: ProductionProjectAggregate; readonly task: ProductionTask; readonly actorId: string | null;
  readonly draft: TaskOutputFormDraft; readonly source: TaskOutputCapturePages | null; readonly initialSource: TaskOutputCapturePages | null;
  readonly ids: TaskOutputFormIds; readonly at: number;
}): SubmitProductionTaskOutputCommand {
  if (!productionTaskAcceptsOutput(task)) throw new Error("이 상태의 작업에는 새 원고를 제출할 수 없습니다. 허용되는 변경 요청으로 작업 상태를 전환하거나 후속 작업을 만드세요.");
  if (!taskOutputActorAssignments(aggregate, task, actorId, at).some((assignment) => assignment.id === draft.assignmentId)) throw new Error("현재 계정에 연결된 유효한 제출 역할을 선택하세요.");
  if (!source || source.choice.subject.workId !== aggregate.workId || !draft.documentRole || !draft.selectionMode || !draft.inputMode) throw new Error("문서 역할·저장 원고·사용 범위·고정 입력을 모두 선택하세요.");
  let selection: ProductionTaskOutputSelection;
  if (draft.selectionMode === "document") selection = { mode: "document" };
  else if (draft.selectionMode === "pages") {
    const pages = source.pages.filter((page) => draft.pageIds.includes(page.pageId));
    if (!pages.length || pages.length !== new Set(draft.pageIds).size) throw new Error("실제 저장 원고의 페이지를 선택하세요.");
    selection = { mode: "pages", pages: pages.map(({ pageId, ordinal }) => ({ pageId, ordinal })) };
  } else {
    const selected = new Set(draft.frameIds);
    const pages = source.pages.flatMap((page) => {
      const frameIds = page.frameIds.filter((frameId) => selected.has(JSON.stringify([page.pageId, frameId])));
      return frameIds.length ? [{ pageId: page.pageId, ordinal: page.ordinal, frameIds }] : [];
    });
    if (!selected.size || pages.reduce((count, page) => count + page.frameIds.length, 0) !== selected.size) throw new Error("실제 저장 원고의 프레임을 선택하세요.");
    selection = { mode: "frames", pages };
  }
  const inputs: SubmitProductionTaskOutputCommand["inputs"] = draft.inputMode === "initial-capture"
    ? (() => {
      if (!initialSource || initialSource.choice.subject.workId !== aggregate.workId || task.inputRevisionRefs.length || task.outputDeliverableIds.length || task.dependencyTaskIds.length) throw new Error("입력·산출물·선행 작업이 없는 첫 작업의 입력 원고를 별도로 선택하세요.");
      return { mode: "initial-capture" as const, source: { subject: initialSource.choice.subject } };
    })() : { mode: draft.inputMode };
  if ((inputs.mode === "current" && !task.inputRevisionRefs.length)
    || (inputs.mode === "approved-dependencies" && !task.dependencyTaskIds.length)) throw new Error("현재 고정 입력이나 승인된 선행 작업을 확인하세요.");
  const criteria = draft.criteria.split("\n").map((value) => value.trim()).filter(Boolean);
  let target: SubmitProductionTaskOutputCommand["target"];
  if (draft.targetId === "new") {
    if (!draft.newType.trim() || draft.newType.trim().length > 120 || !draft.newFormat.trim() || draft.newFormat.trim().length > 240
      || !criteria.length || criteria.length > 1000 || criteria.some((criterion) => criterion.length > 4000)) throw new Error("새 산출물의 종류·형식과 완료 기준을 입력하세요.");
    target = { kind: "create", deliverableId: ids.deliverableId, type: draft.newType.trim(), expectedFormat: draft.newFormat.trim(), completionCriteria: criteria };
  } else {
    if (!task.outputDeliverableIds.includes(draft.targetId) || !aggregate.deliverables.some((deliverable) => deliverable.id === draft.targetId && deliverable.projectId === aggregate.projectId)) throw new Error("이 작업에 연결된 산출물을 선택하세요.");
    target = { kind: "existing", deliverableId: draft.targetId };
  }
  return { type: "submit-task-output", taskId: task.id, submissionId: ids.submissionId,
    submittedByAssignmentId: draft.assignmentId, documentRole: draft.documentRole,
    source: { subject: source.choice.subject }, selection, inputs, target };
}
