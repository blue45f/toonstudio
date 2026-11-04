import { flushSync } from "react-dom";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { CANVAS_W } from "../studio-assets";
import { studioLifecycleAutosaveSidecarKey } from "../studio-autosave";
import { acknowledgeStudioDurableSaveIntent, boundStudioSaveIntentOperation, studioDurableSaveIntentRepository } from "../studio-durable-save-intent";
import { assertStudioApiJsonPayloadSize } from "../studio-api-payload-safety";
import { invalidateStudioOwnerDetailAfterSharedSave } from "../studio-editor-scope";
import { getStudioSharedDocument, updateStudioScopedSharedDocument } from "../studio-shared-document-client";
import { projectStudioScopedSaveDocument, studioScopedSaveHasExcludedChanges, studioScopedSaveMutationId } from "./studio-scoped-save-document";
import { studioScopedSavePendingRepository, studioScopedSaveSnapshotDigest, type StudioScopedSavePending } from "./studio-scoped-save-pending";
import type { StudioPageSavePipelineDeps } from "../studio-page-save-pipeline";
import type { StudioProjectSnapshot } from "../studio-project-snapshot";
import type { StudioScopedWriteAuthority } from "./studio-scoped-write-authority";

export interface StudioScopedPageSaveBindings {
  readonly authority: StudioScopedWriteAuthority | null;
  readonly getSnapshot: () => StudioProjectSnapshot;
  readonly isDrawing: () => boolean;
}

/** 과거 제한 저장 이력이 없는 전체 편집에는 SQLite 확인을 추가하지 않는다. */
export async function runStudioScopedSaveOrPending(status: "draft" | "published", deps: StudioPageSavePipelineDeps): Promise<boolean> {
  if (!deps.sharedDocument?.capabilities.edit) { await runStudioScopedPageSavePipeline(status, deps); return true; }
  const authority = deps.scopedWrite?.authority, actorUserId = deps.studioAuthUserId, workId = deps.workId;
  if (!authority || !actorUserId || !workId) return false;
  const sameIdentity = () => authority.hasCurrentIdentity && deps.editorMountedRef.current && deps.currentStudioDocumentScopeRef.current.authScopeKey === actorUserId
    && deps.currentStudioDocumentScopeRef.current.workId === workId;
  try {
    const policy = authority.snapshot?.requiresScopedSaveReconciliation === true ? authority.snapshot : await authority.refresh();
    if (!sameIdentity()) return true;
    if (typeof policy?.requiresScopedSaveReconciliation !== "boolean") throw new Error("이전 담당 원고의 저장 이력을 확인하지 못했습니다. 기기 초안을 보존했습니다.");
    if (!policy.requiresScopedSaveReconciliation) return false;
    const pending = await boundStudioSaveIntentOperation(studioScopedSavePendingRepository.load({ actorUserId, workId }));
    if (!sameIdentity()) return true;
    if (!pending) return false;
    await runStudioScopedPageSavePipeline(status, deps, pending); return true;
  } catch (error) {
    if (sameIdentity()) deps.setError(error instanceof Error ? error.message : "이전 저장 상태를 확인하지 못했습니다. 기기 초안을 보존했습니다."); return true;
  }
}

