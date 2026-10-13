/**
 * 저장 상태 신호 보관소의 React 바인딩.
 *
 * 스토어 모듈(studio-save-sync-signals)을 순수하게 유지하고 훅만 따로 두는
 * 패턴은 use-studio-reliability-status 와 동일하다(fast-refresh 경계).
 */

import { useMemo, useSyncExternalStore } from "react";

import {
  resolveSaveSyncStatusFromSignals,
  saveSyncJournalSnapshotFromSignals,
  type StudioSaveSyncSignalStore,
  type StudioSaveSyncSignals,
} from "./studio-save-sync-signals";

import type {
  StudioOperationJournalState,
  StudioSaveSyncStatus,
} from "./studio-operation-recovery-coordinator";

export function useStudioSaveSyncSignals(
  store: StudioSaveSyncSignalStore,
): StudioSaveSyncSignals {
  return useSyncExternalStore(
    store.subscribe,
    store.getSignals,
    store.getSignals,
  );
}

/** 바와 센터가 공유하는 표시 상태 + 센터 표시용 저널 스냅샷을 함께 도출한다. */
export function useStudioSaveSyncView(store: StudioSaveSyncSignalStore): {
  readonly status: StudioSaveSyncStatus;
  readonly journalSnapshot: StudioOperationJournalState;
  readonly leadership: StudioSaveSyncSignals["leadership"];
} {
  const signals = useStudioSaveSyncSignals(store);
  return useMemo(
    () => ({
      status: resolveSaveSyncStatusFromSignals(signals),
      journalSnapshot: saveSyncJournalSnapshotFromSignals(signals),
      leadership: signals.leadership,
    }),
    [signals],
  );
}
