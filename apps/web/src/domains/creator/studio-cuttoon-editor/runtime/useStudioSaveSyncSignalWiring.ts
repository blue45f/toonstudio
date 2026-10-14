import { useEffect } from "react";

import type {
  StudioSaveSyncLeadership,
  StudioSaveSyncSignalStore,
} from "../../studio-save-sync-signals";

/**
 * 저장 상태 신호 배선 — 호스트가 이미 소유한 문서 스코프 신호 중 effect 로
 * 동기화해야 하는 것들(문서 교체 리셋, 리더십, 온라인)을 한곳에 모은다.
 *
 * receipt·실패·베이스라인처럼 기존 effect/핸들러 내부 지점에서 기록해야 하는
 * 신호는 호스트가 store 에 직접 note* 를 호출한다 (이 훅의 몫이 아니다).
 * 이 훅은 상태를 만들지 않고, 호스트 상태를 store 로 번역만 한다.
 */
export interface UseStudioSaveSyncSignalWiringOptions {
  readonly store: StudioSaveSyncSignalStore;
  /** 문서 identity. 바뀌면 이전 문서의 "저장됨"이 새 문서로 새지 않게 리셋한다. */
  readonly autosaveKey: string;
  /** useStudioAutosaveDocumentRuntime 의 리더십 (구조적 부분집합만 요구). */
  readonly leadership: { readonly role: "leader" | "follower" } | null;
}

export function useStudioSaveSyncSignalWiring({
  store,
  autosaveKey,
  leadership,
}: UseStudioSaveSyncSignalWiringOptions): void {
  // 리셋은 이 훅(호스트 앞부분)에서 선언해, 같은 커밋에서 뒤에 선언되는
  // 하이드레이션 베이스라인 effect 가 리셋 뒤에 베이스라인을 다시 얹게 한다.
  useEffect(() => {
    store.reset(autosaveKey);
  }, [autosaveKey, store]);

  useEffect(() => {
    const next: StudioSaveSyncLeadership = leadership?.role ?? "unknown";
    store.noteLeadership(next);
  }, [leadership, store]);

  useEffect(() => {
    const syncOnline = (): void => {
      store.noteOnline(globalThis.navigator.onLine !== false);
    };
    syncOnline();
    globalThis.addEventListener("online", syncOnline);
    globalThis.addEventListener("offline", syncOnline);
    return () => {
      globalThis.removeEventListener("online", syncOnline);
      globalThis.removeEventListener("offline", syncOnline);
    };
  }, [store]);
}