const running = new WeakSet<object>();
/** 전체 편집 잠금을 풀지 않는 doc-only 경로. 현재 배정·ACK·문서 세대가 모두 유지돼야 성공을 반영한다. */
export async function runStudioScopedPageSavePipeline(status: "draft" | "published", deps: StudioPageSavePipelineDeps,
  previouslyLoaded?: StudioScopedSavePending): Promise<void> {
  const bindings = deps.scopedWrite, authority = bindings?.authority, workId = deps.workId, actor = deps.studioAuthUserId;
  if (deps.documentSaveInFlightRef.current || running.has(deps.documentSaveInFlightRef)) return;
  if (status !== "draft" || !bindings || !authority || !workId || !actor || !deps.sharedDocument) {
    deps.setError("현재 담당 원고의 본문만 저장할 수 있습니다. 게시와 작품 설정은 제작 관리자에게 요청하세요."); return;
  }
  const scope = { ownerId: actor, documentKey: deps.autosaveKey }, pendingScope = { actorUserId: actor, workId };
  let initial = deps.captureStudioMutationTicket();
  let projectGeneration = deps.studioRevisionProjectGenerationRef.current;
  const sameIdentity = () => authority.hasCurrentIdentity && deps.editorMountedRef.current && deps.currentStudioDocumentScopeRef.current.authScopeKey === actor
    && deps.currentStudioDocumentScopeRef.current.workId === workId;
  const current = () => {
    const ticket = deps.captureStudioMutationTicket();
    return sameIdentity() && ticket.authScopeKey === actor && ticket.workId === workId
      && ticket.accessGeneration === initial.accessGeneration && ticket.documentGeneration === initial.documentGeneration
      && deps.studioRevisionProjectGenerationRef.current === projectGeneration;
  };
  let release: (() => void) | null = null, controller: AbortController | null = null;
  running.add(deps.documentSaveInFlightRef);
  try {
    if (!sameIdentity() || bindings.isDrawing()) throw new Error("획 입력이 끝난 뒤 담당 원고를 저장하세요.");
    let pending = previouslyLoaded ?? await boundStudioSaveIntentOperation(studioScopedSavePendingRepository.load(pendingScope));
    if (!current()) return;
    if (!pending) {
      // 마지막 획은 현재 ticket으로 확정한 뒤 정책을 갱신한다. refresh는 이전 ticket을 무효화한다.
      if (deps.pendingStrokeCommitsRef.current) flushSync(() => { deps.flushPendingStrokeCommitsRef.current(); });
      if (deps.pendingStrokeCommitsRef.current || bindings.isDrawing()) throw new Error("마지막 획을 확정한 뒤 다시 저장하세요.");
      initial = deps.captureStudioMutationTicket(); projectGeneration = deps.studioRevisionProjectGenerationRef.current;
      await authority.refresh(); if (!current()) return; authority.purposeContext();
    }
    release = authority.holdMutations();
    deps.sharedDocumentSaveAbortRef.current?.abort(); controller = new AbortController(); deps.sharedDocumentSaveAbortRef.current = controller;
    deps.documentSaveInFlightRef.current = true; deps.setSaving(true); deps.setError(null);
    if (!pending) {
      const intent = await boundStudioSaveIntentOperation(studioDurableSaveIntentRepository.load(scope));
      const barrier = deps.studioCrdtAuthoritativeSaveBarrierRef.current;
      if (!barrier) throw new Error("공동 편집의 서버 승인 경계가 준비되지 않았습니다. 초안을 보존하고 연결을 확인하세요.");
      const acknowledged = await barrier(10_000); if (!current() || controller.signal.aborted) return;
      await authority.refresh(); if (!current()) return;
      const writeContext = authority.purposeContext(), contextKey = canonicalJson(writeContext);
      const saved = await getStudioSharedDocument(workId, controller.signal); if (!current()) return;
      const { projectStudioReviewCaptureSource } = await import("../review-capture/studio-review-capture-projection");
      const snapshot = bindings.getSnapshot(), crdt = deps.studioCrdtDocumentRef.current;
      const projected = projectStudioReviewCaptureSource(snapshot, saved, CANVAS_W, (id) => (crdt?.getRasterOperationLog(id) ?? null) !== null);
      const doc = projectStudioScopedSaveDocument(saved.document.doc, projected.doc);
      const hasExcludedDraft = studioScopedSaveHasExcludedChanges(saved.document.doc, projected.doc)
        || canonicalJson([projected.title, projected.description, projected.tags, projected.titleId, projected.seriesId, projected.challengeId])
          !== canonicalJson([saved.document.title, saved.document.description, saved.document.tags, saved.document.titleId, saved.document.seriesId, saved.document.challengeId]);
      const body = { baseRevision: saved.revision, crdtServerSequence: acknowledged.serverSequence, doc, writeContext };
      const mutationId = await studioScopedSaveMutationId(actor, workId, body), snapshotDigest = await studioScopedSaveSnapshotDigest(snapshot);
      if (!current() || contextKey !== canonicalJson(authority.purposeContext())) return;
      assertStudioApiJsonPayloadSize({ ...body, mutationId });
      pending = await boundStudioSaveIntentOperation(studioScopedSavePendingRepository.remember(pendingScope, {
        version: 1, ...pendingScope, body: { ...body, mutationId }, snapshotDigest, hasExcludedDraft, intentScope: scope, intent,
      }));
    }
    if (!current() || controller.signal.aborted || pending.actorUserId !== actor || pending.workId !== workId) return;
    // 응답 불명확·재진입·reload에서도 저장해 둔 원문만 전송한다. 새 base/배정/UUID로 바꾸지 않는다.
    const body = pending.body, response = await updateStudioScopedSharedDocument(workId, body, controller.signal);
    if (!current() || controller.signal.aborted) return;
    if (response.workId !== workId || response.revision !== body.baseRevision + 1 || !Number.isFinite(Date.parse(response.updatedAt))) {
      throw new Error("이전 원고의 저장 ACK를 확인하지 못했습니다. 기기 초안을 보존했습니다.");
    }
    if (!await boundStudioSaveIntentOperation(studioScopedSavePendingRepository.clear(pendingScope, body.mutationId))) {
      throw new Error("서버 저장은 확인했지만 새로운 저장 대기 기록을 보존했습니다.");
    }
    if (!current() || controller.signal.aborted) return;
    deps.setSharedDocumentScope((value) => value?.authScopeKey === actor && value.workId === workId ? { ...value,
      value: value.value.revision > response.revision ? value.value : { ...value.value, revision: response.revision,
        updatedAt: response.updatedAt, crdtServerSequence: BigInt(value.value.crdtServerSequence) > BigInt(body.crdtServerSequence)
          ? value.value.crdtServerSequence : body.crdtServerSequence, document: { ...value.value.document, doc: body.doc } } } : value);
    deps.ownerDetailAbortRef.current?.abort(); deps.setFxPanelOpen(false); deps.setLoadedWork(invalidateStudioOwnerDetailAfterSharedSave);
    const snapshotDigest = await studioScopedSaveSnapshotDigest(bindings.getSnapshot());
    const currentIntent = await boundStudioSaveIntentOperation(studioDurableSaveIntentRepository.load(scope));
    if (!current() || controller.signal.aborted) return;
    if (pending.hasExcludedDraft || pending.snapshotDigest !== snapshotDigest || pending.intentScope.documentKey !== scope.documentKey
      || (currentIntent?.id ?? null) !== (pending.intent?.id ?? null)) {
      deps.setSharedDocumentNotice("담당 원고 요소는 저장했습니다. 함께 저장할 수 없는 작품·페이지 설정 초안은 이 기기에 보존했습니다.");
      return;
    }
    deps.setSharedDocumentNotice(`담당 원고를 공동 문서 revision ${response.revision}로 저장했습니다.`);
    try { await acknowledgeStudioDurableSaveIntent(pending.intentScope, pending.intent); }
    catch { deps.setSharedDocumentNotice("서버 저장은 완료했지만 기기의 저장 대기 기록을 정리하지 못했습니다."); return; }
    if (!current()) return;
    if (await boundStudioSaveIntentOperation(studioDurableSaveIntentRepository.load(scope))) {
      deps.setSharedDocumentNotice("서버 저장은 확인했습니다. 이후에 만들어진 저장 대기와 기기 초안은 보존했습니다."); return;
    }
    if (!current()) return;
    deps.clearAutosaveDurableAuthority();
    try {
      localStorage.removeItem(deps.autosaveKey); localStorage.removeItem(studioLifecycleAutosaveSidecarKey(deps.autosaveKey));
      deps.studioLifecycleDurableGenerationRef.current = deps.studioRevisionProjectGenerationRef.current;
      deps.studioLifecycleDurablePendingFingerprintRef.current = "";
    } catch { /* 새 변경이나 정리 실패를 저장 성공으로 덮지 않는다. */ }
  } catch (error) {
    if (sameIdentity()) deps.setError(error instanceof Error ? error.message : "담당 원고를 저장하지 못했습니다. 기기 초안을 보존했습니다.");
  } finally {
    running.delete(deps.documentSaveInFlightRef);
    release?.();
    if (controller && deps.sharedDocumentSaveAbortRef.current === controller) {
      deps.sharedDocumentSaveAbortRef.current = null; deps.documentSaveInFlightRef.current = false;
      if (sameIdentity()) deps.setSaving(false);
    }
  }
}
