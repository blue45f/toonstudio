import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { StudioReviewCaptureDialogMount } from "./StudioReviewCaptureDialogMount";
import { useStudioReviewCapture } from "./useStudioReviewCapture";

import { StudioReviewEditorHandoffMount } from "../review-handoff/StudioReviewEditorHandoffMount";
import type { StudioReviewEditorHostNavigation } from "../review-handoff/studio-review-editor-host";
import { studioReviewEditorRequestFromLocation } from "../review-handoff/studio-review-editor-route";
import type { StudioReviewCaptureOrigin } from "../review-resolution/StudioReviewCaptureReturnLink";
import { useStudioStableHandlers } from "../studio-stable-handlers";
import { studioReviewCaptureHostAdmission, studioReviewCaptureHostContext, type StudioReviewCaptureHostBindings } from "./studio-review-capture-host-context";
import { studioReviewCaptureSourceFromSearch, studioReviewCaptureSourceReturnHref } from "./studio-review-capture-source";
import { studioScopedWriteAuthority } from "../studio-collab/studio-scoped-write-authority";

export { studioReviewCaptureHostContext } from "./studio-review-capture-host-context";

/** The host supplies runtime authority; this adapter owns capture projection and its dialog. */
export function useStudioReviewCaptureHost(bindings: StudioReviewCaptureHostBindings & { readonly reviewHandoff?: StudioReviewEditorHostNavigation }) {
  const sourceRequest = studioReviewCaptureSourceFromSearch(bindings.reviewHandoff?.search ?? "");
  const scopeKey = JSON.stringify([bindings.studioAuthUserId, bindings.workId, sourceRequest?.sourceRevision]);
  const [origin, setOrigin] = useState<{ key: string; value: StudioReviewCaptureOrigin | null } | null>(null);
  const unavailableOpen = useRef(false);
  const capture = useStudioReviewCapture(scopeKey, {
    refreshPurpose: async () => {
      if (!bindings.available && bindings.scopedAvailable && bindings.collaborationAccessRef) {
        await studioScopedWriteAuthority(bindings.collaborationAccessRef)?.refresh();
      }
    },
    getContext: () => {
      const context = studioReviewCaptureHostContext(bindings);
      return { ...context, available: context.available && !unavailableOpen.current,
        ...(sourceRequest ? { sourceRevision: sourceRequest.sourceRevision } : {}) };
    },
    projectRuntime: async (saved) => {
      const snapshot = bindings.getSnapshot();
      const { projectStudioReviewCaptureSource } = await import("./studio-review-capture-projection");
      return projectStudioReviewCaptureSource(snapshot, saved, bindings.canvasWidth, bindings.isDurableMask);
    },
    save: bindings.save,
    captureAll: bindings.captureAll,
  });
  const admission = useStudioStableHandlers({
    inspect: () => ({ ...studioReviewCaptureHostAdmission(bindings), captureScope: scopeKey,
      canStartCapture: ["idle", "needs-save", "completed", "cancelled"].includes(capture.getOpenPhase()) }),
    flush: () => bindings.flushPendingStrokeCommitsRef.current(),
    open: (expectedScope: string, unavailable = false) => {
      if (scopeKey !== expectedScope) return;
      // 새 캡처의 비동기 context 조회까지 차단을 유지하며 진행 중 intent의 판정은 바꾸지 않는다.
      if (["idle", "needs-save", "completed", "cancelled"].includes(capture.getOpenPhase())) {
        unavailableOpen.current = unavailable;
      }
      // 완료 전 재개는 기존 intent와 origin을 유지한다.
      if (!capture.open()) return;
      const request = studioReviewEditorRequestFromLocation(bindings.workId, bindings.reviewHandoff?.search ?? "");
      setOrigin({ key: scopeKey, value: request && bindings.studioAuthUserId && bindings.workId
        ? { actorId: bindings.studioAuthUserId, workId: bindings.workId, request } : null });
    },
  });
  const handlers = useStudioStableHandlers({ open: () => {
    const before = admission.inspect();
    const sameScope = (current: ReturnType<typeof admission.inspect>) => current.captureScope === before.captureScope
      && current.ticket.authScopeKey === before.ticket.authScopeKey && current.ticket.workId === before.ticket.workId
      && current.ticket.accessGeneration === before.ticket.accessGeneration;
    let unavailable = !before.bindingScopeMatches;
    if (before.canStartCapture && before.pending && before.editable && before.bindingScopeMatches && before.ticket.workId) {
      flushSync(() => {
        const current = admission.inspect();
        unavailable = !sameScope(current) || !current.canStartCapture || !current.editable || !current.bindingScopeMatches;
        if (!unavailable) unavailable = !admission.flush();
      });
    }
    // flushSync가 publication을 끝내면 최신 layout handler로 다시 읽는다. 문서 세대 전진은 정상이다.
    if (!sameScope(admission.inspect())) return;
    admission.open(before.captureScope, unavailable);
  } });
  const openedSource = useRef<string | null>(null);
  useEffect(() => {
    if (!sourceRequest || !studioReviewCaptureHostContext(bindings).available || openedSource.current === scopeKey) return;
    openedSource.current = scopeKey;
    // 자동 진입은 이미 pending 없는 context만 허용하며 effect 안에서 flushSync를 호출하지 않는다.
    admission.open(scopeKey);
  }, [sourceRequest, bindings, scopeKey, admission]);
  return {
    open: handlers.open,
    dialog: <>
      {bindings.reviewHandoff && <StudioReviewEditorHandoffMount bindings={bindings} navigation={bindings.reviewHandoff} />}
      <StudioReviewCaptureDialogMount
      open={capture.visible}
      snapshot={capture.snapshot}
      origin={origin?.key === scopeKey ? origin.value : null}
      sourceRevision={sourceRequest?.sourceRevision}
      returnHref={sourceRequest ? studioReviewCaptureSourceReturnHref(sourceRequest) : null}
      onSave={() => { void capture.save(); }}
      onRetry={capture.retry}
      onClose={() => { void capture.close(); }}
    /></>,
  };
}
