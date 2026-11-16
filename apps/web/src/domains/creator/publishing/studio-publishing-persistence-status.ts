export type StudioPublishingPersistenceStatusKind =
  | "saving"
  | "preparing"
  | "save-failed"
  | "load-failed"
  | "guest-unsaved"
  | "unsaved-changes"
  | "saved"
  | "empty";

export type StudioPublishingPersistenceTone =
  | "neutral"
  | "warning"
  | "danger"
  | "success";

export interface StudioPublishingConfirmedSaveReceipt {
  readonly authUserId: string;
  readonly savedWorkId: string;
  readonly sourceWorkId: string | null;
  readonly revision: number | null;
}

export interface StudioPublishingFailedSaveAttempt {
  readonly authUserId: string | null;
  readonly workId: string | null;
  readonly message: string | null;
}

export interface StudioPublishingPersistenceScope {
  readonly authUserId: string | null;
  readonly workId: string | null;
}

export interface StudioPublishingPersistenceStatusInput {
  readonly authUserId: string | null;
  readonly workId: string | null;
  readonly pageCount: number;
  readonly title: string;
  readonly description: string;
  readonly tagsText: string;
  readonly hasHandoffContext: boolean;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly recoveryBusy: boolean;
  readonly hydrating: boolean;
  readonly loadingFiles: boolean;
  readonly handoffLoading: boolean;
  readonly hydrationStatus: "ready" | "loading" | "error";
  readonly hydrationScopeCurrent: boolean;
  readonly hasHydratedScope: boolean;
  readonly handoffError: string | null;
  readonly workRevision: number | undefined;
  readonly confirmedSaveReceipt: StudioPublishingConfirmedSaveReceipt | null;
  readonly failedSaveAttempt: StudioPublishingFailedSaveAttempt | null;
}

export interface StudioPublishingPersistenceStatusSnapshot {
  readonly kind: StudioPublishingPersistenceStatusKind;
  readonly tone: StudioPublishingPersistenceTone;
  readonly hasConfirmedServerPersistence: boolean;
  readonly confirmedRevision: number | null;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly dockKo: string;
  readonly dockEn: string;
}

export function isStudioPublishingConfirmedSaveReceiptCurrent(
  receipt: StudioPublishingConfirmedSaveReceipt | null,
  scope: StudioPublishingPersistenceScope,
): boolean {
  if (!receipt || !scope.authUserId || receipt.authUserId !== scope.authUserId) {
    return false;
  }
  if (scope.workId !== null) {
    return receipt.savedWorkId === scope.workId;
  }
  return receipt.sourceWorkId === null;
}

export function isStudioPublishingFailedSaveAttemptCurrent(
  attempt: StudioPublishingFailedSaveAttempt | null,
  scope: StudioPublishingPersistenceScope,
): boolean {
  if (!attempt) return false;
  return attempt.authUserId === scope.authUserId && attempt.workId === scope.workId;
}

function normalizePositiveRevision(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
    ? value
    : null;
}

/**
 * Derives honest persistence UI state for `/studio/publish` without ever equating `dirty === false`
 * with a completed server save. Green `"saved"` requires an authenticated scope backed by either a
 * verified hydrated server document or an in-scope confirmed save receipt, with zero unpersisted edits.
 */
