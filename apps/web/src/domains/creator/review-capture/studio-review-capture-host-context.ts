import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { StudioProjectSnapshot } from "../studio-project-snapshot";
import type { StudioReviewCaptureBridgeDependencies } from "./studio-review-capture-bridge";

type Current<T> = { readonly current: T };
export interface StudioReviewCaptureHostBindings {
  readonly studioAuthUserId: string | null;
  readonly workId: string | null;
  readonly available: boolean;
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
  return {
    ticket,
    editable: bindings.available && bindings.editorMountedRef.current
      && bindings.canApplyStudioMutation(ticket) && !bindings.drawingRef.current,
    pending: Boolean(bindings.pendingStrokeCommitsRef.current),
    bindingScopeMatches: ticket.authScopeKey === bindings.studioAuthUserId
      && ticket.workId === bindings.workId,
  };
}

/** React publication 전후에도 현재 authority와 pending fence를 그대로 검사한다. */
export function studioReviewCaptureHostContext(bindings: StudioReviewCaptureHostBindings) {
  const { ticket, editable, pending } = studioReviewCaptureHostAdmission(bindings);
  return {
    workId: ticket.workId,
    scopeKey: JSON.stringify([ticket.authScopeKey, ticket.workId]),
    generation: JSON.stringify([ticket.accessGeneration, ticket.documentGeneration,
      bindings.studioRevisionProjectGenerationRef.current]),
    available: editable && !pending,
  };
}
