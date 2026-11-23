/** 입력 허용 판단은 호스트가 한다. 여기서는 같은 차단 사유 중 작가에게 먼저 보여줄 사유만 고른다. */
export function studioCanvasInputStatus(state: {
  saving: boolean; documentReloadRequired: boolean; sourceHydrationPending: boolean; workHydrationFailed: boolean;
  collaborationDocumentUnavailable: boolean; initialRecoveryBlocked: boolean; autosaveCheckFailed: boolean;
  hasAutosave: boolean; collaborationDocumentLocked: boolean; collaborationOperationSyncPending: boolean;
  reviewLocked: boolean; follower: boolean;
}) {
  if (state.documentReloadRequired) return "reload";
  if (state.workHydrationFailed) return "source-error";
  if (state.collaborationDocumentUnavailable) return "unavailable";
  if (state.sourceHydrationPending) return "loading";
  if (state.initialRecoveryBlocked) {
    if (state.autosaveCheckFailed) return "recovery-error";
    return state.hasAutosave ? "recovery-choice" : "recovering";
  }
  if (state.collaborationDocumentLocked && !state.collaborationOperationSyncPending) return "read-only";
  if (state.reviewLocked) return "review";
  if (state.collaborationDocumentLocked) return "syncing";
  if (state.follower) return "follower";
  return state.saving ? "saving" : "ready";
}

export type StudioCanvasInputStatus = ReturnType<typeof studioCanvasInputStatus>;

export function studioCanvasInputBusy(state?: StudioCanvasInputStatus): boolean {
  return state === "loading" || state === "recovering" || state === "syncing" || state === "saving";
}
