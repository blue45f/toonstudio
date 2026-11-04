import type { StudioScopedWriteContext, StudioScopedWriteTarget } from "@toonstudio/contracts/studio-scoped-write";
import type { ProductionTaskOutputCaptures, SubmitProductionTaskOutputCommand } from "@toonstudio/core/production";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { studioReviewCaptureFromOperation, studioReviewResolutionCaptureFromRows, studioReviewResolutionCaptureQuery } from "../studio-project-graph/studio-review-capture-attestation";
import { projectStudioScopedAuthoringDocument, scopedEntityKey, scopedRecord, StudioScopedWriteDeniedError, validateStudioScopedWriteTarget } from "./studio-scoped-write-effects";
import { authorizeStudioScopedWrite, type StudioScopedAuthorization, type StudioScopedSql, type StudioScopedWork } from "./studio-scoped-write-store";

/** 원고 저장과 구별되는 목적 검사다. Graph 일반 명령이나 전역 편집 권한으로 전환하지 않는다. */
export async function authorizeStudioScopedPurpose(query: StudioScopedSql, work: StudioScopedWork, input: {
  readonly purpose: "capture" | "asset" | "submission";
  readonly writeContext?: StudioScopedWriteContext;
}): Promise<StudioScopedAuthorization> {
  const authorization = await authorizeStudioScopedWrite(query, work, input.writeContext);
  if (authorization.context && (authorization.context.creations.length || authorization.context.restorations.length
    || authorization.targets.length === 0)) throw new StudioScopedWriteDeniedError("context");
  return authorization;
}

/** 검증된 캡처의 실제 ID만 현재 담당 작업·배정과 대조한다. sourceEvidence는 허가가 아니다. */
export async function assertStudioScopedTaskOutputAuthorization(query: StudioScopedSql, authorization: StudioScopedAuthorization,
  command: SubmitProductionTaskOutputCommand, captures: ProductionTaskOutputCaptures): Promise<readonly string[]> {
  if (authorization.work.access.edit && !authorization.mappedFull) return [];
  if (authorization.mappedFull) {
    const selected = command.selection.mode === "document"
      ? captures.output.pages.map((page) => ({ pageId: page.pageId, frameIds: null }))
      : command.selection.pages.map((page) => ({ pageId: page.pageId,
        frameIds: "frameIds" in page ? page.frameIds : null }));
    const touchesMapped = authorization.mappedFull.controlledTargets.some((target) => selected.some((page) => page.pageId === target.definition.pageId
      && (target.definition.frameId === null || page.frameIds === null || page.frameIds.includes(target.definition.frameId))));
    if (!touchesMapped) return [];
  }
  if (!authorization.context || authorization.context.creations.length || authorization.context.restorations.length) {
    throw new StudioScopedWriteDeniedError("context");
  }
  const matchingGrants = authorization.grants.filter((grant) => grant.assignmentId === command.submittedByAssignmentId && grant.taskId === command.taskId);
  const permittedIds = new Set(matchingGrants.flatMap((grant) => grant.targetIds));
  const targets = authorization.targets.filter((target) => permittedIds.has(target.definition.id));
  if (!targets.length || captures.output.subject.workId !== authorization.work.workId) throw new StudioScopedWriteDeniedError("policy");
  const subject = captures.output.subject, rows = await query.query(studioReviewResolutionCaptureQuery(subject.artifactId, [subject.reviewId]));
  const row = rows.length === 1 ? scopedRecord(rows[0]) : null, operation = scopedRecord(row?.capture)?.operation;
  const capture = row && studioReviewResolutionCaptureFromRows(row);
  const proof = row && studioReviewCaptureFromOperation(operation, subject, row.receipt);
  if (!proof || !capture || canonicalJson(capture.subject) !== canonicalJson(subject)
    || capture.sourceServerRevision !== captures.output.sourceServerRevision || capture.sequence !== captures.output.captureSequence
    || capture.sourceServerRevision > authorization.work.revision) throw new StudioScopedWriteDeniedError("ambiguous");
  const state = projectStudioScopedAuthoringDocument(proof.payload.sourceSnapshot), ownership = new Map(Object.entries(authorization.policy.ownership));
  // 전체 이미지가 선택 레이어만 담았다고 간주하지 않는다. 불변 원고 안 실제 담당 ID만 검증한다.
  for (const target of targets) {
    if (target.definition.layerId !== null && !state.entities.has(scopedEntityKey("group", target.definition.layerId, target.definition.pageId))) throw new StudioScopedWriteDeniedError("ambiguous");
    const entities = [...state.entities].flatMap(([key, entity]) => ownership.get(key) === target.definition.id
      ? [{ kind: entity.kind, id: entity.id }] : []);
    validateStudioScopedWriteTarget({ ...target, definition: { ...target.definition, entities } }, state, ownership);
  }
  const touched = new Set<string>();
  const admit = (pageId: string, frameIds: readonly string[] | null) => {
    const pageTargets = targets.filter((target) => target.definition.pageId === pageId);
    const whole = pageTargets.find((target) => target.definition.frameId === null);
    if (whole) { touched.add(whole.definition.id); return; }
    if (!frameIds?.length) throw new StudioScopedWriteDeniedError("scope");
    for (const frameId of frameIds) {
      const target = pageTargets.find((candidate) => candidate.definition.frameId === frameId);
      if (!target) throw new StudioScopedWriteDeniedError("scope");
      touched.add(target.definition.id);
    }
  };
  const selection = command.selection, pages = captures.output.pages;
  if (selection.mode === "document") for (const page of pages) admit(page.pageId, null);
  else for (const selected of selection.pages) {
    const page = pages.find((candidate) => candidate.pageId === selected.pageId && candidate.ordinal === selected.ordinal);
    if (!page) throw new StudioScopedWriteDeniedError("ambiguous");
    if (selection.mode === "frames") {
      const frames = (selected as { readonly frameIds: readonly string[] }).frameIds;
      if (!frames.length || new Set(frames).size !== frames.length || frames.some((frameId) => !page.frameIds.includes(frameId))) {
        throw new StudioScopedWriteDeniedError("ambiguous");
      }
      admit(page.pageId, frames);
    } else admit(page.pageId, null);
  }
  if (!touched.size) throw new StudioScopedWriteDeniedError("scope");
  return [...touched];
}

/** UI가 선택한 명시 target을 빠짐없이 읽는 데 쓰며 기하나 컷 이름을 해석하지 않는다. */
export function studioScopedPurposeTargets(authorization: StudioScopedAuthorization): readonly StudioScopedWriteTarget[] {
  return authorization.targets;
}
