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
/** 같은 객체의 선택·정책 변경도 Compiler가 epoch별 정본 읽기로 구분해야 한다. */
function readStudioScopedDraftSaveAuthority(authority: StudioScopedWriteAuthority | null, epoch: number) {
  const current = authority?.hasCurrentIdentity === true && authority.getEpoch() === epoch;
  return { current, reconciliation: current ? authority.snapshot?.requiresScopedSaveReconciliation : undefined,
    available: current && studioScopedDraftSaveAvailable(authority) };
}
export function useStudioScopedDraftSaveState(explicitAuthority?: StudioScopedWriteAuthority | null) {
  const contextualAuthority = useContext(StudioScopedWriteAuthorityContext), authority = explicitAuthority === undefined ? contextualAuthority : explicitAuthority;
  const epoch = useSyncExternalStore(authority?.subscribe ?? noopSubscribe, authority?.getEpoch ?? zero, zero);
  const { current, reconciliation, available } = readStudioScopedDraftSaveAuthority(authority, epoch);
  const status = useStudioScopedSavePendingStatus(current && reconciliation === true && authority ? { actorUserId: authority.authScopeKey, workId: authority.workId } : null);
  const loading = current && (typeof reconciliation !== "boolean" || status.loading);
  const pendingConfirmation = current && status.pending && !status.loading && status.error === null;
  const newSaveAvailable = current && !loading && status.error === null && !status.pending && available;
  return { available: pendingConfirmation || newSaveAvailable, newSaveAvailable, pendingConfirmation, loading, error: status.error };
}
