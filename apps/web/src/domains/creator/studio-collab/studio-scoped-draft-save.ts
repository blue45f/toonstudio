import { useContext, useSyncExternalStore } from "react";
import { StudioScopedWriteAuthorityContext } from "./studio-scoped-write-context";
import type { StudioScopedWriteAuthority } from "./studio-scoped-write-authority";
import { useStudioScopedSavePendingStatus } from "./use-studio-scoped-save-pending";

const noopSubscribe = () => () => {}, zero = () => 0;
/** 이 값은 정본 원고의 제한 초안 저장만 허용하며 게시·메타데이터 권한을 부여하지 않는다. */
export function studioScopedDraftSaveAvailable(authority: StudioScopedWriteAuthority | null): boolean {
  if (!authority?.drawingAllowed) return false;
  try { authority.purposeContext(); return true; } catch { return false; }
}
export function useStudioScopedDraftSaveState(explicitAuthority?: StudioScopedWriteAuthority | null) {
  const contextualAuthority = useContext(StudioScopedWriteAuthorityContext), authority = explicitAuthority === undefined ? contextualAuthority : explicitAuthority;
  useSyncExternalStore(authority?.subscribe ?? noopSubscribe, authority?.getEpoch ?? zero, zero);
  const current = authority?.hasCurrentIdentity === true, policy = authority?.snapshot;
  const reconciliation = policy?.requiresScopedSaveReconciliation;
  const status = useStudioScopedSavePendingStatus(current && reconciliation === true && authority ? { actorUserId: authority.authScopeKey, workId: authority.workId } : null);
  const loading = current && (typeof reconciliation !== "boolean" || status.loading);
  const pendingConfirmation = current && status.pending && !status.loading && status.error === null;
  const newSaveAvailable = current && !loading && status.error === null && !status.pending && studioScopedDraftSaveAvailable(authority);
  return { available: pendingConfirmation || newSaveAvailable, newSaveAvailable, pendingConfirmation, loading, error: status.error };
}