export function deriveStudioPublishingPersistenceStatus(
  input: StudioPublishingPersistenceStatusInput,
): StudioPublishingPersistenceStatusSnapshot {
  const loggedIn = input.authUserId !== null;
  const scope: StudioPublishingPersistenceScope = {
    authUserId: input.authUserId,
    workId: input.workId,
  };
  const confirmedHydratedWork =
    loggedIn &&
    Boolean(input.workId) &&
    input.hydrationStatus === "ready" &&
    input.hydrationScopeCurrent &&
    input.hasHydratedScope;
  const receiptCurrent = isStudioPublishingConfirmedSaveReceiptCurrent(
    input.confirmedSaveReceipt,
    scope,
  );
  const hasConfirmedServerPersistence = loggedIn && (confirmedHydratedWork || receiptCurrent);
  const confirmedRevision =
    normalizePositiveRevision(input.workRevision) ??
    (receiptCurrent ? normalizePositiveRevision(input.confirmedSaveReceipt?.revision) : null);

  const hasLocalDraftInput =
    input.pageCount > 0 ||
    input.title.trim().length > 0 ||
    input.description.trim().length > 0 ||
    input.tagsText.trim().length > 0 ||
    input.hasHandoffContext;

  if (input.saving || input.recoveryBusy) {
    return Object.freeze({
      kind: "saving",
      tone: "neutral",
      hasConfirmedServerPersistence,
      confirmedRevision,
      summaryKo: "서버에 저장 중…",
      summaryEn: "Saving to server…",
      dockKo: "서버에 변경사항을 저장하고 있습니다…",
      dockEn: "Saving changes to the server…",
    });
  }

  if (input.hydrating || input.loadingFiles || input.handoffLoading) {
    return Object.freeze({
      kind: "preparing",
      tone: "neutral",
      hasConfirmedServerPersistence,
      confirmedRevision,
      summaryKo: "원고 상태를 확인하는 중…",
      summaryEn: "Checking manuscript status…",
      dockKo: "원고 준비가 끝나면 저장 상태를 표시합니다",
      dockEn: "Save status will appear once preparation finishes",
    });
  }

  if (isStudioPublishingFailedSaveAttemptCurrent(input.failedSaveAttempt, scope)) {
    const unpersisted = !loggedIn || input.dirty || !hasConfirmedServerPersistence;
    return Object.freeze({
      kind: "save-failed",
      tone: "danger",
      hasConfirmedServerPersistence,
      confirmedRevision,
      summaryKo: !loggedIn
        ? "저장 불가 · 서버 저장과 게시는 로그인 후 가능합니다"
        : unpersisted
          ? "서버 저장 실패 · 변경사항이 아직 서버에 반영되지 않았어요"
          : "저장·게시 요청 실패 · 이전 서버 버전은 유지되며 방금 요청은 반영되지 않았어요",
      summaryEn: !loggedIn
        ? "Cannot save · Sign in to save or publish to the server"
        : unpersisted
          ? "Server save failed · Changes have not been saved to the server"
          : "Save or publish failed · Previous server version is intact; latest request was not applied",
      dockKo: "마지막 서버 저장 요청이 실패했습니다 · 오류를 확인한 뒤 다시 시도해 주세요",
      dockEn: "Last server save failed · Check the error and try again",
    });
  }

  if ((Boolean(input.workId) && input.hydrationStatus === "error") || Boolean(input.handoffError)) {
    return Object.freeze({
      kind: "load-failed",
      tone: "danger",
      hasConfirmedServerPersistence: false,
      confirmedRevision: null,
      summaryKo: !loggedIn && Boolean(input.workId)
        ? "로그인 필요 · 로그인 전에는 서버 원고를 불러오거나 저장할 수 없어요"
        : "원고 불러오기 실패 · 서버 저장 상태를 아직 확인하지 못했어요",
      summaryEn: !loggedIn && Boolean(input.workId)
        ? "Sign-in required · Sign in to load or save this server manuscript"
        : "Load failed · Could not verify server save status",
      dockKo: "원고를 다시 불러온 뒤 저장 및 게시를 진행해 주세요",
      dockEn: "Reload the manuscript before saving or publishing",
    });
  }

  if (!loggedIn && (input.dirty || hasLocalDraftInput)) {
    return Object.freeze({
      kind: "guest-unsaved",
      tone: "warning",
      hasConfirmedServerPersistence: false,
      confirmedRevision: null,
      summaryKo: "로그인 전 미저장 상태 · 로그인하면 준비한 원고를 서버에 저장할 수 있어요",
      summaryEn: "Unsaved guest draft · Sign in to save your prepared manuscript to the server",
      dockKo: "서버 미저장 · 로그인 후 초안 저장 및 게시가 가능합니다",
      dockEn: "Not saved to server · Sign in to save a draft or publish",
    });
  }

  if (loggedIn && (input.dirty || (!hasConfirmedServerPersistence && hasLocalDraftInput))) {
    return Object.freeze({
      kind: "unsaved-changes",
      tone: "warning",
      hasConfirmedServerPersistence,
      confirmedRevision,
      summaryKo: hasConfirmedServerPersistence
        ? "저장되지 않은 변경이 있어요 · 아래 \"초안 저장\"으로 서버 버전을 갱신할 수 있어요"
        : "아직 서버에 저장되지 않았어요 · 아래 \"초안 저장\"으로 첫 초안을 저장할 수 있어요",
      summaryEn: hasConfirmedServerPersistence
        ? "Unsaved changes · Use \"Save draft\" below to update the server version"
        : "Not saved to the server yet · Use \"Save draft\" below to save your first draft",
      dockKo: "저장 또는 게시하면 현재 변경이 새 서버 버전에 반영됩니다",
      dockEn: "Saving or publishing records current changes in a new server version",
    });
  }

  if (hasConfirmedServerPersistence && !input.dirty) {
    return Object.freeze({
      kind: "saved",
      tone: "success",
      hasConfirmedServerPersistence: true,
      confirmedRevision,
      summaryKo: confirmedRevision !== null
        ? `서버 저장 완료 · 버전 #${confirmedRevision}까지 저장됨`
        : "서버 저장 완료 · 현재 버전까지 저장됨",
      summaryEn: confirmedRevision !== null
        ? `Saved to server · Saved through revision #${confirmedRevision}`
        : "Saved to server · Saved through current version",
      dockKo: confirmedRevision !== null
        ? `서버 버전 #${confirmedRevision} 저장됨`
        : "서버에 현재 버전 저장됨",
      dockEn: confirmedRevision !== null
        ? `Server revision #${confirmedRevision} saved`
        : "Current version saved to server",
    });
  }

  return Object.freeze({
    kind: "empty",
    tone: "neutral",
    hasConfirmedServerPersistence: false,
    confirmedRevision: null,
    summaryKo: !loggedIn
      ? "아직 저장된 원고가 없어요 · 로그인 전에도 원고와 설정을 미리 준비할 수 있어요"
      : "아직 저장된 원고가 없어요 · 이미지와 제목을 추가하면 초안을 저장할 수 있어요",
    summaryEn: !loggedIn
      ? "No saved manuscript yet · You can prepare pages and settings before signing in"
      : "No saved manuscript yet · Add images and a title to save a draft",
    dockKo: !loggedIn
      ? "서버 미저장 · 원고를 준비한 뒤 로그인해 저장하세요"
      : "아직 서버에 저장된 버전이 없습니다",
    dockEn: !loggedIn
      ? "Not saved to server · Prepare your manuscript, then sign in to save"
      : "No version saved to the server yet",
  });
}
