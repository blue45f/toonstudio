import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { StudioProjectSnapshot } from "../studio-project-snapshot";
import type { StudioReviewCaptureBridgeDependencies } from "./studio-review-capture-bridge";
import { studioScopedWriteAuthority } from "../studio-collab/studio-scoped-write-authority";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";

type Current<T> = { readonly current: T };
export interface StudioReviewCaptureHostBindings {
  readonly studioAuthUserId: string | null;
  readonly workId: string | null;
  readonly available: boolean;
  readonly scopedAvailable?: boolean;
  readonly collaborationAccessRef?: object;
  readonly editorMountedRef: Current<boolean>;
  readonly studioRevisionProjectGenerationRef: Current<number>;
  readonly drawingRef: Current<unknown>;
  readonly pendingStrokeCommitsRef: Current<unknown>;
  readonly flushPendingStrokeCommitsRef: Current<() => boolean>;
  readonly captureStudioMutationTicket: () => StudioEditorMutationTicket;
  readonly canApplyStudioMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly getSnapshot: () => StudioProjectSnapshot;
  readonly canvasWidth: number;
  readonly isDurableMask: (surfaceId: string) => boolean;
  readonly save: StudioReviewCaptureBridgeDependencies["save"];
  readonly captureAll: StudioReviewCaptureBridgeDependencies["captureAll"];
}

/** pending 확정도 현재 편집 권한과 실제 pointer 종료를 먼저 확인한다. */
export function studioReviewCaptureHostAdmission(bindings: StudioReviewCaptureHostBindings) {
  const ticket = bindings.captureStudioMutationTicket();
  const authority = bindings.collaborationAccessRef ? studioScopedWriteAuthority(bindings.collaborationAccessRef) : null;
  let writeContext: StudioScopedWriteContext | undefined;
  if (!bindings.available && bindings.scopedAvailable && authority?.authScopeKey === bindings.studioAuthUserId && authority.workId === bindings.workId) {
    try { writeContext = authority.purposeContext(); } catch { /* 미확인·만료·다른 선택은 캡처 권한으로 쓰지 않는다. */ }
  }
  return {
    ticket,
    editable: bindings.editorMountedRef.current && !bindings.drawingRef.current
      && ((bindings.available && bindings.canApplyStudioMutation(ticket)) || Boolean(writeContext)),
    pending: Boolean(bindings.pendingStrokeCommitsRef.current),
    bindingScopeMatches: ticket.authScopeKey === bindings.studioAuthUserId
      && ticket.workId === bindings.workId,
    ...(writeContext ? { writeContext } : {}),
  };
}

/** React publication 전후에도 현재 authority와 pending fence를 그대로 검사한다. */
export function studioReviewCaptureHostContext(bindings: StudioReviewCaptureHostBindings) {
  const { ticket, editable, pending, writeContext } = studioReviewCaptureHostAdmission(bindings);
  return {
    workId: ticket.workId,
    scopeKey: JSON.stringify([ticket.authScopeKey, ticket.workId]),
    generation: JSON.stringify([ticket.accessGeneration, ticket.documentGeneration,
      bindings.studioRevisionProjectGenerationRef.current, ...(writeContext ? [writeContext] : [])]),
    available: editable && !pending,
    ...(writeContext ? { writeContext } : {}),
  };
}
